"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Category, Client } from "@/lib/metrics";
import ManageCategories from "./ManageCategories";

// Fixed, explicit column widths keep every day exactly the same size. With the
// default auto table-layout the browser rounds hundreds of narrow columns to
// whole pixels independently, which both varied the cell sizes and squished the
// two-digit date numbers.
const NAME_COL_PX = 192; // matches the w-48 client column
const CELL_PX = 36; // wide enough that two-digit dates sit comfortably, not squished

// Vertical window: only ~15 client rows show at once, so the grid stays compact
// and the cells can be taller/easier to read. The rest scroll within the box,
// while the date header stays frozen at the top and the name column at the left.
const VISIBLE_CLIENTS = 15;
const ROW_PX = 34; // height of each client row
const HEADER_MONTH_PX = 26; // top header row (month labels)
const HEADER_DATE_PX = 40; // second header row (weekday + date number)
const SCROLL_MAX_PX = HEADER_MONTH_PX + HEADER_DATE_PX + VISIBLE_CLIENTS * ROW_PX;

interface Metrics {
  countsByType: Record<string, number>;
  contactedCount: number;
  clientsTotal: number;
  overdueCount: number;
}

// The calendar grid is interactive: clicking any day cell opens a small dropdown
// to pick a category. Choosing one logs a check-in for that client+date and
// refreshes the page (force-dynamic), so the cell updates immediately.
export default function CalendarGrid({
  clients,
  dates,
  monthSpans,
  grid,
  today,
  range,
  categories,
  metrics,
}: {
  clients: Pick<Client, "id" | "name">[];
  dates: string[];
  monthSpans: { label: string; count: number }[];
  // client_id -> date -> category slugs logged that day
  grid: Record<string, Record<string, string[]>>;
  today: string;
  range: string;
  categories: Category[];
  metrics: Metrics;
}) {
  const router = useRouter();

  // Categories arrive sorted by precedence (most notable first). A cell paints
  // the most notable category present that isn't hidden by the filter.
  const orderedSlugs = categories.map((c) => c.slug);
  const catBySlug = new Map(categories.map((c) => [c.slug, c]));

  // Filter as a set of *hidden* slugs (default none) so categories added later
  // are visible automatically.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  function toggle(slug: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
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
  const [manageOpen, setManageOpen] = useState(false);

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

  async function log(slug: string) {
    if (!menu) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("check_ins").insert({
      client_id: menu.clientId,
      occurred_on: menu.date,
      type: slug,
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

  const totalInView = categories.reduce(
    (sum, c) => sum + (hidden.has(c.slug) ? 0 : (metrics.countsByType[c.slug] ?? 0)),
    0
  );

  return (
    <>
      {/* Metrics — compact cards, smaller than the dashboard's. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Metric
            key={c.slug}
            value={metrics.countsByType[c.slug] ?? 0}
            label={c.label}
            color={c.color}
            dim={hidden.has(c.slug)}
          />
        ))}
        <Metric value={totalInView} label="Total" />
        <Metric value={`${metrics.contactedCount}/${metrics.clientsTotal}`} label="Contacted" />
        <Metric value={metrics.overdueCount} label="Overdue" />
      </div>

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
          {categories.map((c) => {
            const on = !hidden.has(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.slug)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
                  on
                    ? "border-brand bg-brand text-white"
                    : "border-slate-300 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color, opacity: on ? 1 : 0.4 }}
                />
                {c.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="ml-auto rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Manage categories
          </button>
        </div>

        <div
          ref={scrollRef}
          className="overflow-auto rounded-b-xl"
          style={{ maxHeight: SCROLL_MAX_PX }}
        >
          <table className="table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              <col style={{ width: NAME_COL_PX }} />
              {dates.map((d) => (
                <col key={d} style={{ width: CELL_PX }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 w-48 bg-white"
                  style={{ height: HEADER_MONTH_PX }}
                />
                {monthSpans.map((m, i) => (
                  <th
                    key={i}
                    colSpan={m.count}
                    className="sticky top-0 z-20 border border-slate-200 bg-slate-50 px-1 text-center font-medium text-slate-600"
                    style={{ height: HEADER_MONTH_PX }}
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th
                  className="sticky left-0 z-30 w-48 bg-white px-3 text-left font-medium text-slate-500"
                  style={{ top: HEADER_MONTH_PX, height: HEADER_DATE_PX }}
                >
                  Client
                </th>
                {dates.map((d) => {
                  const day = new Date(d + "T00:00:00Z");
                  const dow = day.getUTCDay();
                  const weekend = dow === 0 || dow === 6;
                  const monthStart = d.slice(8, 10) === "01";
                  const weekStart = dow === 1;
                  const isToday = d === today;
                  const divider = monthStart
                    ? "border-l-2 border-l-slate-400"
                    : weekStart
                      ? "border-l border-l-black"
                      : "";
                  const weekdayLetter = day.toLocaleString("en-US", {
                    weekday: "narrow",
                    timeZone: "UTC",
                  });
                  return (
                    <th
                      key={d}
                      title={day.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" })}
                      style={{ top: HEADER_MONTH_PX, height: HEADER_DATE_PX }}
                      className={`sticky z-20 text-center font-normal text-black ${
                        isToday ? "bg-slate-300" : weekend ? "bg-slate-50" : "bg-white"
                      } ${divider}`}
                    >
                      <span className="flex flex-col items-center leading-tight">
                        <span className="text-[10px] uppercase text-black">{weekdayLetter}</span>
                        <span className="text-sm font-medium tabular-nums">{d.slice(8, 10)}</span>
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
                      style={{ height: ROW_PX }}
                      className="sticky left-0 z-10 w-48 max-w-48 truncate bg-white px-3 font-medium text-slate-700 group-hover:bg-slate-50"
                    >
                      {client.name}
                    </td>
                    {dates.map((d) => {
                      // Most notable category present that isn't hidden.
                      const present = row?.[d];
                      const winning =
                        present && present.length
                          ? orderedSlugs.find((s) => present.includes(s) && !hidden.has(s))
                          : undefined;
                      const color = winning ? catBySlug.get(winning)?.color : undefined;
                      const dow = new Date(d + "T00:00:00Z").getUTCDay();
                      const weekend = dow === 0 || dow === 6;
                      const monthStart = d.slice(8, 10) === "01";
                      const weekStart = dow === 1;
                      const isToday = d === today;
                      const divider = monthStart
                        ? "border-l-2 border-l-slate-400"
                        : weekStart
                          ? "border-l-black"
                          : "";
                      const selected = menu?.clientId === client.id && menu?.date === d;
                      const label = winning ? catBySlug.get(winning)?.label : undefined;
                      return (
                        <td
                          key={d}
                          onClick={(e) => openMenu(e, client.id, client.name, d)}
                          style={{ height: ROW_PX, ...(color ? { backgroundColor: color } : {}) }}
                          title={
                            label
                              ? `${client.name} · ${d} · ${label} — click to log another`
                              : `${client.name} · ${d} — click to log`
                          }
                          className={`cursor-pointer border border-white hover:ring-2 hover:ring-inset hover:ring-brand ${divider} ${
                            selected ? "ring-2 ring-inset ring-brand" : ""
                          } ${
                            color ? "" : isToday ? "bg-slate-300" : weekend ? "bg-slate-50" : "bg-slate-100/60"
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
            {categories.map((c) => (
              <button
                key={c.slug}
                onClick={() => log(c.slug)}
                disabled={saving}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                {c.label}
              </button>
            ))}
            {error && <p className="px-3 py-1.5 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}

      {manageOpen && (
        <ManageCategories categories={categories} onClose={() => setManageOpen(false)} />
      )}
    </>
  );
}

function Metric({
  value,
  label,
  color,
  dim,
}: {
  value: number | string;
  label: string;
  color?: string;
  dim?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[5rem] flex-col rounded-lg border border-slate-200 bg-white px-3 py-1.5 ${
        dim ? "opacity-50" : ""
      }`}
    >
      <span className="text-base font-semibold tabular-nums text-slate-900">{value}</span>
      <span className="flex items-center gap-1 text-[11px] text-slate-500">
        {color && (
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        )}
        {label}
      </span>
    </div>
  );
}
