import type { Device } from "@lanmap/shared";
import { DeviceTable } from "../components/bits";

export function Devices({ devices, loading }: { devices: Device[]; loading: boolean }) {
  return (
    <div>
      <h1>Devices <span className="muted">{devices.length} total</span></h1>
      {loading ? <p>Loading…</p> : <DeviceTable devices={devices} />}
    </div>
  );
}
