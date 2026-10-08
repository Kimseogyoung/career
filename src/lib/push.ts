import "server-only";
import webpush from "web-push";
import type { PushSubscriptionRecord } from "@/lib/store/types";

// Web Push 발송. VAPID 키가 없으면 비활성(알림 기능만 꺼지고 앱은 정상 — 제약 6).

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );
}

/** 클라이언트 구독에 필요한 VAPID 공개키(런타임). 빌드에 박지 않고 API 로 내려준다. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function ensureVapid(): boolean {
  if (configured) return true;
  if (!isPushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string; // 알림 클릭 시 열 경로
}

/**
 * 구독 목록에 푸시를 보낸다.
 * @returns 만료(410/404)된 구독의 endpoint 목록 — 호출 측에서 정리한다.
 */
export async function sendPush(
  subs: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<{ sent: number; expired: string[] }> {
  if (!ensureVapid()) return { sent: 0, expired: [] };

  const expired: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 = 구독 없어짐, 403 = VAPID 키 불일치(옛 키로 만든 구독). 모두 무효로 보고 정리한다.
        // 정리되면 설정에서 다시 "알림 켜기"가 떠서 현재 키로 재구독을 유도한다.
        if (status === 404 || status === 410 || status === 403) expired.push(sub.endpoint);
        else console.error(`[push] 발송 실패 status=${status ?? "?"}:`, (e as Error).message);
      }
    }),
  );
  return { sent, expired };
}
