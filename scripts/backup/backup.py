"""Encrypted OFA logical database + Storage backup. Python standard library only."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

BUCKET = "ofa-attachments"
REQUIRED = (
    "OFA_DB_HOST", "OFA_DB_PORT", "OFA_DB_USER", "OFA_DB_PASSWORD",
    "OFA_DB_CA_CERT", "OFA_S3_ENDPOINT", "OFA_S3_REGION",
    "OFA_S3_ACCESS_KEY_ID", "OFA_S3_SECRET_ACCESS_KEY",
    "OFA_DRIVE_CLIENT_ID", "OFA_DRIVE_CLIENT_SECRET", "OFA_DRIVE_TOKEN",
    "OFA_DRIVE_BACKUP_FOLDER_ID", "OFA_BACKUP_AGE_RECIPIENT",
)


class BackupError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def log(message):
    print(f"{now()} {message}", flush=True)


def validate(env):
    missing = [key for key in REQUIRED if not env.get(key, "").strip()]
    if missing:
        raise BackupError("Missing GitHub Actions Secrets: " + ", ".join(missing))
    if env["OFA_DB_PORT"] != "5432":
        raise BackupError("Use direct PostgreSQL or SESSION pooler on port 5432, not transaction pooling")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+", env["OFA_DB_HOST"]):
        raise BackupError("OFA_DB_HOST must contain only a hostname")
    endpoint = urlparse(env["OFA_S3_ENDPOINT"])
    if (endpoint.scheme != "https" or not endpoint.hostname
            or endpoint.username or endpoint.password or endpoint.query or endpoint.fragment
            or not endpoint.path.endswith("/storage/v1/s3")):
        raise BackupError("OFA_S3_ENDPOINT must be the HTTPS S3 endpoint from Supabase")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", env["OFA_DRIVE_BACKUP_FOLDER_ID"]):
        raise BackupError("OFA_DRIVE_BACKUP_FOLDER_ID must be a folder ID, not a URL")
    if not re.fullmatch(r"age1[0-9a-z]{58}", env["OFA_BACKUP_AGE_RECIPIENT"]):
        raise BackupError("OFA_BACKUP_AGE_RECIPIENT must be a native age public recipient")
    try:
        token = json.loads(env["OFA_DRIVE_TOKEN"])
        if not token.get("refresh_token"):
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise BackupError("OFA_DRIVE_TOKEN must be rclone OAuth JSON containing a refresh_token") from None


def run(stage, args, env, *, attempts=1, timeout=3600):
    """Never echo tool output: it can contain credentials or private object names."""
    for attempt in range(1, attempts + 1):
        log(f"{stage} (attempt {attempt}/{attempts})")
        try:
            result = subprocess.run(args, env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=timeout, check=False)
        except subprocess.TimeoutExpired:
            reason = "timed out"
        except OSError:
            raise BackupError(f"{stage}: could not start required executable") from None
        else:
            if result.returncode == 0:
                if result.stderr and args[0] == "pg_dump":
                    # Do not silently accept a warning about an incomplete database dump.
                    raise BackupError(f"{stage}: pg_dump emitted warnings; inspect privately before retrying")
                return result.stdout
            reason = f"exit code {result.returncode}"
        log(f"{stage}: {reason}; tool output withheld to protect private data")
        if attempt < attempts:
            time.sleep(5 * attempt)
    raise BackupError(f"{stage} failed after {attempts} attempt(s): {reason}")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def inventory(raw):
    """Canonical remote listing. Fail closed on duplicate paths or missing identity."""
    records = json.loads(raw)
    result = {}
    for entry in records:
        if entry.get("IsDir"):
            continue
        key = entry["Path"]
        if key in result or entry["Size"] < 0:
            raise BackupError("Storage inventory has duplicate keys or invalid sizes")
        result[key] = {k: entry.get(k) for k in ("Size", "ModTime", "Hashes", "MimeType")}
    return result


def child_env(source, root):
    # Pass each tool only its own credentials, never all OFA_* secrets.
    base = {k: v for k, v in source.items() if not k.startswith("OFA_")}
    ca = root / "db-ca.crt"
    ca.write_text(source["OFA_DB_CA_CERT"], encoding="utf-8")
    db = dict(base, PGHOST=source["OFA_DB_HOST"], PGPORT=source["OFA_DB_PORT"],
              PGUSER=source["OFA_DB_USER"], PGPASSWORD=source["OFA_DB_PASSWORD"],
              PGDATABASE="postgres", PGSSLMODE="verify-full", PGSSLROOTCERT=str(ca),
              PGCONNECT_TIMEOUT="30", PGAPPNAME="ofa-backup")
    # The writable config lives only on the ephemeral runner. rclone may refresh OAuth tokens.
    config = root / "rclone.conf"
    config.touch(mode=0o600)
    common = dict(base, RCLONE_CONFIG=str(config))
    s3 = dict(common, RCLONE_CONFIG_SOURCE_TYPE="s3", RCLONE_CONFIG_SOURCE_PROVIDER="Other",
              RCLONE_CONFIG_SOURCE_ACCESS_KEY_ID=source["OFA_S3_ACCESS_KEY_ID"],
              RCLONE_CONFIG_SOURCE_SECRET_ACCESS_KEY=source["OFA_S3_SECRET_ACCESS_KEY"],
              RCLONE_CONFIG_SOURCE_REGION=source["OFA_S3_REGION"],
              RCLONE_CONFIG_SOURCE_ENDPOINT=source["OFA_S3_ENDPOINT"],
              RCLONE_CONFIG_SOURCE_FORCE_PATH_STYLE="true")
    drive = dict(common, RCLONE_CONFIG_DRIVE_TYPE="drive", RCLONE_CONFIG_DRIVE_SCOPE="drive",
                 RCLONE_CONFIG_DRIVE_CLIENT_ID=source["OFA_DRIVE_CLIENT_ID"],
                 RCLONE_CONFIG_DRIVE_CLIENT_SECRET=source["OFA_DRIVE_CLIENT_SECRET"],
                 RCLONE_CONFIG_DRIVE_TOKEN=source["OFA_DRIVE_TOKEN"],
                 RCLONE_CONFIG_DRIVE_ROOT_FOLDER_ID=source["OFA_DRIVE_BACKUP_FOLDER_ID"])
    return base, db, s3, drive


def rclone(stage, args, env, *, attempts=3):
    return run(stage, ["rclone", *args, "--retries", "3", "--low-level-retries", "5",
                       "--contimeout", "30s", "--timeout", "5m", "--log-level", "ERROR"],
               env, attempts=attempts)


def backup(source, root):
    validate(source)
    base, db, s3, drive = child_env(source, root)
    started = now()
    run_id = source.get("GITHUB_RUN_ID", "local")
    attempt = source.get("GITHUB_RUN_ATTEMPT", "1")
    if not re.fullmatch(r"[0-9a-z-]+", run_id) or not re.fullmatch(r"[0-9]+", attempt):
        raise BackupError("Invalid run identifier")
    backup_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{run_id}-{attempt}"
    payload = root / "payload"
    payload.mkdir()
    storage = payload / "storage" / BUCKET
    storage.mkdir(parents=True)
    destination = f"drive:runs/{backup_id}"
    # Validate access before doing the expensive work. Root is the existing OFA/Backup folder ID.
    rclone("Check Drive access", ["lsf", "drive:", "--max-depth", "1"], drive)
    listing = ["lsjson", f"source:{BUCKET}", "--recursive", "--files-only", "--hash"]
    before = inventory(rclone("List Storage before backup", listing, s3))
    version = run("Check database connection", ["psql", "-X", "-A", "-t", "-w",
                  "-v", "ON_ERROR_STOP=1", "-c", "SHOW server_version_num"], db, attempts=3)
    if int(version.strip()) // 10000 != 17:
        raise BackupError("Server major version changed; review and update PostgreSQL client version")
    dump = payload / "database.dump"
    run("Dump PostgreSQL", ["pg_dump", "--no-password", "--format=custom",
                            "--lock-wait-timeout=60000", "--file", str(dump)], db, attempts=3)
    if not dump.is_file() or dump.stat().st_size == 0:
        raise BackupError("Database dump is empty")
    run("Check database archive", ["pg_restore", "--list", str(dump)], base)
    rclone("Copy Storage", ["copy", f"source:{BUCKET}", str(storage)], s3)
    rclone("Verify Storage bytes", ["check", f"source:{BUCKET}", str(storage), "--download"], s3)
    after = inventory(rclone("List Storage after backup", listing, s3))
    if before != after:
        raise BackupError("Storage changed during backup; retry in a quiet period")
    write_json(payload / "storage-inventory.json", after)
    files = []
    for path in sorted(payload.rglob("*")):
        if path.is_symlink():
            raise BackupError("Unexpected symlink in backup payload")
        if path.is_file():
            files.append({"path": path.relative_to(payload).as_posix(),
                          "bytes": path.stat().st_size, "sha256": sha256(path)})
    manifest = {"schema_version": 1, "backup_id": backup_id, "started_at": started,
                "database_format": "pg_dump-custom", "postgres_major": 17,
                "bucket": BUCKET, "object_count": len(after),
                "git_commit": source.get("GITHUB_SHA"), "files": files}
    write_json(payload / "manifest.json", manifest)
    archive = root / "backup.tar.gz"
    log("Pack database, objects and restore manifest")
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(payload, arcname="ofa-backup")
    upload = root / "upload"
    upload.mkdir()
    encrypted = upload / "backup.tar.gz.age"
    run("Encrypt backup", ["age", "--recipient", source["OFA_BACKUP_AGE_RECIPIENT"],
                           "--output", str(encrypted), str(archive)], base)
    if not encrypted.is_file() or encrypted.stat().st_size == 0:
        raise BackupError("Encrypted archive is empty")
    ciphertext_hash = sha256(encrypted)
    (upload / "SHA256SUMS").write_text(f"{ciphertext_hash}  backup.tar.gz.age\n", encoding="ascii")
    rclone("Upload encrypted backup", ["copy", str(upload), destination], drive)
    rclone("Verify uploaded backup bytes", ["check", str(upload), destination, "--download"], drive)
    # Commit marker goes last. Unmarked run folders are incomplete and never restore candidates.
    status = {"schema_version": 1, "status": "success", "backup_id": backup_id,
              "started_at": started, "completed_at": now(), "archive_bytes": encrypted.stat().st_size,
              "archive_sha256": ciphertext_hash, "object_count": len(after),
              "relative_path": f"runs/{backup_id}/backup.tar.gz.age",
              "run_id": run_id, "git_commit": source.get("GITHUB_SHA")}
    marker = root / "success.json"
    write_json(marker, status)
    rclone("Commit success marker", ["copyto", str(marker), f"{destination}/success.json"], drive)
    received = rclone("Verify success marker", ["cat", f"{destination}/success.json"], drive)
    if json.loads(received) != status:
        raise BackupError("Remote success marker differs")
    rclone("Publish last successful backup", ["copyto", str(marker), "drive:last-success.json"], drive)
    if json.loads(rclone("Verify last-success status", ["cat", "drive:last-success.json"], drive)) != status:
        raise BackupError("Remote last-success status differs")
    log("SUCCESS: encrypted database and Storage backup verified in Drive")
    return status


def main():
    os.umask(0o077)
    try:
        # Never create plaintext backups inside the Git checkout.
        with tempfile.TemporaryDirectory(prefix="ofa-backup-", dir=os.environ.get("RUNNER_TEMP")) as tmp:
            status = backup(dict(os.environ), Path(tmp))
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as out:
                out.write(f"OFA backup succeeded at {status['completed_at']}. Encrypted archive verified in Google Drive.\n")
    except BackupError as error:
        log(f"FAILED: {error}")
        return 1
    except Exception as error:
        # Exceptions can include URLs, tokens, filenames or object contents.
        log(f"FAILED: unexpected {type(error).__name__}; details withheld for privacy")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
