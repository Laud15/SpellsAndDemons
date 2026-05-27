/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  const pushEvent = event as PushEvent;
  if (!pushEvent.data) return;

  const data = pushEvent.data.json();

  pushEvent.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/skull_192.png',
      data: data.url ?? '/'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  const clickEvent = event as NotificationEvent;
  clickEvent.notification.close();
  clickEvent.waitUntil(
    self.clients.openWindow(clickEvent.notification.data)
  );
});