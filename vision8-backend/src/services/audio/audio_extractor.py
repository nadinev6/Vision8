"""
Audio Extraction Service

This module handles extracting audio from video files using FFmpeg.
"""

import os
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, List
import ffmpeg
import structlog
from .config import AudioConfig

logger = structlog.get_logger(__name__)

class AudioInfo:
    """Audio metadata information"""
    def __init__(self, duration: float, sample_rate: int, channels: int, format: str, 
                 bit_rate: Optional[int] = None, bit_depth: Optional[int] = None):
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels
        self.format = format
        self.bit_rate = bit_rate
        self.bit_depth = bit_depth
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert AudioInfo to dictionary"""
        return {
            'duration': self.duration,
            'sample_rate': self.sample_rate,
            'channels': self.channels,
            'format': self.format,
            'bit_rate': self.bit_rate,
            'bit_depth': self.bit_depth
        }

class AudioExtractor:
    """Service for extracting audio from video files"""
    
    # Supported video formats
    SUPPORTED_VIDEO_FORMATS = {'.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv'}
    
    # Audio codec mappings for different output formats
    AUDIO_CODECS = {
        'wav': 'pcm_s16le',
        'mp3': 'libmp3lame',
        'aac': 'aac',
        'flac': 'flac',
        'ogg': 'libvorbis'
    }
    
    def __init__(self):
        self.config = AudioConfig
        # Ensure directories exist
        self.config.ensure_directories()
    
    async def extract_audio(self, video_path: str, output_format: str = "wav") -> str:
        """
        Extract audio from video file with format conversion
        
        Args:
            video_path: Path to the input video file
            output_format: Output audio format (wav, mp3, aac, flac, ogg)
            
        Returns:
            Path to the extracted audio file
            
        Raises:
            FileNotFoundError: If video file doesn't exist
            ValueError: If unsupported video format or output format
            Exception: If audio extraction fails
        """
        try:
            video_path = Path(video_path)
            if not video_path.exists():
                raise FileNotFoundError(f"Video file not found: {video_path}")
            
            # Validate video format
            if video_path.suffix.lower() not in self.SUPPORTED_VIDEO_FORMATS:
                raise ValueError(f"Unsupported video format: {video_path.suffix}")
            
            # Validate output format
            if output_format not in self.AUDIO_CODECS:
                raise ValueError(f"Unsupported output format: {output_format}")
            
            # Generate output filename
            output_filename = f"{video_path.stem}_audio.{output_format}"
            output_path = self.config.EXTRACTED_AUDIO_DIR / output_filename
            
            logger.info("Starting audio extraction", 
                       video_path=str(video_path), 
                       output_path=str(output_path),
                       output_format=output_format)
            
            # Check if audio stream exists in video
            audio_info = await self.get_audio_info(str(video_path))
            if not audio_info:
                raise Exception("No audio stream found in video file")
            
            # Use ffmpeg to extract and convert audio
            stream = ffmpeg.input(str(video_path))
            audio = stream.audio
            
            # Configure output settings based on format
            output_args = {
                'acodec': self.AUDIO_CODECS[output_format],
                'ar': self.config.AUDIO_SAMPLE_RATE,
                'ac': self.config.AUDIO_CHANNELS
            }
            
            # Add format-specific settings
            if output_format == 'wav':
                output_args['sample_fmt'] = 's16'  # 16-bit samples
            elif output_format == 'mp3':
                output_args['b:a'] = '128k'  # 128 kbps bitrate
            elif output_format == 'aac':
                output_args['b:a'] = '128k'
            
            out = ffmpeg.output(audio, str(output_path), **output_args)
            
            # Run the extraction with timeout
            process = await asyncio.create_subprocess_exec(
                *ffmpeg.compile(out, overwrite_output=True),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), 
                    timeout=self.config.AUDIO_EXTRACTION_TIMEOUT
                )
            except asyncio.TimeoutError:
                process.kill()
                raise Exception("Audio extraction timed out")
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown FFmpeg error"
                raise Exception(f"FFmpeg extraction failed: {error_msg}")
            
            if not output_path.exists():
                raise Exception("Audio extraction failed - output file not created")
            
            # Verify extracted audio file
            extracted_info = await self.get_audio_info(str(output_path))
            logger.info("Audio extraction completed", 
                       output_path=str(output_path),
                       extracted_info=extracted_info.to_dict())
            
            return str(output_path)
            
        except Exception as e:
            logger.error("Audio extraction failed", error=str(e), video_path=str(video_path))
            raise
    
    async def get_audio_info(self, video_path: str) -> Optional[AudioInfo]:
        """
        Get comprehensive audio metadata from video file
        
        Args:
            video_path: Path to the video file
            
        Returns:
            AudioInfo object with metadata, or None if no audio stream
        """
        try:
            probe = ffmpeg.probe(video_path)
            audio_stream = next((stream for stream in probe['streams'] 
                               if stream['codec_type'] == 'audio'), None)
            
            if not audio_stream:
                logger.warning("No audio stream found in video file", video_path=video_path)
                return None
            
            # Extract basic metadata
            duration = float(probe['format'].get('duration', 0))
            sample_rate = int(audio_stream.get('sample_rate', 0))
            channels = int(audio_stream.get('channels', 0))
            format_name = audio_stream.get('codec_name', 'unknown')
            
            # Extract additional metadata
            bit_rate = None
            if 'bit_rate' in audio_stream:
                bit_rate = int(audio_stream['bit_rate'])
            
            # Determine bit depth from sample format
            bit_depth = None
            sample_fmt = audio_stream.get('sample_fmt')
            if sample_fmt:
                if 's16' in sample_fmt:
                    bit_depth = 16
                elif 's24' in sample_fmt:
                    bit_depth = 24
                elif 's32' in sample_fmt or 'flt' in sample_fmt:
                    bit_depth = 32
            
            audio_info = AudioInfo(
                duration=duration,
                sample_rate=sample_rate,
                channels=channels,
                format=format_name,
                bit_rate=bit_rate,
                bit_depth=bit_depth
            )
            
            logger.info("Audio metadata extracted", 
                       video_path=video_path,
                       audio_info=audio_info.to_dict())
            
            return audio_info
            
        except Exception as e:
            logger.error("Failed to get audio info", error=str(e), video_path=video_path)
            raise
    
    async def validate_video_file(self, video_path: str) -> bool:
        """
        Validate if video file exists and has audio stream
        
        Args:
            video_path: Path to the video file
            
        Returns:
            True if valid video with audio, False otherwise
        """
        try:
            video_path = Path(video_path)
            
            # Check file exists
            if not video_path.exists():
                return False
            
            # Check file extension
            if video_path.suffix.lower() not in self.SUPPORTED_VIDEO_FORMATS:
                return False
            
            # Check for audio stream
            audio_info = await self.get_audio_info(str(video_path))
            return audio_info is not None
            
        except Exception:
            return False
    
    def get_supported_formats(self) -> List[str]:
        """
        Get list of supported video formats
        
        Returns:
            List of supported video file extensions
        """
        return list(self.SUPPORTED_VIDEO_FORMATS)
    
    async def validate_audio_quality(self, audio_path: str) -> Dict[str, Any]:
        """
        Validate audio quality metrics for speech recognition
        
        Args:
            audio_path: Path to the audio file
            
        Returns:
            Dictionary with quality metrics and validation results
        """
        try:
            audio_info = await self.get_audio_info(audio_path)
            if not audio_info:
                return {
                    'valid': False,
                    'issues': ['No audio stream found'],
                    'metrics': {}
                }
            
            issues = []
            metrics = audio_info.to_dict()
            
            # Validate sample rate (optimal for speech recognition: 16kHz or higher)
            if audio_info.sample_rate < 8000:
                issues.append(f"Sample rate too low: {audio_info.sample_rate}Hz (minimum: 8kHz)")
            elif audio_info.sample_rate < 16000:
                issues.append(f"Sample rate suboptimal: {audio_info.sample_rate}Hz (recommended: 16kHz+)")
            
            # Validate bit depth (minimum 16-bit for good quality)
            if audio_info.bit_depth and audio_info.bit_depth < 16:
                issues.append(f"Bit depth too low: {audio_info.bit_depth}-bit (minimum: 16-bit)")
            
            # Validate channels (mono preferred for speech recognition)
            if audio_info.channels > 2:
                issues.append(f"Too many channels: {audio_info.channels} (recommended: 1-2)")
            
            # Validate duration (not too short or too long)
            if audio_info.duration < 1.0:
                issues.append(f"Audio too short: {audio_info.duration:.1f}s (minimum: 1s)")
            elif audio_info.duration > 900:  # 15 minutes
                issues.append(f"Audio too long: {audio_info.duration:.1f}s (maximum: 900s)")
            
            # Check bit rate if available
            if audio_info.bit_rate:
                if audio_info.bit_rate < 32000:  # 32 kbps minimum
                    issues.append(f"Bit rate too low: {audio_info.bit_rate}bps (minimum: 32kbps)")
                metrics['bit_rate_kbps'] = audio_info.bit_rate // 1000
            
            validation_result = {
                'valid': len(issues) == 0,
                'issues': issues,
                'metrics': metrics,
                'recommendations': self._get_quality_recommendations(audio_info)
            }
            
            logger.info("Audio quality validation completed", 
                       audio_path=audio_path,
                       validation_result=validation_result)
            
            return validation_result
            
        except Exception as e:
            logger.error("Audio quality validation failed", error=str(e), audio_path=audio_path)
            raise
    
    def _get_quality_recommendations(self, audio_info: AudioInfo) -> List[str]:
        """Get recommendations for improving audio quality"""
        recommendations = []
        
        if audio_info.sample_rate < 16000:
            recommendations.append("Resample to 16kHz for optimal speech recognition")
        
        if audio_info.channels > 1:
            recommendations.append("Convert to mono for better speech recognition performance")
        
        if audio_info.bit_depth and audio_info.bit_depth < 16:
            recommendations.append("Use 16-bit or higher bit depth for better quality")
        
        return recommendations
    
    async def preprocess_audio(self, input_path: str, apply_normalization: bool = True, 
                             apply_noise_reduction: bool = True) -> str:
        """
        Preprocess audio for better speech recognition
        
        Args:
            input_path: Path to the input audio file
            apply_normalization: Whether to apply volume normalization
            apply_noise_reduction: Whether to apply noise reduction
            
        Returns:
            Path to the preprocessed audio file
        """
        try:
            input_path = Path(input_path)
            if not input_path.exists():
                raise FileNotFoundError(f"Audio file not found: {input_path}")
            
            # Generate output filename
            output_filename = f"{input_path.stem}_preprocessed.wav"
            output_path = self.config.EXTRACTED_AUDIO_DIR / output_filename
            
            logger.info("Starting audio preprocessing", 
                       input_path=str(input_path),
                       output_path=str(output_path),
                       normalization=apply_normalization,
                       noise_reduction=apply_noise_reduction)
            
            # Start with input stream
            stream = ffmpeg.input(str(input_path))
            
            # Build filter chain
            filters = []
            
            # Apply noise reduction (highpass filter to remove low-frequency noise)
            if apply_noise_reduction:
                filters.append('highpass=f=80')  # Remove frequencies below 80Hz
                filters.append('lowpass=f=8000')  # Remove frequencies above 8kHz (speech range)
            
            # Apply normalization
            if apply_normalization:
                filters.append('loudnorm=I=-16:TP=-1.5:LRA=11')  # EBU R128 loudness normalization
            
            # Apply filters if any
            if filters:
                audio = stream.audio.filter('af', ','.join(filters))
            else:
                audio = stream.audio
            
            # Configure output settings for optimal speech recognition
            output_args = {
                'acodec': 'pcm_s16le',  # 16-bit PCM
                'ar': self.config.AUDIO_SAMPLE_RATE,  # Target sample rate
                'ac': self.config.AUDIO_CHANNELS,  # Mono
                'sample_fmt': 's16'  # 16-bit samples
            }
            
            out = ffmpeg.output(audio, str(output_path), **output_args)
            
            # Run preprocessing
            process = await asyncio.create_subprocess_exec(
                *ffmpeg.compile(out, overwrite_output=True),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self.config.AUDIO_EXTRACTION_TIMEOUT
                )
            except asyncio.TimeoutError:
                process.kill()
                raise Exception("Audio preprocessing timed out")
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown FFmpeg error"
                raise Exception(f"Audio preprocessing failed: {error_msg}")
            
            if not output_path.exists():
                raise Exception("Audio preprocessing failed - output file not created")
            
            # Validate preprocessed audio
            validation_result = await self.validate_audio_quality(str(output_path))
            
            logger.info("Audio preprocessing completed",
                       output_path=str(output_path),
                       validation_result=validation_result)
            
            return str(output_path)
            
        except Exception as e:
            logger.error("Audio preprocessing failed", error=str(e), input_path=str(input_path))
            raise
    
    async def extract_and_preprocess_audio(self, video_path: str, 
                                         apply_preprocessing: bool = True) -> str:
        """
        Complete pipeline: extract audio from video and preprocess for speech recognition
        
        Args:
            video_path: Path to the input video file
            apply_preprocessing: Whether to apply audio preprocessing
            
        Returns:
            Path to the final processed audio file
        """
        try:
            # First extract audio
            extracted_audio_path = await self.extract_audio(video_path, output_format="wav")
            
            # Apply preprocessing if requested
            if apply_preprocessing:
                final_audio_path = await self.preprocess_audio(
                    extracted_audio_path,
                    apply_normalization=True,
                    apply_noise_reduction=True
                )
                
                # Clean up intermediate file
                try:
                    Path(extracted_audio_path).unlink()
                except Exception as e:
                    logger.warning("Failed to clean up intermediate file", 
                                 file=extracted_audio_path, error=str(e))
                
                return final_audio_path
            else:
                return extracted_audio_path
                
        except Exception as e:
            logger.error("Extract and preprocess pipeline failed", 
                        error=str(e), video_path=video_path)
            raise