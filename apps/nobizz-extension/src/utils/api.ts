import type {
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  FetchSummaryResponse,
  ErrorResponse,
} from "../types/api";

// Plasmo requires PLASMO_PUBLIC_ prefix for environment variables
const SUPABASE_URL = process.env.PLASMO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY;
const FUNCTION_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/nbs-tech` : undefined;

// Log environment configuration on module load
console.log("[API] Environment configuration:", {
  hasSupabaseUrl: !!SUPABASE_URL,
  supabaseUrl: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : "MISSING",
  hasAnonKey: !!SUPABASE_ANON_KEY,
  anonKeyPreview: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 10)}...` : "MISSING",
  functionBase: FUNCTION_BASE,
  allEnvKeys: typeof process !== "undefined" ? Object.keys(process.env).filter(k => k.includes("SUPABASE")) : [],
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "[API] Missing Supabase configuration. Please set PLASMO_PUBLIC_SUPABASE_URL and PLASMO_PUBLIC_SUPABASE_ANON_KEY in .env"
  );
}

/**
 * Generate a summary for the given article
 */
export async function generateSummary(
  url: string,
  headline: string,
  html: string
): Promise<GenerateSummaryResponse> {
  console.log("[API] generateSummary called with:", {
    url,
    headline,
    htmlLength: html?.length || 0,
    htmlPreview: html?.substring(0, 200) + "...",
  });

  // Re-check env vars at runtime in case they weren't available at module load
  const runtimeUrl = SUPABASE_URL || process.env.PLASMO_PUBLIC_SUPABASE_URL;
  const runtimeKey = SUPABASE_ANON_KEY || process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY;

  if (!runtimeUrl || !runtimeKey) {
    console.error("[API] Missing Supabase configuration", {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
      runtimeUrl: !!runtimeUrl,
      runtimeKey: !!runtimeKey,
      processEnv: typeof process !== "undefined" ? Object.keys(process.env).filter(k => k.includes("PLASMO_PUBLIC") || k.includes("SUPABASE")) : "process not available",
    });
    throw new Error("Supabase configuration is missing. Please ensure PLASMO_PUBLIC_SUPABASE_URL and PLASMO_PUBLIC_SUPABASE_ANON_KEY are set in .env and restart the dev server.");
  }

  const requestBody: GenerateSummaryRequest = {
    url,
    headline,
    html,
  };

  const requestBodySize = JSON.stringify(requestBody).length;
  console.log("[API] Request body size:", requestBodySize, "bytes");

  try {
    const functionBase = runtimeUrl ? `${runtimeUrl}/functions/v1/nbs-tech` : FUNCTION_BASE;
    const endpoint = `${functionBase}/generate-summary`;
    console.log("[API] Calling endpoint:", endpoint);
    console.log("[API] Request headers:", {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${runtimeKey?.substring(0, 10)}...`,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtimeKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log("[API] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorData: ErrorResponse = await response.json();
      console.error("[API] Error response:", errorData);
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: GenerateSummaryResponse = await response.json();
    console.log("[API] Success response:", {
      status: data.status,
      hash: data.hash,
      predictionId: data.predictionId,
      cached: data.cached,
      hasSummary: !!data.summary,
    });
    return data;
  } catch (error) {
    console.error("[API] generateSummary error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to generate summary");
  }
}

/**
 * Fetch a summary by hash or URL
 */
export async function fetchSummary(
  hashOrUrl: string
): Promise<FetchSummaryResponse> {
  // Re-check env vars at runtime
  const runtimeUrl = SUPABASE_URL || process.env.PLASMO_PUBLIC_SUPABASE_URL;
  const runtimeKey = SUPABASE_ANON_KEY || process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY;

  if (!runtimeUrl || !runtimeKey) {
    console.error("[API] Missing Supabase configuration");
    throw new Error("Supabase configuration is missing. Please ensure PLASMO_PUBLIC_SUPABASE_URL and PLASMO_PUBLIC_SUPABASE_ANON_KEY are set in .env and restart the dev server.");
  }

  // Determine if it's a hash or URL
  const isHash = !hashOrUrl.startsWith("http");
  const param = isHash ? "hash" : "url";
  const queryParam = `${param}=${encodeURIComponent(hashOrUrl)}`;

  console.log("[API] fetchSummary called with:", {
    hashOrUrl: hashOrUrl.substring(0, 50) + "...",
    isHash,
    param,
  });

  try {
    const functionBase = runtimeUrl ? `${runtimeUrl}/functions/v1/nbs-tech` : FUNCTION_BASE;
    const endpoint = `${functionBase}/fetch-summary?${queryParam}`;
    console.log("[API] Calling fetch-summary endpoint");

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${runtimeKey}`,
      },
    });

    console.log("[API] fetchSummary response status:", response.status);

    if (!response.ok) {
      const errorData: ErrorResponse = await response.json();
      console.error("[API] fetchSummary error response:", errorData);
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data: FetchSummaryResponse = await response.json();
    console.log("[API] fetchSummary response:", {
      status: data.status,
      hash: data.hash,
      hasSummary: !!data.summary,
      cached: data.cached,
    });
    return data;
  } catch (error) {
    console.error("[API] fetchSummary error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to fetch summary");
  }
}

