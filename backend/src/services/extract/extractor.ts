import { LlmProvider, RawRow, CandidateRecord } from "../llm/LlmProvider";
import { validateRecord, ValidationResult } from "../validate/validator";
import { parseCsvStream } from "../csv/csvParser";
import { logger } from "../../util/logger";

export interface ExtractionResult {
  summary: {
    totalRows: number;
    successCount: number;
    skippedCount: number;
  };
  records: any[]; // The validated CRM leads
  skipped: Array<{
    rowIndex: number;
    reason: string;
    originalData: Record<string, string>;
  }>;
}

const BATCH_SIZE = 20;
const LLM_CONCURRENCY = 2; // Not used in simple stream handling, we await batches sequentially or we can use a queue.
const LLM_MAX_RETRIES = 3;

/**
 * Deterministic fallback mapper when LLM fails entirely for a batch.
 */
function deterministicFallbackMap(rows: RawRow[]): CandidateRecord[] {
  return rows.map(row => {
    const lowerKeys = Object.keys(row.cells).map(k => k.toLowerCase());
    
    let name = "";
    let company = "";
    let email = "";
    let phone = "";
    
    for (const [key, value] of Object.entries(row.cells)) {
      const lk = key.toLowerCase();
      if (lk.includes("name") || lk.includes("customer")) name = value;
      else if (lk.includes("company") || lk.includes("firm")) company = value;
      else if (lk.includes("email") || lk.includes("e-mail")) email = value;
      else if (lk.includes("phone") || lk.includes("mobile") || lk.includes("contact")) phone = value;
    }

    return {
      rowIndex: row.rowIndex,
      fields: {
        name,
        company,
        email,
        mobile_without_country_code: phone,
        crm_note: "FALLBACK_MAPPED: " + JSON.stringify(row.cells).substring(0, 200)
      }
    };
  });
}

/**
 * Process a single batch with exponential backoff retries.
 */
async function processBatch(
  batch: RawRow[], 
  llm: LlmProvider
): Promise<CandidateRecord[]> {
  let attempt = 0;
  
  while (attempt < LLM_MAX_RETRIES) {
    try {
      const candidates = await llm.mapBatch(batch);
      if (candidates.length < Math.floor(batch.length / 2)) {
        throw new Error("LLM returned too few rows");
      }
      return candidates;
    } catch (error: any) {
      attempt++;
      logger.warn(`Batch LLM error on attempt ${attempt}: ${error.message}`);
      if (attempt >= LLM_MAX_RETRIES) {
        logger.warn(`Batch failed after ${LLM_MAX_RETRIES} attempts, falling back.`);
        return deterministicFallbackMap(batch);
      }
      const delay = (Math.pow(2, attempt) * 1000) + (Math.random() * 1000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  return deterministicFallbackMap(batch);
}

/**
 * Runs a pool of promises with limited concurrency.
 */
async function runWithConcurrency<T, R>(
  items: T[], 
  concurrency: number, 
  processor: (item: T) => Promise<R>,
  onBatchProcessed?: (index: number) => void
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  
  const workers = Array(concurrency).fill(0).map(async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await processor(items[currentIndex]);
      results[currentIndex] = result;
      if (onBatchProcessed) {
        onBatchProcessed(currentIndex);
      }
    }
  });
  
  await Promise.all(workers);
  return results;
}

export async function extractAndValidate(
  rows: RawRow[], 
  llm: LlmProvider,
  onProgress?: (done: number, total: number) => void
): Promise<ExtractionResult> {
  const batches: RawRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  let completedBatches = 0;

  const batchResults = await runWithConcurrency(batches, LLM_CONCURRENCY, async (batch) => {
    return processBatch(batch, llm);
  }, () => {
    completedBatches++;
    if (onProgress) {
      const doneRows = Math.min(completedBatches * BATCH_SIZE, rows.length);
      onProgress(doneRows, rows.length);
    }
  });
  
  const allCandidates: CandidateRecord[] = batchResults.flat();
  const candidateMap = new Map<number, CandidateRecord>();
  allCandidates.forEach(c => candidateMap.set(c.rowIndex, c));

  const records: any[] = [];
  const skipped: Array<{rowIndex: number, reason: string, originalData: any}> = [];
  
  for (const row of rows) {
    let candidate = candidateMap.get(row.rowIndex);
    if (!candidate) {
      candidate = deterministicFallbackMap([row])[0];
    }
    
    const valResult = validateRecord(candidate, row);
    if (valResult.valid && valResult.lead) {
      records.push(valResult.lead);
    } else {
      skipped.push({
        rowIndex: row.rowIndex,
        reason: valResult.reason || "Validation failed",
        originalData: row.cells
      });
    }
  }

  return {
    summary: {
      totalRows: rows.length,
      successCount: records.length,
      skippedCount: skipped.length
    },
    records,
    skipped
  };
}

/**
 * Stream-based extraction and validation.
 * Reads the CSV from disk, processing it in batches without keeping all raw rows in memory.
 */
export async function extractAndValidateStream(
  filePath: string,
  llm: LlmProvider,
  onProgress?: (done: number) => void
): Promise<ExtractionResult> {
  const records: any[] = [];
  const skipped: Array<{rowIndex: number, reason: string, originalData: any}> = [];
  let totalRows = 0;
  let doneRows = 0;

  // We await each batch sequentially to control memory entirely and avoid overloading the LLM.
  // We could implement an async queue for concurrency=2, but sequential is safest for strict memory.
  
  await parseCsvStream(filePath, BATCH_SIZE, async (batch: RawRow[]) => {
    totalRows += batch.length;
    
    const candidates = await processBatch(batch, llm);
    
    const candidateMap = new Map<number, CandidateRecord>();
    candidates.forEach(c => candidateMap.set(c.rowIndex, c));

    for (const row of batch) {
      let candidate = candidateMap.get(row.rowIndex);
      if (!candidate) {
        candidate = deterministicFallbackMap([row])[0];
      }
      
      const valResult = validateRecord(candidate, row);
      if (valResult.valid && valResult.lead) {
        records.push(valResult.lead);
      } else {
        skipped.push({
          rowIndex: row.rowIndex,
          reason: valResult.reason || "Validation failed",
          originalData: row.cells
        });
      }
    }

    doneRows += batch.length;
    if (onProgress) {
      onProgress(doneRows); // Note: total is unknown during stream
    }
  });

  return {
    summary: {
      totalRows,
      successCount: records.length,
      skippedCount: skipped.length
    },
    records,
    skipped
  };
}
