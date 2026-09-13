self.addEventListener("push", (event) => {
  let data = { title: "LANMap", body: "New alert", severity: "info", url: "/alerts" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    void e;
  }
  const options = {
    body: data.body,
    tag: `lanmap-${Date.now()}`,
    data: { url: data.url || "/alerts" },
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(self.location.origin)) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
