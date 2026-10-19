import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { DEFAULT_PALETTE, allPalettes, paletteCss } from "@/lib/palette";
import { loadPaletteSettings } from "@/lib/palette-settings";
import { themeInitScript } from "@/lib/theme";
import { PaletteSync } from "./components/palette-sync";
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
  // 사용자 팔레트는 원격 설정에 있다 — 빌드 시점이 아니라 요청 때 읽는다.
  await connection();
  const { specs, showcase } = await loadPaletteSettings();
  const css = allPalettes(specs)
    .map((p) => paletteCss(p))
    .join("\n");
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 색 팔레트(기본 토큰): 프리셋 + 사용자 팔레트. 파생 토큰은 globals.css. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {/* 하이드레이션 전에 저장된 모드·팔레트를 적용해 깜빡임(FOUC)을 막는다. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(showcase) }} />
      </head>
      <body>
        <PaletteSync showcasePalette={showcase} />
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
