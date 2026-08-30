"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Match {
  id: string;
  game: string;
  status: string;
  result: string | null;
  seats: { playerId: string }[];
  startedAt: string | null;
  finishedAt: string | null;
}

export default function HistoryPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/matches?limit=50`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setMatches(data.matches ?? []);
      } catch {
        setError("Could not load match history");
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Match History</h1>

      {loading && <p className="text-gray-400">Loading...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-400">No matches played yet.</p>
          <Link href="/lobby" className="mt-3 inline-block text-sm font-medium text-black underline">
            Start a game
          </Link>
        </div>
      )}

      <div className="grid gap-3">
        {matches.map((match) => {
          const date = match.startedAt ? new Date(match.startedAt).toLocaleDateString() : "—";
          const resultLabel = match.status === "finished"
            ? match.result === "draw"
              ? "Draw"
              : match.result === "white"
                ? "White wins"
                : match.result === "black"
                  ? "Black wins"
                  : match.status
            : match.status;

          return (
            <div key={match.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-medium capitalize">{match.game}</h2>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                    {resultLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{date} · {match.seats.length} players</p>
              </div>
              <Link
                href={`/history/${match.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium transition hover:bg-gray-50"
              >
                Replay
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
