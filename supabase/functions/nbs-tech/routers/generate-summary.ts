import type { GenerateSummaryRequest, ArticleSummary } from '../types/index.ts';
import {
  normalizeUrl,
  generateContentHash,
  extractContentSafe,
} from '../utils/index.ts';
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

    // Step 2: Extract article content from HTML (if provided)
    // This reduces the input size significantly by removing non-article content
    let extractedText = body.snippet || '';
    
    if (body.html) {
      try {
        const extracted = await extractContentSafe(
          body.html,
          normalizedUrl,
          body.snippet
        );
        extractedText = extracted;
        console.log(
          `Extracted ${extracted.length} characters from HTML (original: ${body.html.length})`
        );
      } catch (error) {
        console.error('Content extraction error, using snippet:', error);
        // Fallback to snippet if extraction fails
        extractedText = body.snippet || '';
      }
    }

    // Step 3: Generate content hash using extracted text
    const hash = await generateContentHash(
      normalizedUrl,
      body.headline || '',
      extractedText.substring(0, 300) // First 300 chars for hash
    );

    // Step 4: Check article cache by hash
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

    // Step 5: Check deduplication lock
    const lockKey = `lock:${hash}`;
    const lockAcquired = await redis.setnx(lockKey, '1', 60); // 60 second TTL

    if (!lockAcquired) {
      // Another request is already processing
      return new Response(JSON.stringify({ status: 'pending', hash: hash }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 6: Call Replicate with extracted text
    try {
      // Use extracted text instead of raw HTML for much faster processing
      const text = extractedText || body.snippet || '';
      
      if (!text || text.trim().length === 0) {
        // Release lock on error
        await redis.del(lockKey);
        return new Response(
          JSON.stringify({
            error: 'No content available for summarization',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
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

