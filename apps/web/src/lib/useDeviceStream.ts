"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface LiveReading {
  device_id: string;
  time: string;
  acetone_delta: number;
  label: "low" | "moderate" | "high" | "unreliable";
  quality_score: number;
  confidence_score: number;
}

interface StreamState {
  reading: LiveReading | null;
  connected: boolean;
  error: string | null;
}

function getWsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const api = process.env.NEXT_PUBLIC_API_URL ?? "";
  if (api) return api.replace(/^http/, "ws").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}`;
  }
  return "ws://localhost:8000";
}

export function useDeviceStream(userId: string | undefined): StreamState {
  const [state, setState] = useState<StreamState>({
    reading: null,
    connected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(2000);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (!userId || unmounted.current) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const url = `${getWsBase()}/ws/readings/${userId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return; }
      retryDelay.current = 2000;
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as LiveReading;
        setState((s) => ({ ...s, reading: data }));
      } catch {
        // non-JSON frames (e.g. "pong") are ignored
      }
    };

    ws.onerror = () => {
      setState((s) => ({ ...s, connected: false, error: "Connection error" }));
    };

    ws.onclose = () => {
      if (unmounted.current) return;
      setState((s) => ({ ...s, connected: false }));
      // Exponential backoff reconnect (max 30s)
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 1.5, 30000);
        connect();
      }, retryDelay.current);
    };
  }, [userId]);

  useEffect(() => {
    unmounted.current = false;
    connect();

    // Keepalive ping every 25s
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25000);

    return () => {
      unmounted.current = true;
      clearInterval(pingInterval);
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
