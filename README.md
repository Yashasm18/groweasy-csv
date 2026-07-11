# GrowEasy AI CSV Importer

An intelligent, AI-powered CSV importer built for CRM migrations. Upload **any** lead CSV—Facebook ads exports, Google Ads exports, real estate dumps—and the application will intelligently map every row to a standardized 15-field CRM schema using Google Gemini. 

## Features

- **No Template Required**: Automatically understands arbitrary column headers and data formats.
- **LLM-Led Mapping**: Uses Google Gemini to semantically map fields and infer data.
- **Deterministic Validation**: Code-guarded rules enforce enums (e.g., `GOOD_LEAD_FOLLOW_UP`), handle the absolute skip rule (skips rows with no email AND no mobile), and consolidate multiple emails/phones into `crm_note`.
- **High Performance UI**: Built with Next.js, featuring a beautiful glassmorphism design and a fully **virtualized data table** capable of rendering 10,000+ row CSVs without locking the browser.
- **Progressive Streaming**: Server-Sent Events (SSE) provide real-time parsing progress updates in the UI.

## Architecture

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Framer Motion, `@tanstack/react-virtual`
- **Backend**: Node.js, Express, TypeScript, `papaparse`, `@google/genai`
- **Infrastructure**: Docker Compose for local development, ready for Vercel (Frontend) and Render (Backend).

## Running Locally (Docker)

The easiest way to run the application is using Docker Compose.

1. Clone the repository.
2. Create a `.env` file in the `backend/` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3001
   CORS_ORIGIN=http://localhost:3000
   ```
3. Run `docker-compose up --build` from the root directory.
4. Access the frontend at `http://localhost:3000`.

## Running Locally (Manual)

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Running Tests
The backend uses Node's native test runner to test the extraction and validation logic.
```bash
cd backend
npm test
```

## Deployment

### Deploying the Backend (Render)
1. Push this repository to GitHub.
2. Go to Render.com and create a new **Web Service**.
3. Select this repository. The `render.yaml` blueprint will automatically configure the build and start commands (`npm install && npm run build` -> `npm start`).
4. In the Render dashboard, set the Environment Variables:
   - `GEMINI_API_KEY`: Your Gemini API Key
   - `CORS_ORIGIN`: The URL of your deployed frontend (e.g., `https://my-frontend.vercel.app`)

### Deploying the Frontend (Vercel)
1. Go to Vercel and create a new Project from your GitHub repository.
2. Set the Framework Preset to **Next.js**.
3. Set the Root Directory to `frontend`.
4. In the Environment Variables, add:
   - `NEXT_PUBLIC_API_BASE_URL`: The URL of your deployed backend (e.g., `https://groweasy-backend.onrender.com`)
5. Deploy.

---

*Built with precision for GrowEasy.*
