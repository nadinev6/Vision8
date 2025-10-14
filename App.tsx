import React, { useState, useCallback, useEffect, useRef } from 'react';
import HistorySidebar from './components/HistorySidebar';
import AnalysisPanel, { Scene, TranscriptItem, TrackedObject } from './components/AnalysisPanel';
import VideoChatArea, { Message, UserMessage, ReasoningMessage, AssistantMessage } from './components/VideoChatArea';
import { LogoIcon, UserIcon } from './components/icons';
import { analyzeVideo, generateChatResponseWithRAG } from './lib/gemini';
import { getHistory, saveHistory, ChatSession } from './lib/history';


const App: React.FC = () => {
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [rightPanelWidth, setRightPanelWidth] = useState(400);
    const [seekTime, setSeekTime] = useState<number | null>(null);
    const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
    const [activeAnalysisTab, setActiveAnalysisTab] = useState('scene');
    
    // State for video player synchronization
    const primaryVideoRef = useRef<HTMLVideoElement>(null);
    const [syncMode, setSyncMode] = useState<'none' | 'video'>('none');
    const handleSyncChange = () => { setSyncMode(prev => prev === 'video' ? 'none' : 'video'); };

    // State for video and analysis
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [generatedVideoSrc, setGeneratedVideoSrc] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    
    // State for history and sessions
    const [history, setHistory] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

    // Derive current session data for rendering
    const currentSession = history.find(session => session.id === currentSessionId);
    const messages = currentSession?.messages || [];
    const scenes = currentSession?.scenes || [];
    const transcripts = currentSession?.transcripts || [];
    const objects = currentSession?.objects || [];

    // Load history from localStorage on initial mount
    useEffect(() => {
        const loadedHistory = getHistory();
        setHistory(loadedHistory);
        if (loadedHistory.length > 0) {
            handleSelectSession(loadedHistory[0].id, loadedHistory);
        }
    }, []);

    useEffect(() => {
        if (videoFile) {
            const url = URL.createObjectURL(videoFile);
            setVideoSrc(url);
            setGeneratedVideoSrc(url); // Mirror video for now

            // Cleanup function
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            // If videoFile is null, clear the sources
            setVideoSrc(null);
            setGeneratedVideoSrc(null);
        }
    }, [videoFile]);

    // Save history to localStorage whenever it changes
    useEffect(() => {
        if (history.length > 0) {
            saveHistory(history);
        }
    }, [history]);

    const handleSelectSession = (id: string, historySource?: ChatSession[]) => {
        const sessions = historySource || history;
        const sessionToLoad = sessions.find(s => s.id === id);
        if (sessionToLoad) {
            setCurrentSessionId(id);
            setVideoFile(null); // This will trigger useEffect to clear video sources
            setAnalysisError(null);
            setSyncMode('none'); // Reset sync mode on session change
            setActiveTimestamp(sessionToLoad.lastTimestamp);
            setSeekTime(sessionToLoad.lastTimestamp);
        }
    };

    const toggleHistory = () => setIsHistoryOpen(prev => !prev);

    const findTabForTimestamp = useCallback((time: number, typeHint?: string): string | null => {
        const checks = [
            { tab: 'scene', data: scenes, check: (item: any) => item.timestamp === time },
            { tab: 'transcript', data: transcripts, check: (item: any) => time >= item.startTime && time <= item.endTime },
            { tab: 'object', data: objects, check: (item: any) => item.timestamp === time },
        ];
        if (typeHint) {
            const hintedCheck = checks.find(c => c.tab === typeHint);
            if (hintedCheck) {
                 checks.unshift(hintedCheck);
            }
        }
        return checks.find(c => c.data.some(c.check))?.tab || null;
    }, [scenes, transcripts, objects]);

    const jumpToTimestamp = useCallback((time: number, typeHint?: string) => {
        setSeekTime(time);
        setActiveTimestamp(time);
        const targetTab = findTabForTimestamp(time, typeHint);
        if (targetTab) setActiveAnalysisTab(targetTab);
    }, [findTabForTimestamp]);

    const handleSeeked = useCallback(() => setSeekTime(null), []);

    const handleVideoTimeUpdate = useCallback((time: number) => {
        const activeTranscript = transcripts.find(t => time >= t.startTime && time < t.endTime);
        if (activeTranscript) {
            setActiveTimestamp(prev => (prev !== activeTranscript.startTime ? activeTranscript.startTime : prev));
        } else {
             const allEvents = [...scenes.map(s => s.timestamp), ...objects.map(o => o.timestamp)];
             const lastEvent = allEvents.filter(t => t <= time).sort((a,b) => b-a)[0];
             if (lastEvent !== undefined) setActiveTimestamp(prev => (prev !== lastEvent ? lastEvent : prev));
        }
       
        // Update session timestamp throttled by time difference
        if (currentSessionId && Math.abs(time - (currentSession?.lastTimestamp || 0)) > 1) {
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, lastTimestamp: time } : s));
        }
    }, [scenes, objects, transcripts, currentSessionId, currentSession?.lastTimestamp]);
    
    const handleVideoUpload = (file: File) => {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            name: file.name,
            createdAt: new Date().toISOString(),
            videoName: file.name,
            messages: [],
            scenes: [], transcripts: [], objects: [],
            lastTimestamp: 0,
        };
        
        setHistory(prev => [newSession, ...prev]);
        setCurrentSessionId(newSession.id);
        
        setVideoFile(file);
        setAnalysisError(null);
        setActiveTimestamp(0);
    };

    const handleAnalyze = async () => {
        if (!videoFile || !currentSessionId) {
            setAnalysisError("Please select a video and session.");
            return;
        }

        const reasoningId = `reasoning-${Date.now()}`;
        const reasoningMessage: ReasoningMessage = {
            id: reasoningId,
            role: 'reasoning',
            content: {
                duration: 0,
                steps: [
                    "Initializing video analysis pipeline.",
                    "Extracting representative frames from the video stream.",
                    "Processing visual data for scene detection and object recognition.",
                    "Analyzing audio track for transcription.",
                    "Compiling and structuring the final analysis data.",
                ]
            }
        };
        
        setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, reasoningMessage] } : s));
        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const result = await analyzeVideo(videoFile);
            const summaryText = `I've finished analyzing the video. I identified ${result.scenes.length} distinct scenes, ${result.transcripts.length} transcript entries, and found ${result.objects.length} unique objects. You can now explore the details in the panel on the right or ask me specific questions about the content.`;
            const assistantMessage: AssistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: { text: summaryText }
            };
            
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, ...result, messages: [...s.messages.filter(m => m.id !== reasoningId), assistantMessage] } : s));
        } catch (error: any) {
            console.error("Video analysis failed:", error);
            const errorMessage = error.message || "Failed to analyze video.";
            setAnalysisError(errorMessage);
            
            const errorAssistantMessage: AssistantMessage = {
                id: `assistant-error-${Date.now()}`,
                role: 'assistant',
                content: { text: `I'm sorry, but I encountered an error during the analysis: "${errorMessage}". Please check the video file or try again.` }
            };
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages.filter(m => m.id !== reasoningId), errorAssistantMessage] } : s));
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const handleSendMessage = async (content: string) => {
        if (!currentSessionId || !currentSession) return;
        const userMessage: UserMessage = { id: `user-${Date.now()}`, role: 'user', content };
    
        setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, userMessage] } : s));

        const reasoningId = `reasoning-${Date.now()}`;
        const reasoningMessage: ReasoningMessage = {
            id: reasoningId,
            role: 'reasoning',
            content: {
                duration: 0,
                steps: [
                    "Interpreting user query for tool use.",
                    "Calling video search tool with relevant query.",
                    "Retrieving context from video analysis data.",
                    "Generating final response based on retrieved context.",
                ]
            }
        };
        setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, reasoningMessage] } : s));
    
        try {
            const context = {
                scenes: currentSession.scenes,
                transcripts: currentSession.transcripts,
                objects: currentSession.objects,
            };
    
            const assistantText = await generateChatResponseWithRAG(content, context);
    
            const assistantMessage: AssistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: { text: assistantText }
            };
            
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages.filter(m => m.id !== reasoningId), assistantMessage] } : s));
    
        } catch (error: any) {
            console.error("Chat response failed:", error);
            const errorMessage = error.message || "Failed to get a response.";
            const errorAssistantMessage: AssistantMessage = {
                id: `assistant-error-${Date.now()}`,
                role: 'assistant',
                content: { text: `Sorry, I encountered an error: "${errorMessage}". Please try again.` }
            };
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages.filter(m => m.id !== reasoningId), errorAssistantMessage] } : s));
        }
    };

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        const startWidth = rightPanelWidth;
        const startPosition = e.clientX;
        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = startWidth - (moveEvent.clientX - startPosition);
            if (newWidth > 300 && newWidth < 800) setRightPanelWidth(newWidth);
        };
        const handleMouseUp = () => {
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [rightPanelWidth]);

    return (
        <div className="h-screen w-screen bg-gray-50 flex flex-col">
            <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 h-[65px] flex items-center justify-between">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
                    <LogoIcon className="text-gray-800" size={20} />
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="User Login">
                    <UserIcon className="h-6 w-6 text-gray-600" />
                </button>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <HistorySidebar 
                    isHistoryOpen={isHistoryOpen} 
                    toggleHistory={toggleHistory}
                    sessions={history}
                    activeSessionId={currentSessionId}
                    onSelectSession={handleSelectSession}
                />
                
                <VideoChatArea 
                    jumpToTimestamp={jumpToTimestamp}
                    seekTime={seekTime}
                    onSeeked={handleSeeked}
                    scenes={scenes}
                    transcripts={transcripts}
                    objects={objects}
                    onTimeUpdate={handleVideoTimeUpdate}
                    videoSrc={videoSrc}
                    generatedVideoSrc={generatedVideoSrc}
                    onVideoUpload={handleVideoUpload}
                    onAnalyze={handleAnalyze}
                    isAnalyzing={isAnalyzing}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    primaryVideoRef={primaryVideoRef}
                    syncMode={syncMode}
                    onSyncChange={handleSyncChange}
                />

                <div
                    onMouseDown={handleMouseDown}
                    className="w-1.5 cursor-col-resize bg-gray-100 hover:bg-blue-200 transition-colors flex-shrink-0"
                    title="Resize panel"
                />

                <AnalysisPanel 
                    rightPanelWidth={rightPanelWidth} 
                    scenes={scenes}
                    transcripts={transcripts}
                    objects={objects}
                    onTimestampClick={jumpToTimestamp}
                    activeTimestamp={activeTimestamp}
                    activeTab={activeAnalysisTab}
                    onTabChange={setActiveAnalysisTab}
                    isAnalyzing={isAnalyzing}
                    error={analysisError}
                />
            </div>
        </div>
    );
};

export default App;