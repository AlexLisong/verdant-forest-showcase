import * as THREE from 'three';

// Bark attachment is the local origin; +Z points out of the bark and +Y up.
// All vertex colors are linear RGB. Three closed, seedable shelf habits use
// genuinely curved shells, modeled ribs and recessed underside pores.
const PI = Math.PI;
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const tone = (a, t) => a.map(x => x * t);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function seeded(seed) {
  let h = 2166136261;
  for (const c of String(seed ?? 0)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const habit = typeof seed === 'number' && Number.isFinite(seed)
    ? ((Math.floor(seed) % 3) + 3) % 3 : (h >>> 0) % 3;
  return { habit, rng: () => {
    h += 0x6d2b79f5;
    let n = Math.imul(h ^ h >>> 15, 1 | h);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  } };
}

export function createBracketFungus(seed = 0) {
  const { rng, habit } = seeded(seed);
  const positions = [], colors = [], uv = [], index = [], caps = [];
  const ochre = [[0.171, 0.082, 0.026], [0.207, 0.122, 0.043], [0.133, 0.071, 0.035]][habit];
  const band = [[0.305, 0.194, 0.082], [0.348, 0.247, 0.116], [0.270, 0.185, 0.104]][habit];
  const cream = [0.510, 0.432, 0.294], pores = [0.285, 0.245, 0.170];
  const add = (p, c, u = 0, v = 0) => {
    const i = positions.length / 3;
    positions.push(...p); colors.push(...c); uv.push(u, v); return i;
  };
  const tri = (a, b, c) => index.push(a, b, c);
  const point = i => positions.slice(i * 3, i * 3 + 3);
  const capCount = habit === 1 ? 3 : 2;
  const widths = [0.153 + rng() * 0.027, 0.080 + rng() * 0.027, 0.065 + rng() * 0.014];
  const roots = [[0, 0, 0], [habit === 2 ? -0.024 : 0.022, 0.033 + rng() * 0.010, 0],
    [-0.025, -0.026 - rng() * 0.008, 0]];

  for (let cap = 0; cap < capCount; cap++) {
    const vertexStart = positions.length / 3, triangleStart = index.length / 3;
    const width = widths[cap], reach = width * (0.51 + rng() * 0.105);
    const root = roots[cap], phase = rng() * PI * 2, tilt = (rng() - 0.5) * 0.10;
    const skew = (habit === 2 ? 0.15 : 0.025) * (cap % 2 ? -1 : 1);
    const thickness = cap === 0 ? 0.0042 + rng() * 0.0016 : 0.0030 + rng() * 0.0009;
    const arch = width * (0.044 + rng() * 0.016), R = 7, A = 24;
    const rings = [[], []];
    const radialShade = (r, a) => {
      const growth = 0.5 + Math.sin(r * 30 + Math.sin(a * 3 + phase) * 0.24 + phase) * 0.5;
      let color = mix(ochre, band, 0.14 + growth * 0.58);
      const wear = (0.5 + 0.5 * Math.sin(a * 4.7 + phase)) * 0.12;
      color = mix(color, cream, clamp((r - 0.89) / 0.11) * (0.73 + wear));
      return tone(color, 0.94 + Math.sin(a * 8.3 + phase) * 0.037);
    };
    // Sides share the rim and attachment closure. Separate top and underside
    // rings give the shelf real thickness and keep its pale margin continuous.
    for (let side = 0; side < 2; side++) {
      rings[side].push([add([root[0], root[1] + (side ? -0.5 : 0.5) * thickness, 0],
        side ? cream : radialShade(0, 0), 0.5, 0)]);
      for (let j = 1; j <= R; j++) {
        const r = j / R, ring = [];
        for (let k = 0; k <= A; k++) {
          const a = (k / A - 0.5) * PI, forward = Math.max(0, Math.cos(a));
          const ripples = 1 + r * (Math.sin(a * 7.1 + phase) * 0.026
            + Math.sin(a * 13.3 - phase) * 0.014);
          const x = width * 0.81 * Math.sin(a) * (0.4 + 0.6 * forward) * r * ripples
            + reach * skew * r * Math.pow(forward, 0.8);
          const z = reach * Math.pow(forward, 0.88) * r * ripples;
          // Radial ribs bend gently as they run toward the scalloped edge.
          const rib = Math.sin(a * 13 + r * 2.4 + phase) * width * 0.0045
            * Math.pow(r, 0.55) * (1 - r * 0.30);
          const dish = arch * Math.sin(r * PI * 0.94) * (0.72 + forward * 0.28);
          const edgeWave = Math.pow(r, 4) * width * (0.0075 * Math.sin(a * 5 + phase)
            + 0.0035 * Math.sin(a * 11.7 + phase));
          const half = thickness * (0.50 - r * 0.35);
          const y = root[1] + dish + edgeWave + tilt * x + (side ? -half - rib * 0.15 : half + rib);
          ring.push(add([root[0] + x, y, z], side ? tone(cream, 0.94 + 0.025 * Math.sin(a * 8 + r * 17))
            : radialShade(r, a), 0.5 + x / width, z / reach));
        }
        rings[side].push(ring);
      }
    }
    let poreCount = 0;
    const bottomFace = (a, b, c, addPore) => {
      if (!addPore) { tri(a, b, c); return; }
      // Replace a bottom triangle by an inset triangular pit with a recessed
      // centre. Its boundary is unchanged; there are no floating pore decals.
      const p = [point(a), point(b), point(c)];
      const center = [0, 1, 2].map(k => (p[0][k] + p[1][k] + p[2][k]) / 3);
      const maxRadius = width * 0.006;
      const ring = p.map(q => {
        const d = Math.hypot(q[0] - center[0], q[2] - center[2]);
        const t = Math.min(0.24, maxRadius / d);
        return add(q.map((x, k) => center[k] + (x - center[k]) * t), tone(cream, 0.94));
      });
      const pit = add([center[0], center[1] + width * 0.0022, center[2]], pores);
      const outer = [a, b, c];
      for (let k = 0; k < 3; k++) {
        const n = (k + 1) % 3;
        tri(outer[k], outer[n], ring[k]); tri(outer[n], ring[n], ring[k]);
        tri(ring[k], ring[n], pit);
      }
      poreCount++;
    };
    for (let side = 0; side < 2; side++) {
      const row = rings[side];
      for (let k = 0; k < A; k++) {
        if (side) tri(row[0][0], row[1][k + 1], row[1][k]);
        else tri(row[0][0], row[1][k], row[1][k + 1]);
      }
      for (let j = 1; j < R; j++) for (let k = 0; k < A; k++) {
        const a = row[j][k], b = row[j + 1][k], c = row[j][k + 1], d = row[j + 1][k + 1];
        if (side) {
          bottomFace(a, c, b, j >= 2 && j <= 5 && k % 3 === (j + cap) % 3);
          bottomFace(c, d, b, false);
        } else { tri(a, b, c); tri(c, b, d); }
      }
    }
    // Round the pale perimeter with connected top-to-bottom faces.
    for (let k = 0; k < A; k++) {
      const a = rings[0][R][k], b = rings[0][R][k + 1], c = rings[1][R][k], d = rings[1][R][k + 1];
      tri(a, c, b); tri(b, c, d);
    }
    // The back of each shelf closes against the bark plane. The primary back
    // face includes the exact origin, which is the parent's attachment anchor.
    const anchor = add(root, mix(ochre, cream, 0.22));
    for (const edge of [0, A]) for (let j = 0; j < R; j++) {
      const a = rings[0][j][j === 0 ? 0 : edge], b = rings[0][j + 1][edge];
      const c = rings[1][j][j === 0 ? 0 : edge], d = rings[1][j + 1][edge];
      const face = (x, y, z) => edge === 0 ? tri(x, z, y) : tri(x, y, z);
      if (j === 0) { face(a, b, anchor); face(anchor, b, c); }
      else face(a, b, c);
      face(b, d, c);
    }
    const xs = positions.slice(vertexStart * 3).filter((_, i) => i % 3 === 0);
    caps.push({ vertexStart, vertexCount: positions.length / 3 - vertexStart, triangleStart,
      triangles: index.length / 3 - triangleStart, span: Math.max(...xs) - Math.min(...xs),
      reach, root: [...root], pores: poreCount });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = { botanicalType: 'bracket-fungus', seed: String(seed), variant: habit,
    variantName: ['ochre-fan-pair', 'layered-cream-shelves', 'russet-asymmetric-pair'][habit],
    units: 'meters', attachment: [0, 0, 0], outwardAxis: '+Z', upAxis: '+Y',
    caps, triangles: index.length / 3, closedShells: true, vertexColorSpace: 'linear-srgb' };
  return geometry;
}
