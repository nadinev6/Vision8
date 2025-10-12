import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Scene, TranscriptItem, TrackedObject } from '../components/AnalysisPanel';
import { formatTime } from "./utils";

// This is a placeholder for the actual API key which should be handled securely
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.warn("API_KEY not found. Please set the environment variable.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

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

export async function analyzeVideo(videoFile: File): Promise<{ scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }> {
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
        The frames are sampled evenly from a video. Infer the events, dialogue, and objects based on these frames.
        Provide accurate timestamps in seconds.
    `;
    
    try {
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [{ text: prompt }, ...imageParts] },
          config: {
              responseMimeType: "application/json",
              responseSchema: analysisSchema,
          },
      });

      const jsonText = response.text.trim();
      const result = JSON.parse(jsonText);
      return result;
    } catch(e) {
      console.error(e);
      throw new Error("The AI model failed to return a valid analysis. Please try again.");
    }
}

// --- RAG Pipeline with Function Calling ---

const searchVideoContentTool: FunctionDeclaration = {
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

/**
 * Simulates a vector search against an Elasticsearch database.
 * It performs a simple keyword search on the video's context.
 */
function searchVideoContext(
    query: string,
    context: { scenes: Scene[], transcripts: TranscriptItem[], objects: TrackedObject[] }
  ): string {
      const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const results: string[] = [];
      const MAX_RESULTS = 5;
  
      // Search scenes
      context.scenes.forEach(scene => {
          if (searchTerms.some(term => scene.description.toLowerCase().includes(term))) {
              results.push(`Scene at ${formatTime(scene.timestamp)}: ${scene.description}`);
          }
      });
  
      // Search transcripts
      context.transcripts.forEach(item => {
          if (searchTerms.some(term => item.text.toLowerCase().includes(term))) {
              results.push(`Transcript from ${formatTime(item.startTime)} to ${formatTime(item.endTime)}: "${item.text}"`);
          }
      });
  
      // Search objects
      context.objects.forEach(obj => {
          if (searchTerms.some(term => obj.name.toLowerCase().includes(term))) {
              results.push(`Object "${obj.name}" found at ${formatTime(obj.timestamp)}`);
          }
      });
  
      if (results.length === 0) {
          return "No relevant information found in the video for the query.";
      }
  
      // Return top N results to keep context small
      return `Found ${results.length} relevant items:\n- ` + results.slice(0, MAX_RESULTS).join('\n- ');
}

export async function generateChatResponseWithRAG(
    prompt: string,
    context: {
      scenes: Scene[],
      transcripts: TranscriptItem[],
      objects: TrackedObject[]
    }
  ): Promise<string> {
    const model = 'gemini-2.5-flash';
    const tools = [{ functionDeclarations: [searchVideoContentTool] }];
    const systemInstruction = `You are a video analysis assistant.
- First, decide if you need to search the video content to answer the user's question. If so, use the 'searchVideoContent' tool with a clear and specific query.
- Then, use the search results provided by the tool to formulate a comprehensive and accurate answer.
- When you mention an event or dialogue from the video, cite the relevant timestamp in the format [mm:ss]. Convert seconds to this format.
- When you mention a tracked object, cite its name and timestamp, like this: "[Object Name] at [mm:ss]".
- If the search tool returns no relevant information, politely state that you could not find the answer in the video analysis.
- Do not make up information. Base your answers strictly on the search results provided by the tool.`;

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
    const toolResponseParts = functionCalls.map(fc => {
        if (fc.name === 'searchVideoContent') {
            const query = fc.args.query as string;
            const searchResults = searchVideoContext(query, context);
            return {
                functionResponse: {
                    name: fc.name,
                    response: { result: searchResults },
                }
            };
        }
        return {
            functionResponse: {
                name: fc.name,
                response: { result: `Tool ${fc.name} not found.` },
            }
        };
    });
    
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