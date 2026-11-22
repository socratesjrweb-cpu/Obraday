// documentos-3d.js — o MODELO 3D (IFC) da Compatibilização (05/11).
//
//   · cada projetista manda o IFC da sua disciplina (ou .ifczip); mesmo nome + mesma disciplina = nova REVISÃO, e a anterior
//     fica guardada (nada some). Todos os modelos da obra abrem juntos, um encaixado no outro;
//   · o IFC é lido no próprio navegador (web-ifc) e desenhado com o three.js — as duas bibliotecas que ficam em
//     /assets/. O servidor só guarda e entrega o arquivo;
//   · por modelo: liga/desliga, transparência e ✋ AJUSTAR (deslocar X/Y/Z em metros e girar), para o modelo que veio com
//     outro ponto base; o ajuste fica gravado (o anterior também);
//   · pavimento (junta "Térreo" e "TERREO" das disciplinas), corte horizontal, cores da disciplina ou originais, 📏 medir
//     (distância, horizontal e vertical) e clique no elemento para ver o que é (tipo, nome, pavimento);
//   · 💥 CLASH 3D: clicar no ponto da interferência; o clash guarda o ponto, a câmera e a vista (modelos, transparências,
//     pavimento e corte) e entra no MESMO chat e na MESMA matriz da Compatibilização 2D.
// Este arquivo monta a tela e grava o envio, o ajuste e a remoção. Os dados ficam em documentos.json (modelos3d e compat).
import { createReadStream, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import * as PONTE from "../ponte-engenharia.js";
import { salvarArquivo, agoraLocalISO, OBRAS_DOCS, LIMITE_LOTE } from "../ponte-engenharia.js";
import { BASE_DOCS, DISCIPLINAS, COR_DISC, DIR_DOCS } from "./documentos.js";

// a biblioteca 3D em /assets/ (three + web-ifc + That Open, num arquivo só) e os .wasm do web-ifc. A tela carrega a versão
// "clássica" (window.ENG3D), do mesmo jeito que o pdf.js: a versão em módulo (engenharia-3d-2026-11.min.js) só abre com
// "import", que a trava não deixa escrever na pasta. Para gerar esta: --format=iife --global-name=ENG3D.
export const LIB_3D = "/assets/engenharia-3d-2026-11.global.min.js";
/** O envio de IFC está ligado na ponte? (.ifc aceito e LIMITE_IFC) */
export const ifcLigado = () => String(PONTE.ACCEPT || "").split(",").includes(".ifc");
export const limiteIFC = () => PONTE.LIMITE_IFC || LIMITE_LOTE;
const mb = n => n >= 1048576 ? (n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
const semAcento = t => String(t || "").normalize("NFD").replace(/[^A-Za-z0-9 ]/g, "");
const chaveDe = (disc, nome) => `${disc}|${semAcento(nome).toUpperCase().replace(/\s+/g, " ").trim()}`;
const podeVer = (u, obra) => !!u && BASE_DOCS.podeObra(u, obra);
const podeMexer = (u, obra) => podeVer(u, obra) && BASE_DOCS.acessoTotal(u);
const sigla = id => BASE_DOCS.siglaDisc(id);

/** Todos os envios de modelo da obra (com as revisões antigas e os removidos). */
const todosModelos = (d, obra) => ((d.modelos3d || {})[obra] || []);
/** Os modelos que valem: de cada (disciplina + nome), a revisão mais nova que não foi removida. */
export function modelosAtuais(d, obra) {
  const g = {}; todosModelos(d, obra).filter(m => !m.removido).forEach(m => { if (!g[m.chave] || m.rev > g[m.chave].rev) g[m.chave] = m; });
  return Object.values(g).sort((a, b) => DISCIPLINAS.findIndex(x => x.id === a.disc) - DISCIPLINAS.findIndex(x => x.id === b.disc) || a.nome.localeCompare(b.nome));
}

export function enviarModelo(user, obra, campos, arquivos) {
  if (!OBRAS_DOCS.some(o => o.id === obra) || !podeVer(user, obra)) return { erro: "Obra não encontrada." };
  if (!podeMexer(user, obra)) return { erro: "Só a engenharia, a Diretoria e os projetistas enviam modelo." };
  if (!ifcLigado()) return { erro: "O envio de IFC ainda não foi ligado no servidor (aceitar .ifc e LIMITE_IFC no envio)." };
  const disc = String(campos.disc || ""); if (!DISCIPLINAS.some(x => x.id === disc)) return { erro: "Escolha a disciplina do modelo." };
  const nome = String(campos.nome || "").trim().slice(0, 80) || (DISCIPLINAS.find(x => x.id === disc) || {}).nome;
  const fs = (arquivos || []).filter(f => f.campo === "arquivo" && f.buffer && f.buffer.length);
  if (fs.length !== 1) return { erro: "Escolha um arquivo .ifc (ou .ifczip)." };
  const f = fs[0]; if (![".ifc", ".ifczip"].includes(f.ext)) return { erro: "O modelo 3D precisa ser .ifc ou .ifczip." };
  let arquivo; try { arquivo = salvarArquivo(f, join(DIR_DOCS, "modelos")); } catch (e) { return { erro: `${f.nomeOriginal}: ${e.message}` }; }
  const d = BASE_DOCS.ler(), lista = ((d.modelos3d = d.modelos3d || {})[obra] = d.modelos3d[obra] || []), chave = chaveDe(disc, nome);
  const rev = Math.max(-1, ...lista.filter(m => m.chave === chave).map(m => m.rev)) + 1;
  const m = { id: randomBytes(6).toString("hex"), chave, disc, nome, rev, arquivo, ext: f.ext, tamanho: f.buffer.length, nomeOriginal: String(f.nomeOriginal || "").slice(0, 160),
    por: BASE_DOCS.quem(user), login: user.usuario, em: agoraLocalISO(), ...(BASE_DOCS.externo(user) ? { porExterno: true } : {}) };
  lista.push(m);
  BASE_DOCS.registrar(d, user, obra, `enviou o modelo 3D ${sigla(disc)} "${nome}" R${String(rev).padStart(2, "0")} (${mb(m.tamanho)})`);
  BASE_DOCS.gravar(d);
  return { ok: `Modelo ${sigla(disc)} "${nome}" R${String(rev).padStart(2, "0")} recebido.`, id: m.id };
}

/** Marca o modelo como removido (o arquivo e o registro ficam). A revisão anterior volta a valer. */
export function acaoModelo(user, obra, campos) {
  if (!podeMexer(user, obra)) return { erro: "Só a engenharia, a Diretoria e os projetistas mexem nos modelos." };
  const d = BASE_DOCS.ler(), m = todosModelos(d, obra).find(x => x.id === campos.id && !x.removido); if (!m) return { erro: "Modelo não encontrado." };
  if (campos.acao !== "remover") return { erro: "Nada para fazer." };
  m.removido = { por: BASE_DOCS.quem(user), login: user.usuario, em: agoraLocalISO() };
  BASE_DOCS.registrar(d, user, obra, `removeu o modelo 3D ${sigla(m.disc)} "${m.nome}" R${String(m.rev).padStart(2, "0")}`); BASE_DOCS.gravar(d);
  return { ok: `Modelo ${sigla(m.disc)} "${m.nome}" R${String(m.rev).padStart(2, "0")} removido (fica guardado no histórico).` };
}

/** Grava o ajuste (deslocamento em metros e giro em graus) de um modelo. Vale para as revisões seguintes; o anterior fica. */
export function salvarAjuste3d(user, obra, campos) {
  if (!podeMexer(user, obra)) return { erro: "Só a engenharia, a Diretoria e os projetistas ajustam os modelos." };
  const d = BASE_DOCS.ler(); if (!modelosAtuais(d, obra).some(m => m.chave === campos.chave)) return { erro: "Modelo não encontrado." };
  const n = k => { const v = Number(campos[k]); return Number.isFinite(v) ? v : NaN; }, aj = { x: n("x"), y: n("y"), z: n("z"), giro: n("giro") };
  if (Object.values(aj).some(v => !Number.isFinite(v)) || [aj.x, aj.y, aj.z].some(v => Math.abs(v) > 5000) || Math.abs(aj.giro) > 360) return { erro: "Ajuste fora do normal: confira os números." };
  const cp = ((d.compat = d.compat || {})[obra] = d.compat[obra] || { alinh: {} }), a3 = (cp.ajuste3d = cp.ajuste3d || {});
  if (a3[campos.chave]) (cp.ajuste3dAnteriores = cp.ajuste3dAnteriores || []).push({ chave: campos.chave, ...a3[campos.chave] });
  a3[campos.chave] = { x: Math.round(aj.x * 1000) / 1000, y: Math.round(aj.y * 1000) / 1000, z: Math.round(aj.z * 1000) / 1000, giro: Math.round(aj.giro * 1000) / 1000, por: BASE_DOCS.quem(user), login: user.usuario, em: agoraLocalISO() };
  const [disc, nm] = campos.chave.split("|");
  BASE_DOCS.registrar(d, user, obra, `ajustou o modelo 3D ${sigla(disc)} ${nm} (X ${a3[campos.chave].x} · Y ${a3[campos.chave].y} · Z ${a3[campos.chave].z} m · giro ${a3[campos.chave].giro}°)`);
  BASE_DOCS.gravar(d); return { ok: "Ajuste gravado." };
}

/** Entrega o arquivo do modelo, em pedaços (um IFC passa de 100 MB). Devolve false se não achou. */
export function mandarModelo(res, user, obra, id) {
  if (!podeVer(user, obra)) return false;
  const m = todosModelos(BASE_DOCS.ler(), obra).find(x => x.id === id), p = m && join(DIR_DOCS, "modelos", m.arquivo);
  if (!m || !existsSync(p)) return false;
  const nome = `${BASE_DOCS.siglaObra(obra)}-${sigla(m.disc)}-${semAcento(m.nome).replace(/\s+/g, "-")}-R${String(m.rev).padStart(2, "0")}${m.ext}`;
  res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": statSync(p).size, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "private, max-age=86400" });
  createReadStream(p).pipe(res); return true;
}

export const CSS_3D = `<style>
.m3-area{flex:1;position:relative;background:#2b2d33;overflow:hidden;touch-action:none;min-height:280px}
.m3-area canvas{display:block;width:100%;height:100%;cursor:grab}.m3-area.mira canvas{cursor:crosshair}
.m3-pins{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.m3-med{position:absolute;transform:translate(-50%,-120%);background:#ffd23f;color:#111;font:800 12px/1.2 sans-serif;padding:3px 7px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,.5)}
.m3-med small{font-weight:600}
.m3-info{position:absolute;left:10px;top:10px;max-width:min(380px,80%);background:rgba(17,17,20,.92);color:#eee;border:1px solid #444;border-radius:10px;padding:8px 11px;font-size:12px;line-height:1.55}
.m3-info b{color:#e9d49a}.m3-info button{float:right;border:0;background:none;color:#aaa;cursor:pointer;font-size:14px}
.m3-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#ddd;font-size:13.5px;padding:30px;pointer-events:none}
.m3-bar select,.m3-bar input{border:1px solid #3a3a42;background:#2a2a30;color:#eee;border-radius:7px;padding:3px 6px;font-size:12px;font-family:inherit}
.m3-bar label{display:inline-flex;gap:5px;align-items:center;font-size:12px;color:#ddd}.m3-bar input[type=range]{width:110px;accent-color:var(--acento);padding:0}
.m3-bar~.vw-banner.cp-ajbar .l>b:first-child{width:76px}.m3-bar~.vw-banner.cp-ajbar{max-height:46vh;overflow:auto}
.m3-bar button.on,.cp-cam button.on{background:var(--acento);color:#111}
.m3-st{color:#aaa;font-size:11.5px}.m3-st.er{color:#f0a3a3}
.m3-envio{font-size:12px;color:#ddd}.m3-envio summary{cursor:pointer;color:#e9d49a;font-weight:800}
.m3-envio form{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:5px}
.m3-envio select,.m3-envio input{border:1px solid #3a3a42;background:#111;color:#eee;border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit}
.m3-envio button{border:0;background:var(--acento);color:#111;font-weight:800;border-radius:7px;padding:4px 10px;cursor:pointer;font-family:inherit}
.m3-envio .dica{width:100%;color:#999;font-size:11.5px}
.m3-modo{display:flex;gap:6px;margin:0 0 8px}.m3-modo a{border:1px solid #ddd8c8;background:#fff;border-radius:9px;padding:6px 12px;font-weight:800;font-size:13px;text-decoration:none;color:#333}
.m3-modo a.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
</style>`;

// no 3D o fundo é escuro: a arquitetura (cinza-escuro nas pranchas) vira cinza-claro, como nos programas de BIM
const COR_3D = { ARQ: "#d9d3c5" };
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

/** A parte de cima da tela (a barra, a lista de modelos, o envio e a área do desenho). */
export function secao3d({ d, obra, user }) {
  const pode = podeMexer(user, obra), ms = modelosAtuais(d, obra), ligado = ifcLigado();
  const envio = pode ? (ligado ? `<details class="m3-envio"${ms.length ? "" : " open"}><summary>📤 Enviar modelo IFC</summary>
      <form id="m3Form"><select name="disc" required><option value="">disciplina…</option>${DISCIPLINAS.map(x => `<option value="${x.id}">${sigla(x.id)} — ${BASE_DOCS.esc(x.nome)}</option>`).join("")}</select>
        <input name="nome" maxlength="80" placeholder="nome do modelo (ex.: Esgoto e águas pluviais)" style="flex:1;min-width:160px">
        <input type="file" name="arquivo" accept=".ifc,.ifczip" required><button type="submit">Enviar ➤</button><span id="m3EnvSt" class="m3-st"></span>
        <div class="dica">Mesma disciplina e mesmo nome = <b>nova revisão</b> (a anterior fica guardada). Até ${mb(limiteIFC())} por arquivo; o .ifczip é bem menor.
          Peça aos projetistas o <b>mesmo ponto base do projeto</b> em todas as disciplinas — se algum vier deslocado, use ✋ ajustar.</div></form></details>`
    : `<div class="m3-st">📤 O envio de IFC ainda não está ligado no servidor (aceitar .ifc e LIMITE_IFC no envio).</div>`) : "";
  return `<section class="vw-pdf">
        <div class="vw-bar m3-bar"><button type="button" data-v3="geral" title="Enquadrar tudo">⌂ geral</button><button type="button" data-v3="planta" title="Vista de cima">⬆ planta</button><button type="button" data-v3="iso" title="Perspectiva">◩ 3D</button>
          <select id="m3Pav" title="Pavimento"><option value="">🏢 Todos os pavimentos</option></select>
          <label title="Corte horizontal: esconde o que está acima da altura escolhida">✂️ corte<input type="range" id="m3Corte" min="0" max="1000" value="1000"></label>
          <select id="m3Cor" title="Cores"><option value="disc">🎨 cor da disciplina</option><option value="orig">🎨 cores originais</option></select>
          <span style="flex:1"></span><button type="button" id="m3Medir">📏 medir</button><button type="button" id="cpClash" class="mk">💥 Marcar clash</button></div>
        <div class="cp-camadas" id="m3Lista">${envio}<div id="m3Mods"></div></div>
        <div class="vw-banner" id="vwBanner" hidden></div>
        <div class="m3-area" id="m3Area"><canvas id="m3Cv"></canvas><div class="m3-pins" id="m3Pins"></div><div class="m3-msg" id="m3Msg">${ms.length ? "Carregando o 3D…" : pode ? "Nenhum modelo 3D nesta obra ainda.<br>Envie o IFC de cada disciplina em “📤 Enviar modelo IFC”." : "Nenhum modelo 3D nesta obra ainda."}</div><div class="m3-info" id="m3Info" hidden></div></div>
      </section>`;
}

/** O script do 3D (os dados da obra + o código que roda no navegador). */
export function script3d({ d, obra, user, base, clashes }) {
  const aj = ((d.compat || {})[obra] || {}).ajuste3d || {};
  const cfg = { obra, base, pode: podeMexer(user, obra), lib: LIB_3D,
    modelos: modelosAtuais(d, obra).map(m => ({ id: m.id, chave: m.chave, disc: m.disc, sigla: sigla(m.disc), cor: COR_3D[m.disc] || COR_DISC[m.disc] || "#888", nome: m.nome, rev: m.rev, tamanho: m.tamanho, ext: m.ext,
      url: `${base}/modelo/${m.id}`, por: m.por, em: m.em, aj: aj[m.chave] ? { x: aj[m.chave].x, y: aj[m.chave].y, z: aj[m.chave].z, giro: aj[m.chave].giro } : null })),
    clashes };
  return `<script src="${LIB_3D}"></script><script>window.C3D=${json(cfg)};</script><script>${CODIGO}</script>`;
}

const CODIGO = `(function(){
const C=window.C3D, $=function(i){return document.getElementById(i);};
if(!window.ENG3D||!window.ENG3D.THREE||!window.ENG3D.WEBIFC){ const a=$('m3Msg'); if(a) a.innerHTML='A biblioteca 3D ainda não está no painel no formato que a tela usa.<br>Falta pôr <b>'+C.lib+'</b> em /assets/ (veja o LEIAME).'; return; }
const THREE=window.ENG3D.THREE, WEBIFC=window.ENG3D.WEBIFC;
const area=$('m3Area'), cv=$('m3Cv'), banner=$('vwBanner'), pinsBox=$('m3Pins'), info=$('m3Info'), aviso=$('m3Msg'), modsBox=$('m3Mods');
const esc=function(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
const br=function(v,c){ return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:c==null?2:c,maximumFractionDigits:c==null?2:c}); };
const normPav=function(t){ return String(t||'').normalize('NFD').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); };

// ---------- cena ----------
const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); renderer.localClippingEnabled=true;
const cena=new THREE.Scene(); cena.background=new THREE.Color(0x2b2d33);
const cam=new THREE.PerspectiveCamera(45,1,0.05,20000);
cena.add(new THREE.HemisphereLight(0xffffff,0x50505a,2.2));
const sol=new THREE.DirectionalLight(0xffffff,1.6); sol.position.set(0.45,1,0.3); cena.add(sol);
const mundo=new THREE.Group(); cena.add(mundo);
const corte=new THREE.Plane(new THREE.Vector3(0,-1,0),1e9);
let desloc=null;                       // coordenada do projeto = coordenada da cena + desloc (evita número enorme na placa de vídeo)
const M={}; let api=null, corModo='disc', pavSel='', modo=null, novoClash=null, ativo=null, aj=null, med=null, medidas=[], destaque=null, caixaTudo=null;
const alvo=new THREE.Vector3(); let dist=40, teta=0.75, fi=1.05;

let pedido=false; function pede(){ if(!pedido){ pedido=true; requestAnimationFrame(desenha); } }
function desenha(){ pedido=false; renderer.render(cena,cam); pinos(); }
function tam(){ const w=area.clientWidth, h=area.clientHeight; if(!w||!h) return; renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); renderer.render(cena,cam); pinos(); }   // desenha na hora: o tamanho novo apaga a tela
new ResizeObserver(tam).observe(area);
function poeCam(){ cam.position.set(alvo.x+dist*Math.sin(fi)*Math.sin(teta), alvo.y+dist*Math.cos(fi), alvo.z+dist*Math.sin(fi)*Math.cos(teta));
  cam.up.set(0,1,0); if(fi<0.02) cam.up.set(-Math.sin(teta),0,-Math.cos(teta)); cam.lookAt(alvo); cam.near=Math.max(0.01,dist/3000); cam.far=dist*60+5000; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); pede(); }
const projeto=function(v){ return [v.x+desloc.x, v.y+desloc.y, v.z+desloc.z]; };          // cena → projeto
const cenaDe=function(p){ return new THREE.Vector3(p[0]-desloc.x, p[1]-desloc.y, p[2]-desloc.z); };

// ---------- navegar: girar, arrastar, zoom no cursor, toque ----------
const ps=new Map(); let arr=null, moveu=false, pinca=null, guardaT=0;
function dois(){ const a=[...ps.values()]; return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}; }
function gira(dx,dy){ teta-=dx*0.006; fi=Math.min(Math.PI-0.01,Math.max(0.001,fi-dy*0.006)); poeCam(); }
function anda(dx,dy){ const k=dist*Math.tan(cam.fov*Math.PI/360)*2/Math.max(1,area.clientHeight), d=new THREE.Vector3(), u=new THREE.Vector3();
  d.setFromMatrixColumn(cam.matrixWorld,0); u.setFromMatrixColumn(cam.matrixWorld,1); alvo.addScaledVector(d,-dx*k).addScaledVector(u,dy*k); poeCam(); }
function aproxima(f,p){ f=Math.min(Math.max(f,0.2/dist),20000/dist); if(p) alvo.sub(p).multiplyScalar(f).add(p); dist*=f; poeCam(); }
function centra(p){ const P=cam.position.clone(); alvo.copy(p); const d=P.sub(alvo); dist=Math.max(0.3,d.length()); fi=Math.acos(Math.min(1,Math.max(-1,d.y/dist))); teta=Math.atan2(d.x,d.z); poeCam(); }
cv.addEventListener('pointerdown',function(e){ cv.setPointerCapture(e.pointerId); ps.set(e.pointerId,{x:e.clientX,y:e.clientY}); moveu=false;
  arr={pan:e.button===2||e.button===1||e.shiftKey}; if(ps.size===2) pinca=dois(); });
cv.addEventListener('pointermove',function(e){ const p=ps.get(e.pointerId); if(!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y; if(Math.abs(dx)+Math.abs(dy)>1) moveu=true; p.x=e.clientX; p.y=e.clientY;
  if(ps.size>=2){ const q=dois(); if(pinca&&q.d>0){ aproxima(pinca.d/q.d,null); anda(q.x-pinca.x,q.y-pinca.y); } pinca=q; return; }
  if(arr&&arr.pan) anda(dx,dy); else gira(dx,dy); });
cv.addEventListener('pointerup',function(e){ const n=ps.size; ps.delete(e.pointerId); if(ps.size<2) pinca=null; if(!moveu&&n===1&&e.button===0) clique(e); if(moveu) guardaDepois(); });
cv.addEventListener('pointercancel',function(e){ ps.delete(e.pointerId); pinca=null; });
cv.addEventListener('contextmenu',function(e){ e.preventDefault(); });
cv.addEventListener('wheel',function(e){ e.preventDefault(); const h=acerta(e); aproxima(Math.pow(1.0015,e.deltaY),h&&h.point); guardaDepois(); },{passive:false});
cv.addEventListener('dblclick',function(e){ const h=acerta(e); if(h){ centra(h.point); guardaDepois(); } });
function guardaDepois(){ clearTimeout(guardaT); guardaT=setTimeout(guarda,400); }

// ---------- o que está sob o cursor ----------
const ray=new THREE.Raycaster(), ptr=new THREE.Vector2();
function visiveis(){ const a=[]; Object.values(M).forEach(function(m){ (m.partes||[]).forEach(function(x){ if(x.visible&&m.vis) a.push(x); }); }); return a; }
function acerta(e){ const r=cv.getBoundingClientRect(); ptr.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1); ray.setFromCamera(ptr,cam);
  const hs=ray.intersectObjects(visiveis(),false); for(let i=0;i<hs.length;i++){ if(hs[i].point.y<=corte.constant+1e-4) return hs[i]; } return null; }
function clique(e){
  const h=acerta(e);
  if(modo==='medir'){ if(!h) return; mede(h.point); return; }
  if(modo==='clash'){ if(!h){ banner.querySelector('span').textContent='Clique em cima de um elemento do modelo.'; return; } novoClash={p3:projeto(h.point).map(function(v){return Math.round(v*1000)/1000;})}; abreForm(h); pede(); return; }
  if(!h){ fechaInfo(); return; } mostraInfo(h);
}

// ---------- abrir os IFC ----------
const vec=function(v){ const a=[]; if(!v) return a; for(let i=0;i<v.size();i++) a.push(v.get(i)); return a; };
async function iniciaApi(){ if(api) return api; api=new WEBIFC.IfcAPI(); api.SetWasmPath('/assets/',true); await api.Init(); return api; }
async function baixa(m){
  const r=await fetch(m.c.url); if(!r.ok) throw new Error('não abriu o arquivo ('+r.status+')');
  const tot=+r.headers.get('content-length')||m.c.tamanho||0, rd=r.body&&r.body.getReader(); if(!rd) return new Uint8Array(await r.arrayBuffer());
  const pedacos=[]; let n=0; for(;;){ const x=await rd.read(); if(x.done) break; pedacos.push(x.value); n+=x.value.length; estado(m,'baixando '+(tot?Math.min(100,Math.round(n/tot*100))+'%':Math.round(n/1048576)+' MB')); }
  const out=new Uint8Array(n); let p=0; pedacos.forEach(function(b){ out.set(b,p); p+=b.length; }); return out;
}
async function deszip(b){
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength); let e=b.length-22; while(e>=0&&dv.getUint32(e,true)!==0x06054b50) e--; if(e<0) throw new Error('.ifczip inválido');
  let p=dv.getUint32(e+16,true); const n=dv.getUint16(e+10,true);
  for(let i=0;i<n;i++){ const met=dv.getUint16(p+10,true), csz=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), xl=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    const nome=new TextDecoder().decode(b.subarray(p+46,p+46+nl));
    if(/[.]ifc$/i.test(nome)){ const ini=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true), dado=b.subarray(ini,ini+csz);
      if(met===0) return dado; if(met!==8) throw new Error('compressão do .ifczip não suportada');
      return new Uint8Array(await new Response(new Blob([dado]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    p+=46+nl+xl+cl; }
  throw new Error('não achei o .ifc dentro do .ifczip');
}
const espera=function(){ return new Promise(function(r){ setTimeout(r,0); }); };
async function carrega(m){
  try{
    await iniciaApi(); let buf=await baixa(m); if(m.c.ext==='.ifczip'){ estado(m,'descompactando…'); buf=await deszip(buf); }
    estado(m,'lendo o IFC…'); await espera();
    const id=api.OpenModel(buf,{COORDINATE_TO_ORIGIN:false}); if(id<0) throw new Error('o IFC não abriu (arquivo inválido ou versão não suportada)'); m.id=id;
    // pavimento de cada elemento: contido no pavimento, ou parte de algo que está (escada, telhado…), ou dentro de um ambiente do pavimento
    const ehPav=new Set(vec(api.GetLineIDsWithType(id,WEBIFC.IFCBUILDINGSTOREY))), pai=new Map();
    m.pavNome={}; ehPav.forEach(function(s){ try{ const l=api.GetLine(id,s); m.pavNome[s]=(l.Name&&l.Name.value)||(l.LongName&&l.LongName.value)||('#'+s); }catch(e){ m.pavNome[s]='#'+s; } });
    vec(api.GetLineIDsWithType(id,WEBIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)).forEach(function(r){ const l=api.GetLine(id,r), s=l.RelatingStructure&&l.RelatingStructure.value; (l.RelatedElements||[]).forEach(function(x){ if(x&&x.value) pai.set(x.value,s); }); });
    vec(api.GetLineIDsWithType(id,WEBIFC.IFCRELAGGREGATES)).forEach(function(r){ const l=api.GetLine(id,r), s=l.RelatingObject&&l.RelatingObject.value; (l.RelatedObjects||[]).forEach(function(x){ if(x&&x.value&&!pai.has(x.value)) pai.set(x.value,s); }); });
    const pavDe=function(eid){ let s=pai.get(eid), g=0; while(s&&!ehPav.has(s)&&g++<8) s=pai.get(s); return s&&ehPav.has(s)?s:0; };
    estado(m,'montando o 3D…'); await espera();
    const B={}, T=new THREE.Matrix4(), N3=new THREE.Matrix3(), v=new THREE.Vector3(), nv=new THREE.Vector3();
    api.StreamAllMeshes(id,function(fm){ const eid=fm.expressID, s=pavDe(eid), gs=fm.geometries;
      for(let i=0;i<gs.size();i++){ const pg=gs.get(i), c=pg.color, k=s+'|'+[c.x,c.y,c.z,c.w].map(function(x){return Math.round(x*255);}).join(',');
        const b=B[k]||(B[k]={s:s,cor:{r:c.x,g:c.y,b:c.z,a:c.w},pos:[],nor:[],eid:[],idx:[]});
        const g=api.GetGeometry(id,pg.geometryExpressID), va=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()), ia=api.GetIndexArray(g.GetIndexData(),g.GetIndexDataSize());
        T.fromArray(pg.flatTransformation); N3.getNormalMatrix(T); const n0=b.pos.length/3;
        for(let j=0;j<va.length;j+=6){ v.set(va[j],va[j+1],va[j+2]).applyMatrix4(T); nv.set(va[j+3],va[j+4],va[j+5]).applyMatrix3(N3).normalize(); b.pos.push(v.x,v.y,v.z); b.nor.push(nv.x,nv.y,nv.z); b.eid.push(eid); }
        for(let j=0;j<ia.length;j++) b.idx.push(n0+ia[j]);
        g.delete(); } });
    const bs=Object.values(B).filter(function(b){ return b.idx.length; }); if(!bs.length) throw new Error('o IFC não tem nenhum elemento com forma 3D');
    if(!desloc){ const bx=new THREE.Box3(); bs.forEach(function(b){ for(let j=0;j<b.pos.length;j+=3) bx.expandByPoint(v.set(b.pos[j],b.pos[j+1],b.pos[j+2])); });
      const c=bx.getCenter(new THREE.Vector3()); desloc=new THREE.Vector3(Math.round(c.x),Math.round(bx.min.y),Math.round(c.z)); mundo.position.copy(desloc).multiplyScalar(-1); }
    m.grupo=new THREE.Group(); m.partes=[];
    bs.forEach(function(b){ const g=new THREE.BufferGeometry(), nv0=b.pos.length/3;
      g.setAttribute('position',new THREE.Float32BufferAttribute(b.pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(b.nor,3)); g.setAttribute('eid',new THREE.BufferAttribute(new Uint32Array(b.eid),1));
      g.setIndex(nv0>65535?new THREE.Uint32BufferAttribute(b.idx,1):new THREE.Uint16BufferAttribute(b.idx,1)); g.computeBoundingBox(); g.computeBoundingSphere();
      const mat=new THREE.MeshLambertMaterial({side:THREE.DoubleSide,clippingPlanes:[corte],polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
      const me=new THREE.Mesh(g,mat);
      if(nv0<400000){ const ar=new THREE.LineSegments(new THREE.EdgesGeometry(g,25),new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:0.45,clippingPlanes:[corte]})); ar.raycast=function(){}; ar.userData.aresta=true; me.add(ar); }
      me.userData={m:m,pav:b.s,orig:new THREE.Color().setRGB(b.cor.r,b.cor.g,b.cor.b,THREE.SRGBColorSpace),alfa:b.cor.a}; m.grupo.add(me); m.partes.push(me); });
    mundo.add(m.grupo); poeAjuste(m); pinta(m); estado(m,''); m.ok=true; pavimentos(); faixaCorte(); pede();
  }catch(er){ m.erro=er.message||String(er); estado(m,'⚠️ '+m.erro,true); }
}

// ---------- aparência: cor, transparência, pavimento, corte ----------
function pinta(m){ const cd=new THREE.Color(m.c.cor);
  (m.partes||[]).forEach(function(me){ const u=me.userData, mt=me.material, op=m.op*(corModo==='orig'?u.alfa:1);
    mt.color.copy(corModo==='orig'?u.orig:cd); mt.opacity=op; mt.transparent=op<0.999; mt.depthWrite=op>=0.999; mt.needsUpdate=true;
    me.visible=m.vis&&(!pavSel||normPav(m.pavNome[u.pav]||'')===pavSel); me.renderOrder=op<0.999?1:0;
    me.children.forEach(function(a){ if(a.userData.aresta){ a.material.opacity=0.45*op; a.visible=op>0.15; } }); });
  pede(); }
function pintaTudo(){ Object.values(M).forEach(pinta); }
function pavimentos(){ const ps={}; Object.values(M).forEach(function(m){ (m.partes||[]).forEach(function(me){ const nome=m.pavNome[me.userData.pav]; if(!nome) return; const k=normPav(nome);
    me.geometry.computeBoundingBox(); const y=me.geometry.boundingBox.min.y+(m.grupo?m.grupo.position.y:0); if(!ps[k]||y<ps[k].y) ps[k]={nome:(ps[k]&&ps[k].nome)||nome,y:y}; }); });
  const s=$('m3Pav'), ks=Object.keys(ps).sort(function(a,b){ return ps[b].y-ps[a].y; });
  s.innerHTML='<option value="">🏢 Todos os pavimentos</option>'+ks.map(function(k){ return '<option value="'+esc(k)+'"'+(k===pavSel?' selected':'')+'>'+esc(ps[k].nome)+'</option>'; }).join(''); }
$('m3Pav').onchange=function(){ pavSel=this.value; pintaTudo(); guarda(); };
$('m3Cor').onchange=function(){ corModo=this.value; pintaTudo(); guarda(); };
function caixa(so){ const bx=new THREE.Box3(); Object.values(M).forEach(function(m){ if(!m.ok||(so&&!m.vis)) return; m.partes.forEach(function(me){ if(!so||me.visible) bx.expandByObject(me); }); }); return bx; }
function faixaCorte(){ caixaTudo=caixa(false); if(caixaTudo.isEmpty()) return; const r=$('m3Corte'); poeCorte(+r.value); }
function poeCorte(v){ if(!caixaTudo||caixaTudo.isEmpty()){ corte.constant=1e9; return; } const r=$('m3Corte');
  if(v>=1000){ corte.constant=1e9; r.title='sem corte'; } else { const y=caixaTudo.min.y+(caixaTudo.max.y-caixaTudo.min.y)*v/1000; corte.constant=y; r.title='corte na cota '+br(y+desloc.y)+' m'; } pede(); }
$('m3Corte').oninput=function(){ poeCorte(+this.value); };
$('m3Corte').onchange=guarda;
function enquadra(so){ const bx=caixa(so!==false); if(bx.isEmpty()) return; const c=bx.getCenter(new THREE.Vector3()), r=Math.max(1,bx.getSize(new THREE.Vector3()).length()/2);
  alvo.copy(c); dist=r/Math.sin(cam.fov*Math.PI/360)*1.05; poeCam(); }
document.querySelectorAll('[data-v3]').forEach(function(b){ b.onclick=function(){ const q=b.getAttribute('data-v3');
  if(q==='planta'){ fi=0.001; teta=0; } else if(q==='iso'){ fi=1.05; teta=0.75; } enquadra(true); guarda(); }; });

// ---------- lista de modelos ----------
C.modelos.forEach(function(c){ M[c.chave]={c:c,vis:true,op:1,aj:Object.assign({x:0,y:0,z:0,giro:0},c.aj||{})}; });
function estado(m,t,er){ const s=modsBox.querySelector('[data-k="'+CSS.escape(m.c.chave)+'"] .m3-st'); if(s){ s.textContent=t; s.classList.toggle('er',!!er); } }
function listaModelos(){
  modsBox.innerHTML=Object.values(M).map(function(m){ const c=m.c, a=m.aj, mexido=a.x||a.y||a.z||a.giro;
    return '<div class="cp-cam" data-k="'+esc(c.chave)+'"><span class="cp-cor" style="background:'+c.cor+'"></span><input type="checkbox" data-a="vis"'+(m.vis?' checked':'')+' title="mostrar / esconder">'
      +'<b style="color:'+c.cor+';filter:brightness(1.6)">'+esc(c.sigla)+'</b><span title="enviado por '+esc(c.por)+'">'+esc(c.nome)+' · R'+String(c.rev).padStart(2,'0')+'</span>'
      +'<input type="range" min="5" max="100" value="'+Math.round(m.op*100)+'" data-a="op" title="transparência"><span class="pct">'+Math.round(m.op*100)+'%</span>'
      +'<button type="button" data-a="ver" title="enquadrar este modelo">🎯</button>'
      +(C.pode?'<button type="button" data-a="aj" title="deslocar / girar este modelo">✋ ajustar</button>':'')+(mexido?'<span class="m3-st" title="ajuste gravado">✓ ajustado</span>':'')
      +'<a href="'+esc(c.url)+'" title="baixar o IFC" style="color:#aaa;text-decoration:none">⬇</a>'
      +(C.pode?'<button type="button" data-a="rm" title="remover este modelo (fica guardado)">🗑</button>':'')+'<span class="m3-st"></span></div>'; }).join('');
  modsBox.querySelectorAll('.cp-cam').forEach(function(row){ const m=M[row.getAttribute('data-k')];
    row.querySelector('[data-a=vis]').onchange=function(){ m.vis=this.checked; pinta(m); guarda(); };
    const r=row.querySelector('[data-a=op]'); r.oninput=function(){ m.op=r.value/100; row.querySelector('.pct').textContent=r.value+'%'; pinta(m); }; r.onchange=guarda;
    row.querySelector('[data-a=ver]').onclick=function(){ if(!m.ok) return; const bx=new THREE.Box3(); m.partes.forEach(function(me){ bx.expandByObject(me); }); if(bx.isEmpty()) return;
      alvo.copy(bx.getCenter(new THREE.Vector3())); dist=Math.max(2,bx.getSize(new THREE.Vector3()).length()/2)/Math.sin(cam.fov*Math.PI/360)*1.05; poeCam(); };
    const ba=row.querySelector('[data-a=aj]'); if(ba) ba.onclick=function(){ comecaAj(m); };
    const rm=row.querySelector('[data-a=rm]'); if(rm) rm.onclick=function(){ if(!confirm('Remover o modelo '+m.c.sigla+' "'+m.c.nome+'" R'+String(m.c.rev).padStart(2,'0')+'?\\nEle fica guardado no histórico; se houver revisão anterior, ela volta a valer.')) return;
      const f=document.createElement('form'); f.method='POST'; f.action=C.base+'/modelo-acao'; [['id',m.c.id],['acao','remover']].forEach(function(p){ const i=document.createElement('input'); i.type='hidden'; i.name=p[0]; i.value=p[1]; f.appendChild(i); }); document.body.appendChild(f); f.submit(); };
  });
}

// ---------- ✋ ajustar um modelo (deslocar e girar) ----------
function poeAjuste(m){ if(!m.grupo) return; const a=m.aj; m.grupo.position.set(a.x,a.z,-a.y); m.grupo.rotation.set(0,a.giro*Math.PI/180,0); m.grupo.updateMatrixWorld(true); pede(); }
function comecaAj(m){ fimModos(); aj={m:m,antes:Object.assign({},m.aj)}; banner.hidden=false; banner.className='vw-banner cp-ajbar';
  const lin=function(k,rot,passos,un){ return '<div class="l"><b>'+rot+'</b>'+passos.map(function(p){ return '<button type="button" data-d="'+k+':'+(-p)+'">−'+br(p,p<0.1?2:p<1?1:0)+'</button>'; }).join('')
    +'<input class="n" data-n="'+k+'" inputmode="decimal"> '+un+passos.slice().reverse().map(function(p){ return '<button type="button" data-d="'+k+':'+p+'">+'+br(p,p<0.1?2:p<1?1:0)+'</button>'; }).join('')+'</div>'; };
  banner.innerHTML='<div class="l"><b style="width:auto">✋ '+esc(m.c.sigla+' · '+m.c.nome)+'</b><span class="dica">Mova o modelo até encaixar nos outros (em metros). O giro é em torno da origem do projeto. Dica: deixe só a base e este modelo visíveis e use a planta.</span></div>'
    +lin('x','Leste (X)',[1,0.1,0.01],'m')+lin('y','Norte (Y)',[1,0.1,0.01],'m')+lin('z','Cota (Z)',[1,0.1,0.01],'m')+lin('giro','Giro',[90,1,0.1],'°')
    +'<div class="l"><button type="button" class="p" data-f="gravar">✓ gravar o ajuste</button><button type="button" data-f="zero">zerar</button><button type="button" data-f="cancelar">cancelar</button><span class="dica" id="m3AjSt"></span></div>';
  const mostra=function(){ banner.querySelectorAll('[data-n]').forEach(function(i){ if(document.activeElement!==i) i.value=br(m.aj[i.getAttribute('data-n')],3); }); };
  banner.querySelectorAll('[data-d]').forEach(function(b){ b.onclick=function(){ const p=b.getAttribute('data-d').split(':'); m.aj[p[0]]=Math.round((m.aj[p[0]]+(+p[1]))*1000)/1000; poeAjuste(m); mostra(); }; });
  banner.querySelectorAll('[data-n]').forEach(function(i){ i.onchange=function(){ const v=parseFloat(String(i.value).replace(/[.](?=.*[,])/g,'').replace(',','.')); if(isFinite(v)){ m.aj[i.getAttribute('data-n')]=v; poeAjuste(m); } mostra(); }; });
  banner.querySelector('[data-f=zero]').onclick=function(){ m.aj={x:0,y:0,z:0,giro:0}; poeAjuste(m); mostra(); };
  banner.querySelector('[data-f=cancelar]').onclick=function(){ fimAj(true); };
  banner.querySelector('[data-f=gravar]').onclick=function(){ const st=$('m3AjSt'); st.textContent='gravando…';
    fetch(C.base+'/ajuste3d',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({chave:m.c.chave,x:m.aj.x,y:m.aj.y,z:m.aj.z,giro:m.aj.giro})})
      .then(function(r){ return r.json(); }).then(function(j){ if(j.erro) throw new Error(j.erro); aj=null; banner.hidden=true; banner.className='vw-banner'; listaModelos(); pavimentos(); faixaCorte(); })
      .catch(function(er){ st.textContent='não gravou: '+er.message; }); };
  mostra(); }
function fimAj(desfaz){ if(!aj) return; if(desfaz){ aj.m.aj=aj.antes; poeAjuste(aj.m); } aj=null; banner.hidden=true; banner.className='vw-banner'; }

// ---------- informação do elemento clicado ----------
const TIPOS={Wall:"Parede",WallStandardCase:"Parede",Slab:"Laje",Column:"Pilar",Beam:"Viga",Footing:"Fundação",Pile:"Estaca",Member:"Peça",Plate:"Placa",Stair:"Escada",StairFlight:"Lance de escada",Ramp:"Rampa",Roof:"Cobertura",Railing:"Guarda-corpo",Door:"Porta",Window:"Janela",Covering:"Revestimento / forro",CurtainWall:"Pele de vidro",Space:"Ambiente",
  PipeSegment:"Tubo",PipeFitting:"Conexão",DuctSegment:"Duto",DuctFitting:"Conexão de duto",FlowTerminal:"Terminal",SanitaryTerminal:"Louça / metal",Valve:"Registro / válvula",Pump:"Bomba",Tank:"Reservatório",FlowSegment:"Tubulação",FlowFitting:"Conexão",
  CableCarrierSegment:"Eletrocalha / eletroduto",CableCarrierFitting:"Conexão elétrica",CableSegment:"Cabo",LightFixture:"Luminária",Outlet:"Tomada",SwitchingDevice:"Interruptor",ElectricDistributionBoard:"Quadro elétrico",BuildingElementProxy:"Elemento",FurnishingElement:"Mobiliário"};
function mostraInfo(h){ const me=h.object, m=me.userData.m, eid=me.geometry.attributes.eid.getX(h.face.a); let tipo='', nome='', tag='', obj='';
  try{ tipo=api.GetNameFromTypeCode(api.GetLineType(m.id,eid))||''; }catch(e){}
  try{ const l=api.GetLine(m.id,eid); nome=(l.Name&&l.Name.value)||''; tag=(l.Tag&&l.Tag.value)||''; obj=(l.ObjectType&&l.ObjectType.value)||''; }catch(e){}
  const p=projeto(h.point);
  info.hidden=false; info.innerHTML='<button type="button" title="fechar">✕</button><b>'+esc((function(t){ return TIPOS[t]||t; })(tipo.replace(/^Ifc/i,'')))+'</b> '+esc(nome)+(obj?' · '+esc(obj):'')+(tag?' · tag '+esc(tag):'')
    +'<br>Modelo: <b style="color:'+m.c.cor+';filter:brightness(1.6)">'+esc(m.c.sigla)+'</b> '+esc(m.c.nome)+' · R'+String(m.c.rev).padStart(2,'0')
    +'<br>Pavimento: '+esc(m.pavNome[me.userData.pav]||'—')+'<br>Ponto: X '+br(p[0])+' · Y '+br(-p[2])+' · cota '+br(p[1])+' m';
  info.querySelector('button').onclick=fechaInfo; destaca(me,eid); }
function fechaInfo(){ info.hidden=true; destaca(null); }
function destaca(me,eid){ if(destaque){ destaque.parent.remove(destaque); destaque.geometry.dispose(); destaque=null; } if(!me){ pede(); return; }
  const g=me.geometry, ix=g.index.array, ea=g.attributes.eid.array, sel=[]; for(let i=0;i<ix.length;i+=3){ if(ea[ix[i]]===eid) sel.push(ix[i],ix[i+1],ix[i+2]); }
  const ng=new THREE.BufferGeometry(); ng.setAttribute('position',g.attributes.position); ng.setAttribute('normal',g.attributes.normal); ng.setIndex(sel);
  destaque=new THREE.Mesh(ng,new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:0.65,side:THREE.DoubleSide,clippingPlanes:[corte],polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,depthWrite:false}));
  destaque.renderOrder=3; me.add(destaque); pede(); }

// ---------- 📏 medir ----------
const btMed=$('m3Medir');
btMed.onclick=function(){ if(modo==='medir'){ fimModos(); return; } fimModos(); modo='medir'; area.classList.add('mira'); btMed.classList.add('on'); med=null; banner.hidden=false; banner.className='vw-banner';
  banner.innerHTML='<span>📏 Clique no 1º ponto e depois no 2º (em cima dos elementos).</span> '+(medidas.length?'<button type="button" data-f="limpa">apagar as medidas</button> ':'')+'<button type="button" data-f="fim">pronto</button>';
  banner.querySelector('[data-f=fim]').onclick=fimModos; const l=banner.querySelector('[data-f=limpa]'); if(l) l.onclick=function(){ medidas.forEach(function(x){ cena.remove(x.obj); }); medidas=[]; l.remove(); pede(); }; };
function mede(p){ if(!med){ med={a:p.clone()}; banner.querySelector('span').textContent='📏 Agora o 2º ponto.'; return; }
  const a=med.a, b=p.clone(), g=new THREE.BufferGeometry().setFromPoints([a,b]), obj=new THREE.Group();
  obj.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffd23f,depthTest:false})));
  [a,b].forEach(function(q){ const s=new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.03,dist/400),12,8),new THREE.MeshBasicMaterial({color:0xffd23f,depthTest:false})); s.position.copy(q); obj.add(s); });
  obj.renderOrder=5; obj.children.forEach(function(c){ c.renderOrder=5; }); cena.add(obj);
  medidas.push({obj:obj,a:a,b:b,d:a.distanceTo(b),h:Math.hypot(b.x-a.x,b.z-a.z),v:Math.abs(b.y-a.y)}); med=null; banner.querySelector('span').textContent='📏 Medido. Clique em outro 1º ponto, ou em "pronto".'; pede(); }

// ---------- 💥 clash ----------
const btClash=$('cpClash');
btClash.onclick=function(){ if(modo==='clash'){ cancelaClash(); return; } fimModos(); modo='clash'; area.classList.add('mira'); btClash.classList.add('on'); banner.hidden=false; banner.className='vw-banner';
  banner.innerHTML='<span>💥 Clique no ponto da interferência, em cima do elemento.</span> <button type="button">cancelar</button>'; banner.querySelector('button').onclick=cancelaClash; };
function cancelaClash(){ if(modo==='clash'){ modo=null; area.classList.remove('mira'); } btClash.classList.remove('on'); novoClash=null; $('clForm').classList.remove('on'); banner.hidden=true; pede(); }
function abreForm(h){ modo=null; area.classList.remove('mira'); btClash.classList.remove('on'); banner.hidden=false;
  banner.innerHTML='💥 Ponto marcado. Preencha o clash no chat ao lado e envie. <button type="button">cancelar</button>'; banner.querySelector('button').onclick=cancelaClash;
  const f=$('clForm'); f.classList.add('on'); const vis=Object.values(M).filter(function(m){ return m.vis&&m.ok; }).map(function(m){ return m.c.disc; });
  f.querySelectorAll('input[name=discs]').forEach(function(ck){ ck.checked=vis.indexOf(ck.value)>=0; });
  if(h){ mostraInfo(h); }
  const cel=document.querySelector('.vw'); if(cel){ cel.classList.remove('so-pdf'); cel.classList.add('so-chat'); }
  f.querySelector('input[name=titulo]').focus(); }
function vista3(){ return {mods:Object.values(M).map(function(m){ return {k:m.c.chave,vis:m.vis,op:Math.round(m.op*100)/100}; }),pav:pavSel,corte:+$('m3Corte').value,cor:corModo}; }
function camProj(){ return {p:projeto(cam.position),a:projeto(alvo)}; }
function poeCamProj(c){ if(!c||!desloc) return; const P=cenaDe(c.p); alvo.copy(cenaDe(c.a)); const d=P.sub(alvo); dist=Math.max(0.3,d.length()); fi=Math.min(Math.PI-0.01,Math.max(0.001,Math.acos(Math.min(1,Math.max(-1,d.y/dist))))); teta=Math.atan2(d.x,d.z); poeCam(); }
function aplicaVista(v){ if(!v) return; (v.mods||[]).forEach(function(q){ const m=M[q.k]; if(m){ m.vis=!!q.vis; m.op=Math.max(0.05,Math.min(1,+q.op||1)); } });
  if(v.cor){ corModo=v.cor==='orig'?'orig':'disc'; $('m3Cor').value=corModo; } pavSel=v.pav||''; $('m3Pav').value=pavSel;
  if(v.corte!=null){ $('m3Corte').value=v.corte; poeCorte(+v.corte); } listaModelos(); pintaTudo(); }
function verClash(id,doDesenho){ const k=C.clashes.filter(function(x){ return x.id===id; })[0]; if(!k) return; ativo=id;
  document.querySelectorAll('.ch-msg.ativa').forEach(function(m){ m.classList.remove('ativa'); }); const msg=$('m-'+id); if(msg){ msg.classList.add('ativa'); if(doDesenho) msg.scrollIntoView({block:'center'}); }
  aplicaVista(k.vista3); poeCamProj(k.cam);
  const cel=document.querySelector('.vw'); if(cel&&!doDesenho){ cel.classList.remove('so-chat'); cel.classList.add('so-pdf'); } pede(); }
document.querySelectorAll('[data-clash]').forEach(function(b){ b.onclick=function(){ verClash(b.getAttribute('data-clash'),false); }; });

// alfinetes (clashes e medidas) acompanham a câmera
const ponto=new THREE.Vector3();
function tela(v){ ponto.copy(v).project(cam); if(ponto.z>1||ponto.z<-1) return null; return [(ponto.x+1)/2*area.clientWidth,(1-ponto.y)/2*area.clientHeight]; }
function pinos(){ pinsBox.innerHTML=''; if(!desloc) return;
  C.clashes.forEach(function(k){ const s=tela(cenaDe(k.p3)); if(!s) return; const a=document.createElement('div'); a.className='cp-pin'+(k.ok?' ok':'')+(ativo===k.id?' ativo':''); a.textContent='C-'+String(k.n).padStart(3,'0'); a.title=k.titulo;
    a.style.left=s[0]+'px'; a.style.top=s[1]+'px'; a.onclick=function(ev){ ev.stopPropagation(); verClash(k.id,true); }; pinsBox.appendChild(a); });
  if(novoClash){ const s=tela(cenaDe(novoClash.p3)); if(s){ const n=document.createElement('div'); n.className='cp-pin novo'; n.textContent='novo clash'; n.style.left=s[0]+'px'; n.style.top=s[1]+'px'; pinsBox.appendChild(n); } }
  medidas.forEach(function(x){ const s=tela(x.a.clone().add(x.b).multiplyScalar(0.5)); if(!s) return; const e=document.createElement('div'); e.className='m3-med';
    e.innerHTML=br(x.d)+' m<br><small>horiz. '+br(x.h)+' · vert. '+br(x.v)+'</small>'; e.style.left=s[0]+'px'; e.style.top=s[1]+'px'; pinsBox.appendChild(e); }); }
function fimModos(){ if(modo==='clash') cancelaClash(); if(modo==='medir'){ med=null; } modo=null; area.classList.remove('mira'); btMed.classList.remove('on'); btClash.classList.remove('on'); if(aj) fimAj(true); banner.hidden=true; banner.className='vw-banner'; pede(); }
document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&!/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||'')) fimModos(); });

// ---------- enviar (mensagem comum ou clash) ----------
const form=$('chNovo');
form.addEventListener('submit',function(e){ e.preventDefault(); const bt=form.querySelector('button[type=submit]'), st=$('chStatus'), fd=new FormData(form);
  if(novoClash){ const f=$('clForm'), discs=[].slice.call(f.querySelectorAll('input[name=discs]:checked')).map(function(c){ return c.value; });
    fd.append('clash',JSON.stringify({p3:novoClash.p3,cam:camProj(),titulo:f.querySelector('[name=titulo]').value,tipo:f.querySelector('[name=tipo]').value,grav:f.querySelector('[name=grav]').value,discs:discs,vista3:vista3()})); }
  bt.disabled=true; st.textContent='enviando…';
  fetch(form.getAttribute('action'),{method:'POST',body:fd,headers:{'Accept':'application/json'}}).then(function(r){ return r.json(); }).then(function(j){ if(j.erro) throw new Error(j.erro);
    novoClash=null; guarda(); const url=form.getAttribute('action'); if(location.pathname+location.search===url){ location.hash='m-'+j.msg; location.reload(); } else location.href=url+'#m-'+j.msg; })
  .catch(function(er){ st.textContent='não enviou: '+er.message; bt.disabled=false; }); });
const txt=form.querySelector('textarea'); txt.addEventListener('keydown',function(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); form.requestSubmit?form.requestSubmit():form.querySelector('button[type=submit]').click(); } });
const fotoIn=form.querySelector('.ch-foto input'); if(fotoIn) fotoIn.onchange=function(){ const n=fotoIn.files.length; $('chFotoTxt').textContent=n?(n+' foto'+(n===1?'':'s')):'foto'; fotoIn.parentNode.classList.toggle('tem',!!n); };

// ---------- 📤 enviar modelo (com a barra de progresso: um IFC passa de 100 MB) ----------
const mf=$('m3Form'); if(mf) mf.addEventListener('submit',function(e){ e.preventDefault(); const st=$('m3EnvSt'), bt=mf.querySelector('button'), fd=new FormData(mf), x=new XMLHttpRequest();
  bt.disabled=true; st.textContent='enviando…'; x.open('POST',C.base+'/modelo'); x.setRequestHeader('Accept','application/json');
  x.upload.onprogress=function(ev){ if(ev.lengthComputable) st.textContent='enviando '+Math.round(ev.loaded/ev.total*100)+'%'+(ev.loaded===ev.total?' — gravando…':''); };
  x.onload=function(){ let j={}; try{ j=JSON.parse(x.responseText); }catch(er){ j={erro:'resposta estranha do servidor ('+x.status+')'}; }
    if(j.erro){ st.textContent='não enviou: '+j.erro; st.classList.add('er'); bt.disabled=false; return; } location.href=C.base+'?v=3d&m='+encodeURIComponent(j.ok); };
  x.onerror=function(){ st.textContent='não enviou: a conexão caiu'; st.classList.add('er'); bt.disabled=false; }; x.send(fd); });

// ---------- celular: desenho ou chat ----------
document.querySelectorAll('[data-cel]').forEach(function(b){ b.onclick=function(){ const v=document.querySelector('.vw'); v.classList.remove('so-pdf','so-chat'); v.classList.add(b.getAttribute('data-cel'));
  document.querySelectorAll('[data-cel]').forEach(function(x){ x.classList.toggle('on',v.classList.contains(x.getAttribute('data-cel'))); }); tam(); }; });

// ---------- guardar a vista (só neste navegador) ----------
const CH='m3-'+C.obra;
function guarda(){ try{ if(desloc) localStorage.setItem(CH,JSON.stringify({cam:camProj(),vista:vista3()})); }catch(e){} }
function lido(){ try{ return JSON.parse(localStorage.getItem(CH)||'null'); }catch(e){ return null; } }

// ---------- começo ----------
const lista=$('chLista'); if(lista){ const h=location.hash, alvoM=h&&document.querySelector(h); if(alvoM) alvoM.scrollIntoView({block:'center'}); else lista.scrollTop=lista.scrollHeight; }
listaModelos(); tam(); poeCam();
(async function(){
  if(!C.modelos.length) return;
  const s0=lido(); if(s0&&s0.vista) (s0.vista.mods||[]).forEach(function(q){ const m=M[q.k]; if(m){ m.vis=!!q.vis; m.op=Math.max(0.05,Math.min(1,+q.op||1)); } });
  if(s0&&s0.vista){ corModo=s0.vista.cor==='orig'?'orig':'disc'; $('m3Cor').value=corModo; pavSel=s0.vista.pav||''; } listaModelos();
  for(const m of Object.values(M)){ await carrega(m); if(Object.values(M).filter(function(x){return x.ok;}).length===1){ aviso.hidden=true; enquadra(false); } }
  const ok=Object.values(M).filter(function(x){return x.ok;}).length; if(!ok){ aviso.hidden=false; aviso.textContent='Não deu para abrir os modelos. Veja o motivo na lista acima.'; return; }
  pavimentos(); if(s0&&s0.vista&&s0.vista.corte!=null){ $('m3Corte').value=s0.vista.corte; } faixaCorte(); pintaTudo();
  const h=location.hash; if(h.indexOf('#m-')===0&&C.clashes.some(function(x){ return x.id===h.slice(3); })) verClash(h.slice(3),false); else if(s0&&s0.cam) poeCamProj(s0.cam); else enquadra(false);
})();
})();
`;
