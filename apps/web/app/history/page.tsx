"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function HistoryPage() {
  const [matches, setMatches] = useState<
    { id: string; gameType: string; result: string; date: string }[]
  >([]);

  useEffect(() => {
    setMatches([
      { id: "1", gameType: "chess", result: "white", date: "2026-08-30" },
      { id: "2", gameType: "ludo", result: "draw", date: "2026-08-29" },
    ]);
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Match History</h1>
      {matches.length === 0 ? (
        <p className="text-gray-500">No matches played yet.</p>
      ) : (
        <div className="grid gap-4">
          {matches.map((match) => (
            <div key={match.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium capitalize">{match.gameType}</h2>
                  <p className="text-sm text-gray-500">{match.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs capitalize">
                    {match.result}
                  </span>
                  <Link
                    href={`/history/${match.id}`}
                    className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
                  >
                    Replay
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
