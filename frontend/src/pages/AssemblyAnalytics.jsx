import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Chart, registerables } from 'chart.js';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';
import PurchaseModal from '../components/PurchaseModal.jsx';

Chart.register(...registerables);

const boothIcon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

// Ray-casting Point-in-Polygon check to verify if Lat/Lng falls INSIDE the official Assembly Boundary
function isPointInPolygon(lat, lng, polygon) {
  if (!polygon || polygon.length < 3) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const dy = yj - yi;
    const intersect = ((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (Math.abs(dy) < 1e-12 ? 1e-12 : dy) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Sutherland-Hodgman Half-Plane Polygon Clipper for Voronoi Cells
function clipPolygon(poly, A, B, C) {
  const isInside = (p) => A * p[0] + B * p[1] + C <= 0;
  const intersect = (p1, p2) => {
    const d1 = A * p1[0] + B * p1[1] + C;
    const d2 = A * p2[0] + B * p2[1] + C;
    const denom = d1 - d2;
    if (Math.abs(denom) < 1e-12) return p1;
    const t = d1 / denom;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = isInside(cur);
    const prevIn = isInside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out.filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
}

// Fallback boundary generator if OpenCity dataset polygon is unavailable
function buildFallbackBoundary(points) {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  const sectors = 24;
  const maxR = new Array(sectors).fill(0);

  points.forEach((p) => {
    const dy = p.lat - cLat;
    const dx = p.lng - cLng;
    const angle = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);
    const sec = Math.floor((angle / (2 * Math.PI)) * sectors) % sectors;
    const r = Math.hypot(dx, dy);
    if (r > maxR[sec]) maxR[sec] = r;
  });

  const pad = 0.0035;
  const boundary = [];
  for (let s = 0; s < sectors; s++) {
    const prevR = maxR[(s - 1 + sectors) % sectors];
    const curR = maxR[s];
    const nextR = maxR[(s + 1) % sectors];
    const smoothR = Math.max(0.012, (prevR + curR * 2 + nextR) / 4 + pad);
    const angle = ((s + 0.5) / sectors) * 2 * Math.PI;
    const lat = cLat + smoothR * Math.sin(angle);
    const lng = cLng + smoothR * Math.cos(angle);
    boundary.push([lng, lat]);
  }
  return boundary;
}

let allAcBoundariesCache = null;

// Fetch OpenCity Tamil Nadu Assembly Boundaries dataset
async function loadOpenCityBoundaries() {
  if (allAcBoundariesCache) return allAcBoundariesCache;
  try {
    const res = await fetch('/tn_assembly_boundaries.json');
    if (res.ok) {
      allAcBoundariesCache = await res.json();
      return allAcBoundariesCache;
    }
  } catch (e) {
    console.warn('Failed to load OpenCity assembly boundaries:', e);
  }
  return {};
}

// Compute bounded Voronoi polygons clipped against Official OpenCity Assembly Boundary
function computeVoronoiPolygons(points, officialBoundary) {
  const boundary = (officialBoundary && officialBoundary.length >= 6)
    ? officialBoundary
    : buildFallbackBoundary(points);

  return points.map((p1, idx1) => {
    let poly = boundary.slice();

    for (let idx2 = 0; idx2 < points.length; idx2++) {
      if (idx1 === idx2) continue;
      const p2 = points[idx2];
      const mx = (p1.lng + p2.lng) / 2;
      const my = (p1.lat + p2.lat) / 2;
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const A = dx;
      const B = dy;
      const C = -(dx * mx + dy * my);
      poly = clipPolygon(poly, A, B, C);
      if (!poly.length) break;
    }

    const leafletLatLngs = poly.map((pt) => [pt[1], pt[0]]);
    return { booth: p1, polygon: leafletLatLngs };
  });
}

// Distribute booths: Valid real Lat/Lng inside boundary placed at exact coords; missing/outside positioned on grid
function generateBoothsInBoundary(rawBooths, boundary) {
  if (!rawBooths || !rawBooths.length) return [];

  // Sort booths strictly in ascending order by Part Number (Part 1, Part 2, ...)
  const sortedBooths = [...rawBooths].sort((a, b) => (Number(a.part_no) || 0) - (Number(b.part_no) || 0));

  // Determine which booths have valid geocoded Lat/Lng INSIDE the official boundary polygon
  const boothsProcessed = sortedBooths.map((b) => {
    const lat = Number(b.lat || 0);
    const lng = Number(b.lng || 0);
    const isValid = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
    const isInside = isValid && (boundary ? isPointInPolygon(lat, lng, boundary) : true);

    const vc = Number(b.voter_count || b.total || 0);
    const mv = Number(b.male_voters || b.male || 0);
    const fv = Number(b.female_voters || b.female || 0);
    const ov = Number(b.other_voters || b.other || 0);

    return {
      ...b,
      lat,
      lng,
      has_coords: isInside,
      voter_count: vc,
      male_voters: mv,
      female_voters: fv,
      other_voters: ov,
    };
  });

  if (!boundary || !boundary.length) return boothsProcessed;

  const lngs = boundary.map((p) => p[0]);
  const lats = boundary.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  let topNorthPt = boundary[0];
  boundary.forEach((p) => {
    if (p[1] > topNorthPt[1]) topNorthPt = p;
  });

  const total = boothsProcessed.length;
  const cols = Math.ceil(Math.sqrt(total * 1.3));
  const rows = Math.ceil(total / cols);

  const stepLng = ((maxLng - minLng) * 0.82) / (cols || 1);
  const stepLat = ((maxLat - minLat) * 0.82) / (rows || 1);
  
  const startLng = minLng + (maxLng - minLng) * 0.09;
  const startLat = maxLat - (maxLat - minLat) * 0.09;

  const gridPositions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gridPositions.length >= total) break;
      const idx = r * cols + c;
      const jitterX = (((idx * 17) % 11) - 5) * (stepLng * 0.08);
      const jitterY = (((idx * 23) % 11) - 5) * (stepLat * 0.08);
      const lng = startLng + c * stepLng + jitterX;
      const lat = startLat - r * stepLat + jitterY;
      
      const distToTop = Math.hypot(lng - topNorthPt[0], lat - topNorthPt[1]) + r * (stepLat * 0.2);
      gridPositions.push({ lng, lat, dist: distToTop });
    }
  }

  gridPositions.sort((a, b) => a.dist - b.dist);

  return boothsProcessed.map((b, idx) => {
    if (b.has_coords) {
      return b;
    }
    const pos = gridPositions[idx] || gridPositions[0];
    return {
      ...b,
      lng: pos.lng,
      lat: pos.lat,
    };
  });
}

// User Heatmap Palette: More Voters = Red, Orange, Yellow, Light Green, Green = Less Voters
function getHeatmapStrengthColor(val, sortedVals) {
  if (!sortedVals || !sortedVals.length) return '#ef4444';
  const rank = sortedVals.indexOf(val);
  const pct = rank / Math.max(1, sortedVals.length - 1);
  if (pct >= 0.8) return '#ef4444'; // Red (More Voters / High Density)
  if (pct >= 0.6) return '#f97316'; // Orange
  if (pct >= 0.4) return '#eab308'; // Yellow
  if (pct >= 0.2) return '#84cc16'; // Light Green
  return '#22c55e'; // Dark Green (Less Voters / Low Density)
}

function getHeatmapStrengthLabel(val, sortedVals) {
  if (!sortedVals || !sortedVals.length) return 'Moderate';
  const rank = sortedVals.indexOf(val);
  const pct = rank / Math.max(1, sortedVals.length - 1);
  if (pct >= 0.8) return 'Very High';
  if (pct >= 0.6) return 'High';
  if (pct >= 0.4) return 'Moderate';
  if (pct >= 0.2) return 'Low';
  return 'Very Low';
}

export default function AssemblyAnalytics() {
  const { user } = useAuth();
  const isAdmin = Number(user?.group_id || 1) === 1;

  const [assemblies, setAssemblies] = useState([]);
  const [assemblyId, setAssemblyId] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [officialBoundary, setOfficialBoundary] = useState(null);
  const [buyModalOpen, setBuyModalOpen] = useState(false);

  // Selected strength metric for Booth Strength map
  const [metric, setMetric] = useState('total');

  // Main Location Map refs
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);

  // Separate Booth Strength Map refs
  const strengthMapEl = useRef(null);
  const strengthMapRef = useRef(null);
  const strengthLayerRef = useRef(null);

  // Charts refs
  const pieChartEl = useRef(null);
  const pieChartRef = useRef(null);
  const chartEl = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/assemblies').then(({ data }) => {
        const list = data.assemblies || [];
        setAssemblies(list);
        if (list.length) { setAssemblyId(String(list[0].assembly_no)); load(String(list[0].assembly_no)); }
      }).catch(() => {});
    } else {
      load();
    }
    // eslint-disable-next-line
  }, []);

  const load = async (id) => {
    setErr(''); setLoading(true); setOfficialBoundary(null);
    try {
      const params = isAdmin && id ? { assemblyId: id } : {};
      
      const [resData, boundaries] = await Promise.all([
        api.get('/reports/assembly-analytics', { params }).then((r) => r.data),
        loadOpenCityBoundaries(),
      ]);

      const acNo = String(Number(resData.assembly_no || id || 1));
      let boundaryPoly = null;
      if (boundaries && boundaries[acNo] && boundaries[acNo].polygon) {
        boundaryPoly = boundaries[acNo].polygon;
      }
      
      setOfficialBoundary(boundaryPoly);
      setData(resData);
    } catch (e) {
      setErr(e.response?.data?.message || 'Unable to load analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // 1. MAIN LOCATION MAP (Pin Markers Map)
  useEffect(() => {
    if (!data || !mapEl.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapEl.current, { scrollWheelZoom: false }).setView([11.1271, 78.6569], 8);

      const googleStreets = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps',
      });
      const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google Maps',
      });
      const osmColor = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap',
      });

      googleStreets.addTo(mapRef.current);
      let currentBaseLayer = googleStreets;

      const VisualLayerControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd: function () {
          const container = L.DomUtil.create('div', 'leaflet-custom-layer-control');
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);

          container.innerHTML = `
            <div class="layer-btn-trigger" title="Map Layers">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
            <div class="layer-cards-panel">
              <div class="layer-card-item active" data-layer="streets">Default</div>
              <div class="layer-card-item" data-layer="satellite">Satellite</div>
              <div class="layer-card-item" data-layer="osm">OSM</div>
            </div>
          `;

          const trigger = container.querySelector('.layer-btn-trigger');
          if (trigger) {
            trigger.addEventListener('click', (e) => {
              e.stopPropagation();
              container.classList.toggle('open');
            });
          }
          container.addEventListener('mouseenter', () => container.classList.add('open'));
          container.addEventListener('mouseleave', () => container.classList.remove('open'));
          const items = container.querySelectorAll('.layer-card-item');
          items.forEach((item) => {
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              const layerType = item.getAttribute('data-layer');
              items.forEach((it) => it.classList.remove('active'));
              item.classList.add('active');
              mapRef.current.removeLayer(currentBaseLayer);
              if (layerType === 'satellite') currentBaseLayer = googleSatellite;
              else if (layerType === 'osm') currentBaseLayer = osmColor;
              else currentBaseLayer = googleStreets;
              currentBaseLayer.addTo(mapRef.current);
              container.classList.remove('open');
            });
          });
          return container;

        }
      });

      new VisualLayerControl().addTo(mapRef.current);
      markersRef.current = L.layerGroup().addTo(mapRef.current);
    }

    markersRef.current.clearLayers();

    // Filter pin markers: ONLY include booth lat/lng coordinates that fall INSIDE official Assembly Boundary
    const pts = (data.booths || []).filter((b) => {
      const lat = Number(b.lat || 0);
      const lng = Number(b.lng || 0);
      const isValid = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      if (!isValid) return false;
      if (officialBoundary && officialBoundary.length >= 3) {
        return isPointInPolygon(lat, lng, officialBoundary);
      }
      return true;
    });

    pts.forEach((b) => {
      L.marker([b.lat, b.lng], { icon: boothIcon })
        .bindPopup(`<b>Booth ${b.part_no}</b><br/>${b.booth_name || ''}`)
        .addTo(markersRef.current);
    });

    // Draw Assembly Boundary polygon on main location map
    if (officialBoundary && officialBoundary.length >= 3) {
      const bLatLngs = officialBoundary.map((pt) => [pt[1], pt[0]]);
      L.polygon(bLatLngs, {
        color: '#0071e3',
        weight: 2.5,
        fillColor: '#0071e3',
        fillOpacity: 0.08,
      }).addTo(markersRef.current);
    }

    // Fit map bounds cleanly focused on candidate's selected booth pins
    if (pts.length === 1) {
      mapRef.current.setView([pts[0].lat, pts[0].lng], 15);
    } else if (pts.length > 1) {
      mapRef.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15));
    } else if (officialBoundary && officialBoundary.length >= 3) {
      const bLatLngs = officialBoundary.map((pt) => [pt[1], pt[0]]);
      mapRef.current.fitBounds(L.latLngBounds(bLatLngs).pad(0.08));
    }
    setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 100);
  }, [data, officialBoundary]);

  // 2. OFFICIAL OPENCITY ASSEMBLY BOUNDARY HEATMAP STRENGTH MAP
  useEffect(() => {
    if (!data || !strengthMapEl.current) return;

    const rawBooths = data.booths || [];
    if (!rawBooths.length) return;

    // Cleanly re-create map instance
    if (strengthMapRef.current) {
      strengthMapRef.current.remove();
      strengthMapRef.current = null;
    }

    // Determine initial center
    let centerLat = 13.54;
    let centerLng = 80.08;
    let bLatLngs = [];

    if (officialBoundary && officialBoundary.length >= 3) {
      bLatLngs = officialBoundary.map((pt) => [pt[1], pt[0]]);
      const lats = bLatLngs.map((p) => p[0]);
      const lngs = bLatLngs.map((p) => p[1]);
      centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    }

    strengthMapRef.current = L.map(strengthMapEl.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: false,
      zoomSnap: 0.1,
      zoomDelta: 0.5,
    }).setView([centerLat, centerLng], 11);

    strengthLayerRef.current = L.layerGroup().addTo(strengthMapRef.current);

    // Draw Official Assembly Boundary Outline Polygon if available
    if (bLatLngs.length >= 3) {
      L.polygon(bLatLngs, {
        color: '#0284c7',
        weight: 2.5,
        fillColor: '#f1f5f9',
        fillOpacity: 0.15,
      }).addTo(strengthLayerRef.current);
    }

    // Generate booth points
    const booths = generateBoothsInBoundary(rawBooths, officialBoundary);

    const getValue = (b) => {
      if (metric === 'male') return b.male_voters;
      if (metric === 'female') return b.female_voters;
      if (metric === 'other') return b.other_voters;
      return b.voter_count;
    };

    const values = booths.map(getValue);
    const sortedValues = [...values].sort((a, b) => a - b);

    // Compute Voronoi cells clipped against Official OpenCity Boundary Polygon
    const voronoiCells = computeVoronoiPolygons(booths, officialBoundary);

    voronoiCells.forEach(({ booth, polygon }) => {
      if (!polygon || !Array.isArray(polygon)) return;
      const validPoly = polygon.filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      if (validPoly.length < 3) return;

      const val = getValue(booth);

      // Color ALL booth cells with voter strength density colors (Red -> Green)
      const color = getHeatmapStrengthColor(val, sortedValues);
      const label = getHeatmapStrengthLabel(val, sortedValues);

      const polyLayer = L.polygon(validPoly, {
        color: '#ffffff',
        weight: 1.2,
        fillColor: color,
        fillOpacity: 0.88,
      });

      const popupContent = `
        <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 190px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 14px; color: #0f172a;">Part ${booth.part_no}</span>
            <span style="background: ${color}; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">${label}</span>
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-bottom: 6px;">${booth.booth_name || 'Polling Booth'}</div>
          <div style="font-size: 11px; color: ${booth.has_coords ? '#16a34a' : '#64748b'}; font-weight: 700; margin-bottom: 6px;">
            ${booth.has_coords ? '📍 Real Lat/Long Coords' : '⚠️ No Lat/Long'}
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; font-size: 11.5px;">
            <div><span style="color: #64748b;">Total:</span> <strong>${fmt(booth.voter_count)}</strong></div>
            <div><span style="color: #64748b;">Male:</span> <strong style="color: #0071e3;">${fmt(booth.male_voters)}</strong></div>
            <div><span style="color: #64748b;">Female:</span> <strong style="color: #e11d48;">${fmt(booth.female_voters)}</strong></div>
            <div><span style="color: #64748b;">Other:</span> <strong style="color: #d97706;">${fmt(booth.other_voters)}</strong></div>
          </div>
        </div>
      `;

      polyLayer.bindPopup(popupContent);

      polyLayer.on('mouseover', function () {
        this.setStyle({ weight: 3, color: '#0071e3', fillOpacity: 0.98 });
        this.bringToFront();
      });

      polyLayer.on('mouseout', function () {
        this.setStyle({ weight: 1.2, color: '#ffffff', fillOpacity: 0.88 });
      });

      polyLayer.addTo(strengthLayerRef.current);
    });

    // Fit bounds tightly using fractional zoom (zoomSnap 0.1) for 90-95% box coverage
    const targetLatLngs = (bLatLngs.length >= 3) ? bLatLngs : booths.map((b) => [b.lat, b.lng]);
    const bounds = L.latLngBounds(targetLatLngs);
    strengthMapRef.current.fitBounds(bounds, { padding: [10, 10] });

    const sm = strengthMapRef.current;
    setTimeout(() => {
      if (sm) {
        sm.invalidateSize();
        sm.fitBounds(bounds, { padding: [10, 10] });
      }
    }, 150);
  }, [data, metric, officialBoundary]);

  // 3. GENDER DEMOGRAPHICS PIE CHART
  useEffect(() => {
    if (!data || !pieChartEl.current) return;
    if (pieChartRef.current) pieChartRef.current.destroy();

    const ctx = pieChartEl.current.getContext('2d');
    pieChartRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Male Voters', 'Female Voters', 'Others'],
        datasets: [{
          data: [data.male || 0, data.female || 0, data.other || 0],
          backgroundColor: ['#0071e3', '#e11d48', '#f59e0b'],
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const val = item.raw || 0;
                const pct = ((val / (data.total || 1)) * 100).toFixed(1);
                return ` ${item.label}: ${fmt(val)} (${pct}%)`;
              },
            },
          },
        },
        cutout: '65%',
      },
    });
  }, [data]);

  // 4. AGE GROUP BAR CHART
  useEffect(() => {
    if (!data || !chartEl.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(chartEl.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Youth (18-35)', 'Middle-aged (36-59)', 'Senior (60+)'],
        datasets: [{
          label: 'Voters',
          data: [data.youth, data.middle, data.senior],
          backgroundColor: ['#2e9e5b', '#e8871e', '#d9534f'],
          borderRadius: 6,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('en-IN') } } },
      },
    });
  }, [data]);

  useEffect(() => () => {
    if (chartRef.current) chartRef.current.destroy();
    if (pieChartRef.current) pieChartRef.current.destroy();
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    if (strengthMapRef.current) { strengthMapRef.current.remove(); strengthMapRef.current = null; }
  }, []);

  const isBooth = !!(data && (data.booth || (data.user_booths && data.user_booths.length > 0)));

  return (
    <div>
      {/* Top Header & Assembly Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
            {data?.user_booths && data.user_booths.length > 0
              ? `Candidate Multi-Booth Dashboard (${data.assembly_name || ''})`
              : isBooth
              ? `Welcome to ${data?.assembly_name || ''} (Booth ${data?.booth || ''}) Dashboard`
              : 'Assembly Details'}
          </h1>
          {data && (
            <div style={{ fontSize: 14, color: '#666', marginTop: 4, fontWeight: 600 }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isBooth ? 'BOOTH LOCATION MAP' : 'TN DISTRICT MAP'}: </span>
              <span style={{ color: '#d9534f', fontWeight: 700 }}>{(data.district || '').toUpperCase()}</span>
              {data.assembly_name && <span> · {data.assembly_no} - {data.assembly_name}</span>}
            </div>
          )}

          {data?.user_booths && data.user_booths.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Selected Booths ({data.user_booths.length}):</span>
              {data.user_booths.map((b, idx) => (
                <span key={idx} style={{ background: '#e0f2fe', color: '#0369a1', padding: '3px 10px', borderRadius: 980, fontSize: 12, fontWeight: 800, border: '1px solid #bae6fd' }}>
                  Booth {typeof b === 'object' ? b.part_no : b}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user?.group_id !== 1 && (
            user?.paid_status === 'Yes' ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)', color: '#92400e', fontWeight: 700, fontSize: 12.5, padding: '5px 14px', borderRadius: 980, border: '1px solid #fde68a', boxShadow: '0 2px 8px rgba(245,158,11,0.2)' }}>
                <span style={{ fontSize: 14 }}>👑</span><span>PRO</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBuyModalOpen(true)}
                style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 3px 10px rgba(22, 163, 74, 0.25)' }}
              >
                ⭐ Upgrade PRO Plan
              </button>
            )
          )}

          {isAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 600, fontSize: 14 }}>Assembly:</label>
              <select value={assemblyId} onChange={(e) => { setAssemblyId(e.target.value); load(e.target.value); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc', fontWeight: 600, background: '#fff' }}>
                <option value="">Select Assembly</option>
                {assemblies.map((a) => <option key={a.assembly_no} value={a.assembly_no}>{a.assembly_no} - {a.assembly_name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {err && <div className="alert err">{err}</div>}
      {loading && <Spinner label="Loading analytics…" />}

      {data && (
        <>
          {/* Top 2-Column Grid: Full View Map on Left, 2x2 Stat Cards on Right */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20, alignItems: 'stretch' }}>
            
            {/* 1. Main Reverted Location Map Card */}
            <div className="card" style={{ margin: 0, padding: 0, overflow: 'hidden', height: '100%', minHeight: 330, borderRadius: 16 }}>
              <div ref={mapEl} style={{ width: '100%', height: '100%', minHeight: 330 }} />
            </div>

            {/* 4 Stat Tiles in 2x2 Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <div className="tile green" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px', minHeight: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85, marginBottom: 8 }}>Total Voters</div>
                <h3 style={{ margin: 0, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{fmt(data.total)}</h3>
              </div>
              <div className="tile blue" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px', minHeight: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85, marginBottom: 8 }}>Male</div>
                <h3 style={{ margin: 0, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{fmt(data.male)}</h3>
              </div>
              <div className="tile red" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px', minHeight: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85, marginBottom: 8 }}>Female</div>
                <h3 style={{ margin: 0, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{fmt(data.female)}</h3>
              </div>
              <div className="tile orange" style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 24px', minHeight: 140 }}>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', opacity: 0.85, marginBottom: 8 }}>Others</div>
                <h3 style={{ margin: 0, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{fmt(data.other)}</h3>
              </div>
            </div>

          </div>

          {/* 2. SEPARATE CARD: Enlarged Heatmap Booth Strength Map + Gender Demographics Pie Chart */}
          <div className="card" style={{ marginBottom: 20, padding: 20, borderRadius: 16 }}>
            {/* Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Booth Strength &amp; Gender Demographics</h3>
                <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Assembly booth voter strength heatmap vs gender breakdown</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Metric:</label>
                <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 600, background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}>
                  <option value="total">Voter Strength</option>
                  <option value="male">Male Voters</option>
                  <option value="female">Female Voters</option>
                  <option value="other">Others Strength</option>
                </select>
              </div>
            </div>

            {/* 2-Column Split: 1.3fr for Map, 1fr for Chart */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'center' }}>
              
              {/* Left Column: Enlarged Heatmap Assembly Boundary Map (530px height) */}
              <div style={{ position: 'relative', height: 530, borderRadius: 14, overflow: 'hidden', border: '1px solid #cbd5e1', background: '#ffffff' }}>
                <div ref={strengthMapEl} style={{ width: '100%', height: '100%' }} />

                {/* Heatmap Red-Orange-Yellow-Green Strength Legend */}
                <div style={{ position: 'absolute', bottom: 14, left: 14, background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(8px)', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: '#ef4444' }}>More Voters</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} title="Very High Density / More Voters" />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f97316' }} title="High Density" />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308' }} title="Moderate Density" />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#84cc16' }} title="Low Density" />
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} title="Very Low Density / Less Voters" />
                  </div>
                  <span style={{ color: '#22c55e' }}>Less Voters</span>
                </div>
              </div>

              {/* Right Column: Gender Demographics Doughnut Chart (530px height) */}
              <div style={{ padding: '24px 20px', background: '#ffffff', borderRadius: 14, border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 530 }}>
                <h4 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: '#0f172a', textAlign: 'center' }}>Gender Distribution Breakdown</h4>
                <div style={{ width: '100%', height: 350, position: 'relative' }}>
                  <canvas ref={pieChartEl} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0071e3' }} />
                    Male: <strong>{fmt(data.male)}</strong> ({((data.male / (data.total || 1)) * 100).toFixed(1)}%)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e11d48' }} />
                    Female: <strong>{fmt(data.female)}</strong> ({((data.female / (data.total || 1)) * 100).toFixed(1)}%)
                  </div>
                  {data.other > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                      Others: <strong>{fmt(data.other)}</strong>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* 3. Bottom Card: Age Group Distribution */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>{isBooth ? 'Booth Stats & Distribution' : 'Age Group Distribution'}</h2>
            <div className="row" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <span className="badge-success">Youth (18-35): {fmt(data.youth)}</span>{' '}
              <span className="badge-info" style={{ background: '#e8871e' }}>Middle-aged (36-59): {fmt(data.middle)}</span>{' '}
              <span className="badge-info" style={{ background: '#d9534f' }}>Senior (60+): {fmt(data.senior)}</span>
            </div>
            <div style={{ height: 280 }}><canvas ref={chartEl} /></div>
          </div>

          <p className="muted">{data.assembly_no} — {data.assembly_name} · {(data.booths || []).length} booths mapped</p>
        </>
      )}

      <PurchaseModal
        open={buyModalOpen}
        onClose={() => setBuyModalOpen(false)}
        onSuccess={() => window.location.reload()}
        user={user}
        accountInfo={{
          district: data?.district || user?.district_id,
          assembly_name: data?.assembly_name || user?.assembly_name,
          assembly_id: data?.assembly_no || user?.assembly_id,
          local_body: user?.category_name || data?.assembly_name,
          body_type: user?.candidate_type || 'Local Body Candidate',
          mobile: user?.mobile_no || user?.mobile,
        }}
        boothCount={data?.user_booths?.length || (Array.isArray(user?.booths) ? user.booths.length : 1)}
      />
    </div>
  );
}
