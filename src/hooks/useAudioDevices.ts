import { useEffect, useState } from 'react';

export function useAudioDevices() {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

    useEffect(() => {
        const loadDevices = async () => {
            try {
                // Request permission first so device labels are populated
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach((t) => t.stop());

                const all = await navigator.mediaDevices.enumerateDevices();
                const inputs = all.filter((d) => d.kind === 'audioinput');
                setDevices(inputs);
                if (inputs.length > 0) setSelectedDeviceId(inputs[0].deviceId);
            } catch (err) {
                console.error('Error loading media devices:', err);
            }
        };
        loadDevices();
    }, []);

    return { devices, selectedDeviceId, setSelectedDeviceId };
}