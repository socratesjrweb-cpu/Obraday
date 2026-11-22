// documentos-materiais.js — MATERIAIS E ACABAMENTOS de cada empreendimento (09/11).
//
//   · a aba 🎨 Materiais e acabamentos de Projetos (/documentos/materiais): escolhe a obra e vê a lista, por grupo
//     (pinturas, pisos e revestimentos, louças e metais, portas e esquadrias, iluminação, forros, áreas comuns);
//   · cada item tem: o material / acabamento escolhido (nome, marca, cor, referência), FOTO, LINK de onde encontrar,
//     QUANTIDADE (com unidade) e observação. NENHUM campo é obrigatório;
//   · a obra começa com a lista padrão (LISTA_PADRAO); dá para acrescentar itens (inclusive um segundo no mesmo item,
//     ex.: duas cores de pintura) e tirar da lista o que não se aplica;
//   · quem edita: a engenharia com acesso total e a Diretoria. A obra só vê. O projetista de fora não vê esta aba;
//   · nada some: editar guarda a versão anterior (anteriores), trocar a foto guarda a antiga, remover só marca.
// Dados em documentos.json (materiais[obra]); fotos em DIR_ANEXOS/documentos/materiais/.
import { join } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { shell, salvarArquivo, agoraLocalISO, OBRAS_DOCS } from "../ponte-engenharia.js";
import { BASE_DOCS, DIR_DOCS } from "./documentos.js";

const PASTA = join(DIR_DOCS, "materiais");
const FOTO_OK = [".jpg", ".jpeg", ".png", ".webp"];
export const UNIDADES = ["m²", "m", "m³", "un", "pç", "cj", "L", "gl", "lata", "kg", "cx", "vb"];

// ---------- a lista padrão  ----------
export const LISTA_PADRAO = [
  { g: "pint", nome: "🖌️ Pinturas", itens: [
    ["pint-int-aptos", "Pintura interna — apartamentos (paredes)"], ["pint-teto-aptos", "Pintura de teto — apartamentos"],
    ["pint-ext", "Pintura externa / fachada"],
    ["pint-hall-entrada", "Pintura interna áreas comuns — hall de entrada"], ["pint-halls-aptos", "Pintura interna áreas comuns — halls dos apartamentos"],
    ["pint-lazer", "Pintura interna áreas comuns — lazer"], ["pint-garagens", "Pintura interna áreas comuns — garagens"],
    ["pint-escadas", "Pintura das escadas"], ["pint-demarc", "Demarcação de vagas e sinalização das garagens"],
    ["pint-metal", "Pintura de portões, gradis e metais"]] },
  { g: "piso", nome: "🧱 Pisos e revestimentos", itens: [
    ["porc-int", "Porcelanato interno — apartamentos (sala e quartos)"], ["porc-molhadas", "Porcelanato das áreas molhadas (banheiros, cozinha e serviço)"],
    ["rev-banho", "Revestimento de parede — banheiros"], ["rev-cozinha", "Revestimento de parede — cozinha e área de serviço"],
    ["porc-ext", "Porcelanato externo — sacadas e terraços"], ["piso-hall-entrada", "Piso do hall de entrada"],
    ["piso-halls", "Piso dos halls dos apartamentos"], ["piso-lazer", "Piso do lazer"], ["piso-piscina", "Piso e borda da piscina"],
    ["piso-garagens", "Piso das garagens"], ["piso-escadas", "Piso das escadas"], ["rodape", "Rodapés"],
    ["soleiras", "Soleiras, peitoris e filetes"], ["rev-fachada", "Revestimento da fachada"]] },
  { g: "louca", nome: "🚽 Louças, metais e bancadas", itens: [
    ["loucas-aptos", "Louças — apartamentos"], ["loucas-lazer", "Louças — lazer"], ["loucas-salas", "Louças — salas comerciais"],
    ["loucas-comuns", "Louças — áreas comuns (banheiros de serviço e PNE)"],
    ["metais-aptos", "Metais — apartamentos (torneiras, registros, chuveiros)"], ["metais-comuns", "Metais — áreas comuns"],
    ["cubas", "Cubas e tanques"], ["bancadas-aptos", "Bancadas — apartamentos (granito, quartzo…)"], ["bancadas-comuns", "Bancadas — áreas comuns"],
    ["acess-banho", "Acessórios de banheiro"], ["box", "Box dos banheiros"]] },
  { g: "porta", nome: "🚪 Portas, esquadrias e vidros", itens: [
    ["portas-int", "Portas internas"], ["portas-ext", "Portas externas (entrada dos apartamentos)"], ["portas-cf", "Portas corta-fogo"],
    ["ferragens", "Fechaduras, dobradiças e puxadores"], ["esquadrias", "Esquadrias de alumínio (janelas e portas de sacada)"],
    ["vidros", "Vidros"], ["guarda-corpo", "Guarda-corpos"], ["portao-garagem", "Portão da garagem"],
    ["porta-elevador", "Cor da porta do elevador"], ["cabine-elevador", "Acabamento da cabine do elevador"]] },
  { g: "ilum", nome: "💡 Iluminação e elétrica", itens: [
    ["ilum-garagens", "Iluminação das garagens"], ["lum-hall-entrada", "Luminárias áreas comuns — hall de entrada"],
    ["lum-halls", "Luminárias áreas comuns — halls dos apartamentos"], ["lum-lazer", "Luminárias áreas comuns — lazer"],
    ["lum-escadas", "Luminárias das escadas"], ["ilum-fachada", "Iluminação da fachada"], ["ilum-externa", "Iluminação externa e do paisagismo"],
    ["tomadas", "Interruptores e tomadas (linha e cor)"], ["ilum-emerg", "Iluminação de emergência"]] },
  { g: "forro", nome: "⬜ Forros", itens: [
    ["forro-aptos", "Forro de gesso — apartamentos"], ["forro-comuns", "Forro — áreas comuns"], ["sancas", "Sancas, tabicas e molduras"]] },
  { g: "comum", nome: "🌳 Áreas comuns e externas", itens: [
    ["mobiliario-lazer", "Mobiliário e decoração do lazer"], ["paisagismo", "Paisagismo"], ["correio", "Caixas de correio"],
    ["com-visual", "Comunicação visual e placas"], ["cobertura", "Cobertura e telhado"], ["muros", "Muros, gradis e fechamento"],
    ["calcada", "Calçada e acessos"]] },
  { g: "outro", nome: "➕ Outros", itens: [] },
];
const GRUPOS = LISTA_PADRAO.map(x => x.g);
const PADRAO = new Map(LISTA_PADRAO.flatMap(x => x.itens.map(([chave, nome]) => [chave, { g: x.g, nome }])));

const B = () => BASE_DOCS;
const podeVer = (u, obra) => !!u && !B().externo(u) && (!obra || B().podeObra(u, obra));
const podeEditar = (u, obra) => podeVer(u, obra) && B().acessoTotal(u);
const nomeObra = id => (OBRAS_DOCS.find(o => o.id === id) || {}).nome || id;
const preenchido = r => !!(r && (r.nome || r.foto || r.link || r.qtd || r.obs || (r.medidas && r.medidas.length)));
// TAMANHOS / MEDIDAS (09/11): lista opcional "onde → medida" em cada item (ex.: portas dos dormitórios → 80 cm). Na janela de
// preencher ela fica RECOLHIDA (📏 Tamanhos), para não poluir; na linha aparece em etiquetas pequenas.
const MEDIDAS_SUG = {
  "portas-int": ["Dormitórios", "Banheiros", "Cozinha / serviço", "Vistas / guarnições", "Altura"],
  "portas-ext": ["Porta de entrada", "Vistas / guarnições", "Altura"], "portas-cf": ["Largura", "Altura"],
  "esquadrias": ["Janela dos dormitórios", "Janela do banheiro", "Porta da sacada", "Peitoril (altura)"],
  "porc-int": ["Formato", "Espessura", "Junta"], "porc-molhadas": ["Formato", "Junta"], "porc-ext": ["Formato", "Junta"],
  "rev-banho": ["Formato", "Altura do revestimento"], "rev-cozinha": ["Formato", "Altura do revestimento"], "rev-fachada": ["Formato"],
  "piso-hall-entrada": ["Formato"], "piso-halls": ["Formato"], "piso-lazer": ["Formato"], "piso-garagens": ["Espessura", "Junta"],
  "rodape": ["Altura"], "soleiras": ["Largura", "Espessura"], "bancadas-aptos": ["Cozinha", "Banheiro", "Espessura"],
  "bancadas-comuns": ["Comprimento", "Espessura"], "box": ["Largura", "Altura"], "guarda-corpo": ["Altura"],
  "portao-garagem": ["Largura", "Altura"], "forro-aptos": ["Pé-direito com forro", "Rebaixo"], "sancas": ["Largura"],
};
const MEDIDAS_COMUNS = ["Largura", "Altura", "Comprimento", "Espessura", "Formato", "Diâmetro"];
/** as medidas que vêm da tela (JSON), limpas: no máximo 15, linha sem nada some */
const medidasOk = j => { let a; try { a = JSON.parse(String(j || "[]")); } catch { return []; } if (!Array.isArray(a)) return [];
  return a.map(m => ({ o: txt(m && m.o, 60), v: txt(m && m.v, 40) })).filter(m => m.o || m.v).slice(0, 15); };
const medidasTxt = ms => (ms || []).map(m => (m.o ? m.o + " " : "") + m.v).join(" · ");
const txt = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
/** link: só http(s); sem o começo, entende como https:// */
const linkOk = t => { let s = txt(t, 600); if (!s) return ""; if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null; } catch { return null; } };
const qtdOk = t => { const s = txt(t, 30).replace(/\s/g, ""); if (!s) return ""; const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null; };
const numBR = n => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** As linhas da obra: a lista padrão (com o que já foi preenchido) + os itens acrescentados. Removidos à parte. */
function linhasDaObra(d, obra) {
  const gr = (d.materiais && d.materiais[obra]) || [], porChave = new Map(gr.filter(r => r.chave).map(r => [r.chave, r]));
  const vivas = [], removidas = [];
  for (const [chave, p] of PADRAO) { const r = porChave.get(chave);
    const l = r ? { ...r, g: p.g, item: r.item || p.nome, padrao: true } : { chave, g: p.g, item: p.nome, padrao: true };
    (r && r.removido ? removidas : vivas).push(l); }
  for (const r of gr.filter(r => !r.chave)) (r.removido ? removidas : vivas).push({ ...r, g: GRUPOS.includes(r.g) ? r.g : "outro" });
  return { vivas, removidas };
}
const chaveLinha = l => l.chave ? "p-" + l.chave : l.id;

// ---------- a tela ----------
const CSS_MT = `<style>
.mt-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 4px}
.mt-bar input[type=search]{flex:1;min-width:200px;padding:8px 11px;border:1px solid #ddd8c8;border-radius:9px;font-size:13px;font-family:inherit}
.mt-bar select{padding:8px 9px;border:1px solid #ddd8c8;border-radius:9px;font-size:13px;font-family:inherit;background:#fff}
.mt-num{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 4px}.mt-num div{background:#1a1a1d;color:#e9d49a;border-radius:12px;padding:8px 14px;min-width:120px}
.mt-num b{display:block;font-size:22px;color:#fff}.mt-num span{font-size:11.5px}
.mt-g{margin-top:14px}.mt-g>h3{font-size:14.5px;margin:0 0 6px;display:flex;gap:8px;align-items:baseline}.mt-g>h3 span{font-size:12px;color:var(--mut);font-weight:400}
.mt-t{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}
.mt-t th{text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);padding:6px 8px;border-bottom:2px solid #ece8dc}
.mt-t td{padding:7px 8px;border-bottom:1px solid #f1ede1;vertical-align:middle}
.mt-t tr.vz td.mat{color:#b8b09a;font-style:italic}.mt-t .it{font-weight:700;width:30%}.mt-t .mat{width:28%}
.mt-t .ft{width:64px}.mt-t .ft img{width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #e6e0cf;display:block}
.mt-t .ft .sem{width:56px;height:56px;border-radius:8px;border:1px dashed #e0dac8;display:flex;align-items:center;justify-content:center;color:#cfc8b2;font-size:18px}
.mt-t .lk{max-width:150px}.mt-t .lk a{color:#8a6a12;font-weight:700;text-decoration:none;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mt-t .q{white-space:nowrap;font-weight:800}
.mt-t .ac{white-space:nowrap;text-align:right;width:1%}.mt-ob{font-size:11.5px;color:var(--mut);margin-top:2px;font-weight:400}
.mt-md{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.mt-md span{background:#f6f1e2;border:1px solid #e8dfc4;border-radius:999px;padding:1px 8px;font-size:11px;color:#5a4a20;font-weight:400}
.mt-dl details.md{grid-column:1/-1;border:1px solid #ece6d3;border-radius:10px;background:#fcfbf7}.mt-dl details.md summary{cursor:pointer;padding:8px 11px;font-size:12.5px;font-weight:700;color:#5a4a20;list-style:none}
.mt-dl details.md summary::-webkit-details-marker{display:none}.mt-dl details.md summary .q{font-weight:400;color:var(--mut);margin-left:6px}
.mt-dl .mdl{padding:0 11px 10px}.mt-dl .mdr{display:grid;grid-template-columns:1fr 110px 26px;gap:6px;margin-bottom:6px}.mt-dl .mdr button{border:0;background:none;color:#b03a3a;font-size:16px;cursor:pointer}
.mt-novo{font-size:10px;background:#f1ede1;color:#6a5e3a;border-radius:999px;padding:1px 7px;margin-left:4px;font-weight:700}
dialog.mt-dl{position:fixed;inset:0;margin:auto;height:fit-content;max-height:calc(100vh - 24px);overflow:auto;border:0;border-radius:16px;padding:0;max-width:560px;width:calc(100% - 24px);box-shadow:0 10px 40px rgba(0,0,0,.35)}
dialog.mt-dl::backdrop{background:rgba(0,0,0,.45)}.mt-dl form{padding:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mt-dl h3{grid-column:1/-1;margin:0;font-size:16px}.mt-dl .l{grid-column:1/-1}
.mt-dl label{display:block;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.mt-dl input,.mt-dl select,.mt-dl textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ddd8c8;border-radius:8px;font-size:13.5px;font-family:inherit}
.mt-dl textarea{min-height:60px;resize:vertical}.mt-dl .fim{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.mt-dl .prev{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--mut)}.mt-dl .prev img{width:64px;height:64px;object-fit:cover;border-radius:8px}
@media(max-width:760px){.mt-t thead{display:none}.mt-t,.mt-t tbody,.mt-t tr,.mt-t td{display:block;width:auto!important}
  .mt-t tr{display:grid;grid-template-columns:64px 1fr;gap:2px 10px;padding:10px 4px;border-bottom:1px solid #ece8dc}.mt-t td{border:0;padding:1px 0}
  .mt-t .ft{grid-row:1/6;grid-column:1}.mt-t td:not(.ft){grid-column:2}.mt-t .ac{text-align:left}.mt-dl form{grid-template-columns:1fr}}
@media print{.pj-abas,.mt-bar,.mt-t .ac,.mt-sem-print,header,nav{display:none!important}.mt-t tr{break-inside:avoid}.mt-g{break-inside:auto}}
</style>`;

export function paginaMateriaisEntrada(user) {
  if (!podeVer(user)) return null;
  const d = B().ler(), esc = B().esc;
  const cards = B().obrasDoUsuario(user).map(o => { const { vivas } = linhasDaObra(d, o.id), n = vivas.filter(preenchido).length, f = vivas.filter(l => l.foto).length;
    return `<a class="pj-obra${n ? "" : " vazia"}" href="/documentos/materiais/${o.id}"><div class="t"><span class="sg">${B().siglaObra(o.id)}</span><b>${esc(o.nome)}</b><span class="ir">›</span></div>
      ${n ? `<div class="ch"><span>🎨 ${n} de ${vivas.length} itens preenchidos</span><span style="color:var(--mut);font-weight:400">📷 ${f} com foto</span></div>` : `<div class="vz">Nada preenchido ainda · ${vivas.length} itens na lista</div>`}</a>`; }).join("");
  const body = `${B().CSS}${B().topoProjetos(user, "materiais")}
    <div class="pj-quadro"><div class="pj-qt"><b>🎨 Materiais e acabamentos</b><span>escolha a obra: o que foi especificado em cada item, com foto, onde encontrar e quantidade</span></div>
      <div class="pj-obras">${cards}</div></div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      Cada obra começa com a mesma lista de itens (pinturas, pisos e revestimentos, louças e metais, portas e esquadrias, iluminação, forros e áreas
      comuns). Em cada item a engenharia registra o <b>material ou acabamento</b> escolhido, uma <b>foto</b>, o <b>link</b> de onde encontrar e a
      <b>quantidade</b> — <b>nenhum campo é obrigatório</b>. Dá para <b>acrescentar</b> itens (até dois no mesmo item, como duas cores de tinta) e
      <b>tirar da lista</b> o que não se aplica àquela obra. A obra consulta; quem edita é a engenharia e a Diretoria. Toda alteração fica guardada,
      com quem fez e quando.</div></details>`;
  return shell({ title: "Materiais e acabamentos · Projetos", body, user });
}

export function paginaMateriais(user, obra, { ok = "", erro = "", q = "", f = "" } = {}) {
  if (!podeVer(user, obra) || !OBRAS_DOCS.some(o => o.id === obra)) return null;
  const d = B().ler(), esc = B().esc, edita = podeEditar(user, obra), { vivas, removidas } = linhasDaObra(d, obra);
  const nP = vivas.filter(preenchido).length, nF = vivas.filter(l => l.foto).length, nL = vivas.filter(l => l.link).length;
  const fotoUrl = l => `/documentos/materiais/${obra}/foto/${l.id}?v=${encodeURIComponent((l.foto && l.foto.arquivo) || "")}`;
  const dados = l => esc(JSON.stringify({ k: chaveLinha(l), id: l.id || "", chave: l.chave || "", g: l.g, item: l.item, padrao: !!l.padrao, nome: l.nome || "", link: l.link || "",
    qtd: l.qtd == null || l.qtd === "" ? "" : String(l.qtd).replace(".", ","), un: l.un || "", obs: l.obs || "", foto: l.foto ? fotoUrl(l) : "", medidas: l.medidas || [], sug: MEDIDAS_SUG[l.chave] || [] }));
  const linha = l => { const cheio = preenchido(l), busca = esc([l.item, l.nome, l.obs, l.link, medidasTxt(l.medidas)].join(" ").toLowerCase());
    return `<tr id="m-${esc(chaveLinha(l))}" class="${cheio ? "" : "vz"}" data-busca="${busca}" data-cheio="${cheio ? 1 : 0}" data-foto="${l.foto ? 1 : 0}">
      <td class="ft">${l.foto ? `<a href="${fotoUrl(l)}" target="_blank" rel="noopener"><img src="${fotoUrl(l)}" alt="" loading="lazy"></a>` : `<div class="sem">📷</div>`}</td>
      <td class="it">${esc(l.item)}${l.padrao ? "" : `<span class="mt-novo">acrescentado</span>`}</td>
      <td class="mat">${l.nome ? esc(l.nome) : "— a definir —"}${l.medidas && l.medidas.length ? `<div class="mt-md">${l.medidas.map(m => `<span>📏 ${m.o ? `${esc(m.o)} <b>${esc(m.v)}</b>` : `<b>${esc(m.v)}</b>`}</span>`).join("")}</div>` : ""}${l.obs ? `<div class="mt-ob">${esc(l.obs)}</div>` : ""}${l.alterado || l.criado ? `<div class="mt-ob">✎ ${esc((l.alterado || l.criado).por)} · ${B().dh((l.alterado || l.criado).em)}</div>` : ""}</td>
      <td class="lk">${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(new URL(l.link).hostname.replace(/^www\./, ""))}</a>` : ""}</td>
      <td class="q">${l.qtd !== "" && l.qtd != null ? `${numBR(l.qtd)} ${esc(l.un || "")}` : ""}</td>
      <td class="ac">${edita ? `<button type="button" class="dc-bt" data-ed="${dados(l)}">✏️ ${cheio ? "editar" : "preencher"}</button>
        <form method="POST" action="/documentos/materiais/${obra}/acao" style="display:inline" onsubmit="return confirm('Tirar &quot;'+${esc(JSON.stringify(l.item))}+'&quot; da lista desta obra? Fica guardado e pode voltar.')">
          <input type="hidden" name="acao" value="remover"><input type="hidden" name="k" value="${esc(chaveLinha(l))}"><button class="dc-x" title="Tirar da lista">tirar</button></form>` : ""}</td></tr>`; };
  const grupos = LISTA_PADRAO.map(G => { const ls = vivas.filter(l => l.g === G.g); if (!ls.length && G.g === "outro") return "";
    return `<section class="mt-g" data-g="${G.g}"><h3>${G.nome} <span>${ls.filter(preenchido).length} de ${ls.length} preenchidos</span></h3>
      <div style="overflow-x:auto"><table class="mt-t"><thead><tr><th>Foto</th><th>Item</th><th>Material / acabamento</th><th>Onde encontrar</th><th>Quantidade</th><th></th></tr></thead>
      <tbody>${ls.map(linha).join("") || `<tr><td colspan="6" style="color:var(--mut)">Nenhum item neste grupo.</td></tr>`}</tbody></table></div>
      ${edita ? `<button type="button" class="dc-bt claro mt-sem-print" style="margin-top:6px" data-novo="${G.g}">＋ acrescentar item em ${esc(G.nome.replace(/^\S+\s/, ""))}</button>` : ""}</section>`; }).join("");
  const outras = B().obrasDoUsuario(user).map(o => `<option value="${o.id}"${o.id === obra ? " selected" : ""}>${esc(o.nome)}</option>`).join("");
  const rem = removidas.length && edita ? `<details class="dc-disc mt-sem-print" style="margin-top:16px"><summary>🗃️ Itens tirados da lista desta obra <span class="n">${removidas.length}</span></summary><div class="dc-corpo">
      ${removidas.map(l => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #f3f0e6;font-size:12.5px"><span style="flex:1"><b>${esc(l.item)}</b>${l.nome ? " · " + esc(l.nome) : ""}
        <span style="color:var(--mut)"> — tirado por ${esc(l.removido.por)} em ${B().dh(l.removido.em)}</span></span>
        <form method="POST" action="/documentos/materiais/${obra}/acao"><input type="hidden" name="acao" value="restaurar"><input type="hidden" name="k" value="${esc(chaveLinha(l))}"><button class="dc-bt claro">↩ voltar para a lista</button></form></div>`).join("")}</div></details>` : "";
  const dialogo = edita ? `<dialog class="mt-dl" id="mtDl"><form method="POST" enctype="multipart/form-data" action="/documentos/materiais/${obra}/salvar">
      <h3 id="mtTit">Item</h3><input type="hidden" name="id"><input type="hidden" name="chave"><input type="hidden" name="g">
      <div class="l" id="mtItemBox"><label>Item</label><input name="item" maxlength="120" placeholder="Ex.: Pintura interna — apartamentos (cor da sala)"></div>
      <div class="l"><label>Material / acabamento (nome, marca, cor, referência)</label><input name="nome" maxlength="200" placeholder="Ex.: Suvinil Fosco Completo — Branco Neve"></div>
      <div class="l"><label>Foto</label><div class="prev" id="mtPrev"></div><input type="file" name="foto" accept="image/jpeg,image/png,image/webp" capture="environment"></div>
      <div class="l"><label>Onde encontrar (link)</label><input name="link" maxlength="600" inputmode="url" placeholder="https://…"></div>
      <div><label>Quantidade</label><input name="qtd" inputmode="decimal" maxlength="20" placeholder="Ex.: 1.250,5"></div>
      <div><label>Unidade</label><input name="un" maxlength="12" list="mtUn" placeholder="m², un, L…"><datalist id="mtUn">${UNIDADES.map(u => `<option value="${u}">`).join("")}</datalist></div>
      <details class="md" id="mtMd"><summary>📏 Tamanhos / medidas <span class="q" id="mtMdQ">opcional — ex.: portas dos dormitórios 80 cm</span></summary>
        <div class="mdl"><div id="mtMdL"></div><button type="button" class="dc-bt claro" id="mtMdMais">＋ medida</button>
        <datalist id="mtMdSug"></datalist><input type="hidden" name="medidas"></div></details>
      <div class="l"><label>Observação</label><textarea name="obs" maxlength="600" placeholder="Ex.: rejunte cinza platina; usar só na torre"></textarea></div>
      <div class="fim"><span style="flex:1;font-size:11.5px;color:var(--mut);align-self:center">Nenhum campo é obrigatório.</span>
        <button type="button" class="dc-bt claro" onclick="document.getElementById('mtDl').close()">Cancelar</button><button class="dc-bt" style="background:#1f7a33;border-color:#1f7a33;color:#fff">✓ Gravar</button></div>
    </form></dialog>` : "";
  const body = `${B().CSS}${CSS_MT}${B().topoProjetos(user, "materiais")}
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 10px">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 10px">${esc(ok)}</div>` : ""}
    <div class="pj-quadro"><div class="pj-qt"><b>🎨 Materiais e acabamentos · ${esc(nomeObra(obra))}</b><span>${edita ? "clique em ✏️ para preencher — nenhum campo é obrigatório" : "o que foi especificado para esta obra"}</span></div>
      <div class="mt-num"><div><b>${nP}<span style="font-size:13px;color:#e9d49a"> / ${vivas.length}</span></b><span>itens preenchidos</span></div><div><b>${nF}</b><span>com foto</span></div><div><b>${nL}</b><span>com link</span></div></div>
      <div class="mt-bar"><select onchange="location.href='/documentos/materiais/'+this.value">${outras}</select>
        <input type="search" id="mtQ" placeholder="🔍 procurar item ou material…" value="${esc(q)}">
        <select id="mtF"><option value="">todos os itens</option><option value="cheio"${f === "cheio" ? " selected" : ""}>só os preenchidos</option><option value="vazio"${f === "vazio" ? " selected" : ""}>só os que faltam</option><option value="semfoto"${f === "semfoto" ? " selected" : ""}>preenchidos sem foto</option></select>
        <button type="button" class="dc-bt claro" onclick="window.print()">🖨️ Imprimir</button></div>
      ${grupos}${rem}</div>
    ${dialogo}
    <script>(function(){ var dl=document.getElementById('mtDl'), q=document.getElementById('mtQ'), fs=document.getElementById('mtF');
      function filtra(){ var t=(q.value||'').toLowerCase().trim(), f=fs.value;
        document.querySelectorAll('.mt-t tbody tr[data-busca]').forEach(function(tr){ var ok=(!t||tr.dataset.busca.indexOf(t)>=0)&&(!f||(f==='cheio'&&tr.dataset.cheio==='1')||(f==='vazio'&&tr.dataset.cheio==='0')||(f==='semfoto'&&tr.dataset.cheio==='1'&&tr.dataset.foto==='0')); tr.style.display=ok?'':'none'; });
        document.querySelectorAll('.mt-g').forEach(function(s){ var vis=[].some.call(s.querySelectorAll('tbody tr[data-busca]'),function(tr){return tr.style.display!=='none';}); s.style.display=vis||(!t&&!f)?'':'none'; }); }
      q.addEventListener('input',filtra); fs.addEventListener('change',filtra); filtra();
      if(!dl) return; var F=dl.querySelector('form');
      function abre(j){ ['id','chave','g','item','nome','link','qtd','un','obs'].forEach(function(k){ F.elements[k].value=j[k]||''; }); F.elements.foto.value='';
        document.getElementById('mtTit').textContent=j.item||'Novo item'; document.getElementById('mtItemBox').style.display=j.padrao?'none':'';
        document.getElementById('mtPrev').innerHTML=j.foto?'<img src="'+j.foto+'" alt=""><label style="display:inline-flex;gap:5px;align-items:center;text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" name="semFoto" value="1" style="width:auto"> tirar a foto</label><span>ou escolha outra abaixo para trocar</span>':'';
        var ms=j.medidas||[], L=document.getElementById('mtMdL'); L.innerHTML=''; ms.forEach(function(m){ linhaMd(m.o,m.v); }); if(!ms.length) linhaMd('','');
        document.getElementById('mtMdSug').innerHTML=(j.sug||[]).concat(${JSON.stringify(MEDIDAS_COMUNS)}).filter(function(x,i,a){return a.indexOf(x)===i;}).map(function(x){ return '<option value="'+x.replace(/"/g,'&quot;')+'">'; }).join('');
        document.getElementById('mtMd').open=ms.length>0; contaMd();
        dl.showModal(); setTimeout(function(){ F.elements[j.padrao?'nome':'item'].focus(); },50); }
      function linhaMd(o,v){ var d=document.createElement('div'); d.className='mdr'; d.innerHTML='<input placeholder="onde (ex.: dormitórios)" list="mtMdSug" maxlength="60"><input placeholder="80 cm" maxlength="40"><button type="button" title="tirar">×</button>';
        d.children[0].value=o||''; d.children[1].value=v||''; d.children[2].onclick=function(){ d.remove(); contaMd(); }; d.oninput=contaMd; document.getElementById('mtMdL').appendChild(d); }
      function lerMd(){ return [].map.call(document.querySelectorAll('#mtMdL .mdr'),function(d){ return {o:d.children[0].value.trim(),v:d.children[1].value.trim()}; }).filter(function(m){ return m.o||m.v; }); }
      function contaMd(){ var n=lerMd().length; document.getElementById('mtMdQ').textContent=n?n+' medida'+(n>1?'s':''):'opcional — ex.: portas dos dormitórios 80 cm'; }
      document.getElementById('mtMdMais').onclick=function(){ linhaMd('',''); document.querySelector('#mtMdL .mdr:last-child input').focus(); };
      F.addEventListener('submit',function(){ F.elements.medidas.value=JSON.stringify(lerMd()); });
      document.querySelectorAll('[data-ed]').forEach(function(b){ b.onclick=function(){ abre(JSON.parse(b.dataset.ed)); }; });
      document.querySelectorAll('[data-novo]').forEach(function(b){ b.onclick=function(){ abre({g:b.dataset.novo,item:'',padrao:false}); document.getElementById('mtTit').textContent='＋ Novo item'; }; });
      if(location.hash){ var tr=document.querySelector(location.hash); if(tr){ tr.style.background='#fff6dd'; tr.scrollIntoView({block:'center'}); } }
    })();</script>`;
  return shell({ title: `Materiais e acabamentos · ${nomeObra(obra)}`, body, user });
}

// ---------- gravar ----------
/** Preencher / editar um item (multipart: campos + a foto). Nada obrigatório; a versão anterior fica guardada. */
export function salvarMaterial(user, obra, campos, arquivos) {
  if (!podeEditar(user, obra) || !OBRAS_DOCS.some(o => o.id === obra)) return { erro: "Só a engenharia e a Diretoria editam os materiais." };
  const d = B().ler(), lista = ((d.materiais = d.materiais || {})[obra] = d.materiais[obra] || []), em = agoraLocalISO(), por = B().quem(user);
  const link = linkOk(campos.link), qtd = qtdOk(campos.qtd);
  if (link === null) return { erro: "O link não parece um endereço de site (ex.: www.loja.com.br/produto). Nada foi gravado." };
  if (qtd === null) return { erro: "A quantidade tem que ser um número (ex.: 1.250,5). Nada foi gravado." };
  const fotos = (arquivos || []).filter(a => a.campo === "foto");
  if (fotos.length > 1) return { erro: "Vai uma foto por vez. Nada foi gravado." };
  if (fotos[0] && !FOTO_OK.includes(fotos[0].ext)) return { erro: `A foto tem que ser JPG, PNG ou WEBP (veio ${fotos[0].ext || "sem extensão"}). Nada foi gravado.` };
  let r = campos.id ? lista.find(x => x.id === campos.id) : campos.chave ? lista.find(x => x.chave === campos.chave) : null;
  if (campos.id && !r) return { erro: "Item não encontrado." };
  if (campos.chave && !PADRAO.has(campos.chave)) return { erro: "Item não encontrado." };
  const novo = { nome: txt(campos.nome, 200), link, qtd, un: txt(campos.un, 12), obs: txt(campos.obs, 600), medidas: medidasOk(campos.medidas) };
  if (!r && !campos.chave) novo.item = txt(campos.item, 120);
  else if (r && !r.chave) novo.item = txt(campos.item, 120) || r.item;
  let foto = r ? r.foto || null : null;
  if (fotos[0]) { let nome; try { nome = salvarArquivo(fotos[0], PASTA); } catch (e) { return { erro: `Foto: ${e.message}. Nada foi gravado.` }; }
    foto = { arquivo: nome, ext: fotos[0].ext, tamanho: fotos[0].buffer.length, nomeOriginal: txt(fotos[0].nomeOriginal, 120), por, em }; }
  else if (campos.semFoto === "1") foto = null;
  const vazio = !novo.nome && !novo.link && novo.qtd === "" && !novo.obs && !novo.medidas.length && !foto && !novo.item;
  if (!r) {
    if (vazio) return { ok: "Nada para gravar — o item continua em branco.", k: campos.chave ? "p-" + campos.chave : "" };
    const g = campos.chave ? PADRAO.get(campos.chave).g : GRUPOS.includes(campos.g) ? campos.g : "outro";
    r = { id: randomBytes(6).toString("hex"), ...(campos.chave ? { chave: campos.chave } : {}), g, ...novo, foto, criado: { por, login: user.usuario, em } };
    if (!campos.chave) r.item = novo.item || "Item sem nome";
    lista.push(r);
    B().registrar(d, user, obra, `materiais: preencheu "${r.item || PADRAO.get(r.chave).nome}"`);
  } else {
    const antes = { ...r }; delete antes.anteriores;
    const mudou = ["nome", "link", "qtd", "un", "obs", "item"].some(k => k in novo && String(novo[k] ?? "") !== String(r[k] ?? "")) || (foto && foto.arquivo) !== (r.foto && r.foto.arquivo) || JSON.stringify(novo.medidas) !== JSON.stringify(r.medidas || []);
    if (!mudou) return { ok: "Nada mudou.", k: r.chave ? "p-" + r.chave : r.id };
    (r.anteriores = r.anteriores || []).push(antes);
    Object.assign(r, novo, { foto, alterado: { por, login: user.usuario, em } });
    B().registrar(d, user, obra, `materiais: alterou "${r.item || PADRAO.get(r.chave).nome}"`);
  }
  B().gravar(d);
  return { ok: `Gravado: ${r.item || PADRAO.get(r.chave).nome}.`, k: r.chave ? "p-" + r.chave : r.id };
}

/** Tirar da lista (só marca) ou voltar para a lista. */
export function acaoMaterial(user, obra, campos) {
  if (!podeEditar(user, obra)) return { erro: "Só a engenharia e a Diretoria editam os materiais." };
  const d = B().ler(), lista = ((d.materiais = d.materiais || {})[obra] = d.materiais[obra] || []), em = agoraLocalISO(), por = B().quem(user), k = String(campos.k || "");
  let r = k.startsWith("p-") ? lista.find(x => x.chave === k.slice(2)) : lista.find(x => x.id === k);
  if (!r && k.startsWith("p-") && PADRAO.has(k.slice(2))) { r = { id: randomBytes(6).toString("hex"), chave: k.slice(2), g: PADRAO.get(k.slice(2)).g, criado: { por, login: user.usuario, em } }; lista.push(r); }
  if (!r) return { erro: "Item não encontrado." };
  const nome = r.item || PADRAO.get(r.chave).nome;
  if (campos.acao === "remover") { if (r.removido) return { ok: "Já estava fora da lista." }; r.removido = { por, login: user.usuario, em }; B().registrar(d, user, obra, `materiais: tirou da lista "${nome}"`); B().gravar(d); return { ok: `"${nome}" saiu da lista desta obra (fica guardado embaixo, em "Itens tirados").` }; }
  if (campos.acao === "restaurar") { if (!r.removido) return { ok: "Já estava na lista." }; (r.removidosAnteriores = r.removidosAnteriores || []).push(r.removido); delete r.removido; B().registrar(d, user, obra, `materiais: voltou para a lista "${nome}"`); B().gravar(d); return { ok: `"${nome}" voltou para a lista.`, k: r.chave ? "p-" + r.chave : r.id }; }
  return { erro: "Ação desconhecida." };
}

/** A foto do item (a atual). */
export function fotoMaterial(user, obra, id) {
  if (!podeVer(user, obra)) return null;
  const r = ((B().ler().materiais || {})[obra] || []).find(x => x.id === id); if (!r || !r.foto) return null;
  const p = join(PASTA, r.foto.arquivo); return existsSync(p) ? { caminho: p, ext: r.foto.ext, nome: `${B().siglaObra(obra)} ${(r.item || PADRAO.get(r.chave)?.nome || "material").slice(0, 60)}${r.foto.ext}` } : null;
}
