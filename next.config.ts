import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// 보안 응답 헤더 (ADR-014). 앱은 외부 리소스(폰트·이미지·스크립트)를 쓰지 않으므로 'self' 로 닫는다.
// - script/style 'unsafe-inline': Next 하이드레이션 인라인 스크립트·테마 초기화 스크립트·인라인 style 속성 때문.
//   (nonce 기반 strict CSP 는 모든 페이지를 동적으로 만들어야 해서 보류)
// - 개발 모드는 HMR 이 eval 을 써서 CSP 를 붙이지 않는다.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }, // 클릭재킹 방지(구형 브라우저용, CSP frame-ancestors 와 중복)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd
    ? [
        // 서브도메인은 포함하지 않는다(같은 상위 도메인의 다른 서비스에 영향 주지 않게).
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "Content-Security-Policy", value: CSP },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // 서버에서 빌드하지 않고 외부에서 만든 이미지를 pull 한다 (ADR-009).
  // standalone 출력이 node_modules 없이 도는 최소 번들을 만들어 준다.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
