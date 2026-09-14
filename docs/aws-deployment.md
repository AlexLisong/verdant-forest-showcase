# AWS deployment on the existing Linux server

**Live showcase: https://forest.whyjs.com**

The forest shares the existing Linux EC2 server used by Grove. Nginx serves its
static files through a separate HTTPS virtual host. It needs no server GPU,
application process, database, or additional virtual machine. Each visitor's browser
uses that visitor's GPU and memory to render the scene.

## Deploy or update

Requirements: Node 22.13+, npm dependencies, Python 3, AWS CLI v2, the `lighthouse`
profile, and the existing server's SSH key. The server uses Python 3.12 and an existing
Certbot account. SSH host keys must already be trusted.

Copy `deploy/config.example.json` to ignored `.aws-local/config.json` and fill in
profile, region, account, existing instance ID, SSH user, and hostname. Keep the SSH
key outside the repository. Commit and push the source, then run:

```bash
npm run deploy:aws -- --config .aws-local/config.json --key /path/to/existing-key.pem
```

The command verifies AWS identity, instance state, and DNS; checks that source is
committed; runs TypeScript, application tests, a production build and deployment
boundary tests; and prepares the static export. It uploads a checksummed archive
and installer over SSH with strict host-key checking.

Only prepared `dist/aws` files are packaged. The Node/Worker server bundles, private
configuration, keys, framework metadata and source maps are excluded. The eight
Python boundary checks run in CI without contacting AWS or changing Nginx.

## Server layout

| Resource | Location |
| --- | --- |
| Release directories | `/opt/verdant-forest/releases/` |
| Active release | `/opt/verdant-forest/current` |
| Retained hashed assets | `/opt/verdant-forest/shared/assets/` |
| Nginx virtual host | `/etc/nginx/sites-available/forest.whyjs.com` |
| Certificate | `/etc/letsencrypt/live/forest.whyjs.com/` |
| Certificate renewal hook | `/etc/letsencrypt/renewal-hooks/deploy/verdant-forest.sh` |
| Local deployment receipt | `.build/deploy/last-deployment.json` (ignored) |

The installer validates archive paths, every file checksum, and release identity.
It refuses to overwrite another application's hostname or unmanaged Nginx config.
Releases activate with an atomic symlink change, followed by Nginx validation and
reload. HTTPS verification checks the new release; failure restores the previous
symlink and virtual-host configuration.

HTTP redirects to HTTPS. Nginx serves JavaScript with the correct MIME types,
compresses text assets, and revalidates browser caches. Missing files return real
404 responses. No catch-all HTML response disguises missing scripts or textures.
Hashed modules from earlier releases stay reachable under `/assets/`, allowing a
browser that loaded earlier HTML to finish loading while a new release activates.

## Verify and roll back

`https://forest.whyjs.com/release.json` identifies the deployed commit and release.
Confirm the rendered forest in a browser, compare asset checksums, and verify Grove
and the neighboring sites remain healthy after deployment.

Previous releases stay under `/opt/verdant-forest/releases/`. For a content rollback,
atomically repoint `current` to a previously verified release and recheck the public
release identity. The Nginx document root remains the same. Configuration changes
must be tested with `nginx -t` before reloading.

## Migration from S3 and CloudFront

The first deployment used dedicated S3/CloudFront resources. The user chose to
reuse the already-paid Grove server to avoid separate hosting resources. The old
CloudFront deployment is retired only after the Linux replacement passes HTTPS,
asset-integrity, browser, and neighboring-service checks.

The earlier CloudFormation template and deployment script remain available in Git
history at commit `0ba4d9476b8202c8c8b714e44e8f9742589604f0`. They are not part of the
current deployment workflow.
