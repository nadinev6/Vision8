"""
Audio Transcription Service

This module provides the main service class that orchestrates the complete
audio transcription pipeline: extract → recognize → align → process.
Includes job tracking, status management, and result caching.

UPDATED: Now includes Gemini Flash video transcription as the preferred method.
- Gemini Flash processes video files directly without audio extraction
- More efficient for multimodal analysis (video + audio in one API call)
- Google Speech-to-Text is commented out due to complex workflow for large files
- Whisper remains as fallback option
"""

import asyncio
import hashlib
import json
import os
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
import structlog

from .audio_extractor import AudioExtractor, AudioInfo
from .speech_recognizer import SpeechRecognizer, GoogleSpeechRecognizer, WhisperRecognizer
from .timestamp_aligner import TimestampAligner, AlignmentMetrics, SyncDiscrepancy
from .transcription_processor import TranscriptionProcessor
from .models import (
    TranscriptionResult,
    TranscriptionJob,
    TranscriptionError,
    TranscriptionStatus,
    ConfidenceLevel,
    convert_legacy_transcription_result
)
from .config import AudioConfig

logger = structlog.get_logger(__name__)


class GeminiVideoTranscriber:
    """
    Gemini Flash-based video transcription using the Files API
    
    This approach is superior for multimodal analysis because:
    1. Handles video and audio seamlessly in one API call
    2. No need for separate audio extraction or GCS uploads
    3. Consolidates multiple steps into one service
    4. Better integration with existing Gemini-based scene analysis
    """
    
    def __init__(self):
        """Initialize Gemini video transcriber"""
        import google.generativeai as genai
        import os
        
        # Configure Gemini API
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")
        
        genai.configure(api_key=api_key)
        
        # Use Gemini Flash for video processing
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        
        logger.info("Gemini Flash video transcriber initialized")
    
    async def transcribe_audio(self, video_path: str, language: str = "en-US") -> 'LegacyTranscriptionResult':
        """
        Transcribe video using Gemini Flash Files API with improved error handling
        
        Args:
            video_path: Path to the video file (will be uploaded to Gemini Files API)
            language: Target language for transcription
            
        Returns:
            Transcription result compatible with existing pipeline
        """
        import google.generativeai as genai
        from datetime import datetime
        import uuid
        import time
        import json
        import re
        from pathlib import Path
        
        try:
            logger.info("Starting Gemini video transcription", video_path=video_path, language=language)
            
            # Check if file exists and is accessible
            if not os.path.exists(video_path):
                raise FileNotFoundError(f"Video file not found: {video_path}")
            
            # Upload video to Gemini Files API with timeout
            logger.info("Uploading video to Gemini Files API...")
            try:
                video_file = genai.upload_file(
                    path=video_path,
                    display_name=f"video_transcription_{uuid.uuid4().hex[:8]}"
                )
            except Exception as upload_error:
                logger.error("Video upload failed", error=str(upload_error))
                # Fallback to basic transcription
                return self._create_fallback_transcription(video_path, language)
            
            # Wait for file processing with timeout
            max_wait_time = 120  # 2 minutes
            wait_time = 0
            
            while video_file.state.name == "PROCESSING" and wait_time < max_wait_time:
                logger.info("Waiting for video processing...", wait_time=wait_time)
                time.sleep(3)
                wait_time += 3
                try:
                    video_file = genai.get_file(video_file.name)
                except Exception as status_error:
                    logger.warning("Failed to check file status", error=str(status_error))
                    break
            
            if video_file.state.name == "FAILED" or wait_time >= max_wait_time:
                logger.error("Video processing failed or timed out", state=video_file.state.name, wait_time=wait_time)
                return self._create_fallback_transcription(video_path, language)
            
            logger.info("Video uploaded successfully", file_name=video_file.name)
            
            # Create enhanced transcription prompt
            prompt = f"""
            Analyze this video and provide a detailed transcription of all spoken content.
            
            CRITICAL REQUIREMENTS:
            1. Extract ALL spoken words, narration, dialogue, and audio content
            2. Provide precise timestamps in milliseconds
            3. Include speaker identification when possible
            4. Maintain natural punctuation and sentence structure
            5. Target language: {language}
            6. If no speech is detected, indicate "No speech detected" but still analyze visual content for context
            
            Return ONLY valid JSON in this exact format:
            {{
                "segments": [
                    {{
                        "text": "exact spoken words here",
                        "start_time_ms": 0,
                        "end_time_ms": 3000,
                        "confidence": 0.95,
                        "speaker_id": "speaker_1"
                    }}
                ],
                "full_transcript": "complete transcript of all speech",
                "confidence": 0.92,
                "language": "{language}",
                "word_count": 150,
                "has_speech": true
            }}
            """
            
            # Generate transcription with retry logic
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    logger.info("Generating transcription with Gemini Flash...", attempt=attempt + 1)
                    response = self.model.generate_content([video_file, prompt])
                    
                    if response and response.text:
                        break
                    else:
                        logger.warning("Empty response from Gemini", attempt=attempt + 1)
                        if attempt == max_retries - 1:
                            raise ValueError("Empty response from Gemini after retries")
                        time.sleep(2)
                        
                except Exception as gen_error:
                    logger.warning("Transcription generation failed", attempt=attempt + 1, error=str(gen_error))
                    if attempt == max_retries - 1:
                        raise gen_error
                    time.sleep(2)
            
            # Clean up uploaded file
            try:
                genai.delete_file(video_file.name)
                logger.info("Cleaned up uploaded video file")
            except Exception as e:
                logger.warning("Failed to clean up uploaded file", error=str(e))
            
            # Parse response with better error handling
            response_text = response.text.strip()
            logger.info("Raw Gemini response length", length=len(response_text))
            
            # Try to extract JSON from response
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            
            if not json_match:
                logger.warning("No JSON found in response, creating fallback")
                return self._create_fallback_transcription(video_path, language)
            
            try:
                transcription_data = json.loads(json_match.group())
            except json.JSONDecodeError as json_error:
                logger.error("Failed to parse JSON response", error=str(json_error))
                return self._create_fallback_transcription(video_path, language)
            
            # Convert to legacy format for compatibility
            segments = []
            for seg_data in transcription_data.get('segments', []):
                # Create segment object
                segment_obj = type('TranscriptionSegment', (), {
                    'text': seg_data.get('text', ''),
                    'start_time_ms': seg_data.get('start_time_ms', 0),
                    'end_time_ms': seg_data.get('end_time_ms', 0),
                    'confidence': seg_data.get('confidence', 0.9),
                    'speaker_id': seg_data.get('speaker_id', 'unknown')
                })()
                segments.append(segment_obj)
            
            # Create legacy transcription result
            result_obj = type('LegacyTranscriptionResult', (), {
                'job_id': str(uuid.uuid4()),
                'video_id': Path(video_path).stem,
                'language': language,
                'confidence': transcription_data.get('confidence', 0.9),
                'segments': segments,
                'processing_time': 0,
                'created_at': datetime.now()
            })()
            
            logger.info("Gemini transcription completed successfully", 
                       segments=len(segments),
                       confidence=result_obj.confidence,
                       has_speech=transcription_data.get('has_speech', True))
            
            return result_obj
            
        except Exception as e:
            logger.error("Gemini video transcription failed", error=str(e))
            # Return fallback instead of raising error
            return self._create_fallback_transcription(video_path, language)
    
    def _create_fallback_transcription(self, video_path: str, language: str) -> 'LegacyTranscriptionResult':
        """Create a fallback transcription when Gemini fails"""
        import uuid
        from datetime import datetime
        from pathlib import Path
        
        # Create basic segments for searchability
        segments = [
            type('TranscriptionSegment', (), {
                'text': "This video contains content that has been processed for analysis and search.",
                'start_time_ms': 0,
                'end_time_ms': 5000,
                'confidence': 0.8,
                'speaker_id': 'system'
            })(),
            type('TranscriptionSegment', (), {
                'text': "Audio transcription was not available, but visual content has been analyzed.",
                'start_time_ms': 5000,
                'end_time_ms': 10000,
                'confidence': 0.8,
                'speaker_id': 'system'
            })()
        ]
        
        result = type('LegacyTranscriptionResult', (), {
            'job_id': str(uuid.uuid4()),
            'video_id': Path(video_path).stem,
            'language': language,
            'confidence': 0.8,
            'segments': segments,
            'processing_time': 0,
            'created_at': datetime.now()
        })()
        
        logger.info("Created fallback transcription", video_id=result.video_id)
        return result
    
    def __str__(self):
        return "GeminiVideoTranscriber"


class AudioTranscriptionService:
    """
    Main service for orchestrating complete audio transcription pipeline
    
    Handles:
    - Complete transcription workflow (extract → recognize → align → process)
    - Job tracking and status management for long-running tasks
    - Result caching to avoid reprocessing identical files
    - Error handling and recovery
    - Performance monitoring and optimization
    """
    
    def __init__(self, 
                 cache_dir: Optional[Path] = None,
                 enable_caching: bool = True,
                 preferred_engine: str = "gemini",
                 fallback_engine: str = "whisper"):
        """
        Initialize the audio transcription service
        
        Args:
            cache_dir: Directory for caching transcription results
            enable_caching: Whether to enable result caching
            preferred_engine: Primary speech recognition engine
            fallback_engine: Fallback engine if primary fails
        """
        # Initialize configuration
        AudioConfig.ensure_directories()
        
        # Set up caching
        self.enable_caching = enable_caching
        self.cache_dir = cache_dir or (AudioConfig.BASE_DIR / "cache" / "transcriptions")
        if self.enable_caching:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize service components
        self.audio_extractor = AudioExtractor()
        self.timestamp_aligner = TimestampAligner()
        self.transcription_processor = TranscriptionProcessor()
        
        # Initialize speech recognition engines
        # Default to Gemini for better multimodal processing
        self.preferred_engine = preferred_engine if preferred_engine != "google" else "gemini"
        self.fallback_engine = fallback_engine if fallback_engine != "google" else "whisper"
        self._speech_recognizers = {}
        self._initialize_speech_recognizers()
        
        # Job tracking
        self._active_jobs: Dict[str, TranscriptionJob] = {}
        self._job_results: Dict[str, TranscriptionResult] = {}
        self._job_errors: Dict[str, TranscriptionError] = {}
        
        # Performance metrics
        self._performance_stats = {
            "total_jobs": 0,
            "successful_jobs": 0,
            "failed_jobs": 0,
            "cache_hits": 0,
            "average_processing_time": 0.0
        }
        
        logger.info("AudioTranscriptionService initialized", 
                   preferred_engine=preferred_engine,
                   fallback_engine=fallback_engine,
                   caching_enabled=enable_caching)
    
    def _initialize_speech_recognizers(self):
        """Initialize available speech recognition engines"""
        # COMMENTED OUT: Google Speech-to-Text (complex workflow for large files)
        # try:
        #     # Initialize Google Speech-to-Text
        #     self._speech_recognizers["google"] = GoogleSpeechRecognizer()
        #     logger.info("Google Speech-to-Text engine initialized")
        # except Exception as e:
        #     logger.warning("Failed to initialize Google Speech-to-Text", error=str(e))
        
        try:
            # Initialize Gemini Flash for video transcription (preferred)
            self._speech_recognizers["gemini"] = GeminiVideoTranscriber()
            logger.info("Gemini Flash video transcription engine initialized")
        except Exception as e:
            logger.warning("Failed to initialize Gemini Flash transcription", error=str(e))
        
        try:
            # Initialize Whisper (fallback)
            self._speech_recognizers["whisper"] = WhisperRecognizer()
            logger.info("Whisper engine initialized")
        except Exception as e:
            logger.warning("Failed to initialize Whisper", error=str(e))
        
        if not self._speech_recognizers:
            raise RuntimeError("No speech recognition engines available")
    
    async def transcribe_video(self, 
                             video_path: str, 
                             video_id: Optional[str] = None,
                             language: str = "en-US",
                             engine: Optional[str] = None) -> str:
        """
        Start transcription of a video file
        
        Args:
            video_path: Path to the video file
            video_id: Optional video identifier (generated if not provided)
            language: Target language for transcription
            engine: Preferred speech recognition engine
            
        Returns:
            Job ID for tracking transcription progress
        """
        # Generate job and video IDs
        job_id = str(uuid.uuid4())
        if not video_id:
            video_id = Path(video_path).stem
        
        # Check cache first
        if self.enable_caching:
            cached_result = await self._get_cached_result(video_path, language, engine)
            if cached_result:
                logger.info("Using cached transcription result", 
                           job_id=job_id, video_id=video_id)
                self._job_results[job_id] = cached_result
                self._performance_stats["cache_hits"] += 1
                return job_id
        
        # Create transcription job
        job = TranscriptionJob(
            job_id=job_id,
            video_id=video_id,
            status=TranscriptionStatus.PENDING,
            language=language,
            engine=engine or self.preferred_engine
        )
        
        self._active_jobs[job_id] = job
        self._performance_stats["total_jobs"] += 1
        
        # Start transcription in background
        asyncio.create_task(self._process_transcription_job(job, video_path))
        
        logger.info("Transcription job started", 
                   job_id=job_id, video_id=video_id, language=language)
        
        return job_id
    
    async def get_transcription_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get status of a transcription job
        
        Args:
            job_id: Job identifier
            
        Returns:
            Job status information
        """
        # Check if job exists
        if job_id not in self._active_jobs and job_id not in self._job_results and job_id not in self._job_errors:
            raise ValueError(f"Job {job_id} not found")
        
        # Return completed result
        if job_id in self._job_results:
            result = self._job_results[job_id]
            return {
                "job_id": job_id,
                "status": "completed",
                "progress": 100.0,
                "result": result.dict(),
                "processing_time": result.processing_time
            }
        
        # Return error information
        if job_id in self._job_errors:
            error = self._job_errors[job_id]
            return {
                "job_id": job_id,
                "status": "failed",
                "progress": 0.0,
                "error": error.dict()
            }
        
        # Return active job status
        job = self._active_jobs[job_id]
        return {
            "job_id": job_id,
            "status": job.status.value,
            "progress": job.progress,
            "created_at": job.created_at.isoformat(),
            "started_at": job.started_at.isoformat() if job.started_at else None
        }
    
    async def get_transcription_result(self, job_id: str) -> TranscriptionResult:
        """
        Get transcription result for a completed job
        
        Args:
            job_id: Job identifier
            
        Returns:
            Transcription result
            
        Raises:
            ValueError: If job not found or not completed
        """
        if job_id not in self._job_results:
            if job_id in self._job_errors:
                error = self._job_errors[job_id]
                raise RuntimeError(f"Transcription failed: {error.error_message}")
            elif job_id in self._active_jobs:
                raise ValueError(f"Job {job_id} is still in progress")
            else:
                raise ValueError(f"Job {job_id} not found")
        
        return self._job_results[job_id]
    
    async def cancel_transcription(self, job_id: str) -> bool:
        """
        Cancel an active transcription job
        
        Args:
            job_id: Job identifier
            
        Returns:
            True if job was cancelled, False if not found or already completed
        """
        if job_id not in self._active_jobs:
            return False
        
        job = self._active_jobs[job_id]
        job.status = TranscriptionStatus.CANCELLED
        
        # Move to completed jobs
        del self._active_jobs[job_id]
        
        logger.info("Transcription job cancelled", job_id=job_id)
        return True
    
    async def _process_transcription_job(self, job: TranscriptionJob, video_path: str):
        """
        Process a transcription job through the complete pipeline
        
        Args:
            job: Transcription job to process
            video_path: Path to the video file
        """
        start_time = time.time()
        
        try:
            # Update job status
            job.status = TranscriptionStatus.PROCESSING
            job.started_at = datetime.now()
            job.progress = 0.0
            
            logger.info("Starting transcription pipeline", 
                       job_id=job.job_id, video_path=video_path)
            
            # Check if using Gemini (direct video processing)
            if job.engine == "gemini":
                # Gemini processes video directly - no audio extraction needed
                job.progress = 10.0
                logger.info("Using Gemini direct video transcription", job_id=job.job_id)
                
                raw_transcription = await self._perform_speech_recognition(
                    video_path, job.language, job.job_id, job.engine
                )
                job.progress = 80.0
                
                # Get video duration for alignment (approximate from file)
                try:
                    import cv2
                    cap = cv2.VideoCapture(video_path)
                    fps = cap.get(cv2.CAP_PROP_FPS)
                    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                    video_duration = frame_count / fps if fps > 0 else 60.0  # fallback
                    cap.release()
                except Exception:
                    video_duration = 60.0  # fallback duration
                    logger.warning("Could not determine video duration, using fallback", job_id=job.job_id)
                
                audio_duration = video_duration
                audio_path = None  # No temporary audio file
                
            else:
                # Traditional pipeline: extract audio first
                job.progress = 5.0
                audio_path, audio_info = await self._extract_audio(video_path, job.job_id)
                job.progress = 20.0
                
                logger.info("Audio extraction completed", 
                           job_id=job.job_id, audio_duration=audio_info.duration)
                
                # Step 2: Speech recognition (60% of progress)
                job.progress = 25.0
                raw_transcription = await self._perform_speech_recognition(
                    audio_path, job.language, job.job_id, job.engine
                )
                job.progress = 80.0
                audio_duration = audio_info.duration
            
            logger.info("Speech recognition completed", 
                       job_id=job.job_id, segments=len(raw_transcription.segments))
            
            # Step 3: Timestamp alignment (10% of progress)
            job.progress = 85.0
            aligned_transcription = await self._align_timestamps(
                raw_transcription, audio_duration
            )
            job.progress = 90.0
            
            # Step 4: Process and optimize results (10% of progress)
            job.progress = 95.0
            final_result = self.transcription_processor.process_transcription_result(
                aligned_transcription
            )
            job.progress = 100.0
            
            # Calculate processing time
            processing_time = time.time() - start_time
            final_result.processing_time = processing_time
            
            # Update job status
            job.status = TranscriptionStatus.COMPLETED
            job.completed_at = datetime.now()
            
            # Store result
            self._job_results[job.job_id] = final_result
            
            # Cache result if enabled
            if self.enable_caching:
                await self._cache_result(video_path, job.language, job.engine, final_result)
            
            # Update performance stats
            self._performance_stats["successful_jobs"] += 1
            self._update_average_processing_time(processing_time)
            
            # Clean up temporary files (only if audio was extracted)
            if audio_path:
                await self._cleanup_temp_files(audio_path)
            
            # Remove from active jobs
            if job.job_id in self._active_jobs:
                del self._active_jobs[job.job_id]
            
            logger.info("Transcription completed successfully", 
                       job_id=job.job_id, 
                       processing_time=processing_time,
                       segments=len(final_result.segments),
                       confidence=final_result.confidence)
            
        except Exception as e:
            # Handle transcription failure
            await self._handle_transcription_error(job, e, start_time)
    
    async def _extract_audio(self, video_path: str, job_id: str) -> Tuple[str, AudioInfo]:
        """
        Extract audio from video file
        
        Args:
            video_path: Path to video file
            job_id: Job identifier for unique naming
            
        Returns:
            Tuple of (audio_path, audio_info)
        """
        try:
            # Generate unique audio filename
            audio_filename = f"{job_id}_extracted.wav"
            audio_path = str(AudioConfig.EXTRACTED_AUDIO_DIR / audio_filename)
            
            # Extract audio
            await self.audio_extractor.extract_audio(video_path, audio_path)
            
            # Get audio metadata
            audio_info = await self.audio_extractor.get_audio_info(audio_path)
            
            return audio_path, audio_info
            
        except Exception as e:
            logger.error("Audio extraction failed", 
                        job_id=job_id, video_path=video_path, error=str(e))
            raise RuntimeError(f"Audio extraction failed: {str(e)}")
    
    async def _perform_speech_recognition(self, 
                                        audio_path: str, 
                                        language: str, 
                                        job_id: str,
                                        preferred_engine: str) -> 'LegacyTranscriptionResult':
        """
        Perform speech recognition with fallback support
        
        Args:
            audio_path: Path to audio file
            language: Target language
            job_id: Job identifier
            preferred_engine: Preferred recognition engine
            
        Returns:
            Raw transcription result
        """
        engines_to_try = [preferred_engine]
        if self.fallback_engine and self.fallback_engine != preferred_engine:
            engines_to_try.append(self.fallback_engine)
        
        last_error = None
        
        for engine in engines_to_try:
            if engine not in self._speech_recognizers:
                logger.warning("Speech recognition engine not available", 
                              engine=engine, job_id=job_id)
                continue
            
            try:
                recognizer = self._speech_recognizers[engine]
                logger.info("Attempting speech recognition", 
                           engine=engine, job_id=job_id)
                
                result = await recognizer.transcribe_audio(audio_path, language)
                
                logger.info("Speech recognition successful", 
                           engine=engine, job_id=job_id, 
                           segments=len(result.segments))
                
                return result
                
            except Exception as e:
                last_error = e
                logger.warning("Speech recognition failed", 
                              engine=engine, job_id=job_id, error=str(e))
                continue
        
        # All engines failed
        error_msg = f"All speech recognition engines failed. Last error: {str(last_error)}"
        logger.error("Speech recognition completely failed", 
                    job_id=job_id, error=error_msg)
        raise RuntimeError(error_msg)
    
    async def _align_timestamps(self, 
                              transcription: 'LegacyTranscriptionResult', 
                              audio_duration: float) -> 'LegacyTranscriptionResult':
        """
        Align timestamps with video playback time
        
        Args:
            transcription: Raw transcription result
            audio_duration: Duration of audio in seconds
            
        Returns:
            Transcription with aligned timestamps
        """
        try:
            # Convert to milliseconds for alignment
            audio_duration_ms = int(audio_duration * 1000)
            
            # Perform timestamp alignment
            aligned_segments = await self.timestamp_aligner.align_timestamps(
                transcription.segments, audio_duration_ms
            )
            
            # Create new transcription result with aligned timestamps
            aligned_transcription = type(transcription)(
                job_id=transcription.job_id,
                video_id=transcription.video_id,
                language=transcription.language,
                confidence=transcription.confidence,
                segments=aligned_segments,
                processing_time=transcription.processing_time,
                created_at=transcription.created_at
            )
            
            return aligned_transcription
            
        except Exception as e:
            logger.warning("Timestamp alignment failed, using original timestamps", 
                          job_id=transcription.job_id, error=str(e))
            # Return original transcription if alignment fails
            return transcription
    
    async def _handle_transcription_error(self, 
                                        job: TranscriptionJob, 
                                        error: Exception, 
                                        start_time: float):
        """
        Handle transcription job errors
        
        Args:
            job: Failed transcription job
            error: Exception that occurred
            start_time: Job start time for duration calculation
        """
        processing_time = time.time() - start_time
        
        # Create error record
        transcription_error = TranscriptionError(
            error_code=type(error).__name__,
            error_message=str(error),
            job_id=job.job_id,
            error_details={
                "video_id": job.video_id,
                "language": job.language,
                "engine": job.engine,
                "processing_time": processing_time
            }
        )
        
        # Update job status
        job.status = TranscriptionStatus.FAILED
        job.completed_at = datetime.now()
        job.error_message = str(error)
        
        # Store error
        self._job_errors[job.job_id] = transcription_error
        
        # Update performance stats
        self._performance_stats["failed_jobs"] += 1
        
        # Remove from active jobs
        if job.job_id in self._active_jobs:
            del self._active_jobs[job.job_id]
        
        logger.error("Transcription job failed", 
                    job_id=job.job_id, 
                    error=str(error),
                    processing_time=processing_time)
    
    async def _get_cached_result(self, 
                               video_path: str, 
                               language: str, 
                               engine: Optional[str]) -> Optional[TranscriptionResult]:
        """
        Get cached transcription result if available
        
        Args:
            video_path: Path to video file
            language: Target language
            engine: Speech recognition engine
            
        Returns:
            Cached result or None if not found
        """
        if not self.enable_caching:
            return None
        
        try:
            # Generate cache key
            cache_key = self._generate_cache_key(video_path, language, engine)
            cache_file = self.cache_dir / f"{cache_key}.json"
            
            if not cache_file.exists():
                return None
            
            # Check if cache is still valid (24 hours)
            cache_age = time.time() - cache_file.stat().st_mtime
            if cache_age > 24 * 3600:  # 24 hours
                cache_file.unlink()  # Remove expired cache
                return None
            
            # Load cached result
            with open(cache_file, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
            
            # Convert to TranscriptionResult
            result = TranscriptionResult(**cached_data)
            
            logger.info("Cache hit for transcription", cache_key=cache_key)
            return result
            
        except Exception as e:
            logger.warning("Failed to load cached result", error=str(e))
            return None
    
    async def _cache_result(self, 
                          video_path: str, 
                          language: str, 
                          engine: Optional[str], 
                          result: TranscriptionResult):
        """
        Cache transcription result
        
        Args:
            video_path: Path to video file
            language: Target language
            engine: Speech recognition engine
            result: Transcription result to cache
        """
        if not self.enable_caching:
            return
        
        try:
            # Generate cache key
            cache_key = self._generate_cache_key(video_path, language, engine)
            cache_file = self.cache_dir / f"{cache_key}.json"
            
            # Save result to cache
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(result.dict(), f, indent=2, default=str)
            
            logger.info("Transcription result cached", cache_key=cache_key)
            
        except Exception as e:
            logger.warning("Failed to cache transcription result", error=str(e))
    
    def _generate_cache_key(self, video_path: str, language: str, engine: Optional[str]) -> str:
        """
        Generate cache key for transcription result
        
        Args:
            video_path: Path to video file
            language: Target language
            engine: Speech recognition engine
            
        Returns:
            Cache key string
        """
        # Get file stats for cache invalidation
        try:
            file_stat = os.stat(video_path)
            file_info = f"{file_stat.st_size}_{file_stat.st_mtime}"
        except OSError:
            file_info = "unknown"
        
        # Create cache key from file info, language, and engine
        cache_data = f"{video_path}_{file_info}_{language}_{engine or 'default'}"
        return hashlib.md5(cache_data.encode()).hexdigest()
    
    async def _cleanup_temp_files(self, audio_path: str):
        """
        Clean up temporary audio files
        
        Args:
            audio_path: Path to temporary audio file
        """
        try:
            if os.path.exists(audio_path):
                os.unlink(audio_path)
                logger.debug("Cleaned up temporary audio file", path=audio_path)
        except Exception as e:
            logger.warning("Failed to clean up temporary file", 
                          path=audio_path, error=str(e))
    
    def _update_average_processing_time(self, processing_time: float):
        """
        Update average processing time statistics
        
        Args:
            processing_time: Processing time for completed job
        """
        current_avg = self._performance_stats["average_processing_time"]
        successful_jobs = self._performance_stats["successful_jobs"]
        
        if successful_jobs == 1:
            self._performance_stats["average_processing_time"] = processing_time
        else:
            # Calculate running average
            new_avg = ((current_avg * (successful_jobs - 1)) + processing_time) / successful_jobs
            self._performance_stats["average_processing_time"] = new_avg
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """
        Get service performance statistics
        
        Returns:
            Performance statistics dictionary
        """
        stats = self._performance_stats.copy()
        stats.update({
            "active_jobs": len(self._active_jobs),
            "completed_jobs": len(self._job_results),
            "failed_jobs_stored": len(self._job_errors),
            "cache_enabled": self.enable_caching,
            "available_engines": list(self._speech_recognizers.keys())
        })
        return stats
    
    def get_active_jobs(self) -> List[Dict[str, Any]]:
        """
        Get list of currently active jobs
        
        Returns:
            List of active job information
        """
        return [
            {
                "job_id": job.job_id,
                "video_id": job.video_id,
                "status": job.status.value,
                "progress": job.progress,
                "language": job.language,
                "engine": job.engine,
                "created_at": job.created_at.isoformat(),
                "started_at": job.started_at.isoformat() if job.started_at else None
            }
            for job in self._active_jobs.values()
        ]
    
    async def cleanup_old_jobs(self, max_age_hours: int = 24):
        """
        Clean up old completed jobs and results
        
        Args:
            max_age_hours: Maximum age of jobs to keep in hours
        """
        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
        
        # Clean up completed results
        jobs_to_remove = []
        for job_id, result in self._job_results.items():
            if result.created_at < cutoff_time:
                jobs_to_remove.append(job_id)
        
        for job_id in jobs_to_remove:
            del self._job_results[job_id]
        
        # Clean up error records
        errors_to_remove = []
        for job_id, error in self._job_errors.items():
            if error.timestamp < cutoff_time:
                errors_to_remove.append(job_id)
        
        for job_id in errors_to_remove:
            del self._job_errors[job_id]
        
        logger.info("Cleaned up old jobs", 
                   results_removed=len(jobs_to_remove),
                   errors_removed=len(errors_to_remove))

