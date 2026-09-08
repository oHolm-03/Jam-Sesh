import React, { useState, useRef, useEffect } from 'react';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import Projects from './Projects';
import ResetPassword from './ResetPassword';
import TrackList, {TrackData} from './Recording-Related/Tracklist';
import { computeWaveformPeaks } from './Recording-Related/Audioutils';
import { EFFECT_DEFINITIONS, EFFECT_PROCESSORS, TrackEffectInstance } from './Effects-Related/Effects';
import EffectsPanel from './Effects-Related/EffectsPanel';
 
// type DistortionNodeSet = {
//     waveshaper: WaveShaperNode;
//     toneFilter: BiquadFilterNode;
//     levelGain: GainNode;
// };

type TrackAudioRefs = {
    audioBuffer: AudioBuffer | null;
    duration: number;
    muteGainNode: GainNode | null;
};

type MasterPlaybackState = {
    activeSources: AudioBufferSourceNode[];
    playbackOffset: number;
    playbackStartContextTime: number;
    isManualStop: boolean;
    animationFrame: number | null;
}
 
const App = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [distortionOn, setDistortionOn] = useState(false);
    const [distortionParams, setDistortionParams] = useState({ drive: 50, tone: 8000, level: 1 });
    
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
    const [tracks, setTracks] = useState<TrackData[]>([]);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [masterIsPlaying, setMasterIsPlaying] = useState(false);
    const [masterCurrentTime, setMasterCurrentTime] = useState(0);
    const [isLooping, setIsLooping] = useState(false);
 
    const monitorStreamRef = useRef<MediaStream | null>(null);
    const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const activeEffectNodesRef = useRef<Map<string, (params: Record<string, number>) => void>>(new Map());
    const monitorCleanupRef = useRef<() => void>(() => {/* noop until monitoring starts */});
    const trackAudioRefsRef = useRef<Map<string, TrackAudioRefs>>(new Map());
    const masterPlaybackRef = useRef<MasterPlaybackState>({
        activeSources: [],
        playbackOffset: 0,
        playbackStartContextTime: 0,
        isManualStop: false,
        animationFrame: null,
    });
    const isLoopingRef = useRef(false);

    //helpers
    const getTrackAudioRefs = (trackId: string): TrackAudioRefs => {
        let refs = trackAudioRefsRef.current.get(trackId);
        if(!refs){
            refs = {audioBuffer: null, duration: 0, muteGainNode: null};
            trackAudioRefsRef.current.set(trackId, refs);
        }
        return refs;
    };

    const updateTrackState = (trackId: string, patch: Partial<TrackData>) => {
        setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...patch} : t)));
    }

    const getMasterDuration = () => Math.max(0, ...tracks.map((t) => t.duration));
 
    // Load media devices on mount
    useEffect(() => {
        const loadDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
                setDevices(audioInputs);
                if (audioInputs.length > 0) {
                    setSelectedDeviceId(audioInputs[0].deviceId);
                }
            } catch (err) {
                console.error("Error loading media devices:", err);
            }
        };
        loadDevices();
    }, []);
 

    /* RESUME FROM HERE */ 

    // Push live paraeter changes onto whichever effect chains are currently active
    useEffect(() => {
        tracks.forEach((track) => {
            track.effects.forEach((effect) => {
                const update = activeEffectNodesRef.current.get(`${track.id}:${effect.type}`);
                if(update) update(effect.params);
            });
        });

        const monitorUpdate = activeEffectNodesRef.current.get('monitor:distortionOn');
        if(monitorUpdate) monitorUpdate(distortionOn ? distortionParams : {drive: 0, tone: 20000, level: 0});
    }, [tracks, distortionOn, distortionParams]);

    // push live mute changes onto whatever mute gain nodes are currently active
    // useEffect(() => {
    //     tracks.forEach((track) => {
    //         const refs = trackAudioRefsRef.current.get(track.id);
    //         if(refs?.muteGainNode) {
    //             refs.muteGainNode.gain.value = track.muted ? 0:1;
    //         }
    //     });
    // }, [tracks]);
 
    // DEBUG & URL CHECK: Inspect environment on load for password recovery
    useEffect(() => {
        console.log("--- APP LOADED ---");
        console.log("Full URL:", window.location.href);
        console.log("Pathname:", window.location.pathname);
        console.log("Hash:", window.location.hash);
        console.log("Search Query:", window.location.search);
 
        if (
            window.location.pathname === '/reset-password' ||
            window.location.hash.includes('type=recovery') ||
            window.location.hash.includes('reset-password')
        ) {
            console.log("Recovery trigger detected via URL/Hash!");
            setIsPasswordRecovery(true);
        }
    }, []);
 
    // Auth state and session listeners with debug logs
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            console.log("Initial Session check:", data.session);
            setSession(data.session);
        });
 
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            console.log("Auth Event Fired:", event);
            console.log("Session from Event:", session);
 
            if (event === 'PASSWORD_RECOVERY') {
                console.log("PASSWORD_RECOVERY event caught!");
                setIsPasswordRecovery(true);
            }
            setSession(session);
        });
        return () => listener.subscription.unsubscribe();
    }, []);
 
    // Fetch user profile username
    useEffect(() => {
        if (!session) {
            setUsername(null);
            return;
        }
        const fetchProfile = async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', session.user.id)
                .single();
 
            if (!error && data) {
                setUsername(data.username);
            }
        };
        fetchProfile();
    }, [session]);

    useEffect(() => {
        isLoopingRef.current = isLooping;
    }, [isLooping]);
 
    // load every track for the current project, and each track's latest clip
    useEffect(() => {
        if(!currentProjectId) return;

        const loadTracks = async () => {
            setTracks([]);
            setSelectedTrackId(null);
            setMasterIsPlaying(false);
            setMasterCurrentTime(0);
            trackAudioRefsRef.current.clear();

            const {data: trackRows, error} = await supabase
                .from('tracks')
                .select('id, name')
                .eq('project_id', currentProjectId)
                .order('created_at', {ascending: true});
            
            if(error || !trackRows) return;

            if(!audioContextRef.current) {
                audioContextRef.current = new AudioContext({latencyHint: 'interactive'});
            }
            
            const loadedTracks: TrackData[] = [];

            for (const row of trackRows) {
                const refs = getTrackAudioRefs(row.id);
                let hasRecording = false;
                let duration = 0;
                let waveformPeaks: TrackData['waveformPeaks'] = null;

                const {data: clips} = await supabase
                    .from('clips')
                    .select('storage_path')
                    .eq('track_id', row.id)
                    .order('created_at', {ascending: false})
                    .limit(1);

                if(clips && clips.length > 0){
                    const {data: fileData, error: downloadError} = await supabase.storage
                        .from('audio-clips')
                        .download(clips[0].storage_path);

                    if(!downloadError && fileData) {
                        const arrayBuffer = await fileData.arrayBuffer();
                        const decodedBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
                        refs.audioBuffer = decodedBuffer;
                        refs.duration = decodedBuffer.duration;
                        hasRecording = true;
                        duration = decodedBuffer.duration;
                        waveformPeaks = computeWaveformPeaks(decodedBuffer);
                    }
                }
                loadedTracks.push({
                    id: row.id,
                    name: row.name,
                    hasRecording,
                    duration,
                    muted: false,
                    effects: [],
                    waveformPeaks,
                });
            }
            setTracks(loadedTracks);
        };
        loadTracks();
    }, [currentProjectId]);

    const handleAddTrack = async () => {
        if(!currentProjectId) return;
        const {data: newTrack, error} = await supabase
            .from('tracks')
            .insert({project_id: currentProjectId, name: `Track ${tracks.length+1}`})
            .select()
            .single();

        if(error || !newTrack){
            console.error('Failed to create track:', error);
            return;
        }
        getTrackAudioRefs(newTrack.id);
        setTracks((prev) => [
            ...prev,
            { id: newTrack.id, name: newTrack.name, hasRecording: false, duration: 0, muted: false, effects: [], waveformPeaks: null },
        ]);
        setSelectedTrackId(newTrack.id);
    };

    const handleRenameTrack = async (trackId: string, newName: string) => {
    const { error } = await supabase.from('tracks').update({ name: newName }).eq('id', trackId);
    if (error) {
        console.error('Failed to rename track:', error);
        return;
    }
    updateTrackState(trackId, { name: newName });
};

const handleToggleMute = (trackId: string) => {
        setTracks((prev) => prev.map((t) => (t.id === trackId ? {...t, muted: !t.muted} : t)));
    };

const handleDeleteTrack = async (trackId: string) => {
    const track = tracks.find((t) => t.id === trackId);
    const confirmed = window.confirm(`Delete "${track?.name ?? 'this track'}"? This will permanently remove its recording.`);
    if (!confirmed) return;

    // Remove any stored audio files for this track first, so they don't become orphaned in storage
    const { data: clips } = await supabase
        .from('clips')
        .select('storage_path')
        .eq('track_id', trackId);

    if (clips && clips.length > 0) {
        await supabase.storage.from('audio-clips').remove(clips.map((c) => c.storage_path));
    }

    const { error } = await supabase.from('tracks').delete().eq('id', trackId);
    if (error) {
        console.error('Failed to delete track:', error);
        return;
    }

    trackAudioRefsRef.current.delete(trackId);
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setSelectedTrackId((prev) => (prev === trackId ? null : prev));
};
 
    /* Adds the effect (with its default params) if the track doesn't have it yet,
    or removes it if it does (one entry per effect type per track) */
    const handleToggleTrackEffect = (trackId: string, type: string) => {
        setTracks((prev) => prev.map((t) => {
            if(t.id !== trackId) return t;
            const exists = t.effects.some((e) => e.type === type);
            if(exists){
                return {...t, effects: t.effects.filter((e) => e.type !== type)};
            }
            const definition = EFFECT_DEFINITIONS.find((d) => d.type === type);
            const defaultParams = definition ? {...definition.defaultParams} : {};
            return {...t, effects: [...t.effects, {type, params: defaultParams}]};
        }));
    };

    const handleUpdateTrackEffectParam = (trackId: string, type: string, key: string, value: number) => {
        setTracks((prev) => prev.map((t) => {
            if(t.id !== trackId) return t;
            return {
                ...t, effects: t.effects.map((e) => (e.type === type ? {...e, params: {...e.params, [key]: value}} : e)),
            };
        }));
    };

    // Builds a chain of the given effects between a source and a destination, in order
    const connectEffectsChain = (
        audioContext: AudioContext,
        sourceNode: AudioNode,
        destinationNode: AudioNode,
        effects: TrackEffectInstance[],
        liveKey: string
    ): (() => void) => {
        let currentNode: AudioNode = sourceNode;
        const registeredKeys: string[] = [];

        effects.forEach((effect) => {
            const processor = EFFECT_PROCESSORS[effect.type];
            if(!processor) return;

            const built = processor.build(audioContext, effect.params);
            currentNode.connect(built.inputNode);
            currentNode = built.outputNode;

            const key = `${liveKey}:${effect.type}`;
            activeEffectNodesRef.current.set(key, built.update);
            registeredKeys.push(key);
        });
        currentNode.connect(destinationNode);

        return () => {
            registeredKeys.forEach((key) => activeEffectNodesRef.current.delete(key));
        };
    };
       
 
    const startMonitoring = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
        if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
        }
        const source = audioContextRef.current.createMediaStreamSource(stream);

        const monitorEffects: TrackEffectInstance[] = distortionOn
            ? [{type: 'distortion', params: distortionParams}] : [];
 
        monitorCleanupRef.current = connectEffectsChain(
            audioContextRef.current,
            source,
            audioContextRef.current.destination,
            monitorEffects,
            'monitor'
        );
 
        monitorStreamRef.current = stream;
        monitorSourceRef.current = source;
        setIsMonitoring(true);
    };
 
    const stopMonitoring = () => {
        monitorCleanupRef.current();
        monitorSourceRef.current?.disconnect();
        monitorStreamRef.current?.getTracks().forEach((track) => track.stop());
        monitorSourceRef.current = null;
        monitorStreamRef.current = null;
        setIsMonitoring(false);
    };
 
    const startRecording = async () => {
        if(!selectedTrackId) return;
        const trackId = selectedTrackId;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined },
        });
 
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
 
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };
 
        recorder.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            const arrayBuffer = await blob.arrayBuffer();
 
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
            }
 
            const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
            const refs = getTrackAudioRefs(trackId);
            refs.audioBuffer = decodedBuffer;
            refs.duration = decodedBuffer.duration;

            updateTrackState(trackId, {hasRecording: true, duration: decodedBuffer.duration, waveformPeaks: computeWaveformPeaks(decodedBuffer),});
            stream.getTracks().forEach((track) => track.stop());

            const { data: userData } = await supabase.auth.getUser();
            const userId = userData.user?.id;
            const fileName = `${trackId}/${Date.now()}.webm`;
            const { error: uploadError } = await supabase.storage
                .from('audio-clips')
                .upload(fileName, blob);
 
            if (uploadError) {
                console.error('Upload failed: ', uploadError);
                return;
            }
            await supabase.from('clips').insert({
                track_id: trackId,
                uploaded_by: userId,
                storage_path: fileName,
                file_size_bytes: blob.size,
            });
        };
 
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
    };
 
    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };
 
    // const makeDistortionCurve = (amount: number) => {
    //     const samples = 44100;
    //     const curve = new Float32Array(samples);
    //     for (let i = 0; i < samples; i++) {
    //         const x = (i * 2) / samples - 1;
    //         curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    //     }
    //     return curve;
    // };
 
    // Core playback function
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
 
    const updateMasterProgress = () => {
        const master = masterPlaybackRef.current;
        if (!audioContextRef.current) return;
        const elapsed = master.playbackOffset + (audioContextRef.current.currentTime - master.playbackStartContextTime);
        setMasterCurrentTime(Math.min(elapsed, getMasterDuration()));
        master.animationFrame = requestAnimationFrame(() => updateMasterProgress);
    };
 
    // Starts every track that has a recording, all from the same offset, so they play in sync.
    // Each track gets its own effects chain + a persistent mute gain node feeding the speakers.
    const startMasterPlaybackFrom = (offset: number) => {
        if(!audioContextRef.current) return;
        const playableTracks = tracks.filter((t) => t.hasRecording);
        if(playableTracks.length === 0) return;

        const master = masterPlaybackRef.current;
        master.isManualStop = false;
        master.activeSources = [];

        let remainingToEnd = playableTracks.length;

        playableTracks.forEach((track) => {
            const refs = getTrackAudioRefs(track.id);
            if(!refs.audioBuffer) {
                remainingToEnd -= 1;
                return;
            }

            const source = audioContextRef.current!.createBufferSource();
            source.buffer = refs.audioBuffer;

            const muteGain = audioContextRef.current!.createGain();
            muteGain.gain.value = track.muted ? 0:1;
            refs.muteGainNode = muteGain;

            const cleanupEffects = connectEffectsChain(audioContextRef.current!, source, muteGain, track.effects, track.id);
            muteGain.connect(audioContextRef.current!.destination);

            source.onended = () => {
            cleanupEffects();
            remainingToEnd -= 1;
            if (master.isManualStop) return;
            if (remainingToEnd <= 0) {
                if (master.animationFrame) cancelAnimationFrame(master.animationFrame);
                if (isLoopingRef.current) {
                    startMasterPlaybackFrom(0);   // loop: go again from the top
                } else {
                    setMasterIsPlaying(false);
                    setMasterCurrentTime(0);
                    master.playbackOffset = 0;
                }
            }
        };
            source.start(0, offset);
            master.activeSources.push(source);
        });

        master.playbackOffset = offset;
        master.playbackStartContextTime = audioContextRef.current.currentTime;
        setMasterIsPlaying(true);
        master.animationFrame = requestAnimationFrame(updateMasterProgress);
    };
    
    const stopAllActiveSources = () => {
        const master = masterPlaybackRef.current;
        master.isManualStop = true;
        master.activeSources.forEach((s) => {
            try { s.stop(); } catch {/* already stopped, ignore */}
        });
        master.activeSources = [];
        if (master.animationFrame) cancelAnimationFrame(master.animationFrame);
    };
 
    const handleMasterPlayPause = () => {
        const master = masterPlaybackRef.current;
        if (masterIsPlaying) {
            const elapsed = master.playbackOffset + (audioContextRef.current!.currentTime - master.playbackStartContextTime);
            master.playbackOffset = elapsed;
            stopAllActiveSources();
            setMasterIsPlaying(false);
        } else {
            startMasterPlaybackFrom(master.playbackOffset);
        }
    };

    const handleMasterRestart = () => {
        if (masterIsPlaying) stopAllActiveSources();
        startMasterPlaybackFrom(0);
    };
 
    const handleMasterSkipToEnd = () => {
        const masterDuration = getMasterDuration();
        if (masterIsPlaying) stopAllActiveSources();
        masterPlaybackRef.current.playbackOffset = masterDuration;
        setMasterCurrentTime(masterDuration);
        setMasterIsPlaying(false);
    };

    const handleToggleLoop = () => {
        setIsLooping((prev) => !prev);
    };
 
    //temporary
    const iconButtonStyle: React.CSSProperties = {};
 
    // 1. Intercept render tree to show password recovery page first
    if (isPasswordRecovery) {
        return (
            <ResetPassword
                onDone={() => {
                    setIsPasswordRecovery(false);
                    window.history.replaceState({}, document.title, "/");
                    window.location.hash = '';
                }}
            />
        );
    }
 
    // 2. Fall back to login screen if not authenticated
    if (!session) {
        return <Auth onLogin={() => {/* session state updates via onAuthStateChange listener */}} />;
    }
 
    // 3. Fall back to project selector if no project is active
    if (!currentProjectId) {
        return (
            <div>
                {username && <p style={{ padding: '20px 40px 0' }}>Welcome, {username}!</p>}
                <Projects onSelectProject={setCurrentProjectId} />
            </div>
        );
    }

    const masterDuration = getMasterDuration();
    const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;
 
    // 4. Default main dashboard
    return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
            <button onClick={() => setCurrentProjectId(null)}>← Back to Projects</button>
            <h1>Jam-Sesh Recording Studio</h1>
 
            <div style={{ marginBottom: 20 }}>
                <label>Input device: </label>
                <select value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)}>
                    {devices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                        </option>
                    ))}
                </select>
            </div>
 
            <div style={{ marginBottom: 20 }}>
                {!isMonitoring ? (
                    <button onClick={startMonitoring}>Start Monitoring</button>
                ) : (
                    <button onClick={stopMonitoring}>Stop Monitoring</button>
                )}
                <label style={{ marginLeft: 10 }}>
                    <input
                        type="checkbox"
                        checked={distortionOn}
                        onChange={(e) => setDistortionOn(e.target.checked)}
                    />
                    Distortion (for monitoring)
                </label>
 
                {distortionOn && (
                    <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                        <label>
                            Drive
                            <input
                                type="range"
                                min={1}
                                max={400}
                                value={distortionParams.drive}
                                onChange={(e) => setDistortionParams((p) => ({ ...p, drive: Number(e.target.value) }))}
                            />
                        </label>
                        <label>
                            Tone
                            <input
                                type="range"
                                min={500}
                                max={20000}
                                value={distortionParams.tone}
                                onChange={(e) => setDistortionParams((p) => ({ ...p, tone: Number(e.target.value) }))}
                            />
                        </label>
                        <label>
                            Level
                            <input
                                type="range"
                                min={0}
                                max={2}
                                step={0.01}
                                value={distortionParams.level}
                                onChange={(e) => setDistortionParams((p) => ({ ...p, level: Number(e.target.value) }))}
                            />
                        </label>
                    </div>
                )}
            </div>
 
            
 
            {/* Master transport — controls every track in sync */}
            <div style={{ marginBottom: 20, maxWidth: 700, border: '1px solid #ccc', borderRadius: 6, padding: 16 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Playback</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                    <button onClick={handleMasterRestart} style={iconButtonStyle} aria-label="Restart">
                        ⏮️   
                    </button>
 
                    <button onClick={handleMasterPlayPause} style={iconButtonStyle} aria-label={masterIsPlaying ? 'Pause' : 'Play'}>
                        {masterIsPlaying ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="5" width="4" height="14" />
                                <rect x="14" y="5" width="4" height="14" />
                            </svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="6,4 20,12 6,20" />
                            </svg>
                        )}
                    </button>
 
                    <button onClick={handleMasterSkipToEnd} style={iconButtonStyle} aria-label="Skip to end">
                        ⏭️
                    </button>

                    <button
                        onClick={handleToggleLoop}
                        aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
                        style={{ ...iconButtonStyle, opacity: isLooping ? 1 : 0.5 }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17 1l4 4-4 4V6H7c-1.1 0-2 .9-2 2v3H3V8c0-2.21 1.79-4 4-4h10V1zM7 23l-4-4 4-4v3h10c1.1 0 2-.9 2-2v-3h2v3c0 2.21-1.79 4-4 4H7v3z"/>
                        </svg>
                    </button>

                    <div>
                    {!isRecording ? (
                        <button onClick={startRecording} disabled={!selectedTrackId}>🔴</button>
                    ) : (
                        <button onClick={stopRecording}>🟥</button>
                    )}
                    </div>
                </div>

                
 
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, minWidth: 36 }}>{formatTime(masterCurrentTime)}</span>
                    <div style={{ flex: 1, height: 6, background: '#ddd', borderRadius: 3, position: 'relative' }}>
                        <div
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                height: '100%',
                                width: `${masterDuration ? (masterCurrentTime / masterDuration) * 100 : 0}%`,
                                background: '#333',
                                borderRadius: 3,
                            }}
                        />
                    </div>
                    <span style={{ fontSize: 12, minWidth: 36 }}>{formatTime(masterDuration)}</span>
                </div>
            </div>
 
            <div style={{ marginTop: 20, maxWidth: 700 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ margin: 0 }}>Tracks</h3>
                    <button onClick={handleAddTrack}>+ Add Track</button>
                </div>
 
                <TrackList
                    tracks={tracks}
                    selectedTrackId={selectedTrackId}
                    onSelectTrack={setSelectedTrackId}
                    onToggleMute={handleToggleMute}
                    onRenameTrack={handleRenameTrack}
                    onDeleteTrack={handleDeleteTrack}
                />
            </div>

            {selectedTrack && (
                <EffectsPanel
                    key={selectedTrack.id}
                    track={selectedTrack}
                    onToggleEffect={(type) => handleToggleTrackEffect(selectedTrack.id, type)}
                    onUpdateEffectParam={(type, key, value) => handleUpdateTrackEffectParam(selectedTrack.id, type, key, value)}
                    onClose={() => setSelectedTrackId(null)}
                />
            )}

        </div>
    );
};
 
export default App;