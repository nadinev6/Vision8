#!/usr/bin/env python3
"""
Simple validation test for audio transcription models
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from datetime import datetime
from services.audio.models import (
    WordTimestamp,
    TranscriptSegment,
    TranscriptionResult,
    TranscriptionJob,
    TranscriptionError,
    AudioMetadata,
    TranscriptionStatus,
    ConfidenceLevel
)

def test_word_timestamp():
    """Test WordTimestamp model"""
    print("Testing WordTimestamp...")
    
    # Valid case
    word = WordTimestamp(
        word="hello",
        start_time_ms=1000,
        end_time_ms=1500,
        confidence=0.95
    )
    print(f"✓ Created WordTimestamp: {word.word} ({word.start_time_ms}-{word.end_time_ms}ms)")
    
    # Test JSON serialization
    json_data = word.dict()
    print(f"✓ JSON serialization: {json_data}")
    
    # Test validation error
    try:
        invalid_word = WordTimestamp(
            word="hello",
            start_time_ms=1500,
            end_time_ms=1000,  # Invalid: end before start
            confidence=0.95
        )
        print("✗ Should have failed validation")
        return False
    except Exception as e:
        print(f"✓ Validation error caught: {type(e).__name__}")
    
    return True

def test_transcript_segment():
    """Test TranscriptSegment model"""
    print("\nTesting TranscriptSegment...")
    
    words = [
        WordTimestamp(word="hello", start_time_ms=1000, end_time_ms=1300, confidence=0.95),
        WordTimestamp(word="world", start_time_ms=1400, end_time_ms=1800, confidence=0.90)
    ]
    
    segment = TranscriptSegment(
        text="hello world",
        start_time_ms=1000,
        end_time_ms=1800,
        confidence=0.92,
        speaker_id="speaker_1",
        words=words
    )
    
    print(f"✓ Created TranscriptSegment: '{segment.text}' ({segment.duration_ms}ms)")
    print(f"✓ Word count: {segment.word_count}")
    print(f"✓ JSON serialization: {len(segment.dict())} fields")
    
    return True

def test_transcription_result():
    """Test TranscriptionResult model"""
    print("\nTesting TranscriptionResult...")
    
    segments = [
        TranscriptSegment(
            text="Hello world",
            start_time_ms=1000,
            end_time_ms=2000,
            confidence=0.95
        ),
        TranscriptSegment(
            text="How are you?",
            start_time_ms=2500,
            end_time_ms=3500,
            confidence=0.90
        )
    ]
    
    result = TranscriptionResult(
        job_id="test-job-123",
        video_id="video-456",
        language="en-US",
        confidence=0.92,
        segments=segments,
        processing_time=15.5,
        status=TranscriptionStatus.COMPLETED,
        total_duration_ms=180000,
        word_count=50,
        confidence_level=ConfidenceLevel.EXCELLENT,
        engine_used="google"
    )
    
    print(f"✓ Created TranscriptionResult: {result.job_id}")
    print(f"✓ Total segments: {result.total_segments}")
    print(f"✓ Full transcript: '{result.full_transcript}'")
    print(f"✓ Average confidence: {result.average_confidence}")
    
    # Test filtering
    high_conf_segments = result.get_segments_by_confidence(0.93)
    print(f"✓ High confidence segments: {len(high_conf_segments)}")
    
    return True

def test_transcription_job():
    """Test TranscriptionJob model"""
    print("\nTesting TranscriptionJob...")
    
    job = TranscriptionJob(
        job_id="job-123",
        video_id="video-456",
        status=TranscriptionStatus.PROCESSING,
        progress=45.0,
        language="en-US",
        engine="google"
    )
    
    print(f"✓ Created TranscriptionJob: {job.job_id}")
    print(f"✓ Status: {job.status}")
    print(f"✓ Is completed: {job.is_completed}")
    
    return True

def test_audio_metadata():
    """Test AudioMetadata model"""
    print("\nTesting AudioMetadata...")
    
    metadata = AudioMetadata(
        duration_ms=180000,
        sample_rate=16000,
        channels=1,
        bit_depth=16,
        format="wav",
        file_size_bytes=5760000
    )
    
    print(f"✓ Created AudioMetadata: {metadata.format}")
    print(f"✓ Duration: {metadata.duration_seconds}s")
    print(f"✓ File size: {metadata.file_size_mb}MB")
    
    return True

def test_transcription_error():
    """Test TranscriptionError model"""
    print("\nTesting TranscriptionError...")
    
    error = TranscriptionError(
        error_code="AUDIO_EXTRACTION_FAILED",
        error_message="Failed to extract audio from video file",
        error_details={"file_format": "mp4", "file_size_mb": 150.5},
        retry_after=60,
        job_id="job-123"
    )
    
    print(f"✓ Created TranscriptionError: {error.error_code}")
    print(f"✓ Message: {error.error_message}")
    print(f"✓ Retry after: {error.retry_after}s")
    
    return True

def main():
    """Run all tests"""
    print("=== Audio Transcription Models Validation ===")
    
    tests = [
        test_word_timestamp,
        test_transcript_segment,
        test_transcription_result,
        test_transcription_job,
        test_audio_metadata,
        test_transcription_error
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"✗ Test {test.__name__} failed: {e}")
            failed += 1
    
    print(f"\n=== Results ===")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Total: {passed + failed}")
    
    if failed == 0:
        print("✓ All tests passed!")
        return True
    else:
        print("✗ Some tests failed!")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)