import type { Metadata } from "next";
import { Suspense } from "react";

import { BoardsView } from "@/components/boards/boards-view";

export async function generateMetadata({ params }: PageProps<"/p/[project]/boards">): Promise<Metadata> {
  const { project } = await params;
  return { title: `Boards · ${decodeURIComponent(project)}` };
}

export default function Page({ params }: PageProps<"/p/[project]/boards">) {
  return (
    <Suspense fallback={<div className="h-12 border-b border-line" />}>
      <Boards params={params} />
    </Suspense>
  );
}

async function Boards({ params }: Pick<PageProps<"/p/[project]/boards">, "params">) {
  const { project } = await params;
  return <BoardsView project={decodeURIComponent(project)} />;
}
