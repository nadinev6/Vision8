"""
Speech Recognition Service

This module handles speech-to-text transcription using Google Cloud Speech-to-Text.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass
from datetime import datetime
import structlog
import uuid
import time
from pathlib import Path
from .config import AudioConfig

logger = structlog.get_logger(__name__)

@dataclass
class WordTimestamp:
    """Word-level timestamp information"""
    word: str
    start_time_ms: int
    end_time_ms: int
    confidence: float

@dataclass
class TranscriptSegment:
    """Transcript segment with timing information"""
    text: str
    start_time_ms: int
    end_time_ms: int
    confidence: float
    speaker_id: Optional[str] = None
    words: List[WordTimestamp] = None
    
    def __post_init__(self):
        if self.words is None:
            self.words = []

@dataclass
class TranscriptionResult:
    """Complete transcription result"""
    job_id: str
    video_id: str
    language: str
    confidence: float
    segments: List[TranscriptSegment]
    processing_time: float
    created_at: datetime

class SpeechRecognizer(ABC):
    """Abstract base class for speech recognition engines"""
    
    @abstractmethod
    async def transcribe_audio(self, audio_path: str, language: str = "en-US") -> TranscriptionResult:
        """Transcribe audio file to text with timestamps"""
        pass
    
    @abstractmethod
    async def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        pass

class GoogleSpeechRecognizer(SpeechRecognizer):
    """Google Cloud Speech-to-Text implementation"""
    
    def __init__(self):
        self.config = AudioConfig
        self._client = None
        self._setup_authentication()
    
    def _setup_authentication(self):
        """Set up Google Cloud authentication"""
        import os
        
        # Set project ID if available
        if self.config.GOOGLE_CLOUD_PROJECT:
            os.environ["GOOGLE_CLOUD_PROJECT"] = self.config.GOOGLE_CLOUD_PROJECT
        
        # Only set credentials if it's a valid file path
        if (self.config.GOOGLE_APPLICATION_CREDENTIALS and 
            os.path.isfile(self.config.GOOGLE_APPLICATION_CREDENTIALS)):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.config.GOOGLE_APPLICATION_CREDENTIALS
        elif self.config.GOOGLE_APPLICATION_CREDENTIALS:
            logger.warning(f"GOOGLE_APPLICATION_CREDENTIALS path not found: {self.config.GOOGLE_APPLICATION_CREDENTIALS}")
        
        if not self.config.GOOGLE_CLOUD_PROJECT:
            logger.warning("GOOGLE_CLOUD_PROJECT not set, using default project")
    
    @property
    def client(self):
        """Lazy initialization of Google Speech client"""
        if self._client is None:
            try:
                from google.cloud import speech
                
                # Try to create client with explicit project
                if self.config.GOOGLE_CLOUD_PROJECT:
                    try:
                        self._client = speech.SpeechClient(
                            client_options={"quota_project_id": self.config.GOOGLE_CLOUD_PROJECT}
                        )
                        logger.info("Google Speech client initialized with project", 
                                   project=self.config.GOOGLE_CLOUD_PROJECT)
                    except Exception as project_error:
                        logger.warning("Failed to initialize with project, trying default", 
                                     error=str(project_error))
                        try:
                            self._client = speech.SpeechClient()
                            logger.info("Google Speech client initialized with default credentials")
                        except Exception as default_error:
                            logger.error("No valid Google Cloud credentials found", 
                                       error=str(default_error))
                            # Return None to trigger fallback behavior
                            return None
                else:
                    self._client = speech.SpeechClient()
                    logger.info("Google Speech client initialized successfully")
                    
            except ImportError:
                logger.error("Google Cloud Speech library not installed")
                raise
            except Exception as e:
                logger.error("Failed to initialize Google Speech client", error=str(e))
                # Return None to trigger fallback behavior
                return None
        return self._client
    
    async def _transcribe_with_rest_api(self, audio_path: str, language: str = "en-US") -> TranscriptionResult:
        """Fallback transcription using REST API with Vertex AI token"""
        import aiohttp
        import base64
        import os
        
        # Get Vertex AI token from environment
        vertex_token = os.getenv('VEO_API_KEY') or os.getenv('VERTEX_AI_API_KEY')
        if not vertex_token:
            raise Exception("No Vertex AI token available for Speech-to-Text API")
        
        job_id = str(uuid.uuid4())
        start_time = time.time()
        
        try:
            # Read and encode audio file
            with open(audio_path, 'rb') as audio_file:
                audio_content = base64.b64encode(audio_file.read()).decode('utf-8')
            
            # Prepare REST API request
            url = f"https://speech.googleapis.com/v1/speech:recognize"
            headers = {
                'Authorization': f'Bearer {vertex_token}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                "config": {
                    "encoding": "LINEAR16",
                    "sampleRateHertz": self.config.AUDIO_SAMPLE_RATE,
                    "languageCode": language,
                    "model": self.config.SPEECH_TO_TEXT_MODEL,
                    "enableWordTimeOffsets": True,
                    "enableAutomaticPunctuation": True,
                    "enableWordConfidence": True,
                    "useEnhanced": True
                },
                "audio": {
                    "content": audio_content
                }
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers) as response:
                    if response.status == 200:
                        result = await response.json()
                        return self._process_rest_api_response(result, job_id, Path(audio_path).stem, language, start_time)
                    else:
                        error_text = await response.text()
                        raise Exception(f"Speech API error {response.status}: {error_text}")
                        
        except Exception as e:
            logger.error("REST API transcription failed", error=str(e))
            # Return empty result
            return TranscriptionResult(
                job_id=job_id,
                video_id=Path(audio_path).stem,
                language=language,
                confidence=0.0,
                segments=[],
                processing_time=time.time() - start_time,
                created_at=datetime.now()
            )
    
    def _process_rest_api_response(self, response_data, job_id: str, video_id: str, language: str, start_time: float) -> TranscriptionResult:
        """Process REST API response"""
        segments = []
        overall_confidence = 0.0
        confidence_count = 0
        
        for result in response_data.get('results', []):
            if not result.get('alternatives'):
                continue
                
            alternative = result['alternatives'][0]
            segment_confidence = alternative.get('confidence', 0.8)
            overall_confidence += segment_confidence
            confidence_count += 1
            
            # Extract word-level timestamps
            words = []
            if 'words' in alternative:
                for word_info in alternative['words']:
                    start_ms = int(float(word_info.get('startTime', '0s').rstrip('s')) * 1000)
                    end_ms = int(float(word_info.get('endTime', '0s').rstrip('s')) * 1000)
                    
                    words.append(WordTimestamp(
                        word=word_info.get('word', ''),
                        start_time_ms=start_ms,
                        end_time_ms=end_ms,
                        confidence=word_info.get('confidence', segment_confidence)
                    ))
            
            # Create segment
            if words:
                segment_start = words[0].start_time_ms
                segment_end = words[-1].end_time_ms
            else:
                segment_start = 0
                segment_end = 1000
            
            segment = TranscriptSegment(
                text=alternative.get('transcript', ''),
                start_time_ms=segment_start,
                end_time_ms=segment_end,
                confidence=segment_confidence,
                words=words
            )
            segments.append(segment)
        
        # Calculate overall confidence
        if confidence_count > 0:
            overall_confidence = overall_confidence / confidence_count
        else:
            overall_confidence = 0.0
        
        processing_time = time.time() - start_time
        
        return TranscriptionResult(
            job_id=job_id,
            video_id=video_id,
            language=language,
            confidence=overall_confidence,
            segments=segments,
            processing_time=processing_time,
            created_at=datetime.now()
        )

    async def transcribe_audio(self, audio_path: str, language: str = "en-US") -> TranscriptionResult:
        """
        Transcribe audio file using Google Cloud Speech-to-Text
        
        Args:
            audio_path: Path to the audio file
            language: Language code for transcription
            
        Returns:
            TranscriptionResult with segments and timestamps
        """
        import time
        import uuid
        from pathlib import Path
        import os
        
        start_time = time.time()
        job_id = str(uuid.uuid4())
        
        logger.info("Starting Google Speech transcription", 
                   audio_path=audio_path, language=language, job_id=job_id)
        
        # Check if audio file exists
        audio_file_path = Path(audio_path)
        if not audio_file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Try Google Cloud client first, fallback to REST API
        try:
            client = self.client
            if client is None:
                logger.info("Google Cloud client not available, using REST API fallback")
                return await self._transcribe_with_rest_api(audio_path, language)
            
            from google.cloud import speech
            
            # Check file size to determine transcription method
            file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            
            # Use streaming recognition for large files (>10MB) or long duration
            if file_size_mb > 10:
                logger.info("Using streaming recognition for large file", 
                           file_size_mb=file_size_mb)
                return await self._transcribe_streaming(audio_path, language, job_id, start_time)
            else:
                logger.info("Using standard recognition for small file", 
                           file_size_mb=file_size_mb)
                return await self._transcribe_standard(audio_path, language, job_id, start_time)
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error("Google Speech transcription failed", 
                        job_id=job_id, 
                        error=str(e),
                        processing_time=processing_time)
            
            # Return empty result on error
            return TranscriptionResult(
                job_id=job_id,
                video_id=Path(audio_path).stem,
                language=language,
                confidence=0.0,
                segments=[],
                processing_time=processing_time,
                created_at=datetime.now()
            )
    
    async def _transcribe_standard(self, audio_path: str, language: str, job_id: str, start_time: float) -> TranscriptionResult:
        """Standard transcription for smaller files"""
        from google.cloud import speech
        from pathlib import Path
        
        with open(audio_path, "rb") as audio_file:
            content = audio_file.read()
        
        # Configure recognition settings with advanced features
        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=self.config.AUDIO_SAMPLE_RATE,
            language_code=language,
            model=self.config.SPEECH_TO_TEXT_MODEL,
            enable_word_time_offsets=True,  # Always enable for precise alignment
            enable_automatic_punctuation=True,  # Always enable for better readability
            enable_word_confidence=True,  # Enable word-level confidence
            audio_channel_count=self.config.AUDIO_CHANNELS,
            use_enhanced=True,  # Use enhanced model for better accuracy
            # Add profanity filter and speaker diarization if needed
            profanity_filter=False,  # Keep original content
            enable_speaker_diarization=False,  # Can be enabled later
        )
        
        # Perform transcription
        logger.info("Sending standard transcription request to Google Speech API")
        response = self.client.recognize(config=config, audio=audio)
        
        return self._process_transcription_response(response, job_id, Path(audio_path).stem, language, start_time)
    
    async def _transcribe_streaming(self, audio_path: str, language: str, job_id: str, start_time: float) -> TranscriptionResult:
        """Streaming transcription for larger files"""
        from google.cloud import speech
        from pathlib import Path
        import asyncio
        
        # Configure streaming recognition
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=self.config.AUDIO_SAMPLE_RATE,
            language_code=language,
            model=self.config.SPEECH_TO_TEXT_MODEL,
            enable_word_time_offsets=True,
            enable_automatic_punctuation=True,
            enable_word_confidence=True,
            audio_channel_count=self.config.AUDIO_CHANNELS,
            use_enhanced=True,
            profanity_filter=False,
        )
        
        streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=False,  # Only final results
        )
        
        # Read audio file in chunks
        def audio_generator():
            chunk_size = 1024 * 16  # 16KB chunks
            with open(audio_path, "rb") as audio_file:
                while True:
                    chunk = audio_file.read(chunk_size)
                    if not chunk:
                        break
                    yield speech.StreamingRecognizeRequest(audio_content=chunk)
        
        # Create streaming request
        requests = [speech.StreamingRecognizeRequest(streaming_config=streaming_config)]
        requests.extend(audio_generator())
        
        logger.info("Starting streaming transcription")
        responses = self.client.streaming_recognize(iter(requests))
        
        # Collect all final results
        final_results = []
        for response in responses:
            for result in response.results:
                if result.is_final:
                    final_results.append(result)
        
        # Create a mock response object for processing
        class MockResponse:
            def __init__(self, results):
                self.results = results
        
        mock_response = MockResponse(final_results)
        return self._process_transcription_response(mock_response, job_id, Path(audio_path).stem, language, start_time)
    
    def _process_transcription_response(self, response, job_id: str, video_id: str, language: str, start_time: float) -> TranscriptionResult:
        """Process transcription response and extract segments with enhanced confidence scoring"""
        import time
        
        segments = []
        overall_confidence = 0.0
        confidence_count = 0
        word_confidences = []
        
        for result in response.results:
            if not result.alternatives:
                continue
                
            alternative = result.alternatives[0]
            segment_confidence = alternative.confidence
            overall_confidence += segment_confidence
            confidence_count += 1
            
            # Extract word-level timestamps and confidence with enhanced processing
            words = []
            if hasattr(alternative, 'words') and alternative.words:
                for word_info in alternative.words:
                    start_ms = int(word_info.start_time.total_seconds() * 1000)
                    end_ms = int(word_info.end_time.total_seconds() * 1000)
                    
                    # Use word-level confidence if available, otherwise use segment confidence
                    word_confidence = getattr(word_info, 'confidence', segment_confidence)
                    word_confidences.append(word_confidence)
                    
                    words.append(WordTimestamp(
                        word=word_info.word,
                        start_time_ms=start_ms,
                        end_time_ms=end_ms,
                        confidence=word_confidence
                    ))
            
            # Calculate segment timing with better precision
            if words:
                start_time_ms = words[0].start_time_ms
                end_time_ms = words[-1].end_time_ms
                
                # Calculate weighted confidence based on word confidences
                if word_confidences:
                    segment_confidence = sum(word_confidences) / len(word_confidences)
            else:
                # Fallback if no word timestamps
                start_time_ms = 0
                end_time_ms = 0
            
            # Clean and format text with better punctuation handling
            text = alternative.transcript.strip()
            if text:  # Only add non-empty segments
                segment = TranscriptSegment(
                    text=text,
                    start_time_ms=start_time_ms,
                    end_time_ms=end_time_ms,
                    confidence=segment_confidence,
                    words=words
                )
                segments.append(segment)
        
        # Calculate enhanced overall confidence
        if confidence_count > 0:
            overall_confidence = overall_confidence / confidence_count
        elif word_confidences:
            # Fallback to word-level confidence average
            overall_confidence = sum(word_confidences) / len(word_confidences)
        
        # Apply confidence quality assessment
        confidence_quality = self._assess_confidence_quality(overall_confidence, segments)
        
        processing_time = time.time() - start_time
        
        result = TranscriptionResult(
            job_id=job_id,
            video_id=video_id,
            language=language,
            confidence=overall_confidence,
            segments=segments,
            processing_time=processing_time,
            created_at=datetime.now()
        )
        
        logger.info("Google Speech transcription completed", 
                   job_id=job_id, 
                   segments_count=len(segments),
                   confidence=overall_confidence,
                   confidence_quality=confidence_quality,
                   processing_time=processing_time)
        
        return result
    
    def _assess_confidence_quality(self, overall_confidence: float, segments: List[TranscriptSegment]) -> str:
        """Assess the quality of transcription based on confidence scores"""
        if overall_confidence >= 0.9:
            return "excellent"
        elif overall_confidence >= 0.8:
            return "good"
        elif overall_confidence >= 0.7:
            return "fair"
        elif overall_confidence >= 0.6:
            return "poor"
        else:
            return "very_poor"
    
    async def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        # Common languages supported by Google Speech-to-Text
        return [
            "en-US", "en-GB", "en-AU", "en-CA", "en-IN", "en-NZ", "en-ZA",
            "es-ES", "es-MX", "es-AR", "es-CO", "es-CL", "es-PE", "es-VE",
            "fr-FR", "fr-CA", "de-DE", "it-IT", "pt-BR", "pt-PT",
            "ru-RU", "ja-JP", "ko-KR", "zh-CN", "zh-TW", "zh-HK",
            "ar-SA", "hi-IN", "th-TH", "vi-VN", "tr-TR", "pl-PL",
            "nl-NL", "sv-SE", "da-DK", "no-NO", "fi-FI", "cs-CZ",
            "sk-SK", "hu-HU", "ro-RO", "bg-BG", "hr-HR", "sl-SI",
            "et-EE", "lv-LV", "lt-LT", "mt-MT", "el-GR", "he-IL"
        ]
    
    async def transcribe_with_speaker_diarization(self, audio_path: str, language: str = "en-US", 
                                                 min_speakers: int = 2, max_speakers: int = 6) -> TranscriptionResult:
        """
        Transcribe audio with speaker diarization (advanced feature)
        
        Args:
            audio_path: Path to the audio file
            language: Language code for transcription
            min_speakers: Minimum number of speakers expected
            max_speakers: Maximum number of speakers expected
            
        Returns:
            TranscriptionResult with speaker information
        """
        import time
        import uuid
        from pathlib import Path
        from google.cloud import speech
        
        start_time = time.time()
        job_id = str(uuid.uuid4())
        
        logger.info("Starting speaker diarization transcription", 
                   audio_path=audio_path, language=language, 
                   min_speakers=min_speakers, max_speakers=max_speakers)
        
        try:
            with open(audio_path, "rb") as audio_file:
                content = audio_file.read()
            
            # Configure diarization
            diarization_config = speech.SpeakerDiarizationConfig(
                enable_speaker_diarization=True,
                min_speaker_count=min_speakers,
                max_speaker_count=max_speakers,
            )
            
            # Configure recognition with diarization
            audio = speech.RecognitionAudio(content=content)
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=self.config.AUDIO_SAMPLE_RATE,
                language_code=language,
                model=self.config.SPEECH_TO_TEXT_MODEL,
                enable_word_time_offsets=True,
                enable_automatic_punctuation=True,
                enable_word_confidence=True,
                audio_channel_count=self.config.AUDIO_CHANNELS,
                diarization_config=diarization_config,
            )
            
            response = self.client.recognize(config=config, audio=audio)
            
            # Process results with speaker information
            segments = []
            overall_confidence = 0.0
            confidence_count = 0
            
            for result in response.results:
                if not result.alternatives:
                    continue
                    
                alternative = result.alternatives[0]
                confidence = alternative.confidence
                overall_confidence += confidence
                confidence_count += 1
                
                # Extract words with speaker tags
                words = []
                current_speaker = None
                
                if hasattr(alternative, 'words') and alternative.words:
                    for word_info in alternative.words:
                        start_ms = int(word_info.start_time.total_seconds() * 1000)
                        end_ms = int(word_info.end_time.total_seconds() * 1000)
                        speaker_tag = getattr(word_info, 'speaker_tag', 0)
                        
                        if current_speaker is None:
                            current_speaker = speaker_tag
                        
                        words.append(WordTimestamp(
                            word=word_info.word,
                            start_time_ms=start_ms,
                            end_time_ms=end_ms,
                            confidence=getattr(word_info, 'confidence', confidence)
                        ))
                
                if words:
                    segment = TranscriptSegment(
                        text=alternative.transcript.strip(),
                        start_time_ms=words[0].start_time_ms,
                        end_time_ms=words[-1].end_time_ms,
                        confidence=confidence,
                        speaker_id=f"speaker_{current_speaker}" if current_speaker is not None else None,
                        words=words
                    )
                    segments.append(segment)
            
            if confidence_count > 0:
                overall_confidence = overall_confidence / confidence_count
            
            processing_time = time.time() - start_time
            
            result = TranscriptionResult(
                job_id=job_id,
                video_id=Path(audio_path).stem,
                language=language,
                confidence=overall_confidence,
                segments=segments,
                processing_time=processing_time,
                created_at=datetime.now()
            )
            
            logger.info("Speaker diarization transcription completed", 
                       job_id=job_id, 
                       segments_count=len(segments),
                       processing_time=processing_time)
            
            return result
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error("Speaker diarization transcription failed", 
                        job_id=job_id, error=str(e))
            
            return TranscriptionResult(
                job_id=job_id,
                video_id=Path(audio_path).stem,
                language=language,
                confidence=0.0,
                segments=[],
                processing_time=processing_time,
                created_at=datetime.now()
            )
    
    def get_confidence_threshold(self) -> float:
        """Get recommended confidence threshold for filtering low-quality segments"""
        return 0.6  # Segments below this confidence should be reviewed
    
    def filter_low_confidence_segments(self, result: TranscriptionResult, 
                                     threshold: Optional[float] = None) -> TranscriptionResult:
        """Filter out segments with confidence below threshold"""
        if threshold is None:
            threshold = self.get_confidence_threshold()
        
        filtered_segments = [
            segment for segment in result.segments 
            if segment.confidence >= threshold
        ]
        
        # Recalculate overall confidence
        if filtered_segments:
            overall_confidence = sum(s.confidence for s in filtered_segments) / len(filtered_segments)
        else:
            overall_confidence = 0.0
        
        return TranscriptionResult(
            job_id=result.job_id,
            video_id=result.video_id,
            language=result.language,
            confidence=overall_confidence,
            segments=filtered_segments,
            processing_time=result.processing_time,
            created_at=result.created_at
        )


class WhisperRecognizer(SpeechRecognizer):
    """OpenAI Whisper implementation as fallback option"""
    
    def __init__(self, model_size: str = "base"):
        self.model_size = model_size
        self._model = None
        self.config = AudioConfig
    
    @property
    def model(self):
        """Lazy initialization of Whisper model"""
        if self._model is None:
            try:
                import whisper
                self._model = whisper.load_model(self.model_size)
                logger.info("Whisper model loaded successfully", model_size=self.model_size)
            except ImportError:
                logger.error("Whisper library not installed. Install with: pip install openai-whisper")
                raise
            except Exception as e:
                logger.error("Failed to load Whisper model", error=str(e))
                raise
        return self._model
    
    async def transcribe_audio(self, audio_path: str, language: str = "en-US") -> TranscriptionResult:
        """
        Transcribe audio file using OpenAI Whisper
        
        Args:
            audio_path: Path to the audio file
            language: Language code for transcription (converted to Whisper format)
            
        Returns:
            TranscriptionResult with segments and timestamps
        """
        import time
        import uuid
        from pathlib import Path
        
        start_time = time.time()
        job_id = str(uuid.uuid4())
        
        # Convert language code to Whisper format
        whisper_language = self._convert_language_code(language)
        
        logger.info("Starting Whisper transcription", 
                   audio_path=audio_path, language=whisper_language, job_id=job_id)
        
        try:
            audio_file_path = Path(audio_path)
            if not audio_file_path.exists():
                raise FileNotFoundError(f"Audio file not found: {audio_path}")
            
            # Transcribe with Whisper
            result = self.model.transcribe(
                str(audio_path),
                language=whisper_language,
                word_timestamps=True,
                verbose=False
            )
            
            # Process Whisper results
            segments = []
            overall_confidence = 0.8  # Whisper doesn't provide confidence, use default
            
            for segment_data in result.get("segments", []):
                # Extract word-level timestamps
                words = []
                if "words" in segment_data:
                    for word_data in segment_data["words"]:
                        words.append(WordTimestamp(
                            word=word_data.get("word", "").strip(),
                            start_time_ms=int(word_data.get("start", 0) * 1000),
                            end_time_ms=int(word_data.get("end", 0) * 1000),
                            confidence=overall_confidence  # Whisper doesn't provide word confidence
                        ))
                
                segment = TranscriptSegment(
                    text=segment_data.get("text", "").strip(),
                    start_time_ms=int(segment_data.get("start", 0) * 1000),
                    end_time_ms=int(segment_data.get("end", 0) * 1000),
                    confidence=overall_confidence,
                    words=words
                )
                
                if segment.text:  # Only add non-empty segments
                    segments.append(segment)
            
            processing_time = time.time() - start_time
            
            transcription_result = TranscriptionResult(
                job_id=job_id,
                video_id=audio_file_path.stem,
                language=language,
                confidence=overall_confidence,
                segments=segments,
                processing_time=processing_time,
                created_at=datetime.now()
            )
            
            logger.info("Whisper transcription completed", 
                       job_id=job_id, 
                       segments_count=len(segments),
                       processing_time=processing_time)
            
            return transcription_result
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error("Whisper transcription failed", 
                        job_id=job_id, 
                        error=str(e),
                        processing_time=processing_time)
            
            return TranscriptionResult(
                job_id=job_id,
                video_id=Path(audio_path).stem,
                language=language,
                confidence=0.0,
                segments=[],
                processing_time=processing_time,
                created_at=datetime.now()
            )
    
    def _convert_language_code(self, language_code: str) -> str:
        """Convert standard language codes to Whisper format"""
        # Map common language codes to Whisper language codes
        language_map = {
            "en-US": "en", "en-GB": "en", "en-AU": "en", "en-CA": "en",
            "es-ES": "es", "es-MX": "es", "es-AR": "es",
            "fr-FR": "fr", "fr-CA": "fr",
            "de-DE": "de", "it-IT": "it", "pt-BR": "pt", "pt-PT": "pt",
            "ru-RU": "ru", "ja-JP": "ja", "ko-KR": "ko", 
            "zh-CN": "zh", "zh-TW": "zh", "zh-HK": "zh",
            "ar-SA": "ar", "hi-IN": "hi", "th-TH": "th", "vi-VN": "vi",
            "tr-TR": "tr", "pl-PL": "pl", "nl-NL": "nl", "sv-SE": "sv",
            "da-DK": "da", "no-NO": "no", "fi-FI": "fi", "cs-CZ": "cs",
            "sk-SK": "sk", "hu-HU": "hu", "ro-RO": "ro", "bg-BG": "bg",
            "hr-HR": "hr", "sl-SI": "sl", "et-EE": "et", "lv-LV": "lv",
            "lt-LT": "lt", "el-GR": "el", "he-IL": "he"
        }
        
        return language_map.get(language_code, language_code.split("-")[0])
    
    async def get_supported_languages(self) -> List[str]:
        """Get list of supported languages (Whisper supports many languages)"""
        return [
            "en-US", "es-ES", "fr-FR", "de-DE", "it-IT", "pt-BR", "ru-RU",
            "ja-JP", "ko-KR", "zh-CN", "ar-SA", "hi-IN", "th-TH", "vi-VN",
            "tr-TR", "pl-PL", "nl-NL", "sv-SE", "da-DK", "no-NO", "fi-FI",
            "cs-CZ", "sk-SK", "hu-HU", "ro-RO", "bg-BG", "hr-HR", "sl-SI",
            "et-EE", "lv-LV", "lt-LT", "el-GR", "he-IL", "uk-UA", "be-BY",
            "ca-ES", "eu-ES", "gl-ES", "cy-GB", "mt-MT", "is-IS", "mk-MK",
            "sq-AL", "az-AZ", "hy-AM", "ka-GE", "kk-KZ", "ky-KG", "uz-UZ",
            "tg-TJ", "mn-MN", "ne-NP", "si-LK", "km-KH", "lo-LA", "my-MM",
            "ka-GE", "am-ET", "ti-ET", "om-ET", "so-SO", "sw-KE", "rw-RW",
            "yo-NG", "ig-NG", "ha-NG", "zu-ZA", "af-ZA", "xh-ZA", "st-ZA"
        ]


class SpeechRecognitionEngine:
    """Main speech recognition engine with fallback support"""
    
    def __init__(self, primary_engine: str = "google", fallback_engine: str = "whisper"):
        self.primary_engine = primary_engine
        self.fallback_engine = fallback_engine
        self._engines = {}
        self._initialize_engines()
    
    def _initialize_engines(self):
        """Initialize available speech recognition engines"""
        try:
            if self.primary_engine == "google":
                self._engines["google"] = GoogleSpeechRecognizer()
            if self.fallback_engine == "whisper":
                self._engines["whisper"] = WhisperRecognizer()
        except Exception as e:
            logger.error("Failed to initialize speech recognition engines", error=str(e))
    
    async def transcribe_audio(self, audio_path: str, language: str = "en-US") -> TranscriptionResult:
        """
        Transcribe audio with automatic fallback
        
        Args:
            audio_path: Path to the audio file
            language: Language code for transcription
            
        Returns:
            TranscriptionResult from primary or fallback engine
        """
        # Try primary engine first
        if self.primary_engine in self._engines:
            try:
                logger.info("Attempting transcription with primary engine", 
                           engine=self.primary_engine)
                result = await self._engines[self.primary_engine].transcribe_audio(audio_path, language)
                
                # Check if result is successful (has segments with reasonable confidence)
                if result.segments and result.confidence > 0.3:
                    logger.info("Primary engine transcription successful", 
                               engine=self.primary_engine, 
                               confidence=result.confidence)
                    return result
                else:
                    logger.warning("Primary engine produced low-quality result, trying fallback",
                                 engine=self.primary_engine,
                                 confidence=result.confidence,
                                 segments_count=len(result.segments))
                    
            except Exception as e:
                logger.error("Primary engine failed, trying fallback", 
                           engine=self.primary_engine, error=str(e))
        
        # Try fallback engine
        if self.fallback_engine in self._engines:
            try:
                logger.info("Attempting transcription with fallback engine", 
                           engine=self.fallback_engine)
                result = await self._engines[self.fallback_engine].transcribe_audio(audio_path, language)
                
                logger.info("Fallback engine transcription completed", 
                           engine=self.fallback_engine, 
                           confidence=result.confidence,
                           segments_count=len(result.segments))
                return result
                
            except Exception as e:
                logger.error("Fallback engine also failed", 
                           engine=self.fallback_engine, error=str(e))
        
        # If both engines fail, return empty result
        logger.error("All speech recognition engines failed")
        return TranscriptionResult(
            job_id=str(uuid.uuid4()),
            video_id=Path(audio_path).stem,
            language=language,
            confidence=0.0,
            segments=[],
            processing_time=0.0,
            created_at=datetime.now()
        )
    
    async def get_supported_languages(self) -> List[str]:
        """Get combined list of supported languages from all engines"""
        all_languages = set()
        
        for engine in self._engines.values():
            try:
                languages = await engine.get_supported_languages()
                all_languages.update(languages)
            except Exception as e:
                logger.warning("Failed to get languages from engine", error=str(e))
        
        return sorted(list(all_languages))
    
    def get_available_engines(self) -> List[str]:
        """Get list of available engines"""
        return list(self._engines.keys())
    
    def set_primary_engine(self, engine_name: str):
        """Set the primary engine"""
        if engine_name in self._engines:
            self.primary_engine = engine_name
            logger.info("Primary engine changed", engine=engine_name)
        else:
            logger.error("Engine not available", engine=engine_name)
    
    def set_fallback_engine(self, engine_name: str):
        """Set the fallback engine"""
        if engine_name in self._engines:
            self.fallback_engine = engine_name
            logger.info("Fallback engine changed", engine=engine_name)
        else:
            logger.error("Engine not available", engine=engine_name)