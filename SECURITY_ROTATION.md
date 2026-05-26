# Security key rotation & git history cleanup

> **Why this file exists.** Old commits of `AGENTS.md` in this repo contain live
> plaintext secrets: Supabase `service_role` and `anon` JWTs, the Telegram bot
> token, the webhook secret, and the Poster API token. Even though the current
> file no longer has them, anyone who cloned (or forked) the repo at any point
> can read them via `git log -p -- AGENTS.md`. The only safe path is:
>   **(A)** rotate every exposed credential, then
>   **(B)** rewrite history to remove the strings.
>
> Until (A) is done, the database is compromised. Until (B) is done, anyone who
> still has access to the repo can re-read the strings.

## Pre-flight

```powershell
# 1. Have an admin browser tab open to each service:
#    - https://supabase.dmytrotovstytskyi.online  (your self-hosted Supabase Studio)
#    - https://t.me/BotFather
#    - https://joinposter.com → Settings → Apps → REST API
#
# 2. Pull the latest, make sure working tree is clean:
cd "D:\Химия замолвення ГБ\warehouse-crm"
git status      # should be empty
git pull
```

## A. Rotate the credentials

### A.1 — Supabase (anon + service_role)

```powershell
# In Supabase Studio (https://supabase.dmytrotovstytskyi.online):
#   Settings → API → "Generate new JWT secret"
#   This invalidates BOTH the anon and service_role JWTs at once.
#   New keys appear on the same page — copy them.
#
# WARNING: regenerating JWT secret breaks every existing session and every
# external system that hard-codes these keys. After regenerating you must
# update everywhere:
#   - .env (this project)
#   - any other app / script that connects to this Supabase
```

### A.2 — Telegram bot token

```powershell
# Open @BotFather in Telegram → /mybots → pick the bot → API Token → Revoke current token
# BotFather will print the new token. Copy it.
```

### A.3 — Telegram webhook secret

```powershell
# Generate a new random hex string (do this locally):
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]]).ToLower()
# Copy the output.
```

### A.4 — Poster API token

```powershell
# Poster admin → Settings → Apps → REST API → revoke current → generate new
# Copy the new token.
```

## B. Update local .env

```powershell
# Open warehouse-crm/.env and replace these four (or five) values:
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<new anon>
#   SUPABASE_SERVICE_ROLE_KEY=<new service_role>
#   TELEGRAM_BOT_TOKEN=<new bot token>
#   TELEGRAM_WEBHOOK_SECRET=<new webhook secret>
#   POSTER_TOKEN=<new poster token>
#
# Also update D:\Химия замолвення ГБ\.env if it still exists.
#
# DO NOT commit .env files (they are in .gitignore — verify with `git status`).
```

## C. Re-register the Telegram webhook with the new secret

```powershell
$BOT_TOKEN  = "<new bot token>"
$WEBHOOK    = "https://your-public-host/api/telegram/webhook"  # ngrok / Vercel / tunnel
$SECRET     = "<new webhook secret>"

curl.exe -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" `
  -F "url=$WEBHOOK" `
  -F "secret_token=$SECRET"

# Verify:
curl.exe "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
```

## D. Restart the dev server and smoke-test

```powershell
cd "D:\Химия замолвення ГБ\warehouse-crm"
# Kill any running next dev, then:
npm run dev
# In the browser:
#   - Open http://localhost:3001 — dashboard should load (uses new anon key).
#   - Open /receipts/new — confirm dropdown lists warehouses (uses new anon key).
# In Telegram:
#   - Send /start to the bot — it should respond (uses new service_role key).
```

If anything fails here, **stop and fix** before moving on to step E.

## E. Rewrite git history to remove the old secrets

### E.1 — Install git-filter-repo

```powershell
# Easiest on Windows: download the single-file script and put it on PATH.
# https://github.com/newren/git-filter-repo
#
# Or with pip:
pip install git-filter-repo
```

### E.2 — Back up the current repo

```powershell
cd "D:\"
git clone "D:\Химия замолвення ГБ\warehouse-crm" "warehouse-crm-backup-$(Get-Date -Format yyyy-MM-dd)"
# If anything goes wrong, recover from this backup.
```

### E.3 — Build the replacement file

Create `D:\Химия замолвення ГБ\warehouse-crm\..git-secret-replacements.txt`
(outside the repo working tree — name it however you want, do NOT commit it):

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoiYW5vbiJ9.PJ-feVraUpYtvUWqDYrNGafyNRRqCSCM35tAVQCrztw==>REDACTED_ANON_KEY
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2MzI0OTcwMCwiZXhwIjo0OTE4OTIzMzAwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.QC9C9-CxocHb-jM-lHmXHEjEZV2hCOaSwgfxKLjKoEQ==>REDACTED_SERVICE_ROLE
8927414072:AAEH1WSyXia2TqWsnYXwSY0UsT_6aKtxMXE==>REDACTED_BOT_TOKEN
63cf9308835af505ed26ade2cb0cf6dd741924d0f7227beb93a6a252e221795c==>REDACTED_WEBHOOK_SECRET
526379:9669514747b2a48f329dac43b6997c42==>REDACTED_POSTER_TOKEN
```

The `==>` separator means "replace LEFT with RIGHT in every commit content (not
messages)". Save the file as UTF-8 without BOM.

### E.4 — Run filter-repo

```powershell
cd "D:\Химия замолвення ГБ\warehouse-crm"
git filter-repo --replace-text "..\..git-secret-replacements.txt" --force

# This rewrites EVERY commit. All commit hashes change.
# It also removes the `origin` remote as a safety measure.
```

### E.5 — Verify the strings are gone

```powershell
git log --all -p | Select-String "eyJ0eXAi|AAEH1WSyXia|526379:96695|63cf9308835af505"
# Expected output: nothing. If anything matches — STOP, do not push.
```

### E.6 — Re-add the remote and force-push

```powershell
git remote add origin https://github.com/yobozavrik/gb_warehouse-crm.git
git push --force --all origin
git push --force --tags origin
```

> **Force-push consequences:** anyone else who cloned this repo now has the
> old history locally. They must `git fetch && git reset --hard origin/master`
> (and re-apply any in-flight work). If only you work on this repo, no big
> deal. If others do — coordinate first.

### E.7 — Delete the replacement file

```powershell
Remove-Item "D:\Химия замолвення ГБ\.git-secret-replacements.txt"
# Just in case — it contained the old secrets.
```

## F. Tell collaborators (if any)

> "Force-push happened on master because of secret leak. Please re-clone or
> run `git fetch && git reset --hard origin/master` on your local copy."

## G. Confirm in the audit log

```powershell
# Try the old service_role key against Supabase. It should fail with 401.
curl.exe "https://supabase.dmytrotovstytskyi.online/rest/v1/products?select=id&limit=1" `
  -H "apikey: <OLD service_role JWT>" `
  -H "Authorization: Bearer <OLD service_role JWT>"
# Expected: 401 Invalid JWT or 500.

# Try the old bot token:
curl.exe "https://api.telegram.org/bot<OLD>/getMe"
# Expected: 401 Unauthorized.

# Try the old Poster token:
curl.exe "https://joinposter.com/api/access.getAccount?token=<OLD>"
# Expected: an error response.
```

When all three return errors, S1 is done.

---

**Tracking.** Update `REVIEW_PLAN.md` table row `S1` from `partial` to `done`
after step G passes. Commit that change as the final visible work item:

```powershell
git add REVIEW_PLAN.md
git commit -m "chore(security): S1 — keys rotated, history rewritten"
git push
```
