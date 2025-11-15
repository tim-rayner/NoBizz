import type { ArticleSummary } from '../types/index.ts';
import { normalizeUrl } from '../utils/index.ts';
import type { RedisClient } from '../domain/redis-client.ts';

// ============================================================================
// Fetch Summary Handler
// ============================================================================

export async function handleFetchSummary(
  req: Request,
  redis: RedisClient
): Promise<Response> {
  try {
    const url = new URL(req.url);
    const urlParam = url.searchParams.get('url');
    const hashParam = url.searchParams.get('hash');

    if (!urlParam && !hashParam) {
      return new Response(
        JSON.stringify({ error: 'Either url or hash parameter is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let hash: string | null = null;

    if (hashParam) {
      hash = hashParam;
    } else if (urlParam) {
      // Normalize URL and lookup hash
      const normalizedUrl = normalizeUrl(urlParam);
      const urlKey = `url:${normalizedUrl}`;
      hash = await redis.get(urlKey);
    }

    if (!hash) {
      return new Response(JSON.stringify({ status: 'unknown' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if article exists
    const articleKey = `article:${hash}`;
    const cachedArticle = await redis.get(articleKey);

    if (cachedArticle) {
      const summary: ArticleSummary = JSON.parse(cachedArticle);
      return new Response(
        JSON.stringify({
          status: 'complete',
          cached: true,
          summary: summary.summary,
          headline: summary.headline,
          generatedAt: summary.generatedAt,
          hash: hash,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if lock exists (processing)
    const lockKey = `lock:${hash}`;
    const lockExists = await redis.get(lockKey);

    if (lockExists) {
      return new Response(JSON.stringify({ status: 'pending', hash: hash }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'unknown', hash: hash }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fetch summary error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

