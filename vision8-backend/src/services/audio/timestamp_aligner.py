"""
Timestamp Alignment Service

This module handles aligning speech timestamps with video playback time,
managing audio-video synchronization discrepancies, and providing
millisecond-precision timestamp conversion.
"""

from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass
import structlog
import asyncio
from pathlib import Path
from .speech_recognizer import TranscriptionResult, TranscriptSegment, WordTimestamp
from .audio_extractor import AudioExtractor

logger = structlog.get_logger(__name__)

@dataclass
class AlignmentMetrics:
    """Metrics for timestamp alignment quality assessment"""
    total_segments: int
    aligned_segments: int
    average_drift_ms: float
    max_drift_ms: float
    sync_quality: str  # excellent, good, fair, poor
    confidence_score: float

@dataclass
class SyncDiscrepancy:
    """Information about detected audio-video synchronization issues"""
    detected: bool
    offset_ms: int
    confidence: float
    correction_applied: bool
    method: str  # "audio_delay", "video_delay", "drift_correction"

class TimestampAligner:
    """Service for aligning speech timestamps with video playback time"""
    
    # Alignment quality thresholds (in milliseconds)
    EXCELLENT_THRESHOLD_MS = 50
    GOOD_THRESHOLD_MS = 100
    FAIR_THRESHOLD_MS = 200
    POOR_THRESHOLD_MS = 500
    
    # Sync detection thresholds
    MIN_SYNC_OFFSET_MS = 100  # Minimum offset to consider as sync issue
    SYNC_DETECTION_CONFIDENCE_THRESHOLD = 0.7
    
    def __init__(self):
        self.audio_extractor = AudioExtractor()
    
    async def align_timestamps(self, transcription: TranscriptionResult, 
                             video_duration: float, video_path: Optional[str] = None) -> List[TranscriptSegment]:
        """
        Align speech timestamps with video playback time
        
        Args:
            transcription: TranscriptionResult from speech recognition
            video_duration: Duration of the video in seconds
            video_path: Optional path to video file for advanced sync detection
            
        Returns:
            List of TranscriptSegment with aligned timestamps
        """
        logger.info("Starting timestamp alignment", 
                   job_id=transcription.job_id,
                   segments_count=len(transcription.segments),
                   video_duration=video_duration)
        
        if not transcription.segments:
            logger.warning("No segments to align", job_id=transcription.job_id)
            return []
        
        try:
            # Step 1: Detect potential sync discrepancies
            sync_discrepancy = await self._detect_sync_discrepancy(
                transcription, video_duration, video_path
            )
            
            # Step 2: Apply alignment corrections
            aligned_segments = await self._apply_alignment_corrections(
                transcription.segments, sync_discrepancy, video_duration
            )
            
            # Step 3: Validate and refine alignment
            validated_segments = await self._validate_and_refine_alignment(
                aligned_segments, video_duration
            )
            
            # Step 4: Calculate alignment metrics
            metrics = await self._calculate_alignment_metrics(
                transcription.segments, validated_segments
            )
            
            logger.info("Timestamp alignment completed", 
                       job_id=transcription.job_id,
                       aligned_segments=len(validated_segments),
                       sync_discrepancy=sync_discrepancy,
                       metrics=metrics)
            
            return validated_segments
            
        except Exception as e:
            logger.error("Timestamp alignment failed", 
                        job_id=transcription.job_id, 
                        error=str(e))
            # Return original segments if alignment fails
            return transcription.segments
    
    async def _detect_sync_discrepancy(self, transcription: TranscriptionResult, 
                                     video_duration: float, 
                                     video_path: Optional[str] = None) -> SyncDiscrepancy:
        """
        Detect audio-video synchronization discrepancies
        
        Args:
            transcription: TranscriptionResult from speech recognition
            video_duration: Duration of the video in seconds
            video_path: Optional path to video file for advanced detection
            
        Returns:
            SyncDiscrepancy object with detection results
        """
        try:
            # Get audio duration from transcription segments
            if not transcription.segments:
                return SyncDiscrepancy(
                    detected=False, offset_ms=0, confidence=0.0,
                    correction_applied=False, method="none"
                )
            
            # Calculate audio duration from segments
            last_segment = max(transcription.segments, key=lambda s: s.end_time_ms)
            audio_duration_ms = last_segment.end_time_ms
            video_duration_ms = int(video_duration * 1000)
            
            # Basic duration-based sync detection
            duration_diff_ms = abs(audio_duration_ms - video_duration_ms)
            
            # Advanced sync detection if video path is provided
            if video_path and Path(video_path).exists():
                return await self._advanced_sync_detection(
                    transcription, video_path, video_duration_ms
                )
            
            # Simple duration-based detection
            if duration_diff_ms > self.MIN_SYNC_OFFSET_MS:
                # Determine sync type
                if audio_duration_ms > video_duration_ms:
                    method = "audio_delay"
                    offset_ms = duration_diff_ms
                else:
                    method = "video_delay"
                    offset_ms = -duration_diff_ms
                
                confidence = min(1.0, duration_diff_ms / 1000.0)  # Higher diff = higher confidence
                
                return SyncDiscrepancy(
                    detected=True,
                    offset_ms=offset_ms,
                    confidence=confidence,
                    correction_applied=False,
                    method=method
                )
            
            return SyncDiscrepancy(
                detected=False, offset_ms=0, confidence=1.0,
                correction_applied=False, method="none"
            )
            
        except Exception as e:
            logger.error("Sync discrepancy detection failed", error=str(e))
            return SyncDiscrepancy(
                detected=False, offset_ms=0, confidence=0.0,
                correction_applied=False, method="error"
            )
    
    async def _advanced_sync_detection(self, transcription: TranscriptionResult, 
                                     video_path: str, video_duration_ms: int) -> SyncDiscrepancy:
        """
        Advanced sync detection using video file analysis
        
        Args:
            transcription: TranscriptionResult from speech recognition
            video_path: Path to the video file
            video_duration_ms: Video duration in milliseconds
            
        Returns:
            SyncDiscrepancy with advanced detection results
        """
        try:
            # Get actual audio info from video file
            audio_info = await self.audio_extractor.get_audio_info(video_path)
            if not audio_info:
                return SyncDiscrepancy(
                    detected=False, offset_ms=0, confidence=0.0,
                    correction_applied=False, method="no_audio"
                )
            
            actual_audio_duration_ms = int(audio_info.duration * 1000)
            
            # Compare transcription duration with actual audio duration
            if transcription.segments:
                last_segment = max(transcription.segments, key=lambda s: s.end_time_ms)
                transcribed_duration_ms = last_segment.end_time_ms
                
                # Calculate discrepancies
                audio_video_diff = abs(actual_audio_duration_ms - video_duration_ms)
                transcription_audio_diff = abs(transcribed_duration_ms - actual_audio_duration_ms)
                
                # Determine sync issue type and severity
                if audio_video_diff > self.MIN_SYNC_OFFSET_MS:
                    # Audio-video sync issue
                    offset_ms = actual_audio_duration_ms - video_duration_ms
                    confidence = min(1.0, audio_video_diff / 2000.0)
                    method = "audio_video_drift"
                    
                elif transcription_audio_diff > self.MIN_SYNC_OFFSET_MS:
                    # Transcription timing issue
                    offset_ms = transcribed_duration_ms - actual_audio_duration_ms
                    confidence = min(1.0, transcription_audio_diff / 1000.0)
                    method = "transcription_drift"
                    
                else:
                    # No significant sync issues
                    return SyncDiscrepancy(
                        detected=False, offset_ms=0, confidence=1.0,
                        correction_applied=False, method="validated"
                    )
                
                return SyncDiscrepancy(
                    detected=True,
                    offset_ms=offset_ms,
                    confidence=confidence,
                    correction_applied=False,
                    method=method
                )
            
            return SyncDiscrepancy(
                detected=False, offset_ms=0, confidence=0.0,
                correction_applied=False, method="no_segments"
            )
            
        except Exception as e:
            logger.error("Advanced sync detection failed", error=str(e))
            return SyncDiscrepancy(
                detected=False, offset_ms=0, confidence=0.0,
                correction_applied=False, method="error"
            )
    
    async def _apply_alignment_corrections(self, segments: List[TranscriptSegment], 
                                         sync_discrepancy: SyncDiscrepancy,
                                         video_duration: float) -> List[TranscriptSegment]:
        """
        Apply timestamp corrections based on detected sync discrepancies
        
        Args:
            segments: Original transcript segments
            sync_discrepancy: Detected synchronization discrepancy
            video_duration: Video duration in seconds
            
        Returns:
            List of corrected TranscriptSegment objects
        """
        if not segments:
            return []
        
        corrected_segments = []
        video_duration_ms = int(video_duration * 1000)
        
        try:
            for segment in segments:
                corrected_segment = TranscriptSegment(
                    text=segment.text,
                    start_time_ms=segment.start_time_ms,
                    end_time_ms=segment.end_time_ms,
                    confidence=segment.confidence,
                    speaker_id=segment.speaker_id,
                    words=segment.words.copy() if segment.words else []
                )
                
                # Apply sync correction if detected
                if sync_discrepancy.detected and sync_discrepancy.confidence > self.SYNC_DETECTION_CONFIDENCE_THRESHOLD:
                    offset_ms = sync_discrepancy.offset_ms
                    
                    # Apply offset correction
                    if sync_discrepancy.method in ["audio_delay", "transcription_drift"]:
                        # Shift timestamps backward
                        corrected_segment.start_time_ms = max(0, segment.start_time_ms - abs(offset_ms))
                        corrected_segment.end_time_ms = max(0, segment.end_time_ms - abs(offset_ms))
                        
                    elif sync_discrepancy.method in ["video_delay", "audio_video_drift"]:
                        # Shift timestamps forward
                        corrected_segment.start_time_ms = segment.start_time_ms + abs(offset_ms)
                        corrected_segment.end_time_ms = segment.end_time_ms + abs(offset_ms)
                    
                    # Apply word-level corrections
                    if corrected_segment.words:
                        corrected_words = []
                        for word in corrected_segment.words:
                            corrected_word = WordTimestamp(
                                word=word.word,
                                start_time_ms=max(0, word.start_time_ms - abs(offset_ms)) if sync_discrepancy.method in ["audio_delay", "transcription_drift"] else word.start_time_ms + abs(offset_ms),
                                end_time_ms=max(0, word.end_time_ms - abs(offset_ms)) if sync_discrepancy.method in ["audio_delay", "transcription_drift"] else word.end_time_ms + abs(offset_ms),
                                confidence=word.confidence
                            )
                            corrected_words.append(corrected_word)
                        corrected_segment.words = corrected_words
                
                # Ensure timestamps don't exceed video duration
                corrected_segment.start_time_ms = min(corrected_segment.start_time_ms, video_duration_ms)
                corrected_segment.end_time_ms = min(corrected_segment.end_time_ms, video_duration_ms)
                
                # Ensure end time is after start time
                if corrected_segment.end_time_ms <= corrected_segment.start_time_ms:
                    corrected_segment.end_time_ms = corrected_segment.start_time_ms + 100  # Minimum 100ms duration
                
                corrected_segments.append(corrected_segment)
            
            # Mark sync discrepancy as corrected
            sync_discrepancy.correction_applied = True
            
            logger.info("Alignment corrections applied", 
                       segments_count=len(corrected_segments),
                       sync_method=sync_discrepancy.method,
                       offset_ms=sync_discrepancy.offset_ms)
            
            return corrected_segments
            
        except Exception as e:
            logger.error("Failed to apply alignment corrections", error=str(e))
            return segments  # Return original segments on error
    
    async def _validate_and_refine_alignment(self, segments: List[TranscriptSegment], 
                                           video_duration: float) -> List[TranscriptSegment]:
        """
        Validate and refine timestamp alignment for optimal precision
        
        Args:
            segments: Aligned transcript segments
            video_duration: Video duration in seconds
            
        Returns:
            List of validated and refined TranscriptSegment objects
        """
        if not segments:
            return []
        
        refined_segments = []
        video_duration_ms = int(video_duration * 1000)
        
        try:
            # Sort segments by start time
            sorted_segments = sorted(segments, key=lambda s: s.start_time_ms)
            
            for i, segment in enumerate(sorted_segments):
                refined_segment = TranscriptSegment(
                    text=segment.text,
                    start_time_ms=segment.start_time_ms,
                    end_time_ms=segment.end_time_ms,
                    confidence=segment.confidence,
                    speaker_id=segment.speaker_id,
                    words=segment.words.copy() if segment.words else []
                )
                
                # Validate timestamp bounds
                refined_segment.start_time_ms = max(0, min(refined_segment.start_time_ms, video_duration_ms))
                refined_segment.end_time_ms = max(0, min(refined_segment.end_time_ms, video_duration_ms))
                
                # Ensure minimum segment duration (50ms)
                min_duration_ms = 50
                if refined_segment.end_time_ms - refined_segment.start_time_ms < min_duration_ms:
                    refined_segment.end_time_ms = min(
                        refined_segment.start_time_ms + min_duration_ms,
                        video_duration_ms
                    )
                
                # Handle overlapping segments
                if i > 0:
                    prev_segment = refined_segments[-1]
                    if refined_segment.start_time_ms < prev_segment.end_time_ms:
                        # Adjust to prevent overlap
                        gap_ms = 10  # 10ms gap between segments
                        refined_segment.start_time_ms = prev_segment.end_time_ms + gap_ms
                        
                        # Ensure end time is still valid
                        if refined_segment.end_time_ms <= refined_segment.start_time_ms:
                            refined_segment.end_time_ms = refined_segment.start_time_ms + min_duration_ms
                
                # Validate word-level timestamps
                if refined_segment.words:
                    refined_words = []
                    segment_start = refined_segment.start_time_ms
                    segment_end = refined_segment.end_time_ms
                    
                    for word in refined_segment.words:
                        # Ensure word timestamps are within segment bounds
                        word_start = max(segment_start, min(word.start_time_ms, segment_end))
                        word_end = max(word_start + 10, min(word.end_time_ms, segment_end))  # Min 10ms word duration
                        
                        refined_word = WordTimestamp(
                            word=word.word,
                            start_time_ms=word_start,
                            end_time_ms=word_end,
                            confidence=word.confidence
                        )
                        refined_words.append(refined_word)
                    
                    refined_segment.words = refined_words
                
                refined_segments.append(refined_segment)
            
            logger.info("Timestamp validation and refinement completed", 
                       segments_count=len(refined_segments))
            
            return refined_segments
            
        except Exception as e:
            logger.error("Timestamp validation failed", error=str(e))
            return segments  # Return original segments on error
    
    async def _calculate_alignment_metrics(self, original_segments: List[TranscriptSegment], 
                                         aligned_segments: List[TranscriptSegment]) -> AlignmentMetrics:
        """
        Calculate metrics for alignment quality assessment
        
        Args:
            original_segments: Original transcript segments
            aligned_segments: Aligned transcript segments
            
        Returns:
            AlignmentMetrics with quality assessment
        """
        try:
            if not original_segments or not aligned_segments:
                return AlignmentMetrics(
                    total_segments=0,
                    aligned_segments=0,
                    average_drift_ms=0.0,
                    max_drift_ms=0.0,
                    sync_quality="poor",
                    confidence_score=0.0
                )
            
            total_segments = len(original_segments)
            aligned_segments_count = len(aligned_segments)
            
            # Calculate drift metrics
            drifts = []
            for i in range(min(len(original_segments), len(aligned_segments))):
                orig = original_segments[i]
                aligned = aligned_segments[i]
                
                start_drift = abs(orig.start_time_ms - aligned.start_time_ms)
                end_drift = abs(orig.end_time_ms - aligned.end_time_ms)
                avg_drift = (start_drift + end_drift) / 2
                
                drifts.append(avg_drift)
            
            average_drift_ms = sum(drifts) / len(drifts) if drifts else 0.0
            max_drift_ms = max(drifts) if drifts else 0.0
            
            # Determine sync quality
            if average_drift_ms <= self.EXCELLENT_THRESHOLD_MS:
                sync_quality = "excellent"
                confidence_score = 0.95
            elif average_drift_ms <= self.GOOD_THRESHOLD_MS:
                sync_quality = "good"
                confidence_score = 0.85
            elif average_drift_ms <= self.FAIR_THRESHOLD_MS:
                sync_quality = "fair"
                confidence_score = 0.70
            elif average_drift_ms <= self.POOR_THRESHOLD_MS:
                sync_quality = "poor"
                confidence_score = 0.50
            else:
                sync_quality = "very_poor"
                confidence_score = 0.30
            
            return AlignmentMetrics(
                total_segments=total_segments,
                aligned_segments=aligned_segments_count,
                average_drift_ms=average_drift_ms,
                max_drift_ms=max_drift_ms,
                sync_quality=sync_quality,
                confidence_score=confidence_score
            )
            
        except Exception as e:
            logger.error("Failed to calculate alignment metrics", error=str(e))
            return AlignmentMetrics(
                total_segments=len(original_segments) if original_segments else 0,
                aligned_segments=len(aligned_segments) if aligned_segments else 0,
                average_drift_ms=0.0,
                max_drift_ms=0.0,
                sync_quality="error",
                confidence_score=0.0
            )
    
    async def validate_alignment(self, segments: List[TranscriptSegment], 
                               video_duration: float) -> bool:
        """
        Validate timestamp accuracy and consistency
        
        Args:
            segments: List of transcript segments to validate
            video_duration: Video duration in seconds
            
        Returns:
            True if alignment is valid, False otherwise
        """
        try:
            if not segments:
                return True  # Empty segments are technically valid
            
            video_duration_ms = int(video_duration * 1000)
            
            # Check basic timestamp validity
            for segment in segments:
                # Check timestamp bounds
                if segment.start_time_ms < 0 or segment.end_time_ms < 0:
                    logger.warning("Invalid negative timestamp found")
                    return False
                
                if segment.start_time_ms > video_duration_ms or segment.end_time_ms > video_duration_ms:
                    logger.warning("Timestamp exceeds video duration", 
                                 start_ms=segment.start_time_ms,
                                 end_ms=segment.end_time_ms,
                                 video_duration_ms=video_duration_ms)
                    return False
                
                # Check timestamp order
                if segment.end_time_ms <= segment.start_time_ms:
                    logger.warning("Invalid timestamp order", 
                                 start_ms=segment.start_time_ms,
                                 end_ms=segment.end_time_ms)
                    return False
                
                # Validate word-level timestamps
                if segment.words:
                    for word in segment.words:
                        if (word.start_time_ms < segment.start_time_ms or 
                            word.end_time_ms > segment.end_time_ms or
                            word.end_time_ms <= word.start_time_ms):
                            logger.warning("Invalid word timestamp", 
                                         word=word.word,
                                         word_start=word.start_time_ms,
                                         word_end=word.end_time_ms,
                                         segment_start=segment.start_time_ms,
                                         segment_end=segment.end_time_ms)
                            return False
            
            # Check for overlapping segments
            sorted_segments = sorted(segments, key=lambda s: s.start_time_ms)
            for i in range(1, len(sorted_segments)):
                if sorted_segments[i].start_time_ms < sorted_segments[i-1].end_time_ms:
                    logger.warning("Overlapping segments detected",
                                 prev_end=sorted_segments[i-1].end_time_ms,
                                 current_start=sorted_segments[i].start_time_ms)
                    return False
            
            logger.info("Timestamp alignment validation passed", 
                       segments_count=len(segments))
            return True
            
        except Exception as e:
            logger.error("Timestamp validation failed", error=str(e))
            return False
    
    def convert_to_milliseconds(self, time_seconds: float) -> int:
        """
        Convert time from seconds to milliseconds with precision
        
        Args:
            time_seconds: Time in seconds (can be float)
            
        Returns:
            Time in milliseconds (integer)
        """
        return int(round(time_seconds * 1000))
    
    def convert_to_seconds(self, time_milliseconds: int) -> float:
        """
        Convert time from milliseconds to seconds
        
        Args:
            time_milliseconds: Time in milliseconds
            
        Returns:
            Time in seconds (float)
        """
        return time_milliseconds / 1000.0
    
    def get_alignment_quality_threshold(self, quality_level: str) -> int:
        """
        Get alignment quality threshold in milliseconds
        
        Args:
            quality_level: Quality level (excellent, good, fair, poor)
            
        Returns:
            Threshold in milliseconds
        """
        thresholds = {
            "excellent": self.EXCELLENT_THRESHOLD_MS,
            "good": self.GOOD_THRESHOLD_MS,
            "fair": self.FAIR_THRESHOLD_MS,
            "poor": self.POOR_THRESHOLD_MS
        }
        return thresholds.get(quality_level, self.POOR_THRESHOLD_MS)