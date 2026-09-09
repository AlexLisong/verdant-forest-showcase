import * as THREE from 'three';import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const {createVegetation}=await import('../artifacts/qa-modules/vegetation.mjs');const {heightAt}=await import('../artifacts/qa-modules/math.mjs');
const scene=new THREE.Scene(),vegetation=await createVegetation(scene,false),camera=new THREE.PerspectiveCamera(58,1.6,.06,260),frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
const originals=scene.children.filter(o=>o.userData.kind==='tree').map(mesh=>{
 const a=mesh.instanceMatrix.array,cx=Math.floor(a[12]/20),cz=Math.floor(a[14]/20);
 for(let i=0;i<mesh.count;i++){assert.equal(Math.floor(a[i*16+12]/20),cx);assert.equal(Math.floor(a[i*16+14]/20),cz);}
 return {mesh,x:cx*20+10,z:cz*20+10};
});
const signature=(mesh,index)=>`${mesh.geometry.id}:${mesh.material.id}:`+crypto.createHash('sha256').update(Buffer.from(mesh.instanceMatrix.array.buffer,mesh.instanceMatrix.array.byteOffset+index*64,64)).digest('hex');
const results=[];let checkedInstances=0;
for(let i=0;i<48;i++){
 const angle=i*.52,x=Math.sin(i*.67)*68,z=Math.cos(i*.83)*68;camera.position.set(x,heightAt(x,z)+(i%6===0?18:2),z);camera.lookAt(x+Math.sin(angle)*20,camera.position.y+(i%6===0?-10:1),z-Math.cos(angle)*20);camera.updateMatrixWorld();vegetation.update(camera,1);scene.updateMatrixWorld(true);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
 const expected=[],actual=[];let baselineDraws=0,pooledDraws=0,baselineTriangles=0,pooledTriangles=0;
 for(const {mesh,x:cx,z:cz} of originals){if(Math.hypot(x-cx,z-cz)>=250)continue;for(let j=0;j<mesh.count;j++)expected.push(signature(mesh,j));if(frustum.intersectsObject(mesh)){baselineDraws++;baselineTriangles+=mesh.geometry.index.count/3*mesh.count;}}
 scene.traverseVisible(mesh=>{if(!(mesh instanceof THREE.InstancedMesh)||mesh.userData.kind!=='tree')return;for(let j=0;j<mesh.count;j++)actual.push(signature(mesh,j));if(frustum.intersectsObject(mesh)){pooledDraws++;pooledTriangles+=mesh.geometry.index.count/3*mesh.count;}});
 assert.deepEqual(actual.sort(),expected.sort(),`exact tree geometry/material/matrix multiset at view${i}`);checkedInstances+=actual.length;results.push({i,instances:actual.length,baselineDraws,pooledDraws,baselineTriangles,pooledTriangles});
}
const mean=key=>results.reduce((sum,r)=>sum+r[key],0)/results.length;
const result={views:results.length,checkedInstances,allGeometryMaterialMatrixMultisetsIdentical:true,meanOriginalTreeDraws:mean('baselineDraws'),meanPooledTreeDraws:mean('pooledDraws'),meanOriginalTreeTriangles:mean('baselineTriangles'),meanPooledTreeTriangles:mean('pooledTriangles'),results,limits:'Actual application scene CPU membership/frustum audit, same geometry and camera in both conditions; no browser or FPS measurement.'};fs.writeFileSync('artifacts/distant-tree-integration-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,results:undefined}));
