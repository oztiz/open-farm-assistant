"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email?: string;
  };
};

type UploadResult = {
  ok?: boolean;
  error?: string;
  memory?: { id: string; title: string };
  storage_path?: string;
  entity_id?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SESSION_KEY = "ofa_session";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [scopeKey, setScopeKey] = useState("Tråd for Navara");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      setSession(JSON.parse(saved));
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canUpload = useMemo(
    () => !!session && !!file && !busy,
    [session, file, busy]
  );

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.msg || "Innlogging feilet");

      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      setSession(data);
      setPassword("");
      setMessage("Innlogget.");
    } catch (err) {
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setFile(null);
    setPreview(null);
    setMessage("Logget ut.");
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!session || !file) return;

    setBusy(true);
    setMessage("Laster opp til OFA…");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope_key", scopeKey);
      form.append("title", title.trim() || file.name);
      form.append("content", note.trim() || `Bilde/vedlegg lastet opp fra OFA frontend: ${file.name}`);
      form.append("occurred_at", new Date().toISOString());
      form.append("importance", "3");

      const res = await fetch(`${supabaseUrl}/functions/v1/ofa-upload`, {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: form,
      });

      const data: UploadResult = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setMessage(
        `✅ Lagret i OFA${data.memory?.title ? `: ${data.memory.title}` : ""}`
      );
      setFile(null);
      setPreview(null);
      setTitle("");
      setNote("");
    } catch (err) {
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#f5f5f5",
        fontFamily: "system-ui, sans-serif",
        padding: "28px 18px",
      }}
    >
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ fontSize: 32, marginBottom: 4 }}>Open Farm Assistant</h1>
        <p style={{ color: "#a3a3a3", marginTop: 0 }}>
          OFA bildearkiv
        </p>

        {!session ? (
          <form
            onSubmit={login}
            style={{
              display: "grid",
              gap: 12,
              marginTop: 28,
              padding: 20,
              border: "1px solid #262626",
              borderRadius: 16,
            }}
          >
            <h2 style={{ margin: 0 }}>Logg inn</h2>
            <input
              type="email"
              placeholder="E-post"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Passord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
            <button disabled={busy} style={buttonStyle}>
              {busy ? "Logger inn…" : "Logg inn"}
            </button>
          </form>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                margin: "20px 0",
              }}
            >
              <span style={{ color: "#a3a3a3" }}>
                Innlogget {session.user.email ? `som ${session.user.email}` : ""}
              </span>
              <button onClick={logout} style={secondaryButtonStyle}>
                Logg ut
              </button>
            </div>

            <form
              onSubmit={upload}
              style={{
                display: "grid",
                gap: 14,
                padding: 20,
                border: "1px solid #262626",
                borderRadius: 16,
              }}
            >
              <label>
                <div style={labelStyle}>Prosjekt / tråd</div>
                <select
                  value={scopeKey}
                  onChange={(e) => setScopeKey(e.target.value)}
                  style={inputStyle}
                >
                  <option>Tråd for Navara</option>
                </select>
              </label>

              <label>
                <div style={labelStyle}>Ta bilde eller velg bilde</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  style={{ ...inputStyle, padding: 10 }}
                />
              </label>

              {preview && (
                <img
                  src={preview}
                  alt="Forhåndsvisning"
                  style={{
                    width: "100%",
                    maxHeight: 360,
                    objectFit: "contain",
                    borderRadius: 12,
                    background: "#111",
                  }}
                />
              )}

              <label>
                <div style={labelStyle}>Tittel (valgfritt)</div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="F.eks. Navara – venstre bakaksel"
                  style={inputStyle}
                />
              </label>

              <label>
                <div style={labelStyle}>Notat (valgfritt)</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Hva viser bildet?"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>

              <button disabled={!canUpload} style={buttonStyle}>
                {busy ? "Lagrer…" : "Lagre bilde i OFA"}
              </button>
            </form>
          </>
        )}

        {message && (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 12,
              background: "#171717",
              whiteSpace: "pre-wrap",
            }}
          >
            {message}
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 6,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #404040",
  background: "#171717",
  color: "#f5f5f5",
  fontSize: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#d4d4d4",
};

const buttonStyle: React.CSSProperties = {
  padding: "13px 16px",
  borderRadius: 10,
  border: 0,
  fontWeight: 700,
  fontSize: 16,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #404040",
  background: "#171717",
  color: "#f5f5f5",
  cursor: "pointer",
};