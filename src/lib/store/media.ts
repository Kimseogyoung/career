import "server-only";
import type { ProjectPhoto } from "./types";

// 프로젝트 사진 파일. career-db `meta/media/<projectId>/<photoId>.<ext>` 에 둔다(ADR-015).
// 형식은 업로드된 바이트의 시그니처로만 판별한다(파일명·Content-Type 은 믿지 않음).
// SVG 등 스크립트를 품을 수 있는 형식은 받지 않는다.

const ID_RE = /^[0-9A-Za-z]{10,40}$/;

export function isMediaId(id: string): boolean {
  return ID_RE.test(id);
}

export function mediaPath(projectId: string, photo: Pick<ProjectPhoto, "id" | "ext">): string {
  if (!isMediaId(projectId) || !isMediaId(photo.id)) throw new Error("잘못된 미디어 id");
  return `meta/media/${projectId}/${photo.id}.${photo.ext}`;
}

export const CONTENT_TYPE: Record<ProjectPhoto["ext"], string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  png: "image/png",
};

/** 바이트 시그니처로 이미지 형식 판별. 지원하지 않으면 null. */
export function detectImage(bytes: Uint8Array): ProjectPhoto["ext"] | null {
  const b = bytes;
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  return null;
}

// ── 읽기 캐시 ────────────────────────────────────────────────────
// 공개 페이지가 사진을 볼 때마다 GitHub 을 부르지 않게 프로세스 메모리에 둔다.
// photoId 는 내용이 바뀌면 새로 발급되므로(불변) 무효화가 필요 없다. 용량 상한으로만 밀어낸다.

const CACHE_MAX_BYTES = 32 * 1024 * 1024;

interface MediaCache {
  map: Map<string, Uint8Array>;
  size: number;
}

const g = globalThis as typeof globalThis & { __careerMediaCache?: MediaCache };
const cache: MediaCache = (g.__careerMediaCache ??= { map: new Map(), size: 0 });

export function cacheGet(path: string): Uint8Array | undefined {
  const v = cache.map.get(path);
  if (v) {
    cache.map.delete(path); // 최근 사용으로 갱신
    cache.map.set(path, v);
  }
  return v;
}

export function cacheSet(path: string, bytes: Uint8Array): void {
  if (bytes.length > CACHE_MAX_BYTES / 4) return;
  const old = cache.map.get(path);
  if (old) {
    cache.size -= old.length;
    cache.map.delete(path);
  }
  cache.map.set(path, bytes);
  cache.size += bytes.length;
  for (const [k, v] of cache.map) {
    if (cache.size <= CACHE_MAX_BYTES) break;
    cache.map.delete(k);
    cache.size -= v.length;
  }
}

export function cacheDelete(path: string): void {
  const v = cache.map.get(path);
  if (v) {
    cache.size -= v.length;
    cache.map.delete(path);
  }
}
