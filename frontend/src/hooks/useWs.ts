import { useCallback, useEffect, useRef, useState } from "react";

export type WsState = "live" | "reconnecting" | "offline";

export function useWs(onMessage?: (m: { type: string; payload: unknown }) => void): {
  state: WsState;
} {
  const [state, setState] = useState<WsState>("reconnecting");
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const connect = useCallback(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    try {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
      setState("offline");
      return () => {};
    }
    setState("reconnecting");
    ws.onopen = () => setState("live");
    ws.onclose = () => {
      if (!closed) setState("reconnecting");
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
      }
      setState("offline");
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data as string);
        handler.current?.(m);
      } catch {
      }
    };
    return () => {
      closed = true;
      try {
        ws?.close();
      } catch {
      }
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
    };
  }, [connect]);

  return { state };
}
