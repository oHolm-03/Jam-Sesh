// Adding a new effect means adding one entry to EFFECT_DEFINITIONS (for the UI) and one to EFFECT_PROCESSORS (for the audio)

export type EffectParamDef = {
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
};

export type EffectDefinition = {
    type: string;
    label: string;
    params: EffectParamDef[];
    defaultParams: Record<string, number>;
};

export type TrackEffectInstance = {
    type: string;
    params: Record<string, number>;
};

type BuiltEffect = {
    inputNode: AudioNode;
    outputNode: AudioNode;
    update: (params: Record<string, number>) => void;
};

type EffectProcessor = {
    build: (audioContext: AudioContext, params: Record<string, number>) => BuiltEffect;
};

const makeDistortionCurve = (amount: number): Float32Array => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
};

const distortionProcessor: EffectProcessor = {
    build: (audioContext, params) => {
        const waveshaper = audioContext.createWaveShaper();
        waveshaper.curve = makeDistortionCurve(params.drive);
        waveshaper.oversample = '4x';

        const toneFilter = audioContext.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = params.tone;

        const levelGain = audioContext.createGain();
        levelGain.gain.value = params.level;

        waveshaper.connect(toneFilter);
        toneFilter.connect(levelGain);

        return {
            inputNode: waveshaper,
            outputNode: levelGain,
            update: (newParams) => {
                waveshaper.curve = makeDistortionCurve(newParams.drive);
                toneFilter.frequency.value = newParams.tone;
                levelGain.gain.value = newParams.level;
            },
        };
    },
};

export const EFFECT_PROCESSORS: Record<string, EffectProcessor> = {
    distortion: distortionProcessor,
};

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
    {
        type: 'distortion',
        label: 'Distortion',
        params: [
            { key: 'drive', label: 'Drive', min: 1, max: 400 },
            { key: 'tone', label: 'Tone', min: 500, max: 20000 },
            { key: 'level', label: 'Level', min: 0, max: 2, step: 0.01 },
        ],
        defaultParams: { drive: 50, tone: 8000, level: 1 },
    },
];