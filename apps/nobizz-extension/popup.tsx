import { useState, useEffect } from "react";
import { extractPageContent } from "./src/utils/content";
import { generateSummary } from "./src/utils/api";
import { usePolling } from "./src/hooks/usePolling";
import type { GenerateSummaryResponse, FetchSummaryResponse } from "./src/types/api";

type LoadingState = "idle" | "extracting" | "generating" | "polling";

// Log that the popup component is loading
console.log("[Popup] Component file loaded");

function IndexPopup() {
  console.log("[Popup] Component rendering - IndexPopup function called");
  
  const [loading, setLoading] = useState<LoadingState>("extracting");
  const [summary, setSummary] = useState<FetchSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string>("");

  // Polling hook - only poll when in polling state
  const shouldPoll = loading === "polling" && hash !== null;
  const { data: pollData, loading: polling, error: pollError, retry: retryPoll } = usePolling(
    hash,
    shouldPoll
  );

  // Log component mount
  useEffect(() => {
    console.log("[Popup] Component mounted, useEffect triggered");
  }, []);

  // Extract content and start generation on mount
  useEffect(() => {
    const startGeneration = async () => {
      console.log("[Popup] Starting generation process");
      try {
        setError(null);
        setLoading("extracting");
        console.log("[Popup] State: extracting");

        // Extract page content
        console.log("[Popup] Extracting page content...");
        const pageContent = await extractPageContent();
        setHeadline(pageContent.headline);
        console.log("[Popup] Page content extracted:", {
          url: pageContent.url,
          headline: pageContent.headline,
        });

        setLoading("generating");
        console.log("[Popup] State: generating");

        // Generate summary
        console.log("[Popup] Calling generateSummary API...");
        const response: GenerateSummaryResponse = await generateSummary(
          pageContent.url,
          pageContent.headline,
          pageContent.html
        );

        console.log("[Popup] generateSummary response:", {
          status: response.status,
          hash: response.hash,
          predictionId: response.predictionId,
          cached: response.cached,
          hasSummary: !!response.summary,
        });

        if (response.status === "complete" && response.summary) {
          // Already complete (cached)
          console.log("[Popup] Summary already complete (cached)");
          setSummary({
            status: "complete",
            summary: response.summary,
            headline: response.headline || pageContent.headline,
            generatedAt: response.generatedAt,
            cached: response.cached,
            hash: response.hash,
          });
          setLoading("idle");
          console.log("[Popup] State: idle (complete)");
        } else if (response.status === "processing" && response.hash) {
          // Start polling
          console.log("[Popup] Starting polling with hash:", response.hash);
          setHash(response.hash);
          setLoading("polling");
          console.log("[Popup] State: polling");
        } else {
          console.error("[Popup] Unexpected response:", response);
          throw new Error("Unexpected response from server");
        }
      } catch (err) {
        console.error("[Popup] Error in startGeneration:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading("idle");
        console.log("[Popup] State: idle (error)");
      }
    };

    startGeneration();
  }, []);

  // Handle polling results
  useEffect(() => {
    console.log("[Popup] Polling effect triggered:", {
      hasPollData: !!pollData,
      pollDataStatus: pollData?.status,
      pollError,
      loading,
      shouldPoll,
    });

    if (pollData) {
      console.log("[Popup] Processing poll data:", {
        status: pollData.status,
        hasSummary: !!pollData.summary,
        cached: pollData.cached,
      });

      if (pollData.status === "complete" && pollData.summary) {
        console.log("[Popup] Summary complete! Setting summary data");
        setSummary(pollData);
        setLoading("idle");
        setHash(null); // Stop polling
        console.log("[Popup] State: idle (complete from polling)");
      } else if (pollData.status === "unknown") {
        console.log("[Popup] Summary status unknown, stopping polling");
        setError("Summary not found. Please try again.");
        setLoading("idle");
        setHash(null); // Stop polling
      } else if (pollData.status === "pending") {
        console.log("[Popup] Summary still pending, continuing to poll...");
      }
    }
    if (pollError && loading === "polling") {
      console.error("[Popup] Polling error:", pollError);
      setError(pollError);
      // Don't stop polling on error - let it retry
    }
  }, [pollData, pollError, loading, shouldPoll]);

  const handleRetry = () => {
    setError(null);
    setSummary(null);
    setHash(null);
    setLoading("extracting");

    // Restart the process
    const startGeneration = async () => {
      try {
        const pageContent = await extractPageContent();
        setHeadline(pageContent.headline);
        setLoading("generating");

        const response: GenerateSummaryResponse = await generateSummary(
          pageContent.url,
          pageContent.headline,
          pageContent.html
        );

        if (response.status === "complete" && response.summary) {
          setSummary({
            status: "complete",
            summary: response.summary,
            headline: response.headline || pageContent.headline,
            generatedAt: response.generatedAt,
            cached: response.cached,
            hash: response.hash,
          });
          setLoading("idle");
        } else if (response.status === "processing" && response.hash) {
          setHash(response.hash);
          setLoading("polling");
        } else {
          throw new Error("Unexpected response from server");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading("idle");
      }
    };

    startGeneration();
  };

  // Format timestamp
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          border: "3px solid #f3f3f3",
          borderTop: "3px solid #0066cc",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );

  // Animated dots for polling
  const AnimatedDots = () => (
    <span
      style={{
        display: "inline-block",
        width: "20px",
        textAlign: "left",
      }}
    >
      <span
        style={{
          animation: "dot1 1.4s infinite",
          display: "inline-block",
        }}
      >
        .
      </span>
      <span
        style={{
          animation: "dot2 1.4s infinite",
          display: "inline-block",
        }}
      >
        .
      </span>
      <span
        style={{
          animation: "dot3 1.4s infinite",
          display: "inline-block",
        }}
      >
        .
      </span>
      <style>
        {`
          @keyframes dot1 {
            0%, 20% { opacity: 0; }
            40% { opacity: 1; }
            100% { opacity: 1; }
          }
          @keyframes dot2 {
            0%, 40% { opacity: 0; }
            60% { opacity: 1; }
            100% { opacity: 1; }
          }
          @keyframes dot3 {
            0%, 60% { opacity: 0; }
            80% { opacity: 1; }
            100% { opacity: 1; }
          }
        `}
      </style>
    </span>
  );

  console.log("[Popup] Rendering UI, current state:", {
    loading,
    hasSummary: !!summary,
    hasError: !!error,
    hash,
  });

  return (
    <div
      style={{
        width: "400px",
        maxHeight: "600px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: "14px",
        lineHeight: "1.5",
        color: "#1a1a1a",
        backgroundColor: "#FFFFFF",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 24px 16px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: "600",
            color: "#1a1a1a",
            letterSpacing: "-0.02em",
          }}
        >
          Article Summary
        </h1>
      </div>

      {/* Content */}
      <div
        style={{
          padding: "24px",
          maxHeight: "500px",
          overflowY: "auto",
        }}
      >
        {/* Loading States */}
        {loading === "extracting" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
              textAlign: "center",
            }}
          >
            <LoadingSpinner />
            <p
              style={{
                marginTop: "16px",
                color: "#666666",
                fontSize: "14px",
              }}
            >
              Reading article...
            </p>
          </div>
        )}

        {loading === "generating" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
              textAlign: "center",
            }}
          >
            <LoadingSpinner />
            <p
              style={{
                marginTop: "16px",
                color: "#666666",
                fontSize: "14px",
              }}
            >
              Analyzing content...
            </p>
          </div>
        )}

        {loading === "polling" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "200px",
              textAlign: "center",
            }}
          >
            <LoadingSpinner />
            <p
              style={{
                marginTop: "16px",
                color: "#666666",
                fontSize: "14px",
              }}
            >
              Almost there
              <AnimatedDots />
            </p>
          </div>
        )}

        {/* Error State */}
        {error && loading === "idle" && (
          <div
            style={{
              padding: "16px",
              backgroundColor: "#fff5f5",
              border: "1px solid #fed7d7",
              borderRadius: "8px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                margin: "0 0 12px 0",
                color: "#dc3545",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Error
            </p>
            <p
              style={{
                margin: "0 0 16px 0",
                color: "#666666",
                fontSize: "14px",
              }}
            >
              {error}
            </p>
            <button
              onClick={handleRetry}
              style={{
                padding: "8px 16px",
                backgroundColor: "#0066cc",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#0052a3";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#0066cc";
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Summary Display */}
        {summary && summary.status === "complete" && summary.summary && (
          <div>
            {summary.headline && (
              <h2
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#1a1a1a",
                  lineHeight: "1.4",
                }}
              >
                {summary.headline}
      </h2>
            )}
            <div
              style={{
                marginBottom: "16px",
                paddingBottom: "16px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#666666",
                  fontSize: "12px",
                }}
              >
                {summary.cached && (
                  <span
                    style={{
                      display: "inline-block",
                      marginRight: "8px",
                      padding: "2px 8px",
                      backgroundColor: "#e6f7ff",
                      color: "#0066cc",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: "500",
                    }}
                  >
                    Cached
                  </span>
                )}
                {summary.generatedAt && (
                  <span>Generated {formatDate(summary.generatedAt)}</span>
                )}
              </p>
            </div>
            <div
              style={{
                color: "#1a1a1a",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {summary.summary}
              </p>
            </div>
          </div>
        )}

        {/* Empty State (shouldn't normally show) */}
        {loading === "idle" && !summary && !error && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#666666",
            }}
          >
            <p style={{ margin: 0 }}>No summary available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Log when component is exported
console.log("[Popup] Component exported as default");

export default IndexPopup;
