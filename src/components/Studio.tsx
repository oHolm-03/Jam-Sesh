import { useState, useRef } from 'react';
import TrackList from './tracks/Tracklist';
import EffectsPanel from './effects/EffectsPanel';
import LiveJam from './live-jam/LiveJam';
import { DocumentSidebar } from './documents/Documents';

import { useAudioContext } from '../hooks/useAudioContext';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { useProjectName } from '../hooks/useProjectName';
import { useTracks } from '../hooks/useTracks';
import { useEffectsEngine } from '../hooks/useEffectsEngine';
import { useProjectExport } from '../hooks/useProjectExport';
import { useMasterPlayback, TransportControls } from '../hooks/useMasterPlayback';

import DeviceSelect from './DeviceSelect';
import ExportControls from './ExportControls';
import Recording from './recording/Recording';
import Playback from './playback/Playback';

type Props = {
    projectId: string;
    onBack: () => void;
};

const Studio = ({ projectId, onBack }: Props) => {
    const [isNotesOpen, setIsNotesOpen] = useState(false);
    const [effectsPanelPosition, setEffectsPanelPosition] = useState<{ x: number; y: number } | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [isTrimMode, setIsTrimMode] = useState(false);

    const getAudioContext = useAudioContext();
    const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices();
    const projectName = useProjectName(projectId);

    const trackApi = useTracks(projectId, getAudioContext);
    const { tracks, selectedTrackId, setSelectedTrackId } = trackApi;

    const { registryRef, connectEffectsChain } = useEffectsEngine(tracks);
    const exporter = useProjectExport(tracks, trackApi.trackAudioRefsRef, projectName);

    const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;

    const transportRef = useRef<TransportControls | null>(null);

    const toggleTrimMode = () => {
        transportRef.current?.beginScrub();
        setIsTrimMode((prev) => !prev);
    };

    const handleTrimTrack = async (trackId: string, startSec: number, endSec: number) => {
        transportRef.current?.beginScrub();
        const ok = await trackApi.trimTrack(trackId, startSec, endSec);
        if(!ok){
            window.alert('Could not save the trim. Your track is unchanged.');
            return;
        }
        transportRef.current?.scrubTo(0);
    };

    return (
        <div className="app-container">
            <button onClick={onBack}>← Back to Projects</button>
            <h1>Jam-Sesh Recording Studio</h1>

            <DeviceSelect devices={devices} value={selectedDeviceId} onChange={setSelectedDeviceId} />

            <div className="live-jam-container">
                <LiveJam projectId={projectId} />
            </div>

            <button
                onClick={() => setIsNotesOpen((prev) => !prev)}
                style={{
                    position: 'fixed', top: '20px', right: '20px', zIndex: 1000,
                    padding: '10px 16px', backgroundColor: 'red', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                }}
            >
                {isNotesOpen ? 'Close Notes' : 'Open Notes'}
            </button>

            <DocumentSidebar
                projectId={projectId}
                isOpen={isNotesOpen}
                onToggle={() => setIsNotesOpen((prev) => !prev)}
            />

            <ExportControls
                format={exporter.exportFormat}
                isExporting={exporter.isExporting}
                onFormatChange={exporter.setExportFormat}
                onExport={exporter.handleExport}
            />

            <Recording
                selectedTrackId={selectedTrackId}
                selectedDeviceId={selectedDeviceId}
                getAudioContext={getAudioContext}
                getTrackAudioRefs={trackApi.getTrackAudioRefs}
                updateTrackState={trackApi.updateTrackState}
                registryRef={registryRef}
                connectEffectsChain={connectEffectsChain}
            />

            <Playback
                projectId={projectId}
                tracks={tracks}
                getTrackAudioRefs={trackApi.getTrackAudioRefs}
                getAudioContext={getAudioContext}
                connectEffectsChain={connectEffectsChain}
                onTimeChange={setCurrentTime}
                transportRef={transportRef}
            />

            {/* <div className="tracks-section">
                <div className="tracks-header">
                    <h3 className="tracks-title"><button onClick={trackApi.addTrack}>+ Add Track</button></h3>
                </div> */}
            <div className="tracks-section">
                <div className="tracks-header">
                    <h3 className="tracks-title">
                        <button onClick={trackApi.addTrack}>+ Add Track</button>
                        <button
                            onClick={toggleTrimMode}
                            aria-pressed={isTrimMode}
                            className={`trim-toggle${isTrimMode ? ' is-active' : ''}`}
                        >
                            {isTrimMode ? 'Exit Trim' : 'Trim'}
                        </button>
                    </h3>
                </div>

                <TrackList
                    tracks={tracks}
                    selectedTrackId={selectedTrackId}
                    currentTime={currentTime}
                    onSelectTrack={(trackId) => { setSelectedTrackId(trackId); setEffectsPanelPosition(null); }}
                    onToggleMute={trackApi.toggleMute}
                    onRenameTrack={trackApi.renameTrack}
                    onDeleteTrack={trackApi.deleteTrack}
                    onTrackContextMenu={() => {/* context-menu positioning currently disabled */}}
                    onSeekStart={() => transportRef.current?.beginScrub()}
                    onSeek={(time) => transportRef.current?.scrubTo(time)}
                    onSeekEnd={(time) => transportRef.current?.endScrub(time)}
                    isTrimMode={isTrimMode}
                    onTrimTrack={handleTrimTrack}
                />
            </div>

            {selectedTrack && (
                <div
                    className={effectsPanelPosition ? 'effects-panel-context-positioned' : 'effects-panel-default-positioned'}
                    style={effectsPanelPosition ? { left: effectsPanelPosition.x, top: effectsPanelPosition.y } : undefined}
                >
                    <EffectsPanel
                        key={selectedTrack.id}
                        track={selectedTrack}
                        onToggleEffect={(type) => trackApi.toggleEffect(selectedTrack.id, type)}
                        onUpdateEffectParam={(type, key, value) =>
                            trackApi.updateEffectParam(selectedTrack.id, type, key, value)
                        }
                        onClose={() => { setSelectedTrackId(null); setEffectsPanelPosition(null); }}
                    />
                </div>
            )}
        </div>
    );
};

export default Studio;