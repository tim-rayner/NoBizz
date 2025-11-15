// ============================================================================
// Generic HTML Content Extractor
// ============================================================================

/**
 * Extracts main article content from HTML using a generic approach.
 * Removes scripts, styles, navigation, ads, and other non-article content.
 */

interface ExtractedContent {
  text: string;
  title?: string;
}

/**
 * Removes unwanted HTML elements and extracts text content
 */
function cleanHtml(html: string): string {
  // Remove script and style tags and their content
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove common non-content elements
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  cleaned = cleaned.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  return cleaned;
}

/**
 * Extracts text content from HTML, preserving paragraph structure
 */
function extractTextFromHtml(html: string): string {
  const cleaned = cleanHtml(html);

  // Extract text from common article containers
  // Try to find main content areas
  const articlePatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  let content = cleaned;

  // Try to find article content using patterns
  for (const pattern of articlePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      content = match[1];
      break;
    }
  }

  // Convert HTML to text, preserving paragraph breaks
  const text = content
    // Replace block elements with newlines
    .replace(/<\/?(p|div|h[1-6]|li|br|article|section)[^>]*>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text;
}

/**
 * Extracts title from HTML
 */
function extractTitle(html: string): string | undefined {
  // Try meta title first
  const metaTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
  );
  if (metaTitleMatch && metaTitleMatch[1]) {
    return metaTitleMatch[1].trim();
  }

  // Try h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return h1Match[1].trim();
  }

  // Try title tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }

  return undefined;
}

/**
 * Generic HTML content extractor
 * Extracts main article text from HTML, removing non-content elements
 */
export function extractArticleContent(html: string): ExtractedContent {
  if (!html || html.trim().length === 0) {
    return { text: '' };
  }

  const text = extractTextFromHtml(html);
  const title = extractTitle(html);

  return {
    text: text.trim(),
    title: title,
  };
}
