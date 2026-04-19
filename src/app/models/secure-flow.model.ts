export interface TextExtractRequest {
  file: File;
}
// Backend currently returns the full extracted text under the `textPreview` key.
// We keep a raw type that matches the backend and map it to a clearer internal shape.
export interface TextExtractResponseRaw {
  uploadId: string;
  textPreview: string;
  extractedText?: string;
}

export interface TextExtractResponse {
  uploadId: string;
  extractedText: string;
}

export interface PiiDetectRequest {
  requestId: string;
  documentExtractedContent: string | null;
  userPrompt: string;
}
export interface SensitiveDataItem {
  type: string;
  value: string;
  source: string;
  start: number;
  end: number;
}
export type PiiDetectResponse = SensitiveDataItem[];

export interface MaskRequest {
  requestId: string;
  prompt: string;
  document: string | null;
  sensitiveData: SensitiveDataItem[];
}
export interface MaskResponse {
  requestId: string;
  maskedDocument: string;
  maskedPrompt: string;
  mappingId: string;
  tokenMappings: Record<string, string>;
}

export interface ExternalAiRequest {
  requestId: string;
  provider: string;
  maskedPrompt: string;
  maskedDocument: string;
  tokenMappings: Record<string, string>;
  options: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  timeoutMs: number;
}
export interface ExternalAiResponse {
  requestId: string;
  provider: string;
  model: string;
  tokenizedResponse: string;
}

export interface RehydrateRequest {
  mappingId: string;
  tokenizedResponse: string;
  tokenMappings?: Record<string, string>;
}
export interface RehydrateResponse {
  mappingId: string;
  finalText: string;
  warnings?: {
    type: string;
    token: string;
    message: string;
  }[];
}
