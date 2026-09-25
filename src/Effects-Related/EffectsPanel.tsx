import React, { useState } from 'react';
import { EFFECT_DEFINITIONS } from './Effects';
import { TrackData } from '../Recording-Related/Tracklist';
import './EffectsPanel.css';

type EffectsPanelProps = {
    track: TrackData;
    onToggleEffect: (type: string) => void;
    onUpdateEffectParam: (type: string, key: string, value: number) => void;
    onClose: () => void;
};

const EffectsPanel: React.FC<EffectsPanelProps> = ({ track, onToggleEffect, onUpdateEffectParam, onClose }) => {
    const [selectedType, setSelectedType] = useState<string | null>(null);

    const selectedInstance = track.effects.find((e) => e.type === selectedType) ?? null;
    const selectedDefinition = EFFECT_DEFINITIONS.find((d) => d.type === selectedType) ?? null;

    // Clicking the checkbox adds/removes the effect and selects/deselects it to match.
    const handleToggleCheckbox = (type: string, checked: boolean) => {
        onToggleEffect(type);
        if (checked) {
            setSelectedType(type);
        } else if (selectedType === type) {
            setSelectedType(null);
        }
    };

    /* Clicking the row itself always selects it for editing — adding it first with default params if it wasn't applied yet, 
     so a single click both "chooses" the effect and shows its sliders. */
    const handleRowClick = (type: string) => {
        const isApplied = track.effects.some((e) => e.type === type);
        if (!isApplied) {
            onToggleEffect(type);
        }
        setSelectedType(type);
    };

    return (
        <div className="effects-panel-container">
            {/* Left: effect list */}
            <div className="effects-sidebar">
                <div className="effects-sidebar-header">
                    <strong className="track-title">{track.name}</strong>
                    <button onClick={onClose} aria-label="Close effects panel">✕</button>
                </div>

                {EFFECT_DEFINITIONS.map((def) => {
                    const isApplied = track.effects.some((e) => e.type === def.type);
                    const isSelected = selectedType === def.type;

                    return (
                        <div
                            key={def.type}
                            onClick={() => handleRowClick(def.type)}
                            className={`effect-item-row${isSelected ? ' selected' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={isApplied}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleToggleCheckbox(def.type, e.target.checked)}
                            />
                            <span className="effect-label">{def.label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Middle: sliders for whichever effect is selected */}
            <div className="effects-controls-area">
                {selectedDefinition && selectedInstance ? (
                    <>
                        <div className="selected-effect-title">{selectedDefinition.label}</div>
                        <div className="sliders-grid">
                            {selectedDefinition.params.map((paramDef) => (
                                <label key={paramDef.key} className="param-slider-label">
                                    {paramDef.label}
                                    <input
                                        type="range"
                                        min={paramDef.min}
                                        max={paramDef.max}
                                        step={paramDef.step ?? 1}
                                        value={selectedInstance.params[paramDef.key]}
                                        onChange={(e) => onUpdateEffectParam(selectedDefinition.type, paramDef.key, Number(e.target.value))}
                                    />
                                </label>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="placeholder-text">
                        Select an effect to add it to this track.
                    </div>
                )}
            </div>
        </div>
    );
};

export default EffectsPanel;