"""Locate a visible botanical surface in an offline inspection render."""
import json,sys
from pathlib import Path
import numpy as np
D=Path('artifacts/scene-data');S=json.loads((D/'scene.json').read_text());v=S['views'][sys.argv[1] if len(sys.argv)>1 else 'moss_orbit_6']
mat=lambda a:np.asarray(a,dtype=float).reshape(4,4).T
world=np.linalg.inv(mat(v['view']));eye=world[:3,3];inverse=np.linalg.inv(mat(v['projection']))
pixels=[(920,705),(720,512),(1030,630),(1300,725)];rays=[]
for x,y in pixels:
 q=inverse@np.array([x/1440*2-1,1-y/900*2,1,1]);direction=(world@np.r_[q[:3]/q[3],0])[:3];direction/=np.linalg.norm(direction);rays.append(direction)
geo={};best=[None]*len(rays)
for o in S['objects']:
 if o['kind'] not in ['fern','shrub'] or o['id'] not in v['draws']:continue
 rec=v['draws'][o['id']];gid=rec['geometry'];g=S['geometries'][gid]
 if gid not in geo:
  p=np.fromfile(D/g['attributes']['position']['file'],dtype='f4').reshape(-1,3).astype(float);idx=np.fromfile(D/g['index']['file'],dtype='u4').reshape(-1,3);geo[gid]=(p,idx)
 p,idx=geo[gid];instances=np.fromfile(D/rec['instances'],dtype='f4').reshape(-1,16)
 for values in instances:
  model=mat(o['matrix'])@mat(values);root=model[:3,3];rd=np.linalg.norm(root[[0,2]]-eye[[0,2]])
  if rd>12:continue
  phase=root[0]*.37+root[2]*.22;wave=np.sin(phase)+.36*np.sin(phase*1.47);bend=np.maximum(p[:,1],0)*(.38 if o['kind']=='fern' else .24)
  pp=p.copy();pp[:,0]+=wave*bend*.13;pp[:,2]+=np.cos(phase)*bend*.068
  a,b,c=pp[idx[:,0]],pp[idx[:,1]],pp[idx[:,2]];e1=b-a;e2=c-a;inv=np.linalg.inv(model);origin=(inv@np.r_[eye,1])[:3];tv=origin-a
  for k,ray in enumerate(rays):
   direction=(inv@np.r_[ray,0])[:3];pv=np.cross(np.broadcast_to(direction,e2.shape),e2);det=np.einsum('ij,ij->i',e1,pv);safe=np.abs(det)>1e-12;reciprocal=np.divide(1,det,out=np.zeros_like(det),where=safe)
   u=np.einsum('ij,ij->i',tv,pv)*reciprocal;qv=np.cross(tv,e1);vv=qv@direction*reciprocal;t=np.einsum('ij,ij->i',e2,qv)*reciprocal;ok=safe&(u>=0)&(vv>=0)&(u+vv<=1)&(t>0)
   if not np.any(ok):continue
   closest=float(t[ok].min())
   if best[k] is None or closest<best[k]['distance']:best[k]={'pixel':pixels[k],'distance':closest,'object':o['id'],'kind':o['kind'],'triangles':len(idx),'root':root.tolist(),'rootDistance':rd,'geometry':gid}
print(json.dumps(best,indent=2))
