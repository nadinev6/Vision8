"""
Transcription Result Processing Service

This module handles post-processing of transcription results including:
- Merging overlapping speech segments intelligently
- Filtering out low-confidence transcriptions
- Formatting transcription data for Elasticsearch storage
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime

from .models import (
    TranscriptionResult, 
    TranscriptSegment, 
    WordTimestamp,
    ConfidenceLevel,
    TranscriptionStatus
)

logger = logging.getLogger(__name__)


class TranscriptionProcessor:
    """
    Service for processing and optimizing transcription results
    
    Handles intelligent segment merging, confidence filtering, and 
    Elasticsearch document formatting according to requirements 2.4, 2.5, and 6.2
    """
    
    def __init__(self, 
                 min_confidence_threshold: float = 0.6,
                 merge_gap_threshold_ms: int = 500,
                 min_segment_duration_ms: int = 100):
        """
        Initialize transcription processor with configurable thresholds
        
        Args:
            min_confidence_threshold: Minimum confidence score to keep segments (0.0-1.0)
            merge_gap_threshold_ms: Maximum gap between segments to consider for merging
            min_segment_duration_ms: Minimum duration for a segment to be kept
        """
        self.min_confidence_threshold = min_confidence_threshold
        self.merge_gap_threshold_ms = merge_gap_threshold_ms
        self.min_segment_duration_ms = min_segment_duration_ms
        
    def process_transcription_result(self, result: TranscriptionResult) -> TranscriptionResult:
        """
        Complete processing pipeline for transcription results
        
        Args:
            result: Raw transcription result from speech recognition
            
        Returns:
            Processed transcription result with merged segments and filtered content
        """
        logger.info(f"Processing transcription result for job {result.job_id}")
        
        # Step 1: Filter out low-confidence segments
        filtered_result = self._filter_low_confidence_segments(result)
        logger.info(f"Filtered segments: {len(result.segments)} -> {len(filtered_result.segments)}")
        
        # Step 2: Merge overlapping and adjacent segments
        merged_result = self._merge_overlapping_segments(filtered_result)
        logger.info(f"Merged segments: {len(filtered_result.segments)} -> {len(merged_result.segments)}")
        
        # Step 3: Clean up and validate final result
        final_result = self._cleanup_segments(merged_result)
        logger.info(f"Final segments after cleanup: {len(final_result.segments)}")
        
        return final_result
    
    def _filter_low_confidence_segments(self, result: TranscriptionResult) -> TranscriptionResult:
        """
        Filter out segments with confidence below threshold
        
        Implements requirement 2.4: confidence scoring and quality assessment
        """
        original_count = len(result.segments)
        
        # Filter segments by confidence threshold
        filtered_segments = []
        for segment in result.segments:
            if segment.confidence >= self.min_confidence_threshold:
                # Also filter words within segments
                filtered_words = [
                    word for word in segment.words 
                    if word.confidence >= self.min_confidence_threshold
                ]
                
                # Create new segment with filtered words
                filtered_segment = TranscriptSegment(
                    text=segment.text,
                    start_time_ms=segment.start_time_ms,
                    end_time_ms=segment.end_time_ms,
                    confidence=segment.confidence,
                    speaker_id=segment.speaker_id,
                    words=filtered_words
                )
                filtered_segments.append(filtered_segment)
        
        # Recalculate overall confidence
        if filtered_segments:
            overall_confidence = sum(s.confidence for s in filtered_segments) / len(filtered_segments)
        else:
            overall_confidence = 0.0
            
        filtered_count = len(filtered_segments)
        logger.info(f"Confidence filtering: removed {original_count - filtered_count} segments "
                   f"below threshold {self.min_confidence_threshold}")
        
        # Create new result with filtered segments
        return TranscriptionResult(
            job_id=result.job_id,
            video_id=result.video_id,
            language=result.language,
            confidence=overall_confidence,
            segments=filtered_segments,
            processing_time=result.processing_time,
            created_at=result.created_at,
            status=result.status,
            total_duration_ms=result.total_duration_ms,
            word_count=sum(len(s.words) for s in filtered_segments),
            confidence_level=self._assess_confidence_level(overall_confidence),
            engine_used=result.engine_used
        )
    
    def _merge_overlapping_segments(self, result: TranscriptionResult) -> TranscriptionResult:
        """
        Intelligently merge overlapping and adjacent speech segments
        
        Implements requirement 2.5: segment processing and optimization
        """
        if len(result.segments) <= 1:
            return result
            
        segments = sorted(result.segments, key=lambda s: s.start_time_ms)
        merged_segments = []
        current_segment = segments[0]
        
        for next_segment in segments[1:]:
            # Check if segments should be merged
            if self._should_merge_segments(current_segment, next_segment):
                current_segment = self._merge_two_segments(current_segment, next_segment)
                logger.debug(f"Merged segments: gap was {next_segment.start_time_ms - current_segment.end_time_ms}ms")
            else:
                # Add current segment and move to next
                merged_segments.append(current_segment)
                current_segment = next_segment
        
        # Add the last segment
        merged_segments.append(current_segment)
        
        # Recalculate overall confidence
        if merged_segments:
            overall_confidence = sum(s.confidence for s in merged_segments) / len(merged_segments)
        else:
            overall_confidence = result.confidence
            
        logger.info(f"Segment merging: {len(segments)} -> {len(merged_segments)} segments")
        
        return TranscriptionResult(
            job_id=result.job_id,
            video_id=result.video_id,
            language=result.language,
            confidence=overall_confidence,
            segments=merged_segments,
            processing_time=result.processing_time,
            created_at=result.created_at,
            status=result.status,
            total_duration_ms=result.total_duration_ms,
            word_count=sum(len(s.words) for s in merged_segments),
            confidence_level=self._assess_confidence_level(overall_confidence),
            engine_used=result.engine_used
        )
    
    def _should_merge_segments(self, segment1: TranscriptSegment, segment2: TranscriptSegment) -> bool:
        """
        Determine if two segments should be merged based on timing and content
        """
        # Check for overlap or small gap
        gap_ms = segment2.start_time_ms - segment1.end_time_ms
        
        # Merge if overlapping or gap is small
        if gap_ms <= self.merge_gap_threshold_ms:
            # Additional checks for intelligent merging
            
            # Don't merge if speakers are different (when available)
            if (segment1.speaker_id and segment2.speaker_id and 
                segment1.speaker_id != segment2.speaker_id):
                return False
                
            # Don't merge if confidence difference is too large
            confidence_diff = abs(segment1.confidence - segment2.confidence)
            if confidence_diff > 0.3:
                return False
                
            return True
            
        return False
    
    def _merge_two_segments(self, segment1: TranscriptSegment, segment2: TranscriptSegment) -> TranscriptSegment:
        """
        Merge two segments into a single segment
        """
        # Combine text with appropriate spacing
        combined_text = segment1.text.strip()
        if not combined_text.endswith('.') and not combined_text.endswith('!') and not combined_text.endswith('?'):
            combined_text += " "
        combined_text += segment2.text.strip()
        
        # Use earlier start time and later end time
        start_time = min(segment1.start_time_ms, segment2.start_time_ms)
        end_time = max(segment1.end_time_ms, segment2.end_time_ms)
        
        # Calculate weighted average confidence
        duration1 = segment1.end_time_ms - segment1.start_time_ms
        duration2 = segment2.end_time_ms - segment2.start_time_ms
        total_duration = duration1 + duration2
        
        if total_duration > 0:
            weighted_confidence = (
                (segment1.confidence * duration1 + segment2.confidence * duration2) / total_duration
            )
        else:
            weighted_confidence = (segment1.confidence + segment2.confidence) / 2
        
        # Combine words and sort by timestamp
        combined_words = segment1.words + segment2.words
        combined_words.sort(key=lambda w: w.start_time_ms)
        
        # Use speaker from segment with higher confidence
        speaker_id = (segment1.speaker_id if segment1.confidence >= segment2.confidence 
                     else segment2.speaker_id)
        
        return TranscriptSegment(
            text=combined_text,
            start_time_ms=start_time,
            end_time_ms=end_time,
            confidence=weighted_confidence,
            speaker_id=speaker_id,
            words=combined_words
        )
    
    def _cleanup_segments(self, result: TranscriptionResult) -> TranscriptionResult:
        """
        Final cleanup of segments - remove very short segments and validate
        """
        cleaned_segments = []
        
        for segment in result.segments:
            # Remove segments that are too short
            if segment.duration_ms < self.min_segment_duration_ms:
                logger.debug(f"Removing short segment: {segment.duration_ms}ms < {self.min_segment_duration_ms}ms")
                continue
                
            # Clean up text
            cleaned_text = self._clean_segment_text(segment.text)
            if not cleaned_text.strip():
                logger.debug("Removing segment with empty text after cleaning")
                continue
                
            # Create cleaned segment
            cleaned_segment = TranscriptSegment(
                text=cleaned_text,
                start_time_ms=segment.start_time_ms,
                end_time_ms=segment.end_time_ms,
                confidence=segment.confidence,
                speaker_id=segment.speaker_id,
                words=segment.words
            )
            cleaned_segments.append(cleaned_segment)
        
        # Recalculate metadata
        if cleaned_segments:
            overall_confidence = sum(s.confidence for s in cleaned_segments) / len(cleaned_segments)
            total_duration_ms = max(s.end_time_ms for s in cleaned_segments) if cleaned_segments else 0
            word_count = sum(len(s.words) for s in cleaned_segments)
        else:
            overall_confidence = 0.0
            total_duration_ms = 0
            word_count = 0
        
        return TranscriptionResult(
            job_id=result.job_id,
            video_id=result.video_id,
            language=result.language,
            confidence=overall_confidence,
            segments=cleaned_segments,
            processing_time=result.processing_time,
            created_at=result.created_at,
            status=result.status,
            total_duration_ms=total_duration_ms,
            word_count=word_count,
            confidence_level=self._assess_confidence_level(overall_confidence),
            engine_used=result.engine_used
        )
    
    def _clean_segment_text(self, text: str) -> str:
        """
        Clean up segment text by removing artifacts and normalizing
        """
        import re
        
        # Remove common speech recognition artifacts
        text = re.sub(r'\[.*?\]', '', text)  # Remove bracketed content
        text = re.sub(r'\(.*?\)', '', text)  # Remove parenthetical content
        text = re.sub(r'\s+', ' ', text)     # Normalize whitespace
        text = text.strip()
        
        # Capitalize first letter if needed
        if text and text[0].islower():
            text = text[0].upper() + text[1:]
            
        return text
    
    def format_for_elasticsearch(self, result: TranscriptionResult) -> Dict[str, Any]:
        """
        Format transcription result for Elasticsearch storage
        
        Implements requirement 6.2: Elasticsearch integration and indexing
        """
        # Create the main transcript document
        transcript_doc = {
            "transcript_id": result.job_id,
            "video_id": result.video_id,
            "language": result.language,
            "confidence": result.confidence,
            "confidence_level": result.confidence_level.value if result.confidence_level else "unknown",
            "processing_time": result.processing_time,
            "created_at": result.created_at.isoformat(),
            "status": result.status.value,
            "engine_used": result.engine_used,
            
            # Metadata
            "total_duration_ms": result.total_duration_ms,
            "total_segments": len(result.segments),
            "word_count": result.word_count,
            
            # Full transcript text for search
            "full_transcript": result.full_transcript,
            
            # Segments with detailed timing
            "segments": [
                {
                    "segment_id": f"{result.job_id}_{i}",
                    "text": segment.text,
                    "start_time_ms": segment.start_time_ms,
                    "end_time_ms": segment.end_time_ms,
                    "duration_ms": segment.duration_ms,
                    "confidence": segment.confidence,
                    "speaker_id": segment.speaker_id,
                    "word_count": len(segment.words),
                    
                    # Word-level data for precise search
                    "words": [
                        {
                            "word": word.word,
                            "start_time_ms": word.start_time_ms,
                            "end_time_ms": word.end_time_ms,
                            "confidence": word.confidence
                        }
                        for word in segment.words
                    ] if segment.words else []
                }
                for i, segment in enumerate(result.segments)
            ],
            
            # Search-optimized fields
            "searchable_text": self._create_searchable_text(result.segments),
            "high_confidence_text": self._create_high_confidence_text(result.segments),
            "speakers": result.get_speakers() if hasattr(result, 'get_speakers') else [],
            
            # Timing markers for video navigation
            "time_markers": self._create_time_markers(result.segments)
        }
        
        logger.info(f"Formatted transcription for Elasticsearch: {len(result.segments)} segments, "
                   f"{result.word_count} words")
        
        return transcript_doc
    
    def _create_searchable_text(self, segments: List[TranscriptSegment]) -> str:
        """
        Create optimized searchable text from segments
        """
        # Combine all segment text with timestamps for context
        searchable_parts = []
        for segment in segments:
            # Add timestamp markers for search context
            time_marker = f"[{segment.start_time_ms//1000}s]"
            searchable_parts.append(f"{time_marker} {segment.text}")
        
        return " ".join(searchable_parts)
    
    def _create_high_confidence_text(self, segments: List[TranscriptSegment]) -> str:
        """
        Create text from only high-confidence segments for reliable search
        """
        high_confidence_threshold = 0.8
        high_confidence_segments = [
            segment for segment in segments 
            if segment.confidence >= high_confidence_threshold
        ]
        
        return " ".join(segment.text for segment in high_confidence_segments)
    
    def _create_time_markers(self, segments: List[TranscriptSegment]) -> List[Dict[str, Any]]:
        """
        Create time markers for video navigation
        """
        markers = []
        for i, segment in enumerate(segments):
            # Create markers at segment boundaries
            markers.append({
                "time_ms": segment.start_time_ms,
                "text_preview": segment.text[:50] + "..." if len(segment.text) > 50 else segment.text,
                "segment_index": i,
                "confidence": segment.confidence
            })
        
        return markers
    
    def _assess_confidence_level(self, confidence: float) -> ConfidenceLevel:
        """
        Assess confidence level based on numerical score
        """
        if confidence >= 0.9:
            return ConfidenceLevel.EXCELLENT
        elif confidence >= 0.8:
            return ConfidenceLevel.GOOD
        elif confidence >= 0.7:
            return ConfidenceLevel.FAIR
        elif confidence >= 0.6:
            return ConfidenceLevel.POOR
        else:
            return ConfidenceLevel.VERY_POOR
    
    def get_processing_stats(self, original_result: TranscriptionResult, 
                           processed_result: TranscriptionResult) -> Dict[str, Any]:
        """
        Get statistics about the processing operation
        """
        return {
            "original_segments": len(original_result.segments),
            "processed_segments": len(processed_result.segments),
            "segments_removed": len(original_result.segments) - len(processed_result.segments),
            "original_confidence": original_result.confidence,
            "processed_confidence": processed_result.confidence,
            "confidence_improvement": processed_result.confidence - original_result.confidence,
            "original_word_count": original_result.word_count or 0,
            "processed_word_count": processed_result.word_count or 0,
            "processing_efficiency": (
                len(processed_result.segments) / len(original_result.segments) 
                if original_result.segments else 0
            )
        }