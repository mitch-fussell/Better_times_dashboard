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
// Responsive client-name column: narrow enough not to break small monitors,
// but it grows with the viewport so long client names show in full on larger
// screens instead of truncating. Used as a single source of truth for the
// column's width everywhere it's needed (table width, <col>, and the sticky
// header/body cells), so they all stay in lockstep.
const NAME_COL = "clamp(180px, 18vw, 320px)";

// Vertical window: only ~15 client rows show at once, so the grid stays compact
// and the cells can be taller/easier to read. The rest scroll within the box,
// while the date header stays frozen at the top and the name column at the left.
const VISIBLE_CLIENTS = 15;
const HEADER_MONTH_PX = 26; // top header row (month labels)
const HEADER_DATE_FULL_PX = 40; // second header row when day labels show
const HEADER_DATE_COMPACT_PX = 18; // shrunk when labels are hidden (zoomed out)

// The scroll box is a FIXED height (sized to the default zoom), independent of
// zoom. Zooming out shrinks the rows, so more client rows fit inside the same
// box rather than the box itself getting smaller.
const SCROLL_MAX_PX =
  HEADER_MONTH_PX + HEADER_DATE_FULL_PX + VISIBLE_CLIENTS * ZOOM_LEVELS[DEFAULT_ZOOM].rowPx;

interface Metrics {
  countsByType: Record<string, number>;
  contactedCount: number;
  clientsTotal: number;
  overdueCount: number;
}

// One overdue ("red") client for the attention box: how many days past their own
// cadence they are, or null if they've never been contacted.
interface OverdueClient {
  id: string;
  name: string;
  cadence: number;
  daysOver: number | null;
}

// Severity tiers for the attention box, so the most urgent clients pop. Measured
// against each client's OWN cadence (so "5 days over" means more for a weekly
// client than a monthly one): 0 = just over, 1 = well over (>= half a cycle
// late), 2 = severe (a full cycle+ late, or never contacted).
const SEV = [
  { dot: "bg-red-400", badge: "bg-red-100 text-red-700" },
  { dot: "bg-red-500", badge: "bg-red-200 text-red-800" },
  { dot: "bg-red-600", badge: "bg-red-600 text-white" },
] as const;

function severity(daysOver: number | null, cadence: number): 0 | 1 | 2 {
  if (daysOver === null) return 2;
  const ratio = daysOver / cadence;
  if (ratio >= 1) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
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
  overdue,
}: {
  clients: Pick<Client, "id" | "name" | "cadence_days" | "status" | "expected_daily_workers">[];
  dates: string[];
  monthSpans: { label: string; count: number }[];
  // client_id -> date -> check-ins logged that day (category slug + who logged it)
  grid: Record<string, Record<string, CellEntry[]>>;
  today: string;
  zoom: number;
  categories: Category[];
  metrics: Metrics;
  // Overdue clients, already sorted worst-first (never-contacted, then most days over).
  overdue: OverdueClient[];
}) {
  const router = useRouter();

  // Zoom drives both the column width and (server-side) the months loaded, so
  // stepping it navigates to refetch the right window. Lower = out, higher = in.
  const cellPx = ZOOM_LEVELS[zoom].cellPx;
  const rowPx = ZOOM_LEVELS[zoom].rowPx;
  const showDateLabels = cellPx >= DATE_LABEL_MIN_PX;
  // Trim the (now empty) date header when labels are hidden so the zoomed-out
  // view stays a compact heatmap rather than a short grid under a tall header.
  const headerDatePx = showDateLabels ? HEADER_DATE_FULL_PX : HEADER_DATE_COMPACT_PX;
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
    Pick<Client, "id" | "name" | "cadence_days" | "status" | "expected_daily_workers"> | null
  >(null);
  const [showChurned, setShowChurned] = useState(false);
  // Attention box starts collapsed so it barely takes any room; click to expand.
  const [attentionOpen, setAttentionOpen] = useState(false);

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

      {/* Collapsible attention box: every overdue ("red") client and how many days
          past their cadence they are. Collapsed by default to save space. */}
      {overdue.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-xl border border-red-200 bg-red-50/40">
          <button
            type="button"
            onClick={() => setAttentionOpen((o) => !o)}
            aria-expanded={attentionOpen}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-800 hover:bg-red-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 shrink-0 transition-transform ${attentionOpen ? "rotate-90" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M7.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <span>Needs attention ({overdue.length})</span>
            <span className="ml-1 font-normal text-red-500">
              past check-in cadence
            </span>
          </button>

          {attentionOpen && (
            <ul
              className="grid max-h-64 grid-cols-1 gap-px overflow-auto border-t border-red-200 bg-red-100 sm:grid-cols-2 lg:grid-cols-3"
            >
              {overdue.map((c) => {
                const sev = severity(c.daysOver, c.cadence);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 bg-white px-3 py-2 text-sm"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${SEV[sev].dot}`} />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800" title={c.name}>
                      {c.name}
                    </span>
                    {c.daysOver === null ? (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${SEV[2].badge}`}>
                        Never contacted
                      </span>
                    ) : (
                      <span
                        title={`Overdue by ${c.daysOver} — cadence is every ${c.cadence} ${
                          c.cadence === 1 ? "day" : "days"
                        }`}
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${SEV[sev].badge}`}
                      >
                        {c.daysOver}d over
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

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
            style={{ width: `calc(${NAME_COL} + ${dates.length * cellPx}px)` }}
          >
            <colgroup>
              <col style={{ width: NAME_COL }} />
              {dates.map((d) => (
                <col key={d} style={{ width: cellPx }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  className="sticky left-0 top-0 z-30 bg-white"
                  style={{ height: HEADER_MONTH_PX, width: NAME_COL }}
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
                  className="sticky left-0 z-30 bg-white px-3 font-medium text-slate-500"
                  style={{ top: HEADER_MONTH_PX, height: headerDatePx, width: NAME_COL }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Client</span>
                    <span className="flex items-center gap-1 pr-1 text-slate-400">
                      <span title="Check-in cadence (days)">Days</span>
                      <span title="Expected daily workers">Workers</span>
                    </span>
                  </div>
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
                      style={{ top: HEADER_MONTH_PX, height: headerDatePx }}
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
                      style={{ height: rowPx, width: NAME_COL, maxWidth: NAME_COL }}
                      className="sticky left-0 z-10 bg-white px-3 font-medium text-slate-700 group-hover:bg-slate-50"
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
                        <span
                          title={`Check-in every ${client.cadence_days} ${
                            client.cadence_days === 1 ? "day" : "days"
                          }`}
                          className="shrink-0 rounded px-1.5 text-[11px] font-medium tabular-nums text-slate-400"
                        >
                          {client.cadence_days}d
                        </span>
                        <span
                          title={`Expected daily workers${
                            client.expected_daily_workers === null
                              ? " — not set (edit to add)"
                              : `: ${client.expected_daily_workers}`
                          }`}
                          className={`shrink-0 rounded px-1.5 text-[11px] font-medium tabular-nums ${
                            client.expected_daily_workers === null
                              ? "text-slate-300"
                              : "bg-brand/10 text-brand"
                          }`}
                        >
                          {client.expected_daily_workers ?? "—"}
                        </span>
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
                          style={{ height: rowPx, ...(color ? { backgroundColor: color } : {}) }}
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
