import React, { useEffect, useRef, useState } from 'react';
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
    isTrimMode?: boolean;
    onTrimTrack?: (trackId: string, startSec: number, endSec: number) => Promise<void> | void;
};

type ContextMenuState = {
    trackId: string;
    x?: number;
    y?: number;
};

type TrimRange = {trackId: string; start: number; end: number};
type TrimHandle = 'start' | 'end';

const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];
const MIN_TRIM_SECONDS = 0.05;

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
    isTrimMode = false,
    onTrimTrack,
}) => {
    const [activeMenu, setActiveMenu] = useState<ContextMenuState | null>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [trimRange, setTrimRange] = useState<TrimRange | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<TrimHandle | null>(null);
    const [isApplyingTrim, setIsApplyingTrim] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeTrack = tracks.find((t) => t.id === activeMenu?.trackId);
    const maxDuration = Math.max(...tracks.map((t) => t.duration || 0), 1);
    const playheadPercent = Math.min((currentTime / maxDuration) * 100, 100);

    //selected track being trimmed, if it has audio
    const trimTarget = isTrimMode
        ? tracks.find((t) => t.id === selectedTrackId && t.hasRecording) ?? null : null;
    //defaults to full track until a handle is moved
    const range = trimTarget && trimRange && trimRange.trackId === trimTarget.id 
        ? trimRange : trimTarget ? {trackId: trimTarget.id, start: 0, end: trimTarget.duration} : null;
    const isRangeChanged = !!trimTarget && !!range && (range.start > 0.001 || range.end < trimTarget.duration - 0.001);
    //leaving trim mode discards any unapplied handle positions
    useEffect(() => {
        if(!isTrimMode) setTrimRange(null);
    }, [isTrimMode]);

    //Converts pointers x pos into a time, using the same width percentage mapping for the playhead line.
    const timeFromClientX = (clientX: number): number => {
        const el = containerRef.current;
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const pct = el.clientWidth > 0 ? (clientX - rect.left) / el.clientWidth : 0;
        return Math.min(Math.max(pct, 0), 1) * maxDuration;
    };

    const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if(isTrimMode) return;
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

    const handleTrimHandleDown = (which: TrimHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraggingHandle(which);
    };

    const handleTrimHandleMove = (which: TrimHandle) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (draggingHandle !== which || !trimTarget || !range) return;
        const t = Math.min(Math.max(timeFromClientX(e.clientX), 0), trimTarget.duration);
        if (which === 'start') {
            setTrimRange({
                trackId: trimTarget.id,
                start: Math.max(0, Math.min(t, range.end - MIN_TRIM_SECONDS)),
                end: range.end,
            });
        } else {
            setTrimRange({
                trackId: trimTarget.id,
                start: range.start,
                end: Math.min(trimTarget.duration, Math.max(t, range.start + MIN_TRIM_SECONDS)),
            });
        }
    };

    const handleApplyTrim = async () => {
        if (!trimTarget || !range || !onTrimTrack || !isRangeChanged) return;
        setIsApplyingTrim(true);
        try {
            await onTrimTrack(trimTarget.id, range.start, range.end);
            setTrimRange(null);
        } finally {
            setIsApplyingTrim(false);
        }
    };

    const handleTrimHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setDraggingHandle(null);
    };

    return (
        <div className="track-list-container">
            <div className="track-list-header">
                <div className="track-time-display">
                    <span className="time-current">{formatTime(currentTime)}</span>
                    <span className="time-separator">/</span>
                    <span className="time-total">{formatTime(maxDuration)}</span>
                </div>
 
                {isTrimMode && (
                    <div className="trim-controls">
                        {trimTarget && range ? (
                            <>
                                <span className="trim-range-label">
                                    Keep {formatTime(range.start)} – {formatTime(range.end)}
                                </span>
                                <button
                                    className="trim-button"
                                    onClick={() => setTrimRange(null)}
                                    disabled={!isRangeChanged || isApplyingTrim}
                                >
                                    Reset
                                </button>
                                <button
                                    className="trim-button trim-button--primary"
                                    onClick={handleApplyTrim}
                                    disabled={!isRangeChanged || isApplyingTrim}
                                >
                                    {isApplyingTrim ? 'Trimming…' : 'Apply trim'}
                                </button>
                            </>
                        ) : (
                            <span className="trim-hint">Select a recorded track to trim</span>
                        )}
                    </div>
                )}
            </div>
            <div ref={containerRef} className="track-lanes-scroll">
                <div
                    className={
                        'playhead-line' +
                        (isDraggingPlayhead ? ' playhead-line--dragging' : '') +
                        (isTrimMode ? ' playhead-line--locked' : '')
                    }
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
                const isTrimming = !!trimTarget && trimTarget.id === track.id;
                const laneClassName =
                    'track-lane' +
                    (isSelected ? ' track-lane--selected' : '') +
                    (isTrimming ? ' track-lane--trimming' : '');
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
                                    style={{ width: `${trackWidthPercent}%` }}
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
 
                        {/* Trim overlay: dimmed discarded regions + draggable handles */}
                        {isTrimming && range && (
                            <>
                                <div
                                    className="trim-dim"
                                    style={{ left: 0, width: `${(range.start / maxDuration) * 100}%` }}
                                />
                                <div
                                    className="trim-dim"
                                    style={{
                                        left: `${(range.end / maxDuration) * 100}%`,
                                        width: `${((track.duration - range.end) / maxDuration) * 100}%`,
                                    }}
                                />
                                <div
                                    className="trim-handle"
                                    role="slider"
                                    aria-label="Trim start"
                                    aria-valuenow={range.start}
                                    style={{ left: `${(range.start / maxDuration) * 100}%` }}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={handleTrimHandleDown('start')}
                                    onPointerMove={handleTrimHandleMove('start')}
                                    onPointerUp={handleTrimHandleUp}
                                    onPointerCancel={handleTrimHandleUp}
                                />
                                <div
                                    className="trim-handle"
                                    role="slider"
                                    aria-label="Trim end"
                                    aria-valuenow={range.end}
                                    style={{ left: `${(range.end / maxDuration) * 100}%` }}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={handleTrimHandleDown('end')}
                                    onPointerMove={handleTrimHandleMove('end')}
                                    onPointerUp={handleTrimHandleUp}
                                    onPointerCancel={handleTrimHandleUp}
                                />
                            </>
                        )}
 
                        <div className="track-header" onClick={(e) => e.stopPropagation()}>
                            <div className="track-name-group">
                                <span className="track-name">{track.name}</span>
                                {track.muted && <span className="track-muted-badge">Muted</span>}
                            </div>
                        </div>
                    </div>
                );
                })}
            </div>
 
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