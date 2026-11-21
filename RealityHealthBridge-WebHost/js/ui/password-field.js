// Password field with show/hide toggle.
// pwField() returns a <div class="field"> block; pass a unique id. Call wirePasswordToggles()
// after inserting the HTML into the DOM so the eye buttons work.
function pwField(label, id, opts={}){
  const attrs = [
    `type="password"`, `id="${id}"`,
    opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : '',
    opts.required ? 'required' : '',
    opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : '',
    opts.value ? `value="${esc(opts.value)}"` : ''
  ].filter(Boolean).join(' ');
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="pw-wrap">
        <input ${attrs}>
        <button type="button" class="pw-eye" data-pw-toggle="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}${icon('eyeOff')}</button>
      </div>
      ${opts.hint ? `<div class="field-hint">${opts.hint}</div>` : ''}
    </div>
  `;
}
function wirePasswordToggles(root=document){
  root.querySelectorAll('[data-pw-toggle]').forEach(btn=>{
    btn.onclick = ()=>{
      const input = document.getElementById(btn.getAttribute('data-pw-toggle'));
      if(!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.classList.toggle('revealed', show);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
    };
  });
}
