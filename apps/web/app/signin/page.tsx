"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signin } from "@/lib/auth";

export default function SigninPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signin({ username, password });
      router.push("/lobby");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="animate-fade-in mb-8 text-center">
          <h1 className="text-lg font-semibold text-white">Sign in to PlayHive</h1>
          <p className="mt-1.5 text-xs text-neutral-500">Welcome back</p>
        </div>

        <form onSubmit={handleSubmit} className="animate-fade-in-up delay-1 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-neutral-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-neutral-700"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="animate-fade-in delay-2 mt-6 space-y-2 text-center text-xs text-neutral-500">
          <p>
            No account?{" "}
            <Link href="/signup" className="text-neutral-300 transition-colors hover:text-white">
              Sign up
            </Link>
          </p>
          <p>
            Or{" "}
            <Link href="/lobby" className="text-neutral-300 transition-colors hover:text-white">
              play as guest
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
