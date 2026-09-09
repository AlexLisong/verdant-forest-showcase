import * as THREE from 'three';
import {FOREST_EXTENT} from './config';
import {noise,fbm,heightAt,rng,trailDistance} from './math';
import {mossRockMaterial, deadwoodMaterial, groundMaterial, texture} from './materials';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
export const DEADWOOD_PLACEMENTS=[[-6,3,4.8,.39,1.1],[6,-7,6.2,.52,2.2],[-14,-12,8.8,.56,1.9],[22,10,5.2,.42,.5],[-27,-25,7.1,.45,2.7],[17,-32,6.6,.63,1.1],[36,-17,8.3,.63,2.8]];
const deadwoodFootprints=DEADWOOD_PLACEMENTS.map(([x,z,length,radius,angle])=>({x,z,length,radius,c:Math.cos(angle),s:Math.sin(angle)}));
export function insideDeadwood(x:number,z:number){
 for(const {x:lx,z:lz,length,radius,c,s} of deadwoodFootprints){
  const dx=x-lx,dz=z-lz;
  const along=dx*c-dz*s,across=dx*s+dz*c;
  if(Math.abs(along)<length*.5+.08&&Math.abs(across)<radius*.95)return true;
 }
 return false;
}
export function createGround(scene:THREE.Scene) {
 const g=new THREE.PlaneGeometry(FOREST_EXTENT.terrain,FOREST_EXTENT.terrain,FOREST_EXTENT.terrainSegments,FOREST_EXTENT.terrainSegments);g.rotateX(-Math.PI/2);
 const p=g.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,heightAt(x,z));const n=fbm(x*.14,z*.14),d=trailDistance(x,z); const c=new THREE.Color().setRGB(.48+n*.12,.53+n*.17,.34+n*.1); if(d<.6)c.multiplyScalar(.78); colors.push(c.r,c.g,c.b);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 // Keep the physical texture scale and phase as the distant ground expands.
 const repeat=FOREST_EXTENT.terrain*.64;
 const diffuse=texture('/textures/ground-color.jpg',true,repeat),normal=texture('/textures/ground-normal.jpg',false,repeat);
 const m=groundMaterial(diffuse,normal);
 const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
export function rockGeometry(seed:number) {
 const r=rng(seed),g=new THREE.IcosahedronGeometry(1,4),p=g.attributes.position,c=[];
 const sx=.7+r()*.9,sy=.44+r()*.6,sz=.6+r()*.85;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const f=.80+noise(x*3+seed,y*2+z*2)*.3+noise(x*11+z*3,y*7)*.05;p.setXYZ(i,x*f*sx,y*f*sy,z*f*sz);const q=.76+noise(x*17,y*16+z)*.22;c.push(q,q,q*.97);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.deleteAttribute('normal');g.deleteAttribute('uv');const smooth=mergeVertices(g,1e-4);smooth.computeVertexNormals();g.dispose();return smooth;
}
export function createRocks(scene:THREE.Scene){
 const r=rng(899),o=new THREE.Object3D(),mat=mossRockMaterial(),rocks:THREE.InstancedMesh[]=[];
 for(let v=0;v<5;v++){const geo=rockGeometry(v*11+43),mesh=new THREE.InstancedMesh(geo,mat,90);mesh.userData.footprints=[];for(let i=0;i<90;i++){let x=(r()-.5)*220,z=(r()-.5)*220;let s=i<60?.18+r()*.55:.65+r()*1.6;
 if(v===0&&i<4){x=[-3.7,5.2,6.4,-8.5][i];z=[7,1,-.5,-11][i];s=[1.3,2,1.5,2.4][i];}
 mesh.userData.footprints.push({x,z,r:s*.88});o.position.set(x,heightAt(x,z)+s*.12,z);o.rotation.set((r()-.5)*.3,r()*6.28,(r()-.5)*.2);o.scale.setScalar(s);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}
 mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);rocks.push(mesh);}
 return rocks;
}
function brokenEnd(surface:THREE.BufferGeometry,side:number,sides:number,rows:number,radius:number,material:THREE.Material){
 const p=surface.attributes.position,position:number[]=[],uv:number[]=[],indices:number[]=[],colors:number[]=[];
 const ringRow=side<0?0:rows;
 const push=(v:THREE.Vector3,color:number)=>{position.push(v.x,v.y,v.z);uv.push(v.z/(radius*2)+.5,v.y/(radius*2)+.5);colors.push(color,color*.94,color*.81);return position.length/3-1;};
 const outer:THREE.Vector3[]=[],outerIDs:number[]=[],innerIDs:number[]=[],backIDs:number[]=[];
 for(let j=0;j<sides;j++){
  const v=new THREE.Vector3().fromBufferAttribute(p,ringRow*(sides+1)+j);outer.push(v);outerIDs.push(push(v,.69+.12*Math.sin(j*1.7)));
 }
 const center=new THREE.Vector3();outer.forEach(v=>center.add(v));center.multiplyScalar(1/sides);
 for(let j=0;j<sides;j++){
  const v=outer[j].clone().sub(center).multiplyScalar(.59+.08*Math.sin(j*2.1)).add(center);v.x-=side*(.018+.035*Math.sin(j*3.7));innerIDs.push(push(v,.62));
  const back=v.clone();back.x-=side*(.23+radius*.4);back.y*=.77;back.z*=.77;backIDs.push(push(back,.12));
 }
 const backCenter=push(center.clone().add(new THREE.Vector3(-side*(.27+radius*.4),0,0)),.055);
 for(let j=0;j<sides;j++){
  const k=(j+1)%sides;
  indices.push(outerIDs[j],outerIDs[k],innerIDs[j],outerIDs[k],innerIDs[k],innerIDs[j]);
  indices.push(innerIDs[j],innerIDs[k],backIDs[j],innerIDs[k],backIDs[k],backIDs[j]);
  indices.push(backIDs[j],backIDs[k],backCenter);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;return mesh;
}
export function createDeadwood(scene:THREE.Scene,bark:THREE.Material){
 const r=rng(616),logs:THREE.Object3D[]=[];const logMaterial=deadwoodMaterial(bark as THREE.MeshStandardMaterial);
 const endMat=new THREE.MeshStandardMaterial({color:'#c3a273',map:texture('/textures/endgrain.jpg',true),vertexColors:true,roughness:.98,side:THREE.DoubleSide});
 for(const [x,z,len,rad,angle] of DEADWOOD_PLACEMENTS){
  const group=new THREE.Group(),sides=28,rows=22;
  const geo=new THREE.CylinderGeometry(rad*.72,rad,len,sides,rows,true);geo.rotateZ(Math.PI/2);const p=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<p.count;i++){
   const px=p.getX(i),y=p.getY(i),pz=p.getZ(i),theta=Math.atan2(pz,y),n=noise(px*4+22,pz*6+y*8);
   const endWeight=Math.pow(Math.abs(px)/(len*.5),12);
   const ragged=(Math.sin(theta*7.7)*.085+Math.sin(theta*13.3+.7)*.033)*endWeight;
   p.setXYZ(i,px+ragged,(y+Math.sin(px*.6)*.08)*(1+n*.09),pz*(.93+n*.14));
   uv.setXY(i,uv.getX(i)*2,uv.getY(i)*len/1.8);
  }
  geo.computeVertexNormals();const log=new THREE.Mesh(geo,logMaterial);log.userData.mossSurface=true;log.castShadow=log.receiveShadow=true;group.add(log);
  for(const side of [-1,1])group.add(brokenEnd(geo,side,sides,rows,rad,endMat));
  // Splinters jut from the broken rim; each is a tapered solid shard.
  for(let i=0;i<14;i++){
   const side=i%2?1:-1,theta=r()*Math.PI*2,length=.13+r()*.33;
   const splinter=new THREE.CylinderGeometry(0,.018+r()*.025,length,3,1);
   splinter.translate(0,length*.5,0);
   const shard=new THREE.Mesh(splinter,endMat);shard.position.set(side*len*.5,Math.cos(theta)*rad*.64,Math.sin(theta)*rad*.65);
   shard.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(side,(r()-.5)*.7,(r()-.5)*.7).normalize());shard.castShadow=true;group.add(shard);
  }
  for(let i=0;i<5;i++){
   const length=.3+r()*.8,branch=new THREE.Mesh(new THREE.CylinderGeometry(.023,.095,length,9,4),bark);
   branch.position.set((r()-.5)*len,rad*.72+length*.3,(r()-.5)*rad);branch.rotation.z=(r()-.5)*1.5;branch.castShadow=branch.receiveShadow=true;group.add(branch);
  }
  group.position.set(x,heightAt(x,z)+rad*.66,z);group.rotation.y=angle;scene.add(group);logs.push(group);
 }
 return logs;
}
export function litterGeometry(seed:number){const r=rng(seed),shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-.038,.017,-.07,.05,-.037,.091);shape.quadraticCurveTo(-.011,.12,0,.14);shape.quadraticCurveTo(.018,.10,.04,.073);shape.quadraticCurveTo(.06,.036,0,0);const g=new THREE.ShapeGeometry(shape,3);g.rotateX(-Math.PI/2);const p=g.attributes.position,c=[];for(let i=0;i<p.count;i++){const z=p.getZ(i),x=p.getX(i);p.setY(i,.008+Math.sin(-z*25)*.022+Math.abs(x)*.15);const n=.78+r()*.22;c.push(.28*n,.15*n,.047*n);}g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeVertexNormals();return g;}
export function createLitter(scene:THREE.Scene){const r=rng(516),o=new THREE.Object3D(),m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});const mesh=new THREE.InstancedMesh(litterGeometry(55),m,17000);for(let i=0;i<17000;i++){const x=(r()-.5)*150,z=(r()-.5)*150;o.position.set(x,heightAt(x,z)+.012,z);o.rotation.set(0,r()*6.28,0);o.scale.setScalar(.6+r()*1.1);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}mesh.receiveShadow=true;scene.add(mesh);return mesh;}
export function createMushrooms(scene:THREE.Scene){const r=rng(735),gs=[];const cap=new THREE.SphereGeometry(.066,12,7,0,Math.PI*2,0,Math.PI*.55);cap.translate(0,.14,0);const stem=new THREE.CylinderGeometry(.012,.018,.16,7);stem.translate(0,.07,0);for(const g of [cap,stem]){const c=[];for(let i=0;i<g.attributes.position.count;i++)c.push(g===cap?.38:.56,g===cap?.23:.49,g===cap?.11:.35);g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));gs.push(g.toNonIndexed());}const geo=mergeGeometries(gs),mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}),mesh=new THREE.InstancedMesh(geo,mat,400),o=new THREE.Object3D();for(let i=0;i<400;i++){const patch=Math.floor(i/8),x=Math.sin(patch*18.37)*44+(r()-.5)*.9,z=Math.cos(patch*7.26)*44+(r()-.5)*.9;o.position.set(x,heightAt(x,z),z);o.rotation.set((r()-.5)*.3,r()*6.28,(r()-.5)*.3);o.scale.setScalar(.65+r()*1.2);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;}
