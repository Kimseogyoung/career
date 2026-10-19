"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isShowcasePath } from "@/lib/public-paths";
import { applyScope, applyThemeId, readThemeId } from "@/lib/theme";

// 클라이언트 이동(앱 ↔ Showcase)에는 <head> 초기화 스크립트가 다시 돌지 않으므로 여기서 맞춘다.
// Showcase 는 공개 테마, 나머지는 이 기기에서 고른 테마.
export function ThemeSync({ paletteOf }: { paletteOf: Record<string, string> }) {
  const pathname = usePathname();
  useEffect(() => {
    const sc = isShowcasePath(pathname);
    applyScope(sc);
    applyThemeId(sc ? "showcase" : readThemeId(), paletteOf);
  }, [pathname, paletteOf]);
  return null;
}
