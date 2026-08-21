import type { CSSProperties } from "react";
import type { Entity, ProjectDashboardItem } from "./ofa-types";

type Props = {
  project: Entity;
  items: ProjectDashboardItem[];
  loading: boolean;
  onRefresh: () => void;
};

const verifiedStates = new Set(["verified", "source-grounded", "source_grounded", "confirmed"]);

export function ProjectDashboard({ project, items, loading, onRefresh }: Props) {
  const ordered = [...items].sort(compareItems);
  const statusItems = ordered.filter((item) => sectionIs(item, "status", "summary", "status_now"));
  const activeTasks = ordered.filter(isActiveTask);
  const nextAction = activeTasks.find((item) => !isBlocked(item)) ?? activeTasks[0];
  const blockers = ordered.filter(isBlocked);
  const verified = ordered.filter((item) => verifiedStates.has(normalize(item.verification_status)));
  const investigations = ordered.filter(isInvestigation);
  const decisions = ordered.filter((item) => normalize(item.memory_type) === "decision");
  const documents = ordered.filter((item) => normalize(item.memory_type) === "document" || sectionIs(item, "documentation", "documents", "knowledge"));
  const summary = statusItems[0]?.content || project.description || "Ingen statusoppsummering er registrert ennå.";

  return (
    <div style={dashboardStyle}>
      <section style={statusStyle}>
        <div style={eyebrowStyle}>Status nå</div>
        <div style={statusHeadingStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Prosjektoversikt</h2>
            <p style={summaryStyle}>{summary}</p>
          </div>
          <Badge tone="active">Aktiv</Badge>
        </div>
      </section>

      <section style={nextActionStyle}>
        <div style={sectionTitleRowStyle}>
          <div style={eyebrowStyle}>Neste oppgave</div>
          {nextAction && <Badge tone={isBlocked(nextAction) ? "blocked" : "active"}>{isBlocked(nextAction) ? "Blokkert" : "Aktiv"}</Badge>}
        </div>
        {nextAction ? <>
          <h2 style={actionTitleStyle}>{nextAction.title}</h2>
          {nextAction.content && <p style={cardTextStyle}>{nextAction.content}</p>}
          <ItemMeta item={nextAction} />
        </> : <EmptyText>Ingen aktiv oppgave er registrert.</EmptyText>}
      </section>

      <DashboardSection title="Blokkeringer" count={blockers.length} accent="blocked">
        <ItemList items={blockers} empty="Ingen blokkeringer registrert." />
      </DashboardSection>

      <DashboardSection title="Verifiserte funn" count={verified.length}>
        <ItemList items={verified} empty="Ingen verifiserte funn registrert." />
      </DashboardSection>

      <DashboardSection title="Pågående undersøkelser" count={investigations.length}>
        <ItemList items={investigations} empty="Ingen pågående undersøkelser registrert." />
      </DashboardSection>

      <DashboardSection title="Beslutninger" count={decisions.length}>
        <ItemList items={decisions} empty="Ingen beslutninger registrert." />
      </DashboardSection>

      <DashboardSection title="Dokumentasjon" count={documents.length}>
        <ItemList items={documents} empty="Ingen dokumentasjon registrert." />
      </DashboardSection>

      <button onClick={onRefresh} disabled={loading} style={refreshStyle}>{loading ? "Oppdaterer…" : "Oppdater prosjektdata"}</button>
    </div>
  );
}

function DashboardSection({ title, count, accent, children }: { title: string; count: number; accent?: "blocked"; children: React.ReactNode }) {
  return <section style={{ ...sectionStyle, ...(accent === "blocked" && count ? blockedSectionStyle : {}) }}>
    <div style={sectionTitleRowStyle}><h2 style={sectionTitleStyle}>{title}</h2><span style={countStyle}>{count}</span></div>
    {children}
  </section>;
}

function ItemList({ items, empty }: { items: ProjectDashboardItem[]; empty: string }) {
  if (!items.length) return <EmptyText>{empty}</EmptyText>;
  return <div style={itemListStyle}>{items.map((item) => <article key={item.memory_id} style={itemStyle}>
    <div style={badgeRowStyle}>
      <Badge tone={badgeTone(item)}>{badgeLabel(item)}</Badge>
      <span style={dateStyle}>{formatDate(item.occurred_at || item.recorded_at)}</span>
    </div>
    <h3 style={itemTitleStyle}>{item.title}</h3>
    {item.content && <p style={cardTextStyle}>{item.content}</p>}
    {blockedByText(item.blocked_by) && <div style={blockedByStyle}>Avventer: {blockedByText(item.blocked_by)}</div>}
    <ItemMeta item={item} />
  </article>)}</div>;
}

function ItemMeta({ item }: { item: ProjectDashboardItem }) {
  const verification = verificationLabel(item.verification_status);
  return <div style={metaStyle}>
    <span>{typeLabel(item.memory_type)}</span>
    {verification && <span>• {verification}</span>}
  </div>;
}

function Badge({ tone, children }: { tone: "active" | "blocked" | "verified" | "testing" | "decision" | "neutral"; children: React.ReactNode }) {
  const tones: Record<string, CSSProperties> = {
    active: { background: "#16331f", color: "#86efac", borderColor: "#28623a" },
    blocked: { background: "#3a1919", color: "#fca5a5", borderColor: "#7f3030" },
    verified: { background: "#152d35", color: "#67e8f9", borderColor: "#285d69" },
    testing: { background: "#352b13", color: "#fde68a", borderColor: "#6b5722" },
    decision: { background: "#2b2142", color: "#d8b4fe", borderColor: "#563e7b" },
    neutral: { background: "#262626", color: "#d4d4d4", borderColor: "#404040" },
  };
  return <span style={{ ...badgeStyle, ...tones[tone] }}>{children}</span>;
}

function EmptyText({ children }: { children: React.ReactNode }) { return <p style={{ margin: 0, color: "#8f8f8f" }}>{children}</p>; }

function compareItems(a: ProjectDashboardItem, b: ProjectDashboardItem) {
  const order = (a.section_order ?? Number.MAX_SAFE_INTEGER) - (b.section_order ?? Number.MAX_SAFE_INTEGER);
  if (order) return order;
  const importance = (b.importance ?? 0) - (a.importance ?? 0);
  if (importance) return importance;
  return new Date(b.occurred_at || b.recorded_at).getTime() - new Date(a.occurred_at || a.recorded_at).getTime();
}

function normalize(value: string | null | undefined) { return (value || "").trim().toLowerCase().replaceAll(" ", "_"); }
function sectionIs(item: ProjectDashboardItem, ...values: string[]) { return values.includes(normalize(item.dashboard_section)); }
function isActiveTask(item: ProjectDashboardItem) {
  if (normalize(item.memory_type) !== "task") return false;
  const state = normalize(item.workflow_state || item.status);
  return !["done", "completed", "closed", "cancelled", "archived"].includes(state);
}
function isBlocked(item: ProjectDashboardItem) {
  const state = normalize(item.workflow_state || item.status);
  return Boolean(blockedByText(item.blocked_by)) || state.includes("block") || sectionIs(item, "blocked", "blockers");
}
function isInvestigation(item: ProjectDashboardItem) {
  if (verifiedStates.has(normalize(item.verification_status))) return false;
  const verification = normalize(item.verification_status);
  const workflow = normalize(item.workflow_state);
  return ["working", "under_test", "testing", "in_progress", "investigating"].some((value) => verification.includes(value) || workflow.includes(value)) || sectionIs(item, "investigations", "ongoing_investigations");
}
function blockedByText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(blockedByText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(blockedByText).filter(Boolean).join(", ");
  return String(value);
}
function badgeTone(item: ProjectDashboardItem): "active" | "blocked" | "verified" | "testing" | "decision" | "neutral" {
  if (isBlocked(item)) return "blocked";
  if (normalize(item.memory_type) === "decision") return "decision";
  if (verifiedStates.has(normalize(item.verification_status))) return "verified";
  if (isInvestigation(item)) return "testing";
  if (isActiveTask(item)) return "active";
  return "neutral";
}
function badgeLabel(item: ProjectDashboardItem) {
  const tone = badgeTone(item);
  return { active: "Aktiv", blocked: "Blokkert", verified: "Verifisert", testing: "Under test", decision: "Beslutning", neutral: typeLabel(item.memory_type) }[tone];
}
function verificationLabel(value: string | null) {
  const labels: Record<string, string> = { working: "Arbeidshypotese", "source-grounded": "Kildebelagt", source_grounded: "Kildebelagt", verified: "Verifisert", confirmed: "Bekreftet" };
  return labels[normalize(value)] || value || "";
}
function typeLabel(type: string) {
  const labels: Record<string, string> = { task: "Oppgave", observation: "Funn", measurement: "Måling", decision: "Beslutning", document: "Dokumentasjon", note: "Notat", event: "Hendelse" };
  return labels[normalize(type)] || type;
}
function formatDate(value: string) { try { return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium" }).format(new Date(value)); } catch { return value; } }

const dashboardStyle: CSSProperties = { display: "grid", gap: 14 };
const statusStyle: CSSProperties = { padding: 18, border: "1px solid #314536", borderRadius: 16, background: "linear-gradient(145deg, #101a12, #101010 70%)" };
const statusHeadingStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 7 };
const summaryStyle: CSSProperties = { color: "#d1d5db", lineHeight: 1.55, margin: "8px 0 0", whiteSpace: "pre-wrap" };
const nextActionStyle: CSSProperties = { padding: 18, border: "2px solid #d6a53a", borderRadius: 16, background: "#1c180e", boxShadow: "0 8px 28px rgba(0,0,0,.22)" };
const actionTitleStyle: CSSProperties = { fontSize: 22, lineHeight: 1.25, margin: "10px 0 6px" };
const sectionStyle: CSSProperties = { padding: 16, borderWidth: 1, borderStyle: "solid", borderColor: "#292929", borderRadius: 15, background: "#101010" };
const blockedSectionStyle: CSSProperties = { borderColor: "#66302f", background: "#151010" };
const sectionTitleRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: 19 };
const countStyle: CSSProperties = { minWidth: 26, height: 26, display: "grid", placeItems: "center", borderRadius: 999, background: "#292929", color: "#d4d4d4", fontSize: 13, fontWeight: 800 };
const eyebrowStyle: CSSProperties = { color: "#a3a3a3", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" };
const itemListStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 12 };
const itemStyle: CSSProperties = { padding: 14, border: "1px solid #2c2c2c", borderRadius: 12, background: "#151515" };
const badgeRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const badgeStyle: CSSProperties = { display: "inline-flex", padding: "4px 8px", borderWidth: 1, borderStyle: "solid", borderRadius: 999, fontSize: 11, lineHeight: 1, fontWeight: 800, whiteSpace: "nowrap" };
const dateStyle: CSSProperties = { color: "#858585", fontSize: 12 };
const itemTitleStyle: CSSProperties = { margin: "9px 0 5px", fontSize: 17, lineHeight: 1.3 };
const cardTextStyle: CSSProperties = { margin: "6px 0 0", color: "#c7c7c7", lineHeight: 1.5, whiteSpace: "pre-wrap" };
const blockedByStyle: CSSProperties = { marginTop: 10, padding: "8px 10px", borderLeft: "3px solid #ef4444", background: "#251313", color: "#fecaca", fontSize: 13 };
const metaStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, color: "#8f8f8f", fontSize: 12 };
const refreshStyle: CSSProperties = { padding: "11px 14px", borderRadius: 10, border: "1px solid #404040", background: "#171717", color: "#f5f5f5", fontWeight: 700, cursor: "pointer" };
