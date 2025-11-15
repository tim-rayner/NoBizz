import type { GenerateSummaryRequest, ArticleSummary } from '../types/index.ts';
import { normalizeUrl, generateContentHash } from '../utils/index.ts';
import type { RedisClient } from '../domain/redis-client.ts';
import type { ReplicateClient } from '../domain/replicate-client.ts';

// ============================================================================
// Generate Summary Handler
// ============================================================================

export async function handleGenerateSummary(
  req: Request,
  redis: RedisClient,
  replicate: ReplicateClient
): Promise<Response> {
  try {
    const body: GenerateSummaryRequest = await req.json();

    if (!body.url) {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Normalize URL
    const normalizedUrl = normalizeUrl(body.url);

    // Step 1: Check URL → hash mapping
    const urlKey = `url:${normalizedUrl}`;
    const existingHash = await redis.get(urlKey);

    if (existingHash) {
      // URL mapping exists, check article cache
      const articleKey = `article:${existingHash}`;
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
            hash: existingHash,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Step 2: Generate content hash
    const hash = await generateContentHash(
      normalizedUrl,
      body.headline || '',
      body.snippet || body.html?.substring(0, 300) || ''
    );

    // Step 3: Check article cache by hash
    const articleKey = `article:${hash}`;
    const cachedArticle = await redis.get(articleKey);

    if (cachedArticle) {
      const summary: ArticleSummary = JSON.parse(cachedArticle);

      // Update URL mapping for future fast lookups
      await redis.set(urlKey, hash, 604800); // 7 days

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

    // Step 4: Check deduplication lock
    const lockKey = `lock:${hash}`;
    const lockAcquired = await redis.setnx(lockKey, '1', 60); // 60 second TTL

    if (!lockAcquired) {
      // Another request is already processing
      return new Response(JSON.stringify({ status: 'pending', hash: hash }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 5: Call Replicate
    try {
      const text = body.html || body.snippet || '';
      const prediction = await replicate.createPrediction(
        text,
        body.headline || ''
      );

      // Store predictionId → hash mapping for webhook lookup
      // Store as JSON to include headline and normalized URL
      const predictionKey = `prediction:${prediction.id}`;
      const predictionData = JSON.stringify({
        hash: hash,
        headline: body.headline || '',
        normalizedUrl: normalizedUrl,
      });
      await redis.set(predictionKey, predictionData, 3600); // 1 hour TTL

      return new Response(
        JSON.stringify({
          status: 'processing',
          hash: hash,
          predictionId: prediction.id,
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      // Release lock on error
      await redis.del(lockKey);
      throw error;
    }
  } catch (error) {
    console.error('Generate summary error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

