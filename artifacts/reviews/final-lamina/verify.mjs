import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const D='/workspace/scratch/46479389b383/crown-audit/final-lamina';const r=JSON.parse(fs.readFileSync(D+'/evidence.json','utf8'));
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(r.source)).digest('hex'),r.sourceHash,'Source changed after audit');
assert.equal(r.variants.length,24);assert.equal(r.families.length,8);assert.equal(r.leafScale,1.2);
assert.deepEqual(r.families.map(f=>f.seed),[215,1034,1853,2672,3491,4310,5129,5948]);
const mode=process.argv[2];
if(mode==='geometry'){
for(const v of r.variants){for(const k of ['wood','leaves'])for(const x of ['nonFinite','badAttributeLengths','badIndices','zeroNormals','badNormals','degenerate','zeroArea','badLeafUVs'])assert.equal(v[k][x],0);assert.equal(v.stats.triangles,v.wood.triangles+v.leaves.triangles);}
console.log('GEOMETRY_PASS 24 variants');
}else if(mode==='lod'){
for(const f of r.families){assert.equal(f.lods.length,3);for(const l of f.lods){assert.equal(l.leafCount,l.expectedLeaves);assert.equal(l.anchorMismatches,0);assert.equal(l.maxAnchorDelta,0);assert.equal(l.pathHashMatchesHigh,true);}}
console.log('LOD_PASS 8 families');
}else if(mode==='bounds'){
for(const v of r.variants){for(const k of ['wood','leaves']){assert.equal(v[k].boxEscapes,0);assert.equal(v[k].sphereEscapes,0);}assert.equal(v.outputBoundEscapes,0);assert(Number.isFinite(v.bounds.height));assert(Number.isFinite(v.bounds.radius));assert(v.bounds.height<=26);assert(v.wood.bounds.min[1]>=-1e-6);}
console.log('BOUNDS_PASS 24 variants');
}else throw new Error('Unknown verification mode');
