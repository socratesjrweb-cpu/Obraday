// empreendimentos.js — O CADASTRO CENTRAL DA OBRA (22/11/2026), no painel inicial ("Obras").
//
// Num lugar só: os dados da obra (nome, SPE, CNPJ), a ficha técnica (endereço, terreno, arquiteto, entrega…) e a
// ESTRUTURA DO EMPREENDIMENTO (grupos/torres, pavimentos e locais). Daqui as informações vão para as outras áreas:
// a Medição usa a estrutura (lá ela é só consulta), a Medição Contratos replica serviços nos pavimentos e locais,
// Documentos & Incorporações mostra a mesma ficha técnica.
//
// Quem faz o quê: a estrutura, os gestores (Diretoria, Gerente, Administrador) e o Engenheiro nas obras dele;
// dados e ficha técnica, os gestores; obra nova, a Diretoria (como na Administração).
import { shell, cabecalhoPagina, OBRAS_DOCS, listarObras, salvarObra } from "../ponte-engenharia.js";
import { lerEstrutura, estruturaOuVazia, gravarEstrutura, vivos, existeEstrutura } from "./estrutura.js";
import { podeGerir, podeObra, chave, lerObra } from "./medicao-dados.js";
import { ler as lerProjetos, salvar as salvarProjetos } from "./projetos.js";

const BASE = "/empreendimentos";
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const txt = (s, max = 80) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const lista = v => [].concat(v ?? []).join("\n").split(/[\n;]/).map(x => txt(x)).filter(Boolean);
const quem = u => (u && (u.nome || u.usuario)) || "?";
const quandoBR = iso => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)} ${String(iso).slice(11, 16)}` : "";
const FICHA = [["endereco", "Endereço", "Rua, número, bairro, cidade/UF"], ["terreno", "Terreno", "Ex.: 1.250 m²"], ["pavimentos", "Pavimentos", "Ex.: 2 subsolos + térreo + 18 tipos"],
  ["unidades", "Unidades", "Ex.: 72 apartamentos + 2 lojas"], ["arquiteto", "Arquiteto / projeto", ""], ["previsaoEntrega", "Previsão de entrega", "Ex.: dez/2028"]];

const obrasVisiveis = user => OBRAS_DOCS.filter(o => podeObra(user, o.id));
export const podeEstrutura = (user, obra) => podeObra(user, obra);
const nomeObra = id => (OBRAS_DOCS.find(o => o.id === id) || {}).nome || id;

/** A obra que já tinha estrutura na Medição e ainda não tem a central: abrir a Medição leva a estrutura para lá (medicao-dados.js). */
export const garantirEstrutura = obra => { if (!existeEstrutura(obra)) { try { lerObra(obra); } catch {} } };
/** Quantos serviços da Medição há em cada local (para não deixar remover local em uso). */
function usoNaMedicao(obra) {
  const n = {}; let O = null; try { O = lerObra(obra); } catch { O = null; }
  for (const it of (O && O.itens) || []) if (!it.removido) n[it.local] = (n[it.local] || 0) + 1;
  return n;
}

// ---------------------------------------------------------------- estilo
const CSS = `<style>
.em-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.em-card{display:block;background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:16px;transition:.15s}
.em-card:hover{box-shadow:0 10px 24px rgba(20,20,25,.08);border-color:#e1d9c0}
.em-card h3{font-size:16.5px;margin:0 0 3px}.em-card .s{font-size:12.5px;color:var(--mut)}
.em-card .n{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.em-tag{display:inline-block;background:#f3f0e6;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;color:#4a4a52}
.em-tag.aviso{background:#fdf3d8;color:#8a6d1e}
.em-abas{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;border-bottom:2px solid var(--escuro)}
.em-abas a{border:1px solid #e0d9c4;border-bottom:0;background:#fff;color:#5a4e2e;border-radius:10px 10px 0 0;padding:10px 16px;font-size:13.5px;font-weight:700}
.em-abas a.on{background:var(--escuro);color:#fff;border-color:var(--escuro)}
.em-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #e0d9c4;background:#fff;color:#3a3226;border-radius:12px;padding:10px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;min-height:44px}
.em-btn:hover{border-color:var(--acento);color:var(--acento-escuro)}
.em-btn.p{background:var(--escuro);border-color:var(--escuro);color:#fff}
.em-btn.mini{min-height:34px;padding:5px 11px;font-size:12.5px;border-radius:9px}
.em-btn.perigo{color:#9a3a3a;border-color:#e6c4c4}
.em-barra{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.em-gr{background:#fff;border:1px solid #ece8dc;border-radius:16px;margin:0 0 12px;overflow:hidden}
.em-gr>h3{display:flex;align-items:center;gap:8px;background:#fbf7ec;margin:0;padding:10px 14px;font-size:14px;border-bottom:1px solid #eee7d6}
.em-gr>h3 small{font-weight:500;color:var(--mut)}
.em-pv{display:grid;grid-template-columns:minmax(120px,190px) 1fr auto;gap:10px;align-items:start;padding:10px 14px;border-bottom:1px solid #f2efe4}
.em-pv:last-child{border-bottom:0}
.em-pv .nm{font-weight:800;font-size:14.5px;padding-top:6px}.em-pv .nm small{display:block;font-weight:500;font-size:11.5px;color:var(--mut)}
.em-lcs{display:flex;flex-wrap:wrap;gap:6px}
.em-lc{border:1px solid #e3ddcb;background:#fdfbf5;border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;color:#2a2a30;cursor:pointer;min-height:34px}
.em-lc:hover{border-color:var(--acento)}.em-lc.uso{background:#eef5ee;border-color:#cfe3cf}
.em-lcs .vz{font-size:12.5px;color:var(--mut);padding-top:7px}
.em-vazio{color:var(--mut);font-size:14px;background:#fff;border:1px dashed #ddd6c2;border-radius:14px;padding:22px;text-align:center}
.em-f label{display:block;font-size:12.5px;font-weight:700;color:#444;margin:0 0 5px}
.em-f input,.em-f select,.em-f textarea{width:100%;padding:11px 12px;border:1.5px solid #e3e0d6;border-radius:10px;font:inherit;font-size:16px;background:#fbfaf6}
.em-f input:focus,.em-f select:focus,.em-f textarea:focus{outline:none;border-color:var(--acento);background:#fff}
.em-g{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 16px}.em-g .full{grid-column:1/-1}
.em-sec{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:16px 18px;margin:0 0 14px}
.em-sec>h3{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6a6a72;margin:0 0 10px}
.em-dica{font-size:12px;color:var(--mut);margin-top:4px}
dialog.em-dlg{margin:auto;inset:0;position:fixed;height:fit-content;max-height:92vh;overflow:auto;border:0;border-radius:16px;padding:18px;width:min(560px,96vw);box-sizing:border-box;box-shadow:0 18px 48px rgba(0,0,0,.3)}
dialog.em-dlg::backdrop{background:rgba(23,23,27,.45)}
.em-dlg .tit{font-weight:800;font-size:15.5px;margin:0 0 4px}
.em-dlg .bt{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
.em-lin{display:flex;flex-direction:column;gap:6px;max-height:36vh;overflow:auto;padding:2px}
.em-lin-r{display:flex;gap:6px;align-items:center}.em-lin-r span{min-width:20px;text-align:right;font-size:12px;font-weight:700;color:var(--mut)}
.em-lin-r input{flex:1;min-height:44px}.em-lin-r button{flex:none;width:44px;height:44px;border:1px solid #e0d9c4;border-radius:10px;background:#fff;color:#8a2d2d;font-size:16px;cursor:pointer}
.em-serie{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:13px}
.em-serie input{width:90px;padding:8px 10px;border:1.5px solid #e3e0d6;border-radius:10px;font-size:16px}.em-serie input:first-child{width:120px}
.em-chks{display:flex;flex-direction:column;gap:2px;max-height:34vh;overflow:auto;border:1px solid #eee7d6;border-radius:12px;padding:6px 10px;margin-top:6px}
.em-chks .gt{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6a6a72;margin:8px 0 2px;display:flex;gap:8px;align-items:center}
.em-chks label{display:flex;align-items:center;gap:8px;font-size:14px;min-height:36px;cursor:pointer;font-weight:500;color:#2a2a30;margin:0}
.em-chks input{width:20px;height:20px}
.em-grl{display:flex;flex-direction:column;gap:6px}
.em-grl form{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0}.em-grl input{flex:1;min-width:140px}
.em-log{font-size:12.5px}.em-log div{padding:5px 0;border-bottom:1px solid #f2efe4}
@media(max-width:700px){.em-g{grid-template-columns:1fr}.em-pv{grid-template-columns:1fr auto}.em-pv .em-lcs{grid-column:1/-1;grid-row:2}}
</style>`;
const msg = (m, e) => `${m ? `<div class="msg ok">${esc(m)}</div>` : ""}${e ? `<div class="msg err">${esc(e)}</div>` : ""}`;

// ---------------------------------------------------------------- 1. as obras
export function paginaLista(user, { m = "", e = "" } = {}) {
  const fichas = Object.fromEntries((lerProjetos().obras || []).map(o => [o.id, o]));
  const cards = obrasVisiveis(user).map(o => {
    garantirEstrutura(o.id); const E = lerEstrutura(o.id), V = E ? vivos(E) : { grupos: [], pavimentos: [], locais: [] }, F = (fichas[o.id] || {}).ficha || {};
    return `<a class="em-card" href="${BASE}/${encodeURIComponent(o.id)}"><h3>${esc(o.nome)}</h3><div class="s">${esc(F.endereco || (fichas[o.id] || {}).spe || "—")}</div>
      <div class="n">${V.pavimentos.length ? `${V.grupos.length ? `<span class="em-tag">${V.grupos.length} grupo(s)</span>` : ""}<span class="em-tag">${V.pavimentos.length} pavimento(s)</span><span class="em-tag">${V.locais.length} local(is)</span>`
        : `<span class="em-tag aviso">estrutura a cadastrar</span>`}</div></a>`;
  }).join("");
  const body = `${CSS}${cabecalhoPagina({ icone: "🏗️", titulo: "Obras", sub: "O cadastro de cada obra num lugar só: dados, ficha técnica e a estrutura do empreendimento (torres, pavimentos e locais). Daqui as informações vão para a Medição, a Medição Contratos e os Documentos.", voltar: "/engenharia", voltarRotulo: "Engenharia" })}
    ${msg(m, e)}
    ${user.nivel === "master" ? `<div class="em-barra"><button type="button" class="em-btn p" onclick="document.getElementById('emDlgNova').showModal()">+ Nova obra</button></div>
    <dialog class="em-dlg" id="emDlgNova"><form method="POST" action="${BASE}/nova" class="em-f" style="margin:0"><p class="tit">Nova obra</p>
      <div class="em-g"><div class="full"><label>Nome da obra</label><input name="nome" required maxlength="80" placeholder="Ex.: Residencial Bela Vista"></div>
      <div><label>SPE (opcional)</label><input name="spe" maxlength="120"></div><div><label>CNPJ (opcional)</label><input name="cnpj" maxlength="20" inputmode="numeric"></div></div>
      <div class="bt"><button type="button" class="em-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="em-btn p">Cadastrar</button></div></form></dialog>` : ""}
    ${cards ? `<div class="em-lista">${cards}</div>` : `<div class="em-vazio">Nenhuma obra liberada para você.</div>`}`;
  return shell({ title: "Obras", body, user });
}

// ---------------------------------------------------------------- 2. a obra (abas: estrutura · dados e ficha técnica)
const JS = String.raw`<script>
function emLinha(box,v){var r=document.createElement('div');r.className='em-lin-r';r.innerHTML='<span></span><input name="nome" maxlength="80" autocomplete="off"><button type="button" title="Tirar" aria-label="Tirar">✕</button>';
  r.querySelector('input').value=v||'';box.appendChild(r);emNum(box);return r.querySelector('input');}
function emNum(box){box.querySelectorAll('.em-lin-r span').forEach(function(s,i){s.textContent=i+1;});}
function emLin(box){box.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var r=b.closest('.em-lin-r');if(box.children.length>1)r.remove();else r.querySelector('input').value='';emNum(box);});
  box.addEventListener('keydown',function(e){if(e.key!=='Enter'||e.target.tagName!=='INPUT')return;e.preventDefault();var r=e.target.closest('.em-lin-r'),nx=r.nextElementSibling;if(nx)nx.querySelector('input').focus();else if(e.target.value.trim())emLinha(box).focus();});
  box.addEventListener('paste',function(e){var t=(e.clipboardData||window.clipboardData).getData('text');if(!/[\n;\t]/.test(t))return;e.preventDefault();var ns=t.split(/[\r\n;\t]+/).map(function(x){return x.trim();}).filter(Boolean);
    var i=e.target;i.value=ns.shift()||'';ns.forEach(function(n){var v=[].slice.call(box.querySelectorAll('input')).filter(function(x){return !x.value.trim();})[0];if(v)v.value=n;else emLinha(box,n);});});}
function emSerie(b){var c=b.parentNode.querySelectorAll('input'),pre=c[0].value.trim(),de=parseInt(c[1].value,10),ate=parseInt(c[2].value,10);
  if(!pre||isNaN(de)||isNaN(ate)||ate<de){alert('Confira o nome e os números (o “até” não pode ser menor que o “de”).');return;}if(ate-de>199){alert('No máximo 200 de uma vez.');return;}
  var box=b.closest('form').querySelector('.em-lin'),w=String(ate).length<2?2:String(ate).length;
  for(var k=de;k<=ate;k++){var n=pre+' '+String(k).padStart(w,'0'),v=[].slice.call(box.querySelectorAll('input')).filter(function(x){return !x.value.trim();})[0];if(v)v.value=n;else emLinha(box,n);}}
function emValida(f){if(![].some.call(f.querySelectorAll('.em-lin input'),function(x){return x.value.trim();})){alert('Escreva pelo menos um nome.');return false;}
  if(f.querySelector('.em-chks')&&!f.querySelector('.em-chks input[name=pav]:checked')){alert('Marque em quais pavimentos.');return false;}return true;}
function emGrupoChk(c){c.closest('.em-chks').querySelectorAll('input[data-g="'+c.getAttribute('data-gt')+'"]').forEach(function(x){x.checked=c.checked;});}
function emPav(b){var d=document.getElementById('emDlgPav'),f=d.querySelector('form');f.id.value=b.getAttribute('data-id');f.nome.value=b.getAttribute('data-nome');f.grupo.value=b.getAttribute('data-grupo')||'';
  d.querySelectorAll('.emPid').forEach(function(i){i.value=b.getAttribute('data-id');});var uso=+b.getAttribute('data-uso');var rm=d.querySelector('.emRm');rm.disabled=uso>0;rm.title=uso>0?'Tem '+uso+' serviço(s) da Medição nos locais deste pavimento':'';
  d.querySelector('.emUso').textContent=uso>0?'Tem '+uso+' serviço(s) da Medição nos locais: para remover, tire os serviços lá antes.':'';d.showModal();}
function emLoc(b){var d=document.getElementById('emDlgLoc'),f=d.querySelector('form');f.id.value=b.getAttribute('data-id');f.nome.value=b.getAttribute('data-nome');d.querySelector('.emLp').textContent=b.getAttribute('data-pav');
  d.querySelectorAll('.emLid').forEach(function(i){i.value=b.getAttribute('data-id');});var uso=+b.getAttribute('data-uso');var rm=d.querySelector('.emRm');rm.disabled=uso>0;
  d.querySelector('.emUso').textContent=uso>0?'Tem '+uso+' serviço(s) na Medição: para remover, tire os serviços lá antes.':'';d.showModal();}
document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.em-lin').forEach(function(b){emLin(b);emNum(b);});});
</script>`;
const linhas = (n, phs) => `<div class="em-lin">${Array.from({ length: n }, (_, i) => `<div class="em-lin-r"><span></span><input name="nome" maxlength="80" autocomplete="off" placeholder="${esc(phs[i] || "")}"><button type="button" title="Tirar" aria-label="Tirar">✕</button></div>`).join("")}</div>`;
const serie = pre => `<div class="em-serie"><input value="${esc(pre)}" aria-label="Nome"><span>de</span><input type="number" inputmode="numeric" value="1" aria-label="Do número"><span>até</span><input type="number" inputmode="numeric" value="10" aria-label="Até o número"><button type="button" class="em-btn mini" onclick="emSerie(this)">gerar série</button></div>`;

export function paginaObra(user, obra, { aba = "", m = "", e = "" } = {}) {
  if (!OBRAS_DOCS.some(o => o.id === obra) || !podeObra(user, obra)) return null;
  const ed = podeEstrutura(user, obra), ger = podeGerir(user), b = `${BASE}/${encodeURIComponent(obra)}`;
  aba = aba === "dados" ? "dados" : "estrutura";
  const abas = `<div class="em-abas"><a href="${b}" class="${aba === "estrutura" ? "on" : ""}">Estrutura</a><a href="${b}?aba=dados" class="${aba === "dados" ? "on" : ""}">Dados e ficha técnica</a></div>`;
  const conteudo = aba === "dados" ? abaDados(user, obra, ger) : abaEstrutura(user, obra, ed);
  const body = `${CSS}${JS}${cabecalhoPagina({ icone: "🏗️", titulo: esc(nomeObra(obra)), voltar: BASE, voltarRotulo: "Obras" })}${msg(m, e)}${abas}${conteudo}`;
  return shell({ title: nomeObra(obra), body, user });
}

function abaEstrutura(user, obra, ed) {
  garantirEstrutura(obra); const E = estruturaOuVazia(obra), V = vivos(E), uso = usoNaMedicao(obra), b = `${BASE}/${encodeURIComponent(obra)}`;
  const usoPav = p => V.locais.filter(l => l.pav === p.id).reduce((s, l) => s + (uso[l.id] || 0), 0);
  // o prédio de pé: o grupo de cima primeiro, e dentro dele o pavimento mais alto primeiro
  const blocos = [...V.grupos.map(g => ({ g, pavs: V.pavimentos.filter(p => p.grupo === g.id) })), { g: null, pavs: V.pavimentos.filter(p => !p.grupo || !V.grupos.some(g => g.id === p.grupo)) }]
    .filter(x => x.g || x.pavs.length).reverse();
  const pav = p => { const ls = V.locais.filter(l => l.pav === p.id);
    return `<div class="em-pv"><div class="nm">${esc(p.nome)}<small>${ls.length} local(is)</small></div>
      <div class="em-lcs">${ls.map(l => ed ? `<button type="button" class="em-lc${uso[l.id] ? " uso" : ""}" onclick="emLoc(this)" data-id="${esc(l.id)}" data-nome="${esc(l.nome)}" data-pav="${esc(p.nome)}" data-uso="${uso[l.id] || 0}" title="${uso[l.id] ? `${uso[l.id]} serviço(s) na Medição` : "Editar"}">${esc(l.nome)}</button>`
        : `<span class="em-lc${uso[l.id] ? " uso" : ""}">${esc(l.nome)}</span>`).join("") || `<span class="vz">sem locais</span>`}</div>
      ${ed ? `<button type="button" class="em-btn mini" onclick="emPav(this)" data-id="${esc(p.id)}" data-nome="${esc(p.nome)}" data-grupo="${esc(p.grupo || "")}" data-uso="${usoPav(p)}">✎ editar</button>` : "<span></span>"}</div>`; };
  const predio = blocos.map(({ g, pavs }) => `<div class="em-gr"><h3>${g ? esc(g.nome) : V.grupos.length ? "Sem grupo" : "Pavimentos"} <small>${pavs.length} pavimento(s) · ${V.locais.filter(l => pavs.some(p => p.id === l.pav)).length} local(is)</small></h3>
    ${pavs.slice().reverse().map(pav).join("") || `<div class="em-pv"><span class="vz" style="color:var(--mut);font-size:12.5px">vazio</span></div>`}</div>`).join("");
  const opcoesGrupo = sel => `<option value="">— sem grupo —</option>${V.grupos.map(g => `<option value="${esc(g.id)}"${sel === g.id ? " selected" : ""}>${esc(g.nome)}</option>`).join("")}`;
  const chksPav = `<div class="em-chks">${blocos.slice().reverse().map(({ g, pavs }) => pavs.length ? `${V.grupos.length ? `<div class="gt"><label style="min-height:0"><input type="checkbox" data-gt="${g ? esc(g.id) : "sem"}" onchange="emGrupoChk(this)"> ${g ? esc(g.nome) : "Sem grupo"}</label></div>` : ""}
    ${pavs.map(p => `<label><input type="checkbox" name="pav" value="${esc(p.id)}" data-g="${g ? esc(g.id) : "sem"}"> ${esc(p.nome)}</label>`).join("")}` : "").join("")}</div>`;
  const dlgs = !ed ? "" : `
  <dialog class="em-dlg" id="emDlgNovosPav"><form method="POST" action="${b}/pavimentos" class="em-f" style="margin:0" onsubmit="return emValida(this)"><p class="tit">Adicionar pavimentos</p>
    <div class="em-dica" style="margin:0 0 8px">Um por campo, <b>de baixo para cima</b> (o 1º é o mais baixo). Entram acima do último pavimento.</div>
    ${linhas(3, ["Ex.: Térreo", "Ex.: Tipo 01", "Ex.: Tipo 02"])}${serie("Tipo")}
    ${V.grupos.length ? `<div style="margin-top:10px"><label>No grupo</label><select name="grupo">${opcoesGrupo("")}</select></div>` : ""}
    <div class="bt"><button type="button" class="em-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="em-btn p">Cadastrar</button></div></form></dialog>
  <dialog class="em-dlg" id="emDlgNovosLoc"><form method="POST" action="${b}/locais" class="em-f" style="margin:0" onsubmit="return emValida(this)"><p class="tit">Adicionar locais</p>
    <div class="em-dica" style="margin:0 0 8px">Um local por campo (apartamento, área comum, fachada…). Marque todos os pavimentos que têm esses locais: entram em cada um.</div>
    ${linhas(3, ["Ex.: Apto 01", "Ex.: Apto 02", "Ex.: Hall"])}${serie("Apto")}
    <div style="margin-top:10px"><label>Em quais pavimentos</label>${V.pavimentos.length ? chksPav : `<div class="em-dica">Cadastre os pavimentos primeiro.</div>`}</div>
    <div class="bt"><button type="button" class="em-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="em-btn p"${V.pavimentos.length ? "" : " disabled"}>Cadastrar</button></div></form></dialog>
  <dialog class="em-dlg" id="emDlgGrupos"><div class="em-f"><p class="tit">Grupos de pavimentos (torres, blocos…)</p>
    <div class="em-dica" style="margin:0 0 10px">Ex.: Embasamento, Torre A, Torre B, Fachadas. A ordem é de baixo para cima.</div>
    <div class="em-grl">${V.grupos.slice().reverse().map(g => `<form method="POST" action="${b}/grupo"><input type="hidden" name="id" value="${esc(g.id)}"><input name="nome" value="${esc(g.nome)}" maxlength="60" required aria-label="Nome do grupo"><button class="em-btn mini">salvar</button>
      <button class="em-btn mini" formaction="${b}/grupo-mover?dir=sobe" title="Subir">↑</button><button class="em-btn mini" formaction="${b}/grupo-mover?dir=desce" title="Descer">↓</button>
      <button class="em-btn mini perigo" formaction="${b}/grupo-remover" title="Remover (só vazio)"${V.pavimentos.some(p => p.grupo === g.id) ? " disabled" : ""}>✕</button></form>`).join("") || `<div class="em-dica">Nenhum grupo ainda.</div>`}</div>
    <form method="POST" action="${b}/grupo-novo" style="display:flex;gap:6px;margin-top:12px"><input name="nome" required maxlength="60" placeholder="Grupo novo (ex.: Torre A)"><button class="em-btn p">Criar</button></form>
    <div class="bt"><button type="button" class="em-btn" onclick="this.closest('dialog').close()">Fechar</button></div></div></dialog>
  <dialog class="em-dlg" id="emDlgPav"><div class="em-f"><p class="tit">Pavimento</p>
    <form method="POST" action="${b}/pavimento" style="margin:0"><input type="hidden" name="id"><div class="em-g"><div><label>Nome</label><input name="nome" required maxlength="80"></div>
      <div><label>Grupo</label><select name="grupo">${opcoesGrupo("")}</select></div></div><div class="bt"><button class="em-btn p">Salvar</button></div></form>
    <div class="em-dica" style="margin-top:6px">Posição no prédio:</div>
    <div class="bt" style="justify-content:flex-start;margin-top:4px"><form method="POST" action="${b}/pavimento-mover?dir=sobe" style="margin:0"><input type="hidden" name="id" class="emPid"><button class="em-btn mini">↑ subir um andar</button></form>
      <form method="POST" action="${b}/pavimento-mover?dir=desce" style="margin:0"><input type="hidden" name="id" class="emPid"><button class="em-btn mini">↓ descer um andar</button></form></div>
    <div class="em-dica emUso" style="color:#8a6d1e"></div>
    <div class="bt"><form method="POST" action="${b}/pavimento-remover" style="margin:0" onsubmit="return confirm('Remover o pavimento e os locais dele? (fica no histórico)')"><input type="hidden" name="id" class="emPid"><button class="em-btn perigo emRm">Remover pavimento</button></form>
      <button type="button" class="em-btn" onclick="this.closest('dialog').close()">Fechar</button></div></div></dialog>
  <dialog class="em-dlg" id="emDlgLoc"><div class="em-f"><p class="tit">Local · <span class="emLp"></span></p>
    <form method="POST" action="${b}/local" style="margin:0"><input type="hidden" name="id"><label>Nome</label><input name="nome" required maxlength="80"><div class="bt"><button class="em-btn p">Salvar</button></div></form>
    <div class="bt" style="justify-content:flex-start;margin-top:4px"><form method="POST" action="${b}/local-mover?dir=cima" style="margin:0"><input type="hidden" name="id" class="emLid"><button class="em-btn mini">◀ antes</button></form>
      <form method="POST" action="${b}/local-mover?dir=baixo" style="margin:0"><input type="hidden" name="id" class="emLid"><button class="em-btn mini">depois ▶</button></form></div>
    <div class="em-dica emUso" style="color:#8a6d1e"></div>
    <div class="bt"><form method="POST" action="${b}/local-remover" style="margin:0" onsubmit="return confirm('Remover este local? (fica no histórico)')"><input type="hidden" name="id" class="emLid"><button class="em-btn perigo emRm">Remover local</button></form>
      <button type="button" class="em-btn" onclick="this.closest('dialog').close()">Fechar</button></div></div></dialog>`;
  const abre = id => `onclick="document.getElementById('${id}').showModal()"`;
  return `${ed ? `<div class="em-barra"><button type="button" class="em-btn p" ${abre("emDlgNovosPav")}>+ Pavimentos</button><button type="button" class="em-btn p" ${abre("emDlgNovosLoc")}>+ Locais</button><button type="button" class="em-btn" ${abre("emDlgGrupos")}>Grupos (torres, blocos)${V.grupos.length ? ` · ${V.grupos.length}` : ""}</button></div>` : ""}
    ${V.pavimentos.length ? `<div class="em-dica" style="margin:-6px 0 10px">${V.pavimentos.length} pavimento(s) · ${V.locais.length} local(is). O prédio aparece de pé: o pavimento mais alto em cima. ${Object.keys(uso).length ? "Locais em verde já têm serviço na Medição." : ""}</div>${predio}`
      : `<div class="em-vazio">${ed ? "Nenhum pavimento ainda. Comece por <b>+ Pavimentos</b> (de baixo para cima: Térreo, Tipo 01, Tipo 02…) e depois <b>+ Locais</b> (Apto 01, Apto 02…) em todos os pavimentos de uma vez." : "A estrutura desta obra ainda não foi cadastrada."}</div>`}
    ${dlgs}
    <div class="em-sec" style="margin-top:14px"><h3>Histórico da estrutura</h3><div class="em-log">${(E.historico || []).slice(-40).reverse().map(h => `<div><b>${quandoBR(h.em)}</b> · ${esc(h.por)} — ${esc(h.txt)}</div>`).join("") || "—"}</div></div>`;
}

function abaDados(user, obra, ger) {
  const o = (lerProjetos().obras || []).find(x => x.id === obra) || {}, F = o.ficha || {}, b = `${BASE}/${encodeURIComponent(obra)}`;
  garantirEstrutura(obra); const V = vivos(estruturaOuVazia(obra));
  const dica = k => k === "pavimentos" && V.pavimentos.length ? `<div class="em-dica">Pela estrutura: ${V.pavimentos.length} pavimento(s).</div>` : k === "unidades" && V.locais.length ? `<div class="em-dica">Pela estrutura: ${V.locais.length} local(is).</div>` : "";
  const campo = (k, rot, ph, full = false) => `<div${full ? ' class="full"' : ""}><label>${rot}</label>${ger ? `<input name="${k}" maxlength="200" value="${esc(F[k] || "")}" placeholder="${esc(ph)}">` : `<div>${esc(F[k] || "—")}</div>`}${dica(k)}</div>`;
  return `<form method="POST" action="${b}/dados" class="em-f">
    <div class="em-sec"><h3>Dados da obra</h3><div class="em-g">
      <div class="full"><label>Nome da obra</label>${ger ? `<input name="nome" required maxlength="80" value="${esc(o.nome || nomeObra(obra))}">` : `<div>${esc(o.nome || nomeObra(obra))}</div>`}</div>
      <div><label>SPE (razão social)</label>${ger ? `<input name="spe" maxlength="120" value="${esc(o.spe || "")}">` : `<div>${esc(o.spe || "—")}</div>`}</div>
      <div><label>CNPJ</label>${ger ? `<input name="cnpj" maxlength="20" inputmode="numeric" value="${esc(o.cnpj || "")}">` : `<div>${esc(o.cnpj || "—")}</div>`}</div>
      ${ger ? `<div class="full"><label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" name="projetoNovo" value="1" style="width:20px;height:20px"${o.projetoNovo ? " checked" : ""}> Ainda em projeto (a obra não começou)</label></div>` : ""}</div></div>
    <div class="em-sec"><h3>Ficha técnica</h3><div class="em-g">
      ${FICHA.map(([k, r, ph]) => campo(k, r, ph, k === "endereco")).join("")}
      <div class="full"><label>Observações</label>${ger ? `<textarea name="observacoes" rows="4" maxlength="4000">${esc(F.observacoes || "")}</textarea>` : `<div style="white-space:pre-wrap">${esc(F.observacoes || "—")}</div>`}</div></div>
      ${o.atualizadoEm ? `<div class="em-dica" style="margin-top:8px">Última alteração: ${esc(o.atualizadoPor || "")} · ${esc(o.atualizadoEm)}</div>` : ""}
      <div class="em-dica">A mesma ficha aparece em Documentos & Incorporações.</div></div>
    ${ger ? `<div class="em-barra"><button class="em-btn p">Salvar</button></div>` : ""}</form>`;
}

// ---------------------------------------------------------------- gravações da estrutura
const comEst = (obra, user, fn) => {
  if (!podeEstrutura(user, obra)) return { erro: "Sem acesso à estrutura desta obra." };
  garantirEstrutura(obra); const E = estruturaOuVazia(obra); const r = fn(E);
  if (r && r.erro) return r;
  if (r && r.txt) gravarEstrutura(obra, E, user, r.txt);
  return { ok: (r && r.ok) || "Salvo." };
};
const proxOrdem = l => Math.max(0, ...l.map(x => x.ordem || 0)) + 1;
const trocaOrdem = (lista, alvo, para) => { const i = lista.indexOf(alvo), j = i + para; if (i < 0 || j < 0 || j >= lista.length) return false; [lista[i], lista[j]] = [lista[j], lista[i]]; lista.forEach((x, k) => { x.ordem = k + 1; }); return true; };

export function acao(user, obra, qual, f, q) {
  const uso = () => usoNaMedicao(obra);
  switch (qual) {
    case "pavimentos": return comEst(obra, user, E => {
      const nomes = lista(f.nome); if (!nomes.length) return { erro: "Escreva o nome do pavimento." };
      const V = vivos(E), gid = String(f.grupo || ""); if (gid && !V.grupos.some(g => g.id === gid)) return { erro: "Grupo não encontrado." };
      const feitos = [];
      for (const nome of nomes) {
        if (V.pavimentos.some(p => chave(p.nome) === chave(nome))) continue;
        const id = "pv-" + chave(nome), ordem = proxOrdem(V.pavimentos), morto = E.pavimentos.find(x => x.id === id);
        const p = morto || { id }; Object.assign(p, { nome, ordem, grupo: gid || null }); delete p.removido; if (!morto) E.pavimentos.push(p); V.pavimentos.push(p); feitos.push(nome);
      }
      return feitos.length ? { txt: `Cadastrou o(s) pavimento(s) ${feitos.join(", ")}`, ok: `${feitos.length} pavimento(s) cadastrado(s).` } : { erro: "Esse(s) pavimento(s) já existe(m)." };
    });
    case "pavimento": return comEst(obra, user, E => {
      const p = E.pavimentos.find(x => x.id === f.id && !x.removido); if (!p) return { erro: "Pavimento não encontrado." };
      const nome = txt(f.nome), gid = String(f.grupo || ""); if (nome.length < 1) return { erro: "Escreva o nome." };
      if (E.pavimentos.some(x => x !== p && !x.removido && chave(x.nome) === chave(nome))) return { erro: "Já existe um pavimento com esse nome." };
      if (gid && !E.grupos.some(g => g.id === gid && !g.removido)) return { erro: "Grupo não encontrado." };
      const mud = [p.nome !== nome ? `nome ${p.nome} → ${nome}` : "", (p.grupo || "") !== gid ? `grupo → ${(E.grupos.find(g => g.id === gid) || {}).nome || "sem grupo"}` : ""].filter(Boolean);
      if (!mud.length) return { ok: "Nada mudou." };
      const antes = p.nome; p.nome = nome; p.grupo = gid || null; return { txt: `Pavimento ${antes}: ${mud.join(", ")}` };
    });
    case "pavimento-mover": return comEst(obra, user, E => {
      const ps = vivos(E).pavimentos, p = ps.find(x => x.id === f.id); if (!p) return { erro: "Pavimento não encontrado." };
      return trocaOrdem(ps, p, q.get("dir") === "sobe" ? 1 : -1) ? { txt: `Mudou a ordem do pavimento ${p.nome}` } : { ok: "Já está no limite." };
    });
    case "pavimento-remover": return comEst(obra, user, E => {
      const p = E.pavimentos.find(x => x.id === f.id && !x.removido); if (!p) return { erro: "Pavimento não encontrado." };
      const U = uso(), ls = E.locais.filter(l => l.pav === p.id && !l.removido), n = ls.reduce((s, l) => s + (U[l.id] || 0), 0);
      if (n) return { erro: `${p.nome} tem ${n} serviço(s) na Medição. Tire-os lá antes de remover o pavimento.` };
      const r = { por: quem(user), em: new Date().toISOString() }; p.removido = r; for (const l of ls) l.removido = r;
      return { txt: `Removeu o pavimento ${p.nome}${ls.length ? ` e ${ls.length} local(is)` : ""}`, ok: `Pavimento ${p.nome} removido.` };
    });
    case "locais": return comEst(obra, user, E => {
      const nomes = lista(f.nome), pavs = [].concat(f.pav || []).map(id => E.pavimentos.find(p => p.id === id && !p.removido)).filter(Boolean);
      if (!nomes.length) return { erro: "Escreva o nome do local." }; if (!pavs.length) return { erro: "Marque em quais pavimentos." };
      let n = 0;
      for (const p of pavs) for (const nome of nomes) {
        const id = "lc-" + chave(p.nome, nome), ja = E.locais.find(x => x.id === id) || E.locais.find(x => x.pav === p.id && !x.removido && chave(x.nome) === chave(nome));
        if (ja && !ja.removido) continue;
        const ordem = proxOrdem(E.locais.filter(x => x.pav === p.id && !x.removido));
        if (ja) { delete ja.removido; Object.assign(ja, { ordem, nome }); } else E.locais.push({ id, pav: p.id, nome, ordem });
        n++;
      }
      return n ? { txt: `Cadastrou ${n} local(is): ${nomes.join(", ")} em ${pavs.length} pavimento(s)`, ok: `${n} local(is) cadastrado(s).` } : { erro: "Esses locais já existem nesses pavimentos." };
    });
    case "local": return comEst(obra, user, E => {
      const l = E.locais.find(x => x.id === f.id && !x.removido); if (!l) return { erro: "Local não encontrado." };
      const nome = txt(f.nome); if (!nome) return { erro: "Escreva o nome." }; if (nome === l.nome) return { ok: "Nada mudou." };
      if (E.locais.some(x => x !== l && x.pav === l.pav && !x.removido && chave(x.nome) === chave(nome))) return { erro: "Já existe um local com esse nome neste pavimento." };
      const antes = l.nome; l.nome = nome; return { txt: `Renomeou o local ${antes} → ${nome} (${(E.pavimentos.find(p => p.id === l.pav) || {}).nome || "?"})` };
    });
    case "local-mover": return comEst(obra, user, E => {
      const l = E.locais.find(x => x.id === f.id && !x.removido); if (!l) return { erro: "Local não encontrado." };
      const ls = E.locais.filter(x => x.pav === l.pav && !x.removido).sort((a, b) => a.ordem - b.ordem);
      return trocaOrdem(ls, l, q.get("dir") === "cima" ? -1 : 1) ? { txt: `Mudou a ordem do local ${l.nome}` } : { ok: "Já está no limite." };
    });
    case "local-remover": return comEst(obra, user, E => {
      const l = E.locais.find(x => x.id === f.id && !x.removido); if (!l) return { erro: "Local não encontrado." };
      const n = uso()[l.id] || 0; if (n) return { erro: `${l.nome} tem ${n} serviço(s) na Medição. Tire-os lá antes de remover o local.` };
      l.removido = { por: quem(user), em: new Date().toISOString() }; return { txt: `Removeu o local ${l.nome} (${(E.pavimentos.find(p => p.id === l.pav) || {}).nome || "?"})`, ok: `Local ${l.nome} removido.` };
    });
    case "grupo-novo": return comEst(obra, user, E => {
      const nome = txt(f.nome, 60); if (nome.length < 2) return { erro: "Escreva o nome do grupo (ex.: Torre A)." };
      if (E.grupos.some(g => !g.removido && chave(g.nome) === chave(nome))) return { erro: "Esse grupo já existe." };
      const id = "gr-" + chave(nome), morto = E.grupos.find(g => g.id === id), ordem = proxOrdem(E.grupos.filter(g => !g.removido));
      if (morto) { delete morto.removido; Object.assign(morto, { nome, ordem }); } else E.grupos.push({ id, nome, ordem });
      return { txt: `Criou o grupo ${nome}`, ok: `Grupo ${nome} criado.` };
    });
    case "grupo": return comEst(obra, user, E => {
      const g = E.grupos.find(x => x.id === f.id && !x.removido); if (!g) return { erro: "Grupo não encontrado." };
      const nome = txt(f.nome, 60); if (nome.length < 2) return { erro: "Escreva o nome." }; if (nome === g.nome) return { ok: "Nada mudou." };
      if (E.grupos.some(x => x !== g && !x.removido && chave(x.nome) === chave(nome))) return { erro: "Já existe um grupo com esse nome." };
      const antes = g.nome; g.nome = nome; return { txt: `Renomeou o grupo ${antes} → ${nome}` };
    });
    case "grupo-mover": return comEst(obra, user, E => {
      const gs = vivos(E).grupos, g = gs.find(x => x.id === f.id); if (!g) return { erro: "Grupo não encontrado." };
      return trocaOrdem(gs, g, q.get("dir") === "sobe" ? 1 : -1) ? { txt: `Mudou a ordem do grupo ${g.nome}` } : { ok: "Já está no limite." };
    });
    case "grupo-remover": return comEst(obra, user, E => {
      const g = E.grupos.find(x => x.id === f.id && !x.removido); if (!g) return { erro: "Grupo não encontrado." };
      if (E.pavimentos.some(p => !p.removido && p.grupo === g.id)) return { erro: "O grupo ainda tem pavimentos. Mude-os de grupo antes." };
      g.removido = { por: quem(user), em: new Date().toISOString() }; return { txt: `Removeu o grupo ${g.nome}`, ok: `Grupo ${g.nome} removido.` };
    });
    case "dados": {
      if (!podeGerir(user)) return { erro: "Só a Diretoria, o Gerente ou o Administrador alteram os dados da obra." };
      const r = salvarObra({ id: obra, nome: f.nome, spe: f.spe, cnpj: f.cnpj, projetoNovo: f.projetoNovo }, user); if (r.erro) return r;
      const d = lerProjetos(), o = (d.obras || []).find(x => x.id === obra); if (!o) return { erro: "Obra não encontrada." };
      o.ficha ||= {}; for (const [k] of FICHA) o.ficha[k] = String(f[k] || "").slice(0, 200).trim();
      o.ficha.observacoes = String(f.observacoes || "").slice(0, 4000);
      o.atualizadoPor = user.nome; o.atualizadoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      salvarProjetos(d); return { ok: "Dados da obra salvos." };
    }
  }
  return null;
}

// ---------------------------------------------------------------- rotas (/empreendimentos…)
export async function rotaEmpreendimentos({ req, res, path, u, sess, html, redir, lerBody }) {
  const user = sess.user, q = u.searchParams, post = req.method === "POST";
  const [obra, qual] = path.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent);
  const volta = (url, r) => redir(res, url + (url.includes("?") ? "&" : "?") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok || "Salvo.")));
  if (!obra) return html(res, paginaLista(user, { m: q.get("m") || "", e: q.get("e") || "" }));
  if (obra === "nova" && post) {
    if (user.nivel !== "master") return volta(BASE, { erro: "Só a Diretoria cadastra obra nova." });
    const f = await lerBody(req), r = salvarObra({ nome: f.nome, spe: f.spe, cnpj: f.cnpj }, user);
    if (r.erro) return volta(BASE, r);
    const nova = listarObras().filter(o => o.ativa).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0];
    return volta(nova ? `${BASE}/${encodeURIComponent(nova.id)}` : BASE, r);
  }
  const b = `${BASE}/${encodeURIComponent(obra)}`;
  if (!qual) { const p = paginaObra(user, obra, { aba: q.get("aba") || "", m: q.get("m") || "", e: q.get("e") || "" }); return p ? html(res, p) : redir(res, BASE); }
  if (post) {
    if (!OBRAS_DOCS.some(o => o.id === obra) || !podeObra(user, obra)) return redir(res, BASE);
    const f = await lerBody(req), r = acao(user, obra, qual, f, q);
    if (!r) return redir(res, b);
    return volta(qual === "dados" ? `${b}?aba=dados` : b, r);
  }
  return redir(res, b);
}
