import { Message } from '../components/VideoChatArea';
import { Scene, TranscriptItem, TrackedObject } from '../components/AnalysisPanel';

export interface ChatSession {
    id: string;
    name: string;
    createdAt: string;
    videoName: string | null;
    messages: Message[];
    scenes: Scene[];
    transcripts: TranscriptItem[];
    objects: TrackedObject[];
    lastTimestamp: number;
    videoId?: string;
    muxPlaybackId?: string;
    generatedVideos?: GeneratedVideo[];
}

export interface GeneratedVideo {
    id: string;
    url: string;
    prompt: string;
    model: string;
    createdAt: string;
    muxAssetId?: string;
}

const HISTORY_KEY = 'vision8-chat-history';

export function getHistory(): ChatSession[] {
    try {
        const rawHistory = localStorage.getItem(HISTORY_KEY);
        if (!rawHistory) return [];
        const history = JSON.parse(rawHistory) as ChatSession[];
        return history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
        console.error("Failed to parse chat history from localStorage", error);
        return [];
    }
}

export function saveHistory(history: ChatSession[]): void {
    try {
        const rawHistory = JSON.stringify(history);
        localStorage.setItem(HISTORY_KEY, rawHistory);
    } catch (error) {
        console.error("Failed to save chat history to localStorage", error);
    }
}

export function deleteSession(sessionId: string): ChatSession[] {
    try {
        const history = getHistory();
        const updatedHistory = history.filter(session => session.id !== sessionId);
        saveHistory(updatedHistory);
        return updatedHistory;
    } catch (error) {
        console.error("Failed to delete session from history", error);
        return getHistory();
    }
}
