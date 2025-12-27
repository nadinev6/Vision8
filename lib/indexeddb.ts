import { Scene, TranscriptItem, TrackedObject } from '../components/AnalysisPanel';

// Database configuration
const DB_NAME = 'vision8-video-db';
const DB_VERSION = 1;
const STORE_NAME = 'scene_segments';

// Scene document structure (same as Elasticsearch)
export interface SceneDocument {
  video_id: string;
  scene_id: string;
  video_url: string;
  start_time_ms: number;
  end_time_ms: number;
  scene_summary: string;
  full_description: string;
  transcript_phrases: Array<{
    text: string;
    start_ms: number;
    end_ms: number;
    speaker: string;
  }>;
  scene_embedding: number[];
  keyframes: Array<{
    type: 'start' | 'end' | 'mid';
    time_ms: number;
    s3_url: string;
  }>;
  objects_tracked: Array<{
    label: string;
    track_id: string;
    boxes: Array<{
      frame_ms: number;
      xmin: number;
      ymin: number;
      xmax: number;
      ymax: number;
    }>;
  }>;
  actions_detected: string[];
}

// Initialize IndexedDB
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'scene_id' });

        // Create indexes for efficient querying
        objectStore.createIndex('video_id', 'video_id', { unique: false });
        objectStore.createIndex('start_time_ms', 'start_time_ms', { unique: false });
        objectStore.createIndex('scene_summary', 'scene_summary', { unique: false });

        console.log('✅ IndexedDB object store created with indexes');
      }
    };
  });
}

// Generate embeddings using Gemini
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    console.log('🔗 Generating embedding for text:', text.substring(0, 100) + '...');

    if (!text || text.trim().length < 10) {
      console.log('⚠️ Text too short for embedding, using default');
      return new Array(768).fill(0);
    }

    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || 'AIzaSyBFYFaDZHneXJ0PMzeQRUvN-98A3FJ-3SU';
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text: text.substring(0, 1000) }]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Embedding generated successfully');
    return data.embedding.values;
  } catch (error) {
    console.error('❌ Failed to generate embedding:', error);
    return new Array(768).fill(0);
  }
}

// Cosine similarity calculation
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Extract keyframes from video at specific timestamps
async function extractKeyframes(
  videoFile: File,
  timestamps: number[]
): Promise<Map<number, string>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const keyframeMap = new Map<number, string>();

    video.preload = 'metadata';
    video.muted = true;
    video.src = URL.createObjectURL(videoFile);

    video.onloadedmetadata = async () => {
      canvas.width = Math.min(video.videoWidth, 640); // Limit width to 640px
      canvas.height = Math.min(video.videoHeight, 360); // Limit height to 360px
      const scaleX = canvas.width / video.videoWidth;
      const scaleY = canvas.height / video.videoHeight;

      try {
        for (const timestamp of timestamps) {
          video.currentTime = timestamp;
          
          await new Promise<void>((res, rej) => {
            const seekTimeout = setTimeout(() => rej(new Error('Seek timeout')), 3000);
            video.onseeked = () => {
              clearTimeout(seekTimeout);
              res();
            };
          });

          if (ctx) {
            // Draw scaled video frame
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Data = canvas.toDataURL('image/jpeg', 0.7); // 70% quality
            keyframeMap.set(timestamp, base64Data);
          }
        }

        URL.revokeObjectURL(video.src);
        resolve(keyframeMap);
      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };
  });
}

// Convert analysis results to scene documents
export async function convertToSceneDocuments(
  videoId: string,
  videoUrl: string,
  scenes: Scene[],
  transcripts: TranscriptItem[],
  objects: TrackedObject[],
  videoFile?: File
): Promise<SceneDocument[]> {
  console.log('📄 Converting analysis to scene documents...');

  const documents: SceneDocument[] = [];
  
  // Extract all keyframes at once if video file is provided
  let keyframeMap = new Map<number, string>();
  if (videoFile) {
    console.log('🎬 Extracting keyframes from video...');
    const allTimestamps: number[] = [];
    
    scenes.forEach((scene, i) => {
      const startTime = scene.timestamp;
      const endTime = scenes[i + 1]?.timestamp || scene.timestamp + 30;
      const midTime = (startTime + endTime) / 2;
      
      allTimestamps.push(startTime, midTime, endTime);
    });
    
    try {
      keyframeMap = await extractKeyframes(videoFile, allTimestamps);
      console.log(`✅ Extracted ${keyframeMap.size} keyframes`);
    } catch (error) {
      console.warn('⚠️ Failed to extract keyframes:', error);
    }
  }

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = `${videoId}-scene-${i.toString().padStart(3, '0')}`;

    // Find transcripts that overlap with this scene
    const sceneTranscripts = transcripts.filter(t =>
      t.startTime >= scene.timestamp &&
      t.startTime <= (scenes[i + 1]?.timestamp || Infinity)
    );

    // Find objects that appear in this scene
    const sceneObjects = objects.filter(o =>
      o.timestamp >= scene.timestamp &&
      o.timestamp <= (scenes[i + 1]?.timestamp || Infinity)
    );

    // Create combined text for embedding
    const combinedText = `${scene.description} ${sceneTranscripts.map(t => t.text).join(' ')}`;

    try {
      // Generate embedding
      const embedding = await generateEmbedding(combinedText);

      const document: SceneDocument = {
        video_id: videoId,
        scene_id: sceneId,
        video_url: videoUrl,
        start_time_ms: Math.round(scene.timestamp * 1000),
        end_time_ms: Math.round((scenes[i + 1]?.timestamp || scene.timestamp + 30) * 1000),
        scene_summary: scene.description,
        full_description: scene.description,
        transcript_phrases: sceneTranscripts.map(t => ({
          text: t.text,
          start_ms: Math.round(t.startTime * 1000),
          end_ms: Math.round(t.endTime * 1000),
          speaker: 'Unknown'
        })),
        scene_embedding: embedding,
        keyframes: [
          {
            type: 'start' as const,
            time_ms: Math.round(scene.timestamp * 1000),
            s3_url: keyframeMap.get(scene.timestamp) || ''
          },
          {
            type: 'mid' as const,
            time_ms: Math.round(((scene.timestamp + (scenes[i + 1]?.timestamp || scene.timestamp + 30)) / 2) * 1000),
            s3_url: keyframeMap.get((scene.timestamp + (scenes[i + 1]?.timestamp || scene.timestamp + 30)) / 2) || ''
          },
          {
            type: 'end' as const,
            time_ms: Math.round((scenes[i + 1]?.timestamp || scene.timestamp + 30) * 1000),
            s3_url: keyframeMap.get(scenes[i + 1]?.timestamp || scene.timestamp + 30) || ''
          }
        ],
        objects_tracked: sceneObjects.map(obj => ({
          label: obj.name,
          track_id: `${sceneId}-${obj.name}`,
          boxes: [{
            frame_ms: Math.round(obj.timestamp * 1000),
            xmin: 0,
            ymin: 0,
            xmax: 100,
            ymax: 100
          }]
        })),
        actions_detected: []
      };

      documents.push(document);
      console.log(`✅ Created document for scene ${i + 1}/${scenes.length}`);
    } catch (error) {
      console.error(`❌ Failed to create document for scene ${i}:`, error);
    }
  }

  return documents;
}

// Store documents in IndexedDB
export async function indexSceneDocuments(documents: SceneDocument[]): Promise<void> {
  console.log('📤 Indexing documents to IndexedDB...');
  console.log('Documents to index:', documents.length);

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    let successCount = 0;
    let errorCount = 0;

    documents.forEach((doc) => {
      const request = objectStore.put(doc);

      request.onsuccess = () => {
        successCount++;
        console.log(`✅ Indexed document: ${doc.scene_id}`);
      };

      request.onerror = () => {
        errorCount++;
        console.error(`❌ Failed to index document ${doc.scene_id}:`, request.error);
      };
    });

    transaction.oncomplete = () => {
      console.log(`🎉 IndexedDB indexing complete: ${successCount} success, ${errorCount} errors`);
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      console.error('❌ Transaction failed:', transaction.error);
      db.close();
      reject(transaction.error);
    };
  });
}

// Get all documents for a video
export async function getDocumentsByVideoId(videoId: string): Promise<SceneDocument[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('video_id');
    const request = index.getAll(videoId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Vector similarity search
export async function searchByVector(
  queryEmbedding: number[],
  videoId?: string,
  topK: number = 5
): Promise<Array<{ document: SceneDocument; score: number }>> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    let request: IDBRequest;
    if (videoId) {
      const index = objectStore.index('video_id');
      request = index.getAll(videoId);
    } else {
      request = objectStore.getAll();
    }

    request.onsuccess = () => {
      const documents = request.result as SceneDocument[];

      // Calculate similarity scores
      const results = documents.map(doc => ({
        document: doc,
        score: cosineSimilarity(queryEmbedding, doc.scene_embedding)
      }));

      // Sort by score descending and take top K
      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, topK);

      console.log(`🔍 Vector search found ${topResults.length} results`);
      db.close();
      resolve(topResults);
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Text search across scene descriptions and transcripts
export async function searchByText(
  query: string,
  videoId?: string,
  topK: number = 5
): Promise<SceneDocument[]> {
  const db = await openDatabase();
  const queryLower = query.toLowerCase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    let request: IDBRequest;
    if (videoId) {
      const index = objectStore.index('video_id');
      request = index.getAll(videoId);
    } else {
      request = objectStore.getAll();
    }

    request.onsuccess = () => {
      const documents = request.result as SceneDocument[];

      // Filter documents that match the query
      const results = documents.filter(doc => {
        const summaryMatch = doc.scene_summary.toLowerCase().includes(queryLower);
        const descriptionMatch = doc.full_description.toLowerCase().includes(queryLower);
        const transcriptMatch = doc.transcript_phrases.some(t =>
          t.text.toLowerCase().includes(queryLower)
        );

        return summaryMatch || descriptionMatch || transcriptMatch;
      });

      console.log(`🔍 Text search found ${results.length} results`);
      db.close();
      resolve(results.slice(0, topK));
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Hybrid search: combine vector and text search
export async function hybridSearch(
  query: string,
  videoId?: string,
  topK: number = 5
): Promise<Array<{ document: SceneDocument; score: number }>> {
  console.log('🔍 Performing hybrid search for:', query);

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Perform vector search
  const vectorResults = await searchByVector(queryEmbedding, videoId, topK * 2);

  // Perform text search
  const textResults = await searchByText(query, videoId, topK * 2);

  // Combine results with weighted scoring
  const combinedMap = new Map<string, { document: SceneDocument; vectorScore: number; textMatch: boolean }>();

  // Add vector results
  vectorResults.forEach(result => {
    combinedMap.set(result.document.scene_id, {
      document: result.document,
      vectorScore: result.score,
      textMatch: false
    });
  });

  // Boost scores for text matches
  textResults.forEach(doc => {
    const existing = combinedMap.get(doc.scene_id);
    if (existing) {
      existing.textMatch = true;
    } else {
      combinedMap.set(doc.scene_id, {
        document: doc,
        vectorScore: 0.5, // Default score for text-only matches
        textMatch: true
      });
    }
  });

  // Calculate final scores (vector: 70%, text boost: 30%)
  const finalResults = Array.from(combinedMap.values()).map(item => ({
    document: item.document,
    score: item.vectorScore * 0.7 + (item.textMatch ? 0.3 : 0)
  }));

  // Sort and return top K
  finalResults.sort((a, b) => b.score - a.score);
  const topResults = finalResults.slice(0, topK);

  console.log(`✅ Hybrid search returned ${topResults.length} results`);
  return topResults;
}

// Delete all documents for a video
export async function deleteVideoDocuments(videoId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('video_id');
    const request = index.openCursor(IDBKeyRange.only(videoId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      console.log(`✅ Deleted all documents for video: ${videoId}`);
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

// Clear all data
export async function clearAllData(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      console.log('✅ Cleared all IndexedDB data');
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Main function to process and index video analysis
export async function processVideoAnalysis(
  videoId: string,
  videoUrl: string,
  scenes: Scene[],
  transcripts: TranscriptItem[],
  objects: TrackedObject[],
  videoFile?: File
): Promise<void> {
  try {
    console.log('🚀 Starting video analysis processing with IndexedDB...');

    // Convert to scene documents (with keyframe extraction if video file provided)
    const documents = await convertToSceneDocuments(videoId, videoUrl, scenes, transcripts, objects, videoFile);

    // Index to IndexedDB
    await indexSceneDocuments(documents);

    console.log('✅ Video analysis processing complete');
  } catch (error) {
    console.error('❌ Video analysis processing failed:', error);
    throw error;
  }
}

// Export database info for debugging
export async function getDatabaseInfo(): Promise<{ documentCount: number; videos: string[] }> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const countRequest = objectStore.count();
    const getAllRequest = objectStore.getAll();

    Promise.all([
      new Promise<number>((res, rej) => {
        countRequest.onsuccess = () => res(countRequest.result);
        countRequest.onerror = () => rej(countRequest.error);
      }),
      new Promise<SceneDocument[]>((res, rej) => {
        getAllRequest.onsuccess = () => res(getAllRequest.result);
        getAllRequest.onerror = () => rej(getAllRequest.error);
      })
    ]).then(([count, documents]) => {
      const videos = [...new Set(documents.map(d => d.video_id))];
      db.close();
      resolve({ documentCount: count, videos });
    }).catch(error => {
      db.close();
      reject(error);
    });
  });
}
