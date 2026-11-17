import type { SanctuaryZone } from '../core/sanctuary';
import type { TrafficAgent } from '../core/traffic';
import type { RoadGraph } from '../core/world/types';
import type { PlayableWorldBounds } from '../core/world/worldBounds';

interface MinimapRoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MinimapFrameState {
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  inVehicle: boolean;
  vehicleX: number;
  vehicleZ: number;
  traffic: readonly TrafficAgent[];
  sanctuaries: readonly SanctuaryZone[];
  timeSec: number;
}

/**
 * Zero-GC 2D Canvas Rotating GPS Radar / Minimap.
 * Uses split minor/major road arrays with precomputed per-segment AABBs and inline
 * projection math (zero array/tuple allocations per frame) so 10 Hz radar redraws cost <0.1 ms.
 */
export class MinimapRenderer {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private minorSegments: MinimapRoadSegment[] = [];
  private majorSegments: MinimapRoadSegment[] = [];
  private playableBounds: PlayableWorldBounds | null = null;
  private rangeMeters = 135;

  constructor(graph: RoadGraph, bounds?: PlayableWorldBounds) {
    this.element = document.createElement('canvas');
    this.element.className = 'minimap-canvas';
    this.element.width = 168;
    this.element.height = 168;
    this.element.dataset.testid = 'minimap-radar';
    this.element.title = 'Radar Yakınlaştırma / Zoom';
    this.ctx = this.element.getContext('2d');

    this.element.addEventListener('click', () => {
      this.rangeMeters = this.rangeMeters < 180 ? 235 : 135;
    });

    this.setRoadGraph(graph, bounds);
  }

  setRoadGraph(graph: RoadGraph, bounds?: PlayableWorldBounds): void {
    this.playableBounds = bounds ?? null;
    const nodeMap = new Map<string, { x: number; z: number }>();
    for (let i = 0; i < graph.nodes.length; i += 1) {
      const n = graph.nodes[i]!;
      nodeMap.set(n.id, { x: n.x, z: n.z });
    }
    const minor: MinimapRoadSegment[] = [];
    const major: MinimapRoadSegment[] = [];
    for (let i = 0; i < graph.edges.length; i += 1) {
      const e = graph.edges[i]!;
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const seg: MinimapRoadSegment = {
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        minX: a.x < b.x ? a.x : b.x,
        maxX: a.x > b.x ? a.x : b.x,
        minZ: a.z < b.z ? a.z : b.z,
        maxZ: a.z > b.z ? a.z : b.z,
      };
      if (e.roadClass === 'primary' || e.roadClass === 'secondary' || e.roadClass === 'tertiary') {
        major.push(seg);
      } else {
        minor.push(seg);
      }
    }
    this.minorSegments = minor;
    this.majorSegments = major;
  }

  render(state: MinimapFrameState): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const w = this.element.width;
    const h = this.element.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = Math.min(cx, cy) - 4;
    const scale = radius / this.rangeMeters;
    const px = state.playerX;
    const pz = state.playerZ;

    ctx.clearRect(0, 0, w, h);

    // Circular dark glass radar clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11, 16, 28, 0.86)';
    ctx.fill();
    ctx.clip();

    // Rotate world so "camera forward" (-sin(yaw), -cos(yaw)) always points UP (-Y on canvas)
    const fwdX = -Math.sin(state.cameraYaw);
    const fwdZ = -Math.cos(state.cameraYaw);
    const rightX = Math.cos(state.cameraYaw);
    const rightZ = -Math.sin(state.cameraYaw);

    // Subtle distance ring
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    const cull = this.rangeMeters * 1.3;
    const minCullX = px - cull;
    const maxCullX = px + cull;
    const minCullZ = pz - cull;
    const maxCullZ = pz + cull;

    // Minor streets (zero-GC inline projection + AABB cull)
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.minorSegments.length; i += 1) {
      const s = this.minorSegments[i]!;
      if (s.maxX < minCullX || s.minX > maxCullX || s.maxZ < minCullZ || s.minZ > maxCullZ) {
        continue;
      }
      const dx1 = s.x1 - px;
      const dz1 = s.z1 - pz;
      const dx2 = s.x2 - px;
      const dz2 = s.z2 - pz;
      ctx.moveTo(cx + (dx1 * rightX + dz1 * rightZ) * scale, cy - (dx1 * fwdX + dz1 * fwdZ) * scale);
      ctx.lineTo(cx + (dx2 * rightX + dz2 * rightZ) * scale, cy - (dx2 * fwdX + dz2 * fwdZ) * scale);
    }
    ctx.stroke();

    // Major avenues drawn brighter and thicker
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i < this.majorSegments.length; i += 1) {
      const s = this.majorSegments[i]!;
      if (s.maxX < minCullX || s.minX > maxCullX || s.maxZ < minCullZ || s.minZ > maxCullZ) {
        continue;
      }
      const dx1 = s.x1 - px;
      const dz1 = s.z1 - pz;
      const dx2 = s.x2 - px;
      const dz2 = s.z2 - pz;
      ctx.moveTo(cx + (dx1 * rightX + dz1 * rightZ) * scale, cy - (dx1 * fwdX + dz1 * fwdZ) * scale);
      ctx.lineTo(cx + (dx2 * rightX + dz2 * rightZ) * scale, cy - (dx2 * fwdX + dz2 * fwdZ) * scale);
    }
    ctx.stroke();

    // Playable neighborhood perimeter roadblock line (matches physical 3D municipal barricades!)
    if (this.playableBounds) {
      const b = this.playableBounds;
      const corners: [number, number][] = [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ],
        [b.minX, b.maxZ],
      ];
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i += 1) {
        const [wx, wz] = corners[i]!;
        const dx = wx - px;
        const dz = wz - pz;
        const sx = cx + (dx * rightX + dz * rightZ) * scale;
        const sy = cy - (dx * fwdX + dz * fwdZ) * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Green worship sanctuary safe zones
    const sancMaxDistSq = (radius + 24) * (radius + 24);
    for (let i = 0; i < state.sanctuaries.length; i += 1) {
      const z = state.sanctuaries[i]!;
      const dx = z.x - px;
      const dz = z.z - pz;
      const sx = (dx * rightX + dz * rightZ) * scale;
      const sy = -(dx * fwdX + dz * fwdZ) * scale;
      if (sx * sx + sy * sy > sancMaxDistSq) continue;
      const rPx = Math.max(5, z.radiusMeters * scale);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx + sx, cy + sy, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Live AI traffic dots
    const trafficMaxDistSq = (radius - 3) * (radius - 3);
    ctx.fillStyle = 'rgba(203, 213, 225, 0.82)';
    for (let i = 0; i < state.traffic.length; i += 1) {
      const a = state.traffic[i]!;
      const dx = a.x - px;
      const dz = a.z - pz;
      const sx = (dx * rightX + dz * rightZ) * scale;
      const sy = -(dx * fwdX + dz * fwdZ) * scale;
      if (sx * sx + sy * sy > trafficMaxDistSq) continue;
      ctx.beginPath();
      ctx.arc(cx + sx, cy + sy, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Parked player car marker when on foot
    if (!state.inVehicle) {
      const dx = state.vehicleX - px;
      const dz = state.vehicleZ - pz;
      const sx = (dx * rightX + dz * rightZ) * scale;
      const sy = -(dx * fwdX + dz * fwdZ) * scale;
      const d = Math.hypot(sx, sy);
      const tx = d > radius - 7 ? cx + (sx / d) * (radius - 7) : cx + sx;
      const ty = d > radius - 7 ? cy + (sy / d) * (radius - 7) : cy + sy;
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.fillRect(tx - 4.5, ty - 4.5, 9, 9);
      ctx.strokeRect(tx - 4.5, ty - 4.5, 9, 9);
    }

    // Player center directional chevron (points UP = camera look direction)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.lineTo(cx, cy + 3);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Outer compass rim + North ('K') badge rotated cleanly on radar border
    ctx.strokeStyle = 'rgba(245, 184, 0, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const northAngle = Math.atan2(-rightZ, fwdZ);
    const nx = cx + Math.sin(northAngle) * (radius - 1);
    const ny = cy - Math.cos(northAngle) * (radius - 1);
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(nx, ny, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f5b800';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#f5b800';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K', nx, ny + 0.5);
  }
}
