// projetos-docobra.js — DOCUMENTOS DA OBRA (13/11/2026), aba "🗂️ Documentos Obra" na página de cada obra
// em Projetos & Incorporações.
//
// · Lista FIXA dos documentos que toda obra precisa ter (DOCS_OBRA), em grupos: ARTs, demolição, ambiental, obra,
//   habite-se, empresa e imóvel. Cada um mostra se já está anexado, quantos arquivos, nº e data do documento.
// · Cada documento aceita vários arquivos (ex.: várias matrículas, ART com retificação). Anexar é pelo mesmo
//   /projetos/anexo do resto da página (pasta "docsobra", campo "tipo").
// · "Não se aplica": para a obra que não tem aquele documento (ex.: obra sem demolição). Sai da conta do que falta.
// · Nada some: tirar um arquivo só marca (removido: { por, em }) e ele fica em "removidos"; marcar/desmarcar
//   "não se aplica" fica no histórico (o.docsObraHist), com quem e quando.
import * as PONTE from "../ponte-engenharia.js";

const { agoraLocalISO } = PONTE;
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dataBR = iso => iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "";
const quem = user => (user && (user.nome || user.usuario)) || "?";
const agoraBR = () => new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T12:00:00Z"));

/** Os documentos da obra, na ordem da tela. `num` = o que pedir no campo número (vazio = não pede). */
export const DOCS_OBRA = [
  { k: "art-execucao", nome: "ART de execução", grupo: "ARTs", num: "Nº da ART" },
  { k: "art-estrutural", nome: "ART projeto estrutural", grupo: "ARTs", num: "Nº da ART" },
  { k: "art-arquitetonico", nome: "ART projeto arquitetônico", grupo: "ARTs", num: "Nº da ART / RRT" },
  { k: "art-eletrico", nome: "ART projeto elétrico", grupo: "ARTs", num: "Nº da ART" },
  { k: "art-hidraulico", nome: "ART projeto hidráulico", grupo: "ARTs", num: "Nº da ART" },
  { k: "art-preventivo", nome: "ART projeto preventivo", grupo: "ARTs", num: "Nº da ART" },
  { k: "ambientais", nome: "Documentos ambientais", grupo: "Ambiental", num: "Nº da licença / protocolo" },
  { k: "pgrcc", nome: "PGRCC (Plano de gestão ambiental)", grupo: "Ambiental", num: "" },
  { k: "alvara-demolicao", nome: "Alvará de demolição", grupo: "Demolição", num: "Nº do alvará" },
  { k: "certidao-demolicao", nome: "Certidão de demolição", grupo: "Demolição", num: "Nº da certidão" },
  { k: "cno", nome: "CNO", grupo: "Obra", num: "Nº do CNO" },
  { k: "habite-se-parcial", nome: "Habite-se parcial", grupo: "Habite-se", num: "Nº do habite-se" },
  { k: "habite-se", nome: "Habite-se", grupo: "Habite-se", num: "Nº do habite-se" },
  { k: "cartao-cnpj", nome: "Cartão CNPJ", grupo: "Empresa (SPE)", num: "" },
  { k: "contrato-social", nome: "Contrato Social", grupo: "Empresa (SPE)", num: "" },
  { k: "matriculas", nome: "Matrículas", grupo: "Imóvel", num: "Nº da matrícula" },
];
const DOC = Object.fromEntries(DOCS_OBRA.map(x => [x.k, x]));

const ativos = (o, k) => (o.pastas?.docsobra || []).filter(a => a.tipo === k && !a.removido);
const naoAplica = (o, k) => !!(o.docsObraNA && o.docsObraNA[k]);

/** Quantos documentos a obra já tem, dos que se aplicam a ela. */
export function contaDocsObra(o) {
  const vale = DOCS_OBRA.filter(x => !naoAplica(o, x.k));
  return { tem: vale.filter(x => ativos(o, x.k).length).length, total: vale.length };
}

/** O selinho do cartão da obra, na entrada. */
export function chipDocsObra(o) {
  const { tem, total } = contaDocsObra(o);
  return `<span class="${tem === total ? "doc-ok" : "doc-falta"}">🗂️ ${tem}/${total} docs</span>`;
}

/** A aba inteira. */
export function painelDocsObra(o, ACCEPT) {
  const { tem, total } = contaDocsObra(o);
  const pct = total ? Math.round(tem / total * 100) : 100;
  const grupos = [...new Set(DOCS_OBRA.map(x => x.grupo))];

  const arquivo = a => `<div class="do-arq">
      <a href="/projetos/arquivo/${esc(a.arquivo)}" target="_blank">📄 ${esc(a.titulo || DOC[a.tipo]?.nome || "documento")}</a>
      ${a.numero ? `<span class="do-num">nº ${esc(a.numero)}</span>` : ""}
      ${a.data ? `<span class="do-num">de ${esc(dataBR(a.data))}</span>` : ""}
      <span class="pj-meta">${esc(a.enviadoPor)} · ${esc(a.em)}</span>
      <form method="post" action="/projetos/docobra" class="do-tirar" onsubmit="return confirm('Tirar este arquivo da lista? Ele fica guardado em \\'removidos\\'.')">
        <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="acao" value="remover">
        <input type="hidden" name="arquivo" value="${esc(a.arquivo)}"><button class="al-x" type="submit">tirar</button></form>
    </div>`;

  const linha = x => {
    const lista = ativos(o, x.k).slice().reverse();          // o mais novo em cima
    const na = naoAplica(o, x.k);
    const removidos = (o.pastas?.docsobra || []).filter(a => a.tipo === x.k && a.removido);
    const selo = na ? `<span class="do-chip do-na">Não se aplica</span>`
      : lista.length ? `<span class="do-chip do-ok">✓ Anexado${lista.length > 1 ? ` · ${lista.length} arquivos` : ""}</span>`
      : `<span class="do-chip do-falta">Falta</span>`;
    return `<div class="do-doc${na ? " do-apag" : ""}" id="doc-${x.k}">
      <div class="do-top"><b>${esc(x.nome)}</b>${selo}
        <form method="post" action="/projetos/docobra" class="do-tirar">
          <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="tipo" value="${x.k}">
          <input type="hidden" name="acao" value="${na ? "aplica" : "naoaplica"}">
          <button class="do-link" type="submit">${na ? "volta a valer para esta obra" : "não se aplica"}</button></form></div>
      ${na ? `<div class="pj-meta">marcado por ${esc(o.docsObraNA[x.k].por)} · ${esc(o.docsObraNA[x.k].em)}</div>` : ""}
      ${lista.map(arquivo).join("")}
      ${!na ? `<details class="do-anexar"><summary>+ anexar ${lista.length ? "outro arquivo" : ""}</summary>
        <form method="post" action="/projetos/anexo" enctype="multipart/form-data" class="pj-form do-form">
          <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="pasta" value="docsobra">
          <input type="hidden" name="tipo" value="${x.k}">
          <label class="al-l"><span class="al-mut">Nome (opcional)</span><input name="titulo" maxlength="160" placeholder="${esc(x.nome)}"></label>
          ${x.num ? `<label class="al-l"><span class="al-mut">${esc(x.num)} (opcional)</span><input name="numero" maxlength="60"></label>` : ""}
          <label class="al-l"><span class="al-mut">Data do documento (opcional)</span><input type="date" name="data"></label>
          <input type="file" name="arquivo" accept="${ACCEPT}" required>
          <button class="btn inline dark" type="submit">Anexar</button>
        </form></details>` : ""}
      ${removidos.length ? `<details class="do-rem"><summary>removidos — ${removidos.length}</summary>
        ${removidos.map(a => `<div class="do-arq"><a href="/projetos/arquivo/${esc(a.arquivo)}" target="_blank">📄 ${esc(a.titulo || x.nome)}</a>
          <span class="pj-meta">tirado por ${esc(a.removido.por)} · ${esc(a.removido.em)}</span></div>`).join("")}</details>` : ""}
    </div>`;
  };

  const hist = (o.docsObraHist || []).slice(-15).reverse();
  return `<h3>🗂️ Documentos Obra</h3>
    <div class="do-resumo"><div class="do-n"><b>${tem}</b> de ${total}</div>
      <div class="do-barra"><i style="width:${pct}%"></i></div>
      <span class="al-mut">${tem === total ? "Todos os documentos anexados." : `Faltam ${total - tem}.`}
        Documento que esta obra não tem (ex.: sem demolição): marque "não se aplica".</span></div>
    ${grupos.map(g => `<div class="al-sub">${esc(g)}</div>${DOCS_OBRA.filter(x => x.grupo === g).map(linha).join("")}`).join("")}
    ${hist.length ? `<details class="do-rem" style="margin-top:16px"><summary>Histórico desta aba</summary>
      ${hist.map(h => `<div class="pj-meta" style="padding:3px 0">${esc(h.em)} · <b>${esc(h.por)}</b> ${esc(h.txt)}</div>`).join("")}</details>` : ""}`;
}

/** Os campos a mais do anexo desta aba. Devolve { erro } ou { tipo, numero, data }. */
export function camposAnexoDocObra(campos) {
  const tipo = String(campos.tipo || "");
  if (!DOC[tipo]) return { erro: "Documento desconhecido." };
  const data = String(campos.data || "").trim();
  if (data && !isoOk(data)) return { erro: "Data do documento inválida." };
  if (data && data > agoraLocalISO().slice(0, 10)) return { erro: "A data do documento não pode ser no futuro." };
  return { tipo, numero: String(campos.numero || "").slice(0, 60).trim(), data, nome: DOC[tipo].nome };
}

/** Tirar arquivo, "não se aplica" e "volta a valer". Devolve { ok | erro, o }. */
export function gravarDocObra(d, user, b) {
  const o = (d.obras || []).find(x => x.id === b.id);
  if (!o) return { erro: "Obra não encontrada." };
  const reg = txt => (o.docsObraHist = o.docsObraHist || []).push({ txt, por: quem(user), em: agoraBR() });
  if (b.acao === "remover") {
    const a = (o.pastas?.docsobra || []).find(x => x.arquivo === b.arquivo && !x.removido);
    if (!a) return { erro: "Arquivo não encontrado (a página estava desatualizada).", o };
    a.removido = { por: quem(user), em: agoraBR() };
    reg(`tirou "${a.titulo || ""}" de ${DOC[a.tipo]?.nome || a.tipo}`);
    return { ok: "Arquivo tirado da lista (fica em removidos).", o };
  }
  if (b.acao === "naoaplica" || b.acao === "aplica") {
    const x = DOC[b.tipo]; if (!x) return { erro: "Documento desconhecido.", o };
    o.docsObraNA = o.docsObraNA || {};
    if (b.acao === "naoaplica") {
      if (o.docsObraNA[x.k]) return { ok: "Nada mudou.", o };
      o.docsObraNA[x.k] = { por: quem(user), em: agoraBR() };
      reg(`marcou "${x.nome}" como não se aplica`);
      return { ok: `${x.nome}: não se aplica a esta obra.`, o };
    }
    if (!o.docsObraNA[x.k]) return { ok: "Nada mudou.", o };
    delete o.docsObraNA[x.k];
    reg(`voltou a pedir "${x.nome}"`);
    return { ok: `${x.nome} volta a valer para esta obra.`, o };
  }
  return { erro: "Ação desconhecida.", o };
}

export const CSS_DOCOBRA = `
.do-resumo{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid #ece8dc;border-radius:12px;padding:12px 16px;background:#fcfbf7;margin-bottom:10px}
.do-n{font-size:13px;color:var(--mut)}.do-n b{font-size:26px;color:#17171b}
.do-barra{flex:0 0 180px;height:9px;border-radius:9px;background:#efeadb;overflow:hidden}.do-barra i{display:block;height:100%;background:var(--acento)}
.do-doc{border:1px solid #ece8dc;border-radius:10px;padding:9px 12px;margin-bottom:7px;background:#fff}
.do-doc.do-apag{opacity:.55;background:#faf9f4}
.do-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px}.do-top b{flex:1;min-width:180px}
.do-chip{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;border:1px solid}
.do-ok{background:#e8f2e2;color:#2f6b2f;border-color:#cfe3c4}.do-falta{background:#fbe9e9;color:#a02c2c;border-color:#f0c9c9}
.do-na{background:#f1f0ec;color:#77736a;border-color:#e0ddd3}
.do-link{border:0;background:none;color:#8a6d1e;font-size:11.5px;cursor:pointer;text-decoration:underline;font-family:inherit}
.do-tirar{display:inline;margin:0}
.do-arq{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:6px 2px 4px 8px;border-top:1px solid #f3f0e6;margin-top:6px;font-size:12.5px}
.do-arq a{color:#2f6db0;font-weight:600;text-decoration:none}.do-arq a:hover{text-decoration:underline}
.do-num{font-size:11.5px;color:#5a4e2e;background:#f3efe2;border-radius:6px;padding:1px 7px}
.do-anexar,.do-rem{margin-top:6px;font-size:12px}.do-anexar>summary,.do-rem>summary{cursor:pointer;color:#8a6d1e;font-weight:700;font-size:11.5px}
.do-rem>summary{color:var(--mut)}
.do-form{align-items:flex-end;margin-top:8px}
`;
