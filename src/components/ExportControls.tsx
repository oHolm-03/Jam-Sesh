import { ExportFormat } from '../Export-Audio/exportAudio';

type Props = {
    format: ExportFormat;
    isExporting: boolean;
    onFormatChange: (format: ExportFormat) => void;
    onExport: () => void;
};

const ExportControls = ({ format, isExporting, onFormatChange, onExport }: Props) => (
    <div className="export-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
            value={format}
            onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
            disabled={isExporting}
        >
            <option value="wav">WAV (Lossless)</option>
            <option value="mp3">MP3 (Compressed)</option>
        </select>

        <button onClick={onExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : `Export ${format.toUpperCase()}`}
        </button>
    </div>
);

export default ExportControls;