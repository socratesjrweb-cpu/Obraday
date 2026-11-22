// documentos-sobrepor.js — a SOBREPOSIÇÃO da Compatibilização (04/11): pranchas de disciplinas diferentes, uma em
// cima da outra, para achar interferências (clashes).
//
//   · cada CAMADA é uma prancha (PDF) desenhada pelo pdf.js; o branco do papel vira transparente e as linhas ganham a COR
//     da disciplina (ou ficam na cor original) — assim uma não esconde a outra; cada camada tem transparência própria;
//   · a 1ª camada é a BASE (a referência). As outras se encaixam nela: de início pela largura da folha e, para valer,
//     pelo ALINHAMENTO DE 2 PONTOS (o mesmo ponto nas duas, ex.: cruzamento dos eixos A-1 e D-5) — corrige escala, giro e
//     deslocamento entre escritórios diferentes. O alinhamento fica gravado para a obra;
//   · ✋ AJUSTAR NA MÃO (05/11 — a calibração por pontos não serviu): arrastar a prancha com o mouse em
//     cima da base, barra de ESCALA e de GIRO (com ajuste fino) e setas do teclado. Gravado, o ajuste vale para o par e,
//     pela conta, para qualquer outra base já ajustada com a mesma referência (A→B e A→C dão B→C sem ajustar de novo).
//     Sem ajuste, a camada entra pela largura da folha (calibrações antigas, se houver, ainda valem);
//   · 💥 CLASH: clicar no ponto do desenho; o alfinete guarda o ponto e a VISTA (camadas, cores e transparências), como os
//     "viewpoints" dos programas de BIM — clicar no alfinete ou no chat volta exatamente àquela vista.
// Este arquivo só monta texto (CSS e o script que roda no navegador). Os dados vêm de documentos.js.

export const SOBREPOR_CSS = `<style>
.cp-camadas{background:#1d1d22;color:#ddd;padding:6px 9px;display:flex;flex-direction:column;gap:5px;max-height:34vh;overflow:auto}
.cp-cam{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px}
.cp-cam select,.cp-cam button,.cp-add select{border:1px solid #3a3a42;background:#2a2a30;color:#eee;border-radius:7px;padding:3px 6px;font-size:12px;font-family:inherit;cursor:pointer;max-width:260px}
.cp-cam input[type=range]{width:90px;accent-color:var(--acento)}.cp-cam .pct{width:34px;text-align:right;font-variant-numeric:tabular-nums;color:#bbb}
.cp-cor{width:16px;height:16px;border-radius:4px;border:1px solid #555;flex:none}.cp-base{font-size:10px;font-weight:800;background:var(--acento);color:#111;border-radius:5px;padding:1px 5px}
.cp-cam.off{opacity:.5}.cp-add{display:flex;gap:6px;align-items:center;font-size:12px;color:#aaa}
.cp-area{flex:1;overflow:auto;background:#6b6e74;position:relative;cursor:grab;touch-action:none}.cp-area.arrasta{cursor:grabbing}.cp-area.mira{cursor:crosshair}
.cp-palco{position:relative;margin:18px;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.35)}
.cp-mundo{position:absolute;left:0;top:0;transform-origin:0 0}.cp-mundo canvas{position:absolute;left:0;top:0;transform-origin:0 0}
.cp-pins{position:absolute;inset:0;pointer-events:none}
.cp-pin{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;background:#c0392b;color:#fff;border:2px solid #fff;border-radius:12px 12px 12px 2px;
  font-size:11px;font-weight:800;padding:2px 6px;box-shadow:0 2px 6px rgba(0,0,0,.4);white-space:nowrap}
.cp-pin.ok{background:#3f9a4a}.cp-pin.novo{background:var(--acento);color:#111}.cp-pin.ativo{outline:3px solid var(--acento);z-index:2}
.cp-alvo{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #e02424;border-radius:50%;pointer-events:none;box-shadow:0 0 0 2px #fff}
.cp-msg{color:#eee;padding:30px;font-size:13px}
.cp-area.movel{cursor:move}
.vw-banner.cp-ajbar{display:flex;flex-direction:column;gap:6px;align-items:stretch;background:#24242a;color:#eee;border-bottom:2px solid var(--acento)}
.cp-ajbar .l{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px}.cp-ajbar .l>b:first-child{width:52px;color:#e9d49a}
.cp-ajbar button{border:1px solid #44444c;background:#2f2f36;color:#eee;border-radius:7px;padding:3px 8px;font-size:12px;font-family:inherit;cursor:pointer}
.cp-ajbar button.p{background:var(--acento);color:#111;border-color:var(--acento);font-weight:800}
.cp-ajbar input[type=range]{flex:1;min-width:140px;accent-color:var(--acento)}.cp-ajbar input.n{width:76px;border:1px solid #44444c;background:#111;color:#eee;border-radius:6px;padding:3px 6px;font-size:12px;font-family:inherit;text-align:right}
.cp-ajbar .dica{color:#aaa;font-size:11.5px}
.cp-ref{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:#ddd;border-bottom:1px solid #34343c;padding-bottom:5px}
.cp-ref b{color:#e9d49a}.cp-ref button{border:1px solid #3a3a42;background:#2a2a30;color:#eee;border-radius:7px;padding:2px 7px;font-size:12px;font-family:inherit;cursor:pointer}
.cp-ref form{display:flex;flex-wrap:wrap;gap:6px;align-items:center;width:100%}.cp-ref input{border:1px solid #3a3a42;background:#111;color:#eee;border-radius:6px;padding:3px 6px;font-size:12px;font-family:inherit;width:140px}
.cp-ref input.m{width:80px}.cp-ok{color:#9fd08f}.cp-av{color:#f1c76b}.cp-sem{color:#f0a3a3}
.cp-mk{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:none}.cp-mk:before,.cp-mk:after{content:"";position:absolute;background:#0a7f8a}
.cp-mk:before{left:10px;top:0;width:2px;height:22px}.cp-mk:after{top:10px;left:0;height:2px;width:22px}.cp-mk span{position:absolute;left:14px;top:-16px;font:800 11px/1 sans-serif;color:#fff;background:#0a7f8a;border-radius:4px;padding:2px 4px;white-space:nowrap}
.cp-regua{position:absolute;height:2px;background:#0a7f8a;transform-origin:0 50%;pointer-events:none;box-shadow:0 0 0 1px #fff}
.cp-regua span{position:absolute;left:50%;top:-22px;transform:translateX(-50%);background:#0a7f8a;color:#fff;font:800 12px/1 sans-serif;padding:3px 6px;border-radius:5px;white-space:nowrap}
.cl-card{margin-top:7px;border:1px solid #f1c3b2;background:#fff6f2;border-radius:10px;padding:7px 9px;font-size:12.5px}
.cl-card b.n{font-family:ui-monospace,Menlo,monospace;background:#a3361b;color:#fff;border-radius:6px;padding:0 6px;margin-right:4px}
.cl-card.ok{border-color:#b9dcae;background:#f1f9ee}.cl-card.ok b.n{background:#3f9a4a}
.cl-grav{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;margin-left:4px}
.cl-form{display:none;border:1px solid #f1c3b2;background:#fff6f2;border-radius:10px;padding:8px;margin-bottom:6px;font-size:12px}.cl-form.on{display:block}
.cl-form .lin{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:5px}.cl-form input[type=text],.cl-form select{padding:5px 7px;border:1px solid #ddd8c8;border-radius:7px;font-size:12.5px;font-family:inherit}
.cl-form label.dz{display:inline-flex;gap:3px;align-items:center;border:1px solid #e6d3c9;background:#fff;border-radius:7px;padding:3px 6px;cursor:pointer}
.mx{border-collapse:collapse;font-size:12px;margin:4px auto}.mx th,.mx td{border:1px solid #efeade;padding:5px 7px;text-align:center}.mx th{background:#f6f3ea;font-size:11px}
.mx td.z{color:#ccc}.mx td.t{background:#fde2d6;font-weight:800;color:#a3361b}.mx td.r{background:#f1f9ee;color:#3f7a3a}
</style>`;

const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

/** cfg = { obra, base (endereço da página), docs: [{id, cod, disc, cor, url}], ordemDisc, alinh: {chave: [a,b,c,d,e,f]}, clashes: [{id, n, x, y, ok, titulo, vista}],
 *  podeAlinhar, iniciais: [docId] } */
export const sobreporScript = cfg => `<script src="/assets/pdfjs-3.11.174.min.js"></script><script>window.COMPAT=${json(cfg)};</script><script>${CODIGO}</script>`;

const CODIGO = `(function(){
var C=window.COMPAT, $=function(i){return document.getElementById(i);}, area=$('cpArea'), palco=$('cpPalco'), mundo=$('cpMundo'), pinsBox=$('cpPins'), banner=$('vwBanner');
pdfjsLib.GlobalWorkerOptions.workerSrc='/assets/pdfjs-3.11.174.worker.min.js';
var LADO=5000, AREA=30e6, zoom=0.2, cams=[], base=null, modo=null, alin=null, novoClash=null, ativo=null;
function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function docDe(id){ return C.docs.filter(function(d){return d.id===id;})[0]; }
var SS=(function(){ try{ var s=window.sessionStorage; s.getItem('x'); return s; }catch(e){ return null; } })(), CH='cp-'+C.obra+(C.local?'-'+C.local:'');
// camada ainda abrindo: não guarda pela metade
function guarda(){ if(!SS||cams.some(function(c){ return !c.pronta&&!c.erro; })) return; try{ SS.setItem(CH,JSON.stringify({z:zoom,x:area.scrollLeft,y:area.scrollTop,cams:cams.map(function(c){ return {id:c.doc.id,op:c.op,cor:c.corOn,vis:c.vis}; })})); }catch(e){} }
function lido(){ try{ return JSON.parse((SS&&SS.getItem(CH))||'null'); }catch(e){ return null; } }
window.addEventListener('beforeunload',guarda);

// ---------- camadas ----------
function chaveAlin(b,c){ return b.doc.chave+'>'+c.doc.chave; }
function Tpadrao(c){ if(c===base||!base) return [1,0,0,1,0,0]; var s=base.w/c.w; return [s,0,0,s,0,0]; }
function calDe(c){ return c&&C.calib&&C.calib[c.doc.chave]; }
// semelhança (escala + giro + deslocamento) que leva Q1→P1 e Q2→P2
function semelhanca(P1,P2,Q1,Q2){ var dp=[P2[0]-P1[0],P2[1]-P1[1]], dq=[Q2[0]-Q1[0],Q2[1]-Q1[1]], lq=Math.hypot(dq[0],dq[1]); if(lq<1e-6) return null;
  var s=Math.hypot(dp[0],dp[1])/lq, ang=Math.atan2(dp[1],dp[0])-Math.atan2(dq[1],dq[0]), a=s*Math.cos(ang), b=s*Math.sin(ang);
  return [a,b,-b,a,P1[0]-(a*Q1[0]-b*Q1[1]),P1[1]-(b*Q1[0]+a*Q1[1])]; }
// matrizes do CSS [a,b,c,d,e,f]: x'=a·x+c·y+e, y'=b·x+d·y+f. mul(A,B) = primeiro B, depois A.
function mul(A,B){ return [A[0]*B[0]+A[2]*B[1],A[1]*B[0]+A[3]*B[1],A[0]*B[2]+A[2]*B[3],A[1]*B[2]+A[3]*B[3],A[0]*B[4]+A[2]*B[5]+A[4],A[1]*B[4]+A[3]*B[5]+A[5]]; }
function inv(T){ var a=T[0],b=T[1],c=T[2],d=T[3],e=T[4],f=T[5],det=a*d-b*c; return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det]; }
// o encaixe da prancha Y na prancha X (leva coordenadas de Y para X): gravado direto, ao contrário, ou pela conta via uma 3ª
function parT(X,Y){ var A=C.alinh, d=A[X+'>'+Y]; if(d) return d; if(A[Y+'>'+X]) return inv(A[Y+'>'+X]);
  var ks=Object.keys(A); for(var i=0;i<ks.length;i++){ var p=ks[i].split('>'); if(p[1]===X&&A[p[0]+'>'+Y]) return mul(inv(A[ks[i]]),A[p[0]+'>'+Y]); }
  return null; }
function Tde(c){ if(c===base) return [1,0,0,1,0,0]; var t=parT(base.doc.chave,c.doc.chave); if(t) return t;
  var kb=calDe(base), kc=calDe(c); if(kb&&kc){ var T=semelhanca(kb.p1,kb.p2,kc.p1,kc.p2); if(T) return T; }
  return Tpadrao(c); }
function aplicaT(c){ var T=c.T=Tde(c); c.cv.style.transform='matrix('+T.join(',')+')'; }
function reencaixa(){ cams.forEach(function(c){ if(c.pronta) aplicaT(c); }); pinos(); }
function modoDe(c){ if(c===base) return 'base'; return parT(base.doc.chave,c.doc.chave)?'aj':calDe(base)&&calDe(c)?'cal':'folha'; }
// metros por unidade da BASE (precisa da base calibrada e da distância real)
function mPorUn(){ var k=calDe(base); if(!k||!C.ref||!C.ref.dist) return null; var l=Math.hypot(k.p2[0]-k.p1[0],k.p2[1]-k.p1[1]); return l>0?C.ref.dist/l:null; }
function carrega(doc,op,corOn,vis){
  var c={doc:doc,op:op==null?(cams.length?0.65:1):op,corOn:corOn==null?true:corOn,vis:vis==null?true:vis,cv:document.createElement('canvas'),w:0,h:0,pronta:false};
  cams.push(c); mundo.appendChild(c.cv); desenhaLista();
  return pdfjsLib.getDocument({url:doc.url}).promise.then(function(pdf){ return pdf.getPage(1); }).then(function(pg){
    var vp=pg.getViewport({scale:1}); c.w=vp.width; c.h=vp.height; c.pg=pg; if(!base){ base=c; tamPalco(); }
    var s=Math.min(LADO/Math.max(c.w,c.h), Math.sqrt(AREA/(c.w*c.h))), v=pg.getViewport({scale:s}), tmp=document.createElement('canvas');
    tmp.width=Math.round(v.width); tmp.height=Math.round(v.height);
    return pg.render({canvasContext:tmp.getContext('2d'),viewport:v,intent:'print'}).promise.then(function(){ c.orig=tmp; pinta(c); c.pronta=true; aplicaT(c); visual(c); desenhaLista(); });
  }).catch(function(e){ c.erro=e.message; desenhaLista(); });
}
// o branco some (vira transparente) e as linhas ficam na cor da disciplina — ou na cor original
function pinta(c){
  var o=c.orig, cv=c.cv; cv.width=o.width; cv.height=o.height; cv.style.width=c.w+'px'; cv.style.height=c.h+'px';
  var x=cv.getContext('2d'); x.clearRect(0,0,cv.width,cv.height); x.drawImage(o,0,0); var im=x.getImageData(0,0,cv.width,cv.height), p=im.data, k=hex(c.doc.cor);
  for(var i=0;i<p.length;i+=4){ var mn=Math.min(p[i],p[i+1],p[i+2]); p[i+3]=255-mn; if(c.corOn){ p[i]=k[0]; p[i+1]=k[1]; p[i+2]=k[2]; } }
  x.putImageData(im,0,0);
}
function hex(h){ return [parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]; }
function visual(c){ c.cv.style.opacity=c.op; c.cv.style.display=c.vis?'block':'none'; }
function tira(i){ var c=cams[i]; if(c===base){ alert('A base não sai: troque a base escolhendo outra prancha nela.'); return; } mundo.removeChild(c.cv); cams.splice(i,1); desenhaLista(); }
function trocaBase(id){ if(aj) fimAj(true); cams.forEach(function(c){ mundo.removeChild(c.cv); }); var resto=cams.filter(function(c){return c.doc.id!==id;}).map(function(c){return c.doc.id;}); cams=[]; base=null;
  carrega(docDe(id),1,false,true).then(function(){ resto.forEach(function(r){ carrega(docDe(r)); }); }); }
function desenhaLista(){
  var box=$('cpCamadas'); box.innerHTML='';
  cams.forEach(function(c,i){
    var row=document.createElement('div'); row.className='cp-cam'+(c.vis?'':' off');
    row.innerHTML='<input type="checkbox" '+(c.vis?'checked':'')+' title="mostrar">'+'<span class="cp-cor" style="background:'+(c.corOn?c.doc.cor:'linear-gradient(135deg,#222 50%,#fff 50%)')+'"></span>'
      +(c===base?'<span class="cp-base">BASE</span>':'')+'<b style="font-family:ui-monospace,Menlo,monospace">'+esc(c.doc.cod)+'</b>'
      +'<input type="range" min="0" max="100" value="'+Math.round(c.op*100)+'"><span class="pct">'+Math.round(c.op*100)+'%</span>'
      +'<button type="button" data-a="cor" title="Cor da disciplina ou cor original">'+(c.corOn?'🎨 cor da disciplina':'🖨 cor original')+'</button>'
      +(function(){ if(c===base||!c.pronta) return ''; var m=modoDe(c);
        var st=m==='aj'||m==='cal'?'<span class="cp-ok" title="Encaixada na base pelo ajuste gravado">✓ ajustada</span>':'<span class="cp-sem" title="Ainda não ajustada nesta base: entrou só pela largura da folha">⚠️ não ajustada</span>';
        return st+(C.podeAlinhar?'<button type="button" data-a="aj" title="Mover com o mouse, mudar a escala e o giro até cair em cima da base">✋ ajustar</button>':''); })()
      +(c!==base?'<button type="button" data-a="base" title="Usar esta como base">⇧ base</button><button type="button" data-a="tira" title="Tirar a camada">✕</button>':'')
      +(c.erro?'<span style="color:#ffb3b3">não abriu: '+esc(c.erro)+'</span>':!c.pronta?'<span style="color:#bbb">carregando…</span>':'');
    row.querySelector('input[type=checkbox]').onchange=function(){ c.vis=this.checked; visual(c); row.classList.toggle('off',!c.vis); };
    var r=row.querySelector('input[type=range]'); r.oninput=function(){ c.op=this.value/100; row.querySelector('.pct').textContent=this.value+'%'; visual(c); };
    row.querySelectorAll('[data-a]').forEach(function(b){ b.onclick=function(){ var a=b.getAttribute('data-a');
      if(a==='cor'){ c.corOn=!c.corOn; if(c.orig) pinta(c); desenhaLista(); } else if(a==='tira') tira(i); else if(a==='base') trocaBase(c.doc.id); else if(a==='alin') comecaAlin(c); else if(a==='cal') comecaCal(c); else if(a==='aj') comecaAj(c); }; });
    box.appendChild(row);
  });
  var add=document.createElement('div'); add.className='cp-add';
  var livres=C.docs.filter(function(d){ return !cams.some(function(c){return c.doc.id===d.id;}); });
  add.innerHTML='＋ camada: <select><option value="">escolha uma prancha…</option>'+C.ordemDisc.map(function(x){ var ds=livres.filter(function(d){return d.disc===x.id;});
    return ds.length?'<optgroup label="'+esc(x.nome)+'">'+ds.map(function(d){return '<option value="'+d.id+'">'+esc(d.cod)+'</option>';}).join('')+'</optgroup>':''; }).join('')+'</select>';
  add.querySelector('select').onchange=function(){ if(this.value) carrega(docDe(this.value)); };
  box.appendChild(add);
}

// ---------- zoom e arrastar ----------
function tamPalco(){ if(!base) return; $('cpVazio').hidden=true; palco.style.width=Math.round(base.w*zoom)+'px'; palco.style.height=Math.round(base.h*zoom)+'px'; mundo.style.width=base.w+'px'; mundo.style.height=base.h+'px';
  mundo.style.transform='scale('+zoom+')'; $('cpPct').textContent=Math.round(zoom*100)+'%'; pinos(); }
function setZoom(z,cx,cy){ if(!base) return; z=Math.max(0.03,Math.min(z,8)); var r=area.getBoundingClientRect(); if(cx==null){ cx=r.left+area.clientWidth/2; cy=r.top+area.clientHeight/2; }
  var ax=area.scrollLeft+cx-r.left-18, ay=area.scrollTop+cy-r.top-18, k=z/zoom; zoom=z; tamPalco(); area.scrollLeft=ax*k-(cx-r.left)+18; area.scrollTop=ay*k-(cy-r.top)+18; }
function ajusta(){ if(!base) return; zoom=Math.max(0.03,Math.min((area.clientWidth-40)/base.w,(area.clientHeight-40)/base.h)); tamPalco(); area.scrollLeft=0; area.scrollTop=0; }
document.querySelectorAll('[data-cz]').forEach(function(b){ b.onclick=function(){ var v=b.getAttribute('data-cz'); if(v==='+') setZoom(zoom*1.25); else if(v==='-') setZoom(zoom/1.25); else ajusta(); }; });
area.addEventListener('wheel',function(e){ if(!e.ctrlKey&&!e.metaKey) return; e.preventDefault(); setZoom(zoom*Math.exp(-e.deltaY*0.0022),e.clientX,e.clientY); },{passive:false});
var toques={}, mexeu=false;
area.addEventListener('pointerdown',function(e){ if(e.target.closest&&e.target.closest('.cp-pin')) return; toques[e.pointerId]={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY}; mexeu=false; area.classList.add('arrasta'); try{ area.setPointerCapture(e.pointerId); }catch(x){} });
area.addEventListener('pointermove',function(e){ var t=toques[e.pointerId]; if(!t) return; var ids=Object.keys(toques);
  if(ids.length>=2){ var o=toques[ids[0]===String(e.pointerId)?ids[1]:ids[0]], d0=Math.hypot(t.x-o.x,t.y-o.y), d1=Math.hypot(e.clientX-o.x,e.clientY-o.y); if(d0>0) setZoom(zoom*d1/d0,(e.clientX+o.x)/2,(e.clientY+o.y)/2); mexeu=true; }
  else if(modo==='aj'&&aj){ aj.T[4]+=(e.clientX-t.x)/zoom; aj.T[5]+=(e.clientY-t.y)/zoom; aplicaAj(); mexeu=true; }
  else { area.scrollLeft-=e.clientX-t.x; area.scrollTop-=e.clientY-t.y; if(Math.hypot(e.clientX-t.x0,e.clientY-t.y0)>5) mexeu=true; }
  t.x=e.clientX; t.y=e.clientY; });
area.addEventListener('pointerup',function(e){ var t=toques[e.pointerId]; delete toques[e.pointerId]; if(!Object.keys(toques).length) area.classList.remove('arrasta');
  if(t&&!mexeu&&modo) clique(e); });
area.addEventListener('pointercancel',function(e){ delete toques[e.pointerId]; area.classList.remove('arrasta'); });
function pontoMundo(e){ var r=palco.getBoundingClientRect(); return [ (e.clientX-r.left)/zoom, (e.clientY-r.top)/zoom ]; }

// ---------- alinhamento por 2 pontos ----------
function inversa(T){ var a=T[0],b=T[1],c=T[2],d=T[3],e=T[4],f=T[5],det=a*d-b*c; return function(p){ var x=p[0]-e, y=p[1]-f; return [(d*x-c*y)/det,(-b*x+a*y)/det]; }; }
var PASSOS=['1/4 · Clique num ponto bem marcado na BASE (ex.: cruzamento dos eixos A-1)','2/4 · Agora clique no MESMO ponto na camada que está alinhando',
  '3/4 · Clique num 2º ponto na BASE, longe do 1º (ex.: eixos D-5)','4/4 · E o mesmo 2º ponto na camada'];
function comecaAlin(c){ if(!c.pronta||!base.pronta) return; cancelaClash(); alin={c:c,pts:[],antes:cams.map(function(x){return [x.vis,x.op];})};
  cams.forEach(function(x){ x.vis=(x===base||x===c); if(x===c) x.op=0.6; if(x===base) x.op=1; visual(x); }); modo='alin'; area.classList.add('mira'); passo(); }
function passo(){ banner.hidden=false; banner.innerHTML='📐 Alinhando <b>'+esc(alin.c.doc.cod)+'</b> na base · '+PASSOS[alin.pts.length]+' <button type="button" id="cpAlinX">cancelar</button>'; $('cpAlinX').onclick=fimAlin; }
function fimAlin(){ if(!alin) return; cams.forEach(function(x,i){ var a=alin.antes[i]; if(a){ x.vis=a[0]; x.op=a[1]; visual(x); } }); alin=null; modo=null; area.classList.remove('mira'); banner.hidden=true; tiraAlvos(); desenhaLista(); }
function alvo(p){ var a=document.createElement('div'); a.className='cp-alvo'; a.style.left=(p[0]*zoom)+'px'; a.style.top=(p[1]*zoom)+'px'; pinsBox.appendChild(a); }
function tiraAlvos(){ pinsBox.querySelectorAll('.cp-alvo').forEach(function(a){ a.remove(); }); }
function clique(e){
  var p=pontoMundo(e);
  if(modo==='cal'){ cal.pts.push(inversa(cal.c.T)(p)); alvo(p); if(cal.pts.length<2) return passoCal(); return gravaCal(); }
  if(modo==='medir'){ med.pts.push(p); alvo(p); if(med.pts.length<2){ banner.innerHTML='📏 Agora clique no 2º ponto <button type="button">cancelar</button>'; banner.querySelector('button').onclick=fimMedir; return; }
    var a=med.pts[0], b=med.pts[1], L=Math.hypot(b[0]-a[0],b[1]-a[1]), k=mPorUn(), txt=k?(L*k).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m':Math.round(L)+' un.';
    var rg=document.createElement('div'); rg.className='cp-regua'; rg.style.left=(a[0]*zoom)+'px'; rg.style.top=(a[1]*zoom)+'px'; rg.style.width=(L*zoom)+'px'; rg.style.transform='rotate('+Math.atan2(b[1]-a[1],b[0]-a[0])+'rad)';
    rg.innerHTML='<span>'+txt+'</span>'; pinsBox.appendChild(rg); med.rg=rg; med.a=a; med.b=b; modo=null; area.classList.remove('mira');
    banner.innerHTML='📏 <b>'+txt+'</b>'+(k?'':' — para medir em metros, calibre a base e informe a distância real na 🎯 Referência')+' <button type="button">medir de novo</button> <button type="button">fechar</button>';
    var bs=banner.querySelectorAll('button'); bs[0].onclick=function(){ fimMedir(); comecaMedir(); }; bs[1].onclick=fimMedir; return; }
  if(modo==='alin'){ var n=alin.pts.length; alin.pts.push(n%2===0?p:inversa(alin.c.T)(p)); alvo(p);
    if(alin.pts.length<4) return passo();
    var P1=alin.pts[0],Q1=alin.pts[1],P2=alin.pts[2],Q2=alin.pts[3], dp=[P2[0]-P1[0],P2[1]-P1[1]], dq=[Q2[0]-Q1[0],Q2[1]-Q1[1]], lq=Math.hypot(dq[0],dq[1]);
    if(lq<1||Math.hypot(dp[0],dp[1])<1){ alert('Os dois pontos ficaram muito perto. Escolha pontos bem afastados.'); alin.pts=[]; tiraAlvos(); return passo(); }
    var s=Math.hypot(dp[0],dp[1])/lq, ang=Math.atan2(dp[1],dp[0])-Math.atan2(dq[1],dq[0]), a=s*Math.cos(ang), b=s*Math.sin(ang), T=[a,b,-b,a,P1[0]-(a*Q1[0]-b*Q1[1]),P1[1]-(b*Q1[0]+a*Q1[1])];
    var c=alin.c, k=chaveAlin(base,c); C.alinh[k]=T; aplicaT(c);
    fetch(C.base+'/alinhar',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({base:base.doc.id,camada:c.doc.id,T:JSON.stringify(T)})})
      .then(function(r){return r.json();}).then(function(j){ if(j.erro) alert('O alinhamento não foi gravado: '+j.erro); });
    var info='escala '+s.toFixed(4)+' · giro '+(ang*180/Math.PI).toFixed(2)+'°'; fimAlin(); banner.hidden=false; banner.innerHTML='✓ '+esc(c.doc.cod)+' alinhada na base ('+info+') <button type="button">ok</button>'; banner.querySelector('button').onclick=function(){ banner.hidden=true; };
    return;
  }
  if(modo==='clash'){ novoClash={x:Math.round(p[0]*10)/10,y:Math.round(p[1]*10)/10}; pinos(); abreForm(); }
}

// ---------- ESCALA E ORIGEM: referência da obra e calibração de cada prancha ----------
var cal=null, med=null, mostraRef=true;
function barraRef(){
  var R=C.ref, el=document.createElement('div'); el.className='cp-ref';
  var nCal=cams.filter(function(c){ return calDe(c); }).length;
  el.innerHTML='🎯 <span>Referência:</span> '+(R?'<b>P1 '+esc(R.p1)+'</b> → <b>P2 '+esc(R.p2)+'</b>'+(R.dist?' · <b>'+String(R.dist).replace('.',',')+' m</b>':' · <span class="cp-av">sem distância real</span>'):'<span class="cp-sem">ainda não definida</span>')
    +' <span style="color:#999">· '+nCal+' de '+cams.length+' camada'+(cams.length===1?'':'s')+' calibrada'+(nCal===1?'':'s')+'</span>'
    +(C.podeAlinhar?' <button type="button" data-r="edit">✎ '+(R?'mudar':'definir')+'</button>':'')
    +(calDe(base)?' <button type="button" data-r="ver">'+(mostraRef?'esconder':'mostrar')+' P1/P2</button>':'');
  var be=el.querySelector('[data-r=edit]'); if(be) be.onclick=function(){
    el.innerHTML='<form>🎯 <input name="p1" maxlength="40" placeholder="P1 — ex.: eixo A × eixo 1" value="'+esc(R?R.p1:'')+'"> → <input name="p2" maxlength="40" placeholder="P2 — ex.: eixo F × eixo 8" value="'+esc(R?R.p2:'')+'">'
      +' distância real <input class="m" name="dist" placeholder="ex.: 24,35" value="'+(R&&R.dist?String(R.dist).replace('.',','):'')+'"> m <button>gravar</button> <button type="button" data-r="x">cancelar</button>'
      +'<span style="color:#999;width:100%">Escolha 2 pontos que aparecem em TODAS as disciplinas e bem afastados (cruzamento de eixos, canto de pilar). A distância real (metros) liga a régua.</span></form>';
    el.querySelector('[data-r=x]').onclick=desenhaLista;
    el.querySelector('form').onsubmit=function(ev){ ev.preventDefault(); var f=ev.target;
      posta('/referencia',{p1:f.p1.value,p2:f.p2.value,dist:f.dist.value}).then(function(j){ C.ref=j.ref; desenhaLista(); }).catch(function(er){ alert(er.message); }); };
  };
  var bv=el.querySelector('[data-r=ver]'); if(bv) bv.onclick=function(){ mostraRef=!mostraRef; pinos(); desenhaLista(); };
  return el;
}
function posta(cam,dados){ return fetch(C.base+cam,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams(dados)})
  .then(function(r){ return r.json(); }).then(function(j){ if(j.erro) throw new Error(j.erro); return j; }); }
function comecaCal(c){
  if(!C.ref){ alert('Antes, defina a 🎯 Referência da obra: os 2 pontos que todas as disciplinas têm (ex.: eixo A × 1 e eixo F × 8).'); return; }
  if(!c.pronta) return; cancelaClash(); fimMedir(); if(alin) fimAlin();
  cal={c:c,pts:[],antes:cams.map(function(x){return [x.vis,x.op];})};
  cams.forEach(function(x){ x.vis=(x===c); if(x===c) x.op=1; visual(x); }); modo='cal'; area.classList.add('mira'); passoCal(); }
function passoCal(){ banner.hidden=false; var n=cal.pts.length;
  banner.innerHTML='🎯 Calibrando <b>'+esc(cal.c.doc.cod)+'</b> · '+(n?'2/2 · Agora clique no <b>P2 — '+esc(C.ref.p2)+'</b>':'1/2 · Clique no <b>P1 — '+esc(C.ref.p1)+'</b>')+' (dê zoom para acertar) <button type="button">cancelar</button>';
  banner.querySelector('button').onclick=fimCal; }
function fimCal(){ if(!cal) return; cams.forEach(function(x,i){ var a=cal.antes[i]; if(a){ x.vis=a[0]; x.op=a[1]; visual(x); } }); cal=null; modo=null; area.classList.remove('mira'); banner.hidden=true; tiraAlvos(); desenhaLista(); }
function gravaCal(){ var c=cal.c, p1=cal.pts[0], p2=cal.pts[1];
  if(Math.hypot(p2[0]-p1[0],p2[1]-p1[1])<20){ alert('Os dois pontos ficaram muito perto. Use pontos bem afastados.'); cal.pts=[]; tiraAlvos(); return passoCal(); }
  var r1=function(v){ return Math.round(v*100)/100; };
  posta('/calibrar',{doc:c.doc.id,p1:JSON.stringify(p1.map(r1)),p2:JSON.stringify(p2.map(r1))}).then(function(j){
    C.calib[c.doc.chave]=j.calib; fimCal(); reencaixa(); desenhaLista();
    var falta=cams.filter(function(x){ return !calDe(x); }).length;
    banner.hidden=false; banner.innerHTML='✓ <b>'+esc(c.doc.cod)+'</b> calibrada.'+(falta?' Faltam '+falta+' camada'+(falta===1?'':'s')+' para tudo encaixar.':' Todas as camadas encaixadas na mesma escala e origem.')+' <button type="button">ok</button>';
    banner.querySelector('button').onclick=function(){ banner.hidden=true; };
  }).catch(function(er){ alert('A calibração não foi gravada: '+er.message); fimCal(); }); }
function comecaMedir(){ if(!base||!base.pronta) return; cancelaClash(); if(cal) fimCal(); med={pts:[]}; modo='medir'; area.classList.add('mira'); banner.hidden=false;
  banner.innerHTML='📏 Clique no 1º ponto'+(mPorUn()?'':' (sem a base calibrada com distância real, a medida sai em unidades do desenho)')+' <button type="button">cancelar</button>'; banner.querySelector('button').onclick=fimMedir; }
function fimMedir(){ if(!med) return; if(med.rg) med.rg.remove(); med=null; if(modo==='medir'){ modo=null; area.classList.remove('mira'); } tiraAlvos(); banner.hidden=true; }
(function(){ var bc=$('cpClash'); if(!bc||!C.regua) return; var bm=document.createElement('button'); bm.type='button'; bm.className='mk'; bm.textContent='📏 medir'; bm.title='Medir distância (em metros, com a base calibrada)';
  bm.onclick=function(){ if(modo==='medir') fimMedir(); else comecaMedir(); }; bc.parentNode.insertBefore(bm,bc); })();

// ---------- ✋ AJUSTAR NA MÃO: mover, escala e giro ----------
var aj=null, LS=Math.log(5);
function escalaDe(T){ return Math.hypot(T[0],T[1]); } function giroDe(T){ return Math.atan2(T[1],T[0])*180/Math.PI; }
// o ponto fixo da escala e do giro: o centro do que está na tela (em coordenadas da base)
function pivo(){ var ra=area.getBoundingClientRect(), rp=palco.getBoundingClientRect(); return [(ra.left+area.clientWidth/2-rp.left)/zoom,(ra.top+area.clientHeight/2-rp.top)/zoom]; }
function emTorno(M){ var P=pivo(); return mul([1,0,0,1,P[0],P[1]],mul(M,[1,0,0,1,-P[0],-P[1]])); }
function poeEscala(sNova){ if(!(sNova>0)) return; var k=sNova/escalaDe(aj.T); aj.T=mul(emTorno([k,0,0,k,0,0]),aj.T); aplicaAj(); }
function poeGiro(gNovo){ var a=(gNovo-giroDe(aj.T))*Math.PI/180, co=Math.cos(a), si=Math.sin(a); aj.T=mul(emTorno([co,si,-si,co,0,0]),aj.T); aplicaAj(); }
function aplicaAj(){ var c=aj.c; c.T=aj.T; c.cv.style.transform='matrix('+aj.T.join(',')+')';
  var s=escalaDe(aj.T), g=giroDe(aj.T), q=function(i){ return document.getElementById(i); };
  if(q('ajS')&&document.activeElement!==q('ajS')) q('ajS').value=Math.log(s); if(q('ajSn')&&document.activeElement!==q('ajSn')) q('ajSn').value=(s*100).toFixed(2).replace('.',',');
  if(q('ajR')&&document.activeElement!==q('ajR')) q('ajR').value=g; if(q('ajRn')&&document.activeElement!==q('ajRn')) q('ajRn').value=g.toFixed(2).replace('.',','); }
function comecaAj(c){ if(!c.pronta||!base||!base.pronta) return; cancelaClash(); if(typeof fimMedir==='function') fimMedir(); if(alin) fimAlin(); if(cal) fimCal(); if(aj) fimAj(true);
  aj={c:c,T:c.T.slice(),T0:c.T.slice(),antes:cams.map(function(x){return [x.vis,x.op];})};
  cams.forEach(function(x){ x.vis=(x===base||x===c); if(x===c&&x.op>0.7) x.op=0.6; visual(x); }); modo='aj'; area.classList.add('movel'); painelAj(); }
function painelAj(){ banner.hidden=false; banner.classList.add('cp-ajbar');
  banner.innerHTML='<div class="l"><b>✋</b><b style="width:auto">Ajustando '+esc(aj.c.doc.cod)+'</b><span class="dica">sobre a base '+esc(base.doc.cod)+' · arraste a prancha no desenho · setas do teclado movem (Shift = 10×) · Ctrl + rodinha dá zoom</span></div>'
   +'<div class="l"><b>Escala</b><button type="button" data-k="s/1.01" title="−1%">−</button><input type="range" id="ajS" min="'+(-LS)+'" max="'+LS+'" step="0.0001"><button type="button" data-k="s*1.01" title="+1%">+</button>'
   +'<input class="n" id="ajSn" title="escala em % do tamanho da base"> % <button type="button" data-k="s/1.001">−0,1%</button><button type="button" data-k="s*1.001">+0,1%</button><button type="button" data-k="s=1" title="volta a 100%">100%</button></div>'
   +'<div class="l"><b>Giro</b><button type="button" data-k="r-90">⟲ 90°</button><input type="range" id="ajR" min="-180" max="180" step="0.05"><button type="button" data-k="r+90">⟳ 90°</button>'
   +'<input class="n" id="ajRn" title="giro em graus"> ° <button type="button" data-k="r-0.1">−0,1°</button><button type="button" data-k="r+0.1">+0,1°</button><button type="button" data-k="r=0">0°</button></div>'
   +'<div class="l"><button type="button" class="p" data-k="ok">✓ gravar o ajuste</button><button type="button" data-k="volta">↺ desfazer tudo</button><button type="button" data-k="x">cancelar</button>'
   +'<span class="dica">dica: dê zoom num canto (eixo, pilar) para acertar o deslocamento; depois no canto oposto para acertar escala e giro</span></div>';
  var q=function(i){ return document.getElementById(i); };
  q('ajS').oninput=function(){ poeEscala(Math.exp(+this.value)); };
  q('ajR').oninput=function(){ poeGiro(+this.value); };
  q('ajSn').onchange=function(){ var v=parseFloat(String(this.value).replace(',','.')); if(v>0) poeEscala(v/100); this.blur(); aplicaAj(); };
  q('ajRn').onchange=function(){ var v=parseFloat(String(this.value).replace(',','.')); if(isFinite(v)) poeGiro(v); this.blur(); aplicaAj(); };
  banner.querySelectorAll('[data-k]').forEach(function(b){ b.onclick=function(){ var k=b.getAttribute('data-k'), s=escalaDe(aj.T), g=giroDe(aj.T);
    if(k==='s=1') poeEscala(1); else if(k[0]==='s') poeEscala(k[1]==='*'?s*parseFloat(k.slice(2)):s/parseFloat(k.slice(2)));
    else if(k==='r=0') poeGiro(0); else if(k[0]==='r') poeGiro(g+parseFloat(k.slice(1)));
    else if(k==='volta'){ aj.T=aj.T0.slice(); aplicaAj(); } else if(k==='x') fimAj(true); else if(k==='ok') gravaAj(); }; });
  aplicaAj(); }
document.addEventListener('keydown',function(e){ if(modo!=='aj'||!aj) return; var tg=e.target&&e.target.tagName; if(tg==='INPUT'||tg==='TEXTAREA'||tg==='SELECT') return;
  var d=(e.shiftKey?10:1)/zoom, m={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]}[e.key]; if(!m) return;
  e.preventDefault(); aj.T[4]+=m[0]; aj.T[5]+=m[1]; aplicaAj(); });
function fimAj(desfaz){ if(!aj) return; var c=aj.c; if(desfaz){ c.T=aj.T0; c.cv.style.transform='matrix('+aj.T0.join(',')+')'; }
  cams.forEach(function(x,i){ var a=aj.antes[i]; if(a){ x.vis=a[0]; x.op=a[1]; visual(x); } }); aj=null; if(modo==='aj') modo=null; area.classList.remove('movel');
  banner.classList.remove('cp-ajbar'); banner.hidden=true; desenhaLista(); }
function gravaAj(){ var c=aj.c, T=aj.T.map(function(v){ return Math.round(v*1e6)/1e6; }), k=chaveAlin(base,c);
  posta('/alinhar',{base:base.doc.id,camada:c.doc.id,T:JSON.stringify(T)}).then(function(){
    C.alinh[k]=T; delete C.alinh[c.doc.chave+'>'+base.doc.chave]; aj.T0=T; fimAj(false); reencaixa(); desenhaLista();
    banner.hidden=false; banner.innerHTML='✓ <b>'+esc(c.doc.cod)+'</b> ajustada na base (escala '+(escalaDe(T)*100).toFixed(2).replace('.',',')+'% · giro '+giroDe(T).toFixed(2).replace('.',',')+'°). <button type="button">ok</button>';
    banner.querySelector('button').onclick=function(){ banner.hidden=true; };
  }).catch(function(er){ alert('O ajuste não foi gravado: '+er.message); }); }

// ---------- clashes ----------
function pinos(){ pinsBox.querySelectorAll('.cp-pin,.cp-mk').forEach(function(a){ a.remove(); });
  var kb=calDe(base); if(kb&&mostraRef) [kb.p1,kb.p2].forEach(function(p,i){ var m=document.createElement('div'); m.className='cp-mk'; m.style.left=(p[0]*zoom)+'px'; m.style.top=(p[1]*zoom)+'px';
    m.innerHTML='<span>P'+(i+1)+(C.ref?' · '+esc(i?C.ref.p2:C.ref.p1):'')+'</span>'; pinsBox.appendChild(m); });
  if(med&&med.rg&&med.b){ var a=med.a,b=med.b; med.rg.style.left=(a[0]*zoom)+'px'; med.rg.style.top=(a[1]*zoom)+'px'; med.rg.style.width=(Math.hypot(b[0]-a[0],b[1]-a[1])*zoom)+'px'; }
  C.clashes.forEach(function(k){ var a=document.createElement('div'); a.className='cp-pin'+(k.ok?' ok':'')+(ativo===k.id?' ativo':''); a.textContent='C-'+String(k.n).padStart(3,'0'); a.title=k.titulo;
    a.style.left=(k.x*zoom)+'px'; a.style.top=(k.y*zoom)+'px'; a.onclick=function(ev){ ev.stopPropagation(); verClash(k.id,true); }; pinsBox.appendChild(a); });
  if(novoClash){ var n=document.createElement('div'); n.className='cp-pin novo'; n.textContent='novo clash'; n.style.left=(novoClash.x*zoom)+'px'; n.style.top=(novoClash.y*zoom)+'px'; pinsBox.appendChild(n); } }
var btClash=$('cpClash');
btClash.onclick=function(){ if(modo==='clash'){ cancelaClash(); return; } if(alin) fimAlin(); if(cal) fimCal(); if(aj) fimAj(true); fimMedir(); modo='clash'; area.classList.add('mira'); btClash.classList.add('on');
  banner.hidden=false; banner.innerHTML='💥 Clique no ponto da interferência no desenho <button type="button">cancelar</button>'; banner.querySelector('button').onclick=cancelaClash; };
function cancelaClash(){ if(modo==='clash'){ modo=null; area.classList.remove('mira'); } btClash.classList.remove('on'); novoClash=null; $('clForm').classList.remove('on'); banner.hidden=true; pinos(); }
function abreForm(){ modo=null; area.classList.remove('mira'); btClash.classList.remove('on'); banner.hidden=false;
  banner.innerHTML='💥 Ponto marcado. Preencha o clash no chat ao lado e envie. <button type="button">cancelar</button>'; banner.querySelector('button').onclick=cancelaClash;
  var f=$('clForm'); f.classList.add('on'); var vis=cams.filter(function(c){return c.vis;}).map(function(c){return c.doc.disc;});
  f.querySelectorAll('input[name=discs]').forEach(function(ck){ ck.checked=vis.indexOf(ck.value)>=0; });
  var cel=document.querySelector('.vw'); if(cel){ cel.classList.remove('so-pdf'); cel.classList.add('so-chat'); }
  f.querySelector('input[name=titulo]').focus(); }
function vista(){ return {cams:cams.map(function(c){ return {id:c.doc.id,op:Math.round(c.op*100)/100,cor:c.corOn,vis:c.vis}; }),z:zoom}; }
function verClash(id,doDesenho){
  var k=C.clashes.filter(function(x){return x.id===id;})[0]; if(!k) return; ativo=id;
  document.querySelectorAll('.ch-msg.ativa').forEach(function(m){ m.classList.remove('ativa'); }); var msg=$('m-'+id); if(msg){ msg.classList.add('ativa'); if(doDesenho) msg.scrollIntoView({block:'center'}); }
  var v=k.vista||{}, quer=(v.cams||[]).filter(function(c){ return docDe(c.id); }), tem=cams.map(function(c){return c.doc.id;}).join(','), pede=quer.map(function(c){return c.id;}).join(',');
  var aplica=function(){ quer.forEach(function(q){ var c=cams.filter(function(x){return x.doc.id===q.id;})[0]; if(!c) return; c.op=q.op; c.vis=q.vis; if(c.corOn!==q.cor){ c.corOn=q.cor; if(c.orig) pinta(c); } visual(c); });
    desenhaLista(); if(v.z) zoom=Math.max(zoom,v.z); tamPalco(); area.scrollLeft=k.x*zoom+18-area.clientWidth/2; area.scrollTop=k.y*zoom+18-area.clientHeight/2; pinos(); };
  if(quer.length&&pede!==tem){ cams.forEach(function(c){ mundo.removeChild(c.cv); }); cams=[]; base=null; var seq=Promise.resolve();
    quer.forEach(function(q,i){ seq=seq.then(function(){ return carrega(docDe(q.id),q.op,q.cor,q.vis); }); }); seq.then(aplica); }
  else aplica();
  var cel=document.querySelector('.vw'); if(cel&&!doDesenho){ cel.classList.remove('so-chat'); cel.classList.add('so-pdf'); }
}
document.querySelectorAll('[data-clash]').forEach(function(b){ b.onclick=function(){ verClash(b.getAttribute('data-clash'),false); }; });

// ---------- enviar (mensagem comum ou clash) ----------
var form=$('chNovo');
form.addEventListener('submit',function(e){ e.preventDefault(); var bt=form.querySelector('button[type=submit]'), st=$('chStatus'), fd=new FormData(form);
  if(novoClash){ var f=$('clForm'), discs=[].slice.call(f.querySelectorAll('input[name=discs]:checked')).map(function(c){return c.value;});
    fd.append('clash',JSON.stringify({local:C.local||'',x:novoClash.x,y:novoClash.y,titulo:f.querySelector('[name=titulo]').value,tipo:f.querySelector('[name=tipo]').value,grav:f.querySelector('[name=grav]').value,discs:discs,vista:vista()})); }
  bt.disabled=true; st.textContent='enviando…';
  fetch(form.getAttribute('action'),{method:'POST',body:fd,headers:{'Accept':'application/json'}}).then(function(r){return r.json();}).then(function(j){ if(j.erro) throw new Error(j.erro);
    novoClash=null; guarda(); var url=form.getAttribute('action'); if(location.pathname+location.search===url){ location.hash='m-'+j.msg; location.reload(); } else location.href=url+'#m-'+j.msg; })
  .catch(function(er){ st.textContent='não enviou: '+er.message; bt.disabled=false; }); });
var txt=form.querySelector('textarea'); txt.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); form.requestSubmit?form.requestSubmit():form.querySelector('button[type=submit]').click(); } });
var fotoIn=form.querySelector('.ch-foto input'); if(fotoIn) fotoIn.onchange=function(){ var n=fotoIn.files.length; $('chFotoTxt').textContent=n?(n+' foto'+(n===1?'':'s')):'foto'; fotoIn.parentNode.classList.toggle('tem',!!n); };

// ---------- celular: desenho ou chat ----------
document.querySelectorAll('[data-cel]').forEach(function(b){ b.onclick=function(){ var v=document.querySelector('.vw'); v.classList.remove('so-pdf','so-chat'); v.classList.add(b.getAttribute('data-cel'));
  document.querySelectorAll('[data-cel]').forEach(function(x){ x.classList.toggle('on',v.classList.contains(x.getAttribute('data-cel'))); }); }; });

// ---------- começo: as camadas da última vez (ou a sugestão da página) ----------
var lista=$('chLista'); if(lista){ var h=location.hash, alvoM=h&&document.querySelector(h); if(alvoM) alvoM.scrollIntoView({block:'center'}); else lista.scrollTop=lista.scrollHeight; }
var s0=lido(), ini=(s0&&s0.cams&&s0.cams.filter(function(c){return docDe(c.id);}).length)?s0.cams.filter(function(c){return docDe(c.id);}):C.iniciais.map(function(id){return {id:id};});
if(!ini.length){ $('cpVazio').hidden=false; desenhaLista(); }
else { var seq=Promise.resolve(); ini.forEach(function(c,i){ seq=seq.then(function(){ return carrega(docDe(c.id),c.op,c.cor,c.vis); }); });
  seq.then(function(){ if(s0&&s0.z){ zoom=s0.z; tamPalco(); area.scrollLeft=s0.x||0; area.scrollTop=s0.y||0; } else ajusta();
    var h=location.hash; if(h.indexOf('#m-')===0){ var k=h.slice(3); if(C.clashes.some(function(x){return x.id===k;})) verClash(k,false); } pinos(); }); }
})();`;
