import Papa from "papaparse";
import fs from "fs";
import { RawRow } from "../llm/LlmProvider";

/**
 * Streaming CSV parser. Parses a file incrementally and yields batches of RawRows.
 */
export function parseCsvStream(
  filePath: string,
  batchSize: number,
  onBatch: (batch: RawRow[]) => Promise<void>
): Promise<void> {
  return new Promise((resolve, reject) => {
    let headerMap = new Map<string, string>();
    let seenHeaders = new Set<string>();
    let emptyColCounter = 1;
    let isFirstRow = true;

    let currentBatch: RawRow[] = [];
    let rowIndex = 0;

    const fileStream = fs.createReadStream(filePath);

    Papa.parse(fileStream, {
      header: true,
      skipEmptyLines: "greedy",
      step: function(results, parser) {
        // results.data is an object with original headers as keys
        const row = results.data as Record<string, string>;

        if (isFirstRow) {
          isFirstRow = false;
          // Set up headers
          const fields = results.meta.fields || [];
          for (const originalHeader of fields) {
            let finalHeader = originalHeader.trim();
            if (!finalHeader) {
              finalHeader = `col_${emptyColCounter++}`;
            }
            
            let deduplicatedHeader = finalHeader;
            let counter = 2;
            while (seenHeaders.has(deduplicatedHeader)) {
              deduplicatedHeader = `${finalHeader}_${counter++}`;
            }
            seenHeaders.add(deduplicatedHeader);
            headerMap.set(originalHeader, deduplicatedHeader);
          }
        }

        const cells: Record<string, string> = {};
        for (const originalHeader of Object.keys(row)) {
          if (originalHeader === "__parsed_extra") continue;
          
          const mappedHeader = headerMap.get(originalHeader) || originalHeader;
          cells[mappedHeader] = String(row[originalHeader] ?? "").trim();
        }

        if (row["__parsed_extra"]) {
          const extraArray = row["__parsed_extra"] as unknown as string[];
          if (Array.isArray(extraArray)) {
            extraArray.forEach((val, i) => {
              cells[`__parsed_extra_${i + 1}`] = String(val ?? "").trim();
            });
          }
        }

        currentBatch.push({ rowIndex: rowIndex++, cells });

        if (currentBatch.length >= batchSize) {
          parser.pause();
          const batchToProcess = currentBatch;
          currentBatch = [];
          onBatch(batchToProcess)
            .then(() => {
              parser.resume();
            })
            .catch((err) => {
              parser.abort();
              reject(err);
            });
        }
      },
      complete: function() {
        if (currentBatch.length > 0) {
          onBatch(currentBatch)
            .then(() => resolve())
            .catch(reject);
        } else {
          resolve();
        }
      },
      error: function(error) {
        reject(error);
      }
    });
  });
}

// Preserve synchronous memory-based parsing for small unit tests
export function parseCsv(buffer: Buffer): RawRow[] {
  let text = buffer.toString("utf8");
  text = text.replace(/^\uFEFF/, "");

  const firstLine = text.split("\n")[0] || "";
  const looksLikeData = /@|\d{7,}/.test(firstLine);

  if (looksLikeData) {
    const result = Papa.parse(text, {
      skipEmptyLines: "greedy",
      header: false,
    } as any) as any;
    return processNoHeaderResult(result);
  }

  let result = Papa.parse(text, {
    skipEmptyLines: "greedy",
    header: true,
  } as any) as any;

  if (result.meta.fields && result.meta.fields.length === 1 && result.data.length > 0) {
    const textSample = text.slice(0, 1000);
    const semiResult = Papa.parse(textSample, { header: true, delimiter: ";" } as any) as any;
    const tabResult = Papa.parse(textSample, { header: true, delimiter: "\t" } as any) as any;
    
    if (semiResult.meta.fields && semiResult.meta.fields.length > 1) {
      result = Papa.parse(text, { skipEmptyLines: "greedy", header: true, delimiter: ";" } as any) as any;
    } else if (tabResult.meta.fields && tabResult.meta.fields.length > 1) {
      result = Papa.parse(text, { skipEmptyLines: "greedy", header: true, delimiter: "\t" } as any) as any;
    }
  }

  return processHeaderResult(result);
}

function processNoHeaderResult(result: Papa.ParseResult<string[]>): RawRow[] {
  const rawRows: RawRow[] = [];
  result.data.forEach((rowArray, index) => {
    const cells: Record<string, string> = {};
    rowArray.forEach((val, colIdx) => {
      cells[`col_${colIdx + 1}`] = String(val ?? "").trim();
    });
    rawRows.push({ rowIndex: index, cells });
  });
  return rawRows;
}

function processHeaderResult(result: Papa.ParseResult<Record<string, string>>): RawRow[] {
  const fields = result.meta.fields || [];
  const headerMap = new Map<string, string>();
  const seenHeaders = new Set<string>();
  let emptyColCounter = 1;

  for (const originalHeader of fields) {
    let finalHeader = originalHeader.trim();
    if (!finalHeader) {
      finalHeader = `col_${emptyColCounter++}`;
    }
    
    let deduplicatedHeader = finalHeader;
    let counter = 2;
    while (seenHeaders.has(deduplicatedHeader)) {
      deduplicatedHeader = `${finalHeader}_${counter++}`;
    }
    seenHeaders.add(deduplicatedHeader);
    headerMap.set(originalHeader, deduplicatedHeader);
  }

  const rawRows: RawRow[] = [];
  
  result.data.forEach((row, index) => {
    const cells: Record<string, string> = {};
    for (const originalHeader of Object.keys(row)) {
      if (originalHeader === "__parsed_extra") continue;
      const mappedHeader = headerMap.get(originalHeader) || originalHeader;
      cells[mappedHeader] = String(row[originalHeader] ?? "").trim();
    }
    if (row["__parsed_extra"]) {
      const extraArray = row["__parsed_extra"] as unknown as string[];
      if (Array.isArray(extraArray)) {
        extraArray.forEach((val, i) => {
          cells[`__parsed_extra_${i + 1}`] = String(val ?? "").trim();
        });
      }
    }
    rawRows.push({ rowIndex: index, cells });
  });

  return rawRows;
}
