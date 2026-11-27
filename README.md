# Reality Health Bridge

Offline-first management system for pharmacies, drug shops and clinics. Facilities can sell, receive stock, track expiry and see their money even with no internet. Everything syncs to a central server when the connection returns.

The repository holds two parts:

| Folder | What it is |
|---|---|
| `RealityHealthBridge-WebHost/` | The **facility app**: an installable web app (PWA) plus the PHP/MySQL sync API |
| `RHS-Admin/` | The **RHS Admin website**: a separate site where the RHS team manages facilities, licences and payments |

---

## Facility app

### Features
- **Works offline.** Data is stored on the device in IndexedDB and synced to the server in the background.
- **Sales and receipts.** Fast selling, printable receipts with the facility's digital stamp, and a sales log.
- **Stock.** Stock-in, inventory, expiry tracking, and type-to-search for units and package words.
- **Finance.** Income, expenses and profit.
- **Reports.** Daily, weekly, monthly, annual or custom period. Each can be printed or saved as PDF.
- **Team and permissions:**
  - The person who registers the facility is the **super admin** and owns the facility profile.
  - Up to 3 more admins and 7 staff can be added.
  - Other admins only get sensitive access (finance, reports, records, staff, subscription, backup, devices) when the super admin ticks it.
  - Cadre and position are recorded separately.
- **Facility documents.** Operational certificates and a digital stamp can be uploaded at registration or later.
- **Subscriptions.** 14-day free trial (RHS can extend it per facility), then online payment through Nylon Pay (mobile money):
  - first payment of UGX 150,000 (Starter, up to 2 devices) or UGX 300,000 (Standard, up to 8 devices, for facilities with branches), which includes the first month;
  - then UGX 20,000 per month.
- **Feedback & rating.** Anyone can rate the app and send feedback from Settings; RHS super admins read it in RHS Admin.
- **Privacy.** Public Privacy Policy and Terms of Use (`privacy.html`, `terms.html`); "I agree" at registration; Settings → Privacy, where the super admin can ask RHS to delete the facility's data.
- **Backups and shared phones.** Device backup and restore. Several people can safely use one phone: changes are signed per person.

### Tech
- Plain HTML, CSS and JavaScript (classic scripts). **No build step.**
- Dexie (IndexedDB) for local storage; a service worker for offline use.
- PHP 8 and MySQL/MariaDB for the API (`api/`).

### Structure
```
RealityHealthBridge-WebHost/
├── index.html, service-worker.js, manifest.json, config.js
├── css/          styles (tokens, layout, components, pages, print)
├── js/
│   ├── core/       storage, local database, crypto, state
│   ├── domain/     accounts, catalog, stock, finance, facility
│   ├── services/   sync, licence, payments, backup
│   ├── components/ receipts, stamp & certificates, payment box
│   ├── ui/         shared widgets (combobox, password field…)
│   └── pages/      one file per screen
├── api/          PHP sync, login, register and payment endpoints
└── database/     schema.sql and numbered update-N-*.sql migrations
```

> When adding a new JS or CSS file, add it to `index.html` **and** to the `PRECACHE` list in `service-worker.js`, and bump `CACHE_NAME`.

---

## RHS Admin website

A plain PHP website for the RHS team:
- **Dashboard.** This month's income, licence status counts, facilities ending soon, and quiet devices.
- **Facilities.** Search and filter by status. Each facility has tabs for Overview, Licence & billing, Stamp & certificates, Devices & logins, and History.
- **Licences.** Renew, extend trial, suspend or lift, and issue activation codes.
- **Feedback** (super admins). Ratings and comments from the app, with unread counts and email alerts.
- **Privacy** (super admins). Data deletion requests, facilities past the 12-month keep period, who agreed to the terms; *Erase this facility's data* on each facility. Procedures: MAINTENANCE.md section 14.
- **Certificates.** Open or download a facility's certificates, one by one or all as a zip.
- **Payments.** Record manual payments; online Nylon Pay payments are added automatically.
- **Other.** Support messages, announcements, reports, the admin team, and an audit log.

It uses the same MySQL database as the facility app.

---

## Setup

**Looking after the live system?** Read **[MAINTENANCE.md](MAINTENANCE.md)**: how to put updates live, database updates,
backups, everyday RHS Admin tasks, prices/plans, troubleshooting and rollback. Update zips are made with
`tools/make-update-zips.sh`.

Full first-install instructions are in:
- [`RealityHealthBridge-WebHost/DEPLOY.md`](RealityHealthBridge-WebHost/DEPLOY.md), for the app, API, database updates and payment go-live;
- [`RHS-Admin/DEPLOY.md`](RHS-Admin/DEPLOY.md), for the admin website.

In short:
1. Create a MySQL database and import `database/schema.sql`. On an existing install, run the `update-N` files in order instead.
2. Upload `RealityHealthBridge-WebHost/` to the web root and create `api/config.php` with the database details.
3. To take online payments, create `api/payment-config.php` with your Nylon Pay keys.
4. Upload `RHS-Admin/` to its own (sub)domain, create `app/config.php`, run `setup.php` once, then delete it.

### Requirements
- PHP 8.0+ with PDO MySQL, cURL and GD (GD is used to clean up stamp images).
- MySQL 5.7+ or MariaDB 10.3+.
- Apache with `.htaccess` enabled.
- HTTPS, which the PWA and payments need.

---

## Security notes
- **Config files are never committed.** `api/config.php`, `api/payment-config.php` and `RHS-Admin/app/config.php` hold the database password and payment keys. They are listed in `.gitignore`.
- **Payments are checked by the server.** The server sets every price. A payment only counts after the server confirms it with Nylon Pay; webhooks are signature-checked and treated only as a hint.
- **Sensitive changes are proven per person.** Changes to staff, the facility profile and documents carry a per-person proof that the server verifies.

---

© Reality Health Bridge. All rights reserved.
