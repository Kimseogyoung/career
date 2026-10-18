"use client";

import { PHOTO_BYTES_MAX, PHOTO_LONG_EDGE } from "@/lib/career-limits";

// 사진을 올리기 전에 브라우저에서 줄이고 다시 인코딩한다(ADR-015).
// - 긴 변 1600px, WebP(안 되면 JPEG). 레포 용량과 업로드 한도(nginx 1MB)를 지킨다.
// - 캔버스로 다시 그리면 EXIF(촬영 위치 GPS 등)가 사라진다 — 공개 사진의 위치 노출 방지.

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("이 형식은 읽을 수 없습니다. JPG·PNG·WebP 로 올려 주세요.");
  }
  try {
    let edge = PHOTO_LONG_EDGE;
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.82, 0.7]) {
        let blob = await toBlob(canvas, "image/webp", quality);
        // WebP 인코딩을 못 하는 브라우저는 PNG 로 돌려준다 → JPEG 로 다시.
        if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
        if (blob && blob.size <= PHOTO_BYTES_MAX) return { blob, width, height };
      }
      edge = Math.round(edge * 0.75);
    }
    throw new Error("사진을 충분히 줄이지 못했습니다.");
  } finally {
    bitmap.close();
  }
}
