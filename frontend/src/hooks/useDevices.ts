import { useCallback, useEffect, useState } from "react";
import type { Device } from "@lanmap/shared";
import { api } from "../lib/api";

export function useDevices(refreshMs = 10000): {
  devices: Device[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  applyUpdate: (d: Device) => void;
} {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .devices()
      .then((r) => {
        setDevices(r.devices);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  }, [refresh, refreshMs]);

  const applyUpdate = useCallback((d: Device) => {
    setDevices((prev) => {
      const i = prev.findIndex((x) => x.id === d.id);
      if (i === -1) return [d, ...prev];
      const next = [...prev];
      next[i] = d;
      return next;
    });
  }, []);

  return { devices, loading, error, refresh, applyUpdate };
}
