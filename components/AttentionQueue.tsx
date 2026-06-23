"use client";

import { useMemo, useState } from "react";
import { TYPE_META, type Client, type ClientHealth } from "@/lib/metrics";
import LogCheckIn from "./LogCheckIn";
import ClientCombobox from "./ClientCombobox";

type Filter = "all" | "overdue" | "ontrack" | "onboarding" | "issue";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "ontrack", label: "On track" },
  { key: "onboarding", label: "Onboarding" },
  { key: "issue", label: "Recent ticket" },
];

function matchesFilter(h: ClientHealth, f: Filter): boolean {
  switch (f) {
    case "overdue":
      return h.overdue;
    case "ontrack":
      return !h.overdue;
    case "onboarding":
      return h.client.status === "onboarding";
    case "issue":
      return h.recentReactive > 0;
    default:
      return true;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-slate-100 text-slate-600",
    onboarding: "bg-amber-100 text-amber-800",
    churned: "bg-slate-200 text-slate-500",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.active}`}>
      {status}
    </span>
  );
}

function LastContact({ h }: { h: ClientHealth }) {
  if (h.daysSince === null) return <span className="font-medium text-red-600">Never</span>;
  const label =
    h.daysSince === 0 ? "Today" : h.daysSince === 1 ? "Yesterday" : `${h.daysSince} days ago`;
  return <span className={h.overdue ? "font-medium text-red-600" : "text-slate-700"}>{label}</span>;
}

function MiniCounts({ h }: { h: ClientHealth }) {
  const parts = [
    { n: h.counts.proactive, dot: TYPE_META.proactive.dot, title: "Proactive" },
    { n: h.counts.reactive, dot: TYPE_META.reactive.dot, title: "Tickets" },
    { n: h.counts.onboarding, dot: TYPE_META.onboarding.dot, title: "Onboarding" },
  ];
  return (
    <div className="flex items-center gap-3">
      {parts.map((p) => (
        <span key={p.title} title={p.title} className="flex items-center gap-1 text-xs text-slate-600">
          <span className={`h-2 w-2 rounded-full ${p.dot}`} />
          {p.n}
        </span>
      ))}
    </div>
  );
}

export default function AttentionQueue({
  health,
  clientOptions,
}: {
  health: ClientHealth[];
  clientOptions: Pick<Client, "id" | "name">[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, overdue: 0, ontrack: 0, onboarding: 0, issue: 0 };
    for (const h of health) {
      c.all += 1;
      if (h.overdue) c.overdue += 1;
      else c.ontrack += 1;
      if (h.client.status === "onboarding") c.onboarding += 1;
      if (h.recentReactive > 0) c.issue += 1;
    }
    return c;
  }, [health]);

  const visible = useMemo(() => {
    // A picked client takes precedence: show only that one.
    if (selectedId) return health.filter((h) => h.client.id === selectedId);
    return health.filter((h) => matchesFilter(h, filter));
  }, [health, selectedId, filter]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Attention queue</h2>
        <ClientCombobox
          clients={clientOptions}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = !selectedId && filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setSelectedId(null);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active
                  ? "bg-brand text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f.label}
              <span className={active ? "ml-1.5 text-blue-200" : "ml-1.5 text-slate-400"}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Client</th>
              <th className="px-4 py-2.5 font-medium">Last contact</th>
              <th className="px-4 py-2.5 font-medium">History</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((h) => (
              <tr
                key={h.client.id}
                className={`border-b border-slate-100 last:border-0 ${h.overdue ? "bg-red-50/40" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {h.overdue && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                    <span className="font-medium text-slate-900">{h.client.name}</span>
                    {h.client.status !== "active" && <StatusBadge status={h.client.status} />}
                    {h.recentReactive > 0 && (
                      <span
                        title="Had a ticket in the last 30 days"
                        className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                      >
                        recent ticket
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <LastContact h={h} />
                </td>
                <td className="px-4 py-3">
                  <MiniCounts h={h} />
                </td>
                <td className="px-4 py-3 text-right">
                  <LogCheckIn clients={clientOptions} defaultClientId={h.client.id} variant="row" />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No clients match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
