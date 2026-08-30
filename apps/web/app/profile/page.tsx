"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser, updateProfile, logout, isLoggedIn, guestLogin } from "@/lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    if (user) {
      setUsername(user.username);
      setDisplayName(user.displayName);
      setAvatar(user.avatar ?? "");
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      const res = await guestLogin();
      setUsername(res.user.username);
      setDisplayName(res.user.displayName);
      setAvatar(res.user.avatar ?? "");
    } catch {
      setMessage("Could not connect to server");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({ displayName, avatar: avatar || undefined });
      setMessage("Saved");
    } catch {
      setMessage("Failed to save");
    }
    setSaving(false);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  if (!isLoggedIn()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6">
        <h1 className="text-lg font-semibold text-white">Profile</h1>
        <p className="text-sm text-neutral-500">Sign in to view your profile.</p>
        <div className="flex gap-2">
          <button
            onClick={handleGuestLogin}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98]"
          >
            Play as Guest
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
          >
            Back
          </button>
        </div>
        {message && <p className="text-xs text-red-400">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xs px-6 py-16">
      <div className="animate-fade-in mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-lg font-semibold text-neutral-300 overflow-hidden">
          {avatar ? (
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            displayName?.[0]?.toUpperCase() ?? "?"
          )}
        </div>
        <h1 className="text-sm font-semibold text-white">{displayName || "Guest"}</h1>
        <p className="text-[11px] text-neutral-500">@{username}</p>
      </div>

      <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSave(); }} className="animate-fade-in-up delay-1 space-y-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-neutral-500">Username</label>
          <input
            value={username}
            disabled
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-neutral-500">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neutral-700"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-neutral-500">Avatar URL</label>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-neutral-700"
          />
        </div>

        {message && (
          <p className={`text-xs ${message === "Saved" ? "text-emerald-400" : "text-red-400"}`}>
            {message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-indigo-500 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
          >
            Log out
          </button>
        </div>
      </form>
    </div>
  );
}
