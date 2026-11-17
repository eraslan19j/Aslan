import * as THREE from 'three';
import type { TimeOfDay } from '../core/diagnostics';
import { createRng } from '../core/rng';

export interface FacadeTextureSet {
  upperMap: THREE.CanvasTexture;
  upperEmissiveMap: THREE.CanvasTexture;
  groundRoofMap: THREE.CanvasTexture;
  groundRoofEmissiveMap: THREE.CanvasTexture;
}

function configureTexture(
  tex: THREE.CanvasTexture,
  wrapS: THREE.Wrapping,
  wrapT: THREE.Wrapping,
  anisotropy = 4,
): THREE.CanvasTexture {
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates high-detail Istanbul apartment facades (upper floors with balconies, shutters,
 * curtains, AC units + dedicated ground-floor shopfronts with striped awnings & textured roofs).
 */
export function createIstanbulFacadeTextures(anisotropy = 4): FacadeTextureSet {
  // 1. Upper repeating apartment floors (512x512 = 4 bays wide x 2 stories tall)
  const upperCanvas = document.createElement('canvas');
  upperCanvas.width = 512;
  upperCanvas.height = 512;
  const uCtx = upperCanvas.getContext('2d');

  const upperEmCanvas = document.createElement('canvas');
  upperEmCanvas.width = 512;
  upperEmCanvas.height = 512;
  const uEmCtx = upperEmCanvas.getContext('2d');

  if (uCtx && uEmCtx) {
    const rng = createRng(34107);
    // Warm sunlit plaster base (tinted by building vertex colors)
    uCtx.fillStyle = '#f2ede4';
    uCtx.fillRect(0, 0, 512, 512);
    uEmCtx.fillStyle = '#000000';
    uEmCtx.fillRect(0, 0, 512, 512);

    // Subtle stucco grain & vertical weathering
    for (let i = 0; i < 2400; i += 1) {
      const gx = rng.next() * 512;
      const gy = rng.next() * 512;
      const alpha = 0.025 + rng.next() * 0.04;
      uCtx.fillStyle = rng.next() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(80,70,60,${alpha})`;
      uCtx.fillRect(gx, gy, 2 + rng.next() * 4, 2 + rng.next() * 3);
    }

    const cols = 4;
    const rows = 2;
    const bayW = 512 / cols;
    const floorH = 512 / rows;

    for (let r = 0; r < rows; r += 1) {
      const fy = r * floorH;

      // Concrete floor slab cornice & soft drop shadow below each floor ledge
      uCtx.fillStyle = '#ded7cb';
      uCtx.fillRect(0, fy, 512, 14);
      uCtx.fillStyle = 'rgba(40,34,28,0.16)';
      uCtx.fillRect(0, fy + 14, 512, 8);
      uCtx.fillStyle = 'rgba(255,255,255,0.35)';
      uCtx.fillRect(0, fy, 512, 3);

      for (let c = 0; c < cols; c += 1) {
        const bx = c * bayW;
        const isBalconyBay = (c + r) % 2 === 1;

        if (isBalconyBay) {
          // Recessed Istanbul balcony niche
          const nx = bx + 12;
          const ny = fy + 34;
          const nw = bayW - 24;
          const nh = floorH - 42;

          // Recessed shaded interior wall
          const nicheGrad = uCtx.createLinearGradient(nx, ny, nx, ny + nh);
          nicheGrad.addColorStop(0, '#a69e92');
          nicheGrad.addColorStop(0.35, '#cdc5b8');
          nicheGrad.addColorStop(1, '#b8b0a3');
          uCtx.fillStyle = nicheGrad;
          uCtx.fillRect(nx, ny, nw, nh);

          // Balcony French door + window inside recess
          const dx = nx + 14;
          const dy = ny + 14;
          const dw = nw - 28;
          const dh = nh - 22;
          uCtx.fillStyle = '#f5f2ec'; // white PVC frame
          uCtx.fillRect(dx - 4, dy - 4, dw + 8, dh + 6);

          const glassGrad = uCtx.createLinearGradient(dx, dy, dx, dy + dh);
          glassGrad.addColorStop(0, '#4f7396');
          glassGrad.addColorStop(0.45, '#7ba4c7');
          glassGrad.addColorStop(1, '#3b536b');
          uCtx.fillStyle = glassGrad;
          uCtx.fillRect(dx, dy, dw, dh);

          // Subtle curtain inside glass
          uCtx.fillStyle = 'rgba(250,242,226,0.32)';
          uCtx.fillRect(dx, dy, dw * 0.28, dh);

          // Center PVC mullion
          uCtx.fillStyle = '#f0ece4';
          uCtx.fillRect(dx + dw * 0.48, dy, 4, dh);

          // Lit night window probability
          if (rng.next() < 0.55) {
            uEmCtx.fillStyle = rng.next() < 0.5 ? '#ffca72' : '#ffe1a6';
            uEmCtx.fillRect(dx + 2, dy + 2, dw - 4, dh * 0.55);
          }

          // Balcony concrete parapet lip + dark wrought-iron railing bars
          const railY = fy + floorH - 76;
          uCtx.fillStyle = '#e3dcd0';
          uCtx.fillRect(nx - 4, fy + floorH - 22, nw + 8, 22);
          uCtx.fillStyle = 'rgba(30,28,26,0.22)';
          uCtx.fillRect(nx - 4, fy + floorH - 22, nw + 8, 4);

          // Iron railing top bar + vertical balusters
          uCtx.fillStyle = '#2d333b';
          uCtx.fillRect(nx - 2, railY, nw + 4, 5);
          uCtx.fillRect(nx - 2, railY + 48, nw + 4, 4);
          for (let px = nx + 4; px < nx + nw - 2; px += 11) {
            uCtx.fillRect(px, railY, 3, 52);
          }

          // Occasional white AC condenser unit on balcony corner
          if (rng.next() < 0.45) {
            uCtx.fillStyle = '#e5e7eb';
            uCtx.fillRect(nx + 4, railY + 14, 28, 22);
            uCtx.fillStyle = '#475569';
            uCtx.beginPath();
            uCtx.arc(nx + 15, railY + 25, 7, 0, Math.PI * 2);
            uCtx.fill();
          }
        } else {
          // Classic Istanbul double-casement apartment window with sill & shutters/trim
          const wx = bx + 22;
          const wy = fy + 50;
          const ww = bayW - 44;
          const wh = floorH - 108;

          // Subtle shadow around recess
          uCtx.fillStyle = 'rgba(35,30,25,0.2)';
          uCtx.fillRect(wx - 6, wy - 6, ww + 12, wh + 14);

          // Crisp white PVC window casing
          uCtx.fillStyle = '#f6f3ee';
          uCtx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

          // Reflective daytime sky glass gradient
          const wGrad = uCtx.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
          wGrad.addColorStop(0, '#5a82a8');
          wGrad.addColorStop(0.35, '#9ec3e0');
          wGrad.addColorStop(0.55, '#597a99');
          wGrad.addColorStop(1, '#31485e');
          uCtx.fillStyle = wGrad;
          uCtx.fillRect(wx, wy, ww, wh);

          // Diagonal sun reflection streak on glass
          uCtx.fillStyle = 'rgba(255,255,255,0.22)';
          uCtx.beginPath();
          uCtx.moveTo(wx + 6, wy);
          uCtx.lineTo(wx + 24, wy);
          uCtx.lineTo(wx + 8, wy + wh * 0.65);
          uCtx.lineTo(wx, wy + wh * 0.5);
          uCtx.closePath();
          uCtx.fill();

          // Soft cream interior blinds/curtain edge
          if (rng.next() < 0.65) {
            uCtx.fillStyle = 'rgba(247,238,220,0.38)';
            uCtx.fillRect(wx, wy, ww, wh * (0.2 + rng.next() * 0.22));
          }

          // Window mullions (vertical + top transom bar)
          uCtx.fillStyle = '#f5f2eb';
          uCtx.fillRect(wx + ww * 0.48, wy, 4, wh);
          uCtx.fillRect(wx, wy + wh * 0.26, ww, 3);

          // Stone window sill below
          uCtx.fillStyle = '#dcd4c6';
          uCtx.fillRect(wx - 8, wy + wh + 3, ww + 16, 9);
          uCtx.fillStyle = 'rgba(30,25,20,0.25)';
          uCtx.fillRect(wx - 8, wy + wh + 12, ww + 16, 4);

          if (rng.next() < 0.5) {
            uEmCtx.fillStyle = rng.next() < 0.5 ? '#ffd078' : '#ffba52';
            uEmCtx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          }
        }
      }
    }
  }

  // 2. Ground-Floor Shopfront + Roof Atlas (512x512, ClampToEdge on V)
  // Remember CanvasTexture flipY = true:
  //   v = 0.00..0.68 -> canvas y = 512..164 (BOTTOM 68% = street-level Istanbul shopfronts & entrances!)
  //   v = 0.72..1.00 -> canvas y = 144..0   (TOP 28% = terracotta/concrete roof tiles & parapet cap!)
  const grCanvas = document.createElement('canvas');
  grCanvas.width = 512;
  grCanvas.height = 512;
  const gCtx = grCanvas.getContext('2d');

  const grEmCanvas = document.createElement('canvas');
  grEmCanvas.width = 512;
  grEmCanvas.height = 512;
  const gEmCtx = grEmCanvas.getContext('2d');

  if (gCtx && gEmCtx) {
    const rng = createRng(34221);
    gCtx.fillStyle = '#dfd6c8';
    gCtx.fillRect(0, 0, 512, 512);
    gEmCtx.fillStyle = '#000000';
    gEmCtx.fillRect(0, 0, 512, 512);

    // --- TOP BAND (y = 0..148 -> v = 0.71..1.0): Roof tiles / terrace texture ---
    gCtx.fillStyle = '#c8c0b4';
    gCtx.fillRect(0, 0, 512, 148);
    for (let y = 0; y < 148; y += 14) {
      gCtx.fillStyle = y % 28 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(50,35,28,0.14)';
      gCtx.fillRect(0, y, 512, 7);
      for (let x = 0; x < 512; x += 20) {
        gCtx.fillStyle = 'rgba(30,22,18,0.1)';
        gCtx.fillRect(x, y, 2, 14);
      }
    }
    // Roof weathering speckles
    for (let i = 0; i < 600; i += 1) {
      gCtx.fillStyle = rng.next() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(40,30,20,0.08)';
      gCtx.fillRect(rng.next() * 512, rng.next() * 144, 4, 4);
    }

    // --- BOTTOM BAND (y = 160..512 -> v = 0.0..0.69): Street-level shops + awnings + plinth ---
    const shopTop = 164;
    const shopH = 512 - shopTop; // 348 px
    gCtx.fillStyle = '#e7dfd2';
    gCtx.fillRect(0, shopTop, 512, shopH);

    // Upper ground-floor fascia cornice
    gCtx.fillStyle = '#cfc6b8';
    gCtx.fillRect(0, shopTop, 512, 18);
    gCtx.fillStyle = 'rgba(30,26,22,0.22)';
    gCtx.fillRect(0, shopTop + 18, 512, 8);

    // Cut-stone street plinth at very bottom (y = 458..512)
    gCtx.fillStyle = '#8e8a83';
    gCtx.fillRect(0, 458, 512, 54);
    gCtx.fillStyle = '#a39e95';
    for (let x = 0; x < 512; x += 32) {
      gCtx.fillRect(x + 2, 462, 28, 22);
      gCtx.fillRect(((x + 16) % 512) + 2, 488, 28, 20);
    }

    const awningColors = [
      ['#9b2c2c', '#f5ede0'], // Classic Istanbul burgundy & cream awning
      ['#1e5641', '#f3efe6'], // Neighborhood bakkal emerald & cream
      ['#264873', '#f2efe9'], // Tea house / pastry navy & cream
      ['#b05a28', '#f7efe2'], // Bakery terracotta & cream
    ];

    // 3 wide shopfront bays + 1 residential apartment entrance door
    const bayWidth = 128;
    for (let b = 0; b < 4; b += 1) {
      const bx = b * bayWidth;

      // Stone pilaster between bays
      gCtx.fillStyle = '#cfc7ba';
      gCtx.fillRect(bx, shopTop + 18, 10, 280);
      gCtx.fillRect(bx + bayWidth - 10, shopTop + 18, 10, 280);

      if (b === 2) {
        // Residential apartment entry doorway with intercom & warm lobby glass
        const dx = bx + 24;
        const dy = shopTop + 62;
        const dw = bayWidth - 48;
        const dh = 232;
        gCtx.fillStyle = '#4a3a2f';
        gCtx.fillRect(dx - 6, dy - 6, dw + 12, dh + 6);
        gCtx.fillStyle = '#2c2520';
        gCtx.fillRect(dx, dy, dw, dh);
        // Glass panels in apartment door
        const doorGrad = gCtx.createLinearGradient(dx, dy, dx, dy + dh * 0.65);
        doorGrad.addColorStop(0, '#c29b68');
        doorGrad.addColorStop(1, '#5c4b3a');
        gCtx.fillStyle = doorGrad;
        gCtx.fillRect(dx + 10, dy + 14, dw * 0.36, dh * 0.56);
        gCtx.fillRect(dx + dw * 0.54, dy + 14, dw * 0.36, dh * 0.56);
        // Brass intercom & door handle
        gCtx.fillStyle = '#e5c16c';
        gCtx.fillRect(dx + dw * 0.45, dy + dh * 0.52, 5, 18);
        gCtx.fillRect(bx + bayWidth - 20, dy + dh * 0.45, 8, 18);

        gEmCtx.fillStyle = '#ffcf7d';
        gEmCtx.fillRect(dx + 12, dy + 16, dw * 0.32, dh * 0.5);
        gEmCtx.fillRect(dx + dw * 0.56, dy + 16, dw * 0.32, dh * 0.5);
      } else {
        // Neighborhood storefront (display glass + dark sign band + striped Turkish awning)
        const sx = bx + 12;
        const sw = bayWidth - 24;
        const signY = shopTop + 34;

        // Clean blank fascia signboard (fictional, zero real logos!)
        const [cMain, cStripe] = awningColors[b % awningColors.length]!;
        gCtx.fillStyle = cMain;
        gCtx.fillRect(sx, signY, sw, 30);
        gCtx.fillStyle = 'rgba(255,255,255,0.22)';
        gCtx.fillRect(sx + 8, signY + 10, sw - 16, 5);
        gCtx.fillRect(sx + 18, signY + 19, sw - 36, 4);

        // Striped sloped shop awning
        const awnY = signY + 32;
        const awnH = 38;
        const stripeW = 13;
        for (let ax = sx; ax < sx + sw; ax += stripeW) {
          const isMain = Math.floor((ax - sx) / stripeW) % 2 === 0;
          gCtx.fillStyle = isMain ? cMain : cStripe;
          gCtx.fillRect(ax, awnY, Math.min(stripeW, sx + sw - ax), awnH);
        }
        // Awning shadow cast onto shop window
        gCtx.fillStyle = 'rgba(15,15,20,0.34)';
        gCtx.fillRect(sx, awnY + awnH, sw, 14);

        // Large storefront display window
        const winY = awnY + awnH + 4;
        const winH = 180;
        gCtx.fillStyle = '#2f3844';
        gCtx.fillRect(sx - 2, winY, sw + 4, winH);
        const shopGlass = gCtx.createLinearGradient(sx, winY, sx, winY + winH);
        shopGlass.addColorStop(0, '#5a6c7d');
        shopGlass.addColorStop(0.28, '#95aec4');
        shopGlass.addColorStop(0.65, '#685947'); // warm interior display glow
        shopGlass.addColorStop(1, '#3d342a');
        gCtx.fillStyle = shopGlass;
        gCtx.fillRect(sx + 3, winY + 3, sw - 6, winH - 6);

        // Interior display shelves silhouette
        gCtx.fillStyle = 'rgba(255,230,180,0.22)';
        gCtx.fillRect(sx + 8, winY + winH * 0.45, sw - 16, 8);
        gCtx.fillRect(sx + 8, winY + winH * 0.72, sw - 16, 10);

        // Diagonal shop glass reflection
        gCtx.fillStyle = 'rgba(255,255,255,0.2)';
        gCtx.beginPath();
        gCtx.moveTo(sx + 10, winY + 3);
        gCtx.lineTo(sx + 34, winY + 3);
        gCtx.lineTo(sx + 14, winY + winH - 3);
        gCtx.lineTo(sx + 3, winY + winH - 3);
        gCtx.closePath();
        gCtx.fill();

        // Warm night storefront glow
        gEmCtx.fillStyle = '#ffcb74';
        gEmCtx.fillRect(sx + 5, winY + 12, sw - 10, winH - 22);
      }
    }
  }

  return {
    upperMap: configureTexture(
      new THREE.CanvasTexture(upperCanvas),
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      anisotropy,
    ),
    upperEmissiveMap: configureTexture(
      new THREE.CanvasTexture(upperEmCanvas),
      THREE.RepeatWrapping,
      THREE.RepeatWrapping,
      anisotropy,
    ),
    groundRoofMap: configureTexture(
      new THREE.CanvasTexture(grCanvas),
      THREE.RepeatWrapping,
      THREE.ClampToEdgeWrapping,
      anisotropy,
    ),
    groundRoofEmissiveMap: configureTexture(
      new THREE.CanvasTexture(grEmCanvas),
      THREE.RepeatWrapping,
      THREE.ClampToEdgeWrapping,
      anisotropy,
    ),
  };
}

/**
 * High-resolution procedural Istanbul asphalt road texture with:
 * - Raised light-grey concrete sidewalk curbs along both edges (u = 0..0.09 & 0.91..1.0)
 * - Subtle yellow/white gutter lines
 * - Textured dark asphalt micro-aggregate & dual lane tire tracks
 * - Crisp dashed white centerline along u = 0.5
 */
export function createAsphaltRoadTexture(anisotropy = 8): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const rng = createRng(34555);
    // Asphalt base (bright enough to multiply cleanly with roadClass vertex colors!)
    ctx.fillStyle = '#b4b9c2';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle darker twin tire wear tracks in left & right lanes
    ctx.fillStyle = 'rgba(30,35,44,0.16)';
    ctx.fillRect(102, 0, 44, 512);
    ctx.fillRect(172, 0, 44, 512);
    ctx.fillRect(296, 0, 44, 512);
    ctx.fillRect(366, 0, 44, 512);

    // Asphalt mineral aggregate noise
    for (let i = 0; i < 6500; i += 1) {
      const x = 44 + rng.next() * 424;
      const y = rng.next() * 512;
      const bright = rng.next() > 0.48;
      ctx.fillStyle = bright ? 'rgba(255,255,255,0.12)' : 'rgba(15,18,24,0.18)';
      ctx.fillRect(x, y, 2 + rng.next() * 2, 2 + rng.next() * 3);
    }

    // Subtle gutter shading next to curbs
    const leftGutter = ctx.createLinearGradient(44, 0, 68, 0);
    leftGutter.addColorStop(0, 'rgba(10,12,18,0.42)');
    leftGutter.addColorStop(1, 'rgba(10,12,18,0)');
    ctx.fillStyle = leftGutter;
    ctx.fillRect(44, 0, 24, 512);

    const rightGutter = ctx.createLinearGradient(468, 0, 444, 0);
    rightGutter.addColorStop(0, 'rgba(10,12,18,0.42)');
    rightGutter.addColorStop(1, 'rgba(10,12,18,0)');
    ctx.fillStyle = rightGutter;
    ctx.fillRect(444, 0, 24, 512);

    // Light concrete sidewalk curb stones on left & right edges (u = 0..0.086 and 0.914..1.0)
    ctx.fillStyle = '#ece9e2';
    ctx.fillRect(0, 0, 44, 512);
    ctx.fillRect(468, 0, 44, 512);

    // Curb stone vertical highlight + joint seams every 64 px
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(39, 0, 4, 512);
    ctx.fillRect(469, 0, 4, 512);
    ctx.fillStyle = 'rgba(40,40,42,0.28)';
    for (let y = 0; y < 512; y += 64) {
      ctx.fillRect(0, y, 44, 3);
      ctx.fillRect(468, y, 44, 3);
    }

    // Subtle outer road edge lines (warm ivory)
    ctx.fillStyle = 'rgba(248,245,235,0.68)';
    ctx.fillRect(58, 0, 5, 512);
    ctx.fillRect(449, 0, 5, 512);

    // Crisp dashed white center lane divider (2 dashes per 512px = ~7.5m repeat)
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(251, 24, 10, 148);
    ctx.fillRect(251, 280, 10, 148);
  }

  return configureTexture(
    new THREE.CanvasTexture(canvas),
    THREE.ClampToEdgeWrapping,
    THREE.RepeatWrapping,
    anisotropy,
  );
}

/**
 * Subtle urban Istanbul concrete sidewalk / cobblestone paving texture for the DEM terrain.
 */
export function createUrbanGroundTexture(anisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rng = createRng(34777);
    ctx.fillStyle = '#dcd9d0';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle paving tile grid
    ctx.strokeStyle = 'rgba(70,68,64,0.12)';
    ctx.lineWidth = 2;
    for (let p = 0; p < 512; p += 32) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }

    // Organic stone & soil grain
    for (let i = 0; i < 4200; i += 1) {
      const x = rng.next() * 512;
      const y = rng.next() * 512;
      ctx.fillStyle = rng.next() > 0.5 ? 'rgba(255,255,255,0.09)' : 'rgba(55,52,46,0.1)';
      ctx.fillRect(x, y, 3, 3);
    }
  }
  const tex = configureTexture(
    new THREE.CanvasTexture(canvas),
    THREE.RepeatWrapping,
    THREE.RepeatWrapping,
    anisotropy,
  );
  tex.repeat.set(90, 90);
  return tex;
}

/**
 * Dappled Mediterranean park grass / plaza texture.
 */
export function createParkGrassTexture(anisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rng = createRng(34888);
    ctx.fillStyle = '#dce8d5';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i += 1) {
      ctx.fillStyle = rng.next() > 0.45 ? 'rgba(65,115,52,0.16)' : 'rgba(220,245,190,0.14)';
      ctx.fillRect(rng.next() * 256, rng.next() * 256, 3 + rng.next() * 4, 3 + rng.next() * 4);
    }
  }
  return configureTexture(
    new THREE.CanvasTexture(canvas),
    THREE.RepeatWrapping,
    THREE.RepeatWrapping,
    anisotropy,
  );
}

/**
 * Equirectangular procedural Mediterranean Sky Dome texture with sun/moon & soft clouds.
 */
export function createSkyDomeTexture(mode: TimeOfDay): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    if (mode === 'day') {
      grad.addColorStop(0.0, '#1e5ea8');
      grad.addColorStop(0.24, '#478fd4');
      grad.addColorStop(0.44, '#88c1ea');
      grad.addColorStop(0.51, '#cde3f2');
      grad.addColorStop(0.57, '#ece6d8');
      grad.addColorStop(1.0, '#b5b0a6');
    } else {
      grad.addColorStop(0.0, '#040916');
      grad.addColorStop(0.32, '#0b1834');
      grad.addColorStop(0.47, '#1a2b4f');
      grad.addColorStop(0.53, '#2d3752');
      grad.addColorStop(1.0, '#121826');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    const rng = createRng(mode === 'day' ? 34901 : 34902);
    if (mode === 'day') {
      // Warm afternoon Mediterranean sun halo
      const sunX = 280;
      const sunY = 178;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 120);
      sunGrad.addColorStop(0, 'rgba(255,253,240,1)');
      sunGrad.addColorStop(0.15, 'rgba(255,245,210,0.85)');
      sunGrad.addColorStop(0.45, 'rgba(255,232,185,0.28)');
      sunGrad.addColorStop(1, 'rgba(255,232,185,0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(sunX - 130, sunY - 130, 260, 260);

      // Soft wispy high cumulus clouds across upper hemisphere
      for (let i = 0; i < 42; i += 1) {
        const cx = rng.next() * 1024;
        const cy = 95 + rng.next() * 130;
        const rx = 28 + rng.next() * 75;
        const ry = 8 + rng.next() * 18;
        const cGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
        cGrad.addColorStop(0, 'rgba(255,255,255,0.52)');
        cGrad.addColorStop(0.55, 'rgba(248,251,255,0.24)');
        cGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      // Twinkling stars in upper dome
      for (let i = 0; i < 240; i += 1) {
        const sx = rng.next() * 1024;
        const sy = 10 + rng.next() * 215;
        const a = 0.3 + rng.next() * 0.7;
        const sz = rng.next() > 0.85 ? 2.2 : 1.3;
        ctx.fillStyle = `rgba(235,244,255,${a})`;
        ctx.fillRect(sx, sy, sz, sz);
      }
      // Subtle moon glow
      const mx = 720;
      const my = 150;
      const mGrad = ctx.createRadialGradient(mx, my, 4, mx, my, 65);
      mGrad.addColorStop(0, 'rgba(245,248,255,0.95)');
      mGrad.addColorStop(0.22, 'rgba(205,220,255,0.45)');
      mGrad.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = mGrad;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Iconic Istanbul Sarı Taksi side panel texture with black-and-yellow checkered stripe & door seams.
 */
export function createTaxiSideTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Rich metallic taxi yellow body
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffd026');
    grad.addColorStop(0.45, '#f6b800');
    grad.addColorStop(0.85, '#dc9d00');
    grad.addColorStop(1, '#262a33'); // lower rocker trim
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 128);

    // Classic Istanbul checkered taxi belt stripe along middle of doors
    const stripeY = 48;
    const sq = 12;
    for (let x = 24; x < 488; x += sq) {
      const idx = Math.floor((x - 24) / sq);
      ctx.fillStyle = idx % 2 === 0 ? '#151821' : '#ffe266';
      ctx.fillRect(x, stripeY, sq, 10);
      ctx.fillStyle = idx % 2 === 1 ? '#151821' : '#ffe266';
      ctx.fillRect(x, stripeY + 10, sq, 10);
    }

    // Crisp door seam lines & dark door handles
    ctx.fillStyle = 'rgba(20,18,12,0.45)';
    ctx.fillRect(145, 6, 3, 106);
    ctx.fillRect(262, 6, 3, 106);
    ctx.fillRect(378, 6, 3, 106);

    ctx.fillStyle = '#1f2430';
    ctx.fillRect(222, 30, 26, 8);
    ctx.fillRect(334, 30, 26, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Illuminated roof "TAKSİ" light box texture (fictional, zero real brands).
 */
export function createTaxiSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff5bd';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 56);
    ctx.fillStyle = '#111827';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAKSİ', 128, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Fictional Istanbul license plate ("34 T 0421").
 */
export function createPlateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 192, 48);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, 26, 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TR', 13, 34);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 188, 44);
    ctx.fillStyle = '#111827';
    ctx.font = '800 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('34 T 0421', 108, 25);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft grounded contact shadow blob texture so avatar & vehicles always feel planted on asphalt.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(8, 10, 16, 0.62)');
    grad.addColorStop(0.55, 'rgba(8, 10, 16, 0.28)');
    grad.addColorStop(1, 'rgba(8, 10, 16, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
