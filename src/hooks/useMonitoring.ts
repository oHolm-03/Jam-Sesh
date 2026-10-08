import { useEffect, useRef, useState } from 'react';
import { TrackEffectInstance } from '../Effects-Related/Effects';
import { EffectUpdateRegistry } from '../audio/connectEffectsChain';
import { ConnectEffectsChain } from './useEffectsEngine';

type Args = {
    selectedDeviceId: string;
    getAudioContext: () => AudioContext;
    registryRef: React.MutableRefObject<EffectUpdateRegistry>;
    connectEffectsChain: ConnectEffectsChain;
};

export function useMonitoring({ selectedDeviceId, getAudioContext, registryRef, connectEffectsChain }: Args) {
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [distortionOn, setDistortionOn] = useState(false);
    const [distortionParams, setDistortionParams] = useState({ drive: 50, tone: 8000, level: 1 });

    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const cleanupRef = useRef<() => void>(() => {/* noop until monitoring starts */});

    // Push live distortion changes into the running monitor chain
    useEffect(() => {
        const update = registryRef.current.get('monitor:distortion');
        if (update) update(distortionOn ? distortionParams : { drive: 0, tone: 20000, level: 0 });
    }, [distortionOn, distortionParams, registryRef]);

    const stopMonitoring = () => {
        cleanupRef.current();
        sourceRef.current?.disconnect();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        sourceRef.current = null;
        streamRef.current = null;
        setIsMonitoring(false);
    };

    const startMonitoring = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
        const ctx = getAudioContext();
        const source = ctx.createMediaStreamSource(stream);

        const effects: TrackEffectInstance[] = distortionOn
            ? [{ type: 'distortion', params: distortionParams }]
            : [];

        cleanupRef.current = connectEffectsChain(ctx, source, ctx.destination, effects, 'monitor');
        streamRef.current = stream;
        sourceRef.current = source;
        setIsMonitoring(true);
    };

    // Release the mic if the studio unmounts while monitoring
    useEffect(() => {
        return () => {
            cleanupRef.current();
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    return {
        isMonitoring,
        startMonitoring,
        stopMonitoring,
        distortionOn,
        setDistortionOn,
        distortionParams,
        setDistortionParams,
    };
}