"""
Audio Processing Configuration

This module contains configuration settings specific to audio processing services.
"""

import os
from pathlib import Path

class AudioConfig:
    """Configuration for audio processing services"""
    
    # Google Cloud Speech-to-Text settings
    GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    SPEECH_TO_TEXT_LANGUAGE = os.getenv("SPEECH_TO_TEXT_LANGUAGE", "en-US")
    SPEECH_TO_TEXT_MODEL = os.getenv("SPEECH_TO_TEXT_MODEL", "latest_long")
    SPEECH_TO_TEXT_ENABLE_WORD_TIMESTAMPS = os.getenv("SPEECH_TO_TEXT_ENABLE_WORD_TIMESTAMPS", "true").lower() == "true"
    SPEECH_TO_TEXT_ENABLE_PUNCTUATION = os.getenv("SPEECH_TO_TEXT_ENABLE_PUNCTUATION", "true").lower() == "true"
    
    # Audio processing directories
    BASE_DIR = Path(__file__).parent.parent.parent.parent
    TEMP_AUDIO_DIR = BASE_DIR / "temp" / "audio"
    EXTRACTED_AUDIO_DIR = BASE_DIR / "temp" / "extracted_audio"
    
    # Audio processing settings
    MAX_AUDIO_FILE_SIZE_MB = int(os.getenv("MAX_AUDIO_FILE_SIZE_MB", "200"))
    AUDIO_SAMPLE_RATE = int(os.getenv("AUDIO_SAMPLE_RATE", "16000"))
    AUDIO_CHANNELS = int(os.getenv("AUDIO_CHANNELS", "1"))  # Mono
    AUDIO_FORMAT = os.getenv("AUDIO_FORMAT", "wav")
    
    # Processing timeouts
    AUDIO_EXTRACTION_TIMEOUT = int(os.getenv("AUDIO_EXTRACTION_TIMEOUT", "300"))  # 5 minutes
    TRANSCRIPTION_TIMEOUT = int(os.getenv("TRANSCRIPTION_TIMEOUT", "600"))  # 10 minutes
    
    @classmethod
    def ensure_directories(cls):
        """Ensure all required directories exist"""
        cls.TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        cls.EXTRACTED_AUDIO_DIR.mkdir(parents=True, exist_ok=True)