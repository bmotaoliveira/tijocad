import { S } from '../core/state.js';
import { CELL, BRICK_C, OPEN_C } from '../constants.js';
import { bricks, kk, getCellH, pushHist } from '../core/history.js';
import { draw2d, resize2d, detectRun, detectOpeningRun, drawSelectedRun, prevLine, dimHit } from '../render/draw2d.js';
import { updSt } from '../ui/statusbar.js';
import { openEbpop, openHydropop, openNodepop, openGaspop } from '../ui/popups.js';
import { openHpop, posRunPanel } from '../ui/runpanel.js';
import { bgHitTest, bgResizeHitTest, bgStartDrag, bgMoveDrag, bgEndDrag, loadImageFile, loadPdfAsImage, bgUpdatePanel, bgFitToView } from '../features/background.js';
import { getValidDestinations, createConduit, _pickZDest, CONDUIT_CFG } from '../engine/conduits.js';
import { drawElevMode } from '../render/elevation.js';
import { setVista, updInstHint, updZbtns } from '../ui/subheader.js';
import { clampCourse, updCourseLabel } from '../ui/config.js';
import { cv2, cx2 } from '../render/draw2d.js';

function revitMove(run, dc, dr) {
  const br = bricks();
  if (!run.length || (dc === 0 && dr === 0)) return false;

  // Determinar direção do segmento
  const isH = run.length < 2 || run[0].row === run[1].row;

  // Movimento perpendicular = H-run move V  (dr≠0,dc=0)  ou  V-run move H (dc≠0,dr=0)
  const isPerpMove = isH ? (dr !== 0 && dc === 0) : (dc !== 0 && dr === 0);

  if (!isPerpMove) {
    // Movimento paralelo: mover simples, sem esticar paredes
    return simpleMove(run, dc, dr, br);
  }

  // ── Movimento perpendicular: esticar paredes conectadas ──────────────────

  const p0 = run[0];               // extremidade inicial do segmento
  const p1 = run[run.length - 1];  // extremidade final do segmento

  // Para H-run: perpendicular = verificar células acima (dr=-1) e abaixo (dr=+1)
  // Para V-run: perpendicular = verificar células à esq (dc=-1) e à dir (dc=+1)
  const perpOffsets = isH
    ? [{dc:0, dr:-1}, {dc:0, dr:+1}]
    : [{dc:-1, dr:0}, {dc:+1, dr:0}];

  const toAdd    = []; // células a adicionar nas paredes perp.
  const toRemove = []; // células a remover das paredes perp.

  for (const endpoint of [p0, p1]) {
    for (const off of perpOffsets) {
      // Verificar se há uma parede perpendicular nesta direção
      const adjKey = kk(endpoint.col + off.dc, endpoint.row + off.dr);
      if (!br.has(adjKey)) continue;

      if (isH) {
        // H-run movendo verticalmente por dr
        const col = endpoint.col;
        const fr  = endpoint.row; // linha atual do endpoint

        if (off.dr === -1) {
          // Parede perp vai PARA CIMA (células em row < fr)
          if (dr > 0) {
            // H-run desce → gap se abre entre P e novo canto → preencher
            for (let r = fr; r < fr + dr; r++)          toAdd.push({col, row: r});
          } else {
            // H-run sobe → P precisa encolher por baixo
            for (let r = fr + dr + 1; r <= fr - 1; r++) toRemove.push({col, row: r});
          }
        } else {
          // off.dr === +1: Parede perp vai PARA BAIXO (células em row > fr)
          if (dr < 0) {
            // H-run sobe → gap se abre → preencher
            for (let r = fr + dr + 1; r <= fr; r++)     toAdd.push({col, row: r});
          } else {
            // H-run desce → P encolhe por cima
            for (let r = fr + 1; r <= fr + dr; r++)     toRemove.push({col, row: r});
          }
        }
      } else {
        // V-run movendo horizontalmente por dc
        const row = endpoint.row;
        const fc  = endpoint.col;

        if (off.dc === -1) {
          // Parede perp vai PARA ESQUERDA (células em col < fc)
          if (dc > 0) {
            for (let c = fc; c < fc + dc; c++)          toAdd.push({col: c, row});
          } else {
            for (let c = fc + dc + 1; c <= fc - 1; c++) toRemove.push({col: c, row});
          }
        } else {
          // off.dc === +1: Parede perp vai PARA DIREITA
          if (dc < 0) {
            for (let c = fc + dc + 1; c <= fc; c++)     toAdd.push({col: c, row});
          } else {
            for (let c = fc + 1; c <= fc + dc; c++)     toRemove.push({col: c, row});
          }
        }
      }
    }
  }

  // Aplicar ajustes nas paredes perpendiculares
  toAdd.forEach(({col, row}) => br.add(kk(col, row)));
  toRemove.forEach(({col, row}) => {
    const k = kk(col, row);
    cleanDoorOrient(k);
    br.delete(k);
    delete S.wallHMap[k];
    delete S.openMap[k];
    S.manualGrout.delete(k);
  });

  // Mover o próprio run
  simpleMove(run, dc, dr, br);
  return true;
}

// Move simples: desloca células sem ajustar paredes conectadas.
// Transfere S.wallHMap, S.openMap e S.manualGrout para as novas posições.
function simpleMove(run, dc, dr, br) {
  const wh = {}, op = {}, mg = new Set();
  run.forEach(({col, row}) => {
    const k = kk(col, row);
    if (S.wallHMap[k] !== undefined) wh[k] = S.wallHMap[k];
    if (S.openMap[k]) op[k] = S.openMap[k];
    if (S.manualGrout.has(k)) mg.add(k);
  });
  const me={},mw={},meb={},dor={};
  run.forEach(({col,row})=>{const k=kk(col,row);if(S.manualElec.has(k))me[k]=1;if(S.manualWater.has(k))mw[k]=1;if(S.elecBoxes.has(k))meb[k]=S.elecBoxes.get(k);if(S.doorOrient[k]!==undefined)dor[k]=S.doorOrient[k];});
  run.forEach(({col, row}) => {
    const k = kk(col, row);
    cleanDoorOrient(k);
    br.delete(k); delete S.wallHMap[k]; delete S.openMap[k]; S.manualGrout.delete(k); S.manualElec.delete(k); S.manualWater.delete(k); S.elecBoxes.delete(k);
  });
  run.forEach(({col, row}) => {
    const ok = kk(col, row), nk = kk(col + dc, row + dr);
    br.add(nk);
    if (wh[ok] !== undefined) S.wallHMap[nk] = wh[ok];
    if (op[ok]) S.openMap[nk] = op[ok];
    if (mg.has(ok)) S.manualGrout.add(nk);
    if (me[ok]) S.manualElec.add(nk);
    if (mw[ok]) S.manualWater.add(nk);
    if (meb[ok]) S.elecBoxes.set(nk, meb[ok]);
    if (dor[ok] !== undefined) S.doorOrient[nk] = dor[ok];
  });
  pushHist(br);
  return true;
}

// ── 2D mouse ───────────────────────────────────────
cv2.addEventListener('mousemove',e=>{
  const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
  S.lastSX=sx; S.lastSY=sy;
  // Cursor nos handles de stretch do run selecionado
  if(S.vistaMode==='planta'&&S.selectedRun.length&&(S.drawMode==='wall'||S.drawMode==='opening')&&!S.drawing&&!S.stretchMode){
    const h=hitTestRunHandle(sx,sy);
    cv2.style.cursor=h?(S.selectedRunDir==='H'?'ew-resize':'ns-resize'):'crosshair';
  }
  if(S.vistaMode==='fiada'){
    const c=cellAt(sx,sy);
    const changed=!S.hcell||S.hcell.col!==c.col||S.hcell.row!==c.row;
    if(changed){
      S.hcell=c;
      const cellKey=kk(c.col,c.row);
      if(S.fiadaTool==='grout'){
        cv2.style.cursor=bricks().has(cellKey)?'cell':'default';
      } else {
        const courseData=analyzeCourse(S.currentCourse);
        const info=courseData.get(cellKey);
        const isHov=(info&&info.isFirst)||(info&&!info.isFirst&&info.partner);
        cv2.style.cursor=isHov?'pointer':'default';
      }
      draw2d();updSt();
    }
    return;
  }
  if(S.vistaMode==='elev'){return;}
  if(S.vistaMode==='inst'){
    const c=cellAt(sx,sy);
    const mvcfg=_conduitCfg(S.electricalSubtool==='pipe'?'pipe':'elec');
    const hit=mvcfg.hitTest(sx,sy);
    if(S.pendingConduit){
      const[cc2,cr2]=kk(c.col,c.row).split(',').map(Number);
      const isValid=hit&&S.pendingConduit.validDests&&(
        hit.key===S.pendingConduit.fromKey
          ? S.pendingConduit.validDests.some(d=>d.kind==='Z'&&d.term==='box'&&d.toBoxIdx===hit.boxIdx)
          : S.pendingConduit.validDests.some(d=>(d.kind==='XY'||d.kind==='L')&&d.col===cc2&&d.row===cr2)
      );
      cv2.style.cursor=isValid?'pointer':'not-allowed';
    } else {
      cv2.style.cursor=hit&&S.electricalSubtool!=='ebox'&&S.electricalSubtool!=='hydro'?'pointer':bricks().has(kk(c.col,c.row))?'cell':'default';
    }
    S.hcell=c;
    draw2d();
    return;
  }
  // Hover em cotas — só quando ferramenta Medir está ativa
  if(S.rulerOn&&!S.drawing&&S.dims.length){const h=dimHit(sx,sy,18);if(h!==S.hovDim){S.hovDim=h;cv2.style.cursor=h>=0?'pointer':'crosshair';draw2d();}}
  if(S.rulerOn){const sp=snapAt(sx,sy);if(!S.snapPt||S.snapPt.col!==sp.col||S.snapPt.row!==sp.row){S.snapPt=sp;draw2d();}return;}
  const c=cellAt(sx,sy);

  if(!S.hcell||S.hcell.col!==c.col||S.hcell.row!==c.row){S.hcell=c;if(S.drawing)S.dE=c;draw2d();updSt();}
  // bg image cursor hint
  if(!S.drawing&&!S.moveMode&&S.bgImg.img&&!S.bgImg.locked&&S.vistaMode==='planta'){
    cv2.style.cursor=bgResizeHitTest(sx,sy)?'nwse-resize':bgHitTest(sx,sy)?'move':'crosshair';
  }
});

cv2.addEventListener('mouseleave',()=>{
  if(S.rulerOn){S.snapPt=null;draw2d();return;}
  if(S.heightMode){S.hovRun=[];S.hcell=null;draw2d();updSt();return;}
  S.hovDim=-1; S.selDim=-1; cv2.style.cursor='crosshair';
  if(!S.panning&&!S.drawing){S.hcell=null;draw2d();updSt();}
});

window.addEventListener('mousemove',e=>{
  if(S.bgImg.dragging||S.bgImg.resizing){bgMoveDrag(e.clientX,e.clientY);return;}
  // ── Stretch mode ──
  if(S.stretchMode){
    const rect=cv2.getBoundingClientRect();
    const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
    applyStretch(sx,sy);
    posRunPanel();
    draw2d();
    return;
  }
  if(!S.panning)return;
  S.ox=S.panOX+(e.clientX-S.panSX);S.oy=S.panOY+(e.clientY-S.panSY);
  const rect=cv2.getBoundingClientRect();
  if(!S.rulerOn&&!S.heightMode&&S.vistaMode!=='fiada')S.hcell=cellAt(e.clientX-rect.left,e.clientY-rect.top);
  draw2d();updSt();
});

cv2.addEventListener('mousedown',e=>{
  // ── Vista Elevação: bloqueia toda edição — somente pan com botão do meio ──
  if(S.vistaMode==='elev'){
    if(e.button===1){
      e.preventDefault();
      if(!S.elevPicking){
        S.elevPanning=true;S.elevPanSX=e.clientX;S.elevPanSY=e.clientY;
        S.elevPanOX=S.elevOx;S.elevPanOY=S.elevOy;cv2.classList.add('panning');
      }
    }
    return;
  }

  // ── Vista Instalações ──
  if(S.vistaMode==='inst'){
    if(e.button===1){e.preventDefault();S.panning=true;S.panSX=e.clientX;S.panSY=e.clientY;S.panOX=S.ox;S.panOY=S.oy;cv2.classList.add('panning');return;}
    if(e.button===2){
      e.preventDefault();
      const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
      const c=cellAt(sx,sy); const cellKey=kk(c.col,c.row);
      if(S.electricalSubtool==='hydro'){
        if(S.hydroPoints.has(cellKey)){
          S.hydroPoints.delete(cellKey);pushHist(bricks());draw2d();updSt();
        }
      } else if(S.electricalSubtool==='gas'){
        if(S.gasPoints.has(cellKey)){
          S.gasPoints.delete(cellKey);pushHist(bricks());draw2d();updSt();
        }
      } else {
        const before=S.conduits.length;
        S.conduits=S.conduits.filter(cd=>!cd.path.some(p=>kk(p.col,p.row)===cellKey));
        if(S.conduits.length!==before){pushHist(bricks());draw2d();updSt();if(S.is3d)build3d(true);}
      }
      S.pendingConduit=null; draw2d();
      return;
    }
    if(e.button!==0)return;
    e.preventDefault();
    const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
    const c=cellAt(sx,sy); const cellKey=kk(c.col,c.row);

    if(S.electricalSubtool==='ebox'){
      if(bricks().has(cellKey)) openEbpop(c.col,c.row,e.clientX,e.clientY);
      return;
    }

    if(S.electricalSubtool==='hydro'){
      if(bricks().has(cellKey)) openHydropop(c.col,c.row,e.clientX,e.clientY);
      return;
    }

    if(S.electricalSubtool==='gas'){
      if(bricks().has(cellKey)) openGaspop(c.col,c.row,e.clientX,e.clientY);
      return;
    }

    // Determine ctype and config via CONDUIT_CFG
    const ctype = S.electricalSubtool==='pipe' ? 'pipe'
                : S.electricalSubtool==='gasPipe' ? 'gasPipe'
                : S.electricalSubtool==='gas'     ? 'gas'
                : 'elec';
    const cfg = _conduitCfg(ctype);
    const termMap = cfg.termMap();

    if(!S.pendingConduit){
      // Primeiro clique: deve acertar uma barrinha
      const hit=cfg.hitTest(sx,sy);
      if(!hit){draw2d();return;}
      const{key,boxIdx}=hit;
      if(!termMap.has(key)){draw2d();return;}
      const vdests=getValidDestinations(key,boxIdx,termMap,ctype);
      S.pendingConduit={ctype,fromKey:key,fromBoxIdx:boxIdx,validDests:vdests,termMap};
      updInstHint(); draw2d();
      return;
    }

    // Segundo clique: deve acertar outra barrinha
    const hit2=cfg.hitTest(sx,sy);
    if(!hit2){
      // Clique fora de qualquer barrinha cancela
      S.pendingConduit=null; draw2d(); updInstHint();
      return;
    }
    const{key:toKey,boxIdx:toBoxIdx}=hit2;
    const fromKey=S.pendingConduit.fromKey;
    const fromBoxIdx=S.pendingConduit.fromBoxIdx;
    const usedTermMap=S.pendingConduit.termMap||S.elecBoxes;

    let vd=null;
    if(toKey===fromKey){
      // Mesma célula → conduíte Z box-a-box direto
      vd=S.pendingConduit.validDests.find(d=>d.kind==='Z'&&d.term==='box'&&d.toBoxIdx===toBoxIdx);
    } else {
      const[tc,tr]=toKey.split(',').map(Number);
      vd=S.pendingConduit.validDests.find(d=>(d.kind==='XY'||d.kind==='L')&&d.col===tc&&d.row===tr);
    }

    S.pendingConduit=null;
    if(vd){
      createConduit(fromKey,fromBoxIdx,vd,ctype,usedTermMap);
      pushHist(bricks());
      draw2d(); updSt(); if(S.is3d)build3d(true);
    } else {
      draw2d();
    }
    updInstHint();
    return;
  }

  if(S.vistaMode==='fiada'){
    if(e.button!==0)return;
    e.preventDefault();
    const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
    const c=cellAt(sx,sy);
    const cellKey=kk(c.col,c.row);
    if(S.fiadaTool==='grout'){
      if(!bricks().has(cellKey))return;
      // Compute auto-grout to detect what's automatic vs manual
      const autoGrout = computeGrauteCells();
      // Re-add excluded ones to see the "raw" auto set
      S.groutExclude.forEach(k => { /* autoGrout already excludes these */ });
      if(S.manualGrout.has(cellKey)){
        // Remove manual grout
        S.manualGrout.delete(cellKey);
      } else if(S.groutExclude.has(cellKey)){
        // Restore auto-grout (un-exclude)
        S.groutExclude.delete(cellKey);
      } else if(autoGrout.has(cellKey)){
        // Cell has auto-grout → exclude it (remove)
        S.groutExclude.add(cellKey);
      } else {
        // Cell has no grout → add manual grout
        S.manualGrout.add(cellKey);
      }
      pushHist(bricks());
      draw2d();updSt();if(S.is3d)build3d(true);
    }
    return;
  }
  const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
  if(e.button===1){e.preventDefault();S.panning=true;S.panSX=e.clientX;S.panSY=e.clientY;S.panOX=S.ox;S.panOY=S.oy;cv2.classList.add('panning');return;}
  if(e.button===0&&S.heightMode){e.preventDefault();const c=cellAt(sx,sy);if(bricks().has(kk(c.col,c.row)))openHpop(c.col,c.row,e.clientX,e.clientY);return;}
  // Deselecionar cota ao clicar fora dela
  if(e.button===0&&S.hovDim<0&&S.selDim>=0){S.selDim=-1;draw2d();}
  // Ícones de cota selecionada — verificar ANTES de qualquer outra ação
  if(e.button===0&&S.selDim>=0){
    const pos=dimIconPos(S.dims[S.selDim]);
    if(pos){
      const hitR=pos.iconR*1.5;
      if(Math.hypot(sx-pos.fx,sy-pos.fy)<=hitR){
        e.preventDefault();
        const d=S.dims[S.selDim];
        S.dims[S.selDim]={...d,side:((d.side??1)===1?-1:1)};
        pushHist(bricks());draw2d();return;
      }
      if(Math.hypot(sx-pos.ex,sy-pos.ey)<=hitR){
        e.preventDefault();
        S.dims.splice(S.selDim,1);S.hovDim=-1;S.selDim=-1;cv2.style.cursor='crosshair';
        pushHist(bricks());draw2d();updSt();return;
      }
    }
    // Clique fora dos ícones: deselecionar
    S.selDim=-1;draw2d();
  }
  // Cotas: interação disponível só com Medir ativo
  if(e.button===0&&S.rulerOn&&S.hovDim>=0&&!S.moveMode){
    e.preventDefault();
    // Primeiro clique: selecionar cota e mostrar ícones
    S.selDim=S.hovDim; draw2d(); return;
  }
  if(e.button===0&&S.rulerOn){e.preventDefault();const sp=snapAt(sx,sy);if(!S.rPt1){S.rPt1=sp;document.getElementById('st-ruler-hint').textContent='clique no 2º ponto | Esc=cancelar';}else{if(sp.col!==S.rPt1.col||sp.row!==S.rPt1.row){S.dims.push({pt1:S.rPt1,pt2:sp});pushHist(bricks());}S.rPt1=null;document.getElementById('st-ruler-hint').textContent='clique no 1º ponto';}draw2d();return;}

  if(e.button===0){
    e.preventDefault();
    const c=cellAt(sx,sy);

    // ── Bg image drag/resize ──
    if((bgHitTest(sx,sy)||bgResizeHitTest(sx,sy))&&!e.shiftKey&&!S.drawing){
      bgStartDrag(e.clientX,e.clientY,sx,sy);
      return;
    }

    // ── Handle de stretch do run selecionado ──
    if(S.selectedRun.length && (S.drawMode==='wall'||S.drawMode==='opening')){
      const h=hitTestRunHandle(sx,sy);
      if(h){
        S.stretchMode=true;
        S.stretchEnd=h;
        S.stretchRun=[...S.selectedRun];
        S.stretchDir=S.selectedRunDir;
        if(S.selectedRunType==='opening'){
          // Base = S.openMap sem as células do run original
          const base = {...S.openMap};
          S.stretchRun.forEach(({col,row})=>delete base[kk(col,row)]);
          S.stretchBaseOpenMap = base;
          S.stretchBaseSet = null;
        } else {
          // Base = S.hist[S.hi] sem as células do run original
          const base = new Set(S.hist[S.hi]);
          S.stretchRun.forEach(({col,row})=>base.delete(kk(col,row)));
          S.stretchBaseSet = base;
          S.stretchBaseOpenMap = null;
        }
        return;
      }
    }

    // ── Shift+arrasto = mover run ──
    if(e.shiftKey&&bricks().has(kk(c.col,c.row))){
      S.moveRun=detectRun(c.col,c.row);
      S.moveSC=c.col;S.moveSR=c.row;S.moveDC=0;S.moveDR=0;
      S.moveMode=true;
      cv2.classList.add('moving');
      deselectRun();
      draw2d();
      return;
    }

    // ── Iniciar S.drawing sempre — select vs draw decidido no mouseup ──
    S.drawStartedOnExisting = (S.drawMode==='wall' && bricks().has(kk(c.col,c.row)))
                         || (S.drawMode==='opening' && !!S.openMap[kk(c.col,c.row)]);
    if(S.selectedRun.length) deselectRun();
    S.drawing=true; S.dS=c; S.dE=c; draw2d();
  }
});

window.addEventListener('mouseup',e=>{
  if(S.bgImg.dragging||S.bgImg.resizing){bgEndDrag();return;}
  if(e.button===1&&S.panning){S.panning=false;cv2.classList.remove('panning');}

  // ── Commit stretch ──
  if(e.button===0&&S.stretchMode){
    S.stretchMode=false;
    cv2.style.cursor='crosshair';
    if(S.selectedRun.length){
      if(S.selectedRunType==='opening'){
        // S.openMap já tem o estado final — só commitar
        pushHist(bricks());
        selectOpeningRun(S.selectedRun[0].col, S.selectedRun[0].row);
      } else {
        // Limpar S.wallHMap/S.openMap das células removidas
        const newKeys=new Set(S.selectedRun.map(({col,row})=>kk(col,row)));
        S.stretchRun.forEach(({col,row})=>{
          const k=kk(col,row);
          if(!newKeys.has(k)){ cleanDoorOrient(k); delete S.wallHMap[k]; delete S.openMap[k]; S.slopedKeys.delete(k); }
        });
        pushHist(bricks());
        selectRun(S.selectedRun[0].col, S.selectedRun[0].row);
      }
      clampCourse(); updCourseLabel();
      draw2d(); updSt(); if(S.is3d)build3d();
    }
    S.stretchRun=[]; S.stretchBaseSet=null; S.stretchBaseOpenMap=null;
    return;
  }

  // ── Commit mover (modo Revit) ──
  if(e.button===0&&S.moveMode){
    S.moveMode=false;cv2.classList.remove('moving');
    if(S.moveRun.length&&(S.moveDC!==0||S.moveDR!==0)){
      revitMove(S.moveRun, S.moveDC, S.moveDR);
      if(S.is3d)build3d();
    }
    S.moveRun=[];S.moveDC=0;S.moveDR=0;
    draw2d();updSt();
    return;
  }

  if(e.button===0&&S.drawing&&S.vistaMode!=='elev'){
    if(S.dS&&S.dE){const{cells,ok}=prevLine(S.dS,S.dE);if(ok&&cells.length){
      if(S.drawMode==='wall'){
        // Clique simples numa parede existente → selecionar o run (não desenhar)
        if(cells.length===1 && S.drawStartedOnExisting && S.dS.col===S.dE.col && S.dS.row===S.dE.row){
          const clickedKey=kk(cells[0].col,cells[0].row);
          // Se é uma porta (infCm===0): ciclar orientação em vez de selecionar
          if(S.openMap[clickedKey]&&S.openMap[clickedKey].infCm===0){
            const doorRun=getDoorRun(cells[0].col,cells[0].row);
            const firstKey=doorRun.length?kk(doorRun[0].col,doorRun[0].row):clickedKey;
            S.doorOrient[firstKey]=((S.doorOrient[firstKey]||0)+1)%5;
            S.drawing=false; S.dS=null; S.dE=null; S.drawStartedOnExisting=false;
            draw2d(); return;
          }
          S.drawing=false; S.dS=null; S.dE=null;
          selectRun(cells[0].col, cells[0].row);
          clampCourse(); updCourseLabel();
          draw2d(); updSt();
          S.drawStartedOnExisting=false;
          return;
        }
        const br=bricks();
        // Clique simples numa célula vazia → toggle (remover se já existe sem abertura)
        if(cells.length===1&&br.has(kk(cells[0].col,cells[0].row))&&!S.openMap[kk(cells[0].col,cells[0].row)])br.delete(kk(cells[0].col,cells[0].row));
        else cells.forEach(({col,row})=>br.add(kk(col,row)));
        pushHist(br);
        // Selecionar o run recém desenhado
        if(cells.length) selectRun(cells[0].col, cells[0].row);
      } else if(S.drawMode==='opening'){
        // Clique simples numa abertura existente → selecionar
        if(cells.length===1 && S.openMap[kk(cells[0].col,cells[0].row)] && S.dS.col===S.dE.col && S.dS.row===S.dE.row){
          S.drawing=false; S.dS=null; S.dE=null;
          selectOpeningRun(cells[0].col, cells[0].row);
          clampCourse(); updCourseLabel();
          draw2d(); updSt();
          S.drawStartedOnExisting=false;
          return;
        }
        if(cells.length===1&&S.openMap[kk(cells[0].col,cells[0].row)]){const dk=kk(cells[0].col,cells[0].row);cleanDoorOrient(dk);delete S.openMap[dk];}
        else{const br=bricks();const inf=parseFloat(document.getElementById('inp-oi').value)||0;const sup=parseFloat(document.getElementById('inp-os').value)||210;cells.filter(({col,row})=>br.has(kk(col,row))).forEach(({col,row})=>{S.openMap[kk(col,row)]={infCm:inf,supCm:sup};});}
        pushHist(bricks());
        // Selecionar o run de abertura recém desenhado
        if(cells.length && S.openMap[kk(cells[0].col,cells[0].row)]) selectOpeningRun(cells[0].col, cells[0].row);
      }
      if(S.is3d)build3d();
    }}
    S.drawing=false; S.dS=null; S.dE=null;
    S.drawStartedOnExisting=false;
    clampCourse(); updCourseLabel();
    draw2d(); updSt();
  }
});

cv2.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=cv2.getBoundingClientRect(),sx=e.clientX-rect.left,sy=e.clientY-rect.top;
  if(S.vistaMode==='elev'&&!S.elevPicking){
    const f=e.deltaY<0?1.15:1/1.15;
    const ns=Math.min(Math.max(S.elevSc*f,.1),12);
    S.elevOx=sx-(sx-S.elevOx)*(ns/S.elevSc);
    S.elevOy=sy-(sy-S.elevOy)*(ns/S.elevSc);
    S.elevSc=ns; draw2d(); return;
  }
  const f=e.deltaY<0?1.1:1/1.1,ns=Math.min(Math.max(S.sc2*f,.05),20);
  S.ox=sx-(sx-S.ox)*(ns/S.sc2);S.oy=sy-(sy-S.oy)*(ns/S.sc2);S.sc2=ns;
  if(S.selectedRun.length) posRunPanel();
  draw2d();updSt();
},{passive:false});


// ── Elev pan with middle-button and wheel zoom ────────
cv2.addEventListener('mousedown',e=>{
  if(S.vistaMode!=='elev'||S.elevPicking) return;
  if(e.button===1){
    e.preventDefault();
    S.elevPanning=true;
    S.elevPanSX=e.clientX; S.elevPanSY=e.clientY;
    S.elevPanOX=S.elevOx; S.elevPanOY=S.elevOy;
    cv2.classList.add('panning');
  }
},{capture:true, passive:false});

window.addEventListener('mousemove',e=>{
  if(!S.elevPanning) return;
  S.elevOx=S.elevPanOX+(e.clientX-S.elevPanSX);
  S.elevOy=S.elevPanOY+(e.clientY-S.elevPanSY);
  draw2d();
},{capture:false});

window.addEventListener('mouseup',e=>{
  if(e.button===1&&S.elevPanning){
    S.elevPanning=false;
    cv2.classList.remove('panning');
  }
},{capture:false});

cv2.addEventListener('contextmenu',e=>{e.preventDefault();if(S.rulerOn&&S.rPt1){S.rPt1=null;document.getElementById('st-ruler-hint').textContent='clique no 1º ponto';draw2d();}});
