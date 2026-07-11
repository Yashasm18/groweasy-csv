import { describe, it } from "node:test";
import * as assert from "node:assert";
import { extractEmails, extractPhone, validateDate, validateEnum } from "./validator";

describe("Validator", () => {
  it("extractEmails correctly picks the first email and pushes the rest to otherEmails", () => {
    const res = extractEmails("test@gmail.com; test2@gmail.com / invalid-email");
    assert.strictEqual(res.email, "test@gmail.com");
    assert.deepStrictEqual(res.otherEmails, ["test2@gmail.com"]);
  });

  it("extractPhone strips non-digits and separates country code", () => {
    const res1 = extractPhone("+91 98765 43210");
    assert.strictEqual(res1.countryCode, "91");
    assert.strictEqual(res1.mobile, "9876543210");

    const res2 = extractPhone("001 555-1234");
    assert.strictEqual(res2.countryCode, "1");
    assert.strictEqual(res2.mobile, "5551234");

    const res3 = extractPhone("919876543210");
    assert.strictEqual(res3.countryCode, "91");
    assert.strictEqual(res3.mobile, "9876543210");

    const res4 = extractPhone("1234567890"); // No clear country code
    assert.strictEqual(res4.countryCode, "");
    assert.strictEqual(res4.mobile, "1234567890");
    
    // Multiple phones
    const res5 = extractPhone("9876543210; 9123456789");
    assert.strictEqual(res5.mobile, "9876543210");
    assert.deepStrictEqual(res5.otherPhones, ["9123456789"]);
  });

  it("validateDate parses correctly or returns empty string", () => {
    assert.strictEqual(validateDate("2026-07-10"), "2026-07-10");
    assert.strictEqual(validateDate("10/07/2026"), "2026-07-10"); // DD/MM/YYYY ambiguous -> assumes DD/MM/YYYY
    assert.strictEqual(validateDate("07/25/2026"), "2026-07-25"); // MM/DD/YYYY unambiguous
    assert.strictEqual(validateDate("45678"), "2025-01-21"); // Excel epoch
    assert.strictEqual(validateDate("invalid"), "");
  });

  it("validateEnum normalizes strings to allowed enums", () => {
    assert.strictEqual(validateEnum(" Good  Lead Follow Up ", ["GOOD_LEAD_FOLLOW_UP", "BAD_LEAD"]), "GOOD_LEAD_FOLLOW_UP");
    assert.strictEqual(validateEnum("NOT_ALLOWED", ["GOOD_LEAD_FOLLOW_UP", "BAD_LEAD"]), "");
  });
});
