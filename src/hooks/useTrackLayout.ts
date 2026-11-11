import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TrackData } from '../components/tracks/Tracklist';

export type TrackLayout = {
    trackRows: Record<string, string>;
    trackOrder: string[];
};

export type TrackRow = {
    id: string;
    tracks: TrackData[];
};

export type ScheduledTrack = {
    track: TrackData;
    startTime: number;
    duration: number;
};

const readStoredValue = <T,>(key: string, validate: (value: unknown) => value is T, fallback: T): T => {
    try {
        const stored = window.localStorage.getItem(key);
        if (!stored) return fallback;

        const parsed: unknown = JSON.parse(stored);
        if (!validate(parsed)) {
            console.error(`Saved track layout value is invalid: ${key}`);
            return fallback;
        }
        return parsed;
    } catch (error) {
        console.error(`Failed to load saved track layout: ${key}`, error);
        return fallback;
    }
};

const isTrackRows = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((rowId) => typeof rowId === 'string');

const isTrackOrder = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((trackId) => typeof trackId === 'string');

const readLayout = (projectId: string): TrackLayout => ({
    trackRows: readStoredValue(`jam-sesh-track-rows:${projectId}`, isTrackRows, {}),
    trackOrder: readStoredValue(`jam-sesh-track-order:${projectId}`, isTrackOrder, []),
});

export function buildTrackRows(
    tracks: TrackData[],
    layout: TrackLayout
): TrackRow[] {
    const orderedTracks = tracks
        .map((track, originalIndex) => ({ track, originalIndex }))
        .sort((a, b) => {
            const aOrder = layout.trackOrder.indexOf(a.track.id);
            const bOrder = layout.trackOrder.indexOf(b.track.id);
            const aRank = aOrder === -1 ? layout.trackOrder.length + a.originalIndex : aOrder;
            const bRank = bOrder === -1 ? layout.trackOrder.length + b.originalIndex : bOrder;
            return aRank - bRank;
        });

    return orderedTracks.reduce<TrackRow[]>((rows, { track }) => {
        const rowId = layout.trackRows[track.id] ?? track.id;
        let row = rows.find((candidate) => candidate.id === rowId);
        if (!row) {
            row = { id: rowId, tracks: [] };
            rows.push(row);
        }
        row.tracks.push(track);
        return rows;
    }, []);
}

export function scheduleTrackRows(
    rows: TrackRow[],
    getTrackDuration: (track: TrackData) => number
): { tracks: ScheduledTrack[]; duration: number } {
    const scheduledTracks: ScheduledTrack[] = [];
    let projectDuration = 0;

    rows.forEach((row) => {
        let rowTime = 0;
        row.tracks.forEach((track) => {
            if (!track.hasRecording) return;
            const duration = Math.max(0, getTrackDuration(track));
            if (duration <= 0) return;

            scheduledTracks.push({ track, startTime: rowTime, duration });
            rowTime += duration;
        });
        projectDuration = Math.max(projectDuration, rowTime);
    });

    return { tracks: scheduledTracks, duration: projectDuration };
}

export function useTrackLayout(projectId: string, tracks: TrackData[]) {
    const [savedLayout, setSavedLayout] = useState(() => ({
        projectId,
        ...readLayout(projectId),
    }));

    useEffect(() => {
        if (savedLayout.projectId !== projectId) {
            setSavedLayout({ projectId, ...readLayout(projectId) });
        }
    }, [projectId, savedLayout.projectId]);

    useEffect(() => {
        if (savedLayout.projectId !== projectId) return;
        try {
            window.localStorage.setItem(
                `jam-sesh-track-rows:${projectId}`,
                JSON.stringify(savedLayout.trackRows)
            );
            window.localStorage.setItem(
                `jam-sesh-track-order:${projectId}`,
                JSON.stringify(savedLayout.trackOrder)
            );
        } catch (error) {
            console.error('Failed to save track layout:', error);
        }
    }, [projectId, savedLayout]);

    const trackGroups = useMemo(
        () => buildTrackRows(tracks, savedLayout),
        [tracks, savedLayout]
    );

    const moveTrackRelativeTo = useCallback(
        (movedTrackId: string, targetTrackId: string, side: 'before' | 'after', rowId: string) => {
            if (
                movedTrackId === targetTrackId ||
                !tracks.some((track) => track.id === movedTrackId) ||
                !tracks.some((track) => track.id === targetTrackId)
            ) return;

            const orderedIds = tracks
                .map((track, originalIndex) => ({ track, originalIndex }))
                .sort((a, b) => {
                    const aOrder = savedLayout.trackOrder.indexOf(a.track.id);
                    const bOrder = savedLayout.trackOrder.indexOf(b.track.id);
                    const aRank = aOrder === -1
                        ? savedLayout.trackOrder.length + a.originalIndex
                        : aOrder;
                    const bRank = bOrder === -1
                        ? savedLayout.trackOrder.length + b.originalIndex
                        : bOrder;
                    return aRank - bRank;
                })
                .map(({ track }) => track.id);
            const nextOrder = orderedIds.filter((trackId) => trackId !== movedTrackId);
            const targetIndex = nextOrder.indexOf(targetTrackId);
            if (targetIndex < 0) return;

            nextOrder.splice(targetIndex + (side === 'after' ? 1 : 0), 0, movedTrackId);
            setSavedLayout((current) => ({
                ...current,
                trackOrder: nextOrder,
                trackRows: { ...current.trackRows, [movedTrackId]: rowId },
            }));
        },
        [tracks, savedLayout]
    );

    const moveTrackToNewRow = useCallback((trackId: string) => {
        if (!tracks.some((track) => track.id === trackId)) return;
        setSavedLayout((current) => ({
            ...current,
            trackRows: { ...current.trackRows, [trackId]: `row:${window.crypto.randomUUID()}` },
        }));
    }, [tracks]);

    return {
        trackRows: savedLayout.trackRows,
        trackOrder: savedLayout.trackOrder,
        trackGroups,
        moveTrackRelativeTo,
        moveTrackToNewRow,
    };
}
