const STORE = 'folio_v5_r2';
const RULER_W = 654;
const PAGE_H = 940;

const ruler   = document.getElementById('ruler');
const pagesEl = document.getElementById('pages');
const dtEl    = document.getElementById('dtitle');

let curFont = "'Helvetica Neue',Helvetica,Arial,sans-serif";
let curSize = '14';
let curLH   = '1.25';
let saveFmt = 'folio';
let activePage = 0;
let isA4Mode   = false;
let isNormalDoc = true;

// ── Sync ruler ───────────────────────────────────────────────────
function syncRuler(){
  ruler.style.fontFamily = curFont;
  ruler.style.fontSize   = curSize + 'pt';
  ruler.style.lineHeight = curLH;
}

// ── Collect content ──────────────────────────────────────────────
function collect(){
  const eds = pagesEl.querySelectorAll('.pg-ed');
  return Array.from(eds).map(e => e.innerHTML).join('');
}

// ── Paginate ─────────────────────────────────────────────────────
function paginate(html, firstPageH){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const nodes = Array.from(tmp.childNodes);
  if(!nodes.length) return [''];

  // Echte verfügbare Texthöhe dynamisch messen
  const measureWrap = document.createElement('div');
  measureWrap.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  const measurePage = buildA4PreviewPage(0, '<div>X</div>', isNormalDoc);
  measureWrap.appendChild(measurePage);
  document.body.appendChild(measureWrap);
  const measureBody = measurePage.querySelector('.pg-body');
  const measureStyle = window.getComputedStyle(measureBody);
  const realPageH = measureBody.clientHeight
    - (parseFloat(measureStyle.paddingTop) || 0)
    - (parseFloat(measureStyle.paddingBottom) || 0);
  document.body.removeChild(measureWrap);
  console.log('[v109] realPageH:', realPageH);

  const availH = firstPageH !== undefined ? Math.min(firstPageH, realPageH) : realPageH;

  const chunks = [];
  let bucket = [];
  let isFirstPage = true;

  function getBucketHTML(arr){
    return arr.map(n => n.outerHTML || n.textContent || '').join('');
  }

  function fitsOnPage(arr, pageH){
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    const page = buildA4PreviewPage(0, '', false);
    const body = page.querySelector('.pg-body');
    const ed = page.querySelector('.pg-ed');
    if(isNormalDoc){
      body.className = 'pg-body pg-body--normal';
    } else {
      body.className = isFirstPage ? 'pg-body pg-body--brief-p1' : 'pg-body pg-body--cont';
    }
    ed.innerHTML = getBucketHTML(arr);
    ed.style.fontFamily = curFont;
    ed.style.fontSize = '12pt';
    ed.style.lineHeight = curLH;
    ed.style.height = pageH + 'px';
    ed.style.overflow = 'hidden';
    wrap.appendChild(page);
    document.body.appendChild(wrap);
    const fits = ed.scrollHeight <= pageH + 1;
    document.body.removeChild(wrap);
    return fits;
  }

  for(const node of nodes){
    bucket.push(node.cloneNode(true));
    const currentH = isFirstPage ? availH : realPageH;
    if(!fitsOnPage(bucket, currentH) && bucket.length > 1){
      const overflow = bucket.pop();
      chunks.push(getBucketHTML(bucket));
      bucket = [overflow];
      isFirstPage = false;
    }
  }

  if(bucket.length) chunks.push(getBucketHTML(bucket));
  return chunks.length ? chunks : [''];
}

// ── Build endless editor ─────────────────────────────────────────
function buildEndlessPage(){
  const pg = document.createElement('div');
  pg.className = 'pg pg--endless';

  const body = document.createElement('div');
  body.className = 'pg-body' + (isNormalDoc ? ' pg-body--normal' : '');

  // Invisible gutter overlay on the left margin for line selection
  const gutter = document.createElement('div');
  gutter.className = 'pg-gutter';

  const ed = document.createElement('div');
  ed.className = 'pg-ed';
  ed.contentEditable = 'true';
  ed.spellcheck = true;
  ed.style.fontFamily = curFont;
  ed.style.fontSize   = curSize + 'pt';
  ed.style.lineHeight = curLH;

  ed.addEventListener('focus', () => { activePage = 0; syncTb(); });
  ed.addEventListener('keyup',   syncTb);
  ed.addEventListener('mouseup', syncTb);
  ed.addEventListener('input', () => { autoSave(); stats(); });

  body.appendChild(gutter);
  body.appendChild(ed);
  pg.appendChild(body);
  return pg;
}

// ── Build A4 preview page ────────────────────────────────────────
// noFooter: true → Fußzeile weglassen (nur für Brief-Rendering, NICHT für Paginierungs-Messung)
function buildA4PreviewPage(idx, html, briefPage1Fixed, noFooter){
  const pg = document.createElement('div');
  pg.className = 'pg pg--a4';

  if(!isNormalDoc){
    if(idx === 0 && !briefPage1Fixed){
      // Brief Seite 1 ohne Split: fester Header
      const hdr = document.createElement('div');
      hdr.className = 'pg-brief-hdr1';
      hdr.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:0;box-sizing:border-box">
          <img src="image1.jpg" style="height:64px;width:auto;display:block;margin-left:-3px" />
          <img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" />
        </div>`;
      pg.appendChild(hdr);
    } else if(idx > 0 || briefPage1Fixed){
      // Brief Seite 2+: zentriertes Logo
      if(idx > 0){
        const hdr = document.createElement('div');
        hdr.className = 'pg-brief-hdr2';
        const img = document.createElement('img');
        img.src = 'image1.jpg';
        img.alt = 'jörn kämper';
        hdr.appendChild(img);
        pg.appendChild(hdr);
      }
    }
  }

  const body = document.createElement('div');
  body.className = 'pg-body' +
    (isNormalDoc ? ' pg-body--normal' : '') +
    (!isNormalDoc && idx === 0 ? ' pg-body--brief-p1' : '') +
    (!isNormalDoc && idx > 0 ? ' pg-body--cont' : '');

  const ed = document.createElement('div');
  ed.className = 'pg-ed';
  ed.contentEditable = 'false';

  // For brief page 1: header is already stripped before paginating
  // Leerzeilen (<div><br></div>) bekommen explizite Mindesthöhe für den Druck
  const tmpEl = document.createElement('div');
  tmpEl.innerHTML = html;
  tmpEl.querySelectorAll('div').forEach(d => {
    if(d.children.length === 1 && d.children[0].tagName === 'BR' && !d.style.minHeight){
      d.style.minHeight = curLH + 'em';
    }
  });
  ed.innerHTML = tmpEl.innerHTML;

  ed.style.fontFamily = curFont;
  ed.style.fontSize   = '12pt';
  ed.style.lineHeight = curLH;

  body.appendChild(ed);
  pg.appendChild(body);

  // Footer: bei normalen Dokumenten immer; bei Briefen nur wenn noFooter nicht gesetzt
  if(isNormalDoc || !noFooter){
    const ftr = document.createElement('div');
    ftr.className = 'pg-ftr';
    const fn = document.createElement('span'); fn.className = 'pg-fname';
    fn.textContent = dtEl.value || 'Unbenanntes Dokument';
    const pn = document.createElement('span'); pn.className = 'pg-num';
    pn.textContent = idx + 1;
    ftr.appendChild(fn); ftr.appendChild(pn);
    pg.appendChild(ftr);
  }

  return pg;
}


// ── Measure available flow space on page 1 ───────────────────────
function measurePage1FlowSpace(fixedHTML){
  const tempWrap = document.createElement('div');
  tempWrap.style.position = 'absolute';
  tempWrap.style.left = '-9999px';
  tempWrap.style.top = '0';
  tempWrap.style.visibility = 'hidden';

  const pg = document.createElement('div');
  pg.className = 'pg pg--a4';

  const hdr = document.createElement('div');
  hdr.className = 'pg-brief-hdr1';
  hdr.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:0;box-sizing:border-box"><img src="image1.jpg" style="height:64px;width:auto;display:block;margin-left:-3px" /><img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" /></div>';

  const body = document.createElement('div');
  body.className = 'pg-body pg-body--brief-p1';

  const ed = document.createElement('div');
  ed.className = 'pg-ed';
  ed.style.height = 'auto';
  ed.style.overflow = 'visible';
  ed.style.fontFamily = curFont;
  ed.style.fontSize = '12pt';
  ed.style.lineHeight = curLH;
  ed.innerHTML = fixedHTML;

  body.appendChild(ed);
  pg.appendChild(hdr);
  pg.appendChild(body);
  // Footer bleibt im Mess-DOM damit die Höhe korrekt berechnet wird
  const ftrM = document.createElement('div');
  ftrM.className = 'pg-ftr';
  ftrM.innerHTML = '<span class="pg-fname">Brief</span><span class="pg-num">1</span>';
  pg.appendChild(ftrM);
  tempWrap.appendChild(pg);
  document.body.appendChild(tempWrap);

  const bodyH = body.clientHeight;
  const fixedH = ed.scrollHeight;

  document.body.removeChild(tempWrap);
  return Math.max(bodyH - fixedH, 40);
}

// ── Switch modes ─────────────────────────────────────────────────
let savedEndlessHTML = ''; // Content saved before A4 switch

function setA4Mode(on){
  isA4Mode = on;
  updateModeButtons();
  document.body.classList.toggle('a4-locked', on);

  if(on){
    // Save the endless content BEFORE switching
    const endlessEd = pagesEl.querySelector('.pg--endless .pg-ed');
    savedEndlessHTML = endlessEd ? endlessEd.innerHTML : '';
    console.log('savedEndlessHTML first 300:', savedEndlessHTML.slice(0,300));

    pagesEl.classList.add('a4-mode');
    pagesEl.innerHTML = '';

    // Normalize font-sizes to 12pt for A4 render
    const tmp = document.createElement('div');
    tmp.innerHTML = savedEndlessHTML;
    tmp.querySelectorAll('[style*="font-size"]').forEach(el => {
      el.style.fontSize = '12pt';
    });
    const normalizedHTML = tmp.innerHTML;

    // Set ruler to 12pt
    const savedSize = curSize;
    curSize = '12';
    syncRuler();

    if(!isNormalDoc){
      // ── Brief: Split-Strategie ──────────────────────────────────
      // 1. Header entfernen
      // 2. Alles bis inkl. "Sehr geehrte..." = fixer Teil (nie paginiert)
      // 3. Rest = Fließtext → paginate() mit voller PAGE_H
      const tmpStrip = document.createElement('div');
      tmpStrip.innerHTML = normalizedHTML;
      const briefHdr = tmpStrip.querySelector('[data-brief-header]');
      if(briefHdr) briefHdr.remove();

      // Alle direkten Kind-Nodes sammeln
      const allNodes = Array.from(tmpStrip.childNodes);

      // Split-Punkt finden: Node der "Sehr geehrte" enthält
      let splitIdx = -1;
      for(let i = 0; i < allNodes.length; i++){
        const txt = allNodes[i].textContent || '';
        if(txt.toLowerCase().includes('sehr geehrte') ||
           txt.toLowerCase().includes('liebe') ||
           txt.toLowerCase().includes('hallo')){
          splitIdx = i;
          break;
        }
      }

      // Kein Split-Punkt gefunden → alles als Fließtext behandeln
      if(splitIdx === -1) splitIdx = 0;

      // Überspringe alle leeren Nodes nach Split-Punkt
      // Fixer Teil: alles bis inkl. Split-Node + eine Leerzeile danach
      const fixedNodes = allNodes.slice(0, splitIdx + 1);
      const fixedHTML = fixedNodes.map(n => n.outerHTML || n.textContent || '').join('');

      // flowStart: Leerzeilen nach Anrede überspringen, aber genau eine behalten
      let flowStart = splitIdx + 1;
      while(flowStart < allNodes.length){
        const n = allNodes[flowStart];
        const inner = n.nodeType === 1 ? (n.innerHTML || '').trim() : '';
        const isEmpty = inner === '<br>' || inner === '' ||
                        (n.nodeType === 3 && !(n.textContent || '').trim());
        if(isEmpty) flowStart++;
        else break;
      }
      // Eine Leerzeile vor dem Fließtext einfügen
      const flowPrefix = '<div><br></div>';

      // Abschluss-Teil finden: Leerzeilen + "Freundliche Grüße" + Leerzeilen + "Jörn Kämper"
      let endIdx = allNodes.length;
      // Erst von hinten "Jörn Kämper" und "Freundliche Grüße" + umgebende Leerzeilen finden
      let i = allNodes.length - 1;
      while(i > splitIdx){
        const txt = (allNodes[i].textContent || '').trim();
        const inner = allNodes[i].nodeType === 1 ? (allNodes[i].innerHTML || '').trim() : '';
        if(txt === '' || inner === '<br>' || txt === 'Jörn Kämper' || txt === 'Freundliche Grüße' || txt === 'Freundliche Grüsse'){
          endIdx = i;
          i--;
        } else {
          break;
        }
      }
      const trailingNodes = allNodes.slice(endIdx);
      const trailingHTML = trailingNodes.length ?
        '<div><br></div>' + trailingNodes.map(n => n.outerHTML || n.textContent || '').join('') : '';

      // Fließtext: alles nach Split-Node
      const flowNodes = allNodes.slice(flowStart, endIdx);
      // Konvertiere alle Nodes zu divs damit der Paginator umbrechen kann
      const flowDivs = [];
      flowNodes.forEach(n => {
        if(n.nodeType === 3){
          const lines = n.textContent.split('\n');
          lines.forEach(l => {
            if(l.trim()) flowDivs.push('<div>' + l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>');
            else flowDivs.push('<div><br></div>');
          });
        } else if(n.nodeType === 1){
          const hasBlocks = Array.from(n.children).some(c => ['DIV','P','H1','H2','H3'].includes(c.tagName));
          if(hasBlocks){
            Array.from(n.childNodes).forEach(child => {
              if(child.nodeType === 1) flowDivs.push(child.outerHTML);
              else if(child.nodeType === 3 && child.textContent.trim()) flowDivs.push('<div>' + child.textContent.trim() + '</div>');
            });
          } else {
            flowDivs.push(n.outerHTML);
          }
        }
      });
      const flowHTML = flowPrefix + flowDivs.join('');

      // Seite 1 bauen: fixer Teil + so viel Fließtext wie auf Seite 1 passt
      // Verfügbare Höhe für Text auf Seite 1:
      // Brief-Elemente (Header+Empfänger+Spacer+Betreff+Anrede) verbrauchen ~550px
      // PAGE_H(973) - 550 = 423px für Fließtext
      // Echten verfügbaren Platz auf Seite 1 messen
      const availableH = measurePage1FlowSpace(fixedHTML) - 48; // -48 = ~3 Zeilen Puffer vor Fußzeile

      // Fließtext paginieren
      const flowChunks = flowHTML.trim() ? paginate(flowHTML, availableH) : [''];
      console.log('flowHTML length:', flowHTML.length, 'availableH:', availableH, 'flowChunks:', flowChunks.length, 'chunk0 length:', flowChunks[0] ? flowChunks[0].length : 0);
      console.log('flowHTML content:', flowHTML.slice(0, 400));
      console.log('trailingNodes count:', trailingNodes.length, 'trailingHTML:', trailingHTML.slice(0,200));

      // Seite 1: fixer Teil + erste Seite Fließtext
      // trailingHTML an letzten Chunk hängen — auch wenn alles auf Seite 1 passt
      if(flowChunks.length === 1 && trailingHTML){
        flowChunks[0] = (flowChunks[0] || '') + trailingHTML;
      }
      const page1HTML = fixedHTML + (flowChunks[0] || '');
      document.getElementById('pgc').textContent = flowChunks.length;

      // Seite 1: Header-Block + fixedHTML + erster Fließtext-Chunk
      // Wir bauen Seite 1 manuell ohne buildA4PreviewPage aufzurufen
      const pg1 = document.createElement('div');
      pg1.className = 'pg pg--a4';
      // Header
      const hdr1 = document.createElement('div');
      hdr1.className = 'pg-brief-hdr1';
      hdr1.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:0;box-sizing:border-box">
        <img src="image1.jpg" style="height:64px;width:auto;display:block;margin-left:-3px" />
        <img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" />
      </div>`;
      pg1.appendChild(hdr1);
      // Body
      const body1 = document.createElement('div');
      body1.className = 'pg-body pg-body--brief-p1';
      const ed1 = document.createElement('div');
      ed1.className = 'pg-ed';
      ed1.contentEditable = 'false';
      ed1.innerHTML = page1HTML;
      ed1.style.fontFamily = curFont;
      ed1.style.fontSize = '12pt';
      ed1.style.lineHeight = curLH;
      body1.appendChild(ed1);
      pg1.appendChild(body1);
      // Kein Footer auf Brief-Seite 1
      pagesEl.appendChild(pg1);

      // Weitere Seiten — letzten Chunk mit Abschluss-Teil ergänzen
      for(let i = 1; i < flowChunks.length; i++){
        const isLast = (i === flowChunks.length - 1);
        const chunkHTML = isLast ? flowChunks[i] + trailingHTML : flowChunks[i];
        pagesEl.appendChild(buildA4PreviewPage(i, chunkHTML, false, true)); // noFooter=true für Briefe
      }

    } else {
      // Normale Dokumente
      const chunks = paginate(normalizedHTML || '');
      document.getElementById('pgc').textContent = chunks.length;
      chunks.forEach((chunk, i) => {
        pagesEl.appendChild(buildA4PreviewPage(i, chunk));
      });
    }

    curSize = savedSize;
    syncRuler();
    showSaved('A4-Vorschau');
    // Scroll to top so header is visible
    document.getElementById('cv').scrollTop = 0;
  } else {
    // Restore the saved endless content
    pagesEl.classList.remove('a4-mode');
    pagesEl.innerHTML = '';
    const pg = buildEndlessPage();
    pagesEl.appendChild(pg);
    const ed = pg.querySelector('.pg-ed');
    ed.innerHTML = savedEndlessHTML || '';
    document.getElementById('pgc').textContent = '—';
    stats();
    setTimeout(() => ed.focus(), 50);
    showSaved('Bearbeiten');
  }
}

function updateModeButtons(){
  document.getElementById('a4btn').classList.toggle('mode-active', isA4Mode);
  document.getElementById('endlessbtn').classList.toggle('mode-active', !isA4Mode);
}

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
function fmt(c){ if(isA4Mode) return; activeEd().focus(); document.execCommand(c, false, null); syncTb(); }
function aln(d){
  if(isA4Mode) return;
  activeEd().focus();
  document.execCommand({left:'justifyLeft',center:'justifyCenter',right:'justifyRight'}[d], false, null);
}
function lst(t){
  if(isA4Mode) return;
  activeEd().focus();
  document.execCommand(t==='ul'?'insertUnorderedList':'insertOrderedList', false, null);
}
function syncTb(){
  document.getElementById('bb').classList.toggle('on', document.queryCommandState('bold'));
  document.getElementById('bi').classList.toggle('on', document.queryCommandState('italic'));
  document.getElementById('bu').classList.toggle('on', document.queryCommandState('underline'));
}
function setFont(v){
  curFont = v; syncRuler();
  pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.fontFamily = v);
}
function setSize(v){
  curSize = v; syncRuler();
  const sel = window.getSelection();
  if(!isA4Mode && sel && !sel.isCollapsed && sel.rangeCount){
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = v + 'pt';
    try { range.surroundContents(span); }
    catch(e) { const frag = range.extractContents(); span.appendChild(frag); range.insertNode(span); }
    const nr = document.createRange();
    nr.setStartAfter(span); nr.collapse(true);
    sel.removeAllRanges(); sel.addRange(nr);
  } else {
    pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.fontSize = v + 'pt');
  }
}
function setLineH(v){
  curLH = v; syncRuler();
  pagesEl.querySelectorAll('.pg-ed').forEach(e => e.style.lineHeight = v);
}

document.addEventListener('keydown', e => {
  if((e.metaKey || e.ctrlKey) && e.key === 's'){ e.preventDefault(); e.shiftKey ? openSaveAs() : doSave(); }
});

// ── Table ─────────────────────────────────────────────────────────
function showTM(){ if(isA4Mode) return; document.getElementById('tm').classList.add('open'); }
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
  cmo('tm');
}

// ── Document management ───────────────────────────────────────────
let currentDocId = null;

function allDocs(){
  const keys = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('folio_doc_')) keys.push(k);
  }
  return keys.map(k => { try{ return {key:k, ...JSON.parse(localStorage.getItem(k))}; }catch(e){ return null; } })
    .filter(Boolean).sort((a,b) => (b.savedAt||'').localeCompare(a.savedAt||''));
}

function saveCurrentDoc(){
  if(!currentDocId) currentDocId = 'folio_doc_' + Date.now();
  localStorage.setItem(currentDocId, JSON.stringify(getState()));
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
      return `<div data-brief-header="1" style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:87px;box-sizing:border-box">
  <img src="image1.jpg" style="height:64px;width:auto;display:block;margin-left:-3px" />
  <img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" />
</div>
<div style="height:33px"></div>
<div style="font-size:12pt;line-height:1.5">[Empfänger]</div>
<div style="font-size:12pt;line-height:1.5">[Straße]</div>
<div style="font-size:12pt;line-height:1.5">[PLZ Ort]</div>
<div style="height:70px"></div>
<div class="betreff-datum"><span class="betreff-line">[Betreff]</span><span class="datum-span">${today}</span></div>
<div><br></div>
<div><br></div>
<div style="font-size:12pt;line-height:1.25">Sehr geehrte Damen und Herren,</div>
<div><br></div>
<div style="font-size:12pt;line-height:1.25">[Text]</div>
<div><br></div>
<div style="font-size:12pt;line-height:1.25">Freundliche Grüße</div>
<div><br></div>
<div style="font-size:12pt;line-height:1.25">Jörn Kämper</div>`;
    }
  }
];

function newFromTemplate(tpl){
  const hasContent = collect().replace(/<[^>]*>/g,'').trim().length > 0;
  if(hasContent || dtEl.value.trim()) saveCurrentDoc();
  currentDocId = 'folio_doc_' + Date.now();
  isNormalDoc = (tpl.id !== 'brief');
  exitA4IfNeeded();
  pagesEl.innerHTML = '';
  const pg = buildEndlessPage();
  pagesEl.appendChild(pg);
  pg.querySelector('.pg-ed').innerHTML = tpl.html();
  dtEl.value = tpl.title;
  document.getElementById('fsz').value = '12'; curSize = '12';
  document.getElementById('pgc').textContent = '—';
  stats(); renderSidebar(); showSaved('Vorlage geladen');
}

function exitA4IfNeeded(){
  if(isA4Mode){
    isA4Mode = false;
    pagesEl.classList.remove('a4-mode');
    updateModeButtons();
  }
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
  btn.className = 'snew'; btn.textContent = '+ Neues Dokument'; btn.onclick = newDoc;
  side.appendChild(btn);
  const tlbl = document.createElement('div');
  tlbl.className = 'slbl'; tlbl.style.marginTop = '16px'; tlbl.textContent = 'Vorlagen';
  side.appendChild(tlbl);
  TEMPLATES.forEach(tpl => {
    const d = document.createElement('div');
    d.className = 'sdoc';
    d.innerHTML = '<span style="opacity:.5;margin-right:6px">&#128203;</span><span>' + tpl.name + '</span>';
    d.onclick = () => newFromTemplate(tpl);
    side.appendChild(d);
  });
}

function switchDoc(key){
  saveCurrentDoc();
  try{
    const s = JSON.parse(localStorage.getItem(key));
    currentDocId = key;
    if(s.font){ curFont=s.font; document.getElementById('fnt').value=s.font; }
    if(s.size){ curSize=s.size; document.getElementById('fsz').value=s.size; }
    if(s.lh)  { curLH=s.lh;   document.getElementById('flh').value=s.lh; }
    if(s.title){ dtEl.value=s.title; }
    isNormalDoc = s.isNormalDoc !== false;
    exitA4IfNeeded();
    syncRuler(); activePage=0;
    pagesEl.innerHTML='';
    const pg = buildEndlessPage();
    pagesEl.appendChild(pg);
    pg.querySelector('.pg-ed').innerHTML = s.content || '';
    document.getElementById('pgc').textContent = '—';
    stats(); renderSidebar();
  } catch(e){}
}

function newDoc(){
  const hasContent = collect().replace(/<[^>]*>/g,'').trim().length > 0;
  if(hasContent || dtEl.value.trim()) saveCurrentDoc();
  currentDocId = 'folio_doc_' + Date.now();
  activePage = 0; isNormalDoc = true;
  dtEl.value = '';
  curFont = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  curSize = '14'; curLH = '1.25';
  document.getElementById('fnt').value = curFont;
  document.getElementById('fsz').value = curSize;
  document.getElementById('flh').value = curLH;
  syncRuler(); exitA4IfNeeded();
  pagesEl.innerHTML = '';
  const pg = buildEndlessPage();
  pagesEl.appendChild(pg);
  pg.querySelector('.pg-ed').focus();
  document.getElementById('pgc').textContent = '—';
  stats(); renderSidebar();
}

// ── Save / Load ───────────────────────────────────────────────────
function getState(){
  const raw = isA4Mode ? savedEndlessHTML : (pagesEl.querySelector('.pg-ed') ? pagesEl.querySelector('.pg-ed').innerHTML : '');
  const content = flattenHTML(raw, !isNormalDoc);
  return { title:dtEl.value, content, font:curFont, size:curSize, lh:curLH, isNormalDoc, savedAt:new Date().toISOString() };
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
  dl(new Blob([JSON.stringify(getState(),null,2)],{type:'application/json'}), san(dtEl.value)+'.folio');
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
  else if(saveFmt === 'txt')  dl(new Blob([getPlainText()],{type:'text/plain'}), san(name)+'.txt');
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
function getPlainText(){
  // HTML zu Plaintext konvertieren — funktioniert auch ohne DOM-Rendering
  function htmlToText(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const lines = [];
    function walk(node){
      if(node.nodeType === 3){
        lines.push(node.textContent);
      } else if(node.nodeType === 1){
        const tag = node.tagName.toLowerCase();
        if(tag === 'br'){ lines.push('\n'); return; }
        const isBlock = ['div','p','h1','h2','h3','h4','h5','li'].includes(tag);
        if(isBlock && lines.length && lines[lines.length-1] !== '\n') lines.push('\n');
        Array.from(node.childNodes).forEach(walk);
        if(isBlock) lines.push('\n');
      }
    }
    Array.from(tmp.childNodes).forEach(walk);
    return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Im A4-Modus savedEndlessHTML verwenden
  if(isA4Mode && savedEndlessHTML){
    return htmlToText(savedEndlessHTML).replace(/\n/g, '\r\n');
  }
  const ed = activeEd();
  if(!ed) return '';
  return htmlToText(ed.innerHTML).replace(/\n/g, '\r\n');
}
function buildHTML(title){
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>`
    +`<style>body{font-family:${curFont};font-size:${curSize}pt;line-height:${curLH};color:#1a1814;margin:2cm}`
    +`div,p{margin:0}h1{font-size:24px}h2{font-size:18px}ul,ol{margin:0 0 0 20px}`
    +`table{border-collapse:collapse;width:100%}td,th{border:1px solid #e0dbd0;padding:4px 8px}`
    +`</style></head><body>${collect()}</body></html>`;
}
function doPDF(){
  if(!isA4Mode) setA4Mode(true);

  function doprint(){
    const images = Array.from(pagesEl.querySelectorAll('img'));
    const unloaded = images.filter(img => !img.complete);
    if(unloaded.length > 0){
      let loaded = 0;
      unloaded.forEach(img => {
        img.onload = img.onerror = function(){
          loaded++;
          if(loaded >= unloaded.length) window.print();
        };
      });
    } else {
      window.print();
    }
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(doprint, 200);
  }));
}

// doPrint: identisch mit doPDF — Browser-Dialog erlaubt Auswahl des Druckers (inkl. WLAN-Drucker)
function doPrint(){ doPDF(); }

// Unlock toolbar after print dialog closes
window.addEventListener('afterprint', function(){
  if(!isA4Mode) document.body.classList.remove('a4-locked');
});

// ── Open file ─────────────────────────────────────────────────────
// ── Verschachtelte Divs aufflachen ───────────────────────────────
function flattenHTML(html, allowDoubleBlanks){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const result = [];
  function walk(node){
    if(node.nodeType === 3){
      const t = node.textContent;
      if(t.trim()) result.push('<div>' + t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>');
      return;
    }
    if(node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if(tag === 'br'){ result.push('<div><br></div>'); return; }

    // Brief-Header, Spacer-Divs und Betreff+Datum-Block immer unverändert lassen
    if(node.hasAttribute && (
       node.hasAttribute('data-brief-header') ||
       (node.style && node.style.height && !node.textContent.trim() && !node.querySelector('img')) ||
       (node.classList && node.classList.contains('betreff-datum')) ||
       (node.style && node.style.display === 'flex')
    )){
      result.push(node.outerHTML);
      return;
    }

    const isBlock = ['div','p','h1','h2','h3','h4','h5','li'].includes(tag);
    if(isBlock){
      const hasBlockChildren = Array.from(node.childNodes).some(c =>
        c.nodeType === 1 && ['div','p','h1','h2','h3','li'].includes(c.tagName.toLowerCase())
      );
      if(hasBlockChildren){
        Array.from(node.childNodes).forEach(walk);
      } else {
        const inner = node.innerHTML.trim();
        if(!inner || inner === '<br>') result.push('<div><br></div>');
        else result.push('<div>' + node.innerHTML + '</div>');
      }
    } else {
      result.push('<div>' + node.outerHTML + '</div>');
    }
  }
  Array.from(tmp.childNodes).forEach(walk);
  // Nur bei normalen Docs doppelte Leerzeilen entfernen — bei Briefen bleiben sie erhalten
  const deduped = allowDoubleBlanks ? result : result.filter((r,i) =>
    !(r === '<div><br></div>' && result[i-1] === '<div><br></div>')
  );
  return deduped.join('') || '<div><br></div>';
}

function openFile(){ document.getElementById('fileInput').click(); }
function loadFile(input){
  const file = input.files[0];
  if(!file) return;
  const name = file.name || '';
  const ext  = name.split('.').pop().toLowerCase();

  function applyContent(html, title, normalDoc){
    isNormalDoc = normalDoc;
    exitA4IfNeeded();
    dtEl.value = title;
    currentDocId = 'folio_doc_' + Date.now();
    pagesEl.innerHTML = '';
    const pg = buildEndlessPage();
    pagesEl.appendChild(pg);
    pg.querySelector('.pg-ed').innerHTML = flattenHTML(html, !normalDoc);
    document.getElementById('pgc').textContent = '—';
    stats(); saveCurrentDoc(); renderSidebar(); showSaved('Geladen');
  }

  // Rekonstruiert den kompletten Brief-Kopf aus einer beschädigten .folio-Datei.
  function repairBriefHeader(html){
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Nur abbrechen wenn BEIDE korrekt sind: Bild-Header UND Betreff-Zeile
    const firstDiv = tmp.firstElementChild;
    const hasBriefDatum = !!tmp.querySelector('.betreff-datum');
    const hasBetreffFlex = (()=>{
      const bl = tmp.querySelector('.betreff-line');
      if(!bl) return false;
      const p = bl.parentElement;
      return p && (p.classList.contains('betreff-datum') || p.style.display === 'flex');
    })();
    const headerOK = firstDiv && firstDiv.hasAttribute('data-brief-header');
    const subjectOK = hasBriefDatum || hasBetreffFlex;
    if(headerOK && subjectOK) return html;

    const nodes = Array.from(tmp.children);
    let idx = 0;

    // 1. Bilder-Block überspringen
    if(nodes[idx] && nodes[idx].querySelector('img')) idx++;

    // 2. Leerzeilen überspringen
    while(idx < nodes.length && (nodes[idx].innerHTML||'').trim() === '<br>') idx++;

    // Hilfsfunktion: erkennt Betreff-Node in altem und neuem Format
    function isSubjectNode(n){
      if(!n) return false;
      return !!(
        n.querySelector('.betreff-line') ||
        n.classList?.contains('betreff-datum') ||
        (n.children.length === 2 && n.children[0]?.classList?.contains('betreff-line'))
      );
    }

    // 3. Empfänger-Zeilen sammeln — bis zur Betreff-Zeile
    const empfaengerLines = [];
    while(idx < nodes.length){
      const n = nodes[idx];
      const inner = (n.innerHTML||'').trim();
      const txt = (n.textContent||'').trim();

      if(isSubjectNode(n)) break;

      if(inner === '<br>' || !txt){
        const next = nodes[idx+1];
        if(next && isSubjectNode(next)){
          idx++; // auf die echte Betreff-Zeile vorrücken
          break;
        }
        idx++; continue;
      }
      empfaengerLines.push(n.innerHTML.trim());
      idx++;
    }

    // 4. Betreff + Datum extrahieren
    let betreff = '[Betreff]';
    let datum = getTodayDE();
    if(idx < nodes.length){
      const bn = nodes[idx];
      const bs = bn.querySelector('.betreff-line');
      if(bs) betreff = bs.innerHTML.trim() || '[Betreff]';
      else betreff = bn.textContent.trim() || '[Betreff]';
      const ds = bn.querySelector('span:not(.betreff-line)') || bn.querySelector('span:last-child');
      if(ds) datum = ds.textContent.trim() || getTodayDE();
      idx++;
    }

    // 5. Leerzeilen nach Betreff überspringen, Rest übernehmen
    while(idx < nodes.length && (nodes[idx].innerHTML||'').trim() === '<br>') idx++;
    const restHTML = nodes.slice(idx).map(n => n.outerHTML).join('');

    // 6. Empfänger-HTML aufbauen — Inline-Styles des Originals verwenden falls vorhanden
    const empfaengerHTML = empfaengerLines.length
      ? empfaengerLines.map(l => `<div style="font-size:12pt;line-height:1.5">${l}</div>`).join('')
      : '<div style="font-size:12pt;line-height:1.5">[Empfänger]</div><div style="font-size:12pt;line-height:1.5">[Straße]</div><div style="font-size:12pt;line-height:1.5">[PLZ Ort]</div>';

    // 7. Vollständigen Brief-HTML zusammenbauen
    return `<div data-brief-header="1" style="display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:87px;box-sizing:border-box"><img src="image1.jpg" style="height:64px;width:auto;display:block;margin-left:-3px" /><img src="image2.jpg" style="height:167px;width:auto;display:block;margin-right:-9px" /></div>
<div style="height:33px"></div>
${empfaengerHTML}
<div style="height:70px"></div>
<div class="betreff-datum"><span class="betreff-line">${betreff}</span><span class="datum-span">${datum}</span></div>
<div><br></div>
<div><br></div>
${restHTML}`;
  }

  if(ext === 'folio'){
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const s = JSON.parse(e.target.result);
        if(s.font){ curFont=s.font; document.getElementById('fnt').value=s.font; }
        if(s.size){ curSize=s.size; document.getElementById('fsz').value=s.size; }
        if(s.lh)  { curLH=s.lh;   document.getElementById('flh').value=s.lh; }
        syncRuler();
        const isNormal = s.isNormalDoc !== false;
        let content = s.content || '';
        if(!isNormal) content = repairBriefHeader(content);
        applyContent(content, s.title||'', isNormal);
      } catch(err){ alert('Fehler beim Laden: ' + err.message); }
      input.value = '';
    };
    reader.readAsText(file);

  } else if(ext === 'txt'){
    const reader = new FileReader();
    reader.onload = function(e){
      const html = (e.target.result||'').split(/\r?\n/).map(line =>
        `<div>${line.trim() ? line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<br>'}</div>`
      ).join('');
      applyContent(html, name.replace(/\.[^.]+$/,''), true);
      input.value = '';
    };
    reader.readAsText(file);

  } else if(ext === 'docx' || ext === 'doc'){
    if(typeof mammoth === 'undefined'){ alert('Word-Import wird geladen, bitte erneut versuchen.'); input.value=''; return; }
    const reader = new FileReader();
    reader.onload = async function(e){
      const arrayBuf = e.target.result;
      let paraMap = null;
      try {
        const bytes = new Uint8Array(arrayBuf);
        const target = 'word/document.xml';
        for(let i=0; i<bytes.length-30; i++){
          if(bytes[i]===0x50&&bytes[i+1]===0x4B&&bytes[i+2]===0x03&&bytes[i+3]===0x04){
            const fnLen=bytes[i+26]|(bytes[i+27]<<8), extraLen=bytes[i+28]|(bytes[i+29]<<8);
            const fn=new TextDecoder().decode(bytes.slice(i+30,i+30+fnLen));
            if(fn===target){
              const comp=bytes[i+8]|(bytes[i+9]<<8), compSize=bytes[i+18]|(bytes[i+19]<<8)|(bytes[i+20]<<16)|(bytes[i+21]<<24);
              const dataStart=i+30+fnLen+extraLen, compData=bytes.slice(dataStart,dataStart+compSize);
              let xmlText='';
              if(comp===0){ xmlText=new TextDecoder().decode(compData); }
              else if(comp===8&&typeof DecompressionStream!=='undefined'){
                const ds=new DecompressionStream('deflate-raw'), w=ds.writable.getWriter();
                w.write(compData); w.close();
                const chs=[]; const r2=ds.readable.getReader();
                while(true){const{done,value}=await r2.read();if(done)break;chs.push(value);}
                const tot=chs.reduce((a,c)=>a+c.length,0), mg=new Uint8Array(tot);
                let off=0; chs.forEach(c=>{mg.set(c,off);off+=c.length;});
                xmlText=new TextDecoder().decode(mg);
              }
              if(xmlText){ const pm=xmlText.match(/<w:p[ >].*?<\/w:p>|<w:p\/>/g)||[]; paraMap=pm.map(p=>/<w:t[ >]/.test(p)); }
              break;
            }
          }
        }
      } catch(err){ paraMap=null; }
      mammoth.convertToHtml({arrayBuffer:arrayBuf}).then(function(result){
        const tmp=document.createElement('div'); tmp.innerHTML=result.value;
        tmp.querySelectorAll('strong').forEach(el=>{const b=document.createElement('b');b.innerHTML=el.innerHTML;el.replaceWith(b);});
        tmp.querySelectorAll('em').forEach(el=>{const i=document.createElement('i');i.innerHTML=el.innerHTML;el.replaceWith(i);});
        const htmlParas=[]; tmp.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach(el=>htmlParas.push(el.innerHTML.trim()));
        let html;
        if(paraMap){
          const divs=[]; let hi=0;
          for(let i=0;i<paraMap.length;i++){
            if(paraMap[i]){ const c=hi<htmlParas.length?htmlParas[hi++]:''; divs.push(c?`<div>${c}</div>`:'<div><br></div>'); }
            else divs.push('<div><br></div>');
          }
          html=divs.join('');
        } else { html=htmlParas.map(p=>p?`<div>${p}</div>`:'<div><br></div>').join(''); }
        applyContent(html||'<div><br></div>', name.replace(/\.[^.]+$/,''), true);
      }).catch(err=>alert('Word-Fehler: '+err.message));
      input.value='';
    };
    reader.readAsArrayBuffer(file);
  } else {
    // Unbekannte Endung: als .folio (JSON) versuchen, dann als .txt
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const s = JSON.parse(e.target.result);
        if(s.content !== undefined){
          if(s.font){ curFont=s.font; document.getElementById('fnt').value=s.font; }
          if(s.size){ curSize=s.size; document.getElementById('fsz').value=s.size; }
          if(s.lh)  { curLH=s.lh;   document.getElementById('flh').value=s.lh; }
          syncRuler();
          applyContent(s.content||'', s.title||name.replace(/\.[^.]+$/,'')||'', s.isNormalDoc !== false);
        } else { throw new Error('kein folio-Format'); }
      } catch(err){
        // Als Plaintext behandeln
        const html = (e.target.result||'').split(/\r?\n/).map(line =>
          `<div>${line.trim() ? line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '<br>'}</div>`
        ).join('');
        applyContent(html, name.replace(/\.[^.]+$/,'')||'Dokument', true);
      }
      input.value = '';
    };
    reader.readAsText(file);
  }
}

// ── Title ────────────────────────────────────────────────────────
dtEl.addEventListener('input', () => {
  if(currentDocId){
    try{ const s=JSON.parse(localStorage.getItem(currentDocId)||'{}'); s.title=dtEl.value; localStorage.setItem(currentDocId,JSON.stringify(s)); } catch(e){}
  }
  renderSidebar(); autoSave();
});

// ── Clipboard helpers ─────────────────────────────────────────────
function openRename(){
  const modal=document.getElementById('rename-modal'), input=document.getElementById('rename-input');
  input.value=dtEl.value||'Unbenanntes Dokument';
  modal.style.display='flex'; setTimeout(()=>input.focus(),100);
}
function closeRename(){ document.getElementById('rename-modal').style.display='none'; }
function confirmRename(){
  dtEl.value=document.getElementById('rename-input').value.trim()||'Unbenanntes Dokument';
  dtEl.dispatchEvent(new Event('input')); closeRename();
}
function clearAll(){
  document.getElementById('clear-modal').style.display='flex';
}
function clearAllConfirm(){
  document.getElementById('clear-modal').style.display='none';
  const ed=pagesEl.querySelector('.pg-ed'); if(!ed) return;
  ed.focus(); document.execCommand('selectAll',false,null); document.execCommand('delete',false,null);
  saveCurrentDoc(); showSaved('Geleert');
}
function clearAllCancel(){ document.getElementById('clear-modal').style.display='none'; }
function selectAll(){
  const ed=activeEd(); if(!ed) return; ed.focus();
  const range=document.createRange(); range.selectNodeContents(ed);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}
function copyAll(){
  const text = getPlainText();
  navigator.clipboard.writeText(text)
    .then(()=>showSaved('Alles kopiert'))
    .catch(()=>{
      const ta=document.createElement('textarea'); ta.value=text;
      ta.style.cssText='position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      try{document.execCommand('copy');showSaved('Alles kopiert');}catch(e){showSaved('Kopieren fehlgeschlagen');}
      document.body.removeChild(ta);
    });
}
function copySelection(){
  const sel=window.getSelection();
  if(!sel||sel.isCollapsed){showSaved('Nichts markiert');return;}
  navigator.clipboard.writeText(sel.toString()).then(()=>showSaved('Kopiert')).catch(()=>{document.execCommand('copy');showSaved('Kopiert');});
}
async function pasteClipboard(){
  if(isA4Mode) return;
  const ed=activeEd(); if(!ed) return;
  try{ const text=await navigator.clipboard.readText(); ed.focus(); document.execCommand('insertText',false,text); }
  catch(e){ showSaved('Bitte Cmd+V verwenden'); }
}

// ── Paste ─────────────────────────────────────────────────────────
document.addEventListener('paste', function(e){
  if(isA4Mode) return;
  const ed=activeEd(); if(!ed) return;
  e.preventDefault();
  const html=(e.clipboardData||window.clipboardData).getData('text/html');
  const text=(e.clipboardData||window.clipboardData).getData('text/plain');

  // Plaintext bevorzugen wenn vorhanden — vermeidet Div-Struktur-Probleme aus Folio/anderen Editoren
  if(text){
    const lines = text.split(/\r?\n/);
    const divs = lines.map(l => l.trim() 
      ? '<div>'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>' 
      : '<div style="font-size:'+curSize+'pt"><br></div>'
    ).join('').replace(/(<div[^>]*><br><\/div>){2,}/g,'<div style="font-size:'+curSize+'pt"><br></div>');
    document.execCommand('insertHTML',false,divs);
    return;
  }

  if(html){
    let h=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<meta[^>]*>/gi,'')
      .replace(/<link[^>]*>/gi,'').replace(/<o:[^>]*>[\s\S]*?<\/o:[^>]*>/gi,'').replace(/<o:[^>]*\/>/gi,'')
      .replace(/<w:[^>]*>[\s\S]*?<\/w:[^>]*>/gi,'').replace(/<m:[^>]*>[\s\S]*?<\/m:[^>]*>/gi,'');
    const tmp=document.createElement('div'); tmp.innerHTML=h;
    const resultLines=[]; let currentLine=[];
    function flushLine(){ if(currentLine.length){const d=document.createElement('div');currentLine.forEach(n=>d.appendChild(n));resultLines.push(d);currentLine=[];}else{ /* Leerzeile nur wenn vorheriger Eintrag Inhalt hatte */ if(resultLines.length && resultLines[resultLines.length-1] !== null) resultLines.push(null);} }
    function walk(node,bold,italic,underline){
      if(node.nodeType===3){const t=node.textContent;if(!t)return;let el=document.createTextNode(t);if(underline){const u=document.createElement('u');u.appendChild(el);el=u;}if(italic){const i=document.createElement('i');i.appendChild(el);el=i;}if(bold){const b=document.createElement('b');b.appendChild(el);el=b;}currentLine.push(el);return;}
      if(node.nodeType!==1)return;const tag=node.tagName.toLowerCase();if(tag==='br'){flushLine();return;}
      const st=node.style||{},fw=st.fontWeight||'';
      const isBold=bold||tag==='b'||tag==='strong'||fw==='bold'||parseInt(fw)>=600;
      const isItalic=italic||tag==='i'||tag==='em'||st.fontStyle==='italic';
      const isUnder=underline||tag==='u'||(st.textDecoration&&st.textDecoration.includes('underline'));
      const isBlock=['p','div','h1','h2','h3','h4','h5','li'].includes(tag);
      Array.from(node.childNodes).forEach(c=>walk(c,isBold,isItalic,isUnder));
      if(isBlock && currentLine.length) flushLine();
      else if(isBlock && !currentLine.length){
        // Leerer Block = echte Leerzeile, aber nur wenn vorheriger Eintrag Inhalt hatte
        if(resultLines.length && resultLines[resultLines.length-1] !== null) resultLines.push(null);
      }
    }
    Array.from(tmp.childNodes).forEach(c=>walk(c,false,false,false));
    if(currentLine.length)flushLine();
    // Aufeinanderfolgende Leerzeilen auf eine reduzieren
    const deduped = resultLines.filter((d,i) => !(d === null && resultLines[i-1] === null));
    const finalHTML=deduped.map(d=>!d?'<div><br></div>':(d.innerHTML.trim()?d.outerHTML:'<div><br></div>')).join('');
    document.execCommand('insertHTML',false,finalHTML);
  }
},true);

// ── Line selection gutter ────────────────────────────────────────
(function(){
  let gutterSelecting = false;
  let anchorRange = null;
  let lastClientY = 0;
  let scrollInterval = null;

  function startScrolling(){
    if(scrollInterval) return;
    scrollInterval = setInterval(function(){
      if(!gutterSelecting) return;
      const cv = document.getElementById('cv');
      if(!cv) return;
      const cvRect = cv.getBoundingClientRect();
      const scrollZone = 80;
      const maxSpeed = 20;
      if(lastClientY > cvRect.bottom - scrollZone){
        const dist = lastClientY - (cvRect.bottom - scrollZone);
        cv.scrollTop += Math.min(maxSpeed, dist * 0.5);
        updateSelection();
      } else if(lastClientY < cvRect.top + scrollZone){
        const dist = (cvRect.top + scrollZone) - lastClientY;
        cv.scrollTop -= Math.min(maxSpeed, dist * 0.5);
        updateSelection();
      }
    }, 16);
  }

  function stopScrolling(){
    if(scrollInterval){ clearInterval(scrollInterval); scrollInterval = null; }
  }

  function getLineNodeAtY(ed, clientY){
    // Find the deepest block-level child at this Y position
    function findInChildren(parent){
      const children = Array.from(parent.childNodes);
      for(const child of children){
        if(child.nodeType !== 1) continue;
        const rect = child.getBoundingClientRect();
        if(clientY >= rect.top && clientY <= rect.bottom){
          // If this child has block children, recurse
          const blockChildren = Array.from(child.childNodes).filter(c =>
            c.nodeType === 1 && ['DIV','P','H1','H2','H3','LI'].includes(c.tagName)
          );
          if(blockChildren.length > 0){
            const deeper = findInChildren(child);
            if(deeper) return deeper;
          }
          return child;
        }
      }
      return null;
    }
    // First try direct children
    const direct = findInChildren(ed);
    if(direct) return direct;
    // Fallback: closest by Y midpoint among all direct children
    let best = null, bestDist = Infinity;
    Array.from(ed.childNodes).forEach(child => {
      if(child.nodeType !== 1) return;
      const rect = child.getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(clientY - mid);
      if(dist < bestDist){ bestDist = dist; best = child; }
    });
    return best;
  }

  function rangeForNode(node){
    const r = document.createRange();
    r.selectNodeContents(node);
    return r;
  }

  function updateSelection(){
    if(!anchorRange) return;
    const body = document.querySelector('.pg--endless .pg-body');
    if(!body) return;
    const ed = body.querySelector('.pg-ed');
    if(!ed) return;
    const node = getLineNodeAtY(ed, lastClientY);
    if(!node) return;
    const targetRange = rangeForNode(node);
    try{
      const combined = document.createRange();
      const cmp = anchorRange.compareBoundaryPoints(Range.START_TO_START, targetRange);
      if(cmp <= 0){
        combined.setStart(anchorRange.startContainer, anchorRange.startOffset);
        combined.setEnd(targetRange.endContainer, targetRange.endOffset);
      } else {
        combined.setStart(targetRange.startContainer, targetRange.startOffset);
        combined.setEnd(anchorRange.endContainer, anchorRange.endOffset);
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(combined);
    } catch(err){}
  }

  document.addEventListener('mousedown', function(e){
    if(isA4Mode) return;
    if(!e.target.classList.contains('pg-gutter')) return;
    e.preventDefault();
    gutterSelecting = true;
    anchorRange = null;
    lastClientY = e.clientY;
    const body = e.target.closest('.pg-body');
    if(!body) return;
    const ed = body.querySelector('.pg-ed');
    if(!ed) return;
    ed.focus();
    const node = getLineNodeAtY(ed, e.clientY);
    if(!node) return;
    anchorRange = rangeForNode(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(anchorRange.cloneRange());
    startScrolling();
  }, true);

  document.addEventListener('mousemove', function(e){
    if(!gutterSelecting || !anchorRange) return;
    e.preventDefault();
    lastClientY = e.clientY;
    updateSelection();
  });

  document.addEventListener('mouseup', function(){
    gutterSelecting = false;
    stopScrolling();
  });
})();
function init(){
  Object.keys(localStorage).forEach(k=>{ if(k.startsWith('folio_doc_')||k===STORE) localStorage.removeItem(k); });
  currentDocId='folio_doc_'+Date.now();
  isNormalDoc=true; isA4Mode=false;
  pagesEl.innerHTML='';
  const pg=buildEndlessPage();
  pagesEl.appendChild(pg);
  pg.querySelector('.pg-ed').focus();
  document.getElementById('pgc').textContent='—';
  updateModeButtons();
  renderSidebar();
  stats();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none'
      });
      reg.update();
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (e) {}
  });
}

init();
