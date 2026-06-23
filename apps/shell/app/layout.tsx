import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
// Theme tokens first (defines the --camp-* CSS vars), then Tailwind/base styles.
import "@camp/ui/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SITCON Camp 2026 · ML",
  description:
    "Interactive stations for the SITCON Camp 2026 Machine Learning curriculum.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-full flex-col">
          <header className="border-b border-border">
            <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
              <Link href="/" className="font-semibold">
                SITCON Camp 2026 · ML
              </Link>
              <div className="flex items-center gap-4 text-sm text-muted">
                <Link href="/" className="hover:text-fg">
                  Home
                </Link>
                <Link href="/#stations" className="hover:text-fg">
                  Stations
                </Link>
              </div>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
            {children}
          </main>
          <footer className="border-t border-border px-5 py-4 text-center text-xs text-muted">
            Built for SITCON Camp 2026 · the browser never trains — it replays
            precomputed artifacts.
          </footer>
        </div>
      </body>
    </html>
  );
}
