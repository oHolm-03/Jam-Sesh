import { useEffect, useRef, useState } from 'react';
import { TrackData } from '../components/tracks/Tracklist';
import { TrackAudioRefs } from './useTracks';
import { ConnectEffectsChain } from './useEffectsEngine';
import { scheduleTrackRows } from './useTrackLayout';
import type { TrackRow } from './useTrackLayout';

type MasterPlaybackState = {
    activeSources: AudioBufferSourceNode[];
    playbackOffset: number;
    playbackStartContextTime: number;
    isManualStop: boolean;
    animationFrame: number | null;
    generation: number; 
};

export type TransportControls = {
    beginScrub: () => void;
    scrubTo: (time: number) => void;
    endScrub: (time: number) => void;
};

type Args = {
    projectId: string;
    tracks: TrackData[];
    trackGroups: TrackRow[];
    getTrackAudioRefs: (trackId: string) => TrackAudioRefs;
    getAudioContext: () => AudioContext;
    connectEffectsChain: ConnectEffectsChain;
};

export function useMasterPlayback({ projectId, tracks, trackGroups, getTrackAudioRefs, getAudioContext, connectEffectsChain }: Args) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLooping, setIsLooping] = useState(false);

    const masterRef = useRef<MasterPlaybackState>({
        activeSources: [],
        playbackOffset: 0,
        playbackStartContextTime: 0,
        isManualStop: false,
        animationFrame: null,
        generation: 0,
    });
    const isLoopingRef = useRef(false);
    const trackGroupsRef = useRef<TrackRow[]>(trackGroups);

    useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
    useEffect(() => { trackGroupsRef.current = trackGroups; }, [trackGroups]);
    useEffect(() => {
        const ctx = getAudioContext();
        tracks.forEach((track) => {
            const gainNode = getTrackAudioRefs(track.id).muteGainNode;
            if (!gainNode) return;

            const gainMultiplier = Math.pow(10, track.gainDb / 20);
            const volumeMultiplier = Math.pow(10, track.volumeDb / 20);
            gainNode.gain.setTargetAtTime(
                track.muted ? 0 : gainMultiplier * volumeMultiplier,
                ctx.currentTime,
                0.01
            );
        });
    }, [tracks, getTrackAudioRefs, getAudioContext]);

    const getSchedule = () => scheduleTrackRows(
        trackGroupsRef.current,
        (track) => getTrackAudioRefs(track.id).audioBuffer?.duration ?? track.duration
    );
    const duration = getSchedule().duration;
    const getDuration = () => getSchedule().duration;

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

    // Tracks in a row play sequentially; separate rows remain synchronized.
    const startFrom = (offset: number) => {
        const ctx = getAudioContext();
        const schedule = getSchedule();
        const playable = schedule.tracks.filter((item) => item.startTime + item.duration > offset);
        if (playable.length === 0) {
            setCurrentTime(schedule.duration);
            masterRef.current.playbackOffset = schedule.duration;
            setIsPlaying(false);
            return;
        }

        const master = masterRef.current;
        master.isManualStop = false;
        master.activeSources = [];
        const gen = ++master.generation;

        let remainingToEnd = 0;

        playable.forEach(({ track, startTime, duration: trackDuration }) => {
            const refs = getTrackAudioRefs(track.id);
            if (!refs.audioBuffer) {
                return;
            }
            const trackOffset = Math.max(0, offset - startTime);
            if (trackOffset >= trackDuration) return;

            const source = ctx.createBufferSource();
            source.buffer = refs.audioBuffer;

            const muteGain = ctx.createGain();
            const gainMultiplier = Math.pow(10, track.gainDb / 20);
            const volumeMultiplier = Math.pow(10, track.volumeDb / 20);
            muteGain.gain.value = track.muted ? 0 : gainMultiplier * volumeMultiplier;
            refs.muteGainNode = muteGain;

            const cleanupEffects = connectEffectsChain(ctx, source, muteGain, track.effects, track.id);
            muteGain.connect(ctx.destination);

            remainingToEnd += 1;
            source.onended = () => {
                cleanupEffects();
                remainingToEnd -= 1;
                if (master.isManualStop || gen !== master.generation) return;
                if (remainingToEnd <= 0) {
                    if (master.animationFrame) cancelAnimationFrame(master.animationFrame);
                    if (isLoopingRef.current) {
                        startFrom(0);
                    } else {
                        const totalDuration = schedule.duration;
                        setIsPlaying(false);
                        setCurrentTime(totalDuration);
                        master.playbackOffset = totalDuration;
                    }
                }
            };
            source.start(
                ctx.currentTime + Math.max(0, startTime - offset),
                trackOffset
            );
            master.activeSources.push(source);
        });

        if (remainingToEnd === 0) {
            setCurrentTime(schedule.duration);
            master.playbackOffset = schedule.duration;
            setIsPlaying(false);
            return;
        }

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
            const totalDuration = getDuration();
            if(currentTime >= totalDuration || master.playbackOffset >= totalDuration){
                setCurrentTime(0);
                startFrom(0);
            }
            else{startFrom(master.playbackOffset);}
        }
    };

    const restart = () => {
        stopAllActiveSources();
        masterRef.current.playbackOffset = 0;
        setCurrentTime(0);
        setIsPlaying(false);
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
    }, [projectId]);

    //scrub functions for dragging the playhead
    const clampTime = (t: number) => Math.max(0, Math.min(t, getDuration()));

    const beginScrub = () => {
        stopAllActiveSources();
        setIsPlaying(false);
    };

    const scrubTo = (time: number) => {
        const t = clampTime(time);
        masterRef.current.playbackOffset = t;
        setCurrentTime(t);
    };

    const endScrub = (time: number) => {
        const t = clampTime(time);
        masterRef.current.playbackOffset = t;
        setCurrentTime(t);
        if(t >= getDuration()) return;
    };

    return { isPlaying, currentTime, duration, isLooping, playPause, restart, skipToEnd, toggleLoop, beginScrub, scrubTo, endScrub };
}