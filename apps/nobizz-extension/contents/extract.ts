import type { PlasmoCSConfig } from "plasmo";

// Configure content script to run on all URLs
export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[Content Script] Message received:", request);
  
  if (request.action === "getPageData") {
    try {
      console.log("[Content Script] Extracting page data...");
      // Extract page data
      const pageData = {
        url: window.location.href,
        headline: document.title,
        html: document.documentElement.outerHTML,
      };
      
      console.log("[Content Script] Page data extracted:", {
        url: pageData.url,
        headline: pageData.headline,
        htmlLength: pageData.html?.length || 0,
      });
      
      sendResponse({ success: true, data: pageData });
    } catch (error) {
      console.error("[Content Script] Error extracting page data:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract page data",
      });
    }
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  console.log("[Content Script] Unknown action:", request.action);
});

