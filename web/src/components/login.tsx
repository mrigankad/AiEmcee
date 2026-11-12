"use client";

import { useEffect, useState } from "react";

import { setToken } from "@/lib/api";

import { Logo } from "./brand";
import { Button, Input } from "./ui";

/** Shown when the studio answers 401: it has users and this browser has no valid token. */
export function Login() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("aiemcee:login", show);
    return () => window.removeEventListener("aiemcee:login", show);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value.trim());
          location.reload();
        }}
        className="flex w-full max-w-sm flex-col gap-3 rounded-card border border-line bg-page p-6 shadow-xl"
      >
        <Logo size={32} />
        <h2 className="text-xl font-bold">Sign in to this studio</h2>
        <p className="text-sm text-body">
          Ask the studio owner for a token. They create one with <code className="rounded bg-sunk px-1">aiemcee studio user add</code>.
        </p>
        <Input type="password" autoComplete="off" placeholder="aie_…" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="Studio token" />
        <Button variant="primary" type="submit" disabled={!value.trim()}>
          Sign in
        </Button>
      </form>
    </div>
  );
}
