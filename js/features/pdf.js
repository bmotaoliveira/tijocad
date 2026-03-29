import { S } from '../core/state.js';
import { CELL } from '../constants.js';
import { bricks, kk, getCellH } from '../core/history.js';
import { analyzeCourse, computeGrauteCells, computeGrampos, globalCanalCourses, grampoLenM, countGrampos } from '../engine/modulation.js';
import { getAllRuns } from '../render/elevation.js';
import { build3d } from '../render/draw3d.js';



// ── Botão Raio-X 3D ──────────────────────────────────
document.getElementById('btn-xray').addEventListener('click',()=>{
  const btn=document.getElementById('btn-xray');
  const isXray = btn.classList.toggle('active');
  S.brick3dOpacity = isXray ? 0.10 : 1.0;
  S.infra3dOpacity = 1.0;
  if(S.is3d&&S.s3) build3d(true);
});
// ── 3D brick selection via raycast ─────────────────
(function(){
  let m3down={x:0,y:0};
  // patch the existing mousedown to save click origin
  const origMD=S.r3?null:null; // will be wired after init3d
  document.getElementById('div3d').addEventListener('mousedown',e=>{
    m3down.x=e.clientX;m3down.y=e.clientY;
  });
  document.getElementById('div3d').addEventListener('mouseup',e=>{
    if(e.button!==0)return;
    const dx=e.clientX-m3down.x,dy=e.clientY-m3down.y;
    if(Math.sqrt(dx*dx+dy*dy)>8)return; // was dragging
    if(!S.r3||!S.c3||!S.brickInstMap.size)return;
    const rect=S.r3.domElement.getBoundingClientRect();
    const ndcX=((e.clientX-rect.left)/rect.width)*2-1;
    const ndcY=-((e.clientY-rect.top)/rect.height)*2+1;
    const ray=new THREE.Raycaster();
    ray.setFromCamera({x:ndcX,y:ndcY},S.c3);
    const meshes=[...S.brickInstMap.keys()];
    const hits=ray.intersectObjects(meshes,false);
    if(!hits.length)return;
    const hit=hits[0];
    const entries=S.brickInstMap.get(hit.object);
    if(!entries||hit.instanceId===undefined)return;
    const info=entries[hit.instanceId];
    if(!info)return;
    // (selection removed — reserved for future use)
  });
})();
function resize3d(){if(!S.r3)return;const div=document.getElementById('div3d'),W=div.offsetWidth,H=div.offsetHeight;if(!W||!H)return;S.r3.setSize(W,H);S.c3.aspect=W/H;S.c3.updateProjectionMatrix();}

// ═══════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// QUANTITATIVOS
// ═══════════════════════════════════════════════════
function computeQuant(){
  const br=bricks();
  if(!br.size) return null;
  const maxC=maxCourses();

  // ── TIJOLOS por tipo ─────────────────────────────
  const TIPO_LABEL={'tijolo':'Tijolo','meio-tijolo':'Meio tijolo',
    'canaleta':'Canaleta','meia-canaleta':'Meia canaleta',
    'corte-especial':'Corte especial','meio-corte':'Meio corte'};
  const TIPOS_ORDER=['tijolo','meio-tijolo','canaleta','meia-canaleta','corte-especial','meio-corte'];
  const cnt={};TIPOS_ORDER.forEach(t=>{cnt[t]=0;});
  for(let c=0;c<maxC;c++){
    const cd=analyzeCourse(c);
    cd.forEach(info=>{if(info&&info.isFirst) cnt[info.type]=(cnt[info.type]||0)+1;});
  }
  const totalBricks=Object.values(cnt).reduce((a,b)=>a+b,0);

  // ── ESTRUTURAL: vergalhão e graute ───────────────
  const holeDiam=S.cellCm===15?9:6, holeR=holeDiam/2/100;
  const canalDiam=S.cellCm===15?0.09:0.06, canalH=S.cellCm===15?0.027:0.022;
  const groutCells=computeGrauteCells();
  let rebarCol=0,groutFuros=0;
  groutCells.forEach(k=>{if(!br.has(k))return;const hM=getCellH(k)/100;rebarCol+=hM;groutFuros+=Math.PI*holeR*holeR*hM*1000;});
  let rebarCan=0,groutCan=0;
  for(let c=0;c<maxC;c++){
    const cd=analyzeCourse(c);
    cd.forEach((info,k)=>{
      if(!info||!info.isFirst||!br.has(k)) return;
      const isCanal=info.type==='canaleta'||info.type==='meia-canaleta'||info.wasCanal;
      if(!isCanal) return;
      const[col,row]=k.split(',').map(Number);
      const lenM=info.partner?(()=>{const[pc,pr]=info.partner.split(',').map(Number);return(Math.abs(pc-col)+Math.abs(pr-row)+1)*S.cellCm/100;})():S.cellCm/100;
      rebarCan+=lenM; groutCan+=canalDiam*canalH*lenM*1000;
    });
  }
  const gInfo=countGrampos();

  // ── CAIXAS ELÉTRICAS ─────────────────────────────
  const ebCount={'4x2':0,'4x4':0,'qd':0};
  S.elecBoxes.forEach((arr,k)=>{if(!br.has(k))return;arr.forEach(eb=>{ebCount[eb.type]=(ebCount[eb.type]||0)+1;});});

  // ── CONDUÍTES — comprimento por tipo ─────────────
  // axis Z = vertical (trecho dentro de 1 célula = getCellH em metros)
  // axis XY/L = horizontal (path células * S.cellCm/100)
  const conduitLen={elec:0,water:0,pipe:0,gasPipe:0};
  S.conduits.forEach(cd=>{
    const ctype=cd.ctype||'elec';
    if(!(ctype in conduitLen)) return;
    let lenM=0;
    if(cd.axis==='Z'){
      const fromH=(cd.fromHeightCm??0)/100;
      const toH=(cd.toHeightCm??getCellH(cd.fromKey??cd.path[0]?.col+','+cd.path[0]?.row))/100;
      lenM=Math.abs(toH-fromH);
    } else {
      // XY ou L: comprimento = número de segmentos no path × S.cellCm
      if(cd.path&&cd.path.length>1){
        for(let i=1;i<cd.path.length;i++){
          const dx=cd.path[i].col-cd.path[i-1].col, dy=cd.path[i].row-cd.path[i-1].row;
          lenM+=Math.sqrt(dx*dx+dy*dy)*S.cellCm/100;
        }
      }
    }
    conduitLen[ctype]+=lenM;
  });

  // ── PONTOS HIDRÁULICOS e GÁS ─────────────────────
  let hydroCount=0; S.hydroPoints.forEach((arr,k)=>{if(br.has(k))hydroCount+=arr.length;});
  let gasCount=0;   S.gasPoints.forEach((arr,k)=>{if(br.has(k))gasCount+=arr.length;});

  // ── ÁREA DAS PAREDES ─────────────────────────────
  // Cada célula (col,row) contribui com uma fatia de largura=S.cellCm, altura=getCellH(col,row).
  // Se a célula vizinha (mesma run) tem altura diferente → trapézio entre elas.
  // Estratégia simples e precisa: área = Σ (S.cellCm/100) × getCellH(k)/100 por célula
  // (retângulo por célula; para inclinação, o S.wallHMap já armazena a altura real de cada célula)
  let areaTotal=0, areaAberturas=0;
  br.forEach(k=>{
    const hM=getCellH(k)/100;
    const aCell=S.cellCm/100 * hM;   // m²
    areaTotal+=aCell;
    // Descontar aberturas: height × width do vão em metros
    const op=S.openMap[k];
    if(op){
      const hVao=(op.supCm-op.infCm)/100;
      areaAberturas+=S.cellCm/100 * hVao;
    }
  });
  const areaLiq=areaTotal-areaAberturas;

  return {cnt,totalBricks,TIPOS_ORDER,TIPO_LABEL,
    rebarCol,rebarCan,groutFuros,groutCan,gInfo,
    ebCount,conduitLen,hydroCount,gasCount,
    areaTotal,areaAberturas,areaLiq};
}

function openQuantPanel(){
  const q=computeQuant();
  const body=document.getElementById('quant-body');
  if(!q){body.innerHTML='<p style="padding:20px;color:var(--text3)">Nenhuma parede desenhada.</p>';document.getElementById('quant-overlay').classList.add('visible');return;}

  const fmR=m=>m<0.001?'0':m<1?`${Math.round(m*100)} cm`:`${m.toFixed(2)} m`;
  const fmL=l=>l<0.001?'0':l<1?`${(l*1000).toFixed(0)} mL`:`${l.toFixed(2)} L`;
  const fmA=a=>`${a.toFixed(2)} m²`;
  const BRICK_CLR={'tijolo':'#B5541A','meio-tijolo':'#6B2810','canaleta':'#4A7C3F',
    'meia-canaleta':'#2D5A27','corte-especial':'#7B2D8B','meio-corte':'#4A1A55'};

  const sec=(title,svgPath,color,rows)=>`
    <div class="qt-section">
      <div class="qt-section-title" style="color:${color||''}">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">${svgPath}</svg>
        ${title}
      </div>
      <table class="qt-table">
        <thead><tr><th>Item</th><th class="val">Quantidade</th><th class="obs">Obs.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const row=(lbl,val,obs='',total=false,dot='')=>`
    <tr${total?' class="total"':''}>
      <td>${dot?`<span class="qt-dot-row"><span class="qt-dot" style="background:${dot}"></span>${lbl}</span>`:lbl}</td>
      <td class="val">${val}</td>
      <td class="obs">${obs}</td>
    </tr>`;

  // Tijolos
  const brickRows=q.TIPOS_ORDER.filter(t=>q.cnt[t]>0)
    .map(t=>row(q.TIPO_LABEL[t],`${q.cnt[t]} un.`,`${(q.cnt[t]/q.totalBricks*100).toFixed(1)}% do total`,false,BRICK_CLR[t]))
    .join('')+row('Total geral',`${q.totalBricks} un.`,'',true);

  // Estrutural
  const estRows=[
    row('Vergalhão — colunas grauteadas',fmR(q.rebarCol),'furos verticais'),
    row('Vergalhão — canaletas',fmR(q.rebarCan),'horizontal 3/8"'),
    row('Vergalhão total',fmR(q.rebarCol+q.rebarCan),'',true),
    row('Graute — furos (colunas)',fmL(q.groutFuros),'concreto fluido'),
    row('Graute — canaletas',fmL(q.groutCan),''),
    row('Graute total',fmL(q.groutFuros+q.groutCan),'',true),
    row('Grampos (cantos L + junções T)',`${q.gInfo.count} un.`,'~55 cm e ~155 cm'),
    row('Vergalhão em grampos',fmR(q.gInfo.totalLenM),''),
  ].join('');

  // Instalações: caixas + conduítes + hidráulica + gás
  const condElec=q.conduitLen.elec||0, condWater=q.conduitLen.water||0;
  const condPipe=q.conduitLen.pipe||0, condGas=q.conduitLen.gasPipe||0;
  const ebLbls={'4x2':'Caixa 4×2"','4x4':'Caixa 4×4"','qd':'Quadro de distribuição'};
  const ebObs={'4x2':'tomadas/interruptores','4x4':'saídas duplas','qd':'QD'};
  const instRows=[
    ...(['4x2','4x4','qd'].filter(t=>q.ebCount[t]>0).map(t=>row(ebLbls[t],`${q.ebCount[t]} un.`,ebObs[t]))),
    row('Conduíte elétrico',       condElec>0 ?fmR(condElec) :'—','conduíte Ø20mm'),
    row('Tubulação hidráulica',    condWater>0?fmR(condWater):'—','água fria'),
    row('Terminais hidráulicos',   q.hydroCount>0?`${q.hydroCount} un.`:'—','pontos de água'),
    row('Tubulação de gás',        condGas>0  ?fmR(condGas)  :'—',''),
    row('Terminais de gás',        q.gasCount>0 ?`${q.gasCount} un.` :'—','pontos de gás'),
    ...(condPipe>0?[row('Tubulação extra (pipe)',fmR(condPipe),'')]:[]),
  ].join('');

  // Áreas
  const areaRows=[
    row('Área bruta total das paredes',fmA(q.areaTotal),'inclui aberturas'),
    row('Área das aberturas (vãos)',   fmA(q.areaAberturas),'portas + janelas'),
    row('Área líquida (sem aberturas)',fmA(q.areaLiq),'',true),
  ].join('');

  body.innerHTML=
    sec('Tijolos por tipo',
        '<rect x="1" y="5" width="6" height="4" rx=".8"/><rect x="9" y="5" width="6" height="4" rx=".8"/><rect x="4" y="10" width="8" height="4" rx=".8"/>',
        '#8B3A0F', brickRows)+
    sec('Estrutura — Vergalhão, Graute e Grampos',
        '<path d="M8 2v12M4 5h8M4 11h8"/>',
        '#5a3a10', estRows)+
    sec('Instalações — Elétrica, Hidráulica e Gás',
        '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 7v3M6.5 8.5h3"/>',
        '#1a5fb4', instRows)+
    sec('Área das Paredes',
        '<rect x="1" y="1" width="14" height="14" rx="1"/><path d="M1 5h14M1 11h14"/>',
        '#2a7a38', areaRows);

  document.getElementById('quant-overlay').classList.add('visible');
}

document.getElementById('btn-quant').addEventListener('click', openQuantPanel);
document.getElementById('quant-close').addEventListener('click',()=>document.getElementById('quant-overlay').classList.remove('visible'));
document.getElementById('quant-ok').addEventListener('click',()=>document.getElementById('quant-overlay').classList.remove('visible'));
document.getElementById('quant-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('quant-overlay'))document.getElementById('quant-overlay').classList.remove('visible');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('quant-overlay').classList.contains('visible'))document.getElementById('quant-overlay').classList.remove('visible');});

document.getElementById('btn-pdf').addEventListener('click', exportPDF);

async function exportPDF(){
  if(!bricks().size){ appAlert('Nenhuma parede desenhada.'); return; }

  // Carregar jsPDF dinamicamente
  if(!window.jspdf){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;

  // A4 em mm e px (150 dpi)
  const PW=210, PH=297;          // mm A4
  const DPI=150, MM2PX=DPI/25.4; // px por mm
  const PW_PX=Math.round(PW*MM2PX), PH_PX=Math.round(PH*MM2PX);

  const btn=document.getElementById('btn-pdf');
  btn.disabled=true; btn.textContent='Gerando...';

  const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});

  // ── helpers de cor (hex → r,g,b) ─────────────────
  const hex2rgb = h => {
    const n=parseInt(h.replace('#',''),16);
    return [(n>>16)&255,(n>>8)&255,n&255];
  };
  // Cores dos tipos
  const TC = {
    'tijolo':        '#B5541A',
    'meio-tijolo':   '#6B2810',
    'canaleta':      '#4A7C3F',
    'meia-canaleta': '#2D5A27',
    'corte-especial':'#7B2D8B',
    'meio-corte':    '#4A1A55',
  };
  const LABELS = {
    'tijolo':'Tijolo','meio-tijolo':'M.Tijolo',
    'canaleta':'Canaleta','meia-canaleta':'M.Canaleta',
    'corte-especial':'Corte Esp.','meio-corte':'M.Corte',
  };

  // ── função que desenha uma fiada diretamente no PDF como vetores SVG ──
  function drawCourseVec(doc, cIdx, HDR){
    const br=bricks();
    if(!br.size) return;

    const cd=analyzeCourse(cIdx);
    let minC=Infinity,maxC=-Infinity,minR=Infinity,maxR=-Infinity;
    cd.forEach((info,k)=>{
      if(!info) return;
      const[c,r]=k.split(',').map(Number);
      minC=Math.min(minC,c); maxC=Math.max(maxC,c);
      minR=Math.min(minR,r); maxR=Math.max(maxR,r);
      if(info.partner){
        const[pc,pr]=info.partner.split(',').map(Number);
        minC=Math.min(minC,pc); maxC=Math.max(maxC,pc);
        minR=Math.min(minR,pr); maxR=Math.max(maxR,pr);
      }
    });
    if(minC===Infinity) return;

    minC-=1; minR-=1; maxC+=1; maxR+=1;
    const cols=maxC-minC+1, rows=maxR-minR+1;

    const areaX=8, areaY=HDR+4;
    const areaW=PW-16, areaH=PH-HDR-14;
    const maxCellMM=4*CELL/MM2PX;
    const cellMM=Math.min(areaW/cols, areaH/rows, maxCellMM);
    const drawW=cols*cellMM, drawH=rows*cellMM;
    const offX=areaX+(areaW-drawW)/2;
    const offY=areaY+(areaH-drawH)/2;

    const gx=c=>offX+(c-minC)*cellMM;
    const gy=r=>offY+(r-minR)*cellMM;

    // Fundo branco
    doc.setFillColor(255,255,255);
    doc.rect(offX,offY,drawW,drawH,'F');

    // Grade suave
    doc.setDrawColor(224,224,224); doc.setLineWidth(0.07);
    for(let c=0;c<=cols;c++) doc.line(gx(minC+c),offY,gx(minC+c),offY+drawH);
    for(let r=0;r<=rows;r++) doc.line(offX,gy(minR+r),offX+drawW,gy(minR+r));

    // Células ausentes
    cd.forEach((info,k)=>{
      const[c,r]=k.split(',').map(Number);
      if(!info){ doc.setFillColor(240,240,240); doc.rect(gx(c),gy(r),cellMM,cellMM,'F'); }
    });

    // Aberturas
    for(const[k] of Object.entries(S.openMap)){
      const[c,r]=k.split(',').map(Number);
      if(!cd.get(k)){
        doc.setFillColor(200,220,240); doc.rect(gx(c),gy(r),cellMM,cellMM,'F');
        doc.setDrawColor(170,204,238); doc.setLineWidth(0.15); doc.rect(gx(c),gy(r),cellMM,cellMM,'S');
      }
    }

    // Tijolos
    const groutCells=computeGrauteCells();
    cd.forEach((info,k)=>{
      if(!info||!info.isFirst) return;
      const[col,row]=k.split(',').map(Number);
      const[fr,fg,fb]=hex2rgb(TYPE_COLOR[info.type]||'#888888');
      let bx=gx(col),by=gy(row),bw=cellMM,bh=cellMM;
      let holes=[{cx:gx(col)+cellMM/2,cy:gy(row)+cellMM/2,key:k}];
      if(info.partner){
        const[pc,pr]=info.partner.split(',').map(Number);
        bx=Math.min(gx(col),gx(pc)); by=Math.min(gy(row),gy(pr));
        bw=(Math.abs(pc-col)+1)*cellMM; bh=(Math.abs(pr-row)+1)*cellMM;
        holes=[{cx:gx(col)+cellMM/2,cy:gy(row)+cellMM/2,key:k},
               {cx:gx(pc)+cellMM/2, cy:gy(pr)+cellMM/2, key:kk(pc,pr)}];
      }
      // Corpo do tijolo
      doc.setFillColor(fr,fg,fb); doc.rect(bx,by,bw,bh,'F');
      // Detalhe furo / canaleta
      if(info.type==='canaleta'||info.type==='meia-canaleta'){
        const[gr,gg,gb]=hex2rgb(GROUT_C);
        doc.setFillColor(gr,gg,gb);
        if(bw>=bh) doc.rect(bx+bw*.04,by+bh*.28,bw*.92,bh*.44,'F');
        else       doc.rect(bx+bw*.28,by+bh*.04,bw*.44,bh*.92,'F');
      } else {
        const holeR=(cellMM*.42)/2;
        holes.forEach(h=>{
          if(groutCells.has(h.key)){
            const[gr,gg,gb]=hex2rgb(GROUT_C);
            doc.setFillColor(gr,gg,gb); doc.circle(h.cx,h.cy,holeR,'F');
          } else {
            const hc=TYPE_HOLE[info.type]||'rgba(255,255,255,0.7)';
            const m=hc.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
            const alpha=m&&m[4]?parseFloat(m[4]):1;
            doc.setFillColor(m?parseInt(m[1]):255,m?parseInt(m[2]):255,m?parseInt(m[3]):255);
            if(doc.setGState){doc.setGState(doc.GState({opacity:alpha}));}
            doc.circle(h.cx,h.cy,holeR,'F');
            if(doc.setGState){doc.setGState(doc.GState({opacity:1}));}
          }
        });
      }
      // Contorno
      if(doc.setGState){doc.setGState(doc.GState({opacity:0.8}));}
      doc.setDrawColor(0,0,0); doc.setLineWidth(0.25);
      doc.rect(bx+0.12,by+0.12,bw-0.24,bh-0.24,'S');
      if(doc.setGState){doc.setGState(doc.GState({opacity:1}));}
    });
  }

  // ── Página 1: Capa com Vista 3D ───────────────────
  {
    // ── Capturar render 3D com tamanho fixo ──────────
    // O div3d pode estar display:none e sem dimensões reais.
    // Criamos um renderer offscreen com tamanho explícito para garantir
    // que o canvas não seja 0×0 (que gera tela preta).
    const THUMB_W = 1200, THUMB_H = 800;
    let imgData = null;
    try {
      // Renderer temporário offscreen (preserveDrawingBuffer=true obrigatório)
      const offRenderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false
      });
      offRenderer.setSize(THUMB_W, THUMB_H);
      offRenderer.setClearColor(0x87CEEB, 1);
      offRenderer.shadowMap.enabled = false;

      // Reusar a cena existente ou criar uma temporária
      if(!S.s3) { document.getElementById('div3d').style.display='block'; init3d(); }
      build3d();
      // Câmera temporária com aspect correto
      const offCam = new THREE.PerspectiveCamera(45, THUMB_W/THUMB_H, 0.01, 500);
      const br2 = bricks();
      let sumC=0,sumR=0,sumH=0;
      br2.forEach(k=>{const[c,r]=k.split(',').map(Number);sumC+=c;sumR+=r;sumH+=getCellH(k)/100;});
      const w2=S.cellCm/100;
      const cx2_=(sumC/br2.size+.5)*w2, cz2_=(sumR/br2.size+.5)*w2, avgH2=sumH/br2.size;
      const rad2=Math.max(5,Math.sqrt(br2.size)*w2*3.5+avgH2*1.8);
      offCam.position.set(cx2_+rad2*0.65, avgH2+rad2*0.55, cz2_+rad2*0.65);
      offCam.lookAt(cx2_, avgH2/2, cz2_);

      offRenderer.render(S.s3, offCam);
      imgData = offRenderer.domElement.toDataURL('image/jpeg', 0.92);
      offRenderer.dispose();
    } catch(err) { imgData = null; }

    // ── Layout da capa ────────────────────────────────
    const BRAND = [139, 58, 15];   // #8B3A0F
    const DARK  = [24,  22, 20];   // quase preto
    const MID   = [91,  86, 82];   // text2
    const LIGHT = [241, 239, 237]; // surface2

    // Fundo
    doc.setFillColor(...LIGHT);
    doc.rect(0, 0, PW, PH, 'F');

    // Barra superior terracota
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, PW, 28, 'F');

    // Logo: pequeno quadrado branco + texto
    doc.setFillColor(255,255,255);
    doc.roundedRect(8, 6, 16, 16, 2, 2, 'F');
    doc.setTextColor(...BRAND);
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.text('TC', 16, 16, {align:'center'});

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.text('TijoCAD', 30, 17);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text('Modulação de Tijolos Ecológicos', 30, 23);

    // Nome do projeto (se existir)
    const projN = document.getElementById('proj-name').value.trim();
    if(projN){
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.text(projN, PW-8, 17, {align:'right'});
    }

    // Data
    const hoje = new Date().toLocaleDateString('pt-BR');
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.setTextColor(255,220,200);
    doc.text(hoje, PW-8, 23, {align:'right'});

    // Imagem 3D
    if(imgData){
      const imgY=32, imgH2=PH-32-42;
      doc.addImage(imgData,'JPEG',0,imgY,PW,imgH2);
      // overlay inferior suave
      doc.setFillColor(...DARK);
      doc.setGState && doc.setGState(doc.GState({opacity:0.18}));
      doc.rect(0, imgY+imgH2-30, PW, 30, 'F');
      doc.setGState && doc.setGState(doc.GState({opacity:1}));
    } else {
      doc.setFillColor(220,218,215);
      doc.rect(0, 32, PW, PH-32-42, 'F');
      doc.setTextColor(...MID);
      doc.setFont('helvetica','italic');
      doc.setFontSize(11);
      doc.text('Ative a vista 3D e gere o PDF novamente', PW/2, PH/2-10, {align:'center'});
    }

    // Painel de informações inferior
    const panY = PH-40;
    doc.setFillColor(...DARK);
    doc.rect(0, panY, PW, 40, 'F');

    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text('Parâmetros do projeto', 10, panY+10);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(200,195,190);
    const params = [
      `Tijolo: ${S.cellCm}×${S.cellCm*2} cm`,
      `Alt. fiada: ${S.brickHCm} cm`,
      `Alt. parede: ${S.wallHCm} cm`,
      `Fiadas: ${maxCourses()}`,
    ];
    params.forEach((p,i)=>{
      doc.text(p, 10+i*50, panY+20);
    });
    // rodapé linha fina
    doc.setDrawColor(80,75,70);
    doc.setLineWidth(0.3);
    doc.line(10, panY+27, PW-10, panY+27);
    doc.setTextColor(120,115,110);
    doc.setFontSize(7);
    doc.text('Gerado por TijoCAD • tijocad.app', PW/2, panY+33, {align:'center'});
  }

  // ── Contracapa: Tabela de quantitativos ──────────
  {
    doc.addPage();
    const BRAND4=[139,58,15], DARK4=[24,22,20], SURF4=[248,247,246], BRD4=[228,224,220];
    const MID4=[91,86,82], LIGHT4=[241,239,237];

    // Calcular totais de todas as fiadas
    const grand={'tijolo':0,'meio-tijolo':0,'canaleta':0,'meia-canaleta':0,'corte-especial':0,'meio-corte':0};
    const maxCt=maxCourses();
    for(let c=0;c<maxCt;c++){
      analyzeCourse(c).forEach(info=>{
        if(info&&info.isFirst) grand[info.type]=(grand[info.type]||0)+1;
      });
    }
    const grandTotal=Object.values(grand).reduce((a,b)=>a+b,0);

    // Calcular vergalhão e graute (reusar lógica de countBricks)
    const holeDiam2=S.cellCm===15?9:6;
    const holeR2=holeDiam2/2/100;
    const canalDiam2=S.cellCm===15?0.09:0.06;
    const canalH2=S.cellCm===15?0.027:0.022;
    const br4=bricks();
    const groutC4=computeGrauteCells();
    let rebarCol4=0,groutFuros=0;
    groutC4.forEach(k=>{if(!br4.has(k))return;const hM=getCellH(k)/100;rebarCol4+=hM;groutFuros+=Math.PI*holeR2*holeR2*hM*1000;});
    let rebarCan4=0,groutCan4=0;
    for(let c=0;c<maxCt;c++){
      analyzeCourse(c).forEach((info,k)=>{
        if(!info||!info.isFirst)return;
        if(info.type!=='canaleta'&&info.type!=='meia-canaleta'&&!info.wasCanal)return;
        if(!br4.has(k))return;
        const[col4,row4]=k.split(',').map(Number);
        const lenM=info.partner?(()=>{const[pc,pr]=info.partner.split(',').map(Number);return(Math.abs(pc-col4)+Math.abs(pr-row4)+1)*S.cellCm/100;})():S.cellCm/100;
        rebarCan4+=lenM;groutCan4+=canalDiam2*canalH2*lenM*1000;
      });
    }
    const fmt4=m=>m<1?`${Math.round(m*100)} cm`:`${m.toFixed(1)} m`;
    const fmtL4=l=>l<1?`${(l*1000).toFixed(0)} mL`:`${l.toFixed(1)} L`;

    // Fundo geral
    doc.setFillColor(...LIGHT4); doc.rect(0,0,PW,PH,'F');

    // Cabeçalho
    doc.setFillColor(...BRAND4); doc.rect(0,0,PW,22,'F');
    doc.setFillColor(255,255,255); doc.roundedRect(8,5,14,12,2,2,'F');
    doc.setTextColor(...BRAND4); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text('TC',15,13,{align:'center'});
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('TijoCAD',26,14);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.text('Resumo Geral do Projeto',26,19);
    const pnC=document.getElementById('proj-name').value.trim();
    if(pnC){doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(pnC,PW-8,12,{align:'right'});}
    doc.setTextColor(255,210,180);doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.text(new Date().toLocaleDateString('pt-BR'),PW-8,18,{align:'right'});

    // Parâmetros do projeto em cards horizontais
    const paramY=28;
    const paramCards=[
      {lbl:'Tijolo',val:`${S.cellCm}×${S.cellCm*2} cm`},
      {lbl:'Alt. fiada',val:`${S.brickHCm} cm`},
      {lbl:'Alt. parede',val:`${S.wallHCm} cm`},
      {lbl:'Fiadas',val:`${maxCt}`},
      {lbl:'Parcelas totais',val:`${grandTotal}`},
    ];
    const cw=(PW-16)/paramCards.length;
    paramCards.forEach(({lbl,val},i)=>{
      const cx4=8+i*cw;
      doc.setFillColor(255,255,255); doc.roundedRect(cx4,paramY,cw-3,16,2,2,'F');
      doc.setDrawColor(...BRD4); doc.setLineWidth(0.3); doc.roundedRect(cx4,paramY,cw-3,16,2,2,'S');
      doc.setTextColor(...MID4); doc.setFont('helvetica','normal'); doc.setFontSize(7);
      doc.text(lbl,cx4+4,paramY+6);
      doc.setTextColor(...DARK4); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text(val,cx4+4,paramY+13);
    });

    // ── Tabela de tijolos ─────────────────────────────
    const LABELS_FULL2={
      'tijolo':'Tijolo','meio-tijolo':'Meio tijolo',
      'canaleta':'Canaleta','meia-canaleta':'Meia canaleta',
      'corte-especial':'Corte especial','meio-corte':'Meio corte'
    };
    const TYPES_ORDER2=['tijolo','meio-tijolo','canaleta','meia-canaleta','corte-especial','meio-corte'];

    const tblY=50; // topo da tabela
    const rowH=10, headerH4=8;
    const colX=[8,80,130,165]; // tipo | qtd | % do total | fiadas com este tipo

    // Cabeçalho da tabela
    doc.setFillColor(...DARK4);
    doc.rect(8,tblY,PW-16,headerH4,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    doc.text('Tipo de peça',       colX[0]+2, tblY+5.5);
    doc.text('Quantidade',         colX[1]+2, tblY+5.5);
    doc.text('% do total',         colX[2]+2, tblY+5.5);
    doc.text('Fiadas c/ este tipo',colX[3]+2, tblY+5.5);

    // Linhas de dados
    TYPES_ORDER2.forEach((t,i)=>{
      const qty=grand[t]||0;
      const yRow=tblY+headerH4+i*rowH;
      // zebra
      doc.setFillColor(i%2===0?255:242, i%2===0?255:241, i%2===0?255:238);
      doc.rect(8,yRow,PW-16,rowH,'F');

      // Dot de cor
      const [r2,g2,b2]=hex2rgb(TC[t]);
      doc.setFillColor(r2,g2,b2);
      doc.circle(colX[0]+3, yRow+5, 2.5,'F');

      // Textos
      doc.setTextColor(...DARK4); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text(LABELS_FULL2[t], colX[0]+8, yRow+6.5);
      doc.setFont('helvetica','bold');
      doc.text(qty.toString(), colX[1]+2, yRow+6.5);
      doc.setFont('helvetica','normal');
      const pct=grandTotal>0?(qty/grandTotal*100).toFixed(1)+'%':'—';
      doc.text(pct, colX[2]+2, yRow+6.5);

      // Contar fiadas
      let fiadasComTipo=0;
      for(let c=0;c<maxCt;c++){
        const cd=analyzeCourse(c);
        for(const info of cd.values()){if(info&&info.isFirst&&info.type===t){fiadasComTipo++;break;}}
      }
      doc.text(`${fiadasComTipo} de ${maxCt}`, colX[3]+2, yRow+6.5);
    });

    // Linha de total
    const totY=tblY+headerH4+TYPES_ORDER2.length*rowH;
    doc.setFillColor(...BRAND4); doc.setGlobalAlpha&&doc.setGlobalAlpha(0.12);
    doc.rect(8,totY,PW-16,rowH,'F');
    doc.setFillColor(...BRAND4);// reset
    doc.setDrawColor(...BRD4); doc.setLineWidth(0.4); doc.line(8,totY,PW-8,totY);
    doc.setTextColor(...DARK4); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.text('TOTAL GERAL', colX[0]+2, totY+6.5);
    doc.text(grandTotal.toString(), colX[1]+2, totY+6.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...MID4);
    doc.text('100%', colX[2]+2, totY+6.5);

    // Borda da tabela
    doc.setDrawColor(...BRD4); doc.setLineWidth(0.4);
    doc.rect(8,tblY,PW-16,headerH4+TYPES_ORDER2.length*rowH+rowH,'S');

    // ── Tabela de materiais ───────────────────────────
    const mat2Y=totY+rowH+10;
    doc.setTextColor(...DARK4); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('Materiais de apoio (estimativa)', 8, mat2Y);
    doc.setDrawColor(...BRAND4); doc.setLineWidth(0.5);
    doc.line(8,mat2Y+2,PW-8,mat2Y+2);

    const matData=[
      {lbl:'Vergalhão em colunas grauteadas', val:fmt4(rebarCol4), obs:'furos verticais com graute'},
      {lbl:'Vergalhão em canaletas',          val:fmt4(rebarCan4), obs:'vergalhão 3/8" horizontal'},
      {lbl:'Vergalhão total',                 val:fmt4(rebarCol4+rebarCan4), obs:''},
      {lbl:'Graute em furos (colunas)',        val:fmtL4(groutFuros), obs:'volume de concreto fluido'},
      {lbl:'Graute em canaletas',             val:fmtL4(groutCan4),  obs:'volume de concreto fluido'},
      {lbl:'Graute total estimado',           val:fmtL4(groutFuros+groutCan4), obs:''},
    ];

    // Grampos
    const gInfo4=countGrampos();
    const fmtM4=m=>m<1?`${Math.round(m*100)} cm`:`${m.toFixed(1)} m`;
    const grampoData=[
      {lbl:'Grampos (cantos L + junções T)',  val:`${gInfo4.count} un.`,         obs:`fiadas ~55cm e ~155cm`},
      {lbl:'Vergalhão em grampos',            val:fmtM4(gInfo4.totalLenM),        obs:`${S.cellCm===15?'50':'40'} cm/grampo`},
    ];
    const br4b=bricks();
    const nElec=[...S.manualElec].filter(k=>br4b.has(k)).length;
    const nWater=[...S.manualWater].filter(k=>br4b.has(k)).length;
    const infraData=[];
    if(nElec>0)  infraData.push({lbl:'Prumadas elétricas (conduítes)', val:`${nElec} furos`, obs:'marcar na modulação'});
    if(nWater>0) infraData.push({lbl:'Prumadas hidráulicas (água)',    val:`${nWater} furos`, obs:'marcar na modulação'});
    const ebArr=[...S.elecBoxes.entries()].filter(([k])=>br4b.has(k));
    const ebCount={'4x2':0,'4x4':0,'qd':0};
    ebArr.forEach(([,arr])=>{ arr.forEach(eb=>{ ebCount[eb.type]=(ebCount[eb.type]||0)+1; }); });
    if(ebCount['4x2']>0) infraData.push({lbl:'Caixas 4×2" (tomadas/interruptores)',val:`${ebCount['4x2']} un.`,obs:'10,2×5,1 cm'});
    if(ebCount['4x4']>0) infraData.push({lbl:'Caixas 4×4" (saídas duplas)',        val:`${ebCount['4x4']} un.`,obs:'10,2×10,2 cm'});
    if(ebCount['qd'] >0) infraData.push({lbl:'Quadros de distribuição (QD)',        val:`${ebCount['qd']}  un.`,obs:'tamanho personalizado'});

    matData.forEach(({lbl,val,obs},i)=>{
      const yMat=mat2Y+6+i*9;
      const isTot=lbl.startsWith('Vergalhão total')||lbl.startsWith('Graute total');
      if(isTot){doc.setFillColor(...SURF4);doc.rect(8,yMat-4,PW-16,9,'F');}
      doc.setTextColor(...DARK4);
      doc.setFont('helvetica',isTot?'bold':'normal'); doc.setFontSize(8);
      doc.text(lbl, 12, yMat);
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
      doc.text(val, PW/2, yMat);
      if(obs){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...MID4);doc.text(obs,PW/2+28,yMat);}
    });

    // Tabela de infraestrutura (elétrica/hidráulica)
    if(infraData&&infraData.length>0){
      const infraY2=mat2Y+6+matData.length*9+6;
      doc.setTextColor(...DARK4); doc.setFont('helvetica','bold'); doc.setFontSize(9);
      doc.text('Infraestrutura (prumadas)', 8, infraY2);
      doc.setDrawColor(...BRAND4); doc.setLineWidth(0.5);
      doc.line(8,infraY2+2,PW-8,infraY2+2);
      infraData.forEach(({lbl,val,obs},i)=>{
        const yi=infraY2+6+i*9;
        doc.setTextColor(...DARK4);doc.setFont('helvetica','normal');doc.setFontSize(8);
        doc.text(lbl,12,yi);
        doc.setFont('helvetica','bold');doc.setFontSize(8.5);
        doc.text(val,PW/2,yi);
        if(obs){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...MID4);doc.text(obs,PW/2+28,yi);}
      });
    }

    // Tabela de grampos
    const grampoY=mat2Y+6+matData.length*9+6;
    doc.setTextColor(...DARK4); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('Grampos estruturais', 8, grampoY);
    doc.setDrawColor(...BRAND4); doc.setLineWidth(0.5);
    doc.line(8,grampoY+2,PW-8,grampoY+2);
    grampoData.forEach(({lbl,val,obs},i)=>{
      const yg=grampoY+6+i*9;
      doc.setTextColor(...DARK4);doc.setFont('helvetica','normal');doc.setFontSize(8);
      doc.text(lbl,12,yg);
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);
      doc.text(val,PW/2,yg);
      if(obs){doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(...MID4);doc.text(obs,PW/2+28,yg);}
    });

    // Nota de rodapé
    const noteY=mat2Y+6+matData.length*9+8;
    doc.setFillColor(255,245,230); doc.roundedRect(8,noteY,PW-16,14,2,2,'F');
    doc.setDrawColor(200,140,80); doc.setLineWidth(0.3); doc.roundedRect(8,noteY,PW-16,14,2,2,'S');
    doc.setTextColor(120,70,20); doc.setFont('helvetica','bold'); doc.setFontSize(7.5);
    doc.text('⚠ Atenção:', 12, noteY+5.5);
    doc.setFont('helvetica','normal');
    doc.text('Os quantitativos de graute e vergalhão são estimativas baseadas nas regras estruturais',12,noteY+10.5);
    doc.text('automáticas (cantos L, junções T, bordas de abertura). Consulte um engenheiro estrutural.',12,noteY+13.5);

    // Rodapé
    doc.setFillColor(232,229,226); doc.rect(0,PH-7,PW,7,'F');
    doc.setDrawColor(...BRD4); doc.setLineWidth(0.3); doc.line(0,PH-7,PW,PH-7);
    doc.setTextColor(80,75,70); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(`TijoCAD  ·  Resumo do projeto  ·  ${new Date().toLocaleDateString('pt-BR')}`,PW/2,PH-2.5,{align:'center'});
  }

  // ── Páginas das fiadas ────────────────────────────
  const BRAND3 = [139, 58, 15];
  const DARK3  = [24,  22, 20];
  const SURF3  = [248, 247, 246];
  const BRD3   = [228, 224, 220];
  const LABELS_FULL = {
    'tijolo':         'Tijolo',
    'meio-tijolo':    'Meio tijolo',
    'canaleta':       'Canaleta',
    'meia-canaleta':  'Meia canaleta',
    'corte-especial': 'Corte especial',
    'meio-corte':     'Meio corte',
  };

  const total=maxCourses();
  for(let cIdx=0;cIdx<total;cIdx++){
    doc.addPage();

    const cd=analyzeCourse(cIdx);
    const cnt={'tijolo':0,'meio-tijolo':0,'canaleta':0,'meia-canaleta':0,'corte-especial':0,'meio-corte':0};
    cd.forEach(info=>{ if(info&&info.isFirst) cnt[info.type]=(cnt[info.type]||0)+1; });
    const totalFiada=Object.values(cnt).reduce((a,b)=>a+b,0);

    // ── Cabeçalho fino ────────────────────────────────
    const HDR = 30; // altura reduzida

    // Fundo
    doc.setFillColor(...SURF3);
    doc.rect(0, 0, PW, HDR, 'F');
    doc.setDrawColor(...BRD3);
    doc.setLineWidth(0.4);
    doc.line(0, HDR, PW, HDR);

    // Stripe lateral terracota (3mm)
    doc.setFillColor(...BRAND3);
    doc.rect(0, 0, 3, HDR, 'F');

    // Número + label "FIADA" em linha única
    doc.setTextColor(...BRAND3);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7);
    doc.text('FIADA', 7, 10);
    doc.setTextColor(...DARK3);
    doc.setFontSize(20);
    doc.text(`${cIdx+1}`, 7, 24);

    // Separador vertical
    doc.setDrawColor(...BRD3);
    doc.setLineWidth(0.3);
    doc.line(30, 4, 30, HDR-4);

    // Metadados numa linha
    const botCm=Math.round(cIdx*S.brickHCm), topCm=Math.round((cIdx+1)*S.brickHCm);
    doc.setTextColor(100,95,90);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.5);
    doc.text(`de ${total}`, 33, 10);
    doc.setTextColor(...DARK3);
    doc.setFontSize(8);
    doc.setFont('helvetica','bold');
    doc.text(`${botCm}–${topCm} cm`, 33, 19);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100,95,90);
    doc.text(`${totalFiada} peças`, 33, 27);

    // Nome do projeto
    const pn = document.getElementById('proj-name').value.trim();
    if(pn){
      doc.setTextColor(150,145,140);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7);
      doc.text(pn, PW-8, 9, {align:'right'});
    }

    // Chips — nomes completos, linha direita
    const TYPES_ORDER=['tijolo','meio-tijolo','canaleta','meia-canaleta','corte-especial','meio-corte'];
    let cx3=PW-8, cy3=20;
    const chipsRight=TYPES_ORDER.filter(t=>cnt[t]>0).map(t=>({t,n:cnt[t]}));
    chipsRight.reverse().forEach(({t,n})=>{
      const [r,g,b]=hex2rgb(TC[t]);
      const lbl=`${LABELS_FULL[t]}: ${n}`;
      doc.setFontSize(7);
      const tw=doc.getTextWidth(lbl)+7;
      if(cx3-tw < PW/2+10){ cx3=PW-8; cy3+=7; }
      doc.setFillColor(r,g,b);
      doc.roundedRect(cx3-tw, cy3-4, tw, 5.2, 1, 1, 'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold');
      doc.text(lbl, cx3-tw/2, cy3, {align:'center'});
      cx3 -= tw+2;
    });

    // ── Desenho vetorial da fiada ──
    drawCourseVec(doc, cIdx, HDR);

    // Rodapé cinza claro, texto escuro
    doc.setFillColor(232, 229, 226);
    doc.rect(0, PH-7, PW, 7, 'F');
    doc.setDrawColor(...BRD3);
    doc.setLineWidth(0.3);
    doc.line(0, PH-7, PW, PH-7);
    doc.setTextColor(80, 75, 70);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.text(`TijoCAD  ·  Fiada ${cIdx+1} de ${total}  ·  tijolo ${S.cellCm}×${S.cellCm*2} cm  ·  altura ${S.brickHCm} cm/fiada`, PW/2, PH-2.5, {align:'center'});
    doc.setFont('helvetica','bold');
    doc.text(`${cIdx+1}`, PW-5, PH-2.5, {align:'right'});
  }

  // ── Download ──────────────────────────────────────

  // ── Páginas de elevação ───────────────────────────
  // Primeiro: planta de referência de elevações
  // Depois: uma página por elevView registrada
  if(S.elevViews.length>0){

    // helper: renderiza uma elevação num canvas offscreen
    // ── função que desenha uma elevação diretamente no PDF como vetores ──
    function drawElevVec(doc, ev, HDR_E){
      const cells=ev.cells||[];
      if(!cells.length) return;
      let ordered=[...cells];
      if(ev.dir==='H') ordered.sort((a,b)=>a.col-b.col);
      else             ordered.sort((a,b)=>a.row-b.row);
      if(ev.sideSign<0) ordered=ordered.reverse();
      const n=ordered.length;
      const maxCe=maxCourses();
      const groutE=computeGrauteCells();

      // Área disponível na página
      const areaX=8, areaY=HDR_E+4;
      const areaW=PW-16, areaH=PH-HDR_E-14;
      // Padding para eixos (mm)
      const PAD_L=8,PAD_B=6,PAD_T=3,PAD_R=3;
      const gridW=areaW-PAD_L-PAD_R, gridH=areaH-PAD_T-PAD_B;
      // Tamanho da célula para caber tudo
      const aspect=S.brickHCm/S.cellCm;
      const ecW=Math.min(gridW/n, gridH/(maxCe*aspect));
      const ecH=ecW*aspect;
      const totalW=n*ecW, totalH=maxCe*ecH;
      const ox=areaX+PAD_L+(gridW-totalW)/2;
      const oy=areaY+PAD_T+(gridH-totalH)/2;

      const xiMapE=new Map();
      ordered.forEach((cell,xi)=>xiMapE.set(kk(cell.col,cell.row),xi));

      // Fundo
      doc.setFillColor(248,247,246); doc.rect(S.ox,S.oy,totalW,totalH,'F');

      // Stripes alternadas
      if(doc.setGState){
        for(let ci=0;ci<maxCe;ci++){
          const yT=S.oy+(maxCe-1-ci)*ecH;
          const alpha=ci%2===0?0.03:0.06;
          doc.setFillColor(0,0,0);
          doc.setGState(doc.GState({opacity:alpha}));
          doc.rect(S.ox,yT,totalW,ecH,'F');
        }
        doc.setGState(doc.GState({opacity:1}));
      }

      // Tijolos
      for(let ci=0;ci<maxCe;ci++){
        const cd=analyzeCourse(ci);
        const yT=S.oy+(maxCe-1-ci)*ecH;
        const drawn=new Set();
        ordered.forEach((cell,xi)=>{
          const k=kk(cell.col,cell.row);
          if(drawn.has(k)) return;
          const info=cd.get(k);
          const x=S.ox+xi*ecW;
          if(!info){
            const op=S.openMap[k],bot=ci*S.brickHCm;
            if(op&&bot>=op.infCm&&bot<op.supCm){
              doc.setFillColor(200,223,240); doc.rect(x,yT,ecW,ecH,'F');
            }
            return;
          }
          let bx=x,bw=ecW;
          if(info.partner&&xiMapE.has(info.partner)){
            const pxi=xiMapE.get(info.partner),minXi=Math.min(xi,pxi);
            if(xi!==minXi){drawn.add(k);return;}
            bx=S.ox+minXi*ecW; bw=2*ecW; drawn.add(info.partner);
          } else if(!info.isFirst){drawn.add(k);return;}
          drawn.add(k);
          const[r,g,b]=hex2rgb(TC[info.type]||'#888888');
          doc.setFillColor(r,g,b); doc.rect(bx,yT,bw,ecH,'F');
          // Marca inclinação
          if(info.type==='corte-especial'&&S.slopedKeys.has(k)){
            doc.setDrawColor(255,102,0); doc.setLineWidth(0.2);
            doc.line(bx,yT+ecH,bx+bw,yT);
          }
          // Contorno
          if(doc.setGState){doc.setGState(doc.GState({opacity:0.5}));}
          doc.setDrawColor(0,0,0); doc.setLineWidth(0.1);
          doc.rect(bx+0.08,yT+0.08,bw-0.16,ecH-0.16,'S');
          if(doc.setGState){doc.setGState(doc.GState({opacity:1}));}
        });
      }

      // Graute
      ordered.forEach((cell,xi)=>{
        const k=kk(cell.col,cell.row);
        if(!groutE.has(k)) return;
        const cellH_v=getCellH(k);
        const topC=Math.ceil(cellH_v/S.brickHCm);
        const gxv=S.ox+xi*ecW, gyv=S.oy+(maxCe-topC)*ecH, ghv=topC*ecH;
        if(doc.setGState){
          doc.setFillColor(40,40,40);
          doc.setGState(doc.GState({opacity:0.28}));
          doc.rect(gxv+ecW*.25,gyv,ecW*.5,ghv,'F');
          doc.setGState(doc.GState({opacity:1}));
        }
      });

      // Linhas horizontais do eixo Y
      if(doc.setGState){
        doc.setDrawColor(0,0,0); doc.setLineWidth(0.08);
        for(let ci=0;ci<=maxCe;ci++){
          const y=S.oy+(maxCe-ci)*ecH;
          doc.setGState(doc.GState({opacity:0.12}));
          doc.line(S.ox,y,S.ox+totalW,y);
        }
        doc.setGState(doc.GState({opacity:1}));
      }
      // Labels eixo Y
      doc.setTextColor(85,85,85); doc.setFont('courier','normal'); doc.setFontSize(5);
      for(let ci=0;ci<=maxCe;ci++){
        const y=S.oy+(maxCe-ci)*ecH;
        doc.text(String(Math.round(ci*S.brickHCm)),S.ox-1,y+1,{align:'right'});
      }
      // Labels eixo X
      doc.setFontSize(4.5); doc.setTextColor(136,136,136);
      ordered.forEach((_,xi)=>doc.text(String(xi+1),S.ox+(xi+.5)*ecW,S.oy+totalH+3.5,{align:'center'}));
      // Dimensão total
      doc.setFont('helvetica','bold'); doc.setFontSize(5.5); doc.setTextColor(68,68,68);
      doc.text(`${n*S.cellCm} cm`,S.ox+totalW/2,S.oy+totalH+6.5,{align:'center'});
      // Borda externa
      doc.setDrawColor(68,68,68); doc.setLineWidth(0.2);
      doc.rect(S.ox,S.oy,totalW,totalH,'S');
    }

    // ── Página 1 de elevações: planta de referência ──
    doc.addPage();
    const BRANDE=[139,58,15],DARKE=[24,22,20],SURFE=[248,247,246],BRDE=[228,224,220];

    // Cabeçalho padrão (mesmo estilo das fiadas)
    const HDR_REF = 30;
    doc.setFillColor(...SURFE); doc.rect(0,0,PW,HDR_REF,'F');
    doc.setDrawColor(...BRDE); doc.setLineWidth(0.4); doc.line(0,HDR_REF,PW,HDR_REF);
    // Stripe lateral terracota
    doc.setFillColor(...BRANDE); doc.rect(0,0,3,HDR_REF,'F');
    // Label
    doc.setTextColor(...BRANDE); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    doc.text('REFERÊNCIA', 7, 10);
    doc.setTextColor(...DARKE); doc.setFontSize(16);
    doc.text('Elevações', 7, 24);
    // Separador
    doc.setDrawColor(...BRDE); doc.setLineWidth(0.3); doc.line(52, 4, 52, HDR_REF-4);
    // Metadata
    doc.setTextColor(100,95,90); doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    doc.text(`${S.elevViews.length} elevações registradas`, 55, 10);
    doc.setTextColor(...DARKE); doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
    doc.text('Setas indicam o sentido de observação', 55, 19);
    const pnE=document.getElementById('proj-name').value.trim();
    if(pnE){doc.setTextColor(150,145,140);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.text(pnE,PW-8,9,{align:'right'});}

    // Fundo da área de desenho
    doc.setFillColor(...SURFE); doc.rect(0,HDR_REF,PW,PH-HDR_REF,'F');

    // Desenhar planta esquemática com as setas
    const bxE=bricks();
    if(bxE.size){
      let mnC=Infinity,mxC=-Infinity,mnR=Infinity,mxR=-Infinity;
      bxE.forEach(k=>{const[c,r]=k.split(',').map(Number);
        mnC=Math.min(mnC,c);mxC=Math.max(mxC,c);mnR=Math.min(mnR,r);mxR=Math.max(mxR,r);});
      const CW=mxC-mnC+1, CR=mxR-mnR+1;
      const areaW=PW-20, areaH=PH-HDR_REF-20;
      const scP=Math.min(areaW/CW, areaH/CR, 12);
      const offXE=10+(areaW-CW*scP)/2, offYE=HDR_REF+4+(areaH-CR*scP)/2;
      const wx=(c)=>(offXE+(c-mnC)*scP), wy=(r)=>(offYE+(r-mnR)*scP);
      // Draw bricks
      bxE.forEach(k=>{
        const[c,r]=k.split(',').map(Number);
        doc.setFillColor(200,180,160);
        doc.rect(wx(c),wy(r),scP,scP,'F');
        doc.setDrawColor(160,140,120);doc.setLineWidth(0.15);
        doc.rect(wx(c),wy(r),scP,scP,'S');
      });
      // Draw elev arrows
      S.elevViews.forEach(ev=>{
        if(!ev.cells||!ev.cells.length) return;
        const midI=Math.floor(ev.cells.length/2), mc=ev.cells[midI];
        const isH=ev.dir==='H';
        const midPx=wx(mc.col)+scP/2, midPy=wy(mc.row)+scP/2;
        const aOff=scP*3.0;
        let ax,ay,ang;
        if(isH){ ax=midPx; ay=ev.sideSign>0?wy(mc.row)-aOff:wy(mc.row)+scP+aOff; ang=ev.sideSign>0?Math.PI/2:-Math.PI/2; }
        else { ax=ev.sideSign>0?wx(mc.col)-aOff:wx(mc.col)+scP+aOff; ay=midPy; ang=ev.sideSign>0?0:Math.PI; }
        // Line from camera to wall
        doc.setDrawColor(26,95,180);doc.setLineWidth(0.5);
        const wallX=isH?midPx:(ev.sideSign>0?wx(mc.col):wx(mc.col)+scP);
        const wallY=isH?(ev.sideSign>0?wy(mc.row):wy(mc.row)+scP):midPy;
        doc.line(ax,ay,wallX,wallY);
        // Arrow circle - larger
        const circR=Math.max(scP*0.85, 3.5);
        doc.setFillColor(240,245,255);doc.setDrawColor(26,95,180);doc.setLineWidth(0.4);
        doc.circle(ax,ay,circR,'FD');
        // Label - larger font
        doc.setTextColor(26,95,180);doc.setFont('helvetica','bold');doc.setFontSize(Math.max(7,scP*0.75));
        doc.text(ev.name,ax,ay+circR*0.2,{align:'center'});
        // Arrow head - larger and more prominent
        const aLen=scP*1.0,aW=scP*0.45;
        const ex=ax+Math.cos(ang)*aLen, ey=ay+Math.sin(ang)*aLen;
        doc.setFillColor(26,95,180);
        doc.triangle(ex,ey,
          ex-Math.cos(ang-.45)*aW,ey-Math.sin(ang-.45)*aW,
          ex-Math.cos(ang+.45)*aW,ey-Math.sin(ang+.45)*aW,'F');
      });
    }
    // rodapé
    doc.setFillColor(232,229,226);doc.rect(0,PH-7,PW,7,'F');
    doc.setTextColor(80,75,70);doc.setFont('helvetica','normal');doc.setFontSize(7);
    doc.text('TijoCAD  ·  Referência de Elevações',PW/2,PH-2.5,{align:'center'});

    // ── Uma página por elevação ───────────────────────
    S.elevViews.forEach((ev,evIdx)=>{
      if(!ev.cells||!ev.cells.length) return;
      doc.addPage();
      const cells=ev.cells;
      const n=cells.length;
      const sideStr=ev.dir==='H'?(ev.sideSign>0?'↑ norte':'↓ sul'):(ev.sideSign>0?'→ leste':'← oeste');

      // ── Cabeçalho padrão (mesmo estilo das fiadas) ──
      const HDR_E = 30;

      // Fundo
      doc.setFillColor(...SURFE);
      doc.rect(0, 0, PW, HDR_E, 'F');
      doc.setDrawColor(...BRDE);
      doc.setLineWidth(0.4);
      doc.line(0, HDR_E, PW, HDR_E);

      // Stripe lateral terracota (3mm)
      doc.setFillColor(...BRANDE);
      doc.rect(0, 0, 3, HDR_E, 'F');

      // Label + número
      doc.setTextColor(...BRANDE);
      doc.setFont('helvetica','bold');
      doc.setFontSize(7);
      doc.text('ELEVAÇÃO', 7, 10);
      doc.setTextColor(...DARKE);
      doc.setFontSize(20);
      doc.text(ev.name, 7, 24);

      // Separador vertical
      doc.setDrawColor(...BRDE);
      doc.setLineWidth(0.3);
      doc.line(30, 4, 30, HDR_E-4);

      // Metadados
      doc.setTextColor(100,95,90);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.text(`${evIdx+1} de ${S.elevViews.length}`, 33, 10);
      doc.setTextColor(...DARKE);
      doc.setFontSize(8);
      doc.setFont('helvetica','bold');
      doc.text(`${n*S.cellCm} cm`, 33, 19);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100,95,90);
      doc.text(`${n} módulos · sentido ${sideStr}`, 33, 27);

      // Nome do projeto
      if(pnE){
        doc.setTextColor(150,145,140);
        doc.setFont('helvetica','normal');
        doc.setFontSize(7);
        doc.text(pnE, PW-8, 9, {align:'right'});
      }

      // Render vetorial da elevação
      drawElevVec(doc, ev, HDR_E);
      // Rodapé (mesmo estilo)
      doc.setFillColor(232,229,226);doc.rect(0,PH-7,PW,7,'F');
      doc.setDrawColor(...BRDE);doc.setLineWidth(0.3);doc.line(0,PH-7,PW,PH-7);
      doc.setTextColor(80,75,70);doc.setFont('helvetica','normal');doc.setFontSize(7);
      doc.text(`TijoCAD  ·  Elevação ${ev.name}  ·  ${evIdx+1} de ${S.elevViews.length}  ·  tijolo ${S.cellCm}×${S.cellCm*2} cm`, PW/2, PH-2.5, {align:'center'});
      doc.setFont('helvetica','bold');
      doc.text(`${ev.name}`, PW-5, PH-2.5, {align:'right'});
    });
  }

    doc.save('tijocad-fiadas.pdf');
  btn.disabled=false; btn.textContent='Exportar PDF';
  // Restaurar ícone
  document.getElementById('btn-pdf').innerHTML=`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2L3 14L13 14L13 6L9 2Z"/><path d="M9 2L9 6L13 6"/><path d="M5 9L11 9M5 11L9 11"/></svg>Exportar PDF`;
}


export { computeQuant, openQuantPanel, exportPDF };
