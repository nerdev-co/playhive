"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button, Card, Badge } from "@playhive/ui";
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
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-foreground">Match History</h1>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        </div>
      )}

      {error && (
        <Card className="border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </Card>
      )}

      {!loading && !error && matches.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted">No matches played yet.</p>
          <Link href="/lobby">
            <Button size="sm">Start a game</Button>
          </Link>
        </Card>
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
            <Card key={match.id} hoverable className="flex items-center justify-between p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-foreground capitalize">{match.game}</h2>
                  <Badge variant="default">{resultLabel}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{date} · {match.seats.length} players</p>
              </div>
              <Link href={`/history/${match.id}`}>
                <Button size="sm" variant="secondary">Replay</Button>
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
