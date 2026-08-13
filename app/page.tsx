export default async function Home() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let edgeFunctionStatus = "❌ Ikke testet";

  if (supabaseUrl && supabaseKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ofa-app`,
        {
          headers: {
            apikey: supabaseKey,
          },
          cache: "no-store",
        }
      );

      edgeFunctionStatus = response.ok
        ? `✅ Kontakt OK (${response.status})`
        : `❌ Feil (${response.status})`;
    } catch {
      edgeFunctionStatus = "❌ Kunne ikke kontakte Supabase";
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold">Open Farm Assistant</h1>
          <p className="mt-2 text-zinc-400">
            OFA v0.1
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-xl font-semibold">Systemstatus</h2>

          <div className="mt-4 space-y-3 text-sm">
            <p>
              Vercel: ✅ kjører
            </p>

            <p>
              Supabase URL:{" "}
              {supabaseUrl ? "✅ funnet" : "❌ mangler"}
            </p>

            <p>
              Supabase key:{" "}
              {supabaseKey ? "✅ funnet" : "❌ mangler"}
            </p>

            <p>
              OFA backend: {edgeFunctionStatus}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}