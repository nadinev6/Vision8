import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { storage, db } from './firebase';

export const uploadVideo = async (
  file: File, 
  userId: string, 
  fileName?: string
): Promise<string> => {
  try {
    const videoFileName = fileName || `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `videos/${userId}/${videoFileName}`);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    // Update user's video files list in Firestore
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      videoFiles: arrayUnion(downloadURL)
    });
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading video:', error);
    throw error;
  }
};

export const deleteVideo = async (videoUrl: string, userId: string): Promise<void> => {
  try {
    // Create a reference from the URL
    const videoRef = ref(storage, videoUrl);
    
    // Delete the file
    await deleteObject(videoRef);
    
    // Remove from user's video files list
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      videoFiles: arrayRemove(videoUrl)
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    throw error;
  }
};

export const getUserVideos = async (userId: string): Promise<string[]> => {
  try {
    const videosRef = ref(storage, `videos/${userId}`);
    const result = await listAll(videosRef);
    
    const videoUrls = await Promise.all(
      result.items.map(item => getDownloadURL(item))
    );
    
    return videoUrls;
  } catch (error) {
    console.error('Error getting user videos:', error);
    return [];
  }
};