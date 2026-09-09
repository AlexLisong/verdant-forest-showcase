import fs from 'node:fs';
import assert from 'node:assert/strict';
export function auditSceneBoundaries({scene,vegetation,THREE}){
 const trees=vegetation.treePositions,grid=new Map(),key=(x,z)=>`${x},${z}`;
 for(const t of trees){const k=key(Math.floor(t.x/4),Math.floor(t.z/4));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(t);}
 let roots=0,intersections=0;const examples=[];
 const check=(x,z)=>{roots++;const cx=Math.floor(x/4),cz=Math.floor(z/4);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const t of grid.get(key(cx+dx,cz+dz))||[]){const dist=Math.hypot(t.x-x,t.z-z);if(dist<(t.radius??t.s*.64)-1e-5){intersections++;if(examples.length<5)examples.push({x,z,tree:[t.x,t.z],distance:dist,radius:t.radius});return;}}};
 const geometryKinds=new Map();
 scene.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  if(o.userData.compact){const p=o.geometry.attributes.forestPlacement;for(let i=0;i<p.count;i++)check(p.getX(i),p.getZ(i));}
  else if(['fern','shrub','herb'].includes(o.userData.kind)&&(!o.userData.lodLevel)){const a=o.instanceMatrix.array;for(let i=0;i<o.count;i++)check(a[i*16+12],a[i*16+14]);}
  const cache=o.material.customProgramCacheKey();let kind;
  if(cache.includes('forest-tree-bark-')||cache.includes('forest-tree-attached'))kind='wood';
  else kind=['leaf','fern','shrub','grass'].find(k=>cache.includes('forest-wind-'+k));
  if(!kind||o.userData.compact)return;
  for(const g of [o.geometry,...(o.userData.lods||[])])geometryKinds.set(g,kind);
 });
 const shapeResults=[];let vertices=0,sampled=0,violations=0;
 for(const [g,kind]of geometryKinds){
  const p=g.attributes.position,uv=g.attributes.uv,sphere=g.boundingSphere;assert.ok(sphere);let maxExcess=0;
  for(let i=0;i<p.count;i++){
   vertices++;const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dx=x-sphere.center.x,dy=y-sphere.center.y,dz=z-sphere.center.z;
   const bend=kind==='wood'||kind==='leaf'?Math.min(1,y*.05):kind==='grass'?Math.pow(Math.max(0,y),1.4):Math.max(0,y)*(kind==='fern'?.38:.24);
   const envelope=Math.abs(bend)*Math.hypot(1.36*(kind==='wood'||kind==='leaf'?.14:.13),.068)+(kind==='leaf'?.014:0);
   if(Math.hypot(dx,dy,dz)+envelope<=sphere.radius+1e-6)continue;
   sampled++;
   for(let t=0;t<9;t+=.7)for(let phase=-31;phase<34;phase+=2.7){
    const wave=Math.sin(t*1.25+phase)+.36*Math.sin(t*2.17+phase*1.47),flutter=kind==='leaf'?Math.sin(t*4.3+x*13+z*17)*.012*(uv?.getY(i)||0):0;
    const excess=Math.hypot(dx+wave*bend*(kind==='wood'||kind==='leaf'?.14:.13)+flutter*.45,dy+flutter,dz+Math.cos(t*.93+phase)*bend*.068)-sphere.radius;
    maxExcess=Math.max(maxExcess,excess);
   }
  }
  if(maxExcess>1e-5)violations++;
  shapeResults.push({name:g.name,kind,vertices:p.count,radius:sphere.radius,maxExcess});
 }
 const result={roots,intersections,examples,windShapes:geometryKinds.size,vertices,envelopeBoundaryVertices:sampled,windViolations:violations,shapeResults,limits:'Actual initial scene roots and shared geometry bounds. Wind uses an analytic displacement envelope with sampled phases/times for any boundary candidates; not browser interaction or FPS.'};
 fs.writeFileSync('artifacts/scene-boundaries-audit.json',JSON.stringify(result,null,2));
 assert.equal(intersections,0,'plant roots inside measured trunk flares');assert.equal(violations,0,'wind exceeds geometry bounds');
 console.log(JSON.stringify({...result,shapeResults:undefined}));return result;
}
