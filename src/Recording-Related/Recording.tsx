import type { MutableRefObject } from 'react';
import { TrackData } from '../Recording-Related/Tracklist';
import { EffectUpdateRegistry } from '../audio/connectEffectsChain';
import { ConnectEffectsChain } from '../hooks/useEffectsEngine';
import { TrackAudioRefs } from '../hooks/useTracks';
import { useRecorder } from '../hooks/useRecorder';
import { useMonitoring } from '../hooks/useMonitoring';
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

// Input side only: recording to the selected track, plus live input monitoring with distortion.
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

    const { distortionParams, setDistortionParams } = monitoring;
    const setParam = (key: keyof typeof distortionParams, value: number) =>
        setDistortionParams((p) => ({ ...p, [key]: value }));

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

                <label className="recording-distortion-toggle">
                    <input
                        type="checkbox"
                        checked={monitoring.distortionOn}
                        onChange={(e) => monitoring.setDistortionOn(e.target.checked)}
                    />
                    Distortion (for monitoring)
                </label>
            </div>

            {monitoring.distortionOn && (
                <div className="recording-distortion-sliders">
                    <label>
                        Drive
                        <input type="range" min={1} max={400}
                            value={distortionParams.drive}
                            onChange={(e) => setParam('drive', Number(e.target.value))} />
                    </label>
                    <label>
                        Tone
                        <input type="range" min={500} max={20000}
                            value={distortionParams.tone}
                            onChange={(e) => setParam('tone', Number(e.target.value))} />
                    </label>
                    <label>
                        Level
                        <input type="range" min={0} max={2} step={0.01}
                            value={distortionParams.level}
                            onChange={(e) => setParam('level', Number(e.target.value))} />
                    </label>
                </div>
            )}
        </section>
    );
};

export default Recording;