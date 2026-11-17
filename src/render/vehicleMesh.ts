import * as THREE from 'three';
import {
  VEHICLE_PAINT_PALETTE,
  type PlayerVehicleState,
  type VehicleArchetype,
} from '../core/vehicle';
import { mergeColoredParts, type ColoredGeometryPart } from './meshMerge';
import { createPlateTexture } from './proceduralTextures';

export type TrafficVisualClass = 'sports' | 'sedan' | 'suv';

export interface TrafficClassGeometries {
  bodyGeo: THREE.BufferGeometry;
  trimWheelsGeo: THREE.BufferGeometry;
  glassGeo: THREE.BufferGeometry;
  lightsGeo: THREE.BufferGeometry;
}

export interface PlayerTaxiRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  driverSeatMount: THREE.Group;
  steeringWheel: THREE.Mesh;
  frontSteerPivots: THREE.Group[];
  wheelSpinMeshes: THREE.Group[];
  bodyPaintMat: THREE.MeshStandardMaterial;
  spoilerMesh: THREE.Mesh;
  suvRoofMesh: THREE.Mesh;
  headlightMat: THREE.MeshBasicMaterial;
  brakeLightMat: THREE.MeshBasicMaterial;
  leftSignalMat: THREE.MeshBasicMaterial;
  rightSignalMat: THREE.MeshBasicMaterial;
  vehicleHeadLight: THREE.PointLight;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

export function mapArchetypeToTrafficClass(archetype: VehicleArchetype): TrafficVisualClass {
  if (archetype === 'sports') return 'sports';
  if (archetype === 'suv' || archetype === 'van' || archetype === 'dolmus') return 'suv';
  return 'sedan';
}

function makeWheelParts(
  wheelRadius: number,
  trackHalf: number,
  frontZ: number,
  rearZ: number,
  rimColor = 0xdbe4ee,
): ColoredGeometryPart[] {
  const parts: ColoredGeometryPart[] = [];
  const placements: [number, number][] = [
    [-trackHalf, frontZ],
    [trackHalf, frontZ],
    [-trackHalf, rearZ],
    [trackHalf, rearZ],
  ];
  for (const [wx, wz] of placements) {
    const tire = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.25, 12);
    tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(wheelRadius * 0.64, wheelRadius * 0.64, 0.265, 10);
    rim.rotateZ(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(wheelRadius * 0.24, wheelRadius * 0.24, 0.28, 8);
    hub.rotateZ(Math.PI / 2);
    parts.push(
      { geometry: tire, color: 0x161920, position: [wx, wheelRadius, wz] },
      { geometry: rim, color: rimColor, position: [wx, wheelRadius, wz] },
      { geometry: hub, color: 0x2a3240, position: [wx, wheelRadius, wz] },
    );
  }
  return parts;
}

/**
 * Builds sculpted, multi-part GPU-instanced geometries for high-craft NPC traffic vehicles
 * (zero plain boxes: real 3D cylinder wheels + alloy rims, sloped windshields, grilles,
 * bumpers, mirrors, spoilers/roof rails, and glowing headlights + red tailbars).
 */
export function buildTrafficClassGeometries(
  style: TrafficVisualClass,
): TrafficClassGeometries {
  const isSports = style === 'sports';
  const isSuv = style === 'suv';

  const bodyW = isSports ? 1.92 : isSuv ? 1.98 : 1.84;
  const bodyL = isSports ? 4.38 : isSuv ? 4.62 : 4.3;
  const wheelR = isSuv ? 0.38 : 0.34;
  const trackHalf = bodyW * 0.5 - 0.04;
  const frontAxleZ = isSuv ? 1.42 : 1.32;
  const rearAxleZ = isSuv ? -1.4 : -1.32;
  const beltY = isSports ? 0.66 : isSuv ? 0.86 : 0.72;
  const roofY = isSports ? 1.24 : isSuv ? 1.66 : 1.38;

  // 1. Sculpted metallic painted body shell (white vertex base -> per-instance color tint!)
  const bodyParts: ColoredGeometryPart[] = [
    // Main sculpted waist / doors
    {
      geometry: new THREE.BoxGeometry(bodyW, isSuv ? 0.56 : 0.44, bodyL * 0.88),
      color: 0xffffff,
      position: [0, beltY - 0.04, 0],
    },
    // Sloped aerodynamic hood
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.94, 0.22, isSports ? 1.48 : 1.28),
      color: 0xffffff,
      position: [0, beltY + 0.06, isSports ? 1.32 : 1.36],
      rotation: [isSports ? 0.14 : 0.09, 0, 0],
    },
    // Rear deck / quarter shoulder
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.95, 0.22, isSuv ? 1.15 : 1.02),
      color: 0xffffff,
      position: [0, beltY + 0.08, isSuv ? -1.6 : -1.52],
      rotation: [isSports ? -0.06 : 0, 0, 0],
    },
    // Flared front & rear wheel arches
    {
      geometry: new THREE.BoxGeometry(bodyW + 0.08, 0.26, 0.92),
      color: 0xf4f6f9,
      position: [0, wheelR + 0.16, frontAxleZ],
    },
    {
      geometry: new THREE.BoxGeometry(bodyW + 0.08, 0.26, 0.92),
      color: 0xf4f6f9,
      position: [0, wheelR + 0.16, rearAxleZ],
    },
    // Painted roof panel
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.8, 0.09, isSuv ? 2.5 : isSports ? 1.48 : 1.72),
      color: 0xffffff,
      position: [0, roofY, isSuv ? -0.25 : -0.18],
    },
    // Sculpted A/C pillars framing glass
    {
      geometry: new THREE.BoxGeometry(0.11, isSuv ? 0.62 : 0.48, 0.12),
      color: 0xf1f5f9,
      position: [-bodyW * 0.4, (beltY + roofY) * 0.5, isSuv ? 0.82 : 0.62],
      rotation: [-0.46, 0, 0.1],
    },
    {
      geometry: new THREE.BoxGeometry(0.11, isSuv ? 0.62 : 0.48, 0.12),
      color: 0xf1f5f9,
      position: [bodyW * 0.4, (beltY + roofY) * 0.5, isSuv ? 0.82 : 0.62],
      rotation: [-0.46, 0, -0.1],
    },
    {
      geometry: new THREE.BoxGeometry(0.14, isSuv ? 0.64 : 0.48, 0.2),
      color: 0xf1f5f9,
      position: [-bodyW * 0.4, (beltY + roofY) * 0.5, isSuv ? -1.46 : -1.06],
      rotation: [isSuv ? 0.14 : 0.48, 0, 0.08],
    },
    {
      geometry: new THREE.BoxGeometry(0.14, isSuv ? 0.64 : 0.48, 0.2),
      color: 0xf1f5f9,
      position: [bodyW * 0.4, (beltY + roofY) * 0.5, isSuv ? -1.46 : -1.06],
      rotation: [isSuv ? 0.14 : 0.48, 0, -0.08],
    },
    // Painted side mirror caps
    {
      geometry: new THREE.BoxGeometry(0.18, 0.11, 0.14),
      color: 0xffffff,
      position: [-bodyW * 0.53, beltY + 0.24, 0.56],
    },
    {
      geometry: new THREE.BoxGeometry(0.18, 0.11, 0.14),
      color: 0xffffff,
      position: [bodyW * 0.53, beltY + 0.24, 0.56],
    },
  ];

  if (isSports) {
    // GT rear wing spoiler + uprights
    bodyParts.push(
      {
        geometry: new THREE.BoxGeometry(bodyW * 0.86, 0.06, 0.26),
        color: 0xffffff,
        position: [0, beltY + 0.35, -2.02],
        rotation: [-0.08, 0, 0],
      },
      {
        geometry: new THREE.BoxGeometry(0.08, 0.2, 0.14),
        color: 0xe2e8f0,
        position: [-0.56, beltY + 0.24, -2.0],
      },
      {
        geometry: new THREE.BoxGeometry(0.08, 0.2, 0.14),
        color: 0xe2e8f0,
        position: [0.56, beltY + 0.24, -2.0],
      },
    );
  }

  // 2. Dark automotive trim + 4 REAL cylindrical tires + silver alloy rims + bumpers + grille + exhausts
  const trimParts: ColoredGeometryPart[] = [
    ...makeWheelParts(wheelR, trackHalf, frontAxleZ, rearAxleZ, isSports ? 0xe2e8f0 : 0xcbd5e1),
    // Recessed dark underbody pan (sits cleanly BETWEEN wheels, never replaces them!)
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.78, 0.14, bodyL * 0.72),
      color: 0x151820,
      position: [0, wheelR * 0.85, 0],
    },
    // Sculpted front bumper splitter & lower air dam
    {
      geometry: new THREE.BoxGeometry(bodyW + 0.04, 0.22, 0.28),
      color: 0x1e242e,
      position: [0, wheelR + 0.08, bodyL * 0.49],
    },
    // Front radiator grille + chrome bar
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.54, 0.19, 0.08),
      color: 0x11141a,
      position: [0, beltY - 0.03, bodyL * 0.495],
    },
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.46, 0.035, 0.09),
      color: 0xd8e0e8,
      position: [0, beltY - 0.02, bodyL * 0.502],
    },
    // Rear bumper diffuser + twin chrome exhaust tips
    {
      geometry: new THREE.BoxGeometry(bodyW + 0.04, 0.24, 0.28),
      color: 0x1e242e,
      position: [0, wheelR + 0.1, -bodyL * 0.49],
    },
    {
      geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8),
      color: 0xcbd5e1,
      position: [-0.52, wheelR + 0.02, -bodyL * 0.51],
      rotation: [Math.PI / 2, 0, 0],
    },
    {
      geometry: new THREE.CylinderGeometry(0.05, 0.05, 0.22, 8),
      color: 0xcbd5e1,
      position: [0.52, wheelR + 0.02, -bodyL * 0.51],
      rotation: [Math.PI / 2, 0, 0],
    },
    // Side rocker skirts + dark B-pillar trim
    {
      geometry: new THREE.BoxGeometry(bodyW + 0.03, 0.12, 1.85),
      color: 0x1d222c,
      position: [0, wheelR - 0.02, 0],
    },
    // Rear license plate backing
    {
      geometry: new THREE.BoxGeometry(0.52, 0.12, 0.04),
      color: 0xf1f5f9,
      position: [0, beltY - 0.08, -bodyL * 0.505],
    },
  ];

  if (isSuv) {
    // Silver roof luggage rails for instant SUV identity
    trimParts.push(
      {
        geometry: new THREE.BoxGeometry(0.06, 0.07, 2.15),
        color: 0xcbd5e1,
        position: [-bodyW * 0.35, roofY + 0.07, -0.22],
      },
      {
        geometry: new THREE.BoxGeometry(0.06, 0.07, 2.15),
        color: 0xcbd5e1,
        position: [bodyW * 0.35, roofY + 0.07, -0.22],
      },
    );
  }

  // 3. Glossy sloped automotive greenhouse glass
  const glassMidY = (beltY + roofY) * 0.5 + 0.02;
  const glassH = Math.max(0.36, roofY - beltY - 0.05);
  const glassParts: ColoredGeometryPart[] = [
    // Angled front windshield
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.78, glassH * 1.12, 0.08),
      color: 0xffffff,
      position: [0, glassMidY, isSuv ? 0.88 : 0.64],
      rotation: [-0.52, 0, 0],
    },
    // Sloped rear window / tailgate glass
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.78, glassH * (isSuv ? 1.0 : 1.15), 0.08),
      color: 0xffffff,
      position: [0, glassMidY, isSuv ? -1.48 : -1.06],
      rotation: [isSuv ? 0.16 : 0.52, 0, 0],
    },
    // Side window greenhouse core
    {
      geometry: new THREE.BoxGeometry(bodyW * 0.81, glassH * 0.92, isSuv ? 2.28 : isSports ? 1.5 : 1.66),
      color: 0xffffff,
      position: [0, glassMidY, isSuv ? -0.28 : -0.2],
    },
  ];

  // 4. Crisp glowing white LED headlights + amber corners + vivid crimson tailbar
  const lightsParts: ColoredGeometryPart[] = [
    {
      geometry: new THREE.BoxGeometry(0.36, 0.13, 0.08),
      color: 0xfff8e1,
      position: [-bodyW * 0.33, beltY + 0.02, bodyL * 0.495],
    },
    {
      geometry: new THREE.BoxGeometry(0.36, 0.13, 0.08),
      color: 0xfff8e1,
      position: [bodyW * 0.33, beltY + 0.02, bodyL * 0.495],
    },
    // Amber front turn accents
    {
      geometry: new THREE.BoxGeometry(0.11, 0.11, 0.09),
      color: 0xf59e0b,
      position: [-bodyW * 0.47, beltY + 0.02, bodyL * 0.47],
    },
    {
      geometry: new THREE.BoxGeometry(0.11, 0.11, 0.09),
      color: 0xf59e0b,
      position: [bodyW * 0.47, beltY + 0.02, bodyL * 0.47],
    },
    // Vivid red rear taillights (full LED bar on sports, dual clusters on sedan/SUV)
    ...(isSports
      ? [
          {
            geometry: new THREE.BoxGeometry(bodyW * 0.84, 0.11, 0.08),
            color: 0xef233c,
            position: [0, beltY + 0.05, -bodyL * 0.495] as [number, number, number],
          },
        ]
      : [
          {
            geometry: new THREE.BoxGeometry(0.4, 0.15, 0.08),
            color: 0xef233c,
            position: [-bodyW * 0.33, beltY + 0.04, -bodyL * 0.495] as [number, number, number],
          },
          {
            geometry: new THREE.BoxGeometry(0.4, 0.15, 0.08),
            color: 0xef233c,
            position: [bodyW * 0.33, beltY + 0.04, -bodyL * 0.495] as [number, number, number],
          },
        ]),
  ];

  return {
    bodyGeo: mergeColoredParts(bodyParts),
    trimWheelsGeo: mergeColoredParts(trimParts),
    glassGeo: mergeColoredParts(glassParts),
    lightsGeo: mergeColoredParts(lightsParts),
  };
}

/**
 * Builds sculpted wheeled Şehir Polisi patrol cruiser geometry (real 4 tires + alloy rims + sloped glass).
 */
export function buildSculptedPoliceBodyGeometry(): THREE.BufferGeometry {
  return mergeColoredParts([
    ...makeWheelParts(0.35, 0.9, 1.34, -1.32, 0xdbe4ee),
    { geometry: new THREE.BoxGeometry(1.88, 0.46, 4.35), color: 0x0f274a, position: [0, 0.66, 0] },
    { geometry: new THREE.BoxGeometry(1.91, 0.2, 2.3), color: 0xf8fafc, position: [0, 0.68, -0.05] },
    { geometry: new THREE.BoxGeometry(1.76, 0.2, 1.32), color: 0x0f274a, position: [0, 0.74, 1.38], rotation: [0.09, 0, 0] },
    { geometry: new THREE.BoxGeometry(1.92, 0.22, 0.28), color: 0x161b24, position: [0, 0.44, 2.15] },
    { geometry: new THREE.BoxGeometry(1.92, 0.22, 0.28), color: 0x161b24, position: [0, 0.44, -2.15] },
    { geometry: new THREE.BoxGeometry(1.52, 0.46, 1.72), color: 0x1c2f47, position: [0, 1.12, -0.18] },
    { geometry: new THREE.BoxGeometry(1.5, 0.46, 0.08), color: 0x1c2f47, position: [0, 1.12, 0.64], rotation: [-0.52, 0, 0] },
    { geometry: new THREE.BoxGeometry(1.54, 0.09, 1.7), color: 0xf8fafc, position: [0, 1.38, -0.18] },
    { geometry: new THREE.BoxGeometry(0.36, 0.13, 0.08), color: 0xfff8e1, position: [-0.62, 0.72, 2.18] },
    { geometry: new THREE.BoxGeometry(0.36, 0.13, 0.08), color: 0xfff8e1, position: [0.62, 0.72, 2.18] },
    { geometry: new THREE.BoxGeometry(0.4, 0.14, 0.08), color: 0xef233c, position: [-0.62, 0.74, -2.18] },
    { geometry: new THREE.BoxGeometry(0.4, 0.14, 0.08), color: 0xef233c, position: [0.62, 0.74, -2.18] },
  ]);
}

/**
 * Updates the player's GTA free-roam vehicle rig appearance cleanly when stealing/swapping
 * into any NPC car on the street (instant metallic paint + sports wing / SUV roof swap).
 */
export function setPlayerVehicleAppearance(
  rig: PlayerTaxiRig,
  archetype: VehicleArchetype,
  paintHex: number,
): void {
  rig.bodyPaintMat.color.setHex(paintHex);
  const visualClass = mapArchetypeToTrafficClass(archetype);
  rig.spoilerMesh.visible = visualClass === 'sports';
  rig.suvRoofMesh.visible = visualClass === 'suv';
}

/**
 * Stylized GTA Vice City free-roam coastal sports coupe / street vehicle rig (NO forced taxi sign!):
 * - Glossy metallic clearcoat paint (dynamically adopts any stolen NPC car's color & class!)
 * - Translucent tinted cabin glass with visible seated driver & rotating 3D steering wheel
 * - GT ducktail spoiler (toggled on sports), SUV roof rack (toggled on SUV/van)
 * - 4 steerable/rolling 5-spoke alloy wheels, glowing LED brake bar & amber turn signals
 */
export function createPlayerTaxiRig(
  contactShadowTex: THREE.Texture,
  initialArchetype: VehicleArchetype = 'sports',
  initialPaintHex: number = VEHICLE_PAINT_PALETTE[0]!,
): PlayerTaxiRig {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    textures.push(t);
    return t;
  };

  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // Grounded elliptical soft underbody contact shadow
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.55, 5.0));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.04;
  root.add(shadowMesh);

  const plateTex = trackTex(createPlateTexture('34 IST 06'));

  // Glossy metallic clearcoat paint material (supports instant live color swaps on car theft!)
  const bodyPaintMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: initialPaintHex,
      roughness: 0.24,
      metalness: 0.45,
    }),
  );
  const trimMat = trackMat(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.56, metalness: 0.25 }),
  );
  // Translucent tinted cabin glass so seated protagonist & rotating steering wheel stay crisp!
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x162436,
      roughness: 0.08,
      metalness: 0.72,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  const headlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff8dc }));
  const brakeLightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x991b1b }));
  const plateMat = trackMat(new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.45 }));
  const wheelMat = trackMat(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.4 }),
  );

  // 1. Sculpted Metallic Painted Car Shell (sloped nose, wide fenders, doors, pillars, roof, rear deck)
  const paintedBodyGeo = trackGeo(
    mergeColoredParts([
      // Sculpted lower waist & side doors
      { geometry: new THREE.BoxGeometry(1.9, 0.48, 4.18), color: 0xffffff, position: [0, 0.62, 0] },
      // Sleek sloped aerodynamic hood
      {
        geometry: new THREE.BoxGeometry(1.78, 0.22, 1.46),
        color: 0xffffff,
        position: [0, 0.74, 1.32],
        rotation: [0.13, 0, 0],
      },
      // Flared sport wheel arches
      { geometry: new THREE.BoxGeometry(1.98, 0.26, 0.96), color: 0xf4f6f9, position: [0, 0.52, 1.34] },
      { geometry: new THREE.BoxGeometry(1.98, 0.26, 0.96), color: 0xf4f6f9, position: [0, 0.52, -1.32] },
      // Sculpted rear trunk deck
      { geometry: new THREE.BoxGeometry(1.82, 0.24, 1.02), color: 0xffffff, position: [0, 0.76, -1.56] },
      // Sleek painted roof panel
      { geometry: new THREE.BoxGeometry(1.52, 0.08, 1.56), color: 0xffffff, position: [0, 1.38, -0.2] },
      // Sculpted A-pillars & C-pillars framing cabin
      { geometry: new THREE.BoxGeometry(0.09, 0.54, 0.1), color: 0xf1f5f9, position: [-0.74, 1.1, 0.58], rotation: [-0.48, 0, 0.1] },
      { geometry: new THREE.BoxGeometry(0.09, 0.54, 0.1), color: 0xf1f5f9, position: [0.74, 1.1, 0.58], rotation: [-0.48, 0, -0.1] },
      { geometry: new THREE.BoxGeometry(0.12, 0.52, 0.16), color: 0xf1f5f9, position: [-0.74, 1.1, -1.02], rotation: [0.48, 0, 0.1] },
      { geometry: new THREE.BoxGeometry(0.12, 0.52, 0.16), color: 0xf1f5f9, position: [0.74, 1.1, -1.02], rotation: [0.48, 0, -0.1] },
      // Side mirror caps
      { geometry: new THREE.BoxGeometry(0.18, 0.1, 0.14), color: 0xffffff, position: [-1.02, 0.92, 0.58] },
      { geometry: new THREE.BoxGeometry(0.18, 0.1, 0.14), color: 0xffffff, position: [1.02, 0.92, 0.58] },
    ]),
  );
  const paintedBodyMesh = new THREE.Mesh(paintedBodyGeo, bodyPaintMat);
  paintedBodyMesh.castShadow = true;
  paintedBodyMesh.receiveShadow = true;
  chassisGroup.add(paintedBodyMesh);

  // 1b. Optional Sports GT Rear Wing Spoiler (shown on 'sports')
  const spoilerGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(1.66, 0.06, 0.28), color: 0xffffff, position: [0, 1.07, -2.02], rotation: [-0.08, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.08, 0.22, 0.16), color: 0xe2e8f0, position: [-0.56, 0.95, -2.0] },
      { geometry: new THREE.BoxGeometry(0.08, 0.22, 0.16), color: 0xe2e8f0, position: [0.56, 0.95, -2.0] },
    ]),
  );
  const spoilerMesh = new THREE.Mesh(spoilerGeo, bodyPaintMat);
  spoilerMesh.castShadow = true;
  chassisGroup.add(spoilerMesh);

  // 1c. Optional Extended SUV/Van Roof Cap + Luggage Rails (shown on 'suv' / 'van')
  const suvRoofGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(1.62, 0.24, 2.28), color: 0xffffff, position: [0, 1.5, -0.45] },
      { geometry: new THREE.BoxGeometry(0.06, 0.08, 1.95), color: 0xdbe4ee, position: [-0.66, 1.66, -0.45] },
      { geometry: new THREE.BoxGeometry(0.06, 0.08, 1.95), color: 0xdbe4ee, position: [0.66, 1.66, -0.45] },
    ]),
  );
  const suvRoofMesh = new THREE.Mesh(suvRoofGeo, bodyPaintMat);
  chassisGroup.add(suvRoofMesh);

  // 2. Sculpted Trim, Bumpers, Grille, Cabin Interior, Dashboard, Seats & Twin Exhausts
  const mergedTrimGeo = trackGeo(
    mergeColoredParts([
      // Front aerodynamic bumper splitter & lower air intake
      { geometry: new THREE.BoxGeometry(1.94, 0.23, 0.3), color: 0x1b2029, position: [0, 0.41, 2.08] },
      { geometry: new THREE.BoxGeometry(1.88, 0.06, 0.18), color: 0x0f131a, position: [0, 0.29, 2.16] },
      // Rear diffuser bumper + twin chrome exhausts
      { geometry: new THREE.BoxGeometry(1.94, 0.25, 0.3), color: 0x1b2029, position: [0, 0.43, -2.08] },
      { geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.26, 8), color: 0xdbe4ee, position: [-0.54, 0.34, -2.2], rotation: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.26, 8), color: 0xdbe4ee, position: [0.54, 0.34, -2.2], rotation: [Math.PI / 2, 0, 0] },
      // Side skirts
      { geometry: new THREE.BoxGeometry(1.94, 0.11, 1.88), color: 0x191e27, position: [0, 0.34, 0] },
      // Recessed front mesh grille + chrome accent strip
      { geometry: new THREE.BoxGeometry(1.06, 0.19, 0.08), color: 0x101319, position: [0, 0.64, 2.15] },
      { geometry: new THREE.BoxGeometry(0.96, 0.035, 0.09), color: 0xe2e8f0, position: [0, 0.65, 2.165] },
      // Cabin interior floor, sport dashboard & twin bucket seats
      { geometry: new THREE.BoxGeometry(1.48, 0.08, 1.8), color: 0x1e2430, position: [0, 0.56, -0.18] },
      { geometry: new THREE.BoxGeometry(1.42, 0.22, 0.38), color: 0x252c3b, position: [0, 0.88, 0.58] },
      { geometry: new THREE.BoxGeometry(0.46, 0.44, 0.12), color: 0x2b3344, position: [0.38, 0.88, -0.36], rotation: [-0.14, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.46, 0.44, 0.12), color: 0x2b3344, position: [-0.38, 0.88, -0.36], rotation: [-0.14, 0, 0] },
      // Flush door handles
      { geometry: new THREE.BoxGeometry(0.05, 0.04, 0.2), color: 0xdbe4ee, position: [-0.96, 0.78, 0.02] },
      { geometry: new THREE.BoxGeometry(0.05, 0.04, 0.2), color: 0xdbe4ee, position: [0.96, 0.78, 0.02] },
    ]),
  );
  const mergedTrim = new THREE.Mesh(mergedTrimGeo, trimMat);
  mergedTrim.castShadow = true;
  chassisGroup.add(mergedTrim);

  // 3. Glowing Front LED Headlights
  const mergedHeadlightsGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.38, 0.13, 0.08), color: 0xffffff, position: [-0.66, 0.69, 2.14] },
      { geometry: new THREE.BoxGeometry(0.38, 0.13, 0.08), color: 0xffffff, position: [0.66, 0.69, 2.14] },
    ]),
  );
  chassisGroup.add(new THREE.Mesh(mergedHeadlightsGeo, headlightMat));

  // 4. Translucent Sloped Cabin Glass
  const mergedGlassGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(1.44, 0.58, 0.05), color: 0xffffff, position: [0, 1.13, 0.66], rotation: [-0.52, 0, 0] },
      { geometry: new THREE.BoxGeometry(1.44, 0.58, 0.05), color: 0xffffff, position: [0, 1.12, -1.08], rotation: [0.52, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.04, 0.46, 1.54), color: 0xffffff, position: [-0.76, 1.12, -0.2] },
      { geometry: new THREE.BoxGeometry(0.04, 0.46, 1.54), color: 0xffffff, position: [0.76, 1.12, -0.2] },
    ]),
  );
  const mergedGlass = new THREE.Mesh(mergedGlassGeo, glassMat);
  mergedGlass.renderOrder = 2;
  chassisGroup.add(mergedGlass);

  // Driver seat mount (LHD front-left seat — protagonist sits visibly behind the wheel!)
  const driverSeatMount = new THREE.Group();
  driverSeatMount.position.set(0.38, 0.08, -0.14);
  driverSeatMount.scale.setScalar(0.84);
  chassisGroup.add(driverSeatMount);

  // Interactive Interior Steering Wheel
  const steeringWheelGeo = trackGeo(new THREE.TorusGeometry(0.16, 0.025, 6, 14));
  const steeringWheelMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.55 }));
  const steeringWheel = new THREE.Mesh(steeringWheelGeo, steeringWheelMat);
  steeringWheel.position.set(0.38, 0.98, 0.44);
  steeringWheel.rotation.x = 0.45;
  chassisGroup.add(steeringWheel);

  // Dynamic Amber Turn Signal Indicators
  const leftSignalMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x6b440d }));
  const rightSignalMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x6b440d }));
  const leftSignalGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [0.88, 0.69, 2.13] },
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [0.88, 0.72, -2.16] },
    ]),
  );
  const rightSignalGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [-0.88, 0.69, 2.13] },
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [-0.88, 0.72, -2.16] },
    ]),
  );
  chassisGroup.add(new THREE.Mesh(leftSignalGeo, leftSignalMat));
  chassisGroup.add(new THREE.Mesh(rightSignalGeo, rightSignalMat));

  // 5. Dynamic Rear LED Brake Light Bar (brightens vividly when braking!)
  const brakeLightsGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.46, 0.14, 0.08), color: 0xffffff, position: [-0.6, 0.72, -2.16] },
      { geometry: new THREE.BoxGeometry(0.46, 0.14, 0.08), color: 0xffffff, position: [0.6, 0.72, -2.16] },
      { geometry: new THREE.BoxGeometry(0.76, 0.05, 0.07), color: 0xffffff, position: [0, 0.74, -2.16] },
    ]),
  );
  chassisGroup.add(new THREE.Mesh(brakeLightsGeo, brakeLightMat));

  // 6. Fictional Istanbul License Plate (rear)
  const plateGeo = trackGeo(new THREE.PlaneGeometry(0.56, 0.14));
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.56, -2.235);
  rearPlate.rotation.y = Math.PI;
  chassisGroup.add(rearPlate);

  // Night / Sunset Headlight PointLight
  const vehicleHeadLight = new THREE.PointLight(0xffe7a8, 0, 30, 1.6);
  vehicleHeadLight.position.set(0, 1.05, 3.0);
  chassisGroup.add(vehicleHeadLight);

  // 7–10. 4 Steerable & Rolling 5-Spoke Alloy Wheels
  const tirePart = new THREE.CylinderGeometry(0.35, 0.35, 0.27, 14);
  tirePart.rotateZ(Math.PI / 2);
  const rimPart = new THREE.CylinderGeometry(0.23, 0.23, 0.285, 12);
  rimPart.rotateZ(Math.PI / 2);
  const hubPart = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8);
  hubPart.rotateZ(Math.PI / 2);

  const singleWheelGeo = trackGeo(
    mergeColoredParts([
      { geometry: tirePart, color: 0x15181e },
      { geometry: rimPart, color: 0xdbe4ee },
      { geometry: new THREE.BoxGeometry(0.295, 0.38, 0.055), color: 0x334155 },
      { geometry: new THREE.BoxGeometry(0.295, 0.38, 0.055), color: 0x334155, rotation: [Math.PI / 3, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.295, 0.38, 0.055), color: 0x334155, rotation: [-Math.PI / 3, 0, 0] },
      { geometry: hubPart, color: 0x1e293b },
    ]),
  );

  const frontSteerPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Group[] = [];
  const wheelPlacements: [number, number, boolean][] = [
    [-0.93, 1.34, true],
    [0.93, 1.34, true],
    [-0.93, -1.32, false],
    [0.93, -1.32, false],
  ];

  for (const [wx, wz, isFront] of wheelPlacements) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, 0.35, wz);
    const spinGroup = new THREE.Group();
    spinGroup.add(new THREE.Mesh(singleWheelGeo, wheelMat));
    steerPivot.add(spinGroup);
    root.add(steerPivot);
    if (isFront) frontSteerPivots.push(steerPivot);
    wheelSpinMeshes.push(spinGroup);
  }

  const rig: PlayerTaxiRig = {
    root,
    chassisGroup,
    driverSeatMount,
    steeringWheel,
    frontSteerPivots,
    wheelSpinMeshes,
    bodyPaintMat,
    spoilerMesh,
    suvRoofMesh,
    headlightMat,
    brakeLightMat,
    leftSignalMat,
    rightSignalMat,
    vehicleHeadLight,
    geometries,
    materials,
    textures,
  };

  setPlayerVehicleAppearance(rig, initialArchetype, initialPaintHex);
  return rig;
}

/**
 * Updates front wheel steering angle, rolling wheel spin, steering wheel, turn signals,
 * brake light glow, and spring-damped suspension pitch/roll/heave.
 */
export function updatePlayerTaxiRig(rig: PlayerTaxiRig, vehicle: PlayerVehicleState): void {
  const steerAngle = vehicle.steerVisual * 0.42;
  for (const pivot of rig.frontSteerPivots) {
    pivot.rotation.y = steerAngle;
  }
  for (const wheel of rig.wheelSpinMeshes) {
    wheel.rotation.x = vehicle.wheelSpin;
  }
  rig.steeringWheel.rotation.z = -vehicle.steerVisual * 1.6;
  rig.brakeLightMat.color.setHex(vehicle.braking ? 0xff2626 : 0x991b1b);

  // Blinking amber turn signals when steering into a turn
  const blinkOn = Math.floor(vehicle.signalTimer * 3.6) % 2 === 0;
  rig.leftSignalMat.color.setHex(vehicle.steerVisual > 0.25 && blinkOn ? 0xffae19 : 0x6b440d);
  rig.rightSignalMat.color.setHex(vehicle.steerVisual < -0.25 && blinkOn ? 0xffae19 : 0x6b440d);

  // Spring-damped suspension body pitch, cornering roll, and subtle vertical heave
  rig.chassisGroup.rotation.z = vehicle.suspRoll;
  rig.chassisGroup.rotation.x = vehicle.suspPitch;
  rig.chassisGroup.position.y = vehicle.suspHeave;
}
