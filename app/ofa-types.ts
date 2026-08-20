export type Entity = {
  id: string;
  entity_type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
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
