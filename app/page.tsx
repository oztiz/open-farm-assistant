"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MaintenanceView } from "./maintenance-view";
import { MeterReadingCard, MeterReadingEditor } from "./meter-reading-card";
import { ProjectDashboard } from "./project-dashboard";
import type { Attachment, Entity, MaintenanceItem, MaintenancePlanFormInput, Memory, MeterReadingInput, ProjectDashboardItem, TimelineItem } from "./ofa-types";

type Session = { access_token: string; refresh_token: string; user: { id: string; email?: string } };
type TabName = "overview" | "maintenance" | "history" | "images" | "upload";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SESSION_KEY = "ofa_session";

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [dashboardItems, setDashboardItems] = useState<ProjectDashboardItem[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<MaintenanceItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [performedOdometer, setPerformedOdometer] = useState("");
  const [performedHours, setPerformedHours] = useState("");
  const [tab, setTab] = useState<TabName>("history");
  const [busy, setBusy] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [meterSaving, setMeterSaving] = useState(false);
  const [pendingLoads, setPendingLoads] = useState(0);
  const [message, setMessage] = useState("");
  const loading = pendingLoads > 0;

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as Session;
      queueMicrotask(() => setSession(restored));
    } catch { localStorage.removeItem(SESSION_KEY); }
  }, []);

  useEffect(() => { if (session) void loadEntities(session); }, [session]);
  useEffect(() => {
    if (!session || !selectedId) return;
    const entity = entities.find((item) => item.id === selectedId);
    void loadTimeline(session, selectedId);
    if (entity?.entity_type === "project") void loadProjectDashboard(session, selectedId);
    if (entity && supportsMaintenance(entity)) void loadMaintenance(session, selectedId);
  }, [selectedId, entities]);

  const preview = useMemo(() => file?.type.startsWith("image/") ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const selected = entities.find((e) => e.id === selectedId) ?? null;
  const imageItems = useMemo(() => timeline.filter((m) => m.attachments.some((a) => a.attachment_type === "image" && a.objectUrl)), [timeline]);
  const activeTasks = useMemo(() => timeline.filter((m) => m.memory_type === "task" && m.status === "active"), [timeline]);

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

  async function authFetch(current: Session, url: string, init: RequestInit = {}) {
    const doFetch = (s: Session) => fetch(url, { ...init, headers: { apikey: supabaseKey, Authorization: `Bearer ${s.access_token}`, ...(init.headers || {}) } });
    let response = await doFetch(current);
    if (response.status !== 401) return { response, session: current };
    const renewed = await refreshSession(current);
    response = await doFetch(renewed);
    return { response, session: renewed };
  }

  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error_description || data?.msg || "Innlogging feilet");
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
      setSession(data); setPassword("");
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setBusy(false); }
  }

  function revokeUrls() {
    timeline.forEach((m) => m.attachments.forEach((a) => { if (a.objectUrl) URL.revokeObjectURL(a.objectUrl); }));
  }

  function logout() {
    revokeUrls(); localStorage.removeItem(SESSION_KEY); setSession(null); setEntities([]); setSelectedId(""); setTimeline([]); setDashboardItems([]); setMaintenanceItems([]);
  }

  async function loadEntities(current: Session) {
    setPendingLoads((count) => count + 1);
    try {
      const params = new URLSearchParams({ select: "id,entity_type,name,description,metadata,current_odometer_km,current_engine_hours,meter_reading_at", order: "created_at.asc" });
      const { response } = await authFetch(current, `${supabaseUrl}/rest/v1/ofa_entities?${params.toString()}`);
      const data: Entity[] = await response.json();
      if (!response.ok) throw new Error("Kunne ikke lese maskiner");
      setEntities(data);
      if (!selectedId && data.length) {
        const navara = data.find((e) => String(e.metadata?.alias || "") === "Navara");
        const initial = navara ?? data[0];
        setSelectedId(initial.id);
        setTab(initial.entity_type === "project" ? "overview" : "history");
      }
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setPendingLoads((count) => Math.max(0, count - 1)); }
  }

  async function loadTimeline(current: Session, entityId: string) {
    setPendingLoads((count) => count + 1);
    try {
      const linkParams = new URLSearchParams({ select: "memory_id", entity_id: `eq.${entityId}` });
      const { response: linkRes, session: activeSession } = await authFetch(current, `${supabaseUrl}/rest/v1/ofa_memory_entities?${linkParams.toString()}`);
      const links: { memory_id: string }[] = await linkRes.json();
      if (!linkRes.ok) throw new Error("Kunne ikke lese koblinger");
      const ids = links.map((l) => l.memory_id);
      if (!ids.length) { revokeUrls(); setTimeline([]); return; }

      const memoryParams = new URLSearchParams({ select: "id,occurred_at,recorded_at,memory_type,title,content,importance,status,source,odometer_km,engine_hours", id: `in.(${ids.join(",")})`, order: "occurred_at.desc.nullslast,recorded_at.desc" });
      const { response: memoryRes } = await authFetch(activeSession, `${supabaseUrl}/rest/v1/ofa_memories?${memoryParams.toString()}`);
      const memories: Memory[] = await memoryRes.json();
      if (!memoryRes.ok) throw new Error("Kunne ikke lese historikk");

      const attachmentParams = new URLSearchParams({ select: "id,memory_id,attachment_type,storage_path,original_name,mime_type", memory_id: `in.(${ids.join(",")})` });
      const { response: attachmentRes } = await authFetch(activeSession, `${supabaseUrl}/rest/v1/ofa_attachments?${attachmentParams.toString()}`);
      const attachments: Attachment[] = await attachmentRes.json();
      if (!attachmentRes.ok) throw new Error("Kunne ikke lese vedlegg");

      revokeUrls();
      const map = new Map<string, Array<Attachment & { objectUrl?: string }>>();
      for (const attachment of attachments) {
        let objectUrl: string | undefined;
        if (attachment.storage_path && attachment.attachment_type === "image") {
          const encodedPath = attachment.storage_path.split("/").map(encodeURIComponent).join("/");
          const { response: imageRes } = await authFetch(activeSession, `${supabaseUrl}/storage/v1/object/authenticated/ofa-attachments/${encodedPath}`);
          if (imageRes.ok) objectUrl = URL.createObjectURL(await imageRes.blob());
        }
        const list = map.get(attachment.memory_id) ?? [];
        list.push({ ...attachment, objectUrl }); map.set(attachment.memory_id, list);
      }
      setTimeline(memories.map((m) => ({ ...m, attachments: map.get(m.id) ?? [] })));
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setPendingLoads((count) => Math.max(0, count - 1)); }
  }

  async function loadProjectDashboard(current: Session, entityId: string) {
    setPendingLoads((count) => count + 1);
    try {
      const params = new URLSearchParams({
        select: "project_entity_id,project_name,memory_id,memory_type,title,content,status,importance,occurred_at,recorded_at,metadata,verification_status,workflow_state,blocked_by,dashboard_section,section_order",
        project_entity_id: `eq.${entityId}`,
        order: "section_order.asc.nullslast,importance.desc.nullslast,occurred_at.desc.nullslast,recorded_at.desc",
      });
      const { response } = await authFetch(current, `${supabaseUrl}/rest/v1/ofa_project_dashboard_items?${params.toString()}`);
      const data: ProjectDashboardItem[] = await response.json();
      if (!response.ok) throw new Error("Kunne ikke lese prosjektoversikten");
      setDashboardItems(data);
    } catch (err) {
      setDashboardItems([]);
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setPendingLoads((count) => Math.max(0, count - 1)); }
  }

  async function loadMaintenance(current: Session, entityId: string) {
    setPendingLoads((count) => count + 1);
    try {
      const params = new URLSearchParams({
        select: "id,entity_id,name,last_service_memory_id,last_performed_at,last_odometer_km,last_engine_hours,interval_km,interval_hours,interval_days,current_odometer_km,current_engine_hours,next_due_km,next_due_hours,next_due_date,maintenance_status,metadata,remaining_km,remaining_hours,remaining_days",
        entity_id: `eq.${entityId}`,
        order: "name.asc",
      });
      const { response, session: activeSession } = await authFetch(current, `${supabaseUrl}/rest/v1/ofa_maintenance_dashboard_items?${params.toString()}`);
      const data: MaintenanceItem[] = await response.json();
      if (!response.ok) throw new Error("Kunne ikke lese vedlikeholdsplanen");
      const detailParams = new URLSearchParams({ select: "id,description", entity_id: `eq.${entityId}`, active: "eq.true" });
      const { response: detailResponse } = await authFetch(activeSession, `${supabaseUrl}/rest/v1/ofa_maintenance_plans?${detailParams.toString()}`);
      const details: Array<{ id: string; description: string | null }> = await detailResponse.json();
      if (!detailResponse.ok) throw new Error("Kunne ikke lese vedlikeholdsdetaljer");
      const descriptions = new Map(details.map((item) => [item.id, item.description]));
      setMaintenanceItems(data.map((item) => ({ ...item, description: descriptions.get(item.id) ?? null })));
    } catch (err) {
      setMaintenanceItems([]);
      setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setPendingLoads((count) => Math.max(0, count - 1)); }
  }

  async function saveMaintenance(id: string | null, input: MaintenancePlanFormInput) {
    if (!session || !selected) return false;
    setMaintenanceSaving(true); setMessage("");
    try {
      const { last_performed_at, last_odometer_km, last_engine_hours, ...planInput } = input;
      let lastServiceMemoryId = planInput.last_service_memory_id;
      if (lastServiceMemoryId || last_performed_at || last_odometer_km !== null || last_engine_hours !== null) {
        const { response: memoryResponse } = await authFetch(session, `${supabaseUrl}/rest/v1/rpc/ofa_upsert_maintenance_service_memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ p_entity_id: selected.id, p_memory_id: lastServiceMemoryId, p_plan_name: planInput.name, p_performed_at: last_performed_at, p_odometer_km: last_odometer_km, p_engine_hours: last_engine_hours }),
        });
        const memoryResult = await memoryResponse.json();
        if (!memoryResponse.ok) throw new Error(memoryResult?.message || memoryResult?.error || "Kunne ikke lagre siste utførelse i historikken");
        lastServiceMemoryId = String(memoryResult);
      }
      const planBody = { ...planInput, last_service_memory_id: lastServiceMemoryId };
      const body = id ? planBody : { ...planBody, entity_id: selected.id };
      const url = id
        ? `${supabaseUrl}/rest/v1/ofa_maintenance_plans?id=eq.${encodeURIComponent(id)}`
        : `${supabaseUrl}/rest/v1/ofa_maintenance_plans`;
      const { response, session: activeSession } = await authFetch(session, url, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Kunne ikke lagre vedlikeholdspunktet");
      setMessage(id ? "Vedlikeholdspunktet er oppdatert." : "Vedlikeholdspunktet er opprettet.");
      await Promise.all([loadMaintenance(activeSession, selected.id), loadTimeline(activeSession, selected.id)]);
      return true;
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); return false; }
    finally { setMaintenanceSaving(false); }
  }

  async function deactivateMaintenance(item: MaintenanceItem) {
    if (!session || !selected || !window.confirm(`Deaktivere «${item.name}»? Historikken blir ikke slettet.`)) return;
    setMaintenanceSaving(true); setMessage("");
    try {
      const { response, session: activeSession } = await authFetch(session, `${supabaseUrl}/rest/v1/ofa_maintenance_plans?id=eq.${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) throw new Error("Kunne ikke deaktivere vedlikeholdspunktet");
      setMessage("Vedlikeholdspunktet er deaktivert. Historikken er beholdt.");
      await loadMaintenance(activeSession, selected.id);
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setMaintenanceSaving(false); }
  }

  async function saveCurrentMeter(input: MeterReadingInput) {
    if (!session || !selected) return false;
    setMeterSaving(true); setMessage("");
    try {
      const body = { current_odometer_km: input.odometer_km, current_engine_hours: input.engine_hours, meter_reading_at: new Date().toISOString() };
      const { response, session: activeSession } = await authFetch(session, `${supabaseUrl}/rest/v1/ofa_entities?id=eq.${encodeURIComponent(selected.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Kunne ikke oppdatere tellerstanden");
      setEntities((current) => current.map((entity) => entity.id === selected.id ? { ...entity, ...body } : entity));
      await loadMaintenance(activeSession, selected.id);
      setMessage("Tellerstanden er oppdatert.");
      return true;
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); return false; }
    finally { setMeterSaving(false); }
  }

  async function saveHistoryMeter(memoryId: string, input: MeterReadingInput) {
    if (!session || !selected) return false;
    setMeterSaving(true); setMessage("");
    try {
      const { response, session: activeSession } = await authFetch(session, `${supabaseUrl}/rest/v1/ofa_memories?id=eq.${encodeURIComponent(memoryId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("Kunne ikke lagre tellerstanden på historikkposten");
      await Promise.all([loadTimeline(activeSession, selected.id), loadMaintenance(activeSession, selected.id)]);
      setMessage("Tellerstanden på historikkposten er oppdatert.");
      return true;
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); return false; }
    finally { setMeterSaving(false); }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!session || !selected || !file) return;
    const meters = meterInput(performedOdometer, performedHours);
    if (!meters) { setMessage("Feil: Tellerstand ved utførelse må være tom eller et positivt tall."); return; }
    setBusy(true); setMessage("Laster opp…");
    try {
      const form = new FormData();
      form.append("file", file); form.append("entity_id", selected.id);
      form.append("title", title.trim() || file.name);
      form.append("content", note.trim() || `Bilde/vedlegg lastet opp fra OFA: ${file.name}`);
      form.append("occurred_at", new Date().toISOString()); form.append("importance", "3");
      const { response, session: activeSession } = await authFetch(session, `${supabaseUrl}/functions/v1/ofa-upload`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      if ((meters.odometer_km !== null || meters.engine_hours !== null) && data?.memory?.id) {
        const { response: meterResponse } = await authFetch(activeSession, `${supabaseUrl}/rest/v1/ofa_memories?id=eq.${encodeURIComponent(data.memory.id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(meters),
        });
        if (!meterResponse.ok) throw new Error("Vedlegget ble lagret, men tellerstanden kunne ikke lagres");
      }
      setFile(null); setTitle(""); setNote(""); setPerformedOdometer(""); setPerformedHours(""); setMessage("✅ Lagret i OFA");
      await Promise.all([loadTimeline(activeSession, selected.id), ...(supportsMaintenance(selected) ? [loadMaintenance(activeSession, selected.id)] : [])]); setTab("images");
    } catch (err) { setMessage(`Feil: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setBusy(false); }
  }

  if (!session) return (
    <Shell><Header /><form onSubmit={login} style={cardStyle}>
      <h2 style={{ marginTop: 0 }}>Logg inn</h2>
      <input type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
      <input type="password" placeholder="Passord" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
      <button disabled={busy} style={buttonStyle}>{busy ? "Logger inn…" : "Logg inn"}</button>
    </form>{message && <Status message={message} />}</Shell>
  );

  return (
    <Shell>
      <div style={topBarStyle}><Header /><button onClick={logout} style={logoutStyle}>Logg ut</button></div>

      <section style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8 }}>Maskiner og prosjekter</div>
        <div style={entityStripStyle}>
          {entities.map((entity) => {
            const active = entity.id === selectedId;
            return <button key={entity.id} onClick={() => { setSelectedId(entity.id); setTab(entity.entity_type === "project" ? "overview" : "history"); setDashboardItems([]); setMaintenanceItems([]); setMessage(""); }} style={{ ...entityButtonStyle, border: active ? "1px solid #888" : "1px solid #2c2c2c", background: active ? "#262626" : "#111" }}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{entityTypeLabel(entity.entity_type)}</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{String(entity.metadata?.alias || entity.name)}</div>
            </button>;
          })}
        </div>
      </section>

      {selected && <>
        <div style={machineCardStyle}>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{entityTypeLabel(selected.entity_type)}</div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2 }}>{selected.name}</div>
          {selected.description && <div style={{ color: "#a3a3a3", marginTop: 7 }}>{selected.description}</div>}
        </div>

        <div style={statsGridStyle}><Stat label="Historikk" value={timeline.length} /><Stat label="Bilder" value={imageItems.length} /><Stat label="Oppgaver" value={activeTasks.length} /></div>
        <div style={tabsStyle}>
          {selected.entity_type === "project" && <Tab active={tab === "overview"} onClick={() => setTab("overview")}>Oversikt</Tab>}
          {supportsMaintenance(selected) && <Tab active={tab === "maintenance"} onClick={() => setTab("maintenance")}>Vedlikehold</Tab>}
          <Tab active={tab === "history"} onClick={() => setTab("history")}>Tidslinje</Tab>
          <Tab active={tab === "images"} onClick={() => setTab("images")}>Bilder</Tab>
          <Tab active={tab === "upload"} onClick={() => setTab("upload")}>+ Nytt</Tab>
        </div>
        {supportsMaintenance(selected) && <MeterReadingCard entity={selected} saving={meterSaving} onSave={saveCurrentMeter} />}
        {message && <Status message={message} />}

        {selected.entity_type === "project" && tab === "overview" && <ProjectDashboard
          project={selected}
          items={dashboardItems}
          loading={loading}
          onRefresh={() => void loadProjectDashboard(session, selected.id)}
        />}

        {supportsMaintenance(selected) && tab === "maintenance" && <MaintenanceView
          items={maintenanceItems}
          history={timeline}
          {...meterCapabilities(selected)}
          loading={loading}
          saving={maintenanceSaving}
          onRefresh={() => void loadMaintenance(session, selected.id)}
          onSave={saveMaintenance}
          onDeactivate={deactivateMaintenance}
        />}

        {tab === "history" && <section>
          <div style={sectionHeaderStyle}><h2 style={{ margin: 0 }}>{selected.entity_type === "project" ? "Komplett tidslinje" : "Historikk"}</h2><button onClick={() => void loadTimeline(session, selected.id)} disabled={loading} style={secondaryButtonStyle}>{loading ? "Laster…" : "Oppdater"}</button></div>
          {!loading && timeline.length === 0 && <Empty text="Ingen historikk på denne ennå." />}
          <div style={{ display: "grid", gap: 12 }}>{timeline.map((item) => <article key={item.id} style={timelineCardStyle}>
            <div style={timelineTopStyle}><span style={typeBadgeStyle}>{typeLabel(item.memory_type)}</span><span style={{ color: "#8b8b8b", fontSize: 13 }}>{formatDate(item.occurred_at || item.recorded_at)}</span></div>
            <h3 style={{ margin: "8px 0 6px" }}>{item.title}</h3><p style={{ margin: 0, color: "#c7c7c7", whiteSpace: "pre-wrap" }}>{item.content}</p>
            {item.attachments.filter((a) => a.attachment_type === "image" && a.objectUrl).map((a) => <img key={a.id} src={a.objectUrl} alt={a.original_name || item.title} style={timelineImageStyle} />)}
            {supportsMaintenance(selected) && <MeterReadingEditor odometerKm={item.odometer_km} engineHours={item.engine_hours} {...meterCapabilities(selected)} saving={meterSaving} onSave={(input) => saveHistoryMeter(item.id, input)} />}
          </article>)}</div>
        </section>}

        {tab === "images" && <section>
          <div style={sectionHeaderStyle}><h2 style={{ margin: 0 }}>Bilder</h2><span style={{ color: "#a3a3a3" }}>{imageItems.length} stk.</span></div>
          {imageItems.length === 0 ? <Empty text="Ingen bilder lagret ennå." /> : <div style={galleryStyle}>{imageItems.flatMap((item) => item.attachments.filter((a) => a.attachment_type === "image" && a.objectUrl).map((a) => <article key={a.id} style={galleryCardStyle}>
            <img src={a.objectUrl} alt={a.original_name || item.title} style={galleryImageStyle} /><div style={{ padding: 12 }}><div style={{ fontWeight: 800 }}>{item.title}</div><div style={{ color: "#9ca3af", fontSize: 13, marginTop: 4 }}>{formatDate(item.occurred_at || item.recorded_at)}</div>{item.content && <div style={{ color: "#c7c7c7", fontSize: 14, marginTop: 8 }}>{item.content}</div>}</div>
          </article>))}</div>}
        </section>}

        {tab === "upload" && <form onSubmit={upload} style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Nytt vedlegg til {String(selected.metadata?.alias || selected.name)}</h2>
          <label><div style={labelStyle}>Ta bilde eller velg bilde</div><input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...inputStyle, padding: 10 }} /></label>
          {preview && <img src={preview} alt="Forhåndsvisning" style={{ width: "100%", maxHeight: 420, objectFit: "contain", borderRadius: 12, background: "#111" }} />}
          <label><div style={labelStyle}>Tittel (valgfritt)</div><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hva er dette?" style={inputStyle} /></label>
          <label><div style={labelStyle}>Notat (valgfritt)</div><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hva gjorde du / hva viser bildet?" rows={4} style={{ ...inputStyle, resize: "vertical" }} /></label>
          {supportsMaintenance(selected) && <div style={meterFieldsStyle}>
            {meterCapabilities(selected).showOdometer && <label><div style={labelStyle}>Kilometerstand ved utførelse (valgfritt)</div><input type="number" min="0" step="1" inputMode="numeric" value={performedOdometer} onChange={(event) => setPerformedOdometer(event.target.value)} style={inputStyle} /></label>}
            {meterCapabilities(selected).showEngineHours && <label><div style={labelStyle}>Driftstimer ved utførelse (valgfritt)</div><input type="number" min="0" step="0.1" inputMode="decimal" value={performedHours} onChange={(event) => setPerformedHours(event.target.value)} style={inputStyle} /></label>}
          </div>}
          <button disabled={!file || busy} style={buttonStyle}>{busy ? "Lagrer…" : "Lagre i OFA"}</button>
        </form>}
      </>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) { return <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f5", fontFamily: "system-ui, sans-serif", padding: "22px 16px 60px" }}><div style={{ maxWidth: 820, margin: "0 auto" }}>{children}</div></main>; }
function Header() { return <header><h1 style={{ fontSize: 30, margin: 0 }}>Open Farm Assistant</h1><div style={{ color: "#9ca3af", marginTop: 4 }}>OFA maskinarkiv</div></header>; }
function Stat({ label, value }: { label: string; value: number }) { return <div style={statStyle}><div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div><div style={{ color: "#9ca3af", fontSize: 13 }}>{label}</div></div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} style={{ flex: 1, padding: "11px 8px", borderRadius: 10, border: active ? "1px solid #737373" : "1px solid #262626", background: active ? "#262626" : "#111", color: "#f5f5f5", fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap" }}>{children}</button>; }
function Status({ message }: { message: string }) { return <div style={{ margin: "14px 0", padding: 13, borderRadius: 11, background: "#171717" }}>{message}</div>; }
function Empty({ text }: { text: string }) { return <div style={{ ...cardStyle, color: "#9ca3af" }}>{text}</div>; }
function entityTypeLabel(type: string) { const labels: Record<string, string> = { vehicle: "Kjøretøy", machine: "Maskin", implement: "Redskap", project: "Prosjekt", field: "Skifte" }; return labels[type] || "Objekt"; }
function supportsMaintenance(entity: Entity) { return entity.entity_type === "vehicle" || entity.entity_type === "machine"; }
function meterCapabilities(entity: Entity) {
  const configured = Array.isArray(entity.metadata?.meter_types) ? entity.metadata.meter_types.map(String) : [];
  const both = (configured.includes("odometer_km") && configured.includes("engine_hours"))
    || (entity.current_odometer_km !== null && entity.current_engine_hours !== null);
  return {
    showOdometer: both || configured.includes("odometer_km") || entity.entity_type === "vehicle",
    showEngineHours: both || configured.includes("engine_hours") || entity.entity_type === "machine",
  };
}
function meterInput(odometer: string, hours: string): MeterReadingInput | null {
  const odometerKm = optionalMeter(odometer, true);
  const engineHours = optionalMeter(hours, false);
  if ((odometer.trim() && odometerKm === null) || (hours.trim() && engineHours === null)) return null;
  return { odometer_km: odometerKm, engine_hours: engineHours };
}
function optionalMeter(value: string, integer: boolean) { if (!value.trim()) return null; const parsed = Number(value.replace(",", ".")); if (!Number.isFinite(parsed) || parsed < 0) return null; return integer ? Math.round(parsed) : Math.round(parsed * 10) / 10; }
function typeLabel(type: string) { const labels: Record<string, string> = { image: "Bilde", service: "Service", task: "Oppgave", observation: "Observasjon", purchase: "Innkjøp", measurement: "Måling", event: "Hendelse", note: "Notat", decision: "Beslutning", document: "Dokument" }; return labels[type] || type; }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } }

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 6, padding: "12px 14px", borderRadius: 10, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", fontSize: 16 };
const labelStyle: React.CSSProperties = { fontSize: 14, color: "#d4d4d4" };
const buttonStyle: React.CSSProperties = { padding: "13px 16px", borderRadius: 10, border: 0, fontWeight: 800, fontSize: 16, cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: 9, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", cursor: "pointer", whiteSpace: "nowrap" };
const logoutStyle: React.CSSProperties = { ...secondaryButtonStyle, flexShrink: 0 };
const cardStyle: React.CSSProperties = { display: "grid", gap: 14, padding: 18, border: "1px solid #262626", borderRadius: 16, background: "#101010" };
const topBarStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 24 };
const entityStripStyle: React.CSSProperties = { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" };
const entityButtonStyle: React.CSSProperties = { minWidth: 135, textAlign: "left", padding: 12, borderRadius: 12, color: "#f5f5f5", cursor: "pointer", flexShrink: 0 };
const machineCardStyle: React.CSSProperties = { padding: 18, border: "1px solid #262626", borderRadius: 16, background: "#101010" };
const statsGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, margin: "12px 0" };
const statStyle: React.CSSProperties = { padding: 14, borderRadius: 13, border: "1px solid #262626", background: "#101010" };
const tabsStyle: React.CSSProperties = { display: "flex", gap: 8, margin: "16px 0 20px", overflowX: "auto", WebkitOverflowScrolling: "touch" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const timelineCardStyle: React.CSSProperties = { padding: 16, border: "1px solid #262626", borderRadius: 14, background: "#101010" };
const timelineTopStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const typeBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#262626", color: "#d4d4d4", fontSize: 12, fontWeight: 700 };
const timelineImageStyle: React.CSSProperties = { width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 12, marginTop: 12 };
const galleryStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 };
const meterFieldsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const galleryCardStyle: React.CSSProperties = { overflow: "hidden", border: "1px solid #262626", borderRadius: 14, background: "#101010" };
const galleryImageStyle: React.CSSProperties = { width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" };
