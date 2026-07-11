export const CRM_FIELDS = [
  "created_at", "name", "email", "country_code", "mobile_without_country_code",
  "company", "city", "state", "country", "lead_owner", "crm_status",
  "crm_note", "data_source", "possession_time", "description"
] as const;

export type CrmField = (typeof CRM_FIELDS)[number];

export const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"
] as const;

export type CrmStatus = (typeof CRM_STATUS_VALUES)[number] | "";

export const DATA_SOURCE_VALUES = [
  "leads_on_demand", "meridian_tower", "eden_park", "varah_swamy", "sarjapur_plots"
] as const;

export type DataSource = (typeof DATA_SOURCE_VALUES)[number] | "";

export type CrmLead = Record<CrmField, string>;

export interface SkippedRow {
  rowIndex: number;
  reason: string;
  originalData: Record<string, string>;
}

export interface ImportSummary {
  totalRows: number;
  successCount: number;
  skippedCount: number;
}

export interface ImportResult {
  summary: ImportSummary;
  records: CrmLead[];
  skipped: SkippedRow[];
}

export type Step = "upload" | "preview" | "loading" | "result" | "error";

export type AppState = {
  step: Step;
  file: File | null;
  previewRows: Record<string, string>[];
  previewCols: string[];
  result: ImportResult | null;
  error: string | null;
  progress: { done: number; total: number } | null;
};
