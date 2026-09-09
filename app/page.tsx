'use client';
import { useEffect, useRef, useState } from 'react';
export default function Forest() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const abort = new AbortController();
    import('./forest/engine').then(async ({createForest}) => {
      if (cancelled || !host.current) return;
      dispose = await createForest(host.current, () => setReady(true), abort.signal);
      if (cancelled) dispose?.();
    }).catch(e => {if(cancelled || e?.name==='AbortError')return;console.error(e);setError(/WebGL|context/i.test(e?.message||'') ? 'This browser cannot run 3D. Enable hardware acceleration or try another browser.' : 'The forest could not load. Please reload to try again.');});
    return () => {cancelled = true; abort.abort(); dispose?.();};
  }, []);
  return <main className="forest" aria-label="Interactive 3D forest"><div ref={host} className="forest-canvas" />{!ready && <div className="loading" role="status"><span className="loading-mark"/>{error || 'Entering the forest'}</div>}<div className={`camera-hint ${ready ? 'ready' : ''}`}>Drag to look · WASD to move · Q / E to descend / rise</div></main>;
}
