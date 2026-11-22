// medicao-detalhes.js — os DETALHES de cada linha do Histórico da medição.
// Toda gravação da obra passa por gravarObra (medicao-dados.js), que compara a obra ANTES com a obra DEPOIS e guarda aqui,
// em palavras, o que mudou: o que entrou, o que saiu e o que foi alterado (de → para), com os nomes de pavimento, local,
// serviço, empreiteiro e boletim. Não depende de cada função lembrar de anotar: a comparação pega tudo.
// Função pura: recebe as duas versões e os nomes (catálogo e empreiteiros) e devolve uma lista de frases.

const LIMITE = 400;                                                     // uma importação grande não vira um histórico gigante
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = v => (Number(v || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const num = v => v == null || v === "" ? "vazio" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dia = s => s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—";
const txt = v => v == null || v === "" ? "vazio" : `“${String(v).length > 160 ? String(v).slice(0, 160) + "…" : v}”`;
const porId = lista => new Map((lista || []).map(x => [x.id, x]));
const vivo = x => x && !x.removido;

/** As frases do que mudou entre A (antes) e B (depois). nomes = { cat: Map(id → {tipo, servico, unidade}), emp: Map(id → nome) }. */
export function detalhar(A, B, nomes = {}) {
  const out = [], diz = s => out.push(s);
  if (!A) return [`Obra criada: ${(B.pavimentos || []).length} pavimento(s), ${(B.locais || []).length} local(is), ${(B.itens || []).length} serviço(s) nos locais, ${(B.boletins || []).length} boletim(ns).`];
  const cat = nomes.cat || new Map(), emp = nomes.emp || new Map();
  const pav = id => ((porId(B.pavimentos).get(id) || porId(A.pavimentos).get(id) || {}).nome) || "?";
  const grp = id => id ? (((porId(B.grupos).get(id) || porId(A.grupos).get(id) || {}).nome) || "?") : "sem grupo";
  const loc = id => { const l = porId(B.locais).get(id) || porId(A.locais).get(id); return l ? `${pav(l.pav)} › ${l.nome}` : "?"; };
  const serv = c => { const s = cat.get(c); return s ? `${s.tipo} — ${s.servico}` : "serviço ?"; };
  const item = id => { const i = porId(B.itens).get(id) || porId(A.itens).get(id); return i ? `${serv(i.cat)} em ${loc(i.local)}` : "serviço ?"; };
  const bol = b => `Boletim nº ${b.numero || "?"} · ${emp.get(b.emp) || "?"} · ${b.mes ? b.mes.slice(5) + "/" + b.mes.slice(0, 4) : "?"}`;

  // compara uma lista com id: entrou / saiu (ou marcado removido) / campos alterados
  const lista = (nome, campos, desc, novo) => {
    const a = porId(A[nome]), b = porId(B[nome]);
    for (const [id, x] of b) {
      const y = a.get(id);
      if (!vivo(y) && vivo(x)) { diz(`+ ${novo ? novo(x) : desc(x)}`); continue; }
      if (vivo(y) && !vivo(x)) { diz(`− Removido: ${desc(x)}`); continue; }
      if (!vivo(x)) continue;
      for (const [k, rot, fmt = txt] of campos) if (JSON.stringify(y[k] ?? null) !== JSON.stringify(x[k] ?? null)) diz(`${desc(x)} — ${rot}: ${fmt(y[k])} → ${fmt(x[k])}`);
    }
    for (const [id, y] of a) if (!b.has(id) && vivo(y)) diz(`− Removido: ${desc(y)}`);
  };
  lista("grupos", [["nome", "nome"], ["ordem", "posição", num]], g => `Grupo “${g.nome}”`);
  lista("pavimentos", [["nome", "nome"], ["ordem", "posição", num], ["grupo", "grupo", v => `“${grp(v)}”`]], p => `Pavimento “${p.nome}”`);
  lista("locais", [["nome", "nome"], ["ordem", "posição", num], ["pav", "pavimento", v => `“${pav(v)}”`], ["modelo", "modelo"]], l => `Local ${loc(l.id)}`);
  lista("modelos", [["nome", "nome"]], m => `Modelo “${m.nome}”`, m => `Modelo novo “${m.nome}” (${(m.itens || []).length} serviço(s))`);
  { // os serviços dos modelos (lista dentro do modelo)
    const a = porId(A.modelos), qtds = m => new Map((m.itens || []).map(x => [x.cat, x.qtd]));
    for (const m of B.modelos || []) { const y = a.get(m.id); if (!vivo(y) || !vivo(m)) continue; const qa = qtds(y), qb = qtds(m);
      for (const [c, q] of qb) if (!qa.has(c)) diz(`Modelo “${m.nome}”: + ${serv(c)} (${num(q)})`); else if (qa.get(c) !== q) diz(`Modelo “${m.nome}”: ${serv(c)} — quantidade ${num(qa.get(c))} → ${num(q)}`);
      for (const [c] of qa) if (!qb.has(c)) diz(`Modelo “${m.nome}”: − ${serv(c)}`); }
  }
  lista("itens", [["qtdPrev", "quantidade prevista", num], ["qtdReal", "quantidade real", num]], i => item(i.id),
    i => `${item(i.id)} — previsto ${num(i.qtdPrev)}, real ${num(i.qtdReal)}${i.modelo ? " (pelo modelo)" : ""}`);
  { // preços (sem id: cada preço novo é uma linha nova)
    const k = p => `${p.cat}|${p.desde}|${p.em}`, a = new Map((A.precos || []).map(p => [k(p), p]));
    for (const p of B.precos || []) { const y = a.get(k(p)); if (!y && vivo(p)) diz(`+ Preço de ${serv(p.cat)}: ${brl(p.valor)} a partir de ${dia(p.desde)}`); else if (y && vivo(y) && !vivo(p)) diz(`− Preço removido: ${serv(p.cat)} ${brl(p.valor)} de ${dia(p.desde)}`); }
  }
  { // empreiteiros habilitados nesta obra (equipe)
    const a = new Set(A.equipe || []), b = new Set(B.equipe || []);
    for (const e of b) if (!a.has(e)) diz(`+ Empreiteiro na obra: ${emp.get(e) || "?"}`);
    for (const e of a) if (!b.has(e)) diz(`− Empreiteiro tirado da obra: ${emp.get(e) || "?"}`);
  }
  // boletins: situação, linhas, extras, observações, notas, fotos, versões, assinatura e envios
  const a = porId(A.boletins);
  for (const x of B.boletins || []) {
    const y = a.get(x.id), nm = bol(x);
    if (!y) { diz(`+ ${nm} (novo)`); }
    const ya = y || { itens: [], extras: [], versoes: [], notas: {}, fotos: [], envios: [] };
    if (y && y.status !== x.status) diz(`${nm} — situação: ${y.status} → ${x.status}`);
    const li = porId(ya.itens), lb = porId(x.itens);
    for (const [id, l] of lb) { const o = li.get(id);
      if (!o) diz(`${nm}: + ${item(l.item)} — ${pct(l.pct)} (${num(l.qtd)}) = ${brl(l.valor)}`);
      else if (o.pct !== l.pct || o.valor !== l.valor) diz(`${nm}: ${item(l.item)} — ${pct(o.pct)} (${brl(o.valor)}) → ${pct(l.pct)} (${brl(l.valor)})`); }
    for (const [id, o] of li) if (!lb.has(id)) diz(`${nm}: − ${item(o.item)} — ${pct(o.pct)} = ${brl(o.valor)}`);
    const ei = porId(ya.extras), eb = porId(x.extras), dExt = e => e.item ? `extra em ${item(e.item)} (${e.motivo || "sem motivo"})` : `extra “${e.descricao || e.categoria || "—"}”${e.local ? " em " + loc(e.local) : ""}`;
    for (const [id, e] of eb) { const o = ei.get(id);
      if (!o) diz(`${nm}: + ${dExt(e)} — ${brl(e.valor)} (${e.motivo || "sem motivo"})`);
      else { if (o.valor !== e.valor) diz(`${nm}: ${dExt(e)} — valor ${brl(o.valor)} → ${brl(e.valor)}`); if ((o.nota || "") !== (e.nota || "")) diz(`${nm}: ${dExt(e)} — observação: ${txt(o.nota)} → ${txt(e.nota)}`);
        if ((o.fotos || []).length !== (e.fotos || []).length) diz(`${nm}: ${dExt(e)} — fotos: ${(o.fotos || []).length} → ${(e.fotos || []).length}`); } }
    for (const [id, o] of ei) if (!eb.has(id)) diz(`${nm}: − ${dExt(o)} — ${brl(o.valor)}`);
    if (y && (y.obs || "") !== (x.obs || "")) diz(`${nm} — observação geral: ${txt(y.obs)} → ${txt(x.obs)}`);
    const na = ya.notas || {}, nb = x.notas || {}, alvo = k => k.startsWith("i:") ? item(k.slice(2).split("|")[0]) : `extra ${k.slice(2)}`;
    for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) { const o = na[k] || {}, n = nb[k] || {};
      if ((o.obs || "") !== (n.obs || "")) diz(`${nm}: ${alvo(k)} — observação: ${txt(o.obs)} → ${txt(n.obs)}`);
      if ((o.fotos || []).length !== (n.fotos || []).length) diz(`${nm}: ${alvo(k)} — fotos: ${(o.fotos || []).length} → ${(n.fotos || []).length}`); }
    if ((ya.fotos || []).length !== (x.fotos || []).length) diz(`${nm} — fotos do boletim: ${(ya.fotos || []).length} → ${(x.fotos || []).length}`);
    for (const ap of (x.aprovacoes || []).slice((ya.aprovacoes || []).length)) diz(`${nm} — aprovado (${ap.etapa}) por ${ap.por}`);
    for (const dv of (x.devolucoes || []).slice((ya.devolucoes || []).length)) diz(`${nm} — devolvido (${dv.etapa}) por ${dv.por}: ${txt(dv.motivo)}`);
    for (const re of (x.reaberturas || []).slice((ya.reaberturas || []).length)) diz(`${nm} — reaberto (estava ${re.de}): ${re.motivo || ""}`);
    const va = ya.versoes || [], vb = x.versoes || [];
    for (const v of vb.slice(va.length)) diz(`${nm} — versão ${v.n} aprovada e congelada${v.codigo ? " (código " + v.codigo + ")" : ""}`);
    vb.forEach((v, i) => { const o = va[i] || {};
      if (v.assinatura && !o.assinatura) diz(`${nm} — assinado pelo empreiteiro (${v.assinatura.nome}), colhido por ${v.assinatura.coletadoPor}`);
      for (const en of (v.envios || []).slice((o.envios || []).length)) diz(`${nm} — enviado (${en.canal || "?"}${en.para ? " para " + en.para : ""})`); });
    if (out.length > LIMITE) break;
  }
  for (const y of A.boletins || []) if (!(B.boletins || []).some(x => x.id === y.id)) diz(`− ${bol(y)} (apagado)`);
  if (out.length > LIMITE) return [...out.slice(0, LIMITE), `… e mais ${out.length - LIMITE} alteração(ões).`];
  return out;
}
