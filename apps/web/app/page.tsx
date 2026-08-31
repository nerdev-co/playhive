import Link from "next/link";

function MiniChessBoard() {
  const pieces = [
    { r: 0, c: 0, p: "♜", dark: true },
    { r: 0, c: 3, p: "♚", dark: true },
    { r: 1, c: 1, p: "♟", dark: true },
    { r: 1, c: 2, p: "♟", dark: true },
    { r: 2, c: 0, p: "♙", dark: false },
    { r: 2, c: 3, p: "♕", dark: false },
    { r: 3, c: 1, p: "♙", dark: false },
    { r: 3, c: 2, p: "♖", dark: false },
  ];
  return (
    <div className="grid grid-cols-4 gap-px rounded-md bg-neutral-700/30 p-px">
      {Array.from({ length: 16 }, (_, i) => {
        const r = Math.floor(i / 4);
        const c = i % 4;
        const light = (r + c) % 2 === 0;
        const piece = pieces.find((x) => x.r === r && x.c === c);
        return (
          <div
            key={i}
            className={`flex h-5 w-5 items-center justify-center text-[10px] leading-none sm:h-6 sm:w-6 sm:text-xs ${
              light ? "bg-neutral-800" : "bg-neutral-800/60"
            }`}
          >
            {piece?.p ?? ""}
          </div>
        );
      })}
    </div>
  );
}

function MiniLudoBoard() {
  return (
    <div className="relative h-12 w-12 sm:h-14 sm:w-14">
      {/* Cross shape */}
      <div className="absolute inset-x-0 top-0 h-1/3 bg-emerald-500/20" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-emerald-500/20" />
      <div className="absolute inset-y-0 left-0 w-1/3 bg-emerald-500/20" />
      <div className="absolute inset-y-0 right-0 w-1/3 bg-emerald-500/20" />
      {/* Center */}
      <div className="absolute inset-1/3 bg-emerald-500/40" />
      {/* Home markers */}
      <div className="absolute left-0 top-0 h-1/3 w-1/3 bg-red-500/30" />
      <div className="absolute bottom-0 right-0 h-1/3 w-1/3 bg-amber-500/30" />
      {/* Token */}
      <div className="absolute left-[58%] top-[22%] h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)] sm:h-2.5 sm:w-2.5" />
    </div>
  );
}

export default function Home() {
  return (
    <main className="overflow-hidden">
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6">
        {/* Ambient gradients */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/[0.04] blur-[120px]" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-400/[0.03] blur-[120px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Play
            <span className="text-indigo-400">Hive</span>
          </h1>

          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-400">
            Chess and ludo with friends. Real-time matches, built-in AI, voice chat.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/lobby"
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98]"
            >
              Enter Lobby
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-5 py-2.5 text-sm font-medium text-neutral-300 transition-all duration-150 hover:border-neutral-600 hover:text-white active:scale-[0.98]"
            >
              Create Account
            </Link>
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="mx-auto max-w-4xl px-6 pb-28">
        <p className="mb-6 text-xs font-medium uppercase tracking-widest text-neutral-500">
          Available Now
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Chess */}
          <Link
            href="/lobby"
            className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 transition-all duration-200 ease-[var(--ease-out)] hover:border-amber-800/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Chess</h3>
                <p className="mt-0.5 text-xs text-neutral-500">2 players</p>
              </div>
              <MiniChessBoard />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Full PGN support, legal move validation, AI opponent. Real-time sync.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600 transition-colors group-hover:text-amber-500/80">
              Play now
              <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>

          {/* Ludo */}
          <Link
            href="/lobby"
            className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 transition-all duration-200 ease-[var(--ease-out)] hover:border-emerald-800/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Ludo</h3>
                <p className="mt-0.5 text-xs text-neutral-500">2-4 players</p>
              </div>
              <MiniLudoBoard />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Classic race to finish. Roll, capture, race home. Server-authoritative dice.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600 transition-colors group-hover:text-emerald-500/80">
              Play now
              <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Inline features */}
        <div className="mt-12 grid grid-cols-3 gap-6 border-t border-neutral-800/50 pt-10">
          <div>
            <div className="text-sm font-medium text-white">Real-time</div>
            <p className="mt-1 text-xs text-neutral-500">Instant move sync. No lag, no refresh.</p>
          </div>
          <div>
            <div className="text-sm font-medium text-white">Voice Chat</div>
            <p className="mt-1 text-xs text-neutral-500">WebRTC peer-to-peer. Talk while you play.</p>
          </div>
          <div>
            <div className="text-sm font-medium text-white">History</div>
            <p className="mt-1 text-xs text-neutral-500">Every match recorded. Replay any game.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800/50 py-10">
        <div className="mx-auto max-w-4xl px-6 text-center text-xs text-neutral-600">
          PlayHive
        </div>
      </footer>
    </main>
  );
}
