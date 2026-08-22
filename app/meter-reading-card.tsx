"use client";

import { FormEvent, useState } from "react";
import type { CSSProperties } from "react";
import type { Entity, MeterReadingInput } from "./ofa-types";

type Props = { entity: Entity; saving: boolean; onSave: (input: MeterReadingInput) => Promise<boolean> };

export function MeterReadingCard({ entity, saving, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [validation, setValidation] = useState("");
  const usesHours = entity.entity_type === "machine";
  const current = usesHours ? entity.current_engine_hours : entity.current_odometer_km;
  const unit = usesHours ? "timer" : "km";

  function startEditing() {
    setValue(current === null ? "" : String(current));
    setValidation("");
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setValidation(`Angi en gyldig tellerstand i ${unit}.`);
      return;
    }
    const saved = await onSave({
      odometer_km: usesHours ? entity.current_odometer_km : Math.round(parsed),
      engine_hours: usesHours ? Math.round(parsed * 10) / 10 : entity.current_engine_hours,
    });
    if (saved) setEditing(false);
  }

  return <section style={cardStyle}>
    <div>
      <div style={labelStyle}>Nåværende {usesHours ? "driftstimeteller" : "kilometerstand"}</div>
      <div style={valueStyle}>{current === null ? "Ikke registrert" : `${formatNumber(current)} ${unit}`}</div>
      {entity.meter_reading_at && <div style={dateStyle}>Oppdatert {formatDate(entity.meter_reading_at)}</div>}
    </div>
    {!editing && <button onClick={startEditing} style={buttonStyle}>Oppdater tellerstand</button>}
    {editing && <form onSubmit={submit} style={formStyle}>
      <label style={inputLabelStyle}>Ny tellerstand ({unit})
        <input autoFocus required type="number" min="0" step={usesHours ? "0.1" : "1"} inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} style={inputStyle} />
      </label>
      {validation && <div role="alert" style={validationStyle}>{validation}</div>}
      <div style={actionsStyle}><button type="button" onClick={() => setEditing(false)} disabled={saving} style={secondaryButtonStyle}>Avbryt</button><button disabled={saving} style={saveButtonStyle}>{saving ? "Lagrer…" : "Lagre"}</button></div>
    </form>}
  </section>;
}

export function MeterReadingEditor({ odometerKm, engineHours, showOdometer, showEngineHours, saving, onSave }: { odometerKm: number | null; engineHours: number | null; showOdometer: boolean; showEngineHours: boolean; saving: boolean; onSave: (input: MeterReadingInput) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [km, setKm] = useState(odometerKm === null ? "" : String(odometerKm));
  const [hours, setHours] = useState(engineHours === null ? "" : String(engineHours));
  const [validation, setValidation] = useState("");

  function startEditing() {
    setKm(odometerKm === null ? "" : String(odometerKm));
    setHours(engineHours === null ? "" : String(engineHours));
    setValidation("");
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      odometer_km: showOdometer ? optionalNumber(km, true) : odometerKm,
      engine_hours: showEngineHours ? optionalNumber(hours, false) : engineHours,
    };
    if ((showOdometer && km && input.odometer_km === null) || (showEngineHours && hours && input.engine_hours === null)) { setValidation("Tellerverdier må være tomme eller positive tall."); return; }
    if (await onSave(input)) setEditing(false);
  }

  if (!editing) return <div style={historyReadingStyle}>
    <span>{formatReading(odometerKm, engineHours) || "Ingen tellerstand"}</span>
    <button onClick={startEditing} style={linkButtonStyle}>{odometerKm === null && engineHours === null ? "Legg til" : "Rediger"}</button>
  </div>;

  return <form onSubmit={submit} style={historyFormStyle}>
    <div style={historyGridStyle}>
      {showOdometer && <label style={inputLabelStyle}>Kilometerstand ved utførelse<input type="number" min="0" step="1" inputMode="numeric" value={km} onChange={(event) => setKm(event.target.value)} style={smallInputStyle} /></label>}
      {showEngineHours && <label style={inputLabelStyle}>Driftstimer ved utførelse<input type="number" min="0" step="0.1" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} style={smallInputStyle} /></label>}
    </div>
    {validation && <div role="alert" style={validationStyle}>{validation}</div>}
    <div style={actionsStyle}><button type="button" onClick={() => setEditing(false)} disabled={saving} style={secondaryButtonStyle}>Avbryt</button><button disabled={saving} style={saveButtonStyle}>{saving ? "Lagrer…" : "Lagre teller"}</button></div>
  </form>;
}

function optionalNumber(value: string, integer: boolean) { if (!value.trim()) return null; const parsed = Number(value.replace(",", ".")); if (!Number.isFinite(parsed) || parsed < 0) return null; return integer ? Math.round(parsed) : Math.round(parsed * 10) / 10; }
function formatReading(km: number | null, hours: number | null) { return [km !== null ? `${formatNumber(km)} km` : null, hours !== null ? `${formatNumber(hours)} timer` : null].filter(Boolean).join(" · "); }
function formatNumber(value: number) { return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } }

const cardStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 12, padding: 16, borderWidth: 1, borderStyle: "solid", borderColor: "#31513a", borderRadius: 14, background: "#101710" };
const labelStyle: CSSProperties = { color: "#a3a3a3", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" };
const valueStyle: CSSProperties = { marginTop: 3, fontSize: 24, fontWeight: 850 };
const dateStyle: CSSProperties = { marginTop: 3, color: "#8f8f8f", fontSize: 12 };
const formStyle: CSSProperties = { width: "100%", display: "grid", gap: 10 };
const inputLabelStyle: CSSProperties = { color: "#cfcfcf", fontSize: 12 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", marginTop: 5, padding: "12px 13px", borderRadius: 9, border: "1px solid #4a4a4a", background: "#171717", color: "#f5f5f5", fontSize: 18 };
const smallInputStyle: CSSProperties = { ...inputStyle, padding: "9px 10px", fontSize: 16 };
const buttonStyle: CSSProperties = { padding: "11px 13px", borderRadius: 10, border: "1px solid #46664f", background: "#183020", color: "#dcfce7", fontWeight: 800, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { padding: "9px 12px", borderRadius: 9, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", cursor: "pointer" };
const saveButtonStyle: CSSProperties = { padding: "9px 12px", border: 0, borderRadius: 9, background: "#e5e7eb", color: "#111", fontWeight: 800, cursor: "pointer" };
const actionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8 };
const validationStyle: CSSProperties = { padding: 9, borderRadius: 8, border: "1px solid #8b3a3a", background: "#351919", color: "#fecaca", fontSize: 13 };
const historyReadingStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10, paddingTop: 9, borderTop: "1px solid #262626", color: "#a3a3a3", fontSize: 13 };
const linkButtonStyle: CSSProperties = { padding: 5, border: 0, background: "transparent", color: "#bbf7d0", cursor: "pointer", fontWeight: 700 };
const historyFormStyle: CSSProperties = { display: "grid", gap: 9, marginTop: 10, paddingTop: 10, borderTop: "1px solid #31513a" };
const historyGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 9 };
