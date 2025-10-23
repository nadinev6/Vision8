"""
Audio Transcription Data Models

This module defines the data models for audio transcription service with JSON serialization
and validation capabilities for API responses.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator
from enum import Enum


class TranscriptionStatus(str, Enum):
    """Enumeration for transcription job status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ConfidenceLevel(str, Enum):
    """Enumeration for confidence quality assessment"""
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    VERY_POOR = "very_poor"


class WordTimestamp(BaseModel):
    """Word-level timestamp information with validation"""
    word: str = Field(..., min_length=1, description="The transcribed word")
    start_time_ms: int = Field(..., ge=0, description="Start time in milliseconds")
    end_time_ms: int = Field(..., ge=0, description="End time in milliseconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    
    @validator('end_time_ms')
    def validate_end_time(cls, v, values):
        """Ensure end time is after start time"""
        if 'start_time_ms' in values and v < values['start_time_ms']:
            raise ValueError('end_time_ms must be greater than or equal to start_time_ms')
        return v
    
    class Config:
        """Pydantic configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        json_schema_extra = {
            "example": {
                "word": "hello",
                "start_time_ms": 1000,
                "end_time_ms": 1500,
                "confidence": 0.95
            }
        }


class TranscriptSegment(BaseModel):
    """Transcript segment with timing information and validation"""
    text: str = Field(..., min_length=1, description="The transcribed text segment")
    start_time_ms: int = Field(..., ge=0, description="Segment start time in milliseconds")
    end_time_ms: int = Field(..., ge=0, description="Segment end time in milliseconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Segment confidence score")
    speaker_id: Optional[str] = Field(None, description="Speaker identifier for diarization")
    words: List[WordTimestamp] = Field(default_factory=list, description="Word-level timestamps")
    
    @validator('end_time_ms')
    def validate_end_time(cls, v, values):
        """Ensure end time is after start time"""
        if 'start_time_ms' in values and v < values['start_time_ms']:
            raise ValueError('end_time_ms must be greater than or equal to start_time_ms')
        return v
    
    @validator('words')
    def validate_words_timing(cls, v, values):
        """Ensure word timestamps are within segment boundaries"""
        if not v:
            return v
            
        start_time = values.get('start_time_ms', 0)
        end_time = values.get('end_time_ms', 0)
        
        for word in v:
            if word.start_time_ms < start_time or word.end_time_ms > end_time:
                # Allow some tolerance for timing discrepancies
                tolerance_ms = 100
                if (word.start_time_ms < start_time - tolerance_ms or 
                    word.end_time_ms > end_time + tolerance_ms):
                    raise ValueError(
                        f'Word timestamps must be within segment boundaries '
                        f'(±{tolerance_ms}ms tolerance)'
                    )
        return v
    
    @property
    def duration_ms(self) -> int:
        """Calculate segment duration in milliseconds"""
        return self.end_time_ms - self.start_time_ms
    
    @property
    def word_count(self) -> int:
        """Get number of words in the segment"""
        return len(self.words)
    
    class Config:
        """Pydantic configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "text": "Hello, how are you today?",
                "start_time_ms": 1000,
                "end_time_ms": 3500,
                "confidence": 0.92,
                "speaker_id": "speaker_1",
                "words": [
                    {
                        "word": "Hello",
                        "start_time_ms": 1000,
                        "end_time_ms": 1300,
                        "confidence": 0.95
                    }
                ]
            }
        }


class TranscriptionResult(BaseModel):
    """Complete transcription result with validation and metadata"""
    job_id: str = Field(..., min_length=1, description="Unique job identifier")
    video_id: str = Field(..., min_length=1, description="Source video identifier")
    language: str = Field(..., min_length=2, max_length=10, description="Language code (e.g., en-US)")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Overall transcription confidence")
    segments: List[TranscriptSegment] = Field(default_factory=list, description="Transcription segments")
    processing_time: float = Field(..., ge=0.0, description="Processing time in seconds")
    created_at: datetime = Field(default_factory=datetime.now, description="Creation timestamp")
    status: TranscriptionStatus = Field(default=TranscriptionStatus.COMPLETED, description="Job status")
    
    # Additional metadata
    total_duration_ms: Optional[int] = Field(None, ge=0, description="Total audio duration in milliseconds")
    word_count: Optional[int] = Field(None, ge=0, description="Total number of words transcribed")
    confidence_level: Optional[ConfidenceLevel] = Field(None, description="Confidence quality assessment")
    engine_used: Optional[str] = Field(None, description="Speech recognition engine used")
    
    @validator('language')
    def validate_language_code(cls, v):
        """Validate language code format"""
        import re
        # Accept formats like: en, en-US, zh-CN, etc.
        if not re.match(r'^[a-z]{2}(-[A-Z]{2})?$', v):
            raise ValueError('Language code must be in format: xx or xx-XX (e.g., en, en-US)')
        return v
    
    @validator('segments')
    def validate_segments_order(cls, v):
        """Ensure segments are in chronological order"""
        if len(v) <= 1:
            return v
            
        for i in range(1, len(v)):
            if v[i].start_time_ms < v[i-1].start_time_ms:
                raise ValueError('Segments must be in chronological order')
        return v
    
    @property
    def total_segments(self) -> int:
        """Get total number of segments"""
        return len(self.segments)
    
    @property
    def average_confidence(self) -> float:
        """Calculate average confidence across all segments"""
        if not self.segments:
            return self.confidence
        return sum(segment.confidence for segment in self.segments) / len(self.segments)
    
    @property
    def full_transcript(self) -> str:
        """Get complete transcript as a single string"""
        return ' '.join(segment.text for segment in self.segments)
    
    def get_segments_by_confidence(self, min_confidence: float = 0.7) -> List[TranscriptSegment]:
        """Filter segments by minimum confidence threshold"""
        return [segment for segment in self.segments if segment.confidence >= min_confidence]
    
    def get_segments_by_speaker(self, speaker_id: str) -> List[TranscriptSegment]:
        """Get segments for a specific speaker"""
        return [segment for segment in self.segments if segment.speaker_id == speaker_id]
    
    def get_speakers(self) -> List[str]:
        """Get list of unique speakers in the transcription"""
        speakers = set()
        for segment in self.segments:
            if segment.speaker_id:
                speakers.add(segment.speaker_id)
        return sorted(list(speakers))
    
    class Config:
        """Pydantic configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "video_id": "sample_video_123",
                "language": "en-US",
                "confidence": 0.89,
                "segments": [
                    {
                        "text": "Welcome to our presentation today.",
                        "start_time_ms": 500,
                        "end_time_ms": 2800,
                        "confidence": 0.92,
                        "speaker_id": "speaker_1",
                        "words": []
                    }
                ],
                "processing_time": 15.7,
                "created_at": "2024-01-15T10:30:00Z",
                "status": "completed",
                "total_duration_ms": 180000,
                "word_count": 245,
                "confidence_level": "good",
                "engine_used": "google"
            }
        }


class TranscriptionJob(BaseModel):
    """Model for transcription job tracking"""
    job_id: str = Field(..., min_length=1, description="Unique job identifier")
    video_id: str = Field(..., min_length=1, description="Source video identifier")
    status: TranscriptionStatus = Field(default=TranscriptionStatus.PENDING, description="Current job status")
    progress: float = Field(default=0.0, ge=0.0, le=100.0, description="Progress percentage")
    created_at: datetime = Field(default_factory=datetime.now, description="Job creation time")
    started_at: Optional[datetime] = Field(None, description="Processing start time")
    completed_at: Optional[datetime] = Field(None, description="Processing completion time")
    error_message: Optional[str] = Field(None, description="Error message if job failed")
    
    # Processing parameters
    language: str = Field(default="en-US", description="Target language for transcription")
    engine: Optional[str] = Field(None, description="Preferred speech recognition engine")
    
    @property
    def is_completed(self) -> bool:
        """Check if job is completed (successfully or with error)"""
        return self.status in [TranscriptionStatus.COMPLETED, TranscriptionStatus.FAILED, TranscriptionStatus.CANCELLED]
    
    @property
    def processing_duration(self) -> Optional[float]:
        """Calculate processing duration in seconds"""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None
    
    class Config:
        """Pydantic configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "video_id": "sample_video_123",
                "status": "processing",
                "progress": 45.0,
                "created_at": "2024-01-15T10:30:00Z",
                "started_at": "2024-01-15T10:30:05Z",
                "language": "en-US",
                "engine": "google"
            }
        }


class TranscriptionError(BaseModel):
    """Model for transcription error responses"""
    error_code: str = Field(..., min_length=1, description="Error code identifier")
    error_message: str = Field(..., min_length=1, description="Human-readable error message")
    error_details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")
    retry_after: Optional[int] = Field(None, ge=0, description="Retry delay in seconds")
    job_id: Optional[str] = Field(None, description="Associated job ID if applicable")
    timestamp: datetime = Field(default_factory=datetime.now, description="Error timestamp")
    
    class Config:
        """Pydantic configuration"""
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        schema_extra = {
            "example": {
                "error_code": "AUDIO_EXTRACTION_FAILED",
                "error_message": "Failed to extract audio from video file",
                "error_details": {
                    "file_format": "mp4",
                    "file_size_mb": 150.5,
                    "ffmpeg_error": "Invalid codec parameters"
                },
                "retry_after": 60,
                "job_id": "550e8400-e29b-41d4-a716-446655440000",
                "timestamp": "2024-01-15T10:30:00Z"
            }
        }


class AudioMetadata(BaseModel):
    """Model for audio file metadata"""
    duration_ms: int = Field(..., ge=0, description="Audio duration in milliseconds")
    sample_rate: int = Field(..., gt=0, description="Audio sample rate in Hz")
    channels: int = Field(..., ge=1, le=8, description="Number of audio channels")
    bit_depth: Optional[int] = Field(None, gt=0, description="Audio bit depth")
    format: str = Field(..., min_length=1, description="Audio format (e.g., wav, mp3)")
    file_size_bytes: int = Field(..., ge=0, description="File size in bytes")
    
    @property
    def duration_seconds(self) -> float:
        """Get duration in seconds"""
        return self.duration_ms / 1000.0
    
    @property
    def file_size_mb(self) -> float:
        """Get file size in megabytes"""
        return self.file_size_bytes / (1024 * 1024)
    
    class Config:
        """Pydantic configuration"""
        schema_extra = {
            "example": {
                "duration_ms": 180000,
                "sample_rate": 16000,
                "channels": 1,
                "bit_depth": 16,
                "format": "wav",
                "file_size_bytes": 5760000
            }
        }


# Utility functions for model conversion
def dataclass_to_pydantic(dataclass_instance) -> dict:
    """Convert dataclass instance to dictionary for Pydantic model creation"""
    if hasattr(dataclass_instance, '__dataclass_fields__'):
        return {
            field.name: getattr(dataclass_instance, field.name)
            for field in dataclass_instance.__dataclass_fields__.values()
        }
    return {}


def convert_legacy_transcription_result(legacy_result) -> TranscriptionResult:
    """Convert legacy dataclass TranscriptionResult to Pydantic model"""
    from .speech_recognizer import TranscriptionResult as LegacyResult
    from .speech_recognizer import TranscriptSegment as LegacySegment
    from .speech_recognizer import WordTimestamp as LegacyWord
    
    if isinstance(legacy_result, LegacyResult):
        # Convert segments
        segments = []
        for legacy_segment in legacy_result.segments:
            if isinstance(legacy_segment, LegacySegment):
                # Convert words
                words = []
                for legacy_word in legacy_segment.words or []:
                    if isinstance(legacy_word, LegacyWord):
                        words.append(WordTimestamp(
                            word=legacy_word.word,
                            start_time_ms=legacy_word.start_time_ms,
                            end_time_ms=legacy_word.end_time_ms,
                            confidence=legacy_word.confidence
                        ))
                
                segments.append(TranscriptSegment(
                    text=legacy_segment.text,
                    start_time_ms=legacy_segment.start_time_ms,
                    end_time_ms=legacy_segment.end_time_ms,
                    confidence=legacy_segment.confidence,
                    speaker_id=legacy_segment.speaker_id,
                    words=words
                ))
        
        # Determine confidence level
        confidence_level = _assess_confidence_level(legacy_result.confidence)
        
        # Calculate additional metadata
        total_duration_ms = None
        word_count = None
        if segments:
            total_duration_ms = max(segment.end_time_ms for segment in segments)
            word_count = sum(len(segment.words) for segment in segments)
        
        return TranscriptionResult(
            job_id=legacy_result.job_id,
            video_id=legacy_result.video_id,
            language=legacy_result.language,
            confidence=legacy_result.confidence,
            segments=segments,
            processing_time=legacy_result.processing_time,
            created_at=legacy_result.created_at,
            status=TranscriptionStatus.COMPLETED,
            total_duration_ms=total_duration_ms,
            word_count=word_count,
            confidence_level=confidence_level
        )
    
    raise ValueError("Invalid legacy transcription result type")


def _assess_confidence_level(confidence: float) -> ConfidenceLevel:
    """Assess confidence level based on numerical score"""
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