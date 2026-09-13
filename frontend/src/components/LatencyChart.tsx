import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export function LatencyChart({ points }: { points: { at: number; latencyMs: number | null }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    el.innerHTML = "";
    if (points.length === 0) {
      el.textContent = "Keine Daten — Gerät wird noch nicht überwacht oder keine History.";
      el.style.color = "var(--muted)";
      el.style.padding = "18px";
      el.style.fontSize = "13px";
      return;
    }
    const xs = points.map((p) => p.at / 1000);
    const ys = points.map((p) => p.latencyMs ?? NaN);

    const valid = ys.filter((v) => !isNaN(v));
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    const pad = (max - min) * 0.12 || 6;

    const isDark = document.documentElement.dataset.theme !== "light";
    const gridColor = isDark ? "rgba(120,130,150,.14)" : "rgba(180,190,200,.28)";
    const textColor = isDark ? "#768092" : "#7b8190";

    const opts: uPlot.Options = {
      width: Math.max(320, wrap.clientWidth || 600),
      height: 200,
      cursor: { drag: { x: true, y: false } },
      legend: { show: false },
      scales: { x: { time: true }, y: { range: [Math.max(0, min - pad), max + pad] } },
      axes: [
        {
          stroke: textColor,
          grid: { show: true, stroke: gridColor, width: 1 },
          ticks: { show: false },
          font: "11px -apple-system, sans-serif",
        },
        {
          stroke: textColor,
          grid: { show: true, stroke: gridColor, width: 1 },
          ticks: { show: false },
          font: "11px -apple-system, sans-serif",
          gap: 6,
          size: 36,
        },
      ],
      series: [
        {},
        {
          label: "Latenz",
          stroke: "#4e8cff",
          width: 1.6,
          fill: isDark ? "rgba(78,140,255,.08)" : "rgba(45,107,255,.06)",
          points: { show: false },
          spanGaps: true,
        },
      ],
    };
    const plot = new uPlot(opts, [xs, ys], el);

    const ro = new ResizeObserver(() => {
      if (!wrap) return;
      plot.setSize({ width: Math.max(320, wrap.clientWidth), height: 200 });
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [points]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      <div ref={ref} className="chart" />
    </div>
  );
}
