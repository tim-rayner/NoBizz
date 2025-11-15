// ============================================================================
// Types
// ============================================================================

export interface GenerateSummaryRequest {
  url: string;
  headline?: string;
  html?: string;
  snippet?: string;
}

export interface ArticleSummary {
  summary: string;
  headline: string;
  model: string;
  generatedAt: number;
}

export interface ReplicateWebhookPayload {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  metrics?: {
    predict_time?: number;
  };
}

