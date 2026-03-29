import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { bricks, pushHist } from '../core/history.js';
import { draw2d, cv2, cx2 } from '../render/draw2d.js';
import { init3d, build3d } from '../render/draw3d.js';
import { updSt } from './statusbar.js';
import { buildElevButtons, clearElevButtons, updElevTools } from '../render/elevation.js';
import { _conduitCfg, createConduit, getValidDestinations } from '../engine/conduits.js';
import { deselectRun } from './runpanel.js';
import { clampCourse, updCourseLabel } from './config.js';

export function setVista(v){
  deselectRun();
  S.vistaMode=v;
  S.is3d=(v==='3d');
  const isPlanta=(v==='planta');
  const isFiada =(v==='fiada');
  const isElev  =(v==='elev');
  const isInst  =(v==='inst');
  // Canvases
  document.getElementById('cv2').style.display=S.is3d?'none':'block';
  document.getElementById('div3d').style.display=S.is3d?'block':'none';
  // Header tools
  document.getElementById('tools2d').style.display=S.is3d?'none':'';
  document.getElementById('grp-tools').style.display=(S.is3d||isFiada||isElev||isInst)?'none':'';
  // Raio-X no subheader — só visível na vista 3D
  const gx=document.getElementById('grp-xray');
  if(gx) gx.style.display=S.is3d?'flex':'none';
  document.getElementById('subheader').classList.toggle('S.is3d',S.is3d);
  // Sub-tools visibility
  document.getElementById('sub-tools').style.display=S.is3d?'none':'flex';
  document.getElementById('planta-tools').style.display=(isFiada||isElev||isInst)?'none':'flex';
  document.getElementById('course-nav').classList.toggle('visible',isFiada);
  document.getElementById('legend').classList.toggle('visible',isFiada);
  document.getElementById('fiada-tools').style.display=isFiada?'flex':'none';
  document.getElementById('elev-tools').style.display=isElev?'flex':'none';
  document.getElementById('inst-tools').style.display=isInst?'flex':'none';
  document.getElementById('st-hint').style.display=S.is3d?'none':'';
  // Fiada
  if(isFiada){clampCourse();updCourseLabel();}
  // Elevação
  if(isElev){
    S.S.elevPicking=true; S.currentElevId=null; S.elevOx=0;S.elevOy=0;S.elevSc=1;
    S.drawing=false;S.dS=null;S.dE=null;
    cv2.style.cursor='default';
    updElevTools();
  } else {
    clearElevButtons();
  }
  // Instalações
  if(isInst){
    S.drawing=false;S.dS=null;S.dE=null;
    cv2.style.cursor='crosshair';
    updInstButtons();
  }
  // 3D
  if(S.is3d){
    ['st-ruler-hint','st-height-hint'].forEach(id=>document.getElementById(id).style.display='none');
    if(S.rulerOn)toggleRuler();if(S.heightMode)toggleHeightMode();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{init3d();build3d();}));
  } else {
    // Ao sair do 3D: limpar estado
    resize2d();
  }
}
document.querySelectorAll('input[name=vista]').forEach(r=>{
  r.addEventListener('change',()=>setVista(r.value));
});

// ── Draw mode ──────────────────────────────────────
document.querySelectorAll('input[name=drawmode]').forEach(r=>{
  r.addEventListener('change',()=>{
    S.drawMode=r.value;
    deselectRun();
    document.getElementById('opening-fields').classList.toggle('visible',S.drawMode==='opening');
    if(S.drawMode==='opening') updOpeningInfo();
    // Botão Altura só faz sentido na ferramenta Parede
    document.getElementById('grp-height').style.display=(S.drawMode==='wall')?'flex':'none';
    S.hovRun=[];
    const hints={
      'wall':'clique para selecionar parede · arraste para desenhar · Shift+arrasto=mover',
      'opening':'clique em tijolo = inserir/remover abertura',
    };
    document.getElementById('st-hint').textContent=hints[S.drawMode]||'';
    updOpeningInfo(); draw2d();
  });
});
export function updOpeningInfo(){
  const v=S.openingSup-S.openingInf;
  const el=document.getElementById('opening-info');
  el.textContent=`vão: ${v} cm`; el.style.color=v<=0?'#c0392b':'#1a5fb4';
  // Botão girar porta: só visível quando inf=0 (porta)
  document.getElementById('btn-door-flip').classList.toggle('visible', S.openingInf===0);
}
document.getElementById('inp-oi').addEventListener('input',e=>{
  S.openingInf=parseFloat(e.target.value)||0;
  if(S.openingInf>=S.openingSup){S.openingSup=S.openingInf+S.brickHCm;document.getElementById('inp-os').value=S.openingSup;}
  updOpeningInfo();
});
document.getElementById('inp-os').addEventListener('input',e=>{S.openingSup=parseFloat(e.target.value)||210;updOpeningInfo();});

document.getElementById('btn-door-flip').addEventListener('click',()=>{
  // Gira a porta sob o cursor (S.hcell) — ou, se não houver, a primeira porta existente
  let target = null;
  if(S.hcell){
    const k=kk(S.hcell.col,S.hcell.row);
    if(S.openMap[k]&&S.openMap[k].infCm===0) target={col:S.hcell.col,row:S.hcell.row};
  }
  if(!target){
    // Fallback: primeira porta do S.openMap
    for(const[k,op] of Object.entries(S.openMap)){
      if(op.infCm===0){ const[c,r]=k.split(',').map(Number); target={col:c,row:r}; break; }
    }
  }
  if(!target) return;
  const run=getDoorRun(target.col,target.row);
  const firstKey=run.length?kk(run[0].col,run[0].row):kk(target.col,target.row);
  S.doorOrient[firstKey]=((S.doorOrient[firstKey]||0)+1)%5;
  draw2d();
});

document.querySelectorAll('input[name=fiadatool]').forEach(r=>{
  r.addEventListener('change',()=>{
    S.fiadaTool=r.value;
    draw2d();
  });
});

// ── Vista Instalações — subtool ──────────────────────
export function updInstButtons(){
  ['elec','ebox','hidraulica','pipe','gas','gasPipe'].forEach(t=>{
    const btn=document.getElementById('isb-'+t);
    if(btn) btn.classList.toggle('esb-active', S.electricalSubtool===t||
      (t==='hidraulica'&&(S.electricalSubtool==='hydro'||S.electricalSubtool==='node'))||
      (t==='gas'&&S.electricalSubtool==='gas'));
  });
  updInstHint();
}
export function updInstHint(){
  const h=document.getElementById('st-inst-hint');
  if(!h) return;
  if(S.pendingConduit){
    const cfg=_conduitCfg(S.pendingConduit.ctype);
    const tipo=S.pendingConduit.ctype==='pipe'?'tubulação':'elétrico';
    const n=S.pendingConduit.validDests?S.pendingConduit.validDests.filter(d=>d.kind!=='Z').length:0;
    h.textContent=`Conduíte ${tipo}: ${n} destino(s) XY — clique numa caixinha destino ou Esc`;
    h.style.color='var(--brand)';
  } else {
    const hints={
      'elec': CONDUIT_CFG.elec.hint,
      'ebox':'clique em parede = inserir/editar caixa elétrica',
      'hydro':'clique em parede = inserir ponto hidráulico (Terminal ou Conexão) · dir = remover',
      'node':'clique em parede = inserir ponto hidráulico (Terminal ou Conexão) · dir = remover',
      'pipe': CONDUIT_CFG.pipe.hint,
      'gas':  CONDUIT_CFG.gas.hint,
      'gasPipe': CONDUIT_CFG.gasPipe.hint,
    };
    h.textContent=hints[S.electricalSubtool]||'';
    h.style.color='var(--text3)';
  }
  updZbtns();
}

export function updZbtns(){
  const zb=document.getElementById('zbtns');
  if(!zb) return;
  const zDests=S.pendingConduit&&S.pendingConduit.validDests?S.pendingConduit.validDests.filter(d=>d.kind==='Z'):[];
  const hasTop =zDests.some(d=>d.term==='top');
  const hasBase=zDests.some(d=>d.term==='base');
  if(!S.pendingConduit||((!hasTop)&&(!hasBase))){
    zb.style.display='none'; return;
  }
  // Posicionar abaixo da barrinha de origem — usa cfg para escolher barRect
  const cfg=_conduitCfg(S.pendingConduit.ctype);
  const rect=cfg.barRect(S.pendingConduit.fromKey, S.pendingConduit.fromBoxIdx);
  if(!rect){zb.style.display='none';return;}
  const vp=document.getElementById('viewport');
  const vpRect=vp.getBoundingClientRect();
  const bxScreen=(rect.bx+rect.bw/2)*S.sc2+S.ox - vpRect.left + vp.offsetLeft;
  const byScreen=(rect.by+rect.bh)*S.sc2+S.oy  + 6;
  document.getElementById('zbtn-topo').style.display=hasTop?'':'none';
  document.getElementById('zbtn-base').style.display=hasBase?'':'none';
  zb.style.display='flex';
  zb.style.left=(bxScreen - zb.offsetWidth/2)+'px';
  zb.style.top=byScreen+'px';
}

document.getElementById('zbtn-topo').addEventListener('click',()=>{
  if(!S.pendingConduit) return;
  const vd=S.pendingConduit.validDests.find(d=>d.kind==='Z'&&d.term==='top');
  if(vd){ createConduit(S.pendingConduit.fromKey,S.pendingConduit.fromBoxIdx,vd,S.pendingConduit.ctype,S.pendingConduit.termMap||_conduitCfg(S.pendingConduit.ctype).termMap()); pushHist(bricks()); draw2d(); updSt(); if(S.is3d)build3d(true); }
  S.pendingConduit=null; updInstHint(); draw2d();
});
document.getElementById('zbtn-base').addEventListener('click',()=>{
  if(!S.pendingConduit) return;
  const vd=S.pendingConduit.validDests.find(d=>d.kind==='Z'&&d.term==='base');
  if(vd){ createConduit(S.pendingConduit.fromKey,S.pendingConduit.fromBoxIdx,vd,S.pendingConduit.ctype,S.pendingConduit.termMap||_conduitCfg(S.pendingConduit.ctype).termMap()); pushHist(bricks()); draw2d(); updSt(); if(S.is3d)build3d(true); }
  S.pendingConduit=null; updInstHint(); draw2d();
});
document.getElementById('isb-elec').addEventListener('click',()=>{ S.electricalSubtool='elec'; S.pendingConduit=null; updInstButtons(); draw2d(); });
// isb-water (Prumada hidráulica) removido do menu
document.getElementById('isb-ebox').addEventListener('click',()=>{ S.electricalSubtool='ebox'; S.pendingConduit=null; updInstButtons(); draw2d(); });
document.getElementById('isb-hidraulica').addEventListener('click',()=>{ S.electricalSubtool='hydro'; S.pendingConduit=null; updInstButtons(); draw2d(); });
document.getElementById('isb-pipe').addEventListener('click',()=>{ S.electricalSubtool='pipe'; S.pendingConduit=null; updInstButtons(); draw2d(); });
document.getElementById('isb-gas').addEventListener('click',()=>{ S.electricalSubtool='gas'; S.pendingConduit=null; updInstButtons(); draw2d(); });
document.getElementById('isb-gasPipe').addEventListener('click',()=>{ S.electricalSubtool='gasPipe'; S.pendingConduit=null; updInstButtons(); draw2d(); });


// ── Conduit system v6 ────────────────────────────────────────────────────────
//
// axis:'Z'  — height axis, through HOLE. Same plan cell. top/base/box-to-box.
// axis:'XY' — horizontal, through brick BODY. Same col OR same row.
// axis:'L'  — L-shaped, two straight XY segments meeting at a corner cell.
//             corner={col,row} is the bend point.
//
// conduit: {id, ctype, axis, fromKey, toKey, fromBoxIdx, toBoxIdx,
//           termTo, fromHeightCm, toHeightCm, path, corner?}
//
// CONDUIT_CFG — única fonte de verdade sobre as diferenças entre tipos.