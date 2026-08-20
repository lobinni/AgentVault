import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentVault — Liability rails for autonomous work",
  description:
    "Fund an outcome, require an agent liability bond, and give both sides a bounded evidence process before capital moves.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
