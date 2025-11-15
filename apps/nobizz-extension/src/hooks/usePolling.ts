import { useState, useEffect, useCallback } from "react";
import { fetchSummary } from "../utils/api";
import type { FetchSummaryResponse } from "../types/api";

interface UsePollingResult {
  data: FetchSummaryResponse | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Custom hook for polling the fetch-summary endpoint
 * Polls every 2 seconds until status is 'complete' or 'unknown'
 */
export function usePolling(
  hash: string | null,
  enabled: boolean
): UsePollingResult {
  const [data, setData] = useState<FetchSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!hash) {
      console.log("[Polling] No hash provided, skipping poll");
      return;
    }

    console.log("[Polling] Polling for hash:", hash);
    setLoading(true);
    setError(null);

    try {
      const response = await fetchSummary(hash);
      console.log("[Polling] Poll response received:", {
        status: response.status,
        hasSummary: !!response.summary,
        cached: response.cached,
      });
      setData(response);

      // Don't stop polling here - let the enabled prop control it
    } catch (err) {
      console.error("[Polling] Poll error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch summary");
      // Continue polling on error (will retry)
    } finally {
      setLoading(false);
    }
  }, [hash]);

  useEffect(() => {
    if (!hash || !enabled) {
      console.log("[Polling] Polling disabled or no hash:", { hash, enabled });
      return;
    }

    console.log("[Polling] Starting polling interval for hash:", hash);
    // Poll immediately
    poll();

    // Set up interval for polling every 2 seconds
    const interval = setInterval(() => {
      console.log("[Polling] Interval poll triggered");
      poll();
    }, 2000);

    return () => {
      console.log("[Polling] Cleaning up polling interval");
      clearInterval(interval);
    };
  }, [hash, enabled, poll]);

  const retry = useCallback(() => {
    setError(null);
    poll();
  }, [poll]);

  return { data, loading, error, retry };
}

