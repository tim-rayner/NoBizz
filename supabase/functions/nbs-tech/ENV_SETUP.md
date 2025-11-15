# Environment Variables Setup Guide

This guide explains how to configure environment variables for the NBS Tech Supabase Edge Function.

## Required Environment Variables

The following environment variables are required for the function to work:

1. **REDIS_REST_URL** - Upstash Redis REST API URL
2. **REDIS_REST_TOKEN** - Upstash Redis REST API token
3. **REPLICATE_API_TOKEN** - Replicate API token
4. **SUPABASE_URL** - Your Supabase project URL

## Local Development Setup

### Step 1: Create `.env` File

Create a `.env` file in the `supabase/` directory:

```bash
touch supabase/.env
```

### Step 2: Add Environment Variables

Add your secrets to `supabase/.env`:

```env
# Redis (Upstash)
REDIS_REST_URL=https://your-redis-instance.upstash.io
REDIS_REST_TOKEN=your-redis-rest-token

# Replicate API
REPLICATE_API_TOKEN=r8_your-replicate-api-token

# Supabase URL (use local for local dev)
SUPABASE_URL=http://127.0.0.1:54321
```

**Important:** Add `supabase/.env` to `.gitignore` to avoid committing secrets:

```bash
echo "supabase/.env" >> .gitignore
```

### Step 3: Serve Function with Environment Variables

When serving the function locally, it will automatically read from `supabase/.env`:

```bash
supabase functions serve nbs-tech --env-file supabase/.env
```

Or using Nx:

```bash
nx run nbs-tech:serve
```

## Production Setup

For production deployment, set secrets using Supabase CLI:

```bash
# Set each secret
supabase secrets set REDIS_REST_URL=https://your-redis-instance.upstash.io
supabase secrets set REDIS_REST_TOKEN=your-redis-rest-token
supabase secrets set REPLICATE_API_TOKEN=r8_your-replicate-api-token
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
```

## Getting Your Credentials

### Redis (Upstash)

1. Sign up or log in at [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database (select **Global** type for minimal latency)
3. Once created, navigate to the database's details page
4. Copy the **REST URL** and **REST Token** from the database details

### Replicate API

1. Sign up or log in at [Replicate](https://replicate.com/)
2. Go to **Account** → **API Tokens**
3. Create a new token (or use an existing one)
4. Copy the token (it starts with `r8_`)

### Supabase URL

- **Local Development:** `http://127.0.0.1:54321` (shown when running `supabase start`)
- **Production:** `https://your-project-ref.supabase.co` (found in your Supabase project settings)

## Testing Locally

### 1. Start Supabase

```bash
supabase start
```

This will show you the local URLs and keys. Note the **API URL** and **anon key**.

### 2. Serve the Function

```bash
supabase functions serve nbs-tech --env-file supabase/.env
```

The function will be available at: `http://127.0.0.1:54321/functions/v1/nbs-tech`

### 3. Test the Endpoints

**Generate Summary:**

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/nbs-tech/generate-summary' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "url": "https://example.com/article",
    "headline": "Test Article",
    "snippet": "This is a test article snippet for summarization..."
  }'
```

**Fetch Summary:**

```bash
curl -i --location --request GET 'http://127.0.0.1:54321/functions/v1/nbs-tech/fetch-summary?url=https://example.com/article' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'
```

Replace `YOUR_ANON_KEY` with the anon key from `supabase start` output.

## Environment Variable Reference

| Variable              | Description                                 | Example                                               |
| --------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `REDIS_REST_URL`      | Upstash Redis REST API endpoint             | `https://your-redis.upstash.io`                       |
| `REDIS_REST_TOKEN`    | Upstash Redis REST API authentication token | `AXxxxxx...`                                          |
| `REPLICATE_API_TOKEN` | Replicate API token for LLM predictions     | `r8_xxxxx...`                                         |
| `SUPABASE_URL`        | Supabase project URL (local or production)  | `http://127.0.0.1:54321` or `https://xxx.supabase.co` |

## Troubleshooting

### "Configuration error: REDIS_REST_URL must be set"

- Ensure `supabase/.env` exists and contains all required variables
- Check that you're using `--env-file supabase/.env` when serving
- Verify the variable names match exactly (case-sensitive)

### "Invalid token" errors

- **Redis:** Verify the REST URL and token from Upstash console
- **Replicate:** Ensure token starts with `r8_` and is active
- Check for extra spaces or quotes in `.env` file

### Environment variables not loading

- Ensure `.env` file is in `supabase/` directory (not project root)
- Check file permissions: `chmod 600 supabase/.env`
- Restart the function server after changing `.env`

## Security Best Practices

1. **Never commit `.env` files** - Always add to `.gitignore`
2. **Use different credentials** for local development and production
3. **Rotate tokens regularly** - Update secrets if compromised
4. **Use Supabase secrets** for production instead of `.env` files
5. **Limit token permissions** - Use read-only tokens where possible

## Example `.env` File Template

```env
# Copy this template to supabase/.env and fill in your values

# Redis Configuration (Upstash)
REDIS_REST_URL=https://your-redis-instance.upstash.io
REDIS_REST_TOKEN=your-redis-rest-token-here

# Replicate API Configuration
REPLICATE_API_TOKEN=r8_your-replicate-api-token-here

# Supabase Configuration
# For local: http://127.0.0.1:54321
# For production: https://your-project-ref.supabase.co
SUPABASE_URL=http://127.0.0.1:54321
```

## Next Steps

After setting up environment variables:

1. Test locally with `supabase functions serve`
2. Deploy to production: `supabase functions deploy nbs-tech`
3. Verify production secrets: `supabase secrets list`
