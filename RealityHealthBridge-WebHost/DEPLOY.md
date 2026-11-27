# Putting Reality Health Bridge on your cPanel hosting

> This guide is for the **first install**. Once the app is live, use **[MAINTENANCE.md](../MAINTENANCE.md)** at the top of the
> repository for updates, database changes, backups, everyday tasks and troubleshooting.

This guide takes you from the files on your computer to a working app on your own domain,
with the MySQL database and offline sync. Allow about 30 minutes the first time.

Everywhere below, replace **mydomain.com** with your real domain.

---

## What goes where

| On your computer | On the server (cPanel File Manager) | Upload? |
|---|---|---|
| `index.html`, `manifest.json`, `service-worker.js`, `config.js`, `.htaccess` | `public_html/` | Yes |
| `assets/`, `icons/`, `css/`, `js/` folders | `public_html/` | Yes |
| `api/` folder (includes its own `.htaccess`) | `public_html/api/` | Yes |
| `database/schema.sql` | nowhere: you paste it into phpMyAdmin (Step 1) | No |
| `apps-script/`, `DEPLOY.md` | nowhere | No |

> **Hidden files:** `.htaccess` starts with a dot, so File Manager hides it. In File Manager click
> **Settings** (top right), tick **Show Hidden Files (dotfiles)**, and save. Check that both
> `public_html/.htaccess` and `public_html/api/.htaccess` are there after uploading.

> **App in a sub-folder?** That works too. For example, put everything in `public_html/rhb/`; the API is then
> `public_html/rhb/api/` and the app address is `https://mydomain.com/rhb/`.

---

## Step 1: Create the tables (phpMyAdmin)

The database `rmsugnxf_rhb` and user `rmsugnxf_rhbapi` already exist.

1. cPanel → **MySQL® Databases**. Under **Current Databases**, check that `rmsugnxf_rhbapi` is listed under
   **Privileged Users** for `rmsugnxf_rhb`.
   If it isn't: under **Add User To Database** choose the user and the database → **Add** → tick
   **ALL PRIVILEGES** → **Make Changes**.
2. cPanel → **phpMyAdmin**.
3. On the left, click **rmsugnxf_rhb**.
4. Click the **SQL** tab at the top.
5. Open `database/schema.sql` on your computer in a text editor (Notepad is fine). Select everything, copy,
   and paste it into the big box.
6. Click **Go** (bottom right).
7. On the left you should now see 12 tables: `adjustments, api_tokens, devices, facilities,
   login_attempts, products, sale_items, sale_payments, sales, stock_batches, sync_counter, users`.

Running the script a second time is safe: it only creates what is missing and never deletes anything.

---

## Step 2: Turn on https (AutoSSL)

The app needs `https://` for offline mode, the "Install app" button, and to keep passwords safe.

1. cPanel → **SSL/TLS Status**.
2. Tick your domain (and `www.` version) → **Run AutoSSL**. Wait until they show a green padlock.
   It can take a few minutes.
3. Open `https://mydomain.com` in your browser and check there is a padlock and no warning.

---

## Step 3: Check the PHP version

1. cPanel → **MultiPHP Manager** (or **Select PHP Version**).
2. Set your domain to **PHP 8.1 or newer** (8.2 or 8.3 is ideal).
3. If you see **Select PHP Version → Extensions**, make sure **pdo_mysql** is ticked. It almost always is.

---

## Step 4: Upload the files

The easiest way is a zip file:

1. On your computer, make a zip containing only the "Yes" items from the table above:
   `index.html, manifest.json, service-worker.js, config.js, .htaccess, assets, icons, css, js, api`.
2. cPanel → **File Manager** → open `public_html`.
3. **Upload** → choose the zip. When it finishes, go back, right-click the zip → **Extract** →
   extract into `public_html`. Then delete the zip.
4. If an old version of the app was there before, let the new files **replace** the old ones.

---

## Step 5: Fill in the database password (config.php)

1. In File Manager, open `public_html/api/`, right-click **config.php** → **Edit**.
2. Change this line, keeping the quotes:
   ```php
   'db_pass' => 'PUT_YOUR_DATABASE_PASSWORD_HERE',
   ```
   to the password of the MySQL user `rmsugnxf_rhbapi`.
   (Forgotten it? cPanel → MySQL® Databases → Current Users → **Change Password**, then use the new one here.)
3. Change `'allowed_origin' => 'https://mydomain.com'` to your real address, e.g. `'https://myrealdomain.ug'`.
   Use no slash at the end, and include `www.` only if people open the app with `www.`.
4. Leave `'require_https' => true`.
5. **Save Changes**.

`config.php` can't be opened from the web, because the `.htaccess` file blocks it. Never send it to anyone.

---

## Step 6: Test it

Do these in order. Each one should work before you move on.

### A. The server parts

| Open this in a browser | You should see |
|---|---|
| `https://mydomain.com/api/config.php` | **403 Forbidden**. Good: the password file is protected. |
| `https://mydomain.com/api/sync.php` | `{"ok":false,"error":"post_only","message":"Use POST."}`. Good: PHP works. |
| `https://mydomain.com/database/schema.sql` | **403 Forbidden** or **404 Not Found**. Good: private files aren't public. |

If `sync.php` shows `"server_error"` instead, the database details are wrong. Check Step 5. The exact error
is written to a file called `error_log` inside `public_html/api/` (open it with File Manager).

### B. Register a test pharmacy (phone or computer, with internet)

1. Open `https://mydomain.com`.
2. Register a test pharmacy (use an email you control).
3. Within a few seconds, the pill in the top bar should say **"Last synced just now · all saved"**.
4. In phpMyAdmin, click the `facilities` table → **Browse**. Your test pharmacy is there.
   `users` has the admin, with a long `password_hash` and no readable password.
   `devices` has one row with `device_code` **A**.

### C. Works with no internet

1. On a **phone**, open `https://mydomain.com` once with internet. Tap **Install app** if you like.
2. Add a product on **Stock In**.
3. Turn on **airplane mode**. Close the app completely, then open it again: it should open normally.
4. Record a sale. The pill turns orange: **"Offline – saving on this device · 3 records waiting"**
   (on a phone it shows **"Offline · 3"**).
5. Turn airplane mode off. Within about a minute (or tap the pill) it turns green: **"all saved"**.
6. In phpMyAdmin → `sales` → **Browse**: the sale is there **once**.

### D. Two devices

1. On a second phone or computer, open `https://mydomain.com` → **"Log in to a pharmacy that is already set up"**
   → pharmacy email + username + password.
2. It downloads everything and gets device code **B**.
3. Put **both** devices in airplane mode. Sell the **same** drug on both.
4. Turn the internet back on for both. After a minute, **both** show the same stock
   (e.g. 100 − 5 − 7 = 88), and patient numbers look like `26-11-A-0001` and `26-11-B-0001`.

### E. No duplicates (optional check in phpMyAdmin → SQL)

```sql
SELECT patient_no, COUNT(*) FROM sales GROUP BY patient_no HAVING COUNT(*) > 1;
```
This should return **no rows**.

When you're happy, delete the test pharmacy's data, or keep it as a demo.

---

## Existing users (people already using the app)

Nothing to do. The first time they open the new version:

1. The app shows **"Updating your records…"** and moves their data from the old browser storage
   into the new on-device database. Stock numbers stay exactly as they were.
2. When the internet is on, the pharmacy is sent to the server automatically.
3. The old copy stays in the browser as a safety net. It is no longer used.

If a pharmacy used the old app on **two** devices separately, the first device to connect registers
the pharmacy. The second device shows **"Pharmacy email already on the server"** in **System → Server
connection & sync**. There an admin can **join** the pharmacy on the server (download a backup on that
device first, because its own separate records are replaced).

---

## Updating the app later

> The full, current procedure (backup → database updates → zips → checks → record it) is in
> **[MAINTENANCE.md → Putting an update live](../MAINTENANCE.md#5-putting-an-update-live)**. The short version:

1. Upload the changed files (same places as before), as made by `tools/make-update-zips.sh` (it leaves out `api/config.php`,
   `api/payment-config.php` and `config.js`).
2. **Important:** if you added, renamed or removed any file, open `service-worker.js`, add it to the
   `PRECACHE` list, and change `CACHE_NAME` (e.g. `'rhb-cache-v10'` → `'rhb-cache-v11'`).
   It's good practice to bump `CACHE_NAME` on every upload anyway.
3. Phones pick up the new version the next time they open the app with internet.

Never re-run old versions of `schema.sql` over a newer database. A new version of the schema will always be safe to
run on top of the old one.

### Database updates (run once each, in order, BEFORE uploading the new `api/` files)

| File | Adds | Needed for app version |
|---|---|---|
| `database/update-1-licences.sql` | licences managed by the RHS admin site | 1.13 |
| `database/update-2-device-health.sql` | device health on the admin Support page | 1.14 |
| `database/update-3-stamp-certificates.sql` | digital stamp, operational certificates, position (separate from cadre), super admin + admin permissions, super admin edits the profile | 1.24 |
| `database/update-4-online-payments.sql` | online subscription payments through Nylon Pay (server-only table) | 1.24 |
| `database/update-5-feedback.sql` | feedback & star ratings from the app, read by RHS super admins on the admin Feedback page (server-only table) | 1.25 |
| `database/update-6-standard-8-devices.sql` | Standard plan (and free trial) goes from 5 to 8 devices for existing facilities. Run it right **after** uploading the 1.25 files | 1.25 |
| `database/update-7-privacy.sql` | who agreed to the Privacy Policy & Terms, and facilities' data deletion requests (server-only table). Run **before** the files | 1.25 |

phpMyAdmin → click the database → **SQL** → paste the file → **Go**. "Duplicate column name" means it was already run — fine.
Each file says at its top whether it goes **before** or **after** the files; see [MAINTENANCE.md → Database updates](../MAINTENANCE.md#6-database-updates).

After uploading app 1.24, tell facilities: **everyone logs in once more** (the app now records who makes each
sensitive change), and **other admins start with nothing ticked**: the super admin (who registered the facility)
opens Team → Permissions to allow Finance, Reports, etc.

Update 3 stores certificate files (up to 2 MB each) in the database; the app sends them up to about 3 MB per
sync call. If certificates stay "waiting" and never upload, raise **post_max_size** and **upload_max_filesize**
to at least 8M in cPanel → *Select PHP Version* → *Options* (most hosts already allow more).

### Switching on online payments (Nylon Pay)

1. Run `database/update-4-online-payments.sql` (above).
2. Upload `api/payment-config.php` **once**, then edit it on the server (cPanel → File Manager → `api/payment-config.php`
   → Edit) and fill in the **API key**, **API secret** and **webhook secret** from the Nylon Pay dashboard
   (API Settings → your key). Do not upload this file again in later updates — it would wipe the keys.
   It is blocked from the web by `api/.htaccess`.
3. In Nylon Pay, the key's **Webhook URL** must be `https://hrb.truehome.com.ug/api/nylonpay-webhook.php`.
4. Test with one real payment: in the app, System → Subscription → Renew (or a plan) → your own MTN/Airtel number.
   After approving, the plan switches on within a few seconds; RHS Admin → Payments → "Online payments" shows it,
   and it is added to the payments ledger automatically.
5. If something goes wrong, the payment shows there with its status. **On hold** means Nylon reported a different
   amount: check it in the Nylon Pay dashboard before renewing by hand.

While the keys are still `PUT_YOUR_...`, the app says online payment is not switched on yet, and activation codes
keep working as before.

---

## Backups

The server now holds every pharmacy's records, so back up the database:

- cPanel → **Backup** → **Download a MySQL Database Backup** → `rmsugnxf_rhb`. Do this weekly and keep
  the file somewhere safe (not only on the server).
- Or phpMyAdmin → `rmsugnxf_rhb` → **Export** → **Go**.

Each pharmacy can still download its own backup file from **System → Backup** in the app.

---

## When something is wrong

| What you see | What to do |
|---|---|
| Pill says **"Not connected"**, red | Open **System → Server connection & sync**; it says why and what to do. |
| Pill stays **"Sync failed – will retry"** | Open `https://mydomain.com/api/sync.php`. If it doesn't show `post_only`, check Step 5 and the `api/error_log` file. |
| **"Device limit reached"** | The pharmacy's package allows that many devices. An admin removes an old device in **System → Devices** on a connected device, then connects again. |
| **"Too many wrong attempts"** | Someone typed the wrong password 20 times. Wait 15 minutes. |
| The app doesn't open offline | It must have been opened once **with internet over https** first. Check the padlock (Step 2). |
| Old screens still show after an update | Bump `CACHE_NAME` in `service-worker.js` (see "Updating the app later"), upload it, then open the app once with internet. |
| Login works on one phone but a new phone says wrong password | The new phone checks with the server. Make sure the first phone has synced since the password was last changed. |

---

## Not covered by this setup

- **Registration emails** still use the Google Apps Script service set up earlier (`config.js` →
  `REGISTRATION_EMAIL_URL`).
