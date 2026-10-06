import { Mp3Encoder } from "@breezystack/lamejs";
import { TrackData } from "../Tracks-Related/Tracklist";

export type ExportFormat = 'wav' | 'mp3';

//encode AudioBuffer into WAV format
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length*numChannels*2+44;
    const outBuffer = new ArrayBuffer(length);
    const view = new DataView(outBuffer);
    const writeString = (offset: number, str: string) => {
        for(let i=0; i<str.length; i++){
            view.setUint8(offset+i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, buffer.length * numChannels * 2, true);

    let offset = 44;
    for(let i=0; i<buffer.length; i++){
        for(let channel = 0; channel<numChannels; channel++){
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }
    return new Blob([outBuffer], {type: 'audio/wav'});
}

//encode AudioBuffer into MP3 format via lamejs
function audioBufferToMp3(buffer: AudioBuffer, kbps: number = 192): Blob {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
    const mp3Data: Uint8Array[] = [];

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = channels > 1 ? buffer.getChannelData(1) : leftChannel;

    const sampleBlockSize = 1152; // lamejs processing frame size
    const leftInt16 = new Int16Array(leftChannel.length);
    const rightInt16 = new Int16Array(rightChannel.length);

    for(let i=0; i<buffer.length; i++){
        leftInt16[i] = Math.max(-32768, Math.min(32767, leftChannel[i]*32767));
        rightInt16[i] = Math.max(-32768, Math.min(32767, rightChannel[i]*32767));
    }

    //process in chunks
    for(let i=0; i<leftInt16.length; i+=sampleBlockSize){
        const leftChunk = leftInt16.subarray(i, i+sampleBlockSize);
        const rightChunk = rightInt16.subarray(i, i+sampleBlockSize);

        let mp3buf: Uint8Array;
        if(channels === 1){
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        } else {
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        }

        if(mp3buf.length > 0) {
            mp3Data.push(new Uint8Array(mp3buf));
        }
    }
    const mp3buf = mp3encoder.flush();
    if(mp3buf.length>0){
        mp3Data.push(new Uint8Array(mp3buf));
    }
    return new Blob(mp3Data as BlobPart[], {type: 'audio/mp3'});
}

//Main export function supporting WAV and MP3
export async function exportProject(
    tracks: TrackData[],
    audioBuffers: Map<string, AudioBuffer>,
    projectName: string = 'project-export',
    format: ExportFormat = 'wav'): 
    Promise<void> { const unmutedTracks = tracks.filter((t) => !t.muted && t.hasRecording);
        if(unmutedTracks.length === 0){
            throw new Error('No unmuted tracks with audio found to export');
        }
        let maxDuration = 0;
        unmutedTracks.forEach((t) => {
            const buf = audioBuffers.get(t.id);
            if(buf && buf.duration > maxDuration){
                maxDuration = buf.duration;
            }
        });

        if(maxDuration === 0){
            throw new Error('No audio content found across active tracks.');
        }

        const sampleRate = 44100;
        const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate*maxDuration), sampleRate);

        unmutedTracks.forEach((track) => {
            const buffer = audioBuffers.get(track.id);
            if(!buffer) return;

            const source = offlineCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(offlineCtx.destination);
            source.start(0);
        });

        //render offline mix down
        const renderedBuffer = await offlineCtx.startRendering();

        //choose encoding based on selected format
        let blob: Blob;
        if(format === 'mp3'){
            blob = audioBufferToMp3(renderedBuffer, 192); //192 kbps
        } else {
            blob = audioBufferToWav(renderedBuffer);
        }

        //download output file
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${projectName.toLowerCase().replace(/\s+/g, '_')}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
    }
