import { describe, it } from "node:test";
import * as assert from "node:assert";
import { parseCsv } from "./csvParser";

describe("csvParser", () => {
  it("should parse a standard CSV with headers", () => {
    const csvContent = Buffer.from("Name,Email,Phone\nJohn,john@example.com,1234567890\nJane,jane@example.com,0987654321");
    const result = parseCsv(csvContent);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0].cells, {
      Name: "John",
      Email: "john@example.com",
      Phone: "1234567890"
    });
  });

  it("should deduplicate duplicate headers", () => {
    const csvContent = Buffer.from("Name,Phone,Phone\nJohn,123,456");
    const result = parseCsv(csvContent);
    assert.deepStrictEqual(result[0].cells, {
      Name: "John",
      Phone: "123",
      "Phone_1": "456"
    });
  });

  it("should handle missing headers (empty string headers)", () => {
    const csvContent = Buffer.from("Name,,Phone\nJohn,john@example.com,123");
    const result = parseCsv(csvContent);
    assert.deepStrictEqual(result[0].cells, {
      Name: "John",
      col_1: "john@example.com",
      Phone: "123"
    });
  });

  it("should detect data without headers and use col_X", () => {
    const csvContent = Buffer.from("john@example.com,1234567890,John Doe");
    const result = parseCsv(csvContent);
    assert.deepStrictEqual(result[0].cells, {
      col_1: "john@example.com",
      col_2: "1234567890",
      col_3: "John Doe"
    });
  });
});
