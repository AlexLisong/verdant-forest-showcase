import * as THREE from 'three';

/** Keep positions at full precision, including millimetre-scale twigs.
 * Normalised 16-bit colours/normals and half-float botanical UVs reduce upload
 * and GPU memory without moving vertices or changing topology. */
export function compactGeometryAttributes(scene:THREE.Scene){
 const geometries=new Set<THREE.BufferGeometry>();
 scene.traverse(object=>{
  if(!(object instanceof THREE.Mesh||object instanceof THREE.Points))return;
  geometries.add(object.geometry);for(const g of object.userData.lods||[])geometries.add(g);
 });
 return packGeometries(geometries);
}
export function packGeometries(geometries:Iterable<THREE.BufferGeometry>){
 const converted=new Map<THREE.BufferAttribute,THREE.BufferAttribute>();
 let before=0,after=0;
 for(const geometry of geometries){
  for(const name of ['normal','color','uv']){
   const attribute=geometry.getAttribute(name);
   if(!(attribute instanceof THREE.BufferAttribute)||!(attribute.array instanceof Float32Array))continue;
   // Large terrain UV coordinates must retain precision after many repeats.
   if(name==='uv'&&geometry.boundingSphere&&geometry.boundingSphere.radius>100)continue;
   let packed=converted.get(attribute);
   if(!packed){
    const source=attribute.array;
    if(name==='normal'){
     const values=new Int16Array(source.length);
     for(let i=0;i<source.length;i++)values[i]=Math.round(THREE.MathUtils.clamp(source[i],-1,1)*32767);
     packed=new THREE.BufferAttribute(values,attribute.itemSize,true);
    }else if(name==='color'){
     const values=new Uint16Array(source.length);
     for(let i=0;i<source.length;i++)values[i]=Math.round(THREE.MathUtils.clamp(source[i],0,1)*65535);
     packed=new THREE.BufferAttribute(values,attribute.itemSize,true);
    }else{
     const half=new THREE.Float16BufferAttribute(new Uint16Array(source.length),attribute.itemSize);
     for(let i=0;i<source.length;i++)half.array[i]=THREE.DataUtils.toHalfFloat(source[i]);
     packed=half;
    }
    converted.set(attribute,packed);before+=source.byteLength;after+=packed.array.byteLength;
   }
   geometry.setAttribute(name,packed);
  }
 }
 return {attributeBytesBefore:before,attributeBytesAfter:after,savedBytes:before-after};
}
