import { describe, it } from "node:test";
import * as assert from "node:assert";
import { validateRecord } from "./validator";
import { CandidateRecord, RawRow } from "../llm/LlmProvider";

describe("validator", () => {
  const getDummyRow = (): RawRow => ({ rowIndex: 1, cells: {} });

  it("should skip record with no email and no mobile", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { name: "John Doe", city: "New York" }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason?.includes("Missing both Email and Mobile"));
  });

  it("should pick first email and push others to crm_note", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { 
        name: "John", 
        email: "john@example.com, john.doe@work.com" 
      }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, true);
    if (result.valid && result.lead) {
      assert.strictEqual(result.lead.email, "john@example.com");
      assert.ok(result.lead.crm_note.includes("john.doe@work.com"));
    }
  });

  it("should parse and extract mobile numbers, setting country code", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { 
        name: "John", 
        email: "john@example.com",
        mobile_without_country_code: "+1-555-123-4567, 0987654321" 
      }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, true);
    if (result.valid && result.lead) {
      assert.strictEqual(result.lead.country_code, "1");
      assert.strictEqual(result.lead.mobile_without_country_code, "5551234567");
      assert.ok(result.lead.crm_note.includes("0987654321"));
    }
  });

  it("should clamp crm_status to allowed enums", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { 
        email: "john@test.com",
        crm_status: "good lead follow up"
      }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, true);
    if (result.valid && result.lead) {
      assert.strictEqual(result.lead.crm_status, "GOOD_LEAD_FOLLOW_UP");
    }
  });

  it("should clear crm_status if not matching any enum", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { 
        email: "john@test.com",
        crm_status: "unknown status"
      }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, true);
    if (result.valid && result.lead) {
      assert.strictEqual(result.lead.crm_status, "");
    }
  });

  it("should escape newlines in field values", () => {
    const candidate: CandidateRecord = {
      rowIndex: 1,
      fields: { 
        email: "john@test.com",
        description: "Line 1\nLine 2"
      }
    };
    const result = validateRecord(candidate, getDummyRow());
    assert.strictEqual(result.valid, true);
    if (result.valid && result.lead) {
      assert.strictEqual(result.lead.description, "Line 1\\nLine 2");
    }
  });
});
