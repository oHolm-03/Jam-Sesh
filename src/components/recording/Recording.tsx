import type { MutableRefObject } from 'react';
import { TrackData } from '../tracks/Tracklist';
import { EffectUpdateRegistry } from '../../audio/connectEffectsChain';
import { ConnectEffectsChain } from '../../hooks/useEffectsEngine';
import { TrackAudioRefs } from '../../hooks/useTracks';
import { useRecorder } from '../../hooks/useRecorder';
import { useMonitoring } from '../../hooks/useMonitoring';
import LiveEffectsPanel from '../effects/LiveEffectsPanel';
import { LIVE_EFFECT_DEFINITIONS } from '../effects/LiveEffects';
import './Recording.css';

type Props = {
    selectedTrackId: string | null;
    selectedDeviceId: string;
    getAudioContext: () => AudioContext;
    getTrackAudioRefs: (trackId: string) => TrackAudioRefs;
    updateTrackState: (trackId: string, patch: Partial<TrackData>) => void;
    registryRef: MutableRefObject<EffectUpdateRegistry>;
    connectEffectsChain: ConnectEffectsChain;
};

// Input side only: recording to the selected track, plus live input monitoring effects.
const Recording = ({
    selectedTrackId,
    selectedDeviceId,
    getAudioContext,
    getTrackAudioRefs,
    updateTrackState,
    registryRef,
    connectEffectsChain,
}: Props) => {
    const recorder = useRecorder({
        selectedTrackId,
        selectedDeviceId,
        getAudioContext,
        getTrackAudioRefs,
        updateTrackState,
    });

    const monitoring = useMonitoring({
        selectedDeviceId,
        getAudioContext,
        registryRef,
        connectEffectsChain,
    });

    return (
        <section className="recording-panel">
            <div className="recording-title">Recording</div>

            <div className="recording-row">
                {!recorder.isRecording ? (
                    <button
                        className="recording-button"
                        onClick={recorder.startRecording}
                        disabled={!selectedTrackId}
                        aria-label="Start recording"
                        title={selectedTrackId ? 'Start recording' : 'Select a track to record'}
                    >
                        🔴
                    </button>
                ) : (
                    <button
                        className="recording-button"
                        onClick={recorder.stopRecording}
                        aria-label="Stop recording"
                    >
                        🟥
                    </button>
                )}

                {!monitoring.isMonitoring ? (
                    <button onClick={monitoring.startMonitoring}>Start Monitoring</button>
                ) : (
                    <button onClick={monitoring.stopMonitoring}>Stop Monitoring</button>
                )}

            </div>

            <LiveEffectsPanel
                definitions={LIVE_EFFECT_DEFINITIONS}
                effects={monitoring.monitorEffects}
                onToggleEffect={monitoring.toggleEffect}
                onUpdateEffectParam={monitoring.updateEffectParam}
            />
        </section>
    );
};

export default Recording;