/// <reference lib="webworker" />
import { precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler, NavigationRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';


declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

//policy of caching
//The SW does not try to intercept communications between the client and the Firebase server
//this is because the app uses different streams (e.g. onSnapshto) that cannot be stored in the cache
registerRoute(new NavigationRoute(new NetworkOnly()));

//Fallback Offline 
setCatchHandler(async ({ request }) => {
  //If the user is trying to navigate to an HTML page and fails
  if (request.destination === 'document') {
    const fallback = await matchPrecache('/offline.html');
    return fallback || Response.error();
  }
  //If it fails to load an image or whatever, we give generic error
  return Response.error();
});

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