import * as THREE from 'three';import fs from 'node:fs';
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const {compactGeometryAttributes}=await import('../artifacts/qa-modules/geometry-memory.mjs');
const {createVegetation}=await import('../artifacts/qa-modules/vegetation.mjs');
const {createGround,createRocks,createDeadwood,createLitter,createMushrooms}=await import('../artifacts/qa-modules/surfaces.mjs');
const {createForestDetails}=await import('../artifacts/qa-modules/details.mjs');
const scene=new THREE.Scene(),start=performance.now();createGround(scene);const rocks=createRocks(scene);createLitter(scene);createMushrooms(scene);
const vegetation=await createVegetation(scene,process.argv.includes('--coarse'));
const vegetationSeconds=(performance.now()-start)/1000;createDeadwood(scene,vegetation.bark);const detail=createForestDetails(scene,vegetation.treePositions,rocks,vegetation.bark,process.argv.includes('--coarse'),vegetation.treeSurfaces);
const packing=compactGeometryAttributes(scene);
const arrays=new Set(),geometries=new Set(),materials=new Set();let compactBytes=0,compactInstances=0,instanceBytes=0;
scene.traverse(o=>{if(!o.isMesh&&!o.isPoints)return;geometries.add(o.geometry);for(const lod of o.userData.lods||[])geometries.add(lod);materials.add(o.material);for(const a of [o.instanceMatrix,o.instanceColor])if(a){arrays.add(a.array.buffer);instanceBytes+=a.array.byteLength;}});
for(const g of geometries){for(const a of Object.values(g.attributes))arrays.add(a.array.buffer);if(g.index)arrays.add(g.index.array.buffer);if(g.attributes.forestPlacement&&!g.userData.auditCounted){const p=g.attributes.forestPlacement;if(!p._counted){p._counted=true;compactInstances+=p.count;compactBytes+=p.array.byteLength+g.attributes.forestScale.array.byteLength+g.attributes.forestRank.array.byteLength;}}}
const result={coarse:process.argv.includes('--coarse'),packing,vegetationSeconds,totalConstructionSeconds:(performance.now()-start)/1000,geometryCount:geometries.size,materialCount:materials.size,uniqueBufferBytes:[...arrays].reduce((sum,a)=>sum+a.byteLength,0),compactBytes,compactInstances,fullMatrixEquivalentBytes:compactInstances*76,otherInstanceBytes:instanceBytes,...vegetation.stats,...detail.stats,processMemory:process.memoryUsage(),limits:'Node CPU construction and raw typed-array memory only; excludes browser, driver, textures and render targets.'};
if(process.env.FOREST_BOUNDARIES==='1'){const {auditSceneBoundaries}=await import('./audit-scene-boundaries.mjs');auditSceneBoundaries({scene,vegetation,THREE});}
fs.writeFileSync(`artifacts/memory-${result.coarse?'coarse':'desktop'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
