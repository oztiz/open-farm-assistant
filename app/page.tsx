"use client";

import { useEffect, useState } from "react";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email?: string;
  };
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ofa_session");
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch {
        localStorage.removeItem("ofa_session");
      }
    }
  }, []);

  async function login() {
    setLoading(true);
    setStatus("Logger inn...");

    try {
      const response = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(`Innlogging feilet: ${data.error_description ?? data.msg ?? "ukjent feil"}`);
        return;
      }

      localStorage.setItem("ofa_session", JSON.stringify(data));
      setSession(data);
      setStatus("✅ Innlogget");
    } catch {
      setStatus("Innlogging feilet.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("ofa_session");
    setSession(null);
    setStatus("Logget ut");
  }

  async function remember() {
    if (!session) {
      setStatus("Du må være innlogget.");
      return;
    }

    if (!memoryText.trim()) {
      setStatus("Skriv noe OFA skal huske først.");
      return;
    }

    setLoading(true);
    setStatus("Lagrer og strukturerer...");

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/ofa-remember`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: memoryText.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatus(`Feil: ${data.error ?? `HTTP ${response.status}`}`);
        return;
      }

      setStatus(
        `✅ Lagret\n\n${data.extracted?.title ?? ""}\n${data.extracted?.summary ?? ""}`
      );

      setMemoryText("");
    } catch {
      setStatus("Kunne ikke kontakte OFA-backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <div>
          <h1 className="text-4xl font-bold">Open Farm Assistant</h1>
          <p className="mt-2 text-zinc-400">OFA v0.2 — minneklient</p>
        </div>

        {!session ? (
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
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
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
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

            <textarea
              className="min-h-40 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3"
              placeholder="Hva skal OFA huske?"
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
            />

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