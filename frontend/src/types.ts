export type ProcessingStage = 
  | 'idle' 
  | 'uploading'
  | 'queued'
  | 'converting'
  | 'finalizing'
  | 'cancelling'
  | 'cancelled'
  | 'complete'
  | 'error';

export interface ProcessingState {
  isProcessing: boolean;
  stage: ProcessingStage;
  message: string;
  logs: string[];
  error: string | null;
  success: boolean;
  uploadProgress: number;
  progress: number;
  jobId: string | null;
}

export interface DocumentData {
  fileName: string;
  content: string;
  lastModified: Date;
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

// A single OCR'd region cropped from the source PDF, pending review. Text is
// editable in the UI before the user searches the web or inserts it, since
// raw OCR output often needs trimming to make a good search query.
export interface ExtractionResult {
  id: string;
  text: string;
}

// Mirrors CitationMatch.public_state() in
// backend/src/services/citation_service.py.
export interface CitationMatch {
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  confidence: number;
}

// Mirrors CitationVerificationResult.public_state() in
// backend/src/services/citation_service.py. `match` is null when OpenAlex has
// no plausible hit; `llm_assessment` is an advisory-only plausibility read
// from a local Ollama model, present only when `llm_available` is true.
export interface CitationVerificationResult {
  query_text: string;
  match: CitationMatch | null;
  llm_assessment: string | null;
  llm_available: boolean;
}

// A CitationVerificationResult with a client-generated id, for the review
// list — same array-of-results pattern as ExtractionResult.
export interface CitationVerificationEntry extends CitationVerificationResult {
  id: string;
}

// Mirrors the response shape of POST /api/translate in backend/src/main.py.
// direction/domain are typed loosely here (matching HistoryEntry.lang/table_mode
// in services/api.ts) — the strict TranslationDirection/TranslationDomain
// unions live there too, where the request is built and typo-safety matters.
export interface TranslationResult {
  original_text: string;
  translated_text: string;
  direction: string;
  domain: string | null;
}

// A TranslationResult with a client-generated id, for the review list —
// same array-of-results pattern as CitationVerificationEntry.
export interface TranslationEntry extends TranslationResult {
  id: string;
}
