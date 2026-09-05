import React, { useState } from 'react';
import InlineRename from '../InlineRename';
import { WaveformPeak } from './Audioutils';
import { TrackEffectInstance } from '../Effects-Related/Effects';

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

// Cycled per track by index, echoing the piano-roll/guitar/bass/synth/vocal
// color coding you'd see in a DAW like Logic or GarageBand.
const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];
const LANE_HEIGHT = 76;
const CONTAINER_RADIUS = 6;

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
        <div style={{ display: 'flex', flexDirection: 'column', border: '2px solid #222', borderRadius: 6, position: 'relative' }}>
            {/* Invisible overlay closes the open menu when you click anywhere outside it */}
            {openMenuTrackId && (
                <div
                    onClick={() => setOpenMenuTrackId(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 5 }}
                />
            )}

            {tracks.map((track, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const isSelected = track.id === selectedTrackId;
                const isFirst = index === 0;
                const isLast = index === tracks.length-1;

                return (
                    <div
                        key={track.id}
                        onClick={() => onSelectTrack(track.id)}
                        style={{
                            position: 'relative',
                            height: LANE_HEIGHT,
                            background: color,
                            borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.3)',
                            outline: isSelected ? '2px solid #fff' : 'none',
                            outlineOffset: -2,
                            cursor: 'pointer',
                            opacity: track.muted ? 0.45 : 1,
                            borderTopLeftRadius: isFirst ? CONTAINER_RADIUS : 0,
                            borderTopRightRadius: isFirst ? CONTAINER_RADIUS : 0,
                            borderBottomLeftRadius: isLast ? CONTAINER_RADIUS : 0,
                            borderBottomRightRadius: isLast ? CONTAINER_RADIUS : 0,
                            overflow: 'hidden',
                        }}
                    >
                        {/* Waveform */}
                        {track.hasRecording && track.waveformPeaks ? (
                            <svg
                                viewBox={`0 0 ${track.waveformPeaks.length} 100`}
                                preserveAspectRatio="none"
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
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
                            <div style={{ position: 'absolute', bottom: 8, left: 8, color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                                No recording yet
                            </div>
                        )}

                        {/* Generic badge - shows a count instead of naming a specific effect*/}

                        {track.effects.length > 0 && (
                            <div    
                                style={{
                                    position: 'absolute',
                                    bottom: 8,
                                    right: 8,
                                    fontSize: 10,
                                    color: '#fff',
                                    background: 'rgba(0,0,0,0.35)',
                                    borderRadius: 4,
                                    padding: '2px 6px',
                                }}
                            >
                                {track.effects.length} effect{track.effects.length > 1 ? 's' : ''}
                            </div>
                        )}

                        {/* Label + settings button, on top of the waveform */}
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                position: 'absolute',
                                top: 4,
                                left: 8,
                                right: 8,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                {track.name}
                            </span>
                            <button
                                onClick={() => setOpenMenuTrackId(openMenuTrackId === track.id ? null : track.id)}
                                aria-label="Track settings"
                                style={{ fontSize: 12, padding: '2px 6px' }}
                            >
                                ⋮
                            </button>
                        </div>

                        {openMenuTrackId === track.id && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    position: 'absolute', ...(isLast ? {bottom: 28} : {top:28}),
                                    right: 8,
                                    background: '#fff',
                                    border: '1px solid #ccc',
                                    borderRadius: 6,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                                    padding: 12,
                                    minWidth: 200,
                                    zIndex: 10,
                                }}
                            >
                                <div style={{ marginBottom: 10 }}>
                                    <InlineRename
                                        value={track.name}
                                        label="Rename track"
                                        onSave={(newName) => onRenameTrack(track.id, newName)}
                                    />
                                </div>

                                <button
                                    onClick={() => onToggleMute(track.id)}
                                    style={{ display: 'block', width: '100%', marginBottom: 10 }}
                                >
                                    {track.muted ? 'Unmute Track' : 'Mute Track'}
                                </button>

                                <button
                                    onClick={() => {
                                        setOpenMenuTrackId(null);
                                        onDeleteTrack(track.id);
                                    }}
                                    style={{ display: 'block', width: '100%' }}
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