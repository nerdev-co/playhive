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
      setMessage("Profile saved");
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
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  if (!isLoggedIn()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-gray-500">Sign in or continue as guest to view your profile.</p>
        <div className="flex gap-3">
          <button
            onClick={handleGuestLogin}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Continue as Guest
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Back
          </button>
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>

      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl overflow-hidden">
          {avatar ? (
            <img src={avatar} alt="avatar" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="text-gray-400">{displayName?.[0]?.toUpperCase() ?? "?"}</span>
          )}
        </div>
        <div>
          <p className="font-medium">{displayName || "Guest Player"}</p>
          <p className="text-sm text-gray-500">@{username}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Username</label>
          <input
            value={username}
            disabled
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
          />
          <p className="mt-1 text-[10px] text-gray-400">Username cannot be changed</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Avatar URL</label>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
