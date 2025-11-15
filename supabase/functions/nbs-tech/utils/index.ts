// ============================================================================
// URL Normalization
// ============================================================================

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Lowercase hostname
    urlObj.hostname = urlObj.hostname.toLowerCase();

    // Remove tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
      'source',
      'medium',
      'campaign',
      '_ga',
      '_gl',
      'mc_cid',
      'mc_eid',
      'igshid',
      'twclid',
    ];

    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });

    // Strip fragments
    urlObj.hash = '';

    // Normalize trailing slashes (remove for consistency, except root)
    let pathname = urlObj.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }
    urlObj.pathname = pathname;

    // Convert mobile to desktop URLs (common patterns)
    const mobilePatterns = [
      { pattern: /^m\./, replacement: '' },
      { pattern: /\.m\./, replacement: '.' },
      { pattern: /\/mobile\//, replacement: '/' },
      { pattern: /\/m\//, replacement: '/' },
    ];

    let hostname = urlObj.hostname;
    mobilePatterns.forEach(({ pattern, replacement }) => {
      hostname = hostname.replace(pattern, replacement);
    });
    urlObj.hostname = hostname;

    return urlObj.toString();
  } catch (error) {
    console.error('URL normalization error:', error);
    return url;
  }
}

// ============================================================================
// Content Hashing
// ============================================================================

export async function generateContentHash(
  normalizedUrl: string,
  headline = '',
  snippet = ''
): Promise<string> {
  const content = JSON.stringify({
    url: normalizedUrl,
    headline: headline.trim(),
    snippet: snippet.trim().substring(0, 300), // First 300 chars
  });

  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}

