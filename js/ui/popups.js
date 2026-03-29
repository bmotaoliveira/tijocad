import { S } from '../core/state.js';
import { bricks, kk, pushHist } from '../core/history.js';
import { CELL, EBOX_TYPES, EBOX_HEIGHTS } from '../constants.js';
import { draw2d } from '../render/draw2d.js';
import { build3d } from '../render/draw3d.js';
import { updSt } from './statusbar.js';
import { runPrimaryDir } from '../render/elevation.js';

let ebpopCell = null; // {col,row}
let ebpopIdx  = -1;  // index into S.elecBoxes array for current cell (-1 = new)

function posPopup(id,sx,sy){const pop=document.getElementById(id);pop.style.display='block';const pw=pop.offsetWidth,ph=pop.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;let px=sx+12,py=sy-ph/2;if(px+pw>vw-8)px=sx-pw-12;if(py<8)py=8;if(py+ph>vh-8)py=vh-ph-8;pop.style.left=px+'px';pop.style.top=py+'px';}

function ebBoxLabel(eb, i){
  const face = eb.face>0 ? 'A' : 'B';
  const h = eb.heightCm;
  const t = eb.type==='qd'?'QD':eb.type;
  return `${i+1}. ${t} · ${h}cm · Face ${face}`;
}

function ebpopFill(eb){
  const type   = eb ? eb.type    : '4x2';
  const hCm    = eb ? eb.heightCm: 30;
  const face   = eb ? eb.face    : 1;
  const orient = eb ? (eb.orient||'H') : 'H';
  const qdW    = eb ? eb.wCm     : 30;
  const qdH    = eb ? eb.hCm     : 40;

  document.querySelectorAll('input[name=eborient]').forEach(r=>{ r.checked=(r.value===orient); });
  document.querySelectorAll('input[name=ebtype]').forEach(r=>{ r.checked=(r.value===type); });
  document.getElementById('ebp-qd-row').style.display = type==='qd'?'':'none';
  document.getElementById('ebp-qd-w').value = qdW;
  document.getElementById('ebp-qd-h').value = qdH;

  const hPresets = [String(S.elecLow), String(S.elecMid), String(S.elecHigh)];
  const hStr = hPresets.includes(String(hCm)) ? String(hCm) : 'custom';
  document.querySelectorAll('input[name=ebheight]').forEach(r=>{ r.checked=(r.value===hStr); });
  document.getElementById('ebp-hcust-row').style.display = hStr==='custom'?'':'none';
  document.getElementById('ebp-hcust').value = hCm;

  document.querySelectorAll('input[name=ebface]').forEach(r=>{ r.checked=(r.value===String(face)); });
}

function ebpopRebuildSel(arr){
  const sel = document.getElementById('ebp-sel');
  sel.innerHTML = '';
  arr.forEach((eb,i)=>{
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = ebBoxLabel(eb, i);
    sel.appendChild(opt);
  });
  // "Nova caixa" option
  const optNew = document.createElement('option');
  optNew.value = '__new__';
  optNew.textContent = '+ Nova caixa…';
  sel.appendChild(optNew);
  sel.value = ebpopIdx >= 0 ? ebpopIdx : '__new__';
}

export function openEbpop(col, row, sx, sy){
  ebpopCell = {col, row};
  const k = kk(col, row);
  const arr = S.elecBoxes.get(k) || [];
  // Default: edit first box if exists, else new
  ebpopIdx = arr.length > 0 ? 0 : -1;

  const selRow = document.getElementById('ebp-sel-row');
  if(arr.length > 0){
    selRow.style.display = '';
    ebpopRebuildSel(arr);
  } else {
    selRow.style.display = 'none';
  }

  const eb = ebpopIdx >= 0 ? arr[ebpopIdx] : null;
  ebpopFill(eb);
  // Atualizar rótulos de face conforme eixo real da parede
  const _wDir=runPrimaryDir(col,row,bricks());
  document.querySelector('label[for="ebf-a"]').textContent=_wDir==='H'?'Norte ↑':'Leste →';
  document.querySelector('label[for="ebf-b"]').textContent=_wDir==='H'?'Sul ↓'  :'Oeste ←';
  posPopup('ebpop', sx, sy);
}

document.getElementById('ebp-sel').addEventListener('change', function(){
  const k = kk(ebpopCell.col, ebpopCell.row);
  const arr = S.elecBoxes.get(k) || [];
  if(this.value === '__new__'){
    ebpopIdx = -1;
    ebpopFill(null);
  } else {
    ebpopIdx = parseInt(this.value);
    ebpopFill(arr[ebpopIdx]);
  }
});

document.getElementById('ebp-new').addEventListener('click',()=>{
  ebpopIdx = -1;
  const sel = document.getElementById('ebp-sel');
  sel.value = '__new__';
  ebpopFill(null);
});

export function closeEbpop(){
  document.getElementById('ebpop').style.display='none';
  ebpopCell=null; ebpopIdx=-1;
}

function applyEbpop(){
  if(!ebpopCell) return;
  const k = kk(ebpopCell.col, ebpopCell.row);

  const groutAuto = computeGrauteCells();
  if(groutAuto.has(k)){
    appAlert('Esta célula já possui graute estrutural.\nA caixa elétrica não pode ser colocada aqui.');
    return;
  }

  const type   = document.querySelector('input[name=ebtype]:checked').value;
  const hMode  = document.querySelector('input[name=ebheight]:checked').value;
  const face   = parseInt(document.querySelector('input[name=ebface]:checked').value);
  const orient = document.querySelector('input[name=eborient]:checked').value;
  const heightCm = hMode==='custom'
    ? (parseFloat(document.getElementById('ebp-hcust').value)||100)
    : parseInt(hMode);

  let wCm = EBOX_TYPES[type].wCm;
  let hCm = EBOX_TYPES[type].hCm;
  if(type==='qd'){
    wCm = parseFloat(document.getElementById('ebp-qd-w').value)||30;
    hCm = parseFloat(document.getElementById('ebp-qd-h').value)||40;
  }
  const finalW = orient==='V' ? hCm : wCm;
  const finalH = orient==='V' ? wCm : hCm;

  const newBox = {type, wCm:finalW, hCm:finalH, heightCm, face, orient};
  const arr = S.elecBoxes.get(k) ? [...S.elecBoxes.get(k)] : [];
  if(ebpopIdx >= 0 && ebpopIdx < arr.length){
    arr[ebpopIdx] = newBox;
  } else {
    arr.push(newBox);
  }
  S.elecBoxes.set(k, arr);
  pushHist(bricks());
  closeEbpop();
  draw2d(); updSt(); if(S.is3d)build3d(true);
}

// Type toggle shows/hides QD size row
document.querySelectorAll('input[name=ebtype]').forEach(r=>{
  r.addEventListener('change',()=>{
    document.getElementById('ebp-qd-row').style.display = r.value==='qd'?'':'none';
  });
});
// Height toggle shows/hides custom row
document.querySelectorAll('input[name=ebheight]').forEach(r=>{
  r.addEventListener('change',()=>{
    document.getElementById('ebp-hcust-row').style.display = r.value==='custom'?'':'none';
  });
});

document.getElementById('ebp-ok').addEventListener('click', applyEbpop);
document.getElementById('ebp-del').addEventListener('click',()=>{
  if(!ebpopCell) return;
  const k = kk(ebpopCell.col, ebpopCell.row);
  const arr = S.elecBoxes.get(k) ? [...S.elecBoxes.get(k)] : [];
  if(ebpopIdx >= 0 && ebpopIdx < arr.length){
    arr.splice(ebpopIdx, 1);
    if(arr.length === 0){
      S.elecBoxes.delete(k);
      // Remove all S.conduits connected to this cell
      S.conduits=S.conduits.filter(cd=>cd.fromKey!==k&&cd.toKey!==k);
    } else {
      S.elecBoxes.set(k, arr);
      // Remove S.conduits referencing the deleted box index, shift remaining
      S.conduits=S.conduits.filter(cd=>{
        if(cd.fromKey===k&&cd.fromBoxIdx===ebpopIdx) return false;
        if(cd.toKey===k&&cd.toBoxIdx===ebpopIdx) return false;
        return true;
      });
      // Shift box indices above the deleted one
      S.conduits=S.conduits.map(cd=>{
        const c2={...cd};
        if(c2.fromKey===k&&c2.fromBoxIdx>ebpopIdx) c2.fromBoxIdx--;
        if(c2.toKey===k&&c2.toBoxIdx!=null&&c2.toBoxIdx>ebpopIdx) c2.toBoxIdx--;
        return c2;
      });
    }
  }
  pushHist(bricks()); closeEbpop(); draw2d(); updSt(); if(S.is3d)build3d(true);
});
document.getElementById('ebp-cancel').addEventListener('click', closeEbpop);

// ── Hydro Point Popup ─────────────────────────────────────────────────────────
let hypopCell=null, hypopIdx=-1, hypopIsNode=false, hypopIsGas=false;
// Ponteiro para o mapa ativo (S.hydroPoints ou S.gasPoints)
let hypopMap=null;

function hypLabel(hp,i){
  if(hp.face===0) return `${i+1}. Conexão · ${hp.heightCm}cm`;
  return `${i+1}. Terminal ∅${hp.diamMm}mm · ${hp.heightCm}cm · Face ${hp.face>0?'A':'B'}`;
}
function hypFill(hp){
  const d=hp?hp.diamMm:15;
  const hCm=hp?hp.heightCm:30;
  const f=hp?(hp.face??1):1;
  const isNode=hypopIsNode;
  // Tipo radio
  document.getElementById('hyt-terminal').checked=!isNode;
  document.getElementById('hyt-conexao').checked=isNode;
  // Mostrar/ocultar Diâm e Face conforme tipo
  document.getElementById('hyp-diam-row').style.display=isNode?'none':'';
  document.getElementById('hyp-diam-cust-row').style.display='none';
  document.getElementById('hyp-face-row').style.display=isNode?'none':'';
  // Título do popup
  if(hypopIsGas)
    document.querySelector('#hydropop .ebp-title').textContent=isNode?'🔧 Conexão de Gás':'🔥 Terminal de Gás';
  else
    document.querySelector('#hydropop .ebp-title').textContent=isNode?'🔧 Conexão Hidráulica':'💧 Terminal Hidráulico';
  // Cor do topo do popup (azul hidro / laranja gás)
  document.getElementById('hydropop').style.borderTopColor=hypopIsGas?'#E8660A':'#1a73e8';
  document.getElementById('hydropop').style.borderColor=hypopIsGas?'rgba(200,80,5,0.5)':'#5a9fd4';
  // Preencher valores
  const presets=['15','20','25'];
  const dStr=presets.includes(String(d))?String(d):'custom';
  document.querySelectorAll('input[name=hypdiam]').forEach(r=>{r.checked=(r.value===dStr);});
  if(dStr==='custom') document.getElementById('hyp-diam-cust-row').style.display='';
  document.getElementById('hyp-diam-val').value=d;
  const hPresets=[String(S.hydroLow),String(S.hydroMid),String(S.hydroHigh)];
  const hStr=hPresets.includes(String(hCm))?String(hCm):'custom';
  document.querySelectorAll('input[name=hypheight]').forEach(r=>{r.checked=(r.value===hStr);});
  document.getElementById('hyp-hcust-row').style.display=hStr==='custom'?'':'none';
  document.getElementById('hyp-hcust').value=hCm;
  document.querySelectorAll('input[name=hypface]').forEach(r=>{r.checked=(r.value===String(f));});
  // Labels de face
  if(!isNode){
    const _wDir=runPrimaryDir(hypopCell?.col??0,hypopCell?.row??0,bricks());
    document.querySelector('label[for="hypf-a"]').textContent=_wDir==='H'?'Norte ↑':'Leste →';
    document.querySelector('label[for="hypf-b"]').textContent=_wDir==='H'?'Sul ↓':'Oeste ←';
  }
}
function hypRebuildSel(arr){
  const sel=document.getElementById('hyp-sel');sel.innerHTML='';
  arr.forEach((hp,i)=>{const o=document.createElement('option');o.value=i;o.textContent=hypLabel(hp,i);sel.appendChild(o);});
  const on=document.createElement('option');on.value='__new__';on.textContent='+ Novo…';sel.appendChild(on);
  sel.value=hypopIdx>=0?hypopIdx:'__new__';
}
export function openHydropop(col,row,sx,sy){ hypopIsNode=false; hypopIsGas=false; hypopMap=S.hydroPoints; _openHypopCommon(col,row,sx,sy); }
export function openNodepop(col,row,sx,sy){ hypopIsNode=true;  hypopIsGas=false; hypopMap=S.hydroPoints; _openHypopCommon(col,row,sx,sy); }
export function openGaspop(col,row,sx,sy){ hypopIsNode=false;  hypopIsGas=true;  hypopMap=S.gasPoints;   _openHypopCommon(col,row,sx,sy); }
function _openHypopCommon(col,row,sx,sy){
  hypopCell={col,row};
  const k=kk(col,row);
  const allArr=(hypopMap||S.hydroPoints).get(k)||[];
  const arr=allArr.filter(hp=>hypopIsNode?(hp.face===0):(hp.face!==0));
  hypopIdx=arr.length>0?allArr.indexOf(arr[0]):-1;
  const selRow=document.getElementById('hyp-sel-row');
  if(arr.length>0){selRow.style.display='';hypRebuildSel(arr);}else{selRow.style.display='none';}
  hypFill(hypopIdx>=0?allArr[hypopIdx]:null);
  posPopup('hydropop',sx,sy);
}
export function closeHydropop(){document.getElementById('hydropop').style.display='none';hypopCell=null;hypopIdx=-1;hypopIsNode=false;hypopIsGas=false;hypopMap=null;}

document.getElementById('hyp-sel').addEventListener('change',function(){
  const k=kk(hypopCell.col,hypopCell.row);
  const allArr=S.hydroPoints.get(k)||[];
  const arr=allArr.filter(hp=>hypopIsNode?(hp.face===0):(hp.face!==0));
  if(this.value==='__new__'){hypopIdx=-1;hypFill(null);}
  else{const fi=parseInt(this.value);hypopIdx=allArr.indexOf(arr[fi]);hypFill(allArr[hypopIdx]);}
});
document.getElementById('hyp-new').addEventListener('click',()=>{hypopIdx=-1;document.getElementById('hyp-sel').value='__new__';hypFill(null);});

document.querySelectorAll('input[name=hyptype]').forEach(r=>{r.addEventListener('change',()=>{
  hypopIsNode=(r.value==='conexao');
  const k=hypopCell&&kk(hypopCell.col,hypopCell.row);
  const map=hypopMap||S.hydroPoints;
  const allArr=(k&&map.get(k))||[];
  const arr=allArr.filter(hp=>hypopIsNode?(hp.face===0):(hp.face!==0));
  hypopIdx=arr.length>0?allArr.indexOf(arr[0]):-1;
  const selRow=document.getElementById('hyp-sel-row');
  if(arr.length>0){selRow.style.display='';hypRebuildSel(arr);}else{selRow.style.display='none';}
  hypFill(hypopIdx>=0?allArr[hypopIdx]:null);
});});
document.querySelectorAll('input[name=hypdiam]').forEach(r=>{r.addEventListener('change',()=>{document.getElementById('hyp-diam-cust-row').style.display=r.value==='custom'?'':'none';});});
document.querySelectorAll('input[name=hypheight]').forEach(r=>{r.addEventListener('change',()=>{document.getElementById('hyp-hcust-row').style.display=r.value==='custom'?'':'none';});});

document.getElementById('hyp-ok').addEventListener('click',()=>{
  if(!hypopCell) return;
  const map=hypopMap||S.hydroPoints;
  const k=kk(hypopCell.col,hypopCell.row);
  const dMode=document.querySelector('input[name=hypdiam]:checked').value;
  const diamMm=dMode==='custom'?(parseFloat(document.getElementById('hyp-diam-val').value)||15):parseInt(dMode);
  const hMode=document.querySelector('input[name=hypheight]:checked').value;
  const heightCm=hMode==='custom'?(parseFloat(document.getElementById('hyp-hcust').value)||30):parseInt(hMode);
  const face=hypopIsNode?0:parseInt(document.querySelector('input[name=hypface]:checked').value);
  const id=Date.now()+'_'+Math.random().toString(36).slice(2,6);
  const newPt={id,diamMm,heightCm,face};
  const arr=map.get(k)?[...map.get(k)]:[];
  if(hypopIdx>=0&&hypopIdx<arr.length) arr[hypopIdx]=newPt; else arr.push(newPt);
  map.set(k,arr);
  pushHist(bricks()); closeHydropop(); draw2d(); updSt(); if(S.is3d)build3d(true);
});
document.getElementById('hyp-del').addEventListener('click',()=>{
  if(!hypopCell) return;
  const map=hypopMap||S.hydroPoints;
  const k=kk(hypopCell.col,hypopCell.row);
  const arr=map.get(k)?[...map.get(k)]:[];
  if(hypopIdx>=0&&hypopIdx<arr.length){
    arr.splice(hypopIdx,1);
    if(arr.length===0) map.delete(k); else map.set(k,arr);
  }
  pushHist(bricks()); closeHydropop(); draw2d(); updSt(); if(S.is3d)build3d(true);
});
document.getElementById('hyp-cancel').addEventListener('click', closeHydropop);

// ═══════════════════════════════════════════════════
// 2D ENGINE
// ═══════════════════════════════════════════════════