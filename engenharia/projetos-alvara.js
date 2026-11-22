// projetos-alvara.js — VENCIMENTO DOS ALVARÁS DE CONSTRUÇÃO (13/11/2026), dentro de Projetos & Incorporações.
//
// · Ao anexar o alvará, a pessoa diz a DATA DE EMISSÃO (dia/mês/ano). O vencimento SAI DE CONTA: emissão + validade da
//   prefeitura (config.json → "municipios"; sem cidade cadastrada, 2 anos). Nunca é digitado.
// · A PREFEITURA sai do cadastro da obra: o "Endereço" da Ficha técnica que contém o nome de uma cidade do config.json.
//   Não se escolhe à mão.
// · O alvará que vale é o de emissão mais recente. Renovou? Anexa o novo com a nova data e o relógio recomeça.
//   O histórico mostra todos em sequência (Alvará 1, 2, 3…): os antigos "VENCIDO, NÃO UTILIZAR"; o atual, a validade e a
//   data recomendada para começar a renovação (AVISO_DIAS antes do vencimento).
// · Cores: verde (mais de 120 dias) · amarelo "Renovar" (120 dias ou menos) · vermelho "Urgente" (menos de 60) · vermelho "Vencido".
// · AVISO SEMANAL por e-mail (e WhatsApp, quando a ponte ligar o canal): uma vez por semana, a partir de segunda-feira, para os
//   contatos cadastrados no quadro da entrada, com as obras em amarelo ou vermelho. Sem obra em alerta, não manda nada.
//   Quem dispara é o primeiro acesso à Engenharia na semana (verificarAvisoSemanal, chamada em rotas.js), sem segurar a tela.
// · Documentos para a renovação: lista JÁ PREENCHIDA por prefeitura (LISTAS_INICIAIS), que a equipe ajusta na tela
//   (vale para todas as obras daquela prefeitura) e marca, obra a obra, o que já está pronto. Renovou: a lista recomeça.
// · Nada some: corrigir a data, mudar a lista, desmarcar item ou tirar contato guarda o anterior com quem e quando.
import { randomBytes } from "node:crypto";
import * as PONTE from "../ponte-engenharia.js";
import { siteAtual } from "./documentos-qr.js";

const { agoraLocalISO } = PONTE;
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dataBR = iso => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
const hoje = () => agoraLocalISO().slice(0, 10);
const quem = user => (user && (user.nome || user.usuario)) || "?";
const envioLigado = () => typeof PONTE.enviarMensagem === "function";

// As prefeituras vêm do config.json: [{ "id": "minha-cidade", "nome": "Minha Cidade", "validadeAnos": 2, "documentos": ["…"] }]
const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const MUNICIPIOS = Object.fromEntries((PONTE.MUNICIPIOS || []).filter(m => m && m.id && m.nome).map(m => [m.id, {
  nome: m.nome, validadeAnos: Number(m.validadeAnos) || 2,
  acha: { test: end => semAcento(end).toLowerCase().replace(/\s+/g, " ").includes(semAcento(m.nome).toLowerCase().replace(/\s+/g, " ")) } }]));
/** amarelo: faltam AVISO_DIAS ou menos (é também a data recomendada para começar a renovação) */
export const AVISO_DIAS = 120;
/** vermelho: faltam menos que URGENTE_DIAS */
export const URGENTE_DIAS = 60;

// Lista inicial de documentos para a renovação, por prefeitura (config.json → "municipios"[].documentos). A equipe CONFERE
// com a prefeitura e ajusta na tela ("✏️ Ajustar a lista"); o ajuste vale para todas as obras daquela cidade.
export const LISTAS_INICIAIS = Object.fromEntries((PONTE.MUNICIPIOS || []).filter(m => m && m.id).map(m => [m.id, Array.isArray(m.documentos) ? m.documentos.map(String) : []]));

export const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T12:00:00Z"));
const somaDias = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
/** emissão + anos da prefeitura (29/02 vira 28/02) */
export function vencimentoDe(emissao, municipio) {
  if (!isoOk(emissao)) return "";
  const anos = (MUNICIPIOS[municipio] || { validadeAnos: 2 }).validadeAnos;
  let [y, m, d] = emissao.split("-").map(Number); y += anos;
  if (m === 2 && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) d = 28;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const diasAte = iso => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(hoje() + "T12:00:00Z")) / 86400000);
const vivos = o => (o.pastas?.alvara || []).filter(a => !a.removido);

/** a prefeitura sai do Endereço da Ficha técnica da obra */
export function municipioDa(o) {
  const end = String(o.ficha?.endereco || "");
  return Object.keys(MUNICIPIOS).find(k => MUNICIPIOS[k].acha.test(end)) || "";
}

const ROTULO = { ok: "Em dia", renov: "Renovar", urg: "Urgente", venc: "Vencido" };
/** o alvará que vale (emissão mais recente) e a situação dele */
export function situacaoAlvara(o) {
  const lista = vivos(o), comData = lista.filter(a => isoOk(a.emissao)).sort((a, b) => b.emissao.localeCompare(a.emissao));
  const mun = municipioDa(o);
  if (!comData.length) return { nenhum: !lista.length, semData: lista.length, mun };
  const vig = comData[0], venc = vencimentoDe(vig.emissao, mun), dias = diasAte(venc), renovarEm = somaDias(venc, -AVISO_DIAS);
  const cls = dias < 0 ? "venc" : dias < URGENTE_DIAS ? "urg" : dias <= AVISO_DIAS ? "renov" : "ok";
  const txt = dias < 0 ? `vencido há ${-dias} dia${dias === -1 ? "" : "s"}` : dias === 0 ? "vence hoje" : `faltam ${dias} dia${dias === 1 ? "" : "s"}`;
  return { vig, venc, dias, cls, txt, mun, renovarEm, semData: lista.length - comData.length, rotulo: ROTULO[cls] };
}

/** a etiqueta do cartão da obra, na entrada */
export function chipAlvara(o) {
  const s = situacaoAlvara(o);
  if (s.nenhum) return `<span class="doc-falta">📋 sem alvará</span>`;
  if (!s.vig) return `<span class="al-chip al-renov">📋 alvará sem data de emissão</span>`;
  return `<span class="al-chip al-${s.cls}">📋 ${s.cls === "venc" ? "Alvará vencido" : `Alvará vence ${dataBR(s.venc)}`}</span>`;
}

const listaDe = (d, mun) => (d.renovacaoListas?.[mun]?.itens) || (LISTAS_INICIAIS[mun] || []).map((txt, i) => ({ id: `ini${i + 1}`, txt }));
/** os itens marcados valem para o alvará vigente: renovou (alvará novo), a lista recomeça */
const marcasDe = (o, s) => (s.vig && o.renovacao?.[s.vig.arquivo]?.marcados) || {};
function progressoRenovacao(o, s, d) {
  const itens = listaDe(d, s.mun), m = marcasDe(o, s);
  return { total: itens.length, feitos: itens.filter(i => m[i.id]).length };
}
const ordem = s => s.vig ? s.dias : s.nenhum ? 1e9 : 1e8;

/** o quadro "Vencimento dos alvarás" da entrada: todas as obras, do mais urgente para o mais folgado, e quem recebe o aviso */
export function quadroAlvaras(obras, d, aviso = "") {
  const linhas = obras.map(o => ({ o, s: situacaoAlvara(o) })).sort((a, b) => ordem(a.s) - ordem(b.s));
  const n = c => linhas.filter(l => l.s.cls === c).length, semData = linhas.filter(l => !l.s.vig && !l.s.nenhum).length;
  const alerta = n("venc") + n("urg") + n("renov");
  const pl = (k, um, varios) => `${k} ${k === 1 ? um : varios}`;
  return `<details class="al-quadro" id="alvaras"${alerta || aviso ? " open" : ""}><summary>📋 Vencimento dos alvarás de construção
      <span class="al-n al-venc">${pl(n("venc"), "vencido", "vencidos")}</span><span class="al-n al-urg">${pl(n("urg"), "urgente", "urgentes")}</span><span class="al-n al-renov">${n("renov")} para renovar</span><span class="al-n al-ok">${n("ok")} em dia</span>${semData ? `<span class="al-n">${semData} sem data</span>` : ""}</summary>
    ${aviso ? `<div class="aviso" style="margin-top:10px">${esc(aviso)}</div>` : ""}
    <div class="al-rolo"><table class="al-t"><thead><tr><th>Obra</th><th>Prefeitura</th><th>Emissão</th><th>Vencimento</th><th>Situação</th><th>Renovar a partir de</th><th>Renovação</th></tr></thead><tbody>
    ${linhas.map(({ o, s }) => { const ck = s.vig && s.mun ? progressoRenovacao(o, s, d) : null;
      return `<tr><td><a href="/projetos/${esc(o.id)}#alvara"><b>${esc(o.nome)}</b></a></td><td>${s.mun ? esc(MUNICIPIOS[s.mun].nome) : `<span class="al-mut">${o.ficha?.endereco ? "cidade do endereço não cadastrada" : "falta o endereço na Ficha"}</span>`}</td>
      <td>${s.vig ? dataBR(s.vig.emissao) : `<span class="al-mut">${s.nenhum ? "sem alvará anexado" : "falta a data de emissão"}</span>`}</td>
      <td><b>${s.vig ? dataBR(s.venc) : ""}</b></td>
      <td>${s.vig ? `<span class="al-chip al-${s.cls}">${s.rotulo}</span> <span class="al-mut">${s.txt}</span>` : ""}</td>
      <td>${s.vig && s.cls !== "venc" ? dataBR(s.renovarEm) : ""}</td>
      <td>${ck && ck.total && s.cls !== "ok" ? `${ck.feitos} de ${ck.total} documentos prontos` : ""}</td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="al-mut" style="margin-top:8px">Vencimento = data de emissão + a validade da prefeitura (2 anos se a cidade não estiver cadastrada; a cidade vem do endereço da Ficha técnica).
      🟡 amarelo com ${AVISO_DIAS} dias ou menos · 🔴 vermelho com menos de ${URGENTE_DIAS}.</div>
    ${blocoContatos(d)}</details>`;
}

/* ------------------------------------------------------------- aviso semanal */

const semanaDe = iso => { const t = Date.parse(iso.slice(0, 10) + "T12:00:00Z"), dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * 86400000).toISOString().slice(0, 10); };  // a segunda-feira
const contatosDe = d => (d.avisoAlvara?.contatos || []);

function blocoContatos(d) {
  const cs = contatosDe(d), ativos = cs.filter(c => !c.removido), env = (d.avisoAlvara?.envios || []).slice(-8).reverse();
  return `<details class="al-av"><summary>📣 Aviso semanal por e-mail — ${ativos.length} contato${ativos.length === 1 ? "" : "s"}</summary>
    <div class="al-mut" style="margin:6px 0 10px">Toda semana (a partir de segunda-feira, no primeiro acesso ao painel da Engenharia) vai um e-mail com as obras em
      🟡 amarelo e 🔴 vermelho, com o vencimento e a data para começar a renovação. Semana sem alvará em alerta: não manda nada.
      ${envioLigado() ? "" : "<br>⏳ O envio ainda não está ligado no servidor (<b>enviarMensagem</b>: configure o e-mail no config.json): fica registrado como pendente."}
      WhatsApp: vai junto quando o canal for configurado.</div>
    ${ativos.map(c => `<form method="post" action="/projetos/alvara" class="al-ct"><input type="hidden" name="acao" value="contato-tirar"><input type="hidden" name="cid" value="${esc(c.id)}">
      <span><b>${esc(c.nome)}</b> ${c.email ? `· ${esc(c.email)}` : ""} ${c.whats ? `· 📱 ${esc(c.whats)}` : ""}</span>
      <button class="al-x" onclick="return confirm('Tirar ${esc(c.nome)} do aviso semanal?')">tirar</button></form>`).join("") || `<div class="al-mut">Ninguém cadastrado ainda.</div>`}
    <form method="post" action="/projetos/alvara" class="al-ct-novo"><input type="hidden" name="acao" value="contato">
      <input name="nome" placeholder="Nome" maxlength="80" required><input name="email" type="email" placeholder="e-mail" maxlength="120">
      <input name="whats" placeholder="WhatsApp com DDD (opcional)" maxlength="20"><button class="btn inline dark" type="submit">＋ incluir</button></form>
    <form method="post" action="/projetos/alvara" style="margin-top:10px"><input type="hidden" name="acao" value="enviar-agora">
      <button class="al-x" style="color:#5a4e2e" onclick="return confirm('Mandar agora o aviso dos alvarás para os contatos? Não muda o envio da semana.')">✉️ Mandar o aviso agora (teste)</button></form>
    ${env.length ? `<div class="al-sub" style="margin-top:12px">Últimos avisos</div>${env.map(e => `<div class="al-mut">${esc(dataBR(e.em))} ${esc(String(e.em).slice(11, 16))} · ${e.manual ? `mandado por ${esc(e.por)}` : "semanal"} · ${e.obras.length} obra${e.obras.length === 1 ? "" : "s"} em alerta · ${e.envios.map(x => `${esc(x.para)} ${x.ok ? "✓" : x.pendente ? "⏳ pendente" : `✗ ${esc(x.erro || "")}`}`).join(", ") || "ninguém para mandar"}</div>`).join("")}` : ""}
  </details>`;
}

function textoAviso(obras) {
  const lin = obras.map(({ o, s }) => `• ${o.nome}${s.mun ? ` (${MUNICIPIOS[s.mun].nome})` : ""} — ${s.rotulo.toUpperCase()}: ${s.cls === "venc" ? `venceu em ${dataBR(s.venc)} (${s.txt})` : `vence em ${dataBR(s.venc)} (${s.txt}); renovar a partir de ${dataBR(s.renovarEm)}`}`);
  const site = siteAtual();
  return ["Olá.", "", "Alvarás de construção que pedem atenção:", "", ...lin, "",
    `🟡 Renovar: ${AVISO_DIAS} dias ou menos para vencer · 🔴 Urgente: menos de ${URGENTE_DIAS} dias.`,
    ...(site ? ["", `Painel: ${site}/projetos#alvaras`] : []), "",
    `Mensagem automática do sistema ${PONTE.MARCA.nome} (não responder).`].join("\n");
}

/** monta e manda o aviso (e-mail e WhatsApp de cada contato). Devolve o registro, já gravado em d.avisoAlvara.envios. */
async function mandarAviso(d, { manual = false, por = "painel" } = {}) {
  const obras = (d.obras || []).filter(o => !o.removido).map(o => ({ o, s: situacaoAlvara(o) })).filter(x => x.s.vig && x.s.cls !== "ok").sort((a, b) => a.s.dias - b.s.dias);
  const reg = { id: randomBytes(5).toString("hex"), em: agoraLocalISO(), semana: semanaDe(hoje()), manual, por, obras: obras.map(x => ({ id: x.o.id, venc: x.s.venc, cls: x.s.cls })), envios: [] };
  if (obras.length) {
    const piores = obras.filter(x => x.s.cls !== "renov").length;
    const assunto = `Alvarás de construção — ${obras.length} obra${obras.length === 1 ? "" : "s"} em alerta${piores ? ` (${piores} vencido${piores === 1 ? "" : "s"}/urgente${piores === 1 ? "" : "s"})` : ""}`;
    const texto = textoAviso(obras);
    for (const c of contatosDe(d).filter(c => !c.removido)) for (const [canal, para] of [["email", c.email], ["whatsapp", c.whats]]) {
      if (!para) continue; const r0 = { nome: c.nome, canal, para };
      if (!envioLigado()) { reg.envios.push({ ...r0, pendente: true }); continue; }
      try { const r = await PONTE.enviarMensagem({ canal, para, nome: c.nome, assunto, texto, quem: por, origem: `projetos/alvaras/${reg.semana}${manual ? "/manual" : ""}` });
        reg.envios.push(r && r.ok ? { ...r0, ok: true } : { ...r0, erro: (r && r.erro) || "sem resposta" }); }
      catch (e) { reg.envios.push({ ...r0, erro: e.message }); }
    }
  }
  return reg;
}

let girando = false, semanaFeita = "";
/** chamada a cada acesso à Engenharia (rotas.js), sem esperar: na primeira vez da semana manda o aviso. ler/salvar = projetos.js */
export function verificarAvisoSemanal(ler, salvar) {
  const sem = semanaDe(hoje()); if (girando || semanaFeita === sem) return;   // sem ler o arquivo a cada acesso
  let d; try { d = ler(); } catch { return; }
  if (d.avisoAlvara?.ultimaSemana === sem) { semanaFeita = sem; return; }
  girando = true; semanaFeita = sem;
  // marca a semana ANTES de mandar: dois acessos ao mesmo tempo não mandam duas vezes
  (d.avisoAlvara = d.avisoAlvara || {}).ultimaSemana = sem; salvar(d);
  mandarAviso(d).then(reg => {
    if (!reg.obras.length) return;      // semana sem alvará em alerta: não registra nada
    const d2 = ler(); d2.avisoAlvara = d2.avisoAlvara || {}; (d2.avisoAlvara.envios = d2.avisoAlvara.envios || []).push(reg); salvar(d2);
  }).catch(() => {}).finally(() => { girando = false; });
}

/* ------------------------------------------------------------- a aba da obra */

/** a aba "📋 Alvará de construção" da obra */
export function painelAlvara(o, d, ACCEPT) {
  const s = situacaoAlvara(o), mun = s.mun;
  const cidade = mun ? `<div class="al-mun"><span>Prefeitura</span><b>${MUNICIPIOS[mun].nome}</b><em>pelo endereço da Ficha técnica</em></div>`
    : `<div class="al-mun al-mun-falta"><span>Prefeitura</span><b>não identificada</b><em>${o.ficha?.endereco ? `o endereço "${esc(o.ficha.endereco)}" não tem nenhuma cidade cadastrada` : "preencha o Endereço"} na <a href="#ficha" onclick="pjAba(document.querySelector('.pj-aba[data-aba=ficha]'))">📋 Ficha técnica</a></em></div>`;
  const destaque = s.vig ? `<div class="al-box al-${s.cls}">
      <div class="al-big"><span>Vencimento</span><b>${dataBR(s.venc)}</b><em>${s.txt}</em></div>
      <div class="al-info"><span class="al-chip al-${s.cls}">${s.rotulo}</span>
        <div>Emitido em <b>${dataBR(s.vig.emissao)}</b>${s.vig.numero ? ` · nº <b>${esc(s.vig.numero)}</b>` : ""} · <a href="/projetos/arquivo/${esc(s.vig.arquivo)}" target="_blank">📄 ${esc(s.vig.titulo || "alvará")}</a></div>
        ${s.cls !== "venc" ? `<div>Recomendação: <b>começar a renovação em ${dataBR(s.renovarEm)}</b> (${AVISO_DIAS} dias antes do vencimento)</div>` : `<div><b>Vencido: não utilizar.</b> Anexe o alvará renovado.</div>`}
        <div class="al-mut">Vencimento = emissão + ${(MUNICIPIOS[mun] || { validadeAnos: 2 }).validadeAnos} anos · 🟡 com ${AVISO_DIAS} dias ou menos · 🔴 com menos de ${URGENTE_DIAS}</div></div>
      ${cidade}</div>`
    : `<div class="al-box al-sem"><div class="al-info"><b>${s.nenhum ? "Nenhum alvará anexado ainda." : "O alvará anexado está sem a data de emissão."}</b>
        <div class="al-mut">${s.nenhum ? "Anexe abaixo, com a data de emissão: o sistema calcula o vencimento sozinho." : "Informe a data de emissão no histórico, logo abaixo, para o sistema acompanhar o vencimento."}</div></div>${cidade}</div>`;
  // HISTÓRICO: em sequência pela emissão (Alvará 1, 2, 3…); sem data vão no fim
  const comData = vivos(o).filter(a => isoOk(a.emissao)).sort((a, b) => a.emissao.localeCompare(b.emissao) || String(a.em).localeCompare(String(b.em)));
  const semData = vivos(o).filter(a => !isoOk(a.emissao));
  const estado = (a, i) => {
    const venc = vencimentoDe(a.emissao, mun);
    if (a === s.vig) return s.cls === "venc" ? { cls: "venc", txt: "VENCIDO, NÃO UTILIZAR", det: `venceu em ${dataBR(venc)}` }
      : { cls: s.cls, txt: `Válido até ${dataBR(venc)}`, det: `recomendação: renovar a partir de ${dataBR(s.renovarEm)} (${AVISO_DIAS} dias antes do vencimento)` };
    return diasAte(venc) < 0 ? { cls: "velho", txt: "VENCIDO, NÃO UTILIZAR", det: `venceu em ${dataBR(venc)}` }
      : { cls: "velho", txt: `SUBSTITUÍDO PELO ALVARÁ ${comData.indexOf(s.vig) + 1}, NÃO UTILIZAR`, det: `valeria até ${dataBR(venc)}` };
  };
  const editar = a => `<details class="al-ed"${isoOk(a.emissao) ? "" : " open"}><summary>${isoOk(a.emissao) ? "corrigir data / nº" : "informar a data de emissão"}</summary>
        <form method="post" action="/projetos/alvara"><input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="acao" value="emissao"><input type="hidden" name="arquivo" value="${esc(a.arquivo)}">
          <label>Emitido em <input type="date" name="emissao" required max="${hoje()}" value="${esc(a.emissao || "")}"></label>
          <label>Nº do alvará <input name="numero" maxlength="40" value="${esc(a.numero || "")}" placeholder="opcional"></label>
          <button class="btn inline dark" type="submit">Salvar</button></form>
        ${(a.datasAnteriores || []).length ? `<div class="al-mut">Antes: ${a.datasAnteriores.map(x => `${x.emissao ? dataBR(x.emissao) : "sem data"}${x.numero ? ` (nº ${esc(x.numero)})` : ""} — trocado por ${esc(x.por)} em ${esc(dataBR(x.em))}`).join(" · ")}</div>` : ""}</details>`;
  const linha = (a, i) => { const e = estado(a, i); return `<div class="al-h al-h-${e.cls}">
      <div class="al-h-n">Alvará ${i + 1}</div>
      <div class="al-h-c"><div><span class="al-h-st">${e.txt}</span> <span class="al-mut">· ${e.det}</span></div>
        <div><a href="/projetos/arquivo/${esc(a.arquivo)}" target="_blank">📄 ${esc(a.titulo || "documento")}</a>
          <span class="al-mut"> · ${a.numero ? `nº ${esc(a.numero)} · ` : ""}emitido ${dataBR(a.emissao)} · anexado por ${esc(a.enviadoPor)} em ${esc(a.em)}</span></div>
        ${editar(a)}</div></div>`; };
  const hist = `<div class="al-sub">Histórico de alvarás — ${comData.length + semData.length}</div>
    ${comData.length + semData.length ? `<div class="al-hist">${comData.map(linha).join("")}
      ${semData.map(a => `<div class="al-h al-h-sem"><div class="al-h-n">?</div><div class="al-h-c"><div><span class="al-falta">Sem data de emissão — fica fora da sequência até informar</span></div>
        <div><a href="/projetos/arquivo/${esc(a.arquivo)}" target="_blank">📄 ${esc(a.titulo || "documento")}</a><span class="al-mut"> · anexado por ${esc(a.enviadoPor)} em ${esc(a.em)}</span></div>${editar(a)}</div></div>`).join("")}</div>`
      : `<div class="pj-vazio">Nenhum alvará ainda.</div>`}`;
  const form = `<form method="post" action="/projetos/anexo" enctype="multipart/form-data" class="pj-form al-form">
    <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="pasta" value="alvara">
    <label class="al-l" style="flex:2 1 220px"><span>Nome do documento</span><input name="titulo" placeholder="Ex.: Alvará de construção 2026" required></label>
    <label class="al-l"><span>Nº do alvará</span><input name="numero" maxlength="40" placeholder="opcional"></label>
    <label class="al-l"><span>Emitido em (dia/mês/ano)</span><input type="date" name="emissao" required max="${hoje()}"></label>
    <label class="al-l" style="flex:2 1 220px"><span>Arquivo — PDF, DWG, DXF, JPG, PNG ou WEBP</span><input type="file" name="arquivo" accept="${ACCEPT}" required></label>
    <button class="btn inline dark" type="submit">Anexar</button>
    <span class="pj-tipos">Renovou? Anexe o alvará novo com a nova data de emissão: ele passa a valer e o anterior fica no histórico como "não utilizar".</span></form>`;
  // documentos para a renovação
  let renov = "";
  if (!mun) renov = `<div class="al-ren"><h4>📝 Documentos para a renovação</h4><div class="pj-vazio">Com uma cidade cadastrada no Endereço da Ficha técnica, aparece aqui a lista de documentos que a prefeitura pede.</div></div>`;
  else {
    const itens = listaDe(d, mun), m = marcasDe(o, s), feitos = itens.filter(i => m[i.id]).length, cfg = d.renovacaoListas?.[mun];
    renov = `<details class="al-ren"${s.vig && s.cls !== "ok" ? " open" : ""}><summary><h4>📝 Documentos para a renovação — Prefeitura de ${MUNICIPIOS[mun].nome}</h4>
        <span class="al-n">${s.vig ? `${feitos} de ${itens.length} prontos` : `${itens.length} itens`}</span></summary>
      ${s.vig ? "" : `<div class="al-mut" style="margin:6px 0">Anexe o alvará (com a data de emissão) para marcar o que já está pronto.</div>`}
      <div class="al-lista">${itens.map(i => `<form method="post" action="/projetos/alvara" class="al-item${m[i.id] ? " feito" : ""}">
        <input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="acao" value="marcar"><input type="hidden" name="item" value="${esc(i.id)}"><input type="hidden" name="valor" value="${m[i.id] ? "" : "1"}">
        <label><input type="checkbox"${m[i.id] ? " checked" : ""}${s.vig ? "" : " disabled"} onchange="this.form.submit()"> <span>${esc(i.txt)}</span></label>
        ${m[i.id] ? `<span class="al-mut">✓ ${esc(m[i.id].por)} · ${esc(dataBR(m[i.id].em))}</span>` : ""}</form>`).join("")}</div>
      <details class="al-ed" style="margin-top:10px"><summary>✏️ Ajustar a lista de ${MUNICIPIOS[mun].nome}</summary>
        <form method="post" action="/projetos/alvara"><input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="acao" value="lista"><input type="hidden" name="municipio" value="${mun}">
          <textarea name="itens" rows="${Math.min(16, itens.length + 2)}" style="width:100%">${esc(itens.map(i => i.txt).join("\n"))}</textarea>
          <div class="al-mut">Um documento por linha. Vale para <b>todas as obras de ${MUNICIPIOS[mun].nome}</b>. O que já estava marcado continua marcado.</div>
          <button class="btn inline dark" type="submit" style="margin-top:6px">Salvar a lista</button></form>
        <div class="al-mut" style="margin-top:6px">${cfg ? `Última alteração: <b>${esc(cfg.por)}</b> · ${esc(dataBR(cfg.em))}${(cfg.anteriores || []).length ? ` · ${cfg.anteriores.length} versão(ões) anterior(es) guardada(s)` : ""}` : "Lista inicial: confira com a prefeitura e ajuste o que for diferente."}</div></details>
    </details>`;
  }
  return `<h3>📋 Alvará de construção</h3>${destaque}${hist}${form}${renov}`;
}

/** valida os campos do alvará no anexo; devolve { emissao, numero } ou { erro } */
export function camposAnexoAlvara(campos) {
  const emissao = String(campos.emissao || "");
  if (!isoOk(emissao)) return { erro: "Informe a data de emissão do alvará (dia, mês e ano)." };
  if (emissao > hoje()) return { erro: "A data de emissão não pode ser no futuro." };
  if (emissao < "1990-01-01") return { erro: "Data de emissão inválida." };
  return { emissao, numero: String(campos.numero || "").trim().slice(0, 40) };
}

/** as gravações (data de emissão, marcar item, ajustar a lista, contatos do aviso, mandar agora). Mexe em `d`; quem chama grava.
 *  Devolve { ok | erro, o? (a obra, para voltar à aba dela) }. */
export async function gravarAlvara(d, user, campos) {
  const em = agoraLocalISO(), por = quem(user), acao = campos.acao;
  // ---- da entrada (sem obra)
  if (acao === "contato") {
    const nome = String(campos.nome || "").trim().slice(0, 80), email = String(campos.email || "").trim().slice(0, 120), whats = String(campos.whats || "").replace(/\D/g, "").slice(0, 15);
    if (!nome) return { erro: "Informe o nome." };
    if (!email && !whats) return { erro: "Informe o e-mail (ou o WhatsApp)." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };
    if (whats && whats.length < 10) return { erro: "WhatsApp com DDD (ex.: 47 99999-9999)." };
    const cs = ((d.avisoAlvara = d.avisoAlvara || {}).contatos = d.avisoAlvara.contatos || []);
    if (email && cs.some(c => !c.removido && c.email.toLowerCase() === email.toLowerCase())) return { erro: "Esse e-mail já está na lista." };
    cs.push({ id: randomBytes(4).toString("hex"), nome, email, whats: whats ? (whats.length <= 11 ? "55" + whats : whats) : "", criado: { por, em } });
    return { ok: `${nome} vai receber o aviso semanal dos alvarás.` };
  }
  if (acao === "contato-tirar") {
    const c = contatosDe(d).find(x => x.id === campos.cid && !x.removido); if (!c) return { erro: "Contato não encontrado." };
    c.removido = { por, em }; return { ok: `${c.nome} saiu do aviso semanal.` };
  }
  if (acao === "enviar-agora") {
    const reg = await mandarAviso(d, { manual: true, por });
    if (!reg.obras.length) return { ok: "Nenhum alvará em alerta agora: não há o que avisar." };
    (d.avisoAlvara = d.avisoAlvara || {}); (d.avisoAlvara.envios = d.avisoAlvara.envios || []).push(reg);
    const ok = reg.envios.filter(x => x.ok).length, pend = reg.envios.filter(x => x.pendente).length, err = reg.envios.filter(x => x.erro).length;
    return reg.envios.length ? { ok: `Aviso de ${reg.obras.length} obra(s): ${ok} enviado(s)${pend ? `, ${pend} pendente(s) (servidor sem envio)` : ""}${err ? `, ${err} com erro` : ""}.` } : { erro: "Cadastre ao menos um contato para receber o aviso." };
  }
  // ---- de uma obra
  const o = (d.obras || []).find(x => x.id === campos.id); if (!o) return { erro: "Obra não encontrada." };
  if (acao === "emissao") {
    const a = vivos(o).find(x => x.arquivo === campos.arquivo); if (!a) return { erro: "Alvará não encontrado.", o };
    const c = camposAnexoAlvara(campos); if (c.erro) return { ...c, o };
    if (a.emissao === c.emissao && (a.numero || "") === c.numero) return { ok: "Nada mudou.", o };
    if (a.emissao || a.numero) (a.datasAnteriores = a.datasAnteriores || []).push({ emissao: a.emissao || "", numero: a.numero || "", por, em });
    a.emissao = c.emissao; a.numero = c.numero; a.emissaoPor = { por, em };
    return { ok: `Data de emissão gravada: ${dataBR(c.emissao)} → vence ${dataBR(vencimentoDe(c.emissao, municipioDa(o)))}.`, o };
  }
  if (acao === "marcar") {
    const s = situacaoAlvara(o); if (!s.vig) return { erro: "Anexe o alvará com a data de emissão antes de marcar os documentos.", o };
    if (!s.mun || !listaDe(d, s.mun).some(i => i.id === campos.item)) return { erro: "Documento não encontrado na lista.", o };
    const r = ((o.renovacao = o.renovacao || {})[s.vig.arquivo] = o.renovacao[s.vig.arquivo] || { marcados: {}, historico: [] });
    const txt = listaDe(d, s.mun).find(i => i.id === campos.item).txt;
    if (campos.valor) { if (r.marcados[campos.item]) return { ok: "Nada mudou.", o }; r.marcados[campos.item] = { por, em }; }
    else { if (!r.marcados[campos.item]) return { ok: "Nada mudou.", o }; delete r.marcados[campos.item]; }
    r.historico.push({ item: campos.item, txt, marcou: !!campos.valor, por, em });
    return { ok: `${campos.valor ? "✓ Pronto" : "Desmarcado"}: ${txt}`, o };
  }
  if (acao === "lista") {
    const mun = String(campos.municipio || ""); if (!MUNICIPIOS[mun]) return { erro: "Prefeitura inválida.", o };
    const atual = listaDe(d, mun), linhas = [...new Set(String(campos.itens || "").split(/\r?\n/).map(l => l.trim().slice(0, 240)).filter(Boolean))].slice(0, 60);
    if (!linhas.length) return { erro: "A lista não pode ficar vazia.", o };
    if (linhas.join("\n") === atual.map(i => i.txt).join("\n")) return { ok: "Nada mudou.", o };
    // a linha que continua igual mantém o id (e as marcas das obras); linha nova ganha id novo
    const itens = linhas.map(txt => atual.find(i => i.txt === txt) || { id: randomBytes(4).toString("hex"), txt });
    const ant = d.renovacaoListas?.[mun];
    (d.renovacaoListas = d.renovacaoListas || {})[mun] = { itens, por, em, anteriores: [...(ant?.anteriores || []), { itens: atual, por: ant?.por || "lista inicial", em: ant?.em || "" }] };
    return { ok: `Lista de ${MUNICIPIOS[mun].nome} salva (${itens.length} documentos).`, o };
  }
  return { erro: "Ação desconhecida.", o };
}

export const CSS_ALVARA = `
.al-chip{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;border:1px solid}
.al-ok{background:#e8f2e2;color:#2f6b2f;border-color:#cfe3c4}.al-renov{background:#fff4d6;color:#8a6200;border-color:#f0dc9c}
.al-urg,.al-venc{background:#fbe9e9;color:#a02c2c;border-color:#f0c9c9}.al-chip.al-venc{background:#a02c2c;color:#fff;border-color:#a02c2c}
.al-mut{font-size:11.5px;color:var(--mut)}.al-falta{font-size:11.5px;color:#a02c2c;font-weight:700}
.al-box{display:flex;gap:18px;align-items:center;flex-wrap:wrap;border:1px solid #ece8dc;border-left:6px solid #3f9a4a;border-radius:12px;padding:14px 16px;margin-bottom:16px;background:#fcfbf7}
.al-box.al-renov{border-left-color:#e0a800;background:#fffaf0}.al-box.al-urg,.al-box.al-venc{border-left-color:#c03a3a;background:#fdf3f3}.al-box.al-sem{border-left-color:#bbb}
.al-big span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.al-big b{display:block;font-size:28px;line-height:1.1;color:#17171b;font-variant-numeric:tabular-nums}.al-big em{font-style:normal;font-weight:700;font-size:13px}
.al-box.al-urg .al-big em,.al-box.al-venc .al-big em{color:#a02c2c}.al-box.al-renov .al-big em{color:#8a6200}.al-box.al-ok .al-big em{color:#2f6b2f}
.al-info{flex:1;min-width:220px;font-size:13px;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.al-info a{color:#2f6db0;font-weight:600}
.al-mun{display:flex;flex-direction:column;gap:2px;min-width:150px}.al-mun span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.al-mun b{font-size:15px}.al-mun em{font-style:normal;font-size:11px;color:var(--mut);max-width:240px}.al-mun-falta b{color:#a02c2c}.al-mun a{color:#8a6d1e;font-weight:700}
.al-sub{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:6px 0 6px}
.al-hist{display:flex;flex-direction:column;gap:8px}
.al-h{display:flex;gap:12px;border:1px solid #ece8dc;border-left:5px solid #3f9a4a;border-radius:10px;padding:10px 12px;background:#fff;font-size:13px}
.al-h-n{font-weight:800;white-space:nowrap;min-width:72px;color:#17171b}.al-h-c{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
.al-h a{color:#2f6db0;font-weight:600}.al-h-st{font-weight:800}
.al-h-ok .al-h-st{color:#2f6b2f}.al-h-renov{border-left-color:#e0a800}.al-h-renov .al-h-st{color:#8a6200}
.al-h-urg,.al-h-venc{border-left-color:#c03a3a}.al-h-urg .al-h-st,.al-h-venc .al-h-st{color:#a02c2c}
.al-h-velho{border-left-color:#c9c4b4;background:#f7f6f2}.al-h-velho .al-h-st{color:#a02c2c}.al-h-velho a{color:#777}.al-h-velho .al-h-n{color:#888}
.al-h-sem{border-left-color:#e0a800;border-style:dashed}
.al-ed{width:100%;font-size:12px}.al-ed summary{cursor:pointer;color:#8a6d1e;font-weight:700;font-size:11.5px}
.al-ed form{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:8px 0 4px;padding:10px;border:1px solid #ece8dc;border-radius:10px;background:#fff}
.al-ed label{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:var(--mut)}
.al-ed input,.al-ed textarea{border:1px solid #e0dccc;border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit}
.al-form{align-items:flex-end}.al-l{display:flex;flex-direction:column;gap:4px;flex:1 1 150px}
.al-l span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut)}
.al-l input{border:1px solid #e0dccc;border-radius:9px;padding:8px 10px;font-size:13px;font-family:inherit}
.al-ren{margin-top:20px;border:1px solid #ece8dc;border-radius:12px;padding:12px 14px;background:#fff}
.al-ren>summary{cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none}.al-ren>summary::-webkit-details-marker{display:none}
.al-ren h4{margin:0;font-size:14px;color:#17171b}
.al-n{display:inline-block;background:#f3efe2;color:#6a5e3a;border-radius:999px;padding:2px 10px;font-size:11.5px;font-weight:700;margin-left:4px}
.al-n.al-urg,.al-n.al-venc{background:#fbe9e9;color:#a02c2c}.al-n.al-renov{background:#fff4d6;color:#8a6200}.al-n.al-ok{background:#e8f2e2;color:#2f6b2f}
.al-lista{margin-top:10px}.al-item{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;padding:7px 4px;border-bottom:1px solid #f3f0e6;font-size:13px}
.al-item label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}.al-item input{width:16px;height:16px;accent-color:#3f9a4a;margin-top:2px}
.al-item.feito span:not(.al-mut){color:#6a6a72;text-decoration:line-through}
.al-quadro{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:12px 16px;margin:14px 0 6px}
.al-quadro>summary{cursor:pointer;font-weight:800;font-size:14.5px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;list-style:none}.al-quadro>summary::-webkit-details-marker{display:none}
.al-rolo{overflow-x:auto;margin-top:10px}.al-t{width:100%;border-collapse:collapse;font-size:12.5px;min-width:700px}
.al-t th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:6px 8px;border-bottom:1px solid #efeade}
.al-t td{padding:8px;border-bottom:1px solid #f3f0e6}.al-t a{color:inherit;text-decoration:none}.al-t a:hover{text-decoration:underline}
.al-av{margin-top:14px;border-top:1px solid #f0ece0;padding-top:10px}.al-av>summary{cursor:pointer;font-weight:700;font-size:13px;color:#5a4e2e}
.al-ct{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #f3f0e6;font-size:13px}
.al-ct-novo{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.al-ct-novo input{border:1px solid #e0dccc;border-radius:9px;padding:8px 10px;font-size:13px;font-family:inherit;flex:1 1 160px}
.al-x{border:0;background:none;color:#b03a3a;font-size:12px;cursor:pointer;text-decoration:underline;font-family:inherit;font-weight:700}
`;
