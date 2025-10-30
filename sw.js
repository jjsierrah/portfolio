self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => {
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(client => client.navigate(client.url));
  });
});
self.addEventListener('fetch', () => {});
