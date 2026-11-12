import type { Metadata } from "next";

import { Topbar } from "@/components/topbar";

import { Team } from "./team";

export const metadata: Metadata = { title: "Team" };

export default function Page() {
  return (
    <>
      <Topbar crumbs={[{ label: "Team" }]} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[860px] px-8 py-7 max-md:px-4">
          <Team />
        </div>
      </main>
    </>
  );
}
