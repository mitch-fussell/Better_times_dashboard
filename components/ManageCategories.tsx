"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TYPE_META, type Category } from "@/lib/metrics";

// The three seeded categories the dashboard's metrics/risk logic depend on by
// slug (lib/metrics.ts). They can be recoloured/renamed but not deleted, or the
// dashboard would lose those counts.
const BUILTIN_SLUGS = new Set(Object.keys(TYPE_META));

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
  // The category the user is confirming deletion of, plus how many check-ins use
  // it (null while we're still counting) and whether the delete is in flight.
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [confirmUses, setConfirmUses] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function edit(slug: string, patch: Partial<Category>) {
    setRows((prev) => prev.map((r) => (r.slug === slug ? { ...r, ...patch } : r)));
  }

  // Open the delete confirmation for a category and look up how many check-ins
  // reference it, so the warning can spell out what will also be removed.
  async function askDelete(slug: string) {
    setError(null);
    setConfirmSlug(slug);
    setConfirmUses(null);
    const { count, error } = await supabase
      .from("check_ins")
      .select("id", { count: "exact", head: true })
      .eq("type", slug);
    if (error) {
      setError(error.message);
      setConfirmSlug(null);
      return;
    }
    setConfirmUses(count ?? 0);
  }

  // Delete a category. There's no FK from check_ins.type to check_in_types, so
  // deleting the category would otherwise orphan its check-ins (they'd vanish
  // from the grid but linger in the table). We delete those check-ins first, so
  // the removal is honest — matching the "remove client" cascade in EditClient.
  async function doDelete(slug: string) {
    setDeleting(true);
    setError(null);
    const { error: checkInsError } = await supabase.from("check_ins").delete().eq("type", slug);
    if (checkInsError) {
      setError(checkInsError.message);
      setDeleting(false);
      return;
    }
    const { error: typeError } = await supabase.from("check_in_types").delete().eq("slug", slug);
    setDeleting(false);
    if (typeError) {
      setError(typeError.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.slug !== slug));
    setConfirmSlug(null);
    router.refresh();
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
          {rows.map((r) => {
            const isBuiltin = BUILTIN_SLUGS.has(r.slug);
            return (
              <div key={r.slug}>
                <div className="flex items-center gap-3">
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
                  {isBuiltin ? (
                    <span
                      title="Built-in category — can't be deleted"
                      className="flex h-8 w-8 items-center justify-center text-slate-300"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path
                          fillRule="evenodd"
                          d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askDelete(r.slug)}
                      disabled={deleting}
                      title={`Delete ${r.label}`}
                      aria-label={`Delete ${r.label}`}
                      className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482 41.03 41.03 0 00-2.365-.298V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {confirmSlug === r.slug && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    {confirmUses === null ? (
                      <p className="text-sm text-red-700">Checking usage…</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-red-800">
                          Delete “{r.label}”?
                        </p>
                        <p className="mt-1 text-xs text-red-700">
                          {confirmUses === 0
                            ? "This category has no logged check-ins."
                            : `It's used by ${confirmUses} logged ${
                                confirmUses === 1 ? "check-in" : "check-ins"
                              }, which will also be permanently deleted. This can't be undone.`}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => doDelete(r.slug)}
                            disabled={deleting}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting ? "Deleting…" : "Delete"}
                          </button>
                          <button
                            onClick={() => setConfirmSlug(null)}
                            disabled={deleting}
                            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
