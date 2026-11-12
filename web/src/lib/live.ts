"use client";

import { useEffect, useRef } from "react";

import { withToken } from "./api";

type Handler = (data: { project?: string; [k: string]: unknown }) => void;

/**
 * One shared EventSource for the whole app (jobs, files, versions, comments,
 * approvals, shares, leads). Components subscribe to the event types they need.
 */
let source: EventSource | null = null;
const handlers = new Map<string, Set<Handler>>();
const TYPES = ["job", "file", "version", "comment", "approval", "share", "lead"];

function ensure() {
  if (source || typeof window === "undefined") return;
  source = new EventSource(withToken("/api/events"));
  for (const type of TYPES) {
    source.addEventListener(type, (e) => {
      let data = {};
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch {}
      handlers.get(type)?.forEach((h) => h(data));
    });
  }
  source.onerror = () => {
    // The browser retries by itself; if the server is gone for good, reconnect later.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      setTimeout(ensure, 3000);
    }
  };
}

export function useLive(types: string[], handler: Handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const key = types.join(",");
  useEffect(() => {
    ensure();
    const fn: Handler = (d) => ref.current(d);
    const list = key.split(",");
    for (const t of list) {
      if (!handlers.has(t)) handlers.set(t, new Set());
      handlers.get(t)!.add(fn);
    }
    return () => {
      for (const t of list) handlers.get(t)?.delete(fn);
    };
  }, [key]);
}
