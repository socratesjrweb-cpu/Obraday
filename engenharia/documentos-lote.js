// documentos-lote.js — ENVIO EM LOTE de pranchas (06/11).
//
//   · arrasta vários arquivos de uma vez; cada arquivo vira uma LINHA com os seus campos ao lado: disciplina, se é nova
//     revisão de uma prancha que já existe, tipo, pavimento/local, nº da prancha, descrição e quem libera;
//   · o nome do arquivo já preenche o que der: "ELC-ARQ-EXE-G02-P03-R01 …pdf" → Arquitetura, tipo EXE, local G02,
//     prancha 3; se essa prancha já existe, a linha já vem como NOVA REVISÃO dela;
//   · "Preencher todas": escolhe uma vez e aplica em todas as linhas;
//   · TUDO OU NADA: se uma linha tiver problema, nada é gravado e a tela mostra o motivo ao lado da linha. Deu certo,
//     cada arquivo entra EM REVISÃO (como o envio de um por um) e as revisões avisam os contatos (📣 Avisos) num aviso só.
import { randomBytes } from "node:crypto";
import { shell, salvarArquivo, agoraLocalISO, OBRAS_DOCS, LIMITE_LOTE } from "../ponte-engenharia.js";
import { BASE_DOCS, DISCIPLINAS, DIR_DOCS, RESPONSAVEIS } from "./documentos.js";
// no lote, quem libera é sempre o mesmo (pedido dos projetistas, 17/11): o projetista não escolhe
const LIBERA_LOTE = "engenharia";

const json = o => JSON.stringify(o).replace(/</g, "\\u003c");
const ACEITA = [".pdf", ".dwg", ".dxf", ".jpg", ".jpeg", ".png"];

export function paginaLote(user, obraId) {
  const B = BASE_DOCS, o = OBRAS_DOCS.find(x => x.id === obraId); if (!o || !B.podeObra(user, obraId) || !B.acessoTotal(user)) return null;
  const d = B.ler(), vv = B.vivos(d), esc = B.esc;
  // de cada prancha da obra, a revisão mais nova (é dela que sai a "nova revisão")
  const atuais = {}; vv.filter(a => a.obra === obraId && a.origem !== "marcacao").forEach(a => { const k = `${a.disciplina}|${a.numero}`; if (!atuais[k] || a.rev > atuais[k].rev) atuais[k] = a; });
  const cfg = { obra: obraId, limite: LIMITE_LOTE, aceita: ACEITA,
    discs: DISCIPLINAS.map(x => ({ id: x.id, sigla: B.siglaDisc(x.id), nome: x.nome, tipos: B.tiposAtivos(d, x.id).map(t => ({ s: t.sigla, n: t.nome })) })),
    locais: B.locaisAtivos(d).map(l => ({ s: l.sigla, n: l.nome })), libera: (RESPONSAVEIS.find(r => r.id === LIBERA_LOTE) || {}).nome || "",
    atuais: Object.values(atuais).sort((a, b) => B.codigo(a).localeCompare(B.codigo(b))).map(a => ({ id: a.id, disc: a.disciplina, cod: B.codigo(a), tipo: a.tipo || "", local: a.local || "", prancha: a.prancha || 0, desc: String(a.descricao || "").slice(0, 60), sit: B.situacao(a, vv) })) };
  const body = `${B.CSS}${CSS_LOTE}<a class="pg-volta" href="/documentos/${o.id}"><span class="seta">←</span> ${esc(o.nome)}</a>
    <div style="display:flex;align-items:center;gap:12px;margin:10px 0 0"><h1 style="margin:0">📦 Enviar em lote · ${esc(o.nome)}</h1><span class="dc-cod">${B.siglaObra(o.id)}</span></div>
    <div class="lt-zona" id="ltZona"><input type="file" id="ltArq" multiple accept="${ACEITA.join(",")},application/pdf,image/*">
      <b>Arraste os arquivos aqui</b> ou <u>clique para escolher</u><br><span>PDF, DWG, DXF ou foto · até ${Math.round(LIMITE_LOTE / 1048576)} MB por envio · o nome no padrão ${B.siglaObra(o.id)}-ARQ-EXE-TER-P01-R00 já preenche os campos</span></div>
    <div class="lt-geral"><div><label>Disciplina <i>(vale para todos os arquivos)</i></label>
        <select id="ltDisc"><option value="">escolha…</option>${cfg.discs.map(x => `<option value="${x.id}">${x.sigla} — ${esc(x.nome)}</option>`).join("")}</select></div>
      <div><label>Tipo <i>(vale para todos os arquivos)</i></label><select id="ltTipo" disabled><option value="">escolha a disciplina…</option></select></div>
      <div class="lt-lib"><label>Quem libera</label><b>${esc(cfg.libera)}</b></div></div>
    <div class="lt-todas" id="ltTodas" hidden><b>Pavimento / local em todas:</b>
      <select data-t="local"><option value="">escolha…</option>${cfg.locais.map(l => `<option value="${esc(l.s)}">${esc(l.s)} — ${esc(l.n)}</option>`).join("")}</select>
      <button type="button" class="dc-bt" id="ltAplica">aplicar nas linhas</button><span class="lt-dica">(nas novas revisões, tipo, local e prancha vêm da prancha original)</span></div>
    <div class="lt-rola"><table class="dc-t lt-t" id="ltTab" hidden><thead><tr><th>#</th><th>Arquivo</th><th>Nova revisão de…</th><th>Pavimento / local</th><th>Prancha</th><th>Descrição</th></tr></thead><tbody></tbody></table></div>
    <div class="lt-pe" id="ltPe" hidden><span id="ltResumo"></span><span style="flex:1"></span><span id="ltSt"></span><button type="button" class="dc-bt" id="ltEnviar" style="padding:10px 20px;font-size:13px">Enviar tudo ➤</button></div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      Cada arquivo é uma prancha. A <b>disciplina</b> e o <b>tipo</b> são escolhidos uma vez só, no alto, e valem para o lote inteiro
      (se precisar mandar outra disciplina ou outro tipo, faça outro envio). Quem libera é sempre <b>${esc(cfg.libera)}</b>.
      Se o arquivo for <b>nova revisão</b> de uma prancha que já existe, escolha qual — o tipo, o local e o nº vêm dela, e a revisão sobe sozinha (R00 → R01).
      Se for prancha nova, preencha <b>pavimento/local</b> e o <b>nº da prancha</b> (o do carimbo). A descrição vazia usa o nome do arquivo.
      O envio é <b>tudo ou nada</b>: se uma linha tiver problema, nada é gravado e o motivo aparece em vermelho ao lado dela. Tudo entra <b>em revisão</b> — a obra só vê depois de liberado —
      e quem está em <b>📣 Avisos</b> recebe um aviso só com as revisões do lote.</div></details>
    <script>window.LOTE=${json(cfg)};</script><script>${CODIGO}</script>`;
  return shell({ title: `Enviar em lote · ${o.nome}`, body, user });
}

const CSS_LOTE = `<style>
.lt-zona{position:relative;margin:14px 0 10px;border:2px dashed #d3c79f;background:#fcfbf6;border-radius:14px;padding:26px 14px;text-align:center;font-size:14px;cursor:pointer}
.lt-zona span{font-size:12px;color:var(--mut)}.lt-zona.sobre{background:#fff6dd;border-color:var(--acento)}
.lt-zona input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}
.lt-geral{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:flex-end;background:#1a1a1d;color:#eee;border-radius:12px;padding:12px 14px;margin:0 0 8px}
.lt-geral label{display:block;font-size:11.5px;color:#c9a34a;font-weight:700;margin-bottom:4px;text-transform:uppercase;letter-spacing:.3px}.lt-geral label i{text-transform:none;font-weight:400;color:#aaa}
.lt-geral select{min-width:240px;max-width:100%;padding:8px 9px;border:1px solid #3a3a42;background:#2a2a30;color:#eee;border-radius:8px;font-size:13px;font-family:inherit}.lt-geral select:disabled{opacity:.55}
.lt-geral .lt-lib b{display:inline-block;padding:8px 10px;border:1px solid #3a3a42;border-radius:8px;font-size:13px;color:#fff}
.lt-todas{display:flex;flex-wrap:wrap;gap:6px;align-items:center;background:#1a1a1d;color:#eee;border-radius:12px;padding:8px 10px;font-size:12.5px;margin-bottom:8px}
.lt-todas select{padding:5px 7px;border:1px solid #3a3a42;background:#2a2a30;color:#eee;border-radius:7px;font-size:12px;font-family:inherit}.lt-dica{color:#aaa;font-size:11.5px}
.lt-rola{overflow-x:auto}.lt-t{min-width:1100px}.lt-t td{vertical-align:top;padding:6px 5px}
.lt-t select,.lt-t input{width:100%;box-sizing:border-box;padding:5px 6px;border:1px solid #ddd8c8;border-radius:7px;font-size:12px;font-family:inherit;background:#fff}
.lt-t input[type=number]{width:62px}.lt-t select:disabled,.lt-t input:disabled{background:#f3f1ea;color:#777}
.lt-t .nome{font-weight:700;word-break:break-all;max-width:220px;font-size:12px}.lt-t .tam{font-size:11px;color:var(--mut)}
.lt-t .x{border:0;background:none;color:#a12d2d;cursor:pointer;font-size:13px;padding:0 4px}
.lt-t tr.erro td{background:#fdf0ef}.lt-t .msg{color:#a12d2d;font-size:11.5px;font-weight:700;margin-top:3px}.lt-t .rev{color:#2f5d8a;font-size:11px;margin-top:3px}
.lt-pe{position:sticky;bottom:0;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff;border-top:2px solid var(--acento);padding:10px 4px;margin-top:8px;font-size:13px;z-index:5}
#ltSt.er{color:#a12d2d;font-weight:700}
</style>`;

const CODIGO = `(function(){
var C=window.LOTE, $=function(i){return document.getElementById(i);}, linhas=[], tbody=$('ltTab').querySelector('tbody'), G={disc:'',tipo:''};
var esc=function(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
var mb=function(b){ return b>=1048576?(b/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(b/1024))+' KB'; };
var disc=function(id){ return C.discs.filter(function(x){return x.id===id;})[0]; };
var opts=function(l,v,vazio){ return '<option value="">'+vazio+'</option>'+l.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===v?' selected':'')+'>'+esc(o[1])+'</option>'; }).join(''); };
// o nome do arquivo no padrão OBRA-DISC-TIPO-LOCAL-Pnn-Rnn já diz quase tudo
function lerNome(nome){ var m=/([A-Z]{3})-([A-Z]{3,4})-([A-Z0-9]{2,8})-([A-Z0-9]{2,8})-P(\\d{1,3})(?:-R(\\d{1,2}))?/i.exec(nome); if(!m) return {};
  var sg=m[2].toUpperCase(), dd=C.discs.filter(function(x){ return x.sigla===sg||x.id===sg; })[0]; if(!dd) return {};
  return {disc:dd.id,tipo:m[3].toUpperCase(),local:m[4].toUpperCase(),prancha:+m[5]}; }
// a revisão é achada pela disciplina do lote, o tipo do nome do arquivo (ou o do lote), o local e o nº
function achaRev(l){ var tp=l.tipoN||G.tipo; if(!G.disc||!tp||!l.local||!l.prancha) return ''; var a=C.atuais.filter(function(x){ return x.disc===G.disc&&x.tipo===tp&&x.local===l.local&&x.prancha===l.prancha; })[0]; return a?a.id:''; }
var sDi=$('ltDisc'), sTi=$('ltTipo');
function opTipos(){ var dd=disc(G.disc); sTi.disabled=!dd; sTi.innerHTML=dd?opts(dd.tipos.map(function(t){return [t.s,t.s+' — '+t.n];}),G.tipo,'escolha…'):'<option value="">escolha a disciplina…</option>'; sDi.value=G.disc; }
function poeGeral(dc,tp){ if(dc!==G.disc){ G.disc=dc; linhas.forEach(function(l){ l.revDe=''; l.aviso=''; }); } var dd=disc(G.disc); G.tipo=dd&&dd.tipos.some(function(t){return t.s===tp;})?tp:'';
  linhas.forEach(function(l){ if(!l.revDe) l.revDe=achaRev(l); l.erro=''; }); opTipos(); }
sDi.onchange=function(){ poeGeral(sDi.value,G.tipo); desenha(); };
sTi.onchange=function(){ poeGeral(G.disc,sTi.value); desenha(); };
function poe(files){ [].slice.call(files).forEach(function(f){ var ext=(f.name.match(/[.][^.]+$/)||[''])[0].toLowerCase();
    var l={f:f,ext:ext,revDe:'',tipoN:'',local:'',prancha:'',desc:'',erro:C.aceita.indexOf(ext)<0?'tipo de arquivo não aceito ('+(ext||'sem extensão')+')':''};
    var n=lerNome(f.name); if(n.disc){ if(!G.disc) poeGeral(n.disc,G.tipo||n.tipo); else if(!G.tipo&&n.disc===G.disc) poeGeral(G.disc,n.tipo);
      if(C.locais.some(function(x){return x.s===n.local;})) l.local=n.local; l.prancha=n.prancha;
      if(n.disc===G.disc){ l.tipoN=n.tipo; l.revDe=achaRev(l); } else l.aviso='o nome do arquivo diz '+disc(n.disc).sigla+', mas o lote é de '+disc(G.disc).sigla; }
    linhas.push(l); }); desenha(); }
function desenha(){
  $('ltTab').hidden=$('ltPe').hidden=$('ltTodas').hidden=!linhas.length;
  tbody.innerHTML=linhas.map(function(l,i){ var base=C.atuais.filter(function(a){return a.id===l.revDe;})[0], herda=!!(base&&base.local&&base.tipo);
    return '<tr data-i="'+i+'"'+(l.erro?' class="erro"':'')+'><td>'+(i+1)+'<br><button type="button" class="x" data-a="x" title="tirar da lista">✕</button></td>'
      +'<td><div class="nome">'+esc(l.f.name)+'</div><div class="tam">'+mb(l.f.size)+'</div>'+(l.erro?'<div class="msg">'+esc(l.erro)+'</div>':'')+(l.aviso&&!l.erro?'<div class="rev" style="color:#9a6a00">⚠ '+esc(l.aviso)+'</div>':'')+'</td>'
      +'<td><select data-c="revDe"'+(G.disc?'':' disabled')+'>'+opts(C.atuais.filter(function(a){return a.disc===G.disc;}).map(function(a){return [a.id,a.cod+' · '+a.desc];}),l.revDe,'— prancha nova —')+'</select>'+(base?'<div class="rev">↻ vira R'+String(+base.cod.slice(-2)+1).padStart(2,'0')+(herda&&base.tipo!==G.tipo?' · tipo '+esc(base.tipo)+' (da prancha)':'')+(base.sit==='liberado'?' (a liberada continua valendo até a nova ser liberada)':'')+'</div>':'')+'</td>'
      +'<td><select data-c="local"'+(herda?' disabled':'')+'>'+opts(C.locais.map(function(x){return [x.s,x.s+' — '+x.n];}),herda?base.local:l.local,herda?base.local:'escolha…')+'</select></td>'
      +'<td><input type="number" data-c="prancha" min="1" max="999" value="'+esc(herda?base.prancha:l.prancha)+'"'+(herda?' disabled':'')+'></td>'
      +'<td><input data-c="desc" maxlength="160" value="'+esc(l.desc)+'" placeholder="'+esc(base?base.desc:l.f.name.replace(/[.][^.]+$/,''))+'"></td></tr>'; }).join('');
  var tot=linhas.reduce(function(s,l){return s+l.f.size;},0); $('ltResumo').innerHTML='<b>'+linhas.length+'</b> arquivo'+(linhas.length===1?'':'s')+' · '+mb(tot)+(tot>C.limite?' · <b style="color:#a12d2d">passa de '+mb(C.limite)+': envie em duas vezes</b>':'');
}
tbody.addEventListener('change',function(e){ var t=e.target, tr=t.closest('tr'); if(!tr) return; var l=linhas[+tr.getAttribute('data-i')], c=t.getAttribute('data-c'); if(!c) return;
  l[c]=c==='prancha'?(t.value?+t.value:''):t.value; l.erro=''; $('ltSt').textContent='';
  if(c==='local'||c==='prancha'){ if(!l.revDe) l.revDe=achaRev(l); }
  if(c!=='desc') desenha(); });
tbody.addEventListener('click',function(e){ if(e.target.getAttribute('data-a')!=='x') return; linhas.splice(+e.target.closest('tr').getAttribute('data-i'),1); desenha(); });
// preencher todas
$('ltAplica').onclick=function(){ var v=document.querySelector('[data-t=local]').value; if(!v) return;
  linhas.forEach(function(l){ l.local=v; if(!l.revDe) l.revDe=achaRev(l); l.erro=''; }); desenha(); };
// arrastar e escolher
var z=$('ltZona'), inp=$('ltArq');
inp.onchange=function(){ poe(inp.files); inp.value=''; };
['dragenter','dragover'].forEach(function(t){ z.addEventListener(t,function(e){ e.preventDefault(); z.classList.add('sobre'); }); });
['dragleave','drop'].forEach(function(t){ z.addEventListener(t,function(e){ e.preventDefault(); z.classList.remove('sobre'); }); });
z.addEventListener('drop',function(e){ if(e.dataTransfer&&e.dataTransfer.files) poe(e.dataTransfer.files); });
// enviar (tudo ou nada)
$('ltEnviar').onclick=function(){ var st=$('ltSt'), bt=$('ltEnviar'); st.className='';
  if(linhas.some(function(l){return l.erro&&/tipo de arquivo/.test(l.erro);})){ st.className='er'; st.textContent='Tire da lista os arquivos que não são aceitos.'; return; }
  if(!G.disc){ st.className='er'; st.textContent='Escolha a disciplina, no alto.'; sDi.focus(); return; }
  if(!G.tipo&&linhas.some(function(l){ var b=C.atuais.filter(function(a){return a.id===l.revDe;})[0]; return !(b&&b.tipo&&b.local); })){ st.className='er'; st.textContent='Escolha o tipo, no alto.'; sTi.focus(); return; }
  var fd=new FormData(); linhas.forEach(function(l){ fd.append('arquivo',l.f,l.f.name); });
  fd.append('linhas',JSON.stringify(linhas.map(function(l){ return {disc:G.disc,revDe:l.revDe,tipo:G.tipo,local:l.local,prancha:l.prancha,descricao:l.desc}; })));
  var x=new XMLHttpRequest(); bt.disabled=true; st.textContent='enviando…'; x.open('POST','/documentos/'+C.obra+'/lote'); x.setRequestHeader('Accept','application/json');
  x.upload.onprogress=function(ev){ if(ev.lengthComputable) st.textContent='enviando '+Math.round(ev.loaded/ev.total*100)+'%'+(ev.loaded===ev.total?' — conferindo e gravando…':''); };
  x.onload=function(){ var j={}; try{ j=JSON.parse(x.responseText); }catch(er){ j={erro:'resposta estranha do servidor ('+x.status+')'}; }
    if(j.ok){ location.href='/documentos/'+C.obra+'?m='+encodeURIComponent(j.ok); return; }
    bt.disabled=false; st.className='er'; st.textContent=j.erro||'Não gravou.';
    (j.erros||[]).forEach(function(e){ if(linhas[e.i]) linhas[e.i].erro=e.msg; }); desenha(); var p=tbody.querySelector('tr.erro'); if(p) p.scrollIntoView({block:'center'}); };
  x.onerror=function(){ bt.disabled=false; st.className='er'; st.textContent='A conexão caiu. Nada foi gravado.'; }; x.send(fd); };
})();`;

/** Grava o lote: confere TODAS as linhas antes; se uma tiver problema, nada é gravado. */
export function enviarLote(user, obraId, campos, arquivos) {
  const B = BASE_DOCS; if (!OBRAS_DOCS.some(o => o.id === obraId) || !B.podeObra(user, obraId)) return { erro: "Sem acesso a esta obra." };
  if (!B.acessoTotal(user)) return { erro: "Quem envia projeto é a engenharia, a Diretoria ou o projetista." };
  let ls; try { ls = JSON.parse(campos.linhas || "[]"); } catch { return { erro: "Lista de arquivos ilegível." }; }
  const fs = (arquivos || []).filter(a => a.campo === "arquivo");
  if (!fs.length) return { erro: "Escolha ao menos um arquivo." };
  if (!Array.isArray(ls) || ls.length !== fs.length) return { erro: "A lista de campos não bate com os arquivos. Recarregue a página e tente de novo." };
  const d = B.ler(), vv = B.vivos(d), erros = [], plano = [], usados = new Set(), revs = new Set();
  const doMesmo = disc => vv.filter(a => a.obra === obraId && a.disciplina === disc && a.origem !== "marcacao");
  ls.forEach((l, i) => {
    const err = msg => erros.push({ i, msg }), f = fs[i];
    if (!f.buffer || !f.buffer.length) return err("arquivo vazio");
    if (!ACEITA.includes(f.ext)) return err(`tipo de arquivo não aceito (${f.ext || "sem extensão"})`);
    const disc = DISCIPLINAS.find(x => x.id === l.disc); if (!disc) return err("escolha a disciplina");
    const base = l.revDe ? doMesmo(disc.id).find(a => a.id === l.revDe) : null; if (l.revDe && !base) return err("a prancha de origem da revisão não foi encontrada");
    if (base) { if (revs.has(`${base.disciplina}|${base.numero}`)) return err(`duas revisões da mesma prancha (${B.codigo(base)}) no mesmo lote`); revs.add(`${base.disciplina}|${base.numero}`);
      const maisNova = doMesmo(disc.id).filter(a => a.numero === base.numero).reduce((m, a) => a.rev > m.rev ? a : m, base); if (maisNova.id !== base.id) return err(`já existe revisão mais nova: ${B.codigo(maisNova)}`); }
    const local = base && base.local ? base.local : B.limparLocal(l.local), tipo = base && base.tipo ? base.tipo : String(l.tipo || ""), prancha = base && base.local ? base.prancha : Number(l.prancha);
    if (!tipo) return err(`escolha o tipo (${disc.nome})`); if (!(base && base.tipo) && !B.tiposAtivos(d, disc.id).some(t => t.sigla === tipo)) return err(`o tipo ${tipo} não está na lista de ${disc.nome}`);
    if (!local) return err("escolha o pavimento ou local"); if (!(base && base.local) && !B.locaisAtivos(d).some(x => x.sigla === local)) return err(`o local ${local} não está na lista`);
    if (!Number.isInteger(prancha) || prancha < 1 || prancha > 999) return err("informe o nº da prancha (1 a 999)");
    const k = `${disc.id}|${tipo}|${local}|${prancha}`;
    if (!base) { const ja = doMesmo(disc.id).find(a => (a.tipo || "") === tipo && a.local === local && a.prancha === prancha);
      if (ja) return err(`já existe ${B.codigo(ja)} — se for revisão, escolha em "Nova revisão de…"`); }
    if (usados.has(k)) return err(`a prancha ${prancha} de ${tipo} do ${local} aparece duas vezes no lote`); usados.add(k);
    plano.push({ f, disc, base, local, tipo, prancha, responsavel: LIBERA_LOTE, descricao: String(l.descricao || "").trim().slice(0, 160) });
  });
  if (erros.length) return { erro: `${erros.length} linha${erros.length === 1 ? "" : "s"} com problema — nada foi gravado. Corrija o que está em vermelho e envie de novo.`, erros };
  // tudo certo: grava os arquivos e depois o registro, de uma vez
  const nomes = []; for (const p of plano) { try { nomes.push(salvarArquivo(p.f, DIR_DOCS)); } catch (e) { return { erro: `${p.f.nomeOriginal || "arquivo"}: ${e.message} — nada foi registrado.`, erros: [{ i: plano.indexOf(p), msg: e.message }] }; } }
  const feitos = [];
  plano.forEach((p, i) => {
    const todosDoMesmo = d.arquivos.filter(a => a.obra === obraId && a.disciplina === p.disc.id && a.origem !== "marcacao");
    const numero = p.base ? p.base.numero : Math.max(0, ...todosDoMesmo.map(a => a.numero)) + 1;
    const rev = p.base ? Math.max(...todosDoMesmo.filter(a => a.numero === p.base.numero).map(a => a.rev)) + 1 : 0;
    const descricao = p.descricao || (p.base ? p.base.descricao : String(p.f.nomeOriginal || "").replace(/\.[^.]+$/, "").slice(0, 160)) || "documento";
    const a = { id: randomBytes(6).toString("hex"), obra: obraId, disciplina: p.disc.id, numero, tipo: p.tipo, local: p.local, prancha: p.prancha, rev, responsavel: p.responsavel, descricao, arquivo: nomes[i], ext: p.f.ext, tamanho: p.f.buffer.length,
      original: String(p.f.nomeOriginal || "").slice(0, 200), origem: "upload", lote: true, por: B.quem(user), login: user.usuario, porExterno: B.externo(user), em: agoraLocalISO() };
    d.arquivos.push(a); feitos.push(a);
    B.registrar(d, user, obraId, `enviou ${B.codigo(a)} · ${descricao}${p.base ? " (nova revisão)" : ""} — libera: ${B.nomeResp(p.responsavel)} (em lote)`);
  });
  B.gravar(d);
  const nRev = feitos.filter(a => a.rev > 0).length;
  return { ok: `${feitos.length} arquivo${feitos.length === 1 ? "" : "s"} gravado${feitos.length === 1 ? "" : "s"} em revisão${nRev ? ` (${nRev} nova${nRev === 1 ? "" : "s"} revis${nRev === 1 ? "ão" : "ões"})` : ""}: ${feitos.map(B.codigo).join(", ")}.`, ids: feitos.map(a => a.id), obra: obraId };
}
