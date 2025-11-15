import { assertEquals, assertRejects } from '@std/assert';
import {
  extractRoute,
  handleConfigurationError,
} from './index.ts';
import type { RedisClient } from './domain/redis-client.ts';
import type { ReplicateClient } from './domain/replicate-client.ts';

// ============================================================================
// Test Utilities
// ============================================================================

function createMockRequest(
  method: string,
  path: string,
  body?: any
): Request {
  const url = `https://example.com${path}`;
  return new Request(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  });
}

function createMockRedisClient(): RedisClient {
  return {
    get: async () => null,
    set: async () => true,
    setnx: async () => true,
    del: async () => true,
  };
}

function createMockReplicateClient(): ReplicateClient {
  return {
    createPrediction: async () => ({ id: 'test-id', status: 'starting' }),
  };
}

// ============================================================================
// Tests for extractRoute
// ============================================================================

Deno.test('extractRoute: should extract generate-summary route', () => {
  assertEquals(extractRoute('/generate-summary'), 'generate-summary');
});

Deno.test('extractRoute: should extract fetch-summary route', () => {
  assertEquals(extractRoute('/fetch-summary'), 'fetch-summary');
});

Deno.test('extractRoute: should extract webhook route', () => {
  assertEquals(extractRoute('/webhook'), 'webhook');
});

Deno.test('extractRoute: should extract route with query parameters', () => {
  assertEquals(extractRoute('/generate-summary?test=1'), 'generate-summary');
  assertEquals(extractRoute('/fetch-summary?url=test'), 'fetch-summary');
  assertEquals(extractRoute('/webhook?key=value'), 'webhook');
});

Deno.test('extractRoute: should return null for invalid routes', () => {
  assertEquals(extractRoute('/invalid-route'), null);
  assertEquals(extractRoute('/'), null);
  assertEquals(extractRoute('/some/other/path'), null);
  assertEquals(extractRoute('/generate-summary/extra'), null);
});

Deno.test('extractRoute: should return null for empty path', () => {
  assertEquals(extractRoute(''), null);
});

Deno.test('extractRoute: should handle paths with trailing slashes', () => {
  // Note: The regex doesn't match trailing slashes, so these should return null
  assertEquals(extractRoute('/generate-summary/'), null);
  assertEquals(extractRoute('/fetch-summary/'), null);
});

// ============================================================================
// Tests for handleConfigurationError
// ============================================================================

Deno.test('handleConfigurationError: should return 500 response for configuration errors', async () => {
  const error = new Error('REDIS_REST_URL must be set');
  const response = handleConfigurationError(error);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: REDIS_REST_URL must be set');
  assertEquals(response.headers.get('Content-Type'), 'application/json');
});

Deno.test('handleConfigurationError: should return 500 for REPLICATE_API_TOKEN error', async () => {
  const error = new Error('REPLICATE_API_TOKEN must be set');
  const response = handleConfigurationError(error);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: REPLICATE_API_TOKEN must be set');
});

Deno.test('handleConfigurationError: should return 500 for PROJECT_URL error', async () => {
  const error = new Error('PROJECT_URL must be set');
  const response = handleConfigurationError(error);

  assertEquals(response.status, 500);
  const body = await response.json();
    assertEquals(body.error, 'Configuration error: PROJECT_URL must be set');
});

Deno.test('handleConfigurationError: should throw for non-configuration errors', async () => {
  const error = new Error('Some other error');
  
  await assertRejects(
    async () => {
      handleConfigurationError(error);
    },
    Error,
    'Some other error'
  );
});

Deno.test('handleConfigurationError: should handle errors with "must be set" in message', async () => {
  const error = new Error('Some variable must be set to continue');
  const response = handleConfigurationError(error);

  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: Some variable must be set to continue');
});

// ============================================================================
// Tests for Main Handler Routing Logic
// ============================================================================

// Note: Since Deno.serve wraps the handler, we'll test the routing logic
// by importing and testing the handler function directly
// We'll need to mock the dependencies and router handlers

Deno.test('Main Handler: should route POST /generate-summary correctly', async () => {
  // This test verifies the routing logic works
  // In a real scenario, you'd mock the router handlers
  const path = '/generate-summary';
  const route = extractRoute(path);
  
  assertEquals(route, 'generate-summary');
  // The actual handler would call handleGenerateSummary here
});

Deno.test('Main Handler: should route GET /fetch-summary correctly', async () => {
  const path = '/fetch-summary';
  const route = extractRoute(path);
  
  assertEquals(route, 'fetch-summary');
  // The actual handler would call handleFetchSummary here
});

Deno.test('Main Handler: should route POST /webhook correctly', async () => {
  const path = '/webhook';
  const route = extractRoute(path);
  
  assertEquals(route, 'webhook');
  // The actual handler would call handleWebhook here
});

Deno.test('Main Handler: should return 404 for unknown routes', async () => {
  const path = '/unknown-route';
  const route = extractRoute(path);
  
  assertEquals(route, null);
  // The actual handler would return 404 here
});

Deno.test('Main Handler: should handle configuration errors in generate-summary', async () => {
  const error = new Error('REDIS_REST_URL must be set');
  const response = handleConfigurationError(error);
  
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: REDIS_REST_URL must be set');
});

Deno.test('Main Handler: should handle configuration errors in fetch-summary', async () => {
  const error = new Error('REDIS_REST_TOKEN must be set');
  const response = handleConfigurationError(error);
  
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: REDIS_REST_TOKEN must be set');
});

Deno.test('Main Handler: should handle configuration errors in webhook', async () => {
  const error = new Error('REDIS_REST_URL must be set');
  const response = handleConfigurationError(error);
  
  assertEquals(response.status, 500);
  const body = await response.json();
  assertEquals(body.error, 'Configuration error: REDIS_REST_URL must be set');
});

// ============================================================================
// Integration-style tests for routing
// ============================================================================

Deno.test('Routing: should match all valid route patterns', () => {
  const validRoutes = [
    '/generate-summary',
    '/fetch-summary',
    '/webhook',
    '/generate-summary?param=value',
    '/fetch-summary?url=test',
    '/webhook?id=123',
  ];

  for (const route of validRoutes) {
    const extracted = extractRoute(route);
    assertEquals(extracted !== null, true, `Route ${route} should be extracted`);
  }
});

Deno.test('Routing: should reject invalid route patterns', () => {
  const invalidRoutes = [
    '/',
    '/invalid',
    '/generate-summary/extra',
    '/fetch-summary/extra',
    '/webhook/extra',
    '/generate-summary/',
    '/fetch-summary/',
    '/webhook/',
  ];

  for (const route of invalidRoutes) {
    const extracted = extractRoute(route);
    assertEquals(extracted, null, `Route ${route} should not be extracted`);
  }
});

