# Going live: pharmacy app update 3 + the RHS Admin site

Do **Part A** first, then **Part B**. Everything happens in cPanel (simba.afriregister.com).
The files you need are on this computer, in `/home/kainamura/pharma/`:

| File | What it is |
|---|---|
| `rhb-update-3.zip` | 12 updated files for the pharmacy app (welcome screen, device health, messages banner, sign-up email) |
| `RealityHealthBridge-WebHost/database/update-1-licences.sql` | database update 1 (you may already have run it) |
| `RealityHealthBridge-WebHost/database/update-2-device-health.sql` | database update 2 (new) |
| `rhs-admin-upload.zip` | the whole admin website |
| `RHS-Admin/database/admin-schema.sql` | the admin site's tables |

---

## Part A — update the pharmacy app (hrb.truehome.com.ug)

### A1. Update the database (2 minutes)
1. cPanel → **phpMyAdmin** → click **rmsugnxf_rhb** on the left.
2. Click the **Import** tab → **Choose file** → pick `update-1-licences.sql` → **Import** (bottom).
   - Green message = done. Red **"Duplicate column name"** = it was already done. Both are fine.
3. Do the same with `update-2-device-health.sql`.

> Order matters: update the database **before** uploading the files in A2.

### A2. Upload the new files
1. cPanel → **File Manager** → open `public_html/hrb.truehome.com.ug/`.
2. **Upload** → choose `rhb-update-3.zip` → wait for 100% → go back.
3. Right-click `rhb-update-3.zip` → **Extract** → extract to `/public_html/hrb.truehome.com.ug` (exactly this, no extra folder) → it replaces the old copies.
4. Delete `rhb-update-3.zip`.

It does **not** contain `api/config.php`, so your database password there stays untouched.

### A3. Check
Open https://hrb.truehome.com.ug on a phone that already uses the app, with internet.
Within a minute it updates itself. The sync button at the top should say **"Last synced …"**.
If it says **"Sync failed"**, step A1 was missed: do A1, then tap the sync button.

---

## Part B — install the RHS Admin site (bhr-admin.truehome.com.ug)

(Web addresses cannot contain "_", so it is **bhr-admin** with a dash.)

### B1. Make the subdomain
1. cPanel → **Domains** → **Create A New Domain**.
2. Domain: `bhr-admin.truehome.com.ug`
3. Untick **"Share document root"**. Document root: `public_html/bhr-admin.truehome.com.ug`
4. **Submit**.
5. cPanel → **SSL/TLS Status** → tick the new domain → **Run AutoSSL**. (Wait until it shows a green padlock; can take a few minutes.)

### B2. Give the admin site its own database login (safer)
1. cPanel → **MySQL® Databases**.
2. **Add New User**: username `rhbadmin` (cPanel makes it `rmsugnxf_rhbadmin`). Use **Password Generator**, and **copy the password somewhere safe**.
3. **Add User To Database**: user `rmsugnxf_rhbadmin`, database `rmsugnxf_rhb` → **Add** → tick **ALL PRIVILEGES** → **Make Changes**.

### B3. Create the admin tables
phpMyAdmin → **rmsugnxf_rhb** → **Import** → choose `RHS-Admin/database/admin-schema.sql` → **Import**.
Safe to run again later; it never deletes anything.

### B4. Upload the site
1. File Manager → open `public_html/bhr-admin.truehome.com.ug/` (delete anything cPanel put there, e.g. `cgi-bin` can stay).
2. **Upload** `rhs-admin-upload.zip` → **Extract** into `/public_html/bhr-admin.truehome.com.ug` → delete the zip.
3. You should now see `index.php`, `login.php`, folders `app` and `assets`, and `.htaccess`
   (tick **Settings → Show Hidden Files** in File Manager to see it).

### B5. Put in the password and a setup key
File Manager → `app/config.php` → right-click → **Edit**:
- `'db_pass' => '…'` → the password from B2.
- `'setup_key' => '…'` → any long secret only you know (12+ characters), e.g. `Kampala-Admin-Setup-4471`.

**Save Changes**.

### B6. Create your admin account
1. Open **https://bhr-admin.truehome.com.ug/setup.php**
2. Enter the setup key from B5, your name, email and a strong password (10+ characters).
3. You are now the **super admin**. `setup.php` switches itself off from now on.

### B7. Settings
- **Settings → Email me when a pharmacy signs up**: your email address(es).
- **Send from**: first create `no-reply@truehome.com.ug` in cPanel → **Email Accounts** (otherwise emails may land in spam). Then **Send a test email**.
- **Admin team**: add colleagues (they get a temporary password and must change it at first login).

### B8. Safety checks (each must NOT show the file)
- https://bhr-admin.truehome.com.ug/app/config.php → **Forbidden**
- https://bhr-admin.truehome.com.ug/database/ → **Forbidden**
- http://bhr-admin.truehome.com.ug → jumps to **https://**

---

## Every later update
- Pharmacy app: I give you a small zip; extract it over `hrb.truehome.com.ug` (never overwrite `api/config.php`).
- Admin site: extract the new zip over `bhr-admin.truehome.com.ug` **but keep your `app/config.php`**
  (download a copy first, or skip that file when asked to overwrite).
- Before the real launch: turn the "free trial ends in X days" banner back on (I will do it — just remind me).
