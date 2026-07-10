# Deep Dive 02 — Frontend Workflow (Next.js)

> **Status: authoritative reference.** Expands Blueprint Part III / Part IV Phase 3–4. If it diverges from Part III, Part III governs. Stack: Next.js App Router + TypeScript + Tailwind. All interactive components are `"use client"`.

## Scope
The 4-step wizard (Upload → Preview → Confirm → Results), the state machine, the reusable scrollable table, progress/error/dark-mode, and the API client.

## The state machine (`app/page.tsx`)
One client component owns the flow:
```ts
type Step = "upload" | "preview" | "loading" | "result" | "error";
type State = {
  step: Step;
  file: File | null;
  previewRows: Record<string,string>[];   // client-parsed, for step 2 only
  previewCols: string[];
  result: ImportResult | null;
  error: string | null;
  progress: { done: number; total: number } | null;
};
```
Transitions: `upload —(valid file)→ preview —(Confirm)→ loading —(200)→ result | —(fail)→ error`. `error`/`result` both offer "Import another file" → reset to `upload`. `Stepper.tsx` renders the 1→2→3→4 position.

## Step 1 — Upload (`UploadStep.tsx`)
- **Drag & drop** (`onDragOver`/`onDrop`, prevent defaults, highlight on drag-enter) **and** a hidden `<input type="file" accept=".csv,text/csv">` triggered by a button (both required — rubric C8 + bonus).
- Validate: extension `.csv`, non-empty size, and (defensively) not an xlsx. Bad → inline error, don't advance.
- On valid file → store `file`, kick client-side parse for preview, go to `preview`.

## Step 2 — Preview (`PreviewTable.tsx` via `DataTable.tsx`) — NO AI
- Parse client-side with PapaParse (`lib/csv.ts`, `header:true`) — **no backend call** (rubric C9).
- Render the raw rows in the reusable `DataTable`: **sticky header, horizontal + vertical scroll**, responsive.
- Cap to first ~100 rows with "showing first 100 of N" (ROADBLOCKS §E1); show total row/column counts.
- A prominent **"Confirm Import"** button → `loading`.

## Step 3 — Confirm / Loading
- POST the **original File** (not the client-parsed rows — the backend is the authoritative parser) to `/api/import` via `FormData` (don't set `Content-Type` manually — ROADBLOCKS §E5).
- Show a real **loading state**: either the streamed progress bar (`done/total` from the SSE/NDJSON variant — deep dive 01 §7) or a staged determinate loader ("Parsing → Mapping batch x/y → Validating"). Loading states are graded (rubric C10).
- Timeout generously and show a "waking the server…" hint for cold starts (ROADBLOCKS §F1).

## Step 4 — Results (`ResultView.tsx`)
- **Summary tiles:** total / parsed / skipped.
- **Parsed table:** the 15 fields, `DataTable` with sticky header + scroll.
- **Skipped table or tab:** `rowIndex`, `reason`, and a peek at the raw row — so the user sees *why* rows dropped (rubric H: skipped rows must be shown, not silently dropped).
- **"Import another file"** resets to Step 1.
- Optional bonus: "Download parsed CSV" (client-side stringify with PapaParse — the `\n` escaping from the backend keeps it valid).

## Reusable table (`DataTable.tsx`)
```
<div class="overflow-auto max-h-[70vh] rounded border border-gray-200 dark:border-gray-700">
  <table class="min-w-full text-sm">
    <thead class="sticky top-0 bg-gray-50 dark:bg-gray-900 shadow-sm">...</thead>
    <tbody>...</tbody>
  </table>
</div>
```
- The **container** scrolls (both axes); the page body never scrolls horizontally (ROADBLOCKS §E2).
- Sticky header needs a **solid background** or rows show through.
- For large datasets, cap rows or virtualize (`@tanstack/react-virtual`) — bonus.

## API client (`lib/api.ts`)
- Base URL from `process.env.NEXT_PUBLIC_API_BASE_URL` (never hardcode localhost — ROADBLOCKS §E3).
- `importCsv(file, onProgress?)`: builds `FormData`, POSTs; if using the streamed variant, reads `response.body.getReader()` and calls `onProgress(done,total)` per line, resolving on the final `result`.
- Typed against the mirrored `ImportResult`/`CrmLead` in `lib/types.ts`.

## UX, errors, responsive, dark mode (Phase 4)
- **Errors:** every failure (network, 4xx/5xx, timeout) → friendly message + **Retry** button; never white-screen (rubric H; ROADBLOCKS §E). Wrap the tree so a render error shows a fallback.
- **Responsive:** verify 375 / 768 / 1280px. Stack tiles on mobile; tables scroll in their box.
- **Dark mode:** Tailwind `darkMode:"class"`, toggle on `<html>`, persist in `localStorage`, set before paint (no flash — ROADBLOCKS §E7). Ensure sticky-header and input `dark:` variants.
- **Empty/edge states:** all-skipped file, zero-row file, huge file — each gets a designed state, not a blank screen.

## Pitfalls (see ROADBLOCKS §E)
- `"use client"` on interactive components; no `window` at module top (§E6).
- Don't manually set `Content-Type` on the `FormData` fetch (§E5).
- Redeploy after changing `NEXT_PUBLIC_*` (inlined at build time) (§E3).

## To expand as tasks demand
- Exact Tailwind config + dark-mode toggle component.
- The streamed-reader parsing loop for progress.
- Optional CSV download and virtualization.
