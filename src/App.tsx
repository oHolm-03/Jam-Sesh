import React, { useState, useRef, useEffect } from 'react';

const App = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

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

    const startRecording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = (event) => {
            if(event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        recorder.onstop = () => {
            const blob  = new Blob(chunksRef.current, {type: 'audio/webm'});
            console.log('Blob size (bytes):', blob.size, '| Chunks collected:', chunksRef.current.length);
            const url = URL.createObjectURL(blob);
            setAudioURL(url);
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

      return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Jam App — Record/Playback Prototype</h1>

      <div style={{ marginBottom: 20 }}>
        <label>Input device: </label>
        <select
          value={selectedDeviceId}
          onChange={(e) => setSelectedDeviceId(e.target.value)}
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
            </option>
          ))}
        </select>
      </div>

      {!isRecording ? (
        <button onClick={startRecording}>Start Recording</button>
      ) : (
        <button onClick={stopRecording}>Stop Recording</button>
      )}

      {audioURL && (
        <div style={{ marginTop: 20 }}>
          <p>Your recording:</p>
          <audio controls src={audioURL} />
        </div>
      )}
    </div>
  );
};

export default App;