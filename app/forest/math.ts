import {FOREST_EXTENT} from './config';
export function rng(seed: number) { return () => {seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;}; }
export const clamp = (v:number,a:number,b:number) => Math.max(a,Math.min(b,v));
function hash(x:number,z:number) { let h=Math.imul(x|0,374761393)+Math.imul(z|0,668265263); h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967295; }
export function noise(x:number,z:number) {const ix=Math.floor(x),iz=Math.floor(z),a=x-ix,b=z-iz,u=a*a*(3-2*a),v=b*b*(3-2*b); return (hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+(hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;}
export function fbm(x:number,z:number) {return noise(x,z)*.53+noise(x*2.03+12,z*2.03+5)*.27+noise(x*4.09,z*4.09)*.13+noise(x*8.21,z*8.21)*.07;}
function terrainField(x:number,z:number) {return (fbm(x*.045+14,z*.045-2)-.5)*5.4+Math.sin(x*.037+z*.013)*1.5+Math.sin(z*.043)*.8+(noise(x*.39,z*.39)-.5)*.12;}
const segments=FOREST_EXTENT.terrainSegments,stride=segments+1,half=FOREST_EXTENT.terrain*.5,step=FOREST_EXTENT.terrain/segments;
let terrainHeights:Float32Array|undefined;
const terrainAxis=new Float32Array(stride);
for(let i=0;i<stride;i++)terrainAxis[i]=i*step-half;
/** Match the actual PlaneGeometry triangles. The cached Float32 heights
 * retain the terrain shape and keep roots in contact between grid vertices. */
export function heightAt(x:number,z:number){
 if(x< -half||x>half||z< -half||z>half)return terrainField(x,z);
 if(!terrainHeights){
  terrainHeights=new Float32Array(stride*stride);
  for(let j=0;j<stride;j++)for(let i=0;i<stride;i++)terrainHeights[j*stride+i]=terrainField(terrainAxis[i],terrainAxis[j]);
 }
 let i=Math.min(segments-1,Math.max(0,Math.floor((x+half)/step))),j=Math.min(segments-1,Math.max(0,Math.floor((z+half)/step)));
 // PlaneGeometry stores axis coordinates as Float32, including cell edges.
 if(i>0&&x<terrainAxis[i])i--;else if(i<segments-1&&x>terrainAxis[i+1])i++;
 if(j>0&&z<terrainAxis[j])j--;else if(j<segments-1&&z>terrainAxis[j+1])j++;
 const u=(x-terrainAxis[i])/(terrainAxis[i+1]-terrainAxis[i]),v=(z-terrainAxis[j])/(terrainAxis[j+1]-terrainAxis[j]);
 const a=j*stride+i,b=a+stride,c=b+1,d=a+1,h=terrainHeights;
 return u+v<=1?h[a]+(h[d]-h[a])*u+(h[b]-h[a])*v:h[c]+(h[b]-h[c])*(1-u)+(h[d]-h[c])*(1-v);
}
export function trailAt(z:number) {return Math.sin(z*.09)*3.6+Math.sin(z*.027)*4.0;}
export function trailDistance(x:number,z:number) {return Math.abs(x-trailAt(z));}
