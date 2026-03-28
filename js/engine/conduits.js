import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { kk, bricks } from '../core/history.js';

// Tudo que difere entre 'elec' e 'pipe' (cor, espessura, mapa de terminais,
// hit-test, restrição de altura) está aqui. O restante da lógica é idêntico.
// Tudo que difere entre 'elec' e 'pipe' (cor, espessura, mapa de terminais,
// hit-test, restrição de altura) está aqui. O restante da lógica é idêntico.
const CONDUIT_CFG = {
  elec: {
    termMap:      ()=> S.elecBoxes,
    hitTest:      (sx,sy)=> hitTestEbox(sx,sy),
    barRect:      (key,idx)=> eboxBarRect(key,idx),
    highlight:    (key,idx,clr,lw,dash)=> drawEboxHighlight(key,idx,clr,lw,dash),
    sameHeightOnly: true,          // origem e destino devem ter mesma altura
    color2d:      'rgba(245,200,0,0.85)',
    colorStroke:  'rgba(184,151,10,0.9)',
    lineW2d:      ()=> CELL*0.18,
    color3d:      0xF5C800,
    radius3d:     0.012,
    hint:         'clique numa caixinha = origem do conduíte · dir = remover conduíte',
  },
  pipe: {
    termMap:      ()=> S.hydroPoints,
    hitTest:      (sx,sy)=> hitTestHydro(sx,sy),
    barRect:      (key,idx)=> hydroBarRect(key,idx),
    highlight:    (key,idx,clr,lw,dash)=> drawHydroHighlight(key,idx,clr,lw,dash),
    sameHeightOnly: false,         // tubulação aceita alturas diferentes
    color2d:      'rgba(13,74,122,0.90)',
    colorStroke:  'rgba(5,40,80,0.9)',
    lineW2d:      ()=> CELL*0.26,
    color3d:      0x0d4a7a,
    radius3d:     0.020,
    hint:         'clique num ponto hidráulico = origem da tubulação · dir = remover',
  },
  gas: {
    termMap:      ()=> S.gasPoints,
    hitTest:      (sx,sy)=> hitTestGas(sx,sy),
    barRect:      (key,idx)=> gasBarRect(key,idx),
    highlight:    (key,idx,clr,lw,dash)=> drawGasHighlight(key,idx,clr,lw,dash),
    sameHeightOnly: false,
    color2d:      'rgba(232,102,10,0.90)',
    colorStroke:  'rgba(160,60,5,0.9)',
    lineW2d:      ()=> CELL*0.26,
    color3d:      0xE8660A,
    radius3d:     0.020,
    hint:         'clique em parede = inserir ponto de gás (Terminal ou Conexão) · dir = remover',
  },
  gasPipe: {
    termMap:      ()=> S.gasPoints,
    hitTest:      (sx,sy)=> hitTestGas(sx,sy),
    barRect:      (key,idx)=> gasBarRect(key,idx),
    highlight:    (key,idx,clr,lw,dash)=> drawGasHighlight(key,idx,clr,lw,dash),
    sameHeightOnly: false,
    color2d:      'rgba(232,102,10,0.90)',
    colorStroke:  'rgba(160,60,5,0.9)',
    lineW2d:      ()=> CELL*0.26,
    color3d:      0xE8660A,
    radius3d:     0.020,
    hint:         'clique num ponto de gás = origem do tubo · dir = remover',
  },
};
// Helper: retorna cfg para o subtool ativo (elec ou pipe)
function _conduitCfg(ctype){ return CONDUIT_CFG[ctype] || CONDUIT_CFG.elec; }

// Verifica se uma célula está bloqueada para um conduíte na altura hCm.
// Uma célula bloqueia se: (a) não é tijolo, ou (b) tem abertura cobrindo hCm.
function _cellBlocksConduit(col, row, hCm, br){
  const k=kk(col,row);
  if(!br.has(k)) return true;           // sem tijolo = descontinuidade
  const op=S.openMap[k];
  if(!op) return false;                 // tijolo sólido, livre
  // Abertura cobre hCm se infCm <= hCm < supCm
  if(hCm >= op.infCm && hCm < op.supCm) return true;
  return false;
}

// Constrói caminho reto verificando tijolos E aberturas na altura hCm.
// Retorna [] se qualquer célula do caminho for inválida (incluindo ausente).
function _conduitBuildPath(fc,fr,tc,tr, hCm){
  if(fc!==tc && fr!==tr) return [];
  const br=bricks(), path=[];
  if(fc===tc){
    const s=tr>fr?1:-1;
    for(let r=fr;r!==tr+s;r+=s){
      if(_cellBlocksConduit(fc,r,hCm??0,br)) return []; // caminho bloqueado
      path.push({col:fc,row:r});
    }
  } else {
    const s=tc>fc?1:-1;
    for(let c=fc;c!==tc+s;c+=s){
      if(_cellBlocksConduit(c,fr,hCm??0,br)) return []; // caminho bloqueado
      path.push({col:c,row:fr});
    }
  }
  return path;
}

function _conduitBuildLPath(fc,fr,cc,cr,tc,tr, hCm){
  const leg1=_conduitBuildPath(fc,fr,cc,cr,hCm);
  const leg2=_conduitBuildPath(cc,cr,tc,tr,hCm);
  if(!leg1.length||!leg2.length) return [];
  // Merge — corner appears in both, deduplicate
  const seen=new Set();
  const path=[];
  [...leg1,...leg2].forEach(p=>{
    const k=kk(p.col,p.row);
    if(!seen.has(k)){seen.add(k);path.push(p);}
  });
  return path;
}

// Valid destinations from a terminal cell + index.
// Usa CONDUIT_CFG para determinar: mapa de terminais, restrição de altura.
function getValidDestinations(fromKey, fromBoxIdx, terminalMap, ctype){
  const cfg=_conduitCfg(ctype);
  terminalMap = terminalMap || cfg.termMap();
  const[fc,fr]=fromKey.split(',').map(Number);
  const br=bricks();
  const dests=[];
  const fromArr=terminalMap.get(fromKey)||[];
  const fromH=fromArr[fromBoxIdx]?.heightCm??0;

  // ── Z destinations ─────────────────────────────────
  fromArr.forEach((pt,i)=>{
    if(i===fromBoxIdx) return;
    dests.push({kind:'Z',term:'box',col:fc,row:fr,toBoxIdx:i,toHeightCm:pt.heightCm,label:`Ponto ${i+1} (${pt.heightCm}cm)`});
  });
  dests.push({kind:'Z',term:'top', col:fc,row:fr,toBoxIdx:null,toHeightCm:getCellH(kk(fc,fr)),label:'Topo'});
  dests.push({kind:'Z',term:'base',col:fc,row:fr,toBoxIdx:null,toHeightCm:0,     label:'Base'});

  // ── XY destinations ─────────────────────────────────
  terminalMap.forEach((toArr,k)=>{
    if(k===fromKey) return;
    const[c,r]=k.split(',').map(Number);
    const toH=toArr[0]?.heightCm??0;
    if(cfg.sameHeightOnly && Math.abs(fromH-toH)>1) return;
    const hCheck=cfg.sameHeightOnly ? fromH : Math.min(fromH,toH);
    if(c===fc && r!==fr){
      const path=_conduitBuildPath(fc,fr,c,r,hCheck);
      if(path.length) dests.push({kind:'XY',term:'box',col:c,row:r,toBoxIdx:0,toHeightCm:toH,label:'Ponto (mesmo col)'});
    } else if(r===fr && c!==fc){
      const path=_conduitBuildPath(fc,fr,c,r,hCheck);
      if(path.length) dests.push({kind:'XY',term:'box',col:c,row:r,toBoxIdx:0,toHeightCm:toH,label:'Ponto (mesma linha)'});
    }
  });

  // ── L destinations ──────────────────────────────────
  terminalMap.forEach((toArr,k)=>{
    if(k===fromKey) return;
    const[tc,tr]=k.split(',').map(Number);
    if(tc===fc||tr===fr) return;
    const toH=toArr[0]?.heightCm??0;
    if(cfg.sameHeightOnly && Math.abs(fromH-toH)>1) return;
    const hCheck=cfg.sameHeightOnly ? fromH : Math.min(fromH,toH);
    for(const[cc,cr] of [[fc,tr],[tc,fr]]){
      if(_cellBlocksConduit(cc,cr,hCheck,br)) continue;
      const leg1=_conduitBuildPath(fc,fr,cc,cr,hCheck);
      const leg2=_conduitBuildPath(cc,cr,tc,tr,hCheck);
      if(leg1.length&&leg2.length){
        dests.push({kind:'L',term:'box',col:tc,row:tr,toBoxIdx:0,toHeightCm:toH,
          corner:{col:cc,row:cr},label:'Ponto (L)'});
        break;
      }
    }
  });

  return dests;
}

function createConduit(fromKey, fromBoxIdx, dest, ctype, terminalMap){
  const cfg=_conduitCfg(ctype);
  terminalMap = terminalMap || cfg.termMap();
  const[fc,fr]=fromKey.split(',').map(Number);
  const toKey = dest.kind==='Z' ? fromKey : kk(dest.col,dest.row);
  const arr=terminalMap.get(fromKey)||[];
  const fromH=arr[fromBoxIdx]?.heightCm??0;
  const toH=dest.toHeightCm??fromH;

  let path;
  const hCheck = cfg.sameHeightOnly ? fromH : Math.min(fromH,toH);
  if(dest.kind==='Z') path=[{col:fc,row:fr}];
  else if(dest.kind==='L') path=_conduitBuildLPath(fc,fr,dest.corner.col,dest.corner.row,dest.col,dest.row,hCheck);
  else path=_conduitBuildPath(fc,fr,dest.col,dest.row,hCheck);
  if(!path.length) return;

  S.conduits=S.conduits.filter(cd=>!(
    cd.fromKey===fromKey&&cd.axis===dest.kind&&
    cd.termTo===dest.term&&cd.toKey===toKey&&
    cd.fromBoxIdx===fromBoxIdx
  ));
  const id=Date.now()+'_'+Math.random().toString(36).slice(2,6);
  S.conduits.push({id,ctype,axis:dest.kind,fromKey,toKey,
    fromBoxIdx,toBoxIdx:dest.toBoxIdx,
    termTo:dest.term,fromHeightCm:fromH,toHeightCm:toH,
    path,corner:dest.corner||null});
}

// Helper: given a mousedown on a cell that IS the pending origin,
// decide which Z destination was intended based on click Y position within cell.
function _pickZDest(sx, sy, validDests){
  const zDests=validDests.filter(d=>d.kind==='Z');
  if(!zDests.length) return null;
  // Determine relative Y within the cell (0=top, 1=bottom)
  const col=Math.floor((sx-S.ox)/S.sc2/CELL), row=Math.floor((sy-S.oy)/S.sc2/CELL);
  const yRel=((sy-S.oy)/S.sc2 - row*CELL)/CELL;
  if(yRel<0.38) return zDests.find(d=>d.term==='top')||zDests[0];
  if(yRel>0.62) return zDests.find(d=>d.term==='base')||zDests[zDests.length-1];
  // Middle: box-to-box or first available
  return zDests.find(d=>d.term==='box')||zDests[0];
}

// ── Hit-test para barrinhas de caixa na planta/inst ─────────────────────────
// Retorna {key, boxIdx} se o ponto de tela (sx,sy) cai sobre uma barrinha,
// ou null. Recria a mesma geometria do render para garantir consistência.
function hitTestEbox(sx, sy){
  const wx=(sx-S.ox)/S.sc2, wy=(sy-S.oy)/S.sc2;
  const br=bricks();
  const GAP0=CELL*0.04, GAP1=CELL*0.035, BAR=CELL*0.26;
  const pxPerCm2=CELL/S.cellCm;
  const pad=CELL*0.15; // tolerância de clique

  for(const [k, arr] of S.elecBoxes){
    if(!br.has(k)||!arr.length) continue;
    const[c,r]=k.split(',').map(Number);
    const wDir=runPrimaryDir(c,r,br);

    // Agrupar por face e ordenar por heightCm crescente (igual ao render)
    const byFace=new Map();
    arr.forEach((eb,i)=>{
      const f=eb.face>0?1:-1;
      if(!byFace.has(f)) byFace.set(f,[]);
      byFace.get(f).push({eb,i});
    });

    for(const [face, boxes] of byFace){
      const sorted=[...boxes].sort((a,b)=>a.eb.heightCm-b.eb.heightCm);
      for(let si=0;si<sorted.length;si++){
        const {eb,i}=sorted[si];
        const barLen=Math.max(CELL*0.5, eb.wCm*pxPerCm2);
        const offset=GAP0+si*(BAR+GAP1);
        let bx,by,bw,bh;
        if(wDir==='H'){
          bw=barLen; bh=BAR;
          bx=c*CELL+CELL/2-bw/2;
          by=face>0 ? r*CELL-offset-BAR : (r+1)*CELL+offset;
        } else {
          bw=BAR; bh=barLen;
          bx=face>0 ? (c+1)*CELL+offset : c*CELL-offset-BAR;
          by=r*CELL+CELL/2-bh/2;
        }
        if(wx>=bx-pad && wx<=bx+bw+pad && wy>=by-pad && wy<=by+bh+pad){
          return {key:k, boxIdx:i};
        }
      }
    }
  }
  return null;
}
// ── Desenha retângulo de destaque ao redor de uma barrinha ───────────────────
function drawEboxHighlight(key, boxIdx, clr, lineW, dashLen){
  const br2=bricks();
  if(!br2.has(key)||!S.elecBoxes.has(key)) return;
  const[c,r]=key.split(',').map(Number);
  const wDir2=runPrimaryDir(c,r,br2);
  const GAP0b=CELL*0.04,GAP1b=CELL*0.035,BARb=CELL*0.26,pxPerCm3=CELL/S.cellCm;
  const arr2=S.elecBoxes.get(key);
  const byFace2=new Map();
  arr2.forEach((eb,i)=>{const f=eb.face>0?1:-1;if(!byFace2.has(f))byFace2.set(f,[]);byFace2.get(f).push({eb,i});});
  byFace2.forEach((boxes2,face2)=>{
    const sorted2=[...boxes2].sort((a,b)=>a.eb.heightCm-b.eb.heightCm);
    sorted2.forEach(({eb,i},si)=>{
      if(i!==boxIdx) return;
      const barLen2=Math.max(CELL*0.5,eb.wCm*pxPerCm3);
      const offset2=GAP0b+si*(BARb+GAP1b);
      let hbx,hby,hbw,hbh;
      if(wDir2==='H'){hbw=barLen2;hbh=BARb;hbx=c*CELL+CELL/2-hbw/2;hby=face2>0?r*CELL-offset2-BARb:(r+1)*CELL+offset2;}
      else           {hbw=BARb;hbh=barLen2;hbx=face2>0?(c+1)*CELL+offset2:c*CELL-offset2-BARb;hby=r*CELL+CELL/2-hbh/2;}
      const pad=CELL*0.08;
      S.cx2.save();
      S.cx2.strokeStyle=clr; S.cx2.lineWidth=lineW/S.sc2;
      if(dashLen) S.cx2.setLineDash([dashLen/S.sc2,dashLen*0.6/S.sc2]);
      S.cx2.strokeRect(hbx-pad,hby-pad,hbw+pad*2,hbh+pad*2);
      if(dashLen) S.cx2.setLineDash([]);
      S.cx2.restore();
    });
  });
}
// Retorna geometria {bx,by,bw,bh} da barrinha em coords mundo, ou null
function eboxBarRect(key, boxIdx){
  const br2=bricks(); if(!br2.has(key)||!S.elecBoxes.has(key)) return null;
  const[c,r]=key.split(',').map(Number);
  const wDir2=runPrimaryDir(c,r,br2);
  const GAP0b=CELL*0.04,GAP1b=CELL*0.035,BARb=CELL*0.26,pxPerCm3=CELL/S.cellCm;
  const arr2=S.elecBoxes.get(key);
  const byFace2=new Map();
  arr2.forEach((eb,i)=>{const f=eb.face>0?1:-1;if(!byFace2.has(f))byFace2.set(f,[]);byFace2.get(f).push({eb,i});});
  let result=null;
  byFace2.forEach((boxes2,face2)=>{
    if(result) return;
    const sorted2=[...boxes2].sort((a,b)=>a.eb.heightCm-b.eb.heightCm);
    sorted2.forEach(({eb,i},si)=>{
      if(i!==boxIdx||result) return;
      const barLen2=Math.max(CELL*0.5,eb.wCm*pxPerCm3);
      const offset2=GAP0b+si*(BARb+GAP1b);
      let hbx,hby,hbw,hbh;
      if(wDir2==='H'){hbw=barLen2;hbh=BARb;hbx=c*CELL+CELL/2-hbw/2;hby=face2>0?r*CELL-offset2-BARb:(r+1)*CELL+offset2;}
      else           {hbw=BARb;hbh=barLen2;hbx=face2>0?(c+1)*CELL+offset2:c*CELL-offset2-BARb;hby=r*CELL+CELL/2-hbh/2;}
      result={bx:hbx,by:hby,bw:hbw,bh:hbh};
    });
  });
  return result;
}

// Retorna Set<cellKey> de todas as células que têm conduíte horizontal (XY/L)
// passando — essas canaletas NÃO levam graute no canal.
function computeConduitCanalCells(){
  const s=new Set();
  S.conduits.filter(cd=>cd.axis==='XY'||cd.axis==='L').forEach(cd=>{
    cd.path.forEach(p=>s.add(kk(p.col,p.row)));
  });
  return s;
}

// ── Funções análogas para pontos hidráulicos ─────────────────────────────────
// Geometria: barrinhas azuis empilhadas, mesma lógica das elétricas.
// Largura da barrinha = diamMm/10 cm convertido em pixels (mínimo CELL*0.4).
// Espessura (BAR), GAP0, GAP1 iguais.

function _hydroBarGeom(c, r, hp, si, face, wDir){
  const GAP0=CELL*0.04, GAP1=CELL*0.035, BAR=CELL*0.26;
  const pxPerCm=CELL/S.cellCm;
  const barLen=Math.max(CELL*0.4, hp.diamMm/10*pxPerCm*2);
  const offset=GAP0+si*(BAR+GAP1);
  let bx,by,bw,bh;
  if(face===0){
    // Nó interno: quadrado centralizado, ligeiramente menor que a célula
    const sz=CELL*0.38;
    bx=c*CELL+CELL/2-sz/2; by=r*CELL+CELL/2-sz/2; bw=sz; bh=sz;
  } else if(wDir==='H'){
    bw=barLen; bh=BAR;
    bx=c*CELL+CELL/2-bw/2;
    by=face>0 ? r*CELL-offset-BAR : (r+1)*CELL+offset;
  } else {
    bw=BAR; bh=barLen;
    bx=face>0 ? (c+1)*CELL+offset : c*CELL-offset-BAR;
    by=r*CELL+CELL/2-bh/2;
  }
  return {bx,by,bw,bh};
}

function hitTestHydro(sx, sy){
  const wx=(sx-S.ox)/S.sc2, wy=(sy-S.oy)/S.sc2;
  const br=bricks();
  const pad=CELL*0.15;
  for(const [k, arr] of S.hydroPoints){
    if(!br.has(k)||!arr.length) continue;
    const[c,r]=k.split(',').map(Number);
    const wDir=runPrimaryDir(c,r,br);
    const byFace=new Map();
    arr.forEach((hp,i)=>{const f=hp.face===0?0:(hp.face>0?1:-1);if(!byFace.has(f))byFace.set(f,[]);byFace.get(f).push({hp,i});});
    for(const[face,pts] of byFace){
      const sorted=[...pts].sort((a,b)=>a.hp.heightCm-b.hp.heightCm);
      for(let si=0;si<sorted.length;si++){
        const{hp,i}=sorted[si];
        const{bx,by,bw,bh}=_hydroBarGeom(c,r,hp,si,face,wDir);
        if(wx>=bx-pad&&wx<=bx+bw+pad&&wy>=by-pad&&wy<=by+bh+pad) return{key:k,boxIdx:i};
      }
    }
  }
  return null;
}

function drawHydroHighlight(key, boxIdx, clr, lineW, dashLen){
  const br2=bricks(); if(!br2.has(key)||!S.hydroPoints.has(key)) return;
  const[c,r]=key.split(',').map(Number);
  const wDir=runPrimaryDir(c,r,br2);
  const arr=S.hydroPoints.get(key);
  const byFace=new Map();
  arr.forEach((hp,i)=>{const f=hp.face===0?0:(hp.face>0?1:-1);if(!byFace.has(f))byFace.set(f,[]);byFace.get(f).push({hp,i});});
  byFace.forEach((pts,face)=>{
    const sorted=[...pts].sort((a,b)=>a.hp.heightCm-b.hp.heightCm);
    sorted.forEach(({hp,i},si)=>{
      if(i!==boxIdx) return;
      const{bx,by,bw,bh}=_hydroBarGeom(c,r,hp,si,face,wDir);
      const pad=CELL*0.08;
      S.cx2.save();
      S.cx2.strokeStyle=clr; S.cx2.lineWidth=lineW/S.sc2;
      if(dashLen) S.cx2.setLineDash([dashLen/S.sc2,dashLen*0.6/S.sc2]);
      S.cx2.strokeRect(bx-pad,by-pad,bw+pad*2,bh+pad*2);
      if(dashLen) S.cx2.setLineDash([]);
      S.cx2.restore();
    });
  });
}

function hydroBarRect(key, boxIdx){
  const br2=bricks(); if(!br2.has(key)||!S.hydroPoints.has(key)) return null;
  const[c,r]=key.split(',').map(Number);
  const wDir=runPrimaryDir(c,r,br2);
  const arr=S.hydroPoints.get(key);
  const byFace=new Map();
  arr.forEach((hp,i)=>{const f=hp.face===0?0:(hp.face>0?1:-1);if(!byFace.has(f))byFace.set(f,[]);byFace.get(f).push({hp,i});});
  let result=null;
  byFace.forEach((pts,face)=>{
    if(result) return;
    const sorted=[...pts].sort((a,b)=>a.hp.heightCm-b.hp.heightCm);
    sorted.forEach(({hp,i},si)=>{
      if(i!==boxIdx||result) return;
      result=_hydroBarGeom(c,r,hp,si,face,wDir);
    });
  });
  return result;
}

// ── Funções gás — mesma geometria do hidráulico, sobre S.gasPoints ──────────────
function hitTestGas(sx,sy){
  const saved=S.hydroPoints; S.hydroPoints=S.gasPoints;
  const r=hitTestHydro(sx,sy);
  S.hydroPoints=saved; return r;
}
function drawGasHighlight(key,boxIdx,clr,lineW,dashLen){
  const saved=S.hydroPoints; S.hydroPoints=S.gasPoints;
  drawHydroHighlight(key,boxIdx,clr,lineW,dashLen);
  S.hydroPoints=saved;
}
function gasBarRect(key,boxIdx){
  const saved=S.hydroPoints; S.hydroPoints=S.gasPoints;
  const r=hydroBarRect(key,boxIdx);
  S.hydroPoints=saved; return r;
}

// The course is determined by the box height of the conduit's origin box.
function computeConduitCanalKeys(){
  const m=new Map();
  S.conduits.filter(cd=>cd.axis==='XY'||cd.axis==='L').forEach(cd=>{
    const cIdx=Math.floor((cd.fromHeightCm??0)/S.brickHCm);
    cd.path.forEach(p=>{
      const k=kk(p.col,p.row);
      if(!m.has(k)) m.set(k,new Set());
      m.get(k).add(cIdx);
    });
  });
  return m;
}