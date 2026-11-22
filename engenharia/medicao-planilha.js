// medicao-planilha.js — LER A PLANILHA DE MEDIÇÃO (.xlsm) e entregar a obra no formato da "versão anterior" (10/11).
//
// A planilha de medição de cada obra (.xlsm) tem tudo: pavimentos e
// locais ("Dados Listas"), os serviços de cada local com quantidade e preço ("Serviços"), os empreiteiros, as medições
// aprovadas ("Medições") e as reprovadas ("Medições reprovadas"). Aqui ela é lida SEM programa nenhum (o .xlsm é um zip de
// XMLs: node:zlib abre) e vira o mesmo objeto que a importação da versão anterior já sabe montar (importarDaAnterior →
// montarObra em medicao-dados.js) — assim o caminho que já bateu centavo a centavo é o mesmo.
// Só lê o VALOR guardado das células (o último calculado pelo Excel); fórmulas e macros não rodam.
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------- zip (o .xlsx/.xlsm é um zip)
function lerZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error("o arquivo não é uma planilha do Excel (.xlsx/.xlsm)");
  const n = buf.readUInt16LE(fim + 10), ini = buf.readUInt32LE(fim + 16), arquivos = new Map();
  let p = ini;
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("planilha danificada (índice do zip)");
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), lnome = buf.readUInt16LE(p + 28), lextra = buf.readUInt16LE(p + 30), lcom = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lnome);
    arquivos.set(nome, { metodo, tam, loc });
    p += 46 + lnome + lextra + lcom;
  }
  return nome => { const a = arquivos.get(nome); if (!a) return null;
    const ln = buf.readUInt16LE(a.loc + 26), le = buf.readUInt16LE(a.loc + 28), dado = buf.subarray(a.loc + 30 + ln + le, a.loc + 30 + ln + le + a.tam);
    return (a.metodo === 8 ? inflateRawSync(dado) : dado).toString("utf8"); };
}

// ---------------------------------------------------------------- XML do Excel (só o necessário)
const ent = s => String(s).replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()]
  ?? (e[1] === "x" || e[1] === "X" ? String.fromCodePoint(parseInt(e.slice(2), 16)) : String.fromCodePoint(+e.slice(1)))));
const atr = (tag, nome) => { const m = tag.match(new RegExp(`\\b${nome}="([^"]*)"`)); return m ? ent(m[1]) : null; };
const textos = xml => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => ent(m[1])).join("");
const colNum = l => [...l].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
const refRC = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); return { c: colNum(m[1]), r: +m[2] }; };
const caminho = (base, alvo) => { if (alvo.startsWith("/")) return alvo.slice(1); const p = base.split("/"); p.pop(); for (const s of alvo.split("/")) { if (/^[.][.]$/.test(s)) p.pop(); else if (s !== ".") p.push(s); } return p.join("/"); };   // caminhos DENTRO do zip da planilha
const rels = (ler, arq) => { const x = ler(arq.replace(/([^/]+)$/, "_rels/$1.rels")) || ""; const m = new Map();
  for (const t of x.match(/<Relationship\b[^>]*>/g) || []) m.set(atr(t, "Id"), { alvo: caminho(arq, atr(t, "Target")), tipo: atr(t, "Type") || "" }); return m; };

/** Abre a planilha: devolve tabela(nomeDaAba, nomeDaTabela) → linhas como objetos (cabeçalho → valor). */
export function abrirPlanilha(buf) {
  const ler = lerZip(buf), wb = ler("xl/workbook.xml"); if (!wb) throw new Error("não é uma planilha do Excel");
  const rw = rels(ler, "xl/workbook.xml"), ss = ler("xl/sharedStrings.xml"), compart = ss ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => textos(m[1])) : [];
  const abas = new Map();
  for (const t of wb.match(/<sheet\b[^>]*>/g) || []) { const r = rw.get(atr(t, "r:id")); if (r) abas.set(atr(t, "name"), r.alvo); }
  const celulas = new Map();
  const grade = aba => {
    if (celulas.has(aba)) return celulas.get(aba);
    const arq = abas.get(aba); if (!arq) throw new Error(`a planilha não tem a aba "${aba}"`);
    const xml = ler(arq) || "", g = new Map();
    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = m[1], dentro = m[2] || "", r = atr(a, "r"); if (!r) continue;
      const t = atr(a, "t"), v = (/<v>([\s\S]*?)<\/v>/.exec(dentro) || [])[1];
      let val = null;
      if (t === "s") val = v != null ? compart[+v] ?? "" : null;
      else if (t === "inlineStr") val = textos(dentro);
      else if (t === "str" || t === "e") val = v != null ? ent(v) : null;
      else if (t === "b") val = v === "1";
      else if (v != null) val = Number(v);
      g.set(r, val);
    }
    celulas.set(aba, { g, arq }); return celulas.get(aba);
  };
  const tabela = (aba, nome) => {
    const { g, arq } = grade(aba);
    let ref = null;
    for (const [, r] of rels(ler, arq)) { if (!/table$/i.test(r.tipo)) continue; const tx = ler(r.alvo) || ""; if (atr(tx.match(/<table\b[^>]*>/)[0], "name") === nome) { ref = atr(tx.match(/<table\b[^>]*>/)[0], "ref"); break; } }
    if (!ref) throw new Error(`a aba "${aba}" não tem a tabela "${nome}"`);
    const [i, f] = ref.split(":").map(refRC), col = c => { let s = ""; for (; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + (c - 1) % 26) + s; return s; };
    const cab = []; for (let c = i.c; c <= f.c; c++) cab.push(String(g.get(col(c) + i.r) ?? "").trim());
    const linhas = [];
    for (let r = i.r + 1; r <= f.r; r++) { const o = {}; let algo = false; cab.forEach((h, k) => { const v = g.get(col(i.c + k) + r); o[h] = v ?? null; if (v != null && v !== "") algo = true; }); if (algo) linhas.push(o); }
    return linhas;
  };
  return { tabela, abas: [...abas.keys()] };
}

// ---------------------------------------------------------------- planilha → obra no formato da "versão anterior"
const txt = v => String(v ?? "").replace(/\s+/g, " ").trim();
const chaveN = v => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const id = (p, ...partes) => p + createHash("sha1").update(partes.map(String).join("|")).digest("hex").slice(0, 10);
const num = v => typeof v === "number" ? v : (v == null || v === "" ? null : Number(String(v).replace(/\./g, "").replace(",", ".")));
const r2 = v => Math.round(v * 100) / 100;
/** Data do Excel (número de dias desde 30/12/1899) ou texto "dd/mm/aaaa" → "aaaa-mm-dd". */
const dataISO = v => {
  if (typeof v === "number" && v > 20000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(txt(v)); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "nov/25" ou data do Excel → "2025-11" (o mês de competência da planilha). */
const mesISO = v => { if (typeof v === "number") return dataISO(v).slice(0, 7); const m = /^([a-zç]{3})\/(\d{2,4})$/i.exec(txt(v)); if (!m) return "";
  const k = MESES.indexOf(chaveN(m[1]).replace("c", "c")); return k < 0 ? "" : `${m[2].length === 2 ? "20" + m[2] : m[2]}-${String(k + 1).padStart(2, "0")}`; };
const docDe = v => { const d = String(typeof v === "number" ? Math.round(v) : v ?? "").replace(/\D/g, ""); return !d ? "" : d.length <= 11 ? d.padStart(11, "0") : d.padStart(14, "0"); };

/** Lê a planilha e devolve a obra `nomeObra` no formato da versão anterior (M) + o resumo para a conferência. */
export function planilhaParaObra(buf, nomeObra, arquivo = "") {
  const P = abrirPlanilha(buf), avisos = [];
  const ehDaObra = v => { const a = chaveN(v), b = chaveN(nomeObra); return !!a && (b.startsWith(a) || a.startsWith(b)); };
  const servs = P.tabela("Serviços", "Tabela_Serviços").filter(r => ehDaObra(r["Obra"]));
  const meds = P.tabela("Medições", "Tabela_Medições").filter(r => ehDaObra(r["Obra"]));
  let reps = []; try { reps = P.tabela("Medições reprovadas", "Tabela_Reprovadas").filter(r => ehDaObra(r["Obra"])); } catch { avisos.push("A planilha não tem a aba de medições reprovadas (seguiu sem elas)."); }
  let pend = []; try { pend = P.tabela("Em aprovação", "Aprovações").filter(r => ehDaObra(r["Obra"])); } catch {}
  if (!servs.length && !meds.length) {
    const obras = [...new Set(P.tabela("Serviços", "Tabela_Serviços").map(r => txt(r["Obra"])).filter(Boolean))];
    throw new Error(`a planilha não tem a obra "${nomeObra}"${obras.length ? ` (tem: ${obras.join(", ")})` : ""}`);
  }
  // pavimentos e locais na ORDEM da planilha ("Dados Listas"); o que só aparece nos serviços entra no fim
  const pavs = [], achaPav = n => { let p = pavs.find(x => chaveN(x.nome) === chaveN(n)); if (!p) pavs.push(p = { nome: txt(n), locais: [] }); return p; };
  try { for (const r of P.tabela("Dados Listas", "Pavimento")) if (ehDaObra(r["Obra"]) && txt(r["Pavimento"])) achaPav(r["Pavimento"]); } catch {}
  try { for (const r of P.tabela("Dados Listas", "Local")) if (ehDaObra(r["Obra"]) && txt(r["Pavimento"]) && txt(r["Local"])) { const p = achaPav(r["Pavimento"]); if (!p.locais.some(l => chaveN(l) === chaveN(r["Local"]))) p.locais.push(txt(r["Local"])); } } catch {}
  // serviços de cada local
  const servicos = [], chServ = r => [r["Pavimento"], r["Local"], r["Tipo"], r["Serviço"]].map(chaveN).join("|"), servDe = new Map();
  for (const r of servs) {
    if (!txt(r["Tipo"]) || !txt(r["Serviço"])) continue;
    const k = chServ(r); if (servDe.has(k)) { avisos.push(`Serviço repetido na planilha: ${txt(r["Pavimento"])} › ${txt(r["Local"])} · ${txt(r["Tipo"])} - ${txt(r["Serviço"])} (ficou o primeiro).`); continue; }
    const p = achaPav(r["Pavimento"]); if (!p.locais.some(l => chaveN(l) === chaveN(r["Local"]))) p.locais.push(txt(r["Local"]));
    const s = { id: id("sv-", k), pavimento: p.nome, local: p.locais.find(l => chaveN(l) === chaveN(r["Local"])), tipo: txt(r["Tipo"]), servico: txt(r["Serviço"]), unidade: txt(r["Unidade"]),
      qtdOrcada: num(r["Quantidade Orçada"]) || null, qtdReal: num(r["Quantidade Real"]) || null, valorUn: num(r["Valor un."]) || 0 };
    servicos.push(s); servDe.set(k, s);
  }
  // preços: a tabela de preços da planilha ("Dados Listas"), e o preço dos serviços para o que não estiver nela
  const precos = [], chP = (t, s) => chaveN(t) + "|" + chaveN(s);
  try { for (const r of P.tabela("Dados Listas", "Tabela5")) { const v = num(r["Valor unitário"]); if (txt(r["Tipo"]) && txt(r["Serviços"]) && v != null) precos.push({ tipo: txt(r["Tipo"]), servico: txt(r["Serviços"]), unidade: txt(r["Unidade"]), valor: v }); } } catch {}
  for (const s of servicos) if (!precos.some(p => chP(p.tipo, p.servico) === chP(s.tipo, s.servico))) precos.push({ tipo: s.tipo, servico: s.servico, unidade: s.unidade, valor: s.valorUn });
  // empreiteiros (CPF/CNPJ vem como número: os zeros da frente voltam)
  const empreiteiros = [], empDe = new Map();
  for (const r of P.tabela("Empreiteiros", "Tabela_Empreiteiros")) { const nome = txt(r["Nome"]); if (!nome) continue;
    const e = { id: id("em-", chaveN(nome)), nome, doc: docDe(r["CPF/CNPJ"]), funcao: txt(r["Função"]).toUpperCase() }; empreiteiros.push(e); empDe.set(chaveN(nome), e); }
  const empDaLinha = nome => { const k = chaveN(nome); if (!k) return null; let e = empDe.get(k);
    if (!e) { e = { id: id("em-", k), nome: txt(nome), doc: "", funcao: "" }; empreiteiros.push(e); empDe.set(k, e); avisos.push(`Empreiteiro "${txt(nome)}" aparece nas medições mas não no cadastro da planilha (entrou sem CPF/CNPJ).`); }
    return e; };
  // medições: aprovadas ("Medições") e reprovadas; a competência é o "Mês/Ano" da planilha
  const medicoes = [], semServ = [];
  const linha = (r, status) => {
    const s = servDe.get(chServ(r)); if (!s) { semServ.push(`${txt(r["Pavimento"])} › ${txt(r["Local"])} · ${txt(r["Tipo"])} - ${txt(r["Serviço"])}`); return; }
    const e = empDaLinha(r["Empreiteiro"]); if (!e) { avisos.push(`Medição sem empreiteiro em ${s.pavimento} › ${s.local} · ${s.servico} (ficou de fora).`); return; }
    let data = dataISO(r["Data medição"]); const mes = mesISO(r["Mês/Ano Medição"]);
    if (!data && mes) data = mes + "-01";
    if (mes && data.slice(0, 7) !== mes) data = mes + "-" + (data.slice(0, 7) > mes ? String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5), 0)).getUTCDate()).padStart(2, "0") : "01");
    if (!data) { avisos.push(`Medição sem data em ${s.pavimento} › ${s.local} · ${s.servico} (ficou de fora).`); return; }
    medicoes.push({ id: id("md-", txt(r["ID Medição"]), status, medicoes.length), lancamento: txt(r["ID Medição"]), servico: s.id, data,
      pct: num(r["% Medido"]) || 0, qtd: num(r["Quant. Medido"]) || 0, valorUn: num(r["Valor un."] ?? r["Valor unitário"]) || s.valorUn, valor: num(r["Valor Medição"]) || 0,
      extra: num(r["Valor Medição Extra"]) || 0, motivoExtra: txt(r["Motivo Medição Extra"]), obs: txt(r["Observações"]), empreiteiro: e.id, status, origem: "planilha",
      ...(status === "reprovada" ? { motivoReprovacao: txt(r["Motivo Reprovação"]) } : {}) });
  };
  meds.forEach(r => linha(r, "aprovada")); reps.forEach(r => linha(r, "reprovada"));
  if (semServ.length) avisos.push(`${semServ.length} medição(ões) de serviço que não está na aba Serviços (ficaram de fora): ${semServ.slice(0, 5).join("; ")}${semServ.length > 5 ? "…" : ""}`);
  if (pend.length) avisos.push(`${pend.length} medição(ões) "Em aprovação" na planilha NÃO entram (aprove ou reprove na planilha antes, ou lance no sistema depois).`);
  // o resumo para conferir antes de gravar (só as aprovadas contam no total)
  const ok = medicoes.filter(m => m.status === "aprovada"), soma = l => r2(l.reduce((a, m) => a + m.valor + m.extra, 0));
  const totalPlanilha = r2(meds.reduce((a, r) => a + (num(r["Valor Medição"]) || 0) + (num(r["Valor Medição Extra"]) || 0), 0));
  const porMes = {}, porEmp = {};
  for (const m of ok) { const k = m.data.slice(0, 7); porMes[k] = r2((porMes[k] || 0) + m.valor + m.extra); const e = empreiteiros.find(x => x.id === m.empreiteiro); porEmp[e.nome] = r2((porEmp[e.nome] || 0) + m.valor + m.extra); }
  const M = { obra: "", nome: nomeObra, fonte: { arquivo, importadoEm: null, totalPlanilha }, precos, empreiteiros, servicos, medicoes, boletins: [], historico: [], pavimentos: pavs };
  return { M, resumo: { pavimentos: pavs.length, locais: pavs.reduce((a, p) => a + p.locais.length, 0), servicos: servicos.length, empreiteiros: empreiteiros.length,
    medicoes: ok.length, reprovadas: medicoes.length - ok.length, total: soma(ok), totalPlanilha, porMes, porEmp, avisos,
    ultimaData: ok.map(m => m.data).sort().pop() || "" } };
}
