"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TYPE_META, type CheckInType, type Client } from "@/lib/metrics";

// Fixed, explicit column widths keep every day exactly the same size. With the
// default auto table-layout the browser rounds hundreds of narrow columns to
// whole pixels independently, which both varied the cell sizes and squished the
// two-digit date numbers.
const NAME_COL_PX = 192; // matches the w-48 client column
const CELL_PX = 24; // a little wider than before so dates like "30" stay legible

const CELL: Record<CheckInType, string> = {
  proactive: "bg-emerald-500",
  reactive: "bg-red-500",
  onboarding: "bg-amber-400",
};

const TYPES: CheckInType[] = ["proactive", "reactive", "onboarding"];

// When a client has multiple check-ins on one day, show the most notable.
const PRECEDENCE: CheckInType[] = ["reactive", "onboarding", "proactive"];

// The calendar grid is interactive: clicking any day cell opens a small dropdown
// to pick an interaction type. Choosing one logs a check-in for that client+date
// and refreshes the page (force-dynamic), so the cell updates immediately.
export default function CalendarGrid({
  clients,
  dates,
  monthSpans,
  grid,
  today,
  range,
}: {
  clients: Pick<Client, "id" | "name">[];
  dates: string[];
  monthSpans: { label: string; count: number }[];
  // client_id -> date -> types logged that day
  grid: Record<string, Record<string, CheckInType[]>>;
  today: string;
  range: string;
}) {
  const router = useRouter();
  // Multi-select type filter: a cell shows only if one of its logged types is
  // still active. All types are active by default.
  const [active, setActive] = useState<Set<CheckInType>>(() => new Set(TYPES));

  function toggle(t: CheckInType) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  const [menu, setMenu] = useState<{
    clientId: string;
    clientName: string;
    date: string;
    x: number;
    y: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open (and re-pin after a range change) scrolled to the most recent dates,
  // i.e. the right edge of the timeline.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [dates.length]);

  function openMenu(
    e: React.MouseEvent<HTMLTableCellElement>,
    clientId: string,
    clientName: string,
    date: string
  ) {
    const rect = e.currentTarget.getBoundingClientRect();
    setError(null);
    setMenu({ clientId, clientName, date, x: rect.left, y: rect.bottom + 4 });
  }

  async function log(type: CheckInType) {
    if (!menu) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("check_ins").insert({
      client_id: menu.clientId,
      occurred_on: menu.date,
      type,
      topic: null,
      notes: null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMenu(null);
    router.refresh();
  }

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
          <label htmlFor="range" className="font-medium text-slate-600">
            Range
          </label>
          <select
            id="range"
            value={range}
            onChange={(e) => router.push(`/calendar?range=${e.target.value}`)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="3m">3 months</option>
            <option value="6m">6 months</option>
            <option value="12m">12 months</option>
          </select>

          <span className="ml-2 font-medium text-slate-600">Filter</span>
          {TYPES.map((t) => {
            const on = active.has(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(t)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
                  on
                    ? "border-brand bg-brand text-white"
                    : "border-slate-300 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${TYPE_META[t].dot} ${on ? "" : "opacity-40"}`}
                />
                {TYPE_META[t].label}
              </button>
            );
          })}
        </div>

        <div ref={scrollRef} className="overflow-x-auto rounded-b-xl">
          <table className="table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              <col style={{ width: NAME_COL_PX }} />
              {dates.map((d) => (
                <col key={d} style={{ width: CELL_PX }} />
              ))}
            </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-48 bg-white" />
            {monthSpans.map((m, i) => (
              <th
                key={i}
                colSpan={m.count}
                className="border-b border-slate-100 px-1 py-1 text-left font-medium text-slate-500"
              >
                {m.label}
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 z-10 w-48 bg-white px-3 py-1 text-left font-medium text-slate-500">
              Client
            </th>
            {dates.map((d) => {
              const day = new Date(d + "T00:00:00Z");
              const dow = day.getUTCDay();
              const weekend = dow === 0 || dow === 6;
              const weekStart = dow === 1; // Monday — separates one week from the next
              const isToday = d === today;
              const weekdayLetter = day.toLocaleString("en-US", {
                weekday: "narrow",
                timeZone: "UTC",
              });
              return (
                <th
                  key={d}
                  title={day.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" })}
                  className={`w-5 py-1 text-center font-normal text-black ${
                    isToday ? "bg-slate-300" : weekend ? "bg-slate-50" : ""
                  } ${weekStart ? "border-l border-l-black" : ""}`}
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-[9px] uppercase text-black">{weekdayLetter}</span>
                    <span className="tabular-nums">{d.slice(8, 10)}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const row = grid[client.id];
            return (
              <tr key={client.id} className="group">
                <td
                  title={client.name}
                  className="sticky left-0 z-10 w-48 max-w-48 truncate bg-white px-3 py-1 font-medium text-slate-700 group-hover:bg-slate-50"
                >
                  {client.name}
                </td>
                {dates.map((d) => {
                  // Which logged type to paint: the most notable one that is
                  // both present that day and still active in the filter.
                  const present = row?.[d];
                  const type =
                    present && present.length
                      ? PRECEDENCE.find((t) => present.includes(t) && active.has(t))
                      : undefined;
                  const dow = new Date(d + "T00:00:00Z").getUTCDay();
                  const weekend = dow === 0 || dow === 6;
                  const weekStart = dow === 1; // Monday — separates one week from the next
                  const isToday = d === today;
                  const selected = menu?.clientId === client.id && menu?.date === d;
                  return (
                    <td
                      key={d}
                      onClick={(e) => openMenu(e, client.id, client.name, d)}
                      title={
                        type
                          ? `${client.name} · ${d} · ${type} — click to log another`
                          : `${client.name} · ${d} — click to log`
                      }
                      className={`h-5 w-5 cursor-pointer border border-white hover:ring-2 hover:ring-inset hover:ring-brand ${
                        weekStart ? "border-l-black" : ""
                      } ${
                        selected ? "ring-2 ring-inset ring-brand" : ""
                      } ${
                        type
                          ? CELL[type]
                          : isToday
                            ? "bg-slate-300"
                            : weekend
                              ? "bg-slate-50"
                              : "bg-slate-100/60"
                      }`}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
          </table>
        </div>
      </div>

      {menu && (
        <>
          {/* Backdrop closes the menu on an outside click. */}
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{menu.clientName}</span> · {menu.date}
            </div>
            <div className="my-1 border-t border-slate-100" />
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => log(t)}
                disabled={saving}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${TYPE_META[t].dot}`} />
                {TYPE_META[t].label}
              </button>
            ))}
            {error && <p className="px-3 py-1.5 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
