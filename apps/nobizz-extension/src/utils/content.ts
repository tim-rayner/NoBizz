import type { PageContent } from "../types/api";

/**
 * Extract page content from the current active tab
 * Uses Plasmo/Chrome messaging pattern to communicate with content script
 */
export async function extractPageContent(): Promise<PageContent> {
  console.log("[Content Extraction] Starting page content extraction...");
  try {
    // Query the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    console.log("[Content Extraction] Active tab:", {
      id: tab?.id,
      url: tab?.url,
      title: tab?.title,
    });

    if (!tab || !tab.id) {
      console.error("[Content Extraction] No active tab found");
      throw new Error("No active tab found");
    }

    // Check if it's a chrome:// or extension page (not accessible)
    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://") || tab.url?.startsWith("edge://")) {
      console.error("[Content Extraction] Cannot extract from browser internal page:", tab.url);
      throw new Error("Cannot extract content from browser internal pages");
    }

    // Try to send message to content script first
    return new Promise((resolve, reject) => {
      console.log("[Content Extraction] Attempting to send message to content script, tab ID:", tab.id);
      
      chrome.tabs.sendMessage(
        tab.id!,
        { action: "getPageData" },
        (response) => {
          // Check for runtime error (content script not loaded)
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.warn("[Content Extraction] Content script not available, injecting script directly. Error:", errorMsg);
            
            // Fallback: Inject script directly to get page data
            chrome.scripting.executeScript(
              {
                target: { tabId: tab.id! },
                func: () => {
                  return {
                    url: window.location.href,
                    headline: document.title,
                    html: document.documentElement.outerHTML,
                  };
                },
              },
              (results) => {
                if (chrome.runtime.lastError) {
                  console.error("[Content Extraction] Script injection failed:", chrome.runtime.lastError.message);
                  reject(
                    new Error(
                      chrome.runtime.lastError.message ||
                        "Failed to extract page content. Please refresh the page and try again."
                    )
                  );
                  return;
                }

                if (!results || !results[0] || !results[0].result) {
                  console.error("[Content Extraction] No data from injected script");
                  reject(new Error("Failed to extract page content"));
                  return;
                }

                const { url, headline, html } = results[0].result;
                console.log("[Content Extraction] Successfully extracted content via injection:", {
                  url,
                  headline,
                  htmlLength: html?.length || 0,
                  htmlPreview: html?.substring(0, 100) + "...",
                });
                resolve({ url, headline, html });
              }
            );
            return;
          }

          // Content script responded successfully
          if (!response) {
            console.error("[Content Extraction] No response from content script");
            reject(new Error("No response from content script"));
            return;
          }

          if (!response.success) {
            console.error("[Content Extraction] Content script error:", response.error);
            reject(new Error(response.error || "Failed to extract page data"));
            return;
          }

          const { url, headline, html } = response.data;
          console.log("[Content Extraction] Successfully extracted content via message:", {
            url,
            headline,
            htmlLength: html?.length || 0,
            htmlPreview: html?.substring(0, 100) + "...",
          });
          resolve({ url, headline, html });
        }
      );
    });
  } catch (error) {
    console.error("[Content Extraction] Error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to extract page content");
  }
}

