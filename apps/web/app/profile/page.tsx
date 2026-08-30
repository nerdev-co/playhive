"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser, updateProfile, logout, isLoggedIn, guestLogin } from "@/lib/auth";
import { Button, Input, Card } from "@repo/ui";

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
    }
    setLoading(false);
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    );
  }

  if (!isLoggedIn()) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
          <p className="mt-2 text-sm text-muted">Sign in or continue as guest to view your profile.</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleGuestLogin}>Continue as Guest</Button>
          <Button variant="secondary" onClick={() => router.push("/")}>Back</Button>
        </div>
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-foreground">Profile</h1>

      <Card className="mb-8 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hover text-xl font-semibold text-foreground overflow-hidden">
            {avatar ? (
              <img src={avatar} alt="avatar" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span>{displayName?.[0]?.toUpperCase() ?? "?"}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{displayName || "Guest Player"}</p>
            <p className="text-xs text-muted">@{username}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Input
          label="Username"
          value={username}
          disabled
        />
        <p className="text-[10px] text-muted -mt-3">Username cannot be changed</p>

        <Input
          label="Display Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        <Input
          label="Avatar URL"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="https://example.com/avatar.png"
        />

        {message && (
          <p className={`text-sm ${message.includes("Failed") ? "text-danger" : "text-success"}`}>
            {message}
          </p>
        )}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </Button>
          <Button variant="secondary" onClick={handleLogout}>Log Out</Button>
        </div>
      </div>
    </div>
  );
}
