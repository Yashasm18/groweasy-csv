import { Router, Request, Response } from "express";
import multer from "multer";
import { config } from "../config";
import { GeminiProvider } from "../services/llm/geminiProvider";
import { extractAndValidateStream } from "../services/extract/extractor";
import { logger } from "../util/logger";
import crypto from "crypto";
import os from "os";
import fs from "fs";
import readline from "readline";
import Papa from "papaparse";
import { saveLeadsToDb } from "../util/db";

export const importRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `${crypto.randomUUID()}-${file.originalname}`);
    }
  }),
  limits: { fileSize: config.MAX_FILE_MB * 1024 * 1024 },
});

const llmProvider = new GeminiProvider();

const clients = new Map<string, Response>();

importRouter.get("/stream", (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId) {
    res.status(400).send("jobId required");
    return;
  }

  // Setup SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // Keep connection alive
  res.write("data: connected\n\n");

  clients.set(jobId, res);

  req.on("close", () => {
    clients.delete(jobId);
  });
});

importRouter.post("/", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const reqId = crypto.randomUUID();
  const jobId = req.query.jobId as string;
  let tempFilePath: string | null = null;

  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Please upload a CSV file." });
      return;
    }

    tempFilePath = req.file.path;

    // Check for empty file
    const stat = fs.statSync(tempFilePath);
    if (stat.size === 0) {
      res.status(400).json({ error: "Uploaded file is empty." });
      return;
    }

    // Reject xlsx files based on PK signature (PK\x03\x04)
    // We can read just the first 4 bytes
    const fd = fs.openSync(tempFilePath, "r");
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      res.status(400).json({ error: "That file isn't a readable CSV — export as CSV and try again" });
      return;
    }

    // Calculate total rows quickly for accurate progress bar
    let estimatedTotal = 0;
    await new Promise<void>((resolve, reject) => {
      Papa.parse(fs.createReadStream(tempFilePath as string), {
        header: true,
        skipEmptyLines: "greedy",
        step: function() {
          estimatedTotal++;
        },
        complete: function() {
          resolve();
        },
        error: function(error: any) {
          reject(error);
        }
      });
    });
    estimatedTotal = Math.max(1, estimatedTotal);

    // Phase 2: AI Extraction Core using STREAMING parser
    const extractionResult = await extractAndValidateStream(tempFilePath, llmProvider, (done) => {
      if (jobId) {
        const client = clients.get(jobId);
        if (client) {
          // Send accurate total instead of "unknown"
          client.write(`data: ${JSON.stringify({ done, total: estimatedTotal })}\n\n`);
        }
      }
    });
    
    logger.info("Import extraction successful", { 
      reqId, 
      jobId,
      total: extractionResult.summary.totalRows,
      success: extractionResult.summary.successCount,
      skipped: extractionResult.summary.skippedCount
    });

    // Save successful leads to the database
    if (extractionResult.records.length > 0) {
      try {
        await saveLeadsToDb(extractionResult.records);
      } catch (dbError: any) {
        logger.error("Failed to persist leads to database, but returning CSV to user anyway", { error: dbError.message });
      }
    }

    res.status(200).json(extractionResult);
  } catch (error: any) {
    logger.error("Error processing import", { reqId, jobId, error: error.message, stack: error.stack });
    res.status(500).json({ error: "Internal Server Error during import." });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        logger.error("Failed to clean up temp file", { tempFilePath });
      }
    }

    if (jobId) {
      const client = clients.get(jobId);
      if (client) {
        client.write("data: {\"done\": true}\n\n");
        client.end();
        clients.delete(jobId);
      }
    }
  }
});
