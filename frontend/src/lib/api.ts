import { ImportResult } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export async function importCsv(file: File, jobId?: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const url = jobId ? `${API_BASE}/api/import?jobId=${jobId}` : `${API_BASE}/api/import`;

  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData, // do not set Content-Type, fetch sets it automatically with boundary
    });

    if (!res.ok) {
      let errorMsg = `Server error: ${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch (e) {
        // Not JSON
      }
      throw new ApiError(errorMsg, res.status);
    }

    const data: ImportResult = await res.json();
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : "Network error");
  }
}
