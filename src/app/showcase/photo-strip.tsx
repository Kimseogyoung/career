"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl, type PublicPhoto } from "./types";
import styles from "./showcase.module.css";

/** 프로젝트 사진 줄 + 크게 보기. 사진을 누르면 화면 가득 열리고 ←/→·Esc 로 넘긴다. */
export function PhotoStrip({
  projectId,
  projectName,
  photos,
}: {
  projectId: string;
  projectName: string;
  photos: PublicPhoto[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  if (!photos.length) return null;
  const alt = (p: PublicPhoto, i: number) => p.caption || `${projectName} 사진 ${i + 1}`;
  const cur = open !== null ? photos[open] : null;

  return (
    <>
      <div className={styles.shots}>
        {photos.map((p, i) => (
          <button key={p.id} type="button" className={styles.shot} onClick={() => setOpen(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 원본 크기를 서버가 이미 줄여 저장함 */}
            <img
              src={mediaUrl(projectId, p.id)}
              alt={alt(p, i)}
              width={p.width}
              height={p.height}
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        className={styles.viewer}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(null); // 바깥(배경) 클릭 시 닫기
        }}
      >
        {cur && open !== null ? (
          <figure className={styles.viewerFig}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(projectId, cur.id)} alt={alt(cur, open)} width={cur.width} height={cur.height} />
            <figcaption className={styles.viewerCap}>
              <span>
                {cur.caption || projectName} · {open + 1} / {photos.length}
              </span>
              <span className={styles.viewerBtns}>
                {photos.length > 1 ? (
                  <>
                    <button type="button" onClick={() => setOpen((open - 1 + photos.length) % photos.length)}>
                      ← 이전
                    </button>
                    <button type="button" onClick={() => setOpen((open + 1) % photos.length)}>
                      다음 →
                    </button>
                  </>
                ) : null}
                <button type="button" onClick={() => setOpen(null)}>
                  닫기
                </button>
              </span>
            </figcaption>
          </figure>
        ) : null}
      </dialog>
    </>
  );
}
