import { S } from '../core/state.js';
import { bricks, kk } from '../core/history.js';
import { analyzeCourse, computeGrauteCells, computeGrampos, grampoLenM, countGrampos } from '../engine/modulation.js';

function countBricks(){
  const maxC = maxCourses();
  const count = {'tijolo':0,'meio-tijolo':0,'canaleta':0,'meia-canaleta':0,'corte-especial':0,'meio-corte':0};
  for(let c=0;c<maxC;c++){
    const cd = analyzeCourse(c);
    cd.forEach(info=>{
      if(info && info.isFirst) count[info.type]=(count[info.type]||0)+1;
    });
  }
  document.getElementById('st-t').textContent  = count['tijolo'];
  document.getElementById('st-mt').textContent = count['meio-tijolo'];
  document.getElementById('st-c').textContent  = count['canaleta'];
  document.getElementById('st-mc').textContent = count['meia-canaleta'];
  document.getElementById('st-ce').textContent = (count['corte-especial']||0) + (count['meio-corte']||0);
  const total = Object.values(count).reduce((a,b)=>a+b,0);
  // st-total removido do HTML (era redundante); total calculado apenas para st-total-inline
  const stTotInline = document.getElementById('st-total-inline');
  if(stTotInline) stTotInline.textContent = total;

  // Grampos
  const gInfo = countGrampos();
  const stGrampo = document.getElementById('st-grampo');
  if(stGrampo) stGrampo.textContent = gInfo.count > 0
    ? `${gInfo.count} grampos · ${(gInfo.totalLenM).toFixed(1)} m`
    : '—';
  const stElec  = document.getElementById('st-elec');
  const stWater = document.getElementById('st-water');
  const br2=bricks();
  const nCondElec  = S.conduits.filter(cd=>cd.ctype==='elec').length;
  const nCondWater = S.conduits.filter(cd=>cd.ctype==='water').length;
  const nCondPipe  = S.conduits.filter(cd=>cd.ctype==='pipe').length;
  if(stElec)  stElec.textContent  = nCondElec  || ([...S.manualElec].filter(k=>br2.has(k)).length||'');
  if(stWater) stWater.textContent = nCondWater || ([...S.manualWater].filter(k=>br2.has(k)).length||'');
  const stHydro2=document.getElementById('st-hydro');
  if(stHydro2){const n=[...S.hydroPoints.entries()].filter(([k])=>br2.has(k)).reduce((s,[,arr])=>s+arr.length,0); stHydro2.textContent=(n?`${n}pt`:'')+(nCondPipe?` ${nCondPipe}tb`:'')|| '';}
  const stEbox=document.getElementById('st-ebox');
  if(stEbox){const n=[...S.elecBoxes.entries()].filter(([k])=>br2.has(k)).reduce((s,[,arr])=>s+arr.length,0);stEbox.textContent=n||'';}


  // ── Quantitativos de graute e vergalhão ─────────
  const holeDiam = S.cellCm === 15 ? 9 : 6;
  const holeR    = holeDiam / 2 / 100;       // metros
  const canalDiam = S.cellCm === 15 ? 0.09 : 0.06; // largura do canal (m), aprox.
  const canalH    = S.cellCm === 15 ? 0.027 : 0.022; // altura do canal (m)
  const br = bricks();

  // Vergalhão de colunas (furos grauteados verticais)
  const groutCells = computeGrauteCells();
  let rebarCol = 0, groutL = 0;
  groutCells.forEach(k => {
    if(!br.has(k)) return;
    const hM = getCellH(k) / 100;
    rebarCol += hM;
    groutL   += Math.PI * holeR * holeR * hM * 1000;
  });

  // Vergalhão de canaletas (horizontal) + graute das canaletas
  // Inclui corte-especial que veio de canaleta (wasCanal) pois o canal interno ainda recebe vergalhão e graute
  let rebarCan = 0, groutCanL = 0;
  for(let c=0;c<maxC;c++){
    const cd = analyzeCourse(c);
    cd.forEach((info,k)=>{
      if(!info||!info.isFirst) return;
      const isCanal = info.type==='canaleta'||info.type==='meia-canaleta'||info.wasCanal;
      if(!isCanal) return;
      if(!br.has(k)) return;
      const[col,row]=k.split(',').map(Number);
      // comprimento do vergalhão = comprimento do tijolo
      let lenM;
      if(info.partner){
        const[pc,pr]=info.partner.split(',').map(Number);
        lenM=(Math.abs(pc-col)+Math.abs(pr-row)+1)*S.cellCm/100;
      } else {
        lenM=S.cellCm/100;
      }
      rebarCan += lenM;
      // Volume do canal: seção retangular × comprimento
      groutCanL += canalDiam * canalH * lenM * 1000;
    });
  }

  const fmt = m => m < 1 ? `${Math.round(m*100)} cm` : `${m.toFixed(1)} m`;
  const fmtL = l => l < 1 ? `${(l*1000).toFixed(0)} mL` : `${l.toFixed(1)} L`;

  document.getElementById('st-rebar-col').textContent = fmt(rebarCol);
  document.getElementById('st-rebar-can').textContent = fmt(rebarCan);
  document.getElementById('st-rebar-tot').textContent = fmt(rebarCol + rebarCan);
  document.getElementById('st-grout').textContent     = fmtL(groutL + groutCanL);
}

function updSt(){
  // Only recount when bricks exist (slight perf guard)
  if(bricks().size > 0) countBricks();
  else{
    ['st-t','st-mt','st-c','st-mc'].forEach(id=>document.getElementById(id).textContent='0');
    ['st-rebar-col','st-rebar-can','st-rebar-tot'].forEach(id=>document.getElementById(id).textContent='0 m');
    document.getElementById('st-grout').textContent='0 L';
    // st-total removido
  }
}

// ═══════════════════════════════════════════════════
// MOVER PAREDE — MODO REVIT (Shift+arrastar)
// ═══════════════════════════════════════════════════
//
// Ao mover um segmento de parede PERPENDICULARMENTE à sua direção,
// as paredes conectadas nas extremidades se esticam ou encolhem
// automaticamente para manter a conectividade — igual ao Revit.
//
// Exemplo: parede H na linha 5 conectada a parede V na coluna 2 (linhas 0-4).
//   Mover H para linha 3 → V encolhe para linhas 0-2 (remove linha 4)
//   Mover H para linha 7 → V cresce para linhas 0-6 (adiciona linhas 5,6)
//
// Para movimento PARALELO (ex: parede H movendo horizontalmente), o
// comportamento é mover simples sem esticar — não há uma regra Revit clara
// nesse caso para o modelo de grid.
//
// Lógica de add/remove para parede perpendicular P conectada no canto:
//
//   Canto em fr (H-run), parede P vai PARA CIMA (célula em fr-1 existe):
//     H desce (dr>0): preencher linhas fr a fr+dr-1 (gap entre P e novo canto)
//     H sobe  (dr<0): remover linhas fr+dr+1 a fr-1 (encolher P por baixo)
//
//   Canto em fr (H-run), parede P vai PARA BAIXO (célula em fr+1 existe):
//     H sobe  (dr<0): preencher linhas fr+dr+1 a fr (gap entre novo canto e P)
//     H desce (dr>0): remover linhas fr+1 a fr+dr (encolher P por cima)
//
//   Para V-run movendo horizontalmente: lógica simétrica nas colunas.

// Move o run com esticamento Revit das paredes perpendiculares conectadas.
// Retorna true se o move foi aplicado, false se inválido (ex: run ficaria 0).

export { countBricks, updSt };
