"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Client, ClientStatus } from "@/lib/metrics";

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Active" },
  { value: "churned", label: "Churned" },
];

// Edit a client's details, or remove them. Removing is a hard delete: the
// check_ins → clients foreign key is ON DELETE CASCADE, so deleting a client
// also deletes their entire check-in history. For a client you've simply
// stopped working with, setting the status to "Churned" keeps the record and
// its history instead — so we surface that as the gentler option.
export default function EditClient({
  client,
  onClose,
}: {
  client: Pick<Client, "id" | "name" | "cadence_days" | "status" | "expected_daily_workers">;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(client.name);
  const [cadence, setCadence] = useState(client.cadence_days);
  const [status, setStatus] = useState<ClientStatus>(client.status);
  // Kept as a string so the field can be emptied (= "not set" / null).
  const [expected, setExpected] = useState(
    client.expected_daily_workers === null ? "" : String(client.expected_daily_workers)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a client name.");
      return;
    }
    const expTrimmed = expected.trim();
    const expectedDailyWorkers =
      expTrimmed === "" ? null : Math.max(0, Math.floor(Number(expTrimmed)));

    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("clients")
      .update({
        name: trimmed,
        cadence_days: cadence,
        status,
        expected_daily_workers: expectedDailyWorkers,
      })
      .eq("id", client.id);
    setSaving(false);

    if (error) {
      // 23505 is Postgres' unique-violation code: another client has this name.
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

  async function remove() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setSaving(false);
    if (error) {
      setError(error.message);
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
        <h2 className="text-lg font-semibold text-slate-900">Edit client</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="edit-client-name" className="block text-sm font-medium text-slate-700">
              Client name
            </label>
            <input
              id="edit-client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="edit-client-cadence"
              className="block text-sm font-medium text-slate-700"
            >
              Check in every
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="edit-client-cadence"
                type="number"
                min={1}
                value={cadence}
                onChange={(e) => setCadence(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-500">days</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="edit-client-expected"
              className="block text-sm font-medium text-slate-700"
            >
              Expected daily workers
            </label>
            <input
              id="edit-client-expected"
              type="number"
              min={0}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="—"
              className="mt-1 w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">
              Shown next to the client on the calendar and dashboard. Leave blank to clear.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-client-status"
              className="block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="edit-client-status"
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
            <p className="mt-1 text-xs text-slate-400">
              Set to “Churned” to stop working with a client while keeping their history.
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {/* Remove (hard delete) — separated and clearly destructive. */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          {confirmRemove ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                Permanently remove {client.name}?
              </p>
              <p className="mt-1 text-xs text-red-700">
                This also deletes all of their logged check-ins. This can&apos;t be undone. To
                keep the history, set the status to “Churned” instead.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={remove}
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? "Removing…" : "Yes, remove"}
                </button>
                <button
                  onClick={() => setConfirmRemove(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Keep client
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRemove(true)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              Remove client…
            </button>
          )}
        </div>

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
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
