"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      // Cookies are set by the browser client; navigate and let the server
      // re-render now that we're authenticated.
      router.push("/");
      router.refresh();
      return;
    }

    // Create-account mode. The nickname is stored on the user's profile
    // metadata; they can change it later from the nav bar.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name.trim() || null } },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off — the new account is signed in immediately.
      router.push("/");
      router.refresh();
      return;
    }
    // Email confirmation is on — the account exists but must be confirmed first.
    setMode("signin");
    setPassword("");
    setNotice(
      "Account created. Check that email for a confirmation link, then sign in."
    );
  }

  const isSignup = mode === "signup";

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <span className="mb-6 flex items-center justify-center rounded-lg bg-brand px-3 py-2">
          <Image
            src="/bettertimes-logo.png"
            alt="BetterTimes"
            width={302}
            height={98}
            priority
            className="h-8 w-auto"
          />
        </span>

        <h1 className="text-lg font-semibold text-slate-900">
          {isSignup ? "Create account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSignup
            ? "Set an email and password for the new user."
            : "Enter your email and password to access the dashboard."}
        </p>

        {isSignup && (
          <>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Name <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mitch"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </>
        )}

        <label className="mt-4 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-600">{notice}</p>}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="mt-6 w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading
            ? isSignup
              ? "Creating…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? "signin" : "signup");
            setError(null);
            setNotice(null);
          }}
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          {isSignup ? "Already have an account? Sign in" : "Create a new account"}
        </button>
      </form>
    </main>
  );
}
