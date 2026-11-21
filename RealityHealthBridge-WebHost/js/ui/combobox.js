// Type-to-search picker ("combobox"): a text box that shows a short list of matching words as
// you type, e.g. "bli" -> Blisters, "bot" -> Bottles. Used for long lists such as packaging
// units, product forms, cadres and positions.
//
// Anything typed that is not in the list is still accepted (it becomes a new word), so no
// "Other (specify)" step is needed.
//
//   comboHtml({ id, name, groups, value, placeholder, aliases, required })
//     groups:  { 'Group label': ['Word', ...], ... }  or a plain array of words
//     aliases: { 'Word': ['other spelling', ...] }   extra words that also find it
//   wireCombos(root)   call after the HTML is on the page

function comboHtml({ id, name='', groups, value='', placeholder='Type to search…', aliases=null, required=false, extra=null }){
  const data = { groups: Array.isArray(groups) ? { '':groups } : groups, aliases: aliases || {}, extra: extra || [] };
  return `
  <div class="combo" data-combo>
    <div class="combo-field">
      ${icon('search')}
      <input type="text" id="${id}" ${name ? `name="${name}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}"
        role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}List" autocomplete="off"
        autocapitalize="sentences" spellcheck="false" ${required ? 'required' : ''}>
      <button type="button" class="combo-toggle" tabindex="-1" aria-label="Show the list">${icon('chevronDown')}</button>
    </div>
    <ul class="combo-list" id="${id}List" role="listbox" hidden></ul>
    <script type="application/json" class="combo-data">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>
  </div>`;
}

// How well `word` matches what was typed: 3 = starts with it, 2 = a word inside starts with it,
// 1 = contains it, 0 = no match. Aliases count the same as the word itself.
function comboScore(word, q, aliases){
  if(!q) return 1;
  let best = 0;
  [word, ...(aliases[word] || [])].forEach(w=>{
    const s = String(w).toLowerCase();
    const sc = s.startsWith(q) ? 3 : s.split(/[\s/(),.-]+/).some(p=>p.startsWith(q)) ? 2 : s.includes(q) ? 1 : 0;
    if(sc > best) best = sc;
  });
  return best;
}

function wireCombos(root=document){
  root.querySelectorAll('[data-combo]').forEach(box=>{
    if(box._wired) return;
    box._wired = true;
    const input = box.querySelector('input');
    const list = box.querySelector('.combo-list');
    const data = JSON.parse(box.querySelector('.combo-data').textContent);
    const all = [];
    Object.entries(data.groups).forEach(([g, words])=> words.forEach(w=> all.push({ w, g })));
    (data.extra || []).forEach(w=>{ if(!all.some(x=>x.w.toLowerCase()===w.toLowerCase())) all.push({ w, g:'Added by you' }); });
    let shown = [], active = -1;

    function render(){
      const q = input.value.trim().toLowerCase();
      const hits = all.map(x=>({ ...x, s:comboScore(x.w, q, data.aliases) })).filter(x=>x.s > 0);
      // Best matches first when searching; the normal grouped order when the box is empty.
      if(q) hits.sort((a,b)=> b.s - a.s || a.w.length - b.w.length);
      shown = hits.slice(0, q ? 12 : 400);
      const exact = all.some(x=>x.w.toLowerCase() === q);
      let html = '', lastGroup = null;
      shown.forEach((x,i)=>{
        if(!q && x.g !== lastGroup && x.g){ html += `<li class="combo-group" role="presentation">${esc(x.g)}</li>`; }
        lastGroup = x.g;
        html += `<li role="option" id="${input.id}Opt${i}" data-i="${i}" class="combo-opt${i===active?' active':''}" aria-selected="${i===active}"><span class="combo-label">${highlight(x.w, q)}</span>${q && x.g ? `<small>${esc(x.g)}</small>` : ''}</li>`;
      });
      if(q && !exact) html += `<li role="option" class="combo-opt combo-new${active===shown.length?' active':''}" data-i="${shown.length}" id="${input.id}Opt${shown.length}">${icon('plus')} Use “${esc(input.value.trim())}”</li>`;
      if(!html) html = `<li class="combo-empty" role="presentation">No matches</li>`;
      list.innerHTML = html;
      const act = list.querySelector('.combo-opt.active');
      input.setAttribute('aria-activedescendant', act ? act.id : '');
      if(act) act.scrollIntoView({ block:'nearest' });
    }
    function highlight(w, q){
      if(!q) return esc(w);
      const i = w.toLowerCase().indexOf(q);
      return i < 0 ? esc(w) : esc(w.slice(0,i)) + '<mark>' + esc(w.slice(i, i+q.length)) + '</mark>' + esc(w.slice(i+q.length));
    }
    function open(){ if(!list.hidden) return; list.hidden = false; input.setAttribute('aria-expanded','true'); box.classList.add('open'); active = -1; render(); }
    function close(){ list.hidden = true; input.setAttribute('aria-expanded','false'); box.classList.remove('open'); active = -1; }
    function choose(i){
      if(i >= 0 && i < shown.length) input.value = shown[i].w;
      else input.value = input.value.trim();
      close();
      input.dispatchEvent(new Event('change', { bubbles:true }));
      input.dispatchEvent(new Event('input', { bubbles:true }));
    }

    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', (e)=>{ if(!e.isTrusted) return; open(); active = input.value.trim() ? 0 : -1; render(); });
    input.addEventListener('keydown', (e)=>{
      const max = shown.length + (list.querySelector('.combo-new') ? 1 : 0) - 1;
      if(e.key === 'ArrowDown'){ e.preventDefault(); open(); active = Math.min(max, active + 1); render(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if(e.key === 'Enter' && !list.hidden && active >= 0){ e.preventDefault(); choose(active); }
      else if(e.key === 'Escape' && !list.hidden){ e.preventDefault(); e.stopPropagation(); close(); }
      else if(e.key === 'Tab') close();
    });
    // mousedown (not click) so the choice happens before the box loses focus
    list.addEventListener('mousedown', (e)=>{
      const li = e.target.closest('.combo-opt'); if(!li) return;
      e.preventDefault(); choose(Number(li.dataset.i));
    });
    box.querySelector('.combo-toggle').addEventListener('mousedown', (e)=>{
      e.preventDefault();
      if(list.hidden){ input.focus(); open(); } else close();
    });
    input.addEventListener('blur', ()=> setTimeout(()=>{ if(!box.contains(document.activeElement)) close(); }, 120));
  });
}
