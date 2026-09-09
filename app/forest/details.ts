import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {heightAt,rng,noise} from './math';
import {windMaterial} from './materials';
import {createTrunkLife,type TreeSurface} from './trunk-life';


type TreePosition={x:number,z:number,s:number,v:number,rot:number};
type DetailBatch={mesh:THREE.InstancedMesh,center:THREE.Vector3,range:number};
const UP=new THREE.Vector3(0,1,0);

function mossClump(seed:number){
 const r=rng(seed),positions:number[]=[],colors:number[]=[],uvs:number[]=[];
 const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,color:THREE.Color)=>{
  for(const [i,v]of [a,b,c].entries()){positions.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);uvs.push(i===1?0:1,i===2?1:0);}
 };
 for(let shoot=0;shoot<9;shoot++){
  const a=r()*Math.PI*2,h=.018+r()*.055,bx=(r()-.5)*.045,bz=(r()-.5)*.045;
  const stem=new THREE.Vector3(bx,0,bz),tip=new THREE.Vector3(bx+Math.cos(a)*h*.25,h,bz+Math.sin(a)*h*.25);
  const color=new THREE.Color().setHSL(.23+r()*.035,.42+r()*.14,.095+r()*.055);
  for(let j=1;j<7;j++){
   const t=j/7,center=stem.clone().lerp(tip,t),spread=(1-t)*.0055+.0008;
   const direction=new THREE.Vector3(Math.cos(a+j*2.4),.48,Math.sin(a+j*2.4)).normalize();
   const side=new THREE.Vector3().crossVectors(direction,UP).normalize().multiplyScalar(spread*.24);
   const end=center.clone().addScaledVector(direction,spread);
   triangle(center.clone().add(side),center.clone().sub(side),end,color);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();return g;
}

function twigGeometry(seed:number){
 const r=rng(seed),points=[];
 const length=.25+r()*.65;
 for(let i=0;i<7;i++){const t=i/6;points.push(new THREE.Vector3(length*(t-.5),.015+Math.sin(t*2.8)*.014,Math.sin(t*4.5)*.035));}
 const path=new THREE.CatmullRomCurve3(points);
 const g=new THREE.TubeGeometry(path,8,.008+r()*.006,5,false);
 const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const t=(p.getX(i)/length+.5);p.setY(i,p.getY(i)*(.3+Math.max(0,1-t)*.7));}
 g.computeVertexNormals();return g;
}

function rootGeometry(tree:TreePosition,seed:number){
 const r=rng(seed),geometries:THREE.BufferGeometry[]=[];
 const rootCount=5+Math.floor(r()*4);
 for(let root=0;root<rootCount;root++){
  const angle=root/rootCount*Math.PI*2+r()*.7,length=(1.1+r()*1.7)*tree.s;
  const points=[];
  for(let i=0;i<=10;i++){
   const t=i/10,reach=.3*tree.s+length*t,sway=Math.sin(t*4.7)*.15;
   const x=tree.x+Math.cos(angle)*reach-Math.sin(angle)*sway;
   const z=tree.z+Math.sin(angle)*reach+Math.cos(angle)*sway;
   points.push(new THREE.Vector3(x,heightAt(x,z)+(.12*(1-t)**1.8-.012)*tree.s,z));
  }
  const path=new THREE.CatmullRomCurve3(points),geo=new THREE.TubeGeometry(path,15,.08*tree.s,7,false);
  const p=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<p.count;i++){
   const t=uv.getX(i),center=path.getPointAt(t),f=.025+Math.pow(1-t,1.3);
   p.setXYZ(i,center.x+(p.getX(i)-center.x)*f,center.y+(p.getY(i)-center.y)*f*.62,center.z+(p.getZ(i)-center.z)*f);
   uv.setXY(i,uv.getY(i),t*length/1.8);
  }
  geo.computeVertexNormals();geometries.push(geo);
 }
 const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());return merged;
}

export function createForestDetails(scene:THREE.Scene,trees:TreePosition[],rocks:THREE.InstancedMesh[],bark:THREE.MeshStandardMaterial,coarse:boolean,treeSurfaces:TreeSurface[]=[]){
 const batches:DetailBatch[]=[],r=rng(846291),dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
 const moss=mossClump(831),mossMaterial=windMaterial('grass',{roughness:1});
 moss.computeBoundingSphere();moss.boundingSphere!.radius+=.02;
 const mossCells=new Map<string,Array<{point:THREE.Vector3,normal:THREE.Vector3,scale:number}>>();
 function addMoss(point:THREE.Vector3,normal:THREE.Vector3,scale:number){
  const key=`${Math.floor(point.x/10)},${Math.floor(point.z/10)}`;
  if(!mossCells.has(key))mossCells.set(key,[]);mossCells.get(key)!.push({point,normal,scale});
 }
 // Both stones and logs are sampled directly from their transformed meshes.
 // No approximate height shell can leave a visible air gap below the moss.
 function sampleSurface(geometry:THREE.BufferGeometry,world:THREE.Matrix4,count:number,scale=1){
  const p=geometry.attributes.position,index=geometry.index;
  const triangleCount=(index?index.count:p.count)/3;
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(world);
  for(let i=0;i<count;i++){
   const triangle=Math.floor(r()*triangleCount)*3;
   const indices=[0,1,2].map(offset=>index?index.getX(triangle+offset):triangle+offset);
   const a=new THREE.Vector3().fromBufferAttribute(p,indices[0]);
   const b=new THREE.Vector3().fromBufferAttribute(p,indices[1]);
   const c=new THREE.Vector3().fromBufferAttribute(p,indices[2]);
   const normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a)).applyMatrix3(normalMatrix).normalize();
   if(normal.y<.24)continue;
   let u=r(),v=r();if(u+v>1){u=1-u;v=1-v;}
   const point=a.clone().addScaledVector(b.sub(a),u).addScaledVector(c.sub(a),v).applyMatrix4(world);
   if(point.y<heightAt(point.x,point.z)+.012||noise(point.x*3+7,point.z*3)<.31)continue;
   addMoss(point.addScaledVector(normal,-.002),normal,(.65+r()*.85)*scale);
  }
 }
 for(const rock of rocks){
  for(let instance=0;instance<rock.count;instance++){
   rock.getMatrixAt(instance,matrix);const center=new THREE.Vector3().setFromMatrixPosition(matrix);
   if(Math.hypot(center.x,center.z)>115)continue;
   const scale=new THREE.Vector3().setFromMatrixScale(matrix).x;
   sampleSurface(rock.geometry,matrix,Math.floor(Math.min(16000,1900*scale*scale)*(coarse?.58:1)));
  }
 }
 scene.updateMatrixWorld(true);
 scene.traverse(object=>{
  if(object instanceof THREE.Mesh&&object.userData.mossSurface){
   object.geometry.computeBoundingBox();const length=object.geometry.boundingBox!.getSize(new THREE.Vector3()).x;
   sampleSurface(object.geometry,object.matrixWorld,Math.floor((coarse?500:900)*length),1.2);
  }
 });
 let mossCount=0;
 for(const[key,shoots]of mossCells){
  const mesh=new THREE.InstancedMesh(moss,mossMaterial,shoots.length),[cx,cz]=key.split(',').map(Number);
  shoots.forEach((s,i)=>{dummy.position.copy(s.point);dummy.quaternion.setFromUnitVectors(UP,s.normal);dummy.rotateY(r()*Math.PI*2);dummy.scale.setScalar(s.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.receiveShadow=true;mesh.userData.kind='moss-detail';mesh.computeBoundingSphere();scene.add(mesh);batches.push({mesh,center:new THREE.Vector3(cx*10+5,0,cz*10+5),range:31});mossCount+=shoots.length;
 }
 const roots=new THREE.Group();roots.name='Terrain-following exposed roots';
 for(const [i,tree]of trees.entries()){
  if(Math.hypot(tree.x,tree.z)>110||tree.v%4===3)continue;
  const geo=rootGeometry(tree,7351+i*291),mesh=new THREE.Mesh(geo,bark);mesh.receiveShadow=mesh.castShadow=true;mesh.userData.rootCenter=new THREE.Vector3(tree.x,0,tree.z);roots.add(mesh);
 }
 scene.add(roots);
 const twigMaterial=new THREE.MeshStandardMaterial({color:'#53432d',roughness:.97});
 for(let variant=0;variant<5;variant++){
  const mesh=new THREE.InstancedMesh(twigGeometry(836+variant*121),twigMaterial,coarse?420:800);
  for(let i=0;i<mesh.count;i++){
   const x=(r()-.5)*132,z=(r()-.5)*132;dummy.position.set(x,heightAt(x,z)+.002,z);dummy.rotation.set(0,r()*Math.PI*2,0);dummy.scale.setScalar(.6+r()*.8);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);
 }
 const acornParts=[new THREE.SphereGeometry(.015,7,5),new THREE.SphereGeometry(.018,8,4,0,Math.PI*2,0,Math.PI*.52)];
 acornParts[0].scale(1,1.35,1);acornParts[0].translate(0,.017,0);acornParts[1].translate(0,.024,0);
 for(let i=0;i<2;i++){const g=acornParts[i],c=[];for(let j=0;j<g.attributes.position.count;j++)c.push(i?.16:.30,i?.12:.16,i?.055:.06);g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));}
 const acorn=new THREE.InstancedMesh(mergeGeometries(acornParts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89}),850);
 for(let i=0;i<acorn.count;i++){const tree=trees[i%6],angle=r()*Math.PI*2,radial=.8+r()*3.2,x=tree.x+Math.cos(angle)*radial,z=tree.z+Math.sin(angle)*radial;dummy.position.set(x,heightAt(x,z)+.012,z);dummy.rotation.set(r(),r()*6.28,r()*2);dummy.scale.setScalar(.7+r()*.6);dummy.updateMatrix();acorn.setMatrixAt(i,dummy.matrix);}
 acorn.receiveShadow=true;scene.add(acorn);acornParts.forEach(g=>g.dispose());
 const trunkLife=createTrunkLife(scene,treeSurfaces,coarse,bark);
 return {stats:{...trunkLife.stats,mossShoots:mossCount,rootSystems:roots.children.length,twigs:coarse?2100:4000,acorns:850},update(camera:THREE.Camera){trunkLife.update(camera);for(const b of batches)b.mesh.visible=Math.hypot(camera.position.x-b.center.x,camera.position.z-b.center.z)<b.range;for(const root of roots.children){const p=root.userData.rootCenter;root.visible=Math.hypot(p.x-camera.position.x,p.z-camera.position.z)<42;}}};
}
