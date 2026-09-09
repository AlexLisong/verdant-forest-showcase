import os,json
from pathlib import Path
import moderngl
p=Path('/workspace/scratch/46479389b383/render-libs')
os.environ['__EGL_VENDOR_LIBRARY_FILENAMES']=str(p/'vendor.json')
ctx=moderngl.create_standalone_context(backend='egl',libegl=str(p/'local/usr/lib/x86_64-linux-gnu/libEGL.so.1'),require=330)
results=[]
for v in [*Path('artifacts/shader-check').glob('*.vert'),*Path('artifacts/shader-depth').glob('*.vert'),*Path('artifacts/shader-extra').glob('*.vert')]:
 try:
  pr=ctx.program(vertex_shader=v.read_text(),fragment_shader=v.with_suffix('.frag').read_text());pr.release();results.append({'material':v.stem,'compiled':True});print(v.stem,'PASS')
 except Exception as e:
  results.append({'material':v.stem,'compiled':False,'error':str(e)});print(v.stem,str(e)[:2400])
Path('artifacts/shader-compile-results.json').write_text(json.dumps(results,indent=2))
raise SystemExit(0 if all(r['compiled'] for r in results) else 1)
