import { EFFECT_PROCESSORS, TrackEffectInstance } from '../Effects-Related/Effects';

// Maps "<liveKey>:<effectType>" -> function that pushes new params into a running effect node
export type EffectUpdateRegistry = Map<string, (params: Record<string, number>) => void>;

// Builds a chain of the given effects between a source and a destination, in order.
// Returns a cleanup function that unregisters the live-update hooks and disposes nodes.
export function connectEffectsChain(
    audioContext: AudioContext,
    sourceNode: AudioNode,
    destinationNode: AudioNode,
    effects: TrackEffectInstance[],
    liveKey: string,
    registry: EffectUpdateRegistry
): () => void {
    let currentNode: AudioNode = sourceNode;
    const registeredKeys: string[] = [];
    const disposeFns: (() => void)[] = [];

    effects.forEach((effect) => {
        const processor = EFFECT_PROCESSORS[effect.type];
        if (!processor) return;

        const built = processor.build(audioContext, effect.params);
        currentNode.connect(built.inputNode);
        currentNode = built.outputNode;

        const key = `${liveKey}:${effect.type}`;
        registry.set(key, built.update);
        registeredKeys.push(key);

        if (built.dispose) disposeFns.push(built.dispose);
    });
    currentNode.connect(destinationNode);

    return () => {
        registeredKeys.forEach((key) => registry.delete(key));
        disposeFns.forEach((fn) => fn());
    };
}