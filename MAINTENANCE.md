# Reality Health Bridge: maintenance manual

This manual is for the person who looks after the live system. You do not need to know the code. It explains:
- what runs where
- how to put an update live safely
- how to change the database
- how to back up and restore
- the everyday jobs in RHS Admin
- what to do when something goes wrong

> First install from nothing? Use the two setup guides instead, then come back here:
> [`RealityHealthBridge-WebHost/DEPLOY.md`](RealityHealthBridge-WebHost/DEPLOY.md) (app + database) and
> [`RHS-Admin/DEPLOY.md`](RHS-Admin/DEPLOY.md) (admin site).

---

## Contents

1. [How the system fits together](#1-how-the-system-fits-together)
2. [Logins and secret settings you need](#2-logins-and-secret-settings-you-need)
3. [Golden rules](#3-golden-rules)
4. [Regular jobs (weekly / monthly)](#4-regular-jobs)
5. [Putting an update live, step by step](#5-putting-an-update-live)
6. [Database updates](#6-database-updates)
7. [Backups and restoring](#7-backups-and-restoring)
8. [Everyday tasks in RHS Admin](#8-everyday-tasks-in-rhs-admin)
9. [Changing prices, plans, device limits or the free trial](#9-changing-prices-plans-device-limits-or-the-free-trial)
10. [For whoever changes the code: release checklist](#10-for-whoever-changes-the-code-release-checklist)
11. [Troubleshooting](#11-troubleshooting)
12. [Undoing a bad update (rollback)](#12-undoing-a-bad-update-rollback)
13. [Release history](#13-release-history)
14. [Privacy and data protection](#14-privacy-and-data-protection)

---

## 1. How the system fits together

There are **two websites** and **one database**, all on the same cPanel hosting.

| Part | Web address | Folder on the server (cPanel → File Manager) | Folder in this repository |
|---|---|---|---|
| **Facility app** (what pharmacies, drug shops and clinics use; works offline, installable) | https://hrb.truehome.com.ug | `public_html/hrb.truehome.com.ug/` | `RealityHealthBridge-WebHost/` |
| **Privacy Policy / Terms of Use** (public pages) | https://hrb.truehome.com.ug/privacy.html and `/terms.html` | same folder | `RealityHealthBridge-WebHost/privacy.html`, `terms.html` |
| **App server (API)** (phones sync through it) | https://hrb.truehome.com.ug/api/ | `public_html/hrb.truehome.com.ug/api/` | `RealityHealthBridge-WebHost/api/` |
| **RHS Admin** (the RHS team manages facilities, licences, payments, feedback) | https://bhr-admin.truehome.com.ug | `public_html/bhr-admin.truehome.com.ug/` | `RHS-Admin/` |
| **Database** (MySQL/MariaDB, shared by both sites) | phpMyAdmin in cPanel | database `rmsugnxf_rhb` | table definitions in `RealityHealthBridge-WebHost/database/` and `RHS-Admin/database/` |

How data moves:
- Each phone or computer keeps its own copy of the facility's records, so the app works with no internet.
- When online, it syncs with the API every minute or so. The database on the server is the master copy.
- RHS Admin reads and writes the same database. A change made there (for example a renewed licence) reaches the facility's devices on their next sync.

Other services involved:

| Service | Used for | Where it is set |
|---|---|---|
| **Nylon Pay** | Mobile Money subscription payments in the app | `api/payment-config.php` on the server (keys) + Nylon Pay dashboard (webhook) |
| **Server email** (cPanel mail) | Alert emails to the RHS team (new facility, subscriptions, feedback) | RHS Admin → Settings → Email alerts |
| **Google Apps Script** | Registration email sent to a new facility | `config.js` → `REGISTRATION_EMAIL_URL`; script in `RealityHealthBridge-WebHost/apps-script/Code.gs` |
| **Google Cloud (OAuth client)** | Facilities backing up to their own Google Drive | RHS Admin → Settings → Google Drive backups |
| **GitHub** | Stores the code and its history | https://github.com/KainamuraDarius/Healty-reality-bridge-system |

---

## 2. Logins and secret settings you need

Ask the system owner for these. Keep them in a password manager, not in email or WhatsApp.

| What | Why you need it |
|---|---|
| cPanel login (host: simba.afriregister.com) | Upload files, phpMyAdmin, backups, email accounts, SSL |
| An RHS Admin **super admin** account | Everything in RHS Admin. Make sure there are **always at least two** super admins (see 8.10) |
| GitHub access to the repository | Getting the latest code and building update zips |
| Nylon Pay dashboard | Checking payments, API keys, webhook |

### The secret settings files (live only on the server, never in GitHub, never in an update zip)

| File on the server | Holds | Notes |
|---|---|---|
| `hrb.truehome.com.ug/api/config.php` | Database name / user / **password** for the app server, `allowed_origin`, `license_secret` | Blocked from the web by `api/.htaccess` |
| `hrb.truehome.com.ug/api/payment-config.php` | **Nylon Pay** API key, secret, webhook secret | Upload once, then edit only on the server |
| `hrb.truehome.com.ug/config.js` | URL of the Google Apps Script email service | Public file but server-specific. Update zips do not include it |
| `bhr-admin.truehome.com.ug/app/config.php` | Database **password** for the admin site, `setup_key`, `license_secret`, `timezone`, `idle_minutes` | Blocked from the web |

> **`license_secret` must be the same in three places:**
> 1. `api/config.php`
> 2. `RHS-Admin/app/config.php`
> 3. `LICENSE_SECRET` in `RealityHealthBridge-WebHost/js/core/state.js`
>
> It is used to make and check activation codes. If they differ, activation codes stop working. **Do not change it** once facilities hold codes.

To edit a settings file: cPanel → File Manager → right-click the file → **Edit** → change only the value between the quotes → **Save Changes**. Download a copy first (right-click → Download) so you can put it back.

---

## 3. Golden rules

1. **Back up the database before every update.** It takes two minutes (section 7).
2. **Never upload the settings files** (`config.php`, `payment-config.php`, `config.js`) from your computer over the server's copies. The update zips made by `tools/make-update-zips.sh` leave them out for you.
3. **Database first, then files**, unless the update file says otherwise at its top (section 6).
4. **Extract the whole zip.** Never upload just one file from it: files often depend on each other.
5. **Never re-run an old `schema.sql`** on the live database, and never delete tables or rows by hand unless this manual says so.
6. **Change one thing at a time** and check it works (section 5, step 7) before doing the next.
7. **Write down what you did** in [Release history](#13-release-history) and tag the version in git (section 5, step 8). The next person depends on it.

---

## 4. Regular jobs

| How often | Job | Where |
|---|---|---|
| **Weekly** | Download a database backup and keep it **off** the server (laptop + Google Drive) | section 7 |
| Weekly | RHS Admin → **Support**: devices with refused records, devices silent for 7+ days, licences to check (Mobile Money / legacy) | follow the advice on the page |
| Weekly | RHS Admin → **Feedback**: read new feedback, reply to problems by phone, then **Mark as read** | 8.8 |
| Weekly | RHS Admin → **Dashboard**: facilities ending in 7 days, so you can call them to renew | |
| Weekly | RHS Admin → **Privacy**: any **deletion request** waiting? We promised to act within **30 days** | 14.3 |
| Monthly | Check the error logs: File Manager → `hrb.truehome.com.ug/api/error_log` and `bhr-admin.truehome.com.ug/error_log`. A few lines are normal; the same error repeating is not. Copy it for the developer | |
| Monthly | RHS Admin → **Audit log**: look for unexpected admin actions or `licence.refused` (someone trying fake codes) | |
| Monthly | RHS Admin → **Admin team**: deactivate anyone who left | 8.10 |
| Monthly | RHS Admin → **Privacy** → *Past the keep period*: facilities that ended over 12 months ago. Try to reach them once, then erase | 14.4 |
| Monthly | Delete downloaded database backups **older than 3 months** (laptop and Google Drive). Keep the newer ones. The privacy policy promises deleted data leaves our backups within 3 months | 14.2 |
| Once a year (January) | Delete audit-log entries older than 2 years (the privacy policy promises this) | 14.2 |
| Every 3 months | Do a **test restore** of a backup into a spare database (section 7.3), so you know backups work | |
| When the SSL warning email comes | cPanel → **SSL/TLS Status** → **Run AutoSSL** (it normally renews by itself) | |

---

## 5. Putting an update live

An "update" is any new version of the app or admin site: new features, fixes, price changes.

### Step 1: Know what you are installing

Before you start, have:
- the **update zips**, for example `rhb-update-16.zip` (app) and `rhs-admin-update-10.zip` (admin site)
- the list of **database update files** (`update-N-….sql`) to run, if any
- the **release notes**: what changed and how to check it

If the developer gave you these, go to step 2. If you only have the code (for example from GitHub), make the zips yourself:

1. On a Linux or Mac computer with the repository, open a terminal in the repository folder.
2. Run:
   ```bash
   git pull
   tools/make-update-zips.sh
   ```
   This compares the code with the version that is live: the newest git tag called `deployed-…` (see step 8). You can also give it the version yourself, e.g. `tools/make-update-zips.sh deployed-2026-11-27`.
3. It creates the two zips in the repository folder and prints:
   - which files are in each zip
   - which **database updates** to run
   - which files were **deleted** (remove those from the server by hand, if they are website files)
   - which **settings files** changed (they are never zipped, so change them by hand on the server)

### Step 2: Choose a quiet time

Early morning or late evening. Facilities keep working offline during the update, and their phones catch up afterwards. Allow 30 minutes.

### Step 3: Back up

Follow section 7.1. Also download the current `api/config.php`, `api/payment-config.php`, `config.js` and `RHS-Admin/app/config.php` once, if you don't have recent copies.

### Step 4: Run the database updates that come BEFORE the files

For each new `update-N-….sql`, in number order, read the first lines of the file:
- If it says to run it **before** the files (most do), run it now (section 6.2).
- If it says to run it **after** the files (for example update 6), leave it for step 6.

### Step 5: Upload the files

**App:**
1. cPanel → **File Manager** → open `public_html/hrb.truehome.com.ug`.
2. Top bar → **Upload** → choose `rhb-update-N.zip` → wait for **100%** → **Go Back**.
3. Right-click the zip → **Extract**.
4. The path must be exactly `/public_html/hrb.truehome.com.ug`, with no extra folder at the end → **Extract Files**. If asked, **replace** the old files.
5. Check the result window shows no errors → **Close** → right-click the zip → **Delete**.

**Admin site:** the same steps with `rhs-admin-update-N.zip` in `public_html/bhr-admin.truehome.com.ug`.

> Hidden files: to see files starting with a dot (like `.htaccess`), use File Manager → **Settings** (top right) → tick **Show Hidden Files**.

### Step 6: Run the database updates that come AFTER the files

Only if step 4 left any (section 6.2).

### Step 7: Check that it works

**Basic checks after every update:**

| Open | Expected |
|---|---|
| https://hrb.truehome.com.ug/api/sync.php | `{"ok":false,"error":"post_only","message":"Use POST."}`. Anything else means the app server is broken: see section 11 |
| https://hrb.truehome.com.ug/api/config.php | **403 Forbidden** (the password file stays protected) |
| https://bhr-admin.truehome.com.ug | The login page. Log in and press **Ctrl+Shift+R** once to load the new design |
| https://hrb.truehome.com.ug on a phone that uses the app | Within about a minute it updates itself (close and reopen it). The sync pill at the top shows **"Last synced … · all saved"** |
| RHS Admin → Support | No new "refused records" since the update |

**Then check what the release notes say changed.**

### Step 8: Record it

1. Add a line to [Release history](#13-release-history) below: date, zips, database updates, who did it.
2. Mark the live version in git, so the next update zip only contains newer changes. In the repository folder:
   ```bash
   git add -A && git commit -m "Release <version>: <short description>"   # if not committed yet
   git tag deployed-$(date +%F)
   git push && git push --tags
   ```

---

## 6. Database updates

### 6.1 What they are

The database structure is changed only by numbered files in `RealityHealthBridge-WebHost/database/`:

| File | What it does | Run | App version |
|---|---|---|---|
| `schema.sql` | The **whole** structure, for a brand-new install only | — | all |
| `update-1-licences.sql` | Licences managed from RHS Admin | before files | 1.13 |
| `update-2-device-health.sql` | Device health on the Support page | before files | 1.14 |
| `update-3-stamp-certificates.sql` | Stamp, certificates, positions, admin permissions | before files | 1.24 |
| `update-4-online-payments.sql` | Nylon Pay payments table | before files | 1.24 |
| `update-5-feedback.sql` | Feedback & ratings table (`app_feedback`) | before files | 1.25 |
| `update-6-standard-8-devices.sql` | Existing Standard/trial facilities go from 5 to 8 devices | **after** files | 1.25 |
| `update-7-privacy.sql` | Who agreed to the privacy policy & terms (3 columns on `facilities`) and deletion requests (`data_requests`) | before files | 1.25 |

The admin site's own tables are in `RHS-Admin/database/admin-schema.sql`. Run it on a new install, or when an update says so.

Every update file:
- is meant to be run **once**, in number order
- is safe to run again: the second time it changes nothing or gives a harmless error
- says at its top whether to run it **before** or **after** uploading the files

### 6.2 How to run one

1. cPanel → **phpMyAdmin** → click **rmsugnxf_rhb** on the left. Check the name: never run it on another database.
2. Click the **Import** tab → **Choose file** → pick the `.sql` file from your computer → scroll down → **Import**.
   - Or click the **SQL** tab, paste the file's text, and click **Go**.
3. Read the message:
   - **Green "Import has been successfully finished"**: done.
   - **"Duplicate column name …"** or **"Table … already exists"**: it was already run before, so this is fine.
   - **Any other red error**: stop. Do not upload the files. Copy the message for the developer. Nothing is half-changed for "CREATE TABLE IF NOT EXISTS" files, and update 6 runs as one transaction.
   - Update 7 the second time: **"Duplicate column name 'terms_version'"** means it was already run, which is fine.

### 6.3 Has an update already been run?

phpMyAdmin → `rmsugnxf_rhb` → **SQL** tab, then run the check for that update:

| Update | Check | Already run if… |
|---|---|---|
| 1 | `SHOW COLUMNS FROM facilities LIKE 'license_updated_at';` | one row |
| 2 | `SHOW COLUMNS FROM devices LIKE 'pending_count';` | one row |
| 3 | `SHOW TABLES LIKE 'facility_documents';` | one row |
| 4 | `SHOW TABLES LIKE 'payment_requests';` | one row |
| 5 | `SHOW TABLES LIKE 'app_feedback';` | one row |
| 6 | `SELECT COUNT(*) FROM facilities WHERE deleted=0 AND license_tier='standard' AND max_devices=5;` | `0` |
| 7 | `SHOW COLUMNS FROM facilities LIKE 'terms_version';` | one row |

### 6.4 Rules for whoever writes a new update file

- Name it `update-<next number>-<what>.sql` and copy the header style of the existing ones, including **before/after**.
- Make it safe to run twice: `CREATE TABLE IF NOT EXISTS`, `WHERE` conditions that only match rows not yet changed.
- Never drop tables or columns that live code still uses.
- **Also add the change to `schema.sql`**, so a fresh install gets it too.
- If it changes facility rows that phones must receive (licence, devices, profile), give each changed row a new `server_seq` from `sync_counter`, as update 6 does. Otherwise phones never download the change.
- Add it to the table in 6.1 and to [Release history](#13-release-history).

---

## 7. Backups and restoring

### 7.1 Make a backup (weekly, and before every update)

1. cPanel → **phpMyAdmin** → click **rmsugnxf_rhb** → **Export** tab.
2. Method **Quick**, format **SQL** → **Export**.
3. Rename the downloaded file to include the date, e.g. `rhb-backup-2026-11-27.sql`. Keep it on your computer **and** in a second place, for example Google Drive.

Another way: cPanel → **Backup** → under "Download a MySQL Database Backup" click **rmsugnxf_rhb**.

Website files: the code is in GitHub. The only server files that are not are the settings files in section 2, so keep a downloaded copy of them somewhere safe and private.

Facilities can also back up their own records: in the app, **System → Backup** (to a file or their Google Drive).

### 7.2 Restore the whole database (emergency only)

Restoring **replaces** everything in the database with the backup. Any work done after the backup is lost, including sales that phones synced in the meantime. Talk to the system owner first.

1. Take a fresh backup of the current state (7.1), even if it is broken.
2. phpMyAdmin → `rmsugnxf_rhb` → **Import** → choose the backup `.sql` → **Import**.
3. Open the app and RHS Admin and check them (section 5, step 7).

Phones still hold their own copy of records. After a restore they send up anything the server is missing on their next sync.

### 7.3 Test a backup (every 3 months)

1. cPanel → **MySQL® Databases** → create a database, e.g. `rmsugnxf_restoretest`.
2. phpMyAdmin → click that new database → **Import** → choose the backup → **Import**.
3. Check that the tables `facilities`, `sales` and `users` have rows (click → **Browse**).
4. Delete the test database afterwards (MySQL® Databases → Delete).

---

## 8. Everyday tasks in RHS Admin

Log in at https://bhr-admin.truehome.com.ug. Times are shown in Kampala time. Every change is written to the **Audit log**.

| # | Task | Where | Notes |
|---|---|---|---|
| 8.1 | **Find a facility** | Search box at the top (name, phone, email, place) | |
| 8.2 | **Renew / give paid time** | Facility → **Licence** tab → *Renew or extend* | Pick package and days, or an end date. Add a note (e.g. MoMo ref). The facility's devices update on their next sync |
| 8.3 | **Extend a free trial** | Facility → **Licence** → *Extend free trial* | Adds 7–90 days (from the current end, or from today if it ended) or until a date. Only for facilities not on a paid plan |
| 8.4 | **Change the free-trial length for new facilities** | **Settings → Free trial** | Default 14 days |
| 8.5 | **Activation code for a facility with no internet** | Facility → **Licence** → *Offline activation code* | Read the code to them by phone; they enter it in System → Subscription |
| 8.6 | **Suspend / lift** | Facility → **Licence** → bottom | After their next sync the app shows a "suspended" screen and cannot be used. Their records stay safe and keep syncing. Lifting it unlocks the app on the next sync. Online payment is also blocked while suspended |
| 8.7 | **Record a cash/bank payment** | **Payments** | Mobile Money paid in the app is added automatically |
| 8.8 | **Read feedback** (super admins) | **Feedback** | Filter by stars, type, unread. **Mark as read** when handled. The menu shows "N new" |
| 8.9 | **Facility user forgot their password** | Facility → **Devices & logins** → *Logins* → type a new password → **Set** | Tell them in person or by phone. It works on their devices after their next sync, and on a new device straight away |
| 8.10 | **Add / remove an RHS team member** (super admins) | **Admin team** | They get a temporary password and must change it. *Support staff* cannot see Settings, Team or Feedback. Keep **at least two super admins** |
| 8.11 | **RHS team member forgot their password** | Another super admin → **Admin team** → *Reset password* | Locked out after 5 wrong tries for 15 minutes: just wait |
| 8.12 | **Who gets alert emails, and about what** | **Settings → Email alerts** | New facility, subscription, feedback. Use **Send a test email** after changes. "Send from" must be an address on your own domain (e.g. `no-reply@truehome.com.ug`) |
| 8.13 | **Message banner to facilities** (e.g. planned maintenance) | **Messages** | All facilities or chosen ones, with start and end dates |
| 8.14 | **Download a facility's certificates** | Facility → **Stamp & certificates** → **Download** / **Download all (.zip)** | Downloads are recorded in the audit log |
| 8.15 | **Support numbers shown in the app** | **Settings → Support contacts** | |
| 8.16 | **Reports** (facilities, sign-ups, income, renewals due) | **Reports** | Can be printed or downloaded as CSV (opens in Excel) |
| 8.17 | **A facility asked us to delete its data** (super admins) | **Privacy** → *Requests to delete data* | Full steps in 14.3. Must be done within 30 days |
| 8.18 | **Erase a facility** (super admins) | Facility → **Overview** → bottom → *Erase this facility's data* | Type the facility name to confirm. **Cannot be undone.** Only after 14.3 or 14.4 |
| 8.19 | **Has a facility agreed to the privacy policy and terms?** | Facility → **Overview** → Profile → *Privacy & terms*; totals on **Privacy** | Super admins of facilities that have not agreed see a banner in the app asking them |

### If NO super admin can log in

This happens if the only super admin forgot their password or left.
1. On any computer with PHP, make a password hash:
   ```bash
   php -r 'echo password_hash("Temporary-Pass-2026!", PASSWORD_DEFAULT), "\n";'
   ```
   If you have no PHP, ask the developer for this one line.
2. phpMyAdmin → `rmsugnxf_rhb` → **SQL**:
   ```sql
   UPDATE admin_users SET password_hash = 'PASTE_THE_HASH_HERE', must_change_password = 1, active = 1
    WHERE email = 'their.email@example.com';
   ```
3. Log in with the temporary password. The site asks for a new one at once.

(`setup.php` only works when there are no admin accounts at all, so it cannot be used for this.)

---

## 9. Changing prices, plans, device limits or the free trial

These values are **written in the code in several places**, which must always match. This is a code change: do it in the repository, then put it live with section 5.

| What | Change it in ALL of these |
|---|---|
| Plan setup prices and device limits | `RealityHealthBridge-WebHost/js/services/license.js` (`PACKAGES`)<br>`RealityHealthBridge-WebHost/api/nylonpay.php` (`PAY_PACKAGES`)<br>`RHS-Admin/app/licence.php` (`PACKAGES`) |
| Monthly fee | `license.js` (`MONTHLY_FEE`)<br>`api/nylonpay.php` (`PAY_MONTHLY_FEE`)<br>`RHS-Admin/app/licence.php` (`MONTHLY_FEE`) |
| Plan descriptions on the plan cards | `RealityHealthBridge-WebHost/js/components/packages-pay.js` (`PLAN_INFO`, `PLAN_FEATURES`) |
| Default free-trial length | `license.js` (`TRIAL_DAYS`)<br>`api/lib.php` (`TRIAL_DAYS_APP`, and `TRIAL_DAYS_MAX` = trial days + 1)<br>`RHS-Admin/app/licence.php` (`TRIAL_DAYS_DEFAULT`) |
| Trial length for one facility only | No code change: RHS Admin (8.3) |
| Trial length for all new facilities | No code change: RHS Admin → Settings → Free trial (8.4) |

After changing a **device limit**, existing facilities keep their old number until a database update raises it, so write one (see `update-6-standard-8-devices.sql` as an example).

After changing a **device limit or price**, activation codes RHS made earlier for that plan, and not yet used, stop working. Make new ones.

---

## 10. For whoever changes the code: release checklist

Tick these before making the update zips:

- [ ] **App files changed?** Bump `CACHE_NAME` in `RealityHealthBridge-WebHost/service-worker.js` (e.g. `rhb-cache-v27` → `rhb-cache-v28`). Without this, phones keep showing the old version.
- [ ] **New app feature or fix?** Bump `RHB_APP_VERSION` in `js/core/brand.js`. It shows on the landing page and in RHS Admin → Support ("old app versions").
- [ ] **Added, renamed or removed a JS/CSS file?** Update `index.html` **and** the `PRECACHE` list in `service-worker.js`.
- [ ] **Admin CSS or JS changed?** Bump `?v=` on `admin.css` / `admin.js` in `RHS-Admin/app/layout.php`.
- [ ] **Database change?** New `update-N` file + the same change in `schema.sql` (section 6.4).
- [ ] **Prices / plans / trial?** All places in section 9.
- [ ] **New settings value on the server?** Note it in the release notes; settings files are never zipped.
- [ ] Check PHP syntax: `for f in $(git diff --name-only -- '*.php'); do php -l "$f"; done`
- [ ] Test on a copy, never on the live site.
- [ ] Update `README.md` if features changed, and add a line to [Release history](#13-release-history).
- [ ] Make the zips: `tools/make-update-zips.sh`.

Keep `SHOW_NEAR_EXPIRY_BANNER = true` in `RealityHealthBridge-WebHost/js/app/shell.js`. It shows the warning "your trial / subscription ends in N days" for the last 7 days. If it is ever set to false while testing, set it back to true before the update goes live.

---

## 11. Troubleshooting

### The app (hrb.truehome.com.ug)

| What you see | Likely cause | What to do |
|---|---|---|
| `api/sync.php` does not show `post_only`, or the app says **"Something went wrong on the server"** | Broken upload, missing database update, or wrong database password | 1. Open `api/error_log` in File Manager; the last lines say why. 2. "Table … doesn't exist" / "Unknown column": a database update was missed (section 6.3). 3. "Access denied for user": the password in `api/config.php` is wrong. 4. "Cannot redeclare" / "Call to undefined function": only part of a zip was uploaded, so extract the whole zip again |
| Sync pill **"Not connected"** (red) | Device not linked, or facility suspended | In the app: System → Server connection & sync says why |
| Sync pill **"Sync failed – will retry"** | Server unreachable or erroring | Check `api/sync.php` as above |
| **"Device limit reached"** | Plan's device limit used up | The facility removes an old device in System → Devices, or RHS raises the limit (Licence → Devices allowed) |
| **"Too many wrong attempts"** | 20 wrong passwords from that place | Wait 15 minutes |
| **Old screens after an update** | Phone still has the old version cached | Close the app fully and reopen with internet. If it is still old, `CACHE_NAME` was not bumped (section 10) |
| App doesn't open **offline** | Never opened once online over https on that device | Open it once with internet; check the padlock in the address bar |
| The **"Please read and agree"** banner keeps coming back | Agreeing needs internet, and only the facility's super admin can do it | Super admin: Settings → Privacy → *Read and agree* while online. RHS Admin → facility → Overview shows whether it was saved |
| **Certificates stay "waiting"** and never upload | PHP upload limit too small | cPanel → Select PHP Version → Options → `post_max_size` and `upload_max_filesize` at least **8M** |
| **Payment stuck / "On hold"** | Nylon Pay reported a different amount, or the webhook is missing | RHS Admin → Payments → Online payments shows the status. Check the payment in the Nylon Pay dashboard before renewing by hand. The webhook URL must be `https://hrb.truehome.com.ug/api/nylonpay-webhook.php` |
| **"Online payment is not switched on yet"** | Keys missing in `api/payment-config.php` | Fill in the Nylon Pay keys on the server |
| **Activation code "not valid"** | Code made for a different name, date, plan or device count, or `license_secret` differs | Make a new code in RHS Admin with the facility's exact licence name. Check section 2 |
| A sale/stock **appears twice** | Should never happen | Copy the patient number and tell the developer. Check: `SELECT patient_no, COUNT(*) FROM sales GROUP BY patient_no HAVING COUNT(*) > 1;` |

### RHS Admin (bhr-admin.truehome.com.ug)

| What you see | What to do |
|---|---|
| Blank page or "Something went wrong" | File Manager → `bhr-admin.truehome.com.ug/error_log`. Same causes as above: missed database update, wrong password in `app/config.php`, partial upload |
| A page says **"Run database/update-N-….sql"** | Run that update (section 6.2) |
| **Privacy** page says "Run database/update-7-privacy.sql" | Update 7 was missed (section 6.2). Until it is run, nothing is recorded when people agree, and the app's Settings → Privacy says "not available yet" |
| New design not showing | Ctrl+Shift+R. If it is still old, `?v=` in `app/layout.php` was not bumped |
| **Alert emails don't arrive** | 1. Check spam. 2. Settings → Email alerts → *Send a test email*. 3. "Send from" must be on your own domain and exist in cPanel → Email Accounts. 4. cPanel → **Track Delivery** shows whether the server sent it |
| Logged out often | `idle_minutes` in `app/config.php` (minutes of inactivity before logout) |
| "You were locked out" | 5 wrong passwords: wait 15 minutes, or another super admin resets it |

---

## 12. Undoing a bad update (rollback)

If an update breaks the live system and you cannot fix it quickly:

1. **Files:** build zips of the **previous** version and extract them over the server, the same way as section 5. On the computer with the repository:
   ```bash
   cp tools/make-update-zips.sh ~/make-update-zips.sh   # keep a copy: older versions may not have it
   git stash                                            # put aside any unsaved work
   git checkout deployed-<previous date>                # the last version that worked
   ~/make-update-zips.sh <the broken version's tag or commit>
   git checkout main && git stash pop
   ```
   Note: this zips the files that differ between the two versions, taken from the old version, which is what you want. Files that only exist in the new version stay on the server, and that is harmless.
2. **Database:** usually **leave it**. Update files only add things, and older code ignores new tables and columns. Restore the backup (section 7.2) only if an update damaged data, and talk to the system owner first: restoring loses everything since the backup.
3. Bump nothing. Phones pick up the old files when `CACHE_NAME` differs from what they have, which it will.
4. Write what happened in [Release history](#13-release-history).

---

## 13. Release history

Add a line for every update put live (newest first). Rows before 2026-11-27 were reconstructed from the dates of the old zip files, so they may not be exact.

| Date | App version | What changed | Zips | Database updates | Done by |
|---|---|---|---|---|---|
| 2026-11-27 | 1.25 | Feedback & rating (app Settings + RHS Admin Feedback page); free trial 7 → 14 days; Standard plan 5 → 8 devices, branch-friendly description; certificate downloads in RHS Admin; new HTML alert emails (new facility, subscription, feedback) sent from your own domain; trial-ending warning switched on; PHP errors hidden from visitors; **Privacy Policy & Terms of Use** pages, "I agree" at registration, Settings → Privacy (agree, ask for deletion), RHS Admin Privacy page and *Erase facility* | `rhb-update-15.zip`, `rhs-admin-update-9.zip` | 5 and 7 (before files), 6 (after files) | |
| 2026-11-25 | 1.24 | Alert email sender fix | `rhb-update-14.zip`, `rhs-admin-update-8.zip` | — | |
| 2026-11-21 | 1.24 | Stamp & certificates, admin permissions, Nylon Pay online payments (code committed to GitHub this day) | up to `rhb-update-13.zip`, `rhs-admin-update-7.zip` | 3, 4 | |
| 2026-11-19 | — | First live version: app on hrb.truehome.com.ug, RHS Admin on bhr-admin.truehome.com.ug | full upload | `schema.sql`, `admin-schema.sql`, 1, 2 | |

---

## 14. Privacy and data protection

The app stores **health information about patients** (name, phone, diagnosis on sales). Uganda's **Data Protection and Privacy Act, 2019** treats this as special personal data. For the facility's records, each facility is the *data controller* and RHS is its *data processor*. For accounts, payments and feedback, RHS is the controller. The public **Privacy Policy** and **Terms of Use** tell facilities what we do. This section explains how to keep those promises.

### 14.1 What is in the system

| Part | Where |
|---|---|
| Privacy Policy, Terms of Use (public web pages) | https://hrb.truehome.com.ug/privacy.html and `/terms.html`. Files: `RealityHealthBridge-WebHost/privacy.html`, `terms.html`, `css/legal.css` |
| "I agree" tick when registering a facility (required) | App registration form. Saved on the server with the facility: version, date and who agreed (`facilities.terms_version`, `terms_accepted_at`, `terms_accepted_by`) |
| Banner "Please read and agree…" | Shown in the app to the **super admin** of a facility that has not agreed to the current version (for example, one that registered before the policy existed) |
| Settings → **Privacy** in the app | Links to both pages, whether the facility agreed, a short summary, and (super admin only) **Ask RHS to delete our data** |
| RHS Admin → **Privacy** (super admins) | Deletion requests, facilities past the 12-month keep period, how many facilities agreed |
| RHS Admin → facility → **Overview** | Agreement status; *Erase this facility's data* at the bottom (super admins) |
| App API `api/privacy.php` | Agreeing, deletion requests (super admin of the facility only) |

### 14.2 The promises in the policy, and how we keep them

| We promised | How it is kept | Who / how often |
|---|---|---|
| Data stored in **Uganda** | Hosting is AfriRegister in Uganda. **If you ever move hosting outside Uganda, the policy must change first** (14.6) | Owner |
| Delete a facility's data **within 30 days** of confirming its request | 14.3 | Weekly check |
| Delete a facility's data **12 months after its subscription or trial ends** | 14.4 | Monthly check |
| Deleted data leaves **our backups within 3 months** | Delete downloaded backup files older than 3 months (laptop and Google Drive). Also check cPanel → Backup does not keep older copies | Monthly |
| **Security logs** kept up to **2 years** | Once a year, phpMyAdmin → `rmsugnxf_rhb` → SQL: `DELETE FROM admin_audit_log WHERE created_at < (NOW() - INTERVAL 2 YEAR);` , `DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 2 YEAR);` and `DELETE FROM admin_login_attempts WHERE attempted_at < (NOW() - INTERVAL 2 YEAR);` (back up first) | Every January |
| Answer requests (see, correct, delete) **within 30 days** | Requests come by phone, WhatsApp, email or the app. Note the date you received it | Whoever answers support |
| Tell the PDPO and the facilities **if data leaks** | 14.5 | When it happens |
| Never sell data or use it for adverts | Do not share facility or patient data with anyone except as the policy lists | Everyone |
| Patient details are seen by RHS **only** to support the facility, fix a fault, or when the law requires | RHS Admin never shows patient names, phones or diagnoses. Do not look them up in phpMyAdmin unless a facility asked for help with a specific record | Everyone |

### 14.3 A facility asked us to delete its data

The request shows in RHS Admin → **Privacy** (the menu says "1 open"), and an alert email is sent to the alert recipients. It can also come by phone or email: treat it the same way.

1. **Confirm it is really them.** Call or email the contact given in the request. Make sure you are talking to the facility's super admin or owner. Ask whether they have downloaded a backup (app: System → Backup) if they want to keep their records.
2. **If they changed their mind:** Privacy → the request → *Close without erasing* → "They changed their mind" → write who you spoke to and when.
3. **If they confirm:** open the facility (click its name on the Privacy page) → **Overview** → scroll to the bottom → *Erase this facility's data* → type the facility name exactly → add a note (e.g. "Confirmed by phone with Jane, 2 Dec") → **Erase all data** → confirm.
4. The request closes by itself and shows under *Closed requests*. Tell the facility it is done.
5. Do it **within 30 days** of step 1. The Privacy page marks requests older than 3 weeks in red.

What erasing does: deletes the profile, logins, devices, stock, sales and patient details, certificates, feedback and targeted messages from the server. It keeps the payments the facility made to RHS (tax records, with the phone number removed), the audit log, and the request. The facility's phones are logged out and **cannot upload the data again**. Records still on those phones stay there until the facility deletes the app. **It cannot be undone**, except by restoring a whole database backup (section 7.2), which also undoes everything else since that backup.

### 14.4 Facilities past the keep period (monthly)

RHS Admin → **Privacy** → *Past the keep period* lists facilities whose trial or subscription ended **more than 12 months ago**.
1. Try once to reach each one (phone or email): "Your Reality Health Bridge records will be deleted on <date>. Download a backup or renew if you want to keep them."
2. Wait 2 weeks. If they did not renew, erase the facility (14.3, step 3; in the note write "12 months after end, notice sent <date>").

### 14.5 If data leaks (a breach)

Examples: someone got into the server or an RHS Admin account, a backup file or laptop was lost, a facility can see another facility's data.
1. **Stop it at once:** change the cPanel and database passwords, deactivate the affected RHS Admin accounts (Admin team), remove affected devices, take the site offline if needed (ask the hosting provider).
2. **Write down** what happened, when, which facilities and what kind of data.
3. **Tell the owner and the developer** the same day.
4. The owner **notifies the Personal Data Protection Office (PDPO)** without delay, as the law requires. Check the current procedure on the PDPO website.
5. **Tell the affected facilities** what happened and what they should do (e.g. change passwords). RHS Admin → Messages can send a banner to chosen facilities.

### 14.6 Changing the Privacy Policy or Terms of Use

They are plain web pages: `RealityHealthBridge-WebHost/privacy.html` and `terms.html`. Write in plain language, and have a lawyer check important changes.
1. Edit the text, and change **"Last updated"** and **"Version"** at the top of the changed page (version = the date, e.g. `2027-03-01`).
2. **Small fixes** (typos, a new phone number): that is all. Put it live as a normal update (section 5).
3. **Changes people must agree to again** (new use of data, new provider, price terms, data moving abroad): also change the version date in **all three** places, then bump `CACHE_NAME` (section 10):
   - `RealityHealthBridge-WebHost/js/services/privacy.js` → `TERMS_VERSION`
   - `RealityHealthBridge-WebHost/api/lib.php` → `TERMS_VERSION`
   - `RHS-Admin/app/privacy_tools.php` → `TERMS_VERSION_CURRENT`

   After the update, every facility's super admin sees the "Please read and agree" banner again. RHS Admin → Privacy shows how many have agreed.
4. Contact details on the pages: change them in both files (section "Contact us").

### 14.7 For the owner (not technical)

- **Register Reality Health Ltd with the Personal Data Protection Office (PDPO)** as a data controller/processor, and renew the registration when it expires. Check the current requirements and fees on the PDPO website.
- **Name a person responsible for data protection** at RHS and keep their contact in the policy's "Contact us".
- **Have a lawyer read** the Privacy Policy and Terms of Use, especially before the official launch and after big changes.
- Make sure every RHS team member with RHS Admin access has read section 14.2.

