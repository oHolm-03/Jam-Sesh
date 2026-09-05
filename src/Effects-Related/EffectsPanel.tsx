import React, { useState } from 'react';
import { EFFECT_DEFINITIONS } from './Effects';
import { TrackData } from '../Recording-Related/Tracklist';

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
        <div
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                height: 220,
                background: '#fff',
                borderTop: '1px solid #ccc',
                boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
                display: 'flex',
                zIndex: 20,
                fontFamily: 'sans-serif',
            }}
        >
            {/* Left: effect list */}
            <div style={{ width: 220, borderRight: '1px solid #ddd', padding: 16, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 14 }}>{track.name}</strong>
                    <button onClick={onClose} aria-label="Close effects panel">✕</button>
                </div>

                {EFFECT_DEFINITIONS.map((def) => {
                    const isApplied = track.effects.some((e) => e.type === def.type);
                    const isSelected = selectedType === def.type;

                    return (
                        <div
                            key={def.type}
                            onClick={() => handleRowClick(def.type)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: isSelected ? '#eee' : 'transparent',
                                marginBottom: 4,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isApplied}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleToggleCheckbox(def.type, e.target.checked)}
                            />
                            <span style={{ fontSize: 13 }}>{def.label}</span>
                        </div>
                    );
                })}
            </div>

            {/* Middle: sliders for whichever effect is selected */}
            <div style={{ flex: 1, padding: 16 }}>
                {selectedDefinition && selectedInstance ? (
                    <>
                        <div style={{ fontWeight: 'bold', marginBottom: 16 }}>{selectedDefinition.label}</div>
                        <div style={{ display: 'flex', gap: 32 }}>
                            {selectedDefinition.params.map((paramDef) => (
                                <label key={paramDef.key} style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 4 }}>
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
                    <div style={{ color: '#888', fontSize: 13 }}>
                        Select an effect to add it to this track.
                    </div>
                )}
            </div>
        </div>
    );
};

export default EffectsPanel;