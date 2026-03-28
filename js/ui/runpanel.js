import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { bricks, kk, getCellH, pushHist } from '../core/history.js';
import { draw2d } from '../render/draw2d.js';
import { updSt } from './statusbar.js';
import { maxCourses } from './config.js';

function recenter(){
  const br=bricks();
  if(S.vistaMode==='3d'){
    // 3D: reset câmera para posição padrão
    if(br.size){
      let sumC=0,sumR=0,sumH=0;
      br.forEach(k=>{const[c,r]=k.split(',').map(Number);sumC+=c;sumR+=r;sumH+=getCellH(k)/100;});
      const w2=S.cellCm/100;
      S.tgt3x=(sumC/br.size+.5)*w2;S.tgt3y=(sumH/br.size)/2;
      S.tgt3z=(sumR/br.size+.5)*w2;
      S.rad3=Math.max(5,Math.sqrt(br.size)*w2*3.5+(sumH/br.size)*1.8);
      S.th3=0.6;S.ph3=0.85;
    }
    return;
  }
  if(S.vistaMode==='elev'&&!elevPicking){
    S.elevOx=0;S.elevOy=0;S.elevSc=1;draw2d();return;
  }
  if(!br.size){S.ox=cv2.width/2;S.oy=cv2.height/2;S.sc2=1;draw2d();return;}
  // Calc bounding box in world pixels
  let minC=Infinity,maxC2=-Infinity,minR=Infinity,maxR=-Infinity;
  br.forEach(k=>{
    const[c,r]=k.split(',').map(Number);
    minC=Math.min(minC,c);maxC2=Math.max(maxC2,c);
    minR=Math.min(minR,r);maxR=Math.max(maxR,r);
  });
  const W=cv2.width,H=cv2.height;
  const pad=60;
  const bwPx=(maxC2-minC+1)*CELL, bhPx=(maxR-minR+1)*CELL;
  const sc=Math.min((W-pad*2)/bwPx,(H-pad*2)/bhPx,8);
  const midX=(minC+maxC2+1)/2*CELL,midY=(minR+maxR+1)/2*CELL;
  S.sc2=sc; S.ox=W/2-midX*S.sc2; S.oy=H/2-midY*S.sc2;
  draw2d();updSt();
}
document.getElementById('btn-recenter').addEventListener('click',recenter);
document.getElementById('btn-ruler').addEventListener('click',toggleRuler);
document.getElementById('elev-back').addEventListener('click',()=>{
  elevPicking=true; S.currentElevId=null;
  updElevTools(); draw2d();
});
document.getElementById('elev-flip').addEventListener('click',()=>{
  const ev=getCurrentElev();if(!ev)return;
  ev.sideSign*=-1;
  updElevTools();draw2d();
});
function toggleRuler(){if(S.heightMode)toggleHeightMode();S.rulerOn=!S.rulerOn;S.rPt1=null;S.snapPt=null;if(!S.rulerOn){S.hovDim=-1;S.selDim=-1;}document.getElementById('btn-ruler').classList.toggle('active',S.rulerOn);cv2.classList.toggle('ruler-mode',S.rulerOn);document.getElementById('st-ruler-hint').style.display=S.rulerOn?'':'none';document.getElementById('st-ruler-hint').textContent='clique no 1º ponto';draw2d();}
document.getElementById('btn-height').addEventListener('click',toggleHeightMode);
function toggleHeightMode(){if(S.rulerOn)toggleRuler();S.heightMode=!S.heightMode;S.hovRun=[];document.getElementById('btn-height').classList.toggle('active',S.heightMode);cv2.classList.toggle('height-mode',S.heightMode);document.getElementById('st-height-hint').style.display=S.heightMode?'':'none';if(!S.heightMode)closeHpop();draw2d();}

// ── Run selection ──────────────────────────────────
const HANDLE_PX = 10; // raio do handle em pixels de tela

function selectRun(col, row){
  S.selectedRunType = 'wall';
  S.selectedRun = detectRun(col, row);
  if(!S.selectedRun.length){ deselectRun(); return; }
  S.selectedRunDir = runPrimaryDir(col, row, bricks());
  posRunPanel();
  draw2d();
}

function selectOpeningRun(col, row){
  S.selectedRunType = 'opening';
  S.selectedRun = detectOpeningRun(col, row);
  if(!S.selectedRun.length){ deselectRun(); return; }
  S.selectedRunDir = runPrimaryDir(col, row, bricks());
  posRunPanel();
  draw2d();
}

function deselectRun(){
  S.selectedRun = [];
  S.stretchMode = false;
  document.getElementById('run-panel').classList.remove('visible');
  draw2d();
}

function posRunPanel(){
  if(!S.selectedRun.length) return;
  const panel = document.getElementById('run-panel');
  const n = S.selectedRun.length;
  const lenCm = n * S.cellCm;

  // Comprimento
  const lenStr = lenCm % 1 === 0 ? String(lenCm) : lenCm.toFixed(1);
  document.getElementById('rp-len').textContent = lenStr;

  // Botões: Mover e Altura só fazem sentido para paredes
  const isOpening = S.selectedRunType === 'opening';
  document.getElementById('rp-move').style.display   = isOpening ? 'none' : '';
  document.getElementById('rp-height').style.display = isOpening ? 'none' : '';

  // Nome da parede na elevação (só para paredes)
  const nameEl  = document.getElementById('rp-name');
  const nameSep = document.getElementById('rp-name-sep');
  if(!isOpening){
    const runKey0 = kk(S.selectedRun[0].col, S.selectedRun[0].row);
    const ev = S.elevViews.find(e => e.cells && e.cells.some(c=>kk(c.col,c.row)===runKey0));
    if(ev){ nameEl.textContent=ev.name; nameEl.style.display=''; nameSep.style.display=''; }
    else  { nameEl.style.display='none'; nameSep.style.display='none'; }
  } else {
    // Para abertura: mostrar label "Abertura"
    nameEl.textContent='Abertura'; nameEl.style.display=''; nameSep.style.display='';
    nameEl.style.color='var(--accent)';
  }

  // Posicionar acima do centro do run
  const midCell = S.selectedRun[Math.floor(n/2)];
  const sx = (midCell.col + 0.5) * CELL * S.sc2 + S.ox;
  const sy = (midCell.row + 0.5) * CELL * S.sc2 + S.oy;
  const vp = document.getElementById('viewport');
  const vpR = vp.getBoundingClientRect();
  const pw = panel.offsetWidth || 220, ph = panel.offsetHeight || 34;
  let px = vpR.left + sx - pw/2;
  let py = vpR.top  + sy - ph - CELL*S.sc2*0.9;
  px = Math.max(8, Math.min(window.innerWidth - pw - 8, px));
  py = Math.max(8, Math.min(window.innerHeight - ph - 8, py));
  panel.style.left = px + 'px';
  panel.style.top  = py + 'px';
  panel.classList.add('visible');
}

function _runAvgHeight(run){
  if(!run.length) return S.wallHCm;
  const s = run.reduce((a,{col,row})=>a+getCellH(kk(col,row)), 0);
  return Math.round(s / run.length);
}

// Retorna 'start'|'end'|null se (sx,sy) de tela acerta um handle do run selecionado
function hitTestRunHandle(sx, sy){
  if(!S.selectedRun.length) return null;
  const HPXL = HANDLE_PX + 6;
  const ends = [
    {end:'start', cell: S.selectedRun[0]},
    {end:'end',   cell: S.selectedRun[S.selectedRun.length-1]},
  ];
  for(const {end, cell} of ends){
    const cx = (cell.col + 0.5)*CELL*S.sc2 + S.ox;
    const cy = (cell.row + 0.5)*CELL*S.sc2 + S.oy;
    if(Math.hypot(sx-cx, sy-cy) <= HPXL) return end;
  }
  return null;
}

// Aplica stretch: dada a posição de tela (sx,sy) calcula a nova ponta do run.
// Para paredes: atualiza S.hist[S.hi]. Para aberturas: atualiza S.openMap.
// Parte sempre da base capturada no início do stretch → zero acúmulo entre frames.
function applyStretch(sx, sy){
  const wx = (sx-S.ox)/S.sc2/CELL, wy = (sy-S.oy)/S.sc2/CELL;
  const fixed = S.stretchEnd==='start'
    ? S.stretchRun[S.stretchRun.length-1]
    : S.stretchRun[0];

  let newRun = [];
  if(S.stretchDir==='H'){
    const targetCol = Math.floor(wx);
    const fixedCol  = fixed.col;
    const row       = fixed.row;
    const minC = Math.min(fixedCol, targetCol);
    const maxC = Math.max(fixedCol, targetCol);
    for(let c = minC; c <= maxC; c++) newRun.push({col:c, row});
  } else {
    const targetRow = Math.floor(wy);
    const fixedRow  = fixed.row;
    const col       = fixed.col;
    const minR = Math.min(fixedRow, targetRow);
    const maxR = Math.max(fixedRow, targetRow);
    for(let r = minR; r <= maxR; r++) newRun.push({col, row:r});
  }
  if(!newRun.length) return;

  if(S.selectedRunType==='opening'){
    // Restaurar S.openMap a partir da base e adicionar as novas células de abertura
    const op0 = S.openMap[kk(S.stretchRun[0].col, S.stretchRun[0].row)] || {infCm:0, supCm:210};
    S.openMap = {...S.stretchBaseOpenMap};
    newRun.forEach(({col,row})=>{ S.openMap[kk(col,row)] = {...op0}; });
  } else {
    // Restaurar S.hist[S.hi] a partir da base e adicionar o novo run
    const liveSet = new Set(S.stretchBaseSet);
    newRun.forEach(({col,row})=>liveSet.add(kk(col,row)));
    S.hist[S.hi] = [...liveSet];
  }
  S.selectedRun = newRun;
}

// Listeners do painel
document.getElementById('rp-move').addEventListener('click',()=>{
  if(!S.selectedRun.length) return;
  // Ativar S.moveMode para o run selecionado
  S.moveRun = [...S.selectedRun];
  S.moveSC = S.selectedRun[0].col; S.moveSR = S.selectedRun[0].row;
  S.moveDC=0; S.moveDR=0;
  S.moveMode=true;
  cv2.classList.add('moving');
  deselectRun();
  draw2d();
});
document.getElementById('rp-height').addEventListener('click',()=>{
  if(!S.selectedRun.length) return;
  const mid = S.selectedRun[Math.floor(S.selectedRun.length/2)];
  const vpR = document.getElementById('viewport').getBoundingClientRect();
  const sx = (mid.col+0.5)*CELL*S.sc2+S.ox + vpR.left;
  const sy = (mid.row+0.5)*CELL*S.sc2+S.oy + vpR.top;
  openHpop(mid.col, mid.row, sx, sy);
});
document.getElementById('rp-delete').addEventListener('click',()=>{
  if(!S.selectedRun.length) return;
  if(S.selectedRunType==='opening'){
    S.selectedRun.forEach(({col,row})=>delete S.openMap[kk(col,row)]);
    pushHist(bricks()); deselectRun(); draw2d(); updSt(); if(S.is3d)build3d();
  } else {
    const br = bricks();
    S.selectedRun.forEach(({col,row})=>{
      const k=kk(col,row);
      cleanDoorOrient(k);
      br.delete(k); delete S.openMap[k]; delete S.wallHMap[k]; S.slopedKeys.delete(k);
    });
    pushHist(br); deselectRun(); draw2d(); updSt(); if(S.is3d)build3d();
  }
});

// height popup
let hpopRun=[];
function openHpop(col,row,sx,sy){
  hpopRun=detectRun(col,row);
  const n=hpopRun.length;
  document.getElementById('hp-title').textContent=`Altura — ${n} célula${n>1?'s':''}`;
  // Pre-fill: se o segmento já tem inclinação, mostrar modo inclinado com extremos
  const k0=kk(hpopRun[0].col,hpopRun[0].row);
  const k1=kk(hpopRun[n-1].col,hpopRun[n-1].row);
  const allSloped=n>1&&hpopRun.every(({col,row})=>S.slopedKeys.has(kk(col,row)));
  if(allSloped){
    document.getElementById('hpm-slope').checked=true;
    document.getElementById('hp-val').value=getCellH(k0);
    document.getElementById('hp-val2').value=getCellH(k1);
    document.getElementById('hp-slope-row').style.display='';
    document.getElementById('hp-unit-lbl').textContent='cm início';
  } else {
    document.getElementById('hpm-uni').checked=true;
    document.getElementById('hp-val').value=getCellH(kk(col,row));
    document.getElementById('hp-val2').value='';
    document.getElementById('hp-slope-row').style.display='none';
    document.getElementById('hp-unit-lbl').textContent='cm';
  }
  posPopup('hpop',sx,sy);
  setTimeout(()=>{document.getElementById('hp-val').focus();document.getElementById('hp-val').select();},20);
}
function closeHpop(){document.getElementById('hpop').style.display='none';hpopRun=[];}
function applyHpop(){
  const v=parseFloat(document.getElementById('hp-val').value);
  if(isNaN(v)||v<5||v>600){appAlert('Altura deve ser entre 5 e 600 cm.');return;}
  const br=bricks();
  // Detect run direction
  const n=hpopRun.length;
  const mode=document.querySelector('input[name=hpmode]:checked').value;
  if(mode==='slope'&&n>1){
    const v2=parseFloat(document.getElementById('hp-val2').value);
    if(isNaN(v2)||v2<5||v2>600){appAlert('Altura final deve ser entre 5 e 600 cm.');return;}
    hpopRun.forEach(({col,row},i)=>{
      const h=Math.round((v+(v2-v)*i/(n-1))*10)/10;
      const k=kk(col,row);
      S.wallHMap[k]=h;
      S.slopedKeys.add(k);
    });
  } else {
    hpopRun.forEach(({col,row})=>{
      const k=kk(col,row);
      S.wallHMap[k]=v;
      S.slopedKeys.delete(k);
    });
  }
  pushHist(bricks());closeHpop();clampCourse();updCourseLabel();draw2d();updSt();if(S.is3d)build3d();
}
document.getElementById('hp-ok').addEventListener('click',applyHpop);
document.getElementById('hp-cancel').addEventListener('click',closeHpop);
document.getElementById('hp-val').addEventListener('keydown',e=>{if(e.key==='Enter')applyHpop();if(e.key==='Escape')closeHpop();});
document.getElementById('hp-val2').addEventListener('keydown',e=>{if(e.key==='Enter')applyHpop();if(e.key==='Escape')closeHpop();});
document.querySelectorAll('input[name=hpmode]').forEach(r=>{
  r.addEventListener('change',()=>{
    const slope=r.value==='slope';
    document.getElementById('hp-slope-row').style.display=slope?'':'none';
    document.getElementById('hp-unit-lbl').textContent=slope?'cm início':'cm';
    if(slope&&!document.getElementById('hp-val2').value)
      document.getElementById('hp-val2').value=document.getElementById('hp-val').value;
  });
});
function posPopup(id,sx,sy){const pop=document.getElementById(id);pop.style.display='block';const pw=pop.offsetWidth,ph=pop.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;let px=sx+12,py=sy-ph/2;if(px+pw>vw-8)px=sx-pw-12;if(py<8)py=8;if(py+ph>vh-8)py=vh-ph-8;pop.style.left=px+'px';pop.style.top=py+'px';}

// ═══════════════════════════════════════════════════
// 3D ENGINE