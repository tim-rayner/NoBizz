// ============================================================================
// Custom Site-Specific Parsers
// ============================================================================

import { extractArticleContent } from './html-extractor.ts';

interface ExtractedContent {
  text: string;
  title?: string;
}

/**
 * Sky News parser
 * Extracts content from news.sky.com articles
 */
function parseSkyNews(html: string): ExtractedContent | null {
  try {
    // Sky News uses specific article containers
    const articlePatterns = [
      /<article[^>]*class="[^"]*sdc-article-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*sdc-article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*data-module="[^"]*ArticleBody[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    
    for (const pattern of articlePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const articleHtml = match[1];
        const text = extractTextFromHtml(articleHtml);
        
        if (text.length > 100) { // Valid article content
          const title = extractTitle(html) || extractSkyNewsTitle(html);
          return { text: text.trim(), title };
        }
      }
    }
    
    // Fallback to generic if patterns don't match
    return null;
  } catch (error) {
    console.error('Sky News parser error:', error);
    return null;
  }
}

function extractSkyNewsTitle(html: string): string | undefined {
  const patterns = [
    /<h1[^>]*class="[^"]*sdc-article-header__headline[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*data-testid="[^"]*headline[^"]*"[^>]*>([^<]+)<\/h1>/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * BBC News parser
 * Extracts content from bbc.com and bbc.co.uk articles
 */
function parseBBC(html: string): ExtractedContent | null {
  try {
    // BBC uses specific article containers
    const articlePatterns = [
      /<article[^>]*data-component="[^"]*text-block[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*data-component="[^"]*text-block[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    
    // BBC articles are often split into multiple text blocks
    const allMatches: string[] = [];
    for (const pattern of articlePatterns) {
      const matches = html.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        if (match[1]) {
          allMatches.push(match[1]);
        }
      }
    }
    
    if (allMatches.length > 0) {
      const combinedHtml = allMatches.join('\n\n');
      const text = extractTextFromHtml(combinedHtml);
      
      if (text.length > 100) {
        const title = extractTitle(html) || extractBBCTitle(html);
        return { text: text.trim(), title };
      }
    }
    
    return null;
  } catch (error) {
    console.error('BBC parser error:', error);
    return null;
  }
}

function extractBBCTitle(html: string): string | undefined {
  const patterns = [
    /<h1[^>]*class="[^"]*story-headline[^"]*"[^>]*>([^<]+)<\/h1>/i,
    /<h1[^>]*id="[^"]*main-heading[^"]*"[^>]*>([^<]+)<\/h1>/i,
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

// Helper functions (duplicated from html-extractor for independence)
function extractTextFromHtml(html: string): string {
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  
  let text = cleaned
    .replace(/<\/?(p|div|h[1-6]|li|br|article|section|span)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  return text;
}

function extractTitle(html: string): string | undefined {
  const metaTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (metaTitleMatch && metaTitleMatch[1]) {
    return metaTitleMatch[1].trim();
  }
  
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  
  return undefined;
}

/**
 * Site parser registry
 * Maps URL patterns to specific parsers
 */
const siteParsers: Array<{
  pattern: RegExp;
  parser: (html: string) => ExtractedContent | null;
  name: string;
}> = [
  {
    pattern: /^https?:\/\/(www\.)?(news\.)?sky\.com/i,
    parser: parseSkyNews,
    name: 'Sky News',
  },
  {
    pattern: /^https?:\/\/(www\.)?bbc\.(com|co\.uk)/i,
    parser: parseBBC,
    name: 'BBC',
  },
];

/**
 * Get site-specific parser for a URL
 */
export function getSiteParser(url: string): ((html: string) => ExtractedContent | null) | null {
  for (const { pattern, parser, name } of siteParsers) {
    if (pattern.test(url)) {
      console.log(`Using ${name} parser for URL: ${url}`);
      return parser;
    }
  }
  return null;
}

/**
 * Get all registered site parser names (for logging/debugging)
 */
export function getRegisteredSites(): string[] {
  return siteParsers.map(({ name }) => name);
}

