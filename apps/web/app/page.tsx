import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <main className="mx-auto max-w-lg text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">PlayHive</h1>
        <p className="mt-3 text-gray-500">Real-time board games with friends.</p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/lobby"
            className="rounded-lg bg-black px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
          >
            Enter Lobby
          </Link>
          <Link
            href="/signin"
            className="rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Create Account
          </Link>
        </div>
      </main>
    </div>
  );
}
