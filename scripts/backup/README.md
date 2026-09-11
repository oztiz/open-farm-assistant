# OFA backup: Supabase → GitHub Actions → Google Drive

The workflow `.github/workflows/ofa-backup.yml` backs up PostgreSQL and the private
`ofa-attachments` bucket, encrypts the combined archive with **age**, uploads it to
the existing **OFA/Backup** folder, and reads the upload back to verify its bytes.
No database dumps, object names, credentials or backup artifacts are published to
this public repository. Only stage names, retry counts and success/failure appear
in Actions logs. Raw tool errors are withheld because they may contain private data.

## Schedule and first run

- Daily at **03:07 Europe/Oslo**. GitHub's native `timezone` setting handles CET/CEST
  (02:07 UTC in winter; 01:07 UTC in summer). No fixed-UTC/DST filtering is needed.
- GitHub can delay or drop scheduled jobs during load; this is not an exact-time SLA.
  Public-repository schedules may be disabled after 60 days without repository activity.
- The workflow must be on the default branch. Manual runs are also restricted to that
  branch. Concurrency prevents overlapping backups; the job timeout is 120 minutes.
- Add the secrets below, then open **Actions → OFA backup → Run workflow → main**.
  Inspect the first run and perform a restore drill before relying on the backup.
- Enable GitHub Actions failure notifications in your GitHub notification settings.
  Monitor `last-success.json` for staleness (>36 hours), not just workflow failures:
  a disabled/dropped schedule does not produce a failed run.

## Required GitHub Actions Secrets

In **Settings → Secrets and variables → Actions → New repository secret**, add
these exact names. Do not paste values into issues, commits, chats or workflow YAML.
The current project is **Open Farm Assistant**, PostgreSQL **17**, region **eu-north-1**.
Find connection details in that project's Supabase **Connect** and **Storage → S3** pages.

| Secret | Exact content / where to obtain it |
| --- | --- |
| `OFA_DB_HOST` | Hostname from **Connect → Session pooler**, with no scheme or port. Session mode supports GitHub's IPv4 runner. Direct host is also supported if reachable. |
| `OFA_DB_PORT` | `5432`. Never the transaction pooler port `6543`. |
| `OFA_DB_USER` | Session pooler username, normally `postgres.<project-ref>`; direct connections normally use `postgres`. Copy from Connect. |
| `OFA_DB_PASSWORD` | Database password for that user, not an API key or Supabase account password. |
| `OFA_DB_CA_CERT` | Full PEM root certificate downloaded from the project's database SSL settings. Must validate the chosen host. TLS uses `verify-full`, never certificate bypass. |
| `OFA_S3_ENDPOINT` | Exact HTTPS endpoint from Storage S3 settings, ending in `/storage/v1/s3`. |
| `OFA_S3_REGION` | Region shown in Storage S3 settings (`eu-north-1` for the confirmed project). |
| `OFA_S3_ACCESS_KEY_ID` | Generated Supabase S3 access key ID. |
| `OFA_S3_SECRET_ACCESS_KEY` | Matching S3 secret access key. These credentials bypass RLS and must remain server-only. |
| `OFA_DRIVE_CLIENT_ID` | Your Google OAuth desktop application's client ID (see below). |
| `OFA_DRIVE_CLIENT_SECRET` | Matching Google OAuth client secret. |
| `OFA_DRIVE_TOKEN` | Entire JSON token from a locally authorized rclone Drive remote, including `refresh_token`. |
| `OFA_DRIVE_BACKUP_FOLDER_ID` | ID of the existing **Backup** folder inside **OFA**, copied from its Drive URL. Use the ID, not the full URL or the OFA parent folder. |
| `OFA_BACKUP_AGE_RECIPIENT` | Public age recipient beginning `age1…`. Never the private identity. |

The database login must be able to dump every non-system schema and all rows.
`pg_dump` runs without schema/table filters or `--enable-row-security`: missing
permissions fail the job instead of silently producing an incomplete backup. On
managed Supabase, check permissions for managed schemas during the first run. Do
not hide a permission error with exclusions without reviewing restore coverage.
The script uses database `postgres`, requires server major 17, and retains ownership,
grants and RLS definitions in the custom-format archive.

### Google Drive OAuth (personal My Drive)

1. In Google Cloud, enable the **Google Drive API**. Configure the OAuth consent
   screen and create an OAuth **Desktop app** client for this backup.
2. Set the consent app to **Production** (or Internal for an eligible Workspace).
   External apps in Testing can issue refresh tokens that expire after seven days.
   Complete any Google verification required for your chosen audience/scopes.
3. Install rclone locally and run `rclone config`. Create a remote named `drive`,
   type `drive`, entering your client ID and client secret. Select full Drive scope
   (`drive`) so the existing folder is accessible. Authorize as the owner of OFA/Backup.
4. Obtain the `token` JSON from your local rclone configuration **privately** and
   store it as `OFA_DRIVE_TOKEN`. Store the matching client ID/secret separately.
5. Set the existing Backup folder ID in `OFA_DRIVE_BACKUP_FOLDER_ID`. The runner's
   rclone remote is rooted there. This setting limits the script's destination;
   it does **not** restrict the OAuth token's full Drive permissions.

The ChatGPT Drive connection does not give GitHub Actions an OAuth credential.
A service account is not interchangeable with these secrets: personal My Drive
uploads require an appropriate user OAuth token; Shared Drive/service-account
support would need a separate configuration. Refreshed access tokens are temporary;
the saved refresh token is reused on later runs. If access is revoked/expired,
authorize again locally and replace `OFA_DRIVE_TOKEN`.

### Encryption key

On a trusted computer with age installed:

```sh
age-keygen -o ofa-backup-identity.txt
```

Store the printed public recipient as `OFA_BACKUP_AGE_RECIPIENT`. Keep the private
identity file in a password manager/offline recovery location, separate from GitHub
and the backed-up Drive account. Loss of the identity means loss of the backup.
Retain old identities when rotating recipients. The private key is never required
on the runner. This is especially important because OFA's database contains service
credentials and authentication data.

## Output and success contract

```text
OFA/Backup/
  last-success.json
  runs/<UTC timestamp>-<GitHub run ID>-<attempt>/
    backup.tar.gz.age
    SHA256SUMS
    success.json
```

The encrypted archive contains `ofa-backup/database.dump`,
`ofa-backup/storage/ofa-attachments/`, `storage-inventory.json` (object metadata),
and `manifest.json` with SHA-256 and byte length for every payload file. Zero-object
buckets are valid. The inventory is recursive and handled by rclone's S3 pagination.
Files with nested names are preserved. No source database or bucket writes occur.

Storage is listed before and after the database dump/object copy. A changed inventory
or failed byte comparison aborts the backup. This detects many concurrent mutations,
but is **not an atomic snapshot across PostgreSQL and Storage**. Run during a quiet
period; pause application writes for a strict cross-service recovery point.

The job verifies the pg_dump table of contents, Storage bytes and uploaded encrypted
archive bytes before creating `success.json`. Only then does it update
`last-success.json`, containing `completed_at`, `archive_bytes`, `archive_sha256`,
`object_count`, `relative_path`, `run_id` and `git_commit`. OFA can later read this
through an authenticated backend, or import it into a protected status table.
No public API or database schema change is required now. The private per-run success
markers are the recovery authority if the latest pointer update fails. Incomplete
folders without a verified success marker must not be counted as usable backups.

**Retention: keep all successful runs initially.** There is deliberately no automatic
deletion. The earlier 7 daily / 4 weekly / 12 monthly policy is a proposed future
pruning policy, not implemented here. Agree on retention after a successful restore
drill and checking Drive capacity; clean up incomplete runs manually. The job copies
to a unique folder, never syncs/deletes existing backups or source files.

## Verification and restore drill

Local credential-free tests:

```sh
python3 -m unittest discover -s scripts/backup -p 'test_*.py' -v
```

Tests exercise retries, missing secrets, empty buckets, concurrent object mutations,
credential separation and failure ordering. They mock external programs; they do
**not** prove real database, encryption, S3 or Drive access. The check workflow runs
these on pushes/PRs without secrets. Runtime tooling comes from signed Ubuntu and
PostgreSQL apt repositories; PostgreSQL is fixed to major 17 and checkout is pinned
to a commit. Minor tool security updates are intentionally accepted.

To restore, download one completed run and its marker to a private machine:

```sh
sha256sum -c SHA256SUMS
age --decrypt -i ofa-backup-identity.txt -o backup.tar.gz backup.tar.gz.age
tar -xzf backup.tar.gz
pg_restore --list ofa-backup/database.dump > restore-toc.txt
```

Compare each payload file against `manifest.json`. Use a **new isolated test
database/project**, never production, to validate the restore. Install compatible
extensions and roles first. Review the table of contents, especially managed
Supabase schemas, ownership and grants; adapt the restore list to the target's
pre-created managed objects. An illustrative command for a prepared disposable
PostgreSQL target, using local PG* connection environment variables, is:

```sh
pg_restore --exit-on-error --dbname=postgres ofa-backup/database.dump
```

Custom-format dumps contain grants/ownership. Do not simply drop these with
`--no-acl` or `--no-owner` on a live Supabase target: access and RLS behavior must be
verified. `pg_dump` does not include cluster role definitions/passwords, Supabase
project settings, Edge Functions, external integrations, or PostgreSQL WAL/PITR.
Keep those configurations separately; source code remains in GitHub.

Restore object bytes to the **test project's** `ofa-attachments` bucket with a
separately configured rclone remote:

```sh
rclone copy ofa-backup/storage/ofa-attachments test-storage:ofa-attachments
rclone check ofa-backup/storage/ofa-attachments test-storage:ofa-attachments --download
```

Review `storage-inventory.json` for MIME types and other metadata; copying bytes
alone does not promise an identical managed Storage metadata restore. Supabase's
existing `storage` tables and object API must be reconciled for that test target.
Verify attachment links, nested paths, file content types, login, row counts,
permissions and RLS through OFA. A successful upload is not a tested restoration.

## Troubleshooting and capacity

- **Missing secret:** the log names the exact missing entries; no values are logged.
- **Connection/dump stage:** verify session mode, password, port, certificate/hostname,
  network restrictions and access to managed tables. Never disable SSL verification.
- **S3 stage:** verify endpoint/region/key pair and bucket. Mutation failures require
  a rerun during a quiet period; authentication failures require corrected credentials.
- **Drive stage:** check OAuth refresh token, client match, folder access and quota.
- **Private diagnosis:** reproduce the failed tool locally in a private terminal using
  the same environment configuration; do not publish verbose dumps or raw logs.
- Each external operation has a timeout; retries are bounded. Overall timeout is two
  hours. Temporary files are removed on normal success/failure, and the GitHub-hosted
  runner is discarded after cancellation. No self-hosted runner is assumed.
- Allow runner disk for the database, object copy, compressed tar and encrypted tar
  simultaneously. Verification reads Storage and the uploaded Drive archive again,
  so account for egress, API quotas, Drive storage and Actions minutes.

## Official references

- [GitHub scheduling and timezones](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)
- [rclone Drive OAuth](https://rclone.org/drive/)
- [rclone byte verification](https://rclone.org/commands/rclone_check/)
