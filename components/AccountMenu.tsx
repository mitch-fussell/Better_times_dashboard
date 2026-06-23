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

  // Change-password sub-panel state.
  const [pwOpen, setPwOpen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

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

  async function changePassword() {
    setPwError(null);
    setPwDone(false);
    if (pw1.length < 6) {
      setPwError("Password must be at least 6 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setPwError("Passwords don't match.");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setPwSaving(false);
    if (error) {
      setPwError(error.message);
      return;
    }
    setPw1("");
    setPw2("");
    setPwOpen(false);
    setPwDone(true);
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

            {!pwOpen ? (
              <button
                type="button"
                onClick={() => {
                  setPwOpen(true);
                  setPwDone(false);
                  setPwError(null);
                }}
                className="w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                Change password
              </button>
            ) : (
              <div className="rounded-lg bg-slate-50 p-2">
                <label className="block text-xs font-medium text-slate-500">New password</label>
                <input
                  type="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 6 characters"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                {pwError && <p className="mt-2 text-xs text-red-600">{pwError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={pwSaving || !pw1 || !pw2}
                    className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {pwSaving ? "Updating…" : "Update password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPwOpen(false);
                      setPw1("");
                      setPw2("");
                      setPwError(null);
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {pwDone && <p className="mt-2 text-xs text-emerald-600">Password updated.</p>}

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
