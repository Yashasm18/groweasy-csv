import { CrmLead } from "../../domain/crm";

export interface RawRow {
  rowIndex: number;
  cells: Record<string, string>;
}

export interface CandidateRecord {
  rowIndex: number;
  fields: Partial<CrmLead>;
}

export interface LlmProvider {
  /** Map a batch of raw CSV rows to candidate CRM records. MUST return one
   *  candidate per input row, in the same order (echo rowIndex). Output is
   *  UNTRUSTED and re-validated downstream. Throws on transient/API errors so
   *  the extractor's retry can catch them. */
  mapBatch(rows: RawRow[]): Promise<CandidateRecord[]>;
}
