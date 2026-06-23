// Domain types + the "who needs attention" logic. This is the heart of the
// dashboard: a check-in grid records events, but the business value is knowing
// who you HAVEN'T spoken to and who recently had a problem.

export type CheckInType = "proactive" | "reactive" | "onboarding";
export type ClientStatus = "onboarding" | "active" | "churned";

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  cadence_days: number;
  created_at: string;
}

export interface CheckIn {
  id: string;
  client_id: string;
  occurred_on: string; // YYYY-MM-DD
  type: string; // a check_in_types.slug — built-ins or user-added categories
  topic: string | null;
  notes: string | null;
  created_by: string | null; // auth user id of whoever logged it
}

// A check-in category, stored in check_in_types. Built-ins (proactive,
// reactive, onboarding) are seeded; users can add more with their own colour.
export interface Category {
  slug: string;
  label: string;
  color: string; // hex, e.g. #ef4444
  precedence: number; // lower = more notable when several land on one day
}

export interface ClientHealth {
  client: Client;
  lastContact: string | null;
  daysSince: number | null; // null = never contacted
  overdue: boolean;
  counts: { total: number; proactive: number; reactive: number; onboarding: number } & Record<
    string,
    number
  >;
  recentReactive: number; // reactive check-ins in the last 30 days
  proactiveRatio: number | null; // proactive / (proactive + reactive)
  riskScore: number; // higher = needs attention sooner
}

export const TYPE_META: Record<CheckInType, { label: string; dot: string; chip: string }> = {
  proactive: { label: "Proactive", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800" },
  reactive: { label: "Tickets", dot: "bg-red-500", chip: "bg-red-100 text-red-800" },
  onboarding: { label: "Onboarding", dot: "bg-amber-400", chip: "bg-amber-100 text-amber-800" },
};

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + "T00:00:00Z");
  const b = Date.parse(toISO + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function buildHealth(
  clients: Client[],
  checkIns: CheckIn[],
  now = new Date()
): ClientHealth[] {
  const today = todayISO(now);
  const byClient = new Map<string, CheckIn[]>();
  for (const c of checkIns) {
    const arr = byClient.get(c.client_id) ?? [];
    arr.push(c);
    byClient.set(c.client_id, arr);
  }

  const health = clients.map((client) => {
    const items = (byClient.get(client.id) ?? []).slice().sort((a, b) =>
      a.occurred_on < b.occurred_on ? 1 : -1
    );
    const counts = { total: items.length, proactive: 0, reactive: 0, onboarding: 0 } as {
      total: number;
      proactive: number;
      reactive: number;
      onboarding: number;
    } & Record<string, number>;
    let recentReactive = 0;
    for (const it of items) {
      counts[it.type] = (counts[it.type] ?? 0) + 1;
      if (it.type === "reactive" && daysBetween(it.occurred_on, today) <= 30) recentReactive += 1;
    }
    const lastContact = items[0]?.occurred_on ?? null;
    const daysSince = lastContact ? daysBetween(lastContact, today) : null;
    const overdue = daysSince === null || daysSince > client.cadence_days;
    const denom = counts.proactive + counts.reactive;
    const proactiveRatio = denom > 0 ? counts.proactive / denom : null;

    // Risk: long silence dominates; recent reactive issues bump it up.
    const riskScore = (daysSince ?? 1000) + recentReactive * 3;

    return {
      client,
      lastContact,
      daysSince,
      overdue,
      counts,
      recentReactive,
      proactiveRatio,
      riskScore,
    };
  });

  return health.sort((a, b) => b.riskScore - a.riskScore);
}

export interface Totals {
  clients: number;
  overdue: number;
  contactedLast7: number;
  proactive: number;
  reactive: number;
  onboarding: number;
  proactiveRatio: number | null;
}

export function rollup(health: ClientHealth[]): Totals {
  let overdue = 0,
    contactedLast7 = 0,
    proactive = 0,
    reactive = 0,
    onboarding = 0;
  for (const h of health) {
    if (h.overdue) overdue += 1;
    if (h.daysSince !== null && h.daysSince <= 7) contactedLast7 += 1;
    proactive += h.counts.proactive;
    reactive += h.counts.reactive;
    onboarding += h.counts.onboarding;
  }
  const denom = proactive + reactive;
  return {
    clients: health.length,
    overdue,
    contactedLast7,
    proactive,
    reactive,
    onboarding,
    proactiveRatio: denom > 0 ? proactive / denom : null,
  };
}
