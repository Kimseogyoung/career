"use client";

import styles from "./export.module.css";

export function PrintButton() {
  return (
    <button type="button" className={styles.printBtn} onClick={() => window.print()}>
      인쇄 · PDF 저장
    </button>
  );
}
