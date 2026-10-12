type Props = {
    devices: MediaDeviceInfo[];
    value: string;
    onChange: (deviceId: string) => void;
};

const DeviceSelect = ({ devices, value, onChange }: Props) => (
    <div className="device-select-row">
        <label>Input device: </label>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
            {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                </option>
            ))}
        </select>
    </div>
);

export default DeviceSelect;