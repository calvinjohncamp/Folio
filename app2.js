
const STORE = 'folio_v5_r2';
const PAGE_H = 941;   // A4(1123) - top-pad(72) - footer(110)
const RULER_W = 650;  // A4w(794) - 2*margin(72)

const ruler   = document.getElementById('ruler');
const pagesEl = document.getElementById('pages');
const dtEl    = document.getElementById('dtitle');

let curFont = "'Helvetica Neue',Helvetica,Arial,sans-serif";
let curSize = '12';
let curLH   = '1.25';
let saveFmt = 'folio';
let activePage = 0;
let rendering  = false;

// ── Sync ruler font ──────────────────────────────────────────────
function syncRuler(){
  ruler.style.fontFamily = curFont;
  ruler.style.fontSize   = curSize + 'pt';
  ruler.style.lineHeight = curLH;
}

// ── Collect all page content ─────────────────────────────────────
function collect(){
  return Array.from(pagesEl.querySelectorAll('.pg-ed'))
    .map(e => e.innerHTML).join('');
}

// ── Paginate HTML into chunks ────────────────────────────────────
function paginate(html){
  syncRuler();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const nodes = Array.from(tmp.childNodes);
  if(!nodes.length) return [''];
  const chunks = [];
  let bucket = [];
  function bucketH(){
    ruler.innerHTML = '';
    bucket.forEach(n => ruler.appendChild(n.cloneNode(true)));
    const h = ruler.scrollHeight;
    ruler.innerHTML = '';
    return h;
  }
  for(const node of nodes){
    bucket.push(node.cloneNode(true));
    if(bucketH() > PAGE_H && bucket.length > 1){
      const overflow = bucket.pop();
      chunks.push(bucket.map(n => n.outerHTML || n.textContent || '').join(''));
      bucket = [overflow];
    }
  }
  if(bucket.length)
    chunks.push(bucket.map(n => n.outerHTML || n.textContent || '').join(''));
  ruler.innerHTML = '';
  return chunks.length ? chunks : [''];
}

// ── Save / restore cursor ────────────────────────────────────────
function getNodePath(root, node){
  const path = [];
  while(node && node !== root){
    const parent = node.parentNode;
    if(!parent) return null;
    path.unshift(Array.from(parent.childNodes).indexOf(node));
    node = parent;
  }
  return path;
}

function nodeFromPath(root, path){
  let node = root;
  for(const idx of path){
    if(!node.childNodes[idx]) return null;
    node = node.childNodes[idx];
  }
  return node;
}

function saveCursor(){
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const eds = pagesEl.querySelectorAll('.pg-ed');
  for(let i = 0; i < eds.length; i++){
    if(eds[i].contains(range.startContainer) || eds[i] === range.startContainer){
      const path = getNodePath(eds[i], range.startContainer);
      return { page: i, path: path, offset: range.startOffset };
    }
  }
  return null;
}

function restoreCursor(saved){
  if(!saved) return;
  const eds = pagesEl.querySelectorAll('.pg-ed');
  const ed  = eds[saved.page];
  if(!ed) return;
  try {
    const r = document.createRange();
    const node = saved.path ? nodeFromPath(ed, saved.path) : null;
    if(node){
      r.setStart(node, Math.min(saved.offset, node.length !== undefined ? node.length : node.childNodes.length));
    } else {
      r.selectNodeContents(ed);
      r.collapse(false);
    }
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.focus();
  } catch(e) {
    ed.focus();
    const r = document.createRange();
    r.selectNodeContents(ed);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
}


// ── Full reflow after every edit ─────────────────────────────────
function checkOverflow(){
  if(rendering) return;
  rendering = true;
  const cur = saveCursor();
  const allHTML = Array.from(pagesEl.querySelectorAll('.pg-ed')).map(e => e.innerHTML).join('');
  const chunks  = paginate(allHTML || '');
  const n       = chunks.length;
  while(pagesEl.children.length < n) pagesEl.appendChild(buildPage(pagesEl.children.length));
  while(pagesEl.children.length > n) pagesEl.removeChild(pagesEl.lastChild);
  pagesEl.querySelectorAll('.pg').forEach((pg, i) => {
    const ed = pg.querySelector('.pg-ed');
    const h  = chunks[i] || '';
    if(ed.innerHTML !== h) ed.innerHTML = h;
    ed.style.fontFamily = curFont;
    ed.style.fontSize   = curSize + 'pt';
    ed.style.lineHeight = curLH;
    const fn = pg.querySelector('.pg-fname');
    if(fn) fn.textContent = dtEl.value || 'Unbenanntes Dokument';
    const pn = pg.querySelector('.pg-num');
    if(pn) pn.textContent = i + 1;
  });
  document.getElementById('pgc').textContent = n;
  restoreCursor(cur);
  stats();
  rendering = false;
}

// ── Render chunks into pages ─────────────────────────────────────
function render(rawHTML, presavedCursor){
  rendering = true;
  const cur    = presavedCursor !== undefined ? presavedCursor : saveCursor();
  const chunks = paginate(rawHTML || '');
  const n      = chunks.length;
  document.getElementById('pgc').textContent = n;

  while(pagesEl.children.length < n) pagesEl.appendChild(buildPage(pagesEl.children.length));
  while(pagesEl.children.length > n) pagesEl.removeChild(pagesEl.lastChild);

  pagesEl.querySelectorAll('.pg').forEach((pg, i) => {
    const ed = pg.querySelector('.pg-ed');
    const newHTML = chunks[i] || '';
    if(ed.innerHTML !== newHTML) ed.innerHTML = newHTML;
    // Sync font
    ed.style.fontFamily = curFont;
    ed.style.fontSize   = curSize + 'pt';
    ed.style.lineHeight = curLH;
    // Sync footer
    const fn = pg.querySelector('.pg-fname');
    if(fn) fn.textContent = dtEl.value || 'Unbenanntes Dokument';
    const pn = pg.querySelector('.pg-num');
    if(pn) pn.textContent = i + 1;
  });

  restoreCursor(cur);
  stats();
  rendering = false;
}

// ── Build a single page element ───────────────────────────────────
function buildPage(idx){
  const pg   = document.createElement('div');
  pg.className = 'pg';

  const body = document.createElement('div');
  body.className = 'pg-body';

  const ed = document.createElement('div');
  ed.className     = 'pg-ed';
  ed.contentEditable = 'true';
  ed.spellcheck    = true;
  ed.style.fontFamily = curFont;
  ed.style.fontSize   = curSize + 'pt';
  ed.style.lineHeight = curLH;

  ed.addEventListener('focus', () => {
    activePage = Array.from(pagesEl.querySelectorAll('.pg-ed')).indexOf(ed);
    syncTb();
  });
  ed.addEventListener('keydown', e => { window._lastKey = e.key; }, true);
  ed.addEventListener('keyup',   syncTb);
  ed.addEventListener('mouseup', syncTb);
  ed.addEventListener('input', () => {
    if(rendering) return;
    autoSave(); stats();
    clearTimeout(ed._t);
    ed._t = setTimeout(checkOverflow, 300);
  });

  body.appendChild(ed);
  pg.appendChild(body);

  // Footer
  const ftr = document.createElement('div');
  ftr.className = 'pg-ftr';
  const fn = document.createElement('span'); fn.className = 'pg-fname';
  fn.textContent = dtEl.value || 'Unbenanntes Dokument';
  const pn = document.createElement('span'); pn.className = 'pg-num';
  pn.textContent = idx + 1;
  ftr.appendChild(fn); ftr.appendChild(pn);
  pg.appendChild(ftr);

  return pg;
}

// ── Global cross-page keyboard handler ───────────────────────────
document.addEventListener('keydown', e => {
  const ed = document.activeElement;
  if(!ed || !ed.classList.contains('pg-ed')) return;
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const r   = sel.getRangeAt(0);
  const eds = Array.from(pagesEl.querySelectorAll('.pg-ed'));
  const mi  = eds.indexOf(ed);
  if(mi < 0) return;
  if(e.key === 'Backspace' && sel.isCollapsed && mi > 0){
    const pre = document.createRange();
    pre.selectNodeContents(ed);
    pre.setEnd(r.startContainer, r.startOffset);
    if(pre.toString().length === 0){
      e.preventDefault(); e.stopPropagation();
      const prevEd = eds[mi - 1];
      const insertIdx = prevEd.childNodes.length;
      const frag = document.createDocumentFragment();
      while(ed.firstChild) frag.appendChild(ed.firstChild);
      prevEd.appendChild(frag);
      prevEd.focus(); activePage = mi - 1;
      const target = prevEd.childNodes[insertIdx];
      const cr = document.createRange();
      if(target){ cr.setStart(target, 0); }
      else { cr.selectNodeContents(prevEd); cr.collapse(false); }
      cr.collapse(true); sel.removeAllRanges(); sel.addRange(cr);
      setTimeout(checkOverflow, 50); return;
    }
  }
  if(e.key === 'ArrowDown' || e.key === 'ArrowRight'){
    const end = document.createRange();
    end.selectNodeContents(ed); end.collapse(false);
    if(r.compareBoundaryPoints(Range.START_TO_START, end) >= 0){
      const next = eds[mi + 1];
      if(next){ e.preventDefault(); next.focus();
        const nr = document.createRange(); nr.setStart(next, 0); nr.collapse(true);
        sel.removeAllRanges(); sel.addRange(nr); }
    }
  }
  if(e.key === 'ArrowUp' || e.key === 'ArrowLeft'){
    const start = document.createRange(); start.setStart(ed, 0); start.collapse(true);
    if(r.compareBoundaryPoints(Range.START_TO_START, start) <= 0){
      const prev = eds[mi - 1];
      if(prev){ e.preventDefault(); prev.focus();
        const pr = document.createRange(); pr.selectNodeContents(prev); pr.collapse(false);
        sel.removeAllRanges(); sel.addRange(pr); }
    }
  }
});

// ── Stats ────────────────────────────────────────────────────────
function stats(){
  const t = Array.from(pagesEl.querySelectorAll('.pg-ed')).map(e => e.innerText).join('');
  document.getElementById('wc').textContent = t.trim() ? t.trim().split(/\s+/).length : 0;
  document.getElementById('cc').textContent = t.replace(/\s/g, '').length;
}

function activeEd(){
  return pagesEl.querySelectorAll('.pg-ed')[activePage]
      || pagesEl.querySelector('.pg-ed');
}

// ── Formatting ────────────────────────────────────────────────────
function fmt(c){ activeEd().focus(); document.execCommand(c, false, null); syncTb(); }
function aln(d){
  activeEd().focus();
  document.execCommand({left:'justifyLeft',center:'justifyCenter',right:'justifyRight'}[d], false, null);
}
function lst(t){ activeEd().focus(); document.execCommand(t==='ul'?'insertUnorderedList':'insertOrderedList', false, null); setTimeout(()=>render(collect()),300); }
function syncTb(){
  document.getElementById('bb').classList.toggle('on', document.queryCommandState('bold'));
  document.getElementById('bi').classList.toggle('on', document.queryCommandState('italic'));
  document.getElementById('bu').classList.toggle('on', document.queryCommandState('underline'));
}
function setFont(v){
  curFont = v; syncRuler();
  pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.fontFamily = v);
  ruler.style.fontFamily = v;
  setTimeout(() => render(collect()), 150);
}
function setSize(v){
  curSize = v; syncRuler();
  const sel = window.getSelection();
  if(sel && !sel.isCollapsed && sel.rangeCount){
    // Wrap selection in a span with explicit font-size
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = v + 'pt';
    try {
      range.surroundContents(span);
    } catch(e) {
      // surroundContents fails if selection crosses block boundaries — extract+wrap instead
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    // Collapse selection to end of inserted span
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    // No selection: change whole-editor default
    pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.fontSize = v + 'pt');
  }
  syncRuler();
  setTimeout(() => render(collect()), 150);
}
function setLineH(v){
  curLH = v; syncRuler();
  pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.lineHeight = v);
  setTimeout(() => render(collect()), 150);
}

document.addEventListener('keydown', e => {
  if((e.metaKey || e.ctrlKey) && e.key === 's'){ e.preventDefault(); e.shiftKey ? openSaveAs() : doSave(); }
});

// ── Table ─────────────────────────────────────────────────────────
function showTM(){ document.getElementById('tm').classList.add('open'); }
function cmo(id){ document.getElementById(id).classList.remove('open'); }
function insT(){
  const r = +document.getElementById('tr2').value || 3;
  const c = +document.getElementById('tc2').value || 3;
  let h = '<table><thead><tr>';
  for(let i=0;i<c;i++) h += `<th>Spalte ${i+1}</th>`;
  h += '</tr></thead><tbody>';
  for(let i=0;i<r-1;i++){ h+='<tr>'; for(let j=0;j<c;j++) h+='<td>&nbsp;</td>'; h+='</tr>'; }
  h += '</tbody></table>';
  activeEd().focus(); document.execCommand('insertHTML', false, h);
  cmo('tm'); setTimeout(() => render(collect()), 300);
}

// ── New document ──────────────────────────────────────────────────
// ── Multi-document management ────────────────────────────────────
let currentDocId = null;

function allDocs(){
  const keys = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('folio_doc_')) keys.push(k);
  }
  return keys.map(k => { try{ return {key:k, ...JSON.parse(localStorage.getItem(k))}; }catch(e){ return null; } })
    .filter(Boolean)
    .sort((a,b) => (b.savedAt||'').localeCompare(a.savedAt||''));
}

function saveCurrentDoc(){
  if(!currentDocId) currentDocId = 'folio_doc_' + Date.now();
  const state = getState();
  localStorage.setItem(currentDocId, JSON.stringify(state));
  localStorage.setItem(STORE, JSON.stringify({lastDocId: currentDocId}));
  renderSidebar();
}


function getTodayDE(){
  const d = new Date();
  return d.getDate().toString().padStart(2,'0') + '.' +
    (d.getMonth()+1).toString().padStart(2,'0') + '.' + d.getFullYear();
}

const TEMPLATES = [
  {
    id: 'brief',
    name: 'Brief JK',
    title: 'Brief',
    html: () => {
      const today = getTodayDE();
      return `<div style="font-family:'Helvetica Neue',Helvetica,sans-serif;font-size:12pt;line-height:1.6;color:#000">

<div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-bottom:0;margin-top:77px;box-sizing:border-box">
  <img src="image1.jpg" style="height:58px;width:auto;display:block;margin-left:-3px" />
  <img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" />
</div>

<div style="height:33px"></div>

<div style="font-size:12pt;line-height:1.5">[Empfänger]</div>
<div style="font-size:12pt;line-height:1.5">[Straße]</div>
<div style="font-size:12pt;line-height:1.5">[PLZ Ort]</div>

<div style="height:70px"></div>

<div style="display:flex;align-items:baseline;margin-bottom:8px;font-size:12pt;line-height:1.5"><span class="betreff-line" style="flex:1">[Betreff]</span><span style="width:33%;text-align:left;flex-shrink:0;padding-left:3px">${today}</span></div>

<div><br></div>
<div><br></div>

<div style="font-size:12pt;line-height:1.25">Sehr geehrte Damen und Herren,</div>

<div><br></div>

<div style="font-size:12pt;line-height:1.25">[Text]</div>

<div><br></div>

<div style="font-size:12pt;line-height:1.25">Freundliche Grüße</div>

<div><br></div>
<div style="font-size:12pt;line-height:1.25">Jörn Kämper</div>

</div>`;

    }
  }
];

function newFromTemplate(tpl){
  const hasContent = collect().replace(/<[^>]*>/g,'').trim().length > 0;
  const hasTitle = dtEl.value.trim();
  if(hasContent || hasTitle) saveCurrentDoc();
  else localStorage.removeItem(currentDocId);

  // Remove all previously saved docs with this template title
  for(const k of Object.keys(localStorage)){
    if(!k.startsWith('folio_doc_')) continue;
    try{
      const d = JSON.parse(localStorage.getItem(k));
      if(d && d.title === tpl.title) localStorage.removeItem(k);
    }catch(e){}
  }

  currentDocId = 'folio_doc_' + Date.now();
  pagesEl.innerHTML = '';
  pagesEl.appendChild(buildPage(0));
  const ed = activeEd();
  ed.innerHTML = tpl.html();
  dtEl.value = tpl.title;
  document.getElementById('fsz').value = '12'; curSize = '12';
  if(currentDocId){
    const s = JSON.parse(localStorage.getItem(currentDocId)||'{}');
    s.title = tpl.title;
    localStorage.setItem(currentDocId, JSON.stringify(s));
  }
  setTimeout(() => render(collect()), 200);
  renderSidebar();
  showSaved('Vorlage geladen');
}

function renderSidebar(){
  const docs = allDocs();
  const side = document.getElementById('side');
  side.innerHTML = '<div class="slbl">Dokumente</div>';
  docs.forEach(doc => {
    const d = document.createElement('div');
    d.className = 'sdoc' + (doc.key === currentDocId ? ' on' : '');
    d.innerHTML = '<span style="opacity:.5;margin-right:6px">&#128196;</span>'
      + '<span>' + (doc.title||'Unbenannt').slice(0,22) + '</span>';
    d.onclick = () => switchDoc(doc.key);
    side.appendChild(d);
  });
  const btn = document.createElement('button');
  btn.className = 'snew';
  btn.textContent = '+ Neues Dokument';
  btn.onclick = newDoc;
  side.appendChild(btn);

  // Templates section
  const tlbl = document.createElement('div');
  tlbl.className = 'slbl';
  tlbl.style.marginTop = '16px';
  tlbl.textContent = 'Vorlagen';
  side.appendChild(tlbl);
  TEMPLATES.forEach(tpl => {
    const d = document.createElement('div');
    d.className = 'sdoc';
    d.innerHTML = '<span style="opacity:.5;margin-right:6px">&#128203;</span>'
      + '<span>' + tpl.name + '</span>';
    d.onclick = () => newFromTemplate(tpl);
    side.appendChild(d);
  });
}

function switchDoc(key){
  // Save current first
  saveCurrentDoc();
  // Load selected
  try{
    const s = JSON.parse(localStorage.getItem(key));
    currentDocId = key;
    if(s.font){ curFont=s.font; document.getElementById('fnt').value=s.font; }
    if(s.size){ curSize=s.size; document.getElementById('fsz').value=s.size; }
    if(s.lh)  { curLH=s.lh;   document.getElementById('flh').value=s.lh; }
    if(s.title){ dtEl.value=s.title; }
    syncRuler();
    activePage=0;
    pagesEl.innerHTML='';
    pagesEl.appendChild(buildPage(0));
    pagesEl.querySelector('.pg-body').classList.add('pg-body--normal');
    render(s.content||'');
    renderSidebar();
  } catch(e){}
}

function newDoc(){
  // Only save current if it has content or a real title
  const hasContent = collect().replace(/<[^>]*>/g,'').trim().length > 0;
  const hasTitle = dtEl.value.trim();
  if(hasContent || hasTitle) saveCurrentDoc();
  currentDocId = 'folio_doc_' + Date.now();
  activePage = 0;
  dtEl.value = '';
  curFont = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  curSize = '12'; curLH = '1.25';
  document.getElementById('fnt').value = curFont;
  document.getElementById('fsz').value = curSize;
  document.getElementById('flh').value = curLH;
  syncRuler();
  pagesEl.innerHTML = '';
  pagesEl.appendChild(buildPage(0));
  pagesEl.querySelector('.pg-body').classList.add('pg-body--normal');
  activeEd().focus();
  stats();
  document.getElementById('pgc').textContent = 1;
  renderSidebar();
}

// ── Save / Load ───────────────────────────────────────────────────
function getState(){
  return { title:dtEl.value, content:collect(), font:curFont, size:curSize, lh:curLH, savedAt:new Date().toISOString() };
}
function showSaved(msg){
  const el = document.getElementById('saved');
  el.textContent = '✓ ' + msg; el.classList.add('ok');
  clearTimeout(window._st);
  window._st = setTimeout(() => { el.textContent = 'Folio 1.0'; el.classList.remove('ok'); }, 2200);
}
function autoSave(){
  try{ saveCurrentDoc(); showSaved('Autosave'); } catch(e){}
}
function doSave(){
  dl(new Blob([JSON.stringify(getState(), null, 2)], {type:'application/json'}), san(dtEl.value) + '.folio');
  showSaved('Gespeichert');
}
function openSaveAs(){
  document.getElementById('saname').value = dtEl.value || 'Dokument';
  sf('folio');
  document.getElementById('sam').classList.add('open');
}
function sf(f){
  saveFmt = f;
  ['folio','html','txt','pdf'].forEach(x => document.getElementById('f'+x[0]).classList.toggle('sf', x===f));
}
function doSaveAs(){
  const name = (document.getElementById('saname').value || dtEl.value || 'Dokument').trim();
  dtEl.value = name;
  if(saveFmt === 'folio')     dl(new Blob([JSON.stringify(getState(),null,2)],{type:'application/json'}), san(name)+'.folio');
  else if(saveFmt === 'html') dl(new Blob([buildHTML(name)],{type:'text/html'}), san(name)+'.html');
  else if(saveFmt === 'txt')  dl(new Blob([Array.from(pagesEl.querySelectorAll('.pg-ed')).map(e=>e.innerText).join('\n\n')],{type:'text/plain'}), san(name)+'.txt');
  else if(saveFmt === 'pdf')  { cmo('sam'); doPDF(); return; }
  cmo('sam'); showSaved('Gespeichert');
}
function san(s){ return (s||'Dokument').replace(/[^\w\s\-äöüÄÖÜß]/g,'').trim() || 'Dokument'; }
function dl(blob, name){
  const reader = new FileReader();
  reader.onload = function(){
    const a = document.createElement('a');
    a.href = reader.result; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  reader.readAsDataURL(blob);
}
function buildHTML(title){
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>`
    +`<style>body{font-family:${curFont};font-size:${curSize}pt;line-height:${curLH};color:#1a1814;margin:2cm}`
    +`div,p{margin:0}h1{font-size:24px}h2{font-size:18px}`
    +`ul,ol{margin:0 0 0 20px}table{border-collapse:collapse;width:100%}`
    +`td,th{border:1px solid #e0dbd0;padding:4px 8px}</style></head><body>${collect()}<div id="rename-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
  <div style="background:#faf9f6;border-radius:12px;padding:24px;width:80%;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.3)">
    <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#8a8478;margin-bottom:8px">Dokumentname</div>
    <input id="rename-input" type="text" spellcheck="false"
      style="width:100%;box-sizing:border-box;border:1px solid #e0dbd0;border-radius:6px;padding:10px 12px;font-size:15px;font-family:'DM Sans',sans-serif;color:#1a1814;outline:none;margin-bottom:16px">
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button onclick="closeRename()" style="background:transparent;border:1px solid #e0dbd0;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;color:#8a8478">Abbrechen</button>
      <button onclick="confirmRename()" style="background:#c8441a;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold">OK</button>
    </div>
  </div>
</div>
<div id="clear-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center">
  <div style="background:#faf9f6;border-radius:12px;padding:24px;width:80%;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,.3)">
    <div style="font-family:'DM Sans',sans-serif;font-size:14px;color:#1a1814;margin-bottom:16px">Gesamten Inhalt löschen?</div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button onclick="clearAllCancel()" style="background:transparent;border:1px solid #e0dbd0;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;color:#8a8478">Abbrechen</button>
      <button onclick="clearAllConfirm()" style="background:#c8441a;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;color:#fff;font-weight:bold">Löschen</button>
    </div>
  </div>
</div>
</body></html>`;
}
function doPDF(){ window.print(); }

// ── Open file (.folio / .txt / .docx / .doc) ─────────────────────
function openFile(){ document.getElementById('fileInput').click(); }
function loadFile(input){
  const file = input.files[0];
  if(!file){ return; }
  const name = file.name || '';
  const ext  = name.split('.').pop().toLowerCase();

  if(ext === 'folio'){
    // ── .folio JSON ──
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const s = JSON.parse(e.target.result);
        if(s.title){ dtEl.value = s.title; currentDocId = currentDocId || 'folio_doc_' + Date.now(); }
        if(s.font){ curFont = s.font; document.getElementById('fnt').value = s.font; }
        if(s.size){ curSize = s.size; document.getElementById('fsz').value = s.size; }
        if(s.lh)  { curLH   = s.lh;  document.getElementById('flh').value = s.lh; }
        syncRuler();
        pagesEl.innerHTML = '';
        pagesEl.appendChild(buildPage(0));
        render(s.content || '');
        saveCurrentDoc(); renderSidebar(); showSaved('Geladen');
      } catch(err){ alert('Fehler beim Laden: ' + err.message); }
      input.value = '';
    };
    reader.readAsText(file);

  } else if(ext === 'txt'){
    // ── .txt plain text ──
    const reader = new FileReader();
    reader.onload = function(e){
      const text = e.target.result || '';
      // Convert line breaks to divs
      const html = text.split(/\r?\n/).map(line =>
        `<div>${line.trim() ? line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<br>'}</div>`
      ).join('');
      dtEl.value = name.replace(/\.[^.]+$/, '');
      currentDocId = 'folio_doc_' + Date.now();
      pagesEl.innerHTML = '';
      pagesEl.appendChild(buildPage(0));
      render(html);
      saveCurrentDoc(); renderSidebar(); showSaved('Geladen');
      input.value = '';
    };
    reader.readAsText(file);

  } else if(ext === 'docx' || ext === 'doc'){
    // ── .docx / .doc via mammoth.js ──
    if(typeof mammoth === 'undefined'){
      alert('Word-Import wird geladen, bitte kurz warten und nochmal versuchen.');
      input.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = async function(e){
      const arrayBuf = e.target.result;

      // Step 1: Read word/document.xml directly from the docx zip
      // to build a reliable empty/non-empty paragraph map
      let paraMap = null; // null = fallback to html-only
      try {
        // docx is a zip — find word/document.xml by scanning for its local file header
        const bytes = new Uint8Array(arrayBuf);
        const target = 'word/document.xml';
        // Find the target filename in the zip local file headers
        const enc = new TextEncoder();
        const targetBytes = enc.encode(target);
        let xmlStart = -1;
        for(let i = 0; i < bytes.length - targetBytes.length - 30; i++){
          if(bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04){
            const fnLen = bytes[i+26] | (bytes[i+27] << 8);
            const extraLen = bytes[i+28] | (bytes[i+29] << 8);
            const fnBytes = bytes.slice(i+30, i+30+fnLen);
            const fn = new TextDecoder().decode(fnBytes);
            if(fn === target){
              xmlStart = i + 30 + fnLen + extraLen;
              break;
            }
          }
        }
        if(xmlStart > 0){
          // The content may be deflate-compressed — use DecompressionStream if available
          const compMethod = bytes[8] | (bytes[9] << 8); // at offset from local header start
          // Re-find compression method
          for(let i = 0; i < bytes.length - 30; i++){
            if(bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04){
              const fnLen = bytes[i+26] | (bytes[i+27] << 8);
              const extraLen = bytes[i+28] | (bytes[i+29] << 8);
              const fn = new TextDecoder().decode(bytes.slice(i+30, i+30+fnLen));
              if(fn === target){
                const comp = bytes[i+8] | (bytes[i+9] << 8);
                const compSize = bytes[i+18] | (bytes[i+19] << 8) | (bytes[i+20] << 16) | (bytes[i+21] << 24);
                const dataStart = i + 30 + fnLen + extraLen;
                const compData = bytes.slice(dataStart, dataStart + compSize);
                let xmlText = '';
                if(comp === 0){
                  xmlText = new TextDecoder().decode(compData);
                } else if(comp === 8 && typeof DecompressionStream !== 'undefined'){
                  const ds = new DecompressionStream('deflate-raw');
                  const writer = ds.writable.getWriter();
                  writer.write(compData); writer.close();
                  const chunks = [];
                  const reader2 = ds.readable.getReader();
                  while(true){ const {done, value} = await reader2.read(); if(done) break; chunks.push(value); }
                  const total = chunks.reduce((a,c) => a+c.length, 0);
                  const merged = new Uint8Array(total);
                  let off = 0; chunks.forEach(c => { merged.set(c, off); off += c.length; });
                  xmlText = new TextDecoder().decode(merged);
                }
                if(xmlText){
                  // Parse paragraphs: each <w:p...> is a paragraph, empty if no <w:t> inside
                  const pMatches = xmlText.match(/<w:p[ >].*?<\/w:p>|<w:p\/>/g) || [];
                  paraMap = pMatches.map(p => /<w:t[ >]/.test(p));
                }
                break;
              }
            }
          }
        }
      } catch(xmlErr){ paraMap = null; }

      mammoth.convertToHtml({ arrayBuffer: arrayBuf })
        .then(function(result){
          const tmp = document.createElement('div');
          tmp.innerHTML = result.value;
          tmp.querySelectorAll('strong').forEach(el => { const b = document.createElement('b'); b.innerHTML = el.innerHTML; el.replaceWith(b); });
          tmp.querySelectorAll('em').forEach(el => { const i = document.createElement('i'); i.innerHTML = el.innerHTML; el.replaceWith(i); });

          const htmlParas = [];
          tmp.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach(el => {
            htmlParas.push(el.innerHTML.trim());
          });

          let html;
          if(paraMap){
            // Use XML-based paragraph map for reliable empty line detection
            const divs = [];
            let hi = 0;
            for(let i = 0; i < paraMap.length; i++){
              if(paraMap[i]){
                // Non-empty paragraph
                const content = hi < htmlParas.length ? htmlParas[hi++] : '';
                divs.push(content ? `<div>${content}</div>` : '<div><br></div>');
              } else {
                divs.push('<div><br></div>');
              }
            }
            html = divs.join('');
          } else {
            // Fallback: just use html paragraphs without empty line detection
            html = htmlParas.map(p => p ? `<div>${p}</div>` : '<div><br></div>').join('');
          }

          dtEl.value = name.replace(/\.[^.]+$/, '');
          currentDocId = 'folio_doc_' + Date.now();
          pagesEl.innerHTML = '';
          pagesEl.appendChild(buildPage(0));
          render(html || '<div><br></div>');
          saveCurrentDoc(); renderSidebar(); showSaved('Geladen');
        })
        .catch(function(err){ alert('Word-Fehler: ' + err.message); });
      input.value = '';
    };
    reader.readAsArrayBuffer(file);

  } else {
    alert('Nicht unterstütztes Format. Bitte .folio, .txt oder .docx verwenden.');
    input.value = '';
  }
}

// ── Title sync ────────────────────────────────────────────────────
dtEl.addEventListener('input', () => {
  const n = dtEl.value || 'Unbenanntes Dokument';
  // Update footer on all pages immediately
  pagesEl.querySelectorAll('.pg-fname').forEach(e => e.textContent = n);
  // Save current doc title to localStorage immediately so sidebar reflects it
  if(currentDocId){
    try{
      const s = JSON.parse(localStorage.getItem(currentDocId) || '{}');
      s.title = n;
      localStorage.setItem(currentDocId, JSON.stringify(s));
    } catch(e){}
  }
  renderSidebar();
  autoSave();
});

// ── Init ──────────────────────────────────────────────────────────
function init(){
  // Always start fresh - clear all saved docs
  Object.keys(localStorage).forEach(k => {
    if(k.startsWith('folio_doc_') || k === STORE) localStorage.removeItem(k);
  });
  currentDocId = 'folio_doc_' + Date.now();
  pagesEl.appendChild(buildPage(0));
  pagesEl.querySelector('.pg-body').classList.add('pg-body--normal');
  activeEd().focus();
  renderSidebar();
}

// ── Clipboard functions ───────────────────────────────────────────
function openRename(){
  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('rename-input');
  input.value = dtEl.value || 'Unbenanntes Dokument';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 100);
}
function closeRename(){
  document.getElementById('rename-modal').style.display = 'none';
}
function confirmRename(){
  const val = document.getElementById('rename-input').value.trim() || 'Unbenanntes Dokument';
  dtEl.value = val;
  dtEl.dispatchEvent(new Event('input'));
  closeRename();
}
function clearAll(){
  const modal = document.getElementById('clear-modal');
  if(modal) modal.style.display = 'flex';
}
function clearAllConfirm(){
  document.getElementById('clear-modal').style.display = 'none';
  // Collect all content into first page so browser undo stack captures it
  const eds = Array.from(pagesEl.querySelectorAll('.pg-ed'));
  if(eds.length > 1){
    for(let i = 1; i < eds.length; i++){
      while(eds[i].firstChild) eds[0].appendChild(eds[i].firstChild);
    }
    while(pagesEl.children.length > 1) pagesEl.removeChild(pagesEl.lastChild);
  }
  const ed = pagesEl.querySelector('.pg-ed');
  ed.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  curFont = 'Helvetica Neue'; curSize = '12'; curLH = '1.25';
  document.getElementById('ff').value  = 'Helvetica Neue';
  document.getElementById('fsz').value = '12';
  document.getElementById('flh').value = '1.25';
  syncRuler();
  saveCurrentDoc();
  showSaved('Geleert');
}
function clearAllCancel(){
  document.getElementById('clear-modal').style.display = 'none';
}

function selectAll(){
  // Concatenate all page content into first page temporarily,
  // select all, then restore — instead: just visually select all text in all editors
  const eds = Array.from(pagesEl.querySelectorAll('.pg-ed'));
  if(!eds.length) return;
  const first = eds[0];
  const last = eds[eds.length - 1];
  first.focus();
  const range = document.createRange();
  range.setStart(first, 0);
  // Set end to last node of last page
  if(last.lastChild){
    try{
      range.setEnd(last.lastChild, last.lastChild.nodeType === 3 ? last.lastChild.length : last.lastChild.childNodes.length);
    } catch(e){
      range.setEnd(last, last.childNodes.length);
    }
  } else {
    range.setEnd(last, 0);
  }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function copyAll(){
  // Extract plain text: each <div> = one line, <div><br></div> = empty line
  function edToText(ed){
    const lines = [];
    ed.childNodes.forEach(node => {
      if(node.nodeType === 3){
        // bare text node
        lines.push(node.textContent);
      } else if(node.nodeType === 1){
        const tag = node.tagName.toLowerCase();
        if(tag === 'br'){ lines.push(''); return; }
        // Check if this is an empty block <div><br></div>
        const isEmptyBlock = node.childNodes.length === 1
          && node.firstChild.nodeType === 1
          && node.firstChild.tagName.toLowerCase() === 'br';
        if(isEmptyBlock){ lines.push(''); return; }
        // Normal block: extract inner text
        lines.push(node.innerText || node.textContent || '');
      }
    });
    return lines.join('\n');
  }
  const NL = String.fromCharCode(10);
  const text = Array.from(pagesEl.querySelectorAll('.pg-ed'))
    .map(edToText).join(NL);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); showSaved('Alles kopiert'); }
  catch(e){ showSaved('Kopieren fehlgeschlagen'); }
  document.body.removeChild(ta);
}

function copySelection(){
  const sel = window.getSelection();
  if(!sel || sel.isCollapsed){ showSaved('Nichts markiert'); return; }
  navigator.clipboard.writeText(sel.toString())
    .then(()=>showSaved('Kopiert'))
    .catch(()=>{ document.execCommand('copy'); showSaved('Kopiert'); });
}
async function pasteClipboard(){
  const ed = activeEd();
  if(!ed) return;
  try{
    const text = await navigator.clipboard.readText();
    ed.focus();
    document.execCommand('insertText', false, text);
  } catch(e){ showSaved('Bitte Cmd+V verwenden'); }
}

// Intercept native paste - preserve bold/italic from Word, strip junk
document.addEventListener('paste', function(e){
  const ed = activeEd();
  if(!ed) return;
  e.preventDefault();

  const html = (e.clipboardData || window.clipboardData).getData('text/html');
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');

  if(html){
    // Strip Word junk: comments, styles, meta
    let h = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi, '')
      .replace(/<o:[^>]*\/>/gi, '')
      .replace(/<w:[^>]*>[\s\S]*?<\/w:[^>]*>/gi, '')
      .replace(/<m:[^>]*>[\s\S]*?<\/m:[^>]*>/gi, '');

    const tmp = document.createElement('div');
    tmp.innerHTML = h;

    // Walk DOM, extract lines preserving bold/italic/underline only
    const resultLines = [];
    let currentLine = [];

    function flushLine(){
      if(currentLine.length){
        const d = document.createElement('div');
        currentLine.forEach(n => d.appendChild(n));
        resultLines.push(d);
        currentLine = [];
      } else {
        resultLines.push(null); // empty line
      }
    }

    function walk(node, bold, italic, underline){
      if(node.nodeType === 3){
        const t = node.textContent;
        if(!t) return;
        let el = document.createTextNode(t);
        if(underline){ const u = document.createElement('u'); u.appendChild(el); el = u; }
        if(italic){ const i = document.createElement('i'); i.appendChild(el); el = i; }
        if(bold){ const b = document.createElement('b'); b.appendChild(el); el = b; }
        currentLine.push(el);
        return;
      }
      if(node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if(tag === 'br'){ flushLine(); return; }

      const st = node.style || {};
      const fw = st.fontWeight || '';
      const isBold = bold || tag==='b' || tag==='strong' || fw==='bold' || parseInt(fw)>=600;
      const isItalic = italic || tag==='i' || tag==='em' || st.fontStyle==='italic';
      const isUnder = underline || tag==='u' || (st.textDecoration&&st.textDecoration.includes('underline'));
      const isBlock = ['p','div','h1','h2','h3','h4','h5','li'].includes(tag);

      Array.from(node.childNodes).forEach(c => walk(c, isBold, isItalic, isUnder));
      if(isBlock) flushLine();
    }

    Array.from(tmp.childNodes).forEach(c => walk(c, false, false, false));
    if(currentLine.length) flushLine();

    // Build final HTML - null = empty line
    const finalHTML = resultLines.map(d => {
      if(!d) return '<div><br></div>';
      return d.innerHTML.trim() ? d.outerHTML : '<div><br></div>';
    }).join('');

    // Deduplicate: no more than 2 consecutive empty lines
    const cleaned = finalHTML.replace(/(<div><br><\/div>){3,}/g, '<div><br></div><div><br></div>');
    document.execCommand('insertHTML', false, cleaned);
  } else {
    // Fallback: plain text
    const lines = text.split('\n');
    const divs = lines.map(l => l.trim() ? '<div>'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' : '<div><br></div>').join('');
    document.execCommand('insertHTML', false, divs);
  }

  setTimeout(() => render(collect()), 100);
}, true);

init();

// ── PWA Service Worker ────────────────────────────────────────────
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

