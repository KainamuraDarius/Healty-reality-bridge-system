// Modal dialog helpers. One modal at a time; opening a new one replaces the current content.
// Accessible: role="dialog", Esc closes, focus moves into the dialog and returns afterwards,
// and the page behind stops scrolling.
let modalReturnFocus = null;

function openModal(html, opts = {}){
  const overlay = document.getElementById('modalOverlay');
  const box = document.getElementById('modalBox');
  if(!overlay.classList.contains('active')) modalReturnFocus = document.activeElement;
  box.className = 'modal-box' + (opts.wide ? ' wide' : '');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  // opts.locked: no close button, and Esc / clicking outside do nothing (user must use an action).
  overlay.dataset.locked = opts.locked ? '1' : '';
  box.innerHTML = (opts.locked ? '' : `<button type="button" class="modal-close-x" id="modalCloseX" aria-label="Close">${icon('x')}</button>`) + html;
  const heading = box.querySelector('h2');
  if(heading){ heading.id = 'modalTitle'; box.setAttribute('aria-labelledby', 'modalTitle'); }
  overlay.classList.add('active');
  document.body.classList.add('modal-open');
  const closeX = document.getElementById('modalCloseX');
  if(closeX) closeX.onclick = closeModal;
  box.scrollTop = 0;
  // Focus the first field (or the primary action) so keyboard users can act immediately.
  requestAnimationFrame(()=>{
    const target = box.querySelector('input:not([type=hidden]):not([disabled]), select, textarea')
      || box.querySelector('.modal-actions .btn:last-child') || box;
    if(target && target.focus) target.focus({ preventScroll: true });
  });
}
function closeModal(){
  const overlay = document.getElementById('modalOverlay');
  const wasOpen = overlay.classList.contains('active');
  overlay.classList.remove('active','sheet');
  overlay.dataset.locked = '';
  document.getElementById('modalBox').innerHTML = '';
  document.body.classList.remove('modal-open');
  if(wasOpen && modalReturnFocus && document.contains(modalReturnFocus)){
    try{ modalReturnFocus.focus({ preventScroll: true }); }catch(e){}
  }
  modalReturnFocus = null;
  if(wasOpen && typeof onModalClosed === 'function') onModalClosed(); // lets the sync show data that arrived meanwhile
}
document.getElementById('modalOverlay').addEventListener('click', (e)=>{ if(e.target.id==='modalOverlay' && !e.target.dataset.locked) closeModal(); });
document.addEventListener('keydown', (e)=>{
  const ov = document.getElementById('modalOverlay');
  if(e.key === 'Escape' && ov.classList.contains('active') && !ov.dataset.locked){
    const x = document.getElementById('modalCloseX');
    if(x) x.click(); else closeModal();
  }
});

function confirmDialog(title, message, onConfirm, confirmLabel='Confirm', danger=true){
  openModal(`
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="modal-actions">
      <button class="btn secondary" type="button" id="confirmCancelBtn">Cancel</button>
      <button class="btn ${danger?'danger':''}" type="button" id="confirmOkBtn">${confirmLabel}</button>
    </div>
  `);
  document.getElementById('confirmCancelBtn').onclick = closeModal;
  document.getElementById('confirmOkBtn').onclick = async ()=>{ closeModal(); await onConfirm(); };
}
