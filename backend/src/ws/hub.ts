import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { WsMessage } from "@lanmap/shared";

let wss: WebSocketServer | null = null;
let count = 0;

export function attachWs(server: Server): void {
  wss = new WebSocketServer({ path: "/ws", server });
  wss.on("connection", (ws) => {
    count++;
    const hello: WsMessage = { type: "hello", payload: { clients: count }, at: Date.now() };
    ws.send(JSON.stringify(hello));
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);
    ws.on("close", () => {
      count = Math.max(0, count - 1);
      clearInterval(ping);
    });
  });
}

export function broadcast(msg: Omit<WsMessage, "at"> & { at?: number }): void {
  if (!wss) return;
  const full: WsMessage = { ...msg, at: msg.at ?? Date.now() } as WsMessage;
  const text = JSON.stringify(full);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(text);
  }
}

export function wsClients(): number {
  return count;
}
