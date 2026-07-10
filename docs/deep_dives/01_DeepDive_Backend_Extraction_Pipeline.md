# Deep Dive 01 — Backend Extraction Pipeline (+ API contract)

> **Status: authoritative reference.** `MASTER_BLUEPRINT.md` Part III is the self-contained distillation; this file expands it with buildable detail. If the two diverge, Part III governs and you log it in `PROGRESS.md`. Nothing here needs a database — results are computed per request and returned.

## Scope
Everything from the uploaded CSV bytes to the `ImportResult` JSON: routing/upload, parsing, the LLM client, batch orchestration, deterministic validation, and the API contract (incl. the SSE progress variant).

## Module map & data flow
```
POST /api/import (routes/import.ts)
   │  multer memory upload → Buffer
   ▼
csvParser.parse(buffer) ──► RawRow[]  { rowIndex, cells:{<origHeader>:value} }
   ▼
extractor.run(rawRows, provider) ──► CandidateRecord[]   (batched, concurrent, retried)
   │        └── provider.mapBatch(batch)  [geminiProvider]  ← only file importing the SDK
   ▼
validator.validate(candidate, rawRow) ──► CrmLead | Skip
   ▼
assemble ImportResult { summary, records, skipped }  → res.json(...)
```

---

## 1. Routing & upload (`routes/import.ts`)
- `multer({ storage: memoryStorage(), limits: { fileSize: config.MAX_FILE_MB*1024*1024 } })`, single field `file`.
- Guards → `400 { error }`: no file; empty buffer; parse yields 0 rows; binary/xlsx signature (`PK\x03\x04`) → "export as CSV".
- Wrap the handler in try/catch → `500`/`502 { error }`; log the correlation id.
- Success → `200 ImportResult`.

## 2. Parsing (`services/csv/csvParser.ts`)
Use **PapaParse**:
```ts
Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim() });
```
- Strip a leading BOM before parsing (`text.replace(/^﻿/, "")`).
- Let the delimiter auto-detect; on a single-column result, retry with `;` then `\t` (ROADBLOCKS §C2).
- **De-duplicate header keys** (`Email`, `Email_2`), synthesize names for blank headers (`col_3`) — never let columns collide (ROADBLOCKS §C4).
- Fold PapaParse's `__parsed_extra` (ragged overflow cells) into the row so nothing is lost.
- Output `RawRow[]`: `{ rowIndex: i, cells: { [header]: String(value ?? "").trim() } }`.
- Missing-header case: if the first row looks like data, parse `header:false` and synthesize `col_1..n` (ROADBLOCKS §C5).

## 3. LLM client (`services/llm/geminiProvider.ts`) — the only SDK importer
- Implements `LlmProvider.mapBatch(rows): Promise<CandidateRecord[]>`.
- Builds the prompt from `prompts/extraction.ts` (system instruction + few-shot + `JSON.stringify(rows)`).
- Calls Gemini with `temperature:0`, `responseMimeType:"application/json"`, `responseSchema`, permissive `safetySettings` (ROADBLOCKS §B6). Give the call a ~30s timeout (`AbortController`).
- Parses `res.text`: strip ``` ```json fences, `JSON.parse` in try/catch; validate it's an array; **throw** on any parse/format/format-mismatch/blocked-response so the extractor's retry catches it (ROADBLOCKS §B4).
- Returns `CandidateRecord[]` joined by `rowIndex` (not position — ROADBLOCKS §B5).
- **Swap seam:** to use Claude/OpenAI instead, add `claudeProvider.ts`/`openaiProvider.ts` implementing the same interface and change one wiring line. Nothing else changes.

## 4. Extractor (`services/extract/extractor.ts`) — orchestration only
- `chunk(rows, BATCH_SIZE)`.
- **Promise pool** at `LLM_CONCURRENCY` (don't `Promise.all` everything — ROADBLOCKS §B1).
- Per batch: `withRetry(() => provider.mapBatch(batch), { retries: LLM_MAX_RETRIES, backoff: exp+jitter, retryOn: rateLimit|5xx|timeout|parseError })`.
- **Graceful degradation:** if a batch permanently fails, run `deterministicFallback(batch)` (regex email/phone + copy obvious columns) so those rows still surface (log `lowConfidence:true`). One bad batch never fails the whole import (ROADBLOCKS §B2).
- Emit progress (`done/total` batches) via a callback the SSE route can forward.
- Returns all `CandidateRecord[]` for validation.

## 5. Validator (`services/validate/validator.ts`) — the final say (pure, tested)
Implements every rule in Blueprint Part III §Validation. Given a `CandidateRecord` **and** its original `RawRow` (so it can re-derive from source, not trust the model):
1. **Collect emails** = regex over all cell values (`/[^\s,;/|]+@[^\s,;/|]+\.[^\s,;/|]+/g`), de-dupe, keep order. First → `email`; rest → `crm_note` ("Other emails: …").
2. **Collect phones** = digit-runs (≥7 digits) across cells; normalize (strip non-digits, keep leading `+`); first → split into `country_code` + `mobile_without_country_code`; rest → `crm_note` ("Other phones: …"). (Splitting logic: ROADBLOCKS §D3.)
3. **Skip rule:** no email AND no mobile → return `{ skip: true, reason: "no email or mobile" }`.
4. **Enums:** normalize (upper/trim/underscore) then clamp `crm_status`/`data_source` to the allowed set; else `""` (ROADBLOCKS §D4–D5).
5. **`created_at`:** if the model gave a value, `new Date(v)`; if `Invalid Date`, try a couple of India-first parses; still invalid → `""`.
6. **Escape newlines** → `\n` in every value.
7. **All 15 keys** present as trimmed strings; merge model-provided fields (name/company/city/etc.) with the code-derived email/phone/notes; return `CrmLead`.

Unit-test each rule in isolation with hand-built inputs (Phase 2.4 / Phase 5).

## 6. Assembly
```ts
const records: CrmLead[] = []; const skipped: SkippedRow[] = [];
for (const c of candidates) {
  const v = validate(c, rawByIndex[c.rowIndex]);
  if ("skip" in v) skipped.push({ rowIndex: c.rowIndex, reason: v.reason, raw: rawByIndex[c.rowIndex].cells });
  else records.push(v);
}
return { summary: { total: rawRows.length, parsed: records.length, skipped: skipped.length }, records, skipped };
```

---

## 7. API contract (authoritative)

### `POST /api/import`
- Request: `multipart/form-data`, field `file` = the `.csv`.
- `200`:
```json
{
  "summary": { "total": 12, "parsed": 9, "skipped": 3 },
  "records": [ { "created_at":"", "name":"Ramesh Kumar", "email":"ramesh@gmail.com",
    "country_code":"91", "mobile_without_country_code":"9876543210", "company":"Kumar Traders",
    "city":"", "state":"", "country":"", "lead_owner":"", "crm_status":"GOOD_LEAD_FOLLOW_UP",
    "crm_note":"Remarks: ... | Other emails: ...", "data_source":"eden_park",
    "possession_time":"", "description":"" } ],
  "skipped": [ { "rowIndex": 2, "reason": "no email or mobile", "raw": { "Name":"Walk-in" } } ]
}
```
- `400 { error }`: no/empty/non-CSV/oversize file. `502 { error }`: LLM unavailable and fallback also failed.

### `GET /api/import/stream` (Phase 4 bonus — progress)
Two viable shapes (pick one — ROADBLOCKS §E4):
- **(a) Job + SSE:** `POST /api/import` returns `{ jobId }` fast; client opens `EventSource("/api/import/stream?id=jobId")`; server emits `event:progress data:{done,total}` per batch, then `event:result data:{ImportResult}`, then closes.
- **(b) Streamed response (simpler):** `POST /api/import` streams NDJSON — one `{"type":"progress",...}` line per batch, final `{"type":"result",...}` — client reads `response.body.getReader()`. No job store needed.
Set `Cache-Control:no-cache`, `X-Accel-Buffering:no`, `flushHeaders()`.

### `GET /health` → `200 { ok: true }`
For uptime pings / cold-start warming (ROADBLOCKS §F1).

---

## 8. Config surface (`config.ts`, all from env with defaults)
| Key | Default | Purpose |
|---|---|---|
| `PORT` | 8080 | server port |
| `GEMINI_API_KEY` | — (required, throws if missing) | secret |
| `GEMINI_MODEL` | `gemini-2.5-flash` | model id (verify current) |
| `BATCH_SIZE` | 20 | rows per LLM call |
| `LLM_CONCURRENCY` | 2 | batches in flight |
| `LLM_MAX_RETRIES` | 3 | per-batch retries |
| `MAX_FILE_MB` | 5 | upload guard |
| `MAX_ROWS` | 1000 | processing cap for the demo (ROADBLOCKS §C7) |
| `CORS_ORIGIN` | `http://localhost:3000` | allowed frontend origin |

## To expand as tasks demand
- Exact `withRetry` implementation and jitter formula.
- The `deterministicFallback` regex mapper details.
- Optional `zod` schema at the LLM boundary for runtime validation of `res.text`.
