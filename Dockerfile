# syntax=docker/dockerfile:1
#
# 이 이미지는 홈서버에서 빌드하지 않는다(ADR-009).
# 개발 머신 또는 CI에서 빌드해 레지스트리에 올리고, 서버는 pull 만 한다.
#
#   docker build -t ghcr.io/<user>/career-log:<tag> .
#   docker push  ghcr.io/<user>/career-log:<tag>

# ─── 1. 의존성 ──────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── 2. 빌드 ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── 3. 실행 ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Seoul

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

# standalone 출력에는 실행에 필요한 node_modules 만 들어 있다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 미동기화 쓰기 큐. 볼륨으로 덮어쓰이지만 볼륨 없이 떠도 동작하도록 만들어 둔다.
RUN mkdir -p /app/queue && chown nextjs:nodejs /app/queue

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
