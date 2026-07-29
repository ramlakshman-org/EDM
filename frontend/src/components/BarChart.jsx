import { useEffect, useRef } from 'react';
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

/**
 * Lightweight chart.js bar chart wrapper.
 * props: labels [], data [], colors [] (optional), height, label
 */
export default function BarChart({ labels = [], data = [], colors, label = '', height = 220 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const bg = colors || labels.map(() => '#0071e3');

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: bg,
          borderRadius: 8,
          maxBarThickness: 46,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: 700, size: 11 } } },
          y: { beginAtZero: true, ticks: { precision: 0, color: '#94a3b8' }, grid: { color: '#f1f5f9' } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); };
  }, [JSON.stringify(labels), JSON.stringify(data), JSON.stringify(colors), label]);

  return (
    <div style={{ height, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
