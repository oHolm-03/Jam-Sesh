export type WaveformPeak = {min: number; max: number};

// downsamples an AudioBuffer's first channel into numBuckets (min,max) pairs

export const computeWaveformPeaks = (buffer: AudioBuffer, numBuckets= 200): WaveformPeak [] => {
    const channelData = buffer.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channelData.length / numBuckets));
    const peaks: WaveformPeak[] = [];

    for(let i=0; i<numBuckets; i++){
        const start = i*samplesPerBucket;
        const end = Math.min(start + samplesPerBucket, channelData.length);
        let min = 0;
        let max = 0;
        for(let j=start; j<end; j++){
            const sample = channelData[j];
            if(sample > max) max = sample;
            if(sample < max) min = sample; // potential bug: should be if(sample < min) min=sample
        }
        peaks.push({min, max});
    }
    return peaks;
};

//Returns new AudioBuffer containing only [startSec, endSec) of original
export const trimAudioBuffer = (
    ctx: BaseAudioContext,
    buffer: AudioBuffer,
    startSec: number,
    endSec: number,
): AudioBuffer => {
    const sampleRate = buffer.sampleRate;
    const startFrame = Math.max(0, Math.floor(startSec * sampleRate));
    const endFrame = Math.min(buffer.length, Math.ceil(endSec*sampleRate));
    const length = endFrame - startFrame;
    if(length <= 0) throw new Error('Trim range is empty');

    const out = ctx.createBuffer(buffer.numberOfChannels, length, sampleRate);
    for(let ch=0; ch<buffer.numberOfChannels; ch++){
        out.copyToChannel(buffer.getChannelData(ch).subarray(startFrame, endFrame), ch);
    }
    return out;
};

//encodes AudioBuffer as 16bit PCM WAV file so a trimmed track can be saved
export const encodeWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numFrames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels*bytesPerSample;
    const dataSize = numFrames*blockAlign;

    const arrayBuffer = new ArrayBuffer(44+dataSize);
    const view = new DataView(arrayBuffer);
    const writeString = (offset: number, text: string) => {
        for(let i=0; i<text.length; i++) view.setUint8(offset+i, text.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36+dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt\u0020');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample*8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = Array.from({length: numChannels}, (_, c) => buffer.getChannelData(c));
    let offset = 44;
    for(let i=0; i<numFrames; i++){
        for(let c=0; c<numChannels; c++){
            const s = Math.max(-1, Math.min(1, channels[c][i]));
            view.setInt16(offset, s<0 ? s*0x8000: s*0x7fff, true);
            offset += 2;
        }
    }
    return new Blob([arrayBuffer], {type: 'audio/wav'});
}