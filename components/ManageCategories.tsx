"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Category } from "@/lib/metrics";

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Add categories and recolour existing ones. Saved to check_in_types, which
// the calendar and log dialog read for their colours and labels.
export default function ManageCategories({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() => categories.map((c) => ({ ...c })));
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edit(slug: string, patch: Partial<Category>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setError(null);

    const upserts = rows.map((r) => ({
      slug: r.slug,
      label: r.label.trim() || r.slug,
      color: r.color,
      precedence: r.precedence,
    }));

    if (newLabel.trim()) {
      const slug = slugify(newLabel);
      if (!slug) {
        setSaving(false);
        setError("New category needs a name with letters or numbers.");
        return;
      }
      if (rows.some((r) => r.slug === slug)) {
        setSaving(false);
        setError(`A category named "${newLabel.trim()}" already exists.`);
        return;
      }
      const maxPrec = rows.reduce((m, r) => Math.max(m, r.precedence), 0);
      upserts.push({ slug, label: newLabel.trim(), color: newColor, precedence: maxPrec + 10 });
    }

    const { error } = await supabase.from("check_in_types").upsert(upserts, { onConflict: "slug" });
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
        <h2 className="text-lg font-semibold text-slate-900">Categories</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick a colour for each category, or add a new one.
        </p>

        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <div key={r.slug} className="flex items-center gap-3">
              <input
                type="color"
                value={r.color}
                onChange={(e) => edit(r.slug, { color: e.target.value })}
                aria-label={`${r.label} colour`}
                className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
              />
              <input
                value={r.label}
                onChange={(e) => edit(r.slug, { label: e.target.value })}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-slate-700">Add a category</label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="New category colour"
              className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Escalation"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
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
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
