import { fetchData } from "@/lib/data";
import { todayISO, type CheckInType } from "@/lib/metrics";
import NavBar from "@/components/NavBar";
import CalendarGrid from "@/components/CalendarGrid";

export const dynamic = "force-dynamic";

const CELL: Record<CheckInType, string> = {
  proactive: "bg-emerald-500",
  reactive: "bg-red-500",
  onboarding: "bg-amber-400",
};
function enumerateDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(startISO + "T00:00:00Z");
  const end = Date.parse(endISO + "T00:00:00Z");
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const RANGE_MONTHS: Record<string, number> = { "3m": 3, "6m": 6, "12m": 12 };
const DEFAULT_RANGE = "3m";

export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { clients, checkIns } = await fetchData();
  const today = todayISO();

  const requested = (await searchParams).range ?? "";
  const range = requested in RANGE_MONTHS ? requested : DEFAULT_RANGE;
  const months = RANGE_MONTHS[range];

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

  // client_id -> date -> types logged that day (within the window). Plain
  // objects/arrays so it serializes to the client grid, which decides what to
  // show based on the active type filter.
  const grid: Record<string, Record<string, CheckInType[]>> = {};
  for (const c of checkIns) {
    if (c.occurred_on < windowStart || c.occurred_on > windowEnd) continue;
    const row = (grid[c.client_id] ??= {});
    const arr = (row[c.occurred_on] ??= []);
    if (!arr.includes(c.type)) arr.push(c.type);
  }

  const sortedClients = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name }));
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  // Month label spans for the header.
  const monthSpans: { label: string; count: number }[] = [];
  for (const d of dates) {
    const label = new Date(d + "T00:00:00Z").toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthSpans.push({ label, count: 1 });
  }

  return (
    <>
      <NavBar clients={clientOptions} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <h1 className="text-xl font-semibold text-brand">Check-in calendar</h1>
        <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
          <span>Each cell is a logged check-in. Click any cell to log one.</span>
          <Legend />
        </div>

        <div className="mt-5">
          <CalendarGrid
            clients={sortedClients}
            dates={dates}
            monthSpans={monthSpans}
            grid={grid}
            today={today}
            range={range}
          />
        </div>
      </main>
    </>
  );
}

function Legend() {
  const items: { t: CheckInType; label: string }[] = [
    { t: "proactive", label: "Proactive" },
    { t: "reactive", label: "Tickets" },
    { t: "onboarding", label: "Onboarding" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((i) => (
        <span key={i.t} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded-sm ${CELL[i.t]}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
