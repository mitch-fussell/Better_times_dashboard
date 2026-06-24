"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import LogCheckIn from "./LogCheckIn";
import AccountMenu from "./AccountMenu";
import type { Client } from "@/lib/metrics";

export default function NavBar({
  clients,
  wide = false,
}: {
  clients: Pick<Client, "id" | "name">[];
  // The calendar uses a wider page; match its width so the bar lines up.
  wide?: boolean;
}) {
  const path = usePathname();

  const tabs = [
    { href: "/", label: "Dashboard" },
    { href: "/calendar", label: "Calendar" },
  ];
  return (
    <header className="bg-white">
      <div
        className={`mx-auto flex ${
          wide ? "max-w-7xl" : "max-w-6xl"
        } items-center justify-between px-6 py-3`}
      >
        <div className="flex items-center gap-4">
          <span className="flex items-center rounded-lg bg-brand px-3 py-1.5">
            <Image
              src="/bettertimes-logo.png"
              alt="BetterTimes"
              width={302}
              height={98}
              priority
              className="h-7 w-auto"
            />
          </span>
          <nav className="flex gap-2">
            {tabs.map((t) => {
              const active = path === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`rounded-lg border border-brand px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand text-white" : "text-brand hover:bg-blue-50"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LogCheckIn clients={clients} />
          <AccountMenu />
        </div>
      </div>
      {/* Brand accent strip: blue → cyan → pink */}
      <div className="h-1 w-full bg-gradient-to-r from-brand via-sky to-accent" />
    </header>
  );
}
