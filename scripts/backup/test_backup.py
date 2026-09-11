import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import backup


def settings():
    env = {key: "test-value" for key in backup.REQUIRED}
    env.update(OFA_DB_HOST="db.example.test", OFA_DB_PORT="5432",
               OFA_S3_ENDPOINT="https://example.test/storage/v1/s3",
               OFA_DRIVE_BACKUP_FOLDER_ID="folder-id",
               OFA_BACKUP_AGE_RECIPIENT="age1" + "a" * 58,
               OFA_DRIVE_TOKEN=json.dumps({"refresh_token": "test-refresh"}),
               GITHUB_RUN_ID="123", GITHUB_RUN_ATTEMPT="1")
    return env


class BackupTests(unittest.TestCase):
    def test_missing_secrets_only_print_names(self):
        with self.assertRaisesRegex(backup.BackupError, "OFA_DB_PASSWORD"):
            backup.validate({**settings(), "OFA_DB_PASSWORD": ""})

    def test_reject_transaction_pooler_and_invalid_credentials(self):
        for key, value in [("OFA_DB_PORT", "6543"), ("OFA_DRIVE_TOKEN", "{}"),
                           ("OFA_DRIVE_TOKEN", "[]"), ("OFA_S3_ENDPOINT", "http://bad"),
                           ("OFA_BACKUP_AGE_RECIPIENT", "AGE-SECRET-KEY-1PRIVATE"),
                           ("OFA_DRIVE_BACKUP_FOLDER_ID", "https://drive.google.com/x")]:
            with self.subTest(key=key), self.assertRaises(backup.BackupError):
                backup.validate({**settings(), key: value})

    def test_credentials_separated(self):
        with tempfile.TemporaryDirectory() as tmp:
            base, db, s3, drive = backup.child_env(settings(), Path(tmp))
            for env in (base, db, s3, drive):
                self.assertFalse(any(k.startswith("OFA_") for k in env))
            self.assertEqual(db["PGSSLMODE"], "verify-full")
            self.assertNotIn("PGPASSWORD", drive)
            self.assertNotIn("RCLONE_CONFIG_DRIVE_TOKEN", s3)
            self.assertNotIn("RCLONE_CONFIG_SOURCE_SECRET_ACCESS_KEY", db)

    def test_inventory_empty_order_and_duplicate_keys(self):
        self.assertEqual(backup.inventory(b"[]"), {})
        entries = [{"Path": "b", "Size": 0}, {"Path": "a", "Size": 2}]
        self.assertEqual(backup.inventory(json.dumps(entries)),
                         backup.inventory(json.dumps(entries[::-1])))
        with self.assertRaises(backup.BackupError):
            backup.inventory(json.dumps(entries + entries))

    def test_retries_bounded_and_sensitive_output_not_logged(self):
        import subprocess
        response = subprocess.CompletedProcess([], 1, b"private", b"secret-password")
        with patch("backup.subprocess.run", return_value=response) as call, \
                patch("backup.time.sleep"), patch("backup.log") as log:
            with self.assertRaises(backup.BackupError):
                backup.run("test stage", ["tool"], {}, attempts=3)
            self.assertEqual(call.call_count, 3)
            self.assertNotIn("secret-password", str(log.call_args_list))

    def simulate(self, failure=None, changed=False, empty=False):
        stages = []
        remote = {}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            def fake_run(stage, args, env, **kwargs):
                stages.append(stage)
                if stage == failure:
                    raise backup.BackupError("Injected failure")
                if stage == "Check database connection":
                    return b"170006\n"
                if stage == "Dump PostgreSQL":
                    (root / "payload/database.dump").write_bytes(b"PGDMP-test")
                if stage == "Encrypt backup":
                    (root / "upload/backup.tar.gz.age").write_bytes(b"encrypted-test")
                return b""

            def fake_rclone(stage, args, env, **kwargs):
                stages.append(stage)
                if stage == failure:
                    raise backup.BackupError("Injected failure")
                if args[0] == "lsjson":
                    listing = [] if empty else [{"Path": "nested/file.txt", "Size": 4,
                                                "ModTime": "2026-09-11", "Hashes": {"md5": "test"}}]
                    if changed and stage == "List Storage after backup":
                        listing.append({"Path": "new.txt", "Size": 1})
                    return json.dumps(listing).encode()
                if stage == "Copy Storage" and not empty:
                    path = root / "payload/storage/ofa-attachments/nested/file.txt"
                    path.parent.mkdir()
                    path.write_bytes(b"test")
                if args[0] == "copyto":
                    remote[args[2]] = Path(args[1]).read_bytes()
                if args[0] == "cat":
                    return remote[args[1]]
                return b""

            with patch("backup.run", side_effect=fake_run), patch("backup.rclone", side_effect=fake_rclone), patch("backup.log"):
                if failure or changed:
                    with self.assertRaises(backup.BackupError):
                        backup.backup(settings(), root)
                else:
                    status = backup.backup(settings(), root)
                    self.assertEqual(status["object_count"], 0 if empty else 1)
                    self.assertEqual(status["status"], "success")
                    self.assertEqual(json.loads(remote["drive:last-success.json"]), status)
                    self.assertTrue((root / "payload/manifest.json").exists())
        return stages, remote

    def test_success_commit_is_after_upload_verification(self):
        stages, _ = self.simulate()
        self.assertLess(stages.index("Verify uploaded backup bytes"), stages.index("Commit success marker"))
        self.assertLess(stages.index("Verify success marker"), stages.index("Publish last successful backup"))

    def test_empty_bucket_is_valid(self):
        self.simulate(empty=True)

    def test_failures_never_publish_false_success(self):
        for failure in ["Check Drive access", "List Storage before backup", "Dump PostgreSQL",
                        "Check database archive", "Copy Storage", "Verify Storage bytes",
                        "Encrypt backup", "Upload encrypted backup", "Verify uploaded backup bytes",
                        "Commit success marker", "Verify success marker"]:
            with self.subTest(failure=failure):
                stages, remote = self.simulate(failure=failure)
                self.assertNotIn("Publish last successful backup", stages)
                self.assertNotIn("drive:last-success.json", remote)

    def test_storage_mutation_aborts_before_upload(self):
        stages, _ = self.simulate(changed=True)
        self.assertNotIn("Upload encrypted backup", stages)

    def test_timeout_reports_stage(self):
        import subprocess
        with patch("backup.subprocess.run", side_effect=subprocess.TimeoutExpired("private", 1)):
            with self.assertRaisesRegex(backup.BackupError, "timed out"):
                backup.run("database stage", ["tool"], {}, timeout=1)


if __name__ == "__main__":
    unittest.main()
