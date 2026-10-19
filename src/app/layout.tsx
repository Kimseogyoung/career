import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { DEFAULT_PALETTE } from "@/lib/palette";
import { loadThemeInputs } from "@/lib/theme-settings";
import { themeInitScript } from "@/lib/theme";
import { themeBundle } from "@/lib/themes";
import { ThemeSync } from "./components/theme-sync";
import { SiteHeader } from "./site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Log",
  description: "1인용 업무 일지",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Career Log", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: DEFAULT_PALETTE.light.accent },
    { media: "(prefers-color-scheme: dark)", color: DEFAULT_PALETTE.dark.bg },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 내 팔레트·내 테마는 원격 설정에 있다 — 빌드 시점이 아니라 요청 때 읽는다.
  await connection();
  const { css, paletteOf } = themeBundle(await loadThemeInputs());
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 팔레트(기본 토큰) + 테마(모양·그림 토큰). 파생 토큰은 globals.css. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {/* 하이드레이션 전에 저장된 모드·테마를 적용해 깜빡임(FOUC)을 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(paletteOf) }} />
      </head>
      <body>
        <ThemeSync paletteOf={paletteOf} />
        <div className="app-bg" aria-hidden="true" />
        <div className="theme-band" aria-hidden="true" />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
