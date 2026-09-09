import * as THREE from 'three';

/**
 * Geometry-only temperate trees. Units are metres, +Y is up, ground is y=0.
 * No textures, alpha cards, materials, browser APIs or hidden random state.
 * Leaves are individually cupped/twisted 8-, 4- or 2-triangle laminae; use DoubleSide.
 * Wood and leaf vertex colours are already in Three.js's linear working space.
 */
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const SPECIES = {
  oak: { height: [18, 24], girth: [0.46, 0.68], leaf: [0.11, 0.18], width: 0.51, wood: '#5b5040', green: '#426332', bark: 0.15 },
  beech: { height: [20, 26], girth: [0.38, 0.55], leaf: [0.09, 0.15], width: 0.59, wood: '#737366', green: '#456639', bark: 0.047 },
  birch: { height: [17, 23], girth: [0.22, 0.36], leaf: [0.065, 0.115], width: 0.69, wood: '#b9b9a7', green: '#526e39', bark: 0.069 },
};

function hashSeed(value) {
  const string = String(value);
  let h = 2166136261;
  for (let i = 0; i < string.length; i++) h = Math.imul(h ^ string.charCodeAt(i), 16777619);
  return h >>> 0;
}

function randomSource(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

class GeometryWriter {
  constructor(detail = 'high') { this.positions = []; this.colors = []; this.uvs = []; this.indices = []; this.seams = []; this.detail = detail; this.leafOrdinal = 0; this.leafCount = 0; this.leafBases = []; this.logicalMaxY = 0; }
  vertex(p, color, u = 0, v = 0) {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.colors.push(color.r, color.g, color.b);
    this.uvs.push(u, v);
    return i;
  }
  triangle(a, b, c) { this.indices.push(a, b, c); }
  finish(name) {
    const g = new THREE.BufferGeometry();
    g.name = name;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    const normals = g.getAttribute('normal');
    const n = new THREE.Vector3();
    for (const [a, b] of this.seams) {
      n.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
      normals.setXYZ(a, n.x, n.y, n.z);
      normals.setXYZ(b, n.x, n.y, n.z);
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function sample(points, t) {
  const f = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return points[i].clone().lerp(points[i + 1], f - i);
}

function tangent(points, t) {
  return sample(points, Math.min(1, t + 0.02)).sub(sample(points, Math.max(0, t - 0.02))).normalize();
}

function frame(axis) {
  const reference = Math.abs(axis.y) < 0.92 ? UP : new THREE.Vector3(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(axis, reference).normalize();
  return [u, new THREE.Vector3().crossVectors(axis, u).normalize()];
}

/** Sweep a tapered ring mesh. Its frame is transported to avoid angular seams. */
function tube(writer, points, radii, sides, color, rng, roughness, barkScale = 1) {
  for (let i = 0; i < points.length; i++) writer.logicalMaxY = Math.max(writer.logicalMaxY, points[i].y + radii[i] * 1.25);
  let u;
  let distance = 0;
  const rows = [];
  const phase = rng() * TAU;
  // Draw the same random values at every LOD so branch/leaf placement is stable.
  const originalSides = sides;
  const grain = Array.from({ length: originalSides }, () => 0.87 + rng() * 0.25);
  // Subpixel leaf stems do not merit wood triangles at the far LOD. Consume
  // their RNG first so all remaining topology and leaves remain reproducible.
  if (writer.detail === 'low' && radii[0] < 0.005) return [];
  if (writer.detail === 'medium') sides = Math.max(3, Math.ceil(sides * 0.72));
  if (writer.detail === 'low') sides = Math.max(3, Math.ceil(sides * 0.47));
  const step = writer.detail === 'high' ? 1 : 2;
  let previousK = -1;
  for (let k = 0; k < points.length; k++) {
    if (k) distance += points[k].distanceTo(points[k - 1]);
    if (k % step !== 0 && k !== points.length - 1) continue;
    const axis = points[Math.min(points.length - 1, k + 1)].clone().sub(points[Math.max(0, k - 1)]).normalize();
    if (!u) u = frame(axis)[0];
    else {
      u.addScaledVector(axis, -u.dot(axis));
      if (u.lengthSq() < 0.01) u = frame(axis)[0];
      u.normalize();
    }
    const v = new THREE.Vector3().crossVectors(axis, u).normalize();
    const row = [];
    for (let j = 0; j <= sides; j++) {
      const angle = (j % sides) / sides * TAU;
      const ridge = 1 + roughness * (0.6 * Math.sin(angle * 5 + phase) + 0.28 * Math.sin(angle * 9 - phase) + 0.12 * Math.sin(k * 1.3 + angle * 3));
      const p = points[k].clone().addScaledVector(u, Math.cos(angle) * radii[k] * ridge).addScaledVector(v, Math.sin(angle) * radii[k] * ridge);
      // Only the trunk's initial ground ring can be within millimetres of zero.
      // Keeping that ring horizontal prevents an exposed gap at the root flare.
      if (k === 0 && points[0].y === 0) p.y = 0;
      const shade = grain[Math.floor((j % sides) / sides * originalSides)] * (0.96 + 0.045 * Math.sin(k * 1.14 + phase));
      row.push(writer.vertex(p, color.clone().multiplyScalar(shade), j / sides * barkScale, distance / 1.8));
    }
    writer.seams.push([row[0], row[sides]]);
    if (previousK >= 0) for (let j = 0; j < sides; j++) {
      writer.triangle(rows[previousK][j], rows[previousK][j + 1], row[j]);
      writer.triangle(rows[previousK][j + 1], row[j + 1], row[j]);
    }
    rows.push(row);
    previousK = rows.length - 1;
  }
  // Tiny but nonzero tips are capped. The base is inside its parent branch.
  if (writer.detail === 'high' || radii[0] > 0.007) {
    const cap = writer.vertex(points[points.length - 1], color, 0.5, distance / 1.8);
    const end = rows[rows.length - 1];
    for (let j = 0; j < sides; j++) writer.triangle(cap, end[j], end[j + 1]);
  }
  return rows;
}

function branchCurve(origin, angle, reach, rise, bend, rng, segments = 7) {
  const result = [];
  const lateral = (rng() - 0.5) * reach * 0.26;
  const kinkPhase = rng() * TAU;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const side = Math.sin(t * Math.PI) * lateral + Math.sin(t * 8 + kinkPhase) * t * (1 - t) * reach * 0.085;
    const radial = reach * (t * 0.91 + 0.09 * Math.sin(t * Math.PI * 0.5));
    result.push(origin.clone().add(new THREE.Vector3(
      Math.cos(angle) * radial - Math.sin(angle) * side,
      rise * (0.65 * t + 0.35 * t * t) + bend * Math.sin(Math.PI * t) + Math.sin(t * 7 + kinkPhase) * t * (1 - t) * reach * 0.035,
      Math.sin(angle) * radial + Math.cos(angle) * side,
    )));
  }
  // This invariant also makes branch starts exactly match a sampled parent.
  result[0].copy(origin);
  return result;
}

function taper(points, radius, terminal = 0.004, power = 1.1) {
  return points.map((_, i) => terminal + (radius - terminal) * Math.pow(1 - i / (points.length - 1), power));
}

/** A tortuous woody axis between two growth targets, continuing its parent. */
function growthPath(origin, target, parentDirection, rng, segments = 8, tortuosity = 1) {
  const displacement = target.clone().sub(origin);
  const length = displacement.length();
  const direction = displacement.clone().normalize();
  const [side, bend] = frame(direction);
  const outgoing = parentDirection.clone().normalize().lerp(direction, 0.42).normalize();
  const a = origin.clone().addScaledVector(outgoing, length * 0.19);
  const b = origin.clone().lerp(target, 0.45)
    .addScaledVector(side, (rng() - 0.5) * length * 0.28 * tortuosity)
    .addScaledVector(bend, (rng() - 0.46) * length * 0.14 * tortuosity);
  const c = origin.clone().lerp(target, 0.76)
    .addScaledVector(side, (rng() - 0.5) * length * 0.23 * tortuosity)
    .addScaledVector(bend, (rng() - 0.4) * length * 0.12 * tortuosity);
  const curve = new THREE.CatmullRomCurve3([origin.clone(), a, b, c, target.clone()], false, 'centripetal');
  const points = curve.getSpacedPoints(segments);
  points[0].copy(origin); points[points.length - 1].copy(target);
  return points;
}

/** Competing stems must diverge; tortuous boughs may branch from them later. */
function divergingLeaderPath(origin, target, rng, segments = 20) {
  const horizontal = target.clone().sub(origin); horizontal.y = 0;
  const distance = horizontal.length(); horizontal.normalize();
  const side = new THREE.Vector3(-horizontal.z, 0, horizontal.x);
  const initialOutward = 0.45 + rng() * 0.28;
  const verticalBow = (rng() - 0.5) * 0.03;
  const lateralBow = (rng() - 0.5) * 0.012;
  const upperBow = (rng() - 0.5) * 0.006;
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const radial = distance * (initialOutward * t + (1 - initialOutward) * t * t);
    const point = origin.clone().addScaledVector(horizontal, radial)
      .addScaledVector(side, distance * lateralBow * Math.sin(t * Math.PI));
    point.y = origin.y + (target.y - origin.y) * (t + verticalBow * Math.sin(t * Math.PI) + upperBow * Math.sin(t * TAU));
    points.push(point);
  }
  points[0].copy(origin); points[points.length - 1].copy(target);
  return points;
}

/** Broad buttresses sit on the ground and merge into the trunk flare. */
function rootButtress(writer, angle, length, width, height, color, rng) {
  const forward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  const rows = [];
  const bend = (rng() - 0.5) * 0.38;
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    const center = forward.clone().multiplyScalar(length * t).addScaledVector(side, Math.sin(t * 2.5) * bend);
    const w = width * Math.pow(1 - t, 1.35) + 0.008;
    const h = height * Math.pow(1 - t, 2.05) + 0.005;
    const row = [];
    for (let j = 0; j <= 6; j++) {
      const theta = j / 6 * Math.PI;
      const p = center.clone().addScaledVector(side, Math.cos(theta) * w);
      p.y = j === 0 || j === 6 ? 0 : Math.sin(theta) * h;
      row.push(writer.vertex(p, color.clone().multiplyScalar(0.81 + 0.16 * Math.sin(theta)), j / 6, length * t / 1.8));
    }
    if (k) for (let j = 0; j < 6; j++) {
      writer.triangle(rows[k - 1][j], row[j], rows[k - 1][j + 1]);
      writer.triangle(rows[k - 1][j + 1], row[j], row[j + 1]);
    }
    rows.push(row);
  }
}

function addLeaf(writer, base, direction, size, widthRatio, color, rng, species) {
  const ordinal = writer.leafOrdinal++;
  // Near crowns retain shaped shoulders, a raised midrib and curved laminae.
  // Small juvenile leaves use four triangles; the rest use eight.
  // Distant LODs select stable subsets and widen retained laminae.
  const retained = writer.detail === 'high' || (writer.detail === 'medium' ? ordinal % 3 === 0 : ordinal % 6 === 0);
  const leafDetail = writer.detail === 'high' ? (ordinal % 4 === 0 ? 'medium' : 'high')
    : writer.detail === 'medium' ? 'medium' : 'low';
  // Retained leaf area stays near the full crown across the distance LODs.
  size *= writer.detail === 'medium' ? 1.60 : writer.detail === 'low' ? 2.20 : 1;
  const forward = direction.clone().normalize();
  // Most laminae face the sky, while the roll and pitch retain oblique leaves.
  let side = new THREE.Vector3().crossVectors(UP, forward);
  if (side.lengthSq() < 0.015) side.set(1, 0, 0);
  side.normalize().applyAxisAngle(forward, (rng() - 0.5) * 1.8);
  const normal = new THREE.Vector3().crossVectors(forward, side).normalize();
  const twist = (rng() - 0.5) * 0.42;
  const cup = size * (0.045 + rng() * 0.075);
  const curve = size * (rng() * 0.2 - 0.045);
  const width = size * widthRatio;
  const localPoint = (s, t) => base.clone()
    .addScaledVector(forward, size * t)
    .addScaledVector(side, s * width * 0.5)
    .addScaledVector(normal, curve * t * t + cup * (1 - Math.abs(s)) * Math.sin(t * Math.PI) + s * twist * size * t);
  const leafColor = color.clone().multiplyScalar(0.78 + rng() * 0.4);
  const tipColor = leafColor.clone().lerp(new THREE.Color('#738648'), 0.08 + rng() * 0.14);
  if (!retained) return;
  writer.leafCount++;
  writer.leafBases.push(writer.positions.length / 3);
  // Birch is widest toward the base; beech/oak taper later. A raised midrib
  // and rotating edges make an actual three-dimensional curved surface.
  const wideFirst = species === 'birch' ? 1 : 0.84;
  const wideSecond = species === 'birch' ? 0.54 : 0.74;
  if (leafDetail !== 'high') {
    const b = writer.vertex(base, leafColor, 0.5, 0);
    const l = writer.vertex(localPoint(-1, 0.43), leafColor, 0, 0.43);
    const r = writer.vertex(localPoint(1, 0.43), leafColor, 1, 0.43);
    const tip = writer.vertex(localPoint(0, 1), tipColor, 0.5, 1);
    if (leafDetail === 'medium') {
      const center = writer.vertex(localPoint(0, 0.43), leafColor.clone().multiplyScalar(1.045), 0.5, 0.43);
      writer.triangle(b, l, center); writer.triangle(b, center, r);
      writer.triangle(l, tip, center); writer.triangle(center, tip, r);
    } else {
      writer.triangle(b, l, tip); writer.triangle(b, tip, r);
    }
    return;
  }
  const b = writer.vertex(base, leafColor, 0.5, 0);
  const l1 = writer.vertex(localPoint(-wideFirst, 0.34), leafColor, 0, 0.34);
  const c1 = writer.vertex(localPoint(0, 0.34), leafColor.clone().multiplyScalar(1.045), 0.5, 0.34);
  const r1 = writer.vertex(localPoint(wideFirst, 0.34), leafColor, 1, 0.34);
  const l2 = writer.vertex(localPoint(-wideSecond, 0.73), tipColor, 0.15, 0.73);
  const c2 = writer.vertex(localPoint(0, 0.73), tipColor.clone().multiplyScalar(1.025), 0.5, 0.73);
  const r2 = writer.vertex(localPoint(wideSecond, 0.73), tipColor, 0.85, 0.73);
  const tip = writer.vertex(localPoint(0, 1), tipColor, 0.5, 1);
  writer.triangle(b, l1, c1); writer.triangle(b, c1, r1);
  writer.triangle(l1, l2, c1); writer.triangle(l2, c2, c1);
  writer.triangle(c1, c2, r1); writer.triangle(c2, r2, r1);
  writer.triangle(l2, tip, c2); writer.triangle(c2, tip, r2);
}

/**
 * Deterministic reusable geometry variant; seed may be a string or number.
 * Unknown species use oak. Returned geometry owns no shared resources.
 * options.detail: 'high' (default), 'medium', or 'low'. All levels use actual
 * geometry; distant levels use stable subsets of the same leaf population.
 * options.leafScale defaults
 * to 1; larger values increase canopy coverage at the cost of botanical scale.
 */
export function createTreeGeometry(seed, species = 'oak', options = {}) {
  if (!Object.prototype.hasOwnProperty.call(SPECIES, species)) species = 'oak';
  const requestedDetail = typeof options === 'string' ? options : options?.detail;
  const detail = ['high', 'medium', 'low'].includes(requestedDetail) ? requestedDetail : 'high';
  const leafScale = typeof options?.leafScale === 'number' && Number.isFinite(options.leafScale)
    ? THREE.MathUtils.clamp(options.leafScale, 0.4, 3) : 1;
  const p = SPECIES[species];
  const rng = randomSource(`${species}:${seed}`);
  const between = (a, b) => a + (b - a) * rng();
  const nominalHeight = between(...p.height);
  const trunkRadius = between(...p.girth);
  const wood = new GeometryWriter(detail);
  const leaves = new GeometryWriter(detail);
  const woodColor = new THREE.Color(p.wood);
  const green = new THREE.Color(p.green);
  const stats = {
    species, seed: String(seed), detail, leafScale, architectureVersion: 3,
    roots: 0, primaryBranches: 0, secondaryBranches: 0, terminalShoots: 0,
    leaves: 0, branchJunctions: 0, lowestBranch: Infinity,
    scaffoldLeaders: 0, crownLobes: 0, inwardBoughs: 0,
    centralLeader: species !== 'oak', forkHeight: 0,
  };
  const crownRadius = nominalHeight * (species === 'oak' ? 0.318 : species === 'beech' ? 0.26 : 0.198);
  const azimuth = rng() * TAU;
  const stemHeight = nominalHeight * (species === 'oak' ? between(0.445, 0.505) : species === 'beech' ? 0.87 : 0.915);
  const lean = between(0.015, 0.037) * nominalHeight;
  const stemTarget = new THREE.Vector3(Math.cos(azimuth) * lean, stemHeight, Math.sin(azimuth) * lean);
  const trunk = growthPath(new THREE.Vector3(), stemTarget, UP, rng, 26, species === 'oak' ? 0.3 : 0.22);
  const stemEndRadius = species === 'oak' ? trunkRadius * 0.69 : 0.025;
  const trunkRadii = trunk.map((_, i) => {
    const t = i / (trunk.length - 1);
    const radius = species === 'oak'
      ? (t < 0.81 ? trunkRadius * (1 - t * 0.22) : 0.014 + trunkRadius * 0.808 * Math.pow((1 - t) / 0.19, 0.92))
      : stemEndRadius + (trunkRadius - stemEndRadius) * Math.pow(1 - t, 0.9);
    return radius * (1 + 0.55 * Math.exp(-t * 25));
  });
  const trunkSurfaceRows=tube(wood, trunk, trunkRadii, species === 'birch' ? 12 : 16, woodColor, rng, p.bark, 3);
  const rootCount = species === 'birch' ? 5 : 7;
  for (let i = 0; i < rootCount; i++) {
    rootButtress(wood, i / rootCount * TAU + between(-0.24, 0.24), trunkRadius * between(3.2, 5.2), trunkRadius * between(0.4, 0.6), trunkRadius * between(1, 1.6), woodColor, rng);
    stats.roots++;
  }

  function register(path, category) {
    stats[category]++;
    stats.branchJunctions++;
    stats.lowestBranch = Math.min(stats.lowestBranch, path[0].y);
  }

  function leafSpray(path, count, vigor = 1, startT = 0.15) {
    count=Math.round(count*2.7);
    const phase = rng() * TAU;
    for (let j = 0; j < count; j++) {
      const t = startT + (1 - startT) * (j + between(0.15, 0.85)) / count;
      const base = sample(path, t);
      const axis = tangent(path, t);
      const [u, v] = frame(axis);
      const angle = phase + j * 2.399963229728653 + between(-0.3, 0.3);
      const outward = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      const direction = axis.clone().multiplyScalar(between(0.28, 0.67)).addScaledVector(outward, 1).addScaledVector(UP, between(-0.18, 0.42)).normalize();
      const sun = THREE.MathUtils.clamp((base.y / nominalHeight - 0.44) * 0.45, 0, 0.25);
      const color = green.clone().lerp(new THREE.Color('#6c8140'), sun).multiplyScalar(vigor);
      const leafLength = between(...p.leaf) * between(0.91, 1.12) * leafScale;
      // Bound the complete seeded population, including enlarged far-LOD
      // leaves, before any culling. Every LOD therefore shares one scale.
      leaves.logicalMaxY = Math.max(leaves.logicalMaxY, base.y + leafLength * 2.1);
      addLeaf(leaves, base, direction, leafLength, p.width, color, rng, species);
      stats.leaves++;
    }
  }

  /**
   * The lobe is a set of growth targets, never a rendered sphere. Every leaf
   * is attached to a twig. Forks reach to its sides, back and interior, so
   * the mass is volumetric instead of one horizontal branch-and-leaf shelf.
   */
  function foliateLobe(bough, center, horizontalRadius, verticalRadius, boughRadius, subCount = 3, twigCount = 5) {
    stats.crownLobes++;
    leafSpray(bough, 16, 0.94, 0.78);
    const phase = rng() * TAU;
    for (let j = 0; j < subCount; j++) {
      const attachment = 0.4 + j / subCount * 0.48 + between(-0.035, 0.035);
      const origin = sample(bough, attachment);
      const a = phase + j * 2.39996 + between(-0.45, 0.45);
      const elevation = between(-0.55, 0.8);
      const reach = horizontalRadius * Math.sqrt(1 - elevation * elevation) * between(0.58, 0.95);
      const target = center.clone().add(new THREE.Vector3(Math.cos(a) * reach, elevation * verticalRadius, Math.sin(a) * reach));
      const secondary = growthPath(origin, target, tangent(bough, attachment), rng, 6, 0.85);
      const secondaryRadius = Math.max(0.017, boughRadius * Math.pow(1 - attachment, 0.9) * 0.53);
      tube(wood, secondary, taper(secondary, secondaryRadius, 0.0038), 4, woodColor, rng, 0.027);
      register(secondary, 'secondaryBranches');
      leafSpray(secondary, 12, between(0.88, 1.03), 0.65);

      for (let k = 0; k < twigCount; k++) {
        const twigT = 0.18 + k / twigCount * 0.72 + between(-0.025, 0.025);
        const twigOrigin = sample(secondary, twigT);
        // Distribute growth points through a broad angular sector, instead
        // of packing all five twigs around a secondary branch's endpoint.
        // Adjacent sectors interlock, and a central target fills the lobe.
        const twigAngle = a - 1.08 + k / Math.max(1, twigCount - 1) * 2.16 + between(-0.23, 0.23);
        const twigElevation = between(-0.75, 0.82);
        const twigReach = horizontalRadius * (k === 2 ? between(0.16, 0.36) : between(0.57, 1.04));
        const twigTarget = center.clone().add(new THREE.Vector3(
          Math.cos(twigAngle) * twigReach,
          twigElevation * verticalRadius,
          Math.sin(twigAngle) * twigReach,
        ));
        if (species === 'birch') twigTarget.y -= between(0.05, 0.32);
        const twig = growthPath(twigOrigin, twigTarget, tangent(secondary, twigT), rng, 4, 0.64);
        const twigRadius = Math.max(0.006, secondaryRadius * (1 - twigT) * 0.39);
        tube(wood, twig, taper(twig, twigRadius, 0.0016), 3, woodColor.clone().multiplyScalar(0.8), rng, 0.015);
        register(twig, 'terminalShoots');
        leafSpray(twig, 18, between(0.9, 1.04), 0.12);

        const sprigPhase = rng() * TAU;
        for (let s = 0; s < 6; s++) {
          const sprigT = 0.12 + s * 0.14;
          const start = sample(twig, sprigT);
          const axis = tangent(twig, sprigT);
          const [u, v] = frame(axis);
          const angle = sprigPhase + s * 2.39996 + between(-0.25, 0.25);
          const direction = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle))
            .addScaledVector(axis, 0.36).addScaledVector(UP, species === 'birch' ? -0.07 : 0.12).normalize();
          const end = start.clone().addScaledVector(direction, between(0.32, 0.62));
          const sprig = [start, end];
          tube(wood, sprig, [0.0036, 0.0011], 3, woodColor.clone().multiplyScalar(0.83), rng, 0);
          register(sprig, 'terminalShoots');
          leafSpray(sprig, 12, between(0.9, 1.04), 0.05);
        }
      }
    }
  }

  const scaffolds = [];
  if (species === 'oak') {
    // The main stem physically ends here: no continuous trunk runs through
    // the crown. Competing leaders receive fractions of the parent area.
    const count = 2 + Math.floor(rng() * 3);
    const weights = Array.from({ length: count }, () => between(0.65, 1.2));
    const total = weights.reduce((a, b) => a + b, 0);
    stats.forkHeight = Infinity;
    for (let i = 0; i < count; i++) {
      const t = i === 0 ? 0.83 : between(0.805, 0.855);
      const origin = sample(trunk, t);
      stats.forkHeight = Math.min(stats.forkHeight, origin.y);
      const angle = azimuth + i / count * TAU + between(-0.37, 0.37);
      const radial = crownRadius * between(0.38, 0.63);
      const target = new THREE.Vector3(Math.cos(angle) * radial, nominalHeight * between(0.79, 0.86), Math.sin(angle) * radial);
      const path = divergingLeaderPath(origin, target, rng, 20);
      const radius = stemEndRadius * Math.sqrt(weights[i] / total) * 1.04;
      tube(wood, path, taper(path, radius, 0.023, 0.88), 10, woodColor, rng, p.bark * 0.8, 1.7);
      register(path, 'primaryBranches');
      scaffolds.push({ path, radius, angle, attachMin: 0.39, attachSpan: 0.51, boughs: count === 2 ? 5 : count === 3 ? 4 : 3 });
    }
  } else {
    // A central leader is credible for beech/birch, but two competing side
    // leaders and nested forks replace the old rings of radial spokes.
    scaffolds.push({ path: trunk, radius: trunkRadius * 0.44, angle: azimuth, attachMin: 0.58, attachSpan: 0.37, boughs: 4, central: true });
    for (let i = 0; i < 2; i++) {
      const t = (species === 'birch' ? 0.49 : 0.44) + i * 0.17 + between(-0.035, 0.035);
      const origin = sample(trunk, t);
      const angle = azimuth + i * 2.65 + between(-0.6, 0.6);
      const reach = crownRadius * between(0.42, 0.64);
      const target = new THREE.Vector3(Math.cos(angle) * reach, nominalHeight * between(0.8, 0.88), Math.sin(angle) * reach);
      const path = divergingLeaderPath(origin, target, rng, 16);
      const radius = trunkRadius * Math.pow(1 - t, 0.8) * between(0.53, 0.64);
      tube(wood, path, taper(path, radius, 0.014), 8, woodColor, rng, p.bark * 0.7);
      register(path, 'primaryBranches');
      scaffolds.push({ path, radius, angle, attachMin: 0.35, attachSpan: 0.55, boughs: 4 });
    }
  }
  stats.scaffoldLeaders = scaffolds.length;

  for (const scaffold of scaffolds) {
    for (let j = 0; j < scaffold.boughs; j++) {
      const t = scaffold.attachMin + j / Math.max(1, scaffold.boughs - 1) * scaffold.attachSpan + between(-0.025, 0.025);
      const origin = sample(scaffold.path, t);
      const inward = j >= 2 && !(scaffold.boughs === 5 && j === 3);
      const angle = scaffold.central
        ? scaffold.angle + j * 2.13 + between(-0.6, 0.6)
        : scaffold.angle + (j === 0 ? -1.02 : j === 1 ? 0.96 : j === 2 ? 1.5 : j === 3 ? -0.06 : -0.7) + between(-0.33, 0.33);
      const radial = crownRadius * (inward ? between(0.17, 0.38) : between(0.63, 0.84));
      const lobeY = nominalHeight * (j === 0 ? between(0.68, 0.76) : j === 1 ? between(0.77, 0.85)
        : j === 2 ? between(0.765, 0.82) : inward ? between(0.86, 0.92) : between(0.82, 0.88));
      const center = new THREE.Vector3(Math.cos(angle) * radial, lobeY, Math.sin(angle) * radial);
      const end = center.clone().add(new THREE.Vector3(between(-0.22, 0.22), between(-0.32, 0.04), between(-0.22, 0.22)));
      const bough = growthPath(origin, end, tangent(scaffold.path, t), rng, 12, species === 'oak' ? 0.83 : 0.66);
      const radius = Math.max(0.038, scaffold.radius * Math.pow(1 - t, 0.73) * between(0.5, 0.72));
      tube(wood, bough, taper(bough, radius, 0.007, 1.03), 6, woodColor, rng, p.bark * 0.55);
      register(bough, 'primaryBranches');
      if (inward) stats.inwardBoughs++;
      const horizontalRadius = crownRadius * between(inward ? 0.29 : 0.31, inward ? 0.38 : 0.4);
      const verticalRadius = nominalHeight * between(0.1, 0.135);
      foliateLobe(bough, center, horizontalRadius, verticalRadius, radius);
    }
  }

  // Lower growth has its own seed so pruning history varies without changing
  // the main crown, its leaf ordinals, or its geometry at any detail level.
  const lowerGrowth = randomSource(`${species}:${seed}:lower-growth`);
  const retainsLowerLimbs = (hashSeed(`${species}:${seed}:lower-branches`) & 1) === 0;
  const lowCount = retainsLowerLimbs ? (species === 'oak' ? 2 : 1) : 0;
  stats.lowerLiveLimbs = lowCount;
  stats.epicormicSprigs = 0;
  for (let i = 0; i < lowCount; i++) {
    const t = species === 'oak' ? between(0.56, 0.75) : between(0.29, 0.4);
    const origin = sample(trunk, t);
    const angle = azimuth + 1.9 + i * 2.5 + between(-0.55, 0.55);
    const reach = crownRadius * between(0.35, 0.58);
    const center = origin.clone().add(new THREE.Vector3(Math.cos(angle) * reach, nominalHeight * between(0.065, 0.12), Math.sin(angle) * reach));
    const path = growthPath(origin, center, tangent(trunk, t).lerp(new THREE.Vector3(Math.cos(angle), 0.2, Math.sin(angle)), 0.62), rng, 8, 1.1);
    const radius = trunkRadius * between(0.12, 0.18);
    tube(wood, path, taper(path, radius, 0.004), 6, woodColor, rng, p.bark * 0.55);
    register(path, 'primaryBranches');
    foliateLobe(path, center, crownRadius * 0.17, nominalHeight * 0.04, radius, 2, 3);
  }

  // Occasional short epicormic shoots emerge through the trunk surface.
  // They carry only a few leaves and do not form a repeated floating lobe.
  const epicormicCount = !retainsLowerLimbs && hashSeed(`${species}:${seed}:epicormic-shoots`) % 4 === 1
    ? 2 + Math.floor(lowerGrowth() * 3) : 0;
  for (let i = 0; i < epicormicCount; i++) {
    const t = 0.2 + i / Math.max(1, epicormicCount - 1) * 0.34 + (lowerGrowth() - 0.5) * 0.08;
    const origin = sample(trunk, t);
    const angle = azimuth + lowerGrowth() * TAU;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const radiusIndex = t * (trunkRadii.length - 1);
    const radius = THREE.MathUtils.lerp(trunkRadii[Math.floor(radiusIndex)], trunkRadii[Math.ceil(radiusIndex)], radiusIndex % 1);
    const shoulder = origin.clone().addScaledVector(outward, radius * 1.14).addScaledVector(UP, 0.04);
    const end = shoulder.clone().addScaledVector(outward, 0.2 + lowerGrowth() * 0.26)
      .addScaledVector(UP, 0.12 + lowerGrowth() * 0.2);
    const shoot = [origin, shoulder, end];
    tube(wood, shoot, [0.009, 0.0045, 0.0012], 3, woodColor, rng, 0.012);
    register(shoot, 'terminalShoots');
    leafSpray(shoot, 6, 0.94, 0.68);
    stats.epicormicSprigs++;
  }

  const woodGeometry = wood.finish(`${species}-wood-${seed}`);
  const leafGeometry = leaves.finish(`${species}-leaves-${seed}`);
  let box = woodGeometry.boundingBox.clone().union(leafGeometry.boundingBox);
  const treeScale = Math.min(1, 26 / Math.max(wood.logicalMaxY, leaves.logicalMaxY));
  if (treeScale < 1) {
    for (const geometry of [woodGeometry, leafGeometry]) {
      geometry.scale(treeScale, treeScale, treeScale);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    stats.lowestBranch *= treeScale; stats.forkHeight *= treeScale;
    box = woodGeometry.boundingBox.clone().union(leafGeometry.boundingBox);
  }
  let radius = 0;
  for (const geometry of [woodGeometry, leafGeometry]) {
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getZ(i)));
  }
  woodGeometry.userData.trunkSurfaceRows=trunkSurfaceRows;
  stats.woodTriangles = woodGeometry.index.count / 3;
  stats.leafTriangles = leafGeometry.index.count / 3;
  stats.triangles = stats.woodTriangles + stats.leafTriangles;
  stats.vertices = woodGeometry.attributes.position.count + leafGeometry.attributes.position.count;
  stats.logicalLeaves = stats.leaves;
  stats.leaves = leaves.leafCount;
  leafGeometry.userData.leafBaseIndices = new Uint32Array(leaves.leafBases);
  if (typeof options === 'object' && options?.debug) {
    woodGeometry.userData.stemPath = new Float32Array(trunk.flatMap(point => [point.x * treeScale, point.y * treeScale, point.z * treeScale]));
    woodGeometry.userData.scaffoldPaths = scaffolds.map(scaffold => ({
      central: Boolean(scaffold.central),
      radius: scaffold.radius * treeScale,
      points: new Float32Array(scaffold.path.flatMap(point => [point.x * treeScale, point.y * treeScale, point.z * treeScale])),
    }));
  }
  stats.nominalHeight = nominalHeight * treeScale;
  stats.crownMinY = leafGeometry.boundingBox.min.y;
  stats.forkHeightRatio = stats.forkHeight / box.max.y;
  return { wood: woodGeometry, leaves: leafGeometry, height: box.max.y, radius, stats };
}
