import * as THREE from 'three';import fs from 'node:fs';
THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
const {windMaterial,windDepthMaterial,treeDepthMaterial,treeAttachedMaterial,groundMaterial,mossRockMaterial,deadwoodMaterial,treeBarkMaterial}=await import('../artifacts/qa-modules/materials.mjs');
const testTexture=new THREE.Texture();THREE.TextureLoader.prototype.load=()=>testTexture;const mats=[['grass_compact',windMaterial('grass',{},true)],...['grass','fern','leaf','shrub'].map(k=>[k,windMaterial(k)]),['rock',mossRockMaterial()],...['oak','beech','birch'].map(k=>[k,treeBarkMaterial(k,testTexture,testTexture)]),['log',deadwoodMaterial(new THREE.MeshStandardMaterial({map:testTexture,normalMap:testTexture}))],['ground',groundMaterial(testTexture,testTexture)],['bark',new THREE.MeshStandardMaterial({map:testTexture,normalMap:testTexture})],['endgrain',new THREE.MeshStandardMaterial({map:testTexture,vertexColors:true,side:THREE.DoubleSide})],['vertex',new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide})],['plain',new THREE.MeshStandardMaterial()]];
mats.push(['attached',treeAttachedMaterial()]);
for(const [name,material] of [['leaf_single',windMaterial('leaf')],['beech_single',treeBarkMaterial('beech',testTexture,testTexture)],['attached_single',treeAttachedMaterial()]]){material.userData.single=true;mats.push([name,material]);}
const out='artifacts/shader-check';fs.mkdirSync(out,{recursive:true});
function includes(s){return s.replace(/^[ \t]*#include +<([\w\d_]+)>/gm,(_,k)=>includes(THREE.ShaderChunk[k]));}
function unroll(s){return s.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int i = (\d+);\s*i < (\d+);\s*i\s*\+\+\s*\)\s*\{([\s\S]+?)\}\s*#pragma unroll_loop_end/g,(_,a,b,body)=>Array.from({length:Number(b)-Number(a)},(_,j)=>body.replace(/\[\s*i\s*\]/g,'[ '+(Number(a)+j)+' ]').replace(/UNROLLED_LOOP_INDEX/g,String(Number(a)+j))).join(''));}
function expand(s){s=includes(s);s=s.replace(/NUM_[A-Z_]+/g,k=>['NUM_DIR_LIGHTS','NUM_DIR_LIGHT_SHADOWS','NUM_HEMI_LIGHTS'].includes(k)?'1':'0').replace(/UNION_CLIPPING_PLANES/g,'0');return unroll(s);}
for(const[name,m]of mats){const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};m.onBeforeCompile(shader,{});
 const defs=[m.userData.compact||m.userData.single?'':'#define USE_INSTANCING',m.userData.compact||m.userData.single?'':'#define USE_INSTANCING_COLOR','#define USE_FOG','#define FOG_EXP2','#define USE_SHADOWMAP','#define SHADOWMAP_TYPE_PCF_SOFT',m.side===THREE.DoubleSide?'#define DOUBLE_SIDED':'',m.vertexColors?'#define USE_COLOR':'',m.map?'#define USE_MAP\n#define MAP_UV uv':'',m.normalMap?'#define USE_NORMALMAP\n#define USE_NORMALMAP_TANGENTSPACE\n#define NORMALMAP_UV uv':''].join('\n');
 const vp=`#version 330\n#define attribute in\n#define varying out\n#define texture2D texture\n${defs}\nuniform mat4 modelMatrix;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform mat4 viewMatrix;uniform mat3 normalMatrix;uniform vec3 cameraPosition;uniform bool isOrthographic;attribute mat4 instanceMatrix;attribute vec3 instanceColor;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;${m.vertexColors?'attribute vec3 color;':''}\n`;
 const fp=`#version 330\n#define varying in\n#define texture2D texture\n#define textureCube texture\nout vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n${defs}\nuniform mat4 viewMatrix;uniform vec3 cameraPosition;uniform bool isOrthographic;${THREE.ShaderChunk.colorspace_pars_fragment}\nvec4 linearToOutputTexel(vec4 value){return value;}\nfloat luminance(vec3 rgb){return dot(rgb,vec3(.2126,.7152,.0722));}\n`;
 fs.writeFileSync(`${out}/${name}.vert`,(vp+expand(shader.vertexShader)).replace(/\b(highp|mediump|lowp)\b/g,''));fs.writeFileSync(`${out}/${name}.frag`,(fp+expand(shader.fragmentShader)).replace(/\b(highp|mediump|lowp)\b/g,''));
}
console.log(`Exported ${mats.length} production shader variants for native compilation`);
const {compositeFragment}=await import('../artifacts/qa-modules/volumetrics.mjs');
const prefix=`#version 330\n#define varying in\n#define texture2D texture\n#define TONE_MAPPING\nout vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n${THREE.ShaderChunk.tonemapping_pars_fragment}\nvec3 toneMapping(vec3 c){return ACESFilmicToneMapping(c);}\n${THREE.ShaderChunk.colorspace_pars_fragment}\nvec4 linearToOutputTexel(vec4 c){return sRGBTransferOETF(c);}\n`;
fs.writeFileSync('artifacts/qa-modules/composite-native.frag',(prefix+expand(compositeFragment)).replace(/\b(highp|mediump|lowp)\b/g,''));

fs.mkdirSync('artifacts/shader-depth',{recursive:true});
for(const kind of ['leaf','fern','shrub','wood','wood_single','leaf_single']){
 const base=kind.replace('_single','');const m=base==='wood'?treeDepthMaterial():windDepthMaterial(base),shader={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};m.onBeforeCompile(shader,{});
 const vp=`#version 330\n#define attribute in\n#define varying out\n#define texture2D texture\n${kind.endsWith('_single')?'':'#define USE_INSTANCING'}\n#define DEPTH_PACKING 3201\nuniform mat4 modelMatrix;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;uniform mat4 viewMatrix;uniform mat3 normalMatrix;uniform vec3 cameraPosition;uniform bool isOrthographic;attribute mat4 instanceMatrix;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;\n`;
 const fp=`#version 330\n#define varying in\n#define texture2D texture\n#define DEPTH_PACKING 3201\nout vec4 result;\n#define gl_FragColor result\n`;
 fs.writeFileSync(`artifacts/shader-depth/${kind}.vert`,(vp+expand(shader.vertexShader)).replace(/\b(highp|mediump|lowp)\b/g,''));
 fs.writeFileSync(`artifacts/shader-depth/${kind}.frag`,(fp+expand(shader.fragmentShader)).replace(/\b(highp|mediump|lowp)\b/g,''));
}

const {addSky,addParticles}=await import('../artifacts/qa-modules/atmosphere.mjs');
fs.mkdirSync('artifacts/shader-extra',{recursive:true});
for(const [name,material] of [['sky',addSky(new THREE.Scene()).material],['particles',addParticles(new THREE.Scene(),new THREE.DirectionalLight()).points.material]]){
 const vp='#version 330\n#define varying out\n#define attribute in\n#define texture2D texture\nuniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;attribute vec3 position;\n';
 const fp='#version 330\n#define varying in\n#define texture2D texture\nout vec4 result;\n#define gl_FragColor result\nvec4 linearToOutputTexel(vec4 c){return c;}\n';
 fs.writeFileSync(`artifacts/shader-extra/${name}.vert`,(vp+expand(material.vertexShader)).replace(/\b(highp|mediump|lowp)\b/g,''));
 fs.writeFileSync(`artifacts/shader-extra/${name}.frag`,(fp+expand(material.fragmentShader)).replace(/\b(highp|mediump|lowp)\b/g,''));
}
