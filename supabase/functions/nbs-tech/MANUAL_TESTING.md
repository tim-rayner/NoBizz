# Manual Testing Guide for NBS Tech Edge Function

This guide provides step-by-step instructions for manually testing the NBS Tech summarization pipeline **without any external applications**. You'll use `curl` commands to test all endpoints and scenarios.

---

## **Prerequisites**

### 1. Required Tools

- **curl** (command-line HTTP client)
- **jq** (optional, for pretty-printing JSON responses)
- **Supabase CLI** (for local development)
- **Access to:**
  - Upstash Redis (for caching)
  - Replicate API (for LLM generation)

### 2. Environment Setup

Follow the setup instructions in `ENV_SETUP.md` to configure:

- `REDIS_REST_URL`
- `REDIS_REST_TOKEN`
- `REPLICATE_API_TOKEN`
- `PROJECT_URL`

Create `supabase/.env` with your credentials.

### 3. Get Your Supabase Anon Key

Start Supabase locally:

```bash
supabase start
```

Look for the output that shows:

```
API URL: http://127.0.0.1:54321
Publishable key: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
Secret key: sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz
```

**Note:** The **"Publishable key"** is your anon key (also called the public key). Use this for all API requests.

**Save the publishable key** - you'll need it for all API requests. The "Secret key" is the service role key and should be kept private.

---

## **Starting the Function Locally**

### Step 1: Start Supabase (if not already running)

```bash
supabase start
```

### Step 2: Serve the Edge Function

For local development, use the `--no-verify-jwt` flag to bypass JWT verification:

```bash
supabase functions serve nbs-tech --env-file supabase/.env --no-verify-jwt
```

**Note:** The `--no-verify-jwt` flag is only for local development. In production, JWT verification is handled automatically by Supabase.

You should see output like:

```
Functions URL: http://127.0.0.1:54321/functions/v1/nbs-tech
```

The function is now available at:

- Base URL: `http://127.0.0.1:54321/functions/v1/nbs-tech`
- Endpoints:
  - `POST /generate-summary`
  - `GET /fetch-summary`
  - `POST /webhook`

---

## **Setting Up Test Variables**

For convenience, set these environment variables in your terminal:

```bash
# Replace with your actual values from 'supabase start' output
export PROJECT_URL="http://127.0.0.1:54321"
export FUNCTION_BASE="${PROJECT_URL}/functions/v1/nbs-tech"
```

**Note:** When using `--no-verify-jwt` for local development, the `Authorization` header is **optional**. You can omit it from curl commands, or include it for testing purposes. The examples below include it for consistency, but it's not required when JWT verification is disabled.

---

## **Test Scenarios**

### **Scenario 1: First-Time Request (New Article)**

This tests the full pipeline: URL normalization → content hashing → Replicate call → webhook storage.

#### Step 1: Generate Summary Request

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.bbc.com/news/technology-123456",
    "headline": "AI Breakthrough Changes Everything",
    "snippet": "Scientists have made a groundbreaking discovery in artificial intelligence that could revolutionize how we interact with technology. The new system demonstrates unprecedented capabilities in natural language understanding and generation."
  }'
```

**Note:** The `Authorization` header is optional when using `--no-verify-jwt` for local development.

**Expected Response (202 Accepted):**

```json
{
  "status": "processing",
  "hash": "abc123def456...",
  "predictionId": "prediction-id-123"
}
```

**Save the `hash` and `predictionId`** from the response for next steps.

#### Step 2: Check Status (Polling Simulation)

```bash
# Replace HASH with the hash from Step 1
curl -i -X GET "${FUNCTION_BASE}/fetch-summary?hash=HASH" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

**Expected Response (200 OK):**

```json
{
  "status": "pending",
  "hash": "abc123def456..."
}
```

#### Step 3: Simulate Webhook Callback

When Replicate completes, it will call your webhook. For manual testing, you can simulate this:

```bash
# Replace PREDICTION_ID with the predictionId from Step 1
# Replace HASH with the hash from Step 1
curl -i -X POST "${FUNCTION_BASE}/webhook" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "PREDICTION_ID",
    "status": "succeeded",
    "output": "This article discusses a major AI breakthrough that could transform technology interactions. The new system shows advanced natural language capabilities."
  }'
```

**Expected Response (200 OK):**

```json
{
  "received": true,
  "stored": true
}
```

#### Step 4: Verify Summary is Available

```bash
# Using hash
curl -i -X GET "${FUNCTION_BASE}/fetch-summary?hash=HASH" \
  -H "Authorization: Bearer ${ANON_KEY}"

# Or using URL
curl -i -X GET "${FUNCTION_BASE}/fetch-summary?url=https://www.bbc.com/news/technology-123456" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

**Expected Response (200 OK):**

```json
{
  "status": "complete",
  "cached": true,
  "summary": "This article discusses a major AI breakthrough...",
  "headline": "AI Breakthrough Changes Everything",
  "generatedAt": 1731621120000,
  "hash": "abc123def456..."
}
```

---

### **Scenario 2: Cached Summary (Instant Return)**

This tests the URL → hash mapping and cache lookup.

#### Step 1: Request Same URL Again

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.bbc.com/news/technology-123456",
    "headline": "AI Breakthrough Changes Everything",
    "snippet": "Scientists have made a groundbreaking discovery..."
  }'
```

**Expected Response (200 OK):**

```json
{
  "status": "complete",
  "cached": true,
  "summary": "This article discusses a major AI breakthrough...",
  "headline": "AI Breakthrough Changes Everything",
  "generatedAt": 1731621120000,
  "hash": "abc123def456..."
}
```

**Note:** This should return **instantly** (<100ms) because:

1. URL → hash mapping exists
2. Article cache exists

---

### **Scenario 3: Duplicate Request (Deduplication Lock)**

This tests the deduplication lock to prevent duplicate Replicate calls.

#### Step 1: Make First Request (in background)

```bash
# This will start processing
curl -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/new-article",
    "headline": "New Article Title",
    "snippet": "This is a brand new article that has never been seen before..."
  }' &
```

#### Step 2: Immediately Make Second Request (Same Content)

```bash
# Run this within 1-2 seconds of Step 1
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/new-article",
    "headline": "New Article Title",
    "snippet": "This is a brand new article that has never been seen before..."
  }'
```

**Expected Response (200 OK):**

```json
{
  "status": "pending",
  "hash": "xyz789..."
}
```

**Note:** The second request should return `"status": "pending"` because:

1. First request acquired the lock
2. Second request found the lock exists
3. No duplicate Replicate call was made

---

### **Scenario 4: URL Normalization**

This tests that different URL formats map to the same content.

#### Step 1: Request with Tracking Parameters

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.bbc.com/news/technology-123456?utm_source=twitter&fbclid=abc123",
    "headline": "AI Breakthrough Changes Everything",
    "snippet": "Scientists have made a groundbreaking discovery..."
  }'
```

#### Step 2: Request Same Article with Different URL Format

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.bbc.com/news/technology-123456#section",
    "headline": "AI Breakthrough Changes Everything",
    "snippet": "Scientists have made a groundbreaking discovery..."
  }'
```

**Expected Result:** Both requests should:

- Normalize to the same URL
- Generate the same content hash
- Return the same cached summary (if first request completed)

---

### **Scenario 5: Content-Based Hashing**

This tests that different URLs with identical content share the same hash.

#### Step 1: Request Article from Primary URL

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article-v1",
    "headline": "Shared Content Article",
    "snippet": "This exact same content appears on multiple URLs..."
  }'
```

Wait for webhook to complete, then:

#### Step 2: Request Same Content from Different URL

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/article-v2",
    "headline": "Shared Content Article",
    "snippet": "This exact same content appears on multiple URLs..."
  }'
```

**Expected Result:**

- Same hash generated (same content)
- Same cached summary returned
- Both URLs now map to the same hash

---

### **Scenario 6: Error Handling**

#### Test 1: Missing URL

```bash
curl -i -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "headline": "Test Article"
  }'
```

**Expected Response (400 Bad Request):**

```json
{
  "error": "URL is required"
}
```

#### Test 2: Missing Parameters in Fetch

```bash
curl -i -X GET "${FUNCTION_BASE}/fetch-summary" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

**Expected Response (400 Bad Request):**

```json
{
  "error": "Either url or hash parameter is required"
}
```

#### Test 3: Unknown Hash

```bash
curl -i -X GET "${FUNCTION_BASE}/fetch-summary?hash=unknown-hash-123" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

**Expected Response (200 OK):**

```json
{
  "status": "unknown",
  "hash": "unknown-hash-123"
}
```

#### Test 4: Failed Replicate Prediction

Simulate a failed webhook:

```bash
# First, make a generate request and note the predictionId
# Then simulate failure:
curl -i -X POST "${FUNCTION_BASE}/webhook" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "PREDICTION_ID",
    "status": "failed",
    "error": "Model timeout"
  }'
```

**Expected Response (200 OK):**

```json
{
  "received": true,
  "error": "Model timeout"
}
```

---

## **Complete End-to-End Workflow Test**

This simulates the full user journey:

### Step 1: Generate Summary

```bash
RESPONSE=$(curl -s -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://techcrunch.com/2024/01/15/ai-news",
    "headline": "Latest AI Developments",
    "snippet": "The AI industry continues to evolve rapidly with new breakthroughs in machine learning and natural language processing."
  }')

echo "$RESPONSE" | jq '.'
```

Extract values:

```bash
HASH=$(echo "$RESPONSE" | jq -r '.hash')
PREDICTION_ID=$(echo "$RESPONSE" | jq -r '.predictionId')
STATUS=$(echo "$RESPONSE" | jq -r '.status')

echo "Hash: $HASH"
echo "Prediction ID: $PREDICTION_ID"
echo "Status: $STATUS"
```

### Step 2: Poll for Status (Simulate Client Polling)

```bash
# Poll every 2 seconds, up to 10 times
for i in {1..10}; do
  echo "Poll attempt $i..."
  RESULT=$(curl -s -X GET "${FUNCTION_BASE}/fetch-summary?hash=${HASH}" \
    -H "Authorization: Bearer ${ANON_KEY}")

  STATUS=$(echo "$RESULT" | jq -r '.status')
  echo "Status: $STATUS"

  if [ "$STATUS" = "complete" ]; then
    echo "$RESULT" | jq '.'
    break
  fi

  sleep 2
done
```

### Step 3: Simulate Webhook (When Replicate Completes)

```bash
curl -i -X POST "${FUNCTION_BASE}/webhook" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"${PREDICTION_ID}\",
    \"status\": \"succeeded\",
    \"output\": \"This article covers recent AI industry developments, highlighting advances in machine learning and natural language processing technologies.\"
  }"
```

### Step 4: Verify Final Result

```bash
curl -i -X GET "${FUNCTION_BASE}/fetch-summary?url=https://techcrunch.com/2024/01/15/ai-news" \
  -H "Authorization: Bearer ${ANON_KEY}"
```

---

## **Testing with jq (Pretty JSON Output)**

If you have `jq` installed, use it to format responses:

```bash
curl -s -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/test",
    "headline": "Test",
    "snippet": "Test content"
  }' | jq '.'
```

---

## **Verifying Redis State (Optional)**

If you have access to your Upstash Redis console, you can verify the keys:

### Expected Keys After a Complete Request:

1. **URL Mapping:**

   ```
   url:https://example.com/article
   → hash value
   ```

2. **Article Cache:**

   ```
   article:{hash}
   → JSON with summary, headline, generatedAt, model
   ```

3. **Prediction Mapping (temporary, 1 hour TTL):**

   ```
   prediction:{predictionId}
   → JSON with hash, headline, normalizedUrl
   ```

4. **Lock (temporary, 60 second TTL):**
   ```
   lock:{hash}
   → "1"
   ```

---

## **Performance Testing**

### Test Cache Hit Speed

```bash
# First request (cache miss)
time curl -s -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/perf-test",
    "headline": "Performance Test",
    "snippet": "Testing cache performance..."
  }' > /dev/null

# Wait for webhook, then second request (cache hit)
time curl -s -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/perf-test",
    "headline": "Performance Test",
    "snippet": "Testing cache performance..."
  }' > /dev/null
```

**Expected:** Second request should be **<100ms** (cache hit).

---

## **Troubleshooting**

### Issue: "Configuration error: REDIS_REST_URL must be set"

**Solution:**

- Verify `supabase/.env` exists and contains all required variables
- Ensure you're using `--env-file supabase/.env` when serving
- Check for typos in variable names (case-sensitive)

### Issue: "Invalid token" errors

**Solution:**

- Verify Redis REST token from Upstash console
- Verify Replicate API token starts with `r8_`
- Check for extra spaces/quotes in `.env` file

### Issue: Webhook not being called

**Solution:**

- Check Replicate dashboard for prediction status
- Verify `PROJECT_URL` is correct in environment
- Check function logs: `supabase functions logs nbs-tech`

### Issue: Status stuck on "pending"

**Solution:**

- Check if lock expired (60 second TTL)
- Verify webhook was called successfully
- Check Redis for `article:{hash}` key

---

## **Quick Reference: All Endpoints**

### POST /generate-summary

```bash
curl -X POST "${FUNCTION_BASE}/generate-summary" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url": "...", "headline": "...", "snippet": "..."}'
```

### GET /fetch-summary

```bash
# By URL
curl -X GET "${FUNCTION_BASE}/fetch-summary?url=..." \
  -H "Authorization: Bearer ${ANON_KEY}"

# By Hash
curl -X GET "${FUNCTION_BASE}/fetch-summary?hash=..." \
  -H "Authorization: Bearer ${ANON_KEY}"
```

### POST /webhook

```bash
curl -X POST "${FUNCTION_BASE}/webhook" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"id": "...", "status": "succeeded", "output": "..."}'
```

---

## **Next Steps**

After manual testing:

1. Test with the Chrome extension
2. Monitor production logs
3. Set up monitoring/alerts
4. Test edge cases (very long content, special characters, etc.)

---

**Last Updated:** 2025-01-14
