import "dotenv/config";

export const config = {
  PORT: parseInt(process.env.PORT || "8080", 10),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || "20", 10),
  LLM_CONCURRENCY: parseInt(process.env.LLM_CONCURRENCY || "2", 10),
  LLM_MAX_RETRIES: parseInt(process.env.LLM_MAX_RETRIES || "3", 10),
  MAX_FILE_MB: parseInt(process.env.MAX_FILE_MB || "5", 10),
  MAX_ROWS: parseInt(process.env.MAX_ROWS || "1000", 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3000",
  DATABASE_URL: process.env.DATABASE_URL || "",
};

if (!config.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is missing from the environment variables.");
}
