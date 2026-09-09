import * as THREE from 'three';

/** Seven floats per clump: root, yaw and nonuniform scale. Geometry and its
 * packed normal/colour attributes stay shared by all spatial patches. */
export function createCompactGrass(
 placement:Float32Array,scale:Float32Array,count:number,
 shapes:THREE.BufferGeometry[],material:THREE.Material,
){
 const roots=new THREE.InstancedBufferAttribute(placement.slice(0,count*4),4);
 const sizes=new THREE.InstancedBufferAttribute(scale.slice(0,count*3),3);
 const rank=new THREE.InstancedBufferAttribute(Uint16Array.from({length:count},(_,i)=>Math.round(i/Math.max(count,1)*65535)),1,true);
 const box=new THREE.Box3(),point=new THREE.Vector3();let extent=0;
 for(const shape of shapes){
  if(!shape.boundingSphere)shape.computeBoundingSphere();
  extent=Math.max(extent,shape.boundingSphere!.radius+shape.boundingSphere!.center.length());
 }
 let largest=0;
 for(let i=0;i<count;i++){
  point.set(placement[i*4],placement[i*4+1],placement[i*4+2]);box.expandByPoint(point);
  largest=Math.max(largest,scale[i*3],scale[i*3+1],scale[i*3+2]);
 }
 if(!count)box.set(new THREE.Vector3(),new THREE.Vector3());
 // Include the complete botanical shape and wind displacement, so bounds
 // remain conservative at every LOD and camera angle.
 box.expandByScalar(extent*largest+.18);
 const bounds=box.getBoundingSphere(new THREE.Sphere());
 const lods=shapes.map(base=>{
  const geometry=new THREE.InstancedBufferGeometry();geometry.setIndex(base.index);
  for(const[name,attribute]of Object.entries(base.attributes))geometry.setAttribute(name,attribute);
  geometry.setAttribute('forestPlacement',roots);geometry.setAttribute('forestScale',sizes);geometry.setAttribute('forestRank',rank);
  geometry.instanceCount=count;geometry.boundingSphere=bounds.clone();return geometry;
 });
 const mesh=new THREE.Mesh(lods[0],material);mesh.userData.kind='grass';mesh.userData.compact=true;mesh.userData.lods=lods;
 mesh.receiveShadow=true;return mesh;
}
