// documentos-visor.js — o VISOR da tela de chat de Documentos (04/11): o PDF à esquerda, o chat à direita.
//
//   · o PDF é o PDF de verdade: cada página é redesenhada pelo pdf.js na resolução do zoom (nítida em qualquer
//     aproximação), e só as páginas à vista ficam desenhadas (economiza memória em prancha A0);
//   · a MARCAÇÃO é desenho (SVG) em coordenadas da página — não vira imagem. Vai para o chat como DADOS, com uma
//     miniatura para reconhecer; clicar nela desenha a marcação por cima do PDF, com o mesmo zoom. Fechou, o PDF
//     volta limpo. O arquivo original nunca muda;
//   · zoom: botões, Ctrl + rodinha (ou pinça no trackpad/celular); arrastar move a folha.
// Este arquivo só monta texto (CSS e o script que roda no navegador). Os dados vêm de documentos.js.

export const VISOR_CSS = `<style>
.wrap{max-width:none;padding:12px 14px 16px}.foot{display:none}.vw [hidden]{display:none!important}
.vw{display:grid;grid-template-columns:minmax(0,1fr) 10px var(--chat-w,44%);height:calc(100vh - 118px);min-height:520px}
.vw-div{cursor:col-resize;position:relative}.vw-div:after{content:"";position:absolute;left:3px;top:50%;width:4px;height:46px;margin-top:-23px;border-radius:3px;background:#cfc6a8}
.vw-div:hover:after,.vw-div.on:after{background:var(--acento)}
.vw-pdf,.vw-chat{display:flex;flex-direction:column;min-height:0;background:#fff;border:1px solid #e2dccb;border-radius:14px;overflow:hidden}
.vw-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:var(--escuro);color:#eee;padding:7px 9px}
.vw-bar button,.vw-bar select,.vw-bar a,.vw-tools button,.vw-tools select{border:1px solid #3a3a42;background:#1d1d22;color:#eee;border-radius:8px;padding:5px 9px;font-size:12.5px;cursor:pointer;font-family:inherit;text-decoration:none}
.vw-bar button.on,.vw-tools button.on{background:var(--acento);color:#111;border-color:var(--acento)}
.vw-bar .mk{background:var(--acento);color:#111;border-color:var(--acento);font-weight:800}.vw-bar .mk.on{background:#fff}
.vw-bar button:disabled{opacity:.4;cursor:default}
#vwPct{min-width:46px;text-align:center;font-size:12.5px;font-variant-numeric:tabular-nums}
.vw-sep{width:1px;height:22px;background:#3a3a42;margin:0 2px}
.vw-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#2a2a30;padding:6px 9px}
.vw-cor{width:22px;height:22px;border-radius:50%;border:2px solid #555!important;padding:0!important}.vw-cor.on{border-color:#fff!important;box-shadow:0 0 0 2px var(--acento)}
.vw-banner{background:#fff6dd;border-bottom:1px solid #ecdcae;padding:7px 10px;font-size:12.5px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.vw-banner button{border:1px solid #c9b77d;background:#fff;border-radius:7px;padding:3px 9px;font-size:12px;cursor:pointer;font-family:inherit}
.vw-area{flex:1;overflow:auto;background:#5a5d63;position:relative;cursor:grab;touch-action:none}.vw-area.arrasta{cursor:grabbing}
.vw-pags{display:flex;flex-direction:column;align-items:center;gap:14px;padding:16px;width:max-content;min-width:100%;box-sizing:border-box}
.vw-pg{position:relative;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.35);flex:none}
.vw-pg>canvas:first-child,.vw-pg img,.vw-pg svg{position:absolute;left:0;top:0;width:100%;height:100%}.vw-pg>canvas+canvas{position:absolute}
.vw-pg svg{pointer-events:none}.vw-area.marcando .vw-pg svg{pointer-events:auto;cursor:crosshair}
.vw-msg{color:#eee;padding:30px;font-size:13px}.vw-msg.erro{color:#ffb3b3}
.vw-chat .ch-lista{flex:1;overflow:auto;padding:10px 12px;max-width:none;margin:0}
.vw-chat .ch-msg{max-width:88%}.vw-chat .ch-novo{position:static;margin:0;border-radius:0;border-width:1px 0 0;box-shadow:none;padding:8px 10px;max-width:none}
.vw-chat .ch-imgs img{max-width:220px;max-height:160px}
.vw-cab{padding:8px 12px 0;border-bottom:1px solid #efeade}
.ch-resumo{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;font-size:12.5px;color:#4a4330}.ch-resumo .ch-n{font-weight:800;white-space:nowrap}
.vw-cab .ch-abas{margin:7px 0 8px}.vw-cab .ch-abas a{padding:3px 10px;font-size:12px}
.ch-opc{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.ch-opc select{padding:5px 7px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff;max-width:100%}
.ch-campo{display:inline-flex;align-items:center;gap:4px;border:1px solid #ddd8c8;border-radius:8px;background:#fff;padding:0 4px 0 7px;font-size:12.5px}
.ch-campo input{border:0;outline:0;padding:5px 2px;font-size:12.5px;font-family:inherit;background:transparent;min-width:0}
.ch-campo input[name=para]{width:118px}.ch-campo input[type=date]{width:118px}
.ch-foto{cursor:pointer;padding:5px 9px;position:relative}.ch-foto input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}.ch-foto.tem{background:#fff3d6;border-color:#e8c97a;font-weight:700}
.ch-escreve{display:flex;gap:8px;align-items:stretch}
.ch-escreve textarea{flex:1;min-height:44px;max-height:180px;border:1px solid #ddd8c8;border-radius:10px;padding:8px 10px;font-size:13.5px;font-family:inherit;resize:vertical}
.ch-escreve button{padding:0 16px;white-space:nowrap}
#chStatus{font-size:11.5px;color:var(--mut);margin-top:3px;min-height:0}#chStatus:empty{display:none}
.ch-msg.ativa{box-shadow:0 0 0 2px var(--acento)}
.ch-ver{border:1px solid #c9b77d;background:#fffaf0;border-radius:7px;padding:3px 8px;font-size:11.5px;cursor:pointer;font-family:inherit;font-weight:700;color:#5a4e2e}
#chMarcasNota{display:none;font-size:12px;font-weight:700;color:#8a5a00;background:#fff3d6;border-radius:8px;padding:5px 8px;margin-bottom:6px}
.vw-cel{display:none}
@media(max-width:900px){.vw{grid-template-columns:1fr;height:calc(100vh - 160px)}.vw-div{display:none}.vw-cel{display:flex;gap:6px;margin-bottom:8px}
  .vw-cel button{flex:1;border:1px solid #ddd8c8;background:#fff;border-radius:9px;padding:8px;font-weight:800;font-family:inherit}.vw-cel button.on{background:var(--escuro);color:var(--acento-claro)}
  .vw.so-pdf .vw-chat,.vw.so-chat .vw-pdf{display:none}}
</style>`;

const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

/** O script do visor. cfg = { chave, docs: [{id, cod, rev, sit, tipo: "pdf"|"img"|"outro", url}], v, podeMarcar: {id: true},
 *  marcas: {msgId: {doc, por, quando, rev, paginas: [{pagina, formas}]}}, marcar } */
export const visorScript = cfg => `<script src="/assets/pdfjs-3.11.174.min.js"></script><script>window.VISOR=${json(cfg)};</script><script>${CODIGO}</script>`;

const CODIGO = `(function(){
var C=window.VISOR, $=function(i){return document.getElementById(i);}, area=$('vwArea'), box=$('vwPags'), pct=$('vwPct'), revSel=$('vwRev'), banner=$('vwBanner');
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='/assets/pdfjs-3.11.174.worker.min.js';
var DPR=Math.min(window.devicePixelRatio||1,2), MAXLADO=12000, MAXAREA=60e6;
var NS=(function(){ var t=document.createElement('div'); t.innerHTML='<svg></svg>'; return t.firstChild.namespaceURI; })();   // o "nome" do formato SVG, dado pelo próprio navegador
var pags=[], zoom=1, docAtual=null, marcando=false, ferr='caneta', cor='#e02424', pilha=[], vista=null, carga=0;
function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
// o zoom, a revisão e a posição voltam iguais depois de enviar uma mensagem (a página recarrega)
var SS=(function(){ try{ var s=window.sessionStorage; s.getItem('x'); return s; }catch(e){ return null; } })(), CH='vw-'+C.chave;
function guarda(){ if(!SS||!docAtual) return; try{ SS.setItem(CH,JSON.stringify({v:docAtual.id,z:zoom,x:area.scrollLeft,y:area.scrollTop})); }catch(e){} }
function lido(){ try{ return JSON.parse((SS&&SS.getItem(CH))||'null'); }catch(e){ return null; } }
window.addEventListener('beforeunload',function(e){ guarda(); if(pilha.length){ e.preventDefault(); e.returnValue=''; } });

// ---------- páginas ----------
var obs=('IntersectionObserver' in window) ? new IntersectionObserver(function(es){ es.forEach(function(e){ var p=pags[+e.target.getAttribute('data-n')-1]; if(!p) return;
  p.visivel=e.isIntersecting; if(p.visivel) desenha(p); else solta(p); }); },{root:area,rootMargin:'900px'}) : null;
function kDe(p){ return Math.max(p.w,p.h)/1000; }
function criaPagina(n,w,h,src){
  var wrap=document.createElement('div'); wrap.className='vw-pg'; wrap.setAttribute('data-n',n);
  var fundo=src.img ? src.img : document.createElement('canvas');
  var svg=document.createElementNS(NS,'svg'); svg.setAttribute('viewBox','0 0 '+w+' '+h); svg.setAttribute('preserveAspectRatio','none');
  var gV=document.createElementNS(NS,'g'), gM=document.createElementNS(NS,'g'); svg.appendChild(gV); svg.appendChild(gM);
  wrap.appendChild(fundo); wrap.appendChild(svg); box.appendChild(wrap);
  var p={n:n,w:w,h:h,pg:src.pg||null,img:src.img||null,wrap:wrap,cv:fundo,svg:svg,gM:gM,gV:gV,formas:[],esc:0,tarefa:null,visivel:!obs};
  pags.push(p); tamanho(p); ligaDesenho(p); if(obs) obs.observe(wrap); return p;
}
function tamanho(p){ p.wrap.style.width=Math.round(p.w*zoom)+'px'; p.wrap.style.height=Math.round(p.h*zoom)+'px'; }
// redesenha a página na resolução do zoom (o PDF de verdade, não uma foto); limite para não estourar a memória
function desenha(p){
  if(!p.pg) return;
  var s=Math.min(zoom*DPR, MAXLADO/Math.max(p.w,p.h), Math.sqrt(MAXAREA/(p.w*p.h)));
  if(Math.abs(s-p.esc)<0.005*s) return;
  if(p.tarefa){ try{ p.tarefa.cancel(); }catch(e){} }
  var vp=p.pg.getViewport({scale:s}), cv=document.createElement('canvas'); cv.width=Math.floor(vp.width); cv.height=Math.floor(vp.height);
  var t=p.pg.render({canvasContext:cv.getContext('2d'),viewport:vp,intent:'print'}); p.tarefa=t;
  t.promise.then(function(){ if(p.tarefa!==t) return; p.tarefa=null; p.esc=s; p.wrap.replaceChild(cv,p.cv); p.cv=cv; },function(){});
}
// zoom muito grande (prancha A0 a 300%+): a página inteira não cabe na memória na resolução da tela. Então, além dela,
// desenha só o PEDAÇO À VISTA na resolução exata — nítido em qualquer zoom. Refeito ao arrastar e ao mudar o zoom.
function recorte(p){
  if(!p.pg) return; var cheio=zoom*DPR, s=Math.min(cheio, MAXLADO/Math.max(p.w,p.h), Math.sqrt(MAXAREA/(p.w*p.h)));
  if(s>=cheio*0.98||!p.visivel){ tiraRecorte(p); return; }
  var a=area.getBoundingClientRect(), r=p.wrap.getBoundingClientRect(), M=150;
  var x0=Math.max(0,a.left-r.left-M), y0=Math.max(0,a.top-r.top-M), x1=Math.min(r.width,a.right-r.left+M), y1=Math.min(r.height,a.bottom-r.top+M);
  if(x1<=x0||y1<=y0){ tiraRecorte(p); return; }
  if(p.rec&&p.rec.z===zoom&&p.rec.x0<=x0&&p.rec.y0<=y0&&p.rec.x1>=x1-M/2&&p.rec.y1>=y1-M/2) return;   // o que já está desenhado ainda cobre a vista
  if(p.recTarefa){ try{ p.recTarefa.cancel(); }catch(e){} }
  var cv=document.createElement('canvas'); cv.width=Math.ceil((x1-x0)*DPR); cv.height=Math.ceil((y1-y0)*DPR);
  cv.style.left=x0+'px'; cv.style.top=y0+'px'; cv.style.width=(x1-x0)+'px'; cv.style.height=(y1-y0)+'px';
  var t=p.pg.render({canvasContext:cv.getContext('2d'),viewport:p.pg.getViewport({scale:cheio}),transform:[1,0,0,1,-x0*DPR,-y0*DPR],intent:'print'}); p.recTarefa=t;
  t.promise.then(function(){ if(p.recTarefa!==t) return; p.recTarefa=null; if(p.rec&&p.rec.cv.parentNode) p.wrap.removeChild(p.rec.cv);
    p.wrap.insertBefore(cv,p.svg); p.rec={cv:cv,z:zoom,x0:x0,y0:y0,x1:x1,y1:y1}; },function(){});
}
function tiraRecorte(p){ if(p.recTarefa){ try{ p.recTarefa.cancel(); }catch(e){} p.recTarefa=null; } if(p.rec){ if(p.rec.cv.parentNode) p.wrap.removeChild(p.rec.cv); p.rec=null; } }
function solta(p){ tiraRecorte(p); if(!p.pg||!p.esc) return; if(p.tarefa){ try{ p.tarefa.cancel(); }catch(e){} p.tarefa=null; }
  var cv=document.createElement('canvas'); p.wrap.replaceChild(cv,p.cv); p.cv=cv; p.esc=0; }
var agendado=null; function agenda(){ clearTimeout(agendado); agendado=setTimeout(function(){ pags.forEach(function(p){ if(p.visivel){ desenha(p); recorte(p); } else tiraRecorte(p); }); },140); }
var rolou=null; area.addEventListener('scroll',function(){ clearTimeout(rolou); rolou=setTimeout(function(){ pags.forEach(function(p){ if(p.visivel) recorte(p); }); },120); });

// ---------- abrir uma revisão ----------
function abrir(id,depois){
  var d=C.docs.filter(function(x){return x.id===id;})[0]||C.docs[0]; if(!d) return;
  var minha=++carga; docAtual=d; pags=[]; pilha=[]; vista=null; banner.hidden=true; notaMarcas(); if(obs) obs.disconnect();
  if(revSel) revSel.value=d.id; $('vwAbrir').href=d.url; podeMarcarAgora();
  box.innerHTML='<div class="vw-msg">carregando o PDF…</div>';
  if(d.tipo==='outro'){ box.innerHTML='<div class="vw-msg">Este arquivo não é PDF nem imagem (DWG/DXF): use "abrir" para baixar.</div>'; return; }
  if(d.tipo==='img'){ var img=new Image(); img.onload=function(){ if(minha!==carga) return; box.innerHTML=''; criaPagina(1,img.naturalWidth,img.naturalHeight,{img:img}); pronto(depois); };
    img.onerror=function(){ box.innerHTML='<div class="vw-msg erro">Não abriu a imagem.</div>'; }; img.src=d.url; return; }
  pdfjsLib.getDocument({url:d.url}).promise.then(function(pdf){
    if(minha!==carga) return; var seq=Promise.resolve(), novas=[];
    for(var n=1;n<=pdf.numPages;n++)(function(n){ seq=seq.then(function(){ return pdf.getPage(n).then(function(pg){ novas.push([n,pg]); }); }); })(n);
    return seq.then(function(){ if(minha!==carga) return; box.innerHTML='';
      novas.forEach(function(x){ var vp=x[1].getViewport({scale:1}); criaPagina(x[0],vp.width,vp.height,{pg:x[1]}); }); pronto(depois); });
  }).catch(function(e){ box.innerHTML='<div class="vw-msg erro">Não abriu o PDF: '+esc(e.message)+'</div>'; });
}
function pronto(depois){
  var s=lido(); if(s&&s.v===docAtual.id&&s.z){ zoom=s.z; pags.forEach(tamanho); pct.textContent=Math.round(zoom*100)+'%'; area.scrollLeft=s.x||0; area.scrollTop=s.y||0; if(!obs) agenda(); }
  else ajusta('larg');
  if(depois) depois();
}

// ---------- zoom ----------
function setZoom(z,cx,cy){
  z=Math.max(0.03,Math.min(z,12)); var r=area.getBoundingClientRect();
  if(cx==null){ cx=r.left+area.clientWidth/2; cy=r.top+area.clientHeight/2; }
  var ax=area.scrollLeft+cx-r.left, ay=area.scrollTop+cy-r.top, k=z/zoom; zoom=z; pags.forEach(function(p){ tiraRecorte(p); tamanho(p); });
  area.scrollLeft=ax*k-(cx-r.left); area.scrollTop=ay*k-(cy-r.top); pct.textContent=Math.round(zoom*100)+'%'; agenda();
}
function ajusta(modo){ if(!pags.length) return; var mw=Math.max.apply(null,pags.map(function(p){return p.w;})), p0=pags[0];
  var z=modo==='pag' ? Math.min((area.clientWidth-40)/p0.w,(area.clientHeight-40)/p0.h) : (area.clientWidth-40)/mw;
  zoom=Math.max(0.03,z); pags.forEach(function(p){ tiraRecorte(p); tamanho(p); }); pct.textContent=Math.round(zoom*100)+'%'; area.scrollLeft=0; area.scrollTop=0; agenda(); }
document.querySelectorAll('[data-vz]').forEach(function(b){ b.onclick=function(){ var v=b.getAttribute('data-vz');
  if(v==='+') setZoom(zoom*1.25); else if(v==='-') setZoom(zoom/1.25); else ajusta(v); }; });
area.addEventListener('wheel',function(e){ if(!e.ctrlKey&&!e.metaKey) return; e.preventDefault(); setZoom(zoom*Math.exp(-e.deltaY*0.0022),e.clientX,e.clientY); },{passive:false});
// arrastar move a folha; dois dedos dão zoom
var toques={};
area.addEventListener('pointerdown',function(e){ if(marcando&&e.target.closest&&e.target.closest('svg')) return; toques[e.pointerId]={x:e.clientX,y:e.clientY}; area.classList.add('arrasta'); try{ area.setPointerCapture(e.pointerId); }catch(x){} });
area.addEventListener('pointermove',function(e){ var t=toques[e.pointerId]; if(!t) return; var ids=Object.keys(toques);
  if(ids.length>=2){ var o=toques[ids[0]===String(e.pointerId)?ids[1]:ids[0]], d0=Math.hypot(t.x-o.x,t.y-o.y), d1=Math.hypot(e.clientX-o.x,e.clientY-o.y); if(d0>0) setZoom(zoom*d1/d0,(e.clientX+o.x)/2,(e.clientY+o.y)/2); }
  else { area.scrollLeft-=e.clientX-t.x; area.scrollTop-=e.clientY-t.y; }
  t.x=e.clientX; t.y=e.clientY; });
['pointerup','pointercancel'].forEach(function(n){ area.addEventListener(n,function(e){ delete toques[e.pointerId]; if(!Object.keys(toques).length) area.classList.remove('arrasta'); }); });

// ---------- desenho (SVG, em coordenadas da página) ----------
function el(nome,at){ var x=document.createElementNS(NS,nome); for(var k in at) x.setAttribute(k,at[k]); return x; }
function forma(s,k){
  var a=s.pts[0], b=s.pts[s.pts.length-1], w=s.e*k, base={stroke:s.c,'stroke-width':w,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'};
  if(s.f==='caneta'||s.f==='marca'){ var at=Object.assign({},base,{points:s.pts.map(function(q){return q[0]+','+q[1];}).join(' ')}); if(s.f==='marca'){ at['stroke-width']=w*5; at.opacity=.35; } return el('polyline',at); }
  if(s.f==='linha') return el('line',Object.assign({},base,{x1:a[0],y1:a[1],x2:b[0],y2:b[1]}));
  if(s.f==='seta'){ var g=el('g',{}), ang=Math.atan2(b[1]-a[1],b[0]-a[0]), L=Math.max(14*k,w*4);
    g.appendChild(el('line',Object.assign({},base,{x1:a[0],y1:a[1],x2:b[0],y2:b[1]})));
    g.appendChild(el('polygon',{fill:s.c,points:[b,[b[0]-L*Math.cos(ang-0.45),b[1]-L*Math.sin(ang-0.45)],[b[0]-L*Math.cos(ang+0.45),b[1]-L*Math.sin(ang+0.45)]].map(function(q){return q[0]+','+q[1];}).join(' ')})); return g; }
  if(s.f==='ret') return el('rect',Object.assign({},base,{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),width:Math.abs(b[0]-a[0]),height:Math.abs(b[1]-a[1])}));
  if(s.f==='circ') return el('ellipse',Object.assign({},base,{cx:(a[0]+b[0])/2,cy:(a[1]+b[1])/2,rx:Math.abs(b[0]-a[0])/2,ry:Math.abs(b[1]-a[1])/2}));
  var t=el('text',{x:a[0],y:a[1],fill:s.c,'font-size':(10+s.e*3)*k,'font-weight':'bold','font-family':'sans-serif','dominant-baseline':'hanging'}); t.textContent=s.t||''; return t;
}
// o mesmo desenho num canvas (para a miniatura que vai no chat)
function formaCanvas(x,s,k){
  var a=s.pts[0], b=s.pts[s.pts.length-1]; x.save(); x.strokeStyle=s.c; x.fillStyle=s.c; x.lineWidth=s.e*k; x.lineCap='round'; x.lineJoin='round';
  if(s.f==='marca'){ x.globalAlpha=.35; x.lineWidth=s.e*k*5; }
  if(s.f==='caneta'||s.f==='marca'){ x.beginPath(); x.moveTo(a[0],a[1]); s.pts.forEach(function(q){x.lineTo(q[0],q[1]);}); x.stroke(); }
  else if(s.f==='linha'||s.f==='seta'){ x.beginPath(); x.moveTo(a[0],a[1]); x.lineTo(b[0],b[1]); x.stroke();
    if(s.f==='seta'){ var ang=Math.atan2(b[1]-a[1],b[0]-a[0]), L=Math.max(14*k,s.e*k*4); x.beginPath(); x.moveTo(b[0],b[1]);
      x.lineTo(b[0]-L*Math.cos(ang-0.45),b[1]-L*Math.sin(ang-0.45)); x.lineTo(b[0]-L*Math.cos(ang+0.45),b[1]-L*Math.sin(ang+0.45)); x.closePath(); x.fill(); } }
  else if(s.f==='ret') x.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
  else if(s.f==='circ'){ x.beginPath(); x.ellipse((a[0]+b[0])/2,(a[1]+b[1])/2,Math.abs(b[0]-a[0])/2,Math.abs(b[1]-a[1])/2,0,0,2*Math.PI); x.stroke(); }
  else if(s.f==='texto'){ x.font='bold '+((10+s.e*3)*k)+'px sans-serif'; x.textBaseline='top'; x.fillText(s.t||'',a[0],a[1]); }
  x.restore();
}
function redesenha(p,extra){ while(p.gM.firstChild) p.gM.removeChild(p.gM.firstChild); var k=kDe(p);
  p.formas.forEach(function(s){ p.gM.appendChild(forma(s,k)); }); if(extra) p.gM.appendChild(forma(extra,k)); }
function ptDe(p,e){ var r=p.svg.getBoundingClientRect(); return [Math.round((e.clientX-r.left)*p.w/r.width*10)/10, Math.round((e.clientY-r.top)*p.h/r.height*10)/10]; }
var traco=null;
function ligaDesenho(p){
  p.svg.addEventListener('pointerdown',function(e){ if(!marcando) return; e.stopPropagation(); e.preventDefault(); var q=ptDe(p,e), esp=+$('vwEsp').value;
    if(ferr==='texto'){ var t=prompt('Texto da anotação:'); if(t){ p.formas.push({f:'texto',c:cor,e:esp,pts:[q],t:t.slice(0,200)}); pilha.push(p); redesenha(p); notaMarcas(); } return; }
    traco={p:p,s:{f:ferr,c:cor,e:esp,pts:[q,q]}}; try{ p.svg.setPointerCapture(e.pointerId); }catch(x){} });
  p.svg.addEventListener('pointermove',function(e){ if(!traco||traco.p!==p) return; var q=ptDe(p,e), s=traco.s;
    if(s.f==='caneta'||s.f==='marca'){ var u=s.pts[s.pts.length-1]; if(Math.hypot(q[0]-u[0],q[1]-u[1])>kDe(p)*0.8) s.pts.push(q); } else s.pts[1]=q; redesenha(p,s); });
  p.svg.addEventListener('pointerup',function(){ if(!traco||traco.p!==p) return; p.formas.push(traco.s); pilha.push(p); traco=null; redesenha(p); notaMarcas(); });
}
document.querySelectorAll('[data-vf]').forEach(function(b){ b.onclick=function(){ ferr=b.getAttribute('data-vf'); document.querySelectorAll('[data-vf]').forEach(function(x){x.classList.toggle('on',x===b);}); }; });
document.querySelectorAll('[data-vc]').forEach(function(b){ b.onclick=function(){ cor=b.getAttribute('data-vc'); document.querySelectorAll('[data-vc]').forEach(function(x){x.classList.toggle('on',x===b);}); }; });
$('vwDesf').onclick=function(){ var p=pilha.pop(); if(p){ p.formas.pop(); redesenha(p); notaMarcas(); } };
$('vwLimpa').onclick=function(){ if(pilha.length&&confirm('Apagar todas as marcações que ainda não foram enviadas?')){ pags.forEach(function(p){ p.formas=[]; redesenha(p); }); pilha=[]; notaMarcas(); } };
document.addEventListener('keydown',function(e){ if(marcando&&(e.ctrlKey||e.metaKey)&&e.key==='z'){ e.preventDefault(); $('vwDesf').click(); } });
function marcadas(){ return pags.filter(function(p){ return p.formas.length; }); }
function notaMarcas(){ var n=marcadas().length, nota=$('chMarcasNota'); if(!nota) return; nota.style.display=n?'block':'none';
  nota.textContent='✏️ '+n+' página'+(n===1?'':'s')+' marcada'+(n===1?'':'s')+' em '+(docAtual?docAtual.cod:'')+' — vão junto com a mensagem'; }
function podeMarcarAgora(){ var b=$('vwMarcar'), ok=docAtual&&C.podeMarcar[docAtual.id]&&docAtual.tipo!=='outro'; b.disabled=!ok; b.title=ok?'Desenhar sobre o PDF':'Esta revisão não pode ser marcada'; if(!ok) liga(false); }
function liga(on){ marcando=on; area.classList.toggle('marcando',on); $('vwTools').hidden=!on; $('vwMarcar').classList.toggle('on',on); $('vwMarcar').textContent=on?'✋ Mover a folha':'✏️ Marcar'; if(on) fechaVista(); }
$('vwMarcar').onclick=function(){ liga(!marcando); };
if(revSel) revSel.onchange=function(){ if(pilha.length&&!confirm('Trocar de revisão descarta as marcações ainda não enviadas. Continuar?')){ revSel.value=docAtual.id; return; } abrir(revSel.value); };

// ---------- ver uma marcação do chat por cima do PDF ----------
function fechaVista(){ vista=null; pags.forEach(function(p){ while(p.gV.firstChild) p.gV.removeChild(p.gV.firstChild); }); banner.hidden=true;
  document.querySelectorAll('.ch-msg.ativa').forEach(function(m){ m.classList.remove('ativa'); }); }
function verMarcacao(id){
  var m=C.marcas[id]; if(!m) return;
  if(!C.docs.some(function(d){return d.id===m.doc;})){ alert('Esta marcação foi feita numa revisão que você não tem acesso. Veja a miniatura.'); return; }
  if(pilha.length&&docAtual.id!==m.doc&&!confirm('Abrir esta marcação troca de revisão e descarta o que você marcou e não enviou. Continuar?')) return;
  liga(false);
  var mostra=function(){ fechaVista(); vista=m; var cx=null;
    m.paginas.forEach(function(pp){ var p=pags[pp.pagina-1]; if(!p) return; var k=kDe(p); pp.formas.forEach(function(s){ p.gV.appendChild(forma(s,k)); });
      if(!cx){ var xs=[],ys=[]; pp.formas.forEach(function(s){ s.pts.forEach(function(q){ xs.push(q[0]); ys.push(q[1]); }); });
        if(xs.length) cx={p:p,x:(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2,y:(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2}; } });
    banner.innerHTML='✏️ Marcação de <b>'+esc(m.por)+'</b> · '+esc(m.quando)+' · R'+String(m.rev).padStart(2,'0')+' <button type="button">✕ fechar (PDF limpo)</button>';
    banner.hidden=false; banner.querySelector('button').onclick=fechaVista;
    var msg=$('m-'+id); if(msg) msg.classList.add('ativa');
    if(cx){ area.scrollLeft=cx.p.wrap.offsetLeft+cx.x*zoom-area.clientWidth/2; area.scrollTop=cx.p.wrap.offsetTop+cx.y*zoom-area.clientHeight/2; } };
  if(docAtual&&docAtual.id===m.doc&&pags.length) mostra(); else abrir(m.doc,mostra);
  var cel=document.querySelector('.vw'); if(cel) { cel.classList.remove('so-chat'); cel.classList.add('so-pdf'); marcaCel(); }
}
document.querySelectorAll('[data-marca]').forEach(function(b){ b.onclick=function(){ verMarcacao(b.getAttribute('data-marca')); }; });

// ---------- enviar: texto + marcações (dados) + miniaturas ----------
function miniaturas(){
  var out=[], seq=Promise.resolve();
  marcadas().forEach(function(p){ seq=seq.then(function(){
    var s=1600/Math.max(p.w,p.h), c=document.createElement('canvas'); c.width=Math.round(p.w*s); c.height=Math.round(p.h*s); var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
    var fundo=p.pg ? p.pg.render({canvasContext:x,viewport:p.pg.getViewport({scale:s}),intent:'print'}).promise : Promise.resolve(x.drawImage(p.img,0,0,c.width,c.height));
    return fundo.then(function(){ x.save(); x.scale(s,s); var k=kDe(p); p.formas.forEach(function(f){ formaCanvas(x,f,k); }); x.restore();
      return new Promise(function(ok){ c.toBlob(function(b){ out.push({pagina:p.n,blob:b}); ok(); },'image/jpeg',0.85); }); }); }); });
  return seq.then(function(){ return out; });
}
var form=$('chNovo');
if(form) form.addEventListener('submit',function(e){
  e.preventDefault(); var bt=form.querySelector('button[type=submit]'), st=$('chStatus'); bt.disabled=true; st.textContent=marcadas().length?'preparando as marcações…':'enviando…';
  var fd=new FormData(form); if(docAtual) fd.append('docMarcado',docAtual.id);
  var m=marcadas(); if(m.length) fd.append('marcas',JSON.stringify(m.map(function(p){ return {pagina:p.n,formas:p.formas}; })));
  miniaturas().then(function(mins){ mins.forEach(function(x){ fd.append('imagem',x.blob,'pagina-'+x.pagina+'.jpg'); }); fd.append('paginas',mins.map(function(x){return x.pagina;}).join(','));
    st.textContent='enviando…'; return fetch(form.action,{method:'POST',body:fd,headers:{'Accept':'application/json'}}); })
  .then(function(r){ return r.json(); }).then(function(j){ if(j.erro) throw new Error(j.erro); pilha=[]; guarda();
    var url=form.getAttribute('action')+'?v='+encodeURIComponent(docAtual?docAtual.id:'');
    if(location.pathname+location.search===url){ location.hash='m-'+j.msg; location.reload(); } else location.href=url+'#m-'+j.msg; })
  .catch(function(er){ st.textContent='não enviou: '+er.message; bt.disabled=false; });
});

// ---------- fotos do chat: tela cheia com zoom ----------
var zb=$('chZoom'), zi=$('chZoomImg'), zs=1, zx=0, zy=0;
function zap(){ zi.style.transform='translate('+zx+'px,'+zy+'px) scale('+zs+')'; }
function zaj(){ var W=innerWidth,H=innerHeight; zs=Math.min(W/zi.naturalWidth,H/zi.naturalHeight)*0.96; zx=(W-zi.naturalWidth*zs)/2; zy=(H-zi.naturalHeight*zs)/2; zap(); }
function zz(k,cx,cy){ cx=cx==null?innerWidth/2:cx; cy=cy==null?innerHeight/2:cy; zx=cx-(cx-zx)*k; zy=cy-(cy-zy)*k; zs*=k; zap(); }
document.querySelectorAll('[data-zoom]').forEach(function(x){ x.onclick=function(){ zi.onload=zaj; zi.src=x.getAttribute('data-zoom'); $('chZoomAbrir').href=zi.src; zb.classList.add('on'); }; });
document.querySelectorAll('[data-z]').forEach(function(b){ b.onclick=function(){ var z=b.getAttribute('data-z'); if(z==='x') zb.classList.remove('on'); else if(z==='0') zaj(); else zz(+z); }; });
zb.addEventListener('wheel',function(e){ e.preventDefault(); zz(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY); },{passive:false});
var zt={}; zb.addEventListener('pointerdown',function(e){ if(e.target!==zi) return; zt[e.pointerId]={x:e.clientX,y:e.clientY}; try{ zi.setPointerCapture(e.pointerId); }catch(x){} });
zb.addEventListener('pointermove',function(e){ var t=zt[e.pointerId]; if(!t) return; zx+=e.clientX-t.x; zy+=e.clientY-t.y; zap(); t.x=e.clientX; t.y=e.clientY; });
['pointerup','pointercancel'].forEach(function(n){ zb.addEventListener(n,function(e){ delete zt[e.pointerId]; }); });
document.addEventListener('keydown',function(e){ if(e.key==='Escape'){ zb.classList.remove('on'); } });

// ---------- divisória: arrastar para dar mais espaço ao PDF ou ao chat (fica lembrado neste navegador) ----------
var vw=document.querySelector('.vw'), div=$('vwDiv'), LS=(function(){ try{ var s=window.localStorage; s.getItem('x'); return s; }catch(e){ return null; } })();
function largChat(px){ var W=vw.clientWidth; px=Math.max(340,Math.min(px,W*0.72)); vw.style.setProperty('--chat-w',px+'px'); return px; }
try{ var lc=LS&&+LS.getItem('docs-chat-w'); if(lc) largChat(lc); }catch(e){}
if(div) div.addEventListener('pointerdown',function(e){ e.preventDefault(); div.classList.add('on'); try{ div.setPointerCapture(e.pointerId); }catch(x){}
  var mexe=function(ev){ largChat(vw.getBoundingClientRect().right-ev.clientX-5); },
    solta=function(){ div.classList.remove('on'); div.removeEventListener('pointermove',mexe); div.removeEventListener('pointerup',solta); agenda();
      try{ LS&&LS.setItem('docs-chat-w',parseInt(getComputedStyle(vw).getPropertyValue('--chat-w'))||''); }catch(x){} };
  div.addEventListener('pointermove',mexe); div.addEventListener('pointerup',solta); });

// ---------- escrever: foto escolhida aparece no botão; Ctrl+Enter envia ----------
var fotoIn=document.querySelector('.ch-foto input');
if(fotoIn) fotoIn.onchange=function(){ var n=fotoIn.files.length; $('chFotoTxt').textContent=n?(n+' foto'+(n===1?'':'s')):'foto'; fotoIn.parentNode.classList.toggle('tem',!!n); };
var txt=document.querySelector('.ch-escreve textarea');
if(txt) txt.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.querySelector('button[type=submit]').click(); } });

// ---------- celular: PDF ou chat ----------
function marcaCel(){ var v=document.querySelector('.vw'); document.querySelectorAll('[data-cel]').forEach(function(b){ b.classList.toggle('on',v.classList.contains(b.getAttribute('data-cel'))); }); }
document.querySelectorAll('[data-cel]').forEach(function(b){ b.onclick=function(){ var v=document.querySelector('.vw'); v.classList.remove('so-pdf','so-chat'); v.classList.add(b.getAttribute('data-cel')); marcaCel(); if(b.getAttribute('data-cel')==='so-pdf') agenda(); }; });
marcaCel();

// ---------- começo ----------
var lista=$('chLista'); if(lista){ var h=location.hash, alvo=h&&document.querySelector(h); if(alvo) alvo.scrollIntoView({block:'center'}); else lista.scrollTop=lista.scrollHeight; }
var s0=lido(); abrir(C.v||(s0&&s0.v), function(){ if(C.marcar) liga(true); });
window.addEventListener('resize',function(){ agenda(); });
})();`;
