import { S } from '../core/state.js';
import { CELL, BRICK_C, GROUT_C, REBAR_C, EBOX_TYPES } from '../constants.js';
import { bricks, kk, getCellH } from '../core/history.js';
import { analyzeCourse, computeGrauteCells, computeGrampos, globalCanalCourses, grampoLenM, countGrampos } from '../engine/modulation.js';
import { CONDUIT_CFG } from '../engine/conduits.js';
import { draw2d } from './draw2d.js';

// ═══════════════════════════════════════════════════
// Modo 3D
// ═══════════════════════════════════════════════════
// Modo 3D
export function init3d(){
  const div=document.getElementById('div3d'),W=div.offsetWidth,H=div.offsetHeight;
  if(S.r3){S.r3.setSize(W,H);S.c3.aspect=W/H;S.c3.updateProjectionMatrix();return;}
  S.r3=new THREE.WebGLRenderer({antialias:true});S.r3.setPixelRatio(Math.min(window.devicePixelRatio,2));
  S.r3.setSize(W,H);S.r3.setClearColor(0x87CEEB,1);S.r3.shadowMap.enabled=false;
  S.r3.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;';
  div.insertBefore(S.r3.domElement,document.getElementById('hint3d'));
  S.s3=new THREE.Scene();S.c3=new THREE.PerspectiveCamera(50,W/H,0.05,500);
  S.s3.add(new THREE.AmbientLight(0xffffff,.55));
  const sun=new THREE.DirectionalLight(0xfffbe6,1.1);sun.position.set(10,20,8);sun.castShadow=false;S.s3.add(sun);
  const fill=new THREE.DirectionalLight(0xc8e0ff,.3);fill.position.set(-8,5,-5);S.s3.add(fill);
  S.r3.domElement.addEventListener('mousedown',e=>{S.m3.lb=e.button===0;S.m3.rb=e.button===2;S.m3.x=e.clientX;S.m3.y=e.clientY;e.preventDefault();});
  S.r3.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  S.r3.domElement.addEventListener('wheel',e=>{e.preventDefault();S.rad3*=e.deltaY>0?1.1:.9;S.rad3=Math.max(.5,Math.min(120,S.rad3));},{passive:false});

  // 3D touch
  let t3={dist:0,x:0,y:0,two:false};
  S.r3.domElement.addEventListener('touchstart',e=>{
    e.preventDefault();
    if(e.touches.length===2){t3.two=true;t3.dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
    else{t3.two=false;t3.x=e.touches[0].clientX;t3.y=e.touches[0].clientY;}
  },{passive:false});
  S.r3.domElement.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(t3.two&&e.touches.length===2){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      S.rad3*=t3.dist/d; S.rad3=Math.max(.5,Math.min(120,S.rad3)); t3.dist=d;
    } else if(!t3.two&&e.touches.length===1){
      const dx=e.touches[0].clientX-t3.x, dy=e.touches[0].clientY-t3.y;
      S.th3-=dx*.008; S.ph3-=dy*.008;
      t3.x=e.touches[0].clientX; t3.y=e.touches[0].clientY;
    }
  },{passive:false});
  S.r3.domElement.addEventListener('touchend',e=>{if(e.touches.length<2)t3.two=false;},{passive:false});
  (function loop(){
    S.animId3=requestAnimationFrame(loop);
    if(!S.is3d||!S.r3||!S.s3||!S.c3)return;
    S.ph3=Math.max(.05,Math.min(Math.PI/2-.01,S.ph3));
    S.c3.position.set(S.tgt3x+S.rad3*Math.sin(S.ph3)*Math.sin(S.th3),S.tgt3y+S.rad3*Math.cos(S.ph3),S.tgt3z+S.rad3*Math.sin(S.ph3)*Math.cos(S.th3));
    S.c3.lookAt(S.tgt3x,S.tgt3y,S.tgt3z);
    S.r3.render(S.s3,S.c3);
  })();
}

window.addEventListener('mousemove',e=>{if(!S.is3d||(!S.m3.lb&&!S.m3.rb))return;const dx=e.clientX-S.m3.x,dy=e.clientY-S.m3.y;S.m3.x=e.clientX;S.m3.y=e.clientY;if(S.m3.lb){S.th3-=dx*.008;S.ph3-=dy*.008;}else if(S.m3.rb){const rx=Math.cos(S.th3),rz=-Math.sin(S.th3),spd=S.rad3*.0012;S.tgt3x-=rx*dx*spd;S.tgt3z-=rz*dx*spd;S.tgt3y+=dy*spd;}});
window.addEventListener('mouseup',()=>{S.m3.lb=false;S.m3.rb=false;});

export function build3d(skipCameraReset=false){
  if(!S.s3)return;
  const rem=[];S.s3.children.forEach(c=>{if(c.userData.dyn)rem.push(c);});
  rem.forEach(c=>{S.s3.remove(c);if(c.geometry)c.geometry.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose();}});
  S.brickInstMap=new Map();

  const fl=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshLambertMaterial({color:0x888888}));
  fl.rotation.x=-Math.PI/2;fl.userData.dyn=true;S.s3.add(fl);

  const br=bricks();if(!br.size)return;

  const w=S.cellCm/100, bh=S.brickHCm/100, g=0.003;
  const maxC=maxCourses();

  if(!skipCameraReset){
    let sumC=0,sumR=0,sumH=0;
    br.forEach(k=>{const[c,r]=k.split(',').map(Number);sumC+=c;sumR+=r;sumH+=getCellH(k)/100;});
    const cx=(sumC/br.size+.5)*w,cz=(sumR/br.size+.5)*w,avgH=sumH/br.size;
    S.tgt3x=cx;S.tgt3y=avgH/2;S.tgt3z=cz;
    S.rad3=Math.max(5,Math.max(1,Math.sqrt(br.size))*w*3.5+avgH*1.8);
  }

  const TYPE_HEX={'tijolo':0xB5541A,'meio-tijolo':0x6B2810,'canaleta':0x4A7C3F,'meia-canaleta':0x2D5A27,'corte-especial':0x7B2D8B,'meio-corte':0x4A1A55};
  const mats={};
  Object.entries(TYPE_HEX).forEach(([t,c])=>mats[t]=new THREE.MeshLambertMaterial({
    color:c,
    transparent: S.brick3dOpacity < 1,
    opacity: S.brick3dOpacity,
    depthWrite: S.brick3dOpacity >= 1,
  }));
  const outlineMat=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.BackSide,
    transparent: S.brick3dOpacity < 1, opacity: S.brick3dOpacity * 0.7, depthWrite: S.brick3dOpacity >= 1});

  const ofs=0.007;
  const geos ={half:new THREE.BoxGeometry(w-g,bh-g,w-g),fullH:new THREE.BoxGeometry(2*w-g,bh-g,w-g),fullV:new THREE.BoxGeometry(w-g,bh-g,2*w-g)};
  const ogeos={half:new THREE.BoxGeometry(w-g+ofs,bh-g+ofs,w-g+ofs),fullH:new THREE.BoxGeometry(2*w-g+ofs,bh-g+ofs,w-g+ofs),fullV:new THREE.BoxGeometry(w-g+ofs,bh-g+ofs,2*w-g+ofs)};

  const buckets={};
  const dummy=new THREE.Object3D();

  for(let cIdx=0;cIdx<maxC;cIdx++){
    const courseData=analyzeCourse(cIdx);
    const yc=cIdx*bh+bh/2;
    courseData.forEach((info,k)=>{
      if(!info||!info.isFirst)return;
      const[col,row]=k.split(',').map(Number);
      let px,pz,shape;
      if(info.partner){
        const[pc,pr]=info.partner.split(',').map(Number);
        px=(col+pc+1)/2*w;pz=(row+pr+1)/2*w;
        shape=(pc!==col)?'fullH':'fullV';
      }else{px=(col+.5)*w;pz=(row+.5)*w;shape='half';}
      const target=buckets;
      const bk=`${info.type}:${shape}`;
      if(!target[bk])target[bk]=[];
      target[bk].push({x:px,y:yc,z:pz,brickKey:k,cIdx});
    });
  }

  const addMeshes=(src,matFn)=>{
    Object.entries(src).forEach(([bk,cells])=>{
      if(!cells.length)return;
      const[type,shape]=bk.split(':');
      const mat=matFn(type);
      const mesh=new THREE.InstancedMesh(geos[shape],mat,cells.length);
      mesh.userData.dyn=true;
      cells.forEach((c,i)=>{dummy.position.set(c.x,c.y,c.z);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.instanceMatrix.needsUpdate=true;S.s3.add(mesh);
      S.brickInstMap.set(mesh,cells.map(c=>({brickKey:c.brickKey,cIdx:c.cIdx})));
      const outline=new THREE.InstancedMesh(ogeos[shape],outlineMat,cells.length);
      outline.userData.dyn=true;
      cells.forEach((c,i)=>{dummy.position.set(c.x,c.y,c.z);dummy.updateMatrix();outline.setMatrixAt(i,dummy.matrix);});
      outline.instanceMatrix.needsUpdate=true;S.s3.add(outline);
    });
  };

  addMeshes(buckets, type=>mats[type]);

  // ── Graute das canaletas e corte-especial wasCanal (3D) ─────────────────
  // Corte-especial que veio de canaleta também recebe o bloco de graute do canal
  {
    const canalW3  = w * 0.60;
    const canalD3  = w * 0.55;
    const canalH3b = bh * 0.44;
    const groutMatCE = new THREE.MeshLambertMaterial({
      color: 0x333333,
      transparent: S.infra3dOpacity < 1,
      opacity: S.infra3dOpacity,
      depthWrite: true,
    });
    for(let cIdx=0;cIdx<maxC;cIdx++){
      const cd=analyzeCourse(cIdx);
      const drawn=new Set();
      cd.forEach((info,k)=>{
        if(!info||!info.isFirst) return;
        if(info.type!=='corte-especial'&&info.type!=='meio-corte') return;
        if(!info.wasCanal) return;
        if(drawn.has(k)) return;
        const[col,row]=k.split(',').map(Number);
        let px,pz,geoW,geoD;
        if(info.partner){
          const[pc,pr]=info.partner.split(',').map(Number);
          drawn.add(info.partner);
          px=(col+pc+1)/2*w; pz=(row+pr+1)/2*w;
          if(pc!==col){ geoW=2*w-0.002; geoD=canalD3; }
          else         { geoW=canalD3;   geoD=2*w-0.002; }
        } else {
          px=(col+0.5)*w; pz=(row+0.5)*w;
          geoW=canalD3; geoD=canalD3;
        }
        drawn.add(k);
        const geo=new THREE.BoxGeometry(geoW,canalH3b,geoD);
        const mesh=new THREE.Mesh(geo,groutMatCE);
        mesh.position.set(px, cIdx*bh+bh-canalH3b/2, pz);
        mesh.userData.dyn=true; S.s3.add(mesh);
      });
    }
  }

  // ── Grampos U em 3D ─────────────────────────────────────────────────────
  // Para cada grampo, desenhar um tubo em U na fiada correspondente.
  {
    const gc1_3d = Math.floor(GRAMPO_H1 / S.brickHCm);
    const gc2_3d = Math.floor(GRAMPO_H2 / S.brickHCm);
    const gc3_3d = Math.floor(GRAMPO_H3 / S.brickHCm);
    const gc4_3d = Math.floor(GRAMPO_H4 / S.brickHCm);
    const grampoMat = new THREE.MeshLambertMaterial({color:0x222222,
      transparent: S.infra3dOpacity < 1, opacity: S.infra3dOpacity, depthWrite: true});
    const rebar3dR = (S.cellCm === 15 ? 0.045 : 0.030);

    [gc1_3d, gc2_3d, gc3_3d, gc4_3d].forEach(cIdx => {
      if(cIdx < 0) return;
      const yTop = cIdx * bh + bh; // topo da fiada (onde o U fica)
      computeGrampos().forEach(g => {
        if(g.cells.length < 2) return;
        const k0=g.cells[0], k1=g.cells[1];
        if(!br.has(k0)||!br.has(k1)) return;
        const [c0,r0]=k0.split(',').map(Number);
        const [c1,r1]=k1.split(',').map(Number);
        const x0=(c0+0.5)*w, z0=(r0+0.5)*w;
        const x1=(c1+0.5)*w, z1=(r1+0.5)*w;
        const midX=(x0+x1)/2, midZ=(z0+z1)/2;
        const ySeat = yTop - 0.01; // levemente abaixo do topo da fiada

        // Perna 1
        const leg1Geo = new THREE.CylinderGeometry(rebar3dR,rebar3dR,bh*0.85,6);
        const leg1 = new THREE.Mesh(leg1Geo,grampoMat);
        leg1.position.set(x0, ySeat-bh*0.425, z0);
        leg1.userData.dyn=true; S.s3.add(leg1);

        // Perna 2
        const leg2Geo = new THREE.CylinderGeometry(rebar3dR,rebar3dR,bh*0.85,6);
        const leg2 = new THREE.Mesh(leg2Geo,grampoMat);
        leg2.position.set(x1, ySeat-bh*0.425, z1);
        leg2.userData.dyn=true; S.s3.add(leg2);

        // Ponte do U (reta entre os dois furos)
        const bridgeLen = Math.sqrt((x1-x0)**2+(z1-z0)**2);
        const bridgeGeo = new THREE.CylinderGeometry(rebar3dR,rebar3dR,bridgeLen,6);
        const bridge = new THREE.Mesh(bridgeGeo,grampoMat);
        bridge.position.set(midX, ySeat, midZ);
        // Rotacionar para horizontal na direção correta
        const angle = Math.atan2(z1-z0, x1-x0);
        bridge.rotation.z = Math.PI/2;
        bridge.rotation.y = -angle;
        bridge.userData.dyn=true; S.s3.add(bridge);
      });
    });
  }

  // ── Prumadas elétricas e hidráulicas (3D) ──────────────────────────
  {
    // Materiais gerados dinamicamente via CONDUIT_CFG — um por ctype
    const infraMats = {};
    Object.entries(CONDUIT_CFG).forEach(([ctype,cfg])=>{
      infraMats[ctype]=new THREE.MeshLambertMaterial({
        color:cfg.color3d, transparent:S.infra3dOpacity<1,
        opacity:S.infra3dOpacity, depthWrite:true
      });
    });
    // S.manualElec/Water → vertical cylinders full height (legado, cor elec)
    const infraR = CONDUIT_CFG.elec.radius3d;
    [[S.manualElec,'elec'],[S.manualWater,'elec']].forEach(([mset,type])=>{
      mset.forEach(k=>{
        if(!br.has(k)) return;
        const [col,row]=k.split(',').map(Number);
        const cellH=getCellH(k)/100;
        const px=(col+0.5)*w, pz=(row+0.5)*w;
        const geo=new THREE.CylinderGeometry(infraR,infraR,cellH,8);
        const mesh=new THREE.Mesh(geo,infraMats[type]);
        mesh.position.set(px,cellH/2,pz);
        mesh.userData.dyn=true; S.s3.add(mesh);
      });
    });

    // Conduit V: vertical cylinder from box height to top/base
    // Conduit H: horizontal bar at box height between the two box positions
    S.conduits.forEach(cd=>{
      if(!br.has(cd.fromKey)) return;
      const cfg=_conduitCfg(cd.ctype);
      const mat=infraMats[cd.ctype]||infraMats.elec;
      const r=cfg.radius3d;
      const[fc,fr]=cd.fromKey.split(',').map(Number);
      const arrF=cfg.termMap().get(cd.fromKey);
      const boxHm=(arrF&&arrF.length?arrF[0].heightCm:0)/100;

      if(cd.axis==='Z'){
        const fromHm=(cd.fromHeightCm??0)/100;
        const toHm=(cd.toHeightCm??getCellH(cd.fromKey))/100;
        const yBot=Math.max(fromHm,toHm), yTop=Math.min(fromHm,toHm);
        const h=Math.max(0.01,yBot-yTop);
        const geo=new THREE.CylinderGeometry(r,r,h,8);
        const mesh=new THREE.Mesh(geo,mat);
        mesh.position.set((fc+0.5)*w, yTop+h/2, (fr+0.5)*w);
        mesh.userData.dyn=true; S.s3.add(mesh);
      } else {
        const addSegment=(ax1,az1,ax2,az2,y)=>{
          const dx=ax2-ax1, dz=az2-az1;
          const dist=Math.sqrt(dx*dx+dz*dz);
          if(dist<0.001) return;
          const geo=new THREE.CylinderGeometry(r*0.7,r*0.7,dist,8);
          const mesh=new THREE.Mesh(geo,mat);
          mesh.position.set((ax1+ax2)/2, y, (az1+az2)/2);
          mesh.rotation.z=Math.PI/2;
          mesh.rotation.y=-Math.atan2(dz,dx);
          mesh.userData.dyn=true; S.s3.add(mesh);
        };
        const yH=boxHm;
        cd.path.forEach((p,i)=>{
          if(i===0) return;
          const prev=cd.path[i-1];
          addSegment((prev.col+0.5)*w,(prev.row+0.5)*w,(p.col+0.5)*w,(p.row+0.5)*w,yH);
        });
      }
    });
  }

  // ── Caixas elétricas (3D) — paralelepípedo embutido na parede ──
  {
    const eboxMat3d = new THREE.MeshBasicMaterial({color:0xF5C800, side:THREE.DoubleSide, depthWrite:false});
    const eboxBorderMat = new THREE.LineBasicMaterial({color:0x886600, depthWrite:false});
    S.elecBoxes.forEach((arr, k)=>{
      if(!br.has(k)) return;
      const [col,row]=k.split(',').map(Number);
      const hL=br.has(kk(col-1,row)),hR=br.has(kk(col+1,row));
      const isH=(hL||hR);
      const px=(col+0.5)*w, pz=(row+0.5)*w;
      const faceEdge = w/2;

      arr.forEach(eb=>{
        const ebW=eb.wCm/100, ebHh=eb.hCm/100;
        const depth=(EBOX_TYPES[eb.type]?.depthCm||5)/100;
        const yc=eb.heightCm/100;

        // BoxGeometry: ebW × ebHh × depth
        // A face externa fica rente à superfície da parede;
        // a profundidade (depth) entra para dentro da parede.
        const geo = new THREE.BoxGeometry(ebW, ebHh, depth);
        const mesh = new THREE.Mesh(geo, eboxMat3d);

        if(isH){
          const fz = pz - eb.face * (faceEdge - depth/2);
          mesh.position.set(px, yc, fz);
          mesh.rotation.y = eb.face > 0 ? 0 : Math.PI;
        } else {

export function resize3d(){
  if(!S.r3)return;
  const div=document.getElementById('div3d'),W=div.offsetWidth,H=div.offsetHeight;
  if(!W||!H)return;
  S.r3.setSize(W,H);S.c3.aspect=W/H;S.c3.updateProjectionMatrix();
}
