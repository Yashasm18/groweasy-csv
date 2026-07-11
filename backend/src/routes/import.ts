import { Router, Request, Response } from "express";
import multer from "multer";
import { config } from "../config";
import { parseCsv } from "../services/csv/csvParser";
import { GeminiProvider } from "../services/llm/geminiProvider";
import { extractAndValidate } from "../services/extract/extractor";
import { logger } from "../util/logger";
import crypto from "crypto";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_MB * 1024 * 1024 },
});

const llmProvider = new GeminiProvider();

importRouter.post("/", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const reqId = crypto.randomUUID();
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Please upload a CSV file." });
      return;
    }

    const buffer = req.file.buffer;

    if (buffer.length === 0) {
      res.status(400).json({ error: "Uploaded file is empty." });
      return;
    }

    // Reject xlsx files based on PK signature (PK\x03\x04)
    if (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      res.status(400).json({ error: "That file isn't a readable CSV — export as CSV and try again" });
      return;
    }

    let rows = [];
    try {
      rows = parseCsv(buffer);
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to parse CSV" });
      return;
    }

    if (rows.length === 0) {
      res.status(400).json({ error: "No valid rows found in the CSV." });
      return;
    }

    // Phase 2: AI Extraction Core
    const extractionResult = await extractAndValidate(rows, llmProvider);
    
    logger.info("Import extraction successful", { 
      reqId, 
      total: extractionResult.summary.totalRows,
      success: extractionResult.summary.successCount,
      skipped: extractionResult.summary.skippedCount
    });

    res.status(200).json(extractionResult);
  } catch (error: any) {
    logger.error("Error processing import", { reqId, error: error.message, stack: error.stack });
    res.status(500).json({ error: "Internal Server Error during import." });
  }
});
