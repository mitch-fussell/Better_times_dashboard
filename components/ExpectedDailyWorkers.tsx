"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Inline-editable "Expected daily workers" cell for the dashboard table. The
// number isn't derived from anything — the user types it in and can change it any
// time, so the cell doubles as both the display and the editor: click to edit,
// type a number (or clear it to mean "not set"), save writes straight to the
// client row. The calendar tab shows and edits the same
// clients.expected_daily_workers value, so the two tabs always stay in sync.
export default function ExpectedDailyWorkers({
  clientId,
  value,
}: {
  clientId: string;
  value: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Kept as a string so the field can be emptied (= "not set" / null).
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (trimmed !== "" && !Number.isFinite(next as number)) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    const { error } = await supabase
      .from("clients")
      .update({ expected_daily_workers: next })
      .eq("id", clientId);
    setSaving(false);
    if (error) {
      setError(true);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setDraft(value === null ? "" : String(value));
    setError(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={draft}
          autoFocus
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          placeholder="—"
          className={`w-16 rounded-lg border px-2 py-1 text-sm ${
            error ? "border-red-400" : "border-slate-300"
          }`}
        />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md px-1.5 py-1 text-xs font-medium text-brand hover:bg-slate-100 disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
        <button
          onClick={cancel}
          disabled={saving}
          className="rounded-md px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit expected daily workers"
      className="group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-slate-100"
    >
      {value === null ? (
        <span className="text-slate-400 group-hover:text-slate-600">Add</span>
      ) : (
        <span className="font-medium text-slate-900">{value}</span>
      )}
      <span className="text-slate-300 group-hover:text-slate-500" aria-hidden>
        ✎
      </span>
    </button>
  );
}
