import React, { useEffect, useRef, useState } from 'react';
import InlineRename from '../../InlineRename';
import { WaveformPeak } from './Audioutils';
import { TrackEffectInstance } from '../effects/Effects';
import { buildTrackRows } from '../../hooks/useTrackLayout';
import './Tracklist.css';

export type TrackData = {
    id: string;
    name: string;
    hasRecording: boolean;
    duration: number;
    muted: boolean;
    effects: TrackEffectInstance[];
    waveformPeaks: WaveformPeak[] | null;
    gainDb: number;
    volumeDb: number;
};

type TrackListProps = {
    tracks: TrackData[];
    trackRows: Record<string, string>;
    trackOrder: string[];
    projectDuration: number;
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
    onMoveTrackRelativeTo: (
        movedTrackId: string,
        targetTrackId: string,
        side: 'before' | 'after',
        rowId: string
    ) => void;
    onMoveTrackToNewRow: (trackId: string) => void;
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
const NEW_ROW_DROP_TARGET = '__new-row-drop-target__';

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
    trackRows,
    trackOrder,
    projectDuration,
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
    onMoveTrackRelativeTo,
    onMoveTrackToNewRow,
}) => {
    const [activeMenu, setActiveMenu] = useState<ContextMenuState | null>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [trimRange, setTrimRange] = useState<TrimRange | null>(null);
    const [draggingHandle, setDraggingHandle] = useState<TrimHandle | null>(null);
    const [isApplyingTrim, setIsApplyingTrim] = useState(false);
    const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
    const [dropTargetRowId, setDropTargetRowId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<{ trackId: string; side: 'before' | 'after' } | null>(null);
    const playheadRowRef = useRef<HTMLDivElement>(null);

    const activeTrack = tracks.find((t) => t.id === activeMenu?.trackId);
    const maxDuration = Math.max(projectDuration, 1);
    const groupedTracks = buildTrackRows(tracks, { trackRows, trackOrder });
    const playheadRow = groupedTracks.find((row) => row.tracks.some((track) => track.hasRecording))
        ?? groupedTracks[0];

    const trackTimeFromClientX = (
        clientX: number,
        element: HTMLElement | null,
        duration: number
    ): number => {
        if (!element) return 0;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        return percent * duration;
    };

    const timelineTimeFromClientX = (clientX: number): number => {
        const rowElement = playheadRowRef.current;
        if (!rowElement) return 0;

        let elapsed = 0;
        const lanes = rowElement.querySelectorAll<HTMLElement>('.track-lane');
        for (const lane of Array.from(lanes)) {
            const track = tracks.find((item) => item.id === lane.dataset.trackId);
            if (!track?.hasRecording || track.duration <= 0) continue;

            const rect = lane.getBoundingClientRect();
            if (clientX <= rect.right) {
                return elapsed + Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * track.duration;
            }
            elapsed += track.duration;
        }
        return Math.min(elapsed, maxDuration);
    };

    const timelineXForTime = (time: number): number => {
        const rowElement = playheadRowRef.current;
        const firstLane = rowElement?.querySelector<HTMLElement>('.track-lane');
        if (!rowElement || !firstLane) return 0;

        let elapsed = 0;
        let finalX = 0;
        const lanes = rowElement.querySelectorAll<HTMLElement>('.track-lane');
        for (const lane of Array.from(lanes)) {
            const track = tracks.find((item) => item.id === lane.dataset.trackId);
            if (!track?.hasRecording || track.duration <= 0) continue;

            const laneStart = lane.offsetLeft - firstLane.offsetLeft;
            finalX = laneStart + lane.offsetWidth;
            if (time <= elapsed + track.duration) {
                const percent = Math.min(Math.max((time - elapsed) / track.duration, 0), 1);
                return laneStart + percent * lane.offsetWidth;
            }
            elapsed += track.duration;
        }
        return finalX;
    };

    //selected track being trimmed, if it has audio
    const trimTarget = isTrimMode
        ? tracks.find((t) => t.id === selectedTrackId && t.hasRecording) ?? null : null;
    //defaults to full track until a handle is moved
    const range = trimTarget && trimRange && trimRange.trackId === trimTarget.id 
        ? trimRange : trimTarget ? {trackId: trimTarget.id, start: 0, end: trimTarget.duration} : null;
    const isRangeChanged = !!trimTarget && !!range && (range.start > 0.001 || range.end < trimTarget.duration - 0.001);
    //leaving trim mode discards any unapplied handle positions
    useEffect(() => {
        if(!isTrimMode) {
            setTrimRange(null);
        } else {
            setIsDraggingPlayhead(false);
        }
    }, [isTrimMode]);

    //Converts pointers x pos into a time, using the same width percentage mapping for the playhead line.
    const handlePlayheadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if(isTrimMode) return;
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDraggingPlayhead(true);
        onSeekStart?.();
        onSeek?.(timelineTimeFromClientX(e.clientX));
    };

    const handlePlayheadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTrimMode || !isDraggingPlayhead) return;
        onSeek?.(timelineTimeFromClientX(e.clientX));
    };

    const handlePlayheadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingPlayhead) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setIsDraggingPlayhead(false);
        if (!isTrimMode) {
            onSeekEnd?.(timelineTimeFromClientX(e.clientX));
        }
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
        const t = Math.min(
            Math.max(
                trackTimeFromClientX(
                    e.clientX,
                    e.currentTarget.closest<HTMLElement>('.track-lane'),
                    trimTarget.duration
                ),
                0
            ),
            trimTarget.duration
        );
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
            <div className="track-lanes-scroll">
                {activeMenu && (
                    <div className="track-list-overlay" onClick={() => setActiveMenu(null)} />
                )}
                <div className="track-timeline-content">
                    {playheadRow && (
                        <div
                            className={
                                'playhead-line' +
                                (isDraggingPlayhead ? ' playhead-line--dragging' : '') +
                                (isTrimMode ? ' playhead-line--locked' : '')
                            }
                            style={{ left: `${timelineXForTime(currentTime)}px` }}
                            aria-disabled={isTrimMode}
                            onPointerDown={handlePlayheadPointerDown}
                            onPointerMove={handlePlayheadPointerMove}
                            onPointerUp={handlePlayheadPointerUp}
                            onPointerCancel={handlePlayheadPointerUp}
                        >
                            <div className="playhead-head" />
                        </div>
                    )}
                {groupedTracks.map((row) => (
                    <div
                        key={row.id}
                        className={
                            'track-row' +
                            (dropTargetRowId === row.id ? ' track-row--drop-target' : '')
                        }
                        role="group"
                        aria-label={`Track row with ${row.tracks.length} track${row.tracks.length === 1 ? '' : 's'}`}
                        ref={row.id === playheadRow?.id ? playheadRowRef : undefined}
                        onDragOver={(event) => {
                            if (isTrimMode || !draggingTrackId) return;
                            event.preventDefault();
                            setDropTargetRowId(row.id);
                        }}
                        onDragLeave={(event) => {
                            const relatedTarget = event.relatedTarget;
                            if (
                                !(relatedTarget instanceof Node) ||
                                !event.currentTarget.contains(relatedTarget)
                            ) {
                                setDropTargetRowId(null);
                            }
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const movedTrackId = event.dataTransfer.getData('text/plain') || draggingTrackId;
                            const lastTrackId = row.tracks[row.tracks.length - 1]?.id;
                            if (movedTrackId && lastTrackId) {
                                onMoveTrackRelativeTo(movedTrackId, lastTrackId, 'after', row.id);
                            }
                            setDraggingTrackId(null);
                            setDropTargetRowId(null);
                            setDropPosition(null);
                        }}
                            >
                            {row.tracks.map((track) => {
                const index = tracks.findIndex((item) => item.id === track.id);
                        const color = LANE_COLORS[index % LANE_COLORS.length];
                        const isSelected = track.id === selectedTrackId;
                        const isTrimming = !!trimTarget && trimTarget.id === track.id;
                        const laneClassName =
                            'track-lane' +
                            (isSelected ? ' track-lane--selected' : '') +
                            (isTrimming ? ' track-lane--trimming' : '') +
                            (draggingTrackId === track.id ? ' track-lane--dragging' : '') +
                            (dropPosition?.trackId === track.id ? ` track-lane--drop-${dropPosition.side}` : '');
                const gainMultiplier = Math.pow(10, track.gainDb / 20);
 
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
                        data-track-id={track.id}
                        draggable={!isTrimMode}
                        title="Drop on the left half to place before, or the right half to place after"
                        onDragOver={(event) => {
                            if (isTrimMode || !draggingTrackId) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const rect = event.currentTarget.getBoundingClientRect();
                            const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                            setDropPosition({ trackId: track.id, side });
                        }}
                        onDragLeave={() => {
                            setDropPosition((current) => current?.trackId === track.id ? null : current);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const movedTrackId = event.dataTransfer.getData('text/plain') || draggingTrackId;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const side = event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                            if (movedTrackId) {
                                onMoveTrackRelativeTo(movedTrackId, track.id, side, row.id);
                            }
                            setDraggingTrackId(null);
                            setDropTargetRowId(null);
                            setDropPosition(null);
                        }}
                        onDragStart={(event) => {
                            if (isTrimMode) {
                                event.preventDefault();
                                return;
                            }
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', track.id);
                            setDraggingTrackId(track.id);
                        }}
                        onDragEnd={() => {
                            setDraggingTrackId(null);
                            setDropTargetRowId(null);
                            setDropPosition(null);
                        }}
                    >
                        <div className="track-waveform-wrapper">
                            {track.hasRecording && track.waveformPeaks ? (
                                <svg
                                    className="track-waveform-svg"
                                    style={{ width: '100%' }}
                                    viewBox={`0 0 ${track.waveformPeaks.length} 100`}
                                    preserveAspectRatio="none"
                                >
                                    {track.waveformPeaks.map((p, i) => (
                                        <line
                                            key={i}
                                            x1={i}
                                            x2={i}
                                            y1={50 - p.max * gainMultiplier * 48}
                                            y2={50 - p.min * gainMultiplier * 48}
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
                                    style={{
                                        left: 0,
                                        width: `${track.duration > 0 ? (range.start / track.duration) * 100 : 0}%`,
                                    }}
                                />
                                <div
                                    className="trim-dim"
                                    style={{
                                        left: `${track.duration > 0 ? (range.end / track.duration) * 100 : 0}%`,
                                        width: `${track.duration > 0 ? ((track.duration - range.end) / track.duration) * 100 : 0}%`,
                                    }}
                                />
                                <div
                                    className="trim-handle"
                                    role="slider"
                                    aria-label="Trim start"
                                    aria-valuenow={range.start}
                                    style={{
                                        left: `${track.duration > 0 ? (range.start / track.duration) * 100 : 0}%`,
                                    }}
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
                                    style={{
                                        left: `${track.duration > 0 ? (range.end / track.duration) * 100 : 0}%`,
                                    }}
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
                ))}
                {draggingTrackId && !isTrimMode && (
                    <div
                        className={
                            'track-new-row-drop' +
                            (dropTargetRowId === NEW_ROW_DROP_TARGET ? ' track-new-row-drop--active' : '')
                        }
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDropTargetRowId(NEW_ROW_DROP_TARGET);
                        }}
                        onDragLeave={() => setDropTargetRowId(null)}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const movedTrackId = event.dataTransfer.getData('text/plain') || draggingTrackId;
                            if (movedTrackId && tracks.some((track) => track.id === movedTrackId)) {
                                onMoveTrackToNewRow(movedTrackId);
                            }
                            setDraggingTrackId(null);
                            setDropTargetRowId(null);
                            setDropPosition(null);
                        }}
                    >
                        Drop here to move the track to a new row
                    </div>
                )}
                </div>
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