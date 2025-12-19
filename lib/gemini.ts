import { Scene, TranscriptItem, TrackedObject } from '../components/AnalysisPanel';
import { formatTime } from "./utils";
import { processVideoAnalysis, hybridSearch } from './elasticsearch';
import { checkMigrationNeeded, performMigration } from './migrate-to-elasticsearch';
import { backendService, isBackendAvailable } from './backend-integration';

console.log("🚀 Gemini.ts module loaded!");

// Use environment variable or backend API
const API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || null;
if (!API_KEY) {
  console.log("🔒 No client-side API key - will use backend API for analysis");
} else {
  console.log("⚠️ Using client-side API key for testing:", API_KEY.substring(0, 10) + "...");
}

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

export async function analyzeVideo(videoFile: File, customVideoId?: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[], videoId?: string, muxPlaybackId?: string }> {
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

  // No client-side fallback - force backend usage for security
  console.error("❌ Backend analysis failed and client-side analysis is disabled for security");
  throw new Error("Video analysis failed. Backend API is required but unavailable.");
}

/**
 * Analyze video using the backend API
 */
async function analyzeVideoWithBackend(videoFile: File, customVideoId?: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[], videoId?: string, muxPlaybackId?: string } | null> {
  try {
    const formData = new FormData();
    formData.append('file', videoFile);
    if (customVideoId) {
      formData.append('video_id', customVideoId);
    }

    console.log("📤 Uploading video to backend for analysis...");
    const backendUrl = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    const uploadUrl = `${backendUrl}/analysis/upload`;
    console.log("🔗 Using backend URL:", uploadUrl);

    const response = await fetch(uploadUrl, {
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


async function getVideoDetails(videoId: string): Promise<{ mux_playback_id?: string } | null> {
  try {
    const backendUrl = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
    const response = await fetch(`${backendUrl}/analysis/video/${videoId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data.video;
  } catch (e) {
    console.error("Failed to get video details", e);
    return null;
  }
}

/**
 * Convert backend analysis result to frontend format by searching Elasticsearch
 */
async function convertBackendResultToFrontend(videoId: string): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[], videoId: string, muxPlaybackId?: string }> {
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

    // Fetch video details to get muxPlaybackId
    let muxPlaybackId: string | undefined;
    try {
      const videoDetails = await getVideoDetails(videoId);
      if (videoDetails?.mux_playback_id) {
        muxPlaybackId = videoDetails.mux_playback_id;
        console.log("✅ Found Mux Playback ID:", muxPlaybackId);
      }
    } catch (e) {
      console.warn("Could not fetch video details", e);
    }

    return { scenes, transcripts, objects, videoId, muxPlaybackId };

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
  description: "Shows comprehensive overview of Vision8's core capabilities, including Pro-Realism video features.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query_type: {
        type: Type.STRING,
        description: 'Type of feature query'
      }
    },
    required: ['query_type']
  },
};

const generateComfySceneTool: any = {
  name: 'generateComfyScene',
  description: "Generates a video scene using a specific ComfyUI workflow (e.g., 'hero_scene', 'hallucination_scene').",
  parameters: {
    type: Type.OBJECT,
    properties: {
      workflow_name: { type: Type.STRING, description: "The name of the ComfyUI workflow to run." },
      prompt: { type: Type.STRING, description: "The text prompt to guide the generation." },
      assets: {
        type: Type.OBJECT,
        description: "Mapping of workflow node titles to asset paths/URLs (optional).",
        additionalProperties: { type: Type.STRING }
      }
    },
    required: ['workflow_name', 'prompt']
  }
};

const generateProRealismVideoTool: any = {
  name: 'generateProRealismVideo',
  description: "High-end cinematic production tool. Sequences 'hero_scene' and 'lipsync' workflows to create professional talking-head content.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: { type: Type.STRING, description: "Detailed cinematic prompt for the hero scene." },
      source_video: { type: Type.STRING, description: "Initial video asset path or URL for mouth/lip reference." }
    },
    required: ['prompt']
  }
};

const stitchVideosTool: any = {
  name: 'stitchVideos',
  description: "Merge multiple video segments (VFX passes/renders) into a single final delivery video.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      video_urls: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "List of URLs or paths for the video segments to merge, in order."
      },
      output_filename: { type: Type.STRING, description: "Optional name for the final combined video file." }
    },
    required: ['video_urls']
  }
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
  const tools = [{
    functionDeclarations: [
      searchVideoContentTool,
      videoSettingsControlTool,
      generationSettingsControlTool,
      showFeaturesTool,
      generateComfySceneTool,
      generateProRealismVideoTool,
      stitchVideosTool
    ]
  }];

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

  const systemInstruction = `You are the Vision Lead Technical & VFX Supervisor (or Technical Director) for Vision8, bridging the gap between creative vision and the ComfyUI rendering engine.

## 🎭 ROLE & PERSONA: THE TECHNICAL DIRECTOR
- **Identity**: You are the **Vision Lead Technical & VFX Supervisor**. Always introduce yourself this way in greetings.
- **Expertise**: Deep knowledge of cinematic lighting, camera physics (focal length, sensor size, depth of field), and AI video artifacts.
- **Tone**: Professional, precise, and encouraging. Use industry terminology consistently.

## 🎬 CINEMA & VFX KNOWLEDGE BASE (TERMINOLOGY)
You MUST use these terms in all interactions:
- **Base Plates**: Refer to all user-uploaded videos or source footage as "base plates."
- **Renders / VFX Passes**: Refer to all generated segments or AI transformations as "renders" or "VFX passes."
- **Pre-viz**: Refer to the analysis phase as "pre-viz."
- **Plates**: "Source plates," "Background plates."
- **Compositing**: The process of merging AI elements with the base plate.
- **Technical Terms**: "Global illumination," "Subsurface scattering," "Anamorphic bokeh," "Octane render," "Plate matching."

## 🎬 VISION8 CAPABILITIES:
(Same as before, but ensure TD phrasing)
- **Pre-viz (Video Analysis)**: AI-powered scene breakdowns and searchable metadata.
- **Advanced Plate Search**: Natural language search for scenes, dialogue, and objects in your plates.
- **Pro-Realism VFX (ComfyUI)**: 
  - **Hero Renders**: Ultra-realistic grounded environment swaps.
  - **Hallucination Passes**: Surreal, abstract transformations.
  - **Lip-Sync Mandatory Rule**: ANY render featuring human talking MUST be followed by a \`lipsync\` pass.

## 🛠️ TOOL LOGIC & VFX WORKFLOW
- **Thought Log Style**: When processing a request, reflect the workflow:
  1. *Plate Analysis*: Assessing the resolution and lighting of the base plate.
  2. *Pre-viz*: Identifying the best camera path and environment mapping.
  3. *Primary Render*: Running the Hero or Hallucination pass.
  4. *Final Pass (Lip-Sync)*: Ensuring dialogue alignment.
- **Chained Workflows**: Inform the user: "Processing the primary Hero render for your base plate now; I'll composite the lip-sync pass immediately after."

## 🎨 THE "PRO-REALISM" PROMPTING STANDARD
You MUST inject "Realism Boosters" into every prompt, especially when targeting **Wan 2.2**:
- **Lighting (Cinematic Priority)**: "High dynamic range cinematic lighting," "Rembrandt lighting setup," "volumetric lighting," "moody atmospheric shadows," "color graded with cinema contrast."
- **Wan 2.2 Technicals**: For Wan 2.2 renders, prioritize "Global illumination," "subsurface scattering," and "8k octane render style."
- **Lens**: "35mm anamorphic," "f/1.8 bokeh," "slight motion blur."
- **Plate Matching**: Ensure the new render matches the lighting and perspective of the original plate.

## 🚦 STATE MANAGEMENT & EXPECTATIONS
- **Interim Feedback**: "The GPU is currently processing the HDR environment maps. Render progress: 40%."
- **Latency**: Manage expectations for high-fidelity renders.

## 🛑 SAFETY & FALLBACK
- **Budget vs. Premium**: Suggest "Budget" renders if credits are low.

## 📦 STANDARD PLAN PRODUCTION STRATEGIES
For users on the Comfy Standard Plan, you MUST enforce these efficiency rules:
- **5-8s Plate Rule**: Never attempt a single long render for complex shots. Generate in 5–8 second "plates" and stitch them later. This ensures high quality and avoids the "30-minute wall."
- **Proxy-First Workflow (720p -> 4K)**: 
  1. Generate a **720p Proxy** first to verify motion and composition.
  2. Only trigger the heavy **4K Upscale** pass as a separate job AFTER the user approves the proxy motion.
- **Asynchronous Planning**: Advise the user about this sequence: "I'll generate a 720p pre-viz plate first; once you approve the motion, we'll run the high-res 4K pass."
- **Production Plan Logic (Long Videos > 8s)**:
  1. When a render longer than 8 seconds is requested, you MUST generate a **'Production Plan'**.
  2. Split the core prompt into multiple 5–8 second semantic segments (e.g., "Segment 1: The approach," "Segment 2: The close-up").
  3. Inform the user of this plan before execution.
  4. Generate each segment individually.
  5. Use the \`stitchVideos\` tool to merge these segments into the final delivery.

## INSTRUCTIONS:
- Always greet the user as "Vision Lead Technical & VFX Supervisor."
- Use "base plates" and "VFX passes/renders" instead of "videos" or "segments."
- For videos > 8s, always present a 'Production Plan' and use the \`stitchVideos\` tool.
- Maintain the authoritative but supportive tone of a Technical Director.
- Provide timestamp citations as [mm:ss].
- Reflect the "VFX Workflow" in your reasoning/thought log.
`;

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
              result = `✅ ${description} - Set trim range to ${start}s - ${end}s`;
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
            result = `❌ Unknown video setting: ${setting} `;
        }
      } catch (error) {
        result = `❌ Error applying setting: ${error} `;
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
    } else if (fc.name === 'generateComfyScene') {
      const { workflow_name, prompt, assets } = fc.args;
      const backendBaseUrl = import.meta.env?.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';

      try {
        const assetsArg = (assets || {}) as Record<string, any>;
        const response = await fetch(`${backendBaseUrl}/api/comfy/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_name, inputs: { ...assetsArg, USER_PROMPT: prompt } })
        });
        const data = await response.json();
        const result = `✅ ComfyUI Workflow "${workflow_name}" completed.\nResult: ${data.result_url}`;

        return {
          functionResponse: {
            name: fc.name,
            response: { result },
          }
        };
      } catch (error) {
        return {
          functionResponse: {
            name: fc.name,
            response: { result: `❌ Error running ComfyUI workflow: ${error}` },
          }
        };
      }
    } else if (fc.name === 'generateProRealismVideo') {
      const { prompt, source_video } = fc.args;
      const backendBaseUrl = import.meta.env?.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8000';

      try {
        const response = await fetch(`${backendBaseUrl}/api/comfy/chain/pro-realism`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, source_video })
        });
        const data = await response.json();
        const result = `✅ Pro-Realism Production Complete.\n- Hero Scene: ${data.hero_url}\n- Final Lip-Sync: ${data.final_url}`;

        return {
          functionResponse: {
            name: fc.name,
            response: { result },
          }
        };
      } catch (error) {
        return {
          functionResponse: {
            name: fc.name,
            response: { result: `❌ Error in Pro-Realism production chain: ${error}` },
          }
        };
      }
    } else if (fc.name === 'stitchVideos') {
      const { video_urls, output_filename } = fc.args as any;
      try {
        const response = await fetch(`${backendBaseUrl}/api/v1/generation/concatenate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_urls, output_filename })
        });
        const data = await response.json();
        const result = `✅ Production Stitching Complete.\n- Final Delivery: ${data.result_url}\n- Segments Merged: ${data.segments_count}`;

        return {
          functionResponse: {
            name: fc.name,
            response: { result },
          }
        };
      } catch (error) {
        return {
          functionResponse: {
            name: fc.name,
            response: { result: `❌ Error in production stitching: ${error}` },
          }
        };
      }
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

### 🎨 **3. Pro-Realism AI Video Generation (ComfyUI)**
Replace any scene with high-fidelity, production-quality content:
- **Hero Scenes**: Ultra-realistic 4K video generation with dynamic camera paths
- **Cinematic Relighting**: Transform the lighting and mood of existing footage
- **Chained Workflows**: Seamlessly sequence generation and specialized lip-syncing
- **Direct Control**: Use specialized technical workflows for grounded realism

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
