"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Category, Client } from "@/lib/metrics";
import { ZOOM_LEVELS, DEFAULT_ZOOM, DATE_LABEL_MIN_PX } from "@/lib/zoom";
import ManageCategories from "./ManageCategories";
import AddClient from "./AddClient";
import EditClient from "./EditClient";

// Fixed, explicit column widths keep every day exactly the same size. With the
// default auto table-layout the browser rounds hundreds of narrow columns to
// whole pixels independently, which both varied the cell sizes and squished the
// two-digit date numbers. The day-column width comes from the current zoom level.
const NAME_COL_PX = 192; // matches the w-48 client column

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

// One logged check-in in a day cell: its category slug and who logged it.
interface CellEntry {
  type: string;
  by: string | null;
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
  zoom,
  categories,
  metrics,
}: {
  clients: Pick<Client, "id" | "name" | "cadence_days" | "status">[];
  dates: string[];
  monthSpans: { label: string; count: number }[];
  // client_id -> date -> check-ins logged that day (category slug + who logged it)
  grid: Record<string, Record<string, CellEntry[]>>;
  today: string;
  zoom: number;
  categories: Category[];
  metrics: Metrics;
}) {
  const router = useRouter();

  // Zoom drives both the column width and (server-side) the months loaded, so
  // stepping it navigates to refetch the right window. Lower = out, higher = in.
  const cellPx = ZOOM_LEVELS[zoom].cellPx;
  const showDateLabels = cellPx >= DATE_LABEL_MIN_PX;
  function goZoom(i: number) {
    const z = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i));
    if (z !== zoom) router.push(`/calendar?zoom=${z}`);
  }

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
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [editClient, setEditClient] = useState<
    Pick<Client, "id" | "name" | "cadence_days" | "status"> | null
  >(null);
  const [showChurned, setShowChurned] = useState(false);

  // Churned clients are hidden by default; the toggle reveals them (e.g. to edit
  // one back to active). It only appears when there's something to reveal.
  const hasChurned = clients.some((c) => c.status === "churned");
  const visibleClients = showChurned
    ? clients
    : clients.filter((c) => c.status !== "churned");

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
          <span className="font-medium text-slate-600">Zoom</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goZoom(zoom - 1)}
              disabled={zoom <= 0}
              title="Zoom out — fit more days"
              aria-label="Zoom out"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-base font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => goZoom(zoom + 1)}
              disabled={zoom >= ZOOM_LEVELS.length - 1}
              title="Zoom in — fewer, bigger days"
              aria-label="Zoom in"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-base font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => goZoom(DEFAULT_ZOOM)}
              disabled={zoom === DEFAULT_ZOOM}
              title="Reset zoom"
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Reset
            </button>
          </div>

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

          {hasChurned && (
            <label className="ml-2 flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showChurned}
                onChange={(e) => setShowChurned(e.target.checked)}
                className="rounded border-slate-300"
              />
              Show churned
            </label>
          )}

          <button
            type="button"
            onClick={() => setAddClientOpen(true)}
            className="ml-auto rounded-lg border border-brand bg-brand px-2.5 py-1 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Add client
          </button>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Manage categories
          </button>
        </div>

        <div
          ref={scrollRef}
          className="overflow-auto rounded-b-xl"
          style={{ maxHeight: SCROLL_MAX_PX }}
        >
          <table
            className="table-fixed border-separate border-spacing-0 text-xs"
            style={{ width: NAME_COL_PX + dates.length * cellPx }}
          >
            <colgroup>
              <col style={{ width: NAME_COL_PX }} />
              {dates.map((d) => (
                <col key={d} style={{ width: cellPx }} />
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
                  const weekStart = dow === 1;
                  const isToday = d === today;
                  // Only the week separator runs down the grid. The month split
                  // is shown by the boxed label in the header row, not a column bar.
                  const divider = weekStart ? "border-l border-l-black" : "";
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
                      {showDateLabels && (
                        <span className="flex flex-col items-center leading-tight">
                          <span className="text-[10px] uppercase text-black">{weekdayLetter}</span>
                          <span className="text-xs font-medium tabular-nums">{d.slice(8, 10)}</span>
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((client) => {
                const row = grid[client.id];
                return (
                  <tr key={client.id} className="group">
                    <td
                      style={{ height: ROW_PX }}
                      className="sticky left-0 z-10 w-48 max-w-48 bg-white px-3 font-medium text-slate-700 group-hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-1">
                        <span
                          title={client.name}
                          className={`flex-1 truncate ${
                            client.status === "churned" ? "text-slate-400" : ""
                          }`}
                        >
                          {client.name}
                        </span>
                        {client.status === "churned" && (
                          <span className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            churned
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditClient(client)}
                          title={`Edit ${client.name}`}
                          aria-label={`Edit ${client.name}`}
                          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-3.5 w-3.5"
                          >
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a1 1 0 01-.464.263l-3 .75a.5.5 0 01-.606-.606l.75-3a1 1 0 01.263-.464l8.5-8.5z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    {dates.map((d) => {
                      // Most notable category present that isn't hidden.
                      const entries = row?.[d];
                      const slugs = entries?.map((e) => e.type);
                      const winning =
                        slugs && slugs.length
                          ? orderedSlugs.find((s) => slugs.includes(s) && !hidden.has(s))
                          : undefined;
                      const color = winning ? catBySlug.get(winning)?.color : undefined;
                      const dow = new Date(d + "T00:00:00Z").getUTCDay();
                      const weekend = dow === 0 || dow === 6;
                      const weekStart = dow === 1;
                      const isToday = d === today;
                      const divider = weekStart ? "border-l-black" : "";
                      const selected = menu?.clientId === client.id && menu?.date === d;
                      // Tooltip lists what was logged and who logged it.
                      const summary = entries?.length
                        ? entries
                            .map((e) => {
                              const lbl = catBySlug.get(e.type)?.label ?? e.type;
                              return e.by ? `${lbl} by ${e.by}` : lbl;
                            })
                            .join(", ")
                        : null;
                      return (
                        <td
                          key={d}
                          onClick={(e) => openMenu(e, client.id, client.name, d)}
                          style={{ height: ROW_PX, ...(color ? { backgroundColor: color } : {}) }}
                          title={
                            summary
                              ? `${client.name} · ${d} · ${summary} — click to log another`
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
            className="fixed z-50 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{menu.clientName}</span> · {menu.date}
            </div>

            {/* Existing check-ins for this day, with who logged each one. */}
            {(() => {
              const existing = grid[menu.clientId]?.[menu.date];
              if (!existing?.length) return null;
              return (
                <div className="border-t border-slate-100 px-3 py-1.5">
                  <p className="text-[11px] font-medium uppercase text-slate-400">Logged</p>
                  <ul className="mt-1 space-y-1">
                    {existing.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: catBySlug.get(e.type)?.color ?? "#cbd5e1" }}
                        />
                        <span>{catBySlug.get(e.type)?.label ?? e.type}</span>
                        <span className="text-slate-400">{e.by ? `· ${e.by}` : "· unknown"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div className="my-1 border-t border-slate-100" />
            <p className="px-3 pb-1 text-[11px] font-medium uppercase text-slate-400">
              Log a check-in
            </p>
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

      {addClientOpen && <AddClient onClose={() => setAddClientOpen(false)} />}

      {editClient && (
        <EditClient client={editClient} onClose={() => setEditClient(null)} />
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
