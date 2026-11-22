// medicao-dados.js — MEDIÇÃO, versão nova (03/11/2026): os dados, as contas e tudo o que grava.
//
// A ideia (03/11): a planilha pensava em LINHAS; aqui a obra é um MODELO e a medição é uma VISITA.
//   · Catálogo de serviços ÚNICO do grupo (tipo, serviço, unidade, critério) — medicao/catalogo.json
//   · Empreiteiros ÚNICOS do grupo (um CPF/CNPJ, uma pessoa), cada obra com a sua equipe — medicao/empreiteiros.json
//   · Cada obra — medicao/obra-<id>.json:
//       pavimentos e locais EM ORDEM · modelos de unidade (o "apartamento tipo", aplicado em vários locais)
//       itens = um serviço do catálogo num local, com quantidade · preços da obra COM VIGÊNCIA (nunca sobrescreve)
//       BOLETINS DE MEDIÇÃO (04/11): UM por empreiteiro por mês de competência, juntando tudo o que foi medido
//       para ele no mês (lançado pela grade; serviço dividido vai, com a parte de cada um, para o boletim de cada um).
// Aprovação: do BOLETIM INTEIRO, pelas mesmas pessoas de antes (engenharia → Diretoria, ver medicoes-gravar.js).
//   Devolver = volta "em aberto" com o motivo. Mexeu num boletim enviado ou aprovado = a aprovação cai e ele volta
//   "em aberto", marcado como reaberto; cada aprovação guarda uma VERSÃO, e a tela mostra o que mudou desde a última.
// Boletim: valor BRUTO. Pagamento/retenção é do RH e do financeiro.
// Nada some: remover só marca, e o histórico guarda quem e quando. A versão anterior (medicoes/*.json) só é LIDA.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { lerEstrutura, gravarEstrutura } from "./estrutura.js";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { DIR_SETORES, DIR_ANEXOS, isoLocal, agoraLocalISO } from "../ponte-engenharia.js";
import { salvarArquivo } from "../ponte-engenharia.js";
import { papel, NA_FILA, lerNumero, APROVA_ENGENHARIA } from "./medicoes-gravar.js";
import { obrasDoSetor } from "./projetos.js";
import { detalhar } from "./medicao-detalhes.js";
import { ETAPA_DIRETORIA } from "./medicao-chave.js";
import { MARCA } from "../ponte-engenharia.js";

export { papel, NA_FILA, lerNumero };
export const PASTA = join(DIR_SETORES, "medicao");
export const PASTA_FOTOS = join(DIR_ANEXOS, "medicao");
const ANTIGA = join(DIR_SETORES, "medicoes");
const arqObra = obra => join(PASTA, `obra-${obra}.json`);
const ARQ_CAT = join(PASTA, "catalogo.json"), ARQ_EMP = join(PASTA, "empreiteiros.json");
const OBRA_OK = o => /^[a-z0-9-]{2,40}$/.test(String(o || ""));
const quem = user => (user && (user.nome || user.usuario)) || "?";
const id = p => p + randomBytes(5).toString("hex");
const r2 = v => Math.round(v * 100) / 100;
const txt = t => String(t ?? "").replace(/\s+/g, " ").trim();
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctTxt = v => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
/** Sem acento, maiúsculas, "|" entre as partes — a mesma chave da versão anterior, para nada se repetir. */
export const chave = (...p) => createHash("sha1").update(p.map(x => txt(x).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toUpperCase()).join("|")).digest("hex").slice(0, 10);
export const ESTADOS = { aberto: "em aberto", fila1: "em aprovação", fila2: "aguardando diretoria", ok: "aprovado" };
export const CATEGORIAS_EXTRA = ["Andaime / altura", "Retrabalho", "Serviço não previsto", "Dificuldade de acesso", "Outro"];
// Quem GERE a medição nova (começar/trazer obra, catálogo e preços, habilitar/inativar empreiteiro):
// a engenharia que aprova, a Diretoria e quem está aqui (04/11). A APROVAÇÃO das folhas continua só com
// APROVA_ENGENHARIA (medicoes-gravar.js) → Diretoria.
export const GERE_MEDICAO = [];   // logins extras com poder de gerir (o normal é pelo perfil)
// PERFIS DA MEDIÇÃO (12/11): quando o sistema manda o PERFIL e as OBRAS da pessoa (user.perfil, user.obras), valem eles;
// sem eles, as regras de antes (Diretoria = nivel "master"; os logins das listas GERE_MEDICAO e APROVA_ENGENHARIA). Ver /obras/medicao-acesso.
export const PERFIS_MED = ["Diretoria", "Gerente de Engenharia", "Administrador", "Engenheiro"];
const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export function perfilMedicao(user) {
  if (!user) return "";
  const p = semAc(user.perfilMedicao || user.perfil);   // o perfil próprio da Medição, se o painel mandar separado; senão o perfil geral
  if (user.nivel === "master" || p === "diretoria") return "Diretoria";
  if (p.startsWith("gerente")) return "Gerente de Engenharia";
  if (p.startsWith("administrador")) return "Administrador";
  if (p === "engenheiro" || p === "obra" || p.startsWith("engenheiro")) return "Engenheiro";
  const l = String(user.usuario || "").toLowerCase();                       // sem perfil da Medição: os logins de antes
  if (APROVA_ENGENHARIA.includes(l)) return "Gerente de Engenharia";
  if (GERE_MEDICAO.includes(l)) return "Administrador";
  return "Engenheiro";
}
/** Os campos em que o sistema pode mandar as obras da pessoa (o primeiro que vier vale). */
export const CAMPOS_OBRAS = ["obras", "obrasMedicao", "obrasObra", "obrasObras"];
/** As obras que a pessoa vê na Medição: null = todas (Diretoria, Gerente, Administrador; ou o sistema ainda não manda a lista). */
export function obrasPermitidas(user) {
  if (!user || perfilMedicao(user) !== "Engenheiro") return null;
  for (const k of CAMPOS_OBRAS) { const v = user[k]; if (v == null) continue;
    const lista = (Array.isArray(v) ? v : String(v).split(/[,;|]+/)).map(semAc).filter(Boolean);
    return obrasDoSetor().filter(o => lista.some(x => x === "*" || x === "todas" || x === semAc(o.id) || x === semAc(o.nome) || semAc(o.nome).startsWith(x) || x.startsWith(semAc(o.nome).replace(/ residence$/, "")))).map(o => o.id); }
  return null;
}
export const podeObra = (user, obra) => { const l = obrasPermitidas(user); return !l || l.includes(obra); };
export const podeGerir = user => ["Diretoria", "Gerente de Engenharia", "Administrador"].includes(perfilMedicao(user));
/** Painel do RH (12/11): o RH, o Administrador, o Gerente e a Diretoria — o Engenheiro NÃO. RH = perfil "RH"/"Recursos Humanos" ou o setor "rh". */
export const ehRH = user => !!user && ([user.perfilMedicao, user.perfil].some(x => /^(rh|recursos humanos)/.test(semAc(x))) || [].concat(user.setores || []).some(s => semAc(s) === "rh"));
export const podeRH = user => podeGerir(user) || ehRH(user);
/** Em quais obras a pessoa pode habilitar/tirar empreiteiro: quem gere, em todas; o Engenheiro, só nas dele (se o sistema mandar a lista). */
export const obrasQueHabilita = user => podeGerir(user) ? obrasDoSetor().map(o => o.id) : (obrasPermitidas(user) || []);

// ---------------------------------------------------------------- leitura e gravação
const lerJSON = (p, vazio) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return vazio; } };
function gravarJSON(p, d) {
  if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true });
  const t = p + ".tmp"; writeFileSync(t, JSON.stringify(d, null, 1)); renameSync(t, p);
}
export const lerCatalogo = () => { const C = lerJSON(ARQ_CAT, null) || { servicos: [], historico: [] }; C.servicos ||= []; C.historico ||= []; return C; };
/** NOME PRÓPRIO no padrão (05/11): cada palavra com a 1ª letra maiúscula, menos "da, de, do, das, dos, e"
 *  no meio do nome; siglas de empresa (LTDA, ME, EPP, EIRELI, S/A…) ficam em maiúsculas. Ex.: "JOAO DOMINGOS" →
 *  "Joao Domingos"; "Sergio sallines de Oliveira" → "Sergio Sallines de Oliveira". Acento que falta não é inventado. */
const MINUSC = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);
const SIGLAS = new Set(["LTDA", "ME", "EPP", "EIRELI", "SA", "S/A", "S.A.", "MEI", "CIA", "II", "III", "IV"]);
export function nomeProprio(s) {
  return String(s || "").trim().replace(/\s+/g, " ").split(" ").map((w, i) => {
    if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase();
    const m = w.toLowerCase();
    if (i > 0 && MINUSC.has(m)) return m;
    return m.replace(/(^|[-'’])(\p{L})/gu, (_, a, l) => a + l.toUpperCase());
  }).join(" ");
}
export const lerEmpreiteiros = () => { const E = lerJSON(ARQ_EMP, null) || { lista: [], historico: [] }; E.lista ||= []; E.historico ||= []; habilitacoesAntigas(E); for (const e of E.lista) e.nome = nomeProprio(e.nome); return E; };
/** Cadastro de antes das habilitações (03/11): quem estava na "equipe" de uma obra fica habilitado nela. Grava na próxima mudança. */
function habilitacoesAntigas(E) {
  if (E.lista.every(e => Array.isArray(e.obras))) return;
  const eq = {};
  try { for (const a of readdirSync(PASTA)) if (/^obra-[a-z0-9-]+\.json$/.test(a)) { const O = lerJSON(join(PASTA, a), null); for (const e of (O && O.equipe) || []) (eq[e] ||= []).push(O.obra); } } catch {}
  for (const e of E.lista) if (!Array.isArray(e.obras)) e.obras = eq[e.id] || [];
}
const nota = (user, t) => ({ em: agoraLocalISO().slice(0, 16).replace("T", " "), por: quem(user), txt: t });
function gravarCatalogo(C, user, t) { C.historico.push(nota(user, t)); gravarJSON(ARQ_CAT, C); }
function gravarEmpreiteiros(E, user, t) { E.historico.push(nota(user, t)); gravarJSON(ARQ_EMP, E); }

export function lerObra(obra) {
  if (!OBRA_OK(obra)) return null;
  const O = lerJSON(arqObra(obra), null); if (!O) return null;
  for (const k of ["grupos", "pavimentos", "locais", "modelos", "itens", "precos", "equipe", "folhas", "boletins", "anteriores", "historico", "boletinsExcluidos", "qtdAlteracoes"]) O[k] ||= [];
  O.numeracao ||= {};
  folhasParaBoletins(O);                                     // obra trazida no formato de folhas (03/11): vira boletins
  // a importação da planilha às vezes deu o MESMO código a duas linhas do mesmo boletim (05/11): a 2ª, 3ª… ganham código próprio
  // (código + "-2", "-3"…), do mesmo jeito no boletim e em cada versão aprovada — a ordem é a mesma, então continuam batendo
  const unicos = lista => { const n = {}; for (const li of lista || []) { n[li.id] = (n[li.id] || 0) + 1; if (n[li.id] > 1) li.id = `${li.id}-${n[li.id]}`; } };
  // antes de qualquer ajuste, o código de conferência de cada versão aprovada fica GRAVADO (as antigas calculavam na hora, e
  // um ajuste de código de linha ou de % — ver reescalar — mudaria o código impresso no PDF que o empreiteiro já tem)
  // boletim vazio e nunca aprovado (sobrou de medição desistida, 13/11): não existe
  O.boletins = O.boletins.filter(B => (B.itens || []).length || (B.extras || []).length || (B.versoes || []).length);
  for (const B of O.boletins) for (const V of B.versoes || []) if (!V.codigo) V.codigo = codigoVersao(B, V);
  for (const B of O.boletins) { unicos(B.itens); for (const V of B.versoes || []) unicos(V.itens); }
  comEstrutura(obra, O);
  return O;
}
// ---- ESTRUTURA CENTRAL (22/11): grupos, pavimentos e locais moram no cadastro da obra (estrutura.js), não mais aqui.
// Ao ler, a obra recebe a estrutura central (a 1ª vez, a estrutura que já estava na Medição vai para lá, com os mesmos ids).
// Ao gravar, se a Medição mexeu na estrutura, a mudança vai para o cadastro central; obra NOVA (do zero ou da planilha)
// junta a dela com a que já estava cadastrada. O arquivo da obra continua com uma cópia (serve de reserva).
const CAMPOS_EST = ["grupos", "pavimentos", "locais"];
const fotoEst = O => JSON.stringify(CAMPOS_EST.map(k => O[k] || []));
function comEstrutura(obra, O) {
  let E = lerEstrutura(obra);
  if (!E) { E = gravarEstrutura(obra, { grupos: O.grupos, pavimentos: O.pavimentos, locais: O.locais }, null, "Estrutura trazida da Medição (cadastro central da obra)"); }
  for (const k of CAMPOS_EST) O[k] = JSON.parse(JSON.stringify(E[k] || []));
  Object.defineProperty(O, "_est", { value: fotoEst(O), enumerable: false, writable: true, configurable: true });
}
function sincronizarEstrutura(obra, O, user, t) {
  if (O._est === undefined) {                               // obra que não veio do lerObra: começar do zero, planilha
    const E = lerEstrutura(obra);
    if (E) for (const k of CAMPOS_EST) { const ids = new Set((E[k] || []).map(x => x.id)); O[k] = [...(E[k] || []), ...(O[k] || []).filter(x => !ids.has(x.id))]; }
    if (!E || fotoEst(O) !== fotoEst(E)) gravarEstrutura(obra, O, user, `Medição: ${t}`);
  } else if (fotoEst(O) !== O._est) gravarEstrutura(obra, O, user, `Medição: ${t}`);
  O._est = fotoEst(O);
}
/** Grava a obra e a linha do Histórico — com os DETALHES do que mudou (compara com o que está gravado; ver medicao-detalhes.js).
 *  Se a comparação falhar por qualquer motivo, grava assim mesmo, só sem os detalhes: o histórico nunca impede salvar. */
// RASTREABILIDADE DO HISTÓRICO (13/11): toda linha diz ONDE (pavimento › local · serviço) e QUAL boletim (nº · empreiteiro · mês)
export function ondeItem(O, iid) {
  const it = (O.itens || []).find(i => i.id === iid); if (!it) return "serviço ?";
  const l = (O.locais || []).find(x => x.id === it.local) || {}, pv = (O.pavimentos || []).find(x => x.id === l.pav) || {};
  const c = lerCatalogo().servicos.find(s => s.id === it.cat) || {};
  return `${pv.nome || "?"} › ${l.nome || "?"} · ${c.tipo ? c.tipo + " — " : ""}${c.servico || "?"}`;
}
const bolTxt = B => `boletim nº ${B.numero} · ${(lerEmpreiteiros().lista.find(e => e.id === B.emp) || {}).nome || "?"} · ${mesBRd(B.mes)}`;
const BolTxt = B => bolTxt(B).replace(/^b/, "B");
const alvoTxt = (O, B, alvo) => { if (String(alvo).startsWith("x:")) { const ex = B.extras.find(x => x.id === alvo.slice(2)); return `o extra${ex ? ` de ${brl(ex.valor)} (${ondeItem(O, ex.item)})` : ""}`; }
  return `o item ${ondeItem(O, String(alvo).slice(2).split("|")[0])}`; };
function gravarObra(obra, O, user, t, extraDet = []) {
  const n = nota(user, t);
  try {
    const nomes = { cat: new Map(lerCatalogo().servicos.map(c => [c.id, c])), emp: new Map(lerEmpreiteiros().lista.map(e => [e.id, e.nome])) };
    const det = [...extraDet, ...detalhar(existsSync(arqObra(obra)) ? lerObra(obra) : null, O, nomes)]; if (det.length) n.det = det;
  } catch { if (extraDet.length) n.det = extraDet; }
  sincronizarEstrutura(obra, O, user, t);
  O.historico.push(n); gravarJSON(arqObra(obra), O);
}
const abrir = obra => { const O = lerObra(obra); return O ? { O } : { erro: "Esta obra ainda não começou na medição nova." }; };

/** As obras do quadro: as 10 da engenharia, e se cada uma já tem a versão nova e/ou a anterior. */
export function obrasDaMedicao() {
  return obrasDoSetor().map(o => ({ o, nova: existsSync(arqObra(o.id)), anterior: existsSync(join(ANTIGA, `med-${o.id}.json`)) }));
}

// ---------------------------------------------------------------- começar uma obra
export function comecarDoZero(obra, user) {
  if (!podeGerir(user)) return { erro: "Quem começa a obra na medição nova é a engenharia ou a Diretoria." };
  const o = obrasDoSetor().find(x => x.id === obra); if (!o) return { erro: "Obra não encontrada." };
  if (lerObra(obra)) return { erro: "Esta obra já está na medição nova." };
  gravarObra(obra, { obra, nome: o.nome, criadoEm: agoraLocalISO(), origem: { tipo: "do zero" }, versaoDados: 2, grupos: [], pavimentos: [], locais: [], modelos: [], itens: [], precos: [],
    equipe: [], folhas: [], boletins: [], anteriores: [], numeracao: {}, historico: [] }, user, "Começou a obra na medição nova, do zero");
  return { ok: true };
}

/** Traz a obra da versão anterior (medicoes/med-<obra>.json) — só LÊ o arquivo de lá. Estrutura, itens, preços,
 *  empreiteiros (juntados no cadastro único pelo CPF/CNPJ) e o histórico de medições, agrupado em folhas:
 *  o que veio da planilha vira uma folha por dia (já paga nos boletins da planilha); o que foi lançado no sistema vira
 *  uma folha por lançamento, com o mesmo estado e as mesmas aprovações. */
export function importarDaAnterior(obra, user) {
  if (!podeGerir(user)) return { erro: "Quem traz a obra é a engenharia ou a Diretoria." };
  const o = obrasDoSetor().find(x => x.id === obra); if (!o) return { erro: "Obra não encontrada." };
  if (lerObra(obra)) return { erro: "Esta obra já está na medição nova." };
  const M = lerJSON(join(ANTIGA, `med-${obra}.json`), null); if (!M) return { erro: "Esta obra não tem medições na versão anterior." };
  return montarObra(obra, o, M, user, { tipo: "versão anterior", arquivo: `medicoes/med-${obra}.json`, rotulo: "versão anterior", texto: "Trouxe da versão anterior" });
}
/** IMPORTAR DA PLANILHA (10/11): a planilha .xlsm da obra (já lida por medicao-planilha.js, no formato da versão anterior)
 *  monta a obra pelo MESMO caminho da versão anterior. Só para obra ainda não começada (para refazer: "Recomeçar a obra"). */
export function importarDaPlanilha(obra, M, user, arquivo) {
  if (!podeGerir(user)) return { erro: "Quem importa a obra é o Gerente de Engenharia, o Administrador ou a Diretoria." };
  const o = obrasDoSetor().find(x => x.id === obra); if (!o) return { erro: "Obra não encontrada." };
  if (lerObra(obra)) return { erro: "Esta obra já está na medição nova. Para importar de novo, use “Recomeçar a obra” antes." };
  M.fonte = { ...(M.fonte || {}), arquivo, importadoEm: agoraLocalISO() };
  return montarObra(obra, o, M, user, { tipo: "planilha", arquivo, rotulo: `planilha ${arquivo}`, texto: `Importou da planilha ${arquivo}` });
}
/** RECOMEÇAR A OBRA (10/11): a obra volta a "não começada" na medição nova. NADA SE APAGA: o arquivo dela é guardado com
 *  outro nome (obra-<id>.guardada-<data e hora>.json, na mesma pasta) e o recomeço fica anotado em medicao/recomecos.json. Cadastro de
 *  empreiteiros e catálogo (que são do grupo) não mudam. Pede o nome da obra escrito, para não ser sem querer. */
export function recomecarObra(obra, nomeDigitado, user) {
  if (!podeGerir(user)) return { erro: "Quem recomeça a obra é o Gerente de Engenharia, o Administrador ou a Diretoria." };
  const o = obrasDoSetor().find(x => x.id === obra); if (!o) return { erro: "Obra não encontrada." };
  const O = lerObra(obra); if (!O) return { erro: "Esta obra ainda não começou na medição nova." };
  const k = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (k(nomeDigitado) !== k(o.nome)) return { erro: `Para confirmar, escreva o nome da obra exatamente: ${o.nome}` };
  const quando = agoraLocalISO().slice(0, 16).replace(/[:T]/g, "-"), guardado = `obra-${obra}.guardada-${quando}.json`;
  renameSync(arqObra(obra), join(PASTA, guardado));          // o arquivo da obra, intacto, com outro nome
  const L = lerJSON(join(PASTA, "recomecos.json"), { lista: [] });
  L.lista.push({ obra, nome: o.nome, em: agoraLocalISO(), por: quem(user), arquivo: guardado, boletins: O.boletins.length, itens: O.itens.length });
  gravarJSON(join(PASTA, "recomecos.json"), L);
  return { ok: true, guardado };
}
/** A planilha enviada fica guardada (medicao/importar/<obra>-<código>.xlsm) entre a CONFERÊNCIA e a confirmação — e
 *  continua lá depois, como registro do que foi importado. */
export function guardarPlanilha(obra, buf, nome) {
  if (!OBRA_OK(obra)) return null;
  const dir = join(PASTA, "importar"); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const cod = randomBytes(6).toString("hex");
  writeFileSync(join(dir, `${obra}-${cod}.xlsm`), buf);
  writeFileSync(join(dir, `${obra}-${cod}.json`), JSON.stringify({ nome: String(nome || "planilha.xlsm").slice(0, 160), em: agoraLocalISO() }));
  return cod;
}
export function lerPlanilhaGuardada(obra, cod) {
  if (!OBRA_OK(obra) || !/^[0-9a-f]{12}$/.test(String(cod || ""))) return null;
  const dir = join(PASTA, "importar");
  try { return { buf: readFileSync(join(dir, `${obra}-${cod}.xlsm`)), ...JSON.parse(readFileSync(join(dir, `${obra}-${cod}.json`), "utf8")) }; } catch { return null; }
}
function montarObra(obra, o, M, user, origem) {
  const em = agoraLocalISO(), C = lerCatalogo(), E = lerEmpreiteiros();
  // catálogo do grupo
  const catDe = {}; let catNovos = 0;
  const garanteCat = (tipo, servico, unidade) => {
    const cid = "cat-" + chave(tipo, servico);
    if (!C.servicos.some(c => c.id === cid)) { C.servicos.push({ id: cid, tipo: txt(tipo), servico: txt(servico), unidade: txt(unidade), criterio: "", criadoPor: quem(user), criadoEm: em }); catNovos++; }
    return cid;
  };
  for (const p of M.precos || []) if (!p.removido) catDe[chave(p.tipo, p.servico)] = garanteCat(p.tipo, p.servico, p.unidade);
  for (const s of M.servicos || []) catDe[chave(s.tipo, s.servico)] ||= garanteCat(s.tipo, s.servico, s.unidade);
  // empreiteiros: um só cadastro, juntado pelo CPF/CNPJ (ou pelo nome, quando não tem documento)
  const nomeK = n => txt(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const empDe = {}; let empNovos = 0;
  for (const e of M.empreiteiros || []) {
    const doc = String(e.doc || "").replace(/\D/g, "");
    let g = E.lista.find(x => (doc && x.doc === doc) || (!doc && nomeK(x.nome) === nomeK(e.nome)) || (doc && !x.doc && nomeK(x.nome) === nomeK(e.nome)));
    if (!g) { g = { id: id("em-"), nome: txt(e.nome), doc, funcao: txt(e.funcao).toUpperCase(), criadoPor: quem(user), criadoEm: em, origem: `${origem.rotulo} · ${o.nome}` }; E.lista.push(g); empNovos++; }
    empDe[e.id] = g.id;
    g.obras ||= []; if (!g.obras.includes(obra)) g.obras.push(obra);      // quem media nesta obra fica habilitado nela
  }
  // estrutura em ordem: a ordem dos pavimentos e locais da planilha
  const O = { obra, nome: o.nome, criadoEm: em, origem: { tipo: origem.tipo, arquivo: origem.arquivo, em, fonte: M.fonte || null },
    pavimentos: [], locais: [], modelos: [], itens: [], precos: [], equipe: [...new Set(Object.values(empDe))], folhas: [], boletins: [], anteriores: [], numeracao: {}, historico: [] };
  const pav = nome => { let p = O.pavimentos.find(x => x.nome === nome); if (!p) O.pavimentos.push(p = { id: "pv-" + chave(nome), nome, ordem: O.pavimentos.length + 1 }); return p; };
  const loc = (pnome, nome) => { const p = pav(pnome); let l = O.locais.find(x => x.pav === p.id && x.nome === nome);
    if (!l) O.locais.push(l = { id: "lc-" + chave(pnome, nome), pav: p.id, nome, ordem: O.locais.filter(x => x.pav === p.id).length + 1 }); return l; };
  for (const p of M.pavimentos || []) { pav(p.nome); for (const l of p.locais || []) loc(p.nome, l); }
  const itemDe = {};
  for (const s of M.servicos || []) {
    if (s.removido) continue;
    const l = loc(s.pavimento, s.local), cat = catDe[chave(s.tipo, s.servico)];
    const it = { id: "it-" + chave(l.id, cat), local: l.id, cat, qtdPrev: s.qtdOrcada || null, qtdReal: s.qtdReal || null, criadoPor: "importação", criadoEm: em };
    O.itens.push(it); itemDe[s.id] = it.id;
  }
  // preços: o vigente hoje na versão anterior vale "desde sempre" na nova
  for (const p of M.precos || []) if (!p.removido) O.precos.push({ cat: catDe[chave(p.tipo, p.servico)], valor: p.valor, desde: "2000-01-01", por: "importação", em });
  // medições → folhas
  const folhaNova = (dados) => ({ id: id("fl-"), numero: 0, partes: [], obs: "", fotos: [], itens: [], extras: [], aprovacoes: [], boletins: {}, ...dados });
  const linhaDe = (ms) => {                                  // várias linhas (uma por empreiteiro) do mesmo serviço → um item com as partes
    const pct = ms.reduce((a, m) => a + (m.pct || 0), 0), valor = ms.reduce((a, m) => a + (m.valor || 0), 0);
    const partes = ms.map(m => ({ e: empDe[m.empreiteiro] || m.empreiteiro, p: pct ? (m.pct || 0) / pct : 1 / ms.length }));
    return { item: itemDe[ms[0].servico] || null, pct, qtd: r2(ms.reduce((a, m) => a + (m.qtd || 0), 0) * 1e4) / 1e4, pu: ms[0].valorUn || 0, valor, partes,
      obs: [...new Set(ms.map(m => txt(m.obs)).filter(Boolean))].join(" · ") };
  };
  const extrasDe = (ms) => {
    const t = ms.filter(m => (m.extra || 0) > 0); if (!t.length) return [];
    const tot = t.reduce((a, m) => a + m.extra, 0);
    return [{ id: id("ex-"), item: itemDe[t[0].servico] || null, categoria: "Outro", descricao: "", motivo: [...new Set(t.map(m => txt(m.motivoExtra)).filter(Boolean))].join(" · ") || "(sem motivo na planilha)",
      valor: r2(tot), partes: t.map(m => ({ e: empDe[m.empreiteiro] || m.empreiteiro, p: m.extra / tot })) }];
  };
  const porChave = (lista, k) => { const g = new Map(); for (const m of lista) { const c = k(m); if (!g.has(c)) g.set(c, []); g.get(c).push(m); } return [...g.values()]; };
  const planilha = (M.medicoes || []).filter(m => m.origem !== "sistema"), sistema = (M.medicoes || []).filter(m => m.origem === "sistema");
  for (const dia of porChave(planilha, m => m.data + "|" + (m.status === "reprovada" ? "rep" : "ok"))) {
    const m0 = dia[0], f = folhaNova({ data: m0.data, status: m0.status === "reprovada" ? "reprovada" : "aprovada", origem: "planilha", lancadoPor: "planilha", lancadoEm: m0.data + "T00:00" });
    for (const g of porChave(dia, m => m.servico)) { f.itens.push(linhaDe(g)); f.extras.push(...extrasDe(g)); }
    if (m0.status === "reprovada") f.reprovacao = { etapa: "planilha", por: "planilha", em: m0.data, motivo: txt(m0.motivoReprovacao) || "(reprovada na planilha)" };
    f.partes = [...new Set(f.itens.flatMap(i => i.partes.map(p => p.e)))].map((e, _, a) => ({ e, p: 1 / a.length }));
    for (const e of f.partes) f.boletins[e.e] = "planilha";      // já pago nos boletins da planilha
    O.folhas.push(f);
  }
  for (const lanc of porChave(sistema, m => m.lancamento)) {
    const m0 = lanc[0], f = folhaNova({ data: m0.data, status: m0.status, origem: "sistema anterior", lancadoPor: m0.lancadoPor, lancadoEm: m0.lancadoEm, obs: txt(m0.obs),
      aprovacoes: m0.aprovacoes || [], itens: [linhaDe(lanc)], extras: extrasDe(lanc) });
    f.partes = f.itens[0].partes.map(p => ({ ...p })); delete f.itens[0].partes;
    if (m0.status === "reprovada") f.reprovacao = m0.reprovacao || { motivo: m0.motivoReprovacao || "" };
    for (const m of lanc) if (m.boletim) f.boletins[empDe[m.empreiteiro]] = "anterior:" + m.boletim;
    O.folhas.push(f);
  }
  O.folhas.sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.lancadoEm).localeCompare(String(b.lancadoEm)));
  O.folhas.forEach((f, i) => { f.numero = i + 1; });
  for (const b of M.boletins || []) {                        // boletins fechados na versão anterior: ficam listados e a numeração continua
    const e = empDe[b.emp] || b.emp;
    O.anteriores.push({ id: b.id, numero: b.numero, emp: e, empNome: b.empNome, mes: b.mes, total: b.total, fechadoPor: b.fechadoPor, fechadoEm: b.fechadoEm });
    O.numeracao[e] = Math.max(O.numeracao[e] || 0, b.numero);
  }
  O.grupos = []; agruparPeloNome(O);                       // Embasamento / Torre / Fachadas pelo nome do pavimento
  folhasParaBoletins(O);                                    // as medições agrupadas acima viram os boletins (empreiteiro × mês)
  if (catNovos) gravarCatalogo(C, user, `Importação de ${o.nome}: ${catNovos} serviço(s) entraram no catálogo do grupo`);
  if (Object.keys(empDe).length) gravarEmpreiteiros(E, user, `Importação de ${o.nome}: ${empNovos} empreiteiro(s) novo(s) no cadastro único; ${Object.keys(empDe).length} habilitado(s) na obra`);
  gravarObra(obra, O, user, `${origem.texto}: ${O.pavimentos.length} pavimentos, ${O.locais.length} locais, ${O.itens.length} itens, ${O.boletins.length} boletins de medição`);
  return { ok: true };
}

/** Obra no formato de FOLHAS (03/11) → BOLETINS (04/11): cada linha de folha, com a parte de cada empreiteiro, vai para o
 *  boletim dele no mês da folha. O que já estava aprovado vira a VERSÃO aprovada do boletim (os valores não mudam); o que
 *  estava na fila deixa o boletim "em aprovação", com essas linhas marcadas como novas. Folha reprovada não entra. Os ids
 *  saem das folhas (sempre os mesmos), então dá para converter na leitura sem gravar. */
function folhasParaBoletins(O) {
  if (O.versaoDados === 2) return;
  O.versaoDados = 2;
  for (const b of O.boletins || []) if (b.numero) O.anteriores.push({ id: b.id, numero: b.numero, emp: b.emp, empNome: b.empNome, mes: b.mes, total: b.total, fechadoPor: b.fechadoPor, fechadoEm: b.fechadoEm, formato: "folhas" });
  O.boletins = [];
  const G = new Map(), aprovada = s => s === "aprovada" || s === "aprovado";
  for (const f of (O.folhas || []).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
    if (f.status === "reprovada") continue;
    const mes = String(f.data).slice(0, 7), ok = aprovada(f.status);
    const g = e => { const k = e + "|" + mes; if (!G.has(k)) G.set(k, { emp: e, mes, itens: [], extras: [], obs: [], fotos: [], origem: f.origem || "sistema", fila: false, ultimaAprov: null }); const x = G.get(k); if (!ok) x.fila = true; if (ok && f.aprovacoes && f.aprovacoes.length) x.ultimaAprov = f.aprovacoes[f.aprovacoes.length - 1]; return x; };
    f.itens.forEach((li, i) => { for (const p of li.partes || f.partes) { if (!(p.p > 0)) continue;
      g(p.e).itens.push({ id: "lc-" + chave(f.id, "i" + i, p.e), item: li.item, pct: li.pct * p.p, qtd: li.qtd * p.p, pu: li.pu, valor: li.valor * p.p, data: f.data, obs: li.obs || "", por: f.lancadoPor, em: f.lancadoEm, _ok: ok }); } });
    f.extras.forEach((ex, i) => { for (const p of ex.partes || f.partes) { if (!(p.p > 0)) continue;
      g(p.e).extras.push({ id: "ex-" + chave(f.id, "x" + i, p.e), local: ex.local || null, item: ex.item || null, categoria: ex.categoria || "Outro", descricao: ex.descricao || "", motivo: ex.motivo || "",
        valor: ex.valor * p.p, data: f.data, por: f.lancadoPor, em: f.lancadoEm, _ok: ok }); } });
    const es = new Set(f.partes.map(p => p.e));
    for (const e of es) { if (f.obs) g(e).obs.push(`${String(f.data).split("-").reverse().join("/")}: ${f.obs}`); for (const ft of f.fotos || []) g(e).fotos.push({ ...ft, data: f.data }); }
  }
  const limpa = l => l.map(({ _ok, ...x }) => x);
  for (const x of [...G.values()].sort((a, b) => a.mes.localeCompare(b.mes))) {
    const numero = (O.numeracao[x.emp] = (O.numeracao[x.emp] || 0) + 1), itOk = x.itens.filter(i => i._ok), exOk = x.extras.filter(i => i._ok);
    const B = { id: "bl-" + chave(x.emp, x.mes), emp: x.emp, mes: x.mes, numero, status: x.fila ? ESTADOS.fila1 : ESTADOS.ok, criadoPor: x.origem, criadoEm: x.mes + "-01T00:00",
      itens: limpa(x.itens), extras: limpa(x.extras), obs: x.obs.join("\n"), fotos: x.fotos, envios: [], aprovacoes: [], devolucoes: [], versoes: [], reaberturas: [], origem: x.origem,
      pagoNaPlanilha: x.origem === "planilha" };
    if (itOk.length || exOk.length) B.versoes.push({ n: 1, em: x.ultimaAprov ? x.ultimaAprov.em : x.mes + "-28T00:00", por: x.ultimaAprov ? x.ultimaAprov.por : x.origem,
      itens: limpa(itOk).map(i => ({ ...i })), extras: limpa(exOk).map(i => ({ ...i })), obs: B.obs });
    O.boletins.push(B);
  }
  O.folhas = [];
}

// ---------------------------------------------------------------- contas (tudo sai daqui; nenhum número é digitado na tela)
const qtdDe = it => it.qtdReal > 0 ? it.qtdReal : (it.qtdPrev || 0);
/** O preço do serviço nesta obra na data (o último com "desde" até a data). */
export function precoNaData(O, cat, data = isoLocal()) {
  const ps = O.precos.filter(p => p.cat === cat && !p.removido && p.desde <= data).sort((a, b) => a.desde.localeCompare(b.desde) || String(a.em).localeCompare(String(b.em)));
  return ps.length ? ps[ps.length - 1].valor : null;
}
/** A última versão APROVADA de um boletim (o que vale como medido), ou null. */
export const versaoAprovada = B => B.versoes && B.versoes.length ? B.versoes[B.versoes.length - 1] : null;
export const somaBoletim = (itens, extras) => ({ normal: itens.reduce((a, i) => a + i.valor, 0), extra: extras.reduce((a, x) => a + x.valor, 0) });
/** Tudo o que as telas precisam de uma obra, calculado uma vez. Medido = as versões APROVADAS dos boletins; o que está
 *  lançado e ainda não aprovado (em aberto, na fila ou reaberto) é "pendente" e conta só na trava de 100%. */
export function calcular(O) {
  const C = lerCatalogo(), E = lerEmpreiteiros();
  const cat = Object.fromEntries(C.servicos.map(c => [c.id, c])), emp = Object.fromEntries(E.lista.map(e => [e.id, e]));
  const pavs = O.pavimentos.filter(p => !p.removido).sort((a, b) => a.ordem - b.ordem);
  const ordemPav = Object.fromEntries(pavs.map((p, i) => [p.id, i]));
  const locais = O.locais.filter(l => !l.removido && ordemPav[l.pav] != null).sort((a, b) => ordemPav[a.pav] - ordemPav[b.pav] || a.ordem - b.ordem);
  const L = Object.fromEntries(locais.map(l => [l.id, { ...l, pavNome: (pavs.find(p => p.id === l.pav) || {}).nome, total: 0, medido: 0, itens: [] }]));
  const hoje = isoLocal();
  const I = {};
  for (const it of O.itens) {
    if (it.removido || !L[it.local]) continue;
    const c = cat[it.cat] || { tipo: "?", servico: "?", unidade: "" }, pu = precoNaData(O, it.cat, hoje), q = qtdDe(it);
    I[it.id] = { ...it, tipo: c.tipo, servico: c.servico, unidade: c.unidade, qtd: q, pu, total: q * (pu || 0), aprov: 0, fila: 0, medido: 0, filaValor: 0, temMedicao: false };
  }
  let medido = 0, extra = 0, filaValor = 0;
  const porMes = {}, porEmp = {};
  for (const B of O.boletins) {
    for (const li of B.itens) { const x = li.item && I[li.item]; if (x) { x.temMedicao = true; x.atual = (x.atual || 0) + li.pct; } }
    const V = versaoAprovada(B);
    if (V) {
      const s = somaBoletim(V.itens, V.extras);
      medido += s.normal; extra += s.extra;
      const m = porMes[B.mes] ||= { normal: 0, extra: 0, boletins: new Set() }; m.normal += s.normal; m.extra += s.extra; m.boletins.add(B.id);
      const pe = porEmp[B.emp] ||= { valor: 0, extra: 0, ultima: "" }; pe.valor += s.normal; pe.extra += s.extra;
      for (const li of V.itens) { const x = li.item && I[li.item]; if (x) { x.aprov += li.pct; x.medido += li.valor; } if (li.data > pe.ultima) pe.ultima = li.data; }
      for (const ex of V.extras) if (ex.data > pe.ultima) pe.ultima = ex.data;
    }
    if (B.status !== ESTADOS.ok) { const s = somaBoletim(B.itens, B.extras), a = V ? somaBoletim(V.itens, V.extras) : { normal: 0, extra: 0 }; filaValor += s.normal + s.extra - a.normal - a.extra; }
  }
  let total = 0;
  for (const x of Object.values(I)) {
    x.fila = Math.max(0, (x.atual || 0) - x.aprov);                 // lançado e ainda não aprovado
    const l = L[x.local]; l.itens.push(x); l.total += x.total; l.medido += x.total * Math.min(1, x.aprov); total += x.total;
  }
  const nFila = O.boletins.filter(B => NA_FILA.includes(B.status)).length, nAbertos = O.boletins.filter(B => B.status === ESTADOS.aberto && (B.itens.length || B.extras.length)).length;
  const grupos = O.grupos.filter(g => !g.removido).sort((a, b) => a.ordem - b.ordem);
  return { O, C, E, cat, emp, pavs, grupos, locais: Object.values(L), L, I, total, medido, extra, filaValor, nFila, nAbertos, porMes, porEmp,
    avanco: total ? Object.values(I).reduce((a, x) => a + x.total * Math.min(1, x.aprov), 0) / total : 0 };
}
/** O que já está lançado de um item em TODOS os boletins (aprovado ou não), de 0 a 1 — a trava de 100%. */
export const acumuladoItem = (O, itemId, menosLanc = "") => O.boletins.reduce((a, B) => a + B.itens.filter(i => i.item === itemId && i.id !== menosLanc).reduce((s, i) => s + i.pct, 0), 0);

// ---------------------------------------------------------------- estrutura: pavimentos, locais, itens, modelos
export function novoPavimento(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const nomes = [].concat(f.nome || []).join("\n").split(/[\n;]/).map(txt).filter(Boolean).map(n => n.slice(0, 80));
  if (!nomes.length) return { erro: "Escreva o nome do pavimento (um por linha para vários)." };
  const vivos = O.pavimentos.filter(p => !p.removido), feitos = [];
  for (const nome of nomes) {
    if (vivos.some(p => chave(p.nome) === chave(nome))) continue;
    const p = { id: "pv-" + chave(nome), nome, ordem: Math.max(0, ...vivos.map(p => p.ordem)) + 1 };
    const morto = O.pavimentos.find(x => x.id === p.id); if (morto) { delete morto.removido; morto.ordem = p.ordem; vivos.push(morto); } else { O.pavimentos.push(p); vivos.push(p); }
    feitos.push(nome);
  }
  if (!feitos.length) return { erro: "Esse(s) pavimento(s) já existe(m)." };
  gravarObra(obra, O, user, `Cadastrou o(s) pavimento(s) ${feitos.join(", ")}`);
  return { ok: true };
}
/** A ordem é a FÍSICA, de baixo para cima (1 = o mais baixo). "sobe" = vai um andar para cima. */
export function moverPavimento(obra, pid, dir, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const ps = O.pavimentos.filter(p => !p.removido).sort((a, b) => a.ordem - b.ordem), i = ps.findIndex(p => p.id === pid), j = i + (dir === "sobe" ? 1 : -1);
  if (i < 0 || j < 0 || j >= ps.length) return { ok: true, igual: true };
  [ps[i], ps[j]] = [ps[j], ps[i]]; ps.forEach((p, k) => { p.ordem = k + 1; });
  gravarObra(obra, O, user, `Mudou a ordem do pavimento ${ps[j].nome}`);
  return { ok: true };
}
export function renomearPavimento(obra, pid, nome, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const p = O.pavimentos.find(x => x.id === pid && !x.removido); nome = txt(nome).slice(0, 80);
  if (!p) return { erro: "Pavimento não encontrado." }; if (nome.length < 2) return { erro: "Escreva o nome." };
  if (O.pavimentos.some(x => x !== p && !x.removido && chave(x.nome) === chave(nome))) return { erro: "Já existe um pavimento com esse nome." };
  const antes = p.nome; p.nome = nome; gravarObra(obra, O, user, `Renomeou o pavimento ${antes} → ${nome}`); return { ok: true };
}

// ---------------------------------------------------------------- grupos de pavimentos (Embasamento, Torre, Fachadas…)
// Os grupos também têm ordem física, de baixo para cima (1 = Embasamento). O mapa mostra o prédio de pé: o último grupo em cima.
const GRUPOS_PADRAO = [["Embasamento", /^(t[ée]rreo|subsolo|garage|g\s*\d|lazer|mezanino|pilotis|embasamento|playground|sobreloja|semi)|\/\s*g\s*\d/i],
  ["Torre", /tipo|telhado|cobertura|reservat|barrilete|casa de m|[áa]tico|duplex|penthouse|heliponto/i], ["Fachadas", /fachada/i]];
/** Põe cada pavimento sem grupo no grupo que o nome sugere (só os que casam; o resto fica sem grupo). Não grava.
 *  "Torre A - G2" → Embasamento; "Torre A - Tipo 03" → Torre A (obra com mais de uma torre); "Fachada Sul - Torre" → Fachadas. */
function agruparPeloNome(O) {
  let n = 0;
  for (const p of O.pavimentos) {
    if (p.removido || p.grupo) continue;
    const m = p.nome.match(/^(torre\s+\S+)\s*[-–]\s*(.*)$/i), resto = m ? m[2] : p.nome;
    const ach = /fachada/i.test(p.nome) ? GRUPOS_PADRAO[2] : GRUPOS_PADRAO.slice(0, 2).find(([, re]) => re.test(resto)); if (!ach) continue;
    const nome = ach[0] === "Torre" && m ? m[1].replace(/^torre/i, "Torre") : ach[0];
    let g = O.grupos.find(x => !x.removido && chave(x.nome) === chave(nome));
    if (!g) O.grupos.push(g = { id: "gr-" + chave(nome), nome, ordem: GRUPOS_PADRAO.findIndex(x => x[0] === ach[0]) + 1 + (nome !== ach[0] ? 0.01 * nome.charCodeAt(nome.length - 1) : 0) });
    p.grupo = g.id; n++;
  }
  O.grupos.filter(g => !g.removido).sort((a, b) => a.ordem - b.ordem).forEach((g, i) => { g.ordem = i + 1; });
  return n;
}
export function agruparAutomatico(obra, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const n = agruparPeloNome(O); if (!n) return { erro: "Nenhum pavimento sem grupo com nome conhecido (Térreo, G1, Tipo, Telhado, Fachada…)." };
  gravarObra(obra, O, user, `Organizou ${n} pavimento(s) em grupos pelo nome`);
  return { ok: true };
}
export function novoGrupo(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const nome = txt(f.nome).slice(0, 60); if (nome.length < 2) return { erro: "Escreva o nome do grupo (ex.: Torre)." };
  if (O.grupos.some(g => !g.removido && chave(g.nome) === chave(nome))) return { erro: "Esse grupo já existe." };
  O.grupos.push({ id: id("gr-"), nome, ordem: Math.max(0, ...O.grupos.filter(g => !g.removido).map(g => g.ordem)) + 1 });
  gravarObra(obra, O, user, `Criou o grupo de pavimentos ${nome}`);
  return { ok: true };
}
export function moverGrupo(obra, gid, dir, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const gs = O.grupos.filter(g => !g.removido).sort((a, b) => a.ordem - b.ordem), i = gs.findIndex(g => g.id === gid), j = i + (dir === "sobe" ? 1 : -1);
  if (i < 0 || j < 0 || j >= gs.length) return { ok: true, igual: true };
  [gs[i], gs[j]] = [gs[j], gs[i]]; gs.forEach((g, k) => { g.ordem = k + 1; });
  gravarObra(obra, O, user, `Mudou a ordem do grupo ${gs[j].nome}`);
  return { ok: true };
}
export function renomearGrupo(obra, gid, nome, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const g = O.grupos.find(x => x.id === gid && !x.removido); nome = txt(nome).slice(0, 60);
  if (!g) return { erro: "Grupo não encontrado." }; if (nome.length < 2) return { erro: "Escreva o nome." };
  if (O.grupos.some(x => x !== g && !x.removido && chave(x.nome) === chave(nome))) return { erro: "Já existe um grupo com esse nome." };
  const antes = g.nome; g.nome = nome; gravarObra(obra, O, user, `Renomeou o grupo ${antes} → ${nome}`); return { ok: true };
}
export function removerGrupo(obra, gid, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const g = O.grupos.find(x => x.id === gid && !x.removido); if (!g) return { erro: "Grupo não encontrado." };
  if (O.pavimentos.some(p => !p.removido && p.grupo === g.id)) return { erro: "O grupo ainda tem pavimentos. Tire-os antes." };
  g.removido = { por: quem(user), em: agoraLocalISO() };
  gravarObra(obra, O, user, `Removeu o grupo ${g.nome} (vazio)`); return { ok: true };
}
/** Põe os pavimentos marcados num grupo (grupo vazio = tira do grupo). */
export function porNoGrupo(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const gid = String(f.grupo || ""), g = gid ? O.grupos.find(x => x.id === gid && !x.removido) : null;
  if (gid && !g) return { erro: "Grupo não encontrado." };
  const pavs = [].concat(f.pav || []).map(p => O.pavimentos.find(x => x.id === p && !x.removido)).filter(Boolean);
  if (!pavs.length) return { erro: "Marque os pavimentos." };
  for (const p of pavs) p.grupo = g ? g.id : null;
  gravarObra(obra, O, user, `${g ? `Pôs no grupo ${g.nome}` : "Tirou do grupo"}: ${pavs.map(p => p.nome).join(", ")}`);
  return { ok: true };
}
/** Locais (um por linha) em um ou vários pavimentos — ex.: "Apto 01…Apto 04" em todos os pavimentos-tipo de uma vez. */
export function novoLocal(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const nomes = [].concat(f.nome || []).join("\n").split(/[\n;]/).map(txt).filter(Boolean).map(n => n.slice(0, 80)), pavs = [].concat(f.pav || []).filter(Boolean);
  if (!nomes.length) return { erro: "Escreva o nome do local (um por linha para vários)." };
  if (!pavs.length) return { erro: "Marque em que pavimento(s) ficam." };
  let n = 0;
  for (const pid of pavs) {
    const p = O.pavimentos.find(x => x.id === pid && !x.removido); if (!p) continue;
    for (const nome of nomes) {
      const lid = "lc-" + chave(p.nome, nome), ja = O.locais.find(x => x.id === lid);
      if (ja && !ja.removido) continue;
      const ordem = Math.max(0, ...O.locais.filter(x => x.pav === pid && !x.removido).map(x => x.ordem)) + 1;
      if (ja) { delete ja.removido; ja.ordem = ordem; } else O.locais.push({ id: lid, pav: pid, nome, ordem });
      n++;
    }
  }
  if (!n) return { erro: "Esses locais já existem nesses pavimentos." };
  gravarObra(obra, O, user, `Cadastrou ${n} local(is): ${nomes.join(", ")} em ${pavs.length} pavimento(s)`);
  return { ok: true };
}
export function moverLocal(obra, lid, dir, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const l0 = O.locais.find(x => x.id === lid); if (!l0) return { erro: "Local não encontrado." };
  const ls = O.locais.filter(l => l.pav === l0.pav && !l.removido).sort((a, b) => a.ordem - b.ordem), i = ls.indexOf(l0), j = i + (dir === "cima" ? -1 : 1);
  if (j < 0 || j >= ls.length) return { ok: true, igual: true };
  [ls[i], ls[j]] = [ls[j], ls[i]]; ls.forEach((l, k) => { l.ordem = k + 1; });
  gravarObra(obra, O, user, `Mudou a ordem do local ${(O.pavimentos.find(p => p.id === l0.pav) || {}).nome || "?"} › ${l0.nome}`);
  return { ok: true };
}
const medido = (O, itemId) => O.boletins.some(B => B.itens.some(i => i.item === itemId) || (B.versoes || []).some(V => V.itens.some(i => i.item === itemId)));
/** Itens (serviço do catálogo + quantidade) em vários locais de uma vez. Já existe ali: só ganha a quantidade real, se vazia. */
export function adicionarItens(obra, f, user, { modelo = null } = {}) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const C = lerCatalogo(), locais = [].concat(f.local || []).filter(Boolean).map(l => O.locais.find(x => x.id === l && !x.removido)).filter(Boolean);
  if (!locais.length) return { erro: "Marque o(s) local(is)." };
  const linhas = [];
  for (let i = 1; i <= 30; i++) {
    const c = f["cat" + i]; if (!c) continue;
    if (!C.servicos.some(x => x.id === c && !x.removido)) return { erro: `Linha ${i}: serviço fora do catálogo.` };
    const qp = lerNumero(f["qp" + i]), qr = lerNumero(f["qr" + i]);
    if ([qp, qr].some(v => v != null && (Number.isNaN(v) || v < 0))) return { erro: `Linha ${i}: quantidade não está certa.` };
    if (!(qp > 0) && !(qr > 0)) return { erro: `Linha ${i}: escreva a quantidade prevista ou a real.` };
    if (linhas.some(l => l.c === c)) return { erro: `Linha ${i}: serviço repetido na lista. Nada foi lançado.` };
    linhas.push({ c, qp, qr });
  }
  if (!linhas.length) return { erro: "Escolha ao menos um serviço." };
  const semPreco = linhas.filter(l => precoNaData(O, l.c) == null);
  if (semPreco.length) return { erro: `Sem preço nesta obra: ${semPreco.map(l => (C.servicos.find(x => x.id === l.c) || {}).servico).join(", ")}. Cadastre o preço antes (aba Preços).` };
  let novos = 0, atual = 0; const em = agoraLocalISO();
  for (const l of locais) for (const { c, qp, qr } of linhas) {
    const iid = "it-" + chave(l.id, c), it = O.itens.find(x => x.id === iid);
    if (it && !it.removido) { if (qr > 0 && !(it.qtdReal > 0)) { it.qtdReal = qr; atual++; } continue; }
    if (it) { Object.assign(it, { qtdPrev: qp || null, qtdReal: qr || null, modelo }); delete it.removido; novos++; continue; }
    O.itens.push({ id: iid, local: l.id, cat: c, qtdPrev: qp || null, qtdReal: qr || null, modelo, criadoPor: quem(user), criadoEm: em }); novos++;
  }
  if (!novos && !atual) return { erro: "Nada mudou: esses serviços já estão nesses locais (com a quantidade real)." };
  gravarObra(obra, O, user, `Acrescentou ${linhas.length} serviço(s) em ${locais.length} local(is): ${novos} novo(s), ${atual} com a quantidade real${modelo ? " (pelo modelo)" : ""}`);
  return { ok: true, novos, atual };
}
/** Quantidade de um item: livre sem medição; com medição, só preencher a real se estiver vazia. */
/** Quanto do serviço já foi medido, em QUANTIDADE (soma dos lançamentos de todos os boletins, em qualquer situação). */
export function qtdMedida(O, iid) {
  const q = qtdDe(O.itens.find(x => x.id === iid) || {});
  return O.boletins.reduce((a, B) => a + B.itens.filter(i => i.item === iid).reduce((s, i) => s + (i.qtd > 0 ? i.qtd : i.pct * q), 0), 0);
}
/** A QUANTIDADE do serviço mudou e ele já tem medição: o que foi medido continua a MESMA quantidade (e o mesmo valor) — o que muda
 *  é a % que isso representa (50 m² de 100 m² = 50%; de 200 m² = 25%). Recalcula a % de todos os lançamentos desse serviço, no
 *  boletim e nas versões aprovadas (o valor e o código de conferência não mudam, então a aprovação continua valendo). */
function reescalar(O, iid, velha, nova) {
  const ajusta = li => { if (li.item !== iid) return; const q = li.qtd > 0 ? li.qtd : li.pct * velha; li.qtd = Math.round(q * 1e4) / 1e4; li.pct = nova ? q / nova : 0; };
  for (const B of O.boletins) { B.itens.forEach(ajusta); for (const V of B.versoes || []) (V.itens || []).forEach(ajusta); }
}
export function salvarQuantidade(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const it = O.itens.find(x => x.id === f.id && !x.removido); if (!it) return { erro: "Item não encontrado." };
  const qp = lerNumero(f.qp), qr = lerNumero(f.qr);
  if ([qp, qr].some(v => v != null && (Number.isNaN(v) || v < 0))) return { erro: "Quantidade não está certa." };
  if (!(qp > 0) && !(qr > 0)) return { erro: "Escreva a quantidade prevista ou a real." };
  const antes = qtdDe(it), temMed = medido(O, it.id), n4 = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  // serviço com medição: só quem gere a medição (Gerente de Engenharia, Administrador, Diretoria) muda a quantidade — a obra não
  if (temMed && !podeGerir(user)) return { erro: "Este serviço já tem medição: só o Gerente de Engenharia, o Administrador ou a Diretoria muda a quantidade." };
  const nova = qr > 0 ? qr : qp, jaMedido = temMed ? qtdMedida(O, it.id) : 0;
  if (temMed && nova + 1e-9 < jaMedido) return { erro: `Já foram medidos ${n4(jaMedido)} deste serviço: a quantidade não pode ficar menor que isso.` };
  it.qtdPrev = qp || null; it.qtdReal = qr || null;
  it.ajustado = true;                                        // mexido à mão: o modelo não muda mais este item
  if (qtdDe(it) !== antes && temMed) reescalar(O, it.id, antes, qtdDe(it));
  gravarObra(obra, O, user, qtdDe(it) === antes ? `Quantidade prevista/real de ${ondeItem(O, it.id)} (a que vale não mudou)`
    : `Quantidade de ${ondeItem(O, it.id)}: ${n4(antes)} → ${n4(qtdDe(it))}${temMed ? ` — já medido ${n4(jaMedido)} (era ${pctTxt(jaMedido / antes)}, agora ${pctTxt(jaMedido / qtdDe(it))})` : ""}`);
  return { ok: true };
}
// ---------------------------------------------------------------- QUANTIDADE REAL PROPOSTA PELO ENGENHEIRO (13/11)
// A PREVISTA é do escritório (projeto): só quem gere muda (Administrador, Gerente, Diretoria), direto, como sempre.
// A REAL o Engenheiro pode PROPOR — com ou sem medição — e a proposta vai para a aprovação do Gerente ou do Administrador (a Diretoria
// também pode), item a item, num popup da aba Estrutura. Tudo fica em O.qtdAlteracoes (pedido, decisão, quem e quando): é o histórico.
// Aprovada, vale como a correção de quem gere: com medição, a quantidade já medida fica e o % se reescala (reescalar).
/** O serviço tem alteração de quantidade real aguardando aprovação? Enquanto tiver, não se mede (13/11). */
export const qtdPendente = (O, iid) => (O.qtdAlteracoes || []).some(a => a.item === iid && a.status === "pendente");
export function proporQtdReal(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const it = O.itens.find(x => x.id === f.id && !x.removido); if (!it) return { erro: "Serviço não encontrado." };
  const qr = lerNumero(f.qr); if (qr == null || Number.isNaN(qr) || !(qr > 0)) return { erro: "Escreva a nova quantidade real (maior que zero)." };
  const n4 = v => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 }), temMed = medido(O, it.id), jaMedido = temMed ? qtdMedida(O, it.id) : 0;
  if (temMed && qr + 1e-9 < jaMedido) return { erro: `Já foram medidos ${n4(jaMedido)} deste serviço: a quantidade real não pode ficar menor que isso.` };
  if (it.qtdReal > 0 && Math.abs(it.qtdReal - qr) < 1e-9) return { erro: "Essa já é a quantidade real do serviço." };
  const motivo = txt(f.motivo).slice(0, 300), agora = agoraLocalISO();
  // REAL EM BRANCO: o Engenheiro preenche e pronto, sem aprovação (13/11). Só a ALTERAÇÃO de uma real já preenchida vai para aprovação.
  if (!(it.qtdReal > 0)) {
    const antes = qtdDe(it); it.qtdReal = qr; it.ajustado = true;
    if (temMed && qtdDe(it) !== antes) reescalar(O, it.id, antes, qtdDe(it));
    for (const a of O.qtdAlteracoes) if (a.item === it.id && a.status === "pendente") Object.assign(a, { status: "substituída", decididoPor: quem(user), decididoEm: agora });
    O.qtdAlteracoes.push({ id: id("qa-"), item: it.id, qpAtual: it.qtdPrev || null, qrAntes: null, qrNova: qr, motivo, por: quem(user), em: agora, status: "preenchida", decididoPor: quem(user), decididoEm: agora });
    gravarObra(obra, O, user, `Preencheu a quantidade real de ${ondeItem(O, it.id)}: ${n4(qr)}${temMed ? ` — já medido ${n4(jaMedido)} (era ${pctTxt(jaMedido / antes)}, agora ${pctTxt(jaMedido / qr)})` : ""}`);
    return { ok: true, direto: true };
  }
  if (motivo.length < 5) return { erro: "Escreva o motivo da alteração da quantidade real (ex.: medida conferida na obra)." };   // obrigatório na alteração (13/11)
  for (const a of O.qtdAlteracoes) if (a.item === it.id && a.status === "pendente") Object.assign(a, { status: "substituída", decididoPor: quem(user), decididoEm: agora });
  O.qtdAlteracoes.push({ id: id("qa-"), item: it.id, qpAtual: it.qtdPrev || null, qrAntes: it.qtdReal || null, qrNova: qr, motivo, por: quem(user), porU: (user && user.usuario) || "", em: agora, status: "pendente" });
  gravarObra(obra, O, user, `Propôs a quantidade real de ${ondeItem(O, it.id)}: ${it.qtdReal > 0 ? n4(it.qtdReal) : "(sem real)"} → ${n4(qr)} — aguarda aprovação — motivo: ${motivo}`);
  return { ok: true };
}
/** O que muda se a proposta for aprovada (para o popup): medido, % antes e depois, valor do serviço, boletins com o serviço. */
export function impactoQtd(O, R, a) {
  const it = O.itens.find(x => x.id === a.item), x = R.I[a.item] || {}; if (!it) return { sumiu: true };
  const atual = qtdDe(it), temMed = medido(O, it.id), med = temMed ? qtdMedida(O, it.id) : 0, pu = x.pu || 0;
  const nova = a.qrNova, bol = O.boletins.filter(B => B.itens.some(i => i.item === it.id)).length;
  return { atual, temMed, med, pctAntes: atual ? med / atual : 0, pctDepois: nova ? med / nova : 0, valorAntes: atual * pu, valorDepois: nova * pu,
    valorMedido: R.I[a.item] ? x.total * Math.min(1, x.aprov + x.fila) : 0, boletins: bol, invalido: temMed && nova + 1e-9 < med, mudouDesde: (it.qtdReal || null) !== a.qrAntes };
}
export function decidirQtd(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  if (!podeGerir(user)) return { erro: "Quem aprova alteração de quantidade é o Gerente de Engenharia ou o Administrador (ou a Diretoria)." };
  const a = O.qtdAlteracoes.find(x => x.id === f.id); if (!a) return { erro: "Alteração não encontrada." };
  if (a.status !== "pendente") return { erro: `Esta alteração já foi ${a.status}.` };
  const it = O.itens.find(x => x.id === a.item && !x.removido); const agora = agoraLocalISO(), n4 = v => (+v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  if (String(f.decisao) === "recusar" || !it) {
    Object.assign(a, { status: "recusada", decididoPor: quem(user), decididoEm: agora, motivoDecisao: it ? txt(f.motivo).slice(0, 300) : "o serviço saiu da estrutura" });
    gravarObra(obra, O, user, `Recusou a quantidade real de ${ondeItem(O, a.item)} proposta por ${a.por} (${n4(a.qrAntes)} → ${n4(a.qrNova)})${a.motivoDecisao ? " — " + a.motivoDecisao : ""}`);
    return { ok: true };
  }
  const antes = qtdDe(it), temMed = medido(O, it.id), jaMedido = temMed ? qtdMedida(O, it.id) : 0;
  if (temMed && a.qrNova + 1e-9 < jaMedido) return { erro: `Já foram medidos ${n4(jaMedido)} deste serviço: a quantidade real proposta (${n4(a.qrNova)}) é menor. Recuse a alteração.` };
  a.realAntesDaAprovacao = it.qtdReal || null;
  it.qtdReal = a.qrNova; it.ajustado = true;
  if (qtdDe(it) !== antes && temMed) reescalar(O, it.id, antes, qtdDe(it));
  Object.assign(a, { status: "aprovada", decididoPor: quem(user), decididoEm: agora, valiaAntes: antes, medidoNaAprovacao: jaMedido });
  gravarObra(obra, O, user, `Aprovou a quantidade real de ${ondeItem(O, a.item)} proposta por ${a.por}: ${n4(antes)} → ${n4(a.qrNova)}${temMed ? ` — já medido ${n4(jaMedido)} (era ${pctTxt(jaMedido / antes)}, agora ${pctTxt(jaMedido / a.qrNova)})` : ""}`);
  return { ok: true };
}
// ---------------------------------------------------------------- EDIÇÃO DE QUANTIDADES EM MASSA (13/11)
// A tabela da aba Estrutura manda as linhas mexidas: [{ id, qp?, qr? }] (só o que mudou). Mesmas regras de uma a uma:
// quem gere muda prevista e real direto; o Engenheiro só a real — em branco vale na hora, já preenchida vai para aprovação (motivo
// obrigatório, um para o lote). Confere TUDO antes; se uma linha não puder, nada é gravado. Uma linha no histórico, com o detalhe de cada serviço.
export function quantidadesEmMassa(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  let L; try { L = JSON.parse(String(f.linhas || "[]")); } catch { return { erro: "As alterações não chegaram direito. Tente de novo." }; }
  if (!Array.isArray(L) || !L.length) return { erro: "Nenhuma quantidade foi alterada." };
  if (L.length > 5000) return { erro: "Alterações demais de uma vez (máximo 5.000)." };
  const ger = podeGerir(user), motivo = txt(f.motivo).slice(0, 300), agora = agoraLocalISO(), n4 = v => (+v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const num = v => { if (v == null || String(v).trim() === "") return null; const n = lerNumero(v); return n == null || Number.isNaN(n) ? NaN : n; };
  const plano = [];
  for (const l of L) {
    const it = O.itens.find(x => x.id === l.id && !x.removido); if (!it) return { erro: "Um dos serviços não existe mais na estrutura. Abra a tabela de novo." };
    const qp = num(l.qp), qr = num(l.qr), onde = ondeItem(O, it.id);
    if ([qp, qr].some(v => v != null && (Number.isNaN(v) || v <= 0))) return { erro: `${onde}: quantidade não está certa (tem de ser maior que zero).` };
    if (qp != null && !ger) return { erro: `${onde}: a quantidade prevista é do escritório — só o Administrador, o Gerente ou a Diretoria mudam.` };
    const mudaP = qp != null && Math.abs(qp - (it.qtdPrev || 0)) > 1e-9, mudaR = qr != null && Math.abs(qr - (it.qtdReal || 0)) > 1e-9;
    if (!mudaP && !mudaR) continue;
    const temMed = medido(O, it.id), med = temMed ? qtdMedida(O, it.id) : 0;
    const efetiva = (mudaR ? qr : it.qtdReal > 0 ? it.qtdReal : 0) || (mudaP ? qp : it.qtdPrev || 0);
    if (temMed && efetiva + 1e-9 < med) return { erro: `${onde}: já foram medidos ${n4(med)} — a quantidade não pode ficar menor que isso.` };
    const aprova = !ger && mudaR && it.qtdReal > 0;
    plano.push({ it, qp: mudaP ? qp : null, qr: mudaR ? qr : null, temMed, med, onde, aprova });
  }
  if (!plano.length) return { erro: "Nenhuma quantidade foi alterada." };
  if (plano.some(x => x.aprova) && motivo.length < 5) return { erro: "Escreva o motivo das alterações da quantidade real (vão para aprovação)." };
  const det = []; let direto = 0, aprov = 0;
  for (const x of plano) {
    const { it } = x, antes = qtdDe(it), pA = it.qtdPrev || null, rA = it.qtdReal || null;
    if (x.aprova) {
      for (const a of O.qtdAlteracoes) if (a.item === it.id && a.status === "pendente") Object.assign(a, { status: "substituída", decididoPor: quem(user), decididoEm: agora });
      O.qtdAlteracoes.push({ id: id("qa-"), item: it.id, qpAtual: pA, qrAntes: rA, qrNova: x.qr, motivo, por: quem(user), porU: (user && user.usuario) || "", em: agora, status: "pendente", lote: true });
      det.push(`${x.onde} — real ${n4(rA)} → ${n4(x.qr)}: aguarda aprovação`); aprov++; continue;
    }
    if (x.qp != null) it.qtdPrev = x.qp;
    if (x.qr != null) it.qtdReal = x.qr;
    it.ajustado = true;
    if (x.temMed && qtdDe(it) !== antes) reescalar(O, it.id, antes, qtdDe(it));
    if (x.qr != null) {
      for (const a of O.qtdAlteracoes) if (a.item === it.id && a.status === "pendente") Object.assign(a, { status: "substituída", decididoPor: quem(user), decididoEm: agora });
      if (!ger) O.qtdAlteracoes.push({ id: id("qa-"), item: it.id, qpAtual: pA, qrAntes: null, qrNova: x.qr, motivo, por: quem(user), em: agora, status: "preenchida", decididoPor: quem(user), decididoEm: agora, lote: true });
    }
    det.push(`${x.onde} — ${[x.qp != null && `prevista ${n4(pA)} → ${n4(x.qp)}`, x.qr != null && `real ${n4(rA)} → ${n4(x.qr)}`].filter(Boolean).join("; ")}${x.temMed && qtdDe(it) !== antes ? ` (já medido ${n4(x.med)}: ${pctTxt(x.med / antes)} → ${pctTxt(x.med / qtdDe(it))})` : ""}`);
    direto++;
  }
  gravarObra(obra, O, user, `Edição de quantidades em massa: ${plano.length} serviço(s) — ${direto} gravado(s)${aprov ? `, ${aprov} enviado(s) para aprovação` : ""}${motivo ? " — motivo: " + motivo : ""}`, det);
  return { ok: true, direto, aprov };
}
/** As decisões (aprovada/recusada) das propostas desta pessoa que ela ainda não viu — o aviso do sino (13/11). */
export const ehMinha = (a, user) => !!user && (a.porU ? a.porU === user.usuario : a.por === quem(user));
export const decisoesNaoVistas = (O, user) => (O.qtdAlteracoes || []).filter(a => (a.status === "aprovada" || a.status === "recusada") && ehMinha(a, user) && !a.visto);
/** "Ok, vi": marca as decisões da pessoa como vistas (some do sino). */
export function marcarDecisoesVistas(obra, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const ds = decisoesNaoVistas(O, user); if (!ds.length) return { ok: true, igual: true };
  const em = agoraLocalISO(); for (const a of ds) a.visto = { em, por: quem(user) };
  gravarJSON(arqObra(obra), O);   // só a marca de "visto": não vai para o histórico da obra
  return { ok: true };
}
export function removerItem(obra, iid, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const it = O.itens.find(x => x.id === iid && !x.removido); if (!it) return { erro: "Item não encontrado." };
  if (medido(O, it.id)) return { erro: "Este serviço já tem medição — não dá para remover." };
  it.removido = { por: quem(user), em: agoraLocalISO() };
  gravarObra(obra, O, user, `Removeu o serviço ${ondeItem(O, it.id)}`);
  return { ok: true };
}
/** Modelo de unidade: a lista de serviços e quantidades de um local que se repete (o "apartamento tipo"). */
export function criarModelo(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const nome = txt(f.nome).slice(0, 80); if (nome.length < 2) return { erro: "Dê um nome ao modelo (ex.: Apartamento tipo A)." };
  if (O.modelos.some(m => !m.removido && chave(m.nome) === chave(nome))) return { erro: "Já existe um modelo com esse nome." };
  const base = O.locais.find(l => l.id === f.base && !l.removido);
  const itens = base ? O.itens.filter(i => i.local === base.id && !i.removido).map(i => ({ cat: i.cat, qtd: qtdDe(i) })) : [];
  O.modelos.push({ id: id("md-"), nome, itens, criadoPor: quem(user), criadoEm: agoraLocalISO(), base: base ? base.id : null });
  gravarObra(obra, O, user, `Criou o modelo ${nome}${base ? ` a partir de um local (${itens.length} serviço(s))` : ""}`);
  return { ok: true };
}
/** Serviços do modelo (até 30 linhas). Mudou a quantidade? Muda em todos os locais do modelo que ainda não têm medição
 *  e não foram ajustados à mão. */
export function salvarModelo(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const m = O.modelos.find(x => x.id === f.id && !x.removido); if (!m) return { erro: "Modelo não encontrado." };
  const C = lerCatalogo(), itens = [];
  for (let i = 1; i <= 30; i++) {
    const c = f["cat" + i]; if (!c) continue;
    if (!C.servicos.some(x => x.id === c)) return { erro: `Linha ${i}: serviço fora do catálogo.` };
    const q = lerNumero(f["q" + i]); if (q == null || Number.isNaN(q) || q <= 0) return { erro: `Linha ${i}: escreva a quantidade.` };
    if (itens.some(x => x.cat === c)) return { erro: `Linha ${i}: serviço repetido no modelo.` };
    itens.push({ cat: c, qtd: q });
  }
  m.itens = itens;
  let mudou = 0;
  for (const it of O.itens) if (it.modelo === m.id && !it.removido && !it.ajustado && !medido(O, it.id)) {
    const n = itens.find(x => x.cat === it.cat); if (n && n.qtd !== it.qtdPrev) { it.qtdPrev = n.qtd; it.qtdReal = null; mudou++; }
  }
  gravarObra(obra, O, user, `Salvou o modelo ${m.nome} (${itens.length} serviço(s)); ${mudou} item(ns) nos locais acompanharam`);
  return { ok: true, mudou };
}
export function aplicarModelo(obra, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const m = O.modelos.find(x => x.id === f.id && !x.removido); if (!m) return { erro: "Modelo não encontrado." };
  if (!m.itens.length) return { erro: "O modelo está vazio." };
  const linhas = {}; m.itens.forEach((x, i) => { linhas["cat" + (i + 1)] = x.cat; linhas["qp" + (i + 1)] = String(x.qtd).replace(".", ","); });
  const r = adicionarItens(obra, { ...linhas, local: f.local }, user, { modelo: m.id });
  if (r.erro) return r;
  const O2 = lerObra(obra), locais = [].concat(f.local || []);
  for (const l of O2.locais) if (locais.includes(l.id)) l.modelo = m.id;
  gravarObra(obra, O2, user, `Aplicou o modelo ${m.nome} em ${locais.length} local(is)`);
  return r;
}

// ---------------------------------------------------------------- catálogo e preços
export function novoServicoCatalogo(f, user) {
  if (!podeGerir(user)) return { erro: "Quem mexe no catálogo é a engenharia ou a Diretoria." };
  const tipo = txt(f.tipo).slice(0, 60), servico = txt(f.servico).slice(0, 100), unidade = txt(f.unidade).slice(0, 10), criterio = txt(f.criterio).slice(0, 300);
  if (tipo.length < 2 || servico.length < 2) return { erro: "Escreva o tipo e o serviço." };
  if (!unidade) return { erro: "Escreva a unidade (m2, m, un, vb…)." };
  const C = lerCatalogo(), cid = "cat-" + chave(tipo, servico);
  if (C.servicos.some(c => c.id === cid && !c.removido)) return { erro: `"${tipo} — ${servico}" já está no catálogo.` };
  C.servicos.push({ id: cid, tipo, servico, unidade, criterio, criadoPor: quem(user), criadoEm: agoraLocalISO() });
  gravarCatalogo(C, user, `Acrescentou ao catálogo: ${tipo} — ${servico} (${unidade})`);
  return { ok: true, id: cid };
}
export function salvarCriterio(f, user) {
  if (!podeGerir(user)) return { erro: "Quem mexe no catálogo é a engenharia ou a Diretoria." };
  const C = lerCatalogo(), c = C.servicos.find(x => x.id === f.id); if (!c) return { erro: "Serviço não encontrado." };
  const novo = txt(f.criterio).slice(0, 300); if (novo === c.criterio) return { ok: true, igual: true };
  (c.historicoCriterio ||= []).push({ antes: c.criterio, por: quem(user), em: agoraLocalISO() }); c.criterio = novo;
  gravarCatalogo(C, user, `Critério de medição de ${c.tipo} — ${c.servico}: ${novo || "(vazio)"}`);
  return { ok: true };
}
/** Corrigir um serviço do CATÁLOGO GERAL (10/11): tipo, nome, unidade e critério. O código do serviço não muda (preços e
 *  medições continuam ligados), e o que era fica guardado em "alteracoes". */
export function editarServicoCatalogo(f, user) {
  if (!podeGerir(user)) return { erro: "Quem mexe no catálogo é o Gerente de Engenharia, o Administrador ou a Diretoria." };
  const C = lerCatalogo(), c = C.servicos.find(x => x.id === f.id && !x.removido); if (!c) return { erro: "Serviço não encontrado." };
  const tipo = txt(f.tipo).slice(0, 60), servico = txt(f.servico).slice(0, 100), unidade = txt(f.unidade).slice(0, 10), criterio = txt(f.criterio).slice(0, 300);
  if (tipo.length < 2 || servico.length < 2) return { erro: "Escreva o tipo e o serviço." };
  if (!unidade) return { erro: "Escreva a unidade (m2, m, un, vb…)." };
  const k = (a, b) => (a + "|" + b).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (C.servicos.some(x => x !== c && !x.removido && k(x.tipo, x.servico) === k(tipo, servico))) return { erro: `"${tipo} — ${servico}" já existe no catálogo.` };
  const antes = { tipo: c.tipo, servico: c.servico, unidade: c.unidade, criterio: c.criterio || "" };
  if (antes.tipo === tipo && antes.servico === servico && antes.unidade === unidade && antes.criterio === criterio) return { ok: true, igual: true };
  (c.alteracoes ||= []).push({ antes, por: quem(user), em: agoraLocalISO() });
  Object.assign(c, { tipo, servico, unidade, criterio });
  gravarCatalogo(C, user, `Corrigiu no catálogo: ${antes.tipo} — ${antes.servico} (${antes.unidade}) → ${tipo} — ${servico} (${unidade})`);
  return { ok: true };
}
/** Preço novo com data de início: o anterior não muda, só deixa de valer a partir dessa data. */
export function novoPreco(obra, f, user) {
  if (!podeGerir(user)) return { erro: "Quem mexe em preço é a engenharia ou a Diretoria." };
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const C = lerCatalogo(), c = C.servicos.find(x => x.id === f.cat && !x.removido); if (!c) return { erro: "Escolha o serviço do catálogo." };
  const v = lerNumero(f.valor); if (v == null || Number.isNaN(v) || v <= 0) return { erro: "Escreva o preço (ex.: 35,00)." };
  const desde = String(f.desde || isoLocal()); if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { erro: "Escolha a data de início." };
  const antes = precoNaData(O, c.id, desde);
  if (antes != null && Math.abs(antes - v) < 0.005) return { ok: true, igual: true };
  O.precos.push({ cat: c.id, valor: r2(v), desde, por: quem(user), em: agoraLocalISO() });
  gravarObra(obra, O, user, `Preço de ${c.tipo} — ${c.servico}: ${antes == null ? "(sem preço)" : brl(antes)} → ${brl(v)} por ${c.unidade}, valendo a partir de ${desde.split("-").reverse().join("/")}`);
  return { ok: true };
}

// ---------------------------------------------------------------- empreiteiros: cadastro ÚNICO do grupo (03/11)
// Cada empreiteiro tem as OBRAS em que está habilitado a ser medido (e.obras) e a situação (ativo, ou e.inativo = {por, em}).
// Inativo ou não habilitado na obra: não aparece na folha de medição daquela obra — mas o histórico dele fica todo lá.
const docOk = d => [11, 14].includes(d.length);
export const ativo = e => !!e && !e.inativo;
/** Pode ser escolhido na folha de medição desta obra? */
export const habilitado = (e, obra) => ativo(e) && (e.obras || []).includes(obra);
/** ESTAVA ATIVO E HABILITADO NA OBRA NAQUELE MÊS? (16/11) A conferência dos meses passados não pode usar o cadastro de HOJE:
 *  quem foi cadastrado agora apareceria "sem medição" em todos os meses antigos. Refaz a linha do tempo pelas alterações (cada uma
 *  guarda o "antes": obras e ativo) desde o cadastro (ou desde o 1º boletim dele, se for antes — cadastros migrados). Conta se, em
 *  algum momento do mês, estava ativo e habilitado na obra. `inicio` = o 1º mês com boletim dele ("AAAA-MM"), se houver. */
export function habilitadoNoMes(e, obra, mes, inicio = "") {
  const ini = `${mes}-01`, [a, m] = mes.split("-").map(Number), fim = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  let st = { ativo: ativo(e), obras: e.obras || [] }, ate = "9999";
  const trechos = [], alts = (e.alteracoes || []).filter(x => x.antes && (x.antes.obras || x.antes.ativo != null)).slice().sort((x, y) => String(x.em).localeCompare(String(y.em)));
  for (let i = alts.length - 1; i >= 0; i--) {
    const x = alts[i]; trechos.push({ de: String(x.em), ate, st });
    st = { ativo: x.antes.ativo != null ? !!x.antes.ativo : st.ativo, obras: x.antes.obras || st.obras }; ate = String(x.em);
  }
  const comeco = [String(e.criadoEm || ""), inicio ? inicio + "-01" : ""].filter(Boolean).sort()[0] || "";
  trechos.push({ de: comeco, ate, st });
  return trechos.some(x => x.de < fim && x.ate > ini && x.st.ativo && x.st.obras.includes(obra));
}
const obrasValidas = lista => { const ok = new Set(obrasDoSetor().map(o => o.id)); return [...new Set([].concat(lista || []).filter(o => ok.has(o)))]; };
/** WhatsApp: só os números, com DDD (10 ou 11 dígitos; com o 55 do Brasil, 12 ou 13). Vazio vale (é opcional). */
const foneOk = t => { const d = String(t || "").replace(/\D/g, ""); return !d || /^(55)?\d{10,11}$/.test(d) ? d.replace(/^55(?=\d{10,11}$)/, "") : null; };
const emailOk = t => { const s = txt(t).toLowerCase(); return !s || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null; };
/** A EMPRESA DO BOLETIM: o nome da empresa do config.json. A marca "funcionário próprio" (campo proprio) separa os funcionários
 *  dos terceiros (o Painel do RH mostra só os próprios). Sem o campo, conta como próprio. A versão aprovada guarda a empresa. */
export const EMPRESA_PROPRIA = MARCA.empresa, EMPRESA_TERCEIRO = MARCA.empresa;   // funcionário próprio ou terceiro: o boletim sai com o nome da empresa (config.json)
export const ehProprio = e => !e || e.proprio !== false;
export const empresaDoEmp = e => ehProprio(e) ? EMPRESA_PROPRIA : EMPRESA_TERCEIRO;
export function salvarEmpreiteiro(f, user) {
  const E = lerEmpreiteiros(), nome = nomeProprio(txt(f.nome)).slice(0, 120), doc = String(f.doc || "").replace(/\D/g, ""), funcao = txt(f.funcao).toUpperCase().slice(0, 60);
  if (nome.length < 3) return { erro: "Escreva o nome completo." };
  if (!docOk(doc)) return { erro: "CPF tem 11 números e CNPJ tem 14." };
  const telefone = foneOk(f.telefone), email = emailOk(f.email);                 // para mandar o boletim assinado (04/11)
  if (telefone === null) return { erro: "WhatsApp: escreva o número com DDD (ex.: 47 99999-9999)." };
  if (email === null) return { erro: "E-mail não parece certo." };
  const k = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const e = f.id ? E.lista.find(x => x.id === f.id) : null;
  if (f.id && !e) return { erro: "Empreiteiro não encontrado." };
  if (E.lista.some(x => x !== e && x.doc === doc)) return { erro: "Esse CPF/CNPJ já está no cadastro." };
  if (E.lista.some(x => x !== e && k(x.nome) === k(nome))) return { erro: "Já existe um empreiteiro com esse nome." };
  const temProprio = String(f.proprioCampo || "") === "1", proprio = String(f.proprio || "") === "1";   // a caixinha "funcionário próprio" (sem o campo no form = não mexe)
  if (e) {
    const sn = v => v ? "sim" : "não", propA = ehProprio(e), propN = temProprio ? proprio : propA;
    const antes = { nome: e.nome, doc: e.doc, funcao: e.funcao, telefone: e.telefone || "", email: e.email || "", proprio: sn(propA) };
    if (antes.nome === nome && antes.doc === doc && antes.funcao === funcao && antes.telefone === telefone && antes.email === email && propA === propN) return { ok: true, igual: true };
    (e.alteracoes ||= []).push({ antes, por: quem(user), em: agoraLocalISO() }); Object.assign(e, { nome, doc, funcao, telefone, email, proprio: propN });
    const novo = { nome, doc, funcao, telefone, email, proprio: sn(propN) }, ROT = { nome: "nome", doc: "CPF/CNPJ", funcao: "função", telefone: "WhatsApp", email: "e-mail", proprio: "funcionário próprio" };
    const mud = Object.keys(ROT).filter(k => (antes[k] || "") !== (novo[k] || "")).map(k => `${ROT[k]}: ${antes[k] || "(vazio)"} → ${novo[k] || "(vazio)"}`);
    gravarEmpreiteiros(E, user, `Corrigiu o cadastro de ${nome} — ${mud.join("; ")}`);
    return { ok: true, id: e.id };
  }
  const obras = obrasValidas(f.obra);
  const n = { id: id("em-"), nome, doc, funcao, telefone, email, proprio: temProprio ? proprio : true, obras, criadoPor: quem(user), criadoEm: agoraLocalISO() };
  E.lista.push(n); gravarEmpreiteiros(E, user, `Cadastrou o empreiteiro ${nome} (${n.proprio ? "funcionário próprio" : "terceiro"})${obras.length ? ` (habilitado em ${obras.length} obra(s))` : ""}`);
  return { ok: true, id: n.id };
}
const nomeObra = o => (obrasDoSetor().find(x => x.id === o) || {}).nome || o;
/** As obras em que o empreiteiro está habilitado (a lista inteira, vinda das caixinhas). */
export function definirObras(eid, obras, user) {
  const pode = obrasQueHabilita(user); if (!pode.length) return { erro: "Quem habilita empreiteiro em obra é a engenharia ou a Diretoria (o Engenheiro, só nas obras dele)." };
  const E = lerEmpreiteiros(), e = E.lista.find(x => x.id === eid); if (!e) return { erro: "Empreiteiro não encontrado." };
  const antes = e.obras || [], pedidas = obrasValidas(obras);
  const novas = [...antes.filter(o => !pode.includes(o)), ...pedidas.filter(o => pode.includes(o))];   // fora das obras dele: não muda
  const entra = novas.filter(o => !antes.includes(o)), sai = antes.filter(o => !novas.includes(o));
  if (!entra.length && !sai.length) return { ok: true, igual: true };
  (e.alteracoes ||= []).push({ antes: { obras: antes }, por: quem(user), em: agoraLocalISO() }); e.obras = novas;
  gravarEmpreiteiros(E, user, `${e.nome}: ${[entra.length && "habilitado em " + entra.map(nomeObra).join(", "), sai.length && "tirado de " + sai.map(nomeObra).join(", ")].filter(Boolean).join("; ")}`);
  return { ok: true };
}
/** Habilita ou tira o empreiteiro de UMA obra (o botão da aba Empreiteiros da obra). */
export function equipe(obra, eid, entra, user) {
  const e = lerEmpreiteiros().lista.find(x => x.id === eid); if (!e) return { erro: "Empreiteiro não encontrado." };
  const obras = e.obras || [];
  return definirObras(eid, entra ? [...obras, obra] : obras.filter(o => o !== obra), user);
}
/** Ativo / inativo. Inativo some das folhas de medição de todas as obras; o histórico fica. */
export function definirAtivo(eid, sim, motivo, user) {
  if (!podeGerir(user)) return { erro: "Quem ativa ou inativa empreiteiro é a engenharia ou a Diretoria." };
  const E = lerEmpreiteiros(), e = E.lista.find(x => x.id === eid); if (!e) return { erro: "Empreiteiro não encontrado." };
  if (sim === ativo(e)) return { ok: true, igual: true };
  motivo = txt(motivo).slice(0, 200);
  (e.alteracoes ||= []).push({ antes: { ativo: ativo(e) }, por: quem(user), em: agoraLocalISO(), motivo });
  if (sim) delete e.inativo; else e.inativo = { por: quem(user), em: agoraLocalISO(), motivo };
  gravarEmpreiteiros(E, user, `${sim ? "Reativou" : "Inativou"} ${e.nome}${motivo ? " — " + motivo : ""}`);
  return { ok: true };
}

// ---------------------------------------------------------------- BOLETIM DE MEDIÇÃO (04/11): um por empreiteiro por mês
const proximoNumero = (O, emp) => Math.max(O.numeracao[emp] || 0, ...O.boletins.filter(b => b.emp === emp).map(b => b.numero || 0)) + 1;
/** O boletim do empreiteiro no mês de competência — cria em aberto se ainda não existe. */
function boletimDe(O, emp, mes, user) {
  let B = O.boletins.find(b => b.emp === emp && b.mes === mes);
  if (!B) O.boletins.push(B = { id: "bl-" + chave(emp, mes), emp, mes, numero: proximoNumero(O, emp), status: ESTADOS.aberto, criadoPor: quem(user), criadoEm: agoraLocalISO(),
    itens: [], extras: [], obs: "", fotos: [], envios: [], aprovacoes: [], devolucoes: [], versoes: [], reaberturas: [], removidos: [], origem: "sistema" });
  B.removidos ||= [];
  return B;
}
const acharBoletim = (O, bid) => O.boletins.find(b => b.id === bid);
/** Mexeu num boletim que não está em aberto (enviado ou aprovado): a aprovação cai e ele volta "em aberto", marcado. */
// BOLETIM ENVIADO OU APROVADO NÃO SE EDITA (13/11): a aprovação é só aprovação. Para mexer, primeiro REVOGA (retirar da
// aprovação / revogar a aprovação), ele volta "em aberto" e o fluxo recomeça. Tudo que mexe no boletim passa por aqui.
const travado = B => B.status !== ESTADOS.aberto
  ? { erro: `O ${bolTxt(B)} está ${B.status === ESTADOS.ok ? "aprovado" : "em aprovação"}: para editar, primeiro ${B.status === ESTADOS.ok ? "revogue a aprovação" : "retire da aprovação"} (botão no boletim).` } : null;
/** Revogar: na fila = retirar da aprovação; aprovado = revogar a aprovação (com motivo; se já assinado, "estou ciente" — a assinatura
 *  vale só para a versão antiga e o fluxo todo recomeça: enviar → aprovar → assinar de novo). O ENGENHEIRO TAMBÉM PODE (13/11):
 *  quem tem acesso ao boletim. Volta "em aberto"; a versão aprovada (e a assinatura dela) fica no histórico. */
export function podeRevogar(B, user) {
  return !!user && (NA_FILA.includes(B.status) || B.status === ESTADOS.ok);
}
export function revogarBoletim(obra, bid, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  if (B.status === ESTADOS.aberto) return { ok: true, igual: true };
  if (!podeRevogar(B, user)) return { erro: "Este boletim não pode ser reaberto para edição." };
  const motivo = txt(f.motivo).slice(0, 300), aprov = B.status === ESTADOS.ok, V = versaoAprovada(B);
  if (aprov && motivo.length < 5) return { erro: "Escreva o motivo para revogar a aprovação." };
  if (aprov && V && V.assinatura && String(f.ciente || "") !== "1") return { erro: "Este boletim já foi assinado pelo empreiteiro: marque que está ciente antes de revogar." };
  reabrir(B, user, `${aprov ? "aprovação revogada" : "retirado da aprovação"}${motivo ? ": " + motivo : ""}`);
  gravarObra(obra, O, user, `${aprov ? "Revogou a aprovação do" : "Retirou da aprovação o"} ${bolTxt(B)}${aprov && V && V.assinatura ? " (já assinado pelo empreiteiro — a assinatura vale só para a versão antiga; o fluxo recomeça e será colhida de novo)" : ""}${motivo ? " — motivo: " + motivo : ""}`);
  return { ok: true };
}
function reabrir(B, user, motivo) {
  if (B.status === ESTADOS.aberto) return false;
  B.reaberturas.push({ em: agoraLocalISO(), por: quem(user), de: B.status, motivo }); B.status = ESTADOS.aberto; B.aprovacoes = [];
  return true;
}
const mesBRd = m => `${m.slice(5)}/${m.slice(0, 4)}`;
const dataBRd = d => String(d || "").split("-").reverse().join("/");
/** O que mudou no boletim desde a última versão aprovada: lançamentos/extras novos, alterados e removidos. */
export function diferencas(B) {
  const V = versaoAprovada(B), r = { base: V, itens: {}, extras: {}, removidos: { itens: [], extras: [] }, algo: false };
  if (!V) return r;
  const vi = new Map(V.itens.map(i => [i.id, i])), ve = new Map(V.extras.map(x => [x.id, x]));
  for (const i of B.itens) { const a = vi.get(i.id); if (!a) r.itens[i.id] = "novo"; else if (Math.abs(a.pct - i.pct) > 1e-9 || Math.abs(a.valor - i.valor) > 0.004) r.itens[i.id] = "alterado"; }
  for (const x of B.extras) { const a = ve.get(x.id); if (!a) r.extras[x.id] = "novo"; else if (Math.abs(a.valor - x.valor) > 0.004 || a.motivo !== x.motivo || (a.item || "") !== (x.item || "")) r.extras[x.id] = "alterado"; }
  const ci = new Set(B.itens.map(i => i.id)), ce = new Set(B.extras.map(x => x.id));
  r.removidos.itens = V.itens.filter(i => !ci.has(i.id)); r.removidos.extras = V.extras.filter(x => !ce.has(x.id));
  r.algo = !!(Object.keys(r.itens).length || Object.keys(r.extras).length || r.removidos.itens.length || r.removidos.extras.length);
  return r;
}

/** LANÇAR pela grade. f: data, emp1..3 + parte1..3, obs; d_<item> = % que ANDOU agora; extras ex<n>_*; fotos.
 *  Cada empreiteiro recebe a sua parte no boletim DELE do mês da data (cria se não tem). Boletim enviado ou aprovado
 *  que recebe lançamento volta "em aberto" (a aprovação cai). */
export function lancar(obra, f, arquivos, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const data = String(f.data || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Escolha a data da medição." };
  if (data > isoLocal()) return { erro: "A data da medição não pode ser no futuro." };
  const mes = data.slice(0, 7), E = lerEmpreiteiros(), partes = [];
  for (const k of ["1", "2", "3"]) {
    const e = String(f["emp" + k] || ""); if (!e) continue;
    const ee = E.lista.find(x => x.id === e); if (!ee) return { erro: "Empreiteiro não encontrado no cadastro." };
    if (!ativo(ee)) return { erro: `${ee.nome} está inativo no cadastro de empreiteiros.` };
    if (!habilitado(ee, obra)) return { erro: `${ee.nome} não está habilitado para medição nesta obra (cadastro de empreiteiros).` };
    if (partes.some(p => p.e === e)) return { erro: "O mesmo empreiteiro foi escolhido duas vezes." };
    partes.push({ e, q: lerNumero(f["parte" + k]) });
  }
  if (!partes.length) return { erro: "Escolha o empreiteiro." };
  for (const pp of partes) { const B0 = O.boletins.find(b => b.emp === pp.e && b.mes === mes); const tv = B0 && travado(B0); if (tv) return tv; }
  if (partes.length === 1 && partes[0].q == null) partes[0].q = 100;
  if (partes.some(p => p.q == null || Number.isNaN(p.q) || p.q <= 0)) return { erro: "Escreva a parte (%) de cada empreiteiro." };
  const soma = partes.reduce((a, p) => a + p.q, 0);
  if (Math.abs(soma - 100) > 0.01) return { erro: `As partes dos empreiteiros somam ${soma.toLocaleString("pt-BR")}% — têm de somar 100%.` };
  const R = calcular(O), linhas = [];
  for (const [k, v] of Object.entries(f)) {
    if (!k.startsWith("d_")) continue;
    let d = lerNumero(v); if (d == null) continue;
    const x = R.I[k.slice(2)]; if (!x) return { erro: "Um dos serviços da grade não existe mais. Abra a grade de novo." };
    const nome = `${(R.L[x.local] || {}).pavNome} · ${(R.L[x.local] || {}).nome} · ${x.servico}`;
    if (d > 0 && qtdPendente(O, x.id)) return { erro: `${nome}: a quantidade real deste serviço está aguardando aprovação do Gerente ou do Administrador — ele não pode ser medido até a decisão.` };
    const emQtd = f.modo === "qtd";   // 13/11: medir em QUANTIDADE — o que veio é quantidade; vira % pela quantidade do serviço no local
    if (Number.isNaN(d) || d < 0) return { erro: `${nome}: ${emQtd ? "a quantidade" : "o %"} não está certo.` };
    if (emQtd && d > 0) { if (!(x.qtd > 0)) return { erro: `${nome}: o serviço não tem quantidade cadastrada — meça em %.` }; d = d / x.qtd * 100; }
    if (d === 0) continue;
    const falta = Math.max(0, 1 - acumuladoItem(O, x.id));
    if (d / 100 > falta + 1e-9) return { erro: `${nome}: passa de 100% — só falta medir ${pctTxt(falta)} (contando o que já está lançado nos boletins).` };
    const pu = precoNaData(O, x.cat, data); if (pu == null) return { erro: `${nome}: sem preço nesta obra na data da medição.` };
    const tol = emQtd ? Math.max(2e-6, 1.5e-4 / x.qtd) : 2e-6;   // o "completar 100%" chega cortado em 4 casas: fecha exato
    const pct = falta - d / 100 >= 0 && falta - d / 100 < tol ? falta : d / 100;   // 13/11: "completar 100%" com % quebrado (quantidade alterada) fecha exato
    linhas.push({ x, pct, pu, obs: txt(f["o_" + x.id]).slice(0, 300) });
  }
  // EXTRAS (05/11 → 10/11): cada extra é ligado a um SERVIÇO de um LOCAL (o quadrado da grade onde se apertou "+ extra").
  // Obrigatórios no próprio extra: valor, motivo (curto — vira o "top motivos" do Dashboard) e a observação detalhada
  // (memória de cálculo, motivo detalhado…). Fotos do extra: opcionais, sem limite. Sem categoria.
  const extras = [];
  for (let i = 1; i <= 40; i++) {
    const it = String(f[`ex${i}_item`] || ""), v = lerNumero(f[`ex${i}_valor`]), mot = txt(f[`ex${i}_motivo`]).slice(0, 60), obs = txt(f[`ex${i}_obs`]).slice(0, 3000);
    if (!it && v == null && !mot && !obs) continue;
    const x = R.I[it]; if (!x) return { erro: `Extra ${i}: o serviço do extra não existe mais. Abra a grade de novo.` };
    const nome = `${(R.L[x.local] || {}).pavNome} · ${(R.L[x.local] || {}).nome} · ${x.servico}`;
    if (v == null || Number.isNaN(v) || v <= 0) return { erro: `Extra em ${nome}: escreva o valor.` };
    if (mot.length < 3) return { erro: `Extra em ${nome}: escreva o motivo (curto).` };
    if (obs.length < 5) return { erro: `Extra em ${nome}: escreva a observação detalhando o extra (memória de cálculo, motivo…).` };
    const fotosEx = [];
    for (const a of (arquivos || []).filter(a => a.campo === `ex${i}_fotos`)) {
      if (![".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(a.ext)) return { erro: `Extra em ${nome}: a foto "${a.nomeOriginal}" não é imagem (jpg, png, webp) nem PDF.` };
      try { fotosEx.push({ arquivo: salvarArquivo(a, join(PASTA_FOTOS, obra)), nome: String(a.nomeOriginal).slice(0, 120), data, por: quem(user), em: agoraLocalISO() }); }
      catch (e) { return { erro: `Extra em ${nome}: foto "${a.nomeOriginal}": ${e.message}` }; }
    }
    extras.push({ item: x.id, local: x.local, motivo: mot, nota: obs, fotos: fotosEx, valor: v });
  }
  if (!linhas.length && !extras.length) return { erro: "Nada para lançar: escreva o % que andou em algum serviço ou acrescente um extra (botão + extra no quadrado do serviço)." };
  const obs = txt(f.obs).slice(0, 1000);                       // a observação GERAL do lançamento é opcional
  // FOTOS DO QUADRADO (10/11): campo "f_<item>" — vão para a linha desse serviço no boletim; só valem com % medido nele
  const fotosItem = {};
  for (const a of (arquivos || []).filter(a => /^f_/.test(a.campo || ""))) {
    const iid = a.campo.slice(2), l = linhas.find(l => l.x.id === iid), x = R.I[iid];
    const nome = x ? `${(R.L[x.local] || {}).pavNome} · ${(R.L[x.local] || {}).nome} · ${x.servico}` : "um serviço";
    if (!l) return { erro: `Foto em ${nome}: escreva o % que andou nesse serviço (a foto vai junto com a medição dele).` };
    if (![".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(a.ext)) return { erro: `Foto em ${nome}: "${a.nomeOriginal}" não é imagem (jpg, png, webp) nem PDF.` };
    try { (fotosItem[iid] ||= []).push({ arquivo: salvarArquivo(a, join(PASTA_FOTOS, obra)), nome: String(a.nomeOriginal).slice(0, 120), data, por: quem(user), em: agoraLocalISO() }); }
    catch (e) { return { erro: `Foto em ${nome}: "${a.nomeOriginal}": ${e.message}` }; }
  }
  const fotos = [];
  for (const a of (arquivos || []).filter(a => !/^ex\d+_fotos$/.test(a.campo || "") && !/^f_/.test(a.campo || ""))) {
    if (![".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(a.ext)) return { erro: `Foto "${a.nomeOriginal}": só imagem (jpg, png, webp) ou PDF.` };
    try { fotos.push({ arquivo: salvarArquivo(a, join(PASTA_FOTOS, obra)), nome: String(a.nomeOriginal).slice(0, 120), data }); }
    catch (e) { return { erro: `Foto "${a.nomeOriginal}": ${e.message}` }; }
  }
  const em = agoraLocalISO(), por = quem(user), tocados = [];
  for (const p of partes) {
    const B = boletimDe(O, p.e, mes, user), s = p.q / 100;
    const reaberto = reabrir(B, user, `lançamento novo em ${dataBRd(data)}`);
    for (const l of linhas) { const qtd = Math.round(l.x.qtd * l.pct * s * 1e4) / 1e4;
      B.itens.push({ id: id("lc-"), item: l.x.id, pct: l.pct * s, qtd, pu: l.pu, valor: l.x.qtd * l.pct * s * l.pu, data, obs: l.obs, por, em, ...(partes.length > 1 ? { dividido: partes.map(q => ({ e: q.e, p: q.q / 100 })) } : {}) }); }
    for (const x of extras) B.extras.push({ id: id("ex-"), ...x, fotos: x.fotos.map(ft => ({ ...ft })), valor: r2(x.valor * s), data, por, em, ...(partes.length > 1 ? { dividido: partes.map(q => ({ e: q.e, p: q.q / 100 })) } : {}) });
    if (obs) B.obs = (B.obs ? B.obs + "\n" : "") + `${dataBRd(data)}: ${obs}`;
    B.fotos.push(...fotos);
    for (const l of linhas) if (fotosItem[l.x.id]) notaDe(B, `i:${l.x.id}|${l.pu}`, true).fotos.push(...fotosItem[l.x.id].map(ft => ({ ...ft })));
    tocados.push({ B, reaberto });
  }
  const tot = linhas.reduce((a, l) => a + l.x.qtd * l.pct * l.pu, 0) + extras.reduce((a, x) => a + x.valor, 0);
  gravarObra(obra, O, user, `Lançou medição de ${dataBRd(data)}: ${linhas.length} serviço(s)${extras.length ? ` + ${extras.length} extra(s)` : ""} — ${brl(tot)} → boletim(ns) ${tocados.map(t => "nº " + t.B.numero + (t.reaberto ? " (reaberto)" : "")).join(", ")}`);
  return { ok: true, boletins: tocados.map(t => t.B.id), reabertos: tocados.filter(t => t.reaberto).length };
}

/** Muda o % de um lançamento (a parte DESTE empreiteiro, em % do serviço inteiro). Boletim enviado/aprovado reabre. */
export function alterarLancamento(obra, bid, lid, novoPct, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const tv = travado(B); if (tv) return tv;
  const li = B.itens.find(i => i.id === lid); if (!li) return { erro: "Lançamento não encontrado." };
  if (qtdPendente(O, li.item)) return { erro: "A quantidade real deste serviço está aguardando aprovação do Gerente ou do Administrador: o % não pode ser alterado até a decisão." };
  const d = lerNumero(novoPct); if (d == null || Number.isNaN(d) || d <= 0) return { erro: "Escreva o novo % (maior que zero). Para tirar, use Remover." };
  const falta = Math.max(0, 1 - acumuladoItem(O, li.item, li.id));
  if (d / 100 > falta + 1e-9) return { erro: `Passa de 100%: desse serviço cabem no máximo ${pctTxt(falta)} neste lançamento.` };
  if (Math.abs(d / 100 - li.pct) < 1e-9) return { ok: true, igual: true };
  const base = li.pct ? li.qtd / li.pct : (calcular(O).I[li.item] || {}).qtd || 0, antes = { pct: li.pct, valor: li.valor };
  li.pct = d / 100; li.qtd = Math.round(base * li.pct * 1e4) / 1e4; li.valor = base * li.pct * li.pu;
  (li.alteracoes ||= []).push({ ...antes, por: quem(user), em: agoraLocalISO() });
  const re = reabrir(B, user, "lançamento alterado");
  gravarObra(obra, O, user, `${BolTxt(B)}: alterou o lançamento de ${ondeItem(O, li.item)} ${pctTxt(antes.pct)} → ${pctTxt(li.pct)} (${brl(antes.valor)} → ${brl(li.valor)})${re ? " — boletim reaberto" : ""}`);
  return { ok: true, reaberto: re };
}
/** Tira um lançamento ou um extra do boletim (fica guardado em "removidos", com quem e quando). */
export function removerDoBoletim(obra, bid, qual, lid, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const tv = travado(B); if (tv) return tv;
  const lista = qual === "extra" ? B.extras : B.itens, i = lista.findIndex(x => x.id === lid); if (i < 0) return { erro: "Não encontrado no boletim." };
  const [x] = lista.splice(i, 1); (B.removidos ||= []).push({ tipo: qual === "extra" ? "extra" : "lançamento", ...x, removidoPor: quem(user), removidoEm: agoraLocalISO() });
  // 13/11: boletim AINDA EM ELABORAÇÃO (nunca aprovado) que ficou sem nenhum lançamento nem extra deixa de existir de verdade —
  // se vier medição nova do empreiteiro no mês, ele nasce de novo (com o mesmo número). O que já teve versão aprovada fica (nada some).
  if (!B.itens.length && !B.extras.length && !(B.versoes || []).length) {
    O.boletins = O.boletins.filter(b => b !== B);
    gravarObra(obra, O, user, `${BolTxt(B)}: removeu ${qual === "extra" ? "o último extra" : "o último lançamento"} (${ondeItem(O, x.item)}) de ${brl(x.valor)} — o boletim ficou vazio e deixou de existir (ainda não tinha sido aprovado)`);
    return { ok: true, sumiu: true };
  }
  const re = reabrir(B, user, qual === "extra" ? "extra removido" : "lançamento removido");
  gravarObra(obra, O, user, `${BolTxt(B)}: removeu ${qual === "extra" ? "o extra" : "o lançamento"} de ${ondeItem(O, x.item)} — ${brl(x.valor)}${re ? " — boletim reaberto" : ""}`);
  return { ok: true, reaberto: re };
}
/** Extra lançado direto no boletim. */
export function novoExtra(obra, bid, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const tv = travado(B); if (tv) return tv;
  const R = calcular(O), x = R.I[String(f.item || "")], v = lerNumero(f.valor), mot = txt(f.motivo).slice(0, 60), obs = txt(f.obs).slice(0, 3000), data = String(f.data || isoLocal());
  if (!x) return { erro: "Escolha o serviço (local › serviço) do extra." };
  if (v == null || Number.isNaN(v) || v <= 0) return { erro: "Escreva o valor do extra." };
  if (mot.length < 3) return { erro: "Escreva o motivo do extra (curto)." };
  if (obs.length < 5) return { erro: "Escreva a observação detalhando o extra (memória de cálculo, motivo…)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data.slice(0, 7) !== B.mes) return { erro: `A data do extra tem de ser dentro do mês do boletim (${mesBRd(B.mes)}).` };
  B.extras.push({ id: id("ex-"), item: x.id, local: x.local, motivo: mot, nota: obs, fotos: [], valor: r2(v), data, por: quem(user), em: agoraLocalISO() });
  const re = reabrir(B, user, "extra novo");
  gravarObra(obra, O, user, `${BolTxt(B)}: extra de ${brl(v)} em ${ondeItem(O, x.id)} — motivo: ${mot}${re ? " — boletim reaberto" : ""}`);
  return { ok: true, reaberto: re };
}
// Observações e fotos (04/11): a GERAL do boletim e as de CADA linha — item de medição (chave "i:<item>|<preço>",
// a mesma linha da tabela) ou extra ("x:<id do extra>"). Não mexem em valor, então NÃO derrubam a aprovação. O texto
// anterior fica guardado em "alteracoes"; foto não tem limite.
const ALVO_OK = a => /^(i:[\w-]+\|[\d.]+|x:[\w-]+)$/.test(String(a || ""));
/** O lugar das observações/fotos de uma linha. */
function notaDe(B, alvo, criar) {
  if (alvo.startsWith("x:")) { const x = B.extras.find(e => e.id === alvo.slice(2)); if (x) { x.fotos ||= []; } return x || null; }
  B.notas ||= {};
  if (!B.notas[alvo] && criar) B.notas[alvo] = { obs: "", fotos: [] };
  return B.notas[alvo] || null;
}
/** Observação geral do boletim (qualquer situação: não mexe em valor). */
export function salvarObsBoletim(obra, bid, obs, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  { const tv = travado(B); if (tv) return tv; }
  const t = String(obs || "").slice(0, 3000).trim(); if (t === (B.obs || "")) return { ok: true, igual: true };
  (B.obsAlteracoes ||= []).push({ antes: B.obs || "", por: quem(user), em: agoraLocalISO() });
  B.obs = t; gravarObra(obra, O, user, `${BolTxt(B)}: observação geral`); return { ok: true };
}
/** Observação de uma linha (item de medição ou extra). Vazio = apaga o texto (o anterior fica no histórico). */
export function salvarNota(obra, bid, alvo, texto, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  { const tv = travado(B); if (tv) return tv; }
  if (!ALVO_OK(alvo)) return { erro: "Linha do boletim não encontrada." };
  if (alvo.startsWith("i:") && !B.itens.some(i => alvo === `i:${i.item}|${i.pu}`)) return { erro: "Esse item não está mais no boletim." };
  const N = notaDe(B, alvo, true); if (!N) return { erro: "Esse extra não está mais no boletim." };
  const t = String(texto || "").slice(0, 3000).trim(), antes = alvo.startsWith("x:") ? (N.nota || "") : (N.obs || "");
  if (t === antes) return { ok: true, igual: true };
  (N.notaAlteracoes ||= []).push({ antes, por: quem(user), em: agoraLocalISO() });
  if (alvo.startsWith("x:")) N.nota = t; else { N.obs = t; N.por = quem(user); N.em = agoraLocalISO(); }
  gravarObra(obra, O, user, `${BolTxt(B)}: observação ${alvoTxt(O, B, alvo).replace(/^o /, "do ")}${t ? "" : " (apagada)"}`);
  return { ok: true };
}
const guardaFotos = (obra, arquivos, user, destino) => {
  for (const a of arquivos) {
    if (![".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(a.ext)) return `"${a.nomeOriginal}": só imagem (jpg, png, webp) ou PDF.`;
    try { destino.push({ arquivo: salvarArquivo(a, join(PASTA_FOTOS, obra)), nome: String(a.nomeOriginal).slice(0, 120), data: isoLocal(), por: quem(user), em: agoraLocalISO() }); }
    catch (e) { return `"${a.nomeOriginal}": ${e.message}`; }
  }
  return "";
};
/** Fotos: do boletim (alvo vazio) ou de uma linha (item ou extra). Sem limite de quantidade; não mexem na aprovação. */
export function anexarFotos(obra, bid, arquivos, user, alvo = "") {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  { const tv = travado(B); if (tv) return tv; }
  if (!(arquivos || []).length) return { erro: "Escolha as fotos." };
  let destino = B.fotos;
  if (alvo) {
    if (!ALVO_OK(alvo)) return { erro: "Linha do boletim não encontrada." };
    if (alvo.startsWith("i:") && !B.itens.some(i => alvo === `i:${i.item}|${i.pu}`)) return { erro: "Esse item não está mais no boletim." };
    const N = notaDe(B, alvo, true); if (!N) return { erro: "Esse extra não está mais no boletim." };
    destino = N.fotos;
  }
  const falhou = guardaFotos(obra, arquivos, user, destino); if (falhou) return { erro: falhou };
  gravarObra(obra, O, user, `${BolTxt(B)}: ${arquivos.length} foto(s)${alvo ? " " + alvoTxt(O, B, alvo).replace(/^o /, "no ") : " no boletim"}`); return { ok: true };
}

// ---------------------------------------------------------------- aprovação do BOLETIM INTEIRO (as mesmas pessoas de antes)
export function enviarBoletim(obra, bid, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  if (B.status !== ESTADOS.aberto) return { erro: "Este boletim já foi enviado (" + B.status + ")." };
  if (!B.itens.length && !B.extras.length) return { erro: "O boletim está vazio." };
  B.status = ESTADOS.fila1; B.envios.push({ por: quem(user), em: agoraLocalISO() });
  gravarObra(obra, O, user, `Enviou para aprovação o ${bolTxt(B)}`);
  return { ok: true };
}
/** Quem aprova AGORA este boletim (devolve a etapa, ou null). Com ETAPA_DIRETORIA desligada (12/11): uma etapa só — o Gerente
 *  (ou a Diretoria) aprova e já é a aprovação final, inclusive o que estava "aguardando Diretoria". */
export function etapaDeAprovar(B, P) {
  if (!NA_FILA.includes(B.status)) return null;
  if (!ETAPA_DIRETORIA) return P.engenharia ? "engenharia" : P.diretoria ? "diretoria" : null;
  if (B.status === ESTADOS.fila1) return P.engenharia ? "engenharia" : null;
  return P.diretoria ? "diretoria" : null;
}
export const podeDevolverAgora = (B, P) => NA_FILA.includes(B.status) && ((!ETAPA_DIRETORIA || B.status === ESTADOS.fila1) ? !!(P.engenharia || P.diretoria) : !!P.diretoria);
export { ETAPA_DIRETORIA };
export function aprovarBoletim(obra, bid, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const P = papel(user), em = agoraLocalISO();
  if (!NA_FILA.includes(B.status)) return { erro: B.status === ESTADOS.ok ? "Este boletim já está aprovado." : "Envie o boletim para aprovação antes." };
  const etapa = etapaDeAprovar(B, P);
  if (!etapa) return { erro: !ETAPA_DIRETORIA ? "Quem aprova o boletim é o Gerente de Engenharia (ou a Diretoria)." : B.status === ESTADOS.fila1 ? "A primeira aprovação é do Gerente de Engenharia." : "A aprovação final é da Diretoria." };
  B.aprovacoes.push({ etapa, por: quem(user), em });
  const final = !ETAPA_DIRETORIA || etapa === "diretoria";
  if (!final) B.status = ESTADOS.fila2;
  else {                                                     // aprovação final: guarda a VERSÃO aprovada (o que vale)
    B.status = ESTADOS.ok;
    const V = { n: B.versoes.length + 1, em, por: quem(user), empresa: empresaDoEmp(lerEmpreiteiros().lista.find(e => e.id === B.emp)), aprovacoes: B.aprovacoes.map(a => ({ ...a })),
      itens: B.itens.map(i => ({ ...i })), extras: B.extras.map(x => ({ ...x })), obs: B.obs };
    V.codigo = codigoVersao(B, V);
    B.versoes.push(V);
  }
  gravarObra(obra, O, user, `${final ? "Aprovou (final" + (etapa === "engenharia" ? ", engenharia" : ", Diretoria") + ")" : "Aprovou (engenharia)"} o ${bolTxt(B)}`);
  return { ok: true };
}
/** O CÓDIGO DE CONFERÊNCIA de uma versão aprovada: sai do conteúdo (empreiteiro, mês, nº, versão, cada item e valor). Se
 *  qualquer coisa mudar, o código muda — quem tem o papel assinado confere se é a versão que vale. */
export function codigoVersao(B, V) {
  const base = JSON.stringify([B.emp, B.mes, B.numero, V.n, V.itens.map(i => [i.id, i.item, +i.pct.toFixed(6), +i.valor.toFixed(2)]), V.extras.map(x => [x.id, +x.valor.toFixed(2)])]);
  const h = createHash("sha256").update(base).digest("hex").slice(0, 12).toUpperCase();
  return h.match(/.{4}/g).join("-");
}
export const codigoDe = (B, V) => V.codigo || codigoVersao(B, V);       // versões aprovadas antes do código (04/11) calculam na hora

// ---------------------------------------------------------------- assinatura do empreiteiro (dedo na tela) e envio
/** Assinatura colhida na tela (o empreiteiro assina com o dedo no celular do engenheiro). Vai na ÚLTIMA versão aprovada:
 *  se o boletim for reaberto e aprovado de novo, a versão nova precisa de assinatura nova. */
export function assinarBoletim(obra, bid, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const V = versaoAprovada(B);
  if (B.status !== ESTADOS.ok || !V) return { erro: "Só dá para colher a assinatura depois da aprovação final." };
  if (V.assinatura) return { erro: "Esta versão já foi assinada." };
  const nome = txt(f.nome).slice(0, 120); if (nome.length < 3) return { erro: "Escreva o nome de quem está assinando." };
  const m = String(f.assinatura || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { erro: "A assinatura não chegou. Assine no quadro e confirme de novo." };
  const buffer = Buffer.from(m[1], "base64");
  if (buffer.length < 900) return { erro: "A assinatura ficou vazia ou pequena demais. Assine de novo." };
  if (buffer.length > 2 * 1024 * 1024) return { erro: "A imagem da assinatura ficou grande demais." };
  let arquivo; try { arquivo = salvarArquivo({ ext: ".png", buffer, nomeOriginal: "assinatura.png" }, join(PASTA_FOTOS, obra)); } catch (e) { return { erro: "Não deu para guardar a assinatura: " + e.message }; }
  V.assinatura = { arquivo, nome, em: agoraLocalISO(), coletadoPor: quem(user), codigo: codigoDe(B, V) };
  gravarObra(obra, O, user, `${BolTxt(B)}: assinatura do empreiteiro colhida (${nome}), versão ${V.n}`);
  return { ok: true };
}
/** Registra que o boletim assinado foi mandado ao empreiteiro (WhatsApp, e-mail ou compartilhar). */
export function registrarEnvio(obra, bid, canal, user, { para = "", automatico = false } = {}) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const V = versaoAprovada(B); if (!V || !V.assinatura) return { erro: "O boletim ainda não foi assinado." };
  canal = ["whatsapp", "email", "compartilhar", "baixar"].includes(canal) ? canal : "compartilhar";
  (V.envios ||= []).push({ canal, para: String(para || "").slice(0, 120), automatico: !!automatico, por: quem(user), em: agoraLocalISO() });
  gravarObra(obra, O, user, `${BolTxt(B)} (versão ${V.n}) mandado ao empreiteiro por ${canal}${para ? " (" + para + ")" : ""}${automatico ? " pelo servidor" : ""}`);
  return { ok: true };
}
// ---------------------------------------------------------------- EXCLUIR O BOLETIM INTEIRO (13/11)
// Só boletim do MÊS ATUAL (o de competência). Assinado pelo empreiteiro: só quem gere (Administrador, Gerente, Diretoria), e com o
// "estou ciente". O Engenheiro exclui só o que não foi assinado. Motivo obrigatório. NADA SOME: o boletim sai da contagem (lançamentos,
// extras, aprovações) e vai inteiro para O.boletinsExcluidos, com quem, quando e o motivo; o número dele não volta a ser usado.
export const boletimAssinado = B => (B.versoes || []).some(v => v.assinatura);
export function podeExcluirBoletim(B, user) {
  const mesAtual = agoraLocalISO().slice(0, 7);
  if (B.mes !== mesAtual) return { pode: false, motivo: `Boletins de meses anteriores não podem ser excluídos (só os de ${mesBRd(mesAtual)}).` };
  if (boletimAssinado(B) && !podeGerir(user)) return { pode: false, motivo: "Este boletim já foi assinado pelo empreiteiro: só o Administrador, o Gerente de Engenharia ou a Diretoria podem excluir." };
  return { pode: true, assinado: boletimAssinado(B) };
}
export function excluirBoletim(obra, bid, f, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  const pd = podeExcluirBoletim(B, user); if (!pd.pode) return { erro: pd.motivo };
  if (pd.assinado && String(f.ciente || "") !== "1") return { erro: "Boletim assinado pelo empreiteiro: marque que está ciente antes de excluir." };
  const motivo = txt(f.motivo).slice(0, 300); if (motivo.length < 5) return { erro: "Escreva o motivo da exclusão." };
  const empNome = (lerEmpreiteiros().lista.find(e => e.id === B.emp) || {}).nome || "?";
  O.boletins = O.boletins.filter(b => b !== B);
  O.numeracao[B.emp] = Math.max(O.numeracao[B.emp] || 0, B.numero || 0);   // o número não volta a ser usado
  O.boletinsExcluidos.push({ ...B, empNome, excluido: { por: quem(user), em: agoraLocalISO(), motivo, assinado: !!pd.assinado, status: B.status } });
  gravarObra(obra, O, user, `Excluiu o boletim nº ${B.numero} de ${empNome} (${mesBRd(B.mes)})${pd.assinado ? " — já ASSINADO pelo empreiteiro" : ""} — motivo: ${motivo}`);
  return { ok: true };
}

/** Devolver = reprovar: volta "em aberto" para corrigir, com o motivo. */
export function devolverBoletim(obra, bid, motivo, user) {
  const { O, erro } = abrir(obra); if (erro) return { erro };
  const B = acharBoletim(O, bid); if (!B) return { erro: "Boletim não encontrado." };
  motivo = txt(motivo).slice(0, 300); if (motivo.length < 5) return { erro: "Para devolver, escreva o motivo." };
  const P = papel(user);
  if (!NA_FILA.includes(B.status)) return { erro: "Só dá para devolver boletim que está na fila de aprovação." };
  if (!podeDevolverAgora(B, P)) return { erro: B.status === ESTADOS.fila2 && ETAPA_DIRETORIA ? "Nesta etapa, quem devolve é a Diretoria." : "Quem devolve é o Gerente de Engenharia ou a Diretoria." };
  const etapa = P.engenharia && (!ETAPA_DIRETORIA || B.status === ESTADOS.fila1) ? "engenharia" : "diretoria";
  B.devolucoes.push({ etapa, por: quem(user), em: agoraLocalISO(), motivo }); B.status = ESTADOS.aberto; B.aprovacoes = [];
  gravarObra(obra, O, user, `Devolveu (${etapa}) o ${bolTxt(B)} — motivo: ${motivo}`);
  return { ok: true };
}

// ---------------------------------------------------------------- o boletim montado para a tela e o PDF
const fimDoMes = mes => { const [a, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`; };
/** As linhas do boletim (do estado atual ou de uma versão aprovada), agrupadas por serviço e preço, em ordem de serviço,
 *  pavimento e local; com o % anterior e o acumulado do serviço (somando os boletins de todos os empreiteiros). */
export function montarBoletim(O, B, { versao = null } = {}) {
  const R = calcular(O), V = versao || { itens: B.itens, extras: B.extras, obs: B.obs };
  const dif = versao ? { itens: {}, extras: {} } : diferencas(B);
  const acum = (iid, cond) => O.boletins.filter(cond).reduce((a, b) => a + b.itens.filter(i => i.item === iid).reduce((s, i) => s + i.pct, 0), 0);
  const linhas = new Map();
  for (const li of V.itens) {
    const x = R.I[li.item] || {}, l = R.L[x.local] || {}, k = li.item + "|" + li.pu;
    const ln = linhas.get(k) || { item: li.item, tipo: x.tipo || "?", servico: x.servico || "(serviço removido)", unidade: x.unidade || "", pavimento: l.pavNome || "?", local: l.nome || "?",
      ordPav: R.pavs.findIndex(pv => pv.id === l.pav), ordLoc: l.ordem || 0, pu: li.pu, pct: 0, qtd: 0, valor: 0, obs: [], lancs: [], marca: "" };
    ln.pct += li.pct; ln.qtd += li.qtd; ln.valor += li.valor; if (li.obs) ln.obs.push(li.obs); ln.lancs.push(li);
    if (dif.itens[li.id]) ln.marca = ln.marca === "novo" ? "novo" : dif.itens[li.id];
    linhas.set(k, ln);
  }
  const itens = [...linhas.values()].sort((a, b) => `${a.tipo} - ${a.servico}`.localeCompare(`${b.tipo} - ${b.servico}`, "pt-BR") || a.ordPav - b.ordPav || a.ordLoc - b.ordLoc)
    .map((ln, i) => { const alvo = `i:${ln.item}|${ln.pu}`, N = (B.notas || {})[alvo] || {};   // observação e fotos da linha (as atuais, mesmo numa versão)
      return { n: i + 1, ...ln, alvo, nota: N.obs || "", notaPor: N.por || "", notaEm: N.em || "", fotos: N.fotos || [], anterior: acum(ln.item, b => b.mes < B.mes), acumulado: acum(ln.item, b => b.mes <= B.mes), obs: [...new Set(ln.obs)] }; });
  const extras = V.extras.map((x, i) => { const l = R.L[x.local] || {}, it = x.item && R.I[x.item], atual = B.extras.find(e => e.id === x.id) || x;
    return { ...x, n: itens.length + i + 1, alvo: `x:${x.id}`, nota: atual.nota || "", fotos: atual.fotos || [], pavimento: l.pavNome || (it ? (R.L[it.local] || {}).pavNome : "") || "", local: l.nome || (it ? (R.L[it.local] || {}).nome : "") || "",
      servico: it ? `${it.tipo} - ${it.servico}` : (x.descricao || x.categoria || "—"), descricao: x.descricao || (it ? `${it.tipo} - ${it.servico}` : ""), marca: dif.extras[x.id] || "" }; });
  const e = R.emp[B.emp] || {}, s = somaBoletim(V.itens, V.extras);
  return { B, empNome: e.nome || "?", empDoc: e.doc || "", empFuncao: e.funcao || "", empresa: (versao && V.empresa) || empresaDoEmp(R.emp[B.emp]), mes: B.mes, numero: B.numero, itens, extras, obs: versao ? (V.obs || "") : (B.obs || ""),
    valor: s.normal, extra: s.extra, total: s.normal + s.extra, dif, versao };
}
export const ultimoDiaDoMes = fimDoMes;

// ---------------------------------------------------------------- CONFERÊNCIA PARA APROVAÇÃO (10/11)
// O que merece atenção de quem aprova, calculado do próprio boletim (o atual, não a versão congelada). Cada alerta diz o
// motivo e as linhas (nº da tabela do boletim). Os limites estão aqui em cima, para ajustar fácil.
export const LIMITES_CONF = { salto: 0.5, acimaMedia: 1.5, extras: 0.15, mesesMedia: 6 };
export function conferencia(O, B) {
  const M = montarBoletim(O, B), L = LIMITES_CONF, alertas = [], pct = v => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
  const nomeLn = x => `${x.tipo} - ${x.servico} · ${x.pavimento} › ${x.local}`;
  // 1) serviço que andou muito num mês só
  //    (serviço por unidade/verba — churrasqueira "1 un", "vb" — se mede inteiro mesmo: não entra)
  const porArea = x => !/^(un|und|unid|vb|verba|cj|conj|p[cç]|pe[cç]a)\.?$/i.test(String(x.unidade || "").trim());
  const deUmaVez = M.itens.filter(x => porArea(x) && x.anterior <= 1e-9 && x.acumulado >= 0.9999);
  const saltos = M.itens.filter(x => porArea(x) && x.pct >= L.salto && !deUmaVez.includes(x));
  if (deUmaVez.length) alertas.push({ nivel: "medio", titulo: `${deUmaVez.length} serviço(s) de 0% a 100% de uma vez`, detalhe: deUmaVez.slice(0, 6).map(nomeLn).join(" · ") + (deUmaVez.length > 6 ? " …" : ""), linhas: deUmaVez.map(x => x.n) });
  if (saltos.length) alertas.push({ nivel: "medio", titulo: `${saltos.length} serviço(s) andaram ${pct(L.salto)} ou mais neste mês`, detalhe: saltos.slice(0, 6).map(x => `${nomeLn(x)} (+${pct(x.pct)})`).join(" · ") + (saltos.length > 6 ? " …" : ""), linhas: saltos.map(x => x.n) });
  // 2) boletim bem acima da média do empreiteiro nesta obra
  const hist = [];
  for (const b of O.boletins) { if (b.emp !== B.emp || b.mes >= B.mes) continue; const V = versaoAprovada(b); if (!V) continue; const s = somaBoletim(V.itens, V.extras); hist.push({ mes: b.mes, total: s.normal + s.extra }); }
  hist.sort((a, c) => a.mes.localeCompare(c.mes)); const ult = hist.slice(-L.mesesMedia), media = ult.length ? ult.reduce((a, h) => a + h.total, 0) / ult.length : 0;
  if (ult.length >= 2 && media > 0 && M.total > media * L.acimaMedia) alertas.push({ nivel: "medio", titulo: `Boletim ${pct(M.total / media - 1)} acima da média do empreiteiro`, detalhe: `média dos últimos ${ult.length} meses nesta obra: ${brl(media)}; este boletim: ${brl(M.total)}`, linhas: [] });
  // 3) extras pesando no boletim
  if (M.total > 0 && M.extra / M.total > L.extras) alertas.push({ nivel: "medio", titulo: `Extras são ${pct(M.extra / M.total)} do boletim`, detalhe: `${brl(M.extra)} em ${M.extras.length} extra(s) — confira o motivo e a observação de cada um`, linhas: M.extras.map(x => x.n) });
  // 4) sem foto
  const semFoto = [...M.itens, ...M.extras].filter(x => !(x.fotos || []).length);
  if (semFoto.length) alertas.push({ nivel: "baixo", titulo: `${semFoto.length} de ${M.itens.length + M.extras.length} linha(s) sem foto`, detalhe: semFoto.slice(0, 6).map(x => String(x.alvo).startsWith("x:") ? `extra · ${x.servico}` : nomeLn(x)).join(" · ") + (semFoto.length > 6 ? " …" : ""), linhas: semFoto.map(x => x.n) });
  // 5) o mesmo serviço medido por outro empreiteiro no mesmo mês (sem ser divisão do mesmo lançamento)
  //    (a planilha não marcava divisão entre empreiteiros: só conta o que foi lançado no sistema)
  const outros = new Map();
  for (const b of O.boletins) { if (b.emp === B.emp || b.mes !== B.mes) continue;
    for (const li of b.itens) { if (li.por === "planilha" || (li.dividido || []).some(d => d.e === B.emp)) continue; (outros.get(li.item) || outros.set(li.item, new Set()).get(li.item)).add(b.emp); } }
  const R = calcular(O), dup = M.itens.filter(x => outros.has(x.item) && (x.lancs || []).some(li => li.por !== "planilha"));
  if (dup.length) alertas.push({ nivel: "alto", titulo: `${dup.length} serviço(s) também medidos por outro empreiteiro neste mês`, detalhe: dup.slice(0, 6).map(x => `${nomeLn(x)} (${[...outros.get(x.item)].map(e => (R.emp[e] || {}).nome || "?").join(", ")})`).join(" · "), linhas: dup.map(x => x.n) });
  // onde foi medido (para o mini-mapa): valor medido neste boletim por local
  const porLocal = {};
  for (const li of B.itens) { const x = R.I[li.item]; if (x) porLocal[x.local] = (porLocal[x.local] || 0) + li.valor; }
  for (const ex of B.extras) { const loc = ex.local || (R.I[ex.item] || {}).local; if (loc) porLocal[loc] = (porLocal[loc] || 0) + ex.valor; }
  const ordem = { alto: 0, medio: 1, baixo: 2 }; alertas.sort((a, c) => ordem[a.nivel] - ordem[c.nivel]);
  return { M, alertas, historico: [...hist.slice(-5), { mes: B.mes, total: M.total, atual: true }], media, porLocal };
}
