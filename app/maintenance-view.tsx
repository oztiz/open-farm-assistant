import type { CSSProperties } from "react";
import type { MaintenanceItem } from "./ofa-types";

export function MaintenanceView({ items, loading, onRefresh }: { items: MaintenanceItem[]; loading: boolean; onRefresh: () => void }) {
  return <section>
    <div style={headerStyle}>
      <div>
        <div style={eyebrowStyle}>Serviceplan</div>
        <h2 style={{ margin: "3px 0 0" }}>Vedlikehold</h2>
      </div>
      <button onClick={onRefresh} disabled={loading} style={refreshStyle}>{loading ? "Laster…" : "Oppdater"}</button>
    </div>

    {!loading && items.length === 0 && <div style={emptyStyle}>Ingen vedlikeholdspunkter registrert.</div>}

    <div style={listStyle}>
      {items.map((item) => {
        const status = statusInfo(item.maintenance_status);
        return <article key={item.id} style={{ ...cardStyle, borderColor: status.border }}>
          <div style={topRowStyle}>
            <h3 style={titleStyle}>{item.name}</h3>
            <span style={{ ...badgeStyle, color: status.color, background: status.background, borderColor: status.border }}>{status.label}</span>
          </div>

          <div style={detailsGridStyle}>
            <Detail label="Sist utført" value={formatLastPerformed(item)} />
            <Detail label="Intervall" value={formatInterval(item)} />
          </div>

          <div style={dueStyle}>
            <div style={dueLabelStyle}>Neste forfall</div>
            <div style={dueValueStyle}>{formatNextDue(item)}</div>
            {formatCurrentReading(item) && <div style={currentStyle}>Nå registrert: {formatCurrentReading(item)}</div>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div style={detailLabelStyle}>{label}</div><div style={detailValueStyle}>{value}</div></div>;
}

function formatLastPerformed(item: MaintenanceItem) {
  const parts = [item.last_performed_at ? formatDate(item.last_performed_at) : null, formatReading(item.last_odometer_km, item.last_engine_hours)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Ikke registrert";
}

function formatInterval(item: MaintenanceItem) {
  return [
    item.interval_km ? `${formatNumber(item.interval_km)} km` : null,
    item.interval_hours ? `${formatNumber(item.interval_hours)} timer` : null,
    item.interval_days ? formatDays(item.interval_days) : null,
  ].filter(Boolean).join(" eller ");
}

function formatNextDue(item: MaintenanceItem) {
  const values = [
    item.next_due_km ? `${formatNumber(item.next_due_km)} km` : null,
    item.next_due_hours ? `${formatNumber(item.next_due_hours)} timer` : null,
    item.next_due_date ? formatDate(item.next_due_date) : null,
  ].filter(Boolean);
  return values.length ? values.join(" eller ") : "Mangler siste utførelse";
}

function formatCurrentReading(item: MaintenanceItem) {
  return formatReading(item.current_odometer_km, item.current_engine_hours);
}

function formatReading(km: number | null, hours: number | null) {
  return [km !== null ? `${formatNumber(km)} km` : null, hours !== null ? `${formatNumber(hours)} timer` : null].filter(Boolean).join(" · ");
}

function formatDays(days: number) {
  if (days === 365) return "1 år";
  if (days % 365 === 0) return `${days / 365} år`;
  return `${formatNumber(days)} dager`;
}

function formatNumber(value: number) { return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value); }
function formatDate(value: string) { try { return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value)); } catch { return value; } }
function statusInfo(status: MaintenanceItem["maintenance_status"]) {
  if (status === "overdue") return { label: "Forfalt", color: "#fecaca", background: "#3a1919", border: "#7f3030" };
  if (status === "due_soon") return { label: "Nærmer seg", color: "#fde68a", background: "#352b13", border: "#6b5722" };
  return { label: "OK", color: "#86efac", background: "#16331f", border: "#28623a" };
}

const headerStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 };
const eyebrowStyle: CSSProperties = { color: "#8f8f8f", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" };
const refreshStyle: CSSProperties = { padding: "9px 12px", borderRadius: 9, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", cursor: "pointer", whiteSpace: "nowrap" };
const listStyle: CSSProperties = { display: "grid", gap: 12 };
const cardStyle: CSSProperties = { padding: 16, border: "1px solid", borderRadius: 15, background: "#101010" };
const topRowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 };
const titleStyle: CSSProperties = { margin: 0, fontSize: 19, lineHeight: 1.3 };
const badgeStyle: CSSProperties = { flexShrink: 0, padding: "5px 9px", border: "1px solid", borderRadius: 999, fontSize: 12, fontWeight: 800 };
const detailsGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginTop: 16 };
const detailLabelStyle: CSSProperties = { color: "#8f8f8f", fontSize: 12, marginBottom: 3 };
const detailValueStyle: CSSProperties = { color: "#d4d4d4", fontSize: 14, lineHeight: 1.4 };
const dueStyle: CSSProperties = { marginTop: 16, padding: 13, borderRadius: 11, background: "#181818" };
const dueLabelStyle: CSSProperties = { color: "#a3a3a3", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" };
const dueValueStyle: CSSProperties = { marginTop: 4, fontSize: 18, fontWeight: 800, lineHeight: 1.35 };
const currentStyle: CSSProperties = { marginTop: 7, color: "#8f8f8f", fontSize: 12 };
const emptyStyle: CSSProperties = { padding: 18, border: "1px solid #262626", borderRadius: 14, background: "#101010", color: "#9ca3af" };
