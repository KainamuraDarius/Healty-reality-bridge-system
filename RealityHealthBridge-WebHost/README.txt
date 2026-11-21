REALITY HEALTH BRIDGE - web-host package (updated)
===================================================

What changed in this version
 1. Facility email is now REQUIRED when a facility profile is created (and when it is edited).
 2. Every time a NEW facility profile is created, an email with the facility's details and its SECRET CODE
    is sent directly to realityhealthsystem10@gmail.com. If the phone/computer is offline, the message waits
    and is sent automatically when the internet returns. Each facility is emailed once only.
 3. New colours (navy and blue, much less green), slightly bigger and bolder words.
 4. Half-moon button (top right) switches light / dark mode for eye protection. The choice is remembered.
 5. "Install app" button appears on Android and Windows (Chrome / Edge) so the system installs like an app.

PROJECT STRUCTURE (for developers)
 No build step: upload the folder as-is (see DEPLOY.md for which parts). Scripts are plain files loaded in order by index.html.
 api/                     PHP API for cPanel: config.php (database password), register.php, login.php, sync.php
 database/schema.sql      MySQL tables (paste into phpMyAdmin)
 js/vendor/dexie.min.js   Dexie 4.0.10 (IndexedDB library), kept locally so the app works offline
 js/core/localdb.js       on-device database tables (same as MySQL + a "synced" flag)
 js/core/storage.js       turns database rows into the app's data and back; one-time move from old storage
 js/core/crypto.js        ids and password scrambling (no plain-text passwords stored)
 js/services/sync.js      upload/download with the server, status pill, connecting new devices
 index.html               page shell; lists every CSS/JS file in load order
 css/tokens.css           colours, spacing, fonts (light + dark theme)
 css/base.css             reset, typography, utilities
 css/components.css       buttons, forms, cards, tables, tags, modal, toast
 css/layout.css           sidebar, top bar, phone bottom bar, login screens, responsive rules
 css/pages.css            page-specific styles;  css/print.css  receipts + printed reports
 js/core/                 brand, helpers (fmt, esc...), storage, app state, patient numbers
 js/ui/                   icons, shared blocks, toast, modal, password field, theme/install buttons
 js/domain/               stock, finance, catalogue, accounts, facility logic (no HTML)
 js/services/             backup, Google Drive, sync, registration, licence, MoMo
 js/components/           receipts, packages & pay, sales search
 js/pages/                one file per screen: auth, facility-setup, lock-screens, dashboard,
                          stock-in, sell, inventory, sales-log, expiry, finance, system
 js/app/shell.js          sidebar/top bar, page registry (PAGES), navigation
 js/main.js               start-up, theme toggle, install prompt, service worker
 When adding or renaming a file: add it to index.html AND to PRECACHE in service-worker.js,
 then bump CACHE_NAME so installed apps pick up the change.

What is in this zip
 index.html, config.js, manifest.json, service-worker.js, icons/   -> the website / app
 netlify.toml, netlify/functions/                                  -> payments (unchanged)
 apps-script/Code.gs                                               -> the email service (Step 1)
 api/, database/schema.sql, DEPLOY.md                              -> MySQL database + PHP API for cPanel (see DEPLOY.md)
 docs/RHB_Setup_and_Install_Guide.pdf                              -> printable guide

SET-UP (once, about 5 minutes)
 Step 1  Email service
   a. Sign in to Google as realityhealthsystem10@gmail.com and open script.google.com
   b. New project. Delete the sample code and paste ALL of apps-script/Code.gs. Save.
   c. Choose function "testEmail" and press Run. Allow the permission. A test email arrives in the inbox.
   d. Deploy > New deployment > Web app.  Execute as: Me.  Who has access: Anyone.  Deploy.
      Copy the "Web app URL".
 Step 2  Open config.js and replace PASTE_YOUR_WEB_APP_URL_HERE with that URL (keep the quotes).
 Step 3  Upload everything in this zip to your host (GitHub repo REALITY-HEALTH-BRIGE, Cloudflare or Netlify),
         replacing the old files.
 Step 4  Test: create a new facility profile on the live site. The email with the secret code should reach
         realityhealthsystem10@gmail.com within a minute.

CENTRAL DATABASE (MySQL on your cPanel hosting) + OFFLINE SYNC
 Full step-by-step instructions: DEPLOY.md
 - database/schema.sql   tables to paste into phpMyAdmin
 - api/                  small PHP API (register, login, sync); put the database password in api/config.php
 - Every device saves to its own on-device database first (works with no internet) and syncs with the
   server automatically when online. The pill in the top bar shows the sync status.
 - The supabase/ folder and the Supabase settings are no longer used and can be deleted.

INSTALL ON ANDROID AND WINDOWS
 Android (Chrome): open the website, tap "Install app" (top right) or Menu (three dots) > Install app / Add to Home screen.
 Windows (Edge or Chrome): open the website, click "Install app" (top right) or the install icon in the address bar.
 It then opens in its own window / icon and keeps working offline.

NOTES
 - "Secret code" in the email is the facility's standard recovery password shown when the profile is saved.
 - A normal Gmail account can send about 100 emails a day through Apps Script.
 - If you edit Code.gs later: Deploy > Manage deployments > edit > New version.
 - The website must be on https (turn on AutoSSL in cPanel - see DEPLOY.md) for installing and offline use.
