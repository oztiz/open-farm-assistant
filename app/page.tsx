"use client";

import { useEffect, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login() {
    setLoading(true);
    setStatus("Logger inn...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(`Innlogging feilet: ${error.message}`);
    } else {
      setStatus("✅ Innlogget");
    }

    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setStatus("Logget ut");
  }

  async function remember() {
    if (!memoryText.trim()) {
      setStatus("Skriv noe OFA skal huske først.");
      return;
    }

    setLoading(true);
    setStatus("Lagrer og strukturerer...");

    const { data, error } = await supabase.functions.invoke("ofa-remember", {
      body: {
        text: memoryText.trim(),
      },
    });

    if (error) {
      setStatus(`Feil: ${error.message}`);
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      setStatus(`Feil: ${data?.error ?? "Ukjent feil"}`);
      setLoading(false);
      return;
    }

    setStatus(
      `✅ Lagret\n\n${data.extracted?.title ?? ""}\n${data.extracted?.summary ?? ""}`
    );

    setMemoryText("");
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <div>
          <h1 className="text-4xl font-bold">Open Farm Assistant</h1>
          <p className="mt-2 text-zinc-400">OFA v0.2 — minneklient</p>
        </div>

        {!session ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-xl font-semibold">Logg inn</h2>

            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3"
              type="email"
              placeholder="E-post"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3"
              type="password"
              placeholder="Passord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black disabled:opacity-50"
              onClick={login}
              disabled={loading}
            >
              Logg inn
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-zinc-400">Innlogget som</div>
                <div>{session.user.email}</div>
              </div>

              <button
                className="rounded-xl bg-zinc-800 px-4 py-2"
                onClick={logout}
              >
                Logg ut
              </button>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-400">
                Hva skal OFA huske?
              </label>

              <textarea
                className="min-h-40 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3"
                placeholder="Eksempel: Byttet servo-olje på Navara i dag, brukte 2,5 liter ATF."
                value={memoryText}
                onChange={(e) => setMemoryText(e.target.value)}
              />
            </div>

            <button
              className="w-full rounded-xl bg-amber-400 p-3 font-bold text-black disabled:opacity-50"
              onClick={remember}
              disabled={loading}
            >
              Husk dette
            </button>
          </div>
        )}

        {status && (
          <div className="whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm">
            {status}
          </div>
        )}
      </div>
    </main>
  );
}