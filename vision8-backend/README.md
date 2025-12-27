# README.md Content

# Vision8 Backend

## Overview
The Vision8 Backend is a robust application designed for intelligent video processing, AI-powered scene generation, and metadata extraction. It integrates with Elasticsearch for efficient search capabilities and provides a RESTful API for interaction with advanced video manipulation features.

## Features

### Core Video Processing
- Video ingestion and metadata generation
- AI-powered video analysis and deconstruction
- Advanced scene detection and extraction
- FFmpeg-based video manipulation

### AI-Powered Video Generation
- **Scene Regeneration**: Replace specific video segments with AI-generated content using Wan 2.2 API
- **Multi-Stage Generation Pipeline**:
  - Video analysis and metadata extraction
  - Scene boundary detection and extraction
  - AI-powered scene generation with custom prompts
  - Seamless video stitching and concatenation
- **Quality Presets**: Support for draft, standard, and high-quality output
- **Progress Tracking**: Real-time generation progress with detailed stage information
- **Audio Integration**: Optional audio preservation during scene generation

### Search & Retrieval
- Elasticsearch integration for efficient video search
- Basic Retrieval-Augmented Generation (RAG) implementation
- Scene-level metadata indexing and querying

### API & Services
- RESTful API for video processing and search
- Conversation handling for interactive video queries
- Cache service for optimized performance

## Architecture

### Video Generation Pipeline
The video generation system follows a multi-stage approach:

1. **Analysis Stage**: Examines source video metadata, identifies scene boundaries, and analyzes temporal context
2. **Extraction Stage**: Extracts the target scene segment using FFmpeg with frame-accurate precision
3. **Generation Stage**: Utilizes Wan 2.2 API to generate new content based on user prompts and source material
4. **Stitching Stage**: Seamlessly combines pre-segment, generated scene, and post-segment into final output

### Key Components
- **VideoGenerationManager**: Orchestrates the entire generation workflow
- **FFmpegWrapper**: Handles video manipulation, extraction, and concatenation
- **Wan 2.2 API Integration**: Provides AI-powered scene generation capabilities
- **Metadata Generator**: Extracts and structures video metadata using Gemini API
- **Elasticsearch Service**: Enables efficient video search and retrieval

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/vision8-backend.git
   ```
2. Navigate to the project directory:
   ```bash
   cd vision8-backend
   ```
3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration
- Copy `.env.example` to `.env` and update the environment variables as needed.
- Required environment variables:
  - `GEMINI_API_KEY`: For AI-powered metadata generation
  - `WAN_API_KEY`: For video generation capabilities using Wan 2.2 (if applicable)
  - `ELASTICSEARCH_URL`: Elasticsearch instance URL
  - Additional configuration in `src/core/config.py`

## Running the Application
To start the application, run:
```bash
python src/main.py
```

## Testing
To run the tests, use:
```bash
pytest tests/
```

## License
This project is licensed under the MIT License. See the LICENSE file for details.
