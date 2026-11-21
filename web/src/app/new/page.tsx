import type { Metadata } from "next";

import { Topbar } from "@/components/topbar";

import { NewFilm } from "./new-film";

export const metadata: Metadata = { title: "New film" };

export default function Page() {
  return (
    <>
      <Topbar crumbs={[{ label: "Films", href: "/" }, { label: "New film" }]} />
      <NewFilm />
    </>
  );
}
