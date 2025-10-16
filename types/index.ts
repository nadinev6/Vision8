export interface VideoSegment {
  scene_id: string;
  time_ms: number;
  end_time_ms: number;
  summary: string;
  description: string;
  score: number;
  highlights?: {
    scene_summary?: string[];
    full_description?: string[];
    'transcript_phrases.text'?: string[];
  };
  transcript: TranscriptPhrase[];
  objects: TrackedObject[];
  actions: string[];
}

export interface TranscriptPhrase {
  text: string;
  start_ms: number;
  end_ms: number;
  speaker: string;
}

export interface TrackedObject {
  label: string;
  track_id: string;
  boxes: BoundingBox[];
}

export interface BoundingBox {
  frame_ms: number;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface SearchResult {
  segment: VideoSegment;
  relevant_text: string;
  context_type: string;
  confidence_score: number;
}

export interface ChatResponse {
  answer: string;
  sources: SearchResult[];
  suggested_followups: string[];
  metadata: {
    model: string;
    processed_at: string;
    total_sources: number;
    context_types: string[];
    confidence_threshold: number;
    search_strategy: string;
  };
  timestamp: string;
  query: string;
}