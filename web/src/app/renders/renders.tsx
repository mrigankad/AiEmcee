"use client";

import { useState } from "react";

import { JobList } from "@/components/film/tabs";

export function Renders() {
  const [watch, setWatch] = useState<number | null>(null);
  return <JobList watch={watch} setWatch={setWatch} />;
}
