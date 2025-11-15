// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import './deno.d.ts';

// ============================================================================
// Types
// ============================================================================

interface GenerateSummaryRequest {
  url: string;
  headline?: string;
  html?: string;
  snippet?: string;
}

interface ArticleSummary {
  summary: string;
  headline: string;
  model: string;
  generatedAt: number;
}

interface ReplicateWebhookPayload {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  metrics?: {
    predict_time?: number;
  };
}

// ============================================================================
// URL Normalization
// ============================================================================

function normalizeUrl(url: string): string {
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

async function generateContentHash(
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

// ============================================================================
// Redis Client (Upstash REST API)
// ============================================================================

class RedisClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    const redisUrl = Deno.env.get('REDIS_REST_URL');
    const redisToken = Deno.env.get('REDIS_REST_TOKEN');

    if (!redisUrl || !redisToken) {
      throw new Error('REDIS_REST_URL and REDIS_REST_TOKEN must be set');
    }

    this.baseUrl = redisUrl.replace(/\/$/, '');
    this.token = redisToken;
  }

  private async executeCommand(command: string[]): Promise<any> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Redis request failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result;
  }

  async get(key: string): Promise<string | null> {
    try {
      const result = await this.executeCommand(['GET', key]);
      return result.result || null;
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      const command = ttlSeconds
        ? ['SET', key, value, 'EX', ttlSeconds.toString()]
        : ['SET', key, value];

      const result = await this.executeCommand(command);
      return result.result === 'OK';
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  async setnx(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<boolean> {
    try {
      // SETNX with TTL: SET key value NX EX ttl
      const command = ['SET', key, value, 'NX', 'EX', ttlSeconds.toString()];
      const result = await this.executeCommand(command);

      // If result is null, key already exists (NX condition failed)
      return result.result === 'OK';
    } catch (error) {
      console.error(`Redis SETNX error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      const result = await this.executeCommand(['DEL', key]);
      return result.result > 0;
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }
}

// ============================================================================
// Replicate API Client
// ============================================================================

class ReplicateClient {
  private apiToken: string;
  private webhookUrl: string;

  constructor() {
    const apiToken = Deno.env.get('REPLICATE_API_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!apiToken) {
      throw new Error('REPLICATE_API_TOKEN must be set');
    }

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL must be set');
    }

    this.apiToken = apiToken;
    this.webhookUrl = `${supabaseUrl.replace(
      /\/$/,
      ''
    )}/functions/v1/nbs-tech/webhook`;
  }

  async createPrediction(
    text: string,
    headline: string
  ): Promise<{ id: string; status: string }> {
    const prompt = `Summarize the following article in 2-3 concise paragraphs. Focus on the main points and key information.

Title: ${headline || 'Untitled'}

Article:
${text}

Summary:`;

    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google-deepmind/gemma-2b',
        input: {
          prompt: prompt,
          max_new_tokens: 500,
          temperature: 0.7,
        },
        webhook: this.webhookUrl,
        webhook_events_filter: ['completed'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Replicate API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: data.status,
    };
  }
}

// ============================================================================
// Endpoints
// ============================================================================

async function handleGenerateSummary(
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

async function handleFetchSummary(
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

async function handleWebhook(
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

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    // Parse URL to determine route
    const url = new URL(req.url);
    const path = url.pathname;

    // Extract route from path (handles both /functions/v1/nbs-tech/route and /route)
    const routeMatch = path.match(
      /\/(generate-summary|fetch-summary|webhook)(?:\?|$)/
    );
    const route = routeMatch ? routeMatch[1] : null;

    // Route handling
    if (req.method === 'POST' && route === 'generate-summary') {
      try {
        const redis = new RedisClient();
        const replicate = new ReplicateClient();
        return await handleGenerateSummary(req, redis, replicate);
      } catch (error) {
        if (error instanceof Error && error.message.includes('must be set')) {
          return new Response(
            JSON.stringify({ error: 'Configuration error: ' + error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    } else if (req.method === 'GET' && route === 'fetch-summary') {
      try {
        const redis = new RedisClient();
        return await handleFetchSummary(req, redis);
      } catch (error) {
        if (error instanceof Error && error.message.includes('must be set')) {
          return new Response(
            JSON.stringify({ error: 'Configuration error: ' + error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    } else if (req.method === 'POST' && route === 'webhook') {
      try {
        const redis = new RedisClient();
        return await handleWebhook(req, redis);
      } catch (error) {
        if (error instanceof Error && error.message.includes('must be set')) {
          return new Response(
            JSON.stringify({ error: 'Configuration error: ' + error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw error;
      }
    } else {
      return new Response(
        JSON.stringify({
          error: 'Not found',
          availableEndpoints: [
            'POST /generate-summary',
            'GET /fetch-summary',
            'POST /webhook',
          ],
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Request handler error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
