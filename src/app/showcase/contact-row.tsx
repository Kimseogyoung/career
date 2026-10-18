"use client";

import { useState } from "react";
import styles from "./showcase.module.css";

function decode(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * 연락처 한 줄 — 링크(새 탭)와 이메일 복사.
 * 이메일은 base64 로 받아 "복사" 를 눌렀을 때만 풀어 보여준다(HTML 수집기 회피).
 */
export function ContactRow({
  emailEncoded,
  links,
}: {
  emailEncoded?: string;
  links: { label: string; url: string }[];
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!emailEncoded && !links.length) return null;

  async function copyEmail() {
    if (!emailEncoded) return;
    const email = decode(emailEncoded);
    setShown(email);
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드가 막힌 환경: 주소를 보여줬으니 직접 복사하면 된다.
    }
  }

  return (
    <div className={styles.contact}>
      {emailEncoded ? (
        <button type="button" className={styles.contactBtn} onClick={copyEmail}>
          ✉ {shown ? <span className={styles.contactEmail}>{shown}</span> : "이메일"}
          <span className={styles.contactHint}>{copied ? "복사됨" : shown ? "" : "복사"}</span>
        </button>
      ) : null}
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer me" className={styles.contactBtn}>
          {l.label} ↗
        </a>
      ))}
    </div>
  );
}
