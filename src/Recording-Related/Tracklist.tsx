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
};

const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];

const TrackList: React.FC<TrackListProps> = ({
    tracks,
    selectedTrackId,
    onSelectTrack,
    onToggleMute,
    onRenameTrack,
    onDeleteTrack,
}) => {
    const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);

    return (
        <div className="track-list-container">
            {openMenuTrackId && (
                <div className="track-list-overlay" onClick={() => setOpenMenuTrackId(null)} />
            )}

            {tracks.map((track, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const isSelected = track.id === selectedTrackId;
                const laneClassName = `track-lane${isSelected ? ' track-lane--selected' : ''}`;

                return (
                    <div
                        key={track.id}
                        onClick={() => onSelectTrack(track.id)}
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
                                onClick={() => setOpenMenuTrackId(openMenuTrackId === track.id ? null : track.id)}
                                aria-label="Track settings"
                            >
                                ⋮
                            </button>
                        </div>

                        {openMenuTrackId === track.id && (
                            <div className="track-menu" onClick={(e) => e.stopPropagation()}>
                                <div className="track-menu-rename-row">
                                    <InlineRename
                                        value={track.name}
                                        label="Rename track"
                                        onSave={(newName) => onRenameTrack(track.id, newName)}
                                    />
                                </div>

                                <button
                                    className="track-menu-action track-menu-action--spaced"
                                    onClick={() => onToggleMute(track.id)}
                                >
                                    {track.muted ? 'Unmute Track' : 'Mute Track'}
                                </button>

                                <button
                                    className="track-menu-action"
                                    onClick={() => {
                                        setOpenMenuTrackId(null);
                                        onDeleteTrack(track.id);
                                    }}
                                >
                                    Delete Track
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TrackList;