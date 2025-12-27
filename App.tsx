import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import HistorySidebar from './components/HistorySidebar';
import AnalysisPanel, { Scene, TranscriptItem, TrackedObject } from './components/AnalysisPanel';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import ContentLibrary from './components/ContentLibrary';
import VideoChatArea, { Message, UserMessage, ReasoningMessage, AssistantMessage } from './components/VideoChatArea';
import VideoNameDialog from './components/VideoNameDialog';
import UserProfilePage from './components/UserProfilePage';
import { LogoIcon, UserIcon, FolderIcon, BarChartIcon } from './components/icons';
import ThemeToggle from './components/ThemeToggle';
import { analyzeVideo, generateChatResponseWithRAG, VideoSettingsCallbacks, GenerationSettingsCallbacks } from './lib/gemini';
import { getHistory, saveHistory, ChatSession } from './lib/history';
import { uploadVideo } from './lib/storage';
import './lib/cache-debug'; // Load cache debug utilities
import { uploadVideoToMux } from './lib/mux';
import { Toaster, toast } from './components/ui/toaster';


// Main App Component (authenticated)
const AuthenticatedApp: React.FC = () => {
    const { logout, user, userProfile } = useAuth();
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [rightPanelWidth, setRightPanelWidth] = useState(400);
    const [seekTime, setSeekTime] = useState<number | null>(null);
    const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
    const [activeAnalysisTab, setActiveAnalysisTab] = useState('scene');
    const [activeView, setActiveView] = useState('editor'); // 'editor' | 'content' | 'analytics'

    // State for video player synchronization and settings
    const primaryVideoRef = useRef<HTMLVideoElement>(null);
    const [syncMode, setSyncMode] = useState<'none' | 'video'>('none');
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [frameMode, setFrameMode] = useState(false);
    const [videoDuration, setVideoDuration] = useState(0);

    // Generation settings
    const [generationModel, setGenerationModel] = useState<'wan2.2'>('wan2.2');
    const [generationFrameRange, setGenerationFrameRange] = useState({ start: 0, end: 100, duration: 3.33 });
    const [generationVideoName, setGenerationVideoName] = useState('Current Video');

    const handleSyncChange = () => { setSyncMode(prev => prev === 'video' ? 'none' : 'video'); };

    // State for video and analysis
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [generatedVideoSrc, setGeneratedVideoSrc] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [showVideoNameDialog, setShowVideoNameDialog] = useState(false);
    const [pendingVideoName, setPendingVideoName] = useState('');

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
            try {
                console.log("Attempting to create object URL for video file:", videoFile.name);
                const url = URL.createObjectURL(videoFile);
                setVideoSrc(url);
                setGeneratedVideoSrc(url); // Mirror video for now
                console.log("Successfully created object URL:", url);

                // Cleanup function
                return () => {
                    console.log("Revoking object URL:", url);
                    URL.revokeObjectURL(url);
                };
            } catch (error) {
                console.error("Error creating object URL for video file:", error);
                setAnalysisError(`Failed to load video: ${error instanceof Error ? error.message : String(error)}`);
                setVideoSrc(null);
                setGeneratedVideoSrc(null);
            }
        } else {
            // If videoFile is null, clear the sources
            setVideoSrc(null);
            setGeneratedVideoSrc(null);
            console.log("Video file is null, clearing video sources.");
        }
    }, [videoFile]);



    const handleVideoUpload = async (file: File) => {
        console.log("handleVideoUpload called with file:", file.name, file.type, "Size:", file.size);

        // Check file size (limit to 200MB)
        if (file.size > 200 * 1024 * 1024) {
            setAnalysisError("File too large. Please select a video smaller than 200MB.");
            toast.error('File too large', {
                description: 'Please select a video smaller than 200MB.',
            });
            return;
        }

        try {
            // Upload to Mux if user is authenticated
            if (user?.id) {
                console.log("Uploading video to Mux for user:", user.id);
                try {
                    // Start Mux upload in background (or await if we want to block)
                    // We'll await it for now to ensure we have the ID, though Mux processing takes time
                    const uploadId = await uploadVideoToMux(file, user.id);
                    console.log("✅ Video uploaded to Mux. Upload ID:", uploadId);

                    // Note: We don't get the Playback ID immediately. 
                    // It will be updated via webhook -> Supabase -> Poll/Fetch later
                } catch (uploadError) {
                    console.warn("Mux upload failed, continuing with local storage:", uploadError);
                    setAnalysisError("Video upload failed. Using local preview.");
                }
            }

            const newSession: ChatSession = {
                id: Date.now().toString(),
                name: file.name,
                createdAt: new Date().toISOString(),
                videoName: file.name,
                messages: [],
                scenes: [], transcripts: [], objects: [],
                lastTimestamp: 0,
                // We don't have videoId (UUID) or muxPlaybackId yet
                // Ideally, uploadVideoToMux could return the DB record ID too
            };

            console.log("Creating new session:", newSession.id);
            setHistory(prev => [newSession, ...prev]);
            setCurrentSessionId(newSession.id);

            console.log("Setting video file...");
            setVideoFile(file);
            setAnalysisError(null);
            setActiveTimestamp(0);

            console.log("Video upload process completed successfully for file:", file.name);
            toast.success('Video uploaded', {
                description: `${file.name} is ready for analysis.`,
            });
        } catch (error) {
            console.error("Error in handleVideoUpload:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            setAnalysisError(`Failed to process video upload: ${errorMessage}`);
            toast.error('Upload failed', {
                description: errorMessage,
            });
        }
    };

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

    const handleDeleteSession = (sessionId: string) => {
        console.log('handleDeleteSession called with:', sessionId);
        console.log('Current history:', history);
        const updatedHistory = history.filter(s => s.id !== sessionId);
        console.log('Updated history:', updatedHistory);
        setHistory(updatedHistory);

        // If deleting the active session, switch to another or create new
        if (sessionId === currentSessionId) {
            console.log('Deleting active session, switching...');
            if (updatedHistory.length > 0) {
                handleSelectSession(updatedHistory[0].id, updatedHistory);
            } else {
                // No sessions left, reset to initial state
                console.log('No sessions left, resetting');
                setCurrentSessionId(null);
                setVideoFile(null);
            }
        }
    };

    const findTabForTimestamp = useCallback((time: number, typeHint?: string): string | null => {
        const checks = [
            { tab: 'scene', data: scenes, check: (item: any) => item.timestamp === time },
            { tab: 'transcription', data: transcripts, check: (item: any) => time >= item.startTime && time <= item.endTime },
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

        // If we have a type hint, use it directly instead of searching
        if (typeHint) {
            // Map common type hints to correct tab names
            const tabMap: { [key: string]: string } = {
                'scene': 'scene',
                'transcript': 'transcription',
                'transcription': 'transcription',
                'object': 'object'
            };
            const mappedTab = tabMap[typeHint] || typeHint;
            setActiveAnalysisTab(mappedTab);
        } else {
            // Auto-detect the best tab for this timestamp
            // Priority: transcript (if time falls within range) > scene (exact match) > object (exact match)
            const transcript = transcripts.find(t => time >= t.startTime && time <= t.endTime);
            const scene = scenes.find(s => Math.abs(s.timestamp - time) < 1); // Allow 1 second tolerance
            const object = objects.find(o => Math.abs(o.timestamp - time) < 1); // Allow 1 second tolerance

            if (transcript) {
                setActiveAnalysisTab('transcription');
            } else if (scene) {
                setActiveAnalysisTab('scene');
            } else if (object) {
                setActiveAnalysisTab('object');
            }
        }
    }, [scenes, transcripts, objects]);

    const handleSeeked = useCallback(() => setSeekTime(null), []);

    const handleVideoTimeUpdate = useCallback((time: number) => {
        const activeTranscript = transcripts.find(t => time >= t.startTime && time < t.endTime);
        if (activeTranscript) {
            setActiveTimestamp(prev => (prev !== activeTranscript.startTime ? activeTranscript.startTime : prev));
        } else {
            const allEvents = [...scenes.map(s => s.timestamp), ...objects.map(o => o.timestamp)];
            const lastEvent = allEvents.filter(t => t <= time).sort((a, b) => b - a)[0];
            if (lastEvent !== undefined) setActiveTimestamp(prev => (prev !== lastEvent ? lastEvent : prev));
        }

        // Update session timestamp throttled by time difference
        if (currentSessionId && Math.abs(time - (currentSession?.lastTimestamp || 0)) > 1) {
            setHistory(prev => prev.map(s => s.id === currentSessionId ? { ...s, lastTimestamp: time } : s));
        }
    }, [scenes, objects, transcripts, currentSessionId, currentSession?.lastTimestamp]);

    const handleVideoDurationChange = useCallback((duration: number) => {
        setVideoDuration(duration);
        if (trimEnd === 0) {
            setTrimEnd(duration);
        }
    }, [trimEnd]);


    const handleAnalyze = async () => {
        if (!videoFile || !currentSessionId) {
            setAnalysisError("Please select a video and session.");
            return;
        }

        // Show dialog to get video name
        const defaultName = videoFile.name.replace(/\.[^/.]+$/, ''); // Remove extension
        setPendingVideoName(defaultName);
        setShowVideoNameDialog(true);
    };

    const handleVideoGenerate = async (model: string, frameData: any) => {
        console.log('🎬 Video-to-video generation requested:', { model, frameData });

        // TODO: Implement actual video generation API call
        // This should send the frame data and model selection to the backend
        const userMessage: UserMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: `Generate video using ${model} from frames ${frameData.startFrame}-${frameData.endFrame}`
        };

        const assistantMessage: AssistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: { text: `I'll generate a new video using ${model} to replace frames ${frameData.startFrame}-${frameData.endFrame} from "${frameData.videoName}". The generated video will maintain the same duration (${frameData.duration}s) and frame count (${frameData.totalFrames} frames). Video generation backend is not yet implemented.` }
        };

        if (currentSessionId) {
            setHistory(prev => prev.map(s => s.id === currentSessionId ? {
                ...s,
                messages: [...s.messages, userMessage, assistantMessage]
            } : s));
        }
    };

    const handleVideoNameConfirm = async (videoName: string) => {
        if (!videoFile || !currentSessionId) return;

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
            const result = await analyzeVideo(videoFile, videoName);
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
                    "Checking if settings control is needed.",
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

            // Prepare settings data
            const videoSettings = {
                playbackSpeed,
                trimStart,
                trimEnd,
                syncMode,
                frameMode,
                videoDuration
            };

            const generationSettings = {
                model: generationModel,
                frameRange: generationFrameRange,
                videoName: generationVideoName
            };

            // Settings callbacks
            const settingsCallbacks = {
                onPlaybackSpeedChange: (speed: number) => {
                    setPlaybackSpeed(speed);
                    if (primaryVideoRef.current) {
                        primaryVideoRef.current.playbackRate = speed;
                    }
                },
                onTrimRangeChange: (start: number, end: number) => {
                    setTrimStart(start);
                    setTrimEnd(end);
                },
                onSyncModeChange: (mode: 'video' | 'none') => {
                    setSyncMode(mode);
                },
                onFrameModeChange: (enabled: boolean) => {
                    setFrameMode(enabled);
                }
            };

            const generationCallbacks = {
                onModelChange: (model: 'wan2.2') => {
                    setGenerationModel(model);
                },
                onFrameRangeChange: (start: number, end: number) => {
                    const duration = (end - start) / 30; // Assuming 30 FPS
                    setGenerationFrameRange({ start, end, duration });
                },
                onVideoNameChange: (name: string) => {
                    setGenerationVideoName(name);
                }
            };

            const assistantText = await generateChatResponseWithRAG(
                content,
                context,
                videoSettings,
                generationSettings,
                settingsCallbacks,
                generationCallbacks
            );

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
        <div className="min-h-screen min-w-screen bg-background flex flex-col">
            <header className="flex-shrink-0 bg-panel-bg border-b border-border px-4 h-[65px] flex items-center justify-between">
                <div className="h-9 w-9 rounded-full bg-background flex items-center justify-center">
                    <LogoIcon size={20} />
                </div>
                <div className="flex items-center space-x-6">
                    <ThemeToggle />
                    <span className="text-sm text-muted-foreground">
                        Welcome, {userProfile?.name || user?.email}
                    </span>
                    <button
                        onClick={() => setActiveView('profile')}
                        className="p-2 rounded-full hover:bg-accent"
                        aria-label="User Profile"
                        title="View Profile"
                    >
                        <UserIcon className="h-6 w-6" />
                    </button>
                </div>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <HistorySidebar
                    isHistoryOpen={isHistoryOpen}
                    toggleHistory={toggleHistory}
                    sessions={history}
                    activeSessionId={currentSessionId}
                    onSelectSession={handleSelectSession}
                    onDeleteSession={handleDeleteSession}
                    activeView={activeView}
                    onSelectView={setActiveView}
                />

                {activeView === 'editor' ? (
                    <>
                        <VideoChatArea
                            jumpToTimestamp={jumpToTimestamp}
                            seekTime={seekTime}
                            onSeeked={handleSeeked}
                            scenes={scenes}
                            transcripts={transcripts}
                            objects={objects}
                            onTimeUpdate={handleVideoTimeUpdate}
                            onVideoDurationChange={handleVideoDurationChange}
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
                            onVideoGenerate={handleVideoGenerate}
                            videoSettings={{
                                playbackSpeed,
                                trimStart,
                                trimEnd,
                                syncMode,
                                frameMode,
                                videoDuration
                            }}
                            generationSettings={{
                                model: generationModel,
                                frameRange: generationFrameRange,
                                videoName: generationVideoName
                            }}
                            onPlaybackSpeedChange={setPlaybackSpeed}
                            onTrimRangeChange={(start, end) => { setTrimStart(start); setTrimEnd(end); }}
                            onSyncModeChange={setSyncMode}
                            onFrameModeChange={setFrameMode}
                            onGenerationModelChange={setGenerationModel}
                            onGenerationFrameRangeChange={(start, end) => {
                                const duration = (end - start) / 30;
                                setGenerationFrameRange({ start, end, duration });
                            }}
                            onGenerationVideoNameChange={setGenerationVideoName}
                        />

                        <div
                            onMouseDown={handleMouseDown}
                            className="w-1.5 cursor-col-resize bg-border hover:bg-accent transition-colors flex-shrink-0"
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
                            playbackId={currentSession?.muxPlaybackId || null}
                        />
                    </>
                ) : activeView === 'content' ? (
                    <ContentLibrary />
                ) : activeView === 'analytics' ? (
                    <AnalyticsDashboard />
                ) : (
                    <UserProfilePage onBack={() => setActiveView('editor')} />
                )}
            </div>

            {/* Video Name Dialog */}
            <VideoNameDialog
                open={showVideoNameDialog}
                onOpenChange={setShowVideoNameDialog}
                onConfirm={handleVideoNameConfirm}
                defaultName={pendingVideoName}
            />
        </div>
    );
};

// App Wrapper with Authentication
const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppContent />
                <Toaster />
            </AuthProvider>
        </ThemeProvider>
    );
};

// App Content Component (handles auth state)
const AppContent: React.FC = () => {
    const { isAuthenticated, showLogin, hideLogin, isLoginVisible } = useAuth();

    if (!isAuthenticated) {
        if (isLoginVisible) {
            return <AuthPage onBack={hideLogin} />;
        }
        return <LandingPage onLogin={showLogin} />;
    }

    return <AuthenticatedApp />;
};

export default App;
