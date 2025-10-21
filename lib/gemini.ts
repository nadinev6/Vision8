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
      description: "A chronological transcript of any spoken dialogue.",
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

            const interval = duration / (maxFrames + 1);

            for (let i = 1; i <= maxFrames; i++) {
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
    console.log("AI instance:", ai);
    console.log("API Key present:", !!API_KEY);
    console.log("API Key length:", API_KEY?.length);
    
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

    const FRAMES_TO_EXTRACT = 20; // Limit frames to avoid exceeding token limits
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
           - Inferring dialogue based on context (military scenes = military dialogue, action scenes = action dialogue)
           - Creating realistic conversations that match the visual context
           - For each transcript entry, provide startTime, endTime (usually 2-5 seconds apart), and realistic text
           - Generate multiple transcript entries per scene if people are clearly having conversations
           - Include background dialogue, commands, exclamations that would fit the scene
        
        3. OBJECTS: Identify and track important objects, people, and items throughout the video.
        
        Provide accurate timestamps in seconds. Be generous with transcripts - create realistic dialogue that matches what you see visually.
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
      
      // Process and index to IndexedDB
      try {
        const videoId = customVideoId || `video-${Date.now()}`;
        const videoUrl = videoFile.name;
        
        console.log('🔄 Processing analysis for IndexedDB...');
        console.log('Analysis result:', {
          scenes: result.scenes?.length || 0,
          transcripts: result.transcripts?.length || 0,
          objects: result.objects?.length || 0
        });
        
        // Only index if we have scenes
        if (result.scenes && result.scenes.length > 0) {
          console.log('📊 Starting IndexedDB processing with keyframe extraction...');
          await processVideoAnalysis(videoId, videoUrl, result.scenes, result.transcripts || [], result.objects || [], videoFile);
          console.log('✅ IndexedDB processing completed');
        } else {
          console.log('⚠️ No scenes found, skipping IndexedDB indexing');
        }
      } catch (indexedDBError) {
        console.error('⚠️ IndexedDB processing failed (continuing anyway):', indexedDBError);
        console.error('Error details:', {
          name: indexedDBError instanceof Error ? indexedDBError.name : 'Unknown',
          message: indexedDBError instanceof Error ? indexedDBError.message : String(indexedDBError),
          stack: indexedDBError instanceof Error ? indexedDBError.stack : 'No stack'
        });
        
        // Don't throw - we still want to return the analysis results even if indexing fails
      }
      
      return result;
    } catch(e) {
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

/**
 * Performs hybrid search using IndexedDB with vector similarity and text matching.
 * Falls back to simple keyword search if IndexedDB search fails.
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
        // Try IndexedDB hybrid search with backend
        console.log('🔍 Performing IndexedDB hybrid search for:', query);
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
    const tools = [{ functionDeclarations: [searchVideoContentTool, videoSettingsControlTool, generationSettingsControlTool] }];
    
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
    
    const systemInstruction = `You are a video analysis assistant with settings control capabilities.

CAPABILITIES:
1. Search video content using 'searchVideoContent' tool
2. Control video playback settings using 'controlVideoSettings' tool  
3. Control generation settings using 'controlGenerationSettings' tool

${currentSettingsInfo}

INSTRUCTIONS:
- For video content questions, use 'searchVideoContent' with specific queries
- For settings changes (speed, trim, sync, frame mode), use 'controlVideoSettings'
- For generation changes (model, frame range, video name), use 'controlGenerationSettings'
- When mentioning video events, cite timestamps as [mm:ss]
- When mentioning objects, cite as "[Object Name] at [mm:ss]"
- Use proper markdown formatting for lists and structure
- Base answers strictly on search results, don't make up information

SETTINGS EXAMPLES:
- "Set speed to 2x" → controlVideoSettings: setting="playback_speed", value=2.0
- "Trim from 10 to 30 seconds" → controlVideoSettings: setting="trim_range", value={start:10, end:30}
- "Enable sync mode" → controlVideoSettings: setting="sync_mode", value="video"
- "Switch to Sora 2" → controlGenerationSettings: setting="model", value="sora2"
- "Generate frames 100 to 200" → controlGenerationSettings: setting="frame_range", value={start:100, end:200}`;

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
