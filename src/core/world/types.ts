import type { GeoBounds, LonLat } from './geo';
import type { SanctuaryZone } from '../sanctuary';

export type BuildingHeightSource = 'height' | 'levels' | 'inferred';

export type BuildingPalette =
  | 'limestone'
  | 'terracotta'
  | 'ottoman_wood'
  | 'commercial'
  | 'civic'
  | 'landmark';

export interface TileBuilding {
  id: string;
  /** Simplified 2D footprint ring in local meters: [x0, z0, x1, z1, ...]. */
  ring: number[];
  /** Axis-aligned bounding box for fast spatial collision & culling. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  baseY: number;
  heightSource: BuildingHeightSource;
  palette: BuildingPalette;
  kind?: string;
}

export type RoadClass =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'pedestrian'
  | 'service'
  | 'tram';

export interface TileRoadRibbon {
  id: string;
  roadClass: RoadClass;
  width: number;
  name?: string;
  /** Flat array of local meter points: [x0, z0, x1, z1, ...]. */
  points: number[];
}

export interface TileAreaPolygon {
  id: string;
  kind: 'park' | 'water' | 'plaza';
  /** Flat array of local meter points: [x0, z0, ...]. */
  ring: number[];
}

export interface RegionTileData {
  key: string;
  tx: number;
  tz: number;
  tileSize: number;
  buildings: TileBuilding[];
  roads: TileRoadRibbon[];
  areas: TileAreaPolygon[];
}

export interface TerrainGrid {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cols: number;
  rows: number;
  /** Elevation in decimeters (int = round(meters * 10)) in row-major order (row 0 = minZ). */
  elevDecimeters: number[];
  source: string;
  minMeters: number;
  maxMeters: number;
}

export interface RoadGraphNode {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface RoadGraphEdge {
  id: string;
  from: string;
  to: string;
  roadClass: RoadClass;
  width: number;
  oneWay: boolean;
  speedLimitKph: number;
  name?: string;
  lengthMeters: number;
}

export interface RoadGraph {
  schemaVersion: 1;
  regionId: string;
  nodes: RoadGraphNode[];
  edges: RoadGraphEdge[];
}

export interface LandmarkPin {
  id: string;
  nameTr: string;
  nameEn: string;
  kind: 'mosque' | 'monument' | 'bazaar' | 'pier' | 'station' | 'park';
  x: number;
  y: number;
  z: number;
  lon: number;
  lat: number;
  sanctuaryRadiusMeters?: number;
}

export interface DataQualityReport {
  generatedAtIso: string;
  regionId: string;
  dataSource: string;
  tileCount: number;
  buildingCount: number;
  heightFromTag: number;
  heightFromLevels: number;
  heightInferred: number;
  roadSegmentCount: number;
  tramSegmentCount: number;
  roadGraphNodes: number;
  roadGraphEdges: number;
  parkCount: number;
  waterCount: number;
  landmarkCount: number;
  elevationSource: string;
  elevationMinMeters: number;
  elevationMaxMeters: number;
}

export interface RegionManifest {
  schemaVersion: 1;
  regionId: string;
  nameTr: string;
  nameEn: string;
  bounds: GeoBounds;
  origin: LonLat;
  tileSize: number;
  spawn: { x: number; z: number; heading: number; labelTr: string; labelEn: string };
  availableTiles: string[];
  landmarks: LandmarkPin[];
  sanctuaryZones: SanctuaryZone[];
  attributions: string[];
  dataMode: 'real-osm' | 'fallback';
}
