"use client";

import { useCallback, useEffect, useState } from "react";

import { Select } from "@/components/select";
import { Button, Card, Empty, Input, Kicker, Pill } from "@/components/ui";
import { api, can, type Me, setToken as saveToken, when } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast, toastError } from "@/lib/toast";

type User = { name: string; role: Me["role"]; createdAt: string };

const ROLES: { role: Me["role"]; can: string }[] = [
  { role: "viewer", can: "Watch and comment" },
  { role: "approver", can: "Also approve a film or ask for changes" },
  { role: "editor", can: "Also edit, render and direct with Rasa" },
  { role: "owner", can: "Also share links and manage the team" },
];

export function Team() {
  const { me, status, refresh } = useSession();
  const [users, setUsers] = useState<User[] | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Me["role"]>("editor");
  // The first person on a local studio must be an owner (they take over as the admin).
  const local = status?.auth === "local";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local) setRole("owner");
  }, [local]);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);

  const load = useCallback(() => {
    api<User[]>("/api/users").then(setUsers).catch(() => setUsers([]));
  }, []);
  useEffect(() => {
    if (can(me, "owner")) load();
  }, [me, load]);

  if (me && !can(me, "owner")) return <Empty>Only an owner can manage the team.</Empty>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[24px] font-bold">Team</h1>
        <p className="mt-1 text-[14px] text-body">
          {status?.auth === "token"
            ? "This studio needs a token for every request. Give each person their own."
            : "This studio runs on this computer only. Add the first owner to share it with your team (then start it with --host)."}
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <Kicker>Add a person</Kicker>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (status?.auth === "local" && role !== "owner") {
                toast("Add yourself as the first owner: once the studio has users, every request needs a token.", "error");
                return;
              }
              const r = await api<{ name: string; token: string }>("/api/users", { method: "POST", json: { name: name.trim(), role } });
              setToken(r);
              // The first user switches the studio to tokens: keep this browser signed in as them.
              if (status?.auth === "local") {
                saveToken(r.token);
                refresh();
              }
              setName("");
              load();
            } catch (err) {
              toastError(err);
            }
          }}
          className="flex gap-2 max-sm:flex-col"
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name or email" className="flex-1" aria-label="Name" />
          <Select
            label="Role"
            value={role}
            onChange={setRole}
            className="w-40 max-sm:w-full"
            menuWidth={300}
            align="right"
            options={ROLES.map((r) => ({ value: r.role, label: r.role[0].toUpperCase() + r.role.slice(1), description: r.can }))}
          />
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Create token
          </Button>
        </form>
        {token && (
          <div className="flex flex-col gap-2 rounded-lg bg-peach p-3 text-[14px]">
            <div>
              Token for <b>{token.name}</b>. It is shown once: send it to them privately.
            </div>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-page px-2 py-1.5 text-[13px]">{token.token}</code>
              <Button size="sm" onClick={() => navigator.clipboard.writeText(token.token).then(() => toast("Token copied"))}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <Kicker>People</Kicker>
        {!users?.length ? (
          <Empty>No users yet: this studio is local only.</Empty>
        ) : (
          users.map((u) => (
            <Card key={u.name} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">{u.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{u.name}</div>
                <div className="text-[12px] text-mute">Added {when(u.createdAt)}</div>
              </div>
              <Pill tone={u.role === "owner" ? "action" : u.role === "editor" ? "motion" : u.role === "approver" ? "ok" : "neutral"}>{u.role}</Pill>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm(`Remove ${u.name}? Their token stops working.`)) return;
                  try {
                    await api(`/api/users/${encodeURIComponent(u.name)}`, { method: "DELETE" });
                    load();
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                Remove
              </Button>
            </Card>
          ))
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        {ROLES.map((r) => (
          <div key={r.role} className="rounded-lg bg-rail px-3.5 py-2.5 text-[13px]">
            <b className="capitalize">{r.role}</b> <span className="text-body">· {r.can}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
