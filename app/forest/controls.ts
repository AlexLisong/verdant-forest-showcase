import * as THREE from 'three';
import {heightAt,clamp} from './math';
export type Viewpoint = {position:[number,number,number],target:[number,number,number]};
export const viewpoints:Record<string,Viewpoint>={
 entrance:{position:[5.55,1.72,20],target:[2.5,2.2,3]},
 old_entrance:{position:[1.8,2.6,20],target:[-2,3,-15]},
 trail_start:{position:[5.55,1.72,20],target:[2.5,2.2,3]},
 ferns:{position:[-5.5,1.3,6],target:[-4,1.0,0]},
 grove:{position:[12,2.6,-12],target:[-5,5,-31]},
 deadwood:{position:[9.2,1.7,-9.3],target:[5.7,.6,-7.3]},
 canopy:{position:[-2,5,9],target:[-8,18,-4]},
 ridge:{position:[-25,4,-18],target:[2,5,-7]},
 reverse:{position:[-2,2,-14],target:[1,3,20]},
 aerial:{position:[-15,24,25],target:[0,13,-8]}
};
export function createControls(camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,host:HTMLElement){
 const keys=new Set<string>(),velocity=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ');
 let yaw=0,pitch=0,tyaw=0,tpitch=0,drag=false,lastX=0,lastY=0,lock=false,touchMove:number|null=null,touchLook:number|null=null,tx=0,ty=0,jx=0,jy=0;
 let moved=false,disposed=false;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 canvas.tabIndex=0;canvas.setAttribute('aria-label','Explore forest. Drag to look. W A S D to move. Q and E to fly down and up. R to return.');
 function jump(name:string){const v=viewpoints[name]||viewpoints.entrance;camera.position.set(...v.position);camera.position.y+=heightAt(v.position[0],v.position[2]);const target=new THREE.Vector3(...v.target);target.y+=heightAt(v.target[0],v.target[2]);camera.lookAt(target);euler.setFromQuaternion(camera.quaternion,'YXZ');yaw=tyaw=euler.y;pitch=tpitch=euler.x;velocity.set(0,0,0);}
 jump(new URLSearchParams(location.search).get('view')||'entrance');
 const joy=document.createElement('div');joy.className='touch-joystick';joy.innerHTML='<span></span>';host.appendChild(joy);
 const fly=document.createElement('div');fly.className='touch-flight';fly.innerHTML='<button type="button" aria-label="Rise">＋</button><button type="button" aria-label="Descend">−</button>';host.appendChild(fly);
 const hint=document.createElement('div');hint.className='touch-hint';hint.textContent='Left thumb to move · drag right to look';host.appendChild(hint);
 const bindings:Array<[EventTarget,string,EventListener,AddEventListenerOptions|boolean|undefined]>=[];
 function on(target:EventTarget,name:string,fn:EventListener,opts?:AddEventListenerOptions|boolean){target.addEventListener(name,fn,opts);bindings.push([target,name,fn,opts]);}
 const wake=()=>{moved=true;hint.classList.add('used');host.parentElement?.classList.add('exploring');};
 on(window,'keydown',((e:KeyboardEvent)=>{if(e.target instanceof HTMLButtonElement)return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR'].includes(e.code)){e.preventDefault();keys.add(e.code);wake();}if(e.code==='KeyR')jump('entrance');}) as EventListener);
 on(window,'keyup',((e:KeyboardEvent)=>{keys.delete(e.code);}) as EventListener);
 const reset=()=>{keys.clear();drag=false;jx=jy=0;touchMove=touchLook=null;velocity.set(0,0,0);joy.classList.remove('active');};
 on(window,'blur',reset);
 on(document,'visibilitychange',()=>{if(document.hidden)reset();});
 on(canvas,'contextmenu',e=>e.preventDefault());
 on(canvas,'pointerdown',((e:PointerEvent)=>{canvas.focus({preventScroll:true});wake();if(e.pointerType==='touch'){if(e.clientX<innerWidth*.45&&touchMove===null){touchMove=e.pointerId;tx=e.clientX;ty=e.clientY;joy.style.left=`${tx}px`;joy.style.top=`${ty}px`;joy.classList.add('active');}else if(touchLook===null){touchLook=e.pointerId;lastX=e.clientX;lastY=e.clientY;}}else{drag=true;lastX=e.clientX;lastY=e.clientY;}canvas.setPointerCapture(e.pointerId);}) as EventListener);
 on(canvas,'pointermove',((e:PointerEvent)=>{if(e.pointerId===touchMove){jx=clamp((e.clientX-tx)/52,-1,1);jy=clamp((e.clientY-ty)/52,-1,1);(joy.firstElementChild as HTMLElement).style.transform=`translate(${jx*27}px,${jy*27}px)`;}else if(lock||drag||e.pointerId===touchLook){const dx=lock?e.movementX:e.clientX-lastX,dy=lock?e.movementY:e.clientY-lastY;tyaw-=dx*.0025;tpitch=clamp(tpitch-dy*.0025,-1.49,1.49);lastX=e.clientX;lastY=e.clientY;}}) as EventListener);
 const end=((e:PointerEvent)=>{if(e.pointerId===touchMove){touchMove=null;jx=jy=0;joy.classList.remove('active');}if(e.pointerId===touchLook)touchLook=null;drag=false;}) as EventListener;
 on(canvas,'pointerup',end);on(canvas,'pointercancel',end);on(canvas,'lostpointercapture',end);
 on(canvas,'dblclick',()=>{if(!matchMedia('(pointer:coarse)').matches)canvas.requestPointerLock?.()?.catch(()=>{});});
 on(document,'pointerlockchange',()=>{lock=document.pointerLockElement===canvas;});
 on(canvas,'wheel',((e:WheelEvent)=>{e.preventDefault();wake();const forward=new THREE.Vector3();camera.getWorldDirection(forward);camera.position.addScaledVector(forward,clamp(-e.deltaY*.012,-1.4,1.4));}) as EventListener,{passive:false});
 Array.from(fly.children).forEach((b,i)=>{const code=i?'KeyQ':'KeyE';on(b,'pointerdown',((e:PointerEvent)=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(code);wake();}) as EventListener);for(const ev of ['pointerup','pointercancel','lostpointercapture'])on(b,ev,()=>keys.delete(code));});
 function update(dt:number,time:number){if(disposed)return;const smooth=1-Math.exp(-dt*18);yaw+=((tyaw-yaw)*smooth);pitch+=((tpitch-pitch)*smooth);euler.set(pitch,yaw,0);camera.quaternion.setFromEuler(euler);
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
 let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-jy;
 let s=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+jx;
 const up=(keys.has('KeyE')||keys.has('Space')?1:0)-(keys.has('KeyQ')?1:0);
 const v=forward.multiplyScalar(f).add(right.multiplyScalar(s));v.y=up;if(v.length()>1)v.normalize();v.multiplyScalar(keys.has('ShiftLeft')||keys.has('ShiftRight')?8:3.2);velocity.lerp(v,1-Math.exp(-dt*8));camera.position.addScaledVector(velocity,dt);
 camera.position.x=clamp(camera.position.x,-95,95);camera.position.z=clamp(camera.position.z,-95,95);camera.position.y=clamp(camera.position.y,heightAt(camera.position.x,camera.position.z)+.32,46);
 if(!moved&&!motion.matches){camera.position.y+=Math.sin(time*.53)*.00012;}
 }
 return {update,jump,dispose(){disposed=true;bindings.forEach(([t,n,f,o])=>t.removeEventListener(n,f,o));if(lock)document.exitPointerLock();joy.remove();fly.remove();hint.remove();},get moving(){return velocity.length()>.01;}};
}
