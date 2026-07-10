import { Router, Request, Response } from "express";
import multer from "multer";
import { config } from "../config";
import { parseCsv } from "../services/csv/csvParser";
import { CrmLead, ImportResult, SkippedRow } from "../domain/crm";
import { logger } from "../util/logger";
import crypto from "crypto";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_MB * 1024 * 1024 },
});

importRouter.post("/", upload.single("file"), async (req: Request, res: Response) => {
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

    const rawRows = parseCsv(buffer);

    if (rawRows.length === 0) {
      res.status(400).json({ error: "No valid rows found in the CSV." });
      return;
    }

    // P1.2 Passthrough: shallow-map raw rows to 15 fields (no AI)
    const records: CrmLead[] = [];
    const skipped: SkippedRow[] = [];

    // Helper to find a value case-insensitively for the shallow map
    const getVal = (cells: Record<string, string>, keys: string[]) => {
      const lowerCells = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k.toLowerCase(), v]));
      for (const k of keys) {
        if (lowerCells[k]) return lowerCells[k];
      }
      return "";
    };

    for (const row of rawRows) {
      const { cells } = row;
      const lead: CrmLead = {
        created_at: getVal(cells, ["created_at", "date", "created"]),
        name: getVal(cells, ["name", "full name", "first name"]),
        email: getVal(cells, ["email", "e-mail", "email address", "e-mail id"]),
        country_code: "",
        mobile_without_country_code: getVal(cells, ["phone", "mobile", "contact", "mob no."]),
        company: getVal(cells, ["company", "firm", "organization"]),
        city: getVal(cells, ["city"]),
        state: getVal(cells, ["state"]),
        country: getVal(cells, ["country"]),
        lead_owner: getVal(cells, ["owner", "assigned to"]),
        crm_status: "",
        crm_note: getVal(cells, ["notes", "remarks", "remark", "comments"]),
        data_source: getVal(cells, ["source", "campaign", "project"]),
        possession_time: getVal(cells, ["possession", "possession_time"]),
        description: getVal(cells, ["description", "requirement"]),
      };

      records.push(lead);
    }

    const summary = {
      total: rawRows.length,
      parsed: records.length,
      skipped: skipped.length,
    };

    const result: ImportResult = { summary, records, skipped };
    
    logger.info("Import successful (pre-AI)", { reqId, ...summary });
    res.status(200).json(result);
  } catch (error: any) {
    logger.error("Error processing import", { reqId, error: error.message, stack: error.stack });
    res.status(500).json({ error: "Internal Server Error during import." });
  }
});
