import type { Metadata } from "next";
import { Suspense } from "react";

import { Studio } from "./studio";

export async function generateMetadata({ params }: PageProps<"/p/[project]">): Promise<Metadata> {
  const { project } = await params;
  return { title: decodeURIComponent(project) };
}

export default function Page({ params }: PageProps<"/p/[project]">) {
  return (
    <Suspense fallback={<div className="h-12 border-b border-line" />}>
      <Film params={params} />
    </Suspense>
  );
}

async function Film({ params }: Pick<PageProps<"/p/[project]">, "params">) {
  const { project } = await params;
  return <Studio project={decodeURIComponent(project)} />;
}
