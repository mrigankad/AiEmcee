/**
 * One in-process event bus, exposed to the browser as a single SSE stream
 * (GET /api/events). Every screen subscribes once and filters by `type`.
 *
 *   job       a job was queued, started, finished, failed or cancelled
 *   version   a snapshot was taken or restored
 *   comment   a comment was added or changed
 *   file      a source file was written (by a person or by Rasa)
 */
const clients = new Set();

export function publish(type, data) {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(line);
}

export function subscribe(req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
  res.write(`event: hello\ndata: {}\n\n`);
  clients.add(res);
  // A comment line every 25 s keeps proxies and idle browsers from closing the stream.
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
}
