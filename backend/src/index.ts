import "dotenv/config";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./util/logger";

const app = express();

app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: false
}));

app.use(express.json());

// Basic health check route
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(config.PORT, () => {
  logger.info(`Backend listening on port ${config.PORT}`);
});
