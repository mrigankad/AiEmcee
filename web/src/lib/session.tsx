"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";

import { api, type Me, type Status } from "./api";

type Session = { me: Me | null; status: Status | null; refresh: () => void };
const Ctx = createContext<Session>({ me: null, status: null, refresh: () => {} });

/** Who is signed in and what the studio can do (providers, auth mode). */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const refresh = useCallback(() => {
    api<Me>("/api/me").then(setMe).catch(() => setMe(null));
    api<Status>("/api/status").then(setStatus).catch(() => {});
  }, []);
  useEffect(() => {
    // Fetching on mount: the session lives in the browser, not on this server.
    refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ me, status, refresh }}>{children}</Ctx.Provider>;
}

const noop = () => () => {};

/**
 * False on the server and while a component hydrates, true after. Streamed
 * boundaries can hydrate after the session has loaded; reading it before
 * hydration would make the client HTML differ from the server's.
 */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

export function useSession(): Session {
  const session = useContext(Ctx);
  const hydrated = useHydrated();
  return hydrated ? session : { me: null, status: null, refresh: session.refresh };
}
