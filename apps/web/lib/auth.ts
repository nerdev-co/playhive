"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  avatar: string | null;
  isGuest: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  gatewayUrl: string;
}

let cachedToken: string | null = null;
let cachedUser: User | null = null;

function getToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window === "undefined") return null;
  cachedToken = localStorage.getItem("playhive_token");
  return cachedToken;
}

function setToken(token: string): void {
  cachedToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("playhive_token", token);
  }
}

function setUser(user: User): void {
  cachedUser = user;
  if (typeof window !== "undefined") {
    localStorage.setItem("playhive_user", JSON.stringify(user));
  }
}

function getStoredUser(): User | null {
  if (cachedUser) return cachedUser;
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("playhive_user");
  if (!raw) return null;
  try {
    cachedUser = JSON.parse(raw);
    return cachedUser;
  } catch {
    return null;
  }
}

export function getUser(): User | null {
  return getStoredUser();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function guestLogin(): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/guest`, { method: "POST" });
  if (!res.ok) throw new Error("Guest login failed");
  const data: AuthResponse = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function signup(params: {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Signup failed" }));
    throw new Error(err.error ?? "Signup failed");
  }
  const data: AuthResponse = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function signin(params: {
  username: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Signin failed" }));
    throw new Error(err.error ?? "Signin failed");
  }
  const data: AuthResponse = await res.json();
  setToken(data.token);
  setUser(data.user);
  return data;
}

export async function fetchMe(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    logout();
    return null;
  }
  const data = await res.json();
  const user = data.user as User;
  setUser(user);
  return user;
}

export async function updateProfile(params: {
  displayName?: string;
  avatar?: string;
}): Promise<User> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_URL}/auth/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error("Profile update failed");
  const data = await res.json();
  const user = data.user as User;
  setUser(user);
  return user;
}

export function logout(): void {
  cachedToken = null;
  cachedUser = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("playhive_token");
    localStorage.removeItem("playhive_user");
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
