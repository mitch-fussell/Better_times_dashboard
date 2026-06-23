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
// When a client has multiple check-ins on one day, show the most notable.
const PRECEDENCE: CheckInType[] = ["reactive", "onboarding", "proactive"];

function enumerateDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(startISO + "T00:00:00Z");
  const end = Date.parse(endISO + "T00:00:00Z");
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export default async function Calendar() {
  const { clients, checkIns } = await fetchData();
  const today = todayISO();

  const minDate =
    checkIns.length > 0
      ? checkIns.reduce((m, c) => (c.occurred_on < m ? c.occurred_on : m), checkIns[0].occurred_on)
      : today;
  const dates = enumerateDates(minDate, today);

  // client_id -> date -> winning type. Plain objects so it serializes to the
  // client component that renders the interactive grid.
  const grid: Record<string, Record<string, CheckInType>> = {};
  for (const c of checkIns) {
    const row = (grid[c.client_id] ??= {});
    const existing = row[c.occurred_on];
    if (!existing || PRECEDENCE.indexOf(c.type) < PRECEDENCE.indexOf(existing)) {
      row[c.occurred_on] = c.type;
    }
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

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <CalendarGrid
            clients={sortedClients}
            dates={dates}
            monthSpans={monthSpans}
            grid={grid}
          />
        </div>
      </main>
    </>
  );
}

function Legend() {
  const items: { t: CheckInType; label: string }[] = [
    { t: "proactive", label: "Proactive" },
    { t: "reactive", label: "Reactive" },
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
