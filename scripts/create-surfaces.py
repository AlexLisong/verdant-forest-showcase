import numpy as np
from PIL import Image
from scipy.ndimage import zoom, gaussian_filter, map_coordinates
from pathlib import Path
out=Path('artifacts/procedural-textures'); out.mkdir(exist_ok=True,parents=True)
rng=np.random.default_rng(129); N=1024
y,x=np.mgrid[0:N,0:N]/N

def layer(fx,fy):
 a=rng.random((fy+1,fx+1)); a[-1]=a[0];a[:,-1]=a[:,0]
 return map_coordinates(a,[y*fy,x*fx],order=3,mode='wrap')
def norm(h,strength=2.5):
 dy,dx=np.gradient(h);n=np.stack([-dx*strength,-dy*strength,np.ones_like(h)],axis=-1);n/=np.linalg.norm(n,axis=2,keepdims=True);return ((n*.5+.5)*255).clip(0,255).astype('uint8')
def save(a,name):Image.fromarray((np.clip(a,0,1)*255).astype('uint8')).save(out/name,quality=95)
warp=(layer(5,10)-.5)*.038+(layer(14,19)-.5)*.012
ridges=(.5+.5*np.sin((x+warp)*np.pi*82))**.28
cracks=(.5+.5*np.sin((x+warp*.68)*np.pi*132+layer(9,16)*4))**.2
long=layer(65,13); fine=layer(180,85); micro=rng.random((N,N))
bark=(ridges*.46+cracks*.16+long*.22+fine*.10+micro*.06)
# Occasional horizontal fissures join long vertical plates.
fissure=(layer(32,110)>.76)*np.clip((.5-ridges)*2,0,1)
bark-=fissure*.15
moss=np.clip((layer(11,9)-.57)*2,0,.55)
base=np.stack([.13+bark*.33,.115+bark*.285,.082+bark*.222],axis=-1)
base=base*(1-moss[...,None]) + np.array([.25,.29,.12])*moss[...,None]
save(base,'bark-color.jpg');Image.fromarray(norm(bark,18)).save(out/'bark-normal.jpg',quality=95)
coarse=layer(8,8); mid=layer(37,37); fine=layer(170,170); grit=rng.random((N,N));h=coarse*.25+mid*.3+fine*.25+grit*.2
moss=np.clip((layer(17,17)-.13)*2,0,.96)
dirt=np.stack([.17+h*.22,.13+h*.18,.085+h*.13],axis=-1)
dirt=dirt*(1-moss[...,None]) + (np.array([.24,.30,.115])[None,None,:]*(.68+h[...,None]*.6))*moss[...,None]
save(dirt,'ground-color.jpg');Image.fromarray(norm(h,12)).save(out/'ground-normal.jpg',quality=95)
r=np.sqrt((x-.5)**2+(y-.5)**2);rings=(np.sin((r+layer(6,6)*.008)*350)*.5+.5)
fleck=layer(70,70);g=.45+rings*.17+fleck*.11
wood=np.stack([g,g*.78,g*.5],axis=-1);save(wood,'endgrain.jpg')
print('Created five original surface maps:',sum(p.stat().st_size for p in out.glob('*.jpg')),'bytes')
