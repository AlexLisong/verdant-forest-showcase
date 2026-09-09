import fs from 'node:fs';import assert from 'node:assert/strict';
const directory=process.env.FOREST_QA_DIR||'artifacts/scene-data';
const s=JSON.parse(fs.readFileSync(directory+'/scene.json','utf8'));let triangles=0,instances=0,empty=0;
for(const [name,g] of Object.entries(s.geometries)){
 for(const [a,desc]of Object.entries(g.attributes)){const b=fs.readFileSync(directory+'/'+desc.file);const f=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);for(const v of f)assert(Number.isFinite(v),`${name}.${a} invalid`);}
}
for(const o of s.objects){const count=o.compactData?.count??o.instances?.count??1;if(!count)empty++;instances+=count;const g=s.geometries[o.geometry];triangles+=(g.index?.count??g.attributes.position.count)/3*count;assert(o.matrix.every(Number.isFinite));}
const result={source:s.source?.sha256,description:"Finite exported geometry and full construction inventory. Triangle/instance totals include mutually exclusive LOD meshes and pooled capacity, so they are not a visible draw budget.",geometryCount:Object.keys(s.geometries).length,objectCount:s.objects.length,instances,triangles,empty,...s.stats,finite:true};fs.writeFileSync('artifacts/integration-audit.json',JSON.stringify(result,null,2));console.log(result);
