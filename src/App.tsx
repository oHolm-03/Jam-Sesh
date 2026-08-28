import React, { useState, useRef, useEffect } from 'react';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import Projects from './Projects';
import ResetPassword from './ResetPassword';
 
type DistortionNodeSet = {
    waveshaper: WaveShaperNode;
    toneFilter: BiquadFilterNode;
    levelGain: GainNode;
};
 
const App = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [hasRecording, setHasRecording] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [distortionOn, setDistortionOn] = useState(false);
    const [distortionParams, setDistortionParams] = useState({ drive: 50, tone: 8000, level: 1 });
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
 
    const monitorStreamRef = useRef<MediaStream | null>(null);
    const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const playbackOffsetRef = useRef(0);
    const playbackStartContextTimeRef = useRef(0);
    const isManualStopRef = useRef(false);
    const animationFrameRef = useRef<number | null>(null);
    const activeDistortionNodesRef = useRef<DistortionNodeSet[]>([]);
    const monitorCleanupRef = useRef<() => void>(() => {/* noop until monitoring starts */});
 
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
 
    // Push live slider changes onto whatever distortion nodes are currently active
    useEffect(() => {
        activeDistortionNodesRef.current.forEach(({ waveshaper, toneFilter, levelGain }) => {
            waveshaper.curve = makeDistortionCurve(distortionParams.drive);
            toneFilter.frequency.value = distortionParams.tone;
            levelGain.gain.value = distortionParams.level;
        });
    }, [distortionParams]);
 
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
        if (!currentProjectId) return;
 
        const setupProject = async () => {
            audioBufferRef.current = null;
            setHasRecording(false);
            setDuration(0);
            setCurrentTime(0);
            playbackOffsetRef.current = 0;
            if (currentSourceRef.current) {
                try { currentSourceRef.current.stop(); } catch {/* already stopped */}
                currentSourceRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
 
            const trackId = await ensureDefaultTrack(currentProjectId);
            setCurrentTrackId(trackId);
            if (!trackId) return;
 
            const { data: clips } = await supabase
                .from('clips')
                .select('storage_path')
                .eq('track_id', trackId)
                .order('created_at', { ascending: false })
                .limit(1);
            if (clips && clips.length > 0) {
                const { data: fileData, error: downloadError } = await supabase.storage
                    .from('audio-clips')
                    .download(clips[0].storage_path);
                if (downloadError || !fileData) return;
 
                const arrayBuffer = await fileData.arrayBuffer();
                if (!audioContextRef.current) {
                    audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
                }
                const decodedBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                audioBufferRef.current = decodedBuffer;
                setDuration(decodedBuffer.duration);
                setHasRecording(true);
            }
        };
        setupProject();
    }, [currentProjectId]);
 
    const ensureDefaultTrack = async (projectId: string) => {
        const { data: existingTracks } = await supabase
            .from('tracks')
            .select('id')
            .eq('project_id', projectId)
            .limit(1);
        if (existingTracks && existingTracks.length > 0) {
            return existingTracks[0].id;
        }
        const { data: newTrack, error } = await supabase
            .from('tracks')
            .insert({ project_id: projectId, name: 'Main' })
            .select()
            .single();
        if (error || !newTrack) {
            console.error('Failed to create default track:', error);
            return null;
        }
        return newTrack.id;
    };
 
    // Builds (or bypasses) the distortion chain between a source and a destination.
    // Returns a cleanup function to call when that particular stream stops,
    // so we stop pushing live parameter updates onto disconnected nodes.
    const connectEffectsChain = (
        audioContext: AudioContext,
        sourceNode: AudioNode,
        destinationNode: AudioNode
    ): (() => void) => {
        if (!distortionOn) {
            sourceNode.connect(destinationNode);
            return () => {/* nothing to clean up */};
        }
 
        const waveshaper = audioContext.createWaveShaper();
        waveshaper.curve = makeDistortionCurve(distortionParams.drive);
        waveshaper.oversample = '4x';
 
        const toneFilter = audioContext.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = distortionParams.tone;
 
        const levelGain = audioContext.createGain();
        levelGain.gain.value = distortionParams.level;
 
        sourceNode.connect(waveshaper);
        waveshaper.connect(toneFilter);
        toneFilter.connect(levelGain);
        levelGain.connect(destinationNode);
 
        const nodeSet: DistortionNodeSet = { waveshaper, toneFilter, levelGain };
        activeDistortionNodesRef.current.push(nodeSet);
 
        return () => {
            activeDistortionNodesRef.current = activeDistortionNodesRef.current.filter(
                (n) => n !== nodeSet
            );
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
 
        monitorCleanupRef.current = connectEffectsChain(
            audioContextRef.current,
            source,
            audioContextRef.current.destination
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
            audioBufferRef.current = decodedBuffer;
 
            setDuration(decodedBuffer.duration);
            playbackOffsetRef.current = 0;
            setCurrentTime(0);
            setIsPlaying(false);
            if (currentSourceRef.current) {
                try {
                    currentSourceRef.current.stop();
                } catch {
                    /* already stopped, ignore */
                }
                currentSourceRef.current = null;
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
 
            setHasRecording(true);
            stream.getTracks().forEach((track) => track.stop());
 
            if (currentTrackId) {
                const { data: userData } = await supabase.auth.getUser();
                const userId = userData.user?.id;
                const fileName = `${currentTrackId}/${Date.now()}.webm`;
                const { error: uploadError } = await supabase.storage
                    .from('audio-clips')
                    .upload(fileName, blob);
 
                if (uploadError) {
                    console.error('Upload failed: ', uploadError);
                    return;
                }
                await supabase.from('clips').insert({
                    track_id: currentTrackId,
                    uploaded_by: userId,
                    storage_path: fileName,
                    file_size_bytes: blob.size,
                });
            }
        };
 
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
    };
 
    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setIsRecording(false);
    };
 
    const makeDistortionCurve = (amount: number) => {
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    };
 
    // Core playback function
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
 
    const updateProgress = () => {
        if (!audioContextRef.current) return;
        const elapsed = playbackOffsetRef.current + (audioContextRef.current.currentTime - playbackStartContextTimeRef.current);
        setCurrentTime(Math.min(elapsed, duration));
        animationFrameRef.current = requestAnimationFrame(updateProgress);
    };
 
    const startPlaybackFrom = (offset: number) => {
        if (!audioContextRef.current || !audioBufferRef.current) return;
 
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
 
        const cleanup = connectEffectsChain(
            audioContextRef.current,
            source,
            audioContextRef.current.destination
        );
 
        source.onended = () => {
            cleanup();
            if (isManualStopRef.current) {
                isManualStopRef.current = false;
                return;
            }
            setIsPlaying(false);
            playbackOffsetRef.current = 0;
            setCurrentTime(0);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
        source.start(0, offset);
 
        currentSourceRef.current = source;
        playbackOffsetRef.current = offset;
        playbackStartContextTimeRef.current = audioContextRef.current.currentTime;
        setIsPlaying(true);
 
        animationFrameRef.current = requestAnimationFrame(updateProgress);
    };
 
    const handlePlayPause = () => {
        if (isPlaying) {
            isManualStopRef.current = true;
            const elapsed = playbackOffsetRef.current + (audioContextRef.current!.currentTime - playbackStartContextTimeRef.current);
            playbackOffsetRef.current = elapsed;
            currentSourceRef.current?.stop();
            setIsPlaying(false);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        } else {
            startPlaybackFrom(playbackOffsetRef.current);
        }
    };
 
    const handleRestart = () => {
        if (isPlaying) {
            isManualStopRef.current = true;
            currentSourceRef.current?.stop();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
        startPlaybackFrom(0);
    };
 
    const handleSkipToEnd = () => {
        if (isPlaying) {
            isManualStopRef.current = true;
            currentSourceRef.current?.stop();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        }
        playbackOffsetRef.current = duration;
        setCurrentTime(duration);
        setIsPlaying(false);
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
 
    // 4. Default main dashboard
    return (
        <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
            <button onClick={() => setCurrentProjectId(null)}>← Back to Projects</button>
            <h1>Jam App — Record/Playback Prototype</h1>
 
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
                    Distortion
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
 
            {!isRecording ? (
                <button onClick={startRecording}>Start Recording</button>
            ) : (
                <button onClick={stopRecording}>Stop Recording</button>
            )}
 
            {hasRecording && (
                <div style={{ marginTop: 20, maxWidth: 400 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                        <button onClick={handleRestart} style={iconButtonStyle} aria-label="Restart">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                            </svg>
                        </button>
 
                        <button onClick={handlePlayPause} style={iconButtonStyle} aria-label={isPlaying ? 'Pause' : 'Play'}>
                            {isPlaying ? (
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
 
                        <button onClick={handleSkipToEnd} style={iconButtonStyle} aria-label="Skip to end">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5,4 15,12 5,20" />
                                <rect x="17" y="4" width="3" height="16" />
                            </svg>
                        </button>
                    </div>
 
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, minWidth: 36 }}>{formatTime(currentTime)}</span>
                        <div style={{ flex: 1, height: 6, background: '#ddd', borderRadius: 3, position: 'relative' }}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    height: '100%',
                                    width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                                    background: '#333',
                                    borderRadius: 3,
                                }}
                            />
                        </div>
                        <span style={{ fontSize: 12, minWidth: 36 }}>{formatTime(duration)}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
 
export default App;