import { LlmProvider, RawRow, CandidateRecord } from "../llm/LlmProvider";
import { validateRecord, ValidationResult } from "../validate/validator";

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
const LLM_CONCURRENCY = 2;
const LLM_MAX_RETRIES = 3;

/**
 * Deterministic fallback mapper when LLM fails entirely for a batch.
 */
function deterministicFallbackMap(rows: RawRow[]): CandidateRecord[] {
  return rows.map(row => {
    // We try to pull name, company, email, phone based on raw text
    const lowerKeys = Object.keys(row.cells).map(k => k.toLowerCase());
    
    // Very naive extraction, the validator will do the heavy regex extraction anyway!
    // So we just need to pass the raw data in roughly the right fields or even blank fields 
    // and let the validator extract phone/email from the full row text.
    
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
      // Ensure we got one candidate per row, echo rowIndex
      // If we are missing some, we could retry, but here we just return what we got
      // and let the caller handle missing rows if needed. 
      // Actually, if length is completely wrong, we might want to throw.
      if (candidates.length < batch.length / 2) {
        throw new Error("LLM returned too few rows");
      }
      return candidates;
    } catch (error: any) {
      attempt++;
      console.error(`Batch LLM error on attempt ${attempt}: ${error.message}`);
      if (attempt >= LLM_MAX_RETRIES) {
        console.warn(`Batch failed after ${LLM_MAX_RETRIES} attempts, falling back.`);
        return deterministicFallbackMap(batch);
      }
      // Exponential backoff + jitter
      const delay = (Math.pow(2, attempt) * 1000) + (Math.random() * 1000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  return deterministicFallbackMap(batch); // Fallback if all else fails
}

/**
 * Runs a pool of promises with limited concurrency.
 */
async function runWithConcurrency<T, R>(
  items: T[], 
  concurrency: number, 
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  
  const workers = Array(concurrency).fill(0).map(async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const result = await processor(items[currentIndex]);
      results[currentIndex] = result;
    }
  });
  
  await Promise.all(workers);
  return results;
}

export async function extractAndValidate(rows: RawRow[], llm: LlmProvider): Promise<ExtractionResult> {
  const batches: RawRow[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  // Process all batches with concurrency limit
  const batchResults = await runWithConcurrency(batches, LLM_CONCURRENCY, async (batch) => {
    return processBatch(batch, llm);
  });
  
  // Flatten candidate records
  const allCandidates: CandidateRecord[] = batchResults.flat();
  const candidateMap = new Map<number, CandidateRecord>();
  allCandidates.forEach(c => candidateMap.set(c.rowIndex, c));

  // Validate and assemble final result
  const records: any[] = [];
  const skipped: Array<{rowIndex: number, reason: string, originalData: any}> = [];
  
  for (const row of rows) {
    let candidate = candidateMap.get(row.rowIndex);
    if (!candidate) {
      // Missing from LLM response (row misalignment/drop)
      // Fallback deterministically for this single row
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
