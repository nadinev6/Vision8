import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';

export interface FirebaseChatSession {
  id: string;
  userId: string;
  name: string;
  videoUrl?: string;
  videoName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messages: FirebaseChatMessage[];
}

export interface FirebaseChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'reasoning';
  content: any;
  timestamp: Timestamp;
}

export const createChatSession = async (
  userId: string, 
  name: string, 
  videoUrl?: string,
  videoName?: string
): Promise<string> => {
  try {
    const sessionData = {
      userId,
      name,
      videoUrl: videoUrl || null,
      videoName: videoName || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messages: []
    };

    const docRef = await addDoc(collection(db, 'chatSessions'), sessionData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating chat session:', error);
    throw error;
  }
};

export const getChatSessions = async (userId: string): Promise<FirebaseChatSession[]> => {
  try {
    const q = query(
      collection(db, 'chatSessions'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const sessions: FirebaseChatSession[] = [];

    querySnapshot.forEach((doc) => {
      sessions.push({
        id: doc.id,
        ...doc.data()
      } as FirebaseChatSession);
    });

    return sessions;
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    return [];
  }
};

export const getChatSession = async (sessionId: string): Promise<FirebaseChatSession | null> => {
  try {
    const docRef = doc(db, 'chatSessions', sessionId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as FirebaseChatSession;
    }

    return null;
  } catch (error) {
    console.error('Error getting chat session:', error);
    return null;
  }
};

export const addMessageToSession = async (
  sessionId: string,
  message: Omit<FirebaseChatMessage, 'id' | 'timestamp'>
): Promise<void> => {
  try {
    const sessionRef = doc(db, 'chatSessions', sessionId);
    const session = await getDoc(sessionRef);

    if (session.exists()) {
      const currentMessages = session.data().messages || [];
      const newMessage: FirebaseChatMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Timestamp.now()
      };

      await updateDoc(sessionRef, {
        messages: [...currentMessages, newMessage],
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error adding message to session:', error);
    throw error;
  }
};

export const updateChatSession = async (
  sessionId: string,
  updates: Partial<FirebaseChatSession>
): Promise<void> => {
  try {
    const sessionRef = doc(db, 'chatSessions', sessionId);
    await updateDoc(sessionRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating chat session:', error);
    throw error;
  }
};

export const deleteChatSession = async (sessionId: string): Promise<void> => {
  try {
    const sessionRef = doc(db, 'chatSessions', sessionId);
    await deleteDoc(sessionRef);
  } catch (error) {
    console.error('Error deleting chat session:', error);
    throw error;
  }
};