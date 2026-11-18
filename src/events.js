// Tiny Server-Sent Events hub: the staff dashboard subscribes and gets pushed updates.
const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function publish(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}

export function clientCount() { return clients.size; }

// Keep connections alive through proxies/load balancers.
setInterval(() => {
  for (const res of clients) {
    try { res.write(': ping\n\n'); } catch { clients.delete(res); }
  }
}, 15000).unref();
