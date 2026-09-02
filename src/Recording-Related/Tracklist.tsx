import React from 'react';
import InlineRename from '../InlineRename';
import { WaveformPeak } from './Audioutils';
 
export type TrackData = {
    id: string;
    name: string;
    hasRecording: boolean;
    duration: number;
    muted: boolean;
    waveformPeaks: WaveformPeak[] | null;
};
 
type TrackListProps = {
    tracks: TrackData[];
    selectedTrackId: string | null;
    onSelectTrack: (trackId: string) => void;
    onToggleMute: (trackId: string) => void;
    onRenameTrack: (trackId: string, newName: string) => Promise<void> | void;
};
 
// Cycled per track by index, echoing the piano-roll/guitar/bass/synth/vocal
// color coding you'd see in a DAW like Logic or GarageBand.
const LANE_COLORS = ['#c9a227', '#3f5fb5', '#3a9c56', '#8a4fc9', '#c9426e'];
const LANE_HEIGHT = 76;
 
const TrackList: React.FC<TrackListProps> = ({
    tracks,
    selectedTrackId,
    onSelectTrack,
    onToggleMute,
    onRenameTrack,
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #222', borderRadius: 6, overflow: 'hidden' }}>
            {tracks.map((track, index) => {
                const color = LANE_COLORS[index % LANE_COLORS.length];
                const isSelected = track.id === selectedTrackId;
 
                return (
                    <div
                        key={track.id}
                        onClick={() => onSelectTrack(track.id)}
                        style={{
                            position: 'relative',
                            height: LANE_HEIGHT,
                            background: color,
                            borderBottom: '1px solid rgba(0,0,0,0.3)',
                            outline: isSelected ? '2px solid #fff' : 'none',
                            outlineOffset: -2,
                            cursor: 'pointer',
                            opacity: track.muted ? 0.45 : 1,
                        }}
                    >
                        {/* Waveform sits behind the label/controls */}
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
 
                        {/* Label + mute, on top of the waveform */}
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
                            <InlineRename
                                value={track.name}
                                label="Rename track"
                                textStyle={{ color: '#fff', fontSize: 12, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                                onSave={(newName) => onRenameTrack(track.id, newName)}
                            />
                            <button
                                onClick={() => onToggleMute(track.id)}
                                aria-label={track.muted ? 'Unmute track' : 'Mute track'}
                                style={{ fontSize: 11, padding: '2px 6px' }}
                            >
                                {track.muted ? 'Unmute' : 'Mute'}
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
 
export default TrackList;