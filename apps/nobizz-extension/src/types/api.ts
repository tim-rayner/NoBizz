// ============================================================================
// API Types - Matching Edge Function Contracts
// ============================================================================

export interface GenerateSummaryRequest {
  url: string;
  headline?: string;
  html?: string;
  snippet?: string;
}

export interface GenerateSummaryResponse {
  status: 'processing' | 'complete';
  hash?: string;
  predictionId?: string;
  summary?: string;
  headline?: string;
  generatedAt?: number;
  cached?: boolean;
}

export interface FetchSummaryResponse {
  status: 'pending' | 'complete' | 'unknown';
  hash?: string;
  summary?: string;
  headline?: string;
  generatedAt?: number;
  cached?: boolean;
}

export interface ErrorResponse {
  error: string;
}

export interface PageContent {
  url: string;
  headline: string;
  html: string;
}

