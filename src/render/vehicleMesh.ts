import * as THREE from 'three';
import type { PlayerVehicleState } from '../core/vehicle';
import { mergeColoredParts } from './meshMerge';
import {
  createPlateTexture,
  createTaxiSideTexture,
  createTaxiSignTexture,
} from './proceduralTextures';

export interface PlayerTaxiRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  driverSeatMount: THREE.Group;
  steeringWheel: THREE.Mesh;
  frontSteerPivots: THREE.Group[];
  wheelSpinMeshes: THREE.Group[];
  headlightMat: THREE.MeshBasicMaterial;
  brakeLightMat: THREE.MeshBasicMaterial;
  leftSignalMat: THREE.MeshBasicMaterial;
  rightSignalMat: THREE.MeshBasicMaterial;
  vehicleHeadLight: THREE.PointLight;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

/**
 * Stylized detailed Istanbul Sarı Taksi (fictional design, zero real brand logos),
 * heavily batched via mergeColoredParts so the entire detailed vehicle costs only ~11 draw calls:
 * - Checkered yellow-and-black side stripe + door seams
 * - Sloped windshield/rear glass, painted roof, illuminated "TAKSİ" roof sign, 34 T 0421 plates
 * - Merged bumpers, grille, chrome bars, side mirrors, exhaust, headlights & dynamic brake lights
 * - 4 alloy-rimmed steerable/rolling wheels (1 merged mesh each!) + grounded contact shadow
 */
export function createPlayerTaxiRig(contactShadowTex: THREE.Texture): PlayerTaxiRig {
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

  const sideTex = createTaxiSideTexture();
  const signTex = createTaxiSignTexture();
  const plateTex = createPlateTexture();
  textures.push(sideTex, signTex, plateTex);

  const paintMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf6b800, roughness: 0.28, metalness: 0.26 }),
  );
  const sideStripeMat = trackMat(
    new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.3, metalness: 0.24 }),
  );
  const trimMergedMat = trackMat(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.28 }),
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b6384,
      roughness: 0.14,
      metalness: 0.45,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  const wheelMat = trackMat(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
  );
  const signMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: new THREE.Color(0xffd25a),
      emissiveMap: signTex,
      emissiveIntensity: 0.72,
      roughness: 0.35,
    }),
  );
  const plateMat = trackMat(new THREE.MeshBasicMaterial({ map: plateTex }));
  const headlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfff7d6 }));
  const brakeLightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x7a1212 }));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
    }),
  );

  const root = new THREE.Group();

  // 1. Soft grounded chassis shadow quad
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.75, 5.2));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowQuad = new THREE.Mesh(shadowGeo, shadowMat);
  shadowQuad.position.y = 0.03;
  root.add(shadowQuad);

  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  // 2. Main lower body with checkered taxi side stripe (1 mesh, 2 materials on box groups)
  const lowerBodyGeo = trackGeo(new THREE.BoxGeometry(1.88, 0.58, 4.32));
  const lowerBody = new THREE.Mesh(lowerBodyGeo, [
    sideStripeMat,
    sideStripeMat,
    paintMat,
    paintMat,
    paintMat,
    paintMat,
  ]);
  lowerBody.position.set(0, 0.62, 0);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  chassisGroup.add(lowerBody);

  // 3. Merged upper painted body, bumpers, grille, chrome bars, mirrors, pillars, indicators & exhaust (1 draw call!)
  const C_YELLOW = 0xf6b800;
  const C_DARK = 0x222731;
  const C_CHROME = 0xd9e1eb;
  const C_AMBER = 0xf59e0b;
  const C_HEADLIGHT = 0xfff7d6;

  const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8);
  exhaustGeo.rotateX(Math.PI / 2);

  const mergedChassisGeo = trackGeo(
    mergeColoredParts([
      // Hood & Trunk
      { geometry: new THREE.BoxGeometry(1.76, 0.14, 1.32), color: C_YELLOW, position: [0, 0.92, 1.32], rotation: [0.08, 0, 0] },
      { geometry: new THREE.BoxGeometry(1.78, 0.14, 0.92), color: C_YELLOW, position: [0, 0.92, -1.58], rotation: [-0.06, 0, 0] },
      // Roof cap + corner pillars + cabin interior (dashboard, steering wheel, seats) + sign base
      { geometry: new THREE.BoxGeometry(1.58, 0.08, 1.66), color: C_YELLOW, position: [0, 1.44, -0.18] },
      // A/B/C thin corner window pillars (leaving open interior so seated driver is clearly visible!)
      { geometry: new THREE.BoxGeometry(0.08, 0.54, 0.08), color: C_DARK, position: [0.74, 1.15, 0.58], rotation: [-0.45, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.08, 0.54, 0.08), color: C_DARK, position: [-0.74, 1.15, 0.58], rotation: [-0.45, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.08, 0.5, 0.1), color: C_DARK, position: [0.75, 1.16, -0.16] },
      { geometry: new THREE.BoxGeometry(0.08, 0.5, 0.1), color: C_DARK, position: [-0.75, 1.16, -0.16] },
      { geometry: new THREE.BoxGeometry(0.09, 0.52, 0.1), color: C_DARK, position: [0.74, 1.16, -0.92], rotation: [0.42, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.09, 0.52, 0.1), color: C_DARK, position: [-0.74, 1.16, -0.92], rotation: [0.42, 0, 0] },
      // Interior dashboard, driver steering wheel & two seatbacks
      { geometry: new THREE.BoxGeometry(1.54, 0.24, 0.34), color: C_DARK, position: [0, 0.96, 0.56] },
      { geometry: new THREE.CylinderGeometry(0.16, 0.16, 0.04, 10), color: 0x11161f, position: [0.38, 1.07, 0.38], rotation: [1.15, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.44, 0.44, 0.1), color: 0x2c3340, position: [0.38, 1.02, -0.34], rotation: [-0.14, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.44, 0.44, 0.1), color: 0x2c3340, position: [-0.38, 1.02, -0.34], rotation: [-0.14, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.76, 0.06, 0.24), color: C_DARK, position: [0, 1.5, -0.05] },
      // Side mirrors
      { geometry: new THREE.BoxGeometry(0.22, 0.11, 0.14), color: C_YELLOW, position: [0.98, 0.98, 0.62] },
      { geometry: new THREE.BoxGeometry(0.22, 0.11, 0.14), color: C_YELLOW, position: [-0.98, 0.98, 0.62] },
      // Front & rear bumpers + grille + chrome bars + exhaust
      { geometry: new THREE.BoxGeometry(1.94, 0.24, 0.28), color: C_DARK, position: [0, 0.38, 2.14] },
      { geometry: new THREE.BoxGeometry(1.94, 0.24, 0.28), color: C_DARK, position: [0, 0.38, -2.14] },
      { geometry: new THREE.BoxGeometry(0.92, 0.24, 0.08), color: C_DARK, position: [0, 0.64, 2.16] },
      { geometry: new THREE.BoxGeometry(0.96, 0.04, 0.09), color: C_CHROME, position: [0, 0.75, 2.165] },
      { geometry: new THREE.BoxGeometry(0.96, 0.04, 0.09), color: C_CHROME, position: [0, 0.64, 2.165] },
      { geometry: exhaustGeo, color: C_CHROME, position: [0.56, 0.28, -2.24] },
      // Front headlights + amber front/rear turn corners
      { geometry: new THREE.BoxGeometry(0.38, 0.16, 0.07), color: C_HEADLIGHT, position: [-0.64, 0.66, 2.16] },
      { geometry: new THREE.BoxGeometry(0.38, 0.16, 0.07), color: C_HEADLIGHT, position: [0.64, 0.66, 2.16] },
      { geometry: new THREE.BoxGeometry(0.14, 0.15, 0.08), color: C_AMBER, position: [-0.87, 0.66, 2.14] },
      { geometry: new THREE.BoxGeometry(0.14, 0.15, 0.08), color: C_AMBER, position: [0.87, 0.66, 2.14] },
      { geometry: new THREE.BoxGeometry(0.14, 0.15, 0.08), color: C_AMBER, position: [-0.87, 0.68, -2.14] },
      { geometry: new THREE.BoxGeometry(0.14, 0.15, 0.08), color: C_AMBER, position: [0.87, 0.68, -2.14] },
    ]),
  );
  const mergedChassis = new THREE.Mesh(mergedChassisGeo, trimMergedMat);
  mergedChassis.castShadow = true;
  chassisGroup.add(mergedChassis);

  // 4. Translucent Hollow Greenhouse Glass (windshield, rear glass & side panes = 1 draw call; driver visible inside!)
  const mergedGlassGeo = trackGeo(
    mergeColoredParts([
      // Left & right side window panes (thin plates so interior driver stays crystal clear)
      { geometry: new THREE.BoxGeometry(0.04, 0.46, 1.54), color: 0xffffff, position: [0.76, 1.16, -0.18] },
      { geometry: new THREE.BoxGeometry(0.04, 0.46, 1.54), color: 0xffffff, position: [-0.76, 1.16, -0.18] },
      // Sloped front windshield & rear window
      { geometry: new THREE.BoxGeometry(1.5, 0.56, 0.05), color: 0xffffff, position: [0, 1.15, 0.72], rotation: [-0.62, 0, 0] },
      { geometry: new THREE.BoxGeometry(1.5, 0.54, 0.05), color: 0xffffff, position: [0, 1.16, -1.06], rotation: [0.58, 0, 0] },
    ]),
  );
  const mergedGlass = new THREE.Mesh(mergedGlassGeo, glassMat);
  mergedGlass.renderOrder = 2;
  chassisGroup.add(mergedGlass);

  // Driver seat mount (Istanbul LHD front-left seat — protagonist attaches here while driving!)
  const driverSeatMount = new THREE.Group();
  driverSeatMount.position.set(0.38, 0.08, -0.14);
  driverSeatMount.scale.setScalar(0.84);
  chassisGroup.add(driverSeatMount);

  // Interactive Interior Steering Wheel (turns smoothly with steering input!)
  const steeringWheelGeo = trackGeo(new THREE.TorusGeometry(0.16, 0.025, 6, 14));
  const steeringWheelMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.55 }));
  const steeringWheel = new THREE.Mesh(steeringWheelGeo, steeringWheelMat);
  steeringWheel.position.set(0.38, 0.98, 0.44);
  steeringWheel.rotation.x = 0.45;
  chassisGroup.add(steeringWheel);

  // Dynamic Amber Turn Signal Indicators (left/right front + rear pairs)
  const leftSignalMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x6b440d }));
  const rightSignalMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x6b440d }));
  const leftSignalGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [0.82, 0.67, 2.13] },
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [0.85, 0.68, -2.16] },
    ]),
  );
  const rightSignalGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [-0.82, 0.67, 2.13] },
      { geometry: new THREE.BoxGeometry(0.14, 0.11, 0.07), color: 0xffffff, position: [-0.85, 0.68, -2.16] },
    ]),
  );
  chassisGroup.add(new THREE.Mesh(leftSignalGeo, leftSignalMat));
  chassisGroup.add(new THREE.Mesh(rightSignalGeo, rightSignalMat));

  // 5. Dynamic Rear Brake Lights (merged pair -> 1 draw call, brightens when braking!)
  const brakeLightsGeo = trackGeo(
    mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.38, 0.16, 0.07), color: 0xffffff, position: [-0.64, 0.68, -2.16] },
      { geometry: new THREE.BoxGeometry(0.38, 0.16, 0.07), color: 0xffffff, position: [0.64, 0.68, -2.16] },
    ]),
  );
  const brakeLights = new THREE.Mesh(brakeLightsGeo, brakeLightMat);
  chassisGroup.add(brakeLights);

  // 6. Illuminated "TAKSİ" Roof Light Box
  const signBoxGeo = trackGeo(new THREE.BoxGeometry(0.72, 0.21, 0.2));
  const roofSign = new THREE.Mesh(signBoxGeo, signMat);
  roofSign.position.set(0, 1.61, -0.05);
  chassisGroup.add(roofSign);

  // 7. Fictional Istanbul License Plate (rear — visible in 3rd-person follow cam!)
  const plateGeo = trackGeo(new THREE.PlaneGeometry(0.56, 0.14));
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.56, -2.175);
  rearPlate.rotation.y = Math.PI;
  chassisGroup.add(rearPlate);

  // Night headlight point light
  const vehicleHeadLight = new THREE.PointLight(0xffe7a8, 0, 28, 1.7);
  vehicleHeadLight.position.set(0, 1.05, 2.9);
  chassisGroup.add(vehicleHeadLight);

  // 8–11. 4 Merged Alloy-Rimmed Wheels (1 draw call each, front steerable, all 4 rolling!)
  const tirePart = new THREE.CylinderGeometry(0.35, 0.35, 0.27, 14);
  tirePart.rotateZ(Math.PI / 2);
  const rimPart = new THREE.CylinderGeometry(0.22, 0.22, 0.285, 10);
  rimPart.rotateZ(Math.PI / 2);
  const hubPart = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8);
  hubPart.rotateZ(Math.PI / 2);

  const singleWheelGeo = trackGeo(
    mergeColoredParts([
      { geometry: tirePart, color: 0x16191f },
      { geometry: rimPart, color: 0xcbd5e1 },
      { geometry: new THREE.BoxGeometry(0.295, 0.34, 0.055), color: 0x334155 },
      { geometry: new THREE.BoxGeometry(0.295, 0.34, 0.055), color: 0x334155, rotation: [Math.PI / 2, 0, 0] },
      { geometry: hubPart, color: 0x334155 },
    ]),
  );

  const frontSteerPivots: THREE.Group[] = [];
  const wheelSpinMeshes: THREE.Group[] = [];
  const wheelPlacements: [number, number, boolean][] = [
    [-0.92, 1.34, true],
    [0.92, 1.34, true],
    [-0.92, -1.32, false],
    [0.92, -1.32, false],
  ];

  for (const [wx, wz, isFront] of wheelPlacements) {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(wx, 0.35, wz);
    const spinGroup = new THREE.Group();
    const wheelMesh = new THREE.Mesh(singleWheelGeo, wheelMat);
    spinGroup.add(wheelMesh);
    steerPivot.add(spinGroup);
    root.add(steerPivot);
    if (isFront) frontSteerPivots.push(steerPivot);
    wheelSpinMeshes.push(spinGroup);
  }

  return {
    root,
    chassisGroup,
    driverSeatMount,
    steeringWheel,
    frontSteerPivots,
    wheelSpinMeshes,
    headlightMat,
    brakeLightMat,
    leftSignalMat,
    rightSignalMat,
    vehicleHeadLight,
    geometries,
    materials,
    textures,
  };
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
  rig.brakeLightMat.color.setHex(vehicle.braking ? 0xff2626 : 0x7a1212);

  // Blinking amber turn signals when steering into a turn
  const blinkOn = Math.floor(vehicle.signalTimer * 3.6) % 2 === 0;
  rig.leftSignalMat.color.setHex(vehicle.steerVisual > 0.25 && blinkOn ? 0xffae19 : 0x6b440d);
  rig.rightSignalMat.color.setHex(vehicle.steerVisual < -0.25 && blinkOn ? 0xffae19 : 0x6b440d);

  // Spring-damped suspension body pitch, cornering roll, and subtle vertical heave
  rig.chassisGroup.rotation.z = vehicle.suspRoll;
  rig.chassisGroup.rotation.x = vehicle.suspPitch;
  rig.chassisGroup.position.y = vehicle.suspHeave;
}
