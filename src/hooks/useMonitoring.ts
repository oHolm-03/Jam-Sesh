import { useEffect, useRef, useState } from 'react';
import { EFFECT_DEFINITIONS, TrackEffectInstance } from '../components/effects/Effects';
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
    const [monitorEffects, setMonitorEffects] = useState<TrackEffectInstance[]>([]);
    const monitorEffectTypes = monitorEffects.map((effect) => effect.type).join('|');

    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const cleanupRef = useRef<() => void>(() => {/* noop until monitoring starts */});
    const isMonitoringRef = useRef(false);

    // Push live parameter changes into every running monitor effect.
    useEffect(() => {
        monitorEffects.forEach((effect) => {
            registryRef.current.get(`monitor:${effect.type}`)?.(effect.params);
        });
    }, [monitorEffects, registryRef]);

    // Adding, removing, or reordering effects rebuilds the live monitoring chain.
    useEffect(() => {
        if (!isMonitoringRef.current || !sourceRef.current) return;

        cleanupRef.current();
        sourceRef.current.disconnect();
        cleanupRef.current = connectEffectsChain(
            getAudioContext(),
            sourceRef.current,
            getAudioContext().destination,
            monitorEffects,
            'monitor'
        );
    }, [monitorEffectTypes, connectEffectsChain, getAudioContext]);

    const stopMonitoring = () => {
        isMonitoringRef.current = false;
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

        streamRef.current = stream;
        sourceRef.current = source;
        isMonitoringRef.current = true;
        cleanupRef.current = connectEffectsChain(ctx, source, ctx.destination, monitorEffects, 'monitor');
        setIsMonitoring(true);
    };

    const toggleEffect = (type: string) => {
        setMonitorEffects((current) => {
            const exists = current.some((effect) => effect.type === type);
            if (exists) return current.filter((effect) => effect.type !== type);

            const definition = EFFECT_DEFINITIONS.find((effect) => effect.type === type);
            if (!definition) return current;
            return [...current, { type, params: { ...definition.defaultParams } }];
        });
    };

    const updateEffectParam = (type: string, key: string, value: number) => {
        setMonitorEffects((current) =>
            current.map((effect) =>
                effect.type === type
                    ? { ...effect, params: { ...effect.params, [key]: value } }
                    : effect
            )
        );
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
        monitorEffects,
        toggleEffect,
        updateEffectParam,
    };
}