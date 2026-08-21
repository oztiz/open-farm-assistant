"use client";

import { FormEvent, useState } from "react";
import type { CSSProperties } from "react";
import type { MaintenanceItem, MaintenancePlanFormInput, TimelineItem } from "./ofa-types";

type Props = { items: MaintenanceItem[]; history: TimelineItem[]; showOdometer: boolean; showEngineHours: boolean; loading: boolean; saving: boolean; onRefresh: () => void; onSave: (id: string | null, input: MaintenancePlanFormInput) => Promise<boolean>; onDeactivate: (item: MaintenanceItem) => Promise<void> };
type FormValues = { name: string; description: string; intervalKm: string; intervalHours: string; intervalDays: string; lastServiceMemoryId: string; lastPerformedAt: string; lastOdometerKm: string; lastEngineHours: string };
const emptyForm: FormValues = { name: "", description: "", intervalKm: "", intervalHours: "", intervalDays: "", lastServiceMemoryId: "", lastPerformedAt: "", lastOdometerKm: "", lastEngineHours: "" };

export function MaintenanceView({ items, history, showOdometer, showEngineHours, loading, saving, onRefresh, onSave, onDeactivate }: Props) {
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [validation, setValidation] = useState("");
  const formOpen = editingId !== undefined;

  function startNew() { setEditingId(null); setForm(emptyForm); setValidation(""); }
  function startEdit(item: MaintenanceItem) {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description ?? "", intervalKm: valueOrEmpty(item.interval_km), intervalHours: valueOrEmpty(item.interval_hours), intervalDays: valueOrEmpty(item.interval_days), lastServiceMemoryId: item.last_service_memory_id ?? "", lastPerformedAt: dateInput(item.last_performed_at), lastOdometerKm: valueOrEmpty(item.last_odometer_km), lastEngineHours: valueOrEmpty(item.last_engine_hours) });
    setValidation("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const intervalKm = positiveNumber(form.intervalKm);
    const intervalHours = positiveNumber(form.intervalHours);
    const intervalDays = positiveNumber(form.intervalDays);
    const lastOdometerKm = optionalNonnegativeNumber(form.lastOdometerKm, true);
    const lastEngineHours = optionalNonnegativeNumber(form.lastEngineHours, false);
    if (!intervalKm && !intervalHours && !intervalDays) { setValidation("Angi minst ett intervall: kilometer, timer eller dager."); return; }
    if ((form.lastOdometerKm && lastOdometerKm === null) || (form.lastEngineHours && lastEngineHours === null)) { setValidation("Tellerstand ved siste utførelse må være tom eller et positivt tall."); return; }
    if (!form.lastServiceMemoryId && (form.lastOdometerKm || form.lastEngineHours) && !form.lastPerformedAt) { setValidation("Angi dato for siste utførelse når du registrerer en tellerstand."); return; }
    setValidation("");
    const saved = await onSave(editingId ?? null, { name: form.name.trim(), description: form.description.trim() || null, interval_km: intervalKm, interval_hours: intervalHours, interval_days: intervalDays, last_service_memory_id: form.lastServiceMemoryId || null, last_performed_at: form.lastPerformedAt || null, last_odometer_km: lastOdometerKm, last_engine_hours: lastEngineHours });
    if (saved) setEditingId(undefined);
  }

  return <section>
    <div style={headerStyle}><div><div style={eyebrowStyle}>Serviceplan</div><h2 style={{ margin: "3px 0 0" }}>Vedlikehold</h2></div><button onClick={onRefresh} disabled={loading || saving} style={secondaryButtonStyle}>{loading ? "Laster…" : "Oppdater"}</button></div>
    {!formOpen && <button onClick={startNew} style={newButtonStyle}>+ Nytt vedlikeholdspunkt</button>}
    {formOpen && <form onSubmit={submit} style={formStyle}>
      <div style={formHeaderStyle}><h3 style={{ margin: 0 }}>{editingId ? "Rediger vedlikeholdspunkt" : "Nytt vedlikeholdspunkt"}</h3><button type="button" onClick={() => setEditingId(undefined)} disabled={saving} style={linkButtonStyle}>Avbryt</button></div>
      <Field label="Navn"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="F.eks. Motorolje og oljefilter" style={inputStyle} /></Field>
      <Field label="Beskrivelse"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} placeholder="Deler, oljetype eller praktiske merknader" style={{ ...inputStyle, resize: "vertical" }} /></Field>
      <div style={intervalGridStyle}>
        <NumberField label="Intervall km" value={form.intervalKm} onChange={(value) => setForm({ ...form, intervalKm: value })} />
        <NumberField label="Intervall timer" value={form.intervalHours} onChange={(value) => setForm({ ...form, intervalHours: value })} />
        <NumberField label="Intervall dager" value={form.intervalDays} onChange={(value) => setForm({ ...form, intervalDays: value })} />
      </div>
      <Field label="Sist utført (fra historikken)"><select value={form.lastServiceMemoryId} onChange={(event) => setFormFromHistory(form, event.target.value, history, setForm)} style={inputStyle}><option value="">Opprett ny historikkpost fra feltene under</option>{history.map((item) => <option key={item.id} value={item.id}>{formatHistoryOption(item)}</option>)}</select></Field>
      <div style={lastPerformedStyle}>
        <div style={lastPerformedTitleStyle}>Siste utførelse</div>
        <Field label="Sist utført dato"><input type="date" value={form.lastPerformedAt} onChange={(event) => setForm({ ...form, lastPerformedAt: event.target.value })} style={inputStyle} /></Field>
        <div style={intervalGridStyle}>
          {showOdometer && <NumberField label="Kilometerstand ved siste utførelse" value={form.lastOdometerKm} onChange={(value) => setForm({ ...form, lastOdometerKm: value })} allowZero />}
          {showEngineHours && <NumberField label="Driftstimer ved siste utførelse" value={form.lastEngineHours} onChange={(value) => setForm({ ...form, lastEngineHours: value })} allowZero decimal />}
        </div>
        <div style={helpStyle}>{form.lastServiceMemoryId ? "Endringer lagres på den valgte historikkposten." : "Når dato eller tellerstand fylles ut, opprettes en servicepost i historikken automatisk."}</div>
      </div>
      {validation && <div role="alert" style={validationStyle}>{validation}</div>}
      <button disabled={saving} style={saveButtonStyle}>{saving ? "Lagrer…" : "Lagre vedlikeholdspunkt"}</button>
    </form>}
    {!loading && items.length === 0 && !formOpen && <div style={emptyStyle}>Ingen aktive vedlikeholdspunkter registrert.</div>}
    <div style={listStyle}>{items.map((item) => {
      const status = statusInfo(item.maintenance_status);
      const currentReading = formatCurrentReading(item);
      const remaining = formatRemaining(item);
      return <article key={item.id} style={{ ...cardStyle, borderColor: status.border }}>
        <div style={topRowStyle}><h3 style={titleStyle}>{item.name}</h3><span style={{ ...badgeStyle, color: status.color, background: status.background, borderColor: status.border }}>{status.label}</span></div>
        {item.description && <p style={descriptionStyle}>{item.description}</p>}
        <div style={detailsGridStyle}><Detail label="Sist utført" value={formatLastPerformed(item)} /><Detail label="Intervall" value={formatInterval(item)} /></div>
        <div style={dueStyle}><div style={dueLabelStyle}>Neste forfall</div><div style={dueValueStyle}>{formatNextDue(item)}</div>{currentReading && <div style={currentStyle}>Nå registrert: {currentReading}</div>}</div>
        {remaining && <div style={remainingStyle}>{remaining}</div>}
        <div style={actionsStyle}><button onClick={() => startEdit(item)} disabled={saving} style={secondaryButtonStyle}>Rediger</button><button onClick={() => void onDeactivate(item)} disabled={saving} style={deactivateButtonStyle}>Deaktiver</button></div>
      </article>;
    })}</div>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><div style={labelStyle}>{label}</div>{children}</label>; }
function NumberField({ label, value, onChange, allowZero = false, decimal = false }: { label: string; value: string; onChange: (value: string) => void; allowZero?: boolean; decimal?: boolean }) { return <Field label={label}><input type="number" min={allowZero ? "0" : "1"} step={decimal ? "0.1" : "1"} inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></Field>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><div style={detailLabelStyle}>{label}</div><div style={detailValueStyle}>{value}</div></div>; }
function positiveNumber(value: string) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function optionalNonnegativeNumber(value: string, integer: boolean) { if (!value.trim()) return null; const parsed = Number(value.replace(",", ".")); if (!Number.isFinite(parsed) || parsed < 0) return null; return integer ? Math.round(parsed) : Math.round(parsed * 10) / 10; }
function valueOrEmpty(value: number | null) { return value === null ? "" : String(value); }
function dateInput(value: string | null) { return value ? value.slice(0, 10) : ""; }
function setFormFromHistory(form: FormValues, memoryId: string, history: TimelineItem[], setForm: (value: FormValues) => void) { const memory = history.find((item) => item.id === memoryId); setForm({ ...form, lastServiceMemoryId: memoryId, lastPerformedAt: memory ? dateInput(memory.occurred_at || memory.recorded_at) : "", lastOdometerKm: memory ? valueOrEmpty(memory.odometer_km) : "", lastEngineHours: memory ? valueOrEmpty(memory.engine_hours) : "" }); }
function formatHistoryOption(item: TimelineItem) { return `${formatDate(item.occurred_at || item.recorded_at)} · ${item.title}`; }
function formatLastPerformed(item: MaintenanceItem) { const parts = [item.last_performed_at ? formatDate(item.last_performed_at) : null, formatReading(item.last_odometer_km, item.last_engine_hours)].filter(Boolean); return parts.length ? parts.join(" · ") : "Ikke registrert"; }
function formatInterval(item: MaintenanceItem) { return [item.interval_km ? `${formatNumber(item.interval_km)} km` : null, item.interval_hours ? `${formatNumber(item.interval_hours)} timer` : null, item.interval_days ? formatDays(item.interval_days) : null].filter(Boolean).join(" eller "); }
function formatNextDue(item: MaintenanceItem) { const values = [item.next_due_km ? `${formatNumber(item.next_due_km)} km` : null, item.next_due_hours ? `${formatNumber(item.next_due_hours)} timer` : null, item.next_due_date ? formatDate(item.next_due_date) : null].filter(Boolean); return values.length ? values.join(" eller ") : "Mangler siste utførelse"; }
function formatCurrentReading(item: MaintenanceItem) { return formatReading(item.current_odometer_km, item.current_engine_hours); }
function formatRemaining(item: MaintenanceItem) { const values = [item.remaining_km !== null ? remainingLabel(item.remaining_km, "km") : null, item.remaining_hours !== null ? remainingLabel(item.remaining_hours, "timer") : null, item.remaining_days !== null ? remainingLabel(item.remaining_days, "dager") : null].filter(Boolean); return values.join(" · "); }
function remainingLabel(value: number, unit: string) { return value < 0 ? `${formatNumber(Math.abs(value))} ${unit} over frist` : `${formatNumber(value)} ${unit} igjen`; }
function formatReading(km: number | null, hours: number | null) { return [km !== null ? `${formatNumber(km)} km` : null, hours !== null ? `${formatNumber(hours)} timer` : null].filter(Boolean).join(" · "); }
function formatDays(days: number) { if (days === 365) return "1 år"; if (days % 365 === 0) return `${days / 365} år`; return `${formatNumber(days)} dager`; }
function formatNumber(value: number) { return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value)); } catch { return value; } }
function statusInfo(status: MaintenanceItem["maintenance_status"]) { if (status === "overdue") return { label: "Forfalt", color: "#fecaca", background: "#3a1919", border: "#7f3030" }; if (status === "due_soon") return { label: "Nærmer seg", color: "#fde68a", background: "#352b13", border: "#6b5722" }; return { label: "OK", color: "#86efac", background: "#16331f", border: "#28623a" }; }

const headerStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const eyebrowStyle: CSSProperties = { color: "#8f8f8f", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" };
const secondaryButtonStyle: CSSProperties = { padding: "9px 12px", borderRadius: 9, borderWidth: 1, borderStyle: "solid", borderColor: "#404040", background: "#171717", color: "#f5f5f5", cursor: "pointer", whiteSpace: "nowrap" };
const newButtonStyle: CSSProperties = { width: "100%", padding: 13, marginBottom: 14, borderRadius: 11, border: "1px solid #46664f", background: "#183020", color: "#dcfce7", fontWeight: 800, cursor: "pointer" };
const formStyle: CSSProperties = { display: "grid", gap: 14, padding: 16, marginBottom: 16, border: "1px solid #3f5f48", borderRadius: 15, background: "#101710" };
const formHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };
const labelStyle: CSSProperties = { color: "#d4d4d4", fontSize: 13, marginBottom: 5 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 9, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", fontSize: 16 };
const intervalGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 };
const lastPerformedStyle: CSSProperties = { display: "grid", gap: 12, padding: 13, border: "1px solid #31513a", borderRadius: 11, background: "#111711" };
const lastPerformedTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 800 };
const helpStyle: CSSProperties = { color: "#9ca3af", fontSize: 12, lineHeight: 1.4 };
const linkButtonStyle: CSSProperties = { padding: 6, border: 0, background: "transparent", color: "#bdbdbd", cursor: "pointer" };
const validationStyle: CSSProperties = { padding: 11, borderRadius: 9, border: "1px solid #8b3a3a", background: "#351919", color: "#fecaca", fontSize: 14 };
const saveButtonStyle: CSSProperties = { padding: 12, border: 0, borderRadius: 10, background: "#e5e7eb", color: "#111", fontSize: 15, fontWeight: 800, cursor: "pointer" };
const listStyle: CSSProperties = { display: "grid", gap: 12 };
const cardStyle: CSSProperties = { padding: 16, borderWidth: 1, borderStyle: "solid", borderRadius: 15, background: "#101010" };
const topRowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 19, lineHeight: 1.3 };
const badgeStyle: CSSProperties = { flexShrink: 0, padding: "5px 9px", borderWidth: 1, borderStyle: "solid", borderRadius: 999, fontSize: 12, fontWeight: 800 };
const descriptionStyle: CSSProperties = { margin: "9px 0 0", color: "#bdbdbd", fontSize: 14, lineHeight: 1.45 };
const detailsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginTop: 16 };
const detailLabelStyle: CSSProperties = { color: "#8f8f8f", fontSize: 12, marginBottom: 3 };
const detailValueStyle: CSSProperties = { color: "#d4d4d4", fontSize: 14, lineHeight: 1.4 };
const dueStyle: CSSProperties = { marginTop: 16, padding: 13, borderRadius: 11, background: "#181818" };
const dueLabelStyle: CSSProperties = { color: "#a3a3a3", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" };
const dueValueStyle: CSSProperties = { marginTop: 4, fontSize: 18, fontWeight: 800, lineHeight: 1.35 };
const currentStyle: CSSProperties = { marginTop: 7, color: "#8f8f8f", fontSize: 12 };
const remainingStyle: CSSProperties = { marginTop: 8, color: "#d4d4d4", fontSize: 13, fontWeight: 700 };
const actionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 13 };
const deactivateButtonStyle: CSSProperties = { ...secondaryButtonStyle, borderColor: "#653838", color: "#fca5a5" };
const emptyStyle: CSSProperties = { padding: 18, border: "1px solid #262626", borderRadius: 14, background: "#101010", color: "#9ca3af" };
