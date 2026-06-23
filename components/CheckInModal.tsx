"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TYPE_META, todayISO, type CheckInType, type Client } from "@/lib/metrics";

const TYPES: CheckInType[] = ["proactive", "reactive", "onboarding"];

// Check-in dialog. Both the nav-bar "Log check-in" button and the clickable
// calendar cells render this; they mount it (with a key) to open it and pass
// different defaults. Mounting fresh per open seeds the form from those defaults.
export default function CheckInModal({
  onClose,
  clients,
  defaultClientId,
  defaultDate,
  defaultType = "proactive",
}: {
  onClose: () => void;
  clients: Pick<Client, "id" | "name">[];
  defaultClientId?: string;
  defaultDate?: string;
  defaultType?: CheckInType;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [type, setType] = useState<CheckInType>(defaultType);
  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");

  async function submit() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("check_ins").insert({
      client_id: clientId,
      occurred_on: date,
      type,
      topic: topic.trim() || null,
      notes: notes.trim() || null,
    });
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
        <h2 className="text-lg font-semibold text-slate-900">Log a check-in</h2>

        <label className="mt-4 block text-sm font-medium text-slate-700">Client</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-medium text-slate-700">Type</label>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm ${
                type === t
                  ? "border-brand bg-brand text-white"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${TYPE_META[t].dot}`} />
              {TYPE_META[t].label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700">Date</label>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Topic <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Sync issue, portal login"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Notes <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !clientId}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save check-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
