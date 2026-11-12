import type { Metadata } from "next";

import { Topbar } from "@/components/topbar";

import { Renders } from "./renders";

export const metadata: Metadata = { title: "Renders" };

export default function Page() {
  return (
    <>
      <Topbar crumbs={[{ label: "Renders" }]} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1180px] px-8 py-7 max-md:px-4">
          <h1 className="mb-1 text-[24px] font-bold">Renders</h1>
          <p className="mb-6 text-[14px] text-body">One job at a time, since a render uses every core. A person waiting goes first; batch jobs wait.</p>
          <Renders />
        </div>
      </main>
    </>
  );
}
