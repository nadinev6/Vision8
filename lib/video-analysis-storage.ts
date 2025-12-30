/**
 * IndexedDB storage service for video analysis results
 * Provides offline caching and synchronization with Supabase
 */

import { AnalysisResults, AnalysisFrame, ClientCapabilities } from './video-analysis-service';
import { supabase } from '../supabaseClient';

export interface StoredAnalysisSession {
  id: string;
  videoMetadata: {
    asset_id?: string;
    playback_id?: string;
    title: string;
    duration: number;
    file_size?: number;
    upload_date?: string;
  };
  analysisResults: AnalysisResults;
  capabilities: ClientCapabilities;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
  sync_attempts: number;
  last_sync_attempt?: string;
  error_message?: string;
}

export interface StorageConfig {
  dbName: string;
  version: number;
  maxStorageSize: number; // in bytes
  maxSessions: number;
  autoCleanup: boolean;
  syncInterval: number; // in minutes
}

export interface SyncStatus {
  total_sessions: number;
  pending_sessions: number;
  synced_sessions: number;
  failed_sessions: number;
  last_sync: string | null;
  storage_used: number;
  storage_available: number;
}

class VideoAnalysisStorage {
  private db: IDBDatabase | null = null;
  private config: StorageConfig;
  private syncTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = {
      dbName: 'Vision8Analysis',
      version: 1,
      maxStorageSize: 500 * 1024 * 1024, // 500MB
      maxSessions: 100,
      autoCleanup: true,
      syncInterval: 5, // 5 minutes
      ...config
    };
  }

  /**
   * Initialize IndexedDB database
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, this.config.version);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('✅ Video analysis storage initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create analysis sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionsStore.createIndex('video_metadata.asset_id', 'videoMetadata.asset_id', { unique: false });
          sessionsStore.createIndex('sync_status', 'sync_status', { unique: false });
          sessionsStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Create analysis frames store
        if (!db.objectStoreNames.contains('frames')) {
          const framesStore = db.createObjectStore('frames', { keyPath: 'id' });
          framesStore.createIndex('session_id', 'session_id', { unique: false });
          framesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create thumbnails store
        if (!db.objectStoreNames.contains('thumbnails')) {
          const thumbnailsStore = db.createObjectStore('thumbnails', { keyPath: 'id' });
          thumbnailsStore.createIndex('session_id', 'session_id', { unique: false });
        }

        // Create metadata store
        if (!db.objectStoreNames.contains('metadata')) {
          const metadataStore = db.createObjectStore('metadata', { keyPath: 'key' });
        }

        console.log('📦 IndexedDB schema created');
      };
    });
  }

  /**
   * Store analysis session with results
   */
  async storeSession(session: StoredAnalysisSession): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'frames'], 'readwrite');
      
      const sessionStore = transaction.objectStore('sessions');
      const framesStore = transaction.objectStore('frames');

      // Store session
      sessionStore.put(session);

      // Store frames
      if (session.analysisResults.scenes) {
        session.analysisResults.scenes.forEach((scene, index) => {
          const frameId = `${session.id}_frame_${index}`;
          framesStore.put({
            id: frameId,
            session_id: session.id,
            timestamp: scene.timestamp,
            objects: scene.objects,
            description: scene.description,
            keyframe: scene.keyframe,
            created_at: session.created_at
          });
        });
      }

      transaction.oncomplete = () => {
        console.log(`💾 Stored analysis session: ${session.id}`);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to store session: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Retrieve analysis session
   */
  async getSession(sessionId: string): Promise<StoredAnalysisSession | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get session: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all sessions for a video
   */
  async getSessionsByVideo(assetId?: string): Promise<StoredAnalysisSession[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      
      let request: IDBRequest;
      if (assetId) {
        const index = store.index('video_metadata.asset_id');
        request = index.getAll(assetId);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get sessions: ${request.error?.message}`));
      };
    });
  }

  /**
   * Store analysis frame thumbnail
   */
  async storeThumbnail(sessionId: string, timestamp: number, thumbnailData: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['thumbnails'], 'readwrite');
      const store = transaction.objectStore('thumbnails');
      
      const thumbnailId = `${sessionId}_thumb_${timestamp}`;
      store.put({
        id: thumbnailId,
        session_id: sessionId,
        timestamp,
        data: thumbnailData,
        created_at: new Date().toISOString()
      });

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to store thumbnail: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Get thumbnail for session and timestamp
   */
  async getThumbnail(sessionId: string, timestamp: number): Promise<string | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['thumbnails'], 'readonly');
      const store = transaction.objectStore('thumbnails');
      const thumbnailId = `${sessionId}_thumb_${timestamp}`;
      const request = store.get(thumbnailId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get thumbnail: ${request.error?.message}`));
      };
    });
  }

  /**
   * Sync analysis results with Supabase
   */
  async syncWithSupabase(userId: string): Promise<SyncStatus> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const sessions = await this.getPendingSessions();
    let syncedCount = 0;
    let failedCount = 0;

    for (const session of sessions) {
      try {
        await this.syncSessionToSupabase(session, userId);
        
        // Update sync status
        await this.updateSessionSyncStatus(session.id, 'synced');
        syncedCount++;
        
      } catch (error) {
        console.error(`Failed to sync session ${session.id}:`, error);
        
        // Update sync status with error
        await this.updateSessionSyncStatus(session.id, 'failed', error instanceof Error ? error.message : 'Sync failed');
        failedCount++;
      }
    }

    // Update sync timestamp
    await this.setMetadata('last_sync', new Date().toISOString());

    return {
      total_sessions: sessions.length,
      pending_sessions: sessions.length - syncedCount - failedCount,
      synced_sessions: syncedCount,
      failed_sessions: failedCount,
      last_sync: new Date().toISOString(),
      storage_used: await this.getStorageUsage(),
      storage_available: this.config.maxStorageSize
    };
  }

  /**
   * Sync single session to Supabase
   */
  private async syncSessionToSupabase(session: StoredAnalysisSession, userId: string): Promise<void> {
    try {
      // Store in Supabase
      const { error } = await supabase
        .from('video_analysis_results')
        .upsert({
          user_id: userId,
          session_id: session.id,
          video_metadata: session.videoMetadata,
          analysis_results: session.analysisResults,
          capabilities: session.capabilities,
          sync_status: 'synced',
          created_at: session.created_at,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id'
        });

      if (error) throw error;

      console.log(`🔄 Synced session to Supabase: ${session.id}`);

    } catch (error) {
      throw new Error(`Supabase sync failed: ${error.message}`);
    }
  }

  /**
   * Update session sync status
   */
  private async updateSessionSyncStatus(
    sessionId: string, 
    status: 'pending' | 'synced' | 'failed', 
    errorMessage?: string
  ): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onsuccess = () => {
        const session = request.result;
        if (session) {
          session.sync_status = status;
          session.updated_at = new Date().toISOString();
          session.sync_attempts = (session.sync_attempts || 0) + 1;
          session.last_sync_attempt = new Date().toISOString();
          
          if (errorMessage) {
            session.error_message = errorMessage;
          } else {
            delete session.error_message;
          }

          store.put(session);
        }
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to update session status: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get sessions pending sync
   */
  private async getPendingSessions(): Promise<StoredAnalysisSession[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('sync_status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get pending sessions: ${request.error?.message}`));
      };
    });
  }

  /**
   * Set metadata value
   */
  private async setMetadata(key: string, value: any): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');
      
      store.put({
        key,
        value,
        updated_at: new Date().toISOString()
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to set metadata: ${transaction.error?.message}`));
    });
  }

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<any> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result ? request.result.value : null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get metadata: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<number> {
    if (!this.db) return 0;

    // Estimate storage usage by counting records and average sizes
    const sessions = await this.getAllSessions();
    const frames = await this.getAllFrames();
    const thumbnails = await this.getAllThumbnails();

    // Rough estimation: sessions ~10KB, frames ~1KB, thumbnails ~50KB each
    const estimatedUsage = 
      (sessions.length * 10 * 1024) + 
      (frames.length * 1 * 1024) + 
      (thumbnails.length * 50 * 1024);

    return estimatedUsage;
  }

  /**
   * Get all sessions (for cleanup and stats)
   */
  private async getAllSessions(): Promise<StoredAnalysisSession[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all sessions: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all frames (for cleanup and stats)
   */
  private async getAllFrames(): Promise<any[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['frames'], 'readonly');
      const store = transaction.objectStore('frames');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all frames: ${request.error?.message}`));
      };
    });
  }

  /**
   * Get all thumbnails (for cleanup and stats)
   */
  private async getAllThumbnails(): Promise<any[]> {
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['thumbnails'], 'readonly');
      const store = transaction.objectStore('thumbnails');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all thumbnails: ${request.error?.message}`));
      };
    });
  }

  /**
   * Cleanup old sessions to free space
   */
  async cleanup(force = false): Promise<number> {
    if (!this.db) return 0;

    const storageUsage = await this.getStorageUsage();
    const shouldCleanup = force || storageUsage > this.config.maxStorageSize;

    if (!shouldCleanup) return 0;

    console.log('🧹 Starting storage cleanup...');

    // Get all sessions sorted by date (oldest first)
    const sessions = await this.getAllSessions();
    sessions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let deletedCount = 0;
    const targetDeletionCount = Math.floor(sessions.length * 0.3); // Delete oldest 30%

    for (let i = 0; i < targetDeletionCount && i < sessions.length; i++) {
      try {
        await this.deleteSession(sessions[i].id);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete session ${sessions[i].id}:`, error);
      }
    }

    console.log(`🗑️ Cleaned up ${deletedCount} sessions`);
    return deletedCount;
  }

  /**
   * Delete session and all associated data
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'frames', 'thumbnails'], 'readwrite');
      
      const sessionsStore = transaction.objectStore('sessions');
      const framesStore = transaction.objectStore('frames');
      const thumbnailsStore = transaction.objectStore('thumbnails');

      // Delete session
      sessionsStore.delete(sessionId);

      // Delete associated frames
      const framesIndex = framesStore.index('session_id');
      const framesRequest = framesIndex.getAllKeys(sessionId);
      
      framesRequest.onsuccess = () => {
        const frameKeys = framesRequest.result;
        frameKeys.forEach(key => framesStore.delete(key));
      };

      // Delete associated thumbnails
      const thumbnailsIndex = thumbnailsStore.index('session_id');
      const thumbnailsRequest = thumbnailsIndex.getAllKeys(sessionId);
      
      thumbnailsRequest.onsuccess = () => {
        const thumbnailKeys = thumbnailsRequest.result;
        thumbnailKeys.forEach(key => thumbnailsStore.delete(key));
      };

      transaction.oncomplete = () => {
        console.log(`🗑️ Deleted session: ${sessionId}`);
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Failed to delete session: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<SyncStatus> {
    const sessions = await this.getAllSessions();
    const storageUsage = await this.getStorageUsage();

    const statusCounts = {
      pending: 0,
      synced: 0,
      failed: 0
    };

    sessions.forEach(session => {
      statusCounts[session.sync_status]++;
    });

    return {
      total_sessions: sessions.length,
      pending_sessions: statusCounts.pending,
      synced_sessions: statusCounts.synced,
      failed_sessions: statusCounts.failed,
      last_sync: await this.getMetadata('last_sync'),
      storage_used: storageUsage,
      storage_available: this.config.maxStorageSize - storageUsage
    };
  }

  /**
   * Start automatic sync timer
   */
  startAutoSync(userId: string): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncWithSupabase(userId);
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    }, this.config.syncInterval * 60 * 1000);

    console.log(`🔄 Auto-sync started (every ${this.config.syncInterval} minutes)`);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('⏹️ Auto-sync stopped');
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
    
    this.stopAutoSync();
    console.log('🔒 Video analysis storage closed');
  }
}

// Export singleton instance
export const videoAnalysisStorage = new VideoAnalysisStorage();

// React hook for storage management
export function useVideoAnalysisStorage() {
  return {
    videoAnalysisStorage
  };
}