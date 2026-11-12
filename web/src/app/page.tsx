import type { Metadata } from "next";

import { Topbar } from "@/components/topbar";

import { Films } from "./films";

export const metadata: Metadata = { title: "Films" };

export default function Page() {
  return (
    <>
      <Topbar crumbs={[{ label: "Films" }]} />
      <Films />
    </>
  );
}
