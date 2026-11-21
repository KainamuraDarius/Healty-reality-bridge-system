// Toast notifications.
// toast(message[, type]) — type: 'success' | 'error' | 'info'. When omitted, the type is
// inferred from the wording so existing call sites get sensible colours for free.
const TOAST_ERROR_WORDS = /\b(cannot|could not|couldn't|not |no |failed|fail|incorrect|invalid|declined|only \d|enter a|please|choose a|should be|do not match|does not)\b/i;

function toast(msg, type){
  const t = document.getElementById('toast');
  if(!t) return;
  const kind = type || (TOAST_ERROR_WORDS.test(msg) ? 'error' : 'success');
  const ic = kind === 'error' ? 'alert' : kind === 'info' ? 'info' : 'checkCircle';
  t.className = `toast toast-${kind}`;
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.innerHTML = `${icon(ic)}<span></span>`;
  t.querySelector('span').textContent = msg;
  // force reflow so the transition replays for back-to-back toasts
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove('show'), kind === 'error' ? 4200 : 2600);
}
