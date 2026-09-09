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

// A pinnatifid fern pinna: the narrow continuous costa carries distinct pairs
// of swept, tapered pinnules with open notches between their shoulders.
function fernPinna(mesh, base, direction, length, width, color, options = {}) {
  const { curl = 0.12, twist = 0, detail = 'high', dry = 0 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  const lobes = detail === 'medium' ? 3 + Math.floor(length * 4) : 6 + Math.floor(length * 8);
  const at = (t, transverse) => {
    const across = side.clone().applyAxisAngle(axis, twist * t);
    return base.clone().addScaledVector(axis, length * t)
      .addScaledVector(normal, length * (curl * Math.sin(t * Math.PI * 0.9)
        + (0.025 + dry * 0.075) * Math.pow(Math.max(0, (t - 0.72) / 0.28), 2)))
      .addScaledVector(across, transverse)
      .addScaledVector(normal, -Math.abs(transverse) * 0.08);
  };
  const shade = t => blend(color, [0.22, 0.155, 0.065], dry * t * 0.42);
  const rows = [];
  for (let j = 0; j <= lobes; j++) {
    const t = j / lobes;
    const half = width * 0.055 * Math.pow(Math.sin(t * Math.PI), 0.75);
    if (j === 0 || j === lobes) rows.push([mesh.vertex(at(t, 0), 0.5, t, tone(shade(t), 1.06))]);
    else rows.push([-1, 1].map(sign => mesh.vertex(at(t, sign * half), (sign + 1) * 0.5, t, tone(shade(t), 1.05))));
  }
  mesh.tri(rows[0][0], rows[1][0], rows[1][1]);
  for (let j = 1; j < lobes - 1; j++) {
    mesh.tri(rows[j][0], rows[j + 1][0], rows[j][1]);
    mesh.tri(rows[j][1], rows[j + 1][0], rows[j + 1][1]);
  }
  mesh.tri(rows[lobes - 1][0], rows[lobes][0], rows[lobes - 1][1]);
  for (let j = 0; j < lobes; j++) {
    const t0 = j / lobes, t1 = (j + 1) / lobes;
    for (const sign of [-1, 1]) {
      const tLower = t0 + (t1 - t0) * 0.22;
      const tPeak = t0 + (t1 - t0) * 0.50;
      const tShoulder = t0 + (t1 - t0) * 0.72;
      const envelope = Math.pow(Math.sin(tPeak * Math.PI), 0.72);
      const lobeWidth = width * 0.5 * envelope * (1 - dry * 0.08 * (j % 2));
      const root0 = rows[j][j === 0 ? 0 : (sign < 0 ? 0 : 1)];
      const root1 = rows[j + 1][j + 1 === lobes ? 0 : (sign < 0 ? 0 : 1)];
      const lower = mesh.vertex(at(tLower, sign * lobeWidth * 0.66), sign < 0 ? 0.14 : 0.86, tLower, tone(shade(tLower), 0.98));
      const peak = mesh.vertex(at(tPeak, sign * lobeWidth).addScaledVector(normal,
        lobeWidth * (0.055 + dry * 0.08)), sign < 0 ? 0 : 1, tPeak, shade(tPeak));
      const shoulder = mesh.vertex(at(tShoulder, sign * lobeWidth * 0.55), sign < 0 ? 0.20 : 0.80, tShoulder, tone(shade(tShoulder), 0.96));
      if (sign < 0) {
        mesh.tri(root0, lower, peak); mesh.tri(root0, peak, shoulder); mesh.tri(root0, shoulder, root1);
      } else {
        mesh.tri(root0, peak, lower); mesh.tri(root0, shoulder, peak); mesh.tri(root0, root1, shoulder);
      }
    }
  }
}

// Near-only true bipinnate anatomy: each secondary costa carries physically
// separate, curved pinnules. Neighbouring laminae have open gaps; the connection
// is a narrow tubular costa, never a continuous zigzag foliage strip.
function bipinnatePinna(mesh, base, direction, length, width, color, options = {}) {
  const { curl = 0.12, twist = 0, dry = 0 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  const ideal = t => base.clone().addScaledVector(axis, length * t)
    .addScaledVector(normal, length * (curl * Math.sin(t * Math.PI * 0.9)
      + (0.018 + dry * 0.065) * Math.pow(Math.max(0, (t - 0.74) / 0.26), 2)));
  const costa = sampleCurve(ideal, 5);
  const at = t => {
    const sample = clamp(t, 0, 1) * 5, segment = Math.min(4, Math.floor(sample));
    return costa[segment].clone().lerp(costa[segment + 1], sample - segment);
  };
  tube(mesh, costa, Math.max(0.00026, width * 0.013), 0.00013,
    blend(STEM, color, 0.54), 4);
  const pairs = 10 + Math.floor(length * 12);
  for (let pair = 0; pair < pairs; pair++) {
    for (const sign of [-1, 1]) {
      const t = 0.075 + pair / (pairs - 1) * 0.82 + (sign > 0 ? 0.012 : 0);
      const envelope = Math.pow(Math.sin(t * Math.PI), 0.72) * (1 - t * 0.12);
      const across = side.clone().applyAxisAngle(axis, twist * t);
      const planeNormal = normal.clone().applyAxisAngle(axis, twist * t);
      const waviness = Math.sin(pair * 2.27 + sign * 0.61 + length * 43);
      const pinnuleDirection = across.multiplyScalar(sign)
        .addScaledVector(axis, 0.30 + t * 0.13 + waviness * 0.055)
        .addScaledVector(planeNormal, 0.045 + waviness * 0.025).normalize();
      const pinnuleLength = width * 0.59 * envelope * (1 + waviness * 0.045);
      const pinnuleWidth = Math.min(length / pairs * 0.85, pinnuleLength * 0.48);
      lanceLeaf(mesh, at(t), pinnuleDirection, pinnuleLength, pinnuleWidth,
        tone(color, 0.965 + (waviness + 1) * 0.038),
        { sections: 4, curl: 0.075 + dry * 0.17 + waviness * 0.025,
          twist: sign * (0.055 + dry * 0.15), serration: 0.055, ridge: 0.23,
          planeNormal, tipColor: dry > 0.25 ? [0.235, 0.153, 0.057] : undefined });
      mesh.pinnules = (mesh.pinnules ?? 0) + 1;
    }
  }
  // A tapering terminal pinnule closes the costa without joining the side
  // laminae into a strip. It remains visibly smaller than its basal neighbours.
  lanceLeaf(mesh, at(0.92), axis.clone().addScaledVector(normal, 0.08),
    length * 0.095, width * 0.17, tone(color, 1.025),
    { sections: 5, curl: 0.12 + dry * 0.17, ridge: 0.19, planeNormal: normal });
  mesh.pinnules = (mesh.pinnules ?? 0) + 1;
}

// A tapered lamina with a raised midrib, drooping edges and twisted tip. Every
// interior cross-section has left/middle/right vertices, rather than a flat card.
function lanceLeaf(mesh, base, direction, length, width, color, options = {}) {
  const { sections = 5, curl = 0.15, twist = 0.0, serration = 0.0, ridge = 0.08 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(options.planeNormal || UP, axis).normalize();
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
    const leafColor = blend(color, options.tipColor || tone(FRESH, 0.87), t * 0.16);
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
  const medium = detail === 'medium';
  const leaf = low ? foldedLeaf : medium ? fernPinna : bipinnatePinna;
  const ageRng = randomFor(`${seed}:fern-life-cycle`);
  const count = 8 + Math.floor(rng() * 3);
  const height = 0.82 + rng() * 0.30;
  const azimuth = rng() * TAU;
  let leafletCount = 0;
  let damagedPinnae = 0;
  for (let f = 0; f < count; f++) {
    const dry = f === count - 1 ? 0.30 + ageRng() * 0.42 : f === count - 2 ? ageRng() * 0.15 : 0;
    const wear = ageRng();
    const angle = azimuth + f * TAU / count + (rng() - 0.5) * 0.32;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const lateral = V(-Math.sin(angle), 0, Math.cos(angle));
    const h = height * (f === 0 ? 1 : 0.68 + rng() * 0.32) * (1 - dry * 0.40);
    const reach = 0.62 + rng() * 0.32 + (1 - h / height) * 0.24;
    const sway = (rng() - 0.5) * 0.17;
    const idealCurve = t => radial.clone().multiplyScalar(0.018 + reach * Math.pow(t, 1.65))
      .addScaledVector(lateral, sway * t * t)
      .add(V(0, h * Math.sin(t * Math.PI * 0.75), 0));
    const skeleton = sampleCurve(idealCurve, 16);
    // All detail levels use exactly the same stem centreline and attachment
    // positions. Project onto its actual segments so pinnae never float in the
    // gap between a mathematical curve and a tessellated tube.
    const curve = t => {
      const sample = clamp(t, 0, 1) * 16, segment = Math.min(15, Math.floor(sample));
      return skeleton[segment].clone().lerp(skeleton[segment + 1], sample - segment);
    };
    const frondColor = blend(GREEN, [0.21, 0.145, 0.062], dry);
    tube(mesh, skeleton, 0.008, 0.0008,
      blend(blend(STEM, GREEN, 0.45), [0.19, 0.115, 0.040], dry), low ? 3 : medium ? 4 : 5);
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
        const leafLength = length * (0.92 + rng() * 0.16);
        const leafWidth = length * (0.22 + rng() * 0.065);
        const leafColor = tone(frondColor, 0.89 + rng() * 0.37);
        const options = { detail: medium ? 'medium' : 'high', dry,
          curl: 0.045 + rng() * 0.13, twist: sign * (0.05 + rng() * 0.19), ridge: 0.14 };
        // Missing pinnae occur only on an aging outer frond, identically at
        // every detail level; random draws above remain unchanged.
        if (dry > 0.25 && ((p * 7 + f + (sign > 0 ? 3 : 0)) % 13) < 1 + Math.floor(wear * 2)) {
          damagedPinnae++;
          continue;
        }
        leaf(mesh, origin, direction, leafLength, leafWidth, leafColor, options);
        leafletCount++;
      }
    }
    leaf(mesh, curve(0.95), radial.clone().add(V(0, -0.3, 0)), 0.075, 0.018,
      tone(frondColor, 1.05), { detail: medium ? 'medium' : 'high', dry, curl: 0.2 });
    leafletCount++;
  }
  const fiddleheads = 1 + Math.floor(ageRng() * 2);
  const fiddleheadTriangleStart = mesh.i.length / 3;
  for (let young = 0; young < fiddleheads; young++) {
    const angle = ageRng() * TAU, h = 0.28 + ageRng() * 0.25;
    const radius = 0.025 + ageRng() * 0.019;
    const radial = V(Math.cos(angle), 0, Math.sin(angle));
    const stalk = t => radial.clone().multiplyScalar(0.035 + 0.032 * t * t).add(V(0, h * t, 0));
    const top = stalk(1);
    tube(mesh, sampleCurve(stalk, low ? 4 : 7), 0.0032, 0.0026, [0.155, 0.153, 0.049], low ? 3 : 4);
    const coil = t => {
      const a = t * TAU * 1.24, r = radius * (1 - t * 0.81);
      return top.clone().addScaledVector(radial, radius - r * Math.cos(a)).add(V(0, r * Math.sin(a), 0));
    };
    tube(mesh, sampleCurve(coil, low ? 11 : medium ? 17 : 25), 0.0026, 0.0009,
      [0.168, 0.165, 0.056], low ? 3 : 4);
  }
  return mesh.finish('fern', seed, { detail: low ? 'low' : medium ? 'medium' : 'high', fronds: count,
    leaves: leafletCount, pinnules: mesh.pinnules ?? 0, damagedPinnae, fiddleheads, fiddleheadTriangleStart,
    fiddleheadTriangles: mesh.i.length / 3 - fiddleheadTriangleStart },
    Number.isFinite(scale) && scale > 0 ? scale : 1);
}

// Shrub-only broad lamina. A sparse midrib and submarginal strip carry a much
// denser toothed outline: 50 curved triangles, rather than subdividing a card.
function shrubLeaf(mesh, base, direction, length, width, color, options = {}) {
  const { curl = 0.1, twist = 0, asymmetry = 0, age = 0, damage = -1, phase = 0 } = options;
  const axis = direction.clone().normalize();
  let side = new THREE.Vector3().crossVectors(UP, axis).normalize();
  if (side.lengthSq() < 1e-8) side = V(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  if (normal.y < 0) { normal.negate(); side.negate(); }
  const envelope = t => Math.pow(Math.sin(Math.PI * Math.pow(t,
    0.83 + Math.sin(phase) * 0.075)), 0.70 + Math.cos(phase) * 0.065);
  const at = (t, across, tooth = 1) => {
    const shape = envelope(t), sign = Math.sign(across);
    const half = width * 0.5 * shape * (1 + sign * asymmetry
      + 0.045 * Math.sin(t * Math.PI * 2 + phase + sign));
    const u = across * half * tooth;
    const sideAt = side.clone().applyAxisAngle(axis, twist * (t - 0.12));
    const upAt = normal.clone().applyAxisAngle(axis, twist * (t - 0.12));
    // Longitudinal camber, a drooping tip, central fold and gently recurved
    // margin all have physical depth. The submarginal row resolves the roll.
    const camber = length * (curl * Math.sin(t * Math.PI)
      - (0.045 + age * 0.10) * Math.pow(t, 4));
    const fold = width * shape * (0.022 * (1 - Math.abs(across)) - 0.145 * Math.abs(across)
      - 0.022 * across * across + 0.064 * Math.pow(Math.abs(across), 8));
    return base.clone().addScaledVector(axis, length * t)
      .addScaledVector(side, length * asymmetry * 0.22 * Math.sin(t * Math.PI))
      .addScaledVector(sideAt, u).addScaledVector(normal, camber)
      .addScaledVector(upAt, fold + width * 0.008 * Math.sin(t * 19 + phase) * Math.abs(across));
  };
  const shade = (t, across) => {
    const mottling = (0.5 + 0.5 * Math.sin(t * 15 + across * 4 + phase)) * age;
    let c = blend(color, [0.17, 0.142, 0.048], mottling * 0.36
      + age * 0.28 * Math.pow(Math.abs(across), 3));
    c = tone(c, 1.0 + (1 - Math.abs(across)) * 0.055 + Math.sin(t * 11 + phase) * 0.019);
    return c;
  };
  const vertex = (t, across, tooth = 1) => mesh.vertex(at(t, across, tooth),
    (across + 1) * 0.5, t, shade(t, across));
  const baseIndex = vertex(0, 0), tipIndex = vertex(1, 0);
  const coarse = [0, 0.19, 0.41, 0.64, 0.83, 1];
  const midrib = coarse.map(t => ({ t, i: t === 0 ? baseIndex : t === 1 ? tipIndex : vertex(t, 0) }));
  // Join unequal strips in longitudinal order, sharing their root and tip.
  const strip = (a, b, sign) => {
    let i = 0, j = 0;
    const tri = (x, y, z) => {
      if (x === y || y === z || z === x) return;
      if (sign > 0) mesh.tri(x, y, z); else mesh.tri(x, z, y);
    };
    while (i < a.length - 1 || j < b.length - 1) {
      if (j === b.length - 1 || (i < a.length - 1 && a[i + 1].t <= b[j + 1].t)) {
        tri(a[i].i, a[i + 1].i, b[j].i); i++;
      } else { tri(a[i].i, b[j + 1].i, b[j].i); j++; }
    }
  };
  for (const sign of [-1, 1]) {
    const inner = [0, 0.31, 0.68, 1].map(t => ({ t, i: t === 0 ? baseIndex : t === 1 ? tipIndex : vertex(t, sign * 0.79) }));
    const edge = Array.from({ length: 19 }, (_, j) => {
      const t = (j + (j === 0 || j === 18 ? 0 : 0.11 * Math.sin(j * 2.13 + phase + sign))) / 18;
      if (j === 0 || j === 18) return { t, i: j === 0 ? baseIndex : tipIndex };
      const tooth = (j % 2 ? 1.029 : 0.964) + 0.012 * Math.sin(j * 2.73 + phase + sign)
        - (damage === j && sign < 0 ? 0.085 : 0);
      return { t, i: vertex(t, sign, tooth) };
    });
    strip(midrib, inner, sign); strip(inner, edge, sign);
  }
}

function detailedShrub(seed) {
  const rng = randomFor(seed), shapeRng = randomFor(`${seed}:broadleaf-shape`), mesh = new MeshBuilder();
  const stems = 5 + Math.floor(rng() * 2), height = 1.18 + rng() * 0.43, phase = rng() * TAU;
  let leaves = 0;
  // Attachments sample the actual segmented wood, keeping every petiole and
  // branch joined even where the ideal curve bows away from the mesh.
  const sampled = (fn, segments) => {
    const points = sampleCurve(fn, segments);
    const at = t => { const u = clamp(t, 0, 1) * segments, j = Math.min(segments - 1, Math.floor(u));
      return points[j].clone().lerp(points[j + 1], u - j); };
    return { points, at };
  };
  for (let s = 0; s < stems; s++) {
    const angle = phase + s * TAU / stems + (rng() - 0.5) * 0.8;
    const radial = V(Math.cos(angle), 0, Math.sin(angle)), lateral = V(-Math.sin(angle), 0, Math.cos(angle));
    const bend = 0.25 + rng() * 0.34, h = height * (0.67 + rng() * 0.33);
    const lean = 0.76 + shapeRng() * 0.55, sway = (shapeRng() - 0.5) * 0.18;
    const droop = shapeRng() * 0.075;
    const stem = sampled(t => radial.clone().multiplyScalar(0.055 + bend * lean * t * t)
      .addScaledVector(lateral, Math.sin(t * Math.PI) * 0.07 + sway * t * t)
      .add(V(0, h * (t - droop * Math.pow(t, 4)), 0)), 8);
    tube(mesh, stem.points, 0.0115 + rng() * 0.005, 0.0016, tone(BARK, 0.92 + shapeRng() * 0.19), 5);
    const branches = 5 + Math.floor(rng() * 2);
    for (let b = 0; b < branches; b++) {
      const t = 0.12 + b / (branches - 1) * 0.79;
      const start = stem.at(t), sign = b % 2 ? -1 : 1;
      const reach = (0.29 + rng() * 0.20) * (1.09 - t * 0.33);
      const branchDir = lateral.clone().multiplyScalar(sign * (0.7 + rng() * 0.35))
        .addScaledVector(radial, 0.48 + rng() * 0.42).normalize();
      const cross = V(-branchDir.z, 0, branchDir.x), rise = 0.11 + rng() * 0.17;
      const sweep = (shapeRng() - 0.5) * 0.17, sag = 0.025 + shapeRng() * 0.10;
      const twig = sampled(u => start.clone().addScaledVector(branchDir, reach * u)
        .addScaledVector(cross, sweep * u * u)
        .add(V(0, rise * u + Math.sin(u * Math.PI) * 0.060 - sag * u * u, 0)), 4);
      tube(mesh, twig.points, 0.0039 * (1 - t * 0.40), 0.00065, blend(BARK, STEM, 0.25 + t * 0.30), 4);
      // Fewer overlapping leaves fund genuine edge shape. Leaves near the
      // shoot tips are younger and distinctly smaller than mature basal ones.
      const leafCount = 8 + Math.floor(rng() * 2);
      const retained = new Set(Array.from({ length: 5 }, (_, j) => Math.round(j * (leafCount - 1) / 4)));
      for (let l = 0; l < leafCount; l++) {
        const u = 0.09 + l / (leafCount - 1) * 0.87 + (shapeRng() - 0.5) * 0.035;
        const attach = twig.at(u), leafSide = l % 2 ? -1 : 1;
        const leafDirection = cross.clone().multiplyScalar(leafSide * (0.70 + rng() * 0.45))
          .addScaledVector(branchDir, 0.28 + rng() * 0.47)
          .add(V(0, (rng() - 0.47) * 0.70, 0)).normalize();
        // Consume the original leaf parameter stream even for omitted leaves,
        // so branch counts and the rough stem placement keep their seed identity.
        const sizeDraw = rng(), widthDraw = rng(), colorDraw = rng(), curlDraw = rng(), twistDraw = rng();
        if (!retained.has(l)) continue;
        const maturity = Math.pow(1 - u, 0.38);
        const len = (0.118 + sizeDraw * 0.070) * (0.66 + maturity * 0.54)
          * (0.82 + shapeRng() * 0.32);
        const petioleLength = len * (0.105 + shapeRng() * 0.06);
        const petioleEnd = attach.clone().addScaledVector(leafDirection, petioleLength);
        const petioleMid = attach.clone().lerp(petioleEnd, 0.50).add(V(0, petioleLength * 0.12, 0));
        tube(mesh, [attach, petioleMid, petioleEnd], 0.0008, 0.00042, blend(STEM, GREEN, 0.25 + u * 0.32), 3, false);
        const age = shapeRng() < 0.12 && u < 0.76 ? 0.22 + shapeRng() * 0.34 : 0;
        const color = tone(blend(GREEN, FRESH, 0.10 + (1 - maturity) * 0.24), 0.83 + colorDraw * 0.34);
        shrubLeaf(mesh, petioleEnd, leafDirection, len, len * (0.65 + widthDraw * 0.20), color,
          { curl: 0.045 + curlDraw * 0.10, twist: (twistDraw - 0.5) * 0.65,
            asymmetry: (shapeRng() - 0.5) * 0.19, age,
            damage: age > 0.3 ? 3 + Math.floor(shapeRng() * 7) : -1, phase: shapeRng() * TAU });
        leaves++;
      }
    }
    for (let terminal = 0; terminal < 2; terminal++) {
      const direction = radial.clone().addScaledVector(lateral, terminal ? 0.55 : -0.55)
        .add(V(0, 0.48 + terminal * 0.18, 0)).normalize();
      const root = stem.at(0.975 + terminal * 0.025), end = root.clone().addScaledVector(direction, 0.010);
      tube(mesh, [root, end], 0.00075, 0.00040, STEM, 3, false);
      shrubLeaf(mesh, end, direction, terminal ? 0.059 : 0.082, terminal ? 0.035 : 0.056,
        blend(GREEN, FRESH, 0.40), { curl: 0.13, twist: terminal ? -0.33 : 0.26,
          asymmetry: 0.045, phase: shapeRng() * TAU });
      leaves++;
    }
  }
  return mesh.finish('shrub', seed, { detail: 'high', stems, leaves });
}

export function createShrubGeometry(seed, options = {}) {
  if (options !== 'low' && options?.detail !== 'low') return detailedShrub(seed);
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

function flower(mesh, center, radius, rng, petals = 5, sections = 3) {
  const phase = rng() * TAU;
  for (let p = 0; p < petals; p++) {
    const angle = phase + p * TAU / petals;
    const direction = V(Math.cos(angle), 0.16, Math.sin(angle));
    const base = center.clone().addScaledVector(direction, radius * 0.12);
    lanceLeaf(mesh, base, direction, radius, radius * 0.66,
      [0.70, 0.72, 0.64], { sections, curl: 0.05, ridge: 0.02 });
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

function ivyLeaf(mesh, base, angle, size, lift, color) {
  const axis = V(Math.cos(angle), lift, Math.sin(angle)).normalize();
  const side = V(-Math.sin(angle), 0, Math.cos(angle));
  const outline = [[0, 0], [0, -0.22], [0.18, -0.38], [0.27, -0.20],
    [0.50, -0.50], [0.55, -0.18], [1, 0], [0.55, 0.18],
    [0.50, 0.50], [0.27, 0.20], [0.18, 0.38], [0, 0.22]];
  const point = (x, z, raised = 0) => base.clone().addScaledVector(axis, x * size)
    .addScaledVector(side, z * size)
    .add(V(0, size * (0.045 * Math.sin(x * Math.PI) - 0.12 * Math.abs(z)) + raised, 0));
  const center = mesh.vertex(point(0.30, 0), 0.5, 0.30, tone(color, 1.04));
  const ring = outline.map(([x, z]) => mesh.vertex(point(x, z), z + 0.5, x, color));
  for (let i = 0; i < ring.length; i++) mesh.tri(center, ring[(i + 1) % ring.length], ring[i]);
  // Five pale veins branch from the lamina centre. Routing them from the base
  // directly to outer lobes would cross the open sinuses between ivy lobes.
  for (const end of [[0.02, 0], [0.18, -0.38], [0.50, -0.50], [1, 0], [0.50, 0.50], [0.18, 0.38]]) {
    const dx = end[0] - 0.30, dz = end[1];
    const magnitude = Math.hypot(dx, dz), w = 0.0034;
    const px = -dz / magnitude * w, pz = dx / magnitude * w;
    const veinColor = blend(color, [0.12, 0.19, 0.090], 0.56);
    const a = mesh.vertex(point(0.30 - px, -pz, 0.00025), 0, 0, veinColor);
    const b = mesh.vertex(point(0.30 + px, pz, 0.00025), 1, 0, veinColor);
    const c = mesh.vertex(point(end[0] - px * 0.3, end[1] - pz * 0.3, 0.00025), 0, 1, veinColor);
    const d = mesh.vertex(point(end[0] + px * 0.3, end[1] + pz * 0.3, 0.00025), 1, 1, veinColor);
    mesh.tri(a, b, c); mesh.tri(b, d, c);
  }
}

function ivyGeometry(seed) {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const runners = 3 + Math.floor(rng() * 2), phase = rng() * TAU;
  let leaves = 0;
  for (let r = 0; r < runners; r++) {
    const angle = phase + r * TAU / runners + rng() * 0.3;
    const axis = V(Math.cos(angle), 0, Math.sin(angle)), side = V(-Math.sin(angle), 0, Math.cos(angle));
    const reach = 0.26 + rng() * 0.24;
    const runner = t => axis.clone().multiplyScalar(reach * t)
      .addScaledVector(side, Math.sin(t * Math.PI * 1.35) * 0.035)
      .add(V(0, 0.014 + Math.sin(t * Math.PI) * 0.013, 0));
    tube(mesh, sampleCurve(runner, 6), 0.0028, 0.0011, [0.080, 0.096, 0.039], 3);
    const count = 5 + Math.floor(rng() * 3);
    for (let l = 0; l < count; l++) {
      const t = 0.06 + l / (count - 1) * 0.91;
      const leafAngle = angle + (l % 2 ? -1 : 1) * (0.69 + rng() * 0.25);
      const base = runner(t), petiole = V(Math.cos(leafAngle) * 0.024, 0.045 + rng() * 0.025, Math.sin(leafAngle) * 0.024);
      tube(mesh, [base, base.clone().add(petiole)], 0.00125, 0.0008, STEM, 3);
      ivyLeaf(mesh, base.clone().add(petiole), leafAngle, 0.078 + rng() * 0.065,
        (rng() - 0.5) * 0.20, tone([0.033, 0.078, 0.035], 0.85 + rng() * 0.40));
      leaves++;
    }
  }
  return mesh.finish('ivy', seed, { runners, leaves });
}

function nettleGeometry(seed) {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const stems = 3 + Math.floor(rng() * 3), phase = rng() * TAU;
  let leaves = 0;
  for (let s = 0; s < stems; s++) {
    const angle = phase + s * 2.3999632297, height = 0.26 + rng() * 0.29;
    const axis = V(Math.cos(angle), 0, Math.sin(angle));
    const root = axis.clone().multiplyScalar(0.018 + rng() * 0.115);
    const stalk = t => root.clone().addScaledVector(axis, height * 0.17 * t * t).add(V(0, height * t, 0));
    tube(mesh, sampleCurve(stalk, 4), 0.0030, 0.0009, [0.071, 0.104, 0.031], 4);
    for (let node = 0; node < 4; node++) {
      const t = 0.25 + node * 0.235;
      for (const sign of [-1, 1]) {
        const a = angle + node * Math.PI * 0.5;
        const direction = V(Math.cos(a) * sign, 0.18 + node * 0.09, Math.sin(a) * sign);
        const length = (0.108 + rng() * 0.047) * (1 - node * 0.12);
        lanceLeaf(mesh, stalk(t), direction, length, length * (0.53 + rng() * 0.10),
          tone([0.050, 0.129, 0.036], 0.93 + rng() * 0.29),
          { sections: 11, curl: 0.09, twist: sign * 0.10, ridge: 0.18, serration: 0.13 });
        leaves++;
      }
    }
  }
  return mesh.finish('nettle', seed, { stems, leaves });
}

function ramsonsGeometry(seed) {
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const plants = 4 + Math.floor(rng() * 3), phase = rng() * TAU;
  let leaves = 0, flowers = 0;
  for (let p = 0; p < plants; p++) {
    const angle = phase + p * 2.3999632297, radius = 0.025 + rng() * 0.12;
    const root = V(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    for (const side of [-1, 1]) {
      const a = angle + side * 0.40;
      const length = 0.19 + rng() * 0.14;
      const direction = V(Math.cos(a) * 0.64, 0.72 + rng() * 0.24, Math.sin(a) * 0.64);
      const base = root.clone().add(V(0, 0.025, 0));
      tube(mesh, [root, base], 0.0018, 0.0011, STEM, 3);
      lanceLeaf(mesh, base, direction, length, length * (0.23 + rng() * 0.08),
        tone([0.046, 0.113, 0.040], 0.87 + rng() * 0.38),
        { sections: 8, curl: 0.085, twist: side * 0.15, ridge: 0.12 });
      leaves++;
    }
    if (p < 2) {
      const height = 0.25 + rng() * 0.10;
      const top = root.clone().add(V(Math.cos(angle) * 0.025, height, Math.sin(angle) * 0.025));
      tube(mesh, sampleCurve(t => root.clone().lerp(top, t), 4), 0.0018, 0.0009, STEM, 4);
      const count = 5 + Math.floor(rng() * 3);
      for (let f = 0; f < count; f++) {
        const a = angle + f * TAU / count;
        const tip = top.clone().add(V(Math.cos(a) * 0.025, 0.014 + rng() * 0.021, Math.sin(a) * 0.025));
        tube(mesh, [top, tip], 0.00075, 0.0005, tone(STEM, 1.2), 3, false);
        flower(mesh, tip, 0.009 + rng() * 0.0045, rng, 6, 2);
        flowers++;
      }
    }
  }
  return mesh.finish('ramsons', seed, { plants, leaves, flowers });
}

export function createHerbGeometry(seed, type = 'sorrel') {
  if (type === 'ivy') return ivyGeometry(seed);
  if (type === 'nettle' || type === 'nettles') return nettleGeometry(seed);
  if (type === 'ramsons' || type === 'wild-garlic') return ramsonsGeometry(seed);
  const rng = randomFor(seed), mesh = new MeshBuilder();
  const flowering = type === 'flower' || type === 'flowers' || type === 'flowering' || type === 'weed';
  const count = flowering ? 4 + Math.floor(rng() * 3) : 6 + Math.floor(rng() * 3);
  const phase = rng() * TAU;
  let leaves = 0;
  for (let i = 0; i < count; i++) {
    const angle = phase + i * TAU / count + (rng() - 0.5) * 0.45;
    const radius = 0.025 + rng() * (flowering ? 0.12 : 0.11);
    const root = V(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const height = flowering ? 0.19 + rng() * 0.20 : 0.055 + rng() * 0.085;
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
      const size = 0.043 + rng() * 0.031;
      for (let l = 0; l < 3; l++) {
        sorrelLeaf(mesh, top, angle + l * TAU / 3, size * (0.94 + rng() * 0.12),
          (rng() - 0.5) * 0.22, tone(GREEN, 1.00 + rng() * 0.38));
        leaves++;
      }
    }
  }
  return mesh.finish(flowering ? 'flowering-herb' : 'sorrel', seed, { stems: count, leaves });
}

