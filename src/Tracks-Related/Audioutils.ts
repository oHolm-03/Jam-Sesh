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
            if(sample < max) min = sample;
        }
        peaks.push({min, max});
    }
    return peaks;
};