import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { bricks, kk, pushHist, restoreHist, updUR } from '../core/history.js';
import { draw2d } from '../render/draw2d.js';
import { updSt } from '../ui/statusbar.js';
import { recenter, toggleRuler, toggleHeightMode, deselectRun, posRunPanel, applyStretch, closeHpop } from '../ui/runpanel.js';
import { updInstHint } from '../ui/subheader.js';
import { cv2, cx2 } from '../render/draw2d.js';

// keyboard arrows: pan em todas as vistas (planta, fiada, elev, inst, 3D)
window.addEventListener('keydown',e=>{
  const panStep = CELL * 3;

  // Pan 2D: todas as vistas 2D (planta, fiada, elev, inst) — setas movem o canvas
  if(!S.is3d && !S.rulerOn && !S.heightMode){
    if(e.key==='ArrowLeft') { e.preventDefault(); S.ox+=panStep; draw2d(); updSt(); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); S.ox-=panStep; draw2d(); updSt(); return; }
    if(e.key==='ArrowUp')   { e.preventDefault(); S.oy+=panStep; draw2d(); updSt(); return; }
    if(e.key==='ArrowDown') { e.preventDefault(); S.oy-=panStep; draw2d(); updSt(); return; }
  }
  // 3D: setas fazem pan do ponto de orbita (S.tgt3x/S.tgt3z) no plano horizontal,
  // respeitando o angulo horizontal da camera (S.th3) para que
  // ArrowUp = avanca na direcao que a camera esta olhando
  if(S.is3d){
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'||e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault();
      const spd = S.rad3 * 0.08;
      const fwdX =  Math.sin(S.th3);
      const fwdZ =  Math.cos(S.th3);
      const rtX  =  Math.cos(S.th3);
      const rtZ  = -Math.sin(S.th3);
      if(e.key==='ArrowUp')   { S.tgt3x -= fwdX*spd; S.tgt3z -= fwdZ*spd; }
      if(e.key==='ArrowDown') { S.tgt3x += fwdX*spd; S.tgt3z += fwdZ*spd; }
      if(e.key==='ArrowLeft') { S.tgt3x -= rtX*spd;  S.tgt3z -= rtZ*spd;  }
      if(e.key==='ArrowRight'){ S.tgt3x += rtX*spd;  S.tgt3z += rtZ*spd;  }
      return;
    }
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();if(S.hi>0){S.hi--;restoreHist();updUR();draw2d();updSt();if(S.is3d)build3d();}}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();if(S.hi<S.hist.length-1){S.hi++;restoreHist();updUR();draw2d();updSt();if(S.is3d)build3d();}}
  // Ctrl+S = salvar
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();document.getElementById('btn-save').click();return;}
  // Atalhos de ferramenta (só em planta, sem modificadores)
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!S.is3d&&S.vistaMode==='planta'&&!S.rulerOn&&!S.heightMode){
    if(e.key==='w'||e.key==='W'){document.getElementById('mode-wall').checked=true;document.getElementById('mode-wall').dispatchEvent(new Event('change'));return;}
    if(e.key==='o'||e.key==='O'){document.getElementById('mode-opening').checked=true;document.getElementById('mode-opening').dispatchEvent(new Event('change'));return;}
    // Delete/Backspace com run selecionado → excluir run
    if((e.key==='Delete'||e.key==='Backspace')&&S.selectedRun.length){
      e.preventDefault();
      document.getElementById('rp-delete').click();
      return;
    }
  }
  if((e.key==='r'||e.key==='R')&&!e.ctrlKey&&!e.metaKey&&!S.is3d&&S.vistaMode==='planta') toggleRuler();
  if((e.key==='h'||e.key==='H')&&!e.ctrlKey&&!e.metaKey&&!S.is3d&&S.vistaMode==='planta') toggleHeightMode();
  if(e.key==='0'&&!e.ctrlKey&&!e.metaKey) recenter();
  if((e.key==='Delete'||e.key==='Backspace')&&S.hovDim>=0&&!S.rulerOn){S.dims.splice(S.hovDim,1);S.hovDim=-1;cv2.style.cursor='crosshair';pushHist(bricks());draw2d();updSt();}
  if(e.key==='Escape'){
    if(S.stretchMode){
      S.stretchMode=false;
      if(S.selectedRunType==='opening'){
        // Restaurar S.openMap com o run original
        S.openMap = {...S.stretchBaseOpenMap};
        S.stretchRun.forEach(({col,row})=>{
          const op0=S.openMap[kk(S.stretchRun[0].col,S.stretchRun[0].row)];
          S.openMap[kk(col,row)] = op0 ? {...op0} : {infCm:0,supCm:210};
        });
      } else {
        // Restaurar S.hist[S.hi] com o run original
        const restored=new Set(S.stretchBaseSet);
        S.stretchRun.forEach(({col,row})=>restored.add(kk(col,row)));
        S.hist[S.hi]=[...restored];
      }
      S.selectedRun=[...S.stretchRun];
      S.stretchRun=[]; S.stretchBaseSet=null; S.stretchBaseOpenMap=null;
      draw2d();posRunPanel();return;
    }
    if(S.selectedRun.length){deselectRun();return;}
    if(S.pendingConduit){S.pendingConduit=null;updInstHint();draw2d();return;}
    if(S.moveMode){S.moveMode=false;S.moveDC=0;S.moveDR=0;S.moveRun=[];cv2.classList.remove('moving');draw2d();return;}
    closeHpop();
    if(S.rulerOn&&S.rPt1){S.rPt1=null;document.getElementById('st-ruler-hint').textContent='clique no 1º ponto';draw2d();}
    else if(S.rulerOn)toggleRuler();
    else if(S.heightMode)toggleHeightMode();
  }
});