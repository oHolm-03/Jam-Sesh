import React, { useState } from 'react';
import InlineRename from '../InlineRename';
import { WaveformPeak } from './Audioutils';
import { TrackEffectInstance } from '../Effects-Related/Effects';
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
    onSelectTrack: (trackId: string) => void;
    onToggleMute: (trackId: string) => void;
    onRenameTrack: (trackId: string, newName: string) => Promise<void> | void;
    onDeleteTrack: (trackId: string) => Promise<void> | void;
    onTrackContextMenu?: (trackId: string, x: number, y: number) => void;
};

type ContextMenuState = {
    trackId: string;
    x?: number;
    y?: number;
};

const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];

const TrackList: React.FC<TrackListProps> = ({
    tracks,
    selectedTrackId,
    onSelectTrack,
    onToggleMute,
    onRenameTrack,
    onDeleteTrack,
    onTrackContextMenu,
}) => {
    const [activeMenu, setActiveMenu] = useState<ContextMenuState | null>(null);

    const activeTrack = tracks.find((t) => t.id === activeMenu?.trackId);

    return (
        <div className="track-list-container">
            {activeMenu && (
                <div className="track-list-overlay" onClick={() => setActiveMenu(null)} />
            )}

            {tracks.map((track, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const isSelected = track.id === selectedTrackId;
                const laneClassName = `track-lane${isSelected ? ' track-lane--selected' : ''}`;

                return (
                    <div
                        key={track.id}
                        onClick={() => onSelectTrack(track.id)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectTrack(track.id);

                            // Clamp values slightly so menu doesn't overflow right/bottom edge of viewport
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
                            <button
                                className="track-settings-button"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActiveMenu((prev) =>
                                        prev?.trackId === track.id
                                            ? null
                                            : { trackId: track.id, x: rect.left - 180, y: rect.bottom + 4 }
                                    );
                                }}
                                aria-label="Track settings"
                            >
                                ⋮
                            </button>
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