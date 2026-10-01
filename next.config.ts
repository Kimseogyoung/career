import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버에서 빌드하지 않고 외부에서 만든 이미지를 pull 한다 (ADR-009).
  // standalone 출력이 node_modules 없이 도는 최소 번들을 만들어 준다.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
