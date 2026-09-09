// Generate GLSL ES exactly through Three's WebGLProgram, preserving precision,
// prefixes, includes, light substitutions, and loop unrolling. No desktop GLSL
// translation: that translation previously concealed a reserved-word failure.
import fs from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { WebGLProgram } from 'three/src/renderers/webgl/WebGLProgram.js';

const out='artifacts/webgl-shaders';
fs.mkdirSync(`${out}/modules`,{recursive:true});
for(const f of fs.readdirSync('app/forest').filter(f=>f.endsWith('.ts'))){
 const source=fs.readFileSync(`app/forest/${f}`,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
  .replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p}.mjs'`);
 fs.writeFileSync(`${out}/modules/${f.replace(/\.ts$/,'.mjs')}`,js);
}
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const M=await import(`../${out}/modules/materials.mjs`);
const A=await import(`../${out}/modules/atmosphere.mjs`);
const V=await import(`../${out}/modules/volumetrics.mjs`);
const texture=new THREE.Texture();
const geometry=new THREE.PlaneGeometry(1,1);
geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(12).fill(1),3));
let target=new THREE.WebGLRenderTarget(1,1);
// This captures shaderSource only. Compilation/linking is done by the companion
// compiler, never claimed to pass by this recorder.
const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,createProgram:()=>({}),
 createShader:type=>({type}),shaderSource:(shader,source)=>{shader.source=source;},
 compileShader(){},attachShader(){},linkProgram(){},bindAttribLocation(){}};
const renderer={getContext:()=>gl,getRenderTarget:()=>target,
 outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.ACESFilmicToneMapping,
 shadowMap:{enabled:true,type:THREE.PCFSoftShadowMap},
 state:{buffers:{depth:{getReversed:()=>false}}}};
const programs=WebGLPrograms(renderer,{get:()=>null},{get:()=>null},{has:()=>false},
 {precision:'highp',getMaxPrecision:p=>p,vertexTextures:true,logarithmicDepthBuffer:false},
 {},{numPlanes:0,numIntersection:0});
const lights={directional:[{}],point:[],spot:[],spotLightMap:[],rectArea:[],hemi:[{}],
 directionalShadowMap:[{}],pointShadowMap:[],spotShadowMap:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2('#8dafa0',.003);
const variants=[];
function capture(name,material,instanced=false,screen=false){
 target=screen?null:new THREE.WebGLRenderTarget(1,1);
 const mesh=instanced?new THREE.InstancedMesh(geometry,material,1):new THREE.Mesh(geometry,material);
 if(instanced)mesh.setColorAt(0,new THREE.Color(1,1,1));
 material.name=name;
 const params=programs.getParameters(material,lights,[{}],scene,mesh);
 params.uniforms={};material.onBeforeCompile(params,renderer);
 const p=new WebGLProgram(renderer,name,params,{});
 fs.writeFileSync(`${out}/${name}.vert`,p.vertexShader.source);
 fs.writeFileSync(`${out}/${name}.frag`,p.fragmentShader.source);
 variants.push(name);
}
for(const instanced of [false,true]){
 const suffix=instanced?'instanced':'single';
 for(const kind of ['grass','fern','leaf','shrub'])capture(`${kind}-${suffix}`,M.windMaterial(kind),instanced);
 capture(`rock-${suffix}`,M.mossRockMaterial(),instanced);
 for(const species of ['oak','beech','birch'])capture(`${species}-${suffix}`,M.treeBarkMaterial(species,texture,texture),instanced);
 capture(`log-${suffix}`,M.deadwoodMaterial(new THREE.MeshStandardMaterial({map:texture,normalMap:texture})),instanced);
 capture(`attached-${suffix}`,M.treeAttachedMaterial(),instanced);
 capture(`bark-${suffix}`,new THREE.MeshStandardMaterial({map:texture,normalMap:texture}),instanced);
 capture(`endgrain-${suffix}`,new THREE.MeshStandardMaterial({map:texture,vertexColors:true,side:THREE.DoubleSide}),instanced);
 capture(`vertex-${suffix}`,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide}),instanced);
 capture(`plain-${suffix}`,new THREE.MeshStandardMaterial(),instanced);
 for(const kind of ['fern','leaf','shrub'])capture(`shadow-${kind}-${suffix}`,M.windDepthMaterial(kind),instanced);
 capture(`shadow-wood-${suffix}`,M.treeDepthMaterial(),instanced);
}
capture('grass-compact',M.windMaterial('grass',{},true));
capture('ground',M.groundMaterial(texture,texture));
capture('sky',A.addSky(new THREE.Scene()).material);
capture('particles',A.addParticles(new THREE.Scene(),new THREE.DirectionalLight()).points.material);
const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
for(const name of ['volume','occlusion','composite'])capture(name,new THREE.ShaderMaterial({vertexShader,fragmentShader:V[`${name}Fragment`]}),false,name==='composite');
fs.writeFileSync(`${out}/manifest.json`,JSON.stringify({three:THREE.REVISION,language:'300 es',variants},null,2));
console.log(`Exported ${variants.length} WebGL shader programs using Three ${THREE.REVISION}`);
