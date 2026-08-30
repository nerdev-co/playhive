import Link from "next/link";

export default function Home() {
  return (
    <main className="overflow-hidden">
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/4 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-500/[0.06] blur-[100px]" />
          <div className="absolute bottom-1/4 left-1/3 h-[300px] w-[300px] rounded-full bg-amber-500/[0.05] blur-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="animate-fade-in mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 px-4 py-1.5 text-xs text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live now
          </div>

          <h1 className="animate-fade-in-up delay-1 text-5xl font-bold tracking-tight text-white sm:text-7xl">
            Play
            <span className="bg-gradient-to-r from-indigo-400 to-indigo-300 bg-clip-text text-transparent">
              Hive
            </span>
          </h1>

          <p className="animate-fade-in-up delay-2 mx-auto mt-5 max-w-lg text-base text-neutral-400">
            Challenge friends to chess and ludo in real time. Built-in AI, voice chat, and match history.
          </p>

          <div className="animate-fade-in-up delay-3 mt-8 flex items-center justify-center gap-3">
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

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in delay-5">
          <div className="h-4 w-3 rounded-full border border-neutral-700 p-0.5">
            <div className="mx-auto h-1 w-1 animate-bounce rounded-full bg-neutral-600" />
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="mx-auto max-w-4xl px-6 py-28">
        <div className="animate-fade-in">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-indigo-400">
            Available Now
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            Pick your game
          </h2>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {/* Chess */}
          <Link
            href="/lobby"
            className="animate-fade-in-up delay-1 group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 transition-all duration-200 ease-[var(--ease-out)] hover:border-amber-800/50 hover:bg-neutral-900/80"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-xl">
                ♔
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Chess</h3>
                <p className="text-xs text-neutral-500">2 players</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-neutral-400">
              The game of kings. Real-time matches with full PGN support and AI opponent.
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
            className="animate-fade-in-up delay-2 group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-6 transition-all duration-200 ease-[var(--ease-out)] hover:border-emerald-800/50 hover:bg-neutral-900/80"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-xl">
                🎲
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Ludo</h3>
                <p className="text-xs text-neutral-500">2-4 players</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-neutral-400">
              Classic race to the finish. Roll dice, capture opponents, race home.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600 transition-colors group-hover:text-emerald-500/80">
              Play now
              <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-4xl px-6 pb-28">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { title: "Real-time", desc: "Instant move sync. No lag.", accent: "bg-indigo-500" },
            { title: "Voice Chat", desc: "Talk while you play.", accent: "bg-emerald-500" },
            { title: "History", desc: "Replay every game.", accent: "bg-amber-500" },
          ].map((f, i) => (
            <div
              key={f.title}
              className={`animate-fade-in-up delay-${i + 2} rounded-xl border border-neutral-800 bg-neutral-900/50 p-5`}
            >
              <div className={`mb-3 h-0.5 w-8 rounded-full ${f.accent}`} />
              <h3 className="text-sm font-medium text-white">{f.title}</h3>
              <p className="mt-1 text-xs text-neutral-500">{f.desc}</p>
            </div>
          ))}
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
