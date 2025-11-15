# NBS Tech Article Summarization Pipeline

## **1. Overview**

This document outlines the **entire summarisation pipeline** powering **NoBizz**, using the **NBS Tech Supabase Edge Function**. It covers:

- URL normalisation  
- URL → hash pointer mapping  
- Article-content hashing  
- Redis caching strategy  
- Deduplication locks to prevent duplicate LLM calls  
- Replicate generation + webhook callback  
- Client polling workflow  
- Full visual diagrams  

The architecture is optimised for:

- **Speed** (instant <100ms cache hits)  
- **Cost-efficiency** (no duplicate Replicate calls)  
- **Scalability** (thousands of users hitting the same article)  
- **Accuracy** (updated article content triggers regeneration automatically)

---

## **2. High-Level System Flow (Visual)**

```
Chrome Extension
     |
     v
Supabase Edge Function
     |
     |--- Lookup URL→hash index
     |--- Lookup article:{hash}
     |--- Check dedupe lock
     |
     v
Replicate (LLM)
     |
   webhook
     |
     v
Redis stores result + updates URL mapping
     |
     v
Client polls → summary returned
```

---

## **3. Detailed End-to-End Flow**

---

### **3.1 Step 1 — Normalise URL**

Every incoming URL is normalised for consistency:

- Lowercase host  
- Remove tracking params (`utm_*`, `fbclid`, `ref`, etc.)  
- Strip fragments (`#…`)  
- Convert mobile → desktop equivalents where possible  
- Ensure trailing slashes are handled consistently  

**Example:**

Input:  
```
https://m.bbc.co.uk/news/uk-123?utm_source=twitter
```

Normalised:  
```
https://bbc.co.uk/news/uk-123
```

**Implementation:** See `normalizeUrl()` function in `index.ts` (lines 37-98)

---

### **3.2 Step 2 — URL→Hash Lookup (New Upgrade)**

Before generating a hash from content, we check if this URL has already been mapped.

```
GET url:{normalizedUrl}
```

#### **Case A — Mapping exists**

Retrieve its hash → lookup the summary:

```
GET article:{hash}
```

If found → **return summary instantly**.

If article not found but URL contains a hash → this means a race condition or TTL expiry. Continue with regeneration.

#### **Case B — Mapping does not exist**

Proceed to content hashing step.

**Implementation:** See `handleGenerateSummary()` in `index.ts` (lines 311-334)

---

### **3.3 Step 3 — Generate Content-Based Hash**

If URL was not found in index, we extract:

- headline  
- first 200–300 chars of text  
- metadata  

Then generate:

```
hash = sha256(JSON.stringify({
  url: normalizedUrl,
  headline,
  snippet: first300chars
}))
```

This ensures:

- Same content → same hash  
- Updated content → new hash  
- Different URLs pointing to identical content → same hash  

**Implementation:** See `generateContentHash()` function in `index.ts` (lines 104-124)

---

### **3.4 Step 4 — Check Redis for Cached Summary (By Hash)**

```
GET article:{hash}
```

#### If exists:

Return:
```json
{
  "cached": true,
  "status": "complete",
  "summary": "...",
  "headline": "...",
  "generatedAt": 1731621120000
}
```

Also optionally update:

```
SET url:{normalizedUrl} = hash
```

(Ensuring all future hits for this URL become instant)

**Implementation:** See `handleGenerateSummary()` in `index.ts` (lines 343-364)

---

### **3.5 Step 5 — Deduplication Lock (Avoid Paying Twice)**

If summary is missing:

```
SETNX lock:{hash} 1 EX 60
```

#### If lock exists:

Another request is already generating the result.

Return:
```json
{ "status": "pending" }
```

The client will poll the `/fetch-summary` endpoint.

#### If lock does NOT exist:

Current request becomes the "leader task".

Proceed to Replicate.

**Implementation:** See `handleGenerateSummary()` in `index.ts` (lines 366-376)

---

### **3.6 Step 6 — Call Replicate with Webhook**

The edge function sends:

- cleaned text  
- headline  
- structured summary instructions  
- webhook URL  

```json
{
  "input": {...},
  "webhook": "https://your-domain.com/replicate/webhook",
  "webhook_events_filter": ["completed"]
}
```

#### Immediate Response to Client:

```json
{ "status": "processing" }
```

**Implementation:** See `ReplicateClient.createPrediction()` in `index.ts` (lines 245-286)

---

### **3.7 Step 7 — Webhook Callback Stores Summary**

When Replicate completes:

1. Webhook receives final JSON  
2. It stores:

```
SET article:{hash} = summary EX 604800
SET url:{normalizedUrl} = hash
DEL lock:{hash}
```

TTL = **7 days**

If multiple URLs lead to this content, additional URLs will be mapped on first access.

**Implementation:** See `handleWebhook()` in `index.ts` (lines 499-591)

---

### **3.8 Step 8 — Client Polling Workflow**

Clients poll:

```
GET /fetch-summary?url=... or ?hash=...
```

Backend performs:

1. Normalise URL  
2. Lookup URL → hash  
3. Lookup article:{hash}  

#### Response variations:

##### Summary ready
```json
{
  "status": "complete",
  "summary": "…",
  "cached": true
}
```

##### Still processing
```json
{ "status": "pending" }
```

##### No mapping yet
```json
{ "status": "unknown" }
```

**Implementation:** See `handleFetchSummary()` in `index.ts` (lines 420-497)

---

## **4. Updated Visual Architecture with URL Mapping**

### **4.1 URL-first Flow**

```
Client
  |
  v
Edge Function
  |
  |--- GET url:{normalizedUrl}
  |         |
  |         |-- hit → retrieve hash → GET article:{hash} → return summary
  |
  |--- miss → extract text → generate content-hash
  |--- GET article:{hash}
  |         |
  |         |-- hit → return summary + update url:{normalizedUrl}
  |
  |--- miss → SETNX lock:{hash}
  |         |
  |         |-- fail → return pending
  |         |-- success → call Replicate
```

---

### **4.2 Webhook Storage**

```
Replicate Webhook
     |
     |--- summary ready
     |
     v
Redis
  - SET article:{hash} = summary (7 days)
  - SET url:{normalizedUrl} = hash
  - DEL lock:{hash}
```

---

### **4.3 Client Polling Loop**

```
Client polls every 1–2s
        |
        v
Edge Function
        |
        |--- lookup url:{normalizedUrl}
        |--- lookup article:{hash}
        |
        v
Return summary when ready
```

---

## **5. Redis Key Structure (Updated)**

### **Primary article storage**

```
article:{hash} = {
  summary: "...",
  headline: "...",
  model: "gemma-2b",
  generatedAt: <timestamp>
}
```

**TTL:** 7 days (604,800 seconds)

### **URL → hash mapping**

```
url:{normalizedUrl} = {hash}
```

**TTL:** 7 days (604,800 seconds)

### **Deduplication lock**

```
lock:{hash} = 1
```

**TTL:** 60 seconds

### **Prediction ID mapping**

```
prediction:{id} = {
  hash: "...",
  headline: "...",
  normalizedUrl: "..."
}
```

**TTL:** 1 hour (3,600 seconds) - used for webhook lookup

---

## **6. API Endpoints**

### **6.1 POST /generate-summary**

Generates or retrieves a summary for an article.

**Request:**
```json
{
  "url": "https://example.com/article",
  "headline": "Article Title (optional)",
  "snippet": "Article snippet text (optional)",
  "html": "Full HTML content (optional)"
}
```

**Response Variations:**

**Cached Summary (200 OK):**
```json
{
  "status": "complete",
  "cached": true,
  "summary": "Article summary text...",
  "headline": "Article Title",
  "generatedAt": 1731621120000,
  "hash": "abc123..."
}
```

**Processing (202 Accepted):**
```json
{
  "status": "processing",
  "hash": "abc123...",
  "predictionId": "prediction-id-123"
}
```

**Pending (200 OK):**
```json
{
  "status": "pending",
  "hash": "abc123..."
}
```

**Error (400/500):**
```json
{
  "error": "Error message"
}
```

**Implementation:** See `handleGenerateSummary()` in `index.ts` (lines 293-418)

---

### **6.2 GET /fetch-summary**

Polls for summary status. Used by clients to check if a summary is ready.

**Query Parameters:**
- `url` (string, optional): Normalized URL to lookup
- `hash` (string, optional): Content hash to lookup directly

**Response Variations:**

**Summary Ready (200 OK):**
```json
{
  "status": "complete",
  "cached": true,
  "summary": "Article summary text...",
  "headline": "Article Title",
  "generatedAt": 1731621120000,
  "hash": "abc123..."
}
```

**Still Processing (200 OK):**
```json
{
  "status": "pending",
  "hash": "abc123..."
}
```

**Unknown (200 OK):**
```json
{
  "status": "unknown",
  "hash": "abc123..." // if hash was provided
}
```

**Error (400/500):**
```json
{
  "error": "Error message"
}
```

**Implementation:** See `handleFetchSummary()` in `index.ts` (lines 420-497)

---

### **6.3 POST /webhook**

Receives webhook callbacks from Replicate when predictions complete.

**Request (from Replicate):**
```json
{
  "id": "prediction-id-123",
  "status": "succeeded" | "failed" | "canceled",
  "output": "Summary text..." | ["line1", "line2"],
  "error": "Error message (if failed)",
  "metrics": {
    "predict_time": 3.5
  }
}
```

**Response:**
```json
{
  "received": true,
  "stored": true // if succeeded
}
```

**Implementation:** See `handleWebhook()` in `index.ts` (lines 499-591)

---

## **7. Timing & Performance Expectations**

| Stage | Time |
|-------|------|
| URL normalisation | <5ms |
| URL→hash lookup | <1ms |
| Summary cache lookup | <40ms |
| Cached summary returned | <100ms |
| Replicate generation | 2–12s |
| Webhook store | <30ms |
| Client polling | every 1–2 seconds |

---

## **8. Integration Points**

### **8.1 Chrome Extension Integration**

The NoBizz Chrome extension calls the Supabase Edge Function to generate summaries:

1. **Extension extracts article content** from the current page
2. **Sends POST request** to `/generate-summary` with URL, headline, and snippet
3. **Receives response:**
   - If cached: displays summary immediately
   - If processing: starts polling `/fetch-summary` every 1-2 seconds
   - If pending: waits and polls
4. **Displays summary** when status becomes "complete"

**Example Extension Call:**
```typescript
const response = await fetch(
  `${PROJECT_URL}/functions/v1/nbs-tech/generate-summary`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({
      url: window.location.href,
      headline: document.title,
      snippet: extractTextFromPage()
    })
  }
);
```

### **8.2 Environment Variables**

The function requires the following environment variables:

- `REDIS_REST_URL` - Upstash Redis REST API URL
- `REDIS_REST_TOKEN` - Upstash Redis REST API token
- `REPLICATE_API_TOKEN` - Replicate API token
- `PROJECT_URL` - Supabase project URL (for webhook construction)

**See:** `ENV_SETUP.md` for detailed setup instructions

### **8.3 Supabase Edge Function Deployment**

The function is deployed as a Supabase Edge Function:

```bash
supabase functions deploy nbs-tech
```

**Location:** `supabase/functions/nbs-tech/`

### **8.4 External Service Dependencies**

- **Replicate API:** For LLM-based summarization using `google-deepmind/gemma-2b` model
- **Upstash Redis:** For caching and deduplication (REST API)

---

## **9. Benefits of the Architecture**

### 🚀 **Ultra-fast**  

- URL→hash lookups return summaries in ~50–100ms  
- Worldwide distribution via Redis → minimal latency

### 💸 **Cost-efficiency**  

- No duplicate Replicate calls  
- Dedupe lock prevents parallel spend

### ⚡ **Scalable**  

- Thousands of users reading the same BBC article = **one LLM cost**

### 🔒 **Secure**  

- Clients never talk to Replicate directly  
- API keys never exposed  

### 🧠 **Accurate + Fresh**  

- Updated article content → new hash  
- Old cache expires naturally  
- URL mapping ensures consistent behaviour

### 🔄 **Flexible**  

- Add new models easily  
- Add more metadata  
- Expand index for ML ranking or analytics

---

## **10. Full System Diagram**

```
 ┌───────────────────────────────────────────────────────────┐
 │                     CHROME EXTENSION                      │
 │  1. Sends URL + extracted snippet                         │
 └───────────────┬───────────────────────────────────────────┘
                 |
                 v
 ┌───────────────────────────────────────────────────────────┐
 │                SUPABASE EDGE FUNCTION                     │
 │  - normalise URL                                          │
 │  - GET url:{normalizedUrl} → hash?                        │
 │  - GET article:{hash} → summary?                          │
 │  - if not: generate hash from content                     │
 │  - SETNX lock:{hash}                                      │
 │  - call Replicate with webhook                            │
 └───────────────┬───────────────────────────────────────────┘
                 |
         cache hit? yes → return summary
                 |
                 no
                 |
                 v
 ┌───────────────────────────────────────────────────────────┐
 │                         REDIS                              │
 │ - url:{normalizedUrl} → hash                               │
 │ - article:{hash}                                           │
 │ - lock:{hash}                                              │
 │ - prediction:{id}                                          │
 └───────────────┬───────────────────────────────────────────┘
                 |
                 v
 ┌───────────────────────────────────────────────────────────┐
 │                        REPLICATE                           │
 │       (Asynchronous summary generation)                   │
 └───────────────┬───────────────────────────────────────────┘
                 |
           webhook callback
                 |
                 v
 ┌───────────────────────────────────────────────────────────┐
 │                     WEBHOOK ENDPOINT                      │
 │ - SET article:{hash} = result                             │
 │ - SET url:{normalizedUrl} = hash                          │
 │ - DEL lock:{hash}                                         │
 └───────────────┬───────────────────────────────────────────┘
                 |
         user polling loop (1–2s)
                 |
                 v
 ┌───────────────────────────────────────────────────────────┐
 │             EDGE FUNCTION (fetch-summary)                 │
 │  - return summary when ready                               │
 └───────────────────────────────────────────────────────────┘
```

---

## **11. Implementation Details**

### **11.1 Code Structure**

The implementation is located in `supabase/functions/nbs-tech/index.ts`:

- **URL Normalization:** `normalizeUrl()` (lines 37-98)
- **Content Hashing:** `generateContentHash()` (lines 104-124)
- **Redis Client:** `RedisClient` class (lines 130-216)
- **Replicate Client:** `ReplicateClient` class (lines 222-287)
- **Endpoints:**
  - `handleGenerateSummary()` (lines 293-418)
  - `handleFetchSummary()` (lines 420-497)
  - `handleWebhook()` (lines 499-591)
- **Main Handler:** `Deno.serve()` (lines 597-675)

### **11.2 Error Handling**

All endpoints include comprehensive error handling:

- Configuration errors (missing environment variables)
- Redis connection errors
- Replicate API errors
- Invalid request format errors
- Webhook processing errors

Errors are logged and returned with appropriate HTTP status codes.

### **11.3 Cache Strategy**

- **Article summaries:** 7-day TTL (604,800 seconds)
- **URL mappings:** 7-day TTL (604,800 seconds)
- **Deduplication locks:** 60-second TTL
- **Prediction mappings:** 1-hour TTL (3,600 seconds)

This ensures:
- Frequently accessed articles remain cached
- Stale content expires naturally
- Locks don't persist indefinitely
- Prediction mappings are cleaned up after webhook processing

---

## **12. Future Enhancements**

Potential improvements and extensions:

1. **Multi-model support:** Allow clients to specify different LLM models
2. **Analytics tracking:** Track which URLs are most frequently accessed
3. **Content versioning:** Track when articles are updated and regenerate summaries
4. **Batch processing:** Support multiple URLs in a single request
5. **Summary quality scoring:** Rate summaries and regenerate low-quality ones
6. **Custom TTLs:** Allow different cache durations for different content types
7. **Rate limiting:** Prevent abuse with per-IP or per-user rate limits
8. **Webhook retry logic:** Handle webhook delivery failures gracefully

---

## **13. Related Documentation**

- **Environment Setup:** See `ENV_SETUP.md` for configuration instructions
- **NoBizz Project:** See `README.md` for project overview
- **Chrome Extension:** See `apps/nobizz-extension/README.md` for extension details

---

**Last Updated:** 2025-01-14  
**Version:** 1.0.0

