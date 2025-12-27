import { GoogleGenAI, Type } from "@google/genai";

// Settings types
export interface VideoSettings {
  playbackSpeed: number;
  trimStart: number;
  trimEnd: number;
  syncMode: 'video' | 'none';
  frameMode: boolean;
}

export interface GenerationSettings {
  model: 'wan2.2';
  frameRange: { start: number; end: number; duration: number };
  videoName: string;
}

export interface SettingsAction {
  type: 'playback_speed' | 'trim_range' | 'sync_mode' | 'frame_mode' | 'generation_model' | 'generation_range' | 'video_name';
  value: any;
  description: string;
}

// Tool definition for settings control
const settingsControlTool = {
  name: 'controlVideoSettings',
  description: "Controls video playback and generation settings based on user requests. Can adjust speed, trim ranges, sync modes, and generation parameters.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      actions: {
        type: Type.ARRAY,
        description: 'Array of setting changes to apply',
        items: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ['playback_speed', 'trim_range', 'sync_mode', 'frame_mode', 'generation_model', 'generation_range', 'video_name'],
              description: 'The type of setting to change'
            },
            value: {
              description: 'The new value for the setting. For trim_range and generation_range, use {start: number, end: number}. For playback_speed, use a number between 0.1 and 3.0.'
            },
            description: {
              type: Type.STRING,
              description: 'Human-readable description of what this change does'
            }
          },
          required: ['type', 'value', 'description']
        }
      }
    },
    required: ['actions']
  }
};

// Initialize AI for settings control
const API_KEY = "AIzaSyBFYFaDZHneXJ0PMzeQRUvN-98A3FJ-3SU";
let ai: GoogleGenAI | null = null;

try {
  ai = new GoogleGenAI({ apiKey: API_KEY });
} catch (error) {
  console.error("Failed to initialize GoogleGenAI for settings:", error);
}

export class ConversationalSettingsController {
  private currentVideoSettings: VideoSettings;
  private currentGenerationSettings: GenerationSettings;
  private videoDuration: number;
  private onSettingsChange: (settings: Partial<VideoSettings>) => void;
  private onGenerationSettingsChange: (settings: Partial<GenerationSettings>) => void;

  constructor(
    initialVideoSettings: VideoSettings,
    initialGenerationSettings: GenerationSettings,
    videoDuration: number,
    onSettingsChange: (settings: Partial<VideoSettings>) => void,
    onGenerationSettingsChange: (settings: Partial<GenerationSettings>) => void
  ) {
    this.currentVideoSettings = initialVideoSettings;
    this.currentGenerationSettings = initialGenerationSettings;
    this.videoDuration = videoDuration;
    this.onSettingsChange = onSettingsChange;
    this.onGenerationSettingsChange = onGenerationSettingsChange;
  }

  async processSettingsRequest(userMessage: string): Promise<{ response: string; settingsChanged: boolean }> {
    if (!ai) {
      return {
        response: "Settings control is not available. Please check the configuration.",
        settingsChanged: false
      };
    }

    const systemInstruction = `You are a video settings assistant. Analyze user requests to change video settings and use the controlVideoSettings tool when appropriate.

Current Settings:
- Playback Speed: ${this.currentVideoSettings.playbackSpeed}x
- Trim Range: ${this.currentVideoSettings.trimStart}s to ${this.currentVideoSettings.trimEnd}s
- Sync Mode: ${this.currentVideoSettings.syncMode}
- Frame Mode: ${this.currentVideoSettings.frameMode ? 'enabled' : 'disabled'}
- Generation Model: ${this.currentGenerationSettings.model}
- Generation Range: ${this.currentGenerationSettings.frameRange.start} to ${this.currentGenerationSettings.frameRange.end} frames
- Video Name: ${this.currentGenerationSettings.videoName}
- Video Duration: ${this.videoDuration}s

Examples of settings requests:
- "Set playback speed to 2x" → playback_speed: 2.0
- "Slow down to half speed" → playback_speed: 0.5
- "Trim from 10 seconds to 30 seconds" → trim_range: {start: 10, end: 30}
- "Enable sync mode" → sync_mode: 'video'
- "Switch to frame mode" → frame_mode: true
- "Use Wan 2.2 model" → generation_model: 'wan2.2'
- "Generate from frame 100 to 200" → generation_range: {start: 100, end: 200}

If the user is asking about settings or wants to change them, use the tool. Otherwise, respond normally.`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          tools: [{ functionDeclarations: [settingsControlTool] }],
          systemInstruction
        }
      });

      const functionCalls = response.functionCalls;

      if (!functionCalls || functionCalls.length === 0) {
        return {
          response: response.text || "I didn't detect any settings changes in your request. Could you be more specific about what you'd like to adjust?",
          settingsChanged: false
        };
      }

      // Process the function call
      const functionCall = functionCalls[0];
      if (functionCall.name === 'controlVideoSettings') {
        const actions = functionCall.args.actions as SettingsAction[];
        const appliedChanges = await this.applySettingsActions(actions);

        // Generate final response
        const finalResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: userMessage }] },
            response.candidates?.[0]?.content || { role: 'model', parts: [] },
            {
              role: 'tool',
              parts: [{
                functionResponse: {
                  name: 'controlVideoSettings',
                  response: { result: `Applied ${appliedChanges.length} setting changes: ${appliedChanges.join(', ')}` }
                }
              }]
            }
          ],
          config: { systemInstruction }
        });

        return {
          response: finalResponse.text || `Applied ${appliedChanges.length} setting changes successfully.`,
          settingsChanged: appliedChanges.length > 0
        };
      }

      return {
        response: "I couldn't process that settings request. Please try again.",
        settingsChanged: false
      };

    } catch (error) {
      console.error("Error processing settings request:", error);
      return {
        response: "Sorry, I encountered an error while processing your settings request.",
        settingsChanged: false
      };
    }
  }

  private async applySettingsActions(actions: SettingsAction[]): Promise<string[]> {
    const appliedChanges: string[] = [];
    const videoSettingsChanges: Partial<VideoSettings> = {};
    const generationSettingsChanges: Partial<GenerationSettings> = {};

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'playback_speed':
            const speed = Math.max(0.1, Math.min(3.0, Number(action.value)));
            videoSettingsChanges.playbackSpeed = speed;
            this.currentVideoSettings.playbackSpeed = speed;
            appliedChanges.push(`playback speed to ${speed}x`);
            break;

          case 'trim_range':
            if (action.value && typeof action.value === 'object') {
              const start = Math.max(0, Math.min(this.videoDuration, Number(action.value.start)));
              const end = Math.max(start + 0.1, Math.min(this.videoDuration, Number(action.value.end)));
              videoSettingsChanges.trimStart = start;
              videoSettingsChanges.trimEnd = end;
              this.currentVideoSettings.trimStart = start;
              this.currentVideoSettings.trimEnd = end;
              appliedChanges.push(`trim range to ${start}s-${end}s`);
            }
            break;

          case 'sync_mode':
            const syncMode = action.value === 'video' || action.value === true ? 'video' : 'none';
            videoSettingsChanges.syncMode = syncMode;
            this.currentVideoSettings.syncMode = syncMode;
            appliedChanges.push(`sync mode to ${syncMode}`);
            break;

          case 'frame_mode':
            const frameMode = Boolean(action.value);
            videoSettingsChanges.frameMode = frameMode;
            this.currentVideoSettings.frameMode = frameMode;
            appliedChanges.push(`frame mode ${frameMode ? 'enabled' : 'disabled'}`);
            break;

          case 'generation_model':
            // Enforce Wan 2.2 regardless of input
            const model = 'wan2.2';
            generationSettingsChanges.model = model;
            this.currentGenerationSettings.model = model;
            appliedChanges.push(`generation model to ${model}`);
            break;

          case 'generation_range':
            if (action.value && typeof action.value === 'object') {
              const start = Math.max(0, Number(action.value.start));
              const end = Math.max(start + 1, Number(action.value.end));
              const duration = (end - start) / 30; // Assuming 30 FPS
              const frameRange = { start, end, duration };
              generationSettingsChanges.frameRange = frameRange;
              this.currentGenerationSettings.frameRange = frameRange;
              appliedChanges.push(`generation range to frames ${start}-${end}`);
            }
            break;

          case 'video_name':
            const videoName = String(action.value);
            generationSettingsChanges.videoName = videoName;
            this.currentGenerationSettings.videoName = videoName;
            appliedChanges.push(`video name to "${videoName}"`);
            break;
        }
      } catch (error) {
        console.error(`Error applying action ${action.type}:`, error);
      }
    }

    // Apply changes
    if (Object.keys(videoSettingsChanges).length > 0) {
      this.onSettingsChange(videoSettingsChanges);
    }
    if (Object.keys(generationSettingsChanges).length > 0) {
      this.onGenerationSettingsChange(generationSettingsChanges);
    }

    return appliedChanges;
  }

  // Helper method to check if a message is settings-related
  static isSettingsMessage(message: string): boolean {
    const settingsKeywords = [
      'speed', 'slow', 'fast', 'playback', 'trim', 'cut', 'range', 'sync', 'frame',
      'model', 'wan', 'generate', 'generation', 'name', 'title', 'settings',
      'adjust', 'change', 'set', 'enable', 'disable', 'switch'
    ];

    const lowerMessage = message.toLowerCase();
    return settingsKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  // Get current settings summary
  getCurrentSettingsSummary(): string {
    return `Current Settings:
• Playback Speed: ${this.currentVideoSettings.playbackSpeed}x
• Trim Range: ${this.currentVideoSettings.trimStart}s to ${this.currentVideoSettings.trimEnd}s (${(this.currentVideoSettings.trimEnd - this.currentVideoSettings.trimStart).toFixed(1)}s duration)
• Sync Mode: ${this.currentVideoSettings.syncMode === 'video' ? 'Enabled' : 'Disabled'}
• Frame Mode: ${this.currentVideoSettings.frameMode ? 'Enabled' : 'Disabled'}
• Generation Model: Wan 2.2
• Generation Range: Frames ${this.currentGenerationSettings.frameRange.start}-${this.currentGenerationSettings.frameRange.end} (${this.currentGenerationSettings.frameRange.duration.toFixed(1)}s)
• Video Name: ${this.currentGenerationSettings.videoName}`;
  }
}