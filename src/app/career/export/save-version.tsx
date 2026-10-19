"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./export.module.css";

// "이 상태로 저장" — 지금 보이는 조립 결과(⭐만·사진 옵션 포함)를 이름 붙여 얼린다.
// 본문은 서버가 다시 조립하므로 옵션만 보낸다.

const NAME_MAX = 60;

export function SaveVersion({
  starOnly,
  photos,
  defaultName,
}: {
  starOnly: boolean;
  photos: boolean;
  defaultName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "portfolio", name, starOnly, photos }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg({
          ok: false,
          text: err.error === "too_large" ? "문서가 너무 커서 저장할 수 없습니다." : "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
        });
        return;
      }
      setOpen(false);
      setMsg({ ok: true, text: "저장했습니다." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "저장하지 못했습니다. 네트워크를 확인하세요." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <span className={styles.saveWrap}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => {
            setName(defaultName);
            setMsg(null);
            setOpen(true);
          }}
        >
          이 상태로 저장
        </button>
        {msg ? (
          <span className={msg.ok ? styles.okMsg : styles.errMsg} role="status">
            {msg.text}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <form className={styles.saveForm} onSubmit={save}>
      <input
        aria-label="저장본 이름"
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="예: 넥슨 지원용"
        autoFocus
      />
      <button type="submit" className={styles.printBtn} disabled={busy}>
        {busy ? "저장 중…" : "저장"}
      </button>
      <button type="button" className={styles.ghostBtn} onClick={() => setOpen(false)} disabled={busy}>
        취소
      </button>
      {msg && !msg.ok ? (
        <span className={styles.errMsg} role="alert">
          {msg.text}
        </span>
      ) : null}
    </form>
  );
}
