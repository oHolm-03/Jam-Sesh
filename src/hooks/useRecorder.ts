import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { TrackData } from '../Tracks-Related/Tracklist';
import { computeWaveformPeaks } from '../Tracks-Related/Audioutils';
import { TrackAudioRefs } from './useTracks';

type Args = {
    selectedTrackId: string | null;
    selectedDeviceId: string;
    getAudioContext: () => AudioContext;
    getTrackAudioRefs: (trackId: string) => TrackAudioRefs;
    updateTrackState: (trackId: string, patch: Partial<TrackData>) => void;
};

export function useRecorder({ selectedTrackId, selectedDeviceId, getAudioContext, getTrackAudioRefs, updateTrackState }: Args) {
    const [isRecording, setIsRecording] = useState(false);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        if (!selectedTrackId) return;
        const trackId = selectedTrackId;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
        });

        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
            const decoded = await getAudioContext().decodeAudioData(arrayBuffer);

            const refs = getTrackAudioRefs(trackId);
            refs.audioBuffer = decoded;
            refs.duration = decoded.duration;

            updateTrackState(trackId, {
                hasRecording: true,
                duration: decoded.duration,
                waveformPeaks: computeWaveformPeaks(decoded),
            });
            stream.getTracks().forEach((t) => t.stop());

            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;
            const fileName = `${trackId}/${Date.now()}.webm`;

            const { error: uploadError } = await supabase.storage.from('audio-clips').upload(fileName, blob);
            if (uploadError) {
                console.error('Upload failed: ', uploadError);
                return;
            }
            await supabase.from('clips').insert({
                track_id: trackId,
                uploaded_by: userId,
                storage_path: fileName,
                file_size_bytes: blob.size,
            });
        };

        recorder.start();
        recorderRef.current = recorder;
        setIsRecording(true);
    };

    const stopRecording = () => {
        recorderRef.current?.stop();
        setIsRecording(false);
    };

    // Release the mic if the studio unmounts mid-recording
    useEffect(() => {
        return () => {
            recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
        };
    }, []);

    return { isRecording, startRecording, stopRecording };
}