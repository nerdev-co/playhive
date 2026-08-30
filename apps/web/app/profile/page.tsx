"use client";

import { useState } from "react";

export default function ProfilePage() {
  const [username, setUsername] = useState("Guest_42");
  const [displayName, setDisplayName] = useState("Guest Player");
  const [avatar, setAvatar] = useState("");

  const handleSave = () => {
    alert("Profile saved (mock)");
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Profile</h1>

      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-2xl">
          {avatar ? <img src={avatar} alt="avatar" className="h-full w-full rounded-full object-cover" /> : "👤"}
        </div>
        <div>
          <p className="font-medium">{displayName || "Guest Player"}</p>
          <p className="text-sm text-gray-500">@{username}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Avatar URL</label>
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <button
          onClick={handleSave}
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Save Profile
        </button>
      </div>
    </div>
  );
}
