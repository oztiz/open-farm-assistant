export type Entity = {
  id: string;
  entity_type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  current_odometer_km: number | null;
  current_engine_hours: number | null;
  meter_reading_at: string | null;
};

export type Attachment = {
  id: string;
  memory_id: string;
  attachment_type: string;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
};

export type Memory = {
  id: string;
  occurred_at: string | null;
  recorded_at: string;
  memory_type: string;
  title: string;
  content: string;
  importance: number;
  status: string;
  source: string;
  odometer_km: number | null;
  engine_hours: number | null;
};

export type TimelineItem = Memory & {
  attachments: Array<Attachment & { objectUrl?: string }>;
};

export type ProjectDashboardItem = {
  project_entity_id: string;
  project_name: string;
  memory_id: string;
  memory_type: string;
  title: string;
  content: string;
  status: string | null;
  importance: number | null;
  occurred_at: string | null;
  recorded_at: string;
  metadata: Record<string, unknown> | null;
  verification_status: string | null;
  workflow_state: string | null;
  blocked_by: unknown;
  dashboard_section: string | null;
  section_order: number | null;
};

export type MaintenanceItem = {
  id: string;
  entity_id: string;
  name: string;
  description: string | null;
  last_service_memory_id: string | null;
  last_performed_at: string | null;
  last_odometer_km: number | null;
  last_engine_hours: number | null;
  interval_km: number | null;
  interval_hours: number | null;
  interval_days: number | null;
  current_odometer_km: number | null;
  current_engine_hours: number | null;
  next_due_km: number | null;
  next_due_hours: number | null;
  next_due_date: string | null;
  maintenance_status: "ok" | "due_soon" | "overdue";
  metadata: Record<string, unknown>;
  remaining_km: number | null;
  remaining_hours: number | null;
  remaining_days: number | null;
};

export type MeterReadingInput = {
  odometer_km: number | null;
  engine_hours: number | null;
};

export type MaintenancePlanInput = {
  name: string;
  description: string | null;
  interval_km: number | null;
  interval_hours: number | null;
  interval_days: number | null;
  last_service_memory_id: string | null;
};

export type MaintenancePlanFormInput = MaintenancePlanInput & {
  last_performed_at: string | null;
  last_odometer_km: number | null;
  last_engine_hours: number | null;
};
