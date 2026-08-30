import Link from "next/link";

const GAMES = [
  {
    id: "chess",
    name: "Chess",
    description: "The game of kings. Challenge friends or bots in real-time matches with full PGN support.",
    icon: "♔",
    players: "2",
    color: "from-amber-900/40 to-amber-700/20",
    borderColor: "border-amber-800/30",
  },
  {
    id: "ludo",
    name: "Ludo",
    description: "Classic race to the finish. Roll dice, capture opponents, and race your tokens home.",
    icon: "🎲",
    players: "2-4",
    color: "from-emerald-900/40 to-emerald-700/20",
    borderColor: "border-emerald-800/30",
  },
] as const;

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.07] blur-[120px]" />
          <div className="absolute right-1/4 top-2/3 h-[400px] w-[400px] rounded-full bg-indigo-500/[0.05] blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-amber-500/80">
            Real-time board games
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl md:text-8xl">
            Play
            <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
              Hive
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-neutral-400">
            Challenge friends to chess and ludo in real time. Built-in AI, matchmaking, and voice chat.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/lobby"
              className="rounded-lg bg-white px-6 py-3 text-sm font-medium text-black transition-all hover:bg-neutral-200 active:scale-[0.98]"
            >
              Enter Lobby
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-300 transition-all hover:border-neutral-500 hover:text-white active:scale-[0.98]"
            >
              Create Account
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <div className="h-5 w-3 rounded-full border border-neutral-600 p-1">
            <div className="mx-auto h-1.5 w-1 animate-bounce rounded-full bg-neutral-500" />
          </div>
        </div>
      </section>

      {/* Games */}
      <section className="mx-auto max-w-5xl px-6 py-32">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-amber-500/80">
          Available Now
        </p>
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Pick your game
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              href="/lobby"
              className={`group relative overflow-hidden rounded-xl border ${game.borderColor} bg-gradient-to-br ${game.color} p-8 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl`}
            >
              <div className="mb-6 text-5xl">{game.icon}</div>
              <h3 className="text-xl font-semibold text-white">{game.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                {game.description}
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs text-neutral-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                {game.players} players
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-32">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            { title: "Real-time", desc: "Instant move sync. No lag, no reload." },
            { title: "Voice Chat", desc: "Talk to your opponent while you play." },
            { title: "Match History", desc: "Replay every game. Track your rating." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
              <h3 className="text-sm font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-neutral-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-12">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-neutral-600">
          PlayHive &mdash; Real-time board games
        </div>
      </footer>
    </main>
  );
}
