self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch (e) { data = { title: 'Vianta', body: event.data ? event.data.text() : 'Novo serviço' }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Vianta — Novo serviço', {
      body: data.body || '',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url: data.url || '/gestor.html' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/gestor.html';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('gestor.html') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
