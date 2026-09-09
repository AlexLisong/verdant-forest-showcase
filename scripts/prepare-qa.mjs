import fs from 'node:fs';import ts from 'typescript';import crypto from 'node:crypto';
fs.mkdirSync('artifacts/qa-modules',{recursive:true});
for(const f of fs.readdirSync('app/forest')){
 if(!/\.(ts|js)$/.test(f))continue;
 const source=fs.readFileSync('app/forest/'+f,'utf8');
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 js=js.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p.replace(/\.(ts|js)$/,'')}.mjs'`);
 fs.writeFileSync('artifacts/qa-modules/'+f.replace(/\.(ts|js)$/,'.mjs'),js);
}
const {volumeFragment,compositeFragment,occlusionFragment}=await import('../artifacts/qa-modules/volumetrics.mjs?'+Date.now());
fs.writeFileSync('artifacts/qa-modules/volume.frag',volumeFragment);
fs.writeFileSync('artifacts/qa-modules/composite.frag',compositeFragment);

fs.writeFileSync('artifacts/qa-modules/occlusion.frag',occlusionFragment);

// Generate every native material/post shader together with the modules.
// A single preparation step prevents stale composite-shader comparisons.
await import('./export-shader-check.mjs');
const files=Object.fromEntries(fs.readdirSync('app/forest').filter(f=>/\.(ts|js)$/.test(f)).sort().map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync('app/forest/'+f)).digest('hex')]));
const manifest={files,sha256:crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex')};
fs.writeFileSync('artifacts/qa-modules/source-manifest.json',JSON.stringify(manifest,null,2));
