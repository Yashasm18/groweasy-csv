import { CrmLead } from "../../domain/crm";
import { RawRow, CandidateRecord } from "../llm/LlmProvider";

// The absolute skip rule: skip if no email AND no mobile (after normalization)
export interface ValidationResult {
  valid: boolean;
  lead?: CrmLead;
  reason?: string;
}

/**
 * Normalizes email by picking the first valid email, pushing others to crm_note.
 * Returns { email, otherEmails }
 */
export function extractEmails(rawStr: string): { email: string, otherEmails: string[] } {
  if (!rawStr) return { email: "", otherEmails: [] };
  const tokens = rawStr.split(/[;,/|\n\s]+/).map(s => s.trim()).filter(Boolean);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = tokens.filter(t => emailRegex.test(t));
  
  if (emails.length === 0) return { email: "", otherEmails: [] };
  return { email: emails[0], otherEmails: emails.slice(1) };
}

/**
 * Normalizes phone numbers.
 * Strips non-digits (keeps +). 
 * If it starts with +CC or 00CC or is 12 digits starting with 91, splits.
 */
export function extractPhone(rawStr: string): { countryCode: string, mobile: string, otherPhones: string[] } {
  if (!rawStr) return { countryCode: "", mobile: "", otherPhones: [] };
  const tokens = rawStr.split(/[;,/|\n]+/).map(s => s.trim()).filter(Boolean);
  
  const parseSinglePhone = (p: string) => {
    let clean = p.replace(/[^\d+]/g, "");
    if (!clean) return null;
    
    let cc = "";
    let mobile = clean;
    
    if (clean.startsWith("+91")) {
      cc = "91";
      mobile = clean.substring(3);
    } else if (clean.startsWith("+")) {
      const match = clean.match(/^\+(\d{1,3}?)(\d{7,})$/);
      if (match) {
        cc = match[1];
        mobile = match[2];
      }
    } else if (clean.startsWith("00")) {
      const match = clean.match(/^00(\d{1,3}?)(\d{7,})$/);
      if (match) {
        cc = match[1];
        mobile = match[2];
      }
    } else if (clean.length === 12 && clean.startsWith("91")) {
      cc = "91";
      mobile = clean.substring(2);
    }
    
    // strip leading 0s from mobile
    mobile = mobile.replace(/^0+/, "");
    
    if (mobile.length < 6) return null;
    
    return { cc, mobile, raw: p };
  };

  const parsed = tokens.map(parseSinglePhone).filter(Boolean) as Array<{cc: string, mobile: string, raw: string}>;
  if (parsed.length === 0) return { countryCode: "", mobile: "", otherPhones: [] };
  
  return { 
    countryCode: parsed[0].cc, 
    mobile: parsed[0].mobile, 
    otherPhones: parsed.slice(1).map(p => p.raw)
  };
}

export function validateDate(rawStr: string): string {
  if (!rawStr) return "";
  // Is it already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawStr)) {
    const d = new Date(rawStr);
    if (!isNaN(d.getTime())) return rawStr;
  }
  
  // Is it a number (Excel serial)?
  if (/^\d{4,5}$/.test(rawStr)) {
    const days = parseInt(rawStr, 10);
    const date = new Date((days - 25569) * 86400 * 1000); // 1899-12-30 epoch
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Try parsing MM/DD/YYYY or DD/MM/YYYY
  // Because it's India context, prefer DD/MM/YYYY if ambiguous
  const parts = rawStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (parts) {
    let p1 = parseInt(parts[1], 10);
    let p2 = parseInt(parts[2], 10);
    let p3 = parseInt(parts[3], 10);
    if (p3 < 100) p3 += 2000;
    
    let year = p3, month = 0, day = 0;
    
    if (p2 > 12) { // MM/DD/YYYY
      month = p1;
      day = p2;
    } else if (p1 > 12) { // DD/MM/YYYY
      day = p1;
      month = p2;
    } else {
      // Ambiguous, assume DD/MM/YYYY
      day = p1;
      month = p2;
    }
    
    if (year > 0 && month > 0 && month <= 12 && day > 0 && day <= 31) {
      // Use local timezone to prevent UTC date shift
      const d = new Date(year, month - 1, day, 12, 0, 0);
      if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }

  const d = new Date(rawStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return "";
}

export function validateEnum<T extends string>(rawStr: string, allowedValues: T[]): T | "" {
  if (!rawStr) return "";
  const normalized = rawStr.trim().toUpperCase().replace(/\s+/g, "_");
  if (allowedValues.includes(normalized as T)) {
    return normalized as T;
  }
  return "";
}

export function escapeNewlines(str: string): string {
  if (!str) return "";
  return str.replace(/\n/g, "\\n").replace(/\r/g, "");
}

/**
 * Validates a candidate record, applies rules, checks if it should be skipped.
 */
export function validateRecord(candidate: CandidateRecord, originalRow: RawRow): ValidationResult {
  const c = candidate.fields;
  
  // Use original row for email/phone to ensure LLM didn't hallucinate
  // We'll concat all values from the row to find emails/phones
  const allRowValues = Object.values(originalRow.cells).join(" | ");
  
  // Extract email
  let { email, otherEmails } = extractEmails(c.email || "");
  if (!email) {
    // LLM missed it or messed it up, try raw row
    const rawRes = extractEmails(allRowValues);
    email = rawRes.email;
    if (email) {
      // Remove it from otherEmails if it was found in raw
      otherEmails = rawRes.otherEmails;
    }
  }

  // Extract phone
  let { countryCode, mobile, otherPhones } = extractPhone(c.mobile_without_country_code || "");
  if (!mobile && c.country_code) {
    const combined = (c.country_code + c.mobile_without_country_code).trim();
    const parsed = extractPhone(combined);
    countryCode = parsed.countryCode;
    mobile = parsed.mobile;
    otherPhones = parsed.otherPhones;
  }
  
  if (!mobile) {
    // Try raw row
    const rawRes = extractPhone(allRowValues);
    countryCode = rawRes.countryCode;
    mobile = rawRes.mobile;
    if (mobile) {
      otherPhones = rawRes.otherPhones;
    }
  }
  
  // Default country code to "" if we couldn't confidently parse it
  if (!countryCode) countryCode = c.country_code || "";
  // Clean it up just in case
  countryCode = countryCode.replace(/[^\d]/g, "");

  // Skip rule: No Email AND No Mobile -> Skip
  if (!email && !mobile) {
    return {
      valid: false,
      reason: "Missing both Email and Mobile - row skipped"
    };
  }

  // Enums
  const crm_status = validateEnum(c.crm_status || "", ["GOOD_LEAD_FOLLOW_UP", "DID_NOT_CONNECT", "BAD_LEAD", "SALE_DONE"]);
  // data_source allowed: leads_on_demand | meridian_tower | eden_park | varah_swamy | sarjapur_plots
  const data_source = validateEnum(c.data_source || "", ["LEADS_ON_DEMAND", "MERIDIAN_TOWER", "EDEN_PARK", "VARAH_SWAMY", "SARJAPUR_PLOTS"]);
  const final_data_source = data_source.toLowerCase(); // schema says lowercase for data_source! Wait, prompt says leads_on_demand.
  
  const created_at = validateDate(c.created_at || "");

  // Compile notes
  let crm_note = escapeNewlines(c.crm_note || "");
  let extraNotes = [];
  if (otherEmails.length > 0) extraNotes.push(`Other emails: ${otherEmails.join(", ")}`);
  if (otherPhones.length > 0) extraNotes.push(`Other phones: ${otherPhones.join(", ")}`);
  
  if (extraNotes.length > 0) {
    if (crm_note) crm_note += " | ";
    crm_note += extraNotes.join(" | ");
  }

  const name = escapeNewlines(c.name || "");
  // Sanity check name (should not be an email)
  let finalName = name;
  if (finalName.includes("@") && finalName === email) {
    finalName = ""; // LLM mapped email to name
  }

  const lead: CrmLead = {
    created_at,
    name: finalName,
    email,
    country_code: countryCode,
    mobile_without_country_code: mobile,
    company: escapeNewlines(c.company || ""),
    city: escapeNewlines(c.city || ""),
    state: escapeNewlines(c.state || ""),
    country: escapeNewlines(c.country || ""),
    lead_owner: escapeNewlines(c.lead_owner || ""),
    crm_status: crm_status as any,
    crm_note,
    data_source: final_data_source,
    possession_time: escapeNewlines(c.possession_time || ""),
    description: escapeNewlines(c.description || ""),
  };

  return { valid: true, lead };
}
