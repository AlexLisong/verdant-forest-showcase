# Gates: release
- [x] R1: Build succeeds from complete integrated source.
  EVIDENCE: The integrated production build completed successfully via the Sites build-site.mjs helper, observed2026-09-05 06:24UTC. TypeScript,9camera checks and27native shader programs also pass. app/forest source fingerprint3a80e26f1fe55597298bb38dcc0d577b89f7ad255ae51da73ded304d3a67055c.
- [x] R2: Public access and ready deployment confirmed by Sites tools.
  EVIDENCE: Native Sites deployment appgdep_6a9bb8089f208191b69103212768dc02 reports succeeded at2026-09-05T06:35:03.428888+00:00; get_site confirms access_mode public, version1 and current_live_url https://verdant-forest.lexn8.chatgpt.site. artifacts/deployment-evidence.json preserves the exact saved version, source SHA and archive hash.
