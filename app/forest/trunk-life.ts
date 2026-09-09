import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rng} from './math';
import {windMaterial,windDepthMaterial,treeDepthMaterial,treeBarkMaterial,treeAttachedMaterial} from './materials';
import {createBracketFungus} from './bracket-fungus.js';
export type TreeSurface={geometry:THREE.BufferGeometry,matrix:THREE.Matrix4,center:THREE.Vector3,seed:number};

/** Sample the actual triangulated trunk rings. Climbing stems and petioles
 * therefore begin on bark, including its uneven ridges and crooked growth. */
function trunkPoint(tree:TreeSurface,u:number,v:number){
 const rows=tree.geometry.userData.trunkSurfaceRows as number[][],p=tree.geometry.attributes.position;
 const row=Math.min(rows.length-2,Math.floor(v*(rows.length-1))),fv=v*(rows.length-1)-row;
 const around=((u%1)+1)%1*(rows[row].length-1),column=Math.floor(around),fu=around-column;
 const a=new THREE.Vector3().fromBufferAttribute(p,rows[row][column]);
 const b=new THREE.Vector3().fromBufferAttribute(p,rows[row][column+1]);
 const c=new THREE.Vector3().fromBufferAttribute(p,rows[row+1][column]);
 const d=new THREE.Vector3().fromBufferAttribute(p,rows[row+1][column+1]);
 let point:THREE.Vector3,normal:THREE.Vector3;
 if(fu+fv<=1){point=a.clone().addScaledVector(b.clone().sub(a),fu).addScaledVector(c.clone().sub(a),fv);normal=new THREE.Vector3().crossVectors(b.sub(a),c.sub(a)).normalize();}
 else{point=b.clone().multiplyScalar(1-fv).addScaledVector(c,1-fu).addScaledVector(d,fu+fv-1);normal=new THREE.Vector3().crossVectors(d.sub(b),c.sub(b)).normalize();}
 return {point,normal};
}
function ivyLeaves(seed:number){
 const r=rng(seed),positions:number[]=[],colors:number[]=[],uvs:number[]=[];
 let leaves=0;
 function leaf(base:THREE.Vector3,normal:THREE.Vector3,size:number){
  const up=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const side=new THREE.Vector3().crossVectors(up,normal).normalize();
  up.applyAxisAngle(normal,(r()-.5)*.7);side.crossVectors(up,normal).normalize();
  const outline=[[0,0],[-.25,.045],[-.5,.28],[-.31,.43],[-.45,.70],[-.17,.64],[0,1],[.17,.64],[.45,.70],[.31,.43],[.5,.28],[.25,.045]];
  const color=new THREE.Color().setHSL(.255+r()*.035,.39+r()*.17,.115+r()*.07);
  const point=(x:number,y:number,raised:number)=>base.clone().addScaledVector(side,x*size).addScaledVector(up,y*size).addScaledVector(normal,raised*size);
  const center=point(0,.43,.08),rings=outline.map(([x,y],i)=>({uv:[x+.5,y],outer:point(x,y,.012*Math.sin(i*2.1)),inner:point(x*.53,.43+(y-.43)*.53,.065)}));
  const triangle=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,uv:number[][],shade:number)=>{for(const[i,p]of[a,b,c].entries()){positions.push(p.x,p.y,p.z);uvs.push(...uv[i]);colors.push(color.r*shade,color.g*shade,color.b*shade);}};
  for(let i=0;i<rings.length;i++){
   const a=rings[i],b=rings[(i+1)%rings.length],ca=[.5,.43],ia=[.5+(a.uv[0]-.5)*.53,.43+(a.uv[1]-.43)*.53],ib=[.5+(b.uv[0]-.5)*.53,.43+(b.uv[1]-.43)*.53];
   triangle(center,b.inner,a.inner,[ca,ib,ia],1.04);
   triangle(a.inner,b.inner,a.outer,[ia,ib,a.uv],.99);
   triangle(a.outer,b.inner,b.outer,[a.uv,ib,b.uv],.95);
  }
  leaves++;
 }
 function finish(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.computeVertexNormals();g.computeBoundingSphere();return g;}
 return {leaf,finish,get count(){return leaves;}};
}
export function createTrunkLife(scene:THREE.Scene,trees:TreeSurface[],coarse:boolean,bark:THREE.MeshStandardMaterial){
 const leavesMaterial=windMaterial('leaf',{roughness:.84}),leafDepth=windDepthMaterial('leaf'),woodDepth=treeDepthMaterial();
 const stemMaterial=treeBarkMaterial('beech',bark.map!,bark.normalMap!);stemMaterial.color.set('#625d36');
 const groups:THREE.Group[]=[];let leafCount=0,bracketCount=0,ivyClimbers=0;
 for(const tree of trees){
  const r=rng(tree.seed);if(r()>(coarse?.15:.24)||!tree.geometry.userData.trunkSurfaceRows)continue;
  const group=new THREE.Group();group.matrix.copy(tree.matrix);group.matrixAutoUpdate=false;group.userData.center=tree.center;
  const leafWriter=ivyLeaves(tree.seed+117),stems:THREE.BufferGeometry[]=[];
  const stemsCount=1+Math.floor(r()*3),rows=tree.geometry.userData.trunkSurfaceRows as number[][];
  const top=new THREE.Vector3().fromBufferAttribute(tree.geometry.attributes.position,rows[rows.length-1][0]).y;
  for(let stem=0;stem<stemsCount;stem++){
   const azimuth=r(),end=Math.min(.78,(1.5+r()*3.6)/Math.max(top,1)),curve=r()*.20-.10,points=[];
   for(let i=0;i<65;i++){
    const t=i/64,v=.018+(end-.018)*t,u=azimuth+t*curve+Math.sin(t*4+stem)*.012;
    const {point,normal}=trunkPoint(tree,u,v);point.addScaledVector(normal,.004);points.push(point);
    if(i%2===0&&i>3&&r()<.88){
     const petioleEnd=point.clone().addScaledVector(normal,.017+r()*.026).add(new THREE.Vector3((r()-.5)*.025,.009,0));
     leafWriter.leaf(petioleEnd,normal,.065+r()*.065);
     stems.push(new THREE.TubeGeometry(new THREE.LineCurve3(point,petioleEnd),1,.0012,3,false));
    }
   }
   const path=new THREE.CatmullRomCurve3(points);stems.push(new THREE.TubeGeometry(path,100,.0045,4,false));
  }
  const leafMesh=new THREE.Mesh(leafWriter.finish(),leavesMaterial);leafMesh.customDepthMaterial=leafDepth;leafMesh.receiveShadow=leafMesh.castShadow=true;leafMesh.userData.kind='climbing-ivy';group.add(leafMesh);
  const stemMesh=new THREE.Mesh(mergeGeometries(stems),stemMaterial);stems.forEach(g=>g.dispose());stemMesh.receiveShadow=stemMesh.castShadow=true;stemMesh.customDepthMaterial=woodDepth;stemMesh.userData.kind='ivy-stem';group.add(stemMesh);
  leafMesh.geometry.boundingSphere!.radius+=.34;
  stemMesh.geometry.computeBoundingSphere();stemMesh.geometry.boundingSphere!.radius+=.22;
  scene.add(group);groups.push(group);leafCount+=leafWriter.count;ivyClimbers++;
 }
 const fungusMaterial=treeAttachedMaterial();
 for(const tree of trees){
  const r=rng(tree.seed+777),hero=Math.hypot(tree.center.x+6.5,tree.center.z-5)<.1;
  if(!hero&&r()>(coarse?.075:.105))continue;
  const rows=tree.geometry.userData.trunkSurfaceRows as number[][];if(!rows)continue;
  let azimuth=r();
  if(hero){let best=-Infinity;const direction=new THREE.Vector3(.7,0,1).normalize();for(let i=0;i<48;i++){const sample=trunkPoint(tree,i/48,.08),score=sample.normal.clone().transformDirection(tree.matrix).dot(direction);if(score>best){best=score;azimuth=i/48;}}}
  const top=new THREE.Vector3().fromBufferAttribute(tree.geometry.attributes.position,rows.at(-1)![0]).y;
  const {point,normal}=trunkPoint(tree,azimuth,(hero?.95:.45+r()*1.7)/Math.max(top,1));
  const up=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize(),side=new THREE.Vector3().crossVectors(up,normal).normalize();
  const placement=new THREE.Matrix4().makeBasis(side,up,normal);placement.setPosition(point.clone().addScaledVector(normal,-.002));
  const geometry=createBracketFungus(tree.seed+731);geometry.applyMatrix4(placement);geometry.computeBoundingSphere();geometry.boundingSphere!.radius+=.22;
  const group=new THREE.Group();group.matrix.copy(tree.matrix);group.matrixAutoUpdate=false;group.userData.center=tree.center;
  const mesh=new THREE.Mesh(geometry,fungusMaterial);mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=woodDepth;mesh.userData.kind='bracket-fungus';
  if(hero)mesh.userData.inspection={point:point.clone().applyMatrix4(tree.matrix).toArray(),normal:normal.clone().transformDirection(tree.matrix).toArray()};
  group.add(mesh);scene.add(group);groups.push(group);bracketCount++;
 }
 return {stats:{ivyClimbers,ivyLeaves:leafCount,bracketClusters:bracketCount},update(camera:THREE.Camera){for(const group of groups){const center=group.userData.center;const distance=Math.hypot(camera.position.x-center.x,camera.position.z-center.z);group.visible=distance<52;for(const child of group.children)(child as THREE.Mesh).castShadow=distance<34;}}};
}
