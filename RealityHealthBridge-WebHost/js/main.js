// Boot: pull-to-refresh guard, service worker, init, theme + install buttons.

// Extra guard against pull-to-refresh: block the overscroll gesture itself when the page is
// already scrolled to the very top (CSS overscroll-behavior covers most browsers; this covers
// older/embedded WebViews that ignore it). Scrollable areas that are themselves scrolled
// (modals, tables) are left alone so they can still scroll back up.
(function blockPullToRefresh(){
  let startY = 0;
  function insideScrolledArea(el){
    for(; el && el !== document.body && el !== document.documentElement; el = el.parentElement){
      if(el.scrollTop > 0){
        const oy = getComputedStyle(el).overflowY;
        if(oy === 'auto' || oy === 'scroll') return true;
      }
    }
    return false;
  }
  document.addEventListener('touchstart', (e)=>{ startY = e.touches[0].clientY; }, { passive:true });
  document.addEventListener('touchmove', (e)=>{
    const atTop = (window.scrollY || document.documentElement.scrollTop) <= 0;
    const pullingDown = e.touches[0].clientY > startY;
    if(atTop && pullingDown && e.cancelable && !insideScrolledArea(e.target)) e.preventDefault();
  }, { passive:false });
})();

// Lets phones and laptops install the hosted app (Chrome/Edge "Install app") and keep it
// opening offline. Only registers over https or localhost; harmless anywhere else.
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('service-worker.js').catch(()=>{}); });
}

// ---------- Light / dark mode + install button ----------
// Buttons are rendered by each screen (see js/ui/chrome.js); clicks are handled here by
// delegation so they keep working after every re-render.
(function(){
  const root = document.documentElement;
  let deferredInstall = null;
  function setMeta(){
    const m = document.querySelector('meta[name="theme-color"]');
    if(m) m.setAttribute('content', root.getAttribute('data-theme')==='dark' ? '#0D1628' : '#0B2A6B');
  }
  function toggleTheme(){ setTheme(root.getAttribute('data-theme')==='dark' ? 'light' : 'dark'); }
  // Settings > Appearance uses this too.
  window.setTheme = function(mode){
    const next = mode === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try{ localStorage.setItem('rhb:theme', next); }catch(e){}
    setMeta();
  };
  document.addEventListener('click', async (e)=>{
    if(e.target.closest('[data-action="toggle-theme"]')){ toggleTheme(); return; }
    if(e.target.closest('[data-action="go-home"]')){ authMode = 'home'; renderAuth(); window.scrollTo(0, 0); return; }
    if(e.target.closest('[data-action="install"]')){
      if(!deferredInstall) return;
      deferredInstall.prompt();
      try{ await deferredInstall.userChoice; }catch(err){}
      deferredInstall = null;
      document.body.classList.remove('can-install');
    }
  });
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstall = e; document.body.classList.add('can-install'); });
  window.addEventListener('appinstalled', ()=>{ deferredInstall = null; document.body.classList.remove('can-install'); });
  setMeta();
})();

// ---------- Init ----------
(async function init(){
  try{
    await loadState();
  }catch(e){
    console.error('Could not open on-device storage', e);
    document.getElementById('app').innerHTML = `<div class="panel" style="max-width:520px;margin:48px auto;">
      <h2>Storage is blocked</h2>
      <p>This browser is not allowing the app to save data on this device (private/incognito mode or blocked site data).
      Open the app in a normal browser window, or allow site data, then reload.</p></div>`;
    return;
  }
  startSyncEngine();
  refreshPublicInfo(true);
  session = getSession();
  // Sessions from before app 1.24 have no act key: log in again once (see startSession).
  if(session && findAccount(session.username) && session.ak){
    // keep role in sync with the stored account in case it changed
    const acc = findAccount(session.username);
    session.role = acc.role;
    currentTab = landingTab();
    await render();
  } else {
    clearSession();
    session = null;
    authMode = STATE.accounts.length === 0 ? 'welcome' : 'login';
    renderAuth();
  }
})();
