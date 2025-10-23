import { Scene, TranscriptItem, TrackedObject } from '../components/AnalysisPanel';
import { formatTime } from "./utils";
import { processVideoAnalysis, hybridSearch } from './elasticsearch';
import { checkMigrationNeeded, performMigration } from './migrate-to-elasticsearch';
import { backendService, isBackendAvailable } from './backend-integration';

console.log("🚀 Gemini.ts module loaded!");

// Force the API key for now to test
const API_KEY = "AIzaSyBFYFaDZHneXJ0PMzeQRUvN-98A3FJ-3SU";
console.log("Using hardcoded API key for testing:", API_KEY.substring(0, 10) + "...");

import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

// Initialize GoogleGenAI with error handling
let ai: GoogleGenAI | null = null;
try {
  console.log("Attempting to initialize GoogleGenAI...");
  console.log("API Key value:", API_KEY);
  console.log("API Key type:", typeof API_KEY);

  // Try the correct constructor format for @google/genai
  ai = new GoogleGenAI({ apiKey: API_KEY });
  console.log("✅ GoogleGenAI initialized successfully");

  // Test the API key with a simple call
  testApiKey();
} catch (error) {
  console.error("❌ Failed to initialize GoogleGenAI:", error);
  ai = null;
}

// Simple test function to verify API key works
async function testApiKey() {
  if (!ai) return;

  try {
    console.log("🧪 Testing API key with simple call...");
    const testResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: "Say hello" }] }
    });
    console.log("✅ API key test successful:", testResponse.text);
  } catch (error) {
    console.error("❌ API key test failed:", error);
  }
}

const analysisSchema = {
  type: Type.OBJECT,
  properties: {
    scenes: {
      type: Type.ARRAY,
      description: "A list of distinct scenes identified in the video.",
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.NUMBER, description: "The timestamp of the scene's start in seconds." },
          description: { type: Type.STRING, description: "A brief, one-sentence description of the scene." },
        },
        required: ["timestamp", "description"],
      },
    },
    transcripts: {
      type: Type.ARRAY,
      description: "A chronological transcript of clearly visible spoken dialogue. Only include if you can see someone's mouth moving, lips syncing with speech, or visible text/captions. Do not guess or infer dialogue.",
      items: {
        type: Type.OBJECT,
        properties: {
          startTime: { type: Type.NUMBER, description: "The start time of the dialogue segment in seconds." },
          endTime: { type: Type.NUMBER, description: "The end time of the dialogue segment in seconds." },
          text: { type: Type.STRING, description: "The transcribed text of the speech." },
        },
        required: ["startTime", "endTime", "text"],
      },
    },
    objects: {
      type: Type.ARRAY,
      description: "A list of notable objects identified and tracked in the video.",
      items: {
        type: Type.OBJECT,
        properties: {
          timestamp: { type: Type.NUMBER, description: "The timestamp in seconds when the object is most prominent." },
          name: { type: Type.STRING, description: "The name of the tracked object." },
        },
        required: ["timestamp", "name"],
      },
    },
  },
  required: ["scenes", "transcripts", "objects"],
};


async function getVideoDuration(videoFile: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      resolve(video.duration);
    };

    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

async function getVideoFrames(videoFile: File, maxFrames: number): Promise<{ data: string, mimeType: string }[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames: { data: string, mimeType: string }[] = [];

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const duration = video.duration;

      // If duration is not available, reject
      if (!isFinite(duration)) {
        reject(new Error("Video duration is not available."));
        return;
      }

      // Smart interval calculation: minimum 2 seconds between frames for short videos
      const minInterval = 2; // minimum 2 seconds between frames
      const idealInterval = duration / (maxFrames + 1);
      const interval = Math.max(minInterval, idealInterval);
      const actualFrames = Math.min(maxFrames, Math.floor(duration / interval));

      for (let i = 1; i <= actualFrames; i++) {
        const time = i * interval;
        video.currentTime = time;
        try {
          await new Promise<void>((res, rej) => {
            const seekTimeout = setTimeout(() => rej(new Error('Seek operation timed out')), 2000);
            video.onseeked = () => {
              clearTimeout(seekTimeout);
              res();
            };
          });
          if (ctx) {
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            const base64Data = canvas.toDataURL('image/jpeg');
            frames.push({ data: base64Data, mimeType: 'image/jpeg' });
          }
        } catch (error) {
          console.error(`Error seeking to ${time}s:`, error);
          // Continue to next frame if one fails
        }
      }
      URL.revokeObjectURL(video.src);
      resolve(frames);
    };
    video.onerror = (e) => {
      reject(new Error("Failed to load video file."));
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

export async function analyzeVideo(videoFile: File, customVideoId?: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }> {
  console.log("🎬 Starting video analysis...");
  console.log("Video file:", videoFile.name, "Size:", videoFile.size);

  // Check if migration from IndexedDB to Elasticsearch is needed
  try {
    const needsMigration = await checkMigrationNeeded();
    if (needsMigration) {
      console.log('🔄 IndexedDB data detected, performing migration to Elasticsearch...');
      const migrationStats = await performMigration();
      console.log('📊 Migration completed:', migrationStats);
    }
  } catch (error) {
    console.warn('⚠️ Migration check failed, continuing with analysis:', error);
  }

  // Try backend analysis first
  try {
    console.log("🔄 Attempting backend video analysis...");
    console.log("Video file details:", {
      name: videoFile.name,
      size: videoFile.size,
      type: videoFile.type
    });

    const backendResult = await analyzeVideoWithBackend(videoFile, customVideoId);
    if (backendResult) {
      console.log("✅ Backend analysis successful:", backendResult);
      return backendResult;
    } else {
      console.warn("⚠️ Backend returned null result");
    }
  } catch (backendError) {
    console.error("❌ Backend analysis failed:", backendError);
    console.warn("⚠️ Falling back to client-side analysis");
  }

  // Fallback to client-side analysis
  console.log("🔄 Using client-side analysis as fallback...");
  return await analyzeVideoClientSide(videoFile, customVideoId);
}

/**
 * Analyze video using the backend API
 */
async function analyzeVideoWithBackend(videoFile: File, customVideoId?: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] } | null> {
  try {
    const formData = new FormData();
    formData.append('file', videoFile);
    if (customVideoId) {
      formData.append('video_id', customVideoId);
    }

    console.log("📤 Uploading video to backend for analysis...");
    const response = await fetch('http://localhost:8000/api/v1/video/analysis/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Backend analysis failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log("📊 Backend analysis result:", result);

    if (result.status === 'success') {
      // Convert backend format to frontend format
      return await convertBackendResultToFrontend(result.video_id);
    } else {
      throw new Error(`Backend analysis failed: ${result.error || 'Unknown error'}`);
    }

  } catch (error) {
    console.error("❌ Backend analysis error:", error);
    throw error;
  }
}

/**
 * Convert backend analysis result to frontend format by searching Elasticsearch
 */
async function convertBackendResultToFrontend(videoId: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }> {
  try {
    // Search for all scenes from this video
    const searchResults = await hybridSearch(`video_id:${videoId}`, videoId, 50);

    const scenes: Scene[] = [];
    const transcripts: TranscriptItem[] = [];
    const objects: TrackedObject[] = [];

    for (const result of searchResults) {
      const doc = result.document;

      // Add scene
      scenes.push({
        timestamp: doc.start_time_ms / 1000,
        description: doc.scene_summary || doc.full_description
      });

      // Add transcripts
      if (doc.transcript_phrases) {
        for (const phrase of doc.transcript_phrases) {
          transcripts.push({
            startTime: phrase.start_ms / 1000,
            endTime: phrase.end_ms / 1000,
            text: phrase.text
          });
        }
      }

      // Add objects
      if (doc.objects_tracked) {
        for (const obj of doc.objects_tracked) {
          objects.push({
            timestamp: doc.start_time_ms / 1000,
            name: obj.label
          });
        }
      }
    }

    console.log("✅ Converted backend result:", {
      scenes: scenes.length,
      transcripts: transcripts.length,
      objects: objects.length
    });

    return { scenes, transcripts, objects };

  } catch (error) {
    console.error("❌ Failed to convert backend result:", error);
    throw error;
  }
}

/**
 * Client-side video analysis (fallback)
 */
async function analyzeVideoClientSide(videoFile: File, customVideoId?: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }> {
  // Check if GoogleGenAI is properly initialized
  if (!ai) {
    console.error("❌ GoogleGenAI instance is null or undefined");
    console.error("Attempting to reinitialize...");

    try {
      ai = new GoogleGenAI({ apiKey: API_KEY });
      console.log("✅ Reinitialization successful");
    } catch (reinitError) {
      console.error("❌ Reinitialization failed:", reinitError);
      throw new Error(`GoogleGenAI initialization failed: ${reinitError instanceof Error ? reinitError.message : String(reinitError)}`);
    }
  }

  const FRAMES_TO_EXTRACT = 30; // Reasonable default - will be adjusted based on video duration
  const frames = await getVideoFrames(videoFile, FRAMES_TO_EXTRACT);

  if (frames.length === 0) {
    throw new Error("Could not extract any frames from the video.");
  }

  const imageParts = frames.map(frame => ({
    inlineData: {
      data: frame.data.split(',')[1],
      mimeType: frame.mimeType,
    },
  }));

  const prompt = `
        You are an expert video analysis AI. Analyze the following sequence of video frames and provide a detailed breakdown in the requested JSON format.
        The frames are sampled evenly from a video. Analyze carefully for:
        
        1. SCENES: Identify distinct visual scenes with clear start times based on visual changes, camera angles, or setting changes.
        
        2. TRANSCRIPTS: CRITICAL - Generate comprehensive transcripts by:
           - Looking for people speaking (open mouths, gestures, conversation poses)
           - Reading any visible subtitles, captions, or text overlays in the frames
           - Only transcribe if you can clearly see mouth movements, lip-sync, or visible speech indicators
           - Do NOT create or infer dialogue - only transcribe what you can visually confirm
           - If no clear speech is visible, return empty transcripts array
           - For visible speech, provide accurate startTime and endTime based on when you see the person speaking
        
        3. OBJECTS: Identify and track important objects, people, and items throughout the video.
        
        Provide accurate timestamps in seconds. For transcripts: Only include dialogue if you can clearly see someone speaking with visible mouth movements or text/captions in the video. If no clear speech indicators are visible, return an empty transcripts array.
    `;

  try {
    console.log("📡 Making API call to Gemini...");
    console.log("Model:", 'gemini-2.5-flash');
    console.log("Frames extracted:", frames.length);
    console.log("Image parts:", imageParts.length);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }, ...imageParts] },
      config: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    });

    console.log("✅ API call successful");
    console.log("Response:", response);

    const jsonText = response.text.trim();
    console.log("Response text:", jsonText);

    const result = JSON.parse(jsonText);
    console.log("Parsed result:", result);

    // Process and index to Elasticsearch
    try {
      const videoId = customVideoId || `video-${Date.now()}`;
      const videoUrl = videoFile.name;

      console.log('🔄 Processing analysis for Elasticsearch...');
      console.log('Analysis result:', {
        scenes: result.scenes?.length || 0,
        transcripts: result.transcripts?.length || 0,
        objects: result.objects?.length || 0
      });

      // Only index if we have scenes
      if (result.scenes && result.scenes.length > 0) {
        console.log('📊 Starting Elasticsearch processing with keyframe extraction...');
        await processVideoAnalysis(videoId, videoUrl, result.scenes, result.transcripts || [], result.objects || [], videoFile);
        console.log('✅ Elasticsearch processing completed');
      } else {
        console.log('⚠️ No scenes found, skipping Elasticsearch indexing');
      }
    } catch (elasticsearchError) {
      console.error('⚠️ Elasticsearch processing failed (continuing anyway):', elasticsearchError);
      console.error('Error details:', {
        name: elasticsearchError instanceof Error ? elasticsearchError.name : 'Unknown',
        message: elasticsearchError instanceof Error ? elasticsearchError.message : String(elasticsearchError),
        stack: elasticsearchError instanceof Error ? elasticsearchError.stack : 'No stack'
      });

      // Don't throw - we still want to return the analysis results even if indexing fails
    }

    return result;
  } catch (e) {
    console.error("❌ API call failed:", e);
    console.error("Error type:", typeof e);
    console.error("Error message:", e instanceof Error ? e.message : String(e));
    console.error("Error stack:", e instanceof Error ? e.stack : 'No stack trace');

    // Check for specific error types
    if (e instanceof Error) {
      if (e.message.includes('quota')) {
        throw new Error("API quota exceeded. Please check your Gemini API usage limits.");
      } else if (e.message.includes('key')) {
        throw new Error("Invalid API key. Please check your Gemini API key configuration.");
      } else if (e.message.includes('permission')) {
        throw new Error("Permission denied. Please check your API key permissions.");
      }
    }

    throw new Error(`Gemini API error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// --- RAG Pipeline with Function Calling ---

const searchVideoContentTool: any = {
  name: 'searchVideoContent',
  description: "Searches the video's analyzed content (scenes, transcripts, objects) to find information relevant to a user's query. Returns context that helps answer the user's question.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'A specific question or search term to look for in the video content. For example: "woman in a red dress", "when do they talk about the plan?", "find all sports cars".',
      },
    },
    required: ['query'],
  },
};

const videoSettingsControlTool: any = {
  name: 'controlVideoSettings',
  description: "Controls video playback settings like speed, trim range, sync mode, and frame mode based on user requests.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      setting: {
        type: Type.STRING,
        enum: ['playback_speed', 'trim_range', 'sync_mode', 'frame_mode'],
        description: 'The setting to change'
      },
      value: {
        description: 'The new value. For speed: number 0.1-3.0. For trim_range: {start: number, end: number}. For sync_mode: "video" or "none". For frame_mode: boolean.'
      },
      description: {
        type: Type.STRING,
        description: 'Human-readable description of the change'
      }
    },
    required: ['setting', 'value', 'description']
  },
};

const generationSettingsControlTool: any = {
  name: 'controlGenerationSettings',
  description: "Controls video generation settings like AI model, frame range, and video name.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      setting: {
        type: Type.STRING,
        enum: ['model', 'frame_range', 'video_name'],
        description: 'The generation setting to change'
      },
      value: {
        description: 'The new value. For model: "veo3" or "sora2". For frame_range: {start: number, end: number}. For video_name: string.'
      },
      description: {
        type: Type.STRING,
        description: 'Human-readable description of the change'
      }
    },
    required: ['setting', 'value', 'description']
  },
};

const showFeaturesTool: any = {
  name: 'showVision8Features',
  description: "Shows comprehensive overview of Vision8's 5 core capabilities when users ask about features, capabilities, what the app can do, help, overview, or want to know about Vision8's functionality.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query_type: {
        type: Type.STRING,
        description: 'Type of feature query (features, capabilities, help, overview, what can you do, etc.)'
      }
    },
    required: ['query_type']
  },
};

/**
 * Performs hybrid search using Elasticsearch with vector similarity and text matching.
 * Falls back to simple keyword search if Elasticsearch search fails.
 */
async function searchVideoContext(
  query: string,
  context: { scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }
): Promise<string> {
  const MAX_RESULTS = 5;

  // Check if backend is available first
  const backendAvailable = await isBackendAvailable();
  console.log('🔍 Backend availability check:', backendAvailable);

  if (!backendAvailable) {
    return `❌ **Backend Service Required**: The search functionality requires the Python backend to be running. Please start the backend service to use advanced video search capabilities.
        
**To start the backend:**
1. Navigate to the vision8-backend folder
2. Run: \`python -m uvicorn src.main:app --reload\`
3. Ensure Elasticsearch is running

**Current Status:** Backend offline - Advanced search unavailable.`;
  }

  try {
    // Try Elasticsearch hybrid search with backend
    console.log('🔍 Performing Elasticsearch hybrid search for:', query);
    const searchResults = await hybridSearch(query, undefined, MAX_RESULTS);

    if (searchResults.length > 0) {
      const results = searchResults.map(result => {
        const doc = result.document;
        const startTimeSec = doc.start_time_ms / 1000;
        const parts: string[] = [];

        // Add scene description
        parts.push(`Scene at ${formatTime(startTimeSec)}: ${doc.scene_summary}`);

        // Add relevant transcripts
        if (doc.transcript_phrases.length > 0) {
          doc.transcript_phrases.forEach(phrase => {
            parts.push(`  Transcript: "${phrase.text}"`);
          });
        }

        // Add tracked objects
        if (doc.objects_tracked.length > 0) {
          const objects = doc.objects_tracked.map(obj => obj.label).join(', ');
          parts.push(`  Objects: ${objects}`);
        }

        return parts.join('\n');
      });

      return `Found ${results.length} relevant items (Elasticsearch-powered search):\n\n${results.join('\n\n')}`;
    } else {
      return `🔍 **No Results Found**: No content matches your search query "${query}". The video has been analyzed and indexed, but no relevant scenes, transcripts, or objects were found.`;
    }
  } catch (error) {
    console.error('❌ Elasticsearch search failed:', error);
    return `❌ **Search Error**: Failed to search video content. Error: ${error instanceof Error ? error.message : 'Unknown error'}
        
Please ensure:
1. Backend service is running
2. Elasticsearch is properly configured
3. Video content has been analyzed and indexed`;
  }
}

// Settings callback types
export interface VideoSettingsCallbacks {
  onPlaybackSpeedChange?: (speed: number) => void;
  onTrimRangeChange?: (start: number, end: number) => void;
  onSyncModeChange?: (mode: 'video' | 'none') => void;
  onFrameModeChange?: (enabled: boolean) => void;
}

export interface GenerationSettingsCallbacks {
  onModelChange?: (model: 'veo3' | 'sora2') => void;
  onFrameRangeChange?: (start: number, end: number) => void;
  onVideoNameChange?: (name: string) => void;
}

export async function generateChatResponseWithRAG(
  prompt: string,
  context: {
    scenes: Scene[],
    transcripts: TranscriptItem[],
    objects: TrackedObject[]
  },
  videoSettings?: {
    playbackSpeed: number;
    trimStart: number;
    trimEnd: number;
    syncMode: 'video' | 'none';
    frameMode: boolean;
    videoDuration: number;
  },
  generationSettings?: {
    model: 'veo3' | 'sora2';
    frameRange: { start: number; end: number; duration: number };
    videoName: string;
  },
  settingsCallbacks?: VideoSettingsCallbacks,
  generationCallbacks?: GenerationSettingsCallbacks
): Promise<string> {
  // Check if GoogleGenAI is properly initialized
  if (!ai) {
    throw new Error("GoogleGenAI is not initialized. Please check your API key configuration.");
  }
  const model = 'gemini-2.5-flash';
  const tools = [{ functionDeclarations: [searchVideoContentTool, videoSettingsControlTool, generationSettingsControlTool, showFeaturesTool] }];

  let currentSettingsInfo = '';
  if (videoSettings) {
    currentSettingsInfo += `\nCurrent Video Settings:
- Playback Speed: ${videoSettings.playbackSpeed}x
- Trim Range: ${videoSettings.trimStart}s to ${videoSettings.trimEnd}s (Duration: ${videoSettings.videoDuration}s)
- Sync Mode: ${videoSettings.syncMode}
- Frame Mode: ${videoSettings.frameMode ? 'enabled' : 'disabled'}`;
  }
  if (generationSettings) {
    currentSettingsInfo += `\nCurrent Generation Settings:
- AI Model: ${generationSettings.model === 'veo3' ? 'Veo 3' : 'Sora 2'}
- Frame Range: ${generationSettings.frameRange.start} to ${generationSettings.frameRange.end} frames (${generationSettings.frameRange.duration.toFixed(1)}s)
- Video Name: ${generationSettings.videoName}`;
  }

  const systemInstruction = `You are Vision8, an AI-powered video analysis and generation assistant with comprehensive capabilities.

## 🎬 VISION8 CAPABILITIES:

### 1. **Intelligent Video Analysis**
- Upload videos and get AI-powered scene breakdowns with timestamps
- Extract accurate transcriptions with speaker identification
- Detect and track objects throughout the video
- Generate searchable metadata for every scene

### 2. **Advanced Video Search**
- Search video content using natural language queries
- Find specific scenes, dialogue, objects, or actions instantly  
- Get precise timestamp citations for every result
- Semantic search powered by AI embeddings

### 3. **AI Video Generation**
- Replace any scene with AI-generated content using Veo-3 or Sora-2
- Conversational prompts: "Make this scene more dramatic" or "Change the weather to rainy"
- Multiple quality presets from draft to high-definition
- Context-aware generation using original scene data

### 4. **Smart Video Editing**
- Seamlessly stitch original footage with AI-generated scenes
- Precise frame-level replacement at any timestamp
- Maintain video quality and continuity
- Export professional-quality results

### 5. **Interactive Video Controls**
- Adjust playback speed, trim ranges, and sync modes
- Frame-by-frame navigation and analysis
- Real-time settings control through conversation
- Synchronized playback with search results

${currentSettingsInfo}

## SPECIAL RESPONSES:
When users ask about "features", "capabilities", "what can you do", "help", "overview", or similar queries, use the showVision8Features tool to provide a comprehensive feature overview.

## INSTRUCTIONS:
- Answer questions about video content by searching through analyzed scenes, transcripts, and objects
- Help users with video generation, editing, and playback controls
- Provide timestamp citations as [mm:ss] for all video references
- Use conversational language - you're a helpful video assistant, not a technical manual
- When users ask about features or capabilities, showcase all 5 major capabilities above
- Guide users through the complete workflow from analysis to generation to editing

## RESPONSE STYLE:
- Be enthusiastic about video creation and analysis capabilities
- Speak naturally without mentioning technical implementation details
- Focus on what you can help users accomplish with their videos
- Use emojis and formatting to make responses engaging and clear`;

  const userContent = { role: 'user', parts: [{ text: prompt }] };

  // Step 1: Send prompt and tools to the model to see if it triggers a function call
  const initialResponse = await ai.models.generateContent({
    model,
    contents: [userContent],
    config: { tools, systemInstruction }
  });

  const functionCalls = initialResponse.functionCalls;

  // If the model answers directly without a tool, return its response.
  if (!functionCalls || functionCalls.length === 0) {
    return initialResponse.text || "I'm sorry, I couldn't determine how to answer that. Please try rephrasing your question.";
  }

  // The model's response with the function call(s) is in the first candidate's content.
  const modelResponseContent = initialResponse.candidates?.[0]?.content;
  if (!modelResponseContent) {
    throw new Error("Model did not return valid content with a function call.");
  }

  // Step 2: Execute the function call (the "Retrieval" step)
  const toolResponseParts = await Promise.all(functionCalls.map(async fc => {
    if (fc.name === 'searchVideoContent') {
      const query = fc.args.query as string;
      const searchResults = await searchVideoContext(query, context);
      return {
        functionResponse: {
          name: fc.name,
          response: { result: searchResults },
        }
      };
    } else if (fc.name === 'controlVideoSettings') {
      const { setting, value, description } = fc.args;
      let result = '';

      try {
        switch (setting) {
          case 'playback_speed':
            const speed = Math.max(0.1, Math.min(3.0, Number(value)));
            settingsCallbacks?.onPlaybackSpeedChange?.(speed);
            result = `✅ ${description} - Set playback speed to ${speed}x`;
            break;
          case 'trim_range':
            if (value && typeof value === 'object' && videoSettings) {
              const start = Math.max(0, Math.min(videoSettings.videoDuration, Number((value as any).start)));
              const end = Math.max(start + 0.1, Math.min(videoSettings.videoDuration, Number((value as any).end)));
              settingsCallbacks?.onTrimRangeChange?.(start, end);
              result = `✅ ${description} - Set trim range to ${start}s-${end}s`;
            } else {
              result = `❌ Invalid trim range values`;
            }
            break;
          case 'sync_mode':
            const syncMode = value === 'video' ? 'video' : 'none';
            settingsCallbacks?.onSyncModeChange?.(syncMode);
            result = `✅ ${description} - ${syncMode === 'video' ? 'Enabled' : 'Disabled'} sync mode`;
            break;
          case 'frame_mode':
            const frameMode = Boolean(value);
            settingsCallbacks?.onFrameModeChange?.(frameMode);
            result = `✅ ${description} - ${frameMode ? 'Enabled' : 'Disabled'} frame mode`;
            break;
          default:
            result = `❌ Unknown video setting: ${setting}`;
        }
      } catch (error) {
        result = `❌ Error applying setting: ${error}`;
      }

      return {
        functionResponse: {
          name: fc.name,
          response: { result },
        }
      };
    } else if (fc.name === 'controlGenerationSettings') {
      const { setting, value, description } = fc.args;
      let result = '';

      try {
        switch (setting) {
          case 'model':
            const model = value === 'sora2' ? 'sora2' : 'veo3';
            generationCallbacks?.onModelChange?.(model);
            result = `✅ ${description} - Set generation model to ${model === 'veo3' ? 'Veo 3' : 'Sora 2'}`;
            break;
          case 'frame_range':
            if (value && typeof value === 'object') {
              const start = Math.max(0, Number((value as any).start));
              const end = Math.max(start + 1, Number((value as any).end));
              generationCallbacks?.onFrameRangeChange?.(start, end);
              result = `✅ ${description} - Set generation range to frames ${start}-${end}`;
            } else {
              result = `❌ Invalid frame range values`;
            }
            break;
          case 'video_name':
            const videoName = String(value);
            generationCallbacks?.onVideoNameChange?.(videoName);
            result = `✅ ${description} - Set video name to "${videoName}"`;
            break;
          default:
            result = `❌ Unknown generation setting: ${setting}`;
        }
      } catch (error) {
        result = `❌ Error applying setting: ${error}`;
      }

      return {
        functionResponse: {
          name: fc.name,
          response: { result },
        }
      };
    } else if (fc.name === 'showVision8Features') {
      const featuresOverview = `# 🎬 Vision8: AI-Powered Video Analysis & Generation Platform

## What You Can Do With Vision8:

### 🔍 **1. Intelligent Video Analysis**
Upload any video and get:
- **Scene-by-scene breakdowns** with AI-generated descriptions
- **Accurate transcriptions** with speaker identification and timestamps  
- **Object detection** tracking people, items, and actions throughout
- **Searchable metadata** making every moment discoverable

### 🎯 **2. Advanced Video Search**
Find anything in your videos instantly:
- **Natural language search**: "Find the part where they discuss the plan"
- **Object search**: "Show me all scenes with cars" 
- **Dialogue search**: "When does Sarah mention the deadline?"
- **Precise citations** with exact timestamps for every result

### 🎨 **3. AI Video Generation**
Replace any scene with AI-generated content:
- **Conversational prompts**: "Make this scene more dramatic" or "Change it to nighttime"
- **Multiple AI models**: Choose between Veo-3 and Sora-2 for different styles
- **Quality control**: Draft, standard, or high-definition output
- **Context-aware**: Uses original scene data for seamless integration

### ✂️ **4. Smart Video Editing**
Professional editing made simple:
- **Seamless stitching** of original footage with AI-generated scenes
- **Frame-perfect replacement** at any timestamp
- **Quality preservation** maintaining original video standards
- **Export ready** professional results for any platform

### 🎮 **5. Interactive Controls**
Full control through conversation:
- **Playback settings**: Adjust speed, trim ranges, sync modes
- **Frame navigation**: Jump to specific moments or browse frame-by-frame
- **Real-time adjustments**: Change settings while watching
- **Voice commands**: Control everything through natural conversation

## 🚀 **Getting Started:**
1. **Upload a video** to begin analysis
2. **Ask questions** about the content or search for specific moments  
3. **Generate new scenes** by describing what you want to change
4. **Edit and export** your enhanced video

**Ready to transform your videos? Just upload one and ask me anything!** 🎬✨`;

      return {
        functionResponse: {
          name: fc.name,
          response: { result: featuresOverview },
        }
      };
    }
    return {
      functionResponse: {
        name: fc.name,
        response: { result: `Tool ${fc.name} not found.` },
      }
    };
  }));

  // Step 3: Send the tool response back to the model for final "Generation"
  const finalResponse = await ai.models.generateContent({
    model,
    contents: [
      userContent,
      modelResponseContent, // Model's turn with the function call
      { role: 'tool', parts: toolResponseParts } // Our tool's response
    ],
    config: { systemInstruction }
  });

  return finalResponse.text;
}
