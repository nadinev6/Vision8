"""
Audio Processing Services

This package contains services for audio extraction and speech recognition.
"""

from .audio_extractor import AudioExtractor, AudioInfo
from .speech_recognizer import (
    SpeechRecognizer, 
    GoogleSpeechRecognizer, 
    TranscriptionResult as LegacyTranscriptionResult,
    TranscriptSegment as LegacyTranscriptSegment, 
    WordTimestamp as LegacyWordTimestamp
)
from .models import (
    # Pydantic models for API responses and validation
    TranscriptionResult,
    TranscriptSegment,
    WordTimestamp,
    TranscriptionJob,
    TranscriptionError,
    AudioMetadata,
    TranscriptionStatus,
    ConfidenceLevel,
    # Utility functions
    convert_legacy_transcription_result,
    dataclass_to_pydantic
)
from .transcription_processor import TranscriptionProcessor
from .audio_transcription_service import AudioTranscriptionService
from .config import AudioConfig

__all__ = [
    # Core services
    'AudioExtractor',
    'AudioInfo', 
    'SpeechRecognizer',
    'GoogleSpeechRecognizer',
    'TranscriptionProcessor',
    'AudioTranscriptionService',
    'AudioConfig',
    
    # Legacy dataclass models (for internal use)
    'LegacyTranscriptionResult',
    'LegacyTranscriptSegment', 
    'LegacyWordTimestamp',
    
    # Pydantic models (for API responses)
    'TranscriptionResult',
    'TranscriptSegment', 
    'WordTimestamp',
    'TranscriptionJob',
    'TranscriptionError',
    'AudioMetadata',
    'TranscriptionStatus',
    'ConfidenceLevel',
    
    # Utility functions
    'convert_legacy_transcription_result',
    'dataclass_to_pydantic'
]