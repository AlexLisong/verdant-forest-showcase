import * as THREE from 'three';

// Indexed, genuinely curved foliage meshes. Colors are linear RGB, ready for a
// white vertexColors material. Leaf surfaces need THREE.DoubleSide. Units: metres.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function randomFor(seed) {
  let h = 2166136261;
  const s = String(seed ?? 1);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let n = Math.imul(h ^ h >>> 15, 1 | h);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

const blend = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
const tone = (a, m) => a.map(c => c * m);
const GREEN = [0.055, 0.119, 0.035];
const FRESH = [0.135, 0.204, 0.060];
const STEM = [0.078, 0.087, 0.024];
const BARK = [0.086, 0.060, 0.037];

class MeshBuilder {
  constructor() { this.p = []; this.uv = []; this.c = []; this.i = []; }
  vertex(p, u, v, c) {
    const index = this.p.length / 3;
    this.p.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.c.push(...c);
    return index;
  }
  tri(a, b, c) { this.i.push(a, b, c); }
  finish(kind, seed, details, scale = 1) {
    // Flattening coordinates would create zero-area root faces. Translate the
    // complete finished asset so the lowest surface, not its centreline, is zero.
    let lowest = Infinity;
    for (let i = 1; i < this.p.length; i += 3) lowest = Math.min(lowest, this.p[i]);
    for (let i = 0; i < this.p.length; i += 3) {
      this.p[i] *= scale;
      this.p[i + 1] = (this.p[i + 1] - lowest) * scale;
      this.p[i + 2] *= scale;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geometry.setIndex(this.i);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData = { botanicalType: kind, seed: String(seed), ...details,
      triangles: this.i.length / 3, foliageIsDoubleSided: true, units: 'meters' };
    return geometry;
  }
}

function frame(tangent) {
  const t = tangent.clone().normalize();
  const reference = Math.abs(t.y) > 0.92 ? V(1, 0, 0) : UP;
  const a = new THREE.Vector3().crossVectors(reference, t).normalize();
  const b = new THREE.Vector3().crossVectors(t, a).normalize();
  return [a, b];
}

function tube(mesh, points, rootRadius, tipRadius, color, sides = 5, caps = true) {
  const rings = [];
  let previousA;
  for (let j = 0; j < points.length; j++) {
    const tangent = points[Math.min(j + 1, points.length - 1)].clone()
      .sub(points[Math.max(j - 1, 0)]).normalize();
    // Parallel transport prevents sudden frame flips on arching fern rachises.
    let a = previousA ? previousA.clone().addScaledVector(tangent, -previousA.dot(tangent)) : frame(tangent)[0];
    if (a.lengthSq() < 1e-10) a = frame(tangent)[0];
    a.normalize();
    const b = new THREE.Vector3().crossVectors(tangent, a).normalize();
    previousA = a;
    const t = j / (points.length - 1);
    const radius = rootRadius + (tipRadius - rootRadius) * t;
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const angle = k * TAU / sides;
      const point = points[j].clone().addScaledVector(a, Math.cos(angle) * radius)
        .addScaledVector(b, Math.sin(angle) * radius);
      ring.push(mesh.vertex(point, k / sides, t, tone(color, 0.91 + t * 0.14)));
    }
    rings.push(ring);
  }
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      mesh.tri(rings[j][k], rings[j][next], rings[j + 1][k]);
      mesh.tri(rings[j][next], rings[j + 1][next], rings[j + 1][k]);
    }
  }
  // Flat cap normals stay separate from the side normals.
  for (const end of (caps ? [0, rings.length - 1] : [])) {
    const center = mesh.vertex(points[end], 0.5, end ? 1 : 0, color);
    const cap = rings[end].map(index => mesh.vertex(
      V(mesh.p[index * 3], mesh.p[index * 3 + 1], mesh.p[index * 3 + 2]), 0, 0, color));
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      if (end === 0) mesh.tri(center, cap[next], cap[k]);
      else mesh.tri(center, cap[k], cap[next]);
    }
  }
}

function sampleCurve(fn, segments) {
  return Array.from({ length: segments + 1 }, (_, j) => fn(j / segments));
}

// The low-detail lamina retains a physical central fold with just two faces.
// Its four corners are intentionally non-coplanar: this is not a foliage card.
function foldedLeaf(mesh, base, direction, length, width, color, options = {}) {
  const { curl = 0.15, twist = 0, ridge = 0.08 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  if (normal.y < 0) { normal.negate(); side.negate(); }
  side.applyAxisAngle(axis, twist * 0.5);
  const middle = base.clone().addScaledVector(axis, length * 0.5)
    .addScaledVector(normal, length * curl * 0.156 - width * (0.12 + ridge));
  const tip = base.clone().addScaledVector(axis, length)
    .addScaledVector(normal, length * curl * Math.sin(Math.PI * 0.9));
  const a = mesh.vertex(base, 0.5, 0, color);
  const l = mesh.vertex(middle.clone().addScaledVector(side, -width * 0.5), 0, 0.5, tone(color, 0.96));
  const t = mesh.vertex(tip, 0.5, 1, blend(color, FRESH, 0.12));
  const r = mesh.vertex(middle.clone().addScaledVector(side, width * 0.5), 1, 0.5, tone(color, 0.98));
  mesh.tri(a, l, t);
  mesh.tri(a, t, r);
}

// A tapered lamina with a raised midrib, drooping edges and twisted tip. Every
// interior cross-section has left/middle/right vertices, rather than a flat card.
function lanceLeaf(mesh, base, direction, length, width, color, options = {}) {
  const { sections = 5, curl = 0.15, twist = 0.0, serration = 0.0, ridge = 0.08 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  if (normal.y < 0) { normal.negate(); side.negate(); }
  const rows = [];
  for (let j = 0; j <= sections; j++) {
    const t = j / sections;
    const center = base.clone().addScaledVector(axis, length * t)
      .addScaledVector(normal, length * curl * Math.sin(t * Math.PI * 0.9));
    const w = width * 0.5 * Math.pow(Math.sin(t * Math.PI), 0.77)
      * (1 + serration * (j % 2 ? 1 : -1));
    const leafColor = blend(color, tone(FRESH, 0.87), t * 0.16);
    if (j === 0 || j === sections) {
      rows.push([mesh.vertex(center, 0.5, t, leafColor)]);
      continue;
    }
    const sideAt = side.clone().applyAxisAngle(axis, twist * t);
    rows.push([-1, 0, 1].map(s => mesh.vertex(
      center.clone().addScaledVector(sideAt, s * w)
        .addScaledVector(normal, s === 0 ? w * ridge : -w * 0.075),
      (s + 1) / 2, t, tone(leafColor, s === 0 ? 1.065 : 0.96))));
  }
  // Ordered so front-face normals point toward the lamina's upper side.
  mesh.tri(rows[0][0], rows[1][0], rows[1][1]);
  mesh.tri(rows[0][0], rows[1][1], rows[1][2]);
  for (let j = 1; j < sections - 1; j++) {
    for (let k = 0; k < 2; k++) {
      mesh.tri(rows[j][k], rows[j + 1][k], rows[j][k + 1]);
      mesh.tri(rows[j][k + 1], rows[j + 1][k], rows[j + 1][k + 1]);
    }
  }
  const last = rows[sections - 1], tip = rows[sections][0];
  mesh.tri(last[0], tip, last[1]);
  mesh.tri(last[1], tip, last[2]);
}

export function createFernGeometry(seed, scale = 1, detail = 'high') {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const low = detail === 'low';
  const leaf = low ? foldedLeaf : lanceLeaf;
  const count = 8 + Math.floor(rng() * 3);
  const height = 0.82 + rng() * 0.30;
  const azimuth = rng() * TAU;
  let leafletCount = 0;
  for (let f = 0; f < count; f++) {
    const angle = azimuth + f * TAU / count + (rng() - 0.5) * 0.32;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const lateral = V(-Math.sin(angle), 0, Math.cos(angle));
    const h = height * (f === 0 ? 1 : 0.68 + rng() * 0.32);
    const reach = 0.62 + rng() * 0.32 + (1 - h / height) * 0.24;
    const sway = (rng() - 0.5) * 0.17;
    const curve = t => radial.clone().multiplyScalar(0.018 + reach * Math.pow(t, 1.65))
      .addScaledVector(lateral, sway * t * t)
      .add(V(0, h * Math.sin(t * Math.PI * 0.75), 0));
    tube(mesh, sampleCurve(curve, low ? 10 : 19), 0.008, 0.0008, blend(STEM, GREEN, 0.45), low ? 4 : 5);
    const pairs = 15 + Math.floor(rng() * 4);
    for (let p = 0; p < pairs; p++) {
      const t = 0.14 + p / (pairs - 1) * 0.82;
      const envelope = Math.pow(Math.sin(Math.PI * ((t - 0.05) / 0.95)), 0.84);
      const length = (0.22 + rng() * 0.055) * Math.max(0.08, envelope) * (1 - t * 0.24);
      for (const sign of [-1, 1]) {
        const at = clamp(t + (sign === 1 ? 0.006 : -0.006), 0, 1);
        const origin = curve(at);
        // Pinnae sweep toward the frond tip and remain joined to the rachis.
        const direction = lateral.clone().multiplyScalar(sign)
          .addScaledVector(radial, 0.26 + t * 0.31)
          .add(V(0, 0.14 - t * 0.28 + (rng() - 0.5) * 0.16, 0));
        leaf(mesh, origin, direction, length * (0.92 + rng() * 0.16),
          length * (0.22 + rng() * 0.065), tone(GREEN, 0.89 + rng() * 0.37),
          { sections: 4, curl: 0.045 + rng() * 0.13, twist: sign * (0.05 + rng() * 0.19),
            serration: 0.045, ridge: 0.14 });
        leafletCount++;
      }
    }
    leaf(mesh, curve(0.95), radial.clone().add(V(0, -0.3, 0)), 0.075, 0.018,
      tone(GREEN, 1.05), { sections: 4, curl: 0.2 });
    leafletCount++;
  }
  return mesh.finish('fern', seed, { detail: low ? 'low' : 'high', fronds: count, leaves: leafletCount },
    Number.isFinite(scale) && scale > 0 ? scale : 1);
}

export function createShrubGeometry(seed, options = {}) {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const low = options === 'low' || options?.detail === 'low';
  const leaf = low ? foldedLeaf : lanceLeaf;
  const stems = 5 + Math.floor(rng() * 2);
  const height = 1.18 + rng() * 0.43;
  const phase = rng() * TAU;
  let leaves = 0;
  for (let s = 0; s < stems; s++) {
    const angle = phase + s * TAU / stems + (rng() - 0.5) * 0.8;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const lateral = V(-Math.sin(angle), 0, Math.cos(angle));
    const bend = 0.25 + rng() * 0.34;
    const h = height * (0.67 + rng() * 0.33);
    const curve = t => radial.clone().multiplyScalar(0.055 + bend * t * t)
      .addScaledVector(lateral, Math.sin(t * Math.PI) * 0.07)
      .add(V(0, t * h, 0));
    tube(mesh, sampleCurve(curve, low ? 3 : 6), 0.014 + rng() * 0.006, 0.0022, BARK, low ? 3 : 5);
    const branches = 5 + Math.floor(rng() * 2);
    for (let b = 0; b < branches; b++) {
      const t = 0.12 + b / (branches - 1) * 0.79;
      const start = curve(t);
      const sign = b % 2 ? -1 : 1;
      const reach = (0.29 + rng() * 0.20) * (1.09 - t * 0.33);
      const branchDir = lateral.clone().multiplyScalar(sign * (0.7 + rng() * 0.35))
        .addScaledVector(radial, 0.48 + rng() * 0.42).normalize();
      const rise = 0.11 + rng() * 0.17;
      const twig = u => start.clone().addScaledVector(branchDir, reach * u)
        .add(V(0, rise * u + Math.sin(u * Math.PI) * 0.045, 0));
      tube(mesh, sampleCurve(twig, low ? 2 : 4), 0.0052 * (1 - t * 0.42), 0.0008, tone(BARK, 1.14), low ? 3 : 4);
      const leafCount = 8 + Math.floor(rng() * 2);
      for (let l = 0; l < leafCount; l++) {
        const u = 0.06 + l / (leafCount - 1) * 0.92;
        const attach = twig(u);
        const leafSide = l % 2 ? -1 : 1;
        const cross = V(-branchDir.z, 0, branchDir.x);
        const leafDirection = cross.multiplyScalar(leafSide * (0.65 + rng() * 0.4))
          .addScaledVector(branchDir, 0.42 + rng() * 0.35)
          .add(V(0, (rng() - 0.48) * 0.7, 0)).normalize();
        const petioleEnd = attach.clone().addScaledVector(leafDirection, 0.014);
        // Both ends join other surfaces; internal caps add no visible detail.
        if (!low) tube(mesh, [attach, petioleEnd], 0.0010, 0.00065, STEM, 3, false);
        const len = (0.16 + rng() * 0.095) * (1.07 - u * 0.16);
        leaf(mesh, low ? attach : petioleEnd, leafDirection, len + (low ? 0.014 : 0), len * (0.54 + rng() * 0.27),
          tone(GREEN, 0.82 + rng() * 0.56), { sections: 4, curl: 0.10 + rng() * 0.12,
            twist: (rng() - 0.5) * 0.65, serration: 0.035, ridge: 0.10 });
        leaves++;
      }
    }
    // A pair of unfolding terminal leaves keeps the main shoots botanical.
    for (let terminal = 0; terminal < 2; terminal++) {
      const direction = radial.clone().addScaledVector(lateral, terminal ? 0.55 : -0.55)
        .add(V(0, 0.40 + terminal * 0.15, 0));
      leaf(mesh, curve(0.98 + terminal * 0.02), direction,
        terminal ? 0.10 : 0.14, terminal ? 0.065 : 0.090, tone(GREEN, 1.20),
        { sections: 4, curl: 0.17, twist: 0.15, ridge: 0.11 });
      leaves++;
    }
  }
  return mesh.finish('shrub', seed, { detail: low ? 'low' : 'high', stems, leaves });
}

function sorrelLeaf(mesh, base, angle, size, lift, color) {
  const axis = V(Math.cos(angle), lift, Math.sin(angle)).normalize();
  const side = V(-Math.sin(angle), 0, Math.cos(angle));
  // Obcordate Oxalis silhouette: pointed attachment, paired rounded distal
  // lobes, and the characteristic notch at the outside edge.
  const outline = [[0, 0], [0.14, -0.23], [0.38, -0.45], [0.63, -0.53],
    [0.83, -0.48], [0.96, -0.30], [0.95, -0.14], [0.78, 0],
    [0.95, 0.14], [0.96, 0.30], [0.83, 0.48], [0.63, 0.53],
    [0.38, 0.45], [0.14, 0.23]];
  const point = (x, z) => base.clone().addScaledVector(axis, x * size)
    .addScaledVector(side, z * size)
    .add(V(0, size * (0.09 * Math.sin(x * Math.PI) - 0.18 * Math.abs(z)), 0));
  const center = mesh.vertex(point(0.48, 0), 0.5, 0.48, tone(color, 1.045));
  const edge = outline.map(([x, z]) => mesh.vertex(point(x, z), 0.5 + z / 1.06, x, color));
  for (let i = 0; i < edge.length; i++) mesh.tri(center, edge[(i + 1) % edge.length], edge[i]);
}

function flower(mesh, center, radius, rng) {
  const phase = rng() * TAU;
  for (let p = 0; p < 5; p++) {
    const angle = phase + p * TAU / 5;
    const direction = V(Math.cos(angle), 0.16, Math.sin(angle));
    const base = center.clone().addScaledVector(direction, radius * 0.12);
    lanceLeaf(mesh, base, direction, radius, radius * 0.66,
      [0.70, 0.72, 0.64], { sections: 3, curl: 0.05, ridge: 0.02 });
  }
  const c = mesh.vertex(center.clone().add(V(0, radius * 0.18, 0)), 0.5, 0.5, [0.49, 0.32, 0.035]);
  const ring = [];
  for (let p = 0; p < 8; p++) {
    const a = p * TAU / 8;
    ring.push(mesh.vertex(center.clone().add(V(Math.cos(a) * radius * 0.25,
      radius * 0.04, Math.sin(a) * radius * 0.25)), Math.cos(a) * 0.5 + 0.5,
      Math.sin(a) * 0.5 + 0.5, [0.52, 0.38, 0.043]));
  }
  for (let p = 0; p < 8; p++) mesh.tri(c, ring[(p + 1) % 8], ring[p]);
}

export function createHerbGeometry(seed, type = 'sorrel') {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const flowering = type === 'flower' || type === 'flowers' || type === 'flowering' || type === 'weed';
  const count = flowering ? 4 + Math.floor(rng() * 3) : 6 + Math.floor(rng() * 3);
  const phase = rng() * TAU;
  let leaves = 0;
  for (let i = 0; i < count; i++) {
    const angle = phase + i * TAU / count + (rng() - 0.5) * 0.45;
    const radius = 0.025 + rng() * (flowering ? 0.12 : 0.11);
    const root = V(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const height = flowering ? 0.19 + rng() * 0.20 : 0.065 + rng() * 0.11;
    const offset = V(Math.cos(angle) * height * 0.28, height, Math.sin(angle) * height * 0.28);
    const curve = t => root.clone().add(offset.clone().multiplyScalar(t))
      .add(V(Math.sin(angle + 0.8) * Math.sin(t * Math.PI) * 0.016, 0,
        Math.cos(angle + 0.8) * Math.sin(t * Math.PI) * 0.016));
    tube(mesh, sampleCurve(curve, 4), flowering ? 0.0018 : 0.0014, 0.0007, STEM, 4);
    if (flowering) {
      const pairs = 2;
      for (let j = 0; j < pairs; j++) {
        for (const sign of [-1, 1]) {
          const direction = V(Math.cos(angle + j * 1.3) * sign, 0.26,
            Math.sin(angle + j * 1.3) * sign);
          lanceLeaf(mesh, curve(0.24 + j * 0.31), direction, 0.05 + rng() * 0.035, 0.019,
            tone(GREEN, 0.95 + rng() * 0.25), { sections: 3, curl: 0.1, twist: sign * 0.13 });
          leaves++;
        }
      }
      flower(mesh, curve(1), 0.018 + rng() * 0.012, rng);
    } else {
      const top = curve(1);
      const size = 0.030 + rng() * 0.022;
      for (let l = 0; l < 3; l++) {
        sorrelLeaf(mesh, top, angle + l * TAU / 3, size * (0.94 + rng() * 0.12),
          (rng() - 0.5) * 0.22, tone(GREEN, 1.00 + rng() * 0.38));
        leaves++;
      }
    }
  }
  return mesh.finish(flowering ? 'flowering-herb' : 'sorrel', seed, { stems: count, leaves });
}

export function createGrassGeometry(seed, detail = 'high') {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const blades = 20 + Math.floor(rng() * 9);
  const phase = rng() * TAU;
  for (let b = 0; b < blades; b++) {
    const angle = phase + b * 2.3999632297 + (rng() - 0.5) * 0.6;
    const axis = V(Math.cos(angle), 0, Math.sin(angle));
    const side = V(-Math.sin(angle), 0, Math.cos(angle));
    const root = axis.clone().multiplyScalar(rng() * 0.060);
    const upright = b % 3 === 0;
    const height = 0.25 + rng() * 0.45;
    const width = 0.004 + Math.pow(rng(), 2) * (upright ? 0.014 : 0.020);
    const lean = upright ? 0.12 + rng() * 0.22 : 0.50 + rng() * 0.48;
    const twist = (rng() - 0.5) * 0.90;
    const shade = 0.84 + rng() * 0.23;
    const rows = [];
    const segments = detail==='low'?1:detail==='medium'?2:8;
    const folded = detail==='high';
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      const vertical = upright ? (t - 0.05 * t * t * t) / 0.95 : Math.sin(t * Math.PI * 0.66);
      const center = root.clone().addScaledVector(axis, height * lean * t * t)
        .add(V(0, height * vertical, 0));
      // Substantial root/low blade area survives distance rendering. The two
      // full rows above it taper to one tip without degenerate final faces.
      const w = width * Math.pow(1 - t, 0.65) * 0.5 * (detail==='low'?1.17:1);
      const color = tone(blend([0.038, 0.068, 0.025], [0.135, 0.194, 0.064], t * 0.88), shade);
      if (j === segments) { rows.push([mesh.vertex(center, 0.5, t, color)]); continue; }
      const dy = upright ? (1 - 0.15 * t * t) / 0.95 : Math.PI * 0.66 * Math.cos(t * Math.PI * 0.66);
      const tangent = axis.clone().multiplyScalar(2 * lean * t).add(V(0, dy, 0)).normalize();
      const cross = side.clone().applyAxisAngle(tangent, twist * t);
      const laminaNormal=new THREE.Vector3().crossVectors(tangent,cross).normalize();
      rows.push((folded?[-1,0,1]:[-1,1]).map(s => mesh.vertex(center.clone().addScaledVector(cross, s * w)
        .addScaledVector(laminaNormal,folded&&s===0?w*.25:0),
        (s + 1) * 0.5, t, tone(color, s < 0 ? 0.97 : s===0?1.055:1.03))));
    }
    for (let j = 0; j < segments - 1; j++) {
      for(let k=0;k<(folded?2:1);k++){
        mesh.tri(rows[j][k], rows[j][k+1], rows[j + 1][k]);
        mesh.tri(rows[j][k+1], rows[j + 1][k+1], rows[j + 1][k]);
      }
    }
    for(let k=0;k<(folded?2:1);k++)mesh.tri(rows[segments - 1][k], rows[segments - 1][k+1], rows[segments][0]);
  }
  return mesh.finish('grass', seed, { blades });
}
