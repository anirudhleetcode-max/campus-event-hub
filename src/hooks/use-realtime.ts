"use client";

import { useEffect, useRef, useState } from "react";

type Handler = (topic: string, data: Record<string, unknown>) => void;

/**
 * Subscribes to server-sent realtime events for the given topics.
 * The browser's EventSource reconnects automatically if the connection drops
 * (e.g. when a serverless function reaches its max duration).
 */
export function useRealtime(topics: string[], onMessage: Handler) {
  const handlerRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    handlerRef.current = onMessage;
  });
  const key = topics.filter(Boolean).sort().join(",");

  useEffect(() => {
    if (!key || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/realtime?topics=${encodeURIComponent(key)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { topic: string; data: Record<string, unknown> };
        handlerRef.current(msg.topic, msg.data);
      } catch {
        /* ignore */
      }
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [key]);

  return { connected };
}
