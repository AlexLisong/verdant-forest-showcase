"""Verify Linux release boundaries without contacting AWS or changing nginx."""

import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "deploy" / f"{name}.py")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


ship, installer = module("deploy"), module("install")


class DeploymentTests(unittest.TestCase):
    def test_other_sites_hostname_cannot_be_replaced(self):
        config = "# configuration file /etc/nginx/sites-enabled/another-site:\nserver { server_name forest-test.invalid; }\n"
        with patch.object(installer.subprocess, "run", return_value=SimpleNamespace(stdout=config)):
            with self.assertRaisesRegex(ValueError, "Hostname already configured"):
                installer.assert_hostname_available("forest-test.invalid", Path("/etc/nginx/sites-available/forest-test.invalid"))

    def test_only_prepared_public_files_are_packaged_with_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist/aws").mkdir(parents=True)
            (root / "dist/aws/index.html").write_text("forest")
            (root / "dist/server").mkdir()
            (root / "dist/server/private.js").write_text("not public")
            (root / ".env").write_text("not public")
            archive = root / "release.tar.gz"
            with patch.object(ship, "ROOT", root):
                digest, count = ship.package(archive, "20260914T000000Z-abcdef", "a" * 40)
            self.assertEqual(digest, hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertEqual(count, 2)
            with tarfile.open(archive) as tar:
                self.assertEqual(set(tar.getnames()), {"index.html", "release.json", "checksums.json"})
                for name, expected in json.load(tar.extractfile("checksums.json")).items():
                    self.assertEqual(hashlib.sha256(tar.extractfile(name).read()).hexdigest(), expected)

    def test_symlinks_and_dotfiles_cannot_be_packaged(self):
        for name in (".env", "linked.txt"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                static = root / "dist/aws"
                static.mkdir(parents=True)
                (static / "index.html").write_text("forest")
                if name == ".env":
                    (static / name).write_text("secret")
                else:
                    (static / name).symlink_to(static / "index.html")
                with patch.object(ship, "ROOT", root), self.assertRaises(ValueError):
                    ship.package(root / "release.tar.gz", "20260914T000000Z-abcdef", "a" * 40)

    def test_unsafe_archive_cannot_change_current_release(self):
        for name, kind in [("../escape", tarfile.REGTYPE), ("link", tarfile.SYMTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                old = root / "previous"
                old.mkdir()
                (root / "current").symlink_to(old)
                archive = root / "bad.tar.gz"
                with tarfile.open(archive, "w:gz") as tar:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    entry.linkname = "/etc/passwd" if kind == tarfile.SYMTYPE else ""
                    tar.addfile(entry)
                with patch.object(installer, "ROOT", root), patch.object(installer, "HOST", "forest-test.invalid"), patch.object(installer.os, "geteuid", return_value=0), patch.object(installer, "run") as run:
                    with self.assertRaisesRegex(ValueError, "Unsafe archive"):
                        installer.install(archive, "20260914T000000Z-abcdef")
                    run.assert_not_called()
                    self.assertEqual((root / "current").resolve(), old.resolve())

    def test_tampered_release_does_not_activate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "bad.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                for name, content in [("index.html", b"tampered"), ("checksums.json", json.dumps({"index.html": "0" * 64}).encode())]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(content)
                    tar.addfile(entry, io.BytesIO(content))
            with patch.object(installer, "ROOT", root), patch.object(installer, "HOST", "forest-test.invalid"), patch.object(installer.os, "geteuid", return_value=0), patch.object(installer, "run") as run:
                with self.assertRaisesRegex(ValueError, "Checksum mismatch"):
                    installer.install(archive, "20260914T000000Z-abcdef")
                run.assert_not_called()
                self.assertFalse((root / "current").exists())

    def test_config_scopes_root_and_preserves_real_404s(self):
        with patch.object(installer, "HOST", "forest-test.invalid"):
            config = installer.nginx(True)
        self.assertIn("root /opt/verdant-forest/current;", config)
        self.assertIn("return 301 https://forest-test.invalid$request_uri;", config)
        self.assertIn("location / { try_files $uri $uri/ =404; }", config)
        self.assertIn("application/javascript mjs", config)
        self.assertNotIn("proxy_pass", config)
        self.assertNotIn("grove", config)
        self.assertIn("root /opt/verdant-forest/shared;", config)

    def test_previous_hashed_assets_remain_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for release, name, data in [("one", "engine-old.js", "old"), ("two", "engine-new.js", "new")]:
                assets = root / release / "assets"
                assets.mkdir(parents=True)
                (assets / name).write_text(data)
                with patch.object(installer, "ROOT", root):
                    installer.retain_assets(root / release)
            self.assertEqual((root / "shared/assets/engine-old.js").read_text(), "old")
            self.assertEqual((root / "shared/assets/engine-new.js").read_text(), "new")

    def test_immutable_asset_collision_cannot_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "release/assets").mkdir(parents=True)
            (root / "shared/assets").mkdir(parents=True)
            (root / "release/assets/engine-hash.js").write_text("different")
            (root / "shared/assets/engine-hash.js").write_text("original")
            with patch.object(installer, "ROOT", root), self.assertRaisesRegex(ValueError, "Immutable asset name collision"):
                installer.retain_assets(root / "release")
            self.assertEqual((root / "shared/assets/engine-hash.js").read_text(), "original")


if __name__ == "__main__":
    unittest.main()
