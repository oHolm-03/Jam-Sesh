import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrackData } from '../Tracks-Related/Tracklist';
import { computeWaveformPeaks } from '../Tracks-Related/Audioutils';
import { EFFECT_DEFINITIONS, TrackEffectInstance } from '../Effects-Related/Effects';

export type TrackAudioRefs = {
    audioBuffer: AudioBuffer | null;
    duration: number;
    muteGainNode: GainNode | null;
};

export function useTracks(projectId: string, getAudioContext: () => AudioContext) {
    const [tracks, setTracks] = useState<TrackData[]>([]);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

    const trackAudioRefsRef = useRef<Map<string, TrackAudioRefs>>(new Map());
    const effectsSaveTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const getTrackAudioRefs = useCallback((trackId: string): TrackAudioRefs => {
        let refs = trackAudioRefsRef.current.get(trackId);
        if (!refs) {
            refs = { audioBuffer: null, duration: 0, muteGainNode: null };
            trackAudioRefsRef.current.set(trackId, refs);
        }
        return refs;
    }, []);

    const updateTrackState = useCallback((trackId: string, patch: Partial<TrackData>) => {
        setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...patch } : t)));
    }, []);

    // Load every track for the project, plus each track's latest clip
    useEffect(() => {
        let cancelled = false;

        const loadTracks = async () => {
            setTracks([]);
            setSelectedTrackId(null);
            trackAudioRefsRef.current.clear();

            const { data: trackRows, error } = await supabase
                .from('tracks')
                .select('id, name, effects')
                .eq('project_id', projectId)
                .order('created_at', { ascending: true });

            if (error || !trackRows) return;

            const loaded: TrackData[] = [];

            for (const row of trackRows) {
                const refs = getTrackAudioRefs(row.id);
                let hasRecording = false;
                let duration = 0;
                let waveformPeaks: TrackData['waveformPeaks'] = null;

                const { data: clips } = await supabase
                    .from('clips')
                    .select('storage_path')
                    .eq('track_id', row.id)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (clips && clips.length > 0) {
                    const { data: fileData, error: downloadError } = await supabase.storage
                        .from('audio-clips')
                        .download(clips[0].storage_path);

                    if (!downloadError && fileData) {
                        const arrayBuffer = await fileData.arrayBuffer();
                        const decoded = await getAudioContext().decodeAudioData(arrayBuffer);
                        refs.audioBuffer = decoded;
                        refs.duration = decoded.duration;
                        hasRecording = true;
                        duration = decoded.duration;
                        waveformPeaks = computeWaveformPeaks(decoded);
                    }
                }

                loaded.push({
                    id: row.id,
                    name: row.name,
                    hasRecording,
                    duration,
                    muted: false,
                    effects: row.effects ?? [],
                    waveformPeaks,
                });
            }

            if (!cancelled) setTracks(loaded);
        };

        loadTracks();
        return () => { cancelled = true; };
    }, [projectId, getAudioContext, getTrackAudioRefs]);

    const saveTrackEffects = async (trackId: string, effects: TrackEffectInstance[]) => {
        const { error } = await supabase.from('tracks').update({ effects }).eq('id', trackId);
        if (error) console.error('Failed to save track effects:', error);
    };

    const addTrack = async () => {
        const { data: newTrack, error } = await supabase
            .from('tracks')
            .insert({ project_id: projectId, name: `Track ${tracks.length + 1}` })
            .select()
            .single();

        if (error || !newTrack) {
            console.error('Failed to create track:', error);
            return;
        }
        getTrackAudioRefs(newTrack.id);
        setTracks((prev) => [
            ...prev,
            { id: newTrack.id, name: newTrack.name, hasRecording: false, duration: 0, muted: false, effects: [], waveformPeaks: null },
        ]);
        setSelectedTrackId(newTrack.id);
    };

    const renameTrack = async (trackId: string, newName: string) => {
        const { error } = await supabase.from('tracks').update({ name: newName }).eq('id', trackId);
        if (error) {
            console.error('Failed to rename track:', error);
            return;
        }
        updateTrackState(trackId, { name: newName });
    };

    const toggleMute = (trackId: string) => {
        setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
    };

    const deleteTrack = async (trackId: string) => {
        const track = tracks.find((t) => t.id === trackId);
        const confirmed = window.confirm(`Delete "${track?.name ?? 'this track'}"? This will permanently remove its recording.`);
        if (!confirmed) return;

        // Remove stored audio first so files don't become orphaned
        const { data: clips } = await supabase.from('clips').select('storage_path').eq('track_id', trackId);
        if (clips && clips.length > 0) {
            await supabase.storage.from('audio-clips').remove(clips.map((c) => c.storage_path));
        }

        const { error } = await supabase.from('tracks').delete().eq('id', trackId);
        if (error) {
            console.error('Failed to delete track:', error);
            return;
        }

        trackAudioRefsRef.current.delete(trackId);
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
        setSelectedTrackId((prev) => (prev === trackId ? null : prev));
    };

    const toggleEffect = (trackId: string, type: string) => {
        const track = tracks.find((t) => t.id === trackId);
        if (!track) return;

        const exists = track.effects.some((e) => e.type === type);
        const updatedEffects = exists
            ? track.effects.filter((e) => e.type !== type)
            : [...track.effects, { type, params: { ...(EFFECT_DEFINITIONS.find((d) => d.type === type)?.defaultParams ?? {}) } }];

        updateTrackState(trackId, { effects: updatedEffects });
        saveTrackEffects(trackId, updatedEffects);
    };

    const updateEffectParam = (trackId: string, type: string, key: string, value: number) => {
        const track = tracks.find((t) => t.id === trackId);
        if (!track) return;

        const updatedEffects = track.effects.map((e) =>
            e.type === type ? { ...e, params: { ...e.params, [key]: value } } : e
        );
        updateTrackState(trackId, { effects: updatedEffects });

        // Debounce so a slider drag doesn't fire a save per tick
        const existing = effectsSaveTimeoutRef.current.get(trackId);
        if (existing) clearTimeout(existing);

        const timeout = setTimeout(() => {
            saveTrackEffects(trackId, updatedEffects);
            effectsSaveTimeoutRef.current.delete(trackId);
        }, 500);
        effectsSaveTimeoutRef.current.set(trackId, timeout);
    };

    return {
        tracks,
        selectedTrackId,
        setSelectedTrackId,
        trackAudioRefsRef,
        getTrackAudioRefs,
        updateTrackState,
        addTrack,
        renameTrack,
        toggleMute,
        deleteTrack,
        toggleEffect,
        updateEffectParam,
    };
}