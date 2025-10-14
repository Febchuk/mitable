export interface ChatRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface ChatSource {
  id: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface ChatApiResponse {
  response: string;
  sources: ChatSource[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
