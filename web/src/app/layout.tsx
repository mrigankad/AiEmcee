import type { Metadata } from "next";
import { Urbanist } from "next/font/google";
import { Suspense } from "react";

import { Login } from "@/components/login";
import { Sidebar } from "@/components/sidebar";
import { SessionProvider } from "@/lib/session";
import { Toaster } from "@/lib/toast";

import "./globals.css";

const urbanist = Urbanist({ variable: "--font-urbanist", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: { default: "AiEmcee Studio", template: "%s · AiEmcee Studio" },
  description: "Direct narrated product demo films: script, capture, compose, review and share.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${urbanist.variable} h-full`}>
      <body className="flex h-dvh overflow-hidden">
        <SessionProvider>
          {/* The sidebar reads the route, so it streams in behind the static shell. */}
          <Suspense fallback={<div className="h-dvh w-[232px] shrink-0 border-r border-line bg-rail max-md:hidden" />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          <Login />
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
