import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { draw2d } from '../render/draw2d.js';

function loadImageFile(file){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>res(img);
      img.onerror=()=>rej(new Error('Imagem inválida'));
      img.src=reader.result;
    };
    reader.onerror=()=>rej(new Error('Erro ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

async function loadPdfAsImage(file){
  // Load pdf.js from CDN if not already loaded
  if(!window.pdfjsLib){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=res; s.onerror=()=>rej(new Error('Não foi possível carregar pdf.js'));
      document.head.appendChild(s);
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const page=await pdf.getPage(1);
  const vp=page.getViewport({scale:2}); // 2x for quality
  const canvas=document.createElement('canvas');
  canvas.width=vp.width; canvas.height=vp.height;
  await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
  const img=new Image();
  img.src=canvas.toDataURL();
  await new Promise(r=>{img.onload=r;});
  return img;
}

// ── Panel controls ──
function bgUpdatePanel(){
  document.getElementById('bg-fname').textContent=S.bgImg.fileName;
  document.getElementById('bg-opacity').value=Math.round(S.bgImg.opacity*100);
  document.getElementById('bg-opacity-val').textContent=Math.round(S.bgImg.opacity*100)+'%';
  document.getElementById('bg-scale').value=Math.round(S.bgImg.scale*100);
  document.getElementById('bg-scale-val').textContent=Math.round(S.bgImg.scale*100)+'%';
  document.getElementById('brick-opacity').value=Math.round(S.brickOpacity*100);
  document.getElementById('brick-opacity-val').textContent=Math.round(S.brickOpacity*100)+'%';
  const lockBtn=document.getElementById('bg-lock');
  lockBtn.classList.toggle('active',S.bgImg.locked);
  lockBtn.innerHTML=S.bgImg.locked
    ?'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>Travado'
    :'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>Travar';
}

document.getElementById('bg-opacity').addEventListener('input',e=>{
  S.bgImg.opacity=parseInt(e.target.value)/100;
  document.getElementById('bg-opacity-val').textContent=e.target.value+'%';
  draw2d();
});
document.getElementById('brick-opacity').addEventListener('input',e=>{
  S.brickOpacity=parseInt(e.target.value)/100;
  document.getElementById('brick-opacity-val').textContent=e.target.value+'%';
  draw2d();
});

document.getElementById('bg-scale').addEventListener('input',e=>{
  const oldScale=S.bgImg.scale;
  S.bgImg.scale=parseInt(e.target.value)/100;
  document.getElementById('bg-scale-val').textContent=e.target.value+'%';
  // Scale around center of image
  if(S.bgImg.img){
    const cx=S.bgImg.x+S.bgImg.img.naturalWidth*oldScale/2;
    const cy=S.bgImg.y+S.bgImg.img.naturalHeight*oldScale/2;
    S.bgImg.x=cx-S.bgImg.img.naturalWidth*S.bgImg.scale/2;
    S.bgImg.y=cy-S.bgImg.img.naturalHeight*S.bgImg.scale/2;
  }
  draw2d();
});

document.getElementById('bg-lock').addEventListener('click',()=>{
  S.bgImg.locked=!S.bgImg.locked;
  bgUpdatePanel(); draw2d();
});

document.getElementById('bg-fit').addEventListener('click',()=>{
  bgFitToView(); bgUpdatePanel(); draw2d();
});

document.getElementById('bg-remove').addEventListener('click',()=>{
  S.bgImg.img=null; S.bgImg.fileName='';
  document.getElementById('bg-panel').classList.remove('visible');
  document.getElementById('btn-bgimg').classList.remove('active');
  draw2d();
});

function bgFitToView(){
  if(!S.bgImg.img)return;
  const vp=document.getElementById('viewport');
  const vw=vp.offsetWidth/S.sc2, vh=vp.offsetHeight/S.sc2;
  const iw=S.bgImg.img.naturalWidth, ih=S.bgImg.img.naturalHeight;
  const fitScale=Math.min(vw*0.8/iw, vh*0.8/ih);
  S.bgImg.scale=fitScale;
  S.bgImg.x=-S.ox/S.sc2+(vw-iw*fitScale)/2;
  S.bgImg.y=-S.oy/S.sc2+(vh-ih*fitScale)/2;
}

// ── Mouse drag for bg image ──
const BG_HANDLE_R = 12; // pixel radius for resize handle hit area
function bgHitTest(sx,sy){
  if(!S.bgImg.img||S.bgImg.locked||S.vistaMode!=='planta')return false;
  const wx=(sx-S.ox)/S.sc2, wy=(sy-S.oy)/S.sc2;
  const iw=S.bgImg.img.naturalWidth*S.bgImg.scale;
  const ih=S.bgImg.img.naturalHeight*S.bgImg.scale;
  return wx>=S.bgImg.x && wx<=S.bgImg.x+iw && wy>=S.bgImg.y && wy<=S.bgImg.y+ih;
}
function bgResizeHitTest(sx,sy){
  if(!S.bgImg.img||S.bgImg.locked||S.vistaMode!=='planta')return false;
  const iw=S.bgImg.img.naturalWidth*S.bgImg.scale;
  const ih=S.bgImg.img.naturalHeight*S.bgImg.scale;
  // Bottom-right corner in screen coords
  const crx=(S.bgImg.x+iw)*S.sc2+S.ox;
  const cry=(S.bgImg.y+ih)*S.sc2+S.oy;
  const dx=sx-crx, dy=sy-cry;
  return Math.sqrt(dx*dx+dy*dy)<=BG_HANDLE_R;
}

function bgStartDrag(clientX,clientY,canvasX,canvasY){
  if(bgResizeHitTest(canvasX,canvasY)){
    S.bgImg.resizing=true;
    S.bgImg.dragging=false;
    S.bgImg.resizeStartX=clientX; S.bgImg.resizeStartY=clientY;
    S.bgImg.resizeStartScale=S.bgImg.scale;
    cv2.style.cursor='nwse-resize';
  } else {
    S.bgImg.resizing=false;
    S.bgImg.dragging=true;
    S.bgImg.dragStartX=clientX; S.bgImg.dragStartY=clientY;
    S.bgImg.dragImgX=S.bgImg.x; S.bgImg.dragImgY=S.bgImg.y;
    cv2.classList.add('bg-move');
  }
}

function bgMoveDrag(clientX,clientY){
  if(S.bgImg.resizing){
    // Convert client coords to canvas coords
    const rect=cv2.getBoundingClientRect();
    const sx=clientX-rect.left, sy=clientY-rect.top;
    // Scale proportionally based on diagonal distance from image top-left (anchor)
    const iw=S.bgImg.img.naturalWidth*S.bgImg.resizeStartScale;
    const ih=S.bgImg.img.naturalHeight*S.bgImg.resizeStartScale;
    // All in canvas/screen space
    const anchorX=S.bgImg.x*S.sc2+S.ox;
    const anchorY=S.bgImg.y*S.sc2+S.oy;
    const origCornerX=(S.bgImg.x+iw)*S.sc2+S.ox;
    const origCornerY=(S.bgImg.y+ih)*S.sc2+S.oy;
    const origDist=Math.sqrt((origCornerX-anchorX)**2+(origCornerY-anchorY)**2);
    const newDist=Math.sqrt((sx-anchorX)**2+(sy-anchorY)**2);
    if(origDist>0){
      const ratio=newDist/origDist;
      const newScale=S.bgImg.resizeStartScale*ratio;
      if(newScale>0.01 && newScale<50){
        S.bgImg.scale=newScale;
        document.getElementById('bg-scale').value=Math.round(S.bgImg.scale*100);
        document.getElementById('bg-scale-val').textContent=Math.round(S.bgImg.scale*100)+'%';
      }
    }
    draw2d();
    return;
  }
  if(!S.bgImg.dragging)return;
  const dx=(clientX-S.bgImg.dragStartX)/S.sc2;
  const dy=(clientY-S.bgImg.dragStartY)/S.sc2;
  S.bgImg.x=S.bgImg.dragImgX+dx;
  S.bgImg.y=S.bgImg.dragImgY+dy;
  draw2d();
}

function bgEndDrag(){
  S.bgImg.dragging=false;
  S.bgImg.resizing=false;
  cv2.classList.remove('bg-move');
  cv2.style.cursor='';
}

// ── 2D Touch ───────────────────────────────────────
// v31: DRAG = PAN (always), TAP = draw/toggle, PINCH = zoom
let touch2={
  active:false,
  isPan:false,
  isPinch:false,
  startX:0, startY:0,
  panOX:0,  panOY:0,
  lastPinchDist:0,
  moved:false,
};
const TAP_THRESHOLD=12;

export { loadImageFile, loadPdfAsImage, bgUpdatePanel, bgFitToView, bgHitTest, bgResizeHitTest, bgStartDrag, bgMoveDrag, bgEndDrag };
