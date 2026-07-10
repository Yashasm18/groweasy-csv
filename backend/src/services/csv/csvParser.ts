import Papa from "papaparse";
import { RawRow } from "../llm/LlmProvider";

export function parseCsv(buffer: Buffer): RawRow[] {
  let text = buffer.toString("utf8");
  // Strip BOM
  text = text.replace(/^\uFEFF/, "");

  // Heuristic: check if the first line looks like data (has @ or long digits)
  const firstLine = text.split("\n")[0] || "";
  const looksLikeData = /@|\d{7,}/.test(firstLine);

  let parseOptions: Papa.ParseConfig<string[]> | Papa.ParseConfig<Record<string, string>> = {
    skipEmptyLines: "greedy",
  };

  if (looksLikeData) {
    // Parse without headers, synthesize col_1, col_2, etc.
    const result = Papa.parse<string[]>(text, {
      ...parseOptions,
      header: false,
    });
    
    return processNoHeaderResult(result);
  }

  // Parse with headers
  let result = Papa.parse<Record<string, string>>(text, {
    ...parseOptions,
    header: true,
  });

  // Delimiter fallback logic (if single column returned, maybe it failed to sniff)
  if (result.meta.fields && result.meta.fields.length === 1 && result.data.length > 0) {
    // Check if another delimiter yields more columns
    const textSample = text.slice(0, 1000);
    const semiResult = Papa.parse(textSample, { header: true, delimiter: ";" });
    const tabResult = Papa.parse(textSample, { header: true, delimiter: "\t" });
    
    if (semiResult.meta.fields && semiResult.meta.fields.length > 1) {
      result = Papa.parse<Record<string, string>>(text, { ...parseOptions, header: true, delimiter: ";" });
    } else if (tabResult.meta.fields && tabResult.meta.fields.length > 1) {
      result = Papa.parse<Record<string, string>>(text, { ...parseOptions, header: true, delimiter: "\t" });
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
  
  // Deduplicate and normalize headers
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
    
    // PapaParse returns an object keyed by the exact original header string
    for (const originalHeader of Object.keys(row)) {
      // Avoid __parsed_extra for now, handle it separately
      if (originalHeader === "__parsed_extra") continue;
      
      const mappedHeader = headerMap.get(originalHeader) || originalHeader;
      cells[mappedHeader] = String(row[originalHeader] ?? "").trim();
    }

    // Handle __parsed_extra (ragged overflow cells)
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
