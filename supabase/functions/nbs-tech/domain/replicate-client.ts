import '../deno.d.ts';

// Type declaration for IDE support (Deno is provided by deno.ns lib at runtime)
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// ============================================================================
// Replicate API Client
// ============================================================================

export interface ReplicateClient {
  createPrediction(
    text: string,
    headline: string
  ): Promise<{ id: string; status: string }>;
}

interface ReplicateConfig {
  apiToken: string;
  webhookUrl: string;
  modelVersion: string;
}

export function createReplicateClient(): ReplicateClient {
  const apiToken = Deno.env.get('REPLICATE_API_TOKEN');
  const supabaseUrl = Deno.env.get('PROJECT_URL');
  const modelVersion = Deno.env.get('REPLICATE_MODEL_VERSION');
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');

  if (!apiToken) {
    throw new Error('REPLICATE_API_TOKEN must be set');
  }

  if (!supabaseUrl) {
    throw new Error('PROJECT_URL must be set');
  }

  if (!modelVersion) {
    throw new Error('REPLICATE_MODEL_VERSION must be set (e.g., get from https://replicate.com/google-deepmind/gemma-2b)');
  }

  // Build webhook URL with secret for authentication
  // Function is configured as public (auth: false) so no anon key needed
  let webhookUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/nbs-tech/webhook`;
  
  // Add webhook secret for our custom verification
  if (webhookSecret) {
    webhookUrl += `?secret=${encodeURIComponent(webhookSecret)}`;
  }

  const config: ReplicateConfig = {
    apiToken,
    webhookUrl,
    modelVersion,
  };

  return {
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
          Authorization: `Token ${config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: config.modelVersion,
          input: {
            prompt: prompt,
            max_new_tokens: 500,
            temperature: 0.7,
          },
          webhook: config.webhookUrl,
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
    },
  };
}
