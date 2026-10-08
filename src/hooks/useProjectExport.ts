import { useState } from 'react';
import { exportProject, ExportFormat } from '../Export-Audio/exportAudio';
import { TrackData } from '../Tracks-Related/Tracklist';
import { TrackAudioRefs } from './useTracks';

export function useProjectExport(
    tracks: TrackData[],
    trackAudioRefsRef: React.MutableRefObject<Map<string, TrackAudioRefs>>,
    projectName: string
) {
    const [exportFormat, setExportFormat] = useState<ExportFormat>('wav');
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const audioBuffers = new Map<string, AudioBuffer>();
            tracks.forEach((track) => {
                const buffer = trackAudioRefsRef.current.get(track.id)?.audioBuffer;
                if (buffer) audioBuffers.set(track.id, buffer);
            });

            if (audioBuffers.size === 0) throw new Error('No audio found to export');
            await exportProject(tracks, audioBuffers, projectName, exportFormat);
        } catch (err: any) {
            alert(err.message || 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    return { exportFormat, setExportFormat, isExporting, handleExport };
}