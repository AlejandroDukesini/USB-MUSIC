export function connectPlayerSocket(onState) {
  let ws;
  let retry = 0;
  let alive = true;

  const url = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}/ws`;
  };

  const open = () => {
    ws = new WebSocket(url());
    ws.onopen = () => {
      retry = 0;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "state" && msg.state) onState(msg.state);
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (!alive) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 500 * 2 ** retry);
    };
    ws.onerror = () => ws.close();
  };

  open();

  const ping = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: "ping" }));
  }, 25000);

  return () => {
    alive = false;
    clearInterval(ping);
    ws?.close();
  };
}
