import { S } from './state.js';

// ── Helper accessors ──────────────────────────────────────────────────────
export const bricks    = () => new Set(S.hist[S.hi]);
export const kk        = (c, r) => `${c},${r}`;
export const getCellH  = k => S.wallHMap[k] !== undefined ? S.wallHMap[k] : S.wallHCm;

function getStateStr(){
  return JSON.stringify({brickSize:S.cellCm,brickHeight:S.brickHCm,wallHeight:S.wallHCm,
    bricks:[...bricks()],dimensions:S.dims,wallHeightMap:S.wallHMap,openingMap:S.openMap,doorOrient:S.doorOrient,projectName:S.projectName,S.slopedKeys:[...S.slopedKeys],elevViews:S.elevViews,S.manualElec:[...S.manualElec],S.manualWater:[...S.manualWater],S.elecBoxes:Object.fromEntries(S.elecBoxes),S.hydroPoints:Object.fromEntries(S.hydroPoints),S.gasPoints:Object.fromEntries(S.gasPoints),conduits:S.conduits,
    settings:{elecLow:S.elecLow,elecMid:S.elecMid,elecHigh:S.elecHigh,hydroLow:S.hydroLow,hydroMid:S.hydroMid,hydroHigh:S.hydroHigh,stdSill:S.stdSill,stdHead:S.stdHead}});
}
function markDirty(){
  const dirty = getStateStr()!==S.lastSavedState;
  document.getElementById('proj-dirty').classList.toggle('visible', dirty);
}
function showAutosaveToast(){
  const t=document.getElementById('autosave-toast');
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1400);
}
function doAutosave(){
  try{
    // Capture bg image for autosave
    let bgData=null;
    if(S.bgImg.img){
      try{
        const cvTmp=document.createElement('canvas');
        cvTmp.width=S.bgImg.img.naturalWidth; cvTmp.height=S.bgImg.img.naturalHeight;
        cvTmp.getContext('2d').drawImage(S.bgImg.img,0,0);
        bgData={src:cvTmp.toDataURL('image/jpeg',0.85),x:S.bgImg.x,y:S.bgImg.y,scale:S.bgImg.scale,opacity:S.bgImg.opacity,locked:S.bgImg.locked,fileName:S.bgImg.fileName};
      }catch(e){}
    }
    localStorage.setItem('tijocad_autosave', JSON.stringify({
      version:5, brickSize:S.cellCm, brickHeight:S.brickHCm, wallHeight:S.wallHCm,
      bricks:[...bricks()], dimensions:S.dims.map(d=>({pt1:d.pt1,pt2:d.pt2})),
      wallHeightMap:S.wallHMap, openingMap:S.openMap, doorOrient:S.doorOrient, projectName:S.projectName, S.slopedKeys:[...S.slopedKeys], elevViews:S.elevViews, S.manualElec:[...S.manualElec], S.manualWater:[...S.manualWater], S.elecBoxes:Object.fromEntries(S.elecBoxes),S.hydroPoints:Object.fromEntries(S.hydroPoints),S.gasPoints:Object.fromEntries(S.gasPoints), conduits:S.conduits, bgImage:bgData,
      settings:{elecLow:S.elecLow,elecMid:S.elecMid,elecHigh:S.elecHigh,hydroLow:S.hydroLow,hydroMid:S.hydroMid,hydroHigh:S.hydroHigh,stdSill:S.stdSill,stdHead:S.stdHead}
    }));
    showAutosaveToast();
  }catch(err){}
  markDirty();
}

const bricks   = ()=> new Set(S.hist[S.hi]);
const kk       = (c,r)=> `${c},${r}`;
const getCellH = k=> S.wallHMap[k]!==undefined ? S.wallHMap[k] : S.wallHCm;

// Serializar/restaurar Maps e Sets para o histórico
const snapMap = m => JSON.stringify([...m.entries()]);
const restMap = s => new Map(JSON.parse(s||'[]'));
const snapSet = s => JSON.stringify([...s]);
const restSet = s => new Set(JSON.parse(s||'[]'));

function pushHist(s){
  S.hist=S.hist.slice(0,S.hi+1);
  S.histOpen=S.histOpen.slice(0,S.hi+1);
  S.histWH=S.histWH.slice(0,S.hi+1);
  S.histGrout=S.histGrout.slice(0,S.hi+1);
  S.histConduits=S.histConduits.slice(0,S.hi+1);
  S.histElecBoxes=S.histElecBoxes.slice(0,S.hi+1);
  S.histHydroPoints=S.histHydroPoints.slice(0,S.hi+1);
  S.histGasPoints=S.histGasPoints.slice(0,S.hi+1);
  S.histSlopedKeys=S.histSlopedKeys.slice(0,S.hi+1);
  S.histDims=S.histDims.slice(0,S.hi+1);
  S.histElevViews=S.histElevViews.slice(0,S.hi+1);
  S.hist.push([...s]);
  S.histOpen.push(JSON.parse(JSON.stringify(S.openMap)));
  S.histWH.push(JSON.parse(JSON.stringify(S.wallHMap)));
  S.histGrout.push([...S.manualGrout, ...[...S.manualElec].map(k=>'E:'+k), ...[...S.manualWater].map(k=>'W:'+k), ...[...S.groutExclude].map(k=>'X:'+k)]);
  S.histConduits.push(JSON.parse(JSON.stringify(S.conduits)));
  S.histElecBoxes.push(snapMap(S.elecBoxes));
  S.histHydroPoints.push(snapMap(S.hydroPoints));
  S.histGasPoints.push(snapMap(S.gasPoints));
  S.histSlopedKeys.push(snapSet(S.slopedKeys));
  S.histDims.push(JSON.parse(JSON.stringify(S.dims)));
  S.histElevViews.push(JSON.parse(JSON.stringify(S.elevViews)));
  S.hi++;
  const CAP=82;
  if(S.hist.length>CAP){
    const trim=S.hist.length-CAP;
    [S.hist,S.histOpen,S.histWH,S.histGrout,S.histConduits,S.histElecBoxes,S.histHydroPoints,S.histGasPoints,S.histSlopedKeys,S.histDims,S.histElevViews]
      .forEach(a=>a.splice(1,trim));
    S.hi=S.hist.length-1;
  }
  updUR();
  clearTimeout(S.autosaveTimer);
  S.autosaveTimer=setTimeout(doAutosave, 800);
  markDirty();
}
function restoreHist(){
  S.openMap=JSON.parse(JSON.stringify(S.histOpen[S.hi]||{}));
  S.wallHMap=JSON.parse(JSON.stringify(S.histWH[S.hi]||{}));
  const _hg=S.histGrout[S.hi]||[];
  S.manualGrout=new Set(_hg.filter(k=>!k.startsWith('E:')&&!k.startsWith('W:')&&!k.startsWith('X:')));
  S.manualElec =new Set(_hg.filter(k=>k.startsWith('E:')).map(k=>k.slice(2)));
  S.manualWater=new Set(_hg.filter(k=>k.startsWith('W:')).map(k=>k.slice(2)));
  S.groutExclude=new Set(_hg.filter(k=>k.startsWith('X:')).map(k=>k.slice(2)));
  S.conduits   = JSON.parse(JSON.stringify(S.histConduits[S.hi]||[]));
  S.elecBoxes  = restMap(S.histElecBoxes[S.hi]||'[]');
  S.hydroPoints= restMap(S.histHydroPoints[S.hi]||'[]');
  S.gasPoints  = restMap(S.histGasPoints[S.hi]||'[]');
  S.slopedKeys = restSet(S.histSlopedKeys[S.hi]||'[]');
  S.dims       = JSON.parse(JSON.stringify(S.histDims[S.hi]||[]));
  S.elevViews  = JSON.parse(JSON.stringify(S.histElevViews[S.hi]||[]));
  S.pendingConduit=null;
}
function updUR(){ document.getElementById('btn-undo').disabled=S.hi<=0; document.getElementById('btn-redo').disabled=S.hi>=S.hist.length-1; }

// ── Vista toggle (Planta / Fiada / Elevação / 3D) ──

export { getStateStr, markDirty, showAutosaveToast, doAutosave, pushHist, restoreHist, updUR };
