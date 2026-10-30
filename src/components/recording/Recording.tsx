import type { MutableRefObject } from 'react';
import { TrackData } from '../tracks/Tracklist';
import { EffectUpdateRegistry } from '../../audio/connectEffectsChain';
import { ConnectEffectsChain } from '../../hooks/useEffectsEngine';
import { TrackAudioRefs } from '../../hooks/useTracks';
import { useRecorder } from '../../hooks/useRecorder';
import { useMonitoring } from '../../hooks/useMonitoring';
import { EFFECT_DEFINITIONS } from '../effects/Effects';
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

    const selectedEffectTypes = new Set(monitoring.monitorEffects.map((effect) => effect.type));

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

            <div className="monitor-effects-panel" aria-label="Live monitoring effects">
                <div className="monitor-effects-list">
                    {EFFECT_DEFINITIONS.map((definition) => (
                        <label key={definition.type} className="monitor-effect-toggle">
                            <input
                                type="checkbox"
                                checked={selectedEffectTypes.has(definition.type)}
                                onChange={() => monitoring.toggleEffect(definition.type)}
                            />
                            {definition.label}
                        </label>
                    ))}
                </div>

                {monitoring.monitorEffects.map((effect) => {
                    const definition = EFFECT_DEFINITIONS.find((item) => item.type === effect.type);
                    if (!definition) return null;

                    return (
                        <div key={effect.type} className="monitor-effect-controls">
                            <strong>{definition.label}</strong>
                            <div className="monitor-effect-sliders">
                                {definition.params.map((param) => (
                                    <label key={param.key}>
                                        {param.label}
                                        <input
                                            type="range"
                                            min={param.min}
                                            max={param.max}
                                            step={param.step ?? 1}
                                            value={effect.params[param.key]}
                                            onChange={(e) =>
                                                monitoring.updateEffectParam(
                                                    effect.type,
                                                    param.key,
                                                    Number(e.target.value)
                                                )
                                            }
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default Recording;