import { useCallback, useEffect, useRef } from 'react';

// One lazily-created AudioContext per Studio mount; closed on unmount so nothing keeps playing.
export function useAudioContext() {
    const ref = useRef<AudioContext | null>(null);

    const getAudioContext = useCallback(() => {
        if (!ref.current) {
            ref.current = new AudioContext({ latencyHint: 'interactive' });
        }
        return ref.current;
    }, []);

    useEffect(() => {
        return () => {
            ref.current?.close();
            ref.current = null;
        };
    }, []);

    return getAudioContext;
}