# Video Generation with Veo-3 Setup Guide

## Overview

Vision8 now includes AI-powered video generation capabilities using Veo-3 Fast and other models. Users can select scenes from analyzed videos and generate replacement content using natural language prompts.

## Architecture

### Backend Components

1. **VideoGenerationService** (`vision8-backend/src/services/video_generation_service.py`)
   - Handles Veo-3 API integration
   - Manages generation jobs and status tracking
   - Supports multiple models (Veo-3, Sora-2)
   - Quality presets and duration controls

2. **Video Generation API Routes** (`vision8-backend/src/api/video_generation_routes.py`)
   - RESTful endpoints for generation requests
   - Status polling and job management
   - File upload and video stitching
   - Model and preset information

### Frontend Components

1. **Video Generation Service** (`lib/video-generation.ts`)
   - Frontend API client for generation requests
   - Status polling and progress tracking
   - Integration with existing RAG system
   - Utility functions for common operations

2. **Generation Callbacks** (integrated in `lib/gemini.ts`)
   - Model selection (Veo-3 vs Sora-2)
   - Frame range specification
   - Video naming and settings

## API Endpoints

### Generation Endpoints

```
POST /api/v1/video/generation/generate-scene
GET  /api/v1/video/generation/status/{job_id}
GET  /api/v1/video/generation/list/{video_id}
DELETE /api/v1/video/generation/delete/{job_id}
GET  /api/v1/video/generation/models
GET  /api/v1/video/generation/quality-presets
POST /api/v1/video/generation/stitch-video
GET  /api/v1/video/generation/health
```

### Example Usage

#### 1. Generate Scene Replacement

```bash
curl -X POST "http://localhost:8000/api/v1/video/generation/generate-scene" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "video_123",
    "scene_id": "scene_001",
    "prompt": "A futuristic cityscape at sunset with flying cars",
    "model": "veo3",
    "quality": "standard",
    "duration_seconds": 5.0
  }'
```

Response:
```json
{
  "job_id": "video_123_scene_001_veo3_1234567890",
  "status": "processing",
  "message": "Scene generation started with veo3",
  "estimated_completion_seconds": 60
}
```

#### 2. Check Generation Status

```bash
curl "http://localhost:8000/api/v1/video/generation/status/video_123_scene_001_veo3_1234567890"
```

Response:
```json
{
  "job_id": "video_123_scene_001_veo3_1234567890",
  "status": "completed",
  "progress": 100,
  "generation_url": "https://storage.googleapis.com/generated/video_123_scene_001.mp4",
  "thumbnail_url": "https://storage.googleapis.com/thumbnails/video_123_scene_001.jpg",
  "duration": 5.0,
  "file_size": 2048576,
  "created_at": 1704067200,
  "completed_at": 1704067260
}
```

## Configuration

### Environment Variables

Add to `vision8-backend/.env`:

```env
# Video Generation Configuration
VEO_API_KEY=your-veo-api-key-here
VEO_API_URL=https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/veo-3-fast:generateVideo
VEO_LOCATION=us-central1
SORA_API_KEY=your-sora-api-key-here
SORA_API_URL=https://api.openai.com/v1/video/generations

# Google Cloud Project (required for Veo-3)
GOOGLE_CLOUD_PROJECT=your-project-id
```

Add to frontend `.env`:

```env
# Backend URL for video generation
VITE_BACKEND_URL=http://localhost:8000
```

### Google Cloud Setup for Veo-3

1. **Enable Vertex AI API**
   ```bash
   gcloud services enable aiplatform.googleapis.com
   ```

2. **Set up authentication**
   ```bash
   gcloud auth application-default login
   # OR set service account key
   export GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
   ```

3. **Get API access to Veo-3**
   - Request access through Google Cloud Console
   - Veo-3 is currently in limited preview

## Frontend Integration

### Using the Generation Service

```typescript
import { videoGenerationService, generateSceneReplacement } from './lib/video-generation';

// Generate a scene replacement
const response = await generateSceneReplacement(
  'video_123',
  'scene_001', 
  'A peaceful forest with morning sunlight filtering through trees',
  {
    model: 'veo3',
    quality: 'standard',
    duration: 8.0
  }
);

// Poll for completion
const result = await videoGenerationService.waitForCompletion(
  response.jobId,
  (status) => {
    console.log(`Progress: ${status.progress}%`);
    updateProgressBar(status.progress);
  }
);

console.log('Generated video URL:', result.generationUrl);
```

### Integration with RAG System

The generation controls are already integrated into the conversational RAG system in `lib/gemini.ts`. Users can:

- **Switch models**: "Switch to Veo 3" or "Use Sora 2"
- **Set frame range**: "Generate frames 100 to 200"
- **Change video name**: "Name this video 'Sunset Scene'"

Example conversation:
```
User: "Switch to Veo 3 and generate a replacement for the first scene"
Assistant: "✅ Set generation model to Veo 3. I can help you generate a replacement for the first scene. What would you like the new scene to show?"

User: "A bustling marketplace in ancient Rome"
Assistant: [Initiates generation with the specified prompt]
```

## Quality Presets

| Preset | Resolution | FPS | Max Duration | Use Case |
|--------|------------|-----|--------------|----------|
| draft | 480p | 24 | 30s | Quick previews, testing |
| standard | 720p | 30 | 60s | Regular content, social media |
| high | 1080p | 30 | 120s | Professional content, final output |

## Model Comparison

| Feature | Veo-3 Fast | Sora-2 |
|---------|------------|--------|
| Speed | ~30-60 seconds | ~60-120 seconds |
| Quality | High | Very High |
| Max Duration | 30 seconds | 60 seconds |
| Style Control | Good | Excellent |
| Cost | Moderate | Higher |
| Availability | Limited Preview | API Access |

## Workflow

### Complete Scene Generation Workflow

1. **Video Analysis**
   - User uploads video
   - System analyzes and identifies scenes
   - Scenes are indexed in Elasticsearch

2. **Scene Selection**
   - User browses analyzed scenes
   - Selects scene for replacement
   - Views scene details and keyframes

3. **Generation Request**
   - User provides generation prompt
   - Selects model (Veo-3 or Sora-2)
   - Chooses quality preset
   - Sets duration and style options

4. **Processing**
   - Backend initiates generation job
   - Status updates provided via polling
   - Progress tracking and ETA

5. **Result Delivery**
   - Generated video available for download
   - Thumbnail preview generated
   - Option to stitch with original video

6. **Video Stitching** (Optional)
   - Replace original scene with generated content
   - Seamless integration using FFmpeg
   - Final video with new scene

## Error Handling

### Common Errors

1. **Invalid API Key**
   ```json
   {
     "error": "Invalid Veo-3 API key",
     "status_code": 401
   }
   ```

2. **Quota Exceeded**
   ```json
   {
     "error": "API quota exceeded. Please try again later.",
     "status_code": 429
   }
   ```

3. **Generation Failed**
   ```json
   {
     "job_id": "job_123",
     "status": "failed",
     "error_message": "Content policy violation: prompt contains restricted content"
   }
   ```

### Retry Logic

The service includes automatic retry logic:
- 3 retry attempts with exponential backoff
- Graceful degradation to mock responses during development
- Detailed error logging and user feedback

## Development and Testing

### Mock Mode

When API keys are not configured, the service runs in mock mode:
- Returns simulated responses
- Allows frontend development without API access
- Includes realistic timing and status updates

### Testing Commands

```bash
# Test generation endpoint
curl -X POST "http://localhost:8000/api/v1/video/generation/generate-scene" \
  -H "Content-Type: application/json" \
  -d '{"video_id":"test","scene_id":"scene1","prompt":"test scene"}'

# Check service health
curl "http://localhost:8000/api/v1/video/generation/health"

# Get supported models
curl "http://localhost:8000/api/v1/video/generation/models"
```

### Browser Console Testing

```javascript
// Test generation service
const result = await window.videoGeneration.generateScene(
  'test_video',
  'scene_001',
  'A beautiful sunset over mountains'
);

// Poll status
const status = await window.videoGeneration.pollStatus(result.jobId);
console.log('Final result:', status);
```

## Security Considerations

1. **API Key Protection**
   - Store API keys securely in environment variables
   - Never expose keys in frontend code
   - Use service accounts for production

2. **Content Filtering**
   - Implement prompt validation
   - Check for policy violations
   - Monitor generated content

3. **Rate Limiting**
   - Implement per-user limits
   - Queue management for high load
   - Cost monitoring and alerts

## Deployment

### Backend Deployment

1. **Install dependencies**
   ```bash
   cd vision8-backend
   pip install -r requirements.txt
   ```

2. **Set environment variables**
   ```bash
   export VEO_API_KEY=your-key
   export GOOGLE_CLOUD_PROJECT=your-project
   ```

3. **Start server**
   ```bash
   python src/main.py
   ```

### Frontend Integration

The frontend automatically detects the backend URL and integrates generation controls into the existing RAG interface. No additional setup required beyond environment configuration.

## Monitoring and Analytics

### Key Metrics

- Generation requests per hour
- Success/failure rates by model
- Average generation time
- User engagement with generated content
- API costs and usage patterns

### Logging

All generation activities are logged with structured logging:
- Request details and parameters
- Processing time and status updates
- Error conditions and retry attempts
- User interaction patterns

This comprehensive setup provides a complete video generation pipeline integrated with your existing Vision8 infrastructure.