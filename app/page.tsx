"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Session = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: { id: string; email?: string };
};

type Memory = {
  id: string;
  occurred_at: string | null;
  recorded_at: string;
  memory_type: string;
  title: string;
  content: string;
  importance: number;
  status: string;
  source: string;
  metadata: Record<string, unknown>;
};

type Attachment = {
  id: string;
  memory_id: string;
  attachment_type: string;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
};

type TimelineItem = Memory & {
  attachments: Array<Attachment & { objectUrl?: string }>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SESSION_KEY = "ofa_session";
const NAVARA_SCOPE = "Tråd for Navara";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"history" | "images" | "upload">("history");

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try { setSession(JSON.parse(saved)); }
    catch { localStorage.removeItem(SESSION_KEY); }
  }, []);

  useEffect(() => { if (session) void loadTimeline(session); }, [session]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const imageItems = useMemo(
    () => timeline.filter((item) =>
      item.attachments.some((a) => a.attachment_type === "image" && a.objectUrl)
    ),
    [timeline]
  );

  const activeTasks = useMemo(
    () => timeline.filter((item) => item.memory_type === "task" && item.status === "active"),
    [timeline]
  );

  async function refreshSession(current: Session) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error_description || data?.msg || "Økten er utløpt");
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setSession(data);
    return data as Session;
  }

  async function authFetch(current: Session, input: string, init: RequestInit = {}) {
    const doFetch = (s: Session) => fetch(input, {
      ...init,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${s.access_token}`,
        ...(init.headers || {}),
      },
    });

    let response = await doFetch(current);
    if (response.status !== 401) return { response, session: current };

    const renewed = await refreshSession(current);
    response = await doFetch(renewed);
    return { response, session: renewed };
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.msg || "Innlogging feilet");
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      setSession(data);
      setPassword("");
      setMessage("✅ Innlogget.");
    } catch (err) {
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  }

  function logout() {
    timeline.forEach((item) =>
      item.attachments.forEach((a) => { if (a.objectUrl) URL.revokeObjectURL(a.objectUrl); })
    );
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setTimeline([]);
    setFile(null);
    setPreview(null);
    setMessage("Logget ut.");
  }

  async function loadTimeline(current = session) {
    if (!current) return;
    setLoadingTimeline(true);
    try {
      const memoryParams = new URLSearchParams({
        select: "id,occurred_at,recorded_at,memory_type,title,content,importance,status,source,metadata",
        order: "occurred_at.desc.nullslast,recorded_at.desc",
        limit: "100",
      });
      memoryParams.set("metadata->>scope_key", `eq.${NAVARA_SCOPE}`);

      const { response: memoryRes, session: activeSession } = await authFetch(
        current,
        `${supabaseUrl}/rest/v1/ofa_memories?${memoryParams.toString()}`
      );
      const memories: Memory[] = await memoryRes.json();
      if (!memoryRes.ok) throw new Error((memories as unknown as { message?: string })?.message || "Kunne ikke lese historikk");

      let attachments: Attachment[] = [];
      const ids = memories.map((m) => m.id);

      if (ids.length) {
        const attachmentParams = new URLSearchParams({
          select: "id,memory_id,attachment_type,storage_path,original_name,mime_type",
          memory_id: `in.(${ids.join(",")})`,
        });
        const { response: attachmentRes } = await authFetch(
          activeSession,
          `${supabaseUrl}/rest/v1/ofa_attachments?${attachmentParams.toString()}`
        );
        attachments = await attachmentRes.json();
        if (!attachmentRes.ok) throw new Error((attachments as unknown as { message?: string })?.message || "Kunne ikke lese vedlegg");
      }

      const oldUrls: string[] = [];
      timeline.forEach((item) =>
        item.attachments.forEach((a) => { if (a.objectUrl) oldUrls.push(a.objectUrl); })
      );

      const attachmentMap = new Map<string, Array<Attachment & { objectUrl?: string }>>();
      for (const attachment of attachments) {
        let objectUrl: string | undefined;
        if (attachment.storage_path && attachment.attachment_type === "image") {
          const encodedPath = attachment.storage_path.split("/").map(encodeURIComponent).join("/");
          const { response: imageRes } = await authFetch(
            activeSession,
            `${supabaseUrl}/storage/v1/object/authenticated/ofa-attachments/${encodedPath}`
          );
          if (imageRes.ok) {
            const blob = await imageRes.blob();
            objectUrl = URL.createObjectURL(blob);
          }
        }
        const list = attachmentMap.get(attachment.memory_id) ?? [];
        list.push({ ...attachment, objectUrl });
        attachmentMap.set(attachment.memory_id, list);
      }

      oldUrls.forEach((url) => URL.revokeObjectURL(url));

      setTimeline(memories.map((memory) => ({
        ...memory,
        attachments: attachmentMap.get(memory.id) ?? [],
      })));
    } catch (err) {
      setMessage(`Feil ved lasting: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoadingTimeline(false); }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!session || !file) return;
    setBusy(true);
    setMessage("Laster opp til OFA…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scope_key", NAVARA_SCOPE);
      form.append("title", title.trim() || file.name);
      form.append("content", note.trim() || `Bilde/vedlegg lastet opp fra OFA: ${file.name}`);
      form.append("occurred_at", new Date().toISOString());
      form.append("importance", "3");

      const { response: res, session: activeSession } = await authFetch(
        session,
        `${supabaseUrl}/functions/v1/ofa-upload`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setMessage(`✅ Lagret i OFA${data?.memory?.title ? `: ${data.memory.title}` : ""}`);
      setFile(null);
      setPreview(null);
      setTitle("");
      setNote("");
      await loadTimeline(activeSession);
      setTab("images");
    } catch (err) {
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setBusy(false); }
  }

  if (!session) {
    return (
      <Shell>
        <Header />
        <form onSubmit={login} style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Logg inn</h2>
          <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          <input type="password" placeholder="Passord" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
          <button disabled={busy} style={buttonStyle}>{busy ? "Logger inn…" : "Logg inn"}</button>
        </form>
        {message && <Status message={message} />}
      </Shell>
    );
  }

  return (
    <Shell>
      <Header />

      <div style={machineCardStyle}>
        <div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Maskinkort</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Nissan Navara D40 V9X</div>
          <div style={{ color: "#a3a3a3" }}>3.0 dCi • 2012</div>
        </div>
        <button onClick={logout} style={secondaryButtonStyle}>Logg ut</button>
      </div>

      <div style={statsGridStyle}>
        <Stat label="Historikk" value={timeline.length} />
        <Stat label="Bilder" value={imageItems.length} />
        <Stat label="Oppgaver" value={activeTasks.length} />
      </div>

      <div style={tabsStyle}>
        <Tab active={tab === "history"} onClick={() => setTab("history")}>Historikk</Tab>
        <Tab active={tab === "images"} onClick={() => setTab("images")}>Bilder</Tab>
        <Tab active={tab === "upload"} onClick={() => setTab("upload")}>+ Nytt bilde</Tab>
      </div>

      {message && <Status message={message} />}

      {tab === "history" && (
        <section>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0 }}>Navara-historikk</h2>
            <button onClick={() => void loadTimeline()} disabled={loadingTimeline} style={secondaryButtonStyle}>
              {loadingTimeline ? "Laster…" : "Oppdater"}
            </button>
          </div>

          {!loadingTimeline && timeline.length === 0 && <Empty text="Ingen lagrede Navara-hendelser ennå." />}

          <div style={{ display: "grid", gap: 12 }}>
            {timeline.map((item) => (
              <article key={item.id} style={timelineCardStyle}>
                <div style={timelineTopStyle}>
                  <span style={typeBadgeStyle}>{typeLabel(item.memory_type)}</span>
                  <span style={{ color: "#8b8b8b", fontSize: 13 }}>{formatDate(item.occurred_at || item.recorded_at)}</span>
                </div>
                <h3 style={{ margin: "8px 0 6px" }}>{item.title}</h3>
                <p style={{ margin: 0, color: "#c7c7c7", whiteSpace: "pre-wrap" }}>{item.content}</p>
                {item.attachments.filter((a) => a.attachment_type === "image" && a.objectUrl).map((a) => (
                  <img key={a.id} src={a.objectUrl} alt={a.original_name || item.title} style={timelineImageStyle} />
                ))}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "images" && (
        <section>
          <div style={sectionHeaderStyle}>
            <h2 style={{ margin: 0 }}>Navara-bilder</h2>
            <span style={{ color: "#a3a3a3" }}>{imageItems.length} stk.</span>
          </div>
          {imageItems.length === 0 ? <Empty text="Ingen bilder er lagret ennå." /> : (
            <div style={galleryStyle}>
              {imageItems.flatMap((item) =>
                item.attachments.filter((a) => a.attachment_type === "image" && a.objectUrl).map((a) => (
                  <article key={a.id} style={galleryCardStyle}>
                    <img src={a.objectUrl} alt={a.original_name || item.title} style={galleryImageStyle} />
                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{formatDate(item.occurred_at || item.recorded_at)}</div>
                      {item.content && <div style={{ color: "#c7c7c7", fontSize: 14, marginTop: 8 }}>{item.content}</div>}
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {tab === "upload" && (
        <form onSubmit={upload} style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Nytt Navara-bilde</h2>
          <label>
            <div style={labelStyle}>Ta bilde eller velg bilde</div>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, padding: 10 }} />
          </label>
          {preview && <img src={preview} alt="Forhåndsvisning" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 12, background: "#111" }} />}
          <label>
            <div style={labelStyle}>Tittel (valgfritt)</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="F.eks. Venstre bakaksel" style={inputStyle} />
          </label>
          <label>
            <div style={labelStyle}>Notat (valgfritt)</div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hva viser bildet?" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
          </label>
          <button disabled={!file || busy} style={buttonStyle}>{busy ? "Lagrer…" : "Lagre bilde i OFA"}</button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f5", fontFamily: "system-ui, sans-serif", padding: "24px 16px 60px" }}><div style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div></main>;
}
function Header() { return <header style={{ marginBottom: 20 }}><h1 style={{ fontSize: 30, margin: 0 }}>Open Farm Assistant</h1><div style={{ color: "#9ca3af", marginTop: 4 }}>OFA maskinarkiv</div></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <div style={statStyle}><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div><div style={{ color: "#9ca3af", fontSize: 13 }}>{label}</div></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} style={{ flex: 1, padding: "11px 8px", borderRadius: 10, border: active ? "1px solid #737373" : "1px solid #262626", background: active ? "#262626" : "#111", color: "#f5f5f5", fontWeight: active ? 700 : 500, cursor: "pointer" }}>{children}</button>; }
function Status({ message }: { message: string }) { return <div style={{ margin: "14px 0", padding: 13, borderRadius: 11, background: "#171717" }}>{message}</div>; }
function Empty({ text }: { text: string }) { return <div style={{ ...cardStyle, color: "#9ca3af" }}>{text}</div>; }

function typeLabel(type: string) {
  const labels: Record<string, string> = { image: "Bilde", service: "Service", task: "Oppgave", observation: "Observasjon", purchase: "Innkjøp", measurement: "Måling", event: "Hendelse", note: "Notat", decision: "Beslutning", document: "Dokument" };
  return labels[type] || type;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch { return value; }
}

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 6, padding: "12px 14px", borderRadius: 10, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", fontSize: 16 };
const labelStyle: React.CSSProperties = { fontSize: 14, color: "#d4d4d4" };
const buttonStyle: React.CSSProperties = { padding: "13px 16px", borderRadius: 10, border: 0, fontWeight: 800, fontSize: 16, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: 9, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", cursor: "pointer" };
const cardStyle: React.CSSProperties = { display: "grid", gap: 14, padding: 18, border: "1px solid #262626", borderRadius: 16, background: "#101010" };
const machineCardStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 18, border: "1px solid #262626", borderRadius: 16, background: "#101010" };
const statsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "12px 0" };
const statStyle: React.CSSProperties = { padding: 14, borderRadius: 13, border: "1px solid #262626", background: "#101010" };
const tabsStyle: React.CSSProperties = { display: "flex", gap: 8, margin: "16px 0 20px" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const timelineCardStyle: React.CSSProperties = { padding: 16, border: "1px solid #262626", borderRadius: 14, background: "#101010" };
const timelineTopStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const typeBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#262626", color: "#d4d4d4", fontSize: 12, fontWeight: 700 };
const timelineImageStyle: React.CSSProperties = { width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12, marginTop: 12 };
const galleryStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const galleryCardStyle: React.CSSProperties = { overflow: "hidden", border: "1px solid #262626", borderRadius: 14, background: "#101010" };
const galleryImageStyle: React.CSSProperties = { width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" };
