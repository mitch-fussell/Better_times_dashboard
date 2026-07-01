import { fetchData } from "@/lib/data";
import { buildHealth, rollup, todayISO } from "@/lib/metrics";
import { ZOOM_LEVELS, parseZoom } from "@/lib/zoom";
import NavBar from "@/components/NavBar";
import CalendarGrid from "@/components/CalendarGrid";

export const dynamic = "force-dynamic";

function enumerateDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(startISO + "T00:00:00Z");
  const end = Date.parse(endISO + "T00:00:00Z");
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ zoom?: string }>;
}) {
  const { clients, checkIns, categories, profiles } = await fetchData();
  const today = todayISO();

  // Churned clients are hidden from the calendar (toggleable in the grid so they
  // can still be edited back). They're excluded from the metrics entirely, so a
  // former client doesn't sit "overdue" forever and skew the numbers.
  const activeClients = clients.filter((c) => c.status !== "churned");
  const activeIds = new Set(activeClients.map((c) => c.id));

  // Map each author's id to a display name (null if they haven't set one).
  const nameById = new Map(profiles.map((p) => [p.id, p.display_name?.trim() || null]));

  const zoom = parseZoom((await searchParams).zoom);
  const months = ZOOM_LEVELS[zoom].months;

  // The timeline runs from the Monday on/before "N months ago" through the
  // Sunday of next week. The grid fills the screen width and scrolls back
  // through the window. Anchoring to Monday lines edges up with the separators.
  const DAY = 86_400_000;
  const mondayOf = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
  const todayMs = Date.parse(today + "T00:00:00Z");
  const mondayThisWeek = mondayOf(todayMs);

  const startRaw = new Date(todayMs);
  startRaw.setUTCMonth(startRaw.getUTCMonth() - months);
  const windowStart = new Date(mondayOf(startRaw.getTime())).toISOString().slice(0, 10);
  const windowEnd = new Date(mondayThisWeek + 13 * DAY).toISOString().slice(0, 10);
  const dates = enumerateDates(windowStart, windowEnd);

  // client_id -> date -> check-ins logged that day (within the window), each
  // with its category slug and who logged it. Plain objects/arrays so it
  // serializes to the client grid, which decides what to show based on the
  // active type filter.
  const grid: Record<string, Record<string, { type: string; by: string | null }[]>> = {};
  const countsByType: Record<string, number> = {};
  const contacted = new Set<string>();
  for (const c of checkIns) {
    if (c.occurred_on < windowStart || c.occurred_on > windowEnd) continue;
    const row = (grid[c.client_id] ??= {});
    const arr = (row[c.occurred_on] ??= []);
    arr.push({ type: c.type, by: c.created_by ? nameById.get(c.created_by) ?? null : null });
    // Churned clients still render their history (when revealed) but don't count
    // toward the metrics.
    if (!activeIds.has(c.client_id)) continue;
    countsByType[c.type] = (countsByType[c.type] ?? 0) + 1;
    contacted.add(c.client_id);
  }

  // Overdue is "right now" across all history, not tied to the visible window.
  const health = buildHealth(activeClients, checkIns);
  const metrics = {
    countsByType,
    contactedCount: contacted.size,
    clientsTotal: activeClients.length,
    overdueCount: rollup(health).overdue,
  };

  // Every overdue ("red") client and how far past their own cadence they are, for
  // the collapsible attention box above the grid. daysOver is null for clients
  // never contacted — they sort to the top ("Never contacted"), then by most days
  // over. cadence_days is each client's threshold; overdue means daysSince > it.
  const overdue = health
    .filter((h) => h.overdue)
    .map((h) => ({
      id: h.client.id,
      name: h.client.name,
      cadence: h.client.cadence_days,
      daysOver: h.daysSince === null ? null : h.daysSince - h.client.cadence_days,
    }))
    .sort((a, b) => {
      const av = a.daysOver === null ? Infinity : a.daysOver;
      const bv = b.daysOver === null ? Infinity : b.daysOver;
      return bv - av;
    });

  const sortedClients = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      cadence_days: c.cadence_days,
      status: c.status,
      expected_daily_workers: c.expected_daily_workers,
    }));
  const clientOptions = activeClients.map((c) => ({ id: c.id, name: c.name }));

  // Month label spans for the header.
  const monthSpans: { label: string; count: number }[] = [];
  for (const d of dates) {
    const label = new Date(d + "T00:00:00Z").toLocaleString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthSpans.push({ label, count: 1 });
  }

  return (
    <>
      <NavBar clients={clientOptions} wide />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <h1 className="text-xl font-semibold text-brand">Check-in calendar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Each cell is a logged check-in. Click any cell to log one.
        </p>

        <div className="mt-5">
          <CalendarGrid
            clients={sortedClients}
            dates={dates}
            monthSpans={monthSpans}
            grid={grid}
            today={today}
            zoom={zoom}
            categories={categories}
            metrics={metrics}
            overdue={overdue}
          />
        </div>
      </main>
    </>
  );
}
