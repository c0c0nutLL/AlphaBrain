"""Constrained worker commands used by UtilityManager.

This module intentionally does not expose a generic shell-command escape hatch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path

from .resource_catalog import LIBERO_REPOS


def copy_tree(source: Path, target: Path, run_id: str) -> None:
    if not source.is_dir():
        raise SystemExit("source directory does not exist")
    if target.exists():
        raise SystemExit("target directory already exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / f".{target.name}.partial-{run_id}"
    if temporary.exists():
        shutil.rmtree(temporary)
    try:
        shutil.copytree(source, temporary, symlinks=True)
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def dataset_stats(source: Path, output: Path) -> None:
    files = 0
    size = 0
    digest = hashlib.sha256()
    for root, _directories, names in os.walk(source):
        for name in sorted(names):
            path = Path(root) / name
            try:
                info = path.stat()
            except OSError:
                continue
            relative = str(path.relative_to(source))
            files += 1
            size += info.st_size
            digest.update(relative.encode())
            digest.update(str(info.st_size).encode())
            digest.update(str(info.st_mtime_ns).encode())
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps({"file_count": files, "size_bytes": size, "fingerprint": digest.hexdigest()}), encoding="utf-8")
    os.replace(temporary, output)


def download_libero(target: Path, repo_root: Path) -> None:
    try:
        from huggingface_hub import snapshot_download
    except ImportError as exc:
        raise SystemExit("huggingface_hub is required") from exc
    target.mkdir(parents=True, exist_ok=True)
    modality = repo_root / "benchmarks/LIBERO/train/modality.json"
    token = os.environ.get("HF_TOKEN")
    for repo in LIBERO_REPOS:
        destination = target / repo.rsplit("/", 1)[-1]
        snapshot_download(repo_id=repo, repo_type="dataset", local_dir=destination, token=token)
        metadata = destination / "meta"
        metadata.mkdir(parents=True, exist_ok=True)
        if modality.is_file():
            shutil.copy2(modality, metadata / "modality.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    copy_parser = commands.add_parser("copy-tree")
    copy_parser.add_argument("--source", required=True)
    copy_parser.add_argument("--target", required=True)
    copy_parser.add_argument("--run-id", required=True)
    stats_parser = commands.add_parser("dataset-stats")
    stats_parser.add_argument("--source", required=True)
    stats_parser.add_argument("--output", required=True)
    libero_parser = commands.add_parser("download-libero")
    libero_parser.add_argument("--target", required=True)
    libero_parser.add_argument("--repo-root", required=True)
    args = parser.parse_args()
    if args.command == "copy-tree":
        copy_tree(Path(args.source), Path(args.target), args.run_id)
    elif args.command == "dataset-stats":
        dataset_stats(Path(args.source), Path(args.output))
    else:
        download_libero(Path(args.target), Path(args.repo_root))


if __name__ == "__main__":
    main()
