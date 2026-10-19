"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../export.module.css";

// 저장본 삭제. 확인 대화상자 대신 버튼을 한 번 더 누르게 한다.
// inList: 목록 표 안에서 쓰면 지운 뒤 목록만 새로고침한다.
export function DeleteVersion({ id, inList = false }: { id: string; inList?: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(String(res.status));
      if (!inList) router.replace("/career/export");
      router.refresh();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <span className={styles.saveWrap}>
      {armed ? (
        <>
          <button type="button" className={styles.dangerBtn} onClick={remove} disabled={busy}>
            {busy ? "삭제 중…" : "정말 삭제"}
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => setArmed(false)} disabled={busy}>
            취소
          </button>
        </>
      ) : (
        <button type="button" className={styles.ghostBtn} onClick={() => setArmed(true)}>
          삭제
        </button>
      )}
      {error ? (
        <span className={styles.errMsg} role="alert">
          삭제하지 못했습니다.
        </span>
      ) : null}
    </span>
  );
}
