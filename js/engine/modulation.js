import { S } from '../core/state.js';
import { CELL, TYPE_COLOR, TYPE_HOLE, GROUT_C } from '../constants.js';
import { bricks, kk, getCellH } from '../core/history.js';

function cellDir(col, row, cIdx, br){
  const hL=br.has(kk(col-1,row)), hR=br.has(kk(col+1,row));
  const vU=br.has(kk(col,row-1)), vD=br.has(kk(col,row+1));
  const isH=hL||hR, isV=vU||vD;

  // Célula totalmente isolada (sem nenhum vizinho): direção arbitrária H.
  if(!isH && !isV) return 'H';

  if(isH && !isV) return 'H';
  if(isV && !isH) return 'V';

  // Has both H and V neighbours — determine junction type
  const hBoth=hL&&hR, vBoth=vU&&vD;

  // T-junction: one direction is a true through-wall (goes both ways)
  if(hBoth && !vBoth) return 'H';  // main wall is horizontal
  if(vBoth && !hBoth) return 'V';  // main wall is vertical

  // Cross (4 neighbours): treat as 2 T-junctions.
  // Main wall = longer wall. Measure run lengths.
  if(hBoth && vBoth){
    let hLen=1;
    for(let c=col-1;br.has(kk(c,row));c--)hLen++;
    for(let c=col+1;br.has(kk(c,row));c++)hLen++;
    let vLen=1;
    for(let r=row-1;br.has(kk(col,r));r--)vLen++;
    for(let r=row+1;br.has(kk(col,r));r++)vLen++;
    // Longer wall is always the main wall (passes through)
    // Tie → use H as default, but alternate by course for interlocking
    if(hLen>vLen) return 'H';
    if(vLen>hLen) return 'V';
    // Equal length: alternate for interlocking
    return cIdx%2===0 ? 'H' : 'V';
  }

  // L-corner: alternate so each wall passes every other fiada
  return cIdx%2===0 ? 'H' : 'V';
}

// Standard structural canaleta heights (cm)
const STD_TOL = 5;

// Global canaleta courses: apply to ALL wall cells at that height.
// Always includes structural courses at ~110 and ~210 cm even without openings.
// Opening-triggered global courses added when opening heights ≈ standard.
function globalCanalCourses(){
  const g = new Set();
  // Always-on structural travamento courses
  const sillC = Math.round(S.stdSill / S.brickHCm) - 1; // course whose top ≈ peitoril padrão
  const headC = Math.round(S.stdHead / S.brickHCm);      // course whose bottom ≈ verga padrão
  if(sillC >= 0) g.add(sillC);
  if(headC >= 0) g.add(headC);
  // Opening-triggered global courses (non-standard heights remain local)
  Object.values(S.openMap).forEach(op=>{
    if(op.infCm>0 && Math.abs(op.infCm-S.stdSill)<=STD_TOL)
      g.add(Math.ceil(op.infCm/S.brickHCm)-1);
    if(Math.abs(op.supCm-S.stdHead)<=STD_TOL)
      g.add(Math.ceil(op.supCm/S.brickHCm));
  });
  return g;
}

// ═══════════════════════════════════════════════════
// GRAUTE ENGINE
// ═══════════════════════════════════════════════════
// Retorna Set<"col,row"> com todas as células que têm furo grauteado.
// Regras estruturais:
//   Canto L    → 3 células: a célula do canto + 1 vizinho H + 1 vizinho V
//   Junção T   → 2 células: célula da junção + 1ª célula do braço
//   Cruzamento → 5 células: junção + 4 vizinhos
//   Abertura   → 2 células por borda (inferior e superior) adjacentes ao vão
//
function computeGrauteCells(){
  const br = bricks();
  const grout = new Set();

  // ── Passo 1: junções (L, T, cruzamento) + pontas soltas ──
  br.forEach(k => {
    const [c,r] = k.split(',').map(Number);
    const hL=br.has(kk(c-1,r)), hR=br.has(kk(c+1,r));
    const vU=br.has(kk(c,r-1)), vD=br.has(kk(c,r+1));
    const nH=(hL?1:0)+(hR?1:0), nV=(vU?1:0)+(vD?1:0);
    const totalN = nH + nV;

    // Ponta solta (dead end) ou célula isolada: 0 ou 1 vizinho
    if(totalN <= 1){
      grout.add(k);
    }

    // Canto L: exatamente 1 vizinho H e 1 vizinho V
    if(nH===1 && nV===1){
      grout.add(k);
      grout.add(hR ? kk(c+1,r) : kk(c-1,r));
      grout.add(vD ? kk(c,r+1) : kk(c,r-1));
    }
    // Junção T com eixo H (parede passa H, braço em V)
    if(hL && hR && (vU||vD) && !(vU&&vD)){
      grout.add(k);
      grout.add(vD ? kk(c,r+1) : kk(c,r-1));
    }
    // Junção T com eixo V (parede passa V, braço em H)
    if(vU && vD && (hL||hR) && !(hL&&hR)){
      grout.add(k);
      grout.add(hR ? kk(c+1,r) : kk(c-1,r));
    }
    // Cruzamento (4 vizinhos): tratar como 2 junções T, parede principal = maior.
    // Graute: junção + os 2 vizinhos da parede SECUNDÁRIA (braços)
    if(hL && hR && vU && vD){
      let hLen=1; for(let c2=c-1;br.has(kk(c2,r));c2--)hLen++; for(let c2=c+1;br.has(kk(c2,r));c2++)hLen++;
      let vLen=1; for(let r2=r-1;br.has(kk(c,r2));r2--)vLen++; for(let r2=r+1;br.has(kk(c,r2));r2++)vLen++;
      grout.add(k);
      if(hLen >= vLen){
        // H principal → graute nos braços V
        grout.add(kk(c,r-1)); grout.add(kk(c,r+1));
      } else {
        // V principal → graute nos braços H
        grout.add(kk(c-1,r)); grout.add(kk(c+1,r));
      }
    }
  });

  // ── Passo 2: células adjacentes a aberturas ──────
  // Para cada célula com abertura, as células de parede imediatamente
  // acima (borda superior) e abaixo (borda inferior) do vão recebem graute.
  // Na vista de planta, a "borda" é a célula de parede vizinha na direção V
  // (acima/abaixo do vão) ou H (esquerda/direita), dependendo da orientação.
  // Como S.openMap usa a mesma chave "col,row" da planta, varremos todos os
  // vizinhos perpendiculares de cada célula com abertura.
  Object.keys(S.openMap).forEach(k => {
    if(!br.has(k)) return;
    const [c,r] = k.split(',').map(Number);
    // Verificar as 4 direções: se o vizinho for parede (sem abertura), grautar
    [kk(c-1,r), kk(c+1,r), kk(c,r-1), kk(c,r+1)].forEach(nk => {
      if(br.has(nk) && !S.openMap[nk]) grout.add(nk);
    });
  });

  // ── Passo 3: graute manual ───────────────────────
  S.manualGrout.forEach(k => { if(br.has(k)) grout.add(k); });

  // ── Passo 4: remover exclusões manuais ──────────
  // Nota: traçados de infraestrutura horizontal (XY/L) coexistem com o graute
  // vertical (eixo Z). O canal da canaleta é tratado visualmente pelo condHMap
  // no render, sem precisar remover o graute do furo.
  S.groutExclude.forEach(k => grout.delete(k));

  return grout;
}

// ═══════════════════════════════════════════════════
// GRAMPO ENGINE
// ═══════════════════════════════════════════════════
// Grampos em U ligam vergalhões verticais em cantos L e junções T.
// São colocados nas fiadas cujo topo está em ~55cm e ~155cm.
// Cada grampo ocupa 2 células (os 2 furos onde as pernas do U descem).
// Os tijolos que recebem o grampo viram corte-especial.
//
// Comprimento do grampo (U dobrado):
//   tijolo 12,5×25: 40 cm
//   tijolo 15×30:   50 cm
//
// Quantidade:
//   Canto L:    2 grampos (um por direção)
//   Junção T:   1 grampo (no braço)
//   Cruzamento: 2 grampos (ambos nos braços da parede secundária)

const GRAMPO_H1 = 55;   // cm — primeira fiada de grampo
const GRAMPO_H2 = 110;  // cm — canaleta de peitoril (STD_SILL)
const GRAMPO_H3 = 155;  // cm — terceira fiada de grampo
const GRAMPO_H4 = 210;  // cm — canaleta de verga (STD_HEAD)

// Retorna array de {cells: [k1,k2], dir:'H'|'V'} para cada grampo
// cells = as 2 células que recebem as pernas do U
function computeGrampos(){
  const br = bricks();
  const grampos = [];

  // Fiadas de grampo
  const gc1 = Math.floor(GRAMPO_H1 / S.brickHCm);
  const gc2 = Math.floor(GRAMPO_H2 / S.brickHCm);
  const gc3 = Math.floor(GRAMPO_H3 / S.brickHCm);
  const gc4 = Math.floor(GRAMPO_H4 / S.brickHCm);
  const grampoCourses = new Set([gc1, gc2, gc3, gc4].filter(c => c >= 0));

  // Identificar junções: iterar sobre células de parede
  const junctions = []; // {col, row, type, dirs}
  br.forEach(k => {
    const [c,r] = k.split(',').map(Number);
    const hL=br.has(kk(c-1,r)), hR=br.has(kk(c+1,r));
    const vU=br.has(kk(c,r-1)), vD=br.has(kk(c,r+1));
    const nH=(hL?1:0)+(hR?1:0), nV=(vU?1:0)+(vD?1:0);

    // Canto L: exatamente 1H + 1V → 2 grampos (um em cada direção)
    if(nH===1 && nV===1){
      // Grampo H: par de células nó + vizinho H
      const hNeigh = hR ? kk(c+1,r) : kk(c-1,r);
      grampos.push({
        col:c, row:r,
        cells:[k, hNeigh],
        dir:'H',
        type:'L',
        courses: grampoCourses
      });
      // Grampo V: par de células nó + vizinho V
      const vNeigh = vD ? kk(c,r+1) : kk(c,r-1);
      grampos.push({
        col:c, row:r,
        cells:[k, vNeigh],
        dir:'V',
        type:'L',
        courses: grampoCourses
      });
    }

    // Junção T com eixo H (parede passa H, braço em V) → 1 grampo no braço V
    if(hL && hR && (vU||vD) && !(vU&&vD)){
      const vNeigh = vD ? kk(c,r+1) : kk(c,r-1);
      grampos.push({
        col:c, row:r,
        cells:[k, vNeigh],
        dir:'V',
        type:'T',
        courses: grampoCourses
      });
    }

    // Junção T com eixo V (parede passa V, braço em H) → 1 grampo no braço H
    if(vU && vD && (hL||hR) && !(hL&&hR)){
      const hNeigh = hR ? kk(c+1,r) : kk(c-1,r);
      grampos.push({
        col:c, row:r,
        cells:[k, hNeigh],
        dir:'H',
        type:'T',
        courses: grampoCourses
      });
    }

    // Cruzamento (4 vizinhos): tratar como 2 junções T, parede principal = maior.
    // Grampos ficam nos DOIS braços da parede secundária (como 2 junções T individuais).
    if(hL && hR && vU && vD){
      let hLen=1; for(let c2=c-1;br.has(kk(c2,r));c2--)hLen++; for(let c2=c+1;br.has(kk(c2,r));c2++)hLen++;
      let vLen=1; for(let r2=r-1;br.has(kk(c,r2));r2--)vLen++; for(let r2=r+1;br.has(kk(c,r2));r2++)vLen++;
      if(hLen >= vLen){
        // H é principal → grampos nos braços V (cima e baixo)
        grampos.push({col:c,row:r,cells:[k,kk(c,r-1)],dir:'V',type:'T',courses:grampoCourses});
        grampos.push({col:c,row:r,cells:[k,kk(c,r+1)],dir:'V',type:'T',courses:grampoCourses});
      } else {
        // V é principal → grampos nos braços H (esquerda e direita)
        grampos.push({col:c,row:r,cells:[k,kk(c-1,r)],dir:'H',type:'T',courses:grampoCourses});
        grampos.push({col:c,row:r,cells:[k,kk(c+1,r)],dir:'H',type:'T',courses:grampoCourses});
      }
    }
  });

  return grampos;
}

// Retorna Set<"col,row"> de células que recebem grampo nas fiadas ativas (cIdx)
function computeGrampoCellsForCourse(cIdx){
  const gc1 = Math.floor(GRAMPO_H1 / S.brickHCm);
  const gc2 = Math.floor(GRAMPO_H2 / S.brickHCm);
  const gc3 = Math.floor(GRAMPO_H3 / S.brickHCm);
  const gc4 = Math.floor(GRAMPO_H4 / S.brickHCm);
  if(cIdx !== gc1 && cIdx !== gc2 && cIdx !== gc3 && cIdx !== gc4) return new Set();
  const cells = new Set();
  computeGrampos().forEach(g => {
    g.cells.forEach(k => { if(bricks().has(k)) cells.add(k); });
  });
  return cells;
}

// Comprimento de um grampo em metros
function grampoLenM(){
  return S.cellCm === 15 ? 0.50 : 0.40;
}

// Total de grampos no projeto (para quantitativo)
function countGrampos(){
  const br=bricks();
  if(!br.size) return {count:0, totalLenM:0};
  const gc1=Math.floor(GRAMPO_H1/S.brickHCm);
  const gc2=Math.floor(GRAMPO_H2/S.brickHCm);
  const gc3=Math.floor(GRAMPO_H3/S.brickHCm);
  const gc4=Math.floor(GRAMPO_H4/S.brickHCm);
  const nCourses=[gc1,gc2,gc3,gc4].filter(c=>{
    const bot=c*S.brickHCm;
    return br.size>0 && bot < Math.max(...[...br].map(k=>getCellH(k)));
  }).length;
  const grampos=computeGrampos();
  const count=grampos.length * nCourses;
  return {count, totalLenM: count * grampoLenM()};
}


// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR DE MODULAÇÃO — analyzeCourse(cIdx)
// ═══════════════════════════════════════════════════════════════════════════════
//
// DESCRIÇÃO GERAL:
//   Recebe o índice de uma fiada (0-based) e retorna Map<"col,row", BrickInfo|null>.
//   null  = célula existe na planta mas está inativa nesta fiada (abertura ou
//           célula acima da altura personalizada).
//   BrickInfo = { type, dir, isFirst, partner }
//
//   type    : 'tijolo' | 'meio-tijolo' | 'canaleta' | 'meia-canaleta' |
//             'corte-especial' | 'meio-corte'
//   dir     : 'H' | 'V'  — direção de assentamento
//   isFirst : true  → esta célula é o ponto de origem do tijolo (desenhar aqui)
//             false → célula parceira (já desenhada pelo isFirst)
//   partner : kk(col,row) da célula parceira, ou null para meio-tijolo (1 célula)
//
//   Par (A isFirst=true, partner=B) + (B isFirst=false, partner=A) = tijolo inteiro
//   (2 células = 25cm na direção do run).
//   Orphan (isFirst=true, partner=null) = meio-tijolo (12.5cm).
//
// PIPELINE EM 5 PASSOS:
//
//   Passo 1 — ACTIVE: varrer todas as células de parede e excluir as inativas
//     nesta fiada (dentro de uma abertura OU bottom >= altura da célula).
//     Marcar `canal=true` nas células que devem receber canaleta (fiada de
//     travamento estrutural em ~110cm, ~210cm, topo da parede, bordas de abertura).
//
//   Passo 2 — SEGMENTS: agrupar células ativas em runs maximal contíguos na
//     mesma direção (conforme cellDir). Um segmento = trecho de parede retilíneo
//     que será paginado de forma independente.
//
//   Passo 3 — CLASSIFY ENDPOINTS: para cada extremidade de cada segmento,
//     determinar se é LIVRE ou CONECTADA.
//       LIVRE     → pode receber meio-tijolo (ponta solta, braço de T)
//       CONECTADA → não recebe meio-tijolo nesta extremidade (canto L, junção
//                   onde o segmento é a parede principal)
//
//   Passo 4 — PAGINATE: com base na classificação das extremidades, distribuir
//     as células em pares. Casos:
//       (livre, livre), (livre, conectada), (conectada, livre): triviais.
//       (conectada, conectada) com n ÍMPAR: o orphan (meio-tijolo) vai em uma
//       das extremidades, alternando por fiada para evitar junta prumo.
//       → Este é o caso do canto L com dimensão ímpar. O tijolo perpendicular
//         no canto compensa estruturalmente. Veja BUG CONHECIDO abaixo.
//
//   Passo 5 — EMIT: determinar o tipo final. Canaletas em extremos de canto L
//     ou pontas livres são convertidas para corte-especial (canal ficaria exposto).
//
// REGRAS DE MEIO-TIJOLO (confirmadas em obra — Bruno, março 2026):
//   ✅ Meio-tijolo em ponta LIVRE (parede que termina sem conectar a nada)
//   ✅ Meio-tijolo em braço de T (extremidade que encosta na parede principal)
//   ✅ Meio-tijolo adjacente a abertura (abertura cria ponta livre na fiada)
//   ✅ Célula isolada (sem vizinhos em nenhuma direção) = meio-tijolo
//   ✅ Dimensão ímpar entre dois cantos L: meio-tijolo numa das extremidades,
//      alternando de lado entre fiadas (tijolo perp. do canto = compensador)
//   ❌ Meio-tijolo NO CENTRO de segmento entre dois cantos L = nunca correto
//   ❌ Meio-tijolo no centro de segmento entre duas junções T = nunca correto
//
// ══════════════════════════════════════════════════════════════════════════════
// MOTOR DE MODULAÇÃO v31 — HÍBRIDO + CORNER ASSIGNMENT
// ══════════════════════════════════════════════════════════════════════════════
//
// PRINCÍPIO:
//   1. CORNER ASSIGNMENT: antes da segmentação, percorrer o grafo de cantos L
//      e atribuir direções (H/V) de modo que cantos adjacentes conectados por
//      uma parede de N células tenham:
//        N par  → mesma direção   → segmento par  → 0 orphans
//        N ímpar→ direções opostas→ segmento par  → 0 orphans
//      Isso é resolvido por BFS/2-coloring no grafo de cantos.
//
//   2. PAGINAÇÃO HÍBRIDA:
//      • Endpoints conectados (cantos L) → parear do início.
//      • Endpoints livres → fase global (coord + cIdx) % 2 → stretcher bond.
//
// RESULTADO:
//   ✅ Retângulo 3×3, 5×5, qualquer NxN → zero orphans
//   ✅ Retângulo 7×6, 8×6, qualquer NxM → zero orphans
//   ✅ Reta livre: stretcher bond com juntas alternando
//   ✅ Braço de T: alternância por fase global
//   ✅ L-shape, U-shape: interlocking correto nos cantos
//
// ══════════════════════════════════════════════════════════════════════════════

// ── CORNER ASSIGNMENT ────────────────────────────────────────────────────────
// Atribui direção (H/V) a cada canto L de modo a minimizar orphans.
// Cantos adjacentes (conectados por parede reta) recebem:
//   mesma dir se distância PAR, dir oposta se distância ÍMPAR.
// Isso garante que todo segmento entre cantos L tem comprimento par → 0 orphans.
function assignCornerDirs(active, cIdx) {
  // Encontrar todos os cantos L: exatamente 1 vizinho H e 1 vizinho V
  const corners = new Set();
  active.forEach((c, k) => {
    const nH = (active.has(kk(c.col - 1, c.row)) ? 1 : 0) +
               (active.has(kk(c.col + 1, c.row)) ? 1 : 0);
    const nV = (active.has(kk(c.col, c.row - 1)) ? 1 : 0) +
               (active.has(kk(c.col, c.row + 1)) ? 1 : 0);
    if (nH === 1 && nV === 1) corners.add(k);
  });
  if (corners.size === 0) return;

  // Caminhar numa direção a partir de um canto para encontrar o próximo canto
  function findAdjacentCorner(col, row, dc, dr) {
    let c = col + dc, r = row + dr, dist = 1;
    while (active.has(kk(c, r))) {
      if (corners.has(kk(c, r))) return { k: kk(c, r), wallLen: dist + 1 };
      // Cruzamento (4 vizinhos ativos): interrompe a cadeia de cantos.
      // Cantos em lados opostos de um cruzamento são independentes.
      const cH = (active.has(kk(c-1,r))?1:0)+(active.has(kk(c+1,r))?1:0);
      const cV = (active.has(kk(c,r-1))?1:0)+(active.has(kk(c,r+1))?1:0);
      if(cH >= 2 && cV >= 2) return null;
      c += dc; r += dr; dist++;
    }
    return null; // ponta livre, sem canto adjacente
  }

  // BFS/2-coloring no grafo de cantos
  const assigned = new Map();
  corners.forEach(startK => {
    if (assigned.has(startK)) return;
    assigned.set(startK, cIdx % 2 === 0 ? 'H' : 'V');
    const queue = [startK];
    while (queue.length > 0) {
      const k = queue.shift();
      const [col, row] = k.split(',').map(Number);
      const myDir = assigned.get(k);
      // Caminhar pelos 4 semi-eixos possíveis
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (!active.has(kk(col + dc, row + dr))) continue;
        const adj = findAdjacentCorner(col, row, dc, dr);
        if (!adj || assigned.has(adj.k)) continue;
        // wallLen par → mesma dir; ímpar → dir oposta
        const sameDir = adj.wallLen % 2 === 0;
        const adjDir = sameDir ? myDir : (myDir === 'H' ? 'V' : 'H');
        assigned.set(adj.k, adjDir);
        queue.push(adj.k);
      }
    }
  });

  // Aplicar: sobrescrever dir no mapa active
  assigned.forEach((dir, k) => {
    const c = active.get(k);
    if (c) c.dir = dir;
  });
}

function analyzeCourse(cIdx){
  const result = new Map();
  const br = bricks();
  const globalCanal = globalCanalCourses();
  const conduitCanalKeysCache = computeConduitCanalKeys();

  // ── PASSO 1: ACTIVE ─────────────────────────────────────────────────────
  const active = new Map();
  br.forEach(k => {
    const [col, row] = k.split(',').map(Number);
    const cellH = getCellH(k);
    const bot   = cIdx * S.brickHCm;
    if (bot >= cellH) { result.set(k, null); return; }
    const op = S.openMap[k];
    if (op && bot >= op.infCm && bot < op.supCm) { result.set(k, null); return; }
    const lastC = Math.ceil(cellH / S.brickHCm) - 1;
    const isSlope = S.slopedKeys.has(k);
    // Topo de parede inclinada → corte-especial, não canaleta
    let slopecut = (cIdx === lastC && isSlope);
    // Fiada de grampo → corte-especial nas células de junção
    const gc1 = Math.floor(GRAMPO_H1 / S.brickHCm);
    const gc2 = Math.floor(GRAMPO_H2 / S.brickHCm);
    const gc3 = Math.floor(GRAMPO_H3 / S.brickHCm);
    const gc4 = Math.floor(GRAMPO_H4 / S.brickHCm);
    let grampocut = false;  // será preenchido no Passo 1.3 abaixo
    // Caixa elétrica → só as fiadas que a caixa fisicamente intercepta viram corte-especial
    let boxcut = false;
    if(S.elecBoxes.has(k)){
      const arr = S.elecBoxes.get(k);
      boxcut = arr.some(eb=>{
        const boxBot = eb.heightCm - eb.hCm/2;
        const boxTop = eb.heightCm + eb.hCm/2;
        const courseBot = cIdx * S.brickHCm;
        const courseTop = (cIdx + 1) * S.brickHCm;
        return courseBot < boxTop && courseTop > boxBot;
      });
    }
    // Ponto hidráulico → fiada que contém a altura do ponto vira corte-especial
    if(!boxcut && S.hydroPoints.has(k)){
      const arr = S.hydroPoints.get(k);
      const courseBot = cIdx * S.brickHCm;
      const courseTop = (cIdx + 1) * S.brickHCm;
      boxcut = arr.some(hp=> hp.heightCm >= courseBot && hp.heightCm < courseTop);
    }
    let canal = (!slopecut && cIdx === lastC) || (globalCanal.has(cIdx) && bot < cellH);
    if (!canal && op) {
      if (op.infCm > 0 && cIdx === Math.ceil(op.infCm / S.brickHCm) - 1) canal = true;
      if (cIdx === Math.ceil(op.supCm / S.brickHCm)) canal = true;
    }
    // XY conduit through this cell forces canaleta only on the conduit's course
    if(!canal && conduitCanalKeysCache.has(k) && conduitCanalKeysCache.get(k).has(cIdx)) canal = true;
    active.set(k, { col, row, dir: cellDir(col, row, cIdx, br), canal, slopecut, boxcut });
  });

  // ── PASSO 1.1: propagar boxcut pela largura física da caixa ────────────────
  // Para caixas largas (QD = 30 cm) que extrapolam o par de células, marcar
  // células vizinhas ao longo do segmento dentro do alcance de wCm/2.
  {
    const toMarkBox = new Map();
    active.forEach((c, k) => {
      if (!c.boxcut || !S.elecBoxes.has(k)) return;
      const arr = S.elecBoxes.get(k);
      arr.forEach(eb => {
        const halfCells = Math.floor(eb.wCm / 2 / S.cellCm);
        if (halfCells === 0) return;
        const [cc, cr] = k.split(',').map(Number);
        for (let i = 1; i <= halfCells; i++) {
          const kL = c.dir === 'H' ? kk(cc - i, cr) : kk(cc, cr - i);
          const kR = c.dir === 'H' ? kk(cc + i, cr) : kk(cc, cr + i);
          if (active.has(kL)) toMarkBox.set(kL, true);
          if (active.has(kR)) toMarkBox.set(kR, true);
        }
      });
    });
    toMarkBox.forEach((_, k) => { const c = active.get(k); if (c) c.boxcut = true; });
  }

  // ── PASSO 1.2: VERGA/CONTRA-VERGA ────────────────────────────────────────
  // Para cada célula de abertura no curso de verga/contra-verga, estender
  // canaleta nas células adjacentes NA DIREÇÃO DO RUN da parede.
  //
  // Fix: usar active.get(k).dir para determinar a direção da parede e só
  // extender nessa direção — evita marcar células de paredes perpendiculares
  // que tocam a abertura em junções T ou L.
  //
  // Extensão: nk1 (adjacente) + nk2 (1 além) = ~25cm de apoio mínimo.
  const vergaCells = new Set();
  Object.entries(S.openMap).forEach(([k, op]) => {
    if (!br.has(k)) return;
    const [c, r] = k.split(',').map(Number);
    const contraVergaC = op.infCm > 0 ? Math.ceil(op.infCm / S.brickHCm) - 1 : -1;
    const vergaC = Math.ceil(op.supCm / S.brickHCm);
    const isVergaCourse = (cIdx === vergaC || cIdx === contraVergaC);
    if (!isVergaCourse) return;
    // A célula de abertura É ativa no curso de verga (bot >= supCm)
    // e no curso de contra-verga (bot < infCm) — sempre em active nestes cursos.
    const openCellData = active.get(k);
    if (!openCellData) return;
    // Só extender na direção do run desta célula
    const wallDir = openCellData.dir;
    const stepDirs = wallDir === 'H' ? [[-1,0],[1,0]] : [[0,-1],[0,1]];
    for (const [dc, dr] of stepDirs) {
      const nk1 = kk(c + dc, r + dr);
      if (!active.has(nk1)) continue;
      if (S.openMap[nk1]) continue;     // vizinho também é abertura
      vergaCells.add(nk1);
      const nk2 = kk(c + dc * 2, r + dr * 2);
      if (active.has(nk2) && !S.openMap[nk2]) vergaCells.add(nk2);
    }
  });
  vergaCells.forEach(k => {
    const c = active.get(k);
    if (c) c.canal = true;
  });

  // ── PASSO 1.3: GRAMPOS — marcar células de junção nas fiadas de grampo ──
  {
    const gc1g = Math.floor(GRAMPO_H1 / S.brickHCm);
    const gc2g = Math.floor(GRAMPO_H2 / S.brickHCm);
    const gc3g = Math.floor(GRAMPO_H3 / S.brickHCm);
    const gc4g = Math.floor(GRAMPO_H4 / S.brickHCm);
    if(cIdx === gc1g || cIdx === gc2g || cIdx === gc3g || cIdx === gc4g){
      computeGrampos().forEach(g => {
        g.cells.forEach(ck => {
          const cd = active.get(ck);
          if(cd) cd.grampocut = true;
        });
      });
    }
  }

  // ── PASSO 1.5: CORNER ASSIGNMENT ──────────────────────────────────────
  assignCornerDirs(active, cIdx);

  // ── PASSO 2: SEGMENTOS ──────────────────────────────────────────────────
  const segments = [];
  const cellVisited = new Set();
  active.forEach((_, k) => {
    if (cellVisited.has(k)) return;
    const dir = active.get(k).dir;
    let [rc, rr] = k.split(',').map(Number);
    if (dir === 'H') { while (active.has(kk(rc - 1, rr)) && active.get(kk(rc - 1, rr)).dir === 'H') rc--; }
    else             { while (active.has(kk(rc, rr - 1)) && active.get(kk(rc, rr - 1)).dir === 'V') rr--; }
    const keys = [];
    let cc = rc, cr = rr;
    while (true) {
      const rk = kk(cc, cr);
      if (!active.has(rk) || active.get(rk).dir !== dir) break;
      keys.push(rk); cellVisited.add(rk);
      if (dir === 'H') cc++; else cr++;
    }
    segments.push({ keys, dir });
  });

  // ── PASSO 3: CLASSIFICAR ENDPOINTS + PAGINAR ───────────────────────────
  //
  // isTMainWall: retorna true se (pc,pr) é parede PRINCIPAL de T na direção pd.
  const isTMainWall = (pc, pr, pd, excC, excR) => {
    const excKey = kk(excC, excR);
    const prev = pd === 'V' ? kk(pc, pr - 1) : kk(pc - 1, pr);
    const next = pd === 'V' ? kk(pc, pr + 1) : kk(pc + 1, pr);
    return (active.has(prev) && prev !== excKey) &&
           (active.has(next) && next !== excKey);
  };

  // isEndFree: true = ponta livre (braço de T, parede solta, abertura)
  //            false = conectado (canto L)
  const isEndFree = (col, row, dir, fwd) => {
    const bk = dir === 'H' ? (fwd ? kk(col + 1, row) : kk(col - 1, row))
                            : (fwd ? kk(col, row + 1) : kk(col, row - 1));
    const pd = dir === 'H' ? 'V' : 'H';
    if (active.has(bk)) {
      const [bc, br2] = bk.split(',').map(Number);
      return isTMainWall(bc, br2, pd, col, row);
    }
    if (br.has(bk)) return true;
    const perp = dir === 'H' ? [kk(col, row - 1), kk(col, row + 1)]
                              : [kk(col - 1, row), kk(col + 1, row)];
    for (const pk of perp) {
      if (!active.has(pk)) continue;
      const [pc, pr2] = pk.split(',').map(Number);
      if (isTMainWall(pc, pr2, pd, col, row)) continue;
      return false;
    }
    return true;
  };

  const pairInfo = new Map();
  const pairRange = (lo, hi, keys) => {
    for (let i = lo; i <= S.hi; i += 2) {
      const a = keys[i];
      const b = (i + 1 <= S.hi) ? keys[i + 1] : null;
      pairInfo.set(a, { isFirst: true,  partner: b });
      if (b) pairInfo.set(b, { isFirst: false, partner: a });
    }
  };

  segments.forEach(({ keys, dir }) => {
    const n = keys.length;
    if (!n) return;
    const [fc, fr] = keys[0].split(',').map(Number);
    const [lc, lr] = keys[n - 1].split(',').map(Number);
    const startFree = isEndFree(fc, fr, dir, false);
    const endFree   = isEndFree(lc, lr, dir, true);

    if (!startFree) {
      // ── INÍCIO CONECTADO (canto L) ──────────────────────────────────
      // Parear do início sempre. O canto alternando H↔V desloca o
      // segmento a cada fiada → amarração automática.
      // Se n ímpar: orphan no fim (posição muda pelo deslocamento do canto).
      // Cobre tanto (CC) quanto (CF) — em ambos o start é L-corner.
      pairRange(0, n - 1, keys);

    } else if (!endFree) {
      // ── FIM CONECTADO, INÍCIO LIVRE ─────────────────────────────────
      // O canto está no fim. Parear do fim para trás: se n ímpar,
      // orphan fica no início (ponta livre). O canto desloca o fim
      // a cada fiada → juntas alternam.
      if (n % 2 === 1) {
        pairInfo.set(keys[0], { isFirst: true, partner: null });
        pairRange(1, n - 1, keys);
      } else {
        pairRange(0, n - 1, keys);
      }

    } else {
      // ── AMBAS LIVRES (parede solta, braço de T) ─────────────────────
      // Fase global: (startPos + cIdx) % 2 cria stretcher bond.
      // Para n par: fase 0 → 0 orphans, fase 1 → 2 orphans (ambas pontas).
      // Para n ímpar: fase decide qual ponta recebe o orphan.
      const startPos = dir === 'H' ? fc : fr;
      const phase = (startPos + cIdx) % 2;

      if (phase === 0) {
        pairRange(0, n - 1, keys);
      } else {
        pairInfo.set(keys[0], { isFirst: true, partner: null });
        pairRange(1, n - 1, keys);
      }
    }
  });

  // ── PASSO 4: CANALETA — converter extremos expostos ────────────────────
  //
  // Regras (Bruno, mar/2026):
  //   • ponta livre (free end)        → corte-especial
  //   • adjacente a abertura          → corte-especial
  //   • exatamente na quina (canto L) → corte-especial
  //
  // Implementação: só marcar quando NÃO há célula ativa além do endpoint
  // na direção do run (!active.has(bk)).
  //
  // Isso corrige o bug do canto L: D (abaixo do nó A, dir=V) tinha
  // hasPrev=false porque A tem dir=H. A função shouldConvert anterior
  // verificava se A é T-main-wall → não é (A é endpoint de H) → retornava
  // true, marcando D erroneamente. Nova regra: A está em active → não marca D.
  // Só A é marcado (como nó da quina, pois antes dele não há nada ativo). ✓
  //
  // T-arm-end: parede principal está em active → não marca o braço. ✓
  // Abertura: célula removida do active → canaleta adjacente marcada. ✓
  //
  // Propagação para o parceiro é feita no Passo 5.
  const nothingBeyond = (col, row, dir, fwd) => {
    const bk = dir === 'H' ? (fwd ? kk(col + 1, row) : kk(col - 1, row))
                            : (fwd ? kk(col, row + 1) : kk(col, row - 1));
    return !active.has(bk);
  };

  const canalToTijolo = new Set();
  active.forEach((c, k) => {
    if (!c.canal) return;
    const prevK = c.dir === 'H' ? kk(c.col - 1, c.row) : kk(c.col, c.row - 1);
    const nextK = c.dir === 'H' ? kk(c.col + 1, c.row) : kk(c.col, c.row + 1);
    const hasPrev = active.has(prevK) && active.get(prevK).dir === c.dir;
    const hasNext = active.has(nextK) && active.get(nextK).dir === c.dir;
    if (!hasPrev && nothingBeyond(c.col, c.row, c.dir, false)) canalToTijolo.add(k);
    if (!hasNext && nothingBeyond(c.col, c.row, c.dir, true))  canalToTijolo.add(k);
  });

  // ── PASSO 4.5: VERGA — propagar canal para parceiro ───────────────────
  // Se uma célula de extensão de verga está pareada, o tijolo inteiro vira canaleta.
  vergaCells.forEach(k => {
    const pi = pairInfo.get(k);
    if (pi && pi.partner) {
      const pc = active.get(pi.partner);
      if (pc) pc.canal = true;
    }
  });

  // ── PASSO 5: EMIT ─────────────────────────────────────────────────────
  // Prioridade: slopecut > grampocut > canalToTijolo > canal > normal
  // Propagar para parceiro (tijolo é unidade).
  active.forEach((c, k) => {
    const pi = pairInfo.get(k) || { isFirst: true, partner: null };
    const isPaired = pi.partner !== null;
    const partnerCell = isPaired ? active.get(pi.partner) : null;
    const isSlopeCut  = c.slopecut  || (partnerCell && partnerCell.slopecut);
    const isGrampoCut = c.grampocut || (partnerCell && partnerCell.grampocut);
    const isBoxCut    = c.boxcut    || (partnerCell && partnerCell.boxcut);
    const forceNormal = canalToTijolo.has(k) ||
                        (isPaired && canalToTijolo.has(pi.partner));
    const effectiveCanal = c.canal && !forceNormal && !isSlopeCut && !isGrampoCut && !isBoxCut;
    let type;
    if (isSlopeCut || isGrampoCut || isBoxCut) {
      type = isPaired ? 'corte-especial' : 'meio-corte';
    } else if (effectiveCanal) {
      type = isPaired ? 'canaleta' : 'meia-canaleta';
    } else if (forceNormal) {
      type = isPaired ? 'corte-especial' : 'meio-corte';
    } else {
      type = isPaired ? 'tijolo' : 'meio-tijolo';
    }
    // wasCanal: corte-especial que veio de canaleta via forceNormal (ex: canalToTijolo) → ainda tem canal
    // Não inclui isBoxCut: caixas elétricas e terminais hidráulicos ocupam a célula, sem canal de graute
    const wasCanal = forceNormal && (c.canal || (partnerCell && partnerCell.canal));
    result.set(k, { type, dir: c.dir, isFirst: pi.isFirst, partner: pi.partner, isGrampo: isGrampoCut, wasCanal });
  });

  return result;
}



// ═══════════════════════════════════════════════════
// ELEVATION ENGINE
// ═══════════════════════════════════════════════════

// elevPicking: true = mostrar planta com botões por run
//              false = mostrar elevação do run selecionado
let elevPicking = true;