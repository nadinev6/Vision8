/**
 * DEPRECATED: IndexedDB utilities - Vision8 now uses Elasticsearch
 * This file is kept for reference but should not be used in production
 * All data storage is now handled by the backend Elasticsearch service
 */

import { getDatabaseInfo, clearAllData } from './indexeddb';

// Export all IndexedDB data as JSON
export async function exportIndexedDBData(): Promise<string> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('vision8-video-db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['scene_segments'], 'readonly');
    const objectStore = transaction.objectStore('scene_segments');
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        documents: request.result
      };
      db.close();
      resolve(JSON.stringify(data, null, 2));
    };

    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// Import data from JSON export
export async function importIndexedDBData(jsonData: string): Promise<void> {
  const data = JSON.parse(jsonData);
  
  if (!data.documents || !Array.isArray(data.documents)) {
    throw new Error('Invalid data format');
  }

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('vision8-video-db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['scene_segments'], 'readwrite');
    const objectStore = transaction.objectStore('scene_segments');

    data.documents.forEach((doc: any) => {
      objectStore.put(doc);
    });

    transaction.oncomplete = () => {
      console.log(`✅ Imported ${data.documents.length} documents`);
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

// Download data as JSON file
export async function downloadBackup(): Promise<void> {
  const jsonData = await exportIndexedDBData();
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vision8-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('✅ Backup downloaded');
}

// Upload and restore from JSON file
export async function uploadBackup(file: File): Promise<void> {
  const text = await file.text();
  await importIndexedDBData(text);
  console.log('✅ Backup restored');
}

// Get database statistics
export async function getStats(): Promise<void> {
  const info = await getDatabaseInfo();
  console.log('📊 IndexedDB Statistics:');
  console.log(`  Total documents: ${info.documentCount}`);
  console.log(`  Videos indexed: ${info.videos.length}`);
  console.log(`  Video IDs:`, info.videos);
}

// Clear all data (use with caution!)
export async function resetDatabase(): Promise<void> {
  if (confirm('⚠️ This will delete ALL video analysis data. Are you sure?')) {
    await clearAllData();
    console.log('✅ Database reset complete');
  }
}

// DEPRECATED: IndexedDB utilities no longer exposed
// Vision8 now uses Elasticsearch for all data storage
if (typeof window !== 'undefined') {
  console.log('ℹ️ IndexedDB utilities are deprecated - Vision8 now uses Elasticsearch');
  console.log('📊 For data management, use the backend API endpoints');
  console.log('🔍 Search functionality is handled by /api/v1/video/analysis/search');
}
