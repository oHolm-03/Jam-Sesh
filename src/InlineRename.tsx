import React, { useState } from 'react';

type InlineRenameProps = {
    value: string;
    onSave: (newValue: string) => Promise<void> | void;
    label?: string; 
    textStyle?: React.CSSProperties;
};

const InlineRename: React.FC<InlineRenameProps> = ({ value, onSave, label = 'Rename' }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draftValue, setDraftValue] = useState(value);

    const startEditing = () => {
        setDraftValue(value);
        setIsEditing(true);
    };

    const commit = async () => {
        const trimmed = draftValue.trim();
        if (!trimmed) {
            setIsEditing(false);
            return;
        }
        await onSave(trimmed);
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                <input
                    type="text"
                    value={draftValue}
                    autoFocus
                    onChange={(e) => setDraftValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setIsEditing(false);
                    }}
                />
                <button onClick={commit}>Save</button>
                <button onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 'bold' }}>{value}</span>
            <button
                onClick={(e) => { e.stopPropagation(); startEditing(); }}
                aria-label={label}
                style={{ fontSize: 12 }}
            >
                ✎
            </button>
        </div>
    );
};

export default InlineRename;