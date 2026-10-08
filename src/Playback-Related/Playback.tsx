import { useEffect } from 'react';
import { TrackData } from '../Recording-Related/Recording';
import { ConnectEffectsChain } from '../hooks/useEffectsEngine';
import { TrackAudioRefs } from '../hooks/useTracks';
import { useMasterPlayback } from '../hooks/useMasterPlayback';
import './Playback.css';

type Props = {
    projectId: string;
    tracks: TrackData[];
    getTrackAudioRefs: (trackId: string) => TrackAudioRefs;
    getAudioContext: () => AudioContext;
    connectEffectsChain: ConnectEffectsChain;
    // Reports the playhead position so other components (e.g. the track list) can follow it
    onTimeChange?: (seconds: number) => void;
};

// Output side only: master transport that plays every recorded track in sync.
const Playback = ({
    projectId,
    tracks,
    getTrackAudioRefs,
    getAudioContext,
    connectEffectsChain,
    onTimeChange,
}: Props) => {
    const playback = useMasterPlayback({
        projectId,
        tracks,
        getTrackAudioRefs,
        getAudioContext,
        connectEffectsChain,
    });

    useEffect(() => {
        onTimeChange?.(playback.currentTime);
    }, [playback.currentTime, onTimeChange]);

    return (
        <section className="playback-panel">
            <div className="playback-title">Playback</div>

            <div className="playback-buttons">
                <button onClick={playback.restart} className="playback-icon-button" aria-label="Restart">
                    ⏮️
                </button>

                <button
                    onClick={playback.playPause}
                    className="playback-icon-button"
                    aria-label={playback.isPlaying ? 'Pause' : 'Play'}
                >
                    {playback.isPlaying ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="5" width="4" height="14" />
                            <rect x="14" y="5" width="4" height="14" />
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6,4 20,12 6,20" />
                        </svg>
                    )}
                </button>

                <button onClick={playback.skipToEnd} className="playback-icon-button" aria-label="Skip to end">
                    ⏭️
                </button>

                <button
                    onClick={playback.toggleLoop}
                    className={`playback-icon-button playback-loop${playback.isLooping ? ' is-active' : ''}`}
                    aria-label={playback.isLooping ? 'Disable loop' : 'Enable loop'}
                    aria-pressed={playback.isLooping}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17 1l4 4-4 4V6H7c-1.1 0-2 .9-2 2v3H3V8c0-2.21 1.79-4 4-4h10V1zM7 23l-4-4 4-4v3h10c1.1 0 2-.9 2-2v-3h2v3c0 2.21-1.79 4-4 4H7v3z"/>
                    </svg>
                </button>
            </div>
        </section>
    );
};

export default Playback;