import type { ActiveTaxiMission } from '../core/missions';
import type { SanctuaryZone } from '../core/sanctuary';
import type { TrafficAgent } from '../core/traffic';
import type { PoliceUnit } from '../core/wanted';
import type { RoadGraph } from '../core/world/types';

interface MinimapRoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  major: boolean;
}

export interface MinimapFrameState {
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  inVehicle: boolean;
  vehicleX: number;
  vehicleZ: number;
  traffic: readonly TrafficAgent[];
  police: readonly PoliceUnit[];
  sanctuaries: readonly SanctuaryZone[];
  mission: ActiveTaxiMission | null;
  timeSec: number;
}

/**
 * Crisp 2D Canvas Rotating GPS Radar / Minimap.
 * Renders real offline OSM streets from road-graph.json, green worship sanctuary safe zones,
 * parked yellow taxi icon, live AI traffic, flashing Şehir Polisi units, and active mission beacon.
 * Tapping toggles zoom between 125 m (city detail) and 235 m (avenue overview).
 */
export class MinimapRenderer {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private segments: MinimapRoadSegment[] = [];
  private rangeMeters = 135;

  constructor(graph: RoadGraph) {
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

    this.setRoadGraph(graph);
  }

  setRoadGraph(graph: RoadGraph): void {
    const nodeMap = new Map<string, { x: number; z: number }>();
    for (const n of graph.nodes) {
      nodeMap.set(n.id, { x: n.x, z: n.z });
    }
    const segs: MinimapRoadSegment[] = [];
    for (const e of graph.edges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      segs.push({
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        major: e.roadClass === 'primary' || e.roadClass === 'secondary' || e.roadClass === 'tertiary',
      });
    }
    this.segments = segs;
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

    const project = (wx: number, wz: number): [number, number] => {
      const dx = wx - state.playerX;
      const dz = wz - state.playerZ;
      const sx = (dx * rightX + dz * rightZ) * scale;
      const sy = -(dx * fwdX + dz * fwdZ) * scale;
      return [cx + sx, cy + sy];
    };

    // Subtle distance rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Draw nearby real OSM road network
    const cull = this.rangeMeters * 1.3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.34)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const s of this.segments) {
      if (s.major) continue;
      if (
        Math.abs(s.x1 - state.playerX) > cull &&
        Math.abs(s.x2 - state.playerX) > cull
      ) {
        continue;
      }
      if (
        Math.abs(s.z1 - state.playerZ) > cull &&
        Math.abs(s.z2 - state.playerZ) > cull
      ) {
        continue;
      }
      const [ax, ay] = project(s.x1, s.z1);
      const [bx, by] = project(s.x2, s.z2);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // Major avenues drawn brighter and thicker
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.62)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (const s of this.segments) {
      if (!s.major) continue;
      if (
        Math.abs(s.x1 - state.playerX) > cull &&
        Math.abs(s.x2 - state.playerX) > cull
      ) {
        continue;
      }
      if (
        Math.abs(s.z1 - state.playerZ) > cull &&
        Math.abs(s.z2 - state.playerZ) > cull
      ) {
        continue;
      }
      const [ax, ay] = project(s.x1, s.z1);
      const [bx, by] = project(s.x2, s.z2);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();

    // Green worship sanctuary safe zones
    for (const z of state.sanctuaries) {
      const [sx, sy] = project(z.x, z.z);
      if (Math.hypot(sx - cx, sy - cy) > radius + 24) continue;
      const rPx = Math.max(5, z.radiusMeters * scale);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sx, sy, rPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Live AI traffic dots
    ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
    for (const a of state.traffic) {
      const [ax, ay] = project(a.x, a.z);
      if (Math.hypot(ax - cx, ay - cy) > radius - 3) continue;
      ctx.beginPath();
      ctx.arc(ax, ay, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active flashing Şehir Polisi units
    const flashBlue = Math.floor(state.timeSec * 6) % 2 === 0;
    for (const u of state.police) {
      if (!u.active) continue;
      const [ux, uy] = project(u.x, u.z);
      const d = Math.hypot(ux - cx, uy - cy);
      const px = d > radius - 6 ? cx + ((ux - cx) / d) * (radius - 6) : ux;
      const py = d > radius - 6 ? cy + ((uy - cy) / d) * (radius - 6) : uy;
      ctx.fillStyle = flashBlue ? '#3b82f6' : '#ef4444';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // Parked yellow taxi marker when player is on foot
    if (!state.inVehicle) {
      const [vx, vy] = project(state.vehicleX, state.vehicleZ);
      const d = Math.hypot(vx - cx, vy - cy);
      const tx = d > radius - 7 ? cx + ((vx - cx) / d) * (radius - 7) : vx;
      const ty = d > radius - 7 ? cy + ((vy - cy) / d) * (radius - 7) : vy;
      ctx.fillStyle = '#f5b800';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.6;
      ctx.fillRect(tx - 4.5, ty - 4.5, 9, 9);
      ctx.strokeRect(tx - 4.5, ty - 4.5, 9, 9);
    }

    // Active Taxi Mission pickup (green) or dropoff (gold) beacon + edge indicator
    if (state.mission) {
      const [mx, my] = project(state.mission.targetX, state.mission.targetZ);
      const d = Math.hypot(mx - cx, my - cy);
      const clampedX = d > radius - 8 ? cx + ((mx - cx) / d) * (radius - 8) : mx;
      const clampedY = d > radius - 8 ? cy + ((my - cy) / d) * (radius - 8) : my;
      const color = state.mission.phase === 'pickup' ? '#22c55e' : '#f5b800';
      const pulse = 5 + Math.sin(state.timeSec * 6) * 2.2;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, pulse + 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 4.5, 0, Math.PI * 2);
      ctx.fill();
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

    // North is world -Z -> project (0, -100) relative to origin
    const northAngle = Math.atan2(rightX * 0 + rightZ * -1, -(fwdX * 0 + fwdZ * -1));
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
