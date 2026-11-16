// Build-time offline geospatial harvester for Region v0.1: Fatih (Sultanahmet - Eminönü).
// Fetches real OpenStreetMap Overpass data + merges Copernicus DEM terrain grid into
// compact 300m x 300m offline tiles + single-source road graph + quality report.
// Zero runtime API dependency: output lives under public/regions/fatih-sultanahmet-eminonu/.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REGION_ID = 'fatih-sultanahmet-eminonu';
const OUT_DIR = join(process.cwd(), 'public', 'derived-data', REGION_ID);
const TILES_DIR = join(OUT_DIR, 'tiles');
const CACHE_OSM_PATH = process.env.OSM_CACHE_PATH || '/tmp/fatih-overpass-cache.json';
const TERRAIN_PATH = join(OUT_DIR, 'terrain.json');

const EARTH_RADIUS = 6_378_137;
const DEG_TO_RAD = Math.PI / 180;
const TILE_SIZE = 300;

const BOUNDS = {
  south: 41.002,
  north: 41.0145,
  west: 28.966,
  east: 28.9845,
};

const ORIGIN = {
  lon: (BOUNDS.west + BOUNDS.east) / 2,
  lat: (BOUNDS.south + BOUNDS.north) / 2,
};

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

function lonLatToLocal(lon, lat) {
  const cosLat = Math.cos(ORIGIN.lat * DEG_TO_RAD);
  return {
    x: (lon - ORIGIN.lon) * DEG_TO_RAD * EARTH_RADIUS * cosLat,
    z: -(lat - ORIGIN.lat) * DEG_TO_RAD * EARTH_RADIUS,
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function deterministicUnit(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4_294_967_295;
}

function parseOsmMeters(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(',', '.');
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*(m|meters?|ft|feet)?$/);
  if (!m?.[1]) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  return m[2] === 'ft' || m[2] === 'feet' ? num * 0.3048 : num;
}

const KIND_HEIGHT = {
  mosque: 22,
  cathedral: 24,
  church: 15,
  hotel: 15.5,
  apartments: 13.5,
  commercial: 12.5,
  office: 14,
  retail: 9.5,
  historic: 11.5,
  public: 12,
  civic: 12,
  school: 11,
  university: 13,
  hospital: 15,
  train_station: 11,
  house: 7.5,
  residential: 10.5,
  kiosk: 3.6,
  roof: 4.5,
};

function resolveHeight(id, tags) {
  const h = parseOsmMeters(tags?.height);
  if (h !== null) {
    return { height: Math.max(3, Math.min(95, round1(h))), source: 'height' };
  }
  const lvlRaw = tags?.['building:levels'];
  const lvl = lvlRaw ? Number(String(lvlRaw).trim().replace(',', '.')) : Number.NaN;
  if (Number.isFinite(lvl) && lvl > 0 && lvl <= 40) {
    return { height: Math.max(3.2, Math.min(95, round1(lvl * 3.2))), source: 'levels' };
  }
  const kind = tags?.building || 'yes';
  const base = KIND_HEIGHT[kind] ?? 10.5;
  const jitter = 0.8 + deterministicUnit(id) * 0.42;
  return { height: Math.max(4.2, Math.min(24, round1(base * jitter))), source: 'inferred' };
}

function classifyPalette(id, kind) {
  const k = (kind || '').toLowerCase();
  if (k === 'mosque' || k === 'historic' || k === 'cathedral' || k === 'church') return 'landmark';
  if (k === 'civic' || k === 'public' || k === 'school' || k === 'university' || k === 'train_station') {
    return 'civic';
  }
  if (k === 'commercial' || k === 'retail' || k === 'hotel' || k === 'office') return 'commercial';
  const u = deterministicUnit(`${id}:pal`);
  if (u < 0.42) return 'limestone';
  if (u < 0.72) return 'terracotta';
  if (u < 0.9) return 'ottoman_wood';
  return 'commercial';
}

function simplifyPolyline(pts, tol = 0.75) {
  if (pts.length <= 3) return pts;
  const tolSq = tol * tol;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    if (dx * dx + dz * dz >= tolSq) {
      out.push(cur);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function sampleElevation(terrain, x, z) {
  if (!terrain) return 0;
  const { minX, maxX, minZ, maxZ, cols, rows, elevDecimeters } = terrain;
  const u = Math.max(0, Math.min(1, (x - minX) / Math.max(1e-6, maxX - minX))) * (cols - 1);
  const v = Math.max(0, Math.min(1, (z - minZ) / Math.max(1e-6, maxZ - minZ))) * (rows - 1);
  const c0 = Math.floor(u);
  const r0 = Math.floor(v);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fu = u - c0;
  const fv = v - r0;
  const h00 = elevDecimeters[r0 * cols + c0] * 0.1;
  const h10 = elevDecimeters[r0 * cols + c1] * 0.1;
  const h01 = elevDecimeters[r1 * cols + c0] * 0.1;
  const h11 = elevDecimeters[r1 * cols + c1] * 0.1;
  return h00 + (h10 - h00) * fu + (h01 + (h11 - h01) * fu - (h00 + (h10 - h00) * fu)) * fv;
}

async function fetchOverpassJson() {
  if (existsSync(CACHE_OSM_PATH)) {
    console.log(`Using cached Overpass response: ${CACHE_OSM_PATH}`);
    return JSON.parse(readFileSync(CACHE_OSM_PATH, 'utf8'));
  }

  const bbox = `${BOUNDS.south},${BOUNDS.west},${BOUNDS.north},${BOUNDS.east}`;
  const query = `
[out:json][timeout:90];
(
  way["building"](${bbox});
  way["highway"~"^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian|service)$"](${bbox});
  way["railway"="tram"](${bbox});
  way["leisure"="park"](${bbox});
  way["natural"~"^(water|coastline)$"](${bbox});
  way["place"="square"](${bbox});
);
(._;>;);
out body;
`.trim();

  let lastErr = null;
  for (let attempt = 0; attempt < OVERPASS_MIRRORS.length * 2; attempt += 1) {
    const mirror = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length];
    try {
      console.log(`Querying Overpass (${mirror}) [attempt ${attempt + 1}]...`);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'IstanbulStreets-BuildPipeline/0.1 (https://github.com/eraslan19j/Aslan)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.elements) || data.elements.length < 100) {
        throw new Error(`Unexpected small Overpass payload (${data.elements?.length ?? 0} elements)`);
      }
      writeFileSync(CACHE_OSM_PATH, JSON.stringify(data));
      console.log(`Fetched ${data.elements.length} OSM elements from ${mirror}`);
      return data;
    } catch (err) {
      lastErr = err;
      console.warn(`Overpass attempt failed (${mirror}): ${err.message}`);
      await new Promise((r) => setTimeout(r, 3500 * (attempt + 1)));
    }
  }
  throw new Error(`All Overpass mirrors failed: ${lastErr?.message}`);
}

function classifyRoad(tags) {
  if (tags?.railway === 'tram') {
    return { roadClass: 'tram', width: 3.4, speedLimitKph: 35, drivable: false };
  }
  const hw = tags?.highway || '';
  switch (hw) {
    case 'primary':
      return { roadClass: 'primary', width: 12, speedLimitKph: 50, drivable: true };
    case 'secondary':
      return { roadClass: 'secondary', width: 9.5, speedLimitKph: 50, drivable: true };
    case 'tertiary':
      return { roadClass: 'tertiary', width: 8, speedLimitKph: 40, drivable: true };
    case 'residential':
    case 'living_street':
    case 'unclassified':
      return { roadClass: 'residential', width: 6.4, speedLimitKph: 30, drivable: true };
    case 'service':
      return { roadClass: 'service', width: 4.5, speedLimitKph: 20, drivable: true };
    case 'pedestrian':
      return { roadClass: 'pedestrian', width: 5.5, speedLimitKph: 10, drivable: false };
    default:
      return null;
  }
}

function makeFallbackTerrain() {
  const sw = lonLatToLocal(BOUNDS.west, BOUNDS.south);
  const ne = lonLatToLocal(BOUNDS.east, BOUNDS.north);
  const minX = Math.min(sw.x, ne.x);
  const maxX = Math.max(sw.x, ne.x);
  const minZ = Math.min(sw.z, ne.z);
  const maxZ = Math.max(sw.z, ne.z);
  const cols = 33;
  const rows = 33;
  const elevDecimeters = [];
  // Approximate Sultanahmet ridge (~34m in south-center) sloping to 0m at Eminönü north shore
  for (let r = 0; r < rows; r += 1) {
    const z = minZ + (maxZ - minZ) * (r / (rows - 1));
    for (let c = 0; c < cols; c += 1) {
      const x = minX + (maxX - minX) * (c / (cols - 1));
      const northFactor = Math.max(0, Math.min(1, (z - (minZ + 120)) / (maxZ - minZ)));
      const hill = Math.max(0, 34 * northFactor * Math.exp(-((x - 80) * (x - 80)) / (900 * 900)));
      elevDecimeters.push(Math.round(hill * 10));
    }
  }
  return {
    minX: round1(minX),
    maxX: round1(maxX),
    minZ: round1(minZ),
    maxZ: round1(maxZ),
    cols,
    rows,
    elevDecimeters,
    source: 'Analytical fallback topography (Copernicus DEM unavailable)',
    minMeters: 0,
    maxMeters: Math.max(...elevDecimeters) * 0.1,
  };
}

// Known landmark reference seeds (verified & refined from OSM ways if matched by name)
const LANDMARK_SEEDS = [
  {
    id: 'ayasofya',
    match: /ayasofya|hagia sophia/i,
    nameTr: 'Ayasofya-i Kebir Cami-i Şerifi',
    nameEn: 'Hagia Sophia Grand Mosque',
    kind: 'mosque',
    lon: 28.980175,
    lat: 41.008583,
    sanctuaryRadiusMeters: 68,
  },
  {
    id: 'sultanahmet-camii',
    match: /sultan\s*ahmet\s*camii|blue mosque/i,
    nameTr: 'Sultanahmet Camii',
    nameEn: 'Blue Mosque',
    kind: 'mosque',
    lon: 28.976813,
    lat: 41.00541,
    sanctuaryRadiusMeters: 78,
  },
  {
    id: 'hipodrom',
    match: /hipodrom|sultanahmet meydan|dikilitaş/i,
    nameTr: 'Sultanahmet Meydanı (Hipodrom)',
    nameEn: 'Sultanahmet Square (Hippodrome)',
    kind: 'monument',
    lon: 28.97565,
    lat: 41.00635,
  },
  {
    id: 'kapalicarsi',
    match: /kapalı\s*çarşı|grand bazaar/i,
    nameTr: 'Kapalıçarşı',
    nameEn: 'Grand Bazaar',
    kind: 'bazaar',
    lon: 28.968068,
    lat: 41.010685,
  },
  {
    id: 'yeni-cami',
    match: /yeni cami/i,
    nameTr: 'Yeni Cami',
    nameEn: 'New Mosque (Eminönü)',
    kind: 'mosque',
    lon: 28.97196,
    lat: 41.01655 > BOUNDS.north ? 41.0142 : 41.01655,
  },
  {
    id: 'eminonu-iskele',
    match: /eminönü.*iskele|turyol|şehir hatları/i,
    nameTr: 'Eminönü Meydanı ve İskele',
    nameEn: 'Eminönü Waterfront & Ferry Pier',
    kind: 'pier',
    lon: 28.9719,
    lat: 41.0141,
  },
  {
    id: 'gulhane-parki',
    match: /gülhane/i,
    nameTr: 'Gülhane Parkı',
    nameEn: 'Gülhane Park',
    kind: 'park',
    lon: 28.9814,
    lat: 41.0131,
  },
  {
    id: 'sirkeci-gari',
    match: /sirkeci.*gar|sirkeci station/i,
    nameTr: 'Sirkeci Garı',
    nameEn: 'Sirkeci Station',
    kind: 'station',
    lon: 28.97685,
    lat: 41.0143,
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(TILES_DIR)) rmSync(TILES_DIR, { recursive: true, force: true });
  mkdirSync(TILES_DIR, { recursive: true });

  let terrain;
  if (existsSync(TERRAIN_PATH)) {
    terrain = JSON.parse(readFileSync(TERRAIN_PATH, 'utf8'));
    console.log(`Loaded terrain grid (${terrain.source})`);
  } else {
    terrain = makeFallbackTerrain();
    writeFileSync(TERRAIN_PATH, JSON.stringify(terrain));
    console.log('Generated fallback terrain grid');
  }

  const osm = await fetchOverpassJson();

  const nodeMap = new Map();
  const ways = [];
  for (const el of osm.elements) {
    if (el.type === 'node') {
      nodeMap.set(el.id, { lon: el.lon, lat: el.lat });
    } else if (el.type === 'way' && Array.isArray(el.nodes) && el.nodes.length >= 2) {
      ways.push(el);
    }
  }

  const tileMap = new Map();
  const ensureTile = (tx, tz) => {
    const key = `t_${tx}_${tz}`;
    let tile = tileMap.get(key);
    if (!tile) {
      tile = { key, tx, tz, tileSize: TILE_SIZE, buildings: [], roads: [], areas: [] };
      tileMap.set(key, tile);
    }
    return tile;
  };

  let heightFromTag = 0;
  let heightFromLevels = 0;
  let heightInferred = 0;
  let buildingCount = 0;
  let roadSegmentCount = 0;
  let tramSegmentCount = 0;
  let parkCount = 0;
  let waterCount = 0;

  const graphNodes = new Map();
  const graphEdges = [];
  const osmMatchedLandmarks = new Map();

  for (const way of ways) {
    const tags = way.tags || {};
    const pts = [];
    for (const nid of way.nodes) {
      const n = nodeMap.get(nid);
      if (!n) continue;
      pts.push(lonLatToLocal(n.lon, n.lat));
    }
    if (pts.length < 2) continue;

    // Match iconic landmarks by OSM way name only when within 150m of reference seed
    if (tags.name) {
      for (const seed of LANDMARK_SEEDS) {
        if (!osmMatchedLandmarks.has(seed.id) && seed.match.test(tags.name)) {
          let sx = 0;
          let sz = 0;
          for (const p of pts) {
            sx += p.x;
            sz += p.z;
          }
          const cx = sx / pts.length;
          const cz = sz / pts.length;
          const seedLocal = lonLatToLocal(seed.lon, seed.lat);
          if (Math.hypot(cx - seedLocal.x, cz - seedLocal.z) <= 150) {
            const lon =
              ORIGIN.lon + (cx / (EARTH_RADIUS * Math.cos(ORIGIN.lat * DEG_TO_RAD))) * (180 / Math.PI);
            const lat = ORIGIN.lat - (cz / EARTH_RADIUS) * (180 / Math.PI);
            osmMatchedLandmarks.set(seed.id, { x: round1(cx), z: round1(cz), lon, lat });
          }
        }
      }
    }

    // 1. Buildings
    if (tags.building && pts.length >= 4) {
      // Remove duplicate closing point before simplifying
      const open =
        pts[0].x === pts[pts.length - 1].x && pts[0].z === pts[pts.length - 1].z
          ? pts.slice(0, -1)
          : pts;
      let simp = simplifyPolyline(open, 0.75);
      if (simp.length < 3) continue;
      if (simp.length > 18) {
        simp = simplifyPolyline(simp, 1.8);
      }
      if (simp.length < 3) continue;

      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let sx = 0;
      let sz = 0;
      const ring = [];
      for (const p of simp) {
        const rx = round1(p.x);
        const rz = round1(p.z);
        ring.push(rx, rz);
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (rz < minZ) minZ = rz;
        if (rz > maxZ) maxZ = rz;
        sx += rx;
        sz += rz;
      }

      // Skip tiny noisy sheds (< 2.5m x 2.5m)
      if (maxX - minX < 2.2 || maxZ - minZ < 2.2) continue;

      const cx = sx / simp.length;
      const cz = sz / simp.length;
      const id = `b_${way.id}`;
      const resolved = resolveHeight(id, tags);
      if (resolved.source === 'height') heightFromTag += 1;
      else if (resolved.source === 'levels') heightFromLevels += 1;
      else heightInferred += 1;

      const baseY = round1(sampleElevation(terrain, cx, cz));
      const tx = Math.floor(cx / TILE_SIZE);
      const tz = Math.floor(cz / TILE_SIZE);
      const tile = ensureTile(tx, tz);
      tile.buildings.push({
        id,
        ring,
        minX,
        maxX,
        minZ,
        maxZ,
        height: resolved.height,
        baseY,
        heightSource: resolved.source,
        palette: classifyPalette(id, tags.building),
        kind: tags.building === 'yes' ? undefined : tags.building,
      });
      buildingCount += 1;
      continue;
    }

    // 2. Roads & T1 Tramway
    const roadSpec = classifyRoad(tags);
    if (roadSpec) {
      const simp = simplifyPolyline(pts, 1.0);
      if (simp.length < 2) continue;
      const flat = [];
      for (const p of simp) flat.push(round1(p.x), round1(p.z));

      // Place ribbon in every tile touched by its endpoints/midpoints
      const touched = new Set();
      for (const p of simp) {
        const tx = Math.floor(p.x / TILE_SIZE);
        const tz = Math.floor(p.z / TILE_SIZE);
        touched.add(`${tx},${tz}`);
      }
      for (const tk of touched) {
        const [txStr, tzStr] = tk.split(',');
        const tile = ensureTile(Number(txStr), Number(tzStr));
        tile.roads.push({
          id: `r_${way.id}`,
          roadClass: roadSpec.roadClass,
          width: roadSpec.width,
          name: tags.name || undefined,
          points: flat,
        });
      }
      if (roadSpec.roadClass === 'tram') tramSegmentCount += 1;
      else roadSegmentCount += 1;

      // Build single-source road graph for drivable roads & tram
      if (roadSpec.drivable || roadSpec.roadClass === 'tram') {
        const oneWay = tags.oneway === 'yes' || tags.oneway === '1';
        for (let i = 1; i < way.nodes.length; i += 1) {
          const fromId = `n_${way.nodes[i - 1]}`;
          const toId = `n_${way.nodes[i]}`;
          const fn = nodeMap.get(way.nodes[i - 1]);
          const tn = nodeMap.get(way.nodes[i]);
          if (!fn || !tn || fromId === toId) continue;
          const fl = lonLatToLocal(fn.lon, fn.lat);
          const tl = lonLatToLocal(tn.lon, tn.lat);
          const len = Math.hypot(tl.x - fl.x, tl.z - fl.z);
          if (len < 1.0) continue;
          if (!graphNodes.has(fromId)) {
            graphNodes.set(fromId, {
              id: fromId,
              x: round1(fl.x),
              y: round1(sampleElevation(terrain, fl.x, fl.z)),
              z: round1(fl.z),
            });
          }
          if (!graphNodes.has(toId)) {
            graphNodes.set(toId, {
              id: toId,
              x: round1(tl.x),
              y: round1(sampleElevation(terrain, tl.x, tl.z)),
              z: round1(tl.z),
            });
          }
          graphEdges.push({
            id: `e_${way.id}_${i - 1}`,
            from: fromId,
            to: toId,
            roadClass: roadSpec.roadClass,
            width: roadSpec.width,
            oneWay,
            speedLimitKph: roadSpec.speedLimitKph,
            name: tags.name || undefined,
            lengthMeters: round1(len),
          });
        }
      }
      continue;
    }

    // 3. Parks, squares, water areas
    const areaKind =
      tags.leisure === 'park'
        ? 'park'
        : tags.natural === 'water'
          ? 'water'
          : tags.place === 'square'
            ? 'plaza'
            : null;
    if (areaKind && pts.length >= 4) {
      const simp = simplifyPolyline(pts.slice(0, -1), 1.5);
      if (simp.length < 3) continue;
      let sx = 0;
      let sz = 0;
      const ring = [];
      for (const p of simp) {
        const rx = round1(p.x);
        const rz = round1(p.z);
        ring.push(rx, rz);
        sx += rx;
        sz += rz;
      }
      const cx = sx / simp.length;
      const cz = sz / simp.length;
      const tile = ensureTile(Math.floor(cx / TILE_SIZE), Math.floor(cz / TILE_SIZE));
      tile.areas.push({ id: `a_${way.id}`, kind: areaKind, ring });
      if (areaKind === 'park') parkCount += 1;
      if (areaKind === 'water') waterCount += 1;
    }
  }

  // Build verified landmarks & sanctuary zones
  const landmarks = LANDMARK_SEEDS.map((seed) => {
    const matched = osmMatchedLandmarks.get(seed.id);
    const local = matched ? { x: matched.x, z: matched.z } : lonLatToLocal(seed.lon, seed.lat);
    const y = round1(sampleElevation(terrain, local.x, local.z));
    return {
      id: seed.id,
      nameTr: seed.nameTr,
      nameEn: seed.nameEn,
      kind: seed.kind,
      x: round1(local.x),
      y,
      z: round1(local.z),
      lon: Number((matched?.lon ?? seed.lon).toFixed(6)),
      lat: Number((matched?.lat ?? seed.lat).toFixed(6)),
      sanctuaryRadiusMeters: seed.sanctuaryRadiusMeters,
    };
  });

  const sanctuaryZones = landmarks
    .filter((lm) => typeof lm.sanctuaryRadiusMeters === 'number')
    .map((lm) => ({
      id: lm.id,
      nameTr: `${lm.nameTr} (Güvenli Alan)`,
      nameEn: `${lm.nameEn} (Safe Zone)`,
      x: lm.x,
      z: lm.z,
      radiusMeters: lm.sanctuaryRadiusMeters,
    }));

  // Pick a guaranteed open spawn near Sultanahmet Square / Divanyolu (not inside any building AABB)
  const hipodrom = landmarks.find((l) => l.id === 'hipodrom') || { x: 20, z: 210 };
  let spawnX = round1(hipodrom.x);
  let spawnZ = round1(hipodrom.z);
  const spawnTileKey = `t_${Math.floor(spawnX / TILE_SIZE)}_${Math.floor(spawnZ / TILE_SIZE)}`;
  const spawnTile = tileMap.get(spawnTileKey);
  if (spawnTile) {
    const hitsBuilding = (x, z) =>
      spawnTile.buildings.some(
        (b) => x >= b.minX - 2 && x <= b.maxX + 2 && z >= b.minZ - 2 && z <= b.maxZ + 2,
      );
    if (hitsBuilding(spawnX, spawnZ)) {
      outer: for (let r = 4; r <= 60; r += 4) {
        for (let a = 0; a < 16; a += 1) {
          const ang = (a / 16) * Math.PI * 2;
          const cx = round1(spawnX + Math.cos(ang) * r);
          const cz = round1(spawnZ + Math.sin(ang) * r);
          if (!hitsBuilding(cx, cz)) {
            spawnX = cx;
            spawnZ = cz;
            break outer;
          }
        }
      }
    }
  }

  // Write tile JSONs
  const availableTiles = [...tileMap.keys()].sort();
  for (const key of availableTiles) {
    const tile = tileMap.get(key);
    writeFileSync(join(TILES_DIR, `${key}.json`), JSON.stringify(tile));
  }

  // Write road graph
  const roadGraph = {
    schemaVersion: 1,
    regionId: REGION_ID,
    nodes: [...graphNodes.values()],
    edges: graphEdges,
  };
  writeFileSync(join(OUT_DIR, 'road-graph.json'), JSON.stringify(roadGraph));

  // Write manifest
  const manifest = {
    schemaVersion: 1,
    regionId: REGION_ID,
    nameTr: 'Fatih: Sultanahmet – Eminönü',
    nameEn: 'Fatih: Sultanahmet – Eminönü',
    bounds: BOUNDS,
    origin: ORIGIN,
    tileSize: TILE_SIZE,
    spawn: {
      x: spawnX,
      z: spawnZ,
      heading: Math.PI / 2,
      labelTr: 'Sultanahmet Meydanı',
      labelEn: 'Sultanahmet Square',
    },
    availableTiles,
    landmarks,
    sanctuaryZones,
    attributions: [
      '© OpenStreetMap contributors (ODbL 1.0)',
      'Copernicus DEM GLO-30 — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA)',
      'Kaynak: İBB Açık Veri Portalı (İBB Açık Veri Lisansı)',
    ],
    dataMode: 'real-osm',
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Write quality report
  const qualityReport = {
    generatedAtIso: new Date().toISOString(),
    regionId: REGION_ID,
    dataSource: 'OpenStreetMap Overpass API (ODbL)',
    tileCount: availableTiles.length,
    buildingCount,
    heightFromTag,
    heightFromLevels,
    heightInferred,
    roadSegmentCount,
    tramSegmentCount,
    roadGraphNodes: roadGraph.nodes.length,
    roadGraphEdges: roadGraph.edges.length,
    parkCount,
    waterCount,
    landmarkCount: landmarks.length,
    elevationSource: terrain.source,
    elevationMinMeters: terrain.minMeters,
    elevationMaxMeters: terrain.maxMeters,
  };
  writeFileSync(join(OUT_DIR, 'quality-report.json'), JSON.stringify(qualityReport, null, 2));

  console.log('FATIH_DATA_QUALITY_REPORT', JSON.stringify(qualityReport, null, 2));
}

main().catch((err) => {
  console.error('FATIH DATA PIPELINE FAILED:', err);
  process.exit(1);
});
