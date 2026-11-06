export type LiveEffectParamDef = {
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
};

export type LiveEffectDefinition = {
    type: string;
    label: string;
    params: LiveEffectParamDef[];
    defaultParams: Record<string, number>;
};

export type LiveEffectInstance = {
    type: string;
    params: Record<string, number>;
};

export type LiveBuiltEffect = {
    inputNode: AudioNode;
    outputNode: AudioNode;
    update: (params: Record<string, number>) => void;
    dispose?: () => void;
};

export type LiveEffectProcessor = {
    build: (audioContext: AudioContext, params: Record<string, number>) => LiveBuiltEffect;
};

const liveOverdriveProcessor: LiveEffectProcessor = {
    build: (audioContext, params) => {
        const inputNode = audioContext.createGain();
        const outputNode = audioContext.createGain();
        const highPass = audioContext.createBiquadFilter();
        const waveShaper = audioContext.createWaveShaper();
        const lowPass = audioContext.createBiquadFilter();

        highPass.type = 'highpass';
        highPass.frequency.value = 320;
        lowPass.type = 'lowpass';
        lowPass.frequency.value = params.tone;
        outputNode.gain.value = params.level;
        waveShaper.oversample = 'none';

        const drive = Math.max(0.1, params.drive);
        const samples = 2048;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.tanh(x * (1 + drive / 20));
        }
        waveShaper.curve = curve;

        inputNode.connect(highPass);
        highPass.connect(waveShaper);
        waveShaper.connect(lowPass);
        lowPass.connect(outputNode);

        return {
            inputNode,
            outputNode,
            update: (newParams) => {
                const newDrive = Math.max(0.1, newParams.drive);
                const newCurve = new Float32Array(samples);
                for (let i = 0; i < samples; i++) {
                    const x = (i * 2) / samples - 1;
                    newCurve[i] = Math.tanh(x * (1 + newDrive / 20));
                }
                waveShaper.curve = newCurve;
                lowPass.frequency.value = newParams.tone;
                outputNode.gain.value = newParams.level;
            },
        };
    },
};

const liveEqProcessor: LiveEffectProcessor = {
    build: (audioContext, params) => {
        const inputNode = audioContext.createGain();
        const outputNode = audioContext.createGain();
        const lowCut = audioContext.createBiquadFilter();
        const presence = audioContext.createBiquadFilter();
        const lowCutFilter = audioContext.createBiquadFilter();

        lowCut.type = 'highpass';
        lowCut.frequency.value = params.lowCut;
        lowCutFilter.type = 'lowpass';
        lowCutFilter.frequency.value = params.highCut;
        presence.type = 'peaking';
        presence.frequency.value = 1000;
        presence.Q.value = 1;
        presence.gain.value = params.presence;
        outputNode.gain.value = params.level;

        inputNode.connect(lowCut);
        lowCut.connect(presence);
        presence.connect(lowCutFilter);
        lowCutFilter.connect(outputNode);

        return {
            inputNode,
            outputNode,
            update: (newParams) => {
                lowCut.frequency.value = newParams.lowCut;
                lowCutFilter.frequency.value = newParams.highCut;
                presence.gain.value = newParams.presence;
                outputNode.gain.value = newParams.level;
            },
        };
    },
};

const liveCompressorProcessor: LiveEffectProcessor = {
    build: (audioContext, params) => {
        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = params.threshold;
        compressor.knee.value = params.knee;
        compressor.ratio.value = params.ratio;
        compressor.attack.value = params.attack / 1000;
        compressor.release.value = params.release / 1000;
        return {
            inputNode: compressor,
            outputNode: compressor,
            update: (newParams) => {
                compressor.threshold.value = newParams.threshold;
                compressor.knee.value = newParams.knee;
                compressor.ratio.value = newParams.ratio;
                compressor.attack.value = newParams.attack / 1000;
                compressor.release.value = newParams.release / 1000;
            },
        };
    },
};

const liveBoostProcessor: LiveEffectProcessor = {
    build: (audioContext, params) => {
        const gain = audioContext.createGain();
        gain.gain.value = params.level;
        return {
            inputNode: gain,
            outputNode: gain,
            update: (newParams) => {
                gain.gain.value = newParams.level;
            },
        };
    },
};

export const LIVE_EFFECT_PROCESSORS: Record<string, LiveEffectProcessor> = {
    liveOverdrive: liveOverdriveProcessor,
    liveEq: liveEqProcessor,
    liveCompressor: liveCompressorProcessor,
    liveBoost: liveBoostProcessor,
};

export const LIVE_EFFECT_DEFINITIONS: LiveEffectDefinition[] = [
    {
        type: 'liveOverdrive',
        label: 'Live Overdrive',
        params: [
            { key: 'drive', label: 'Drive', min: 0, max: 100 },
            { key: 'tone', label: 'Tone', min: 2000, max: 16000, step: 100 },
            { key: 'level', label: 'Level', min: 0, max: 2, step: 0.01 },
        ],
        defaultParams: { drive: 20, tone: 8000, level: 1 },
    },
    {
        type: 'liveEq',
        label: 'Live EQ',
        params: [
            { key: 'lowCut', label: 'Low Cut', min: 20, max: 500, step: 10 },
            { key: 'highCut', label: 'High Cut', min: 3000, max: 16000, step: 100 },
            { key: 'presence', label: 'Presence', min: -12, max: 12, step: 0.5 },
            { key: 'level', label: 'Level', min: 0, max: 2, step: 0.01 },
        ],
        defaultParams: { lowCut: 80, highCut: 12000, presence: 2, level: 1 },
    },
    {
        type: 'liveCompressor',
        label: 'Live Compressor',
        params: [
            { key: 'threshold', label: 'Threshold (dB)', min: -60, max: 0 },
            { key: 'knee', label: 'Knee', min: 0, max: 40 },
            { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5 },
            { key: 'attack', label: 'Attack (ms)', min: 1, max: 100 },
            { key: 'release', label: 'Release (ms)', min: 10, max: 1000, step: 10 },
        ],
        defaultParams: { threshold: -24, knee: 12, ratio: 4, attack: 5, release: 100 },
    },
    {
        type: 'liveBoost',
        label: 'Clean Boost',
        params: [
            { key: 'level', label: 'Level', min: 0.25, max: 3, step: 0.01 },
        ],
        defaultParams: { level: 1 },
    },
];
