// documentos.js — setor DOCUMENTOS (21/10/2026): o banco de documentos de PROJETO das 10 obras.
//
//   · cada obra com as 6 disciplinas: Arquitetônico, Estrutural, Elétrico, Hidráulico/Sanitário, Preventivo e Interiores (09/11: o SPDA virou tipo do Preventivo);
//   · upload com NOMENCLATURA automática (04/11) — <obra>-<disciplina>-<pavimento/local>-<prancha>-R<revisão>
//     (ex.: ELC-ARQ-TER-P03-R01): 3 letras da obra e da disciplina, o local (escolhido da lista do administrador) e a
//     prancha do carimbo (com P na frente) informados no envio; a nova
//     revisão herda local e prancha com a revisão seguinte; o arquivo baixa com esse nome. Os enviados antes de 04/11 não
//     têm local nem prancha e seguem com o nº antigo (ELC-ARQ-001-R00) até ganharem uma revisão;
//   · MARCAÇÕES: o engenheiro abre o PDF (ou a foto) na tela, risca, faz setas, traços, retângulos, círculos, texto e
//     marca-texto, em cores — e envia ao CHAT da prancha (04/11), como imagem em alta. O original nunca é alterado;
//   · quem ENVIOU, com login, data e hora, em cada arquivo e no histórico da obra;
//   · ACESSO EXTERNO: o perfil "Externo" (escritório de projeto) entra só aqui, e só nas obras liberadas para ele
//     (Usuários & Acessos). O externo envia, abre e marca; não remove.
//   · nada some: remover só marca, com quem e quando.
// Dados em dados-setores/documentos.json; arquivos em arquivos/documentos/.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { shell, cabecalhoPagina } from "../ponte-engenharia.js";
import { DIR_SETORES, DIR_ANEXOS } from "../ponte-engenharia.js";
import { salvarArquivo } from "../ponte-engenharia.js";
import { agoraLocalISO } from "../ponte-engenharia.js";
import { VISOR_CSS, visorScript } from "./documentos-visor.js";
import { SOBREPOR_CSS, sobreporScript } from "./documentos-sobrepor.js";
import { CSS_3D, secao3d, script3d, modelosAtuais } from "./documentos-3d.js";
import { scriptAutoQR } from "./documentos-qr.js";

const ARQ = join(DIR_SETORES, "documentos.json");
export const DIR_DOCS = join(DIR_ANEXOS, "documentos");
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const quem = u => (u && (u.nome || u.usuario)) || "?";
const dh = iso => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(iso || "")) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}` : "—";
const kb = n => n >= 1048576 ? (n / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

export { OBRAS_DOCS } from "../ponte-engenharia.js";   // a lista das 10 obras mora na ponte (Usuários & Acessos também usa)
import { OBRAS_DOCS } from "../ponte-engenharia.js";
export const DISCIPLINAS = [
  { id: "ARQ", nome: "Projeto Arquitetônico", ic: "🏛️" }, { id: "EST", nome: "Projeto Estrutural", ic: "🧱" }, { id: "ELE", nome: "Projeto Elétrico", ic: "⚡" },
  { id: "HID", nome: "Projeto Hidráulico / Sanitário", ic: "🚰" }, { id: "PRE", nome: "Projeto Preventivo", ic: "🧯" }, { id: "INT", nome: "Projeto de Interiores", sigla: "INT", ic: "🛋️" }];
// as 3 primeiras letras do nome (sem acento): Bela Vista → BEL, Arquitetônico → ARQ. Interiores tem a sigla fixa INT. O id da disciplina não muda.
// 09/11: a disciplina SPDA saiu; o SPDA e o Gás entraram como TIPOS do Preventivo, e entrou a disciplina Interiores.
const semAcento = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const tres = t => semAcento(t).replace(/^Projeto\s+/i, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
const siglaObra = id => tres((OBRAS_DOCS.find(o => o.id === id) || {}).nome) || "?";
const siglaDisc = id => { const x = DISCIPLINAS.find(y => y.id === id); return x ? x.sigla || tres(x.nome) : id; };
// pavimento ou local: uma LISTA única, que só o administrador mexe (/documentos/locais); quem envia só escolhe dela.
// Gravada em documentos.json (locais); até a 1ª mudança vale a lista inicial abaixo. Inativar só marca — nada some.
const LOCAIS_INICIAIS = [["SUB", "Subsolo"], ["G01", "Garagem 1"], ["G02", "Garagem 2"], ["G03", "Garagem 3"], ["G04", "Garagem 4"], ["G05", "Garagem 5"],
  ["G06", "Garagem 6"], ["TER", "Térreo"], ["MEZ", "Mezanino"], ["LAZ", "Lazer"], ["TIP", "Pavimento tipo"], ["COB", "Cobertura"], ["FAC", "Fachada"],
  ["IMP", "Implantação"], ["GER", "Geral"]];
const limparLocal = t => semAcento(t).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const locaisDe = d => d.locais || LOCAIS_INICIAIS.map(([sigla, nome]) => ({ sigla, nome, criado: { por: "lista inicial", em: "2026-11-04" } }));
const locaisAtivos = d => locaisDe(d).filter(l => !l.removido);
// TIPO de prancha (do que trata), uma lista POR DISCIPLINA, que também só o administrador mexe (/documentos/tipos).
// Entra no código depois da disciplina (ELC-EST-FOR-TER-P03-R01). "carimbo" marca o tipo que precisa voltar carimbado
// (aprovativo da prefeitura ou dos bombeiros) — o controle do carimbo vem numa próxima etapa.
const TIPOS_INICIAIS = {
  ARQ: [["EXE", "Executivo"], ["APR", "Aprovativo (prefeitura)", 1], ["DET", "Detalhamentos"], ["PAG", "Paginação de pisos e revestimentos"], ["ESQ", "Esquadrias"]],
  EST: [["FUN", "Fundação"], ["FOR", "Forma"], ["ARM", "Armadura"], ["LAJ", "Lajes"], ["PIL", "Pilares"], ["VIG", "Vigas"], ["ESC", "Escadas e reservatórios"],
    ["PAS", "Passagens e furos"], ["CON", "Contenção"]],
  ELE: [["ENT", "Entrada de energia"], ["ILU", "Iluminação"], ["TOM", "Tomadas"], ["DIA", "Diagramas e quadros"], ["TEL", "Telefonia, dados e interfone"]],
  HID: [["AFR", "Água fria"], ["AQU", "Água quente"], ["ESG", "Esgoto"], ["PLU", "Pluvial"], ["GAS", "Gás"], ["REU", "Reúso"]],
  PRE: [["EXE", "Executivo"], ["APR", "Aprovativo (bombeiros)", 1], ["HID", "Hidrantes e sprinklers"], ["SAI", "Saídas e iluminação de emergência"], ["ALA", "Alarme"],
    ["SPD", "SPDA (para-raios)", 0, "2026-11-09"], ["GAS", "Gás", 0, "2026-11-09"]],
  INT: [["LAY", "Layout", 0, "2026-11-09"], ["MAR", "Marcenaria", 0, "2026-11-09"], ["FOR", "Forro e sancas", 0, "2026-11-09"], ["LUM", "Luminotécnico", 0, "2026-11-09"],
    ["PAG", "Paginação e revestimentos", 0, "2026-11-09"], ["DET", "Detalhamentos", 0, "2026-11-09"]],
};
const tipoInicial = ([sigla, nome, carimbo, em]) => ({ sigla, nome, ...(carimbo ? { carimbo: true } : {}), criado: { por: "lista inicial", em: em || "2026-11-04" } });
// lista já gravada pelo administrador: os tipos que entraram depois na lista inicial (09/11: SPDA e Gás no Preventivo) aparecem junto
const tiposDe = (d, disc) => { const ini = (TIPOS_INICIAIS[disc] || []).map(tipoInicial), gr = d.tipos && d.tipos[disc];
  return gr ? [...gr, ...ini.filter(t => t.criado.em > "2026-11-04" && !gr.some(g => g.sigla === t.sigla))] : ini; };
const tiposAtivos = (d, disc) => tiposDe(d, disc).filter(t => !t.removido);
const nomeTipo = (d, disc, sigla) => (tiposDe(d, disc).find(t => t.sigla === sigla) || {}).nome || sigla;
// CARIMBO (04/11): a revisão de um tipo "exige carimbo" fica AGUARDANDO CARIMBO até alguém anexar o PDF carimbado
// (prefeitura ou bombeiros), com a data e o protocolo. O original nunca muda: o carimbado é outro arquivo, ligado a ele.
// Registrar de novo (para corrigir) guarda o anterior. Revisão obsoleta não cobra carimbo.
const exigeCarimbo = (d, a) => !!a.tipo && tiposDe(d, a.disciplina).some(t => t.sigla === a.tipo && t.carimbo);
const orgaoDo = (d, a) => (/\(([^)]+)\)/.exec(nomeTipo(d, a.disciplina, a.tipo)) || [])[1] || "órgão";
// quem administra as listas: a Diretoria e a engenharia
export const GERE_LOCAIS = [];   // logins extras (o normal é o perfil)
const perfilDoc = u => String((u && u.perfil) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const escritorio = u => !!u && (perfilDoc(u).startsWith("gerente") || perfilDoc(u).startsWith("administrador"));
const podeGerirLocais = u => !!u && (u.nivel === "master" || escritorio(u) || GERE_LOCAIS.includes(String(u.usuario || "").toLowerCase()));

// SITUAÇÃO de cada documento (04/11): EM REVISÃO (amarelo) → LIBERADO PARA A OBRA (verde) → OBSOLETO (apagado).
//   · entra em revisão; quem libera marca "liberado" (fica guardado quem e quando);
//   · quando uma revisão mais nova é liberada, a anterior vira obsoleta sozinha; revisão antiga nunca liberada também.
// QUEM VÊ: acesso total (Diretoria, projetistas = perfil Externo, e a lista abaixo) vê tudo. O resto é usuário da OBRA
// (engenheiros, mestres, estagiários): vê só o liberado; o obsoleto aparece apagado e não abre; em revisão não aparece.
export const ACESSO_TOTAL_DOCS = [];   // logins extras (o normal é o perfil: Gerente de Engenharia e Administrador)
export const LIBERA_DOCS = [];
const login = u => String((u && u.usuario) || "").toLowerCase();
const acessoTotal = u => !!u && (u.nivel === "master" || externo(u) || escritorio(u) || ACESSO_TOTAL_DOCS.includes(login(u)));
const podeLiberar = u => !!u && (u.nivel === "master" || escritorio(u) || LIBERA_DOCS.includes(login(u)));
/** "revisao" | "liberado" | "obsoleto" — de um documento (não marcação), olhando as outras revisões dele. */
function situacao(a, docs) {
  const raiz = a.origem === "marcacao" ? docs.find(b => b.id === a.baseId) || a : a;
  const irmaos = docs.filter(b => b.origem !== "marcacao" && b.obra === raiz.obra && b.disciplina === raiz.disciplina && b.numero === raiz.numero && b.rev > raiz.rev);
  if (raiz.liberado) return irmaos.some(b => b.liberado) ? "obsoleto" : "liberado";
  return irmaos.length ? "obsoleto" : "revisao";
}
// RESPONSÁVEL por liberar (escolhido no envio; quem libera pode trocar no painel) e PRAZO: 5 dias úteis desde a inclusão
//   😊 até 3 dias úteis · 😬 4º e 5º (vencendo) · ☹️ passou de 5 (atrasado). Dia útil = segunda a sexta (feriado não entra).
export const RESPONSAVEIS = [{ id: "engenharia", nome: "Gerência de Engenharia" }, { id: "diretoria", nome: "Diretoria" }];
const nomeResp = id => (RESPONSAVEIS.find(r => r.id === id) || {}).nome || "";
export const PRAZO_UTEIS = 5;
function diasUteis(isoDe, isoAte) {
  const d = new Date(String(isoDe).slice(0, 10) + "T12:00:00Z"), fim = new Date(String(isoAte).slice(0, 10) + "T12:00:00Z"); let n = 0;
  while (d < fim) { d.setUTCDate(d.getUTCDate() + 1); const s = d.getUTCDay(); if (s !== 0 && s !== 6) n++; }
  return n;
}
function prazo(a, hoje) {
  const n = diasUteis(a.em, hoje);
  if (n <= 3) return { n, cara: "😊", cls: "ok", txt: `${n} de ${PRAZO_UTEIS} dias úteis` };
  if (n <= PRAZO_UTEIS) return { n, cara: "😬", cls: "vence", txt: `${n} de ${PRAZO_UTEIS} dias úteis — vencendo` };
  return { n, cara: "☹️", cls: "atraso", txt: `atrasado ${n - PRAZO_UTEIS} ${n - PRAZO_UTEIS === 1 ? "dia útil" : "dias úteis"}` };
}
const SIT = { revisao: { txt: "Em revisão", cls: "dc-s-rev" }, liberado: { txt: "Liberado para a obra", cls: "dc-s-lib" }, obsoleto: { txt: "Obsoleto", cls: "dc-s-obs" } };
const selo = s => `<span class="dc-sit ${SIT[s].cls}">${SIT[s].txt}</span>`;
// 06/11: a prancha LIBERADA que já tem revisão nova enviada (em análise) — a obra continua usando, mas fica avisada
const revEmAndamento = (a, vv) => situacao(a, vv) === "liberado" && vv.some(b => b.origem !== "marcacao" && b.obra === a.obra && b.disciplina === a.disciplina && b.numero === a.numero && b.rev > a.rev && situacao(b, vv) === "revisao");
const SELO_ANDAMENTO = `<span class="dc-sit" style="background:#fff1c9;color:#7a5200;border:1px solid #e3b23c" title="Saiu revisão nova desta prancha e ela está em análise. Continue usando esta até a nova ser liberada.">⚠️ Prancha com revisão em andamento</span>`;

function ler() { try { return JSON.parse(readFileSync(ARQ, "utf8")); } catch { return { arquivos: [], historico: [] }; } }
function gravar(d) { const t = ARQ + ".tmp"; writeFileSync(t, JSON.stringify(d, null, 1)); renameSync(t, ARQ); }
const externo = u => u && u.nivel === "externo";
/** As obras que a pessoa vê: a equipe interna vê as 10; o externo, só as liberadas para ele (nenhuma marcada = todas). */
export function obrasDoUsuario(u) {
  if (!externo(u)) return OBRAS_DOCS;
  const ok = new Set(u.obrasDocs || []); return ok.size ? OBRAS_DOCS.filter(o => ok.has(o.id)) : OBRAS_DOCS;
}
const podeObra = (u, obra) => obrasDoUsuario(u).some(o => o.id === obra);
const codigo = a => `${siglaObra(a.obra)}-${siglaDisc(a.disciplina)}-${a.tipo ? a.tipo + "-" : ""}${a.local ? `${a.local}-P${String(a.prancha).padStart(2, "0")}` : String(a.numero).padStart(3, "0")}-R${String(a.rev).padStart(2, "0")}${a.origem === "marcacao" ? "-M" + String(a.marcacao || 1).padStart(2, "0") : ""}`;
const nomeDownload = a => `${codigo(a)} ${String(a.descricao || "").replace(/[^\w\sÀ-ú().-]/g, "").trim().slice(0, 80)}${a.ext}`.trim();
const vivos = d => d.arquivos.filter(a => !a.removido);
const ehPDF = a => a.ext === ".pdf", ehImg = a => [".jpg", ".jpeg", ".png"].includes(a.ext);
const perfilTxt = a => a.porExterno ? `<span class="dc-ext">externo</span>` : "";

const CSS = `<style>
.pj-abas{display:flex;flex-wrap:wrap;gap:4px 2px;border-bottom:2px solid #e6e0cf;margin:16px 0 18px}   /* 06/11: as abas quebram linha em vez de sumir pela direita */
.pj-abas a{padding:8px 12px 9px;font-size:13px;font-weight:700;color:#7a7262;text-decoration:none;white-space:nowrap;border-radius:8px 8px 0 0}
.pj-abas a:hover{color:#1a1a1d;background:#f6f2e6}.pj-abas a.on{color:#1a1a1d;box-shadow:inset 0 -3px 0 var(--acento);background:#fff}
.pj-abas .n{display:inline-block;background:#fdf1c2;color:#7a5b00;border-radius:999px;padding:0 7px;font-size:11px;margin-left:6px}
.pj-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.pj-kpi{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:12px 16px;border-left:5px solid var(--c,#d9d2bb)}
.pj-kpi b{display:block;font-size:30px;font-weight:900;line-height:1.1;color:var(--c,#1a1a1d)}.pj-kpi span{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.pj-quadro{background:#fff;border:1px solid #ece8dc;border-radius:18px;padding:16px;margin-top:16px}
.pj-qt{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;margin-bottom:12px}.pj-qt b{font-size:17px}.pj-qt>span{font-size:12.5px;color:var(--mut)}
.pj-leg{margin-left:auto;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:11.5px;color:var(--mut)}.pj-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:-6px}
.pj-obras{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.pj-obra{display:flex;flex-direction:column;gap:8px;background:#fcfbf7;border:1px solid #ece6d4;border-radius:14px;padding:14px 16px;color:inherit;text-decoration:none;transition:border-color .15s,box-shadow .15s,transform .15s}
.pj-obra:hover{border-color:var(--acento);box-shadow:0 6px 18px rgba(0,0,0,.08);transform:translateY(-1px);background:#fff}
.pj-obra .t{display:flex;align-items:center;gap:9px}.pj-obra .t b{font-size:16px;flex:1}.pj-obra .ir{font-size:22px;color:#c9bd95;line-height:1}
.pj-obra .sg{background:var(--escuro);color:var(--acento-claro);border-radius:8px;padding:3px 8px;font-size:11px;font-weight:800;letter-spacing:.04em}
.pj-obra .big{font-size:12.5px;color:var(--mut)}.pj-obra .big b{font-size:26px;font-weight:900;color:#1a1a1d;margin-right:3px}
.pj-barra{display:flex;height:8px;border-radius:5px;overflow:hidden;background:#ece8dc}.pj-barra i{display:block}
.pj-obra .st{display:flex;gap:12px;font-size:12px;color:#4a4330}.pj-obra .st i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.pj-obra .disc{display:flex;flex-wrap:wrap;gap:5px}.pj-obra .disc span{background:#fff;border:1px solid #e6e0cf;border-radius:999px;padding:1px 8px;font-size:11.5px;color:#5a5240}
.pj-obra .ch{display:flex;gap:10px;font-size:12px;font-weight:700;border-top:1px dashed #e6e0cf;padding-top:7px}
.pj-obra.vazia{background:#faf9f5;border-style:dashed;align-self:start}.pj-obra.vazia .t b{color:#8a8578}.pj-obra .vz{font-size:12px;color:#a39d8c}
.dc-obras{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:16px}
.dc-obra{display:block;background:#fff;border:1px solid #eae5d6;border-radius:14px;padding:16px;color:inherit;text-decoration:none}
.dc-obra:hover{border-color:var(--acento);background:#fcfbf7}
.dc-obra b{display:block;font-size:16px;margin-bottom:8px}.dc-obra .sg{float:right;background:var(--escuro);color:var(--acento-claro);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:800}
.dc-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;font-size:11px;color:var(--mut)}.dc-mini span b{display:inline;font-size:12px;color:#2a2a30;margin:0}
.dc-disc{background:#fff;border:1px solid #ece8dc;border-radius:14px;margin-top:14px;overflow:hidden}
.dc-disc>summary{display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;font-weight:800;font-size:15px}
.dc-disc>summary::-webkit-details-marker{display:none}.dc-disc[open]>summary{border-bottom:1px solid #efeade;background:#fcfbf7}
.dc-disc>summary .n{margin-left:auto;background:#f3efe2;color:#6a5e3a;border-radius:999px;padding:2px 10px;font-size:12px}
.dc-corpo{padding:12px 16px 16px}
/* 10/11: a tabela das pranchas rola para os lados quando os botões não cabem (antes o "Liberar" e o "remover" sumiam) */
.dc-rolo{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:#c9a84c #f3efe2}
.dc-rolo::-webkit-scrollbar{height:9px}.dc-rolo::-webkit-scrollbar-track{background:#f3efe2;border-radius:9px}.dc-rolo::-webkit-scrollbar-thumb{background:#c9a84c;border-radius:9px}
.dc-rolo>.dc-t{min-width:900px}
.dc-t{width:100%;border-collapse:collapse;font-size:12.5px}
.dc-t th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:6px 8px;border-bottom:1px solid #efeade}
.dc-t td{padding:8px;border-bottom:1px solid #f3f0e6;vertical-align:middle}
.dc-cod{font-family:ui-monospace,Menlo,monospace;font-weight:700;background:#f6f3ea;border-radius:6px;padding:2px 6px;white-space:nowrap}
.dc-bt{display:inline-block;border:1px solid var(--escuro);background:var(--escuro);color:var(--acento-claro);border-radius:8px;padding:5px 9px;font-size:11.5px;font-weight:700;text-decoration:none;white-space:nowrap;cursor:pointer;font-family:inherit}
.dc-bt.claro{background:#fff;color:#5a4e2e;border-color:#d9d2bb}
.dc-x{border:0;background:none;color:#b03a3a;font-size:11.5px;cursor:pointer;text-decoration:underline;font-family:inherit}
.dc-ext{display:inline-block;background:#e6eef8;color:#2f5d8a;border-radius:999px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-left:4px}
.dc-marc td{background:#fffdf5}.dc-marc td:first-child{padding-left:26px}
.dc-sit{display:inline-block;border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:800;white-space:nowrap;margin-top:3px}
.dc-s-rev{background:#fdf1c2;color:#7a5b00;border:1px solid #f1d872}.dc-s-lib{background:#dff1d8;color:#22662a;border:1px solid #a9d69c}
.dc-s-obs{background:#eeeeee;color:#777;border:1px solid #dcdcdc}
tr.dc-l-rev td:first-child{box-shadow:inset 4px 0 0 #e8c33a}tr.dc-l-lib td:first-child{box-shadow:inset 4px 0 0 #3f9a4a}
tr.dc-l-obs td{opacity:.42}tr.dc-l-obs td:first-child{box-shadow:inset 4px 0 0 #c9c9c9}
.dc-leg{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--mut);margin-top:12px}
.dc-c-agu{background:#fde8d4;color:#9a4a00;border:1px solid #f3c69c}.dc-c-ok{background:#e6eef8;color:#2f5d8a;border:1px solid #c5d6ea}
.dc-carimbar{margin-top:5px;font-size:11.5px}.dc-carimbar summary{cursor:pointer;color:#9a4a00;font-weight:700}
.dc-carimbar form{display:flex;flex-wrap:wrap;gap:6px;align-items:end;margin-top:6px;background:#fffaf3;border:1px dashed #f3c69c;border-radius:10px;padding:8px}
.dc-carimbar label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mut)}
.dc-carimbar input{padding:5px 7px;border:1px solid #ddd8c8;border-radius:7px;font-size:12px;font-family:inherit}
.dc-sel{width:26px;padding-right:0!important}.dc-sel input{width:16px;height:16px;accent-color:#b03a3a;cursor:pointer;margin:0}
.dc-t tr.dc-marcada td{background:#fbeeee}
.dc-lote{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:10px;background:var(--escuro);color:#fff;border-radius:14px;padding:10px 12px 10px 16px;box-shadow:0 8px 28px rgba(0,0,0,.28);font-size:13px;white-space:nowrap;max-width:calc(100vw - 24px)}
.dc-lote[hidden]{display:none}.dc-lote .dc-lote-rm{background:#b03a3a;border-color:#b03a3a;color:#fff;padding:8px 13px;font-size:12.5px}
.dc-lib{border:1px solid #3f9a4a;background:#3f9a4a;color:#fff;border-radius:8px;padding:5px 9px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
.dc-up{display:grid;grid-template-columns:1.4fr 1.4fr 1.2fr .8fr;gap:8px;align-items:end;background:#fcfbf7;border:1px dashed #d9d2bb;border-radius:12px;padding:12px;margin-top:12px}
.dc-up label{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:4px}
.dc-up input,.dc-up select{width:100%;padding:8px 9px;border:1px solid #ddd8c8;border-radius:9px;font-size:12.5px;font-family:inherit;background:#fff}
.dc-dica{font-size:11.5px;color:var(--mut);margin-top:6px}
.dc-hist{font-size:12.5px;line-height:1.75}.dc-hist b{font-weight:700}
@media(max-width:900px){.dc-up{grid-template-columns:1fr}.dc-up>*{grid-column:auto!important}.dc-t .opc{display:none}}
</style>`;

// ---------- o topo da área PROJETOS : título e abas, igual em todas as telas ----------
function topoProjetos(user, ativa) {
  const d = ler(), nRev = acessoTotal(user) ? vivos(d).filter(a => a.origem !== "marcacao" && obrasDoUsuario(user).some(o => o.id === a.obra) && situacao(a, vivos(d)) === "revisao").length : 0;
  const abas = [
    { id: "obras", href: "/documentos", txt: "🏗️ Obras" },
    ...(acessoTotal(user) ? [{ id: "painel", href: "/documentos/painel", txt: "📊 Gerenciamento de projetos", n: nRev }] : []),
    { id: "compat", href: "/documentos/compat", txt: "🧩 Compatibilização" },   // a obra também participa (05/11)
    ...(!externo(user) ? [{ id: "plot", href: "/documentos/plotagens", txt: "🖨️ Plotagens", n: plotPendentes(user) }] : []),
    ...(!externo(user) ? [{ id: "materiais", href: "/documentos/materiais", txt: "🎨 Materiais e acabamentos" }] : []),   // 09/11
    ...(podeGerirLocais(user) ? [{ id: "locais", href: "/documentos/locais", txt: "📍 Pavimentos e locais" }, { id: "tipos", href: "/documentos/tipos", txt: "🗂️ Tipos de prancha" },
      { id: "projetistas", href: "/documentos/projetistas", txt: "🧑‍💼 Projetistas" }, { id: "avisos", href: "/documentos/avisos", txt: "📣 Avisos" }] : []),
  ];
  return `${cabecalhoPagina({ icone: "📑", titulo: "Projetos", sub: externo(user) ? "Projetos das obras liberadas para o seu escritório" : acessoTotal(user) ? "Pranchas das 10 obras — revisões, liberação para a obra, marcações e chat com os projetistas" : "Pranchas liberadas para a obra",
      voltar: externo(user) ? "" : "/engenharia", voltarRotulo: "Engenharia e Obra" })}
    ${abas.length > 1 ? `<nav class="pj-abas">${abas.map(x => `<a href="${x.href}"${x.id === ativa ? ` class="on"` : ""}>${x.txt}${x.n ? `<span class="n">${x.n}</span>` : ""}</a>`).join("")}</nav>` : ""}`;
}

// ---------- a entrada: o quadro das obras ----------
export function paginaDocumentos(user) {
  const d = ler(), vv = vivos(d), obras = obrasDoUsuario(user), total = acessoTotal(user);
  // cada PRANCHA (todas as revisões juntas): liberada, liberada com revisão nova em análise, ou só em revisão
  const pranchas = obra => {
    const grupos = {}; vv.filter(a => a.obra === obra && a.origem !== "marcacao").forEach(a => { (grupos[chaveP(a)] = grupos[chaveP(a)] || []).push(a); });
    return Object.values(grupos).map(revs => {
      const nova = revs.reduce((m, a) => a.rev > m.rev ? a : m), lib = revs.find(a => situacao(a, vv) === "liberado");
      return { disc: nova.disciplina, nova, lib, est: lib ? (nova === lib ? "lib" : "libnova") : "rev" };
    }).filter(p => total || p.lib);   // a equipe da obra só conta o que foi liberado
  };
  const porObra = obras.map(o => {
    const ps = pranchas(o.id), chat = ps.map(p => resumoChat(d, p.lib && !total ? p.lib : p.nova));
    return { o, ps, n: ps.length, rev: ps.filter(p => p.est !== "lib").length, lib: ps.filter(p => p.lib).length,
      abertas: chat.reduce((s, c) => s + c.abertas, 0), tarefas: chat.reduce((s, c) => s + c.tarefas, 0) };
  });
  const soma = k => porObra.reduce((s, x) => s + x[k], 0);
  const kpi = (v, rot, cor, dica) => `<div class="pj-kpi"${cor ? ` style="--c:${cor}"` : ""} title="${dica}"><b>${v}</b><span>${rot}</span></div>`;
  // as obras com pranchas primeiro (na ordem de sempre); as vazias ficam juntas no fim, compactas
  const cards = [...porObra.filter(x => x.n), ...porObra.filter(x => !x.n)].map(({ o, ps, n, rev, lib, abertas, tarefas }) => {
    const seg = est => ps.filter(p => p.est === est).length, pct = x => (x / (n || 1) * 100).toFixed(1);
    const discs = DISCIPLINAS.map(x => ({ x, q: ps.filter(p => p.disc === x.id).length })).filter(z => z.q);
    return `<a class="pj-obra${n ? "" : " vazia"}" href="/documentos/${o.id}">
      <div class="t"><span class="sg">${siglaObra(o.id)}</span><b>${esc(o.nome)}</b><span class="ir">›</span></div>
      ${n ? `<div class="big"><b>${n}</b> prancha${n === 1 ? "" : "s"}</div>
        <div class="pj-barra"><i style="width:${pct(seg("lib"))}%;background:#3f9a4a"></i><i style="width:${pct(seg("libnova"))}%;background:#9fd08f"></i><i style="width:${pct(seg("rev"))}%;background:#e8c33a"></i></div>
        <div class="st">${total ? `<span><i style="background:#e8c33a"></i>${rev} em revisão</span>` : ""}<span><i style="background:#3f9a4a"></i>${lib} liberada${lib === 1 ? "" : "s"}</span></div>
        <div class="disc">${discs.map(z => `<span title="${esc(z.x.nome)}">${z.x.ic} ${siglaDisc(z.x.id)} <b>${z.q}</b></span>`).join("")}</div>
        ${abertas || tarefas ? `<div class="ch">${abertas ? `<span style="color:#a12d2d">⚠️ ${abertas} em aberto</span>` : ""}${tarefas ? `<span style="color:#8a6d00">📋 ${tarefas} tarefa${tarefas === 1 ? "" : "s"}</span>` : ""}</div>` : ""}`
      : `<div class="vz">${total ? "Nenhuma prancha enviada ainda" : "Nada liberado para a obra ainda"}</div>`}</a>`;
  }).join("");
  const body = `${CSS}${topoProjetos(user, "obras")}
    <div class="pj-kpis">
      ${kpi(soma("n"), total ? "pranchas" : "pranchas liberadas", "", "Pranchas (cada uma conta uma vez, com todas as revisões)")}
      ${total ? kpi(soma("rev"), "em revisão", "#b8920f", "Pranchas com revisão aguardando liberação") : ""}
      ${total ? kpi(soma("lib"), "liberadas", "#2f8a3a", "Pranchas com revisão liberada para a obra") : ""}
      ${kpi(soma("abertas"), "em aberto no chat", soma("abertas") ? "#a12d2d" : "", "Dúvidas, pendências e verificações ainda não resolvidas")}
      ${kpi(soma("tarefas"), "tarefas abertas", soma("tarefas") ? "#8a6d00" : "", "Tarefas delegadas no chat e ainda não concluídas")}
    </div>
    <div class="pj-quadro"><div class="pj-qt"><b>🏗️ Obras</b><span>clique na obra para ver as pranchas, enviar e liberar</span>
      <span class="pj-leg">${total ? `<i style="background:#e8c33a"></i>em revisão` : ""}<i style="background:#3f9a4a"></i>liberada${total ? `<i style="background:#9fd08f"></i>liberada, com revisão nova em análise` : ""}</span></div>
      <div class="pj-obras">${cards}</div></div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      <b>Nomenclatura:</b> <span class="dc-cod">OBRA-DISCIPLINA-TIPO-LOCAL-P00-R00</span> — ex.: <span class="dc-cod">ELC-EST-FOR-TER-P03-R01</span> = obra "ELC", Estrutural, Forma, Térreo, prancha 3, revisão 1.
      Todo envio entra <b>em revisão</b>; quando é liberado, a equipe da obra passa a ver, e a revisão liberada antes vira obsoleta.
      Dúvidas, marcações e tarefas de cada prancha ficam no <b>💬 Chat</b> dela, ao lado do PDF — o PDF nunca é alterado.
      Os números contam <b>pranchas</b> (todas as revisões de uma prancha contam uma vez).</div></details>`;
  return shell({ title: "Projetos", body, user });
}

// ---------- uma obra ----------
export function paginaDocumentosObra(user, obraId, { ok = "", erro = "" } = {}) {
  const o = OBRAS_DOCS.find(x => x.id === obraId); if (!o || !podeObra(user, obraId)) return null;
  const d = ler(), todos = vivos(d).filter(a => a.obra === obraId);
  const opcoesLocais = locaisAtivos(d).map(l => `<option value="${esc(l.sigla)}">${esc(l.sigla)} — ${esc(l.nome)}</option>`).join("");
  const total = acessoTotal(user), libera = podeLiberar(user), vv = vivos(d), sel = total && !externo(user);   // sel: remover vários de uma vez (10/11)
  const secoes = DISCIPLINAS.map(x => {
    const todosDaDisc = todos.filter(a => a.disciplina === x.id && a.origem !== "marcacao").sort((a, b) => a.numero - b.numero || b.rev - a.rev);
    // a obra só enxerga liberado e obsoleto (este apagado e sem abrir); em revisão não aparece para ela
    const base = total ? todosDaDisc : todosDaDisc.filter(a => situacao(a, vv) !== "revisao");
    const linhas = base.map(a => {
      // as marcações saíram da lista (04/11): ficam no chat da prancha, que aparece na linha que vale
      // (para a engenharia, a revisão mais nova; para a obra, a liberada)
      const s = situacao(a, vv);
      const abre = total || s === "liberado";
      const temChat = total ? !base.some(b => b.numero === a.numero && b.rev > a.rev) : s === "liberado", rc = temChat ? resumoChat(d, a) : null;
      const lin = (z, marc) => `<tr class="${marc ? "dc-marc " : ""}dc-l-${s === "revisao" ? "rev" : s === "liberado" ? "lib" : "obs"}">
        ${sel ? `<td class="dc-sel"><input type="checkbox" class="dc-ck" value="${z.id}" data-cod="${esc(codigo(z))}" title="marcar para remover junto"></td>` : ""}<td><span class="dc-cod">${esc(codigo(z))}</span>${marc ? "" : `<br>${selo(s)}`}${!marc && revEmAndamento(z, vv) ? `<br>${SELO_ANDAMENTO}` : ""}${!marc && s !== "obsoleto" && exigeCarimbo(d, z) ? `<br>${z.carimbo
          ? `<span class="dc-sit dc-c-ok">🔖 Carimbado</span>` : `<span class="dc-sit dc-c-agu">🔖 Aguardando carimbo</span>`}` : ""}</td>
        <td>${marc ? "✏️ " : ""}${esc(z.descricao)}${z.obs ? `<div style="font-size:11.5px;color:var(--mut)">${esc(z.obs)}</div>` : ""}
          ${!marc && s === "revisao" ? (p => `<div style="font-size:11px;color:var(--mut)">${p.cara} libera: <b>${esc(nomeResp(z.responsavel) || "sem responsável")}</b> · ${p.txt}</div>`)(prazo(z, agoraLocalISO())) : ""}
          ${!marc && z.liberado ? `<div style="font-size:11px;color:var(--mut)">liberado por ${esc(z.liberado.por)} · ${dh(z.liberado.em)}</div>` : ""}
          ${!marc && s === "obsoleto" && !total ? `<div style="font-size:11px;font-weight:700;color:#777">obsoleto — não usar</div>` : ""}
          ${!marc && z.carimbo ? `<div style="font-size:11px;color:#2f5d8a">🔖 carimbado (${esc(orgaoDo(d, z))}) em ${dh(z.carimbo.data + "T00:00").slice(0, 10)}${z.carimbo.protocolo ? ` · protocolo <b>${esc(z.carimbo.protocolo)}</b>` : ""}${total ? ` · anexado por ${esc(z.carimbo.por)}` : ""}</div>` : ""}
          ${!marc && total && s !== "obsoleto" && exigeCarimbo(d, z) ? `<details class="dc-carimbar" id="c-${z.id}"><summary>🔖 ${z.carimbo ? "corrigir o carimbo" : "registrar o carimbo"}</summary>
            <form method="POST" action="/documentos/carimbar" enctype="multipart/form-data"><input type="hidden" name="id" value="${z.id}">
              <div><label>PDF carimbado</label><input type="file" name="arquivo" required accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"></div>
              <div><label>Data do carimbo</label><input type="date" name="data" required max="${agoraLocalISO().slice(0, 10)}"></div>
              <div><label>Protocolo</label><input name="protocolo" maxlength="40" placeholder="Nº do processo"></div>
              <button class="dc-bt">Gravar</button></form></details>` : ""}</td>
        <td class="opc" style="font-size:11.5px;color:var(--mut);white-space:nowrap">${esc(z.ext.slice(1).toUpperCase())} · ${kb(z.tamanho || 0)}</td>
        <td style="font-size:11.5px;white-space:nowrap"><b>${esc(z.por)}</b>${perfilTxt(z)}<br><span style="color:var(--mut)">${esc(z.login)} · ${dh(z.em)}</span></td>
        <td style="white-space:nowrap;text-align:right">${abre ? `<a class="dc-bt claro" href="/documentos/arquivo/${z.id}" target="_blank">Abrir</a>` : ""}
          ${!marc && abre && z.carimbo ? `<a class="dc-bt claro" style="border-color:#c5d6ea;color:#2f5d8a" href="/documentos/arquivo/${z.id}?carimbado=1" target="_blank">🔖 Carimbado</a>` : ""}
          ${!marc && temChat ? `<a class="dc-bt" href="/documentos/chat/${z.id}" title="Chat da prancha: perguntas, marcações e tarefas">💬 Chat${rc.n ? ` ${rc.n}` : ""}${rc.abertas ? ` · <span style="color:#ffb3b3">${rc.abertas} aberta${rc.abertas === 1 ? "" : "s"}</span>` : ""}${rc.tarefas ? ` · 📋${rc.tarefas}` : ""}</a>` : ""}
          ${!marc && total && ehPDF(z) && s !== "obsoleto" ? `<a class="dc-bt claro" href="/documentos/qr-posicao/${z.id}" title="Onde o QR de validade entra na prancha${z.qrPos ? (z.qrPos.auto ? " (escolhido sozinho, num espaço em branco)" : " (ajustado na mão)") : ""}">📍 QR</a>` : ""}
          ${!marc && libera && s === "revisao" ? `<form method="POST" action="/documentos/liberar" style="display:inline" onsubmit="return confirm('Liberar ${esc(codigo(z))} para a obra? A revisão liberada antes dela vira obsoleta.')"><input type="hidden" name="id" value="${z.id}"><input type="hidden" name="acao" value="liberar"><button class="dc-lib">✓ Liberar para a obra</button></form>` : ""}
          ${!marc && libera && s === "liberado" ? `<form method="POST" action="/documentos/liberar" style="display:inline" onsubmit="return confirm('Cancelar a liberação de ${esc(codigo(z))}? Ele volta para em revisão e a obra deixa de ver.')"><input type="hidden" name="id" value="${z.id}"><input type="hidden" name="acao" value="cancelar"><button class="dc-x" style="color:#6a5e3a">cancelar liberação</button></form>` : ""}
          ${total && !externo(user) ? `<form method="POST" action="/documentos/remover" style="display:inline" onsubmit="return confirm('Remover ${esc(codigo(z))}? Fica no histórico.')"><input type="hidden" name="id" value="${z.id}"><button class="dc-x">remover</button></form>` : ""}</td></tr>`;
      return lin(a, false);
    }).join("");
    const atuais = todosDaDisc.filter(a => !todosDaDisc.some(b => b.numero === a.numero && b.rev > a.rev));
    const nLib = base.filter(a => situacao(a, vv) === "liberado").length;
    const cont = total ? `${atuais.length} documento${atuais.length === 1 ? "" : "s"} · ${nLib} liberado${nLib === 1 ? "" : "s"}` : `${nLib} liberado${nLib === 1 ? "" : "s"}`;
    return `<details class="dc-disc"${base.length ? " open" : ""}><summary>${x.ic} ${x.nome}<span class="n">${cont}</span></summary><div class="dc-corpo">
      ${base.length ? `<div class="dc-rolo"><table class="dc-t"><thead><tr>${sel ? `<th class="dc-sel"><input type="checkbox" class="dc-ckall" title="marcar todos desta disciplina"></th>` : ""}<th>Código</th><th>Descrição</th><th class="opc">Arquivo</th><th>Enviado por</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<div style="color:var(--mut);font-size:13px">${total ? "Nenhum documento ainda." : "Nenhum documento liberado para a obra ainda."}</div>`}
      ${total ? `<form class="dc-up" method="POST" action="/documentos/${o.id}/enviar" enctype="multipart/form-data">
        <input type="hidden" name="disciplina" value="${x.id}">
        <div><label>Arquivo — PDF, DWG, DXF ou foto (um só)</label><input type="file" name="arquivo" required accept=".pdf,.dwg,.dxf,.jpg,.jpeg,.png,application/pdf,image/*"></div>
        <div><label>É nova revisão de…</label><select name="revDe"><option value="">— documento novo —</option>${atuais.map(a => `<option value="${a.id}">${esc(codigo(a))} · ${esc(String(a.descricao).slice(0, 50))}</option>`).join("")}</select></div>
        <div style="grid-column:span 2"><label>Descrição <span style="text-transform:none;font-weight:400">(vazio = nome do arquivo)</span></label><input name="descricao" maxlength="160" placeholder="Ex.: Planta baixa — pavimento tipo"></div>
        <div><label>Tipo</label><select name="tipo"><option value="">— escolha —</option>${tiposAtivos(d, x.id).map(t => `<option value="${esc(t.sigla)}">${esc(t.sigla)} — ${esc(t.nome)}</option>`).join("")}</select></div>
        <div><label>Pavimento / local</label><select name="local"><option value="">— escolha —</option>${opcoesLocais}</select></div>
        <div><label>Prancha nº</label><input name="prancha" type="number" min="1" max="999" step="1" placeholder="Ex.: 3"></div>
        <div><label>Quem libera</label><select name="responsavel" required><option value="">— escolha —</option>${RESPONSAVEIS.map(r => `<option value="${r.id}">${r.nome}</option>`).join("")}</select></div>
        <div style="grid-column:-2;text-align:right"><button class="dc-bt" style="padding:9px 18px">Enviar</button></div></form>
      <div class="dc-dica">O sistema dá o código ${siglaObra(o.id)}-${siglaDisc(x.id)}-<i>TIPO</i>-<i>LOCAL</i>-P<i>prancha</i>-R<i>rev</i> e registra quem enviou, com data e hora. Nova revisão herda o tipo, o local e a prancha do original. Aqui vai <b>um arquivo por vez</b>; para vários, use <b>📦 Enviar em lote</b> (no alto da página), onde cada arquivo tem os seus campos. Falta um tipo ou um pavimento na lista? Peça ao administrador. Todo envio entra <b>em revisão</b>: a obra só vê depois de liberado.</div>` : ""}
    </div></details>`;
  }).join("");
  const hist = total ? (d.historico || []).filter(h => h.obra === obraId).slice(-60).reverse() : [];
  const legenda = `<div class="dc-leg">${total ? `${selo("revisao")}${selo("liberado")}${selo("obsoleto")}<span>— a equipe da obra vê só o liberado; o obsoleto aparece apagado e não abre.</span>`
    : `${selo("liberado")} pode usar na obra · ${selo("obsoleto")} substituído por revisão nova — não usar`}</div>`;
  const body = `${CSS}<a class="pg-volta" href="/documentos"><span class="seta">←</span> Projetos</a>
    <div class="ob-topo" style="display:flex;align-items:center;gap:12px;margin:10px 0 0"><h1 style="margin:0">📑 ${esc(o.nome)}</h1><span class="dc-cod">${siglaObra(o.id)}</span></div>
    ${erro ? `<div class="ob-erro" style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(ok)}</div>` : ""}
    ${legenda}
    ${total ? `<div style="margin:10px 0 4px"><a class="dc-bt" style="padding:9px 16px;font-size:13px" href="/documentos/${o.id}/lote">📦 Enviar vários arquivos de uma vez (em lote)</a> <span style="font-size:12px;color:var(--mut)">uma disciplina e um tipo para o lote; cada arquivo com o seu local, prancha e revisão</span></div>` : ""}
    ${secoes}
    ${sel ? `<form id="dcLote" class="dc-lote" method="POST" action="/documentos/remover" hidden><input type="hidden" name="id">
      <span id="dcLoteN"></span><button type="button" class="dc-bt claro" id="dcLoteLimpa">desmarcar</button><button class="dc-bt dc-lote-rm">🗑️ Remover selecionados</button></form>
    <script>(function(){ var F=document.getElementById('dcLote'), N=document.getElementById('dcLoteN');
      function marcados(){ return [].slice.call(document.querySelectorAll('.dc-ck:checked')); }
      function conta(){ var m=marcados(); F.hidden=!m.length; N.innerHTML='<b>'+m.length+'</b> prancha'+(m.length>1?'s':'')+' marcada'+(m.length>1?'s':'');
        [].forEach.call(document.querySelectorAll('.dc-ckall'),function(a){ var cs=a.closest('table').querySelectorAll('.dc-ck'), n=[].filter.call(cs,function(c){return c.checked;}).length; a.checked=n&&n===cs.length; a.indeterminate=n>0&&n<cs.length; });
        [].forEach.call(document.querySelectorAll('.dc-ck'),function(c){ c.closest('tr').classList.toggle('dc-marcada',c.checked); }); }
      document.addEventListener('change',function(e){ if(e.target.classList.contains('dc-ckall')) [].forEach.call(e.target.closest('table').querySelectorAll('.dc-ck'),function(c){ c.checked=e.target.checked; }); if(e.target.matches('.dc-ck,.dc-ckall')) conta(); });
      document.getElementById('dcLoteLimpa').onclick=function(){ [].forEach.call(document.querySelectorAll('.dc-ck,.dc-ckall'),function(c){ c.checked=false; }); conta(); };
      F.onsubmit=function(){ var m=marcados(); if(!m.length) return false; var cods=m.map(function(c){return c.dataset.cod;});
        if(!confirm('Remover '+m.length+' prancha'+(m.length>1?'s':'')+'?\\n\\n'+cods.slice(0,25).join('\\n')+(cods.length>25?'\\n… e mais '+(cods.length-25):'')+'\\n\\nFicam no histórico.')) return false;
        F.elements.id.value=m.map(function(c){return c.value;}).join(','); };
      conta(); })();</script>` : ""}
    <script>(function(){ var h = location.hash; if (h.indexOf("#c-") !== 0) return; var el = document.getElementById(h.slice(1)); if (!el) return;
      el.open = true; var p = el.closest("details.dc-disc"); if (p) p.open = true; el.scrollIntoView({ block: "center" }); })();</script>
    ${total ? scriptAutoQR(todos.filter(a => a.origem !== "marcacao" && ehPDF(a) && !a.qrPos && situacao(a, vv) !== "obsoleto").map(a => a.id)) : ""}
    ${total ? `<details class="dc-disc"><summary>🕘 Histórico de envios desta obra<span class="n">${hist.length}</span></summary><div class="dc-corpo dc-hist">
      ${hist.map(h => `<div>${dh(h.em)} · <b>${esc(h.por)}</b> (${esc(h.login)}${h.externo ? ", externo" : ""}) — ${esc(h.texto)}</div>`).join("") || "Nada enviado ainda."}</div></details>` : ""}`;
  return shell({ title: `Projetos · ${o.nome}`, body, user });
}

// ---------- gravações ----------
function registrar(d, user, obra, texto) {
  (d.historico = d.historico || []).push({ em: agoraLocalISO(), por: quem(user), login: user.usuario, externo: externo(user), obra, texto });
}
export function enviarDocumentos(user, obraId, campos, arquivos) {
  if (!podeObra(user, obraId)) return { erro: "Sem acesso a esta obra." };
  if (!acessoTotal(user)) return { erro: "Quem envia projeto é a engenharia, a Diretoria ou o projetista." };
  const disc = DISCIPLINAS.find(x => x.id === campos.disciplina); if (!disc) return { erro: "Disciplina inválida." };
  const fs = (arquivos || []).filter(a => a.campo === "arquivo" && a.buffer && a.buffer.length);
  if (!fs.length) return { erro: "Escolha o arquivo." };
  // 06/11: aqui vai UM arquivo só (cada prancha precisa dos seus campos); vários de uma vez é no envio em lote
  if (fs.length > 1) return { erro: `Aqui vai um arquivo por vez (vieram ${fs.length}). Para vários, use "📦 Enviar em lote", no alto da página da obra — lá cada arquivo tem o seu tipo, local e prancha. Nada foi gravado.` };
  const d = ler(), base = campos.revDe ? vivos(d).find(a => a.id === campos.revDe && a.obra === obraId && a.disciplina === disc.id && a.origem !== "marcacao") : null;
  if (campos.revDe && !base) return { erro: "Documento de origem da revisão não encontrado." };
  if (base && fs.length > 1) return { erro: "Nova revisão: envie um arquivo só." };
  // local e prancha: a nova revisão herda do original; documento novo (ou revisão de um anterior a 04/11) precisa dos dois
  const local = base && base.local ? base.local : limparLocal(campos.local);
  const prancha1 = base && base.local ? base.prancha : Number(campos.prancha);
  if (!local) return { erro: "Escolha o pavimento ou local." };
  const responsavel = String(campos.responsavel || "");
  if (!nomeResp(responsavel)) return { erro: "Escolha quem vai liberar para a obra." };
  if (!(base && base.local) && !locaisAtivos(d).some(l => l.sigla === local)) return { erro: `O local ${local} não está na lista. Peça ao administrador para incluir.` };
  // tipo: a nova revisão herda; documento novo (ou revisão de um enviado antes dos tipos) escolhe da lista da disciplina
  const tipo = base && base.tipo ? base.tipo : String(campos.tipo || "");
  if (!tipo) return { erro: `Escolha o tipo (do que trata a prancha de ${disc.nome}).` };
  if (!(base && base.tipo) && !tiposAtivos(d, disc.id).some(t => t.sigla === tipo)) return { erro: `O tipo ${tipo} não está na lista de ${disc.nome}. Peça ao administrador para incluir.` };
  if (!Number.isInteger(prancha1) || prancha1 < 1 || prancha1 > 999) return { erro: "Informe o número da prancha (de 1 a 999)." };
  const doMesmo = vivos(d).filter(a => a.obra === obraId && a.disciplina === disc.id && a.origem !== "marcacao");
  for (let i = 0; i < fs.length; i++) {
    const ja = doMesmo.find(a => (a.tipo || "") === tipo && a.local === local && a.prancha === prancha1 + i && (!base || a.numero !== base.numero));
    if (ja) return { erro: `Já existe a prancha ${prancha1 + i} de ${nomeTipo(d, disc.id, tipo)} do ${local} em ${disc.nome} (${codigo(ja)}). Se for nova revisão, escolha em "É nova revisão de…". Nada foi gravado.` };
  }
  const feitos = [];
  for (const [i, f] of fs.entries()) {
    let nome; try { nome = salvarArquivo(f, DIR_DOCS); } catch (e) { return { erro: `${f.nomeOriginal || "arquivo"}: ${e.message}` + (feitos.length ? ` (os ${feitos.length} anteriores foram gravados)` : "") }; }
    const todosDoMesmo = d.arquivos.filter(a => a.obra === obraId && a.disciplina === disc.id && a.origem !== "marcacao");
    const numero = base ? base.numero : Math.max(0, ...todosDoMesmo.map(a => a.numero)) + 1;   // nº interno: liga as revisões
    const rev = base ? Math.max(...todosDoMesmo.filter(a => a.numero === base.numero).map(a => a.rev)) + 1 : 0;
    const descricao = String(campos.descricao || "").trim().slice(0, 160) || (base ? base.descricao : String(f.nomeOriginal || "").replace(/\.[^.]+$/, "").slice(0, 160)) || "documento";
    const a = { id: randomBytes(6).toString("hex"), obra: obraId, disciplina: disc.id, numero, tipo, local, prancha: prancha1 + i, rev, responsavel, descricao, arquivo: nome, ext: f.ext, tamanho: f.buffer.length,
      original: String(f.nomeOriginal || "").slice(0, 200), origem: "upload", por: quem(user), login: user.usuario, porExterno: externo(user), em: agoraLocalISO() };
    d.arquivos.push(a); feitos.push(a);
    registrar(d, user, obraId, `enviou ${codigo(a)} · ${descricao}${base ? " (nova revisão)" : ""} — libera: ${nomeResp(responsavel)}`);
  }
  gravar(d);
  return { ok: feitos.length === 1 ? `Gravado como ${codigo(feitos[0])}.` : `${feitos.length} arquivos gravados (${feitos.map(codigo).join(", ")}).`, ids: feitos.map(a => a.id), obra: obraId };
}
export function removerDocumento(user, id) {
  if (externo(user)) return { erro: "O acesso externo não remove documentos." };
  if (!acessoTotal(user)) return { erro: "A equipe da obra não remove documentos." };
  const ids = [...new Set(String(id || "").split(",").map(s => s.trim()).filter(Boolean))];
  if (ids.length > 1) {   // remover vários de uma vez (10/11): todos da mesma obra, todos achados — senão nada é removido
    const d = ler(), vv = vivos(d), as = ids.map(i => vv.find(x => x.id === i && x.origem !== "marcacao"));
    if (as.some(a => !a)) return { erro: "Alguma prancha marcada não foi encontrada (já removida?). Nada foi removido." , obra: (as.find(Boolean) || {}).obra };
    const obra = as[0].obra; if (as.some(a => a.obra !== obra) || !podeObra(user, obra)) return { erro: "As pranchas marcadas precisam ser da mesma obra. Nada foi removido." };
    const em = agoraLocalISO();
    for (const a of as) a.removido = { por: quem(user), login: user.usuario, em, lote: as.length };
    registrar(d, user, obra, `removeu ${as.length} pranchas de uma vez: ${as.map(codigo).join(", ")}`); gravar(d);
    return { ok: `${as.length} pranchas removidas (ficam no histórico).`, obra };
  }
  const d = ler(), a = vivos(d).find(x => x.id === ids[0]); if (!a) return { erro: "Documento não encontrado." };
  a.removido = { por: quem(user), login: user.usuario, em: agoraLocalISO() }; registrar(d, user, a.obra, `removeu ${codigo(a)}`); gravar(d);
  return { ok: `${codigo(a)} removido (fica no histórico).`, obra: a.obra };
}
/** Registrar (ou corrigir) o carimbo de um aprovativo: o PDF carimbado vira um arquivo novo, ligado ao original. */
export function carimbarDocumento(user, campos, arquivos) {
  const d = ler(), a = vivos(d).find(x => x.id === campos.id && x.origem !== "marcacao");
  if (!a || !podeObra(user, a.obra) || !acessoTotal(user)) return { erro: "Documento não encontrado." };
  if (!exigeCarimbo(d, a)) return { erro: `${codigo(a)} não é de um tipo que exige carimbo.`, obra: a.obra };
  if (situacao(a, vivos(d)) === "obsoleto") return { erro: `${codigo(a)} está obsoleto: registre o carimbo na revisão que vale.`, obra: a.obra };
  const f = (arquivos || []).find(x => x.campo === "arquivo" && x.buffer && x.buffer.length); if (!f) return { erro: "Anexe o PDF carimbado.", obra: a.obra };
  if (![".pdf", ".png", ".jpg", ".jpeg"].includes(f.ext)) return { erro: "O carimbado vai como PDF ou foto.", obra: a.obra };
  const data = String(campos.data || ""), hoje = agoraLocalISO().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje || data < String(a.em).slice(0, 10)) return { erro: "Data do carimbo inválida (entre o envio do projeto e hoje).", obra: a.obra };
  let nome; try { nome = salvarArquivo(f, DIR_DOCS); } catch (e) { return { erro: e.message, obra: a.obra }; }
  if (a.carimbo) (a.carimbosAnteriores = a.carimbosAnteriores || []).push(a.carimbo);
  a.carimbo = { arquivo: nome, ext: f.ext, tamanho: f.buffer.length, original: String(f.nomeOriginal || "").slice(0, 200), data,
    protocolo: String(campos.protocolo || "").trim().slice(0, 40), por: quem(user), login: user.usuario, porExterno: externo(user), em: agoraLocalISO() };
  registrar(d, user, a.obra, `${a.carimbosAnteriores && a.carimbosAnteriores.length ? "corrigiu o carimbo de" : "anexou o carimbo de"} ${codigo(a)} (${orgaoDo(d, a)}, ${data.split("-").reverse().join("/")}${a.carimbo.protocolo ? ", protocolo " + a.carimbo.protocolo : ""})`);
  gravar(d);
  return { ok: `${codigo(a)}: carimbo registrado.`, obra: a.obra };
}
/** Liberar para a obra (ou cancelar a liberação). Cancelar não apaga: a liberação anterior fica guardada. */
export function liberarDocumento(user, campos) {
  const d = ler(), a = vivos(d).find(x => x.id === campos.id && x.origem !== "marcacao");
  if (!a || !podeObra(user, a.obra)) return { erro: "Documento não encontrado." };
  if (!podeLiberar(user)) return { erro: "Quem libera para a obra é a Diretoria, o Gerente de Engenharia ou o Administrador.", obra: a.obra };
  const s = situacao(a, vivos(d)), em = agoraLocalISO();
  if (campos.acao === "liberar") {
    if (s !== "revisao") return { erro: `${codigo(a)} não está em revisão (está ${SIT[s].txt.toLowerCase()}).`, obra: a.obra };
    const antes = vivos(d).filter(b => b.origem !== "marcacao" && b.obra === a.obra && b.disciplina === a.disciplina && b.numero === a.numero && b.rev < a.rev && situacao(b, vivos(d)) === "liberado");
    a.liberado = { por: quem(user), login: user.usuario, em };
    registrar(d, user, a.obra, `liberou para a obra ${codigo(a)}${antes.length ? ` (${antes.map(codigo).join(", ")} fica obsoleto)` : ""}`); gravar(d);
    return { ok: `${codigo(a)} liberado para a obra.${antes.length ? ` ${antes.map(codigo).join(", ")} agora é obsoleto.` : ""}`, obra: a.obra, liberou: a.id };
  }
  if (campos.acao === "cancelar") {
    if (s !== "liberado") return { erro: `${codigo(a)} não está liberado.`, obra: a.obra };
    (a.liberacoesCanceladas = a.liberacoesCanceladas || []).push({ ...a.liberado, canceladoPor: quem(user), canceladoLogin: user.usuario, canceladoEm: em });
    delete a.liberado;
    registrar(d, user, a.obra, `cancelou a liberação de ${codigo(a)} (volta para em revisão)`); gravar(d);
    return { ok: `Liberação de ${codigo(a)} cancelada: voltou para em revisão.`, obra: a.obra };
  }
  return { erro: "Nada para mudar.", obra: a.obra };
}

// ---------- painel de controle: gestão visual da situação dos projetos (04/11) ----------
const CSS_PAINEL = `<style>
.pn-filtro{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.pn-filtro select{padding:7px 9px;border:1px solid #ddd8c8;border-radius:9px;font-size:12.5px;font-family:inherit;background:#fff}
.pn-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
.pn-card{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:14px 16px;border-top:5px solid #ccc}
.pn-card .v{font-size:34px;font-weight:900;line-height:1.1}.pn-card .r{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:var(--mut)}
.pn-card .s{font-size:12px;color:var(--mut);margin-top:4px}
.pn-card.rev{border-top-color:#e8c33a}.pn-card.lib{border-top-color:#3f9a4a}.pn-card.obs{border-top-color:#c9c9c9}.pn-card.atr{border-top-color:#b03a3a}.pn-card.atr .v{color:#b03a3a}
.pn-barra{display:flex;height:14px;border-radius:7px;overflow:hidden;background:#f3f0e6;min-width:120px}
.pn-barra i{display:block}.pn-barra .b-rev{background:#e8c33a}.pn-barra .b-lib{background:#3f9a4a}.pn-barra .b-obs{background:#c9c9c9}
.pn-resp{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
.pn-resp div{background:#fcfbf7;border:1px solid #efeade;border-radius:12px;padding:10px 12px;font-size:12.5px}.pn-resp b{font-size:20px;display:block}
.pn-cara{font-size:24px;line-height:1}.pn-atraso td{background:#fdf2f2}.pn-vence td{background:#fffaeb}
.pn-p-atraso{color:#b03a3a;font-weight:800}.pn-p-vence{color:#8a6d00;font-weight:700}.pn-p-ok{color:#2f6b2f}
.pn-t select{padding:4px 6px;border:1px solid #ddd8c8;border-radius:7px;font-size:12px;font-family:inherit}
@media(max-width:800px){.pn-cards{grid-template-columns:repeat(2,1fr)}}
</style>`;
// ---------- tarefas delegadas nos chats (das pranchas e da compatibilização), para o Gerenciamento ----------
// Carinha: com prazo — 😊 faltam 2 dias ou mais · 😬 vence hoje/amanhã · ☹️ atrasada; sem prazo — a regra dos 5 dias úteis.
function prazoDaTarefa(m, hoje) {
  const t = m.tarefa, rank = { ok: 1, vence: 2, atraso: 3 };
  if (t.prazo) {
    const dias = Math.round((Date.parse(t.prazo + "T12:00:00Z") - Date.parse(hoje.slice(0, 10) + "T12:00:00Z")) / 864e5);
    const p = dias < 0 ? { cara: "☹️", cls: "atraso", txt: `atrasada ${-dias} dia${dias === -1 ? "" : "s"}` } : dias <= 1 ? { cara: "😬", cls: "vence", txt: dias ? "vence amanhã" : "vence hoje" }
      : { cara: "😊", cls: "ok", txt: `faltam ${dias} dias` };
    return { ...p, ordem: rank[p.cls] * 1e4 - dias };
  }
  const p = prazo(m, hoje); return { cara: p.cara, cls: p.cls, txt: `sem prazo · ${p.txt}`, ordem: rank[p.cls] * 1e4 + p.n };
}
/** Todas as tarefas delegadas que a pessoa pode ver: [{ m, obra, disc, cod, link, resposta }]. */
function tarefasDelegadas(d, user) {
  const vv = vivos(d), obras = obrasDoUsuario(user), out = [];
  for (const [chave, cv] of Object.entries(d.conversas || {})) {
    const [obra, disc, numero] = chave.split("|"); if (!obras.some(o => o.id === obra)) continue;
    let cod, link;
    if (disc === "COMPAT") { cod = `${siglaObra(obra)} · compatibilização`; link = `/documentos/compat/${obra}`; }   // chat da compatibilização: "obra|COMPAT|0"
    else {
      const revs = vv.filter(a => a.origem !== "marcacao" && a.obra === obra && a.disciplina === disc && String(a.numero) === numero).sort((m, n) => n.rev - m.rev);
      if (!revs.length) continue; cod = codigo(revs[0]); link = `/documentos/chat/${revs[0].id}`;
    }
    cv.msgs.forEach((m, i) => { if (!m.tarefa) return;
      const depois = cv.msgs.slice(i + 1).filter(r => r.login !== m.login), resp = depois[depois.length - 1] || null;
      out.push({ m, obra, disc, cod, link: `${link}#m-${m.id}`, resposta: resp, nResp: depois.length }); });
  }
  return out;
}
export function paginaPainel(user, q = {}, { ok = "", erro = "" } = {}) {
  if (!acessoTotal(user)) return null;
  const d = ler(), vv = vivos(d), hoje = agoraLocalISO(), obras = obrasDoUsuario(user), libera = podeLiberar(user);
  const fo = obras.some(o => o.id === q.o) ? q.o : "", fx = DISCIPLINAS.some(x => x.id === q.x) ? q.x : "", fr = q.r === "sem" || nomeResp(q.r) ? q.r : "";
  const docs = vv.filter(a => a.origem !== "marcacao" && obras.some(o => o.id === a.obra) && (!fo || a.obra === fo) && (!fx || a.disciplina === fx))
    .map(a => ({ a, s: situacao(a, vv) }));
  const conta = s => docs.filter(z => z.s === s).length;
  const fila = docs.filter(z => z.s === "revisao" && (!fr || (fr === "sem" ? !nomeResp(z.a.responsavel) : z.a.responsavel === fr)))
    .map(z => ({ ...z, p: prazo(z.a, hoje) })).sort((m, n) => n.p.n - m.p.n || String(m.a.em).localeCompare(String(n.a.em)));
  const emRev = docs.filter(z => z.s === "revisao").map(z => ({ ...z, p: prazo(z.a, hoje) }));
  const caras = lista => ["😊", "😬", "☹️"].map(c => `${c} ${lista.filter(z => z.p.cara === c).length}`).join(" · ");
  const qs = (mud = {}) => { const p = new URLSearchParams(Object.entries({ o: fo, x: fx, r: fr, ...mud }).filter(([, v]) => v)); return "/documentos/painel" + (p.toString() ? "?" + p : ""); };
  const nomeObra = id => (OBRAS_DOCS.find(o => o.id === id) || {}).nome || id;
  // tarefas delegadas nos chats: abertas primeiro (da pior carinha para a melhor); as concluídas ficam atrás de um botão
  const todasTar = tarefasDelegadas(d, user).filter(t => (!fo || t.obra === fo) && (!fx || t.disc === fx));
  const fp = todasTar.some(t => t.m.tarefa.para === q.p) ? q.p : "";
  const tarefas = todasTar.filter(t => !fp || t.m.tarefa.para === fp).map(t => ({ ...t, p: prazoDaTarefa(t.m, hoje) }));
  const abertasT = tarefas.filter(t => t.m.tarefa.status !== "feita").sort((m, n) => n.p.ordem - m.p.ordem), feitasT = tarefas.filter(t => t.m.tarefa.status === "feita");
  const linhaTar = t => { const m = t.m, ta = m.tarefa, feita = ta.status === "feita";
    return `<tr class="pn-${feita ? "ok" : t.p.cls}"><td class="pn-cara" title="${esc(t.p.txt)}">${feita ? "✅" : t.p.cara}</td>
      <td><div style="font-size:13px">${m.etiqueta ? seloEtq(m.etiqueta) + " " : ""}${m.clash ? `<b>${codClash(m.clash.n)} · ${esc(m.clash.titulo)}</b> ` : ""}${esc(String(m.texto || (m.clash ? "" : "(marcação)")).slice(0, 110))}</div>
        <a class="dc-cod" href="${t.link}" style="text-decoration:none;color:inherit;font-size:11px;display:inline-block;margin-top:3px">${esc(t.cod)}</a></td>
      <td style="font-size:12.5px"><b>${esc(ta.para)}</b></td>
      <td style="font-size:12px;white-space:nowrap">${esc(m.por)}<br><span style="color:var(--mut)">${dh(m.em).slice(0, 10)}</span></td>
      <td class="pn-p-${feita ? "ok" : t.p.cls}" style="font-size:12px;white-space:nowrap">${feita ? `concluída por ${esc(ta.feita.por)}<br><span style="color:var(--mut)">${dh(ta.feita.em).slice(0, 10)}</span>` : `${ta.prazo ? ta.prazo.split("-").reverse().join("/") + "<br>" : ""}${esc(t.p.txt)}`}</td>
      <td style="font-size:12px">${t.resposta ? `💬 ${t.nResp} resposta${t.nResp === 1 ? "" : "s"}<br><span style="color:var(--mut)">última: ${esc(t.resposta.por)} · ${dh(t.resposta.em).slice(0, 10)}</span>` : `<span style="color:#a12d2d;font-weight:700">sem resposta</span>`}</td>
      <td style="text-align:right"><a class="dc-bt claro" href="${t.link}">abrir no chat</a></td></tr>`; };
  const pessoasTar = [...new Set(todasTar.map(t => t.m.tarefa.para))].sort();

  const porObra = obras.filter(o => !fo || o.id === fo).map(o => {
    const da = docs.filter(z => z.a.obra === o.id), n = s => da.filter(z => z.s === s).length, t = da.length || 1;
    return `<tr><td><a href="${qs({ o: o.id })}" style="color:inherit;font-weight:700">${esc(o.nome)}</a> <span class="dc-cod" style="font-size:10.5px">${siglaObra(o.id)}</span></td>
      <td style="width:45%"><div class="pn-barra">${["revisao", "liberado", "obsoleto"].map(s => `<i class="b-${s.slice(0, 3)}" style="width:${(n(s) / t * 100).toFixed(1)}%" title="${SIT[s].txt}: ${n(s)}"></i>`).join("")}</div></td>
      <td style="text-align:right">${n("revisao")}</td><td style="text-align:right">${n("liberado")}</td><td style="text-align:right">${n("obsoleto")}</td></tr>`;
  }).join("");

  const porResp = [...RESPONSAVEIS, { id: "sem", nome: "Sem responsável" }].map(r => {
    const l = emRev.filter(z => r.id === "sem" ? !nomeResp(z.a.responsavel) : z.a.responsavel === r.id);
    if (r.id === "sem" && !l.length) return "";
    return `<a href="${qs({ r: fr === r.id ? "" : r.id })}" style="color:inherit;text-decoration:none"><div${fr === r.id ? ` style="border-color:var(--acento);background:#fff"` : ""}>${esc(r.nome)}<b>${l.length}</b><span style="color:var(--mut)">${caras(l)}</span></div></a>`;
  }).join("");

  const linhas = fila.map(({ a, p }) => `<tr class="pn-${p.cls}">
    <td class="pn-cara" title="${esc(p.txt)}">${p.cara}</td>
    <td><a class="dc-cod" href="/documentos/${a.obra}" style="text-decoration:none;color:inherit">${esc(codigo(a))}</a><div style="font-size:11.5px;color:var(--mut);margin-top:3px">${esc(String(a.descricao).slice(0, 70))}</div></td>
    <td style="font-size:12px">${esc(nomeObra(a.obra))}<br><span style="color:var(--mut)">${esc((DISCIPLINAS.find(x => x.id === a.disciplina) || {}).nome || a.disciplina)}</span></td>
    <td style="font-size:12px;white-space:nowrap">${dh(a.em).slice(0, 10)}<br><span style="color:var(--mut)">por ${esc(a.por)}</span></td>
    <td style="font-size:12px">${libera ? `<form method="POST" action="/documentos/responsavel" style="margin:0"><input type="hidden" name="id" value="${a.id}"><input type="hidden" name="volta" value="${esc(qs())}">
        <select name="responsavel" onchange="this.form.submit()">${a.responsavel ? "" : `<option value="">— definir —</option>`}${RESPONSAVEIS.map(r => `<option value="${r.id}"${r.id === a.responsavel ? " selected" : ""}>${r.nome}</option>`).join("")}</select></form>`
      : `<b>${esc(nomeResp(a.responsavel) || "—")}</b>`}</td>
    <td class="pn-p-${p.cls}" style="font-size:12px;white-space:nowrap">${esc(p.txt)}</td>
    <td style="text-align:right;white-space:nowrap"><a class="dc-bt claro" href="/documentos/arquivo/${a.id}" target="_blank">Abrir</a>
      ${libera ? `<form method="POST" action="/documentos/liberar" style="display:inline" onsubmit="return confirm('Liberar ${esc(codigo(a))} para a obra?')"><input type="hidden" name="id" value="${a.id}"><input type="hidden" name="acao" value="liberar"><input type="hidden" name="volta" value="${esc(qs())}"><button class="dc-lib">✓ Liberar</button></form>` : ""}</td></tr>`).join("");

  const sel = (nome, atual, ops, todos) => `<select name="${nome}" onchange="this.form.submit()"><option value="">${todos}</option>${ops.map(([v, t]) => `<option value="${v}"${v === atual ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const body = `${CSS}${CSS_PAINEL}${topoProjetos(user, "painel")}
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(ok)}</div>` : ""}
    <form class="pn-filtro" method="GET" action="/documentos/painel">
      ${sel("o", fo, obras.map(o => [o.id, o.nome]), "Todas as obras")}${sel("x", fx, DISCIPLINAS.map(x => [x.id, x.nome]), "Todas as disciplinas")}
      ${sel("r", fr, [...RESPONSAVEIS.map(r => [r.id, r.nome]), ["sem", "Sem responsável"]], "Todos os responsáveis")}
      ${fo || fx || fr ? `<a class="dc-bt claro" href="/documentos/painel" style="padding:8px 10px">limpar</a>` : ""}</form>
    <div class="pn-cards">
      <div class="pn-card rev"><div class="r">Em revisão</div><div class="v">${conta("revisao")}</div><div class="s">${caras(emRev)}</div></div>
      <div class="pn-card lib"><div class="r">Liberado para a obra</div><div class="v">${conta("liberado")}</div><div class="s">o que a obra usa hoje</div></div>
      <div class="pn-card obs"><div class="r">Obsoleto</div><div class="v">${conta("obsoleto")}</div><div class="s">substituído por revisão nova</div></div>
      <div class="pn-card atr"><div class="r">Atrasados ☹️</div><div class="v">${emRev.filter(z => z.p.cls === "atraso").length}</div><div class="s">em revisão há mais de ${PRAZO_UTEIS} dias úteis</div></div>
    </div>
    <div class="dc-disc" id="tarefas"><div class="dc-corpo"><b style="font-size:15px">📋 Tarefas delegadas nos chats</b> <span style="font-size:12px;color:var(--mut)">— o que foi passado para alguém, da mais atrasada para a mais tranquila</span>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;font-size:12.5px">
        <span><b>${abertasT.length}</b> aberta${abertasT.length === 1 ? "" : "s"}</span><span>${["😊", "😬", "☹️"].map(c => `${c} ${abertasT.filter(t => t.p.cara === c).length}`).join(" · ")}</span>
        <span style="color:#a12d2d">${abertasT.filter(t => !t.resposta).length} sem resposta</span>
        ${pessoasTar.length ? `<form method="GET" action="/documentos/painel" style="margin:0 0 0 auto">${fo ? `<input type="hidden" name="o" value="${fo}">` : ""}${fx ? `<input type="hidden" name="x" value="${fx}">` : ""}${fr ? `<input type="hidden" name="r" value="${fr}">` : ""}
          <select name="p" onchange="this.form.submit()" style="padding:5px 8px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit"><option value="">Todas as pessoas</option>${pessoasTar.map(x => `<option${x === fp ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></form>` : ""}
      </div>
      ${abertasT.length ? `<table class="dc-t pn-t" style="margin-top:10px"><thead><tr><th></th><th>Tarefa</th><th>Para</th><th>Delegada por</th><th>Prazo</th><th>Resposta</th><th></th></tr></thead><tbody>${abertasT.map(linhaTar).join("")}</tbody></table>`
        : `<div style="color:var(--mut);font-size:13px;margin-top:8px">Nenhuma tarefa aberta${fp || fo || fx ? " com esse filtro" : ""}. 😊</div>`}
      ${feitasT.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12.5px;color:var(--mut)">✅ ${feitasT.length} concluída${feitasT.length === 1 ? "" : "s"}</summary>
        <table class="dc-t pn-t" style="margin-top:6px"><tbody>${feitasT.map(linhaTar).join("")}</tbody></table></details>` : ""}
    </div></div>
    <div class="dc-disc"><div class="dc-corpo"><b style="font-size:15px">⏳ Fila de liberação</b> <span style="font-size:12px;color:var(--mut)">— em revisão, do mais atrasado para o mais novo</span>
      ${fila.length ? `<table class="dc-t pn-t" style="margin-top:10px"><thead><tr><th></th><th>Código</th><th>Obra / disciplina</th><th>Incluído</th><th>Quem libera</th><th>Prazo</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
        : `<div style="color:var(--mut);font-size:13px;margin-top:8px">Nada em revisão${fo || fx || fr ? " com esse filtro" : ""}. 😊</div>`}</div></div>
    <div class="dc-disc"><div class="dc-corpo"><b style="font-size:15px">👤 Por responsável</b> <span style="font-size:12px;color:var(--mut)">— clique para filtrar a fila</span><div class="pn-resp" style="margin-top:10px">${porResp}</div></div></div>
    <div class="dc-disc"><div class="dc-corpo"><b style="font-size:15px">🏗️ Por obra</b>
      <table class="dc-t" style="margin-top:8px"><thead><tr><th>Obra</th><th>${selo("revisao")} ${selo("liberado")} ${selo("obsoleto")}</th><th style="text-align:right">Rev.</th><th style="text-align:right">Lib.</th><th style="text-align:right">Obs.</th></tr></thead><tbody>${porObra}</tbody></table></div></div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.7">
      Todo projeto enviado entra <b>em revisão</b>, com quem vai liberar escolhido no envio. O prazo para liberar é de <b>${PRAZO_UTEIS} dias úteis</b>, contados do dia seguinte ao da inclusão
      (segunda a sexta; feriado ainda não é descontado): 😊 até o 3º dia útil, 😬 no 4º e 5º (vencendo) e ☹️ depois do 5º (atrasado).
      Ao liberar, a revisão anterior que estava liberada vira <b>obsoleta</b>. Os números contam pranchas e revisões (cada revisão é um documento); marcações não entram.
      A equipe da obra não vê este painel: ela só enxerga o liberado.</div></details>`;
  return shell({ title: "Gerenciamento de projetos · Projetos", body, user });
}
/** Trocar quem libera um projeto em revisão. O anterior fica guardado. */
export function trocarResponsavel(user, campos) {
  if (!podeLiberar(user)) return { erro: "Quem troca o responsável é quem libera: Diretoria, Gerente de Engenharia ou Administrador." };
  const d = ler(), a = vivos(d).find(x => x.id === campos.id && x.origem !== "marcacao");
  if (!a || !podeObra(user, a.obra)) return { erro: "Documento não encontrado." };
  if (!nomeResp(campos.responsavel)) return { erro: "Responsável inválido." };
  if (a.responsavel === campos.responsavel) return { ok: "Nada mudou." };
  if (a.responsavel) (a.responsaveisAnteriores = a.responsaveisAnteriores || []).push({ responsavel: a.responsavel, ate: agoraLocalISO(), trocadoPor: quem(user) });
  const antes = nomeResp(a.responsavel) || "sem responsável"; a.responsavel = campos.responsavel;
  registrar(d, user, a.obra, `trocou quem libera ${codigo(a)}: ${antes} → ${nomeResp(a.responsavel)}`); gravar(d);
  return { ok: `${codigo(a)}: agora quem libera é ${nomeResp(a.responsavel)}.` };
}

// ---------- pavimentos e locais: a lista do administrador ----------
export function paginaLocais(user, { ok = "", erro = "" } = {}) {
  if (!podeGerirLocais(user)) return null;
  const d = ler(), lista = locaisDe(d), usos = s => vivos(d).filter(a => a.local === s && a.origem !== "marcacao").length;
  const hist = (d.historico || []).filter(h => h.obra === "locais").slice(-40).reverse();
  const linhas = lista.map(l => `<tr${l.removido ? ` style="opacity:.55"` : ""}>
    <td><span class="dc-cod">${esc(l.sigla)}</span></td><td>${esc(l.nome)}</td>
    <td style="font-size:11.5px;color:var(--mut)">${usos(l.sigla)}</td>
    <td style="font-size:11.5px;color:var(--mut)">${l.removido ? `inativado por ${esc(l.removido.por)} · ${dh(l.removido.em)}` : `${esc(l.criado ? l.criado.por : "")}${l.criado && l.criado.em.length > 10 ? " · " + dh(l.criado.em) : ""}`}</td>
    <td style="text-align:right"><form method="POST" action="/documentos/locais" style="display:inline"><input type="hidden" name="sigla" value="${esc(l.sigla)}">
      <input type="hidden" name="acao" value="${l.removido ? "reativar" : "inativar"}"><button class="${l.removido ? "dc-bt claro" : "dc-x"}">${l.removido ? "reativar" : "inativar"}</button></form></td></tr>`).join("");
  const body = `${CSS}${topoProjetos(user, "locais")}
    <div class="dc-dica" style="font-size:12.5px">A lista que aparece no envio de projetos, para todas as obras. Quem envia só escolhe daqui. Inativar tira da lista do envio, mas os documentos que já usam o local continuam com o mesmo código.</div>
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(ok)}</div>` : ""}
    <div class="dc-disc"><div class="dc-corpo">
      <table class="dc-t"><thead><tr><th>Sigla</th><th>Nome</th><th>Pranchas</th><th>Criado / situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
      <form class="dc-up" method="POST" action="/documentos/locais" style="grid-template-columns:.6fr 1.6fr auto">
        <input type="hidden" name="acao" value="novo">
        <div><label>Sigla</label><input name="sigla" maxlength="8" required placeholder="Ex.: G07" style="text-transform:uppercase"></div>
        <div><label>Nome</label><input name="nome" maxlength="60" required placeholder="Ex.: Garagem 7"></div>
        <div><button class="dc-bt" style="padding:9px 14px">Incluir</button></div></form>
      <div class="dc-dica">Sigla: até 8 letras ou números, sem acento nem espaço (vai no código do arquivo e não muda depois).</div>
    </div></div>
    <details class="dc-disc"><summary>🕘 Histórico da lista<span class="n">${hist.length}</span></summary><div class="dc-corpo dc-hist">
      ${hist.map(h => `<div>${dh(h.em)} · <b>${esc(h.por)}</b> (${esc(h.login)}) — ${esc(h.texto)}</div>`).join("") || "Nenhuma mudança ainda."}</div></details>`;
  return shell({ title: "Pavimentos e locais · Projetos", body, user });
}
export function salvarLocal(user, campos) {
  if (!podeGerirLocais(user)) return { erro: "Quem mexe na lista de pavimentos e locais é a Diretoria ou a engenharia." };
  const d = ler(), lista = d.locais = locaisDe(d), sigla = limparLocal(campos.sigla), em = agoraLocalISO();
  if (!sigla) return { erro: "Informe a sigla." };
  const l = lista.find(x => x.sigla === sigla);
  if (campos.acao === "novo") {
    const nome = String(campos.nome || "").trim().slice(0, 60);
    if (!nome) return { erro: "Informe o nome do pavimento ou local." };
    if (l) return { erro: `A sigla ${sigla} já existe (${l.nome}${l.removido ? ", inativa — use reativar" : ""}).` };
    lista.push({ sigla, nome, criado: { por: quem(user), login: user.usuario, em } });
    registrar(d, user, "locais", `incluiu ${sigla} — ${nome}`); gravar(d); return { ok: `${sigla} — ${nome} incluído na lista.` };
  }
  if (!l) return { erro: "Local não encontrado." };
  if (campos.acao === "inativar" && !l.removido) {
    l.removido = { por: quem(user), login: user.usuario, em };
    registrar(d, user, "locais", `inativou ${sigla} — ${l.nome}`); gravar(d); return { ok: `${sigla} inativado: saiu da lista do envio.` };
  }
  if (campos.acao === "reativar" && l.removido) {
    (l.inativacoes = l.inativacoes || []).push(l.removido); delete l.removido;   // a inativação anterior fica guardada
    registrar(d, user, "locais", `reativou ${sigla} — ${l.nome}`); gravar(d); return { ok: `${sigla} voltou para a lista.` };
  }
  return { erro: "Nada para mudar." };
}

// ---------- tipos de prancha: uma lista por disciplina, do administrador ----------
export function paginaTipos(user, { ok = "", erro = "", disc = "" } = {}) {
  if (!podeGerirLocais(user)) return null;
  const d = ler(), vv = vivos(d), hist = (d.historico || []).filter(h => h.obra === "tipos").slice(-40).reverse();
  const secoes = DISCIPLINAS.map(x => {
    const lista = tiposDe(d, x.id), usos = s => vv.filter(a => a.disciplina === x.id && a.tipo === s && a.origem !== "marcacao").length;
    const linhas = lista.map(t => `<tr${t.removido ? ` style="opacity:.55"` : ""}>
      <td><span class="dc-cod">${esc(t.sigla)}</span></td><td>${esc(t.nome)}${t.carimbo ? ` <span class="dc-sit" style="background:#e6eef8;color:#2f5d8a;border:1px solid #c5d6ea">exige carimbo</span>` : ""}</td>
      <td style="font-size:11.5px;color:var(--mut)">${usos(t.sigla)}</td>
      <td style="font-size:11.5px;color:var(--mut)">${t.removido ? `inativado por ${esc(t.removido.por)} · ${dh(t.removido.em)}` : `${esc(t.criado ? t.criado.por : "")}${t.criado && t.criado.em.length > 10 ? " · " + dh(t.criado.em) : ""}`}</td>
      <td style="text-align:right"><form method="POST" action="/documentos/tipos" style="display:inline"><input type="hidden" name="disciplina" value="${x.id}"><input type="hidden" name="sigla" value="${esc(t.sigla)}">
        <input type="hidden" name="acao" value="${t.removido ? "reativar" : "inativar"}"><button class="${t.removido ? "dc-bt claro" : "dc-x"}">${t.removido ? "reativar" : "inativar"}</button></form></td></tr>`).join("");
    return `<details class="dc-disc" id="t-${x.id}"${disc === x.id ? " open" : ""}><summary>${x.ic} ${x.nome} <span class="dc-cod" style="font-size:10.5px">${siglaDisc(x.id)}</span><span class="n">${lista.filter(t => !t.removido).length} tipos</span></summary><div class="dc-corpo">
      <table class="dc-t"><thead><tr><th>Sigla</th><th>Nome</th><th>Pranchas</th><th>Criado / situação</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
      <form class="dc-up" method="POST" action="/documentos/tipos" style="grid-template-columns:.6fr 1.6fr .9fr auto">
        <input type="hidden" name="acao" value="novo"><input type="hidden" name="disciplina" value="${x.id}">
        <div><label>Sigla (3 letras)</label><input name="sigla" maxlength="3" minlength="3" required placeholder="Ex.: FOR" style="text-transform:uppercase"></div>
        <div><label>Nome</label><input name="nome" maxlength="60" required placeholder="Ex.: Forma"></div>
        <div><label style="text-transform:none"><input type="checkbox" name="carimbo" value="1" style="width:auto;vertical-align:middle"> exige carimbo</label></div>
        <div><button class="dc-bt" style="padding:9px 14px">Incluir</button></div></form>
    </div></details>`;
  }).join("");
  const body = `${CSS}${topoProjetos(user, "tipos")}
    <div class="dc-dica" style="font-size:12.5px">Do que trata cada prancha, separado por disciplina. Quem envia só escolhe daqui. A sigla de 3 letras entra no código do arquivo (ex.: ELC-EST-<b>FOR</b>-TER-P03-R01) e não muda depois. Inativar tira da lista do envio; os documentos que já usam o tipo continuam com o mesmo código.</div>
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0">${esc(ok)}</div>` : ""}
    ${secoes}
    <details class="dc-disc"><summary>🕘 Histórico dos tipos<span class="n">${hist.length}</span></summary><div class="dc-corpo dc-hist">
      ${hist.map(h => `<div>${dh(h.em)} · <b>${esc(h.por)}</b> (${esc(h.login)}) — ${esc(h.texto)}</div>`).join("") || "Nenhuma mudança ainda."}</div></details>`;
  return shell({ title: "Tipos de prancha · Projetos", body, user });
}
export function salvarTipo(user, campos) {
  if (!podeGerirLocais(user)) return { erro: "Quem mexe nos tipos de prancha é a Diretoria ou a engenharia." };
  const disc = DISCIPLINAS.find(x => x.id === campos.disciplina); if (!disc) return { erro: "Disciplina inválida." };
  const d = ler(), tipos = d.tipos = d.tipos || {}, lista = tipos[disc.id] = tiposDe(d, disc.id), sigla = limparLocal(campos.sigla), em = agoraLocalISO();
  const r = (o) => ({ ...o, disc: disc.id });
  if (!/^[A-Z0-9]{3}$/.test(sigla)) return r({ erro: "A sigla tem 3 letras ou números, sem acento." });
  const t = lista.find(x => x.sigla === sigla);
  if (campos.acao === "novo") {
    const nome = String(campos.nome || "").trim().slice(0, 60);
    if (!nome) return r({ erro: "Informe o nome do tipo." });
    if (t) return r({ erro: `${disc.nome} já tem a sigla ${sigla} (${t.nome}${t.removido ? ", inativa — use reativar" : ""}).` });
    lista.push({ sigla, nome, ...(campos.carimbo ? { carimbo: true } : {}), criado: { por: quem(user), login: user.usuario, em } });
    registrar(d, user, "tipos", `incluiu ${siglaDisc(disc.id)}-${sigla} — ${nome}${campos.carimbo ? " (exige carimbo)" : ""}`); gravar(d);
    return r({ ok: `${sigla} — ${nome} incluído em ${disc.nome}.` });
  }
  if (!t) return r({ erro: "Tipo não encontrado." });
  if (campos.acao === "inativar" && !t.removido) {
    t.removido = { por: quem(user), login: user.usuario, em };
    registrar(d, user, "tipos", `inativou ${siglaDisc(disc.id)}-${sigla} — ${t.nome}`); gravar(d); return r({ ok: `${sigla} inativado em ${disc.nome}.` });
  }
  if (campos.acao === "reativar" && t.removido) {
    (t.inativacoes = t.inativacoes || []).push(t.removido); delete t.removido;
    registrar(d, user, "tipos", `reativou ${siglaDisc(disc.id)}-${sigla} — ${t.nome}`); gravar(d); return r({ ok: `${sigla} voltou para a lista de ${disc.nome}.` });
  }
  return r({ erro: "Nada para mudar." });
}

/** O arquivo para abrir: só se a pessoa pode ver a obra. Devolve o caminho e o nome com a nomenclatura. */
export function arquivoDocumento(user, id, carimbado = false) {
  const v = vivos(ler()), a = v.find(x => x.id === id); if (!a || !podeObra(user, a.obra)) return null;
  // a obra só abre o liberado — e as marcações antigas da prancha, que aparecem no chat dela
  if (!acessoTotal(user) && (a.origem === "marcacao" ? !acessoChat(user, ler(), v.find(b => b.id === a.baseId)) : situacao(a, v) !== "liberado")) return null;
  if (carimbado) {   // a versão carimbada baixa com o mesmo código + "-CARIMBADO"
    if (!a.carimbo) return null;
    const pc = join(DIR_DOCS, a.carimbo.arquivo);
    return existsSync(pc) ? { caminho: pc, nome: nomeDownload({ ...a, ext: a.carimbo.ext }).replace(codigo(a), codigo(a) + "-CARIMBADO"), ext: a.carimbo.ext, id: a.id, codigo: codigo(a), qr: a.origem !== "marcacao", qrPos: a.qrPos || null } : null;
  }
  const p = join(DIR_DOCS, a.arquivo); return existsSync(p) ? { caminho: p, nome: nomeDownload(a), ext: a.ext, id: a.id, codigo: codigo(a), qr: a.origem !== "marcacao", qrPos: a.qrPos || null } : null;
}

// ---------- CHAT da prancha (04/11) ----------
// Um chat por PRANCHA (obra + disciplina + nº interno), atravessando as revisões: cada mensagem guarda a revisão.
// Quem participa: engenharia, Diretoria, o projetista (perfil Externo) e a equipe da obra — esta só nas pranchas que têm
// revisão LIBERADA. Marcar o PDF não cria mais arquivo novo na lista: a marcação vai para o chat como imagem em alta e o
// PDF mãe continua limpo. As marcações antigas (…-Mnn) aparecem no chat como estavam. Nada some: resolver, reabrir e
// concluir tarefa ficam guardados na mensagem (acoes).
const chaveP = a => `${a.obra}|${a.disciplina}|${a.numero}`;
export const ETIQUETAS = [
  { id: "", txt: "Comentário", ic: "💬", bg: "#f3efe2", fg: "#6a5e3a" },
  { id: "duvida", txt: "Dúvida", ic: "❓", bg: "#e6eef8", fg: "#2f5d8a", abre: true },
  { id: "pendencia", txt: "Pendência", ic: "⚠️", bg: "#fdf1c2", fg: "#7a5b00", abre: true },
  { id: "atrasado", txt: "Atrasado", ic: "⏰", bg: "#fbe3e3", fg: "#a12d2d", abre: true },
  { id: "fornecedor", txt: "Verificar com fornecedor", ic: "🏭", bg: "#efe6f8", fg: "#5b3a8a", abre: true },
  { id: "decisao", txt: "Decisão", ic: "📌", bg: "#dff1d8", fg: "#22662a" },
  { id: "clash", txt: "Clash / interferência", ic: "💥", bg: "#fde2d6", fg: "#a3361b", abre: true },
];
const etq = id => ETIQUETAS.find(e => e.id === (id || "")) || ETIQUETAS[0];
const seloEtq = id => { const e = etq(id); return `<span class="ch-etq" style="background:${e.bg};color:${e.fg}">${e.ic} ${e.txt}</span>`; };
// projetista responsável de cada obra × disciplina (o login é um usuário de perfil Externo)
// (04/11, 3ª versão) ESCRITÓRIOS (d.escritorios: só o nome) com várias PESSOAS (d.projetistasCad: nome + login, cada uma
// ligada a um escritório ou autônoma) + quem responde por cada obra × disciplina (d.atribuicoes: "obra|disc" → ids das pessoas).
// Pode ser mais de uma pessoa por disciplina. Inativar só marca; o histórico guarda cada marcação e desmarcação.
const cadastroProj = d => d.projetistasCad || [];
const escritoriosDe = d => d.escritorios || [];
const escDe = (d, p) => escritoriosDe(d).find(e => e.id === p.escritorio) || null;
const pessoaAtiva = (d, p) => !p.removido && !(escDe(d, p) || {}).removido;
const projetistasDe = (d, obra, disc) => {
  const ids = (d.atribuicoes || {})[`${obra}|${disc}`] || [];
  const lista = cadastroProj(d).filter(p => pessoaAtiva(d, p) && ids.includes(p.id)).map(p => ({ ...p, esc: (escDe(d, p) || {}).nome || "" }));
  const antigo = (d.projetistas || {})[`${obra}|${disc}`];   // a 1ª versão (um só, digitado) — se existir, continua valendo
  return antigo && !lista.some(p => p.login && p.login === antigo.login) ? [...lista, antigo] : lista;
};
/** As pessoas juntas por escritório, para mostrar: [{ esc: "Liberté", nomes: ["Ana", "Rui"] }] (autônomo: esc = ""). */
const porEscritorio = ps => { const g = []; ps.forEach(p => { const x = g.find(y => y.esc === (p.esc || "")); if (x) x.nomes.push(p.nome); else g.push({ esc: p.esc || "", nomes: [p.nome] }); }); return g; };
const perfilDe = (d, u, obra, disc) => u.nivel === "master" ? "Diretoria" : externo(u)
  ? (projetistasDe(d, obra, disc).some(p => p.login && p.login === login(u)) ? "Projetista responsável" : "Projetista") : (escritorio(u) || ACESSO_TOTAL_DOCS.includes(login(u))) ? "Engenharia" : "Obra";
const COR_PERFIL = { "Diretoria": "#111", "Engenharia": "#8a6d1a", "Projetista responsável": "#2f5d8a", "Projetista": "#2f5d8a", "Obra": "#22662a" };
/** O que a pessoa pode no chat desta prancha: null = nada. A obra só entra se houver revisão liberada (e marca só nela). */
function acessoChat(user, d, a) {
  if (!a || a.origem === "marcacao" || !podeObra(user, a.obra)) return null;
  const vv = vivos(d), revs = vv.filter(b => b.origem !== "marcacao" && chaveP(b) === chaveP(a)).sort((m, n) => n.rev - m.rev);
  const lib = revs.find(b => situacao(b, vv) === "liberado");
  if (acessoTotal(user)) return { revs, atual: revs[0], lib, total: true };
  return lib ? { revs, atual: lib, lib, total: false } : null;
}
const msgsDe = (d, a) => (((d.conversas || {})[chaveP(a)] || {}).msgs || []);
const aberta = m => etq(m.etiqueta).abre && !m.resolvido;
const tarefaAberta = m => m.tarefa && m.tarefa.status !== "feita";
/** Números do chat de uma prancha, para o botão da lista. */
function resumoChat(d, a) {
  const ms = msgsDe(d, a), marcAnt = vivos(d).filter(m => m.origem === "marcacao" && d.arquivos.some(b => b.id === m.baseId && chaveP(b) === chaveP(a)));
  return { n: ms.length + marcAnt.length, abertas: ms.filter(aberta).length, tarefas: ms.filter(tarefaAberta).length };
}
const CSS_CHAT = `<style>
.ch-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:10px}.ch-top h1{margin:0;font-size:20px}
.ch-info{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:12.5px}
.ch-info>div{background:#fff;border:1px solid #ece8dc;border-radius:12px;padding:8px 12px}.ch-info b.v{font-size:20px;display:block;line-height:1.1}
.ch-abas{display:flex;gap:6px;margin:14px 0 6px;flex-wrap:wrap}.ch-abas a{border:1px solid #ddd8c8;border-radius:999px;padding:5px 12px;font-size:12.5px;text-decoration:none;color:#4a4330;background:#fff}
.ch-abas a.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.ch-lista{display:flex;flex-direction:column;gap:10px;max-width:920px;margin:0 auto}
.ch-msg{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:10px 14px;max-width:86%}.ch-msg.eu{align-self:flex-end;background:#fffaf0;border-color:#ecdcae}
.ch-msg.fechada{opacity:.72}.ch-cab{font-size:11.5px;color:var(--mut);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ch-cab b{color:#2a2a30;font-size:12.5px}.ch-perfil{color:#fff;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:800}
.ch-rev{font-family:ui-monospace,Menlo,monospace;background:#f3efe2;border-radius:6px;padding:0 5px;font-size:10.5px;font-weight:700;color:#5a4e2e}
.ch-etq{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:800;margin-top:6px}
.ch-txt{font-size:13.5px;line-height:1.55;margin-top:6px;white-space:pre-wrap;word-wrap:break-word}
.ch-imgs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.ch-imgs figure{margin:0}.ch-imgs img{display:block;max-width:300px;max-height:220px;border:1px solid #e2dccb;border-radius:10px;cursor:zoom-in;background:#fafafa}
.ch-imgs figcaption{font-size:10.5px;color:var(--mut);margin-top:2px}
.ch-tar{margin-top:8px;border:1px dashed #d9cfa8;background:#fffbea;border-radius:10px;padding:7px 10px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ch-tar.feita{background:#eef7ea;border-color:#b9dcae}.ch-tar.venc{background:#fdf2f2;border-color:#f0c9c9}
.ch-acoes{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--mut)}
.ch-acoes button{border:1px solid #ddd8c8;background:#fff;border-radius:7px;padding:3px 8px;font-size:11.5px;cursor:pointer;font-family:inherit}
.ch-res{color:#22662a;font-weight:700}
.ch-novo{position:sticky;bottom:0;max-width:920px;margin:14px auto 0;background:#fcfbf7;border:1px solid #e2dccb;border-radius:14px;padding:10px 12px;box-shadow:0 -4px 14px rgba(0,0,0,.06)}
.ch-novo textarea{width:100%;min-height:62px;border:1px solid #ddd8c8;border-radius:10px;padding:8px 10px;font-size:13.5px;font-family:inherit;resize:vertical;box-sizing:border-box}
.ch-linha{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:8px}.ch-linha label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.ch-linha select,.ch-linha input{padding:7px 8px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff}
.ch-zoom{position:fixed;inset:0;background:rgba(10,10,12,.92);z-index:999;display:none;overflow:hidden;touch-action:none}.ch-zoom.on{display:block}
.ch-zoom img{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;cursor:grab}
.ch-zbar{position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:2}.ch-zbar button,.ch-zbar a{background:#1d1d22;color:#eee;border:1px solid #3a3a42;border-radius:8px;padding:7px 11px;font-size:13px;cursor:pointer;text-decoration:none;font-family:inherit}
@media(max-width:700px){.ch-msg{max-width:100%}.ch-imgs img{max-width:100%}}
</style>`;
/** A tela da prancha: o PDF de verdade (com zoom nítido e marcação em desenho) à esquerda, o chat à direita.
 *  v = a revisão que abre no visor (a obra só vê a liberada); marcar = já abre com as ferramentas de marcação. */
export function paginaChat(user, docId, { ok = "", erro = "", f = "", v = "", marcar = false } = {}) {
  const d = ler(), a = vivos(d).find(x => x.id === docId), ac = acessoChat(user, d, a); if (!ac) return null;
  const o = OBRAS_DOCS.find(x => x.id === a.obra), disc = DISCIPLINAS.find(x => x.id === a.disciplina) || { nome: a.disciplina, ic: "" };
  const vv = vivos(d), projs = projetistasDe(d, a.obra, a.disciplina), hoje = agoraLocalISO().slice(0, 10), eu = login(user);
  // as revisões que a pessoa pode ver no visor: a engenharia todas (a mais nova primeiro), a obra só a liberada
  const vistas = ac.total ? ac.revs : [ac.lib];
  const tipoDe = r => ehPDF(r) ? "pdf" : ehImg(r) ? "img" : "outro";
  const docs = vistas.map(r => ({ id: r.id, cod: codigo(r), rev: r.rev, sit: SIT[situacao(r, vv)].txt, tipo: tipoDe(r), url: `/documentos/arquivo/${r.id}` }));
  // as mensagens + as marcações antigas (…-Mnn), em ordem de data
  const antigas = vv.filter(m => m.origem === "marcacao" && ac.revs.some(r => r.id === m.baseId))
    .map(m => ({ id: m.id, em: m.em, por: m.por, login: m.login, perfil: m.porExterno ? "Projetista" : "", rev: m.rev, texto: m.obs || "", legado: m }));
  let todas = [...msgsDe(d, a), ...antigas].sort((m, n) => String(m.em).localeCompare(String(n.em)));
  const nAbertas = todas.filter(aberta).length, nTar = todas.filter(tarefaAberta).length;
  if (f === "abertas") todas = todas.filter(aberta); else if (f === "tarefas") todas = todas.filter(m => m.tarefa); else if (f === "marcacoes") todas = todas.filter(m => m.legado || m.marcas || (m.imagens || []).length);
  const base = `/documentos/chat/${a.id}`;
  const acaoBt = (m, acao, txt) => `<form method="POST" action="${base}/acao" style="display:inline;margin:0"><input type="hidden" name="msg" value="${m.id}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="f" value="${esc(f)}"><button>${txt}</button></form>`;
  const msg = m => {
    const e = etq(m.etiqueta), ultima = (m.acoes || []).slice(-1)[0];
    const tar = m.tarefa ? (t => `<div class="ch-tar${t.status === "feita" ? " feita" : t.prazo && t.prazo < hoje ? " venc" : ""}">📋 Tarefa para <b>${esc(t.para)}</b>${t.prazo ? ` · prazo <b>${t.prazo.split("-").reverse().join("/")}</b>${t.status !== "feita" && t.prazo < hoje ? ` <b style="color:#a12d2d">vencida</b>` : ""}` : ""}
        ${t.status === "feita" ? `<span class="ch-res">✓ concluída por ${esc(t.feita.por)} · ${dh(t.feita.em)}</span> ${acaoBt(m, "reabrirTarefa", "reabrir")}` : acaoBt(m, "concluir", "✓ concluir")}</div>`)(m.tarefa) : "";
    // marcação nova: miniatura + "ver no PDF" (desenha por cima do PDF de verdade); foto: abre em tela cheia
    const fotos = (m.imagens || []).map((im, i) => ({ ...im, i })), minis = m.marcas ? fotos.filter(im => im.pagina) : [], soFotos = m.marcas ? fotos.filter(im => !im.pagina) : fotos;
    const imgs = m.legado ? `<div class="ch-acoes"><a class="dc-bt claro" href="/documentos/arquivo/${m.legado.id}" target="_blank">✏️ Abrir marcação ${esc(codigo(m.legado))}</a></div>`
      : (m.marcas ? `<div class="ch-imgs">${minis.map(im => `<figure><img loading="lazy" src="${base}/img/${m.id}/${im.i}" alt="marcação" data-marca="${m.id}" title="ver no PDF"><figcaption>página ${im.pagina}</figcaption></figure>`).join("")}</div>
          <div class="ch-acoes"><button type="button" class="ch-ver" data-marca="${m.id}">👁 ver a marcação no PDF</button> ${m.marcas.length} página${m.marcas.length === 1 ? "" : "s"} marcada${m.marcas.length === 1 ? "" : "s"}</div>` : "")
        + (soFotos.length ? `<div class="ch-imgs">${soFotos.map(im => `<figure><img loading="lazy" src="${base}/img/${m.id}/${im.i}" alt="foto" data-zoom="${base}/img/${m.id}/${im.i}"><figcaption>foto</figcaption></figure>`).join("")}</div>` : "");
    return `<div class="ch-msg${m.login === eu ? " eu" : ""}${(e.abre && m.resolvido) || (m.tarefa && m.tarefa.status === "feita" && !e.abre) ? " fechada" : ""}" id="m-${m.id}">
      <div class="ch-cab"><b>${esc(m.por)}</b>${m.perfil ? `<span class="ch-perfil" style="background:${COR_PERFIL[m.perfil] || "#777"}">${esc(m.perfil)}</span>` : ""}<span class="ch-rev">R${String(m.rev).padStart(2, "0")}</span><span>${dh(m.em)}</span></div>
      ${m.etiqueta || m.legado ? seloEtq(m.etiqueta) : ""}${m.legado ? ` <span class="ch-etq" style="background:#f3efe2;color:#6a5e3a">✏️ marcação (antes do chat)</span>` : ""}
      ${m.texto ? `<div class="ch-txt">${esc(m.texto)}</div>` : ""}${imgs}${tar}
      ${e.abre ? `<div class="ch-acoes">${m.resolvido ? `<span class="ch-res">✅ resolvida por ${esc(m.resolvido.por)} · ${dh(m.resolvido.em)}</span> ${acaoBt(m, "reabrir", "reabrir")}` : acaoBt(m, "resolver", "✅ marcar como resolvida")}</div>` : ""}
      ${ultima && !m.resolvido && !(m.tarefa && m.tarefa.status === "feita") ? `<div class="ch-acoes">${esc(ultima.acao)} por ${esc(ultima.por)} · ${dh(ultima.em)}</div>` : ""}</div>`;
  };
  const marcas = {}; msgsDe(d, a).filter(m => m.marcas).forEach(m => { marcas[m.id] = { doc: m.docMarcado, por: m.por, quando: dh(m.em), rev: m.rev, paginas: m.marcas }; });
  const pessoas = [...new Set([...RESPONSAVEIS.map(r => r.nome), ...projs.map(p => p.nome), "Equipe da obra", ...msgsDe(d, a).map(m => m.por)])];
  const aba = (x, txt) => `<a class="${f === x ? "on" : ""}" href="${base}${x ? "?f=" + x : ""}">${txt}</a>`;
  const podeMarcar = {}; vistas.forEach(r => { if (tipoDe(r) !== "outro") podeMarcar[r.id] = true; });
  const cores = ["#e02424", "#1f6feb", "#1a7f37", "#f5b400", "#111111", "#ff6a00"];
  const body = `${CSS}${CSS_CHAT}${VISOR_CSS}
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px">
      <a class="pg-volta" href="/documentos/${a.obra}" style="margin:0"><span class="seta">←</span> ${esc(o.nome)}</a>
      <b style="font-size:16px">💬 ${esc(codigo(ac.atual))}</b>${selo(situacao(ac.atual, vv))}${revEmAndamento(ac.atual, vv) ? SELO_ANDAMENTO : ""}
      <span style="font-size:12.5px;color:var(--mut)">${esc(ac.atual.descricao)} · ${disc.ic} ${esc(disc.nome)}</span></div>
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:7px 12px;font-size:13px;margin:0 0 8px">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:7px 12px;font-size:13px;margin:0 0 8px">${esc(ok)}</div>` : ""}
    <div class="vw-cel"><button type="button" data-cel="so-pdf">📄 PDF</button><button type="button" data-cel="so-chat">💬 Chat${nAbertas ? ` (${nAbertas})` : ""}</button></div>
    <div class="vw so-chat">
      <section class="vw-pdf">
        <div class="vw-bar">
          ${docs.length > 1 ? `<select id="vwRev" title="Revisão">${docs.map(x => `<option value="${x.id}">${esc(x.cod)} · ${esc(x.sit)}</option>`).join("")}</select>` : `<span style="font-size:12.5px;font-weight:700;padding:0 4px">${esc(docs[0].cod)}</span>`}
          <span class="vw-sep"></span><button type="button" data-vz="-" title="Diminuir">－</button><span id="vwPct">—</span><button type="button" data-vz="+" title="Aumentar (ou Ctrl + rodinha)">＋</button>
          <button type="button" data-vz="larg" title="Caber na largura">↔ largura</button><button type="button" data-vz="pag" title="Página inteira">▣ página</button>
          <a id="vwAbrir" target="_blank" title="Abrir o arquivo em outra aba">abrir</a>
          <span style="flex:1"></span><button type="button" id="vwMarcar" class="mk">✏️ Marcar</button>
        </div>
        <div class="vw-tools" id="vwTools" hidden>
          <button type="button" data-vf="caneta" class="on">✏️ Caneta</button><button type="button" data-vf="linha">／ Linha</button><button type="button" data-vf="seta">➜ Seta</button>
          <button type="button" data-vf="ret">▭ Retângulo</button><button type="button" data-vf="circ">◯ Círculo</button><button type="button" data-vf="texto">T Texto</button><button type="button" data-vf="marca">🖍 Marca-texto</button>
          <span class="vw-sep"></span>${cores.map((c, i) => `<button type="button" class="vw-cor${i === 0 ? " on" : ""}" data-vc="${c}" style="background:${c}" title="cor"></button>`).join("")}
          <select id="vwEsp" title="Espessura"><option value="2">fino</option><option value="4" selected>médio</option><option value="8">grosso</option></select>
          <span class="vw-sep"></span><button type="button" id="vwDesf" title="Desfazer (Ctrl+Z)">↶ Desfazer</button><button type="button" id="vwLimpa">Limpar</button>
          <span style="font-size:11.5px;color:#bbb">escreva o comentário no chat e clique em Enviar →</span>
        </div>
        <div class="vw-banner" id="vwBanner" hidden></div>
        <div class="vw-area" id="vwArea"><div class="vw-pags" id="vwPags"></div></div>
      </section>
      <div class="vw-div" id="vwDiv" title="Arraste para dar mais espaço ao PDF ou ao chat"></div>
      <section class="vw-chat">
        <div class="vw-cab">
          <div class="ch-resumo">
            <span title="Projetista${projs.length === 1 ? "" : "s"} responsáve${projs.length === 1 ? "l" : "is"}">🧑‍💼 ${projs.length ? `<b>${porEscritorio(projs).map(g => g.esc ? `${esc(g.esc)}: ${g.nomes.map(esc).join(", ")}` : g.nomes.map(esc).join(", ")).join(" · ")}</b>` : `<b style="color:#a12d2d">projetista não definido</b>`}</span>
            <span class="ch-n" style="color:${nAbertas ? "#a12d2d" : "#22662a"}" title="Dúvidas e pendências em aberto">⚠️ ${nAbertas} em aberto</span>
            <span class="ch-n" style="color:${nTar ? "#8a6d00" : "#22662a"}" title="Tarefas abertas">📋 ${nTar} tarefa${nTar === 1 ? "" : "s"}</span>
            <span class="ch-n" title="Mensagens">💬 ${msgsDe(d, a).length + antigas.length}</span>
          </div>
          <div class="ch-abas">${aba("", "Tudo")}${aba("abertas", `Em aberto (${nAbertas})`)}${aba("tarefas", "Tarefas")}${aba("marcacoes", "Marcações")}</div>
        </div>
        <div class="ch-lista" id="chLista">${todas.map(msg).join("") || `<div style="color:var(--mut);font-size:13px;text-align:center;padding:24px">${f ? "Nada aqui com esse filtro." : "Ninguém escreveu ainda. Faça a primeira pergunta ou marque o PDF."}</div>`}</div>
        <form class="ch-novo" id="chNovo" method="POST" action="${base}" enctype="multipart/form-data">
          <div id="chMarcasNota"></div>
          <div class="ch-opc">
            <select name="etiqueta" title="Etiqueta">${ETIQUETAS.map(e => `<option value="${e.id}">${e.ic} ${e.txt}</option>`).join("")}</select>
            <span class="ch-campo" title="Delegar: vira tarefa para essa pessoa">📋<input name="para" list="ch-pessoas" maxlength="60" placeholder="delegar para…"></span>
            <datalist id="ch-pessoas">${pessoas.map(p => `<option value="${esc(p)}">`).join("")}</datalist>
            <span class="ch-campo" title="Prazo da tarefa">📅<input type="date" name="prazo" min="${hoje}"></span>
            <label class="ch-campo ch-foto" title="Anexar foto da obra">📎 <span id="chFotoTxt">foto</span><input type="file" name="foto" multiple accept=".jpg,.jpeg,.png,image/*"></label>
          </div>
          <div class="ch-escreve"><textarea name="texto" maxlength="2000" rows="2" placeholder="Escreva para a equipe e o projetista… (Ctrl+Enter envia)"></textarea>
            <button type="submit" class="dc-bt" title="Enviar">Enviar ➤</button></div>
          <div id="chStatus"></div>
        </form>
      </section>
    </div>
    <div class="ch-zoom" id="chZoom"><div class="ch-zbar"><button type="button" data-z="1.25">＋</button><button type="button" data-z="0.8">－</button><button type="button" data-z="0">ajustar</button><a id="chZoomAbrir" target="_blank">tamanho real</a><button type="button" data-z="x">✕ fechar</button></div><img id="chZoomImg" alt=""></div>
    ${visorScript({ chave: chaveP(a), docs, v: docs.some(x => x.id === v) ? v : "", podeMarcar, marcas, marcar: !!marcar })}`;
  return shell({ title: `Chat · ${codigo(ac.atual)}`, body, user });
}
// a marcação chega como DESENHO (formas em coordenadas da página do PDF): confere tudo antes de gravar
const FORMAS = ["caneta", "linha", "seta", "ret", "circ", "texto", "marca"];
function lerMarcas(txt) {
  if (!txt) return null;
  if (String(txt).length > 3e6) throw new Error("marcação grande demais");
  let m; try { m = JSON.parse(txt); } catch { throw new Error("marcação ilegível"); }
  if (!Array.isArray(m) || !m.length || m.length > 200) throw new Error("marcação sem páginas");
  const num = v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  return m.map(p => {
    if (!Number.isInteger(p.pagina) || p.pagina < 1 || !Array.isArray(p.formas) || !p.formas.length || p.formas.length > 3000) throw new Error("página marcada inválida");
    return { pagina: p.pagina, formas: p.formas.map(s => {
      if (!FORMAS.includes(s.f) || !/^#[0-9a-f]{6}$/i.test(s.c) || ![2, 4, 8].includes(s.e) || !Array.isArray(s.pts) || !s.pts.length || s.pts.length > 20000
        || !s.pts.every(q => Array.isArray(q) && q.length === 2 && num(q[0]) && num(q[1]))) throw new Error("traço inválido na marcação");
      return { f: s.f, c: s.c, e: s.e, pts: s.pts.map(q => [q[0], q[1]]), ...(s.f === "texto" ? { t: String(s.t || "").slice(0, 200) } : {}) };
    }) };
  });
}
/** Mensagem nova no chat: texto, etiqueta, tarefa, fotos da obra — e a marcação (desenho + miniatura de cada página). */
export function postarChat(user, docId, campos, arquivos) {
  const d = ler(), a = vivos(d).find(x => x.id === docId), ac = acessoChat(user, d, a); if (!ac) return { erro: "Prancha não encontrada." };
  const texto = String(campos.texto || "").trim().slice(0, 2000), etiqueta = String(campos.etiqueta || "");
  if (!ETIQUETAS.some(e => e.id === etiqueta)) return { erro: "Etiqueta inválida.", id: docId };
  let marcas; try { marcas = lerMarcas(campos.marcas); } catch (e) { return { erro: e.message, id: docId }; }
  // a revisão em que se marcou: precisa ser desta prancha — e, para a obra, a liberada
  const docMarcado = ac.revs.find(r => r.id === campos.docMarcado) || null;
  if (marcas && (!docMarcado || (!ac.total && docMarcado.id !== ac.lib.id) || !(ehPDF(docMarcado) || ehImg(docMarcado)))) return { erro: "Esta revisão não pode ser marcada.", id: docId };
  const fotos = (arquivos || []).filter(f => (f.campo === "foto" || (marcas && f.campo === "imagem")) && f.buffer && f.buffer.length);
  if (fotos.some(f => ![".png", ".jpg", ".jpeg"].includes(f.ext))) return { erro: "No chat vão fotos e imagens (JPG ou PNG).", id: docId };
  if (!texto && !fotos.length && !marcas) return { erro: "Escreva alguma coisa, marque o PDF ou anexe uma foto.", id: docId };
  const para = String(campos.para || "").trim().slice(0, 60), prazo = String(campos.prazo || "");
  if (prazo && (!para || !/^\d{4}-\d{2}-\d{2}$/.test(prazo))) return { erro: "Para dar prazo, diga para quem é a tarefa.", id: docId };
  const paginas = String(campos.paginas || "").split(",");
  const imagens = []; let nMini = 0;   // as miniaturas da marcação vêm na ordem de "paginas"; as fotos da obra não têm página
  for (const f of fotos) {
    let nome; try { nome = salvarArquivo(f, join(DIR_DOCS, "chat")); } catch (e) { return { erro: `${f.nomeOriginal || "imagem"}: ${e.message}`, id: docId }; }
    const pg = f.campo === "imagem" ? +paginas[nMini++] : 0;
    imagens.push({ arquivo: nome, ext: f.ext, tamanho: f.buffer.length, ...(pg ? { pagina: pg } : {}) });
  }
  // a revisão da mensagem: a que estava aberta no visor (onde se marcou) ou a que vale para quem escreve
  const rev = (docMarcado || ac.atual).rev;
  const m = { id: randomBytes(6).toString("hex"), em: agoraLocalISO(), por: quem(user), login: user.usuario, perfil: perfilDe(d, user, a.obra, a.disciplina), rev,
    texto, etiqueta, ...(imagens.length ? { imagens } : {}), ...(marcas ? { marcas, docMarcado: docMarcado.id } : {}), ...(para ? { tarefa: { para, prazo, status: "aberta" } } : {}) };
  const cv = ((d.conversas = d.conversas || {})[chaveP(a)] = d.conversas[chaveP(a)] || { msgs: [] }); cv.msgs.push(m);
  if (para) registrar(d, user, a.obra, `delegou no chat de ${codigo(ac.atual)} para ${para}${prazo ? " (prazo " + prazo.split("-").reverse().join("/") + ")" : ""}`);
  gravar(d);
  return { ok: marcas ? "Marcação enviada ao chat." : "Mensagem enviada.", id: docId, msg: m.id };
}
/** Resolver/reabrir uma dúvida ou pendência, concluir/reabrir uma tarefa. Fica guardado quem e quando. */
/** Resolver/reabrir, concluir/reabrir tarefa numa mensagem (dos dois chats). Devolve false se não havia o que mudar. */
function aplicarAcao(m, acao, user) {
  const quemFez = { por: quem(user), login: user.usuario, em: agoraLocalISO() }, log = a => (m.acoes = m.acoes || []).push({ acao: a, ...quemFez });
  if (acao === "resolver" && etq(m.etiqueta).abre && !m.resolvido) { m.resolvido = quemFez; log(m.clash ? "resolveu o clash" : "resolveu"); }
  else if (acao === "reabrir" && m.resolvido) { delete m.resolvido; log("reabriu"); }
  else if (acao === "concluir" && tarefaAberta(m)) { m.tarefa.status = "feita"; m.tarefa.feita = quemFez; log("concluiu a tarefa"); }
  else if (acao === "reabrirTarefa" && m.tarefa && m.tarefa.status === "feita") { m.tarefa.status = "aberta"; delete m.tarefa.feita; log("reabriu a tarefa"); }
  else return false;
  return true;
}
export function acaoChat(user, docId, campos) {
  const d = ler(), a = vivos(d).find(x => x.id === docId), ac = acessoChat(user, d, a); if (!ac) return { erro: "Prancha não encontrada." };
  const m = msgsDe(d, a).find(x => x.id === campos.msg); if (!m) return { erro: "Mensagem não encontrada.", id: docId };
  if (!aplicarAcao(m, campos.acao, user)) return { erro: "Nada para mudar.", id: docId };
  gravar(d); return { ok: "Feito.", id: docId, msg: m.id };
}
/** A imagem de uma mensagem do chat, para quem pode ver o chat. */
export function imagemChat(user, docId, msgId, i) {
  const d = ler(), a = vivos(d).find(x => x.id === docId); if (!acessoChat(user, d, a)) return null;
  const m = msgsDe(d, a).find(x => x.id === msgId), im = m && (m.imagens || [])[+i]; if (!im) return null;
  const p = join(DIR_DOCS, "chat", im.arquivo);
  return existsSync(p) ? { caminho: p, nome: `${codigo(a)} chat ${dh(m.em).slice(0, 10).split("/").join("-")}${im.pagina ? " p" + im.pagina : ""}${im.ext}`, ext: im.ext } : null;
}

// ---------- projetistas: escritórios com suas pessoas + quadradinhos obra × disciplina, do administrador ----------
const CSS_PROJ = `<style>
.pr-filtro{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:12px}
.pr-filtro a{border:1px solid #ddd8c8;background:#fff;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:700;color:#4a4330;text-decoration:none;white-space:nowrap}
.pr-filtro a.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}.pr-filtro a .q{font-weight:400;color:#a39d8c;margin-left:4px}.pr-filtro a.on .q{color:#c9bd95}
.pr-grade{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.pr-grade th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);padding:8px 6px;border-bottom:1px solid #efeade;text-align:center;white-space:nowrap}
.pr-grade th:first-child,.pr-grade td:first-child{text-align:left}.pr-grade td{padding:6px;border-bottom:1px solid #f3f0e6;text-align:center}
.pr-grade tr.pes:hover td{background:#fcfbf7}.pr-grade th.vazia{color:#a12d2d}.pr-grade tr.pes td:first-child{padding-left:26px}
.pr-grade tr.grp td{background:#f6f3ea;border-top:8px solid #fff;font-size:12.5px}.pr-grade tr.grp td:first-child{font-weight:800}
.pr-ck{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:8px;cursor:pointer;border:2px solid #e2dccb;background:#fff;position:relative}
.pr-ck input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}.pr-ck:after{content:"";font-size:15px;font-weight:900;color:#fff}
.pr-ck:has(input:checked){background:#3f9a4a;border-color:#3f9a4a}.pr-ck:has(input:checked):after{content:"✓"}.pr-ck:hover{border-color:var(--acento)}
.pr-ck.todos{width:24px;height:24px;border-style:dashed}.pr-ck.todos:has(input:checked){background:#2f6b3a;border-style:solid}
.pr-ck.todos:has(input:indeterminate){background:#bfe0b5;border-color:#3f9a4a}.pr-ck.todos:has(input:indeterminate):after{content:"–";color:#22662a}
.pr-resumo{width:100%;border-collapse:collapse;font-size:12.5px}.pr-resumo th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);padding:7px 6px;border-bottom:1px solid #efeade;text-align:left}
.pr-resumo td{padding:7px 6px;border-bottom:1px solid #f3f0e6;vertical-align:top}.pr-chip{display:inline-block;background:#e6eef8;color:#2f5d8a;border-radius:10px;padding:2px 8px;margin:1px 2px 2px 0;font-size:11.5px;line-height:1.35}
.pr-chip b{display:block;font-size:10.5px;color:#4a6d92}.pr-falta{color:#c9a3a3;font-size:11.5px}
.pr-esc{border:1px solid #ece6d4;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#fcfbf7}.pr-esc.ina{opacity:.55}
.pr-esc-t{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.pr-esc-t b{font-size:14.5px}
.pr-pes{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.pr-pes>div{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #e6e0cf;border-radius:9px;padding:4px 8px;font-size:12.5px}
.pr-pes>div.ina{opacity:.5}.pr-pes code{font-size:11px;color:var(--mut)}
</style>`;
export function paginaProjetistas(user, { ok = "", erro = "", o: fo = "" } = {}) {
  if (!podeGerirLocais(user)) return null;
  const d = ler(), escs = escritoriosDe(d), pessoas = cadastroProj(d), hist = (d.historico || []).filter(h => h.obra === "projetistas").slice(-40).reverse();
  const ativas = pessoas.filter(p => pessoaAtiva(d, p));
  // os grupos da grade: cada escritório ativo com suas pessoas ativas, e os autônomos no fim
  const grupos = [...escs.filter(e => !e.removido).map(e => ({ e, ps: ativas.filter(p => p.escritorio === e.id) })), { e: null, ps: ativas.filter(p => !escDe(d, p)) }].filter(g => g.ps.length);
  const obra = OBRAS_DOCS.find(x => x.id === fo) || null, nObra = o => DISCIPLINAS.filter(x => projetistasDe(d, o.id, x.id).length).length;
  const filtro = `<div class="pr-filtro"><a href="/documentos/projetistas"${obra ? "" : ` class="on"`}>Todas as obras</a>${OBRAS_DOCS.map(o =>
    `<a href="/documentos/projetistas?o=${o.id}"${obra && obra.id === o.id ? ` class="on"` : ""}>${esc(o.nome)}<span class="q">${nObra(o)}/${DISCIPLINAS.length}</span></a>`).join("")}</div>`;
  const msgs = `${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 12px">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 12px">${esc(ok)}</div>` : ""}`;
  // uma obra: a grade (linhas = pessoas, agrupadas por escritório; colunas = disciplinas). "todos" marca a equipe inteira.
  const grade = obra ? (() => {
    const marcado = (p, x) => ((d.atribuicoes || {})[`${obra.id}|${x.id}`] || []).includes(p.id);
    const linhas = grupos.map((g, gi) => `<tr class="grp"><td>${g.e ? `🏢 ${esc(g.e.nome)}` : "👤 Autônomos"}<div style="font-weight:400;font-size:11px;color:var(--mut)">${g.ps.length} pessoa${g.ps.length === 1 ? "" : "s"} · "todos" marca a equipe inteira</div></td>
        ${DISCIPLINAS.map(x => `<td><label class="pr-ck todos" title="Todos de ${esc(g.e ? g.e.nome : "autônomos")} em ${esc(x.nome)}"><input type="checkbox" data-g="${gi}" data-x="${x.id}"></label></td>`).join("")}</tr>
      ${g.ps.map(p => `<tr class="pes"><td><b>${esc(p.nome)}</b>${p.login ? ` <span style="font-size:11px;color:var(--mut);font-family:ui-monospace,Menlo,monospace">${esc(p.login)}</span>` : ""}</td>
        ${DISCIPLINAS.map(x => `<td><label class="pr-ck" title="${esc(p.nome)} · ${esc(x.nome)}"><input type="checkbox" name="c_${x.id}_${p.id}" value="1" data-g="${gi}" data-x="${x.id}"${marcado(p, x) ? " checked" : ""}></label></td>`).join("")}</tr>`).join("")}`).join("");
    return `<form method="POST" action="/documentos/projetistas" id="prForm"><input type="hidden" name="acao" value="atribuir"><input type="hidden" name="obra" value="${obra.id}">
      <div class="dc-disc"><div class="dc-corpo" style="overflow-x:auto">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px"><b style="font-size:16px">${esc(obra.nome)}</b><span style="font-size:12.5px;color:var(--mut)">marque quem responde por cada disciplina — pode ser mais de uma pessoa, do mesmo escritório ou de escritórios diferentes</span></div>
      ${grupos.length ? `<table class="pr-grade" style="min-width:720px"><thead><tr><th>Escritório / pessoa</th>${DISCIPLINAS.map(x => { const n = ativas.filter(p => marcado(p, x)).length;
          return `<th${n ? "" : ` class="vazia" title="Ninguém nesta disciplina"`}>${x.ic} ${siglaDisc(x.id)}<br><span style="font-weight:400;text-transform:none;letter-spacing:0">${n ? n + " pessoa" + (n === 1 ? "" : "s") : "ninguém"}</span></th>`; }).join("")}</tr></thead>
        <tbody>${linhas}</tbody></table>
        <div style="text-align:right;margin-top:12px"><button class="dc-bt" style="padding:9px 18px">Gravar ${esc(obra.nome)}</button></div>`
      : `<div style="color:var(--mut);font-size:13px">Cadastre os escritórios e as pessoas abaixo para poder marcar.</div>`}
      </div></div></form>
      <script>(function(){ var f=document.getElementById('prForm'); if(!f) return;
        function pessoas(g,x){ return [].slice.call(f.querySelectorAll('input[name][data-g="'+g+'"][data-x="'+x+'"]')); }
        function acerta(t){ var ps=pessoas(t.getAttribute('data-g'),t.getAttribute('data-x')), n=ps.filter(function(c){return c.checked;}).length; t.checked=n===ps.length&&n>0; t.indeterminate=n>0&&n<ps.length; }
        var todos=[].slice.call(f.querySelectorAll('input:not([name])[data-g]')); todos.forEach(acerta);
        f.addEventListener('change',function(e){ var c=e.target; if(!c.hasAttribute('data-g')) return;
          if(!c.name){ pessoas(c.getAttribute('data-g'),c.getAttribute('data-x')).forEach(function(p){ p.checked=c.checked; }); }
          todos.forEach(acerta); });
      })();</script>`;
  })() : "";
  // todas as obras: o resumo de quem está em cada obra × disciplina, por escritório
  const resumo = obra ? "" : `<div class="dc-disc"><div class="dc-corpo" style="overflow-x:auto"><table class="pr-resumo" style="min-width:760px"><thead><tr><th>Obra</th>${DISCIPLINAS.map(x => `<th>${x.ic} ${siglaDisc(x.id)}</th>`).join("")}</tr></thead><tbody>
    ${OBRAS_DOCS.map(o => `<tr><td><a href="/documentos/projetistas?o=${o.id}" style="font-weight:800;color:inherit">${esc(o.nome)}</a></td>${DISCIPLINAS.map(x => { const ps = projetistasDe(d, o.id, x.id);
      return `<td>${ps.length ? porEscritorio(ps).map(g => `<span class="pr-chip">${g.esc ? `<b>🏢 ${esc(g.esc)}</b>` : ""}${g.nomes.map(esc).join(", ")}</span>`).join("") : `<span class="pr-falta">—</span>`}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table><div class="dc-dica">Clique numa obra (aqui ou nos botões acima) para marcar os quadradinhos.</div></div></div>`;
  // o cadastro: cada escritório com suas pessoas; autônomos no fim
  const btInat = (tipo, x) => `<form method="POST" action="/documentos/projetistas" style="display:inline;margin:0"><input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${x.id}"><input type="hidden" name="o" value="${obra ? obra.id : ""}">
    <input type="hidden" name="acao" value="${x.removido ? "reativar" : "inativar"}"><button class="${x.removido ? "dc-bt claro" : "dc-x"}" style="font-size:11px">${x.removido ? "reativar" : "inativar"}</button></form>`;
  const chipPessoa = p => `<div${p.removido ? ` class="ina"` : ""}>👤 <b>${esc(p.nome)}</b>${p.login ? `<code>${esc(p.login)}</code>` : `<code style="color:#c9a3a3">sem login</code>`} ${btInat("pessoa", p)}</div>`;
  const autonomos = pessoas.filter(p => !escDe(d, p));
  const cadastro = `<details class="dc-disc"${pessoas.length || escs.length ? "" : " open"} id="cadastro"><summary>👥 Escritórios e pessoas<span class="n">${escs.filter(e => !e.removido).length} escritório${escs.filter(e => !e.removido).length === 1 ? "" : "s"} · ${ativas.length} pessoa${ativas.length === 1 ? "" : "s"}</span></summary><div class="dc-corpo">
    ${escs.map(e => { const ps = pessoas.filter(p => p.escritorio === e.id);
      return `<div class="pr-esc${e.removido ? " ina" : ""}"><div class="pr-esc-t">🏢 <b>${esc(e.nome)}</b>
        <span style="font-size:12px;color:var(--mut)">${ps.filter(p => !p.removido).length} pessoa${ps.filter(p => !p.removido).length === 1 ? "" : "s"}</span><span style="margin-left:auto">${btInat("escritorio", e)}</span></div>
        <div class="pr-pes">${ps.map(chipPessoa).join("") || `<span style="font-size:12px;color:var(--mut)">nenhuma pessoa ainda — inclua abaixo</span>`}</div></div>`; }).join("")}
    ${autonomos.length ? `<div class="pr-esc"><div class="pr-esc-t">👤 <b>Autônomos</b><span style="font-size:12px;color:var(--mut)">sem escritório</span></div><div class="pr-pes">${autonomos.map(chipPessoa).join("")}</div></div>` : ""}
    <form class="dc-up" method="POST" action="/documentos/projetistas" style="grid-template-columns:1fr auto"><input type="hidden" name="acao" value="novoEscritorio"><input type="hidden" name="o" value="${obra ? obra.id : ""}">
      <div><label>🏢 Novo escritório</label><input name="nome" maxlength="80" required placeholder="Nome do escritório de projetos"></div>
      <div><button class="dc-bt" style="padding:9px 14px">Incluir escritório</button></div></form>
    <form class="dc-up" method="POST" action="/documentos/projetistas" style="grid-template-columns:1.4fr 1fr 1.3fr auto"><input type="hidden" name="acao" value="novaPessoa"><input type="hidden" name="o" value="${obra ? obra.id : ""}">
      <div><label>👤 Nova pessoa (projetista)</label><input name="nome" maxlength="60" required placeholder="Nome da pessoa"></div>
      <div><label>Login (perfil Externo)</label><input name="login" maxlength="40" placeholder="opcional" style="font-family:ui-monospace,Menlo,monospace"></div>
      <div><label>Escritório</label><select name="escritorio">${escs.filter(e => !e.removido).map(e => `<option value="${e.id}">${esc(e.nome)}</option>`).join("")}<option value="">— autônomo (sem escritório) —</option></select></div>
      <div><button class="dc-bt" style="padding:9px 14px">Incluir pessoa</button></div></form>
    <div class="dc-dica">Cada pessoa tem o seu login — o do perfil Externo, criado em Administração › Usuários; com ele, as mensagens dela aparecem no chat como "Projetista responsável". Inativar o escritório tira todas as pessoas dele das marcações; o histórico fica.</div>
  </div></details>`;
  const body = `${CSS}${CSS_PROJ}${topoProjetos(user, "projetistas")}${msgs}${filtro}${grade}${resumo}${cadastro}
    <details class="dc-disc"><summary>🕘 Histórico<span class="n">${hist.length}</span></summary><div class="dc-corpo dc-hist">
      ${hist.map(h => `<div>${dh(h.em)} · <b>${esc(h.por)}</b> (${esc(h.login)}) — ${esc(h.texto)}</div>`).join("") || "Nenhuma mudança ainda."}</div></details>`;
  return shell({ title: "Projetistas · Projetos", body, user });
}
export function salvarProjetistas(user, campos) {
  const volta = { o: String(campos.obra || campos.o || "") };
  if (!podeGerirLocais(user)) return { ...volta, erro: "Quem define os projetistas é a Diretoria ou a engenharia." };
  const d = ler(), escs = d.escritorios = escritoriosDe(d), cad = d.projetistasCad = cadastroProj(d), at = d.atribuicoes = d.atribuicoes || {};
  const eu = { por: quem(user), login: user.usuario, em: agoraLocalISO() }, id = () => randomBytes(5).toString("hex");
  if (campos.acao === "novoEscritorio") {
    const nome = String(campos.nome || "").trim().slice(0, 80);
    if (!nome) return { ...volta, erro: "Informe o nome do escritório." };
    if (escs.some(e => e.nome.toLowerCase() === nome.toLowerCase())) return { ...volta, erro: `Já existe o escritório ${nome}.` };
    escs.push({ id: id(), nome, criado: eu });
    registrar(d, user, "projetistas", `cadastrou o escritório ${nome}`); gravar(d); return { ...volta, ok: `Escritório ${nome} incluído. Agora inclua as pessoas dele.` };
  }
  if (campos.acao === "novaPessoa") {
    const nome = String(campos.nome || "").trim().slice(0, 60), lg = String(campos.login || "").trim().toLowerCase().slice(0, 40), e = escs.find(x => x.id === campos.escritorio && !x.removido) || null;
    if (!nome) return { ...volta, erro: "Informe o nome da pessoa." };
    if (campos.escritorio && !e) return { ...volta, erro: "Escritório não encontrado." };
    if (cad.some(p => (p.escritorio || "") === (e ? e.id : "") && p.nome.toLowerCase() === nome.toLowerCase())) return { ...volta, erro: `${nome} já está ${e ? "em " + e.nome : "entre os autônomos"}.` };
    if (lg && cad.some(p => p.login === lg)) return { ...volta, erro: `O login ${lg} já é de ${cad.find(p => p.login === lg).nome}.` };
    cad.push({ id: id(), nome, login: lg, escritorio: e ? e.id : "", criado: eu });
    registrar(d, user, "projetistas", `cadastrou ${nome}${lg ? " (" + lg + ")" : ""} ${e ? "em " + e.nome : "como autônomo"}`); gravar(d); return { ...volta, ok: `${nome} incluído${e ? " em " + e.nome : ""}.` };
  }
  if (campos.acao === "inativar" || campos.acao === "reativar") {
    const lista = campos.tipo === "escritorio" ? escs : cad, x = lista.find(y => y.id === campos.id); if (!x) return { ...volta, erro: "Não encontrado." };
    const rot = campos.tipo === "escritorio" ? "o escritório " + x.nome : x.nome;
    if (campos.acao === "inativar" && !x.removido) { x.removido = eu; registrar(d, user, "projetistas", `inativou ${rot}`); }
    else if (campos.acao === "reativar" && x.removido) { (x.inativacoes = x.inativacoes || []).push(x.removido); delete x.removido; registrar(d, user, "projetistas", `reativou ${rot}`); }
    else return { ...volta, erro: "Nada para mudar." };
    gravar(d); return { ...volta, ok: `${x.nome} ${campos.acao === "inativar" ? "inativado" : "reativado"}.` };
  }
  if (campos.acao === "atribuir") {
    const o = OBRAS_DOCS.find(x => x.id === campos.obra); if (!o) return { erro: "Obra inválida." };
    const ativas = cad.filter(p => pessoaAtiva(d, p)), nome = pid => (cad.find(p => p.id === pid) || {}).nome || pid, mud = [];
    for (const x of DISCIPLINAS) {
      const k = `${o.id}|${x.id}`, antes = at[k] || [], guardados = antes.filter(pid => !ativas.some(p => p.id === pid));   // quem está inativo continua guardado
      const agora = [...guardados, ...ativas.filter(p => campos[`c_${x.id}_${p.id}`]).map(p => p.id)];
      const mais = agora.filter(pid => !antes.includes(pid)), menos = antes.filter(pid => !agora.includes(pid));
      if (!mais.length && !menos.length) continue;
      if (agora.length) at[k] = agora; else delete at[k];
      mud.push(`${siglaDisc(x.id)}: ${[...mais.map(pid => "+ " + nome(pid)), ...menos.map(pid => "− " + nome(pid))].join(", ")}`);
    }
    if (!mud.length) return { ...volta, ok: "Nada mudou." };
    registrar(d, user, "projetistas", `${o.nome} · ${mud.join(" · ")}`); gravar(d);
    return { ...volta, ok: `${o.nome}: ${mud.length} disciplina${mud.length === 1 ? "" : "s"} atualizada${mud.length === 1 ? "" : "s"}.` };
  }
  return { ...volta, erro: "Nada para mudar." };
}

// ---------- COMPATIBILIZAÇÃO (04/11) ----------
// Por obra: a sobreposição das pranchas das disciplinas (camadas com cor e transparência, alinhadas por 2 pontos), o chat
// GERAL da obra — com todos: engenharia, Diretoria e os projetistas de todas as disciplinas — e os CLASHES (interferências),
// cada um com nº sequencial (C-001), ponto no desenho, a vista de quando foi marcado, tipo, gravidade e disciplinas
// envolvidas. Clash é uma mensagem do chat com a etiqueta "Clash": fica em aberto até ser resolvido, e pode virar tarefa.
// O modelo 3D (IFC) mora em documentos-3d.js (05/11), com as bibliotecas em /assets/.
export const COR_DISC = { ARQ: "#4a4a4a", EST: "#d0312d", ELE: "#e8860c", HID: "#1f6feb", PRE: "#1a8f3a", INT: "#8a3ab9", SPDA: "#8a3ab9" };
export const TIPOS_CLASH = [
  { id: "fisico", txt: "Físico (hard clash)", dica: "dois elementos ocupando o mesmo espaço — ex.: viga × tubulação, pilar × porta" },
  { id: "folga", txt: "Folga (soft clash)", dica: "distância mínima não respeitada — manutenção, isolamento, caimento, pé-direito livre" },
  { id: "informacao", txt: "Divergência de informação", dica: "cotas, níveis, eixos ou dimensões diferentes entre as disciplinas" },
  { id: "previsao", txt: "Falta de previsão", dica: "furo, passagem, shaft, rebaixo ou espera que uma disciplina precisa e a outra não previu" },
  { id: "norma", txt: "Normativo", dica: "conflito com norma — bombeiros, acessibilidade, concessionária" },
];
export const GRAVIDADE = [
  { id: "critica", txt: "Crítica", bg: "#a3361b", fg: "#fff" }, { id: "alta", txt: "Alta", bg: "#f3b7a3", fg: "#7a2410" },
  { id: "media", txt: "Média", bg: "#fdf1c2", fg: "#7a5b00" }, { id: "baixa", txt: "Baixa", bg: "#e6eef8", fg: "#2f5d8a" },
];
const chaveCompat = obra => `${obra}|COMPAT|0`;
const msgsCompat = (d, obra) => (((d.conversas || {})[chaveCompat(obra)] || {}).msgs || []);
// quem entra (05/11): engenharia, Diretoria, projetistas E a equipe da obra — esta só vê as pranchas LIBERADAS. Quem calibra e
// mexe na referência: só quem tem acesso total (engenharia, Diretoria e projetistas).
const podeCompat = (u, obra) => !!u && podeObra(u, obra);
const podeCalibrar = (u, obra) => acessoTotal(u) && podeObra(u, obra);
const codClash = n => "C-" + String(n).padStart(3, "0");
const seloGrav = id => { const g = GRAVIDADE.find(x => x.id === id) || GRAVIDADE[2]; return `<span class="cl-grav" style="background:${g.bg};color:${g.fg}">${g.txt}</span>`; };
/** As pranchas que entram na sobreposição: de cada prancha, a revisão mais nova (PDF). */
function pranchasCompat(d, obra, user = null) {
  const vv = vivos(d), grupos = {}, total = !user || acessoTotal(user);
  vv.filter(a => a.obra === obra && a.origem !== "marcacao").forEach(a => { (grupos[chaveP(a)] = grupos[chaveP(a)] || []).push(a); });
  return Object.values(grupos).map(rs => total ? rs.reduce((m, a) => a.rev > m.rev ? a : m) : rs.find(a => situacao(a, vv) === "liberado")).filter(a => a && ehPDF(a))
    .sort((m, n) => DISCIPLINAS.findIndex(x => x.id === m.disciplina) - DISCIPLINAS.findIndex(x => x.id === n.disciplina) || codigo(m).localeCompare(codigo(n)));
}
const clashesDe = (d, obra) => msgsCompat(d, obra).filter(m => m.clash);

export function paginaCompatEntrada(user) {
  if (!user) return null;
  const d = ler(), obras = obrasDoUsuario(user);
  const cards = obras.map(o => { const ps = pranchasCompat(d, o.id, user), cl = clashesDe(d, o.id), ab = cl.filter(m => !m.resolvido).length, discs = [...new Set(ps.map(a => a.disciplina))], nm = modelosAtuais(d, o.id).length;
    return `<a class="pj-obra${ps.length || nm ? "" : " vazia"}" href="/documentos/compat/${o.id}${!ps.length && nm ? "?v=3d" : ""}"><div class="t"><span class="sg">${siglaObra(o.id)}</span><b>${esc(o.nome)}</b><span class="ir">›</span></div>
      ${ps.length || nm ? `<div class="disc">${discs.map(x => `<span><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${COR_DISC[x]};margin-right:4px"></i>${siglaDisc(x)}</span>`).join("")}${nm ? `<span style="font-weight:800">🧊 ${nm} modelo${nm === 1 ? "" : "s"} 3D</span>` : ""}</div>
        <div class="ch">${cl.length ? `<span style="color:${ab ? "#a3361b" : "#22662a"}">💥 ${ab} clash${ab === 1 ? "" : "es"} em aberto</span><span style="color:var(--mut);font-weight:400">${cl.length} no total</span>` : `<span style="color:var(--mut);font-weight:400">nenhum clash ainda</span>`}</div>`
      : `<div class="vz">Nenhuma prancha em PDF ainda</div>`}</a>`; }).join("");
  const body = `${CSS}${topoProjetos(user, "compat")}
    <div class="pj-quadro"><div class="pj-qt"><b>🧩 Compatibilização</b><span>escolha a obra: sobreponha as disciplinas, marque os clashes e converse com todos os projetistas</span></div>
      <div class="pj-obras">${cards}</div></div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      <b>Compatibilizar</b> é cruzar os projetos das disciplinas para achar, antes da obra, o que não se encaixa. Aqui as pranchas viram <b>camadas</b>:
      o branco do papel some, cada disciplina ganha a sua cor (${DISCIPLINAS.map(x => `<span style="color:${COR_DISC[x.id]};font-weight:800">${siglaDisc(x.id)}</span>`).join(", ")}) e cada camada tem a sua transparência.
      A sobreposição é <b>por pavimento / local</b> (escolha no alto da tela). Para as pranchas caírem <b>exatamente</b> uma sobre a outra, use <b>✋ ajustar</b> em cada camada: arraste a prancha com o mouse até encaixar na base e acerte a <b>escala</b> e o <b>giro</b> nas barras (com ajuste fino de 0,1% e 0,1°; as setas do teclado movem de pouquinho). Dica: dê zoom num canto (eixo, pilar) para acertar o deslocamento e depois no canto oposto para acertar escala e giro. Gravado, o ajuste vale também quando a base muda: ajustou o elétrico e o hidráulico na arquitetura, o hidráulico já cai certo sobre o elétrico.<br>A <b>equipe da obra</b> também participa: vê as pranchas liberadas, conversa e marca clashes (ajustar é da engenharia e dos projetistas).
      Cada interferência vira um <b>clash</b> com número, ponto no desenho e a vista guardada:<br>
      ${TIPOS_CLASH.map(t => `· <b>${t.txt}</b> — ${t.dica}`).join("<br>")}<br>
      A <b>matriz</b> mostra quantos clashes há entre cada par de disciplinas — os pares que mais costumam bater são Estrutura × Hidráulica, Estrutura × Elétrica, Arquitetura × Estrutura e Hidráulica × Elétrica.
      <br><b>🧊 Modelo 3D (IFC)</b> — dentro da obra, troque de "📄 Pranchas 2D" para "🧊 Modelo 3D". Cada projetista manda o IFC da sua disciplina (mesmo nome = nova revisão; a anterior fica guardada) e todos abrem juntos, um encaixado no outro.
      Gire com o botão esquerdo, arraste com o direito (ou Shift), a rodinha aproxima no ponto do cursor e o duplo clique centra ali. Dá para escolher o <b>pavimento</b>, fazer um <b>corte</b> horizontal, ver com a cor da disciplina ou as originais,
      <b>📏 medir</b> (distância, horizontal e vertical) e clicar num elemento para ver o que ele é. Modelo que veio com outro ponto base: <b>✋ ajustar</b> (desloca em metros e gira) — o certo é todos os projetistas usarem o mesmo ponto base.
      O <b>💥 clash 3D</b> guarda o ponto e a vista e entra no mesmo chat e na mesma matriz.</div></details>`;
  return shell({ title: "Compatibilização · Projetos", body, user });
}

export function paginaCompat(user, obraId, { ok = "", erro = "", f = "", l = null, v = "" } = {}) {
  const o = OBRAS_DOCS.find(x => x.id === obraId); if (!o || !podeCompat(user, obraId)) return null;
  const d = ler(), hoje = agoraLocalISO().slice(0, 10), eu = login(user), todasPs = pranchasCompat(d, obraId, user), msgs = msgsCompat(d, obraId), clashes = msgs.filter(m => m.clash);
  // PAVIMENTO / LOCAL (05/11): a sobreposição é de um local por vez (as pranchas do Térreo com as do Térreo…). Sem escolha, abre
  // o local com mais pranchas; "todos" junta tudo. O chat e a matriz continuam da obra inteira.
  const locs = [...locaisDe(d).filter(x => todasPs.some(a => a.local === x.sigla)), ...(todasPs.some(a => !a.local) ? [{ sigla: "-", nome: "Sem local" }] : [])];
  const nLoc = sg => todasPs.filter(a => (a.local || "-") === sg).length;
  const loc = l === "todos" ? "todos" : locs.some(x => x.sigla === l) ? l : (locs.slice().sort((x, y) => nLoc(y.sigla) - nLoc(x.sigla))[0] || {}).sigla || "todos";
  const ps = loc === "todos" ? todasPs : todasPs.filter(a => (a.local || "-") === loc), noLocal = k => loc === "todos" || (k.local || "-") === loc;
  const base = `/documentos/compat/${obraId}`, calibra = podeCalibrar(user, obraId);
  // 🧊 MODELO 3D (05/11): a mesma tela, com o 3D no lugar das pranchas; o chat, os clashes e a matriz são os mesmos
  const v3 = v === "3d", nMod = modelosAtuais(d, obraId).length, qL = v3 ? "v=3d" : `l=${encodeURIComponent(loc)}`;
  // quem está envolvido: a equipe e TODOS os projetistas da obra (todas as disciplinas)
  const projs = []; DISCIPLINAS.forEach(x => projetistasDe(d, obraId, x.id).forEach(p => { if (!projs.some(q => q.nome === p.nome && q.esc === p.esc)) projs.push(p); }));
  const nAb = clashes.filter(m => !m.resolvido).length, nTar = msgs.filter(tarefaAberta).length;
  let lista = [...msgs].sort((m, n) => String(m.em).localeCompare(String(n.em)));
  if (f === "abertos") lista = lista.filter(m => m.clash && !m.resolvido); else if (f === "clashes") lista = lista.filter(m => m.clash); else if (f === "tarefas") lista = lista.filter(m => m.tarefa);
  const acaoBt = (m, acao, txt) => `<form method="POST" action="${base}/acao" style="display:inline;margin:0"><input type="hidden" name="msg" value="${m.id}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="f" value="${esc(f)}"><input type="hidden" name="l" value="${v3 ? "" : esc(loc)}"><input type="hidden" name="v" value="${v3 ? "3d" : ""}"><button>${txt}</button></form>`;
  const msg = m => {
    const e = etq(m.etiqueta), k = m.clash, tipo = k && TIPOS_CLASH.find(t => t.id === k.tipo);
    const tar = m.tarefa ? (t => `<div class="ch-tar${t.status === "feita" ? " feita" : t.prazo && t.prazo < hoje ? " venc" : ""}">📋 Tarefa para <b>${esc(t.para)}</b>${t.prazo ? ` · prazo <b>${t.prazo.split("-").reverse().join("/")}</b>` : ""}
        ${t.status === "feita" ? `<span class="ch-res">✓ concluída por ${esc(t.feita.por)} · ${dh(t.feita.em)}</span> ${acaoBt(m, "reabrirTarefa", "reabrir")}` : acaoBt(m, "concluir", "✓ concluir")}</div>`)(m.tarefa) : "";
    const fotos = (m.imagens || []).length ? `<div class="ch-imgs">${m.imagens.map((im, i) => `<figure><img loading="lazy" src="${base}/img/${m.id}/${i}" alt="foto" data-zoom="${base}/img/${m.id}/${i}"><figcaption>foto</figcaption></figure>`).join("")}</div>` : "";
    const card = k ? `<div class="cl-card${m.resolvido ? " ok" : ""}"><b class="n">${codClash(k.n)}</b><b>${esc(k.titulo)}</b> ${seloGrav(k.grav)}
        <div style="margin-top:4px;color:#6a4a3a">${esc(tipo ? tipo.txt : k.tipo)} · ${k.discs.map(x => `<b style="color:${COR_DISC[x]}">${siglaDisc(x)}</b>`).join(" × ")}</div>
        <div style="margin-top:5px">${k.p3 ? (v3 ? `<button type="button" class="ch-ver" data-clash="${m.id}">🧊 ver no 3D</button>` : `<a class="ch-ver" href="${base}?v=3d#m-${m.id}">🧊 ver no 3D</a>`)
          : v3 ? `<a class="ch-ver" href="${base}?l=${encodeURIComponent(k.local || "-")}#m-${m.id}">📍 ver na prancha</a>`
          : noLocal(k) ? `<button type="button" class="ch-ver" data-clash="${m.id}">📍 ver no desenho</button>` : `<a class="ch-ver" href="${base}?l=${encodeURIComponent(k.local || "-")}#m-${m.id}">📍 ver no desenho (${esc(k.local || "sem local")})</a>`}${k.local ? ` <span style="color:var(--mut)">· ${esc(k.local)}</span>` : ""}</div></div>` : "";
    return `<div class="ch-msg${m.login === eu ? " eu" : ""}${e.abre && m.resolvido ? " fechada" : ""}" id="m-${m.id}">
      <div class="ch-cab"><b>${esc(m.por)}</b>${m.perfil ? `<span class="ch-perfil" style="background:${COR_PERFIL[m.perfil] || "#777"}">${esc(m.perfil)}</span>` : ""}<span>${dh(m.em)}</span></div>
      ${m.etiqueta && !k ? seloEtq(m.etiqueta) : ""}${card}${m.texto ? `<div class="ch-txt">${esc(m.texto)}</div>` : ""}${fotos}${tar}
      ${e.abre ? `<div class="ch-acoes">${m.resolvido ? `<span class="ch-res">✅ resolvido por ${esc(m.resolvido.por)} · ${dh(m.resolvido.em)}</span> ${acaoBt(m, "reabrir", "reabrir")}` : acaoBt(m, "resolver", k ? "✅ clash resolvido" : "✅ marcar como resolvida")}</div>` : ""}</div>`;
  };
  // matriz de interferências: clashes entre cada par de disciplinas (em aberto / total)
  const matriz = () => { const ds = DISCIPLINAS.map(x => x.id);
    return `<div style="padding:8px 4px"><table class="mx"><tr><th></th>${ds.map(x => `<th style="color:${COR_DISC[x]}">${siglaDisc(x)}</th>`).join("")}</tr>${ds.map((a, i) => `<tr><th style="color:${COR_DISC[a]}">${siglaDisc(a)}</th>${ds.map((b, j) => {
      if (j < i) return `<td class="z"></td>`; const cs = clashes.filter(m => m.clash.discs.includes(a) && (a === b ? m.clash.discs.length === 1 : m.clash.discs.includes(b))), ab = cs.filter(m => !m.resolvido).length;
      return `<td class="${cs.length ? (ab ? "t" : "r") : "z"}" title="${siglaDisc(a)} × ${siglaDisc(b)}: ${ab} em aberto de ${cs.length}">${cs.length ? `${ab}/${cs.length}` : "·"}</td>`; }).join("")}</tr>`).join("")}</table>
      <div class="dc-dica" style="text-align:center">em aberto / total · a diagonal conta os clashes de uma disciplina só</div></div>`; };
  const pessoas = [...new Set([...RESPONSAVEIS.map(r => r.nome), ...projs.map(p => p.nome), "Equipe da obra", ...msgs.map(m => m.por)])];
  const aba = (x, txt) => `<a class="${f === x ? "on" : ""}" href="${base}?${qL}${x ? "&f=" + x : ""}">${txt}</a>`;
  const docs = ps.map(a => ({ id: a.id, cod: codigo(a), disc: a.disciplina, cor: COR_DISC[a.disciplina] || "#444", chave: chaveP(a), rev: a.rev, url: `/documentos/arquivo/${a.id}` }));
  const cpObra = (d.compat || {})[obraId] || {};
  const alinh = {}; Object.entries(((d.compat || {})[obraId] || {}).alinh || {}).forEach(([k, v]) => { alinh[k] = v.T; });
  const iniciais = [ps.find(a => a.disciplina === "ARQ") || ps[0], ps.find(a => a.disciplina === "EST" && a !== ps[0]) || ps.find(a => a !== (ps.find(b => b.disciplina === "ARQ") || ps[0]))].filter(Boolean).map(a => a.id);
  const body = `${CSS}${CSS_CHAT}${VISOR_CSS}${SOBREPOR_CSS}${v3 ? CSS_3D : ""}<style>@media(min-width:901px){.vw.cp{grid-template-columns:minmax(0,1fr) 10px minmax(360px,40%)}}.vw-div{cursor:default}</style>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px">
      <a class="pg-volta" href="/documentos/compat" style="margin:0"><span class="seta">←</span> Compatibilização</a>
      <b style="font-size:16px">🧩 ${esc(o.nome)}</b>
      <select onchange="location.href='/documentos/compat/'+this.value" style="padding:5px 8px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit">${obrasDoUsuario(user).map(x => `<option value="${x.id}"${x.id === obraId ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select>
      <span class="m3-modo" style="margin:0"><a class="${v3 ? "" : "on"}" href="${base}">📄 Pranchas 2D</a><a class="${v3 ? "on" : ""}" href="${base}?v=3d">🧊 Modelo 3D${nMod ? ` (${nMod})` : ""}</a></span>
      ${v3 ? "" : `<select title="Pavimento / local" onchange="location.href='${base}?l='+encodeURIComponent(this.value)" style="padding:5px 8px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit;font-weight:700">${locs.map(x => `<option value="${esc(x.sigla)}"${x.sigla === loc ? " selected" : ""}>📍 ${esc(x.sigla === "-" ? x.nome : `${x.sigla} — ${x.nome}`)} (${nLoc(x.sigla)})</option>`).join("")}<option value="todos"${loc === "todos" ? " selected" : ""}>📍 Todos os locais (${todasPs.length})</option></select>`}
      ${calibra || v3 ? "" : `<span class="ch-perfil" style="background:#22662a" title="A equipe da obra vê só as pranchas liberadas">Obra · só liberadas</span>`}
      ${v3 ? "" : `<span style="font-size:12.5px;color:var(--mut)">${ps.length} prancha${ps.length === 1 ? "" : "s"} em PDF · ${[...new Set(ps.map(a => a.disciplina))].map(x => `<b style="color:${COR_DISC[x]}">${siglaDisc(x)}</b>`).join(" ")}</span>`}</div>
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:7px 12px;font-size:13px;margin:0 0 8px">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:7px 12px;font-size:13px;margin:0 0 8px">${esc(ok)}</div>` : ""}
    <div class="vw-cel"><button type="button" data-cel="so-pdf">🧩 Desenho</button><button type="button" data-cel="so-chat">💬 Chat${nAb ? ` (${nAb})` : ""}</button></div>
    <div class="vw cp so-chat">
      ${v3 ? secao3d({ d, obra: obraId, user }) : `      <section class="vw-pdf">
        <div class="vw-bar"><button type="button" data-cz="-">－</button><span id="cpPct">—</span><button type="button" data-cz="+">＋</button><button type="button" data-cz="aj">▣ ajustar</button>
          <span style="flex:1"></span><button type="button" id="cpClash" class="mk">💥 Marcar clash</button></div>
        <div class="cp-camadas" id="cpCamadas"></div>
        <div class="vw-banner" id="vwBanner" hidden></div>
        <div class="cp-area" id="cpArea"><div class="cp-msg" id="cpVazio" hidden>Escolha a base em "＋ camada" para começar.</div>
          <div class="cp-palco" id="cpPalco"><div class="cp-mundo" id="cpMundo"></div><div class="cp-pins" id="cpPins"></div></div></div>
      </section>`}
      <div class="vw-div"></div>
      <section class="vw-chat">
        <div class="vw-cab">
          <div class="ch-resumo"><span title="Todos os envolvidos">👥 Engenharia · Diretoria${projs.length ? " · " + porEscritorio(projs).map(g => esc(g.esc ? `${g.esc} (${g.nomes.join(", ")})` : g.nomes.join(", "))).join(" · ") : ` · <b style="color:#a12d2d">nenhum projetista marcado nesta obra</b>`}</span></div>
          <div class="ch-resumo" style="margin-top:3px"><span class="ch-n" style="color:${nAb ? "#a3361b" : "#22662a"}">💥 ${nAb} clash${nAb === 1 ? "" : "es"} em aberto</span><span class="ch-n" style="color:${nTar ? "#8a6d00" : "#22662a"}">📋 ${nTar} tarefa${nTar === 1 ? "" : "s"}</span><span class="ch-n">💬 ${msgs.length}</span></div>
          <div class="ch-abas">${aba("", "Tudo")}${aba("abertos", `Clashes em aberto (${nAb})`)}${aba("clashes", "Todos os clashes")}${aba("tarefas", "Tarefas")}${aba("matriz", "Matriz")}</div>
        </div>
        <div class="ch-lista" id="chLista">${f === "matriz" ? matriz() : lista.map(msg).join("") || `<div style="color:var(--mut);font-size:13px;text-align:center;padding:24px">${f ? "Nada aqui com esse filtro." : "Ninguém escreveu ainda. Sobreponha as disciplinas e marque o primeiro clash, ou faça uma pergunta para todos."}</div>`}</div>
        <form class="ch-novo" id="chNovo" method="POST" action="${base}?${qL}" enctype="multipart/form-data">
          <div class="cl-form" id="clForm"><b>💥 Novo clash</b> <span style="color:var(--mut)">— o ponto já está marcado no desenho</span>
            <div class="lin"><input type="text" name="titulo" maxlength="120" placeholder="O que bate com o quê? Ex.: viga V12 × tubo de esgoto 100" style="flex:1;min-width:200px"></div>
            <div class="lin"><select name="tipo" title="Tipo">${TIPOS_CLASH.map(t => `<option value="${t.id}" title="${esc(t.dica)}">${t.txt}</option>`).join("")}</select>
              <select name="grav" title="Gravidade">${GRAVIDADE.map(g => `<option value="${g.id}"${g.id === "media" ? " selected" : ""}>Gravidade: ${g.txt}</option>`).join("")}</select></div>
            <div class="lin">Disciplinas: ${DISCIPLINAS.map(x => `<label class="dz"><input type="checkbox" name="discs" value="${x.id}"><b style="color:${COR_DISC[x.id]}">${siglaDisc(x.id)}</b></label>`).join("")}</div></div>
          <div class="ch-opc">
            <select name="etiqueta" title="Etiqueta">${ETIQUETAS.map(e => `<option value="${e.id}">${e.ic} ${e.txt}</option>`).join("")}</select>
            <span class="ch-campo" title="Delegar: vira tarefa para essa pessoa">📋<input name="para" list="ch-pessoas" maxlength="60" placeholder="delegar para…"></span>
            <datalist id="ch-pessoas">${pessoas.map(p => `<option value="${esc(p)}">`).join("")}</datalist>
            <span class="ch-campo" title="Prazo da tarefa">📅<input type="date" name="prazo" min="${hoje}"></span>
            <label class="ch-campo ch-foto" title="Anexar foto">📎 <span id="chFotoTxt">foto</span><input type="file" name="foto" multiple accept=".jpg,.jpeg,.png,image/*"></label>
          </div>
          <div class="ch-escreve"><textarea name="texto" maxlength="2000" rows="2" placeholder="Escreva para todos — engenharia, Diretoria e projetistas… (Ctrl+Enter envia)"></textarea>
            <button type="submit" class="dc-bt">Enviar ➤</button></div>
          <div id="chStatus"></div>
        </form>
      </section>
    </div>
    <div class="ch-zoom" id="chZoom"><div class="ch-zbar"><button type="button" data-z="x">✕ fechar</button><a id="chZoomAbrir" target="_blank">tamanho real</a></div><img id="chZoomImg" alt="" style="max-width:96vw;max-height:92vh;position:static;transform:none;margin:4vh auto;display:block"></div>
    <script>document.querySelectorAll('[data-zoom]').forEach(function(x){ x.onclick=function(){ var z=document.getElementById('chZoom'), i=document.getElementById('chZoomImg'); i.src=x.getAttribute('data-zoom'); document.getElementById('chZoomAbrir').href=i.src; z.classList.add('on'); }; });
      document.querySelectorAll('[data-z="x"]').forEach(function(b){ b.onclick=function(){ document.getElementById('chZoom').classList.remove('on'); }; });</script>
    ${v3 ? script3d({ d, obra: obraId, user, base, clashes: clashes.filter(m => m.clash.p3).map(m => ({ id: m.id, n: m.clash.n, p3: m.clash.p3, cam: m.clash.cam || null, ok: !!m.resolvido, titulo: m.clash.titulo, vista3: m.clash.vista3 || null })) }) : sobreporScript({ obra: obraId, base, docs, ordemDisc: DISCIPLINAS.map(x => ({ id: x.id, nome: x.nome })), alinh, podeAlinhar: calibra, iniciais, local: loc === "todos" ? "" : loc,
      ref: cpObra.ref || null, calib: Object.fromEntries(Object.entries(cpObra.calib || {}).map(([k, v]) => [k, { p1: v.p1, p2: v.p2, rev: v.rev, por: v.por, em: v.em }])),
      clashes: clashes.filter(m => !m.clash.p3 && noLocal(m.clash)).map(m => ({ id: m.id, n: m.clash.n, x: m.clash.x, y: m.clash.y, ok: !!m.resolvido, titulo: m.clash.titulo, vista: m.clash.vista })) })}`;
  return shell({ title: `Compatibilização · ${o.nome}`, body, user });
}
/** Lê e confere o clash que veio da tela. */
function lerClash(txt, docsOk, locaisOk = []) {
  let k; try { k = JSON.parse(txt); } catch { throw new Error("clash ilegível"); }
  const num = v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  if (!k || ((!num(k.x) || !num(k.y)) && !(Array.isArray(k.p3) && k.p3.length === 3 && k.p3.every(num)))) throw new Error("O clash precisa de um ponto no desenho.");
  const titulo = String(k.titulo || "").trim().slice(0, 120); if (!titulo) throw new Error("Dê um título ao clash (o que bate com o quê).");
  if (!TIPOS_CLASH.some(t => t.id === k.tipo)) throw new Error("Tipo de clash inválido.");
  if (!GRAVIDADE.some(g => g.id === k.grav)) throw new Error("Gravidade inválida.");
  const discs = (Array.isArray(k.discs) ? k.discs : []).filter(x => DISCIPLINAS.some(y => y.id === x));
  if (!discs.length) throw new Error("Marque as disciplinas envolvidas.");
  if ((k.tipo === "fisico" || k.tipo === "folga") && discs.length < 2) throw new Error("Clash físico ou de folga envolve pelo menos 2 disciplinas.");
  // clash no MODELO 3D (05/11): ponto e câmera em metros, nas coordenadas do projeto, e a vista (modelos, pavimento, corte, cores)
  const tres = p => Array.isArray(p) && p.length === 3 && p.every(num);
  if (tres(k.p3)) {
    const r3 = p => p.map(x => Math.round(x * 1000) / 1000), c = k.cam || {}, v3 = k.vista3 || {};
    return { p3: r3(k.p3), ...(tres(c.p) && tres(c.a) ? { cam: { p: r3(c.p), a: r3(c.a) } } : {}), titulo, tipo: k.tipo, grav: k.grav, discs: [...new Set(discs)],
      vista3: { mods: (Array.isArray(v3.mods) ? v3.mods : []).slice(0, 40).map(m => ({ k: String((m && m.k) || "").slice(0, 120), vis: !!(m && m.vis), op: Math.max(0.05, Math.min(1, +(m && m.op) || 1)) })),
        pav: String(v3.pav || "").slice(0, 60), cor: v3.cor === "orig" ? "orig" : "disc", ...(num(v3.corte) ? { corte: Math.max(0, Math.min(1000, v3.corte)) } : {}) } };
  }
  const v = k.vista || {}, cams = (Array.isArray(v.cams) ? v.cams : []).slice(0, 12).filter(c => c && docsOk.includes(c.id))
    .map(c => ({ id: c.id, op: Math.max(0, Math.min(1, +c.op || 0)), cor: !!c.cor, vis: !!c.vis }));
  const local = locaisOk.includes(String(k.local || "")) ? String(k.local) : "";
  return { x: Math.round(k.x * 10) / 10, y: Math.round(k.y * 10) / 10, titulo, tipo: k.tipo, grav: k.grav, discs: [...new Set(discs)], ...(local ? { local } : {}), vista: { cams, ...(num(v.z) ? { z: v.z } : {}) } };
}
export function postarCompat(user, obraId, campos, arquivos) {
  const o = OBRAS_DOCS.find(x => x.id === obraId); if (!o || !podeCompat(user, obraId)) return { erro: "Obra não encontrada." };
  const d = ler(), texto = String(campos.texto || "").trim().slice(0, 2000);
  let clash = null; try { if (campos.clash) clash = lerClash(campos.clash, pranchasCompat(d, obraId, user).map(a => a.id), locaisDe(d).map(l => l.sigla)); } catch (e) { return { erro: e.message, id: obraId }; }
  const etiqueta = clash ? "clash" : String(campos.etiqueta || "");
  if (!ETIQUETAS.some(e => e.id === etiqueta)) return { erro: "Etiqueta inválida.", id: obraId };
  const fotos = (arquivos || []).filter(f => f.campo === "foto" && f.buffer && f.buffer.length);
  if (fotos.some(f => ![".png", ".jpg", ".jpeg"].includes(f.ext))) return { erro: "No chat vão fotos (JPG ou PNG).", id: obraId };
  if (!texto && !fotos.length && !clash) return { erro: "Escreva alguma coisa, marque um clash ou anexe uma foto.", id: obraId };
  const para = String(campos.para || "").trim().slice(0, 60), prazo = String(campos.prazo || "");
  if (prazo && (!para || !/^\d{4}-\d{2}-\d{2}$/.test(prazo))) return { erro: "Para dar prazo, diga para quem é a tarefa.", id: obraId };
  const imagens = [];
  for (const f of fotos) { let nome; try { nome = salvarArquivo(f, join(DIR_DOCS, "chat")); } catch (e) { return { erro: `${f.nomeOriginal || "foto"}: ${e.message}`, id: obraId }; } imagens.push({ arquivo: nome, ext: f.ext, tamanho: f.buffer.length }); }
  if (clash) clash.n = Math.max(0, ...clashesDe(d, obraId).map(m => m.clash.n)) + 1;
  const m = { id: randomBytes(6).toString("hex"), em: agoraLocalISO(), por: quem(user), login: user.usuario, perfil: perfilCompat(d, user, obraId), texto, etiqueta,
    ...(clash ? { clash } : {}), ...(imagens.length ? { imagens } : {}), ...(para ? { tarefa: { para, prazo, status: "aberta" } } : {}) };
  const cv = ((d.conversas = d.conversas || {})[chaveCompat(obraId)] = d.conversas[chaveCompat(obraId)] || { msgs: [] }); cv.msgs.push(m);
  if (clash) registrar(d, user, obraId, `abriu o clash ${codClash(clash.n)} na compatibilização (${clash.discs.map(siglaDisc).join(" × ")}): ${clash.titulo}`);
  if (para) registrar(d, user, obraId, `delegou na compatibilização para ${para}${prazo ? " (prazo " + prazo.split("-").reverse().join("/") + ")" : ""}`);
  gravar(d);
  return { ok: clash ? `Clash ${codClash(clash.n)} aberto.` : "Mensagem enviada.", id: obraId, msg: m.id };
}
// o perfil na compatibilização: projetista de qualquer disciplina da obra conta como responsável
function perfilCompat(d, u, obra) {
  if (!externo(u)) return perfilDe(d, u, obra, "");
  return DISCIPLINAS.some(x => projetistasDe(d, obra, x.id).some(p => p.login && p.login === login(u))) ? "Projetista responsável" : "Projetista";
}
export function acaoCompat(user, obraId, campos) {
  if (!podeCompat(user, obraId)) return { erro: "Obra não encontrada." };
  const d = ler(), m = msgsCompat(d, obraId).find(x => x.id === campos.msg); if (!m) return { erro: "Mensagem não encontrada.", id: obraId };
  if (!aplicarAcao(m, campos.acao, user)) return { erro: "Nada para mudar.", id: obraId };
  if (m.clash && (campos.acao === "resolver" || campos.acao === "reabrir")) registrar(d, user, obraId, `${campos.acao === "resolver" ? "resolveu" : "reabriu"} o clash ${codClash(m.clash.n)}`);
  gravar(d); return { ok: "Feito.", id: obraId, msg: m.id };
}
export function imagemCompat(user, obraId, msgId, i) {
  if (!podeCompat(user, obraId)) return null;
  const m = msgsCompat(ler(), obraId).find(x => x.id === msgId), im = m && (m.imagens || [])[+i]; if (!im) return null;
  const p = join(DIR_DOCS, "chat", im.arquivo); return existsSync(p) ? { caminho: p, nome: `${siglaObra(obraId)} compatibilizacao ${dh(m.em).slice(0, 10).split("/").join("-")}${im.ext}`, ext: im.ext } : null;
}
/** Grava o alinhamento de uma camada na base (por prancha, vale para as revisões seguintes). O anterior fica guardado. */
export function salvarAlinhamento(user, obraId, campos) {
  if (!podeCompat(user, obraId)) return { erro: "Obra não encontrada." };
  if (!podeCalibrar(user, obraId)) return { erro: "Só a engenharia e os projetistas alinham." };
  const d = ler(), ps = pranchasCompat(d, obraId), b = ps.find(a => a.id === campos.base), c = ps.find(a => a.id === campos.camada);
  if (!b || !c || b === c) return { erro: "Pranchas inválidas." };
  let T; try { T = JSON.parse(campos.T); } catch { return { erro: "Alinhamento ilegível." }; }
  if (!Array.isArray(T) || T.length !== 6 || !T.every(v => typeof v === "number" && Number.isFinite(v))) return { erro: "Alinhamento ilegível." };
  const escala = Math.hypot(T[0], T[1]); if (escala < 0.01 || escala > 100) return { erro: "Alinhamento fora de escala: confira os pontos." };
  const cp = ((d.compat = d.compat || {})[obraId] = d.compat[obraId] || { alinh: {} }), k = `${chaveP(b)}>${chaveP(c)}`;
  if (cp.alinh[k]) (cp.alinhAnteriores = cp.alinhAnteriores || []).push({ chave: k, ...cp.alinh[k] });
  cp.alinh[k] = { T: T.map(v => Math.round(v * 1e6) / 1e6), por: quem(user), login: user.usuario, em: agoraLocalISO() };
  registrar(d, user, obraId, `alinhou ${codigo(c)} na base ${codigo(b)} (compatibilização)`); gravar(d);
  return { ok: "Alinhamento gravado." };
}

// ---------- ESCALA E ORIGEM (05/11): REFERÊNCIA da obra + CALIBRAÇÃO de cada prancha ----------
// Para as pranchas caírem EXATAMENTE uma em cima da outra, todas falam a mesma língua: dois pontos fixos da obra (a
// REFERÊNCIA — ex.: P1 = cruzamento dos eixos A × 1, P2 = cruzamento F × 8) e a distância real entre eles, em metros.
// Cada prancha é CALIBRADA uma vez: clica-se no P1 e no P2 dela. Daí em diante:
//   · ORIGEM: o P1 de todas coincide; ESCALA e GIRO: a reta P1→P2 de todas coincide — qualquer combinação encaixa
//     sozinha, seja qual for a base (não precisa mais alinhar par a par);
//   · com a distância real, a régua (📏 medir) dá metros em qualquer prancha calibrada.
// A calibração é da PRANCHA (vale para as revisões seguintes, com aviso para conferir); a anterior nunca é apagada.
const pontoOk = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6);
export function salvarCalibracao(user, obraId, campos) {
  if (!podeCalibrar(user, obraId)) return { erro: "Só a engenharia e os projetistas calibram." };
  const d = ler(), a = pranchasCompat(d, obraId).find(x => x.id === campos.doc); if (!a) return { erro: "Prancha não encontrada." };
  let p1, p2; try { p1 = JSON.parse(campos.p1); p2 = JSON.parse(campos.p2); } catch { return { erro: "Pontos ilegíveis." }; }
  if (!pontoOk(p1) || !pontoOk(p2)) return { erro: "Pontos ilegíveis." };
  if (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 20) return { erro: "Os dois pontos ficaram muito perto: escolha pontos bem afastados." };
  const cp = ((d.compat = d.compat || {})[obraId] = d.compat[obraId] || { alinh: {} }), k = chaveP(a);
  cp.calib = cp.calib || {};
  if (cp.calib[k]) (cp.calibAnteriores = cp.calibAnteriores || []).push({ chave: k, ...cp.calib[k] });
  const r1 = v => Math.round(v * 100) / 100;
  cp.calib[k] = { p1: p1.map(r1), p2: p2.map(r1), rev: a.rev, doc: a.id, por: quem(user), login: user.usuario, em: agoraLocalISO() };
  registrar(d, user, obraId, `calibrou ${codigo(a)} na referência da obra (compatibilização)`); gravar(d);
  return { ok: "Calibração gravada.", calib: cp.calib[k] };
}
export function salvarReferencia(user, obraId, campos) {
  if (!podeCalibrar(user, obraId)) return { erro: "Só a engenharia e os projetistas mexem na referência." };
  const n1 = String(campos.p1 || "").trim().slice(0, 40), n2 = String(campos.p2 || "").trim().slice(0, 40);
  if (!n1 || !n2) return { erro: "Dê nome aos dois pontos (ex.: eixo A × eixo 1)." };
  const txt = String(campos.dist || "").trim().replace(/\./g, "").replace(",", "."), dist = txt ? Number(txt) : null;
  if (txt && !(dist > 0 && dist < 10000)) return { erro: "Distância real inválida: em metros, ex.: 24,35." };
  const d = ler(), cp = ((d.compat = d.compat || {})[obraId] = d.compat[obraId] || { alinh: {} });
  if (cp.ref) (cp.refAnteriores = cp.refAnteriores || []).push(cp.ref);
  cp.ref = { p1: n1, p2: n2, ...(dist ? { dist: Math.round(dist * 1000) / 1000 } : {}), por: quem(user), login: user.usuario, em: agoraLocalISO() };
  registrar(d, user, obraId, `definiu a referência da compatibilização: ${n1} → ${n2}${dist ? ` (${dist.toLocaleString("pt-BR")} m)` : ""}`); gravar(d);
  return { ok: "Referência gravada.", ref: cp.ref };
}

// ---------- PLOTAGENS (05/11): a tela e as gravações moram em documentos-plotagens.js, que usa estas peças ----------
export const BASE_DOCS = { ler, gravar, situacao, vivos, codigo, chaveP, acessoTotal, externo, podeObra, obrasDoUsuario, topoProjetos, CSS, esc, quem, dh, siglaObra, siglaDisc, registrar, login , podeGerirLocais, podeLiberar, locaisAtivos, tiposAtivos, tiposDe, nomeTipo, nomeResp, limparLocal, kb, selo, revEmAndamento, SELO_ANDAMENTO };
const plotPendentes = u => acessoTotal(u) ? (ler().plotagens || []).filter(p => p.situacao === "pedido" && podeObra(u, p.obra)).length : 0;
