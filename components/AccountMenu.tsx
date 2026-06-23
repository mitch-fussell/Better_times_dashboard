"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Shows the signed-in user's name (falls back to email), and lets them rename
// themselves or sign out. The name lives in Supabase auth user metadata as
// `display_name`, set when the account is created and editable here.
export default function AccountMenu() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setEmail(u.email ?? "");
      const dn = (u.user_metadata?.display_name as string | undefined) ?? "";
      setName(dn);
      setDraft(dn);
    });
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    const next = draft.trim();
    const { error } = await supabase.auth.updateUser({
      data: { display_name: next || null },
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setName(next);
    setOpen(false);
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const label = name || email || "Account";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            <label className="block text-xs font-medium text-slate-500">Your name</label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Mitch"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.trim() === name}
              className="mt-2 w-full rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save name"}
            </button>

            {email && (
              <p className="mt-3 truncate text-xs text-slate-400" title={email}>
                {email}
              </p>
            )}
            <div className="my-2 border-t border-slate-100" />
            <button
              type="button"
              onClick={signOut}
              className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
