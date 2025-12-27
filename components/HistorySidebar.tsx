import React, { useState } from 'react';
import { cn, formatDate } from '../lib/utils';
import { HistoryIcon, ChevronLeftIcon, ChevronRightIcon, VideoIcon, TrashIcon, EditIcon, FolderIcon, BarChartIcon, VideoAIIcon, UserIcon } from './icons';
import { ChatSession } from '../lib/history';
import DeleteHistoryModal from './DeleteHistoryModal';
import { useDeleteHistoryModal } from '../hooks/useDeleteHistoryModal';
import { generateThumbnailUrl, hasThumbnailSupport } from '../lib/thumbnail-utils';


interface HistorySidebarProps {
    isHistoryOpen: boolean;
    toggleHistory: () => void;
    sessions: ChatSession[];
    activeSessionId: string | null;
    onSelectSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
    activeView: string;
    onSelectView: (view: string) => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ isHistoryOpen, toggleHistory, sessions, activeSessionId, onSelectSession, onDeleteSession, activeView, onSelectView }) => {
    const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
    const { isOpen, deleteItem, openModal, closeModal, confirmDelete } = useDeleteHistoryModal();

    const handleDelete = (e: React.MouseEvent, sessionId: string) => {
        console.log('=== DELETE BUTTON CLICKED ===');
        console.log('Session ID:', sessionId);
        console.log('Event:', e);
        e.stopPropagation();
        e.preventDefault();

        // Find the session to get message count
        const session = sessions.find(s => s.id === sessionId);
        const messageCount = session?.messages?.length || 0;

        openModal({
            id: sessionId,
            type: 'conversation',
            count: messageCount
        });
    };

    const handleConfirmDelete = () => {
        confirmDelete((item) => {
            console.log('Calling onDeleteSession with:', item.id);
            onDeleteSession(item.id);
        });
    };

    return (
        <aside className={cn(
            "border-r border-border flex flex-col transition-all duration-300 ease-in-out relative flex-shrink-0",
            isHistoryOpen ? 'w-64 bg-card' : 'w-16 bg-panel-bg'
        )}>
            <div className="flex items-center justify-between p-4 border-b border-border h-[65px] flex-shrink-0">
                <div className={cn("flex items-center gap-2", isHistoryOpen ? "" : "justify-center w-full")}>
                    <HistoryIcon className="text-foreground h-6 w-6 flex-shrink-0" />
                    <span className={cn("font-semibold text-foreground transition-opacity", isHistoryOpen ? "opacity-100" : "opacity-0 w-0")}>History</span>
                </div>

                {isHistoryOpen && (
                    <button
                        onClick={toggleHistory}
                        className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                        title="Collapse sidebar"
                    >
                        <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                )}
            </div>

            {!isHistoryOpen && (
                <button
                    onClick={toggleHistory}
                    className="absolute top-5 right-[-12px] z-50 p-0.5 rounded-full bg-card border border-border text-muted-foreground hover:bg-secondary"
                    title="Expand sidebar"
                >
                    <ChevronRightIcon className="h-4 w-4" />
                </button>
            )}

            {/* New Main Menu */}
            <div className="flex flex-col gap-1 p-2">
                {[
                    { id: 'editor', label: 'Editor', icon: VideoAIIcon },
                    { id: 'content', label: 'Content', icon: FolderIcon },
                    { id: 'analytics', label: 'Analytics', icon: BarChartIcon },
                ].map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onSelectView(item.id)}
                        className={cn(
                            "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                            activeView === item.id
                                ? "bg-primary/10 text-primary"
                                : "text-foreground hover:bg-secondary",
                            !isHistoryOpen && "justify-center"
                        )}
                        title={item.label}
                    >
                        <item.icon className={cn("w-5 h-5 flex-shrink-0", activeView === item.id ? "text-primary" : "text-muted-foreground")} />
                        {isHistoryOpen && <span className="text-sm font-medium">{item.label}</span>}
                    </button>
                ))}
            </div>

            {/* Divider */}
            <div className="mx-4 my-2 border-b border-border flex-shrink-0" />

            {/* History Section Header */}
            {isHistoryOpen && (
                <div className="px-4 py-2 flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    History
                </div>
            )}

            <div className="flex-grow p-2 space-y-1 overflow-y-auto">
                {sessions.map((session) => (
                    <div
                        key={session.id}
                        className="relative group"
                        onMouseEnter={() => {
                            setHoveredSessionId(session.id);
                        }}
                        onMouseLeave={() => {
                            setHoveredSessionId(null);
                        }}
                    >
                        <button
                            onClick={() => onSelectSession(session.id)}
                            title={session.name}
                            className={cn(
                                "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                                session.id === activeSessionId
                                    ? "bg-primary/10 text-primary"
                                    : "text-foreground hover:bg-secondary",
                                !isHistoryOpen && "justify-center",
                                isHistoryOpen && hoveredSessionId === session.id && "pr-12"
                            )}
                        >
                            {/* Thumbnail or Video Icon */}
                            {session.muxPlaybackId ? (
                                <div className="w-10 h-7 rounded overflow-hidden bg-muted flex-shrink-0">
                                    <img
                                        src={generateThumbnailUrl(session.muxPlaybackId, 0, 'sidebar')}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            // Fallback to video icon on error
                                            (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                </div>
                            ) : (
                                <VideoIcon className={cn("w-5 h-5 flex-shrink-0", session.id === activeSessionId ? "text-primary" : "text-muted-foreground")} />
                            )}
                            {isHistoryOpen && (
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-sm font-medium truncate">{session.name}</p>
                                    <p className={cn(
                                        "text-xs truncate",
                                        session.id === activeSessionId ? "text-primary" : "text-muted-foreground"
                                    )}>{formatDate(session.createdAt)}</p>
                                </div>
                            )}
                        </button>
                        {isHistoryOpen && hoveredSessionId === session.id && (
                            <div
                                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-auto"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                }}
                            >
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        handleDelete(e, session.id);
                                    }}
                                    className="p-1.5 rounded-md bg-white hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors shadow-md border border-border cursor-pointer"
                                    title="Delete conversation"
                                    type="button"
                                >
                                    <TrashIcon className="w-4 h-4 pointer-events-none" />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Profile Section at Bottom */}
            <div className="p-2 border-t border-border mt-auto flex-shrink-0">
                <button
                    onClick={() => onSelectView('profile')}
                    className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                        activeView === 'profile'
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-secondary",
                        !isHistoryOpen && "justify-center"
                    )}
                    title="User Profile"
                >
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/20 flex-shrink-0">
                        <UserIcon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    {isHistoryOpen && <span className="text-sm font-medium">Profile & Settings</span>}
                </button>
            </div>

            <DeleteHistoryModal
                isOpen={isOpen}
                onClose={closeModal}
                onConfirm={handleConfirmDelete}
                itemType={deleteItem?.type}
                itemCount={deleteItem?.count}
            />
        </aside >
    );
};

export default HistorySidebar;