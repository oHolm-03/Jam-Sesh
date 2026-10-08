import { useCallback, useEffect, useRef } from 'react';
import { TrackData } from '../Tracks-Related/Tracklist';
import { TrackEffectInstance } from '../Effects-Related/Effects';
import { connectEffectsChain as connect, EffectUpdateRegistry } from '../audio/connectEffectsChain';

// Owns the registry of live effect nodes and pushes track param changes into them.
export function useEffectsEngine(tracks: TrackData[]) {
    const registryRef = useRef<EffectUpdateRegistry>(new Map());

    useEffect(() => {
        tracks.forEach((track) => {
            track.effects.forEach((effect) => {
                const update = registryRef.current.get(`${track.id}:${effect.type}`);
                if (update) update(effect.params);
            });
        });
    }, [tracks]);

    const connectEffectsChain = useCallback(
        (
            ctx: AudioContext,
            source: AudioNode,
            destination: AudioNode,
            effects: TrackEffectInstance[],
            liveKey: string
        ) => connect(ctx, source, destination, effects, liveKey, registryRef.current),
        []
    );

    return { registryRef, connectEffectsChain };
}

export type ConnectEffectsChain = ReturnType<typeof useEffectsEngine>['connectEffectsChain'];