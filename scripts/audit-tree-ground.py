"""Independent contact audit from exported tree matrices and terrain triangles."""
from pathlib import Path
import os,json,numpy as np
D=Path(os.environ.get('FOREST_QA_DIR','artifacts/release-data'));s=json.loads((D/'scene.json').read_text());geos=s['geometries'];ground=geos[s['objects'][0]['geometry']]
values=np.fromfile(D/ground['attributes']['position']['file'],dtype='f4');stride=round((len(values)/3)**.5);p=values.reshape(stride,stride,3);axis=p[0,:,0];h=p[:,:,1]
def height(x,z):
 i=np.clip(np.searchsorted(axis,x)-1,0,stride-2);j=np.clip(np.searchsorted(axis,z)-1,0,stride-2);u=(x-axis[i])/(axis[i+1]-axis[i]);v=(z-axis[j])/(axis[j+1]-axis[j]);a=h[j,i];b=h[j+1,i];c=h[j+1,i+1];d=h[j,i+1]
 return np.where(u+v<=1,a+(d-a)*u+(b-a)*v,c+(b-c)*(1-u)+(d-c)*(1-v))
records=[]
for o in s['objects']:
 if o.get('kind')!='tree' or o.get('dynamicInstances') or 'forest-tree-bark-' not in s['materials'][o['material']].get('cacheKey',''):continue
 g=geos[o['geometry']];v=np.fromfile(D/g['attributes']['position']['file'],dtype='f4').reshape(-1,3);v=v[np.abs(v[:,1])<1e-7];v=np.concatenate([v,np.ones((len(v),1))],axis=1)
 mats=np.fromfile(D/o['instances']['file'],dtype='f4').reshape(-1,4,4).transpose(0,2,1)
 for m in mats:
  w=(m@v.T).T;e=w[:,1]-height(w[:,0],w[:,2]);records.append({'x':float(m[0,3]),'z':float(m[2,3]),'maxAbove':float(e.max()),'maxBelow':float(e.min())})
r={'source':s.get('source',{}).get('sha256'),'trees':len(records),'treesWithExposedBaseAbove1cm':sum(x['maxAbove']>.01 for x in records),'treesWithExposedBaseAbove5cm':sum(x['maxAbove']>.05 for x in records),'maxAbove':max(x['maxAbove'] for x in records),'worst':sorted(records,key=lambda x:-x['maxAbove'])[:12],'description':'All zero-height high-tree trunk/buttress base vertices transformed by original tree instance matrices; compared with the actual exported terrain triangles. Distant pooled duplicates excluded.'}
Path('artifacts/tree-ground-audit-after.json').write_text(json.dumps(r,indent=2));print(json.dumps(r));assert r['treesWithExposedBaseAbove1cm']==0
