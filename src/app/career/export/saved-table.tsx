"use client";

import Link from "next/link";
import { useState } from "react";
import { DeleteVersion } from "./saved/[id]/delete-version";
import styles from "./export.module.css";

// 저장본 목록 표. 늘 펼쳐 두고, 5개가 넘으면 "더 보기"로 나머지를 연다.
// 행 어디를 눌러도 열린다(이름 링크를 행 전체로 늘림). 삭제는 행 끝.

export interface SavedRow {
  id: string;
  name: string;
  savedAt: string;
  scope: string;
  counts: string;
}

const FOLD = 5;

export function SavedTable({ rows }: { rows: SavedRow[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FOLD);
  return (
    <>
      <table className={styles.savedTable}>
        <thead>
          <tr>
            <th>이름</th>
            <th>저장</th>
            <th>범위</th>
            <th className={styles.num}>프로젝트 · 성과</th>
            <th aria-label="삭제" />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className={styles.savedName}>
                <Link href={`/career/export/saved/${r.id}`} className={styles.rowLink}>
                  {r.name}
                </Link>
              </td>
              <td className={styles.muted}>{r.savedAt}</td>
              <td className={styles.muted}>{r.scope}</td>
              <td className={`${styles.num} ${styles.muted}`}>{r.counts}</td>
              <td className={styles.rowAction}>
                <DeleteVersion id={r.id} inList />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FOLD ? (
        <button type="button" className={styles.moreBtn} onClick={() => setAll((v) => !v)}>
          {all ? "접기" : `더 보기 (${rows.length - FOLD})`}
        </button>
      ) : null}
    </>
  );
}
