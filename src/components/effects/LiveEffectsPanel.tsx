import React from 'react';
import { LiveEffectInstance } from './LiveEffects';
import { LiveEffectDefinition } from './LiveEffects';
import './LiveEffectsPanel.css';

type Props = {
    definitions: LiveEffectDefinition[];
    effects: LiveEffectInstance[];
    onToggleEffect: (type: string) => void;
    onUpdateEffectParam: (type: string, key: string, value: number) => void;
};

const LiveEffectsPanel: React.FC<Props> = ({
    definitions,
    effects,
    onToggleEffect,
    onUpdateEffectParam,
}) => {
    const selectedTypes = new Set(effects.map((effect) => effect.type));

    return (
        <div className="live-effects-panel" aria-label="Live monitoring effects">
            <div className="live-effects-list">
                {definitions.map((definition) => (
                    <label key={definition.type} className="live-effect-toggle">
                        <input
                            type="checkbox"
                            checked={selectedTypes.has(definition.type)}
                            onChange={() => onToggleEffect(definition.type)}
                        />
                        {definition.label}
                    </label>
                ))}
            </div>

            {effects.map((effect) => {
                const definition = definitions.find((item) => item.type === effect.type);
                if (!definition) return null;

                return (
                    <div key={effect.type} className="live-effect-controls">
                        <strong>{definition.label}</strong>
                        <div className="live-effect-sliders">
                            {definition.params.map((param) => (
                                <label key={param.key}>
                                    {param.label}
                                    <input
                                        type="range"
                                        min={param.min}
                                        max={param.max}
                                        step={param.step ?? 1}
                                        value={effect.params[param.key]}
                                        onChange={(event) =>
                                            onUpdateEffectParam(
                                                definition.type,
                                                param.key,
                                                Number(event.target.value)
                                            )
                                        }
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default LiveEffectsPanel;
