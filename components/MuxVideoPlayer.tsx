
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import MuxPlayer from '@mux/mux-player-react';

interface MuxVideoPlayerProps {
    playbackId?: string | null;
    src?: string | null; // Keep src for compatibility/fallback, though playbackId is preferred for Mux
    title?: string;
    className?: string;
    onTimeUpdate?: (time: number) => void;
    onEnded?: () => void;
    onLoadedMetadata?: () => void;
    onDurationChange?: (duration: number) => void;
    onSeeked?: () => void;
    muted?: boolean;
    autoPlay?: boolean;
    loop?: boolean;
    onClick?: () => void;
    startTime?: number;
}

const MuxVideoPlayer = forwardRef<HTMLVideoElement, MuxVideoPlayerProps>((props, ref) => {
    const muxPlayerRef = useRef<any>(null); // Type 'any' because MuxPlayer ref definition can be tricky

    // Expose the underlying video element to the parent using the ref
    useImperativeHandle(ref, () => {
        // MuxPlayer exposes the underlying video element via .media.nativeEl
        return muxPlayerRef.current?.media?.nativeEl;
    }, []);

    useEffect(() => {
        const player = muxPlayerRef.current;
        if (player && props.startTime && props.startTime > 0) {
            player.currentTime = props.startTime;
        }
    }, [props.startTime, props.playbackId]);

    // If no source/playbackId, render a placeholder
    if (!props.playbackId && !props.src) {
        return (
            <div className={`flex flex-col items-center justify-center w-full h-full bg-gradient-to-br from-[#1a1c2e] to-[#0f111a] rounded-lg border border-white/5 text-white overflow-hidden ${props.className}`}>
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 transition-transform hover:scale-105 duration-300">
                    <svg className="w-8 h-8 text-primary/60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 12L7 20V4L21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    {props.title || "Ready to Analyze"}
                </h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-[240px] text-center px-4">
                    Upload a video or select an asset to begin your cinematic production
                </p>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.4)_100%)] pointer-events-none"></div>
            </div>
        );
    }

    return (
        <MuxPlayer
            ref={muxPlayerRef}
            playbackId={props.playbackId || undefined}
            src={props.src || undefined}
            metadata={{
                video_title: props.title,
            }}
            className={props.className}
            onTimeUpdate={(e: any) => props.onTimeUpdate?.(e.target.currentTime)}
            onEnded={props.onEnded}
            onLoadedMetadata={() => {
                props.onLoadedMetadata?.();
                if (muxPlayerRef.current?.duration) {
                    props.onDurationChange?.(muxPlayerRef.current.duration);
                }
            }}
            onSeeked={props.onSeeked}
            muted={props.muted}
            autoPlay={props.autoPlay}
            loop={props.loop}
            // onClick={props.onClick}
            streamType="on-demand"
            // Enable controls to show Mux's built-in storyboard/hover previews
            // @ts-ignore
            controls={true}
            style={{
                height: '100%',
                width: '100%'
            } as any}
        />
    );
});

MuxVideoPlayer.displayName = 'MuxVideoPlayer';

export default MuxVideoPlayer;
