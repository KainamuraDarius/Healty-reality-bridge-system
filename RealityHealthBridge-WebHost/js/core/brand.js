// Brand assets and REALITY HEALTH SYSTEM contact details.
const RHB_LOGO = 'assets/img/logo.png';

(function setFavicon(){
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = RHB_LOGO;
  document.head.appendChild(link);
})();

// App version, shown to RHS in the admin site (Support page). Raise it with every upload,
// together with CACHE_NAME in service-worker.js.
const RHB_APP_VERSION = '1.25';

// ---------- REALITY HEALTH SYSTEM contact & payment ----------
const RHS_PHONE = '0789511736';
const RHS_EMAIL = 'realityhealthsystem10@gmail.com';
const RHS_MOMO_NAME = 'REALITY HEALTH SYSTEM';
