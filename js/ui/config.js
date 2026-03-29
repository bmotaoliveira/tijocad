import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { bricks, kk, getCellH, pushHist, restoreHist, updUR, getStateStr, doAutosave, markDirty } from '../core/history.js';
import { draw2d } from '../render/draw2d.js';
import { build3d } from '../render/draw3d.js';
import { updSt } from './statusbar.js';
import { setVista } from './subheader.js';
import { buildElevButtons, clearElevButtons } from '../render/elevation.js';

export function maxCourses(){
  let m=Math.max(1,Math.ceil(S.wallHCm/S.brickHCm));
  bricks().forEach(k=>{m=Math.max(m,Math.ceil(getCellH(k)/S.brickHCm));});
  return m;
}
export function clampCourse(){S.currentCourse=Math.max(0,Math.min(S.currentCourse,maxCourses()-1));}
export function updCourseLabel(){
  const total=maxCourses();
  clampCourse();
  const botCm=Math.round(S.currentCourse*S.brickHCm);
  const topCm=Math.round((S.currentCourse+1)*S.brickHCm);
  document.getElementById('course-label').textContent=`Fiada ${S.currentCourse+1} / ${total}`;
  document.getElementById('course-height-label').textContent=`(${botCm}–${topCm} cm)`;
  document.getElementById('btn-prev-c').disabled=S.currentCourse<=0;
  document.getElementById('btn-next-c').disabled=S.currentCourse>=total-1;
}
document.getElementById('btn-prev-c').addEventListener('click',()=>{if(S.currentCourse>0){S.currentCourse--;updCourseLabel();draw2d();}});
document.getElementById('btn-next-c').addEventListener('click',()=>{const t=maxCourses();if(S.currentCourse<t-1){S.currentCourse++;updCourseLabel();draw2d();}});

// keyboard arrows: pan em todas as vistas (planta, fiada, elev, inst, 3D)


// ── inputs ─────────────────────────────────────────
// ── Atualizar info de tijolo no rodapé ─────────────
export function updSbBrickInfo(){
  const sz=document.getElementById('sb-cell-sz');
  const bh=document.getElementById('sb-bh');
  const wh=document.getElementById('sb-wh');
  if(sz) sz.textContent=`${S.cellCm.toString().replace('.',',')}×${(S.cellCm*2).toString().replace('.',',')}`;
  if(bh) bh.textContent=S.brickHCm;
  if(wh) wh.textContent=S.wallHCm;
}

document.querySelectorAll('input[name=bricksize]').forEach(r=>{r.addEventListener('change',()=>{S.cellCm=parseFloat(r.value);document.getElementById('cell-cm').textContent=S.cellCm.toString().replace('.',',');updSbBrickInfo();draw2d();if(S.is3d)build3d();});});
document.getElementById('inp-bh').addEventListener('change',e=>{const v=parseFloat(e.target.value);if(v>0&&v<=30){S.brickHCm=v;updSbBrickInfo();clampCourse();updCourseLabel();draw2d();if(S.is3d)build3d();}});
document.getElementById('inp-wh').addEventListener('change',e=>{const v=parseFloat(e.target.value);if(v>=10&&v<=600){S.wallHCm=v;updSbBrickInfo();clampCourse();updCourseLabel();draw2d();if(S.is3d)build3d();}});

document.getElementById('btn-undo').addEventListener('click',()=>{if(S.hi>0){S.hi--;restoreHist();updUR();draw2d();updSt();if(S.is3d)build3d();}});
document.getElementById('btn-redo').addEventListener('click',()=>{if(S.hi<S.hist.length-1){S.hi++;restoreHist();updUR();draw2d();updSt();if(S.is3d)build3d();}});
document.getElementById('btn-clear').addEventListener('click',()=>{
  // Nada para apagar — ignora silenciosamente
  if(!bricks().size&&!S.dims.length&&!Object.keys(S.wallHMap).length&&!Object.keys(S.openMap).length&&!S.manualGrout.size&&!S.slopedKeys.size&&!S.conduits.length&&!S.hydroPoints.size)return;
  // Popup de confirmação antes de destruir tudo
  appConfirm('Apagar tudo?', ()=>{
  S.dims=[];S.wallHMap={};S.openMap={};S.doorOrient={};S.manualGrout.clear();S.groutExclude.clear();S.manualElec.clear();S.manualWater.clear();S.elecBoxes.clear();S.hydroPoints.clear();S.gasPoints.clear();S.conduits=[];S.pendingConduit=null;S.slopedKeys.clear();S.elevViews=[];S.currentElevId=null;clearElevButtons();pushHist(new Set());draw2d();updSt();if(S.is3d)build3d();
  }, {okLabel:'Apagar', okClass:'danger'});
});

document.getElementById('btn-save').addEventListener('click',()=>{
  doAutosave();
  S.lastSavedState=getStateStr();
  markDirty();
});
document.getElementById('btn-download').addEventListener('click',()=>{
  const name=document.getElementById('proj-name').value.trim()||'projeto';
  // Capture bg image as base64 if present
  let bgData = null;
  if(S.bgImg.img){
    try{
      const cvTmp=document.createElement('canvas');
      cvTmp.width=S.bgImg.img.naturalWidth; cvTmp.height=S.bgImg.img.naturalHeight;
      cvTmp.getContext('2d').drawImage(S.bgImg.img,0,0);
      bgData={src:cvTmp.toDataURL('image/jpeg',0.85),x:S.bgImg.x,y:S.bgImg.y,scale:S.bgImg.scale,opacity:S.bgImg.opacity,locked:S.bgImg.locked,fileName:S.bgImg.fileName};
    }catch(e){}
  }
  const d={version:5,brickSize:S.cellCm,brickHeight:S.brickHCm,wallHeight:S.wallHCm,
    bricks:[...bricks()],dimensions:S.dims.map(d=>({pt1:d.pt1,pt2:d.pt2})),
    wallHeightMap:S.wallHMap,openingMap:S.openMap,doorOrient:S.doorOrient,projectName:name,slopedKeys:[...S.slopedKeys],elevViews:S.elevViews,manualElec:[...S.manualElec],manualWater:[...S.manualWater],conduits:S.conduits,bgImage:bgData,
    settings:{elecLow:S.elecLow,elecMid:S.elecMid,elecHigh:S.elecHigh,hydroLow:S.hydroLow,hydroMid:S.hydroMid,hydroHigh:S.hydroHigh,stdSill:S.stdSill,stdHead:S.stdHead}};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
  a.download=(name||'projeto')+'.tjcad';a.click();
  S.lastSavedState=getStateStr();
  markDirty();
});
document.getElementById('btn-load').addEventListener('click',()=>{document.getElementById('file-input').value='';document.getElementById('file-input').click();});
document.getElementById('file-input').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=ev=>{try{
    const d=JSON.parse(ev.target.result);
    if(!d.bricks||!Array.isArray(d.bricks))throw new Error('formato inválido');
    if(d.brickSize){const r=document.querySelector(`input[name=bricksize][value="${d.brickSize}"]`);if(r){r.checked=true;S.cellCm=d.brickSize;document.getElementById('cell-cm').textContent=S.cellCm.toString().replace('.',',');}}
    if(d.brickHeight){S.brickHCm=d.brickHeight;document.getElementById('inp-bh').value=S.brickHCm;}
    if(d.wallHeight){S.wallHCm=d.wallHeight;document.getElementById('inp-wh').value=S.wallHCm;}
    S.dims=Array.isArray(d.dimensions)?d.dimensions.map(x=>({pt1:x.pt1,pt2:x.pt2,side:x.side??1})):[];
    S.wallHMap=d.wallHeightMap&&typeof d.wallHeightMap==='object'?d.wallHeightMap:{};
    S.openMap=d.openingMap&&typeof d.openingMap==='object'?d.openingMap:{};
    S.doorOrient=d.doorOrient&&typeof d.doorOrient==='object'?d.doorOrient:{};
    S.slopedKeys=new Set(Array.isArray(d.slopedKeys)?d.slopedKeys:[]);
    S.elevViews=Array.isArray(d.elevViews)?d.elevViews:[];
    S.currentElevId=null;
    S.manualElec=new Set(Array.isArray(d.manualElec)?d.manualElec:[]);
    S.manualWater=new Set(Array.isArray(d.manualWater)?d.manualWater:[]);
    S.elecBoxes=d.elecBoxes?new Map(Object.entries(d.elecBoxes).map(([k,v])=>[k,Array.isArray(v)?v:[v]])):new Map();
    S.hydroPoints=d.hydroPoints?new Map(Object.entries(d.hydroPoints).map(([k,v])=>[k,Array.isArray(v)?v:[v]])):new Map();
    S.gasPoints=d.gasPoints?new Map(Object.entries(d.gasPoints).map(([k,v])=>[k,Array.isArray(v)?v:[v]])):new Map();
    S.conduits=Array.isArray(d.conduits)?d.conduits:[];
    S.pendingConduit=null;
    // Restore background image
    if(d.bgImage && d.bgImage.src){
      const bgI=new Image();
      bgI.onload=()=>{
        S.bgImg.img=bgI; S.bgImg.x=d.bgImage.x||0; S.bgImg.y=d.bgImage.y||0;
        S.bgImg.scale=d.bgImage.scale||1; S.bgImg.opacity=d.bgImage.opacity||0.3;
        S.bgImg.locked=d.bgImage.locked||false; S.bgImg.fileName=d.bgImage.fileName||'';
        bgUpdatePanel();
        document.getElementById('bg-panel').classList.add('visible');
        document.getElementById('btn-bgimg').classList.add('active');
        draw2d();
      };
      bgI.src=d.bgImage.src;
    } else {
      S.bgImg.img=null; S.bgImg.fileName='';
      document.getElementById('bg-panel').classList.remove('visible');
      document.getElementById('btn-bgimg').classList.remove('active');
    }
    S.projectName=d.projectName||f.name.replace(/\.tjcad$/i,'')||'';
    document.getElementById('proj-name').value=S.projectName;
    document.title=S.projectName?`TijoCAD — ${S.projectName}`:'TijoCAD';
    if(d.settings){const s=d.settings;S.elecLow=s.elecLow||30;S.elecMid=s.elecMid||120;S.elecHigh=s.elecHigh||180;S.hydroLow=s.hydroLow||30;S.hydroMid=s.hydroMid||110;S.hydroHigh=s.hydroHigh||180;S.stdSill=s.stdSill||110;S.stdHead=s.stdHead||210;}
    syncPopupPresets();
    S.hist=[[],[...new Set(d.bricks)]];S.histOpen=[{},JSON.parse(JSON.stringify(S.openMap))];S.histWH=[{},JSON.parse(JSON.stringify(S.wallHMap))];S.histGrout=[[],[...S.manualGrout]];S.histConduits=[[],JSON.parse(JSON.stringify(S.conduits))];S.histElecBoxes=[[],snapMap(S.elecBoxes)];S.histHydroPoints=[[],snapMap(S.hydroPoints)];S.histSlopedKeys=[[],snapSet(S.slopedKeys)];S.histDims=[[],JSON.parse(JSON.stringify(S.dims))];S.histElevViews=[[],JSON.parse(JSON.stringify(S.elevViews))];S.hi=1;updUR();clampCourse();updCourseLabel();draw2d();updSt();if(S.is3d)build3d();
    S.lastSavedState=getStateStr();markDirty();
  }catch(err){appAlert('Erro: '+err.message);}};
  rd.readAsText(f);
});

// ── Configurações do projeto ─────────────────────────

// Sincroniza os value/title dos radio buttons dos popups com as vars globais
export function syncPopupPresets(){
  // Elétrica — atualiza value, title e texto visível do label
  const el = document.getElementById('ebh-low');
  const em = document.getElementById('ebh-mid');
  const eh = document.getElementById('ebh-high');
  if(el){ el.value=String(S.elecLow);  el.nextElementSibling.textContent=`Baixa (${S.elecLow} cm)`; el.nextElementSibling.title=`Tomadas — ${S.elecLow} cm`; }
  if(em){ em.value=String(S.elecMid);  em.nextElementSibling.textContent=`Média (${S.elecMid} cm)`; em.nextElementSibling.title=`Interruptores — ${S.elecMid} cm`; }
  if(eh){ eh.value=String(S.elecHigh); eh.nextElementSibling.textContent=`Alta (${S.elecHigh} cm)`;  eh.nextElementSibling.title=`Quadros — ${S.elecHigh} cm`; }
  // Hidráulica
  const hl = document.getElementById('hyh-low');
  const hm = document.getElementById('hyh-mid');
  const hh = document.getElementById('hyh-high');
  if(hl){ hl.value=String(S.hydroLow);  hl.nextElementSibling.textContent=`Baixa (${S.hydroLow} cm)`;  hl.nextElementSibling.title=`${S.hydroLow} cm`; }
  if(hm){ hm.value=String(S.hydroMid);  hm.nextElementSibling.textContent=`Média (${S.hydroMid} cm)`;  hm.nextElementSibling.title=`${S.hydroMid} cm`; }
  if(hh){ hh.value=String(S.hydroHigh); hh.nextElementSibling.textContent=`Alta (${S.hydroHigh} cm)`;  hh.nextElementSibling.title=`${S.hydroHigh} cm`; }
  // Vãos — sempre atualiza os campos do subheader com os padrões configurados
  const oi = document.getElementById('inp-oi');
  const os = document.getElementById('inp-os');
  if(oi){ oi.value=S.stdSill; S.openingInf=S.stdSill; }
  if(os){ os.value=S.stdHead; S.openingSup=S.stdHead; }
  if(typeof updOpeningInfo==='function') updOpeningInfo();
}

// Abre o painel preenchendo com valores atuais
export function openCfgPanel(){
  const r=document.querySelector(`input[name="cfg-bricksize"][value="${S.cellCm}"]`);
  if(r) r.checked=true;
  document.getElementById('cfg-bh').value=S.brickHCm;
  document.getElementById('cfg-wh').value=S.wallHCm;
  document.getElementById('cfg-elec-low').value=S.elecLow;
  document.getElementById('cfg-elec-mid').value=S.elecMid;
  document.getElementById('cfg-elec-high').value=S.elecHigh;
  document.getElementById('cfg-hydro-low').value=S.hydroLow;
  document.getElementById('cfg-hydro-mid').value=S.hydroMid;
  document.getElementById('cfg-hydro-high').value=S.hydroHigh;
  document.getElementById('cfg-sill').value=S.stdSill;
  document.getElementById('cfg-head').value=S.stdHead;
  document.getElementById('cfg-overlay').classList.add('visible');
}
export function closeCfgPanel(){
  document.getElementById('cfg-overlay').classList.remove('visible');
}
export function cfgClearErrors(){
  document.querySelectorAll('#cfg-panel .cfg-ninp').forEach(i=>i.classList.remove('cfg-error'));
  const msg=document.getElementById('cfg-validation-msg');
  msg.textContent=''; msg.classList.remove('visible');
}
export function cfgShowError(ids, text){
  ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.add('cfg-error'); });
  const msg=document.getElementById('cfg-validation-msg');
  msg.textContent=text; msg.classList.add('visible');
}
export function applyCfgPanel(){
  cfgClearErrors();
  const errors=[];

  // ── Tijolo ──
  const newBh=parseFloat(document.getElementById('cfg-bh').value);
  const newWh=parseFloat(document.getElementById('cfg-wh').value);
  if(isNaN(newBh)||newBh<3||newBh>30){ cfgShowError(['cfg-bh'],'Altura da fiada deve ser entre 3 e 30 cm.'); return; }
  if(isNaN(newWh)||newWh<10||newWh>600){ cfgShowError(['cfg-wh'],'Altura da parede deve ser entre 10 e 600 cm.'); return; }

  // ── Elétrica ──
  const el=parseFloat(document.getElementById('cfg-elec-low').value);
  const em=parseFloat(document.getElementById('cfg-elec-mid').value);
  const eh=parseFloat(document.getElementById('cfg-elec-high').value);
  if(isNaN(el)||el<5){ cfgShowError(['cfg-elec-low'],'Altura Baixa deve ser ≥ 5 cm.'); return; }
  if(isNaN(em)||em<=el){ cfgShowError(['cfg-elec-low','cfg-elec-mid'],'Altura Média deve ser maior que Baixa.'); return; }
  if(isNaN(eh)||eh<=em){ cfgShowError(['cfg-elec-mid','cfg-elec-high'],'Altura Alta deve ser maior que Média.'); return; }
  if(eh>390){ cfgShowError(['cfg-elec-high'],'Altura Alta elétrica deve ser ≤ 390 cm.'); return; }

  // ── Hidráulica ──
  const hl=parseFloat(document.getElementById('cfg-hydro-low').value);
  const hm=parseFloat(document.getElementById('cfg-hydro-mid').value);
  const hh=parseFloat(document.getElementById('cfg-hydro-high').value);
  if(isNaN(hl)||hl<5){ cfgShowError(['cfg-hydro-low'],'Altura Baixa deve ser ≥ 5 cm.'); return; }
  if(isNaN(hm)||hm<=hl){ cfgShowError(['cfg-hydro-low','cfg-hydro-mid'],'Altura Média deve ser maior que Baixa.'); return; }
  if(isNaN(hh)||hh<=hm){ cfgShowError(['cfg-hydro-mid','cfg-hydro-high'],'Altura Alta deve ser maior que Média.'); return; }
  if(hh>390){ cfgShowError(['cfg-hydro-high'],'Altura Alta hidráulica deve ser ≤ 390 cm.'); return; }

  // ── Vãos ──
  const ns=parseFloat(document.getElementById('cfg-sill').value);
  const nh=parseFloat(document.getElementById('cfg-head').value);
  if(isNaN(ns)||ns<0){ cfgShowError(['cfg-sill'],'Peitoril deve ser ≥ 0 cm.'); return; }
  if(isNaN(nh)||nh<=ns){ cfgShowError(['cfg-sill','cfg-head'],'Verga deve ser maior que o Peitoril.'); return; }
  if(nh>590){ cfgShowError(['cfg-head'],'Verga deve ser ≤ 590 cm.'); return; }

  // ── Tudo válido — aplicar ──
  const szR=document.querySelector('input[name="cfg-bricksize"]:checked');
  if(szR){
    const newSz=parseFloat(szR.value);
    if(newSz!==S.cellCm){
      S.cellCm=newSz;
      const mainR=document.querySelector(`input[name="bricksize"][value="${newSz}"]`);
      if(mainR) mainR.checked=true;
      document.getElementById('cell-cm').textContent=S.cellCm.toString().replace('.',',');
    }
  }
  S.brickHCm=newBh; document.getElementById('inp-bh').value=S.brickHCm;
  S.wallHCm=newWh;  document.getElementById('inp-wh').value=S.wallHCm;
  S.elecLow=el; S.elecMid=em; S.elecHigh=eh;
  S.hydroLow=hl; S.hydroMid=hm; S.hydroHigh=hh;
  S.stdSill=ns; S.stdHead=nh;

  syncPopupPresets();
  updSbBrickInfo();
  closeCfgPanel();
  pushHist(bricks());
  draw2d();
  updSt();
  if(S.is3d) build3d(true);
  markDirty();
}

document.getElementById('btn-cfg').addEventListener('click', openCfgPanel);
document.getElementById('cfg-close').addEventListener('click', closeCfgPanel);
document.getElementById('cfg-cancel-btn').addEventListener('click', closeCfgPanel);
document.getElementById('cfg-apply-btn').addEventListener('click', applyCfgPanel);
document.getElementById('cfg-overlay').addEventListener('click', e=>{ if(e.target===document.getElementById('cfg-overlay')) closeCfgPanel(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && document.getElementById('cfg-overlay').classList.contains('visible')) closeCfgPanel(); });
// Limpa erros visuais ao editar qualquer campo do painel
document.querySelectorAll('#cfg-panel .cfg-ninp').forEach(inp=>{
  inp.addEventListener('input', ()=>{ inp.classList.remove('cfg-error'); const msg=document.getElementById('cfg-validation-msg'); msg.textContent=''; msg.classList.remove('visible'); });
});

// ── Nome do projeto ─────────────────────────────────
document.getElementById('proj-name').addEventListener('input',e=>{
  S.projectName=e.target.value.trim();
  document.title=S.projectName?`TijoCAD — ${S.projectName}`:'TijoCAD';
  markDirty();
});
document.getElementById('proj-name').addEventListener('keydown',e=>{
  if(e.key==='Enter')e.target.blur();
});

// ── Alerta de alterações não salvas ─────────────────
window.addEventListener('beforeunload',e=>{
  if(bricks().size>0 && getStateStr()!==S.lastSavedState){
    e.preventDefault();e.returnValue='';
  }
});

// tog3d handled by setVista()

// ═══════════════════════════════════════════════════
// MODULATION ENGINE
// ═══════════════════════════════════════════════════

// Determine the active direction for a cell in a given course.
// Rules:
//   - Straight wall (only H or only V neighbours): use that direction
//   - T-junction: the cell is ALWAYS part of the wall that passes through
//     both sides (has neighbours in BOTH sub-directions of H or V).
//     The transverse wall simply ends at the adjacent cell.
//   - L-corner (neighbours in exactly one H and one V sub-direction):
//     alternate by course parity so each wall "passes" every other fiada.
//   - Cross (4 neighbours): alternate by course.

export {
  maxCourses, clampCourse, updCourseLabel,
  updSbBrickInfo, syncPopupPresets,
  openCfgPanel, closeCfgPanel, cfgClearErrors, cfgShowError, applyCfgPanel,
};
