import { useEffect, useRef, useState } from 'react';
import { TrackData } from '../Tracks-Related/Tracklist';
import { TrackAudioRefs } from './useTracks';
import { ConnectEffectsChain } from './useEffectsEngine';

type MasterPlaybackState = {
    activeSources: AudioBufferSourceNode[];
    playbackOffset: number;
    playbackStartContextTime: number;
    isManualStop: boolean;
    animationFrame: number | null;
};

type Args = {
    projectId: string;
    tracks: TrackData[];
    getTrackAudioRefs: (trackId: string) => TrackAudioRefs;
    getAudioContext: () => AudioContext;
    connectEffectsChain: ConnectEffectsChain;
};

export function useMasterPlayback({ projectId, tracks, getTrackAudioRefs, getAudioContext, connectEffectsChain }: Args) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLooping, setIsLooping] = useState(false);

    const masterRef = useRef<MasterPlaybackState>({
        activeSources: [],
        playbackOffset: 0,
        playbackStartContextTime: 0,
        isManualStop: false,
        animationFrame: null,
    });
    const isLoopingRef = useRef(false);
    // Always-current tracks, so loop restarts and the progress bar don't read stale closures
    const tracksRef = useRef<TrackData[]>(tracks);

    useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
    useEffect(() => { tracksRef.current = tracks; }, [tracks]);

    const duration = Math.max(0, ...tracks.map((t) => t.duration));
    const getDuration = () => Math.max(0, ...tracksRef.current.map((t) => t.duration));

    const updateProgress = () => {
        const master = masterRef.current;
        const elapsed = master.playbackOffset + (getAudioContext().currentTime - master.playbackStartContextTime);
        setCurrentTime(Math.min(elapsed, getDuration()));
        master.animationFrame = requestAnimationFrame(updateProgress);
    };

    const stopAllActiveSources = () => {
        const master = masterRef.current;
        master.isManualStop = true;
        master.activeSources.forEach((s) => {
            try { s.stop(); } catch {/* already stopped, ignore */}
        });
        master.activeSources = [];
        if (master.animationFrame) cancelAnimationFrame(master.animationFrame);
    };

    // Starts every recorded track from the same offset so they stay in sync.
    // Each track gets its own effects chain + a mute gain node feeding the speakers.
    const startFrom = (offset: number) => {
        const ctx = getAudioContext();
        const playable = tracksRef.current.filter((t) => t.hasRecording);
        if (playable.length === 0) return;

        const master = masterRef.current;
        master.isManualStop = false;
        master.activeSources = [];

        let remainingToEnd = playable.length;

        playable.forEach((track) => {
            const refs = getTrackAudioRefs(track.id);
            if (!refs.audioBuffer) {
                remainingToEnd -= 1;
                return;
            }

            const source = ctx.createBufferSource();
            source.buffer = refs.audioBuffer;

            const muteGain = ctx.createGain();
            muteGain.gain.value = track.muted ? 0 : 1;
            refs.muteGainNode = muteGain;

            const cleanupEffects = connectEffectsChain(ctx, source, muteGain, track.effects, track.id);
            muteGain.connect(ctx.destination);

            source.onended = () => {
                cleanupEffects();
                remainingToEnd -= 1;
                if (master.isManualStop) return;
                if (remainingToEnd <= 0) {
                    if (master.animationFrame) cancelAnimationFrame(master.animationFrame);
                    if (isLoopingRef.current) {
                        startFrom(0);
                    } else {
                        setIsPlaying(false);
                        setCurrentTime(0);
                        master.playbackOffset = 0;
                    }
                }
            };
            source.start(0, offset);
            master.activeSources.push(source);
        });

        master.playbackOffset = offset;
        master.playbackStartContextTime = ctx.currentTime;
        setIsPlaying(true);
        master.animationFrame = requestAnimationFrame(updateProgress);
    };

    const playPause = () => {
        const master = masterRef.current;
        if (isPlaying) {
            master.playbackOffset += getAudioContext().currentTime - master.playbackStartContextTime;
            stopAllActiveSources();
            setIsPlaying(false);
        } else {
            startFrom(master.playbackOffset);
        }
    };

    const restart = () => {
        if (isPlaying) stopAllActiveSources();
        startFrom(0);
    };

    const skipToEnd = () => {
        const end = getDuration();
        if (isPlaying) stopAllActiveSources();
        masterRef.current.playbackOffset = end;
        setCurrentTime(end);
        setIsPlaying(false);
    };

    const toggleLoop = () => setIsLooping((prev) => !prev);

    // Reset transport when switching projects; stop everything on unmount
    useEffect(() => {
        stopAllActiveSources();
        masterRef.current.playbackOffset = 0;
        setIsPlaying(false);
        setCurrentTime(0);
        return () => stopAllActiveSources();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    return { isPlaying, currentTime, duration, isLooping, playPause, restart, skipToEnd, toggleLoop };
}