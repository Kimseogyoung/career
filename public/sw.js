// Career Log 서비스 워커 — Web Push 수신 + 알림 클릭 처리.
// 캐싱(오프라인)은 하지 않는다. 기록 정본이 원격이라 오프라인 캐시는 1-5 범위 밖.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "업무 일지", body: "기록할 시간입니다", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* 본문 없거나 비JSON — 기본값 사용 */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url },
      tag: "career-reminder",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // 이미 열린 창이 있으면 그 창을 그 경로로 이동·포커스.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // 없으면 새 창.
      return self.clients.openWindow(url);
    }),
  );
});
