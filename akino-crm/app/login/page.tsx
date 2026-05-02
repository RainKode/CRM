"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "signup") {
      if (!fullName.trim()) {
        setError("Full name is required.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName.trim(),
          },
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email for a confirmation link.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        window.location.href = "/";
      }
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-accent) text-(--color-accent-fg) font-bold text-2xl">
            R
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-(--color-fg)">
            Rainhub
          </h1>
          <p className="mt-1 text-sm font-medium text-(--color-fg-subtle) tracking-wide">
            CRM
          </p>
          <p className="mt-2 text-sm text-(--color-fg-muted)">
            {mode === "login"
              ? "Sign in to your account"
              : "Create a new account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-12 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:ring-1 focus:ring-(--color-blue) focus:outline-none transition-all"
                placeholder="John Doe"
              />
            </div>
          )}
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:ring-1 focus:ring-(--color-blue) focus:outline-none transition-all"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-(--color-fg-subtle)">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border-0 bg-(--color-surface-2) px-4 text-sm text-(--color-fg) placeholder:text-(--color-fg-disabled) focus:ring-1 focus:ring-(--color-blue) focus:outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-(--color-danger)">{error}</p>
          )}
          {message && (
            <p className="text-sm text-(--color-success)">{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-full bg-(--color-accent) text-sm font-bold text-(--color-accent-fg) transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "Loading…"
              : mode === "login"
              ? "Sign In"
              : "Sign Up"}
          </button>
        </form>

        <p className="text-center text-sm text-(--color-fg-subtle)">
          {mode === "login" ? (
            <>
              No account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setMessage(null);
                }}
                className="text-(--color-accent-text) font-medium hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setMessage(null);
                }}
                className="text-(--color-accent-text) font-medium hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
