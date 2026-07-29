import { useEffect, useRef } from 'react';
import { Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(PieController, ArcElement, Tooltip, Legend);

/**
 * chart.js pie/doughnut wrapper.
 * props: labels [], data [], colors [], height, doughnut (bool)
 */
export default function PieChart({ labels = [], data = [], colors = [], height = 240, doughnut = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    chartRef.current = new Chart(ctx, {
      type: doughnut ? 'doughnut' : 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.length ? colors : labels.map(() => '#0071e3'),
          borderColor: '#ffffff',
          borderWidth: 2,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: doughnut ? '58%' : 0,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#334155', font: { size: 12, weight: 600 }, boxWidth: 12, boxHeight: 12, padding: 12, usePointStyle: true },
          },
          tooltip: { backgroundColor: '#0f172a', padding: 10, cornerRadius: 8 },
        },
      },
    });
    return () => { chartRef.current?.destroy(); };
  }, [JSON.stringify(labels), JSON.stringify(data), JSON.stringify(colors), doughnut]);

  return (
    <div style={{ height, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
