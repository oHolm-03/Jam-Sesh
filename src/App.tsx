import React, { useState, useRef, useEffect } from 'react';
import Auth from './Auth';
import { supabase } from './supabaseClient';
import Projects from './Projects';
import ResetPassword from './ResetPassword';

const App = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [hasRecording, setHasRecording] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const [distortionOn, setDistortionOn] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const [isMonitoring, setIsMonitoring] = useState(false);
    const monitorStreamRef = useRef<MediaStream | null>(null);
    const monitorSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const [session, setSession] = useState<any>(null);
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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

    const startMonitoring = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,  
      },
      });
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });
        }
          const source = audioContextRef.current.createMediaStreamSource(stream);

          if (distortionOn) {
            const distortion = audioContextRef.current.createWaveShaper();
            distortion.curve = makeDistortionCurve(400);
            distortion.oversample = '4x';

            source.connect(distortion);
            distortion.connect(audioContextRef.current.destination);
          } else {
            source.connect(audioContextRef.current.destination);
          }

          monitorStreamRef.current = stream;
          monitorSourceRef.current = source;
          setIsMonitoring(true);
        };

    const stopMonitoring = () => {
      monitorSourceRef.current?.disconnect();
      monitorStreamRef.current?.getTracks().forEach((track) => track.stop());
      monitorSourceRef.current = null;
      monitorStreamRef.current = null;
      setIsMonitoring(false);
    }

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
            setHasRecording(true);

            stream.getTracks().forEach((track) => track.stop());
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

    const playRecording = () => {
      if (!audioContextRef.current || !audioBufferRef.current) return;
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      if (distortionOn) {
        const distortion = audioContextRef.current.createWaveShaper();
        distortion.curve = makeDistortionCurve(400);
        distortion.oversample = '4x';

        source.connect(distortion);
        distortion.connect(audioContextRef.current.destination);
      } else {
        source.connect(audioContextRef.current.destination);
      }
      source.start();
    };

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
      </div>

      {!isRecording ? (
        <button onClick={startRecording}>Start Recording</button>
      ) : (
        <button onClick={stopRecording}>Stop Recording</button>
      )}

      {hasRecording && (
        <div style={{ marginTop: 20 }}>
          <button onClick={playRecording}>Play Recording</button>
        </div>
      )}
    </div>
  );
};

export default App;