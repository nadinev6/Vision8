import React from 'react';
import { cn, formatDate } from '../lib/utils';
import { HistoryIcon, ChevronLeftIcon, ChevronRightIcon, VideoIcon } from './icons';
import { ChatSession } from '../lib/history';


interface HistorySidebarProps {
    isHistoryOpen: boolean;
    toggleHistory: () => void;
    sessions: ChatSession[];
    activeSessionId: string | null;
    onSelectSession: (id: string) => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ isHistoryOpen, toggleHistory, sessions, activeSessionId, onSelectSession }) => {
    return (
        <aside className={cn(
            "bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative flex-shrink-0",
            isHistoryOpen ? 'w-64' : 'w-16'
        )}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 h-[65px] flex-shrink-0">
                <div className={cn("flex items-center gap-2", isHistoryOpen ? "" : "justify-center w-full")}>
                    <HistoryIcon className="text-gray-700 h-6 w-6 flex-shrink-0" />
                    <span className={cn("font-semibold text-gray-800 transition-opacity", isHistoryOpen ? "opacity-100" : "opacity-0 w-0")}>History</span>
                </div>

                {isHistoryOpen && (
                    <button
                        onClick={toggleHistory}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
                        title="Collapse sidebar"
                    >
                        <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                )}
            </div>

            {!isHistoryOpen && (
                <button
                    onClick={toggleHistory}
                    className="absolute top-5 right-[-12px] z-10 p-0.5 rounded-full bg-white border border-gray-300 text-gray-500 hover:bg-gray-100"
                    title="Expand sidebar"
                >
                    <ChevronRightIcon className="h-4 w-4" />
                </button>
            )}

            <div className="flex-grow p-2 space-y-1 overflow-y-auto">
                {sessions.map((session) => (
                    <button
                        key={session.id}
                        onClick={() => onSelectSession(session.id)}
                        title={session.name}
                        className={cn(
                            "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                            session.id === activeSessionId
                                ? "bg-blue-100 text-blue-800"
                                : "text-gray-700 hover:bg-gray-100",
                            !isHistoryOpen && "justify-center"
                        )}
                    >
                        <VideoIcon className={cn("w-5 h-5 flex-shrink-0", session.id === activeSessionId ? "text-blue-600" : "text-gray-500")} />
                        {isHistoryOpen && (
                            <div className="flex-1 overflow-hidden">
                                <p className="text-sm font-medium truncate">{session.name}</p>
                                <p className={cn(
                                    "text-xs truncate",
                                    session.id === activeSessionId ? "text-blue-600" : "text-gray-500"
                                )}>{formatDate(session.createdAt)}</p>
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </aside>
    );
};

export default HistorySidebar;