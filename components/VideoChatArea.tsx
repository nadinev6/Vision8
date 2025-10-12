import React, { useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { AssistantIcon, UserIcon } from './icons';
import AIChatInput from './AIChatInput';
import VideoPlayerPro from './VideoPlayerPro';
import AIThinkingBlock from './AIThinkingBlock';

// --- TYPE DEFINITIONS ---
type UserMessage = {
  id: string;
  role: 'user';
  content: string;
}

type CitationReference = {
    id: number;
    type: 'scene' | 'transcription' | 'object';
    title: string;
    timestamp: string;
    description: string;
    originalIndex: number;
}

type ReasoningMessageContent = {
    duration: number;
    steps: string[];
}

export type ReasoningMessage = {
    id: string;
    role: 'reasoning';
    content: ReasoningMessageContent;
}

type AssistantMessageContent = {
  text: string;
  references?: CitationReference[];
}

type AssistantMessage = {
  id: string;
  role: 'assistant';
  content: AssistantMessageContent;
}

type Message = UserMessage | ReasoningMessage | AssistantMessage;

// --- MOCK DATA ---
const initialMessages: Message[] = [
    {
        id: '1',
        role: 'user',
        content: "Can you analyze this quarterly report video for key financial moments?",
    },
    {
        id: '2',
        role: 'reasoning',
        content: {
            duration: 4,
            steps: [
                "Let me think about this problem step by step.",
                "First, I need to understand what the user is asking for. They want me to identify key financial moments in the video.",
                "I will approach this by analyzing the audio for keywords related to finance, transcribing the audio, and correlating those transcripts with visual cues like charts or graphs.",
                "This seems like a robust approach to fulfill the user's request.",
                "Okay, first I need to understand what HextaUI is. It seems to be a UI library or framework, likely for web development. I should check the web results for any mentions of HextaUI.",
                "Looking at the web results, I see that HextaUI is mentioned in several contexts. It's described as a collection of modern, responsive, and customizable UI components for Next.js. It seems to be designed to help developers build websites more efficiently.",
                "I should look for more specific details. The results mention that HextaUI provides components that can be copied, adapted, and personalized. It also mentions that it's open-source and has a community of contributors."
            ],
        }
    },
    {
        id: '3',
        role: 'assistant',
        content: {
            text: 'Based on the analysis, the key moment appears at 01:23 where the presenter discusses Q3 revenue projections [1]. The overall sentiment is positive, especially noted during the summary at 04:51 [2].',
            references: [
                { id: 1, type: 'scene', title: "Q3 Revenue Projections", timestamp: "01:23", description: "Presenter discusses upward trend in Q3 revenue.", originalIndex: 5 },
                { id: 2, type: 'transcription', title: "Positive Sentiment", timestamp: "04:51", description: "Transcript mentions 'significant growth' and 'optimistic outlook'.", originalIndex: 12 },
            ],
        }
    }
];

// --- CHILD COMPONENTS ---

const InlineCitation: React.FC<{ reference: CitationReference, onReferenceClick: (ref: CitationReference) => void }> = ({ reference, onReferenceClick }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div 
            className="relative inline-block"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <button
                onClick={() => onReferenceClick(reference)}
                className="relative -top-0.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-100 text-center text-xs font-bold text-blue-700 ring-1 ring-white transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500"
                title={`View reference ${reference.id}`}
            >
                {reference.id}
            </button>
            {isOpen && (
                 <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs z-20">
                     <div className="w-full rounded-lg border bg-white p-3 shadow-lg ring-1 ring-black ring-opacity-5">
                        <div className="w-full text-left">
                            <p className="text-sm font-bold capitalize">{reference.type}: {reference.title}</p>
                            <p className="text-xs text-gray-500 font-mono">Timestamp: {reference.timestamp}</p>
                            <p className="mt-1 text-sm text-gray-600">
                                {reference.description}
                            </p>
                        </div>
                     </div>
                 </div>
            )}
        </div>
    )
};


const AIMessage: React.FC<{ content: AssistantMessageContent, onReferenceClick: (ref: CitationReference) => void }> = ({ content, onReferenceClick }) => {
    
    const parsedContent = useMemo(() => {
        if (!content.text) return null;

        const parts = content.text.split(/(\[\d+\])/g);
        return parts.map((part, index) => {
            const match = part.match(/\[(\d+)\]/);
            if (match) {
                const citationNumber = parseInt(match[1], 10);
                const reference = content.references?.find(ref => ref.id === citationNumber);
                if (reference) {
                    return (
                        <InlineCitation
                            key={index}
                            reference={reference}
                            onReferenceClick={onReferenceClick}
                        />
                    );
                }
            }
            return <React.Fragment key={index}>{part.replace(/\[\d+\]/g, '')}</React.Fragment>;
        });
    }, [content.text, content.references, onReferenceClick]);


    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full border bg-white flex items-center justify-center">
                <AssistantIcon className="h-5 w-5 text-gray-600" />
            </div>
            <div className="flex-1 space-y-2">
                <div className="rounded-2xl bg-gray-100 p-3 text-sm text-gray-800 shadow-sm max-w-3xl">
                    <p className="leading-relaxed">{parsedContent}</p>
                </div>
            </div>
        </div>
    );
};

const UserMessageBubble: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="flex items-start justify-end gap-3">
            <div className="rounded-2xl bg-gray-900 p-3 text-sm font-medium text-white max-w-lg">
                <p>{content}</p>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-gray-600" />
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const VideoChatArea: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);

    const handleVideoUpload = (url: string) => {
        setVideoSrc(url);
    };
    
    const handleReferenceClick = (ref: CitationReference) => {
        // This is a placeholder for the actual implementation
        // In a real app, this would likely involve updating global state
        // to switch the tab and highlight the item in the AnalysisPanel.
        console.log(`Hyperlinking to ${ref.type} at index ${ref.originalIndex}`);
        alert(`Navigating to ${ref.type}: "${ref.title}" at ${ref.timestamp}`);
    };

    return (
        <div className="flex-1 flex flex-col p-4 gap-4 min-w-0">
            {/* Video Players */}
            <div className="flex-grow-[2] flex gap-4 min-h-0">
                <VideoPlayerPro title="Upload a video to begin" src={videoSrc} />
                <VideoPlayerPro title="Analysis Overlay" src={null} />
            </div>

            {/* Floating Messages Area */}
            <div className="flex-grow flex flex-col min-h-0">
                <style>{`
                    .clean-scrollbar::-webkit-scrollbar {
                        width: 8px;
                    }
                    .clean-scrollbar::-webkit-scrollbar-thumb {
                        background-color: #d1d5db; /* Tailwind gray-300 */
                        border-radius: 4px;
                    }
                    .clean-scrollbar::-webkit-scrollbar-track {
                        background-color: transparent;
                    }
                    .clean-scrollbar::-webkit-scrollbar-button {
                        display: none;
                    }
                    .clean-scrollbar {
                        scrollbar-width: thin; /* For Firefox */
                        scrollbar-color: #d1d5db transparent; /* For Firefox */
                    }
                `}</style>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 clean-scrollbar">
                    {messages.map(message => {
                        switch(message.role) {
                            case 'user':
                                return <UserMessageBubble key={message.id} content={message.content} />;
                            case 'reasoning':
                                return <AIThinkingBlock key={message.id} content={message.content} />;
                            case 'assistant':
                                return <AIMessage key={message.id} content={message.content} onReferenceClick={handleReferenceClick} />;
                            default:
                                return null;
                        }
                    })}
                </div>
                <div className="p-3 flex justify-center">
                    <AIChatInput onVideoUpload={handleVideoUpload} />
                </div>
            </div>
        </div>
    );
};

export default VideoChatArea;