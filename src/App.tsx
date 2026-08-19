import React, { useState, useRef, useEffect } from 'react';
import Auth from './Auth';
import {supabase} from './supabaseClient';

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

    useEffect(() => {
        const loadDevices = async () => {
            await navigator.mediaDevices.getUserMedia({audio: true});
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
            setDevices(audioInputs);
            if (audioInputs.length > 0){
                setSelectedDeviceId(audioInputs[0].deviceId);
            }
        };
        loadDevices();     
    }, []);

    useEffect(() => {
      supabase.auth.getSession().then(({data}) => setSession(data.session));

      const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      return () => listener.subscription.unsubscribe();
    }, []);

    const startMonitoring = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {deviceId: selectedDeviceId ?  {exact: selectedDeviceId} : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,  
      },
      });
        if(!audioContextRef.current){
          audioContextRef.current = new AudioContext({latencyHint: 'interactive'});
        }
          // wrap live audio stream so it can plug into the web audio graph
          const source = audioContextRef.current.createMediaStreamSource(stream);

          if(distortionOn) {
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
    //   })
    // }
    const stopMonitoring = () => {
      monitorSourceRef.current?.disconnect();

      monitorStreamRef.current?.getTracks().forEach((track) => track.stop());
      monitorSourceRef.current = null;
      monitorStreamRef.current = null;
      setIsMonitoring(false);
    }

    const startRecording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {deviceId: selectedDeviceId ? {exact: selectedDeviceId} : undefined},
        });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if(event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        recorder.onstop = async () => {
            const blob  = new Blob(chunksRef.current, {type: 'audio/webm'});
            console.log('Blob size (bytes):', blob.size, '| Chunks collected:', chunksRef.current.length);
            const arrayBuffer = await blob.arrayBuffer();
            // const url = URL.createObjectURL(blob);
            // setAudioURL(url);
            // stream.getTracks().forEach((track) => track.stop());
            if(!audioContextRef.current) {
              audioContextRef.current = new AudioContext({latencyHint: 'interactive'});
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
      for (let i=0; i<samples; i++){
        const x = (i*2) / samples-1; //maps i to a range from -1 to 1
        // bends the signal instead of just chopping it off (i.e. distortion)
        curve[i] = ((3+amount) * x * 20 * (Math.PI/180)) / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    };

    const playRecording = () => {
      if(!audioContextRef.current || !audioBufferRef.current) return;
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      if(distortionOn) {
        // build a WaveShaperNode and connect: source -> distortion -> speakers
        const distortion = audioContextRef.current.createWaveShaper();
        distortion.curve = makeDistortionCurve(400);
        distortion.oversample = '4x';

        source.connect(distortion);
        distortion.connect(audioContextRef.current.destination);
      } else {
        // bypass: source -> speakers directly
        source.connect(audioContextRef.current.destination);
      }
      source.start();
    };

    if(!session){
      return <Auth onLogin={() => {/* session state updates via onAuthStateChange listener */}} />;
    }

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