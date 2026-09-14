"""Root-only static release installer, restricted to Verdant Forest Showcase paths."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

ROOT = Path("/opt/verdant-forest")
HOST = None


def run(*args):
    subprocess.run(args, check=True)


def assert_hostname_available(host, owned_config):
    """Refuse an exact server-name collision anywhere in nginx's active includes."""
    result = subprocess.run(["nginx", "-T"], capture_output=True, text=True, check=True)
    sections = re.split(
        r"^# configuration file (.+):\n", result.stdout, flags=re.MULTILINE
    )
    for filename, body in zip(sections[1::2], sections[2::2]):
        if Path(filename).resolve() == owned_config.resolve():
            continue
        body = re.sub(r"#.*", "", body)
        for match in re.finditer(r"\bserver_name\s+([^;]+);", body):
            if host in [name.strip("\"'") for name in match[1].split()]:
                raise ValueError(f"Hostname already configured in {filename}")


def nginx(tls):
    view_paths = ["/"]
    view_locations = "".join(
        f"    location = {path} {{ try_files /index.html =404; }}\n"
        for path in view_paths
    )
    common = f"""    server_name {HOST};
    root {ROOT}/current;
    index index.html;
    charset utf-8;
    autoindex off;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header X-Frame-Options SAMEORIGIN always;
    location ~ /\\. {{ deny all; }}
    location ^~ /assets/ {{
        root {ROOT}/shared;
        include /etc/nginx/mime.types;
        types {{ application/javascript mjs; }}
        try_files $uri =404;
    }}
{view_locations}    location / {{ try_files $uri $uri/ =404; }}
    add_header Cache-Control "no-cache" always;
    etag on;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml application/wasm;
    location ~ \\.mjs$ {{ types {{ application/javascript mjs; }} try_files $uri =404; }}
"""
    acme = (
        "    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }\n"
    )
    if not tls:
        return (
            "# Managed by Verdant Forest Showcase\nserver {\n    listen 80;\n"
            + common
            + acme
            + "}\n"
        )
    return f"""# Managed by Verdant Forest Showcase
server {{
    listen 80;
    server_name {HOST};
{acme}    location / {{ return 301 https://{HOST}$request_uri; }}
}}
server {{
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/{HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{HOST}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
{common}}}
"""


def install(archive, release):
    if os.geteuid() != 0:
        raise SystemExit("Run with sudo")
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[a-z0-9]+", release):
        raise ValueError("Invalid release name")
    current = ROOT / "current"
    conf = Path("/etc/nginx/sites-available") / HOST
    enabled = Path("/etc/nginx/sites-enabled") / HOST
    if current.exists() and not current.is_symlink():
        raise ValueError("Current path is not a release symlink")
    if conf.exists() and not conf.read_text().startswith("# Managed by Verdant Forest Showcase\n"):
        raise ValueError("Refusing to replace an unmanaged virtual host")
    if enabled.is_symlink() and enabled.resolve() != conf.resolve():
        raise ValueError("Enabled site points to another configuration")
    if enabled.exists() and not enabled.is_symlink():
        raise ValueError("Enabled site is not a symlink")
    dest = ROOT / "releases" / release
    dest.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if len({m.name for m in members}) != len(members):
            raise ValueError("Duplicate archive member")
        for member in members:
            p = Path(member.name)
            if (
                p.is_absolute()
                or ".." in p.parts
                or not (member.isfile() or member.isdir())
            ):
                raise ValueError("Unsafe archive member")
        tar.extractall(dest, filter="data")
    manifest = json.loads((dest / "checksums.json").read_text())
    actual = {
        str(p.relative_to(dest))
        for p in dest.rglob("*")
        if p.is_file() and p.name != "checksums.json"
    }
    if actual != set(manifest):
        raise ValueError("Release file set differs from manifest")
    for name, digest in manifest.items():
        with (dest / name).open("rb") as source:
            hasher = hashlib.sha256()
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                hasher.update(chunk)
            actual_digest = hasher.hexdigest()
        if actual_digest != digest:
            raise ValueError(f"Checksum mismatch: {name}")
    if not (dest / "index.html").is_file():
        raise ValueError("Missing application entry point")
    release_info = json.loads((dest / "release.json").read_text())
    if release_info["release"] != release:
        raise ValueError("Release identity mismatch")
    assert_hostname_available(HOST, conf)
    for p in dest.rglob("*"):
        p.chmod(0o755 if p.is_dir() else 0o644)
    dest.chmod(0o755)
    retain_assets(dest)
    current = ROOT / "current"
    previous = os.readlink(current) if current.is_symlink() else None
    conf = Path("/etc/nginx/sites-available") / HOST
    enabled = Path("/etc/nginx/sites-enabled") / HOST
    old_conf = conf.read_bytes() if conf.exists() else None
    was_enabled = enabled.is_symlink() or enabled.exists()
    link = ROOT / "current.next"
    link.unlink(missing_ok=True)
    link.symlink_to(dest)
    link.replace(current)
    try:
        cert = Path("/etc/letsencrypt/live") / HOST / "fullchain.pem"
        Path("/var/www/letsencrypt").mkdir(parents=True, exist_ok=True)
        conf.write_text(nginx(cert.exists()))
        if not enabled.exists():
            enabled.symlink_to(conf)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        if not cert.exists():
            run(
                "certbot",
                "certonly",
                "--webroot",
                "-w",
                "/var/www/letsencrypt",
                "-d",
                HOST,
                "--non-interactive",
            )
            conf.write_text(nginx(True))
            run("nginx", "-t")
            run("systemctl", "reload", "nginx")
        hook = Path("/etc/letsencrypt/renewal-hooks/deploy/verdant-forest.sh")
        hook.parent.mkdir(parents=True, exist_ok=True)
        hook.write_text(
            f'#!/bin/sh\nif [ "$RENEWED_LINEAGE" = /etc/letsencrypt/live/{HOST} ]; then\n    nginx -t && systemctl reload nginx\nfi\n'
        )
        hook.chmod(0o755)
        # nginx's reload signal returns before new TLS workers are necessarily ready.
        check = [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--max-time",
            "5",
            "--resolve",
            f"{HOST}:443:127.0.0.1",
            f"https://{HOST}/release.json",
        ]
        for attempt in range(10):
            result = subprocess.run(check, capture_output=True, text=True, check=False)
            if result.returncode == 0:
                try:
                    if json.loads(result.stdout).get("release") == release:
                        break
                except json.JSONDecodeError:
                    pass
            if attempt == 9:
                raise RuntimeError(
                    "HTTPS health check failed: " + result.stderr.strip()
                )
            time.sleep(1)
    except BaseException:
        if previous:
            link.unlink(missing_ok=True)
            link.symlink_to(previous)
            link.replace(current)
        else:
            current.unlink(missing_ok=True)
        if old_conf is not None:
            conf.write_bytes(old_conf)
        else:
            enabled.unlink(missing_ok=True)
            conf.unlink(missing_ok=True)
        if not was_enabled:
            enabled.unlink(missing_ok=True)
        subprocess.run(["nginx", "-t"], check=False)
        subprocess.run(["systemctl", "reload", "nginx"], check=False)
        raise
    print(
        json.dumps({"release": release, "previous": previous, "url": f"https://{HOST}"})
    )


def retain_assets(release_directory):
    """Keep content-hashed modules reachable for pages open before activation."""
    for source in (release_directory / "assets").rglob("*"):
        if not source.is_file():
            continue
        target = ROOT / "shared/assets" / source.relative_to(release_directory / "assets")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink():
            raise ValueError(f"Shared asset is a symlink: {target.name}")
        if target.exists():
            if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
                raise ValueError(f"Immutable asset name collision: {target.name}")
        else:
            temporary = target.with_name("." + target.name + ".next")
            shutil.copyfile(source, temporary)
            temporary.chmod(0o644)
            temporary.replace(target)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: install.py ARCHIVE RELEASE HOSTNAME")
    HOST = sys.argv[3]
    if (
        not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+",
            HOST,
        )
        or len(HOST) > 253
    ):
        raise SystemExit("Invalid hostname")
    install(sys.argv[1], sys.argv[2])
