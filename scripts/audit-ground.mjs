import * as THREE from 'three';
import fs from 'node:fs';
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const {heightAt,rng}=await import('../artifacts/qa-modules/math.mjs');
const {createGround}=await import('../artifacts/qa-modules/surfaces.mjs');
const scene=new THREE.Scene(),ground=createGround(scene),p=ground.geometry.attributes.position;
const size=ground.geometry.parameters.widthSegments,stride=size+1,first=p.getX(0),last=p.getX(size),step=(last-first)/size;
function triangleHeight(x,z){
 let i=Math.max(0,Math.min(size-1,Math.floor((x-first)/step))),j=Math.max(0,Math.min(size-1,Math.floor((z-first)/step)));
 const a=j*stride+i,b=a+stride,c=b+1,d=a+1;
 const u=(x-p.getX(a))/(p.getX(d)-p.getX(a)),v=(z-p.getZ(a))/(p.getZ(b)-p.getZ(a));
 return u+v<=1?p.getY(a)+(p.getY(d)-p.getY(a))*u+(p.getY(b)-p.getY(a))*v:p.getY(c)+(p.getY(b)-p.getY(c))*(1-u)+(p.getY(d)-p.getY(c))*(1-v);
}
const r=rng(78612);let max=0,min=0,sum=0,floatingGrassRoots=0,worst;
const start=process.cpuUsage(),wall=performance.now();
for(let i=0;i<200000;i++){
 const x=(r()-.5)*400,z=(r()-.5)*400,analytic=heightAt(x,z),actual=triangleHeight(x,z),error=analytic-actual;
 sum+=Math.abs(error);if(error>max){max=error;worst={x,z,analytic,actual};}min=Math.min(min,error);if(error>.015+1e-5)floatingGrassRoots++;
}
const result={samples:200000,maxAbove:max,maxBelow:min,meanAbsolute:sum/200000,floatingGrassRoots,worst,cpu:process.cpuUsage(start),wallMs:performance.now()-wall,description:'Independent triangle interpolation from the actual rendered ground vertex array; grass roots are placed 0.015m below heightAt.'};
fs.writeFileSync(`artifacts/ground-audit-${process.argv[2]||'current'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
