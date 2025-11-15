// ============================================================================
// Content Extractor - Main Entry Point
// ============================================================================

import { extractArticleContent } from './html-extractor.ts';
import { getSiteParser } from './site-parsers.ts';

export interface ExtractedContent {
  text: string;
  title?: string;
}

/**
 * Main content extraction function
 * Routes to custom parser if available, otherwise uses generic extractor
 */
export async function extractContent(
  html: string,
  url: string
): Promise<ExtractedContent> {
  if (!html || html.trim().length === 0) {
    console.warn('Empty HTML provided for extraction');
    return { text: '' };
  }

  // Try site-specific parser first
  const customParser = getSiteParser(url);
  if (customParser) {
    try {
      const result = customParser(html);
      if (result && result.text && result.text.length > 50) {
        // Valid content extracted
        console.log(
          `Custom parser extracted ${result.text.length} characters from ${url}`
        );
        return result;
      } else {
        console.log(
          `Custom parser returned insufficient content, falling back to generic parser`
        );
      }
    } catch (error) {
      console.error(`Custom parser error for ${url}:`, error);
      // Fall through to generic parser
    }
  }

  // Fallback to generic extractor
  console.log(`Using generic extractor for ${url}`);
  const result = extractArticleContent(html);

  // Validate extracted content
  if (!result.text || result.text.length < 50) {
    console.warn(
      `Generic extractor returned minimal content (${result.text.length} chars) for ${url}`
    );
  } else {
    console.log(
      `Generic extractor extracted ${result.text.length} characters from ${url}`
    );
  }

  return result;
}

/**
 * Extract content with error handling and fallbacks
 */
export async function extractContentSafe(
  html: string | undefined,
  url: string,
  fallbackSnippet?: string
): Promise<string> {
  // If no HTML, use snippet if available
  if (!html || html.trim().length === 0) {
    if (fallbackSnippet) {
      console.log(`No HTML provided, using snippet for ${url}`);
      return fallbackSnippet;
    }
    return '';
  }

  try {
    const extracted = await extractContent(html, url);
    
    // If extraction failed or returned minimal content, use snippet
    if (!extracted.text || extracted.text.length < 50) {
      if (fallbackSnippet && fallbackSnippet.length > extracted.text.length) {
        console.log(`Extraction returned minimal content, using snippet for ${url}`);
        return fallbackSnippet;
      }
    }
    
    return extracted.text || '';
  } catch (error) {
    console.error(`Content extraction error for ${url}:`, error);
    
    // Fallback to snippet on error
    if (fallbackSnippet) {
      console.log(`Using snippet as fallback due to extraction error`);
      return fallbackSnippet;
    }
    
    return '';
  }
}

