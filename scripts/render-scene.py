"""Offline scene-data QA renderer. Exact scene meshes and placements; approximate
PBR lighting, with native OpenGL depth and shadows. Not browser screenshots.
"""
import os,json,sys,time
from pathlib import Path
import numpy as np
from PIL import Image
import moderngl
LIB=Path('/workspace/scratch/46479389b383/render-libs/local/usr/lib/x86_64-linux-gnu')
os.environ['__EGL_VENDOR_LIBRARY_FILENAMES']='/workspace/scratch/46479389b383/render-libs/vendor.json'
ctx=moderngl.create_standalone_context(backend='egl',libegl=str(LIB/'libEGL.so.1'),require=330)
print(ctx.info['GL_RENDERER'],flush=True)
D=Path('artifacts/scene-data');S=json.load(open(D/'scene.json')); W,H=1440,900
shader_v='''#version 330
in vec3 in_pos;in vec3 in_normal;in vec2 in_uv;in vec3 in_color;
in vec4 i0;in vec4 i1;in vec4 i2;in vec4 i3;
uniform mat4 projection;uniform mat4 view;uniform mat4 model;uniform mat4 shadowMatrix;
out vec3 vWorld;out vec3 vNormal;out vec2 vUV;out vec3 vColor;out vec4 vShadow;
void main(){mat4 instance=mat4(i0,i1,i2,i3);mat4 m=model*instance;vec4 p=m*vec4(in_pos,1);vWorld=p.xyz;vNormal=normalize(mat3(transpose(inverse(m)))*in_normal);vUV=in_uv;vColor=in_color;vShadow=shadowMatrix*p;gl_Position=projection*view*p;}
'''
shader_f='''#version 330
in vec3 vWorld;in vec3 vNormal;in vec2 vUV;in vec3 vColor;in vec4 vShadow;
uniform vec3 color;uniform vec3 camera;uniform int useMap;uniform int useColor;uniform int moss;uniform int leaf;uniform sampler2D colorMap;uniform sampler2D normalMap;uniform int useNormal;uniform vec2 repeat;uniform sampler2D shadowMap;
out vec4 frag;
float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,24.11)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 albedo=color;if(useColor==1)albedo*=vColor;if(useMap==1)albedo*=pow(texture(colorMap,vUV*repeat).rgb,vec3(2.2));
 if(useNormal==1){vec3 q1=dFdx(vWorld),q2=dFdy(vWorld);vec2 st1=dFdx(vUV),st2=dFdy(vUV);vec3 t=normalize(q1*st2.y-q2*st1.y);vec3 b=normalize(-q1*st2.x+q2*st1.x);vec3 nm=texture(normalMap,vUV*repeat).xyz*2.-1.;nm.xy*=.65;n=normalize(mat3(t,b,n)*nm);}
 if(moss==1){float co=noise(vWorld*5.)*.65+noise(vWorld*14.)*.35;float fi=noise(vWorld*165.);float mo=smoothstep(.19,.49,n.y+co*.62-.24);vec3 st=vec3(.30,.31,.28)*(.45+co*.9+fi*.24);vec3 gr=mix(vec3(.065,.093,.016),vec3(.19,.26,.037),co)*(.75+fi*.4);albedo*=mix(st*2.3,gr*2.,mo);}
 vec3 sun=normalize(vec3(-34.,49.,-39.));float ndl=max(dot(n,sun),0.);vec3 sp=vShadow.xyz/vShadow.w;float sha=1.;if(all(greaterThan(sp,vec3(0)))&&all(lessThan(sp,vec3(1)))){sha=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){float dep=texture(shadowMap,sp.xy+vec2(i,j)/4096.).r;sha+=sp.z-.0006<dep?1.:0.;}sha/=9.;}
 vec3 hemi=mix(pow(vec3(.21,.20,.13),vec3(2.2)),pow(vec3(.77,.85,.91),vec3(2.2)),n.y*.5+.5)*1.85;vec3 c=albedo*(hemi*.31831+pow(vec3(1.,.945,.77),vec3(2.2))*3.35*.31831*ndl*sha);if(leaf==1)c+=albedo*.13;
 float dist=length(camera-vWorld),fog=1.-exp(-.0048*.0048*dist*dist);c=mix(c,pow(vec3(.514,.612,.596),vec3(2.2)),fog);frag=vec4(c,1.);}
'''
prog=ctx.program(vertex_shader=shader_v,fragment_shader=shader_f)
shadowProg=ctx.program(vertex_shader='''#version 330
in vec3 in_pos;in vec4 i0;in vec4 i1;in vec4 i2;in vec4 i3;uniform mat4 projection;uniform mat4 view;uniform mat4 model;void main(){gl_Position=projection*view*model*mat4(i0,i1,i2,i3)*vec4(in_pos,1);}''',fragment_shader='''#version 330
void main(){}''')

def matrix(a):return np.array(a,dtype='f4').reshape(4,4).T.copy()
def write(p,k,a):p[k].write(np.asarray(a,dtype='f4').T.tobytes())
def look(eye,target):
 e=np.array(eye,dtype=float);f=np.array(target)-e;f/=np.linalg.norm(f);s=np.cross(f,[0,1,0]);s/=np.linalg.norm(s);u=np.cross(s,f);m=np.eye(4);m[:3,:3]=[s,u,-f];m[:3,3]=-m[:3,:3]@e;return m
geos={};textures={};white=ctx.texture((1,1),3,b'\xff\xff\xff');normalDefault=ctx.texture((1,1),3,b'\x80\x80\xff')
for k,g in S['geometries'].items():
 a=g['attributes'];p=np.fromfile(D/a['position']['file'],dtype='f4').reshape(-1,3);n=np.fromfile(D/a['normal']['file'],dtype='f4').reshape(-1,3);uv=np.fromfile(D/a['uv']['file'],dtype='f4').reshape(-1,2) if 'uv' in a else np.zeros((len(p),2));c=np.fromfile(D/a['color']['file'],dtype='f4').reshape(-1,3) if 'color' in a else np.ones_like(p)
 vb=ctx.buffer(np.concatenate([p,n,uv,c],axis=1).astype('f4').tobytes());ind=np.fromfile(D/g['index']['file'],dtype='u4') if g['index'] else np.arange(len(p),dtype='u4');ib=ctx.buffer(ind.tobytes());geos[k]=(vb,ib)
for k,m in S['materials'].items():
 for kind in ['map','normalMap']:
  url=m.get(kind)
  if url and url not in textures:
   im=Image.open('public'+url).convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM);t=ctx.texture(im.size,3,im.tobytes());t.build_mipmaps();t.repeat_x=t.repeat_y=True;t.anisotropy=8;textures[url]=t
objects=[]
for o in S['objects']:
 vb,ib=geos[o['geometry']];arr=np.fromfile(D/o['instances']['file'],dtype='f4').reshape(-1,16) if o.get('instances') else np.eye(4,dtype='f4').reshape(1,16)
 if not len(arr):continue
 inst=ctx.buffer(arr.tobytes());vao=ctx.vertex_array(prog,[(vb,'3f 3f 2f 3f','in_pos','in_normal','in_uv','in_color'),(inst,'4f 4f 4f 4f /i','i0','i1','i2','i3')],ib);sv=ctx.vertex_array(shadowProg,[(vb,'3f 32x','in_pos'),(inst,'4f 4f 4f 4f /i','i0','i1','i2','i3')],ib);objects.append((o,vao,sv,inst,arr))
 if o.get('lods'):
  o['qaLods']=[]
  for gid in o['lods']:
   lb,li=geos[gid];o['qaLods'].append(ctx.vertex_array(prog,[(lb,'3f 3f 2f 3f','in_pos','in_normal','in_uv','in_color'),(inst,'4f 4f 4f 4f /i','i0','i1','i2','i3')],li))
color=ctx.texture((W,H),4,dtype='f2');depth=ctx.depth_texture((W,H));fbo=ctx.framebuffer([color],depth);sdepth=ctx.depth_texture((4096,4096));sdepth.compare_func='';sfbo=ctx.framebuffer(depth_attachment=sdepth)
sproj=np.eye(4);sproj[0,0]=sproj[1,1]=1/44;sproj[2,2]=-2/134;sproj[2,3]=-136/134
sview=look([-34,49,-42],[0,0,-3]);bias=np.array([[.5,0,0,.5],[0,.5,0,.5],[0,0,.5,.5],[0,0,0,1]])
ctx.enable(moderngl.DEPTH_TEST);ctx.disable(moderngl.CULL_FACE)
sfbo.use();sfbo.clear(depth=1);ctx.viewport=(0,0,4096,4096);write(shadowProg,'projection',sproj);write(shadowProg,'view',sview)
start=time.time()
for o,vao,sv,inst,arr in objects:
 if not o['castShadow']:continue
 write(shadowProg,'model',matrix(o['matrix']));sv.render(instances=len(arr))
ctx.finish();print('shadow seconds',round(time.time()-start,2),flush=True)
prog['colorMap']=0;prog['normalMap']=1;prog['shadowMap']=2;sdepth.use(2);write(prog,'shadowMatrix',bias@sproj@sview)
# Compile the production volume shader, replacing only packed WebGL shadow
# depth with the native OpenGL raw depth texture representation.
vsrc=Path('artifacts/qa-modules/volume.frag').read_text().replace('#include <packing>','float unpackRGBAToDepth(vec4 v){return v.r;}').replace('varying vec2 vUv;','in vec2 vUv;out vec4 frag;').replace('texture2D','texture').replace('gl_FragColor','frag')
fullv='#version 330\nin vec2 p;out vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0,1);}'
vp=ctx.program(vertex_shader=fullv,fragment_shader='#version 330\n'+vsrc)
quad=ctx.buffer(np.array([-1,-1,3,-1,-1,3],dtype='f4').tobytes());vvao=ctx.vertex_array(vp,[(quad,'2f','p')]);vtex=ctx.texture((W//2,H//2),4,dtype='f2');vtex.filter=(moderngl.LINEAR,moderngl.LINEAR);vfbo=ctx.framebuffer([vtex]);
vp['tDepth']=0;vp['tShadow']=2;vp['sunDirection']=tuple(np.array([-34,49,-39])/np.linalg.norm([-34,49,-39]));vp['time']=0.;vp['strength']=.72;write(vp,'sunMatrix',bias@sproj@sview)
cp=ctx.program(vertex_shader=fullv,fragment_shader="""#version 330
in vec2 vUv;out vec4 frag;uniform sampler2D sceneMap;uniform sampler2D volumeMap;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec4 v=texture(volumeMap,vUv);vec3 c=texture(sceneMap,vUv).rgb*v.a+v.rgb;float vignette=1.-.15*pow(length((vUv-.5)*vec2(1.05,.85)),1.8);frag=vec4(pow(aces(c*vignette*1.12),vec3(1./2.2)),1.);}""")
cvao=ctx.vertex_array(cp,[(quad,'2f','p')]);final=ctx.simple_framebuffer((W,H),components=4);cp['sceneMap']=0;cp['volumeMap']=1
views=sys.argv[1:] or ['entrance']
for name in views:
 start=time.time();v=S['views'][name];fbo.use();fbo.clear(.33,.42,.43,1,depth=1);ctx.viewport=(0,0,W,H);write(prog,'projection',matrix(v['projection']));write(prog,'view',matrix(v['view']));prog['camera']=tuple(v['position'])
 for o,vao,sv,inst,arr in objects:
  kind=o.get('kind');count=len(arr);center=arr[:,12:15].mean(axis=0) if o.get('instances') else matrix(o['matrix'])[:3,3];d=np.linalg.norm((np.array(v['position'])-center)[[0,2]]);maximum={'tree':148,'grass':70,'fern':67,'shrub':98,'herb':48}.get(kind,999)
  if d>maximum:continue
  if kind=='grass':count=int(count*(1 if d<22 else .55 if d<36 else .22 if d<51 else .08))
  if kind=='fern':count=int(count*(1 if d<24 else .55 if d<43 else .19))
  if o.get('qaLods'):vao=o['qaLods'][(0 if d<38 else 1 if d<76 else 2) if kind=='tree' else (0 if d<20 else 1)]
  m=S['materials'][o['material']];write(prog,'model',matrix(o['matrix']));prog['color']=tuple(m['color'] or [1,1,1]);prog['useColor']=int(m['vertexColors']);prog['useMap']=int(bool(m.get('map')));prog['useNormal']=int(bool(m.get('normalMap')));prog['repeat']=tuple(m.get('repeat') or [1,1]);prog['moss']=int(m['moss']);prog['leaf']=int(m['wind']);textures.get(m.get('map'),white).use(0);textures.get(m.get('normalMap'),normalDefault).use(1);vao.render(instances=count)
 ctx.disable(moderngl.DEPTH_TEST);vfbo.use();ctx.viewport=(0,0,W//2,H//2);depth.compare_func='';depth.use(0);sdepth.use(2);write(vp,'invProjection',np.linalg.inv(matrix(v['projection'])));write(vp,'cameraWorld',np.linalg.inv(matrix(v['view'])));vp['eye']=tuple(v['position']);vvao.render();final.use();ctx.viewport=(0,0,W,H);color.use(0);vtex.use(1);cvao.render();ctx.enable(moderngl.DEPTH_TEST);ctx.finish();im=Image.frombytes('RGBA',(W,H),final.read(components=4)).transpose(Image.Transpose.FLIP_TOP_BOTTOM);Path('artifacts/offline-views').mkdir(exist_ok=True);im.save('artifacts/offline-views/'+name+'.png');print(name,round(time.time()-start,2),'seconds',flush=True)
