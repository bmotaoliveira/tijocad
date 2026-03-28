// ── ENTRY POINT ────────────────────────────────────────────────────────────
// app.js — imports all modules and initializes the application

import { S } from './core/state.js';
import { bricks, kk, updUR, markDirty, doAutosave } from './core/history.js';
import { draw2d, resize2d } from './render/draw2d.js';
import { build3d, resize3d } from './render/draw3d.js';
import { updSt } from './ui/statusbar.js';
import { updSbBrickInfo, syncPopupPresets, maxCourses } from './ui/config.js';
import { setVista } from './ui/subheader.js';
import { bgUpdatePanel } from './features/background.js';
import { openModal, closeModal } from './ui/modal.js';

// Initialize canvas refs after DOM is ready
S.cv2 = document.getElementById('cv2');
S.cx2 = S.cv2.getContext('2d');

// ── Restore autosave from localStorage ────────────────────────────────────
(function(){
  try{
    const raw=localStorage.getItem('tijocad_autosave');
    if(!raw)return;
    const d=JSON.parse(raw);
    if(!d.bricks||!Array.isArray(d.bricks))return;
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
    S.pendingConduit=null;
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
    }
    S.projectName=d.projectName||'';
    document.getElementById('proj-name').value=S.projectName;
    document.title=S.projectName?`TijoCAD — ${S.projectName}`:'TijoCAD';
    if(d.settings){const s=d.settings;S.elecLow=s.elecLow||30;S.elecMid=s.elecMid||120;S.elecHigh=s.elecHigh||180;S.hydroLow=s.hydroLow||30;S.hydroMid=s.hydroMid||110;S.hydroHigh=s.hydroHigh||180;S.stdSill=s.stdSill||110;S.stdHead=s.stdHead||210;}
    syncPopupPresets();
    updSbBrickInfo();
    S.hist=[[],[...new Set(d.bricks)]];S.histOpen=[{},JSON.parse(JSON.stringify(S.openMap))];S.histWH=[{},JSON.parse(JSON.stringify(S.wallHMap))];S.histGrout=[[],[]];S.histConduits=[[],JSON.parse(JSON.stringify(S.conduits))];S.histElecBoxes=[[], JSON.stringify([...S.elecBoxes.entries()])];S.histHydroPoints=[[], JSON.stringify([...S.hydroPoints.entries()])];S.histGasPoints=[[], JSON.stringify([...S.gasPoints.entries()])];S.histSlopedKeys=[[],JSON.stringify([...S.slopedKeys])];S.histDims=[[],JSON.parse(JSON.stringify(S.dims))];S.histElevViews=[[],JSON.parse(JSON.stringify(S.elevViews))];S.hi=1;
  }catch(err){}
})();

// ── Final init ─────────────────────────────────────────────────────────────
updUR();
S.lastSavedState='';
markDirty();
resize2d();

// Expose helpers on window for inline HTML handlers (if any)
window.appAlert = (msg) => openModal(msg, [{label:'OK', cls:'primary', cb:null}]);
window.appConfirm = (msg, onOk, opts={}) => {
  const okLabel = opts.okLabel || 'OK';
  const okClass = opts.okClass || 'primary';
  openModal(msg, [
    {label:'Cancelar', cls:'', cb:null},
    {label:okLabel, cls:okClass, cb:onOk},
  ]);
};
