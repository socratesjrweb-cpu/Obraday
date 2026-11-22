// medicoes-gravar.js — o que a engenharia LANÇA nas medições de obra (etapa 2, 16/10/2026).
//
// O fluxo combinado com a engenharia (16/10):
//   1. LANÇAR — quem tem o setor Obras lança: serviço, % medido, data, um ou mais empreiteiros com a parte de cada um
//      (50/50 é o comum, mas qualquer proporção), extra com motivo obrigatório. A TRAVA conta o que já está aprovado E o
//      que está na fila: nenhum serviço passa de 100%.
//   2. APROVAR — duas etapas, com nome e hora: a engenharia e depois a Diretoria, que dá a final.
//      Reprovar exige o motivo, em qualquer etapa.
//   3. BOLETIM — por empreiteiro e mês, só com medição aprovada lançada pelo sistema. Número em sequência POR EMPREITEIRO
//      nesta obra. Ao fechar, o boletim guarda a fotografia dos itens e valores: o PDF sai sempre dela (congelado).
// Toda alteração vai para o histórico (quem e quando) e nada some.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { DIR_SETORES } from "../ponte-engenharia.js";
import { isoLocal, agoraLocalISO } from "../ponte-engenharia.js";

const PASTA = join(DIR_SETORES, "medicoes");
const arq = obra => join(PASTA, `med-${obra}.json`);
const quem = user => (user && (user.nome || user.usuario)) || "?";
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const id = p => p + randomBytes(5).toString("hex");
const r2 = v => Math.round(v * 100) / 100;
const OBRA_OK = o => /^[a-z0-9-]{2,40}$/.test(String(o || ""));

// QUEM APROVA: a 1Âª etapa Ã© do Gerente de Engenharia (perfil) ou dos logins abaixo; a final Ã© da Diretoria.
export const APROVA_ENGENHARIA = [];   // logins extras que aprovam (o normal é o perfil "Gerente de Engenharia")
const perfilN = u => String((u && (u.perfilMedicao || u.perfil)) || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const papel = user => ({
  engenharia: !!user && (APROVA_ENGENHARIA.includes(user.usuario) || perfilN(user).startsWith("gerente")),   // 12/11: perfil "Gerente de Engenharia"
  diretoria: !!user && (user.nivel === "master" || perfilN(user) === "diretoria"),
});
/** Os estados de uma medição. "em aprovação" e "aguardando diretoria" contam na trava de 100%. */
export const NA_FILA = ["em aprovação", "aguardando diretoria"];

/** Lê um número escrito à brasileira ("1.234,56", "50", "33,3"). null = vazio · NaN = não entendi. */
export function lerNumero(t) {
  const s0 = String(t ?? "").trim().replace(/^R\$\s*/i, "").replace(/%$/, "").replace(/\s/g, "");
  if (!s0) return null;
  if (!/^-?[\d.,]+$/.test(s0)) return NaN;
  const s = s0.includes(",") ? s0.replace(/\./g, "").replace(",", ".") : (s0.match(/\./g) || []).length > 1 ? s0.replace(/\./g, "") : s0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function abrir(obra) {
  if (!OBRA_OK(obra)) return null;
  try { const M = JSON.parse(readFileSync(arq(obra), "utf8")); M.boletins ||= []; M.historico ||= []; return M; } catch { return null; }
}
function gravar(obra, M, user, txt) {
  M.historico.push({ em: agoraLocalISO().slice(0, 16).replace("T", " "), por: quem(user), txt });
  const tmp = arq(obra) + ".tmp"; writeFileSync(tmp, JSON.stringify(M, null, 1)); renameSync(tmp, arq(obra));
}
const descServico = s => `${s.pavimento} · ${s.local} · ${s.tipo} — ${s.servico}`;

/** Quanto do serviço já está medido ou na fila (0 a 1). É a conta da trava. */
export function acumulado(M, servico) {
  return M.medicoes.filter(m => m.servico === servico && (m.status === "aprovada" || NA_FILA.includes(m.status))).reduce((a, m) => a + (m.pct || 0), 0);
}

// ---------- 1. lançar ----------
export function lancarMedicao(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const s = M.servicos.find(x => x.id === f.servico);
  if (!s) return { erro: "Escolha o serviço que foi medido." };
  const P = lerNumero(f.pct);
  if (P == null || Number.isNaN(P) || P <= 0) return { erro: "Escreva o % medido (por exemplo 50)." };
  const falta = Math.max(0, 1 - acumulado(M, s.id));
  if (P / 100 > falta + 1e-9) return { erro: `Passa de 100%: desse serviço só falta medir ${(falta * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (contando o que está esperando aprovação).` };
  const data = String(f.data || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Escolha a data da medição." };
  if (data > isoLocal()) return { erro: "A data da medição não pode ser no futuro." };
  // os empreiteiros e a parte de cada um (até 3)
  const partes = [];
  for (const k of ["1", "2", "3"]) {
    const e = String(f["emp" + k] || ""); if (!e) continue;
    if (!M.empreiteiros.some(x => x.id === e)) return { erro: "Empreiteiro não encontrado no cadastro desta obra." };
    if (partes.some(p => p.e === e)) return { erro: "O mesmo empreiteiro foi escolhido duas vezes." };
    const q = lerNumero(f["parte" + k]);
    partes.push({ e, q: q == null ? null : q });
  }
  if (!partes.length) return { erro: "Escolha o empreiteiro." };
  if (partes.length === 1 && partes[0].q == null) partes[0].q = 100;
  if (partes.some(p => p.q == null || Number.isNaN(p.q) || p.q <= 0)) return { erro: "Escreva a parte (%) de cada empreiteiro." };
  const soma = partes.reduce((a, p) => a + p.q, 0);
  if (Math.abs(soma - 100) > 0.01) return { erro: `As partes dos empreiteiros somam ${soma.toLocaleString("pt-BR")}% — têm de somar 100%.` };
  const extra = lerNumero(f.extra);
  if (extra != null && (Number.isNaN(extra) || extra < 0)) return { erro: "O valor extra não está certo." };
  const motivoExtra = String(f.motivoExtra || "").trim().slice(0, 300);
  if (extra && !motivoExtra) return { erro: "Medição extra precisa do motivo." };
  const obs = String(f.obs || "").trim().slice(0, 500);
  const lanc = id("L"), em = agoraLocalISO();
  for (const p of partes) {
    const pct = P / 100 * p.q / 100, qtd = s.quantidade * pct;
    M.medicoes.push({ id: id("md-"), lancamento: lanc, servico: s.id, data, pct, qtd, valorUn: s.valorUn, valor: r2(qtd * s.valorUn), extra: r2((extra || 0) * p.q / 100),
      motivoExtra, obs, empreiteiro: p.e, status: "em aprovação", origem: "sistema", lancadoPor: quem(user), lancadoEm: em, aprovacoes: [] });
  }
  const valor = r2(s.quantidade * P / 100 * s.valorUn);
  gravar(obra, M, user, `Lançou ${P.toLocaleString("pt-BR")}% de ${descServico(s)} (${brl(valor)}${extra ? " + extra " + brl(extra) : ""}) — ${partes.map(p => (M.empreiteiros.find(x => x.id === p.e) || {}).nome + " " + p.q.toLocaleString("pt-BR") + "%").join(", ")}`);
  return { ok: true, lancamento: lanc };
}

// ---------- 2. aprovar / reprovar ----------
export function aprovarLancamento(obra, lancamento, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const ms = M.medicoes.filter(m => m.lancamento === lancamento && m.origem === "sistema");
  if (!ms.length) return { erro: "Lançamento não encontrado." };
  const st = ms[0].status, P = papel(user), em = agoraLocalISO();
  let etapa;
  if (st === "em aprovação") { if (!P.engenharia) return { erro: "A primeira aprovação é da engenharia." }; etapa = "engenharia"; }
  else if (st === "aguardando diretoria") { if (!P.diretoria) return { erro: "A aprovação final é da Diretoria." }; etapa = "diretoria"; }
  else return { erro: "Este lançamento já foi " + st + "." };
  for (const m of ms) { m.aprovacoes.push({ etapa, por: quem(user), em }); m.status = etapa === "engenharia" ? "aguardando diretoria" : "aprovada"; }
  const s = M.servicos.find(x => x.id === ms[0].servico) || {};
  gravar(obra, M, user, `${etapa === "engenharia" ? "Aprovou (engenharia)" : "Aprovou (final)"}: ${descServico(s)} — ${brl(ms.reduce((a, m) => a + m.valor + m.extra, 0))}`);
  return { ok: true };
}

export function reprovarLancamento(obra, lancamento, motivo, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const ms = M.medicoes.filter(m => m.lancamento === lancamento && m.origem === "sistema");
  if (!ms.length) return { erro: "Lançamento não encontrado." };
  motivo = String(motivo || "").trim().slice(0, 300);
  if (motivo.length < 5) return { erro: "Para reprovar, escreva o motivo." };
  const st = ms[0].status, P = papel(user);
  if (!NA_FILA.includes(st)) return { erro: "Este lançamento já foi " + st + "." };
  if (st === "em aprovação" && !(P.engenharia || P.diretoria)) return { erro: "Quem reprova é a engenharia ou a Diretoria." };
  if (st === "aguardando diretoria" && !P.diretoria) return { erro: "Nesta etapa, quem reprova é a Diretoria." };
  const em = agoraLocalISO(), etapa = st === "em aprovação" ? "engenharia" : "diretoria";
  for (const m of ms) { m.status = "reprovada"; m.motivoReprovacao = motivo; m.reprovacao = { etapa, por: quem(user), em, motivo }; }
  const s = M.servicos.find(x => x.id === ms[0].servico) || {};
  gravar(obra, M, user, `Reprovou (${etapa}): ${descServico(s)} — motivo: ${motivo}`);
  return { ok: true };
}

// ---------- 3. boletim ----------
/** As medições aprovadas, lançadas pelo sistema, que ainda não entraram em boletim — agrupadas por empreiteiro e mês. */
export function boletinsAFechar(M) {
  const g = {};
  for (const m of M.medicoes) {
    if (m.origem !== "sistema" || m.status !== "aprovada" || m.boletim) continue;
    const k = m.empreiteiro + "|" + (m.data || "").slice(0, 7), b = g[k] ||= { emp: m.empreiteiro, mes: (m.data || "").slice(0, 7), valor: 0, extra: 0, itens: 0 };
    b.valor += m.valor; b.extra += m.extra; b.itens++;
  }
  return Object.values(g).map(b => ({ ...b, numero: proximoNumero(M, b.emp) }));
}
const proximoNumero = (M, emp) => 1 + M.boletins.filter(b => b.emp === emp).reduce((a, b) => Math.max(a, b.numero), 0);

export function fecharBoletim(obra, emp, mes, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const P = papel(user);
  if (!(P.engenharia || P.diretoria)) return { erro: "Quem fecha o boletim é a engenharia ou a Diretoria." };
  const ms = M.medicoes.filter(m => m.origem === "sistema" && m.status === "aprovada" && !m.boletim && m.empreiteiro === emp && (m.data || "").slice(0, 7) === mes);
  if (!ms.length) return { erro: "Nada aprovado para fechar neste boletim." };
  const e = M.empreiteiros.find(x => x.id === emp) || {}, numero = proximoNumero(M, emp), bid = id("bl-");
  const sv = Object.fromEntries(M.servicos.map(s => [s.id, s]));
  const itens = ms.slice().sort((a, b) => String(a.data).localeCompare(String(b.data))).map(m => { const s = sv[m.servico] || {};
    return { medicao: m.id, data: m.data, pavimento: s.pavimento, local: s.local, tipo: s.tipo, servico: s.servico, unidade: s.unidade, pct: m.pct, qtd: m.qtd, valorUn: m.valorUn,
      valor: m.valor, extra: m.extra, motivoExtra: m.motivoExtra, obs: m.obs, lancadoPor: m.lancadoPor, aprovacoes: m.aprovacoes }; });
  const valor = r2(ms.reduce((a, m) => a + m.valor, 0)), extra = r2(ms.reduce((a, m) => a + m.extra, 0));
  M.boletins.push({ id: bid, numero, emp, empNome: e.nome, empDoc: e.doc, empFuncao: e.funcao, mes, itens, valor, extra, total: r2(valor + extra), fechadoPor: quem(user), fechadoEm: agoraLocalISO() });
  for (const m of ms) m.boletim = bid;
  gravar(obra, M, user, `Fechou o boletim nº ${numero} de ${e.nome} (${mes.slice(5)}/${mes.slice(0, 4)}) — ${brl(valor + extra)}, ${ms.length} ite${ms.length > 1 ? "ns" : "m"}`);
  return { ok: true, id: bid, numero };
}

// ---------- cadastro de empreiteiro ----------
export function novoEmpreiteiro(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const nome = String(f.nome || "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (nome.length < 3) return { erro: "Escreva o nome do empreiteiro." };
  const doc = String(f.doc || "").replace(/\D/g, "");
  if (![11, 14].includes(doc.length)) return { erro: "CPF tem 11 números e CNPJ tem 14." };
  const k = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (M.empreiteiros.some(e => k(e.nome) === k(nome))) return { erro: "Já existe um empreiteiro com esse nome nesta obra." };
  if (M.empreiteiros.some(e => e.doc === doc)) return { erro: "Esse CPF/CNPJ já está no cadastro desta obra." };
  const funcao = String(f.funcao || "").trim().toUpperCase().slice(0, 60);
  M.empreiteiros.push({ id: id("em-"), nome, doc, funcao, cadastradoPor: quem(user), cadastradoEm: agoraLocalISO() });
  gravar(obra, M, user, `Cadastrou o empreiteiro ${nome}${funcao ? " (" + funcao + ")" : ""}`);
  return { ok: true };
}

// ---------- CADASTRO (16/10): pavimentos, locais, serviços e a tabela de preços — o que a planilha fazia em
// "Cadastro Serviços" e "Dados Listas", agora no sistema, para a engenharia não depender mais dela. ----------
const txt = t => String(t ?? "").replace(/\s+/g, " ").trim();
/** A MESMA chave do importador (importar_medicoes.py): sem acento, maiúsculas, "|" entre as partes, sha1 — assim um
 *  serviço cadastrado aqui e um que veio da planilha nunca se repetem. */
export const chaveDe = (...partes) => createHash("sha1").update(partes.map(p => txt(p).normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toUpperCase()).join("|")).digest("hex").slice(0, 10);
const lista = v => v == null ? [] : [].concat(v).map(txt).filter(Boolean);
/** "Torre A - Tipo 03" → "Torre A - Tipo": o que vem antes do 1º número. É a regra da planilha para repetir nos pavimentos-tipo. */
export const prefixoTipo = p => { const m = txt(p).match(/^(.*?)\d/); return m ? m[1].trim() : null; };
const medido = (M, sid) => M.medicoes.some(m => m.servico === sid && m.status !== "reprovada");
const recalcula = s => { s.quantidade = s.qtdReal > 0 ? s.qtdReal : (s.qtdOrcada || 0); s.valorTotal = s.quantidade * s.valorUn; };
const precoDe = (M, tipo, servico) => M.precos.find(p => !p.removido && chaveDe(p.tipo, p.servico) === chaveDe(tipo, servico));
export const podePreco = user => { const P = papel(user); return P.engenharia || P.diretoria; };

export function novoPavimento(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  M.pavimentos ||= [];
  const nome = txt(f.nome).slice(0, 80);
  if (nome.length < 2) return { erro: "Escreva o nome do pavimento." };
  if (M.pavimentos.some(p => chaveDe(p.nome) === chaveDe(nome))) return { erro: `O pavimento "${nome}" já existe.` };
  M.pavimentos.push({ nome, locais: [], cadastradoPor: quem(user), cadastradoEm: agoraLocalISO() });
  gravar(obra, M, user, `Cadastrou o pavimento ${nome}`);
  return { ok: true, pav: nome };
}

export function novoLocal(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const nome = txt(f.nome).slice(0, 80), pavs = lista(f.pav);
  if (nome.length < 2) return { erro: "Escreva o nome do local." };
  if (!pavs.length) return { erro: "Escolha em que pavimento(s) fica o local." };
  const feitos = [];
  for (const pn of pavs) {
    const p = (M.pavimentos || []).find(x => x.nome === pn); if (!p) return { erro: `Pavimento não encontrado: ${pn}` };
    if (!p.locais.some(l => chaveDe(l) === chaveDe(nome))) { p.locais.push(nome); feitos.push(pn); }
  }
  if (!feitos.length) return { erro: `"${nome}" já existe nesse(s) pavimento(s).` };
  gravar(obra, M, user, `Cadastrou o local ${nome} em ${feitos.join(", ")}`);
  return { ok: true, pav: pavs[0], local: nome };
}

/** Cadastrar serviços num local — em um pavimento ou repetido em vários (os pavimentos-tipo). Cada linha: um serviço da
 *  tabela de preços + quantidade orçada e/ou real. Serviço que já existe ali: só ganha a quantidade real, se estiver vazia
 *  (a regra da planilha). Linhas repetidas na mesma entrada: recusa tudo. */
export function cadastrarServicos(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const pavs = lista(f.pav), local = txt(f.local);
  if (!pavs.length) return { erro: "Escolha o pavimento." };
  if (!local) return { erro: "Escolha o local." };
  for (const pn of pavs) if (!(M.pavimentos || []).some(p => p.nome === pn)) return { erro: `Pavimento não encontrado: ${pn}` };
  const linhas = [];
  for (let i = 1; i <= 15; i++) {
    const ps = txt(f["ps" + i]); if (!ps) continue;
    const p = M.precos.find(x => !x.removido && chaveDe(x.tipo, x.servico) === ps);
    if (!p) return { erro: `Linha ${i}: serviço não está na tabela de preços desta obra.` };
    const qo = lerNumero(f["qo" + i]), qr = lerNumero(f["qr" + i]);
    if ([qo, qr].some(v => v != null && (Number.isNaN(v) || v < 0))) return { erro: `Linha ${i} (${p.servico}): quantidade não está certa.` };
    if (!(qo > 0) && !(qr > 0)) return { erro: `Linha ${i} (${p.servico}): escreva a quantidade orçada ou a real.` };
    if (linhas.some(l => l.p === p)) return { erro: `"${p.tipo} — ${p.servico}" está duas vezes na lista. Nada foi lançado.` };
    linhas.push({ p, qo, qr });
  }
  if (!linhas.length) return { erro: "Escolha ao menos um serviço." };
  let novos = 0, atualizados = 0, locaisNovos = 0;
  const em = agoraLocalISO();
  for (const pn of pavs) {
    const pav = M.pavimentos.find(p => p.nome === pn);
    if (!pav.locais.some(l => l === local)) { pav.locais.push(local); locaisNovos++; }
    for (const { p, qo, qr } of linhas) {
      const sid = "sv-" + chaveDe(pn, local, p.tipo, p.servico), s = M.servicos.find(x => x.id === sid);
      if (s && !s.removido) {
        if (qr > 0 && !(s.qtdReal > 0)) { s.qtdReal = qr; recalcula(s); atualizados++; }
        continue;
      }
      if (s && s.removido) {                                 // tinha sido removido: volta com as quantidades novas
        Object.assign(s, { qtdOrcada: qo || null, qtdReal: qr || null, valorUn: p.valor, unidade: p.unidade }); delete s.removido; recalcula(s); novos++; continue;
      }
      const n = { id: sid, pavimento: pn, local, tipo: p.tipo, servico: p.servico, unidade: p.unidade, qtdOrcada: qo || null, qtdReal: qr || null, valorUn: p.valor, cadastradoPor: quem(user), cadastradoEm: em };
      recalcula(n); M.servicos.push(n); novos++;
    }
  }
  if (!novos && !atualizados) return { erro: "Nada mudou: esses serviços já estão cadastrados aí (e com a quantidade real)." };
  gravar(obra, M, user, `Cadastrou ${linhas.map(l => l.p.servico).join(", ")} em ${local} — ${pavs.length > 1 ? pavs.length + " pavimentos (" + pavs[0] + " a " + pavs[pavs.length - 1] + ")" : pavs[0]}: ${novos} novo(s), ${atualizados} com a quantidade real preenchida${locaisNovos ? `, local criado em ${locaisNovos} pavimento(s)` : ""}`);
  return { ok: true, novos, atualizados, pav: pavs[0], local };
}

/** Quantidade de um serviço já cadastrado: livre enquanto não tem medição; depois, só preencher a real se estiver vazia. */
export function salvarQuantidade(obra, f, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const s = M.servicos.find(x => x.id === f.id && !x.removido); if (!s) return { erro: "Serviço não encontrado." };
  const qo = lerNumero(f.qo), qr = lerNumero(f.qr);
  if ([qo, qr].some(v => v != null && (Number.isNaN(v) || v < 0))) return { erro: "Quantidade não está certa." };
  if (!(qo > 0) && !(qr > 0)) return { erro: "Escreva a quantidade orçada ou a real." };
  const antes = s.quantidade;
  if (medido(M, s.id)) {
    if (s.qtdReal > 0 || (qo || null) !== (s.qtdOrcada || null)) return { erro: "Este serviço já tem medição: só dá para preencher a quantidade real, e só se ela estiver vazia." };
    s.qtdReal = qr || null;
  } else { s.qtdOrcada = qo || null; s.qtdReal = qr || null; }
  recalcula(s);
  if (s.quantidade === antes) return { ok: true, igual: true, pav: s.pavimento, local: s.local };
  gravar(obra, M, user, `Quantidade de ${s.pavimento} · ${s.local} · ${s.servico}: ${antes.toLocaleString("pt-BR")} → ${s.quantidade.toLocaleString("pt-BR")} ${s.unidade}`);
  return { ok: true, pav: s.pavimento, local: s.local };
}

export function removerServico(obra, sid, user) {
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const s = M.servicos.find(x => x.id === sid && !x.removido); if (!s) return { erro: "Serviço não encontrado." };
  if (medido(M, s.id)) return { erro: "Este serviço já tem medição — não dá para remover." };
  s.removido = { por: quem(user), em: agoraLocalISO() };
  gravar(obra, M, user, `Removeu ${s.pavimento} · ${s.local} · ${s.tipo} — ${s.servico}`);
  return { ok: true, pav: s.pavimento, local: s.local };
}

/** O preço de um serviço da tabela DESTA obra. Como na planilha, vale para todos os serviços cadastrados com ele; as
 *  medições já feitas ficam com o preço da época (cada uma guardou o seu). Guarda o histórico do preço. */
export function salvarPreco(obra, f, user) {
  if (!podePreco(user)) return { erro: "Quem muda preço é a engenharia ou a Diretoria." };
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const p = M.precos.find(x => !x.removido && chaveDe(x.tipo, x.servico) === f.k); if (!p) return { erro: "Serviço não encontrado na tabela." };
  const v = lerNumero(f.valor);
  if (v == null || Number.isNaN(v) || v <= 0) return { erro: "Escreva o preço (por exemplo 35,00)." };
  if (Math.abs(v - p.valor) < 0.005) return { ok: true, igual: true };
  (p.historico ||= []).push({ valor: p.valor, ate: agoraLocalISO(), por: quem(user) });
  const antes = p.valor; p.valor = v;
  let n = 0;
  for (const s of M.servicos) if (!s.removido && chaveDe(s.tipo, s.servico) === f.k) { s.valorUn = v; recalcula(s); n++; }
  gravar(obra, M, user, `Preço de ${p.tipo} — ${p.servico}: ${brl(antes)} → ${brl(v)} por ${p.unidade} (${n} serviço(s) cadastrado(s) passam a valer o novo preço; medições já feitas não mudam)`);
  return { ok: true, n };
}

export function novoPreco(obra, f, user) {
  if (!podePreco(user)) return { erro: "Quem mexe na tabela de preços é a engenharia ou a Diretoria." };
  const M = abrir(obra); if (!M) return { erro: "Obra sem medições no sistema." };
  const tipo = txt(f.tipo).slice(0, 60), servico = txt(f.servico).slice(0, 100), unidade = txt(f.unidade).slice(0, 10), v = lerNumero(f.valor);
  if (tipo.length < 2 || servico.length < 2) return { erro: "Escreva o tipo e o serviço." };
  if (!unidade) return { erro: "Escreva a unidade (m2, un, m…)." };
  if (v == null || Number.isNaN(v) || v <= 0) return { erro: "Escreva o preço." };
  if (precoDe(M, tipo, servico)) return { erro: `"${tipo} — ${servico}" já está na tabela desta obra.` };
  M.precos.push({ tipo, servico, unidade, valor: v, cadastradoPor: quem(user), cadastradoEm: agoraLocalISO() });
  gravar(obra, M, user, `Acrescentou à tabela de preços: ${tipo} — ${servico}, ${brl(v)} por ${unidade}`);
  return { ok: true };
}
