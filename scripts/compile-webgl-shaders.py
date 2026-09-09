"""Compile unmodified Three WebGL shader sources as GLSL ES 3.00.

Uses Mesa's ES shader compiler through an EGL context; this verifies language
and linking, not browser rendering, mobile drivers, or frame rates.
Optional FOREST_LIBEGL and __EGL_VENDOR_LIBRARY_FILENAMES locate local Mesa.
"""
import argparse
import json
import os
from pathlib import Path
import moderngl

parser=argparse.ArgumentParser()
parser.add_argument('--check-regression',action='store_true')
args=parser.parse_args()
options={'backend':'egl','require':330}
if os.environ.get('FOREST_LIBEGL'):
    options['libegl']=os.environ['FOREST_LIBEGL']
ctx=moderngl.create_standalone_context(**options)
root=Path('artifacts/webgl-shaders')
manifest=json.loads((root/'manifest.json').read_text())
results=[]
for name in manifest['variants']:
    try:
        vertex=(root/f'{name}.vert').read_text()
        fragment=(root/f'{name}.frag').read_text()
        assert vertex.startswith('#version 300 es\n')
        assert fragment.startswith('#version 300 es\n')
        program=ctx.program(vertex_shader=vertex,fragment_shader=fragment)
        program.release()
        results.append({'name':name,'passed':True})
    except Exception as error:
        results.append({'name':name,'passed':False,'error':str(error)})
        print(name,str(error))
regression=None
if args.check_regression:
    # Prove this test rejects the exact original bug, not merely that a new
    # shader happens to compile. Restore the former identifier in memory only.
    original=(root/'ground.frag').read_text().replace('coverPatch','patch')
    try:
        program=ctx.program(vertex_shader=(root/'ground.vert').read_text(),fragment_shader=original)
        program.release()
        regression={'passed':False,'error':'Original reserved-word bug incorrectly compiled'}
    except Exception as error:
        regression={'passed':"reserved word `patch'" in str(error),'error':str(error)}
    print('Original bug rejected:',regression['passed'])
passed=sum(row['passed'] for row in results)
report={'renderer':ctx.info['GL_RENDERER'],'language':'GLSL ES 3.00',
        'passed':passed,'total':len(results),'programs':results,'regression':regression}
Path('artifacts/webgl-shader-results.json').write_text(json.dumps(report,indent=2))
print(f'GLSL ES compile/link: {passed}/{len(results)} passed')
raise SystemExit(0 if passed==len(results) and (regression is None or regression['passed']) else 1)
