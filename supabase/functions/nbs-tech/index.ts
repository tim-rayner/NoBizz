import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import './deno.d.ts';

// Type declaration for IDE support (Deno is provided by deno.ns lib at runtime)
declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

import { createRedisClient, createReplicateClient } from './domain/index.ts';
import {
  handleFetchSummary,
  handleGenerateSummary,
  handleWebhook,
} from './routers/index.ts';

// ============================================================================
// Route Helper
// ============================================================================

export function extractRoute(path: string): string | null {
  const routeMatch = path.match(
    /\/(generate-summary|fetch-summary|webhook)(?:\?|$)/
  );
  return routeMatch ? routeMatch[1] : null;
}

export function handleConfigurationError(error: Error): Response {
  if (error.message.includes('must be set')) {
    return new Response(
      JSON.stringify({ error: 'Configuration error: ' + error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  throw error;
}

// ============================================================================
// Authentication Helpers
// ============================================================================

function verifyJWT(req: Request): { valid: boolean; error?: string } {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' };
  }

  // Basic validation: check that token is present and not empty
  const token = authHeader.substring(7).trim();
  if (!token || token.length === 0) {
    return { valid: false, error: 'Empty token' };
  }

  // For production, you may want to add proper JWT verification here
  // For now, we accept any non-empty Bearer token
  // This allows the function to work with Supabase's anon key or service role key
  return { valid: true };
}

function verifyWebhookSecret(req: Request): { valid: boolean; error?: string } {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');

  if (!expectedSecret) {
    // If WEBHOOK_SECRET is not set, allow the request (for local development)
    // In production, WEBHOOK_SECRET should be set
    return { valid: true };
  }

  if (!secret || secret !== expectedSecret) {
    return { valid: false, error: 'Invalid or missing webhook secret' };
  }

  return { valid: true };
}

// ============================================================================
// Main Handler
// ============================================================================

// Only start the server if this file is being run directly (not imported for tests)
if (import.meta.main) {
  Deno.serve(async (req: Request) => {
    try {
      // Parse URL to determine route
      const url = new URL(req.url);
      const path = url.pathname;
      const route = extractRoute(path);

      // GENERATE SUMMARY
      if (req.method === 'POST' && route === 'generate-summary') {
        // Verify JWT for protected endpoint
        const authResult = verifyJWT(req);
        if (!authResult.valid) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: ' + authResult.error }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        try {
          const redis = createRedisClient();
          const replicate = createReplicateClient();
          return await handleGenerateSummary(req, redis, replicate);
        } catch (error) {
          return handleConfigurationError(error as Error);
        }
      }

      // GET SUMMARY
      if (req.method === 'GET' && route === 'fetch-summary') {
        // Verify JWT for protected endpoint
        const authResult = verifyJWT(req);
        if (!authResult.valid) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: ' + authResult.error }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        try {
          const redis = createRedisClient();
          return await handleFetchSummary(req, redis);
        } catch (error) {
          return handleConfigurationError(error as Error);
        }
      }

      // WEBHOOK
      if (req.method === 'POST' && route === 'webhook') {
        // Verify webhook secret for security (endpoint is public via config)
        const secretResult = verifyWebhookSecret(req);
        if (!secretResult.valid) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized: ' + secretResult.error }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }

        try {
          const redis = createRedisClient();
          return await handleWebhook(req, redis);
        } catch (error) {
          return handleConfigurationError(error as Error);
        }
      }

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
}
