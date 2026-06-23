import { fetchData } from "@/lib/data";
import { buildHealth, rollup } from "@/lib/metrics";
import NavBar from "@/components/NavBar";
import AttentionQueue from "@/components/AttentionQueue";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "danger" | "good";
}) {
  const valueColor =
    tone === "danger" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-brand";
  return (
    <div className="rounded-xl border border-slate-200 border-t-4 border-t-brand bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function Dashboard() {
  const { clients, checkIns } = await fetchData();
  const health = buildHealth(clients, checkIns);
  const totals = rollup(health);
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  const ratioPct =
    totals.proactiveRatio === null ? "—" : `${Math.round(totals.proactiveRatio * 100)}%`;

  return (
    <>
      <NavBar clients={clientOptions} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-brand">Client proactivity</h1>
          <p className="mt-1 text-sm text-slate-500">
            Goal: reach every client within their cadence — before they have to reach you.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Clients" value={String(totals.clients)} />
          <StatCard
            label="Overdue"
            value={String(totals.overdue)}
            sub="> 7d since contact"
            tone={totals.overdue > 0 ? "danger" : "good"}
          />
          <StatCard label="Seen this week" value={String(totals.contactedLast7)} sub="last 7 days" />
          <StatCard
            label="Proactive rate"
            value={ratioPct}
            sub={`${totals.proactive} proactive · ${totals.reactive} reactive`}
            tone="good"
          />
          <StatCard label="Onboarding" value={String(totals.onboarding)} sub="check-ins logged" />
        </div>

        <AttentionQueue health={health} clientOptions={clientOptions} />
      </main>
    </>
  );
}
