# Deep Dive 03 — Deployment & Submission

> **Status: authoritative reference.** Expands Blueprint Part IV Phase 6. This is the step that turns a working local app into the graded deliverables: a **publicly hosted app**, a **public GitHub repo**, and a **README**, emailed to **varun@groweasy.ai**. Deploy early (day 1 skeleton) — cold deploys surface CORS/env bugs that eat time (ROADBLOCKS §G3).

## Topology
```
[ Vercel ]  frontend (Next.js)  ──HTTPS──►  [ Render ]  backend (Express)  ──►  Gemini API
   env: NEXT_PUBLIC_API_BASE_URL              env: GEMINI_API_KEY, CORS_ORIGIN, PORT
```
Why split: Render runs a real long-lived server (good for Express + streaming + longer AI processing); Vercel is ideal for Next.js. Don't put Express on Vercel serverless (ROADBLOCKS §F2).

## Backend → Render (web service, free tier)
1. Push the repo to GitHub (public).
2. Render → New → Web Service → connect the repo → root dir `backend/`.
3. Build command: `npm install && npm run build` (compiles TS → `dist/`). Start command: `node dist/index.js`. (Or dev-style `npm install && npx tsx src/index.ts` — but a real build is cleaner.)
4. Env vars: `GEMINI_API_KEY`, `CORS_ORIGIN` = the Vercel URL (exact, `https://`, no trailing slash), `PORT` (Render sets `PORT` itself — read `process.env.PORT`).
5. Deploy; verify `https://<svc>.onrender.com/health` → `{ok:true}` and a real import via `curl -F file=@docs/sample-data/facebook_leads_export.csv https://<svc>.onrender.com/api/import`.
6. **Cold start:** free services sleep after ~15 min idle; first wake is 30–60s. Mitigate (ROADBLOCKS §F1): frontend pings `/health` on load; README notes it; optionally an external cron pings `/health` every 10 min during evaluation.

## Frontend → Vercel
1. Vercel → New Project → import the repo → root dir `frontend/`.
2. Framework preset: Next.js (auto). Build: `next build`.
3. Env var: `NEXT_PUBLIC_API_BASE_URL` = the Render URL. **Redeploy after setting** (Next inlines `NEXT_PUBLIC_*` at build time — ROADBLOCKS §E3).
4. Verify the full 4-step flow on the public Vercel URL against the hosted backend, **in an incognito window**.
5. Go back and set Render's `CORS_ORIGIN` to this exact Vercel URL; redeploy backend.

## Environment variable checklist
| Where | Var | Value |
|---|---|---|
| Render (backend) | `GEMINI_API_KEY` | your key (secret) |
| Render (backend) | `CORS_ORIGIN` | `https://<app>.vercel.app` |
| Vercel (frontend) | `NEXT_PUBLIC_API_BASE_URL` | `https://<svc>.onrender.com` |
Cross-check both directions; a mismatch = CORS failure in prod that passed locally (ROADBLOCKS §F6).

## README (a graded deliverable — don't rush it)
Include, in this order:
1. **What it is** — one paragraph: AI CSV importer that maps any CRM lead CSV into a 15-field schema.
2. **Live demo** — the hosted URL (and note the ~30s cold-start on first hit).
3. **Screenshots / GIF** — upload → preview → results (1–2 images carry a lot of credit).
4. **Architecture** — the topology diagram above; "LLM-led, code-guarded" one-liner; the 4-step flow.
5. **Tech stack** — Next.js, Express, TypeScript, Gemini, PapaParse, Tailwind.
6. **Local setup** — exact commands for **both** apps and the env vars (copy `.env.example` → `.env`). A stranger must be able to run it from this alone:
   ```
   # backend
   cd backend && npm install && cp .env.example .env   # add GEMINI_API_KEY
   npm run dev            # http://localhost:8080
   # frontend (new terminal)
   cd frontend && npm install && cp .env.example .env   # NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
   npm run dev            # http://localhost:3000
   ```
7. **AI approach** — 2–3 sentences on the prompt + structured output + the validator guardrails (this shows the "prompt engineering" thinking that's graded). Link `docs/PROMPT_ENGINEERING.md`.
8. **Notes / limits** — the `MAX_ROWS` demo cap, cold-start, any known edge cases. Honesty reads as senior.

## Optional: Docker (bonus, Phase 5)
- `backend/Dockerfile` (node:20-alpine, install, build, `CMD node dist/index.js`) and `frontend/Dockerfile` (or rely on Vercel). `docker-compose.yml` at root wiring both + env. Mention in README.

## Final submission checklist (run before sending)
- [ ] Public GitHub repo — **verify it's public** (open in a logged-out browser).
- [ ] No secrets in the repo or its history (`.env` git-ignored; grep the history for the key).
- [ ] **No AI/tool attribution** anywhere in code, commits, or metadata (Blueprint Part I).
- [ ] Hosted app works **in incognito**, full 4-step flow, on a real sample CSV.
- [ ] Backend `/health` responds; cold-start behavior noted.
- [ ] README complete (setup runs clean for a stranger; hosted URL present; screenshots in).
- [ ] Rubric silent-loss list (ROADBLOCKS §H) all ticked.
- [ ] **Decide the position: Intern or Full-Time** — *this was left as a placeholder in the blueprint; fill it now.*
- [ ] Email **varun@groweasy.ai** with: hosted URL + public GitHub URL + position + a line on the stack. Send **before 12 July 2026**.

### Submission email template
```
Subject: Software Developer Assignment — <Your Name> — <Intern / Full-Time>

Hi Varun,

Please find my submission for the AI CSV Importer assignment.

• Live app:   https://<app>.vercel.app   (first load may take ~30s — free-tier backend wakes from sleep)
• GitHub:     https://github.com/<you>/groweasy-csv-importer  (public)
• Position:   <Intern / Full-Time>
• Stack:      Next.js + Node/Express + TypeScript, Google Gemini for field mapping, deterministic
              validation layer (enums, skip rule, multi-email/phone consolidation).

README with setup and an overview of the AI-mapping approach is in the repo.

Thanks for the opportunity — happy to walk through any part of it.

<Your Name>
<phone / email>
```

## To expand as tasks demand
- Railway as an alternative backend host (similar; set the same env vars).
- Keep-alive cron specifics.
- CI (GitHub Actions) to type-check on push (nice-to-have).
