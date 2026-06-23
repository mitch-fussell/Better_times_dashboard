"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TYPE_META, type CheckInType, type Client } from "@/lib/metrics";

const CELL: Record<CheckInType, string> = {
  proactive: "bg-emerald-500",
  reactive: "bg-red-500",
  onboarding: "bg-amber-400",
};

const TYPES: CheckInType[] = ["proactive", "reactive", "onboarding"];

// The calendar grid is interactive: clicking any day cell opens a small dropdown
// to pick an interaction type. Choosing one logs a check-in for that client+date
// and refreshes the page (force-dynamic), so the cell updates immediately.
export default function CalendarGrid({
  clients,
  dates,
  monthSpans,
  grid,
}: {
  clients: Pick<Client, "id" | "name">[];
  dates: string[];
  monthSpans: { label: string; count: number }[];
  // client_id -> date -> winning type
  grid: Record<string, Record<string, CheckInType>>;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<{
    clientId: string;
    clientName: string;
    date: string;
    x: number;
    y: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white" />
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
            <th className="sticky left-0 z-10 bg-white px-3 py-1 text-left font-medium text-slate-500">
              Client
            </th>
            {dates.map((d) => {
              const dow = new Date(d + "T00:00:00Z").getUTCDay();
              const weekend = dow === 0 || dow === 6;
              return (
                <th
                  key={d}
                  className={`w-5 py-1 text-center font-normal text-slate-400 ${
                    weekend ? "bg-slate-50" : ""
                  }`}
                >
                  {d.slice(8, 10)}
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
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 font-medium text-slate-700 group-hover:bg-slate-50">
                  {client.name}
                </td>
                {dates.map((d) => {
                  const type = row?.[d];
                  const dow = new Date(d + "T00:00:00Z").getUTCDay();
                  const weekend = dow === 0 || dow === 6;
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
                        selected ? "ring-2 ring-inset ring-brand" : ""
                      } ${type ? CELL[type] : weekend ? "bg-slate-50" : "bg-slate-100/60"}`}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

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
