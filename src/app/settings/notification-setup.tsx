"use client";

import { useEffect, useState } from "react";
import styles from "./settings.module.css";

// 브라우저 알림 권한 요청 → 서비스워커 등록 → PushSubscription 생성 → 서버에 등록.
// VAPID 공개키는 빌드에 박지 않고 /api/push/vapid 에서 런타임에 받아온다.

async function fetchVapidKey(): Promise<string> {
  const res = await fetch("/api/push/vapid");
  if (!res.ok) throw new Error("VAPID 공개키를 받지 못했습니다.");
  const body = (await res.json()) as { publicKey: string };
  return body.publicKey;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "subscribed" | "unsubscribed" | "denied";

export function NotificationSetup({ pushConfigured }: { pushConfigured: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // setState 는 반드시 비동기 이후에만 호출한다(effect 동기 setState 금지 규칙).
    async function detect(): Promise<State> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
      if (Notification.permission === "denied") return "denied";
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        return sub ? "subscribed" : "unsubscribed";
      } catch {
        return "unsubscribed";
      }
    }
    void detect().then((st) => {
      if (!cancelled) setState(st);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const vapidKey = await fetchVapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // 최신 TS lib 의 Uint8Array<ArrayBufferLike> 와 BufferSource 간 불일치를 피해 캐스팅.
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...json, label: navigator.userAgent.slice(0, 60) }),
      });
      if (!res.ok) {
        setError("서버 등록에 실패했습니다.");
        return;
      }
      setState("subscribed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setTestMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        sent?: number;
        expired?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(
          body.error === "no_subscription"
            ? "등록된 기기가 없습니다. 먼저 이 기기에서 알림을 켜세요."
            : "테스트 발송에 실패했습니다.",
        );
        return;
      }
      setTestMsg(
        `발송됨: ${body.sent ?? 0}건${body.expired ? ` · 만료 구독 ${body.expired}건 정리` : ""}. 잠시 뒤 알림이 뜨는지 확인하세요.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  if (!pushConfigured) {
    return (
      <p className={styles.note}>
        서버에 VAPID 키가 설정되지 않아 알림을 쓸 수 없습니다. <code>npm run gen:vapid</code> 로
        만들어 .env 에 넣으세요.
      </p>
    );
  }

  return (
    <div>
      {state === "loading" ? <p className={styles.note}>확인 중…</p> : null}
      {state === "unsupported" ? (
        <p className={styles.note}>이 브라우저는 Web Push를 지원하지 않습니다.</p>
      ) : null}
      {state === "denied" ? (
        <p className={styles.note}>
          알림이 차단돼 있습니다. 브라우저 사이트 설정에서 알림을 허용으로 바꾼 뒤 새로고침하세요.
        </p>
      ) : null}
      {state === "unsubscribed" ? (
        <button className={styles.primary} onClick={enable} disabled={busy}>
          {busy ? "설정 중…" : "이 기기에서 알림 켜기"}
        </button>
      ) : null}
      {state === "subscribed" ? (
        <div className={styles.row}>
          <span className={styles.ok}>✓ 이 기기에서 알림이 켜져 있습니다</span>
          <button className={styles.secondary} onClick={sendTest} disabled={busy}>
            {busy ? "보내는 중…" : "테스트 보내기"}
          </button>
          <button className={styles.secondary} onClick={disable} disabled={busy}>
            끄기
          </button>
        </div>
      ) : null}
      {testMsg ? <p className={styles.note}>{testMsg}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <p className={styles.note}>
        iPhone/iPad는 Safari에서 <b>홈 화면에 추가</b>한 뒤 그 앱에서 열어야 알림이 동작합니다.
      </p>
    </div>
  );
}
