import { S } from '../core/state.js';
import { CELL, BG, GRID, HOVER_C, BRICK_C, BRICK_HC, HOLE_C, PREV_C, PREV_INV, OPEN_C, OPEN_HC, RUN_HL, DIM_C, GROUT_C, TYPE_COLOR, TYPE_HOLE } from '../constants.js';
import { bricks, kk, getCellH } from '../core/history.js';
import { analyzeCourse, computeGrauteCells, computeGrampos, globalCanalCourses, grampoLenM, countGrampos } from '../engine/modulation.js';
import { computeConduitCanalCells, computeConduitCanalKeys, CONDUIT_CFG, hitTestEbox, eboxBarRect, drawEboxHighlight, hitTestHydro, hydroBarRect, drawHydroHighlight, hitTestGas, gasBarRect, drawGasHighlight } from '../engine/conduits.js';
import { drawElevOverlay, drawElevMode } from './elevation.js';

export const cv2=document.getElementById('cv2'), cx2=cv2.getContext('2d');
// Initialize S refs so other modules (conduits, elevation) can access them via S.cv2
S.cv2=cv2; S.cx2=cx2;

function resize2d(){
  const vp=document.getElementById('viewport');
  cv2.width=vp.offsetWidth;cv2.height=vp.offsetHeight;
  if(!S.ox&&!S.oy){S.ox=cv2.width/2;S.oy=cv2.height/2;}
  draw2d();
}
window.addEventListener('resize',()=>{if(!S.is3d)resize2d();else resize3d();});

const cellAt=(sx,sy)=>({col:Math.floor((sx-S.ox)/S.sc2/CELL),row:Math.floor((sy-S.oy)/S.sc2/CELL)});
const snapAt=(sx,sy)=>({col:Math.round((sx-S.ox)/S.sc2/CELL),row:Math.round((sy-S.oy)/S.sc2/CELL)});

function prevLine(s,e){
  if(!s||!e)return{cells:[],ok:false};
  const dc=e.col-s.col,dr=e.row-s.row;
  if(dc&&dr)return{cells:[],ok:false};
  const cells=[];
  if(!dc){const st=dr>0?1:-1;for(let r=s.row;r!==e.row+st;r+=st)cells.push({col:s.col,row:r});}
  else   {const st=dc>0?1:-1;for(let c=s.col;c!==e.col+st;c+=st)cells.push({col:c,row:s.row});}
  return{cells,ok:true};
}
function detectRun(col,row){
  const br=bricks();
  const dir=runPrimaryDir(col,row,br);
  const run=[];
  if(dir==='H'){
    let sc=col;
    while(br.has(kk(sc-1,row))&&runPrimaryDir(sc-1,row,br)==='H')sc--;
    for(let c=sc;br.has(kk(c,row))&&runPrimaryDir(c,row,br)==='H';c++)run.push({col:c,row});
  } else {
    let sr=row;
    while(br.has(kk(col,sr-1))&&runPrimaryDir(col,sr-1,br)==='V')sr--;
    for(let r=sr;br.has(kk(col,r))&&runPrimaryDir(col,r,br)==='V';r++)run.push({col,row:r});
  }
  return run;
}

// Detecta um run de aberturas contíguas na mesma direção da parede subjacente
function detectOpeningRun(col,row){
  const k0=kk(col,row);
  if(!S.openMap[k0]) return [];
  const br=bricks();
  const dir=runPrimaryDir(col,row,br);
  const run=[];
  if(dir==='H'){
    let sc=col;
    while(S.openMap[kk(sc-1,row)]&&runPrimaryDir(sc-1,row,br)==='H') sc--;
    for(let c=sc; S.openMap[kk(c,row)]&&runPrimaryDir(c,row,br)==='H'; c++) run.push({col:c,row});
  } else {
    let sr=row;
    while(S.openMap[kk(col,sr-1)]&&runPrimaryDir(col,sr-1,br)==='V') sr--;
    for(let r=sr; S.openMap[kk(col,r)]&&runPrimaryDir(col,r,br)==='V'; r++) run.push({col,row:r});
  }
  return run;
}

function dimLbl(p1,p2){const dx=(p2.col-p1.col)*S.cellCm,dy=(p2.row-p1.row)*S.cellCm,d=Math.sqrt(dx*dx+dy*dy),r=Math.round(d*10)/10;return(Number.isInteger(r)?r.toFixed(0):r.toFixed(1))+' cm';}
// dimMid respeita o campo side (1 = esquerda/cima, -1 = direita/baixo)
function dimMid(p1,p2,side){
  const s=side??1;
  const x1=p1.col*CELL,y1=p1.row*CELL,x2=p2.col*CELL,y2=p2.row*CELL;
  const dx=x2-x1,dy=y2-y1,l=Math.sqrt(dx*dx+dy*dy);
  if(l<.001)return{x:x1,y:y1};
  return{x:(x1+x2)/2+(-dy/l)*CELL*1.5*s,y:(y1+y2)/2+(dx/l)*CELL*1.5*s};
}
function dimHit(sx,sy,hr){
  for(let i=S.dims.length-1;i>=0;i--){
    const m=dimMid(S.dims[i].pt1,S.dims[i].pt2,S.dims[i].side);
    const dx=m.x*S.sc2+S.ox-sx,dy=m.y*S.sc2+S.oy-sy;
    if(Math.sqrt(dx*dx+dy*dy)<=hr)return i;
  }
  return -1;
}

// ── Draw cell (planta mode) ────────────────────────
function drawBk(col,row,fill,hole){
  const x=col*CELL,y=row*CELL;
  cx2.fillStyle=fill;cx2.fillRect(x,y,CELL,CELL);
  cx2.beginPath();cx2.arc(x+CELL/2,y+CELL/2,(CELL*.55)/2,0,Math.PI*2);cx2.fillStyle=hole;cx2.fill();
  cx2.strokeStyle='rgba(0,0,0,0.75)';cx2.lineWidth=2/S.sc2;cx2.strokeRect(x+1/S.sc2,y+1/S.sc2,CELL-2/S.sc2,CELL-2/S.sc2);
}
// Limpa a orientação de porta quando uma célula de abertura infCm===0 é removida
function cleanDoorOrient(k){
  const op=S.openMap[k]; if(!op||op.infCm!==0) return;
  const[c,r]=k.split(',').map(Number);
  const run=getDoorRun(c,r);
  // Só limpa se essa célula ERA a primeira do run
  if(run.length&&kk(run[0].col,run[0].row)===k) delete S.doorOrient[k];
}

function drawOpenCell(col,row,op,hover){
  const x=col*CELL,y=row*CELL;
  cx2.fillStyle=hover?OPEN_HC:OPEN_C;cx2.fillRect(x,y,CELL,CELL);
  const p=CELL*.1;cx2.strokeStyle='#1a5fb4';cx2.lineWidth=1/S.sc2;cx2.strokeRect(x+p,y+p,CELL-p*2,CELL-p*2);
  const isDoor=op.infCm===0;
  cx2.save();cx2.strokeStyle='#1a5fb4';cx2.lineWidth=1.2/S.sc2;
  // Janelas: duas linhas horizontais
  if(!isDoor){const y1=y+CELL*.38,y2=y+CELL*.62;cx2.beginPath();cx2.moveTo(x+p,y1);cx2.lineTo(x+CELL-p,y1);cx2.stroke();cx2.beginPath();cx2.moveTo(x+p,y2);cx2.lineTo(x+CELL-p,y2);cx2.stroke();}
  // Portas: fundo azul apenas — símbolo desenhado depois por drawDoorRuns()
  cx2.restore();
}

// ── Helper: detecta run de porta (infCm===0) a partir de (col,row) ──
function getDoorRun(col,row){
  const k0=kk(col,row);
  if(!S.openMap[k0]||S.openMap[k0].infCm!==0) return [];
  const br=bricks();
  const dir=runPrimaryDir(col,row,br);
  const run=[];
  if(dir==='H'){
    let sc=col;
    while(S.openMap[kk(sc-1,row)]&&S.openMap[kk(sc-1,row)].infCm===0) sc--;
    for(let c=sc;S.openMap[kk(c,row)]&&S.openMap[kk(c,row)].infCm===0;c++) run.push({col:c,row});
  } else {
    let sr=row;
    while(S.openMap[kk(col,sr-1)]&&S.openMap[kk(col,sr-1)].infCm===0) sr--;
    for(let r=sr;S.openMap[kk(col,r)]&&S.openMap[kk(col,r)].infCm===0;r++) run.push({col,row:r});
  }
  return run;
}

// ── Desenha símbolo arquitetônico de porta (arco 90° + folha) ──
// orient 0-3 (cicla com clique): 4 combinações de hinge+swing
// Para parede H:
//   0 = hinge esq, abre p/ cima (canvas -Y)
//   1 = hinge dir, abre p/ cima
//   2 = hinge dir, abre p/ baixo
//   3 = hinge esq, abre p/ baixo
// Para parede V: lógica simétrica rotacionada 90°
function drawDoorSymbol(run,dir,orient,hov){
  if(!run.length) return;
  if(orient===4) return; // estado "sem porta" — só abertura, sem símbolo
  const first=run[0], last=run[run.length-1];
  cx2.save();
  const clr=hov?'#1040a0':'#1a5fb4';
  cx2.strokeStyle=clr; cx2.lineWidth=1.8/S.sc2; cx2.setLineDash([]);

  if(dir==='H'){
    const x0=first.col*CELL, x1=(last.col+1)*CELL;
    const y=first.row*CELL+CELL/2;  // eixo central da parede
    const L=x1-x0;

    const hingeLeft = orient===0||orient===3;
    const opensUp   = orient===0||orient===1;
    const hX = hingeLeft?x0:x1;
    const swingY = y+(opensUp?-L:L);

    // Folha fechada (linha ao longo da parede)
    cx2.lineWidth=1.6/S.sc2;
    cx2.beginPath(); cx2.moveTo(x0,y); cx2.lineTo(x1,y); cx2.stroke();

    // Folha aberta (perpendicular ao hinge)
    cx2.lineWidth=1.6/S.sc2;
    cx2.beginPath(); cx2.moveTo(hX,y); cx2.lineTo(hX,swingY); cx2.stroke();

    // Arco de 90°
    cx2.lineWidth=1/S.sc2;
    cx2.setLineDash([3/S.sc2,2/S.sc2]);
    cx2.beginPath();
    if(hingeLeft&&opensUp)   cx2.arc(hX,y,L, 0,        -Math.PI/2, true );
    if(hingeLeft&&!opensUp)  cx2.arc(hX,y,L, 0,         Math.PI/2, false);
    if(!hingeLeft&&opensUp)  cx2.arc(hX,y,L, Math.PI,  -Math.PI/2, false);
    if(!hingeLeft&&!opensUp) cx2.arc(hX,y,L, Math.PI,   Math.PI/2, true );
    cx2.stroke();

  } else { // dir==='V'
    const y0=first.row*CELL, y1=(last.row+1)*CELL;
    const x=first.col*CELL+CELL/2;
    const L=y1-y0;

    // orient 0 = hinge topo, abre esq
    // orient 1 = hinge baixo, abre esq
    // orient 2 = hinge baixo, abre dir
    // orient 3 = hinge topo, abre dir
    const hingeTop  = orient===0||orient===3;
    const opensLeft = orient===0||orient===1;
    const hY = hingeTop?y0:y1;
    const swingX = x+(opensLeft?-L:L);

    // Folha fechada
    cx2.lineWidth=1.6/S.sc2;
    cx2.beginPath(); cx2.moveTo(x,y0); cx2.lineTo(x,y1); cx2.stroke();

    // Folha aberta
    cx2.lineWidth=1.6/S.sc2;
    cx2.beginPath(); cx2.moveTo(x,hY); cx2.lineTo(swingX,hY); cx2.stroke();

    // Arco de 90°
    cx2.lineWidth=1/S.sc2;
    cx2.setLineDash([3/S.sc2,2/S.sc2]);
    cx2.beginPath();
    const sA=hingeTop?Math.PI/2:-Math.PI/2;
    if(hingeTop&&opensLeft)    cx2.arc(x,hY,L, sA, Math.PI, false);
    if(hingeTop&&!opensLeft)   cx2.arc(x,hY,L, sA, 0,       true );
    if(!hingeTop&&opensLeft)   cx2.arc(x,hY,L, sA, Math.PI, true );
    if(!hingeTop&&!opensLeft)  cx2.arc(x,hY,L, sA, 0,       false);
    cx2.stroke();
  }

  cx2.restore();
}

// ── Desenha todos os símbolos de porta na vista planta ──────────────
function drawDoorRuns(cS,cE,rS,rE){
  const visited=new Set();
  const br=bricks();
  for(const[k,op] of Object.entries(S.openMap)){
    if(op.infCm!==0) continue;
    if(visited.has(k)) continue;
    const[c,r]=k.split(',').map(Number);
    if(c<cS||c>cE||r<rS||r>rE){visited.add(k);continue;}
    const run=getDoorRun(c,r);
    if(!run.length){visited.add(k);continue;}
    run.forEach(({col,row})=>visited.add(kk(col,row)));
    const firstKey=kk(run[0].col,run[0].row);
    const orient=S.doorOrient[firstKey]||0;
    const dir=runPrimaryDir(run[0].col,run[0].row,br);
    // hover: alguma célula do run está sob o cursor?
    const hov=S.hcell&&run.some(({col,row})=>col===S.hcell.col&&row===S.hcell.row);
    drawDoorSymbol(run,dir,orient,hov);
  }
}

// ── Draw brick unit (fiada mode) ──────────────────
function drawBrickUnit(col, row, info, _sel, hovered, groutCells, cIdx, condHMap, conduitCanalCells2d){
  if(!info.isFirst) return;
  const x=col*CELL, y=row*CELL;
  const fc=TYPE_COLOR[info.type], fh=TYPE_HOLE[info.type];
  let bx=x, by=y, bw=CELL, bht=CELL;
  let holeSpots=[{cx:x+CELL/2, cy:y+CELL/2, key:kk(col,row)}];
  if(info.partner){
    const [pc,pr]=info.partner.split(',').map(Number);
    const minC=Math.min(col,pc), minR=Math.min(row,pr);
    bx=minC*CELL; by=minR*CELL;
    bw=(Math.abs(pc-col)+1)*CELL; bht=(Math.abs(pr-row)+1)*CELL;
    holeSpots=[
      {cx:col*CELL+CELL/2, cy:row*CELL+CELL/2, key:kk(col,row)},
      {cx:pc*CELL+CELL/2,  cy:pr*CELL+CELL/2,  key:kk(pc,pr)},
    ];
  }
  cx2.fillStyle=fc; cx2.fillRect(bx,by,bw,bht);
  if(info.type==='canaleta'||info.type==='meia-canaleta'||info.wasCanal){
    const canalKey=kk(col,row);
    const cdH=condHMap&&(condHMap.get(canalKey)||(info.partner&&condHMap.get(info.partner)));
    if(cdH){
      // Conduíte passando: pintar com cor do conduíte, sem graute
      const canalColor=_conduitCfg(cdH.ctype).color2d;
      cx2.fillStyle=canalColor;
      if(bw>=bht) cx2.fillRect(bx+bw*.04, by+bht*.28, bw*.92, bht*.44);
      else        cx2.fillRect(bx+bw*.28, by+bht*.04, bw*.44, bht*.92);
    } else if(!conduitCanalCells2d||(
      !(conduitCanalCells2d.has(canalKey)&&conduitCanalCells2d.get(canalKey).has(cIdx??0))&&
      !(info.partner&&conduitCanalCells2d.has(info.partner)&&conduitCanalCells2d.get(info.partner).has(cIdx??0))
    )){
      // Canaleta estrutural sem conduíte: graute normal
      cx2.fillStyle=GROUT_C;
      if(bw>=bht) cx2.fillRect(bx+bw*.04, by+bht*.28, bw*.92, bht*.44);
      else        cx2.fillRect(bx+bw*.28, by+bht*.04, bw*.44, bht*.92);
    }
    // else: célula tem conduíte XY mas condHMap não tem (ex: fiada diferente) → sem graute
  } else {
    const r=(CELL*.42)/2;
    holeSpots.forEach(h=>{
      const isGrout=groutCells&&groutCells.has(h.key);
      cx2.fillStyle=isGrout?GROUT_C:fh;
      cx2.beginPath();cx2.arc(h.cx,h.cy,r,0,Math.PI*2);cx2.fill();
      if(isGrout){cx2.strokeStyle='rgba(0,0,0,0.4)';cx2.lineWidth=1/S.sc2;cx2.beginPath();cx2.arc(h.cx,h.cy,r,0,Math.PI*2);cx2.stroke();}
    });
  }
  cx2.strokeStyle='rgba(0,0,0,0.80)';cx2.lineWidth=2/S.sc2;
  cx2.strokeRect(bx+1/S.sc2,by+1/S.sc2,bw-2/S.sc2,bht-2/S.sc2);
  holeSpots.forEach(h=>{
    const isE=info.elecKeys&&info.elecKeys.has(h.key);
    const isW=info.waterKeys&&info.waterKeys.has(h.key);
    if(!isE&&!isW)return;
    const clr=isE?'#F5C800':'#1A7EC8';
    const clrS=isE?'rgba(184,151,10,0.8)':'rgba(14,90,150,0.8)';
    cx2.save();
    cx2.fillStyle=clr+'cc';cx2.beginPath();cx2.arc(h.cx,h.cy,(CELL*.42)/2*1.1,0,Math.PI*2);cx2.fill();
    cx2.strokeStyle=clrS;cx2.lineWidth=1.5/S.sc2;cx2.beginPath();cx2.arc(h.cx,h.cy,(CELL*.42)/2*1.1,0,Math.PI*2);cx2.stroke();
    cx2.restore();
  });
  holeSpots.forEach(h=>{
    const isE=info.elecBodyKeys&&info.elecBodyKeys.has(h.key);
    const isW=info.waterBodyKeys&&info.waterBodyKeys.has(h.key);
    if(!isE&&!isW)return;
    const clr=isE?'rgba(245,200,0,0.88)':'rgba(26,126,200,0.88)';
    const clrS=isE?'#7a5c00':'#0d4a7a';
    cx2.save();
    cx2.strokeStyle=clr;cx2.lineCap='round';
    const hKey=h.key;
    const cd=condHMap?condHMap.get(hKey):S.conduits.find(c=>(c.axis==='XY'||c.axis==='L')&&c.path.some(p=>kk(p.col,p.row)===hKey));
    cx2.lineWidth=CELL*0.20/S.sc2;
    if(cd&&cd.path.length>1){
      const runsAlongRow=(cd.path[0].row===cd.path[1].row);
      if(runsAlongRow){cx2.beginPath();cx2.moveTo(bx,h.cy);cx2.lineTo(bx+bw,h.cy);cx2.stroke();}
      else            {cx2.beginPath();cx2.moveTo(h.cx,by);cx2.lineTo(h.cx,by+bht);cx2.stroke();}
    } else {
      if(bw>=bht){cx2.beginPath();cx2.moveTo(bx,h.cy);cx2.lineTo(bx+bw,h.cy);cx2.stroke();}
      else       {cx2.beginPath();cx2.moveTo(h.cx,by);cx2.lineTo(h.cx,by+bht);cx2.stroke();}
    }
    cx2.fillStyle=clrS;cx2.beginPath();cx2.arc(h.cx,h.cy,CELL*0.10,0,Math.PI*2);cx2.fill();
    cx2.restore();
  });
  if(info.isGrampo){
    cx2.save();cx2.strokeStyle='rgba(30,30,30,0.85)';cx2.lineWidth=2.5/S.sc2;cx2.lineCap='round';
    const yMid=by+bht/2;
    cx2.beginPath();cx2.moveTo(bx+bw*0.05,yMid);cx2.lineTo(bx+bw*0.95,yMid);cx2.stroke();
    holeSpots.forEach(h=>{cx2.beginPath();cx2.arc(h.cx,h.cy,(CELL*.42)/2*0.55,0,Math.PI*2);cx2.stroke();});
    cx2.restore();
  }
  {
    const k0=kk(col,row);
    const ebKey=S.elecBoxes.has(k0)?k0:(info.partner&&S.elecBoxes.has(info.partner)?info.partner:null);
    if(ebKey){
      const arr=S.elecBoxes.get(ebKey);
      const pxPerCm=CELL/S.cellCm;
      const brMap=bricks();
      const isH=brMap.has(kk(col-1,row))||brMap.has(kk(col+1,row))||(info.partner&&(()=>{const[pc]=(info.partner+'').split(',').map(Number);return pc!==col;})());
      const courseBot=(cIdx??0)*S.brickHCm;
      const courseTop=((cIdx??0)+1)*S.brickHCm;
      // Centro horizontal da célula ESPECÍFICA que contém a caixa (não do par inteiro)
      const [ebc,ebr]=ebKey.split(',').map(Number);
      const holeCx=ebc*CELL+CELL/2;
      arr.forEach(eb=>{
        const boxBot2=eb.heightCm-eb.hCm/2;
        const boxTop2=eb.heightCm+eb.hCm/2;
        if(courseBot>=boxTop2||courseTop<=boxBot2)return;
        const ebW=Math.max(6,eb.wCm*pxPerCm);
        const ebD=Math.max(3,(EBOX_TYPES[eb.type]?.depthCm||5)*pxPerCm);
        cx2.save();
        const clrFill=eb.type==='4x4'?'rgba(245,175,0,0.88)':'rgba(245,205,0,0.88)';
        cx2.fillStyle=clrFill; cx2.strokeStyle='rgba(110,70,0,0.95)'; cx2.lineWidth=1.5/S.sc2;
        let rx,ry,rw,rh;
        if(isH){
          // Parede H: caixinha aparece no topo (face norte) ou base (face sul) do brick
          rw=ebW; rh=Math.min(ebD,bht*0.85);
          rx=holeCx-rw/2;
          ry=eb.face>0 ? by : by+bht-rh;
        } else {
          // Parede V: caixinha aparece na esquerda (face oeste) ou direita (face leste)
          rw=Math.min(ebD,bw*0.85); rh=ebW;
          rx=eb.face>0 ? bx+bw-rw : bx;
          ry=holeCx-rh/2; // holeCx aqui é realmente holeCy pois parede V
        }
        cx2.fillRect(rx,ry,rw,rh);
        cx2.strokeRect(rx+.5/S.sc2,ry+.5/S.sc2,rw-1/S.sc2,rh-1/S.sc2);
        const isCenterCourse=(eb.heightCm>=courseBot&&eb.heightCm<courseTop);
        if(isCenterCourse&&CELL*S.sc2>12){
          const fs=Math.max(5,Math.min(8,CELL*0.3));
          cx2.font=`bold ${fs}px Inter,sans-serif`;cx2.fillStyle='#3a2000';
          cx2.textAlign='center';cx2.textBaseline='middle';
          cx2.fillText(eb.type.toUpperCase(),rx+rw/2,ry+rh/2);
        }
        cx2.restore();
      });
    }
  }
  {
    const k0=kk(col,row);
    [[S.hydroPoints,'rgba(26,126,200,0.88)','#0d4a7a'],
     [S.gasPoints,  'rgba(232,102,10,0.88)','#8B3A00']
    ].forEach(([ptMap,clrFill,clrStroke])=>{
      const ptKey=ptMap.has(k0)?k0:(info.partner&&ptMap.has(info.partner)?info.partner:null);
      if(!ptKey) return;
      const arr=ptMap.get(ptKey);
      const pxPerCm=CELL/S.cellCm;
      const courseBot=(cIdx??0)*S.brickHCm;
      const courseTop=((cIdx??0)+1)*S.brickHCm;
      arr.forEach(hp=>{
        if(hp.heightCm<courseBot||hp.heightCm>=courseTop)return;
        const brMap2=bricks();
        const isHwall=brMap2.has(kk(col-1,row))||brMap2.has(kk(col+1,row))||(info.partner&&(()=>{const[pc]=(info.partner+'').split(',').map(Number);return pc!==col;})());
        const hpW=Math.max(CELL*0.35, hp.diamMm/10*pxPerCm);
        const hpD=Math.max(3, 3*pxPerCm);
        const [hpc,hpr]=ptKey.split(',').map(Number);
        const holeCx=hpc*CELL+CELL/2, holeCy=hpr*CELL+CELL/2;
        let rx,ry,rw,rh;
        if(hp.face===0){
          rw=hpW; rh=hpW; rx=holeCx-rw/2; ry=holeCy-rh/2;
        } else if(isHwall){
          rw=hpW; rh=Math.min(hpD,bht*0.80);
          rx=holeCx-rw/2;
          ry=hp.face>0 ? by : by+bht-rh;
        } else {
          rw=Math.min(hpD,bw*0.80); rh=hpW;
          rx=hp.face>0 ? bx+bw-rw : bx;
          ry=holeCy-rh/2;
        }
        cx2.save();
        cx2.fillStyle=clrFill; cx2.strokeStyle=clrStroke; cx2.lineWidth=1.5/S.sc2;
        cx2.fillRect(rx,ry,rw,rh);
        cx2.strokeRect(rx+.5/S.sc2,ry+.5/S.sc2,rw-1/S.sc2,rh-1/S.sc2);
        const isCenterCourse=(hp.heightCm>=courseBot&&hp.heightCm<courseTop);
        if(isCenterCourse&&CELL*S.sc2>10){
          const cxc=rx+rw/2, cyc=ry+rh/2, arm=Math.min(rw,rh)*0.28;
          cx2.strokeStyle='rgba(255,255,255,0.90)'; cx2.lineWidth=1.2/S.sc2;
          cx2.beginPath();cx2.moveTo(cxc-arm,cyc);cx2.lineTo(cxc+arm,cyc);
          cx2.moveTo(cxc,cyc-arm);cx2.lineTo(cxc,cyc+arm);cx2.stroke();
        }
        cx2.restore();
      });
    });
  }
  if(hovered){cx2.fillStyle='rgba(255,255,255,0.25)';cx2.fillRect(bx,by,bw,bht);}
}

// ── Draw cell absent in this course ───────────────
function drawAbsentCell(col,row){
  const x=col*CELL,y=row*CELL;
  cx2.fillStyle='#f0f0f0';cx2.fillRect(x,y,CELL,CELL);
}
function drawPrevCell(col,row,mode){
  const x=col*CELL,y=row*CELL;
  if(mode==='wall'){cx2.fillStyle=PREV_C;cx2.fillRect(x,y,CELL,CELL);cx2.beginPath();cx2.arc(x+CELL/2,y+CELL/2,(CELL*.55)/2,0,Math.PI*2);cx2.fillStyle='rgba(255,255,255,.55)';cx2.fill();}
  else{cx2.fillStyle='rgba(26,95,180,.2)';cx2.fillRect(x,y,CELL,CELL);cx2.strokeStyle='rgba(26,95,180,.4)';cx2.lineWidth=1/S.sc2;const p=CELL*.1;cx2.strokeRect(x+p,y+p,CELL-p*2,CELL-p*2);}
}
function drawRunHL(cells){cells.forEach(({col,row})=>{cx2.fillStyle=RUN_HL;cx2.fillRect(col*CELL,row*CELL,CELL,CELL);});}

function drawSelectedRun(){
  if(!S.selectedRun.length) return;
  cx2.save();

  // Cor: azul para parede, accent azul mais claro para abertura
  const clr = S.selectedRunType==='opening' ? 'rgba(26,95,180,1)' : 'rgba(26,95,180,1)';
  const clrFill = S.selectedRunType==='opening' ? 'rgba(26,95,180,0.08)' : 'rgba(26,95,180,0.10)';

  const cols=S.selectedRun.map(c=>c.col), rows=S.selectedRun.map(c=>c.row);
  const minC=Math.min(...cols), maxC=Math.max(...cols);
  const minR=Math.min(...rows), maxR=Math.max(...rows);

  // Preenchimento suave
  cx2.fillStyle=clrFill;
  cx2.fillRect(minC*CELL, minR*CELL, (maxC-minC+1)*CELL, (maxR-minR+1)*CELL);

  // Caixa de seleção com padding externo
  const pad=3/S.sc2;
  const lw=1.8/S.sc2;
  cx2.strokeStyle=clr; cx2.lineWidth=lw;
  // Abertura: traço pontilhado para diferenciar visualmente
  if(S.selectedRunType==='opening') cx2.setLineDash([4/S.sc2, 2/S.sc2]);
  cx2.strokeRect(minC*CELL-pad, minR*CELL-pad, (maxC-minC+1)*CELL+pad*2, (maxR-minR+1)*CELL+pad*2);
  cx2.setLineDash([]);

  // Handles triangulares nas pontas
  const endCells=[S.selectedRun[0], S.selectedRun[S.selectedRun.length-1]];
  endCells.forEach((cell,ei)=>{
    const cx3=cell.col*CELL+CELL/2, cy3=cell.row*CELL+CELL/2;
    const hs=CELL*0.36;
    cx2.fillStyle=clr;
    cx2.beginPath();
    if(S.selectedRunDir==='H'){
      const dir=(ei===0)?-1:1;
      cx2.moveTo(cx3+dir*(hs+pad),     cy3);
      cx2.lineTo(cx3+dir*(hs*0.4+pad), cy3-hs*0.5);
      cx2.lineTo(cx3+dir*(hs*0.4+pad), cy3+hs*0.5);
    } else {
      const dir=(ei===0)?-1:1;
      cx2.moveTo(cx3,             cy3+dir*(hs+pad));
      cx2.lineTo(cx3-hs*0.5,     cy3+dir*(hs*0.4+pad));
      cx2.lineTo(cx3+hs*0.5,     cy3+dir*(hs*0.4+pad));
    }
    cx2.closePath(); cx2.fill();
  });

  cx2.restore();
}

function drawDim(p1,p2,prev,hl,side,showIcons){
  const x1=p1.col*CELL,y1=p1.row*CELL,x2=p2.col*CELL,y2=p2.row*CELL;
  const dx=x2-x1,dy=y2-y1,l=Math.sqrt(dx*dx+dy*dy);
  if(l<.001)return;
  const s=side??1;
  const ux=dx/l,uy=dy/l,px=-uy*s,py=ux*s;
  const off=CELL*1.5;
  const lineCol=hl?'#e74c3c':prev?'rgba(26,95,180,.55)':DIM_C;

  cx2.save();
  cx2.globalAlpha=prev?0.55:1;
  cx2.strokeStyle=lineCol; cx2.fillStyle=lineCol;

  // Linhas de extensão finas
  cx2.lineWidth=0.8/S.sc2;
  const g=CELL*.12, ext=off+CELL*.15;
  cx2.beginPath();
  cx2.moveTo(x1+px*g,y1+py*g); cx2.lineTo(x1+px*ext,y1+py*ext);
  cx2.moveTo(x2+px*g,y2+py*g); cx2.lineTo(x2+px*ext,y2+py*ext);
  cx2.stroke();

  // Linha principal
  const d1x=x1+px*off,d1y=y1+py*off,d2x=x2+px*off,d2y=y2+py*off;
  cx2.lineWidth=1/S.sc2;
  cx2.beginPath(); cx2.moveTo(d1x,d1y); cx2.lineTo(d2x,d2y); cx2.stroke();

  // Terminadores: traço inclinado (estilo arquitetônico)
  const tk=CELL*.22;
  const tick=(tx,ty)=>{
    cx2.lineWidth=1.5/S.sc2;
    cx2.beginPath();
    cx2.moveTo(tx-ux*tk*0.5-px*tk*0.5,ty-uy*tk*0.5-py*tk*0.5);
    cx2.lineTo(tx+ux*tk*0.5+px*tk*0.5,ty+uy*tk*0.5+py*tk*0.5);
    cx2.stroke();
  };
  tick(d1x,d1y); tick(d2x,d2y);

  // Label — sem fundo, fonte maior, halo para legibilidade
  const mx=(d1x+d2x)/2,my=(d1y+d2y)/2;
  const lbl=dimLbl(p1,p2);
  const fs=Math.max(10,Math.min(15,13/S.sc2));
  cx2.font=`600 ${fs}px Inter,system-ui,sans-serif`;
  cx2.textAlign='center'; cx2.textBaseline='middle';
  cx2.save();
  cx2.translate(mx,my);
  let ang=Math.atan2(dy,dx);
  if(ang>Math.PI/2||ang<-Math.PI/2) ang+=Math.PI;
  cx2.rotate(ang);
  cx2.lineWidth=3.5/S.sc2; cx2.strokeStyle='rgba(255,255,255,0.82)';
  cx2.strokeText(lbl,0,0);
  cx2.fillStyle=lineCol; cx2.fillText(lbl,0,0);
  cx2.restore();

  // Pontos de origem
  cx2.beginPath(); cx2.arc(x1,y1,CELL*.09,0,Math.PI*2); cx2.fill();
  cx2.beginPath(); cx2.arc(x2,y2,CELL*.09,0,Math.PI*2); cx2.fill();

  cx2.restore(); // restaurar antes dos ícones (que são em px de tela)

}
function drawSnap(pt,fixed){
  const x=pt.col*CELL,y=pt.row*CELL;
  cx2.save();cx2.strokeStyle=DIM_C;cx2.lineWidth=1.2/S.sc2;cx2.fillStyle=fixed?'#fff':DIM_C;
  cx2.beginPath();cx2.arc(x,y,CELL*.12,0,Math.PI*2);fixed?(cx2.fill(),cx2.stroke()):cx2.stroke();
  const ch=CELL*.22;cx2.beginPath();cx2.moveTo(x-ch,y);cx2.lineTo(x+ch,y);cx2.moveTo(x,y-ch);cx2.lineTo(x,y+ch);cx2.stroke();
  cx2.restore();
}

// Calcula posição dos ícones de uma cota em coordenadas de TELA (px).
// Retorna {fx,fy,ex,ey,iconR} — flip e delete.
function dimIconPos(d){
  const s=d.side??1;
  const p1=d.pt1,p2=d.pt2;
  const x1=p1.col*CELL,y1=p1.row*CELL,x2=p2.col*CELL,y2=p2.row*CELL;
  const ddx=x2-x1,ddy=y2-y1,l=Math.sqrt(ddx*ddx+ddy*ddy);
  if(l<.001)return null;
  const px=-ddy/l*s,py=ddx/l*s,off=CELL*1.5;
  const mlx=(x1+px*off+x2+px*off)/2, mly=(y1+py*off+y2+py*off)/2;
  // Converter world → tela
  const mx_s=mlx*S.sc2+S.ox, my_s=mly*S.sc2+S.oy;
  const ang=(()=>{let a=Math.atan2(ddy,ddx);if(a>Math.PI/2||a<-Math.PI/2)a+=Math.PI;return a;})();
  const cosA=Math.cos(ang),sinA=Math.sin(ang);
  const iconR=Math.max(14,CELL*S.sc2*0.42);
  const sep=iconR*2.0, perpOff=iconR*1.8;
  const perpX=-sinA,perpY=cosA;
  return{
    fx: mx_s - cosA*sep + perpX*perpOff,
    fy: my_s - sinA*sep + perpY*perpOff,
    ex: mx_s + cosA*sep + perpX*perpOff,
    ey: my_s + sinA*sep + perpY*perpOff,
    iconR
  };
}

// Desenha os ícones de uma cota selecionada em coordenadas de tela (fora da transform).
function drawDimIcons(i){
  if(i<0||i>=S.dims.length)return;
  const pos=dimIconPos(S.dims[i]);
  if(!pos)return;
  const {fx,fy,ex,ey,iconR}=pos;
  const r=iconR;

  cx2.save();
  cx2.setTransform(1,0,0,1,0,0); // coordenadas de tela puras

  // ── Ícone flip (azul) ──────────────────────────
  cx2.beginPath();cx2.arc(fx,fy,r,0,Math.PI*2);
  cx2.fillStyle='#1a5fb4';cx2.fill();
  cx2.strokeStyle='rgba(255,255,255,0.35)';cx2.lineWidth=1.5;cx2.stroke();
  // Duas setas verticais (↑↓)
  cx2.fillStyle='#fff';cx2.strokeStyle='#fff';cx2.lineWidth=1.5;cx2.lineCap='round';
  const ar=r*0.30, ax=fx, ay1=fy-r*0.18, ay2=fy+r*0.18;
  // seta para cima
  cx2.beginPath();cx2.moveTo(ax,ay1-ar*1.1);cx2.lineTo(ax,ay1+ar*0.5);cx2.stroke();
  cx2.beginPath();cx2.moveTo(ax-ar*0.7,ay1-ar*0.4);cx2.lineTo(ax,ay1-ar*1.1);cx2.lineTo(ax+ar*0.7,ay1-ar*0.4);cx2.stroke();
  // seta para baixo
  cx2.beginPath();cx2.moveTo(ax,ay2+ar*1.1);cx2.lineTo(ax,ay2-ar*0.5);cx2.stroke();
  cx2.beginPath();cx2.moveTo(ax-ar*0.7,ay2+ar*0.4);cx2.lineTo(ax,ay2+ar*1.1);cx2.lineTo(ax+ar*0.7,ay2+ar*0.4);cx2.stroke();

  // ── Ícone delete (vermelho) ────────────────────
  cx2.beginPath();cx2.arc(ex,ey,r,0,Math.PI*2);
  cx2.fillStyle='#c0392b';cx2.fill();
  cx2.strokeStyle='rgba(255,255,255,0.35)';cx2.lineWidth=1.5;cx2.stroke();
  // Lixeira
  cx2.fillStyle='#fff';cx2.strokeStyle='#fff';cx2.lineWidth=1.5;cx2.lineCap='round';cx2.lineJoin='round';
  const tr=r*0.28, tx=ex, ty=ey;
  // tampa
  cx2.beginPath();cx2.moveTo(tx-tr*1.1,ty-tr*0.8);cx2.lineTo(tx+tr*1.1,ty-tr*0.8);cx2.stroke();
  cx2.beginPath();cx2.moveTo(tx-tr*0.4,ty-tr*0.8);cx2.lineTo(tx-tr*0.4,ty-tr*1.4);cx2.lineTo(tx+tr*0.4,ty-tr*1.4);cx2.lineTo(tx+tr*0.4,ty-tr*0.8);cx2.stroke();
  // corpo
  cx2.beginPath();cx2.moveTo(tx-tr*0.9,ty-tr*0.6);cx2.lineTo(tx-tr*0.7,ty+tr*1.2);cx2.lineTo(tx+tr*0.7,ty+tr*1.2);cx2.lineTo(tx+tr*0.9,ty-tr*0.6);cx2.stroke();
  // linhas internas
  cx2.beginPath();cx2.moveTo(tx,ty-tr*0.3);cx2.lineTo(tx,ty+tr*0.9);cx2.stroke();
  cx2.beginPath();cx2.moveTo(tx-tr*0.4,ty-tr*0.2);cx2.lineTo(tx-tr*0.35,ty+tr*0.85);cx2.stroke();
  cx2.beginPath();cx2.moveTo(tx+tr*0.4,ty-tr*0.2);cx2.lineTo(tx+tr*0.35,ty+tr*0.85);cx2.stroke();

  cx2.restore();
}


function draw2d(){
  if(S.vistaMode==='elev'){drawElevMode();return;}
  const W=cv2.width,H=cv2.height;
  cx2.clearRect(0,0,W,H);cx2.fillStyle=BG;cx2.fillRect(0,0,W,H);
  cx2.save();cx2.translate(S.ox,S.oy);cx2.scale(S.sc2,S.sc2);
  const L=-S.ox/S.sc2,T=-S.oy/S.sc2,R=(W-S.ox)/S.sc2,B=(H-S.oy)/S.sc2;
  const cS=Math.floor(L/CELL)-1,cE=Math.ceil(R/CELL)+1,rS=Math.floor(T/CELL)-1,rE=Math.ceil(B/CELL)+1;
  const br=bricks();

  // ── Helpers de offset paralelo para traçados de infraestrutura ──────────────
  // Usados tanto na vista Planta quanto na vista Instalações.
  function _buildOffsetMap(cdList){
    const om=new Map();
    const ensureCell=k=>{ if(!om.has(k)) om.set(k,{H:[],V:[]}); return om.get(k); };
    cdList.forEach((cd)=>{
      if(cd.axis!=='XY'&&cd.axis!=='L') return;
      cd.path.forEach((p,pi)=>{
        const k=kk(p.col,p.row);
        const cell=ensureCell(k);
        const next=cd.path[pi+1], prev=cd.path[pi-1];
        const ref=next||prev; if(!ref) return;
        const dir=(ref.row===p.row)?'H':'V';
        if(!cell[dir].find(e=>e.cd===cd)) cell[dir].push({cd});
      });
    });
    return om;
  }
  function _getOffset(om, k, dir, cd){
    const cell=om.get(k); if(!cell) return 0;
    const list=cell[dir]; if(!list||list.length<=1) return 0;
    const n=list.length;
    const i=list.findIndex(e=>e.cd===cd); if(i<0) return 0;
    const spacing=CELL*0.52/n;
    return (i-(n-1)/2)*spacing;
  }

  // ── Background image (planta de fundo) — visível em planta e instalações ──
  if(S.bgImg.img && (S.vistaMode==='planta' || S.vistaMode==='inst')){
    cx2.save();
    cx2.globalAlpha = S.bgImg.opacity;
    const iw = S.bgImg.img.naturalWidth * S.bgImg.scale;
    const ih = S.bgImg.img.naturalHeight * S.bgImg.scale;
    cx2.drawImage(S.bgImg.img, S.bgImg.x, S.bgImg.y, iw, ih);
    cx2.globalAlpha = 1;
    // Draw border when unlocked (visual hint that it's movable)
    if(!S.bgImg.locked){
      cx2.strokeStyle='rgba(26,95,180,0.5)';
      cx2.lineWidth=2/S.sc2;
      cx2.setLineDash([6/S.sc2,4/S.sc2]);
      cx2.strokeRect(S.bgImg.x, S.bgImg.y, iw, ih);
      cx2.setLineDash([]);
      // Resize handle at bottom-right corner
      const hx=S.bgImg.x+iw, hy=S.bgImg.y+ih, hr=BG_HANDLE_R/S.sc2;
      cx2.fillStyle='rgba(26,95,180,0.8)';
      cx2.beginPath();cx2.arc(hx,hy,hr,0,Math.PI*2);cx2.fill();
      cx2.fillStyle='#fff';
      cx2.beginPath();
      cx2.moveTo(hx-hr*0.5,hy+hr*0.1);cx2.lineTo(hx+hr*0.1,hy-hr*0.5);
      cx2.lineWidth=1.5/S.sc2;cx2.strokeStyle='#fff';cx2.stroke();
      cx2.beginPath();
      cx2.moveTo(hx-hr*0.15,hy+hr*0.1);cx2.lineTo(hx+hr*0.1,hy-hr*0.15);
      cx2.stroke();
    }
    cx2.restore();
  }

  if(S.vistaMode==='fiada'){
    // ── FIADA MODE ──
    const courseData=analyzeCourse(S.currentCourse);
    const groutCells=computeGrauteCells();

    const courseBot = S.currentCourse * S.brickHCm;
    const courseTop = (S.currentCourse + 1) * S.brickHCm;
    // Construir sets de conduítes UMA VEZ fora do loop (perf + corretude)
    const condElecV  = new Set(S.conduits.filter(cd=>cd.ctype==='elec' &&cd.axis==='Z').flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
    const condWaterV = new Set(S.conduits.filter(cd=>cd.ctype==='water'&&cd.axis==='Z').flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
    // Traçados horizontais desta fiada — para overlay de linhas (não mais por-célula)
    const condHCourse = S.conduits.filter(cd=>(cd.axis==='XY'||cd.axis==='L')&&(cd.fromHeightCm??0)>=courseBot&&(cd.fromHeightCm??0)<courseTop);
    const condElecH  = new Set(condHCourse.filter(cd=>cd.ctype==='elec') .flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
    const condWaterH = new Set(condHCourse.filter(cd=>cd.ctype==='water').flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
    // Map de célula → conduíte horizontal (para cor na canaleta)
    const condHMap = new Map();
    condHCourse.forEach(cd=>cd.path.forEach(p=>{ if(!condHMap.has(kk(p.col,p.row))) condHMap.set(kk(p.col,p.row),cd); }));
    // Map<cellKey, Set<cIdx>> — canaletas sem graute apenas na fiada do conduíte
    const conduitCanalCells2d = computeConduitCanalKeys();

    courseData.forEach((info,k)=>{
      const[c,r]=k.split(',').map(Number);
      if(c<cS||c>cE||r<rS||r>rE)return;
      if(!info){ drawAbsentCell(c,r); return; }
      const isHov = S.hcell && (
        (S.hcell.col===c && S.hcell.row===r) ||
        (info.partner && info.partner===kk(S.hcell.col,S.hcell.row))
      );
      // Anotar prumadas Z para renderização (por célula)
      const cellsHere = [kk(c,r), ...(info.partner?[info.partner]:[])];
      info.elecKeys  = new Set(cellsHere.filter(k=>S.manualElec.has(k)||condElecV.has(k)));
      info.waterKeys = new Set(cellsHere.filter(k=>S.manualWater.has(k)||condWaterV.has(k)));
      // Traçados horizontais: NÃO passar para drawBrickUnit — serão desenhados como overlay de linhas
      info.elecBodyKeys  = new Set();
      info.waterBodyKeys = new Set();
      drawBrickUnit(c,r,info,false,info.isFirst&&isHov,groutCells,S.currentCourse,condHMap,conduitCanalCells2d);
    });

    // ── Overlay de traçados horizontais na fiada — linhas paralelas com offset ──
    if(condHCourse.length){
      const omFiada=_buildOffsetMap(condHCourse);
      condHCourse.forEach(cd=>{
        const cfg=_conduitCfg(cd.ctype);
        cx2.save();
        cx2.strokeStyle=cfg.color2d;
        cx2.lineWidth=cfg.lineW2d()/S.sc2; cx2.lineCap='round'; cx2.lineJoin='round';
        cx2.beginPath();
        let started=false;
        cd.path.forEach((p,i)=>{
          if(p.col<cS||p.col>cE||p.row<rS||p.row>rE){ started=false; return; }
          const next=cd.path[i+1], prev=cd.path[i-1];
          const ref=next||prev; if(!ref) return;
          const dir=(ref.row===p.row)?'H':'V';
          const off=_getOffset(omFiada,kk(p.col,p.row),dir,cd);
          const px=p.col*CELL+CELL/2+(dir==='H'?0:off);
          const py=p.row*CELL+CELL/2+(dir==='H'?off:0);
          if(!started){ cx2.moveTo(px,py); started=true; }
          else cx2.lineTo(px,py);
        });
        cx2.stroke();
        cx2.restore();
      });
    }

    // highlight ferramenta graute
    if(S.fiadaTool==='grout' && S.hcell && br.has(kk(S.hcell.col,S.hcell.row))){
      const hx=S.hcell.col*CELL, hy=S.hcell.row*CELL;
      cx2.save();
      cx2.strokeStyle='rgba(0,200,200,0.85)'; cx2.lineWidth=2.5/S.sc2;
      cx2.strokeRect(hx+2/S.sc2, hy+2/S.sc2, CELL-4/S.sc2, CELL-4/S.sc2);
      const isManual=S.manualGrout.has(kk(S.hcell.col,S.hcell.row));
      cx2.fillStyle='rgba(0,200,200,0.9)'; cx2.font=`bold ${Math.max(8,CELL*.5)}px monospace`;
      cx2.textAlign='center'; cx2.textBaseline='middle';
      cx2.fillText(isManual?'×':'+', hx+CELL/2, hy+CELL/2);
      cx2.restore();
    }
    // highlight ferramentas elétricas — foca no furo do tijolo
    if(S.fiadaTool==='electrical' && S.hcell && br.has(kk(S.hcell.col,S.hcell.row))){
      const hx=S.hcell.col*CELL, hy=S.hcell.row*CELL;
      const holeR=(CELL*.42)/2;
      cx2.save();
      const clr = S.electricalSubtool==='water' ? 'rgba(26,126,200,0.9)' : 'rgba(245,200,0,0.9)';
      const clrS= S.electricalSubtool==='water' ? 'rgba(14,90,150,0.85)' : 'rgba(184,151,10,0.85)';
      // Anel no furo
      cx2.strokeStyle=clrS; cx2.lineWidth=2.5/S.sc2;
      cx2.beginPath(); cx2.arc(hx+CELL/2,hy+CELL/2,holeR+2/S.sc2,0,Math.PI*2); cx2.stroke();
      // Símbolo no centro
      cx2.fillStyle=clr; cx2.font=`bold ${Math.max(8,CELL*.45)}px monospace`;
      cx2.textAlign='center'; cx2.textBaseline='middle';
      if(S.electricalSubtool==='ebox'){
        const hasBox=S.elecBoxes.has(kk(S.hcell.col,S.hcell.row));
        cx2.fillText(hasBox?'✎':'⊞', hx+CELL/2, hy+CELL/2);
      } else {
        const hasIt=(S.electricalSubtool==='elec'?S.manualElec:S.manualWater).has(kk(S.hcell.col,S.hcell.row));
        cx2.fillText(hasIt?'×':'+', hx+CELL/2, hy+CELL/2);
      }
      cx2.restore();
    }
    // 2) draw openings with no brick in any course (just outline)
    for(const[k,op] of Object.entries(S.openMap)){
      const[c,r]=k.split(',').map(Number);
      if(c<cS||c>cE||r<rS||r>rE)continue;
      if(!br.has(k)) continue; // shouldn't happen but safe
      const info=courseData.get(k);
      if(!info){
        // In opening: show as faint blue
        cx2.fillStyle='rgba(200,220,240,.4)';cx2.fillRect(c*CELL,r*CELL,CELL,CELL);
        cx2.strokeStyle='#aaccee';cx2.lineWidth=1/S.sc2;cx2.strokeRect(c*CELL+1/S.sc2,r*CELL+1/S.sc2,CELL-2/S.sc2,CELL-2/S.sc2);
      }
    }

  } else {
    // ── PLANTA MODE ──
    if(S.heightMode&&S.hovRun.length) drawRunHL(S.hovRun);
    drawSelectedRun();

    // Preview de mover: desenhar run na posição deslocada
    if(S.moveMode && S.moveRun.length){
      S.moveRun.forEach(({col,row})=>{
        const nc=col+S.moveDC, nr=row+S.moveDR;
        // posição original: transparente escuro
        cx2.fillStyle='rgba(100,60,20,.25)';cx2.fillRect(col*CELL,row*CELL,CELL,CELL);
        cx2.strokeStyle='rgba(100,60,20,.4)';cx2.lineWidth=1/S.sc2;cx2.strokeRect(col*CELL+.5/S.sc2,row*CELL+.5/S.sc2,CELL-1/S.sc2,CELL-1/S.sc2);
        // nova posição: laranja
        cx2.fillStyle='rgba(230,126,34,.55)';cx2.fillRect(nc*CELL,nr*CELL,CELL,CELL);
      });
    }

    cx2.save();
    if(S.brickOpacity < 1) cx2.globalAlpha = S.brickOpacity;
    const groutCells2d = (S.vistaMode==='inst') ? computeGrauteCells() : null;
    for(const k of br){
      const[c,r]=k.split(',').map(Number);
      if(c<cS||c>cE||r<rS||r>rE)continue;
      // no modo mover, células do run original ficam fantasmas
      const isMoving = S.moveMode && S.moveRun.some(p=>p.col===c&&p.row===r);
      const hov=S.hcell&&!S.drawing&&!S.rulerOn&&!S.heightMode&&!S.moveMode&&S.hcell.col===c&&S.hcell.row===r;
      // modo delete: highlight vermelho no run hovered
      
      const holeColor = (groutCells2d && groutCells2d.has(k)) ? GROUT_C : HOLE_C;
      if(isMoving) drawBk(c,r,'rgba(181,84,26,.25)','rgba(255,255,255,.15)');
      
      else drawBk(c,r,hov?BRICK_HC:BRICK_C,holeColor);
    }
    cx2.globalAlpha = 1;
    cx2.restore();
    for(const[k,op] of Object.entries(S.openMap)){
      const[c,r]=k.split(',').map(Number);
      if(c<cS||c>cE||r<rS||r>rE)continue;
      const hov=S.hcell&&!S.drawing&&!S.rulerOn&&!S.heightMode&&!S.moveMode&&S.hcell.col===c&&S.hcell.row===r;
      drawOpenCell(c,r,op,hov);
    }
    // Símbolos de porta (arco 90°) — desenhados por cima, run inteiro de uma vez
    drawDoorRuns(cS,cE,rS,rE);
    // ── Visualização de células com inclinação ───────
    if(S.slopedKeys.size){
      cx2.save();
      for(const k of S.slopedKeys){
        const[c,r]=k.split(',').map(Number);
        if(c<cS||c>cE||r<rS||r>rE)continue;
        const h=getCellH(k);
        // diagonal do canto inferior-esq ao superior-dir (representa corte)
        cx2.strokeStyle='rgba(123,45,139,0.65)';
        cx2.lineWidth=1.5/S.sc2;
        cx2.beginPath();
        cx2.moveTo(c*CELL, (r+1)*CELL);
        cx2.lineTo((c+1)*CELL, r*CELL);
        cx2.stroke();
        // label da altura
        if(S.heightMode){
          const fs=Math.max(7,Math.min(10,8/S.sc2));
          cx2.font=`bold ${fs}px 'Courier New',monospace`;
          cx2.textAlign='center';cx2.textBaseline='middle';
          cx2.fillStyle='rgba(123,45,139,0.9)';
          cx2.fillText(h+'cm', (c+0.5)*CELL, (r+0.5)*CELL);
        }
      }
      cx2.restore();
    }

    // ── Electrical indicators — planta & inst modes ───────
    if(S.vistaMode==='planta' || S.vistaMode==='inst'){
      cx2.save();
      // Only V-conduit cells show circles (they pass through the hole)
      const condElecV2d  = new Set(S.conduits.filter(cd=>cd.ctype==='elec' &&cd.axis==='Z').flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
      const condWaterV2d = new Set(S.conduits.filter(cd=>cd.ctype==='water'&&cd.axis==='Z').flatMap(cd=>cd.path.map(p=>kk(p.col,p.row))));
      // H-conduit cells: draw line through body
      const condElecH2d  = S.conduits.filter(cd=>cd.ctype==='elec' &&(cd.axis==='XY'||cd.axis==='L'));
      const condPipeH2d  = S.conduits.filter(cd=>cd.ctype==='pipe' &&(cd.axis==='XY'||cd.axis==='L'));

      // Circles in hole: S.manualElec/Water + V-conduit cells
      new Set([...S.manualElec, ...condElecV2d]).forEach(k=>{
        if(!br.has(k))return;
        const[c,r]=k.split(',').map(Number);
        if(c<cS||c>cE||r<rS||r>rE)return;
        const hr=(CELL*.42)/2;
        cx2.fillStyle='rgba(245,200,0,0.7)';
        cx2.beginPath();cx2.arc(c*CELL+CELL/2,r*CELL+CELL/2,hr,0,Math.PI*2);cx2.fill();
        cx2.strokeStyle='rgba(184,151,10,0.9)';cx2.lineWidth=1.2/S.sc2;
        cx2.beginPath();cx2.arc(c*CELL+CELL/2,r*CELL+CELL/2,hr,0,Math.PI*2);cx2.stroke();
      });
      new Set([...S.manualWater, ...condWaterV2d]).forEach(k=>{
        if(!br.has(k))return;
        const[c,r]=k.split(',').map(Number);
        if(c<cS||c>cE||r<rS||r>rE)return;
        const hr=(CELL*.42)/2;
        cx2.fillStyle='rgba(26,126,200,0.6)';
        cx2.beginPath();cx2.arc(c*CELL+CELL/2,r*CELL+CELL/2,hr,0,Math.PI*2);cx2.fill();
        cx2.strokeStyle='rgba(14,90,150,0.9)';cx2.lineWidth=1.2/S.sc2;
        cx2.beginPath();cx2.arc(c*CELL+CELL/2,r*CELL+CELL/2,hr,0,Math.PI*2);cx2.stroke();
      });

      // Lines through body: H-conduit paths com offsets paralelos (planta only)
      if(S.vistaMode==='planta'){
        const allHConds=[...condElecH2d,...condPipeH2d];
        const omPlanta=_buildOffsetMap(allHConds);
        allHConds.forEach(cd=>{
          const cfg=_conduitCfg(cd.ctype);
          cx2.strokeStyle=cfg.color2d;
          cx2.lineWidth=cfg.lineW2d()/S.sc2; cx2.lineCap='round'; cx2.lineJoin='round';
          cx2.beginPath();
          let started=false;
          cd.path.forEach((p,i)=>{
            if(p.col<cS||p.col>cE||p.row<rS||p.row>rE){ started=false; return; }
            const next=cd.path[i+1], prev=cd.path[i-1];
            const ref=next||prev; if(!ref) return;
            const dir=(ref.row===p.row)?'H':'V';
            const off=_getOffset(omPlanta,kk(p.col,p.row),dir,cd);
            const px=p.col*CELL+CELL/2+(dir==='H'?0:off);
            const py=p.row*CELL+CELL/2+(dir==='H'?off:0);
            if(!started){ cx2.moveTo(px,py); started=true; }
            else cx2.lineTo(px,py);
          });
          cx2.stroke();
        });
      }
      // Caixas elétricas — empilhadas perpendicularmente à parede ──────────
      // Parede H → barras horizontais empilhadas p/ norte ou sul
      // Parede V → barras verticais  empilhadas p/ leste  ou oeste
      // Ordenar por heightCm crescente: a mais baixa fica mais perto da parede
      S.elecBoxes.forEach((arr,k)=>{
        if(!br.has(k)||!arr.length)return;
        const[c,r]=k.split(',').map(Number);
        if(c<cS||c>cE||r<rS||r>rE)return;
        const wDir=runPrimaryDir(c,r,br); // 'H' ou 'V'
        const BAR =CELL*0.26;  // espessura de cada barra (perpendicular à parede)
        const GAP0=CELL*0.04;  // gap parede → 1ª barra
        const GAP1=CELL*0.035; // gap entre barras
        // Agrupar por face e ordenar do mais baixo ao mais alto
        const byFace=new Map();
        arr.forEach(eb=>{ const f=eb.face>0?1:-1; if(!byFace.has(f))byFace.set(f,[]); byFace.get(f).push(eb); });
        byFace.forEach((boxes,face)=>{
          const sorted=[...boxes].sort((a,b)=>a.heightCm-b.heightCm);
          sorted.forEach((eb,si)=>{
            const pxPerCm2=CELL/S.cellCm;
            const barLen=Math.max(CELL*0.5, eb.wCm*pxPerCm2); // largura real ao longo da parede
            const offset=GAP0+si*(BAR+GAP1);
            let bx,by,bw,bh;
            if(wDir==='H'){
              bw=barLen; bh=BAR;
              bx=c*CELL+CELL/2-bw/2;   // centrado no furo da célula
              by=face>0 ? r*CELL-offset-BAR : (r+1)*CELL+offset;
            } else {
              bw=BAR; bh=barLen;
              bx=face>0 ? (c+1)*CELL+offset : c*CELL-offset-BAR;
              by=r*CELL+CELL/2-bh/2;   // centrado no furo da célula
            }
            // Cor: QD=laranja, 4x4=âmbar, 4x2=amarelo
            const clrFill=eb.type==='4x4'?'rgba(245,175,0,0.92)':'rgba(245,205,0,0.92)';
            cx2.fillStyle=clrFill;
            cx2.strokeStyle='rgba(110,70,0,0.95)';
            cx2.lineWidth=0.8/S.sc2;
            cx2.fillRect(bx,by,bw,bh);
            cx2.strokeRect(bx+0.4/S.sc2,by+0.4/S.sc2,bw-0.8/S.sc2,bh-0.8/S.sc2);
            // Label de altura no centro da barra
            const dimMin=Math.min(bw,bh);
            const fs=Math.max(3.5,dimMin*0.60);
            cx2.font=`bold ${fs}px Inter,sans-serif`;
            cx2.fillStyle='#4a2e00';
            cx2.textAlign='center'; cx2.textBaseline='middle';
            cx2.fillText(String(eb.heightCm),bx+bw/2,by+bh/2);
          });
        });
      });
      // Pontos hidráulicos e de gás — barrinhas empilhadas (mesma geometria, cores diferentes)
      [[S.hydroPoints,'rgba(26,126,200,0.88)','rgba(8,60,120,0.95)','rgba(13,74,122,0.92)','rgba(5,40,80,0.95)'],
       [S.gasPoints,  'rgba(232,102,10,0.88)','rgba(140,55,5,0.95)','rgba(160,60,5,0.92)', 'rgba(100,35,2,0.95)']
      ].forEach(([ptMap,clrFill,clrStroke,clrNode,clrNodeStroke])=>{
      ptMap.forEach((arr,k)=>{
        if(!br.has(k)||!arr.length)return;
        const[c,r]=k.split(',').map(Number);
        if(c<cS||c>cE||r<rS||r>rE)return;
        const wDir=runPrimaryDir(c,r,br);
        const byFace=new Map();
        arr.forEach((hp,i)=>{const f=hp.face===0?0:(hp.face>0?1:-1);if(!byFace.has(f))byFace.set(f,[]);byFace.get(f).push({hp,i});});
        byFace.forEach((pts,face)=>{
          const sorted=[...pts].sort((a,b)=>a.hp.heightCm-b.hp.heightCm);
          sorted.forEach(({hp,i},si)=>{
            const{bx,by,bw,bh}=_hydroBarGeom(c,r,hp,si,face,wDir);
            if(face===0){
              // Conexão interna: círculo com "×"
              const cx=bx+bw/2, cy=by+bh/2, rad=bw/2;
              cx2.beginPath(); cx2.arc(cx,cy,rad,0,Math.PI*2);
              cx2.fillStyle=clrNode; cx2.fill();
              cx2.strokeStyle=clrNodeStroke; cx2.lineWidth=1/S.sc2; cx2.stroke();
              const arm=rad*0.42;
              cx2.strokeStyle='rgba(255,255,255,0.9)'; cx2.lineWidth=Math.max(0.8,rad*0.22)/S.sc2; cx2.lineCap='round';
              cx2.beginPath(); cx2.moveTo(cx-arm,cy-arm); cx2.lineTo(cx+arm,cy+arm); cx2.stroke();
              cx2.beginPath(); cx2.moveTo(cx+arm,cy-arm); cx2.lineTo(cx-arm,cy+arm); cx2.stroke();
              const fs=Math.max(3.5,rad*0.7);
              cx2.font=`bold ${fs}px Inter,sans-serif`;
              cx2.fillStyle='rgba(255,255,255,0.85)';
              cx2.textAlign='center'; cx2.textBaseline='alphabetic';
              cx2.fillText(String(hp.heightCm),cx,cy+rad*1.45);
            } else {
              cx2.fillStyle=clrFill;
              cx2.strokeStyle=clrStroke;
              cx2.lineWidth=0.8/S.sc2;
              cx2.fillRect(bx,by,bw,bh);
              cx2.strokeRect(bx+0.4/S.sc2,by+0.4/S.sc2,bw-0.8/S.sc2,bh-0.8/S.sc2);
              const dimMin=Math.min(bw,bh);
              const fs=Math.max(3.5,dimMin*0.60);
              cx2.font=`bold ${fs}px Inter,sans-serif`;
              cx2.fillStyle='#fff';
              cx2.textAlign='center'; cx2.textBaseline='middle';
              cx2.fillText(String(hp.heightCm),bx+bw/2,by+bh/2);
            }
          });
        });
      });
      });
      // ── Conduit lines (inst mode) ────────────────────
      if(S.vistaMode==='inst'){
        cx2.save();

        const drawArrow=(cx,cy,up,clr,clrD,small)=>{
          const ah=small?CELL*0.22:CELL*0.32, aw=small?CELL*0.18:CELL*0.24;
          cx2.strokeStyle=clr; cx2.lineWidth=(small?CELL*0.10:CELL*0.13)/S.sc2; cx2.lineCap='round';
          cx2.beginPath();
          cx2.moveTo(cx, up?cy+ah*0.2:cy-ah*0.2);
          cx2.lineTo(cx, up?cy-ah*0.4:cy+ah*0.4);
          cx2.stroke();
          cx2.fillStyle=clr;
          cx2.beginPath();
          if(up){ cx2.moveTo(cx,cy-ah*0.7);cx2.lineTo(cx+aw/2,cy-ah*0.35);cx2.lineTo(cx-aw/2,cy-ah*0.35); }
          else   { cx2.moveTo(cx,cy+ah*0.7);cx2.lineTo(cx+aw/2,cy+ah*0.35);cx2.lineTo(cx-aw/2,cy+ah*0.35); }
          cx2.closePath();cx2.fill();
          if(!small){
            const fs=Math.max(4,Math.min(6,CELL*0.22));
            cx2.font=`bold ${fs}px Inter,sans-serif`;cx2.fillStyle=clrD;
            cx2.textAlign='center';cx2.textBaseline='middle';
            cx2.fillText(up?'TOPO':'BASE',cx,up?cy+ah*0.65:cy-ah*0.65);
          }
        }

        const offsetMap=_buildOffsetMap(S.conduits);

        // ── Traçados existentes ────────────────────────────────────────────────
        // Draw existing S.conduits
        S.conduits.forEach(cd=>{
          const cfg=_conduitCfg(cd.ctype);
          const clrLine=cfg.color2d;
          const clrDot =cfg.colorStroke;
          const p0=cd.path[0]; if(!p0) return;
          const px=p0.col*CELL+CELL/2, py=p0.row*CELL+CELL/2;

          if(cd.axis==='XY'||cd.axis==='L'){
            const lw=cfg.lineW2d()/S.sc2;
            cx2.strokeStyle=clrLine; cx2.lineWidth=lw; cx2.lineCap='round'; cx2.lineJoin='round';
            cx2.beginPath();
            cd.path.forEach((p,i)=>{
              const next=cd.path[i+1], prev=cd.path[i-1];
              const ref=next||prev; if(!ref) return;
              const dir=(ref.row===p.row)?'H':'V';
              const off=_getOffset(offsetMap,kk(p.col,p.row),dir,cd);
              const cx3=p.col*CELL+CELL/2+(dir==='H'?0:off);
              const cy3=p.row*CELL+CELL/2+(dir==='H'?off:0);
              i===0?cx2.moveTo(cx3,cy3):cx2.lineTo(cx3,cy3);
            });
            cx2.stroke();
            // Dots nas extremidades (sem offset — ficam no centro da célula terminal)
            [cd.path[0],cd.path[cd.path.length-1]].forEach(p=>{
              cx2.fillStyle=clrDot;cx2.beginPath();cx2.arc(p.col*CELL+CELL/2,p.row*CELL+CELL/2,CELL*0.11,0,Math.PI*2);cx2.fill();
            });
            if(cd.axis==='L'&&cd.corner){
              const cx3=cd.corner.col*CELL+CELL/2, cy3=cd.corner.row*CELL+CELL/2, cs=CELL*0.13;
              cx2.fillStyle=clrDot;
              cx2.beginPath();cx2.moveTo(cx3,cy3-cs);cx2.lineTo(cx3+cs,cy3);cx2.lineTo(cx3,cy3+cs);cx2.lineTo(cx3-cs,cy3);cx2.closePath();cx2.fill();
            }
          } else {
            if(cd.termTo==='top'||cd.termTo==='box') drawArrow(px,py,true,clrLine,clrDot,false);
            if(cd.termTo==='base') drawArrow(px,py,false,clrLine,clrDot,false);
          }
        });

        // Pending state
        if(S.pendingConduit){
          const[oc,or]=S.pendingConduit.fromKey.split(',').map(Number);
          const pcfg=_conduitCfg(S.pendingConduit.ctype);
          const clrP=pcfg.color2d;
          const clrV=pcfg.color2d.replace(/[\d.]+\)$/,'0.55)');
          const termM=pcfg.termMap();
          const hitFn=pcfg.hitTest;

          // ── Destinos XY/L: rect tracejado em volta de cada barrinha destino ──
          const hovHit2=hitFn(S.lastSX,S.lastSY);
          S.pendingConduit.validDests.filter(d=>d.kind==='XY'||d.kind==='L').forEach(d=>{
            const isHov2=hovHit2&&kk(d.col,d.row)===hovHit2.key;
            const destKey=kk(d.col,d.row);
            const destArr=termM.get(destKey)||[];
            destArr.forEach((_,di)=>{ pcfg.highlight(destKey, di, isHov2?clrP:clrV, isHov2?2.5:1.5, 4); });
            if(isHov2){
              const fromArr2=termM.get(kk(oc,or))||[];
              const fromH2=fromArr2[S.pendingConduit.fromBoxIdx]?.heightCm??0;
              const hPreview=pcfg.sameHeightOnly?fromH2:Math.min(fromH2,d.toHeightCm??fromH2);
              let preview;
              if(d.kind==='L'&&d.corner){
                preview=_conduitBuildLPath(oc,or,d.corner.col,d.corner.row,d.col,d.row,hPreview);
                cx2.fillStyle=clrP;
                cx2.beginPath();cx2.arc(d.corner.col*CELL+CELL/2,d.corner.row*CELL+CELL/2,CELL*0.18,0,Math.PI*2);cx2.fill();
              } else {
                preview=_conduitBuildPath(oc,or,d.col,d.row,hPreview);
              }
              if(preview.length>1){
                // Calcular offset do preview como se fosse o próximo traçado
                const previewCdFake={axis:d.kind,path:preview,ctype:S.pendingConduit.ctype};
                const omPreview=_buildOffsetMap([...S.conduits,previewCdFake]);
                cx2.strokeStyle=clrP; cx2.lineWidth=CELL*0.14/S.sc2; cx2.lineCap='round';
                cx2.setLineDash([CELL*0.25/S.sc2,CELL*0.15/S.sc2]);
                cx2.beginPath();
                preview.forEach((p,i)=>{
                  const next=preview[i+1], prev=preview[i-1];
                  const ref=next||prev; if(!ref) return;
                  const dir=(ref.row===p.row)?'H':'V';
                  const off=_getOffset(omPreview,kk(p.col,p.row),dir,previewCdFake);
                  const px2=p.col*CELL+CELL/2+(dir==='H'?0:off);
                  const py2=p.row*CELL+CELL/2+(dir==='H'?off:0);
                  i===0?cx2.moveTo(px2,py2):cx2.lineTo(px2,py2);
                });
                cx2.stroke(); cx2.setLineDash([]);
              }
            }
          });

        } else if(S.electricalSubtool!=='ebox'&&S.electricalSubtool!=='hydro'&&S.electricalSubtool!=='node'){
          // Hover sem pending: rect tracejado na barrinha sob o mouse
          const hcfg=_conduitCfg(S.electricalSubtool==='pipe'?'pipe':'elec');
          const hovHit3=hcfg.hitTest(S.lastSX,S.lastSY);
          if(hovHit3) hcfg.highlight(hovHit3.key, hovHit3.boxIdx, hcfg.color2d, 2.5, 4);
        }

        // Ebox hover
        if(S.electricalSubtool==='ebox'&&S.hcell&&bricks().has(kk(S.hcell.col,S.hcell.row))){
          const hasBox=S.elecBoxes.has(kk(S.hcell.col,S.hcell.row));
          cx2.fillStyle='rgba(245,200,0,0.9)';cx2.font=`bold ${Math.max(8,CELL*.45)}px monospace`;
          cx2.textAlign='center';cx2.textBaseline='middle';
          cx2.fillText(hasBox?'✎':'⊞',S.hcell.col*CELL+CELL/2,S.hcell.row*CELL+CELL/2);
        }
        // Hydro hover
        if(S.electricalSubtool==='hydro'&&S.hcell&&bricks().has(kk(S.hcell.col,S.hcell.row))){
          const hasHydro=S.hydroPoints.has(kk(S.hcell.col,S.hcell.row));
          cx2.strokeStyle='rgba(26,126,200,0.8)';cx2.lineWidth=2/S.sc2;
          cx2.beginPath();cx2.arc(S.hcell.col*CELL+CELL/2,S.hcell.row*CELL+CELL/2,CELL*0.35,0,Math.PI*2);cx2.stroke();
          cx2.fillStyle='rgba(26,126,200,0.9)';cx2.font=`bold ${Math.max(8,CELL*.45)}px monospace`;
          cx2.textAlign='center';cx2.textBaseline='middle';
          cx2.fillText(hasHydro?'✎':'⊕',S.hcell.col*CELL+CELL/2,S.hcell.row*CELL+CELL/2);
        }
        cx2.restore();
      }
      cx2.restore();
    }

    if(S.vistaMode!=='inst'){
      if(S.drawing&&S.dS&&S.dE&&!S.moveMode){
        const{cells,ok}=prevLine(S.dS,S.dE);
        if(ok&&cells.length)cells.forEach(({col,row})=>drawPrevCell(col,row,S.drawMode));
        else if(!ok){cx2.fillStyle=PREV_INV;cx2.fillRect(S.dE.col*CELL,S.dE.row*CELL,CELL,CELL);}
      }
      if(!S.drawing&&!S.rulerOn&&!S.heightMode&&!S.moveMode&&S.drawMode==='wall'&&S.hcell&&!br.has(kk(S.hcell.col,S.hcell.row))&&!S.openMap[kk(S.hcell.col,S.hcell.row)]){
        cx2.fillStyle=HOVER_C;cx2.fillRect(S.hcell.col*CELL,S.hcell.row*CELL,CELL,CELL);
      }
      if(!S.drawing&&!S.rulerOn&&!S.heightMode&&!S.moveMode&&S.drawMode==='opening'&&S.hcell&&br.has(kk(S.hcell.col,S.hcell.row))&&!S.openMap[kk(S.hcell.col,S.hcell.row)]){
        cx2.fillStyle='rgba(26,95,180,.15)';cx2.fillRect(S.hcell.col*CELL,S.hcell.row*CELL,CELL,CELL);
      }
      for(let i=0;i<S.dims.length;i++)drawDim(S.dims[i].pt1,S.dims[i].pt2,false,i===S.hovDim,S.dims[i].side,i===S.selDim);
      if(!S.is3d&&S.vistaMode==='planta')drawElevOverlay();
      if(S.rulerOn&&S.snapPt){if(S.rPt1){drawDim(S.rPt1,S.snapPt,true,false,1,false);drawSnap(S.rPt1,true);}drawSnap(S.snapPt,false);}
    }
  }

  // Grid (both modes)
  cx2.strokeStyle=GRID;cx2.lineWidth=1/S.sc2;cx2.beginPath();
  for(let c=cS;c<=cE;c++){cx2.moveTo(c*CELL,rS*CELL);cx2.lineTo(c*CELL,rE*CELL);}
  for(let r=rS;r<=rE;r++){cx2.moveTo(cS*CELL,r*CELL);cx2.lineTo(cE*CELL,r*CELL);}
  cx2.stroke();
  // origin cross
  cx2.strokeStyle='#ccc';cx2.lineWidth=1.5/S.sc2;cx2.beginPath();cx2.moveTo(-CELL*.35,0);cx2.lineTo(CELL*.35,0);cx2.moveTo(0,-CELL*.35);cx2.lineTo(0,CELL*.35);cx2.stroke();

  cx2.restore();
  // Ícones de cota selecionada — desenhados em coords de tela, fora da transform
  if(S.selDim>=0) drawDimIcons(S.selDim);
  if(S.vistaMode==='inst') updInstHint();
}

// Count bricks per type across all courses and update statusbar.
// Runs analyzeCourse for every course — only called after draws to avoid lag.

export { draw2d, resize2d, prevLine, detectRun, detectOpeningRun, dimLbl, dimMid, dimHit, drawBk, cleanDoorOrient, drawOpenCell, getDoorRun, drawDoorSymbol, drawDoorRuns, drawBrickUnit, drawAbsentCell, drawPrevCell, drawRunHL, drawSelectedRun, drawDim, drawSnap, dimIconPos, drawDimIcons };
