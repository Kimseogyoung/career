"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isShowcasePath } from "@/lib/public-paths";
import { applyPalette, readPalette } from "@/lib/theme";

// 클라이언트 이동(앱 ↔ Showcase)에는 <head> 초기화 스크립트가 다시 돌지 않으므로 여기서 맞춘다.
// Showcase 는 공개 팔레트, 나머지는 이 기기에서 고른 팔레트.
export function PaletteSync({ showcasePalette }: { showcasePalette: string }) {
  const pathname = usePathname();
  useEffect(() => {
    applyPalette(isShowcasePath(pathname) ? showcasePalette : readPalette());
  }, [pathname, showcasePalette]);
  return null;
}
