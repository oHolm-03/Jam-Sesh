import React, { useRef, useState } from 'react';
import InlineRename from '../../InlineRename';
import { WaveformPeak } from './Audioutils';
import { TrackEffectInstance } from '../effects/Effects';
import './Tracklist.css';

export type TrackData = {
    id: string;
    name: string;
    hasRecording: boolean;
    duration: number;
    muted: boolean;
    effects: TrackEffectInstance[];
    waveformPeaks: WaveformPeak[] | null;
};

type TrackListProps = {
    tracks: TrackData[];
    selectedTrackId: string | null;
    currentTime: number;
    onSelectTrack: (trackId: string) => void;
    onToggleMute: (trackId: string) => void;
    onRenameTrack: (trackId: string, newName: string) => Promise<void> | void;
    onDeleteTrack: (trackId: string) => Promise<void> | void;
    onTrackContextMenu?: (trackId: string, x: number, y: number) => void;
    // Playhead dragging
    onSeekStart?: () => void;
    onSeek?: (time: number) => void;
    onSeekEnd?: (time: number) => void;
};

type ContextMenuState = {
    trackId: string;
    x?: number;
    y?: number;
};

const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];

const formatTime = (seconds: number): string => {
        if(!seconds || isNaN(seconds)) return '0:00.00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const millisecs = Math.floor(seconds * 100) % 100;

        const formattedSecs = secs.toString().padStart(2, '0');
        const formattedMillisecs = millisecs.toString().padStart(2, '0');

        return `${mins}:${formattedSecs}.${formattedMillisecs}`;
    };

const TrackList: React.FC<TrackListProps> = ({
    tracks,
    selectedTrackId,
    currentTime,
    onSelectTrack,
    onToggleMute,
    onRenameTrack,
    onDeleteTrack,
    onTrackContextMenu,
    onSeekStart,
    onSeek,
    onSeekEnd,
}) => {
    const [activeMenu, setActiveMenu] = useState<ContextMenuState | null>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeTrack = tracks.find((t) => t.id === activeMenu?.trackId);
    const maxDuration = Math.max(...tracks.map((t) => t.duration || 0), 1);
    const playheadPercent = Math.min((currentTime / maxDuration) * 100, 100);

    //Converts pointers x pos into a time, using the same width percentage mapping for the playhead line.
    const timeFromClientX = (clientX: number): number => {
        const el = containerRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const pct = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
        return Math.min(Math.max(pct, 0), 1) * maxDuration;
    };

    const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDraggingPlayhead(true);
        onSeekStart?.();
        onSeek?.(timeFromClientX(e.clientX));
    };

    const handlePlayheadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingPlayhead) return;
        onSeek?.(timeFromClientX(e.clientX));
    };

    const handlePlayheadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingPlayhead) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setIsDraggingPlayhead(false);
        onSeekEnd?.(timeFromClientX(e.clientX));
    };

    return (
        <div ref={containerRef} className="track-list-container">
            <div className="track-list-header">
                <div className="track-time-display">
                    <span className="time-current">{formatTime(currentTime)}</span>
                    <span className="time-separator">/</span>
                    <span className="time-total">{formatTime(maxDuration)}</span>
                </div>
            </div>
            <div
                className={`playhead-line${isDraggingPlayhead ? ' playhead-line--dragging' : ''}`}
                style={{ left: `${playheadPercent}%` }}
                onPointerDown={handlePlayheadPointerDown}
                onPointerMove={handlePlayheadPointerMove}
                onPointerUp={handlePlayheadPointerUp}
                onPointerCancel={handlePlayheadPointerUp}
            >
                <div className="playhead-head" />
            </div>
            {activeMenu && (
                <div className="track-list-overlay" onClick={() => setActiveMenu(null)} />
            )}

            {tracks.map((track, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const isSelected = track.id === selectedTrackId;
                const laneClassName = `track-lane${isSelected ? ' track-lane--selected' : ''}`;
                const trackWidthPercent = ((track.duration || 0) / maxDuration) * 100;

                return (
                    <div
                        key={track.id}
                        onClick={(e) => {
                            if(e.button !== 0) return;
                            onSelectTrack(track.id);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const x = Math.min(e.clientX, window.innerWidth - 220);
                            const y = Math.min(e.clientY, window.innerHeight - 180);

                            setActiveMenu({ trackId: track.id, x, y });

                            if (onTrackContextMenu) {
                                onTrackContextMenu(track.id, x, y);
                            }
                        }}
                        className={laneClassName}
                        style={{ '--lane-color': color } as React.CSSProperties}
                    >
                        <div className="track-waveform-wrapper">
                            {track.hasRecording && track.waveformPeaks ? (
                                <svg
                                    className="track-waveform-svg"
                                    viewBox={`0 0 ${track.waveformPeaks.length} 100`}
                                    preserveAspectRatio="none"
                                >
                                    {track.waveformPeaks.map((p, i) => (
                                        <line
                                            key={i}
                                            x1={i}
                                            x2={i}
                                            y1={50 - p.max * 48}
                                            y2={50 - p.min * 48}
                                            stroke="rgba(255,255,255,0.85)"
                                            strokeWidth={1}
                                        />
                                    ))}
                                </svg>
                            ) : (
                                <div className="track-empty-label">No recording yet</div>
                            )}

                            {track.effects.length > 0 && (
                                <div className="track-effects-badge">
                                    {track.effects.length} effect{track.effects.length > 1 ? 's' : ''}
                                </div>
                            )}

                            {track.muted && <div className="track-muted-overlay" />}
                        </div>

                        <div className="track-header" onClick={(e) => e.stopPropagation()}>
                            <div className="track-name-group">
                                <span className="track-name">{track.name}</span>
                                {track.muted && <span className="track-muted-badge">Muted</span>}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Floating context menu rendered outside of the map loop */}
            {activeMenu && activeTrack && (
                <div
                    className="track-menu track-menu--floating"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        left: `${activeMenu.x}px`,
                        top: `${activeMenu.y}px`,
                        zIndex: 1000,
                    }}
                >
                    <div className="track-menu-rename-row">
                        <InlineRename
                            value={activeTrack.name}
                            label="Rename track"
                            onSave={(newName) => onRenameTrack(activeTrack.id, newName)}
                        />
                    </div>

                    <button
                        className="track-menu-action track-menu-action--spaced"
                        onClick={() => onToggleMute(activeTrack.id)}
                    >
                        {activeTrack.muted ? 'Unmute Track' : 'Mute Track'}
                    </button>

                    <button
                        className="track-menu-action"
                        onClick={() => {
                            setActiveMenu(null);
                            onDeleteTrack(activeTrack.id);
                        }}
                    >
                        Delete Track
                    </button>
                </div>
            )}
        </div>
    );
};

export default TrackList;