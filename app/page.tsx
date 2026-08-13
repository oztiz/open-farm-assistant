
export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold">Open Farm Assistant</h1>
          <p className="mt-2 text-zinc-400">
            OFA er koblet til Vercel og klar for Supabase.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Systemstatus</h2>

          <div className="mt-4 space-y-2 text-sm">
            <p>
              Supabase URL:{" "}
              {process.env.NEXT_PUBLIC_SUPABASE_URL ? "✅ funnet" : "❌ mangler"}
            </p>

            <p>
              Supabase key:{" "}
              {process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
                ? "✅ funnet"
                : "❌ mangler"}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}