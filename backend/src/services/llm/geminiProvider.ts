import { GoogleGenAI, Type, Schema } from "@google/genai";
import { LlmProvider, RawRow, CandidateRecord } from "./LlmProvider";
import { config } from "../../config";
import { SYSTEM_INSTRUCTION, FEW_SHOT_EXAMPLES, BATCH_RESPONSE_SCHEMA } from "../../prompts/extraction";

export class GeminiProvider implements LlmProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }

  async mapBatch(rows: RawRow[]): Promise<CandidateRecord[]> {
    if (rows.length === 0) return [];

    const prompt = `
${SYSTEM_INSTRUCTION}

${FEW_SHOT_EXAMPLES}

Now map this batch. Return one object per row, echoing rowIndex:
${JSON.stringify(rows)}
`;

    try {
      const res = await this.ai.models.generateContent({
        model: config.GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0,
          responseMimeType: "application/json",
          // The SDK might require the schema to be typed according to its internal Schema type.
          // In most cases passing the JSON literal directly works or we typecast it.
          responseSchema: BATCH_RESPONSE_SCHEMA as Schema,
        },
      });

      const text = res.text;
      if (!text) {
        throw new Error("Gemini returned empty response text");
      }

      // Defensively clean potential markdown fences
      let cleanText = text.trim();
      if (cleanText.startsWith("\`\`\`")) {
        cleanText = cleanText.replace(/^\`\`\`(json)?/, "").replace(/\`\`\`$/, "").trim();
      }

      const parsed = JSON.parse(cleanText);
      if (!Array.isArray(parsed)) {
        throw new Error("Gemini response is not a JSON array");
      }

      // Map to CandidateRecord
      const candidates: CandidateRecord[] = parsed.map((item: any) => ({
        rowIndex: item.rowIndex,
        fields: {
          created_at: item.created_at || "",
          name: item.name || "",
          email: item.email || "",
          country_code: item.country_code || "",
          mobile_without_country_code: item.mobile_without_country_code || "",
          company: item.company || "",
          city: item.city || "",
          state: item.state || "",
          country: item.country || "",
          lead_owner: item.lead_owner || "",
          crm_status: item.crm_status || "",
          crm_note: item.crm_note || "",
          data_source: item.data_source || "",
          possession_time: item.possession_time || "",
          description: item.description || "",
        },
      }));

      return candidates;

    } catch (error: any) {
      // Re-throw so the extractor can catch and trigger fallback/retry
      throw new Error(`Gemini mapping failed: ${error.message}`);
    }
  }
}
