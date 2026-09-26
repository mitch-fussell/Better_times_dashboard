"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { STATUS_OPTIONS, type ClientStatus } from "@/lib/metrics";

// Add a client. A new clients row is all it takes — the calendar renders one
// row per client, so after the refresh the new client appears as a tracked row.
// created_at defaults to now() in the database; the only thing we must supply is
// the (unique) name. Cadence drives the overdue logic, so it's worth setting up
// front. Status and expected daily workers are written to the same columns the
// Edit form, dashboard table and calendar read, so they show everywhere at once.
export default function AddClient({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState(7);
  const [status, setStatus] = useState<ClientStatus>("active");
  // Kept as a string so the field can be left empty (= "not set" / null).
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a client name.");
      return;
    }
    const expTrimmed = expected.trim();
    const expectedDailyWorkers =
      expTrimmed === "" ? null : Math.max(0, Math.floor(Number(expTrimmed)));
    if (expectedDailyWorkers !== null && !Number.isFinite(expectedDailyWorkers)) {
      setError("Expected daily workers must be a number.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.from("clients").insert({
      name: trimmed,
      cadence_days: cadence,
      status,
      expected_daily_workers: expectedDailyWorkers,
    });
    setSaving(false);

    if (error) {
      // 23505 is Postgres' unique-violation code: a client with this name exists.
      setError(
        error.code === "23505"
          ? `A client named "${trimmed}" already exists.`
          : error.message
      );
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">Add a client</h2>
        <p className="mt-1 text-sm text-slate-500">
          They&apos;ll appear as a new row on the calendar to track.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="client-name" className="block text-sm font-medium text-slate-700">
              Client name
            </label>
            <input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              autoFocus
              placeholder="e.g. Acme Ltd"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="client-cadence" className="block text-sm font-medium text-slate-700">
              Check in every
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="client-cadence"
                type="number"
                min={1}
                value={cadence}
                onChange={(e) => setCadence(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-500">days</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Used to flag the client as overdue when it&apos;s been longer than this.
            </p>
          </div>

          <div>
            <label htmlFor="client-expected" className="block text-sm font-medium text-slate-700">
              Expected daily workers
            </label>
            <input
              id="client-expected"
              type="number"
              min={0}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="—"
              className="mt-1 w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">
              Shown next to the client on the calendar and dashboard. Optional.
            </p>
          </div>

          <div>
            <label htmlFor="client-status" className="block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="client-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ClientStatus)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add client"}
          </button>
        </div>
      </div>
    </div>
  );
}
