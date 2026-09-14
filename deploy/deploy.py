"""Ship the built static forest to the existing AWS host using a private config."""

import argparse
import datetime
import hashlib
import io
import json
import re
import shlex
import socket
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def package(archive, release, sha):
    static_root = ROOT / "dist/aws"
    names = sorted(p.relative_to(ROOT).as_posix() for p in static_root.rglob("*") if p.is_file() or p.is_symlink())
    if not (static_root / "index.html").is_file():
        raise ValueError("Missing prepared static export")
    manifest = {}
    with tarfile.open(archive, "w:gz") as tar:
        for name in sorted(filter(None, names)):
            path = ROOT / name
            if path.is_symlink() or not path.is_file():
                raise ValueError(f"Expected a regular static file: {name}")
            relative = str(path.relative_to(static_root))
            if any(part.startswith(".") for part in Path(relative).parts) or relative.endswith(".map"):
                raise ValueError(f"Private/build-only file in export: {relative}")
            manifest[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
            tar.add(path, arcname=relative, recursive=False)
        data = json.dumps({"release": release, "commit": sha}).encode()
        manifest["release.json"] = hashlib.sha256(data).hexdigest()
        for name, content in [
            ("release.json", data),
            ("checksums.json", json.dumps(manifest).encode()),
        ]:
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode = len(content), 0o644
            tar.addfile(entry, io.BytesIO(content))
    return hashlib.sha256(archive.read_bytes()).hexdigest(), len(manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.expanduser().read_text())
    host = config["hostname"]
    if (
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host)
        or "." not in host
        or len(host) > 253
    ):
        raise ValueError("Invalid hostname")
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", config["sshUser"]):
        raise ValueError("Invalid SSH user")

    def aws(*arguments):
        return json.loads(
            subprocess.check_output(
                [
                    "aws",
                    "--profile",
                    config["profile"],
                    "--region",
                    config["region"],
                    *arguments,
                    "--output",
                    "json",
                ]
            )
        )

    if aws("sts", "get-caller-identity")["Account"] != config["account"]:
        raise RuntimeError("AWS account differs from the deployment configuration")
    instance = aws("ec2", "describe-instances", "--instance-ids", config["instance"])[
        "Reservations"
    ][0]["Instances"][0]
    if instance["State"]["Name"] != "running":
        raise RuntimeError("Target instance is not running")
    address = instance["PublicIpAddress"]
    if socket.gethostbyname(host) != address:
        raise RuntimeError("DNS does not point to the target instance")
    if subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    ).strip():
        raise RuntimeError("Commit the source before deployment")
    run("npm", "run", "typecheck", cwd=ROOT)
    run("npm", "test", cwd=ROOT)
    run("node", "scripts/prepare-aws.mjs", cwd=ROOT)
    run("python3", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py", cwd=ROOT)
    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()
    release = (
        datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        + "-"
        + sha[:12]
    )
    work = ROOT / ".build/deploy"
    work.mkdir(parents=True, exist_ok=True)
    archive = work / (release + ".tar.gz")
    checksum, count = package(archive, release, sha)
    print(
        f"Packaged {count} verified files ({archive.stat().st_size // 1024 // 1024} MB)",
        flush=True,
    )
    target = f"{config['sshUser']}@{address}"
    options = [
        "-i",
        str(args.key.expanduser().resolve()),
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
    ]
    remote = "/tmp/verdant-forest-" + release
    run("ssh", *options, target, "mkdir", remote)
    run(
        "scp",
        *options,
        str(archive),
        str(ROOT / "deploy/install.py"),
        target + ":" + remote + "/",
    )
    remote_archive = remote + "/" + archive.name
    command = "sha256sum -c - && sudo python3 " + " ".join(
        shlex.quote(x) for x in [remote + "/install.py", remote_archive, release, host]
    )
    installer_checksum = hashlib.sha256(
        (ROOT / "deploy/install.py").read_bytes()
    ).hexdigest()
    run(
        "ssh",
        *options,
        target,
        command,
        input=f"{checksum}  {remote_archive}\n{installer_checksum}  {remote}/install.py\n",
        text=True,
    )
    result = {
        "release": release,
        "commit": sha,
        "url": "https://" + host,
        "archiveSha256": checksum,
        "files": count,
    }
    (work / "last-deployment.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
