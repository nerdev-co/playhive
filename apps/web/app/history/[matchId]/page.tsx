"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { authHeaders, getUser } from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface MatchInfo {
  id: string;
  game: string;
  status: string;
  seats: { playerId: string; seat: number; bot?: boolean }[];
  result: { winner?: string; reason?: string } | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface GameEvent {
  id: number;
  matchId: string;
  version: number;
  seat: number | null;
  event: Record<string, unknown>;
  playerId: string | null;
  createdAt: string;
}

function formatEvent(event: Record<string, unknown>, game: string): string {
  if (game === "chess") {
    const type = event.type as string | undefined;
    if (type === "MOVE") {
      const from = event.from as string;
      const to = event.to as string;
      const piece = event.piece as string | undefined;
      return piece ? `${piece} ${from}→${to}` : `${from}→${to}`;
    }
    if (type === "DRAW_OFFER") return "Draw offered";
    if (type === "DRAW_ACCEPT") return "Draw accepted";
    if (type === "RESIGN") return "Resigned";
    if (type === "TIMEOUT") return "Timeout";
    return type ?? JSON.stringify(event);
  }
  if (game === "ludo") {
    const type = event.type as string | undefined;
    if (type === "ROLL_DICE") return `Rolled ${(event.distance as number) ?? "?"}`;
    if (type === "MOVE_TOKEN") return `Token ${event.tokenIndex as number ?? "?"} → ${(event.to as string) ?? "?"}`;
    return type ?? JSON.stringify(event);
  }
  return JSON.stringify(event);
}

export default function MatchReplayPage({ params }: { params: Promise<{ matchId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const matchId = resolvedParams.matchId;

  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/matches/${matchId}/replay`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setMatch(data.match);
        setEvents(data.events ?? []);
      } catch {
        setError("Could not load match replay");
      }
      setLoading(false);
    })();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-neutral-500">{error ?? "Match not found"}</p>
        <button
          onClick={() => router.push("/history")}
          className="rounded-lg border border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
        >
          Back to history
        </button>
      </div>
    );
  }

  const resultLabel = (() => {
    if (!match.result) return match.status;
    if (match.result.reason === "draw" || !match.result.winner) return "Draw";
    return `${match.result.winner} wins`;
  })();

  const started = match.startedAt ? new Date(match.startedAt) : null;
  const finished = match.finishedAt ? new Date(match.finishedAt) : null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <button
        onClick={() => router.push("/history")}
        className="mb-6 text-xs text-neutral-500 transition-colors hover:text-white"
      >
        ← Back to history
      </button>

      <div className="animate-fade-in mb-8 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white capitalize">{match.game} Match</h1>
            <p className="mt-1 text-xs text-neutral-500">
              {started?.toLocaleDateString()} · {match.seats.length} players
            </p>
          </div>
          <span className="rounded-md bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300">
            {resultLabel}
          </span>
        </div>
        {match.result?.reason && match.result.winner && (
          <p className="mt-2 text-xs text-neutral-400">Reason: {match.result.reason}</p>
        )}
        {finished && started && (
          <p className="mt-1 text-[10px] text-neutral-600">
            Duration: {Math.round((finished.getTime() - started.getTime()) / 1000)}s
          </p>
        )}
      </div>

      <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-600">
        Events ({events.length})
      </h2>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-500">No events recorded.</p>
      ) : (
        <div className="space-y-1">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800/50 bg-neutral-900/30 px-3 py-2"
            >
              <span className="w-8 shrink-0 text-right text-[10px] text-neutral-600">
                {ev.version}
              </span>
              <span className="text-[10px] text-neutral-600">P{ev.seat ?? "?"}</span>
              <span className="truncate text-xs text-neutral-300">
                {formatEvent(ev.event, match.game)}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-neutral-700">
                {new Date(ev.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
