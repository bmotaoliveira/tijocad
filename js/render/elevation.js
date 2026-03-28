import { S } from '../core/state.js';
import { CELL, BRICK_C, OPEN_C, GROUT_C, RUN_HL } from '../constants.js';
import { bricks, kk, getCellH } from '../core/history.js';
import { analyzeCourse, computeGrauteCells, globalCanalCourses } from '../engine/modulation.js';

function elevRunKey(cells, dir){
  if(!cells.length) return '';
  // Use canonical form: sort cells and use first cell after sort
  // This ensures the key is stable regardless of detection order
  const sorted = [...cells].sort((a,b)=> dir==='H' ? (a.col-b.col)||(a.row-b.row) : (a.row-b.row)||(a.col-b.col));
  const c0 = sorted[0];
  return dir==='H' ? `H:${c0.col},${c0.row}` : `V:${c0.col},${c0.row}`;
}

// ── Detecta todos os runs únicos na planta ──────────
//
// Direção primária de uma célula (sem depender de cIdx):
//   • só vizinhos H          → H
//   • só vizinhos V          → V
//   • T com eixo H           → H
//   • T com eixo V           → V
//   • Cruz ou L-canto        → parede mais longa (empate → H)
// Usada para parar o caminhamento na borda de cada run — impede que
// o braço de uma cruz absorva o nó e o braço oposto na mesma passagem,
// o que gerava 2 runs em vez de 3 para junções em cruz.
function runPrimaryDir(col, row, br){
  const hL=br.has(kk(col-1,row)), hR=br.has(kk(col+1,row));
  const vU=br.has(kk(col,row-1)), vD=br.has(kk(col,row+1));
  const isH=hL||hR, isV=vU||vD;
  if(!isH && !isV) return 'H';        // célula isolada
  if( isH && !isV) return 'H';
  if( isV && !isH) return 'V';
  // Tem vizinhos nos dois eixos (cruz, T ou L)
  if((hL&&hR) && !(vU&&vD)) return 'H';   // T com eixo H
  if((vU&&vD) && !(hL&&hR)) return 'V';   // T com eixo V
  // Cruz simétrica ou L-canto → mede comprimento dos runs
  let hLen=1; for(let c=col-1;br.has(kk(c,row));c--)hLen++;
               for(let c=col+1;br.has(kk(c,row));c++)hLen++;
  let vLen=1; for(let r=row-1;br.has(kk(col,r));r--)vLen++;
               for(let r=row+1;br.has(kk(col,r));r++)vLen++;
  return hLen >= vLen ? 'H' : 'V';
}

function getAllRuns(){
  const br = bricks();
  const visited = new Set();
  const runs = [];
  // Sort keys for deterministic iteration order
  const sortedKeys = [...br].sort();
  sortedKeys.forEach(k => {
    if(visited.has(k)) return;
    const [col,row] = k.split(',').map(Number);
    const dir = runPrimaryDir(col, row, br);
    const run = [];
    if(dir === 'H'){
      // Encontrar início: caminhar esquerda enquanto célula existe E tem dir primária H
      let sc = col;
      while(br.has(kk(sc-1,row)) && runPrimaryDir(sc-1,row,br)==='H') sc--;
      // Coletar da esquerda para direita, parando quando dir primária muda
      for(let c=sc; br.has(kk(c,row)) && runPrimaryDir(c,row,br)==='H'; c++)
        run.push({col:c, row});
    } else {
      let sr = row;
      while(br.has(kk(col,sr-1)) && runPrimaryDir(col,sr-1,br)==='V') sr--;
      for(let r=sr; br.has(kk(col,r)) && runPrimaryDir(col,r,br)==='V'; r++)
        run.push({col, row:r});
    }
    if(!run.length) return;
    const rk = elevRunKey(run, dir);
    if(!runs.find(r=>r.runKey===rk)){
      run.forEach(c=>visited.add(kk(c.col,c.row)));
      runs.push({cells:run, dir, runKey:rk});
    }
  });
  return runs;
}

// ── Manage HTML overlay buttons ──────────────────────
function clearElevButtons(){
  const layer = document.getElementById('elev-btn-layer');
  if(layer) layer.innerHTML = '';
}

function buildElevButtons(){
  clearElevButtons();
  const layer = document.getElementById('elev-btn-layer');
  const runs  = getAllRuns();
  const vp    = document.getElementById('viewport');
  const rect  = S.cv2.getBoundingClientRect();
  const vpRect= vp.getBoundingClientRect();
  const offX  = rect.left - vpRect.left;
  const offY  = rect.top  - vpRect.top;

  runs.forEach(run => {
    // Find or create elevView entry for this run
    let ev = S.elevViews.find(e=>e.runKey===run.runKey);
    if(!ev){
      const n = S.elevViews.length + 1;
      ev = {id:`E${n}`, runKey:run.runKey, dir:run.dir, sideSign:1, name:`E${n}`};
      S.elevViews.push(ev);
    }
    ev.cells = [...run.cells];

    // Mid cell screen position
    const midI = Math.floor(run.cells.length/2);
    const mc   = run.cells[midI];
    const wx   = (mc.col + 0.5) * CELL;  // world coords
    const wy   = (mc.row + 0.5) * CELL;
    const sx   = offX + wx * S.sc2 + S.ox;   // screen coords inside viewport
    const sy   = offY + wy * S.sc2 + S.oy;

    // Arrow symbol based on sideSign and dir
    const arrowSym = run.dir==='H'
      ? (ev.sideSign>0 ? '↑' : '↓')
      : (ev.sideSign>0 ? '→' : '←');

    const btn = document.createElement('button');
    btn.className = 'elev-btn';
    btn.style.left = sx + 'px';
    btn.style.top  = sy + 'px';
    btn.innerHTML  = `<span class="eb-arrow">${arrowSym}</span>${ev.name}`;
    btn.title = `${run.cells.length} módulos · ${run.cells.length*S.cellCm} cm — clique para ver elevação`;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      S.currentElevId = ev.id;
      elevPicking   = false;
      updElevTools();
      clearElevButtons();
      draw2d();
    });

    // Flip on right-click (toggle direction)
    btn.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      ev.sideSign *= -1;
      btn.querySelector('.eb-arrow').textContent = run.dir==='H'
        ? (ev.sideSign>0?'↑':'↓')
        : (ev.sideSign>0?'→':'←');
    });

    layer.appendChild(btn);
  });
}

function updElevTools(){
  const ev      = getCurrentElev();
  const lbl     = document.getElementById('elev-run-lbl');
  const sideLbl = document.getElementById('elev-side-lbl');
  const flipBtn = document.getElementById('elev-flip');
  const backBtn = document.getElementById('elev-back');

  if(elevPicking || !ev){
    lbl.textContent = 'Selecione uma parede';
    sideLbl.style.display = 'none';
    flipBtn.style.display  = 'none';
    backBtn.style.display  = 'none';
  } else {
    const n = ev.cells ? ev.cells.length : 0;
    lbl.textContent = `${ev.name} · ${n} módulos · ${n*S.cellCm} cm`;
    flipBtn.style.display  = '';
    backBtn.style.display  = '';
    sideLbl.style.display  = '';
    sideLbl.textContent = ev.dir==='H'
      ? (ev.sideSign>0 ? '↑ norte' : '↓ sul')
      : (ev.sideSign>0 ? '→ leste' : '← oeste');
  }
}

function getCurrentElev(){
  return S.elevViews.find(e=>e.id===S.currentElevId) || null;
}

// ── draw2d hook: picking vs viewing ─────────────────
function drawElevMode(){
  if(elevPicking){
    // Render the planta (re-use draw2d internals) then show buttons
    drawPlantaForElev();
    // Re-build buttons after draw (positions may have changed with pan/zoom)
    requestAnimationFrame(buildElevButtons);
  } else {
    clearElevButtons();
    drawElevView();
  }
}

// Draws the planta view (bricks, openings, grid) for the elev picking state
// Slightly dimmed so the buttons stand out
function drawPlantaForElev(){
  const W=S.cv2.width, H=S.cv2.height;
  S.cx2.clearRect(0,0,W,H);
  S.cx2.fillStyle=BG; S.cx2.fillRect(0,0,W,H);
  S.cx2.save(); S.cx2.translate(S.ox,S.oy); S.cx2.scale(S.sc2,S.sc2);
  const L=-S.ox/S.sc2, T=-S.oy/S.sc2, R=(W-S.ox)/S.sc2, B=(H-S.oy)/S.sc2;
  const cS=Math.floor(L/CELL)-1, cE=Math.ceil(R/CELL)+1;
  const rS=Math.floor(T/CELL)-1, rE=Math.ceil(B/CELL)+1;
  const br=bricks();

  // bg image
  if(S.bgImg.img){
    S.cx2.save(); S.cx2.globalAlpha=S.bgImg.opacity*0.5;
    const iw=S.bgImg.img.naturalWidth*S.bgImg.scale, ih=S.bgImg.img.naturalHeight*S.bgImg.scale;
    S.cx2.drawImage(S.bgImg.img,S.bgImg.x,S.bgImg.y,iw,ih);
    S.cx2.globalAlpha=1; S.cx2.restore();
  }

  // Bricks at 60% opacity
  S.cx2.globalAlpha = 0.6;
  for(const k of br){
    const[c,r]=k.split(',').map(Number);
    if(c<cS||c>cE||r<rS||r>rE) continue;
    drawBk(c,r,BRICK_C,HOLE_C);
  }
  S.cx2.globalAlpha = 0.7;
  for(const[k,op] of Object.entries(S.openMap)){
    const[c,r]=k.split(',').map(Number);
    if(c<cS||c>cE||r<rS||r>rE) continue;
    drawOpenCell(c,r,op,false);
  }
  S.cx2.globalAlpha = 1;

  // Grid
  S.cx2.strokeStyle=GRID; S.cx2.lineWidth=1/S.sc2; S.cx2.beginPath();
  for(let c=cS;c<=cE;c++){S.cx2.moveTo(c*CELL,rS*CELL);S.cx2.lineTo(c*CELL,rE*CELL);}
  for(let r=rS;r<=rE;r++){S.cx2.moveTo(cS*CELL,r*CELL);S.cx2.lineTo(cE*CELL,r*CELL);}
  S.cx2.stroke();
  S.cx2.restore();
}

// ── Draw elevation on S.cv2 ─────────────────────────────
function drawElevView(){
  const W=S.cv2.width, H=S.cv2.height;
  S.cx2.clearRect(0,0,W,H);
  S.cx2.fillStyle='#f8f7f6'; S.cx2.fillRect(0,0,W,H);

  const ev=getCurrentElev();
  if(!ev||!ev.cells||!ev.cells.length) return;

  // Re-detect cells
  const fresh=detectRun(ev.cells[0].col,ev.cells[0].row);
  if(fresh.length) ev.cells=fresh;

  let ordered=[...ev.cells];
  if(ev.dir==='H') ordered.sort((a,b)=>a.col-b.col);
  else             ordered.sort((a,b)=>a.row-b.row);
  if(ev.sideSign<0) ordered=ordered.reverse();

  const n=ordered.length;
  const maxC=maxCourses();
  const PAD_L=46, PAD_B=30, PAD_T=14, PAD_R=18;
  const EC_W=Math.max(8,Math.min(60,Math.floor((W-PAD_L-PAD_R)/n)));
  const EC_H=Math.round(EC_W*(S.brickHCm/S.cellCm));
  const totalH=maxC*EC_H;
  const elevH=totalH+PAD_T+PAD_B;
  const vOff=Math.max(0,Math.floor((H-elevH)/2));

  S.cx2.save();
  S.cx2.translate(S.elevOx, S.elevOy);
  S.cx2.scale(S.elevSc, S.elevSc);
  S.cx2.translate(0,vOff);

  const groutCells=computeGrauteCells();
  const cds=[];
  for(let ci=0;ci<maxC;ci++) cds.push(analyzeCourse(ci));

  const xiMap=new Map();
  ordered.forEach((cell,xi)=>xiMap.set(kk(cell.col,cell.row),xi));

  // Stripes
  for(let cIdx=0;cIdx<maxC;cIdx++){
    const yTop=PAD_T+(maxC-1-cIdx)*EC_H;
    S.cx2.fillStyle=cIdx%2===0?'rgba(0,0,0,0.03)':'rgba(0,0,0,0.06)';
    S.cx2.fillRect(PAD_L,yTop,n*EC_W,EC_H);
  }

  // Tijolos
  for(let cIdx=0;cIdx<maxC;cIdx++){
    const cd=cds[cIdx];
    const yTop=PAD_T+(maxC-1-cIdx)*EC_H;
    const drawn=new Set();
    ordered.forEach((cell,xi)=>{
      const k=kk(cell.col,cell.row);
      if(drawn.has(k)) return;
      const info=cd.get(k);
      const x=PAD_L+xi*EC_W;
      if(!info){
        const op=S.openMap[k];
        const bot=cIdx*S.brickHCm;
        if(op&&bot>=op.infCm&&bot<op.supCm){
          S.cx2.fillStyle='#c8dff0';S.cx2.fillRect(x,yTop,EC_W,EC_H);
          S.cx2.strokeStyle='rgba(26,95,180,0.3)';S.cx2.lineWidth=0.5;
          S.cx2.strokeRect(x+.5,yTop+.5,EC_W-1,EC_H-1);
        }
        return;
      }
      let bx=x, bw=EC_W;
      if(info.partner&&xiMap.has(info.partner)){
        const pxi=xiMap.get(info.partner);
        const minXi=Math.min(xi,pxi);
        if(xi!==minXi){drawn.add(k);return;}
        bx=PAD_L+minXi*EC_W; bw=2*EC_W;
        drawn.add(info.partner);
      } else if(!info.isFirst){drawn.add(k);return;}
      drawn.add(k);
      S.cx2.fillStyle=TYPE_COLOR[info.type]||'#888';
      S.cx2.fillRect(bx,yTop,bw,EC_H);
      // Canal de graute: canaleta normal OU corte-especial que veio de canaleta
      // Só pintar com graute se NÃO tiver conduíte horizontal passando NESTA fiada
      if(info.type==='canaleta'||info.type==='meia-canaleta'||info.wasCanal){
        const canalKeys=computeConduitCanalKeys();
        const hasConduit=(canalKeys.has(k)&&canalKeys.get(k).has(cIdx))||
                         (info.partner&&canalKeys.has(info.partner)&&canalKeys.get(info.partner).has(cIdx));
        if(!hasConduit){
          S.cx2.fillStyle=GROUT_C;
          if(bw>=EC_H) S.cx2.fillRect(bx+bw*.04, yTop+EC_H*.28, bw*.92, EC_H*.44);
          else         S.cx2.fillRect(bx+bw*.28, yTop+EC_H*.04, bw*.44, EC_H*.92);
        }
      }
      // (slope line drawn as polyline after all bricks — see below)
      S.cx2.strokeStyle='rgba(0,0,0,0.55)';S.cx2.lineWidth=0.7;
      S.cx2.strokeRect(bx+.5,yTop+.5,bw-1,EC_H-1);
    });
  }

  // Linha de topo inclinado — polyline laranja conectando topo de células com slope
  {
    S.cx2.save();
    S.cx2.strokeStyle='#FF6600'; S.cx2.lineWidth=2; S.cx2.lineJoin='round';
    // Collect slope segments: consecutive cells in ordered with S.slopedKeys
    let inSlope=false, pts=[];
    ordered.forEach((cell,xi)=>{
      const k=kk(cell.col,cell.row);
      if(S.slopedKeys.has(k)){
        const cellH=getCellH(k);
        // Y position of the actual top of this cell (real height, not course-rounded)
        const yActual = PAD_T + (maxC - cellH/S.brickHCm)*EC_H;
        // Left and right X of this cell
        const xL=PAD_L+xi*EC_W, xR=PAD_L+(xi+1)*EC_W;
        if(!inSlope){
          // Start new segment: entry point at left edge, interpolate with previous cell
          pts=[[xL, yActual]];
          inSlope=true;
        }
        pts.push([xR, yActual]);
      } else {
        if(inSlope && pts.length>1){
          S.cx2.beginPath();
          S.cx2.moveTo(pts[0][0],pts[0][1]);
          for(let i=1;i<pts.length;i++) S.cx2.lineTo(pts[i][0],pts[i][1]);
          S.cx2.stroke();
        }
        inSlope=false; pts=[];
      }
    });
    // Flush last segment
    if(inSlope && pts.length>1){
      S.cx2.beginPath();
      S.cx2.moveTo(pts[0][0],pts[0][1]);
      for(let i=1;i<pts.length;i++) S.cx2.lineTo(pts[i][0],pts[i][1]);
      S.cx2.stroke();
    }
    S.cx2.restore();
  }

  // Graute overlay — retângulo vertical da base ao topo da parede
  // Uma coluna de graute é desenhada por célula grauteada, do chão até getCellH(k).
  S.cx2.save();
  ordered.forEach((cell,xi)=>{
    const k=kk(cell.col,cell.row);
    if(!groutCells.has(k)) return;
    const cellH=getCellH(k);
    const topCourse=Math.ceil(cellH/S.brickHCm);
    const gx=PAD_L+xi*EC_W;
    const gy=PAD_T+(maxC-topCourse)*EC_H;
    const gh=topCourse*EC_H;
    const gw=EC_W;
    S.cx2.fillStyle='rgba(40,40,40,0.28)';
    S.cx2.fillRect(gx+gw*0.25, gy, gw*0.5, gh);
    // thin border
    S.cx2.strokeStyle='rgba(0,0,0,0.35)'; S.cx2.lineWidth=0.5;
    S.cx2.strokeRect(gx+gw*0.25+.5, gy+.5, gw*0.5-1, gh-1);
  });
  S.cx2.restore();

  // Conduítes na elevação: V=tubo vertical, H=linha horizontal na altura da caixa
  {
    const pxPerCmE = EC_W / S.cellCm;
    const pxPerH   = EC_H / S.brickHCm;

    // Build ordered cell index for quick lookup
    const orderedIdx = new Map(); // cellKey → xi
    ordered.forEach((cell,xi)=>orderedIdx.set(kk(cell.col,cell.row),xi));

    S.conduits.forEach(cd=>{
      const cfg=_conduitCfg(cd.ctype);
      const fill  = cfg.color2d.replace(/rgba?\([^)]+\)/,cfg.color2d)||cfg.color2d;
      const stroke= cfg.colorStroke;
      const tubeW = Math.max(2, EC_W*0.18);

      if(cd.axis==='Z'){
        const xi=orderedIdx.get(cd.fromKey);
        if(xi===undefined) return;
        const gx=PAD_L+xi*EC_W;
        const fromHCm = cd.fromHeightCm??0;
        const toHCm   = cd.toHeightCm??getCellH(cd.fromKey);
        const yBot = PAD_T + maxC*EC_H - Math.min(fromHCm,toHCm)*pxPerH;
        const yTop = PAD_T + maxC*EC_H - Math.max(fromHCm,toHCm)*pxPerH;
        const gh   = Math.max(2, yBot-yTop);
        const tubeX= gx+(EC_W-tubeW)/2;
        S.cx2.save();
        S.cx2.fillStyle=fill+'99';
        S.cx2.fillRect(tubeX,yTop,tubeW,gh);
        S.cx2.strokeStyle=stroke;S.cx2.lineWidth=0.8;
        S.cx2.strokeRect(tubeX+.5,yTop+.5,tubeW-1,gh-1);
        S.cx2.restore();
      } else {
        // XY or L: draw horizontal line segments between consecutive path cells visible in this elevation
        const hCm=cd.fromHeightCm??0;
        const yLine=PAD_T+maxC*EC_H-hCm*pxPerH;
        // Collect visible xi positions along the path
        const xiList=cd.path.map(p=>orderedIdx.get(kk(p.col,p.row))).filter(x=>x!==undefined);
        if(xiList.length<2) return;
        const xMin=Math.min(...xiList), xMax=Math.max(...xiList);
        S.cx2.save();
        S.cx2.strokeStyle=fill; S.cx2.lineWidth=Math.max(2,EC_W*0.18); S.cx2.lineCap='round';
        S.cx2.beginPath();
        S.cx2.moveTo(PAD_L+xMin*EC_W, yLine);
        S.cx2.lineTo(PAD_L+(xMax+1)*EC_W, yLine);
        S.cx2.stroke();
        [xMin,xMax].forEach(xi=>{
          const gx=PAD_L+xi*EC_W+EC_W/2;
          S.cx2.fillStyle=stroke;S.cx2.beginPath();S.cx2.arc(gx,yLine,Math.max(2,EC_W*0.15),0,Math.PI*2);S.cx2.fill();
        });
        S.cx2.restore();
      }
    });

    // S.manualElec/Water (legacy) as vertical tubes full height
    [[S.manualElec,'#F5C800','rgba(184,151,10,0.7)'],[S.manualWater,'#1A7EC8','rgba(14,90,150,0.7)']].forEach(([mset,fill,stroke])=>{
      S.cx2.save();
      ordered.forEach((cell,xi)=>{
        const k=kk(cell.col,cell.row);
        if(!mset.has(k)) return;
        const cellH=getCellH(k);
        const topC=Math.ceil(cellH/S.brickHCm);
        const gx=PAD_L+xi*EC_W, gy=PAD_T+(maxC-topC)*EC_H, gh=topC*EC_H;
        const tubeW=Math.max(2,EC_W*0.22);
        const tubeX=gx+(EC_W-tubeW)/2;
        S.cx2.fillStyle=fill+'88';S.cx2.fillRect(tubeX,gy,tubeW,gh);
        S.cx2.strokeStyle=stroke;S.cx2.lineWidth=0.8;S.cx2.strokeRect(tubeX+.5,gy+.5,tubeW-1,gh-1);
      });
      S.cx2.restore();
    });
  }

  // Caixas elétricas na elevação
  // face = lado da parede onde a caixa está (igual sideSign significa câmera vê a caixa)
  {
    const pxPerCmE = EC_W / S.cellCm;
    const pxPerH   = EC_H / S.brickHCm;
    ordered.forEach((cell, xi)=>{
      const k=kk(cell.col,cell.row);
      if(!S.elecBoxes.has(k)) return;
      const arr=S.elecBoxes.get(k);
      arr.forEach(eb=>{
        if(eb.face !== ev.sideSign) return; // mostrar só as caixas voltadas para a câmera
        const ebWpx = Math.max(6, eb.wCm * pxPerCmE);
        const ebHpx = Math.max(4, eb.hCm * pxPerH);
        const yCenPx = PAD_T + maxC*EC_H - eb.heightCm*pxPerH;
        const yTop2  = yCenPx - ebHpx/2;
        const xLeft  = PAD_L + xi*EC_W + (EC_W - ebWpx)/2;
        S.cx2.save();
        S.cx2.fillStyle='rgba(245,200,0,0.88)';
        S.cx2.strokeStyle='#B8970A'; S.cx2.lineWidth=1.2;
        S.cx2.fillRect(xLeft, yTop2, ebWpx, ebHpx);
        S.cx2.strokeRect(xLeft+.5, yTop2+.5, ebWpx-1, ebHpx-1);
        if(EC_W>14){
          S.cx2.font=`bold ${Math.max(5,Math.min(9,EC_W*0.32))}px Inter,sans-serif`;
          S.cx2.fillStyle='#333'; S.cx2.textAlign='center'; S.cx2.textBaseline='middle';
          S.cx2.fillText(eb.type.toUpperCase(), xLeft+ebWpx/2, yTop2+ebHpx/2);
        }
        S.cx2.restore();
      });
    });
  }


  // Pontos hidráulicos na elevação — círculos azuis na face
  {
    const pxPerH = EC_H / S.brickHCm;
    ordered.forEach((cell, xi)=>{
      const k=kk(cell.col,cell.row);
      if(!S.hydroPoints.has(k)) return;
      const arr=S.hydroPoints.get(k);
      arr.forEach(hp=>{
        if(hp.face === ev.sideSign) return; // só mostra face oposta à câmera
        const yCenPx = PAD_T + maxC*EC_H - hp.heightCm*pxPerH;
        const xCenPx = PAD_L + xi*EC_W + EC_W/2;
        const rad = Math.max(3, Math.min(EC_W*0.28, hp.diamMm/10 * (EC_W/S.cellCm) * 0.5));
        S.cx2.save();
        S.cx2.fillStyle='rgba(26,126,200,0.85)';
        S.cx2.strokeStyle='#0d4a7a'; S.cx2.lineWidth=1.2;
        S.cx2.beginPath(); S.cx2.arc(xCenPx, yCenPx, rad, 0, Math.PI*2); S.cx2.fill(); S.cx2.stroke();
        S.cx2.strokeStyle='#fff'; S.cx2.lineWidth=0.8;
        S.cx2.beginPath();
        S.cx2.moveTo(xCenPx-rad*0.55,yCenPx); S.cx2.lineTo(xCenPx+rad*0.55,yCenPx);
        S.cx2.moveTo(xCenPx,yCenPx-rad*0.55); S.cx2.lineTo(xCenPx,yCenPx+rad*0.55);
        S.cx2.stroke();
        S.cx2.restore();
      });
    });
  }
  // Nas alturas de grampo (55cm e 155cm), nas células que são pontos de grampo
  {
    const grampoData = computeGrampos();
    const grampoHeights = [GRAMPO_H1, GRAMPO_H2, GRAMPO_H3, GRAMPO_H4];
    const xiMap2 = new Map();
    ordered.forEach((cell,xi)=>xiMap2.set(kk(cell.col,cell.row),xi));

    // Coletar células de grampo que pertencem ao run desta elevação
    grampoData.forEach(g=>{
      const cellsInRun = g.cells.filter(k=>xiMap2.has(k));
      if(!cellsInRun.length) return;

      grampoHeights.forEach(hCm=>{
        const pxPerH2 = EC_H / S.brickHCm;
        const yCen = PAD_T + maxC*EC_H - hCm*pxPerH2; // centre of grampo bar

        cellsInRun.forEach(k=>{
          const xi = xiMap2.get(k);
          const gx = PAD_L + xi*EC_W;
          // Outer rect = tijolo cell
          // Inner rect = seção do grampo (menor, centralizado)
          const iw = EC_W * 0.70;
          const ih = Math.max(3, EC_H * 0.28);
          const ix = gx + (EC_W - iw)/2;
          const iy = yCen - ih/2;

          S.cx2.save();
          S.cx2.fillStyle='rgba(30,30,30,0.20)';
          S.cx2.fillRect(ix, iy, iw, ih);
          S.cx2.strokeStyle='rgba(30,30,30,0.85)';
          S.cx2.lineWidth = Math.max(1, EC_W * 0.08);
          S.cx2.strokeRect(ix+.5, iy+.5, iw-1, ih-1);
          S.cx2.restore();
        });
      });
    });
  }

  // Eixo Y
  S.cx2.font=`${Math.max(8,Math.min(11,EC_H*.7))}px 'Courier New',monospace`;
  S.cx2.textAlign='right'; S.cx2.fillStyle='#666';
  for(let cIdx=0;cIdx<=maxC;cIdx++){
    const y=PAD_T+(maxC-cIdx)*EC_H;
    S.cx2.strokeStyle='rgba(0,0,0,0.12)';S.cx2.lineWidth=0.5;
    S.cx2.beginPath();S.cx2.moveTo(PAD_L,y);S.cx2.lineTo(PAD_L+n*EC_W,y);S.cx2.stroke();
    S.cx2.fillText(Math.round(cIdx*S.brickHCm),PAD_L-4,y+3);
  }
  // Eixo X
  if(EC_W>=14){
    S.cx2.font=`${Math.max(7,Math.min(10,EC_W*.55))}px 'Courier New',monospace`;
    S.cx2.textAlign='center'; S.cx2.fillStyle='#888';
    ordered.forEach((_,xi)=>S.cx2.fillText(String(xi+1),PAD_L+(xi+.5)*EC_W,PAD_T+totalH+14));
  }
  S.cx2.font='bold 10px Inter,sans-serif';S.cx2.textAlign='center';S.cx2.fillStyle='#444';
  S.cx2.fillText(`${n*S.cellCm} cm`,PAD_L+n*EC_W/2,PAD_T+totalH+PAD_B-4);

  // Borda externa
  S.cx2.strokeStyle='#444';S.cx2.lineWidth=1.2;
  S.cx2.strokeRect(PAD_L,PAD_T,n*EC_W,totalH);

  // Label
  const evl=getCurrentElev();
  S.cx2.font='bold 12px Inter,sans-serif';S.cx2.textAlign='left';S.cx2.fillStyle='#8B3A0F';
  S.cx2.fillText(evl?evl.name:'',PAD_L,PAD_T-3);

  S.cx2.restore();
}

// Overlay na planta (quando em planta mode, mostra câmera do elev atual)
function drawElevOverlay(){
  const ev=getCurrentElev();
  if(!ev||!ev.cells||!ev.cells.length) return;
  const cells=ev.cells;
  S.cx2.save();
  S.cx2.strokeStyle='rgba(26,95,180,0.7)'; S.cx2.lineWidth=2.5/S.sc2;
  S.cx2.setLineDash([5/S.sc2,3/S.sc2]);
  cells.forEach(({col,row})=>{
    S.cx2.strokeRect(col*CELL+1/S.sc2,row*CELL+1/S.sc2,CELL-2/S.sc2,CELL-2/S.sc2);
  });
  S.cx2.setLineDash([]);
  S.cx2.restore();
}



// ═══════════════════════════════════════════════════
// CAIXA ELÉTRICA ENGINE
// ═══════════════════════════════════════════════════
const EBOX_TYPES = {
  '4x2': { wCm: 10.2, hCm: 5.1,  depthCm: 5.0, label: 'Caixa 4×2"' },
  '4x4': { wCm: 10.2, hCm: 10.2, depthCm: 5.0, label: 'Caixa 4×4"' },
  'qd':  { wCm: 30,   hCm: 40,   depthCm: 12,  label: 'Quadro Dist.' },
};
const EBOX_HEIGHTS = { '30':100, '100':100, '180':180, 'custom':100 };

let ebpopCell = null; // {col,row}
let ebpopIdx  = -1;  // index into S.elecBoxes array for current cell (-1 = new)