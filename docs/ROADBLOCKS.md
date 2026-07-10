# ROADBLOCKS — Failure-Mode Playbook & Pre-Mortem

> **Read this the moment anything breaks, feels risky, or you're about to guess.** This is a pre-mortem: it walks every place this project realistically goes wrong and gives the concrete fix. It is written defensively on purpose — assume the builder (Gemini) has no outside context and will hit these. Each entry: **Symptom → Cause → Fix (do this)**. Likelihood/severity tags help you triage: 🔴 will-happen / 🟠 likely / 🟡 possible.

**Golden rules when stuck:**
1. **The LLM is untrusted.** If output is wrong, the fix usually belongs in `validator.ts` (deterministic), not in more prompt-begging.
2. **Prove on the four sample CSVs**, not on your imagination. `docs/sample-data/` is the acceptance corpus.
3. **Backend-only secrets.** If you ever typed `GEMINI_API_KEY` in frontend code, stop and move it.
4. **Deploy on day 1, not the last hour.** Cold deploys surface CORS/env/cold-start bugs that take time. See §F.
5. When two doc sections disagree, `MASTER_BLUEPRINT.md` Part III wins; log the conflict in `PROGRESS.md`.

---

## A. Environment & Project Setup

### A1. 🔴 "It works on my machine" — two apps, two `package.json`, confusion about what to run
- **Cause:** monorepo with separate `frontend/` and `backend/`; running `npm run dev` in the wrong folder.
- **Fix:** Backend and frontend are **independent**. Two terminals: `cd backend && npm run dev` (port 8080) and `cd frontend && npm run dev` (port 3000). Document both in the README. Do **not** try to make one `npm install` at the root install both unless you set up npm workspaces — and for this deadline, don't bother; keep them fully separate and simple.

### A2. 🔴 CORS: browser blocks the frontend→backend call
- **Symptom:** `Access to fetch at 'http://localhost:8080/api/import' from origin 'http://localhost:3000' has been blocked by CORS policy`.
- **Cause:** Express not sending `Access-Control-Allow-Origin` for the frontend origin.
- **Fix:** `app.use(cors({ origin: config.CORS_ORIGIN, credentials: false }))`. Set `CORS_ORIGIN=http://localhost:3000` in dev and `=https://<your-app>.vercel.app` in prod. For SSE, CORS still applies — the same middleware covers it. If you briefly need to unblock everything while debugging, `cors()` with no args allows all origins — but **tighten it before submitting** (a wide-open CORS on a graded backend is a code-quality ding).

### A3. 🟠 `GEMINI_API_KEY is undefined` at runtime
- **Cause:** `.env` not loaded, or wrong folder, or Next.js env not prefixed.
- **Fix:** Backend: `import "dotenv/config"` **at the very top** of `index.ts` (before anything reads `process.env`), keep `.env` in `backend/`. Frontend: only `NEXT_PUBLIC_`-prefixed vars reach the browser; the API **base URL** is public (`NEXT_PUBLIC_API_BASE_URL`), the **Gemini key is not** and must never appear in `frontend/`. On startup, `config.ts` should throw a clear error if `GEMINI_API_KEY` is missing — fail fast, don't discover it mid-import.

### A4. 🟡 TypeScript `strict` errors stall the build
- **Cause:** `strict: true` (which you want) plus untyped SDK responses.
- **Fix:** Type the boundaries: give `mapBatch` a real return type and parse the SDK response into it. Don't sprinkle `any` — use `unknown` + a small runtime check (or `zod`) at the LLM boundary. This runtime check doubles as your defense against malformed model output (§B4).

### A5. 🟡 Node version / ESM-vs-CJS import errors
- **Cause:** mixing `require` and `import`, or old Node.
- **Fix:** Use **Node 20+**. Pick one module system for the backend and stick to it (TS + `"module":"commonjs"` compiled via `tsx`/`ts-node` in dev is the least-friction path; or ESM throughout — just be consistent). Pin the engine in `package.json` (`"engines": {"node": ">=20"}`) so Render uses it.

---

## B. Gemini / LLM — the highest-risk area

### B0. 🔴 Using an outdated SDK shape or a wrong model id
- **Cause:** Gemini's SDK and model names change; training data is stale.
- **Fix:** Use the current **Google Gen AI SDK** (`npm i @google/genai`). The current pattern is roughly:
  ```ts
  import { GoogleGenAI } from "@google/genai";
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: config.GEMINI_MODEL,                 // e.g. "gemini-2.5-flash"
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: BATCH_RESPONSE_SCHEMA,     // see PROMPT_ENGINEERING.md
      // safetySettings: see B6
    },
  });
  const text = res.text;                         // JSON string per the schema
  ```
  **Before writing this, verify the exact current SDK + model id** from the official Gemini API docs (or Context7 if available). Keep the model id in `config.GEMINI_MODEL` so a rename is a one-line change. The older `@google/generative-ai` package also works; if you use it, its call is `getGenerativeModel({model}).generateContent(...)` and JSON mode is `generationConfig.responseMimeType/responseSchema`. **Pick one SDK; don't mix.**

### B1. 🔴 Rate limits — `429 Too Many Requests` / quota exceeded (free tier)
- **Cause:** Gemini free tier caps requests-per-minute (RPM), tokens-per-minute (TPM), and requests-per-day (RPD). Firing all batches at once blows RPM instantly.
- **Fix (layered):**
  1. **Batch** rows (`BATCH_SIZE=20`) so N rows = N/20 requests, not N.
  2. **Limit concurrency** to `LLM_CONCURRENCY=2` (a small promise pool), not `Promise.all` over every batch.
  3. **Exponential backoff + jitter** on 429/5xx: wait `base * 2^attempt + random`, up to `LLM_MAX_RETRIES=3`. Respect a `Retry-After` header if present.
  4. Keep total rows sane for the demo (cap or paginate very large files — §C7).
  5. If you still hit RPD during heavy testing, get a second free key or switch models via `config.GEMINI_MODEL`; the interface makes provider/model swaps cheap.

### B2. 🟠 One bad batch shouldn't kill the whole import
- **Cause:** a single batch times out or keeps failing after retries.
- **Fix:** the extractor **degrades gracefully** — after retries are exhausted for a batch, run the **deterministic fallback mapper** on just those rows (regex-extract email/phone, copy obvious columns like `name`/`company`, leave the rest blank) so those leads still appear (flagged lower-confidence in logs). Never `throw` out of the whole request because one batch failed. This is also your "retry mechanism" bonus, done properly.

### B3. 🟠 Model returns valid-looking JSON but **wrong values** (hallucinated enums, invented emails, dropped fields)
- **Cause:** LLMs improvise.
- **Fix:** **`validator.ts` is the guarantee, not the prompt.** Clamp `crm_status`/`data_source` to the allowed sets (blank otherwise), re-extract emails/phones from the *original* row with regex (don't trust the model's copy), enforce all-15-keys, blank invalid dates. Ask the model to do the right thing, but **verify every field in code**. If the model invents an email that isn't in the source row, the regex-from-source approach naturally overrides it.

### B4. 🔴 Model returns non-JSON, truncated JSON, or extra prose despite JSON mode
- **Symptom:** `JSON.parse` throws; or you get ```` ```json ... ``` ```` fences.
- **Cause:** occasional format slips, token cutoff on a big batch, or markdown fences.
- **Fix:**
  1. Prefer `responseMimeType:"application/json"` + `responseSchema` (strongly reduces this).
  2. Still wrap parsing defensively: strip ``` ```json / ``` ``` fences, trim, then `JSON.parse` inside try/catch.
  3. On parse failure → treat as a transient error → **retry** (§B1) with a smaller batch if it recurs.
  4. Guard against **truncation**: if the returned array length < batch length, retry the missing rows; if a single row is huge, it may blow the output token budget — shrink the batch or truncate oversized cells (§C, D2). Keep `BATCH_SIZE` modest (20) precisely to bound output size.

### B5. 🟠 Row misalignment — model returns N-1 records, or reorders them
- **Cause:** the model merges/splits/drops rows.
- **Fix:** **Echo `rowIndex`.** Send each row as `{rowIndex, cells}` and require it back in the schema; then **join on `rowIndex`**, never on array position. Any input `rowIndex` missing from the output → send those specific rows again (retry) or fall back deterministically (§B2). This makes alignment robust regardless of order.

### B6. 🟡 Safety filters block a response (`finishReason: SAFETY` / empty candidates)
- **Cause:** default safety thresholds occasionally trip on ordinary text (names, notes).
- **Fix:** For this benign business-data task, set `safetySettings` to the most permissive allowed thresholds (e.g. `BLOCK_NONE`/`OFF` per category) in the Gemini `config`. If a response still comes back blocked/empty, treat it as a failed batch → retry/fallback (§B2), and log the `finishReason`. Never crash on a missing `.text`.

### B7. 🟡 Latency — large files take a long time; requests feel hung
- **Cause:** many sequential batches at low concurrency.
- **Fix:** This is expected and fine — that's what the **progress UI (SSE)** is for (§E4, Phase 4). Give each Gemini call a timeout (e.g. 30s) so a hung request fails into retry rather than hanging forever. Tune `BATCH_SIZE`/`LLM_CONCURRENCY` up carefully only if rate limits allow.

### B8. 🟡 Cost / quota anxiety during testing
- **Cause:** re-running the full corpus repeatedly.
- **Fix:** During Phase 2 dev, test against **small slices** (first 5–10 rows) and the tiny `messy_edgecases.csv`; only run full files at gate checks. Flash models are cheap, but the free RPD is finite — don't burn it on every save.

---

## C. CSV Parsing Edge Cases

### C1. 🔴 Do NOT split on commas yourself
- **Cause:** `line.split(",")` shatters on quoted fields containing commas/newlines.
- **Fix:** Always use **PapaParse** (`header:true, skipEmptyLines:"greedy", dynamicTyping:false`). It handles quotes, escaped quotes, embedded commas, and embedded newlines correctly. Never hand-roll CSV parsing.

### C2. 🟠 Wrong delimiter (semicolon/tab) — everything lands in one column
- **Cause:** European exports use `;`; some use tabs.
- **Fix:** Let PapaParse **auto-detect** (leave `delimiter` unset, it sniffs). If detection ever fails, fall back to trying `;` and `\t` and picking the parse that yields >1 column. Log which delimiter was used.

### C3. 🟠 BOM / encoding — first header comes out as `﻿Name`, or accented chars are mojibake
- **Cause:** UTF-8 BOM prefix, or non-UTF-8 (Latin-1) source.
- **Fix:** Strip a leading BOM (`text.replace(/^﻿/, "")`) before parsing, or read the buffer as `utf8` after BOM removal. Normalize header keys (trim, strip BOM) when building `cells`. For genuinely non-UTF-8 files, UTF-8 decode covers the vast majority; don't over-engineer transcoding for the deadline — just don't crash.

### C4. 🟠 Duplicate or empty header names collide
- **Symptom:** two columns named `Email`, or blank headers, overwrite each other in the row object.
- **Fix:** When building `cells`, **de-duplicate header keys** (`Email`, `Email_2`, …) and give empty headers a synthetic name (`col_3`). Preserve the original text in the value context so the LLM still sees intent. Never silently drop a column.

### C5. 🟡 No header row (data starts immediately)
- **Cause:** some exports omit headers.
- **Fix:** Heuristic: if the first row looks like data (e.g. contains an `@` or a long digit run), parse with `header:false` and synthesize `col_1..col_n`; the LLM maps positionally-named columns by their *values*. This is an edge case — handle it gracefully, don't block the common (header present) path on it.

### C6. 🟡 Ragged rows — inconsistent column counts
- **Cause:** trailing commas, merged cells from Excel, malformed export.
- **Fix:** PapaParse tolerates this; missing cells become `""`, extra cells go to `__parsed_extra` (fold those into the row's misc so they can reach `crm_note`). Don't reject the file for raggedness; clean it.

### C7. 🟠 Huge files — memory blowup / rate-limit wall / UI jank
- **Cause:** a 50k-row CSV.
- **Fix:** (a) Enforce `MAX_FILE_MB` (default 5) on upload with a clear message. (b) For the demo, optionally **cap processed rows** (e.g. first `MAX_ROWS=1000`) and tell the user "showing first N" — an honest, documented limit beats a crash. (c) Frontend preview: **virtualize** or cap to first ~100 rows (§E1). (d) Streaming/incremental parse is a listed bonus, not required.

### C8. 🟡 Empty file / not a CSV / wrong MIME type
- **Cause:** user uploads `.xlsx`, an image, or an empty file; browsers mislabel CSV as `application/vnd.ms-excel`.
- **Fix:** Validate by **extension + non-empty content + successful parse yielding ≥1 row**, not by MIME alone (MIME is unreliable). On failure → `400` with a specific message the UI shows ("That file isn't a readable CSV — export as CSV and try again"). A true `.xlsx` is a binary zip; detect the `PK` signature and reject with "Please export the sheet as CSV."

### C9. 🟡 Multiple values in one cell (`a@x.com; b@y.com` or `9876543210 / 9123456789`)
- **Cause:** merged contact fields.
- **Fix:** In the validator, split each cell's candidate emails/phones on `[;,/|\n]` and whitespace, regex-filter to valid tokens, **first wins**, rest → `crm_note`. This is a **core graded rule** (C4 in the rubric), so it lives in deterministic code, tested.

---

## D. Field Mapping & Data Quality (the accuracy that gets graded)

### D1. 🔴 Ambiguous / unseen column names not mapping (`"Cust Full Nm"`, `"Mob No."`, `"Remarks 2"`)
- **Cause:** the whole point — arbitrary headers.
- **Fix:** This is the LLM's job; give it the **original header names** in the batch and strong few-shot examples (`PROMPT_ENGINEERING.md`). Add a short synonym hint list in the system prompt (name/full name/contact → `name`; mobile/phone/cell/whatsapp → phone; remarks/notes/comments → `crm_note`). Don't hardcode a synonym table as the *primary* mechanism — it defeats "any CSV" — but a few hints in the prompt sharpen accuracy.

### D2. 🟠 Date chaos — `DD/MM/YYYY` vs `MM/DD/YYYY`, Excel serial numbers (`45678`), epoch ms, text months
- **Cause:** every source dates differently; `new Date("13/07/2026")` is `Invalid Date` in JS.
- **Fix:** Ask the LLM to output `created_at` in **ISO `YYYY-MM-DD`** (it's good at normalizing). Then the validator's `new Date()` check passes. For pure-numeric Excel serials, either let the LLM convert or detect a bare 4–5 digit integer and convert (`epoch 1899-12-30 + n days`). If ambiguous DD/MM vs MM/DD can't be resolved, prefer DD/MM (the assignment is India-context) and, if still invalid, **blank it** per the rule — never emit `Invalid Date`.

### D3. 🟠 Phone/country-code splitting wrong (`+91 98765 43210`, `09876543210`, `919876543210`)
- **Cause:** many phone formats.
- **Fix:** Deterministic in the validator: strip non-digits (keep a leading `+`), then: if it starts `+CC`/`00CC` or is 12 digits starting `91`, split off the country code → `country_code="91"`, national number = remainder with any leading `0` removed. Default country code blank if you can't tell (don't fabricate `91` unless the number length/pattern implies it). Keep the raw in `crm_note` if you had to guess.

### D4. 🟠 `crm_status` free text → enum misfires (`"interested, call next week"`, `"not reachable"`, `"closed won"`)
- **Cause:** infinite phrasings, four buckets.
- **Fix:** LLM classifies with guidance in the prompt: interested/follow-up/callback → `GOOD_LEAD_FOLLOW_UP`; no answer/unreachable/switched off → `DID_NOT_CONNECT`; not interested/wrong number/junk → `BAD_LEAD`; booked/closed/purchased → `SALE_DONE`; genuinely nothing → `""`. Validator then **clamps** to the allowed set (fuzzy-normalize case/underscores first). Never emit a status outside the four.

### D5. 🟠 `data_source` over-guessing
- **Cause:** the model wants to fill the field.
- **Fix:** Prompt it explicitly: **only** set `data_source` when the row clearly references one of the five projects (by name/obvious code); **otherwise `""`**. Validator clamps anything else to `""`. Reiterate in few-shot with a "no confident source → blank" example. A wrong confident source is worse than blank (§rubric).

### D6. 🟡 `crm_note` becomes a dumping ground / loses data
- **Cause:** unclear what belongs there.
- **Fix:** By design it consolidates: extra emails/phones, remarks/comments/follow-up columns, and any unmapped leftover columns (so **no source data is silently lost**). Format readably: `Remarks: ... | Other emails: ... | Other phones: ...`. Escape newlines to `\n`.

### D7. 🟡 Names/emails swapped or fields shifted
- **Cause:** model confusion on messy rows.
- **Fix:** Validator sanity checks: an `email` field must match an email regex (else move it to where it belongs / blank it and re-derive from the row); `name` shouldn't contain `@`. Cheap guards catch the worst swaps.

---

## E. Frontend

### E1. 🟠 Large preview table freezes the browser
- **Cause:** rendering thousands of DOM rows.
- **Fix:** Cap the **preview** to the first ~100 rows with a "showing first 100 of N" note (preview is for eyeballing, not the full dataset). If you want the bonus, virtualize with `react-window`/`@tanstack/react-virtual`. The **results** table can be capped/virtualized the same way.

### E2. 🟠 Sticky header + horizontal scroll not working
- **Symptom:** header scrolls away, or the whole page scrolls sideways.
- **Fix:** Wrap the table in a container with `overflow: auto; max-height: 70vh` and use `position: sticky; top: 0` on `<thead>` cells (with a solid background so rows don't show through). The **container** scrolls, not the page body — the page must never scroll horizontally (put wide content in its own `overflow-x:auto` box). Tailwind: `overflow-auto max-h-[70vh]` on the wrapper, `sticky top-0 bg-white dark:bg-gray-900` on `<th>`.

### E3. 🔴 Frontend can't reach backend in production (works locally)
- **Cause:** hardcoded `http://localhost:8080` shipped to Vercel; or `NEXT_PUBLIC_API_BASE_URL` unset.
- **Fix:** All API calls read `process.env.NEXT_PUBLIC_API_BASE_URL` (via `lib/api.ts`). Set it to the Render URL in Vercel's env settings and **redeploy** (Next.js inlines `NEXT_PUBLIC_*` at build time — changing it requires a rebuild). Never hardcode localhost.

### E4. 🟠 SSE (progress stream) not updating or blocked
- **Cause:** CORS on the stream, buffering, or the browser `EventSource` limitations (GET only, no custom headers).
- **Fix:** SSE endpoint is a `GET` (no body) — so for a file upload + progress, either (a) POST the file first, get a job id, then open `EventSource` on `/api/import/stream?id=...`, or (b) simpler for this scope: POST the file and **stream the response** (chunked JSON lines) reading `response.body.getReader()` on the client. Disable proxy buffering (`res.setHeader("Cache-Control","no-cache"); res.setHeader("X-Accel-Buffering","no")`) and `flushHeaders()`. If SSE fights you near the deadline, a **staged determinate loader** (parsing → mapping batch x/y → validating) satisfies "loading states" without streaming plumbing.

### E5. 🟡 Uploading the file — `FormData` gotchas
- **Cause:** setting `Content-Type` manually on `fetch` with `FormData` breaks the multipart boundary.
- **Fix:** Do **not** set `Content-Type` yourself; let the browser set `multipart/form-data; boundary=...` automatically. `fetch(url,{method:"POST",body:formData})`. Backend field name must match (`file`).

### E6. 🟡 Hydration / "window is not defined" errors in Next.js
- **Cause:** using browser-only APIs (FileReader, `window`) during SSR in App Router server components.
- **Fix:** Mark interactive components `"use client"`. Keep upload/preview/state-machine components client-side. Don't read `window` at module top level.

### E7. 🟡 Dark mode flashes or doesn't toggle
- **Fix:** Tailwind `darkMode: "class"`; toggle a `dark` class on `<html>`; persist choice in `localStorage`; set it before paint to avoid flash. Ensure tables/inputs have `dark:` variants (sticky header background especially — §E2).

---

## F. Deployment & Submission

### F1. 🔴 Render free-tier **cold start** — first request after idle takes 30–60s / "fails"
- **Cause:** free web services spin down after ~15 min idle; the next request wakes them slowly.
- **Fix:** (a) Document it in the README ("first request may take ~30s to wake the free-tier backend"). (b) Have the frontend **ping `/health` on page load** to warm it while the user reads the upload screen. (c) Give frontend fetches a generous timeout and a "waking up the server…" message. (d) Optional: an external uptime pinger (e.g. a free cron) hitting `/health` every 10 min during the evaluation window. Do **not** move the LLM to the frontend to dodge this.

### F2. 🔴 You tried to deploy the Express backend to Vercel and it doesn't stay up
- **Cause:** Vercel is serverless; a long-lived Express server / SSE / long AI processing doesn't fit its default function model well.
- **Fix:** Deploy the **backend to Render/Railway** (a real long-running web service) and the **frontend to Vercel**. This split is the locked decision (Blueprint Part II). If you were forced onto one platform, you'd refactor the backend into Next.js Route Handlers — but that abandons the "separate Express" the assignment asks for; keep them split.

### F3. 🟠 Env vars missing in production
- **Cause:** `.env` isn't deployed (correctly git-ignored), but you forgot to set them in the dashboards.
- **Fix:** Set `GEMINI_API_KEY` and `CORS_ORIGIN` (=the Vercel URL) in **Render**; set `NEXT_PUBLIC_API_BASE_URL` (=the Render URL) in **Vercel**. Redeploy both after setting. Cross-check: the CORS origin on Render must exactly match the Vercel domain (including `https://`, no trailing slash).

### F4. 🟠 Build fails on the host but passed locally
- **Cause:** case-sensitive imports (Linux host vs Windows/Mac dev), dev-only deps, missing build script, TS errors ignored locally.
- **Fix:** Match import casing to filenames exactly. Ensure `build` scripts exist (`tsc` for backend, `next build` for frontend) and that type errors fail locally too (`strict`). Put runtime deps in `dependencies`, not `devDependencies`. Set the correct **start command** on Render (`node dist/index.js` after `tsc`, or `tsx src/index.ts`).

### F5. 🟠 Request timeout on the host for long AI imports
- **Cause:** platform request timeouts (Render has generous but finite limits; proxies may cut long requests).
- **Fix:** Prefer **streaming** the response (progress) so bytes flow and the connection stays alive; keep total processing bounded (`MAX_ROWS`, batching). For very large files, the honest MVP answer is the documented row cap (§C7), not an unbounded 5-minute request.

### F6. 🟡 CORS passes locally, fails in prod
- **Cause:** prod origin differs from `CORS_ORIGIN`.
- **Fix:** §F3 — set `CORS_ORIGIN` to the real Vercel URL. If you use a preview deployment URL to test, add it too (or allow a regex for `*.vercel.app` during evaluation, then note it).

### F7. 🟡 README/submission incomplete — silent point loss
- **Cause:** rushing the last step.
- **Fix:** The submission email to **varun@groweasy.ai** must include: **hosted app URL**, **public GitHub URL**, **position (Intern / Full-Time)** — *fill this in; the blueprint left it as a placeholder* — and a README with setup steps. Verify the GitHub repo is **public** and the hosted URL works **in an incognito window** before sending. See deep dive 03 for the checklist.

---

## G. Time & Scope (the 2-day deadline is itself a risk)

### G1. 🔴 Gold-plating the UI before the extractor works
- **Fix:** Follow the phase order. **Phase 2 (extraction) is the graded core** — it must work on all four sample CSVs before you style a single button. A plain UI over a correct extractor passes; a beautiful UI over a broken one fails.

### G2. 🟠 Chasing every bonus
- **Fix:** Bonuses are optional (Blueprint Part V). Do the **high-value, low-effort** ones (README, deploy, drag-drop, dark mode) and stop. Virtualized tables, streaming parse, full test suites are nice-to-have — only if the core is done and deployed.

### G3. 🟠 Deploying last
- **Fix:** Deploy a skeleton on **day 1** (even just `/health` + a hello page) so the CORS/env/cold-start issues (§F) surface early, not at 11pm before the deadline.

### G4. 🟡 Perfect extraction accuracy rabbit-hole
- **Fix:** The rubric grades "handling of messy/ambiguous data," not 100% accuracy. Get the common cases right, handle the documented edge cases, and make failures **graceful and honest** (skipped list with reasons). Don't spend the last day chasing one weird row.

---

## H. Rubric "Silent Point-Loss" Checklist (things that quietly cost marks)

Run this list before submitting — each is easy to miss and each is graded:
- [ ] **Skip rule** actually implemented and the skipped rows are **shown to the user** with reasons (not just dropped).
- [ ] **Multiple emails/phones** → first wins, extras in `crm_note` (test with `messy_edgecases.csv`).
- [ ] **Enums** never contain a value outside the allowed sets; `data_source` blanks when unsure.
- [ ] **`created_at`** never emits `Invalid Date`.
- [ ] **Newlines escaped** to `\n` in output values.
- [ ] **API key not in the browser** (search the frontend bundle for the key string — it must not be there).
- [ ] **Loading state** visible during AI processing; **error state** with retry when the backend fails.
- [ ] **Preview** shows raw data with sticky header + scroll and makes **no AI call**.
- [ ] **Results** show parsed + skipped + totals.
- [ ] **Responsive** (test 375px) and no horizontal page scroll.
- [ ] **Hosted URL works in incognito**; **repo is public**; **README** lets a stranger run it.
- [ ] **No AI/tool attribution** anywhere in the repo or git history.
- [ ] **Types**: `strict` passes; no stray `any`; build is clean.

---

*When a new failure mode appears during the build, add it here with its fix — this file is a living defense. If a fix contradicts `MASTER_BLUEPRINT.md` Part III, Part III wins and you log the conflict in `PROGRESS.md`.*
