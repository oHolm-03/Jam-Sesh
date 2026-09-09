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

const delayProcessor: EffectProcessor = {
    build: (audioContext, params) => {
        const inputNode = audioContext.createGain();
        const outputNode = audioContext.createGain();

        const dryGain = audioContext.createGain();
        dryGain.gain.value = 1;

        const delayNode = audioContext.createDelay(5.0);
        delayNode.delayTime.value = params.time;

        const feedbackGain = audioContext.createGain();
        feedbackGain.gain.value = params.feedback;

        const wetGain = audioContext.createGain();
        wetGain.gain.value = params.mix;

        inputNode.connect(dryGain);
        dryGain.connect(outputNode);

        inputNode.connect(delayNode);
        delayNode.connect(feedbackGain);
        feedbackGain.connect(delayNode);
        delayNode.connect(wetGain);
        wetGain.connect(outputNode);

        return {
            inputNode, outputNode,
            update: (newParams) => {
                delayNode.delayTime.value = newParams.time;
                feedbackGain.gain.value = newParams.feedback;
                wetGain.gain.value = newParams.mix;
            },
        };
    },
};

const createImpulseResponse = (audioContext: AudioContext, duration: number, decay: number): AudioBuffer => {
    const sampleRate = audioContext.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for(let i=0; i<length; i++){
        const envelope = Math.pow(1-i / length, decay);
        left[i] = (Math.random() * 2-1) * envelope;
        right[i] = (Math.random() * 2-1) * envelope;
    }
    return impulse;
};

const reverbProcessor: EffectProcessor = {
    build: (audioContext, params) => {
        const inputNode = audioContext.createGain();
        const outputNode = audioContext.createGain();

        const dryGain = audioContext.createGain();
        dryGain.gain.value = 1 - params.mix;

        const convolver = audioContext.createConvolver();
        convolver.buffer = createImpulseResponse(audioContext, params.decay, 3.0);

        const dampeningFilter = audioContext.createBiquadFilter();
        dampeningFilter.type = 'lowpass';
        dampeningFilter.frequency.value = params.dampening;

        const wetGain = audioContext.createGain();
        wetGain.gain.value = params.mix;

        inputNode.connect(dryGain);
        dryGain.connect(outputNode);

        inputNode.connect(convolver);
        convolver.connect(dampeningFilter);
        dampeningFilter.connect(wetGain);
        wetGain.connect(outputNode);

        return {
            inputNode,
            outputNode,
            update: (newParams) => {
                convolver.buffer = createImpulseResponse(audioContext, newParams.decay, 3.0);
                dampeningFilter.frequency.value = newParams.dampening;
                dryGain.gain.value = 1 - newParams.mix;
                wetGain.gain.value = newParams.mix;
            },
        };
    },
};

const makeOverdriveCurve = (drive: number): Float32Array => {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const k = Math.max(0.1, drive);

    for(let i=0; i<samples; i++){
        const x=(i*2) / samples-1;
        curve[i] = Math.tanh(x*(1+k/10));
    }
    return curve;
};

const overdriveProcessor: EffectProcessor = {
    build: (audioContext, params) => {
        const inputNode = audioContext.createGain();
        const outputNode = audioContext.createGain();

        const preFilter = audioContext.createBiquadFilter();
        preFilter.type = 'highpass';
        preFilter.frequency.value = 320;

        const waveshaper = audioContext.createWaveShaper();
        waveshaper.curve = makeOverdriveCurve(params.drive);
        waveshaper.oversample = '4x';

        const midBoost = audioContext.createBiquadFilter();
        midBoost.type = 'peaking';
        midBoost.frequency.value = 1000;
        midBoost.Q.value = 1.0;
        midBoost.gain.value = params.tone;

        const levelGain = audioContext.createGain();
        levelGain.gain.value = params.level;

        inputNode.connect(preFilter);
        preFilter.connect(waveshaper);
        waveshaper.connect(midBoost);
        midBoost.connect(levelGain);
        levelGain.connect(outputNode);

        return{
            inputNode,
            outputNode,
            update: (newParams) => {
                waveshaper.curve = makeOverdriveCurve(newParams.drive);
                midBoost.gain.value = newParams.tone;
                levelGain.gain.value = newParams.level;
            },
        };
    },
};

export const EFFECT_PROCESSORS: Record<string, EffectProcessor> = {
    distortion: distortionProcessor,
    delay: delayProcessor,
    reverb: reverbProcessor,
    overdrive: overdriveProcessor,
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
    {
        type: 'delay',
        label: 'Delay',
        params: [
            {key: 'time', label: 'Time', min: 0.05, max: 1, step: 0.01},
            {key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01},
            {key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01},
        ],
        defaultParams: {time: 0.3, feedback: 0.35, mix: 0.4},
    },
    {
        type: 'reverb',
        label: 'Reverb',
        params: [
            {key: 'decay', label: 'Decay (s)', min: 0.5, max: 8, step: 0.1},
            {key: 'dampening', label: 'Dampening', min: 1000, max: 20000, step: 100},
            {key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01},
        ],
        defaultParams: {decay: 2.5, dampening: 7000, mix: 0.35},
    },
    {
        type: 'overdrive',
        label: 'Overdrive',
        params: [
            {key: 'drive', label: 'Drive', min: 1, max: 100},
            {key: 'tone', label: 'Mid Boost', min: -6, max: 12, step: 0.5},
            {key: 'level', label: 'Level', min: 0, max: 2, step: 0.01},
        ],
        defaultParams: {drive: 20, tone: 3, level: 1},
    },
];