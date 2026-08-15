import React, { useState, useRef } from 'react';

const App = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

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
            <h1>Jam App - Record/Playback Prototype</h1>

            {!isRecording ? (
                <button onClick={startRecording}>Start Recording</button>
            ) : (
                <button onClick={stopRecording}>Stop Recording</button>
            )}

            {audioURL && (
                <div style ={{ marginTop: 20}}>
                    <p>Your recording:</p>
                    <audio controls src={audioURL}/>
                </div>
            )}
        </div>
    );
};

export default App;