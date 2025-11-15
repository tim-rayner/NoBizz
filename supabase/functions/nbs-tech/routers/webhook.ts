import type { ArticleSummary, ReplicateWebhookPayload } from '../types/index.ts';
import type { RedisClient } from '../domain/redis-client.ts';

// ============================================================================
// Webhook Handler
// ============================================================================

export async function handleWebhook(
  req: Request,
  redis: RedisClient
): Promise<Response> {
  try {
    const payload: ReplicateWebhookPayload = await req.json();

    // Lookup hash from prediction ID
    const predictionKey = `prediction:${payload.id}`;
    const predictionDataStr = await redis.get(predictionKey);

    if (!predictionDataStr) {
      console.warn('Webhook received for unknown prediction:', payload.id);
      return new Response(
        JSON.stringify({ received: true, warning: 'Unknown prediction ID' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const predictionData = JSON.parse(predictionDataStr);
    const hash = predictionData.hash;
    const headline = predictionData.headline || 'Article Summary';
    const normalizedUrl = predictionData.normalizedUrl;

    if (payload.status === 'succeeded' && payload.output) {
      // Extract summary from output
      const summaryText = Array.isArray(payload.output)
        ? payload.output.join('\n')
        : String(payload.output);

      // Create article summary object
      const summary: ArticleSummary = {
        summary: summaryText.trim(),
        headline: headline,
        model: 'google-deepmind/gemma-2b',
        generatedAt: Date.now(),
      };

      // Store article summary
      const articleKey = `article:${hash}`;
      await redis.set(articleKey, JSON.stringify(summary), 604800); // 7 days

      // Update URL mapping for fast future lookups
      if (normalizedUrl) {
        const urlKey = `url:${normalizedUrl}`;
        await redis.set(urlKey, hash, 604800); // 7 days
      }

      // Clean up prediction mapping
      await redis.del(predictionKey);

      // Release lock
      const lockKey = `lock:${hash}`;
      await redis.del(lockKey);

      console.log('Summary stored for hash:', hash);

      return new Response(JSON.stringify({ received: true, stored: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (payload.status === 'failed') {
      console.error('Replicate prediction failed:', payload.error);

      // Release lock
      const lockKey = `lock:${hash}`;
      await redis.del(lockKey);

      // Clean up prediction mapping
      await redis.del(predictionKey);

      return new Response(
        JSON.stringify({ received: true, error: payload.error }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

