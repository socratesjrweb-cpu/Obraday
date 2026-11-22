// projetos.js — setor Projetos & Incorporações.
//
// Setor informativo: ficha, alvarás, documentos e incorporação de cada obra.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { shell, cabecalhoPagina } from "../ponte-engenharia.js";
import { DIR_SETORES, DIR_ANEXOS as RAIZ_ANEXOS } from "../ponte-engenharia.js";
import { ACCEPT } from "../ponte-engenharia.js";
import { painelAlvara, chipAlvara, quadroAlvaras, CSS_ALVARA } from "./projetos-alvara.js";
import { painelDocsObra, chipDocsObra, CSS_DOCOBRA } from "./projetos-docobra.js";

const ARQ = join(DIR_SETORES, "projetos.json");

export const DIR_PROJETOS = join(RAIZ_ANEXOS, "projetos");

export function ler() { try { return JSON.parse(readFileSync(ARQ, "utf8")); } catch { return { obras: [] }; } }
export function salvar(d) { writeFileSync(ARQ, JSON.stringify(d, null, 1)); }

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// As fases que ele ditou, mais espaço para escrever outra — o vocabulário é de quem faz.
export const FASES = [
  "Levantamento de documentações",
  "Aguardando projeto aprovado",
  "Aguardando alvará de construção",
  "Documentos dos permutantes",
  "Aguardando certidões negativas",
  "Certidões em análise no cartório",
  "Pronta para registro",
];

// Só o alvará: não existe alvará sem projeto aprovado, então ele já é a prova de que o
// projeto passou. As fases anteriores (projeto em aprovação etc.) vivem na aba Incorporação.
export const PASTAS = [
  ["alvara", "📋", "Alvará de construção"],
  ["docsobra", "🗂️", "Documentos Obra"],      // 13/11: ARTs, CNO, habite-se, matrículas… (projetos-docobra.js)
];

const dataBR = iso => { try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return ""; } };

// Iniciais de quem fez, para o nome saltar aos olhos no histórico.
const iniciais = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase();
const nomeTipo = a => (String(a).split(".").pop() || "arquivo").toUpperCase();

/* ---------------------------------------------------------------- lista das obras */

export function paginaProjetos(user, aviso = "") {
  const d = ler();
  const cartao = o => {
    const nProj = (o.pastas?.projetos || []).length;
    const nAlv = (o.pastas?.alvara || []).length;
    const incorporada = o.incorporacao?.situacao === "incorporada";
    const selo = incorporada
      ? `<span class="selo sl-verde">✓ Incorporada</span>`
      : `<span class="selo sl-amarelo">Em incorporação</span>`;
    const novo = o.projetoNovo ? `<span class="selo sl-azul">✨ Projeto novo</span>` : "";
    return `<a class="card pj-card" href="/projetos/${esc(o.id)}">
      <span class="ic">${o.projetoNovo ? "📐" : "🏢"}</span>
      <h3>${esc(o.nome)}</h3>
      <div class="pj-selos">${selo}${novo}</div>
      <p class="pj-spe">${esc(o.spe)}<br><span class="pj-cnpj">${esc(o.cnpj)}</span></p>
      <div class="pj-conta">
        <span class="${nProj ? "doc-ok" : "doc-falta"}">📐 ${nProj} projeto${nProj === 1 ? "" : "s"}</span>
        ${chipAlvara(o)}
        ${chipDocsObra(o)}
      </div></a>`;
  };
  const ativas = d.obras.filter(o => !o.removido);
  const emFluxo = ativas.filter(o => !o.projetoNovo);
  const novos = ativas.filter(o => o.projetoNovo);

  const body = `<style>${CSS}</style>
  ${cabecalhoPagina({
    icone: "📐", titulo: "Documentos & Incorporações",      // nome novo em 13/11
    sub: `Ficha técnica, alvarás, documentos da obra e o andamento da incorporação de cada obra.`,
    voltar: "/engenharia", voltarRotulo: "Engenharia e Obra",
  })}
  ${quadroAlvaras(ativas, d, aviso)}
  <div class="secao">🏢 Empreendimentos — ${emFluxo.length}</div>
  <div class="grid">${emFluxo.map(cartao).join("")}</div>
  ${novos.length ? `<div class="secao">✨ Projetos novos — ${novos.length}</div>
    <div class="aud-nota" style="margin-bottom:12px">Ainda em projeto: estão aqui só para a documentação.</div>
    <div class="grid">${novos.map(cartao).join("")}</div>` : ""}`;
  return shell({ title: "Documentos & Incorporações", body, user });
}

/* ------------------------------------------------------------------ uma obra */

/** Os documentos de um andamento: a lista nova (cada um com a sua descrição) ou o anexo único de antes de 07/10. */
const docsDoAndamento = a => (a.arquivos && a.arquivos.length) ? a.arquivos : (a.arquivo ? [{ arquivo: a.arquivo, descricao: "" }] : []);

export function paginaObra(user, id, aviso = "") {
  const d = ler();
  const o = d.obras.find(x => x.id === id);
  if (!o) return shell({ title: "Obra", body: `<div class="vazio">Obra não encontrada.</div>`, user });

  const f = o.ficha || {};
  const campo = (k, rotulo, dica = "") => `<label class="pj-campo"><span>${rotulo}</span>
    <input name="${k}" value="${esc(f[k])}" placeholder="${esc(dica)}" autocomplete="off"></label>`;
  // campo de data nativo: em pt-BR o próprio navegador mostra e aceita dia/mês/ano,
  // e guarda aaaa-mm-dd, que é o que ordena direito.
  const dataCampo = (k, rotulo, valor) => `<label class="pj-campo"><span>${rotulo}</span>
    <input type="date" name="${k}" value="${esc(valor)}"></label>`;

  const inc = o.incorporacao || { situacao: "em_andamento", andamentos: [] };
  // cada registro leva a POSIÇÃO dele na lista original (i): é por ela, mais a data, que o "Editar" acha o registro certo
  const andamentos = (inc.andamentos || []).map((a, i) => ({ ...a, i })).reverse();
  const podeEditar = a => !!user && (user.nivel === "master" || a.quem === user.nome);

  const listaArquivos = (chave) => {
    const itens = o.pastas?.[chave] || [];
    if (!itens.length) return `<div class="pj-vazio">Nenhum arquivo ainda. O pessoal da arquitetura anexa aqui.</div>`;
    return itens.map(a => `<div class="pj-arq">
      <a href="/projetos/arquivo/${esc(a.arquivo)}" target="_blank">📄 ${esc(a.titulo || "documento")}</a>
      <span class="pj-meta">${esc(a.enviadoPor)} · ${esc(a.em)}</span></div>`).join("");
  };

  const formAnexo = (chave, rotulo) => `<form method="post" action="/projetos/anexo" enctype="multipart/form-data" class="pj-form">
    <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="pasta" value="${chave}">
    <input name="titulo" placeholder="Nome do documento (ex.: ${esc(rotulo)})" required>
    <span class="pj-tipos">PDF, DWG, DXF, JPG, PNG ou WEBP</span>
    <input type="file" name="arquivo" accept="${ACCEPT}" required>
    <button class="btn inline dark" type="submit">Anexar</button>
  </form>`;

  const body = `<style>${CSS}</style><script>${JS}</script>
  ${cabecalhoPagina({
    icone: o.projetoNovo ? "📐" : "🏢", titulo: esc(o.nome),
    sub: `${esc(o.spe)} · <b>CNPJ ${esc(o.cnpj)}</b>${o.projetoNovo ? ' · <span class="selo sl-azul">✨ Projeto novo — fora do fluxo</span>' : ""}`,
    voltar: "/projetos", voltarRotulo: "Documentos & Incorporações",
  })}
  ${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ""}

  <div class="pj-abas">
    ${[["ficha", "📋 Ficha técnica"],
       ...PASTAS.map(([k, ic, rotulo]) => [k, `${ic} ${rotulo}`]),
       ["incorporacao", "🏛️ Incorporação"]]
      .map(([k, r], i) => `<button class="pj-aba${i === 0 ? " on" : ""}" data-aba="${k}" onclick="pjAba(this)">${r}</button>`).join("")}
  </div>

  <div class="pj-painel" data-p="ficha">
    <form method="post" action="/projetos/ficha">
      <input type="hidden" name="id" value="${esc(o.id)}">
      <div class="pj-fixo"><div><span>Empreendimento</span><b>${esc(o.nome)}</b></div>
        <div><span>Razão social (SPE)</span><b>${esc(o.spe)}</b></div>
        <div><span>CNPJ</span><b>${esc(o.cnpj)}</b></div></div>
      <div class="pj-grade">
        ${campo("endereco", "Endereço", "Rua, número, bairro — cidade/UF")}
        ${campo("arquiteto", "Responsável técnico", "Arquiteto ou engenheiro responsável")}
        ${campo("terreno", "Área do terreno", "m²")}
        ${campo("pavimentos", "Pavimentos", "ex.: 18")}
        ${campo("unidades", "Unidades", "ex.: 96")}
        ${dataCampo("previsaoEntrega", "Previsão de entrega", f.previsaoEntrega)}
      </div>
      <label class="pj-campo"><span>Observações</span>
        <textarea name="observacoes" rows="3">${esc(f.observacoes)}</textarea></label>
      <div class="pg-acoes"><button class="btn inline dark" type="submit">Salvar ficha</button>
        <span class="dica">Em branco é melhor que chute: só preencher o que estiver documentado.
        ${o.atualizadoPor ? `Última edição: <b>${esc(o.atualizadoPor)}</b> · ${esc(o.atualizadoEm)}` : ""}</span></div>
    </form>
  </div>

  ${PASTAS.map(([chave, ic, rotulo]) => `<div class="pj-painel" data-p="${chave}" hidden>
    ${chave === "alvara" ? painelAlvara(o, d, ACCEPT) : chave === "docsobra" ? painelDocsObra(o, ACCEPT) : `<h3>${ic} ${rotulo}</h3>${listaArquivos(chave)}${formAnexo(chave, rotulo)}`}</div>`).join("")}

  <div class="pj-painel" data-p="incorporacao" hidden>
    <h3>🏛️ Incorporação</h3>
    <form method="post" action="/projetos/incorporacao" enctype="multipart/form-data">
      <input type="hidden" name="id" value="${esc(o.id)}">
      <div class="pj-sit">
        <label><input type="radio" name="situacao" value="incorporada" onchange="pjSituacao()" ${inc.situacao === "incorporada" ? "checked" : ""}> Já incorporada</label>
        <label><input type="radio" name="situacao" value="em_andamento" onchange="pjSituacao()" ${inc.situacao !== "incorporada" ? "checked" : ""}> Em fase de incorporação</label>
      </div>
      <div class="pj-certidao">
        <span>Certidão de incorporação</span>
        ${inc.certidao ? `<a href="/projetos/arquivo/${esc(inc.certidao.arquivo)}" target="_blank" class="doc-ok">📄 anexada — ver</a>
             ${inc.certidao.por ? `<span class="pj-meta">por <b>${esc(inc.certidao.por)}</b> · ${esc(inc.certidao.em)}</span>` : ""}`
                       : `<span class="doc-falta">ainda não anexada</span>`}
        <input type="file" name="certidao" accept="${ACCEPT}">
      </div>
      <div id="pjAndamento"${inc.situacao === "incorporada" ? " hidden" : ""}>
      <label class="pj-campo"><span>Fase em que está</span>
        <select name="fase" id="pjFase" onchange="pjOutra()">
          <option value="">— escolher —</option>
          ${FASES.map(x => `<option${inc.fase === x ? " selected" : ""}>${esc(x)}</option>`).join("")}
          <option value="__outra"${inc.fase && !FASES.includes(inc.fase) ? " selected" : ""}>Outra (escrever)</option>
        </select></label>
      <label class="pj-campo" id="pjOutraBox"${inc.fase && !FASES.includes(inc.fase) ? "" : " hidden"}><span>Qual fase</span>
        <input name="faseOutra" value="${esc(FASES.includes(inc.fase) ? "" : inc.fase)}" placeholder="Escrever a fase"></label>
      <label class="pj-campo"><span>Comentário desta atualização</span>
        <textarea name="comentario" rows="2" placeholder="Ex.: saiu a certidão de demolição"></textarea></label>
      <div class="pj-campo"><span>Documentos desta atualização (opcional)</span>
        <div id="pjDocs"><div class="pj-doc"><input type="file" name="anexo_0" accept="${ACCEPT}">
          <input type="text" name="anexoDesc_0" maxlength="200" placeholder="Descrição deste documento (ex.: certidão negativa municipal)"></div></div>
        <button type="button" class="pj-mais" onclick="pjMaisDoc()">+ documento</button></div>
      </div>
      <div class="pg-acoes"><button class="btn inline dark" type="submit">Salvar</button>
        <span class="dica" id="pjDica">Cada registro entra no histórico abaixo, com quem fez e quando. Nada é apagado.</span></div>
    </form>

    <div id="pjHistorico"${inc.situacao === "incorporada" ? " hidden" : ""}>
    <div class="secao" style="margin-top:22px">Histórico — ${andamentos.length} registro${andamentos.length === 1 ? "" : "s"}</div>
    ${andamentos.length ? andamentos.map(a => `<div class="pj-hist">
        <div class="pj-hist-top"><b>${esc(a.fase || "—")}</b>
          <span class="pj-quem"><span class="pj-ini">${esc(iniciais(a.quem))}</span>${esc(a.quem)} · ${esc(a.em)}</span></div>
        ${a.oQueFez ? `<div class="pj-fez">${a.oQueFez}</div>` : ""}
        ${a.comentario ? `<p>${esc(a.comentario)}</p>` : ""}
        ${docsDoAndamento(a).map(x => `<div><a href="/projetos/arquivo/${esc(x.arquivo)}" target="_blank">📎 ${esc(x.descricao || nomeTipo(x.arquivo) + " anexado")}</a></div>`).join("")}
        ${a.editadoPor ? `<div class="pj-meta" style="margin-top:4px">editado por ${esc(a.editadoPor)} · ${esc(a.editadoEm)}</div>` : ""}
        ${podeEditar(a) ? `<details class="pj-ed"><summary>Editar</summary>
          <form method="post" action="/projetos/incorporacao/editar">
            <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="i" value="${a.i}"><input type="hidden" name="em" value="${esc(a.em)}">
            <label class="pj-campo"><span>Fase</span><input name="fase" maxlength="160" value="${esc(a.fase)}"></label>
            <label class="pj-campo"><span>Comentário</span><textarea name="comentario" rows="2">${esc(a.comentario)}</textarea></label>
            ${docsDoAndamento(a).map((x, k) => `<label class="pj-campo"><span>Descrição do documento ${k + 1}</span><input name="desc_${k}" maxlength="200" value="${esc(x.descricao)}"></label>`).join("")}
            <button class="btn inline dark" type="submit">Salvar correção</button>
          </form></details>` : ""}
      </div>`).join("") : `<div class="pj-vazio">Nenhum andamento registrado ainda.</div>`}
    </div>
    ${inc.situacao === "incorporada" && andamentos.length ? `<details class="pj-antes"><summary>Ver o histórico de quando estava em incorporação — ${andamentos.length} registro${andamentos.length === 1 ? "" : "s"}</summary>
      ${andamentos.map(a => `<div class="pj-hist"><div class="pj-hist-top"><b>${esc(a.fase || "—")}</b>
        <span class="pj-quem"><span class="pj-ini">${esc(iniciais(a.quem))}</span>${esc(a.quem)} · ${esc(a.em)}</span></div>
        ${a.comentario ? `<p>${esc(a.comentario)}</p>` : ""}</div>`).join("")}</details>` : ""}
  </div>`;
  return shell({ title: o.nome, body, user });
}

const CSS = CSS_ALVARA + CSS_DOCOBRA + `
/* o atributo hidden tem que vencer o display:block das classes abaixo, senão o campo
   "outra fase" aparece sempre e o painel de aba nunca esconde */
[hidden]{display:none!important}
.pj-pu{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;text-decoration:none;background:var(--escuro);color:var(--acento-claro);border-radius:12px;padding:12px 16px;margin:12px 0 0;font-size:14px}
.pj-pu span{font-size:12px;color:#d8d2bf}
.pj-card .ic{font-size:26px;display:block;margin-bottom:8px}
.pj-selos{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 8px}
.pj-spe{font-size:11.5px;color:var(--mut);line-height:1.45}
.pj-cnpj{font-variant-numeric:tabular-nums;color:#8a8a93}
.pj-conta{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.pj-abas{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 0}
.pj-aba{border:1px solid #e0d9c4;background:#fff;color:#5a4e2e;border-radius:10px 10px 0 0;
  padding:9px 15px;font-size:12.5px;font-weight:700;cursor:pointer;border-bottom:0}
.pj-aba.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.pj-painel{background:#fff;border:1px solid #ece8dc;border-radius:0 16px 16px 16px;padding:20px;margin-top:-1px}
.pj-painel h3{font-size:15px;margin-bottom:14px;color:#17171b}
.pj-fixo{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:#faf9f4;border:1px solid #efeade;
  border-radius:12px;padding:13px 15px;margin-bottom:16px}
.pj-fixo span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.pj-fixo b{font-size:13px;color:#17171b}
.pj-grade{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.pj-campo{display:block;margin-bottom:12px}
.pj-campo span{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px}
.pj-campo input,.pj-campo textarea,.pj-campo select{width:100%;border:1px solid #e0dccc;border-radius:9px;
  padding:9px 11px;font-size:13.5px;font-family:inherit;background:#fff}
.pj-campo input:focus,.pj-campo textarea:focus,.pj-campo select:focus{outline:0;border-color:var(--acento)}
.pj-arq{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:9px 11px;
  border-bottom:1px solid #f2efe4;font-size:13px;flex-wrap:wrap}
.pj-arq a{color:#2f6db0;font-weight:600;text-decoration:none}
.pj-arq a:hover{text-decoration:underline}
.pj-meta{font-size:11px;color:var(--mut)}
.pj-vazio{color:var(--mut);font-size:13px;background:#faf9f4;border:1px dashed #ddd6c2;border-radius:12px;
  padding:18px;text-align:center}
.pj-form{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid #f2efe4}
.pj-form input[name=titulo]{flex:1;min-width:200px;border:1px solid #e0dccc;border-radius:9px;padding:9px 11px;font-size:13px}
.pj-form input[type=file]{font-size:12px}
.pj-tipos{font-size:11px;color:var(--mut);width:100%}
.pj-sit{display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px;font-size:13.5px}
.pj-certidao{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#faf9f4;border:1px solid #efeade;
  border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px}
.pj-certidao>span:first-child{font-weight:700}
.pj-hist{border-left:3px solid var(--acento);background:#faf9f4;border-radius:0 10px 10px 0;padding:11px 14px;margin-bottom:9px}
.pj-hist-top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px}
.pj-hist-top span{font-size:11px;color:var(--mut)}
.pj-quem{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.pj-ini{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;
  background:var(--escuro);color:var(--acento-claro);font-size:9px;font-weight:800;letter-spacing:0}
.pj-fez{font-size:11.5px;color:#6a6a72;margin-top:4px}
.pj-fez b{color:#3a3a42}
.pj-dica-data{display:block;font-size:11px;color:var(--mut);margin-top:4px}
.pj-antes{margin-top:18px;font-size:12.5px}
.pj-antes summary{cursor:pointer;color:var(--mut);font-weight:600;padding:8px 0}
.pj-antes summary:hover{color:var(--acento-escuro)}
.pj-hist p{font-size:13px;color:#3a3a42;margin:5px 0 0}
.pj-hist a{font-size:12.5px;color:#2f6db0;font-weight:600}
.btn.inline{width:auto}
.pj-doc{display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:10px;margin-bottom:8px}
.pj-ed{margin-top:8px}.pj-ed summary{cursor:pointer;font-size:12px;font-weight:700;color:#8a6d1e}
.pj-ed form{margin-top:10px;padding:12px;border:1px solid #ece8dc;border-radius:10px;background:#fff}
.pj-mais{border:1px dashed #cfc7ad;background:#fff;color:#5a4e2e;border-radius:9px;padding:7px 14px;font-size:12.5px;font-weight:700;cursor:pointer}
@media(max-width:820px){.pj-doc{grid-template-columns:1fr}}
@media(max-width:820px){.pj-fixo,.pj-grade{grid-template-columns:1fr}}
`;

const JS = `
// acerta o estado assim que a página abre — senão a dica fica falando de histórico
// numa obra já incorporada, onde não há andamento nenhum à vista.
document.addEventListener('DOMContentLoaded', function(){ if(document.getElementById('pjAndamento')) pjSituacao();
  // #alvara (ou outra aba) no endereço: abre direto nela (13/11)
  var h=location.hash.slice(1), b=h && document.querySelector('.pj-aba[data-aba="'+h+'"]'); if(b) pjAba(b); });

function pjAba(b){
  var k=b.getAttribute('data-aba'), abas=document.querySelectorAll('.pj-aba');
  for(var i=0;i<abas.length;i++) abas[i].classList.remove('on');
  b.classList.add('on');
  var ps=document.querySelectorAll('.pj-painel');
  for(var j=0;j<ps.length;j++) ps[j].hidden = ps[j].getAttribute('data-p')!==k;
}
// mais um documento na mesma atualização, com a descrição dele ao lado (até 10)
function pjMaisDoc(){
  var c=document.getElementById('pjDocs'), n=c.children.length; if(n>=10) return;
  var d=document.createElement('div'); d.className='pj-doc';
  var f=document.createElement('input'); f.type='file'; f.name='anexo_'+n; f.accept=c.querySelector('input[type=file]').accept;
  var t=document.createElement('input'); t.type='text'; t.name='anexoDesc_'+n; t.maxLength=200; t.placeholder='Descrição deste documento';
  d.appendChild(f); d.appendChild(t); c.appendChild(d);
}
function pjOutra(){
  var s=document.getElementById('pjFase');
  document.getElementById('pjOutraBox').hidden = s.value!=='__outra';
}
// Já incorporada: acabou o acompanhamento, o que importa é a certidão.
// Em fase: tudo à mostra. A troca responde na hora, sem recarregar.
function pjSituacao(){
  var r=document.querySelector('input[name=situacao]:checked');
  var pronta = r && r.value==='incorporada';
  var a=document.getElementById('pjAndamento'), h=document.getElementById('pjHistorico'),
      d=document.getElementById('pjDica');
  if(a) a.hidden=pronta;
  if(h) h.hidden=pronta;
  if(d) d.textContent = pronta
    ? 'Obra incorporada: basta anexar a certidão acima e salvar.'
    : 'Cada registro entra no histórico abaixo, com quem fez e quando. Nada é apagado.';
}
`;

// as obras ativas (a Medição usa esta lista)
export function obrasDoSetor() {
  try { return (ler().obras || []).filter(o => o.id && !o.removido).map(o => ({ id: o.id, nome: o.nome })); } catch { return []; }
}
