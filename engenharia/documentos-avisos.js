// documentos-avisos.js — AVISO DE REVISÃO por WhatsApp e e-mail (06/11).
//
//   · a aba 📣 Avisos (administrador e Diretoria) guarda os CONTATOS: obra, gerência, Diretoria, engenharia,
//     projetistas… com e-mail e/ou WhatsApp, as obras de cada um e o que querem receber;
//   · dois momentos: (1) REVISÃO ENVIADA — saiu revisão nova, está em análise, continue usando a liberada;
//     (2) REVISÃO LIBERADA — use a nova e DESCARTE a anterior (que o QR da prancha impressa passa a dar como desatualizada);
//   · quem manda é a ponte (`enviarMensagem`, o mesmo do boletim de medição e da plotagem). Enquanto o e-mail não estiver configurado,
//     o aviso fica registrado como "aguardando o servidor" — nada se perde;
//   · cada aviso fica no histórico da aba, com o que foi para quem, por qual canal e se deu certo. Contato removido só é
//     marcado (nada some).
import { randomBytes } from "node:crypto";
import * as PONTE from "../ponte-engenharia.js";
import { shell, agoraLocalISO, OBRAS_DOCS, MARCA } from "../ponte-engenharia.js";
import { BASE_DOCS } from "./documentos.js";
import { siteAtual } from "./documentos-qr.js";

export const FUNCOES = ["Obra", "Gerência", "Diretoria", "Engenharia", "Projetista", "Outro"];
export const EVENTOS = [{ id: "enviada", txt: "Revisão enviada (em análise)" }, { id: "liberada", txt: "Revisão liberada para a obra" }];
const envioLigado = () => typeof PONTE.enviarMensagem === "function";
const contatos = d => (d.contatosAviso || []).filter(c => !c.removido);
const soDig = t => String(t || "").replace(/\D/g, "");
/** WhatsApp no formato da ponte: 55 + DDD + número, só dígitos. */
export const whatsOk = t => { let n = soDig(t); if (n.length === 10 || n.length === 11) n = "55" + n; return /^55\d{10,11}$/.test(n) ? n : ""; };
const emailOk = t => { const e = String(t || "").trim().toLowerCase(); return /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/.test(e) ? e : ""; };
const podeGerir = u => BASE_DOCS.podeGerirLocais(u);

// ---------- a tela: contatos + histórico de avisos ----------
const CSS_AV = `<style>
.av-form{display:grid;grid-template-columns:1.3fr 1fr 1.3fr 1fr;gap:8px;align-items:end;background:#fcfbf7;border:1px dashed #d9d2bb;border-radius:12px;padding:12px;margin:10px 0}
.av-form label{display:block;font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);margin-bottom:3px}
.av-form input,.av-form select{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ddd8c8;border-radius:8px;font-size:13px;font-family:inherit}
.av-ck{display:flex;flex-wrap:wrap;gap:6px}.av-ck label{display:inline-flex;gap:4px;align-items:center;border:1px solid #e6e0cf;background:#fff;border-radius:8px;padding:4px 8px;font-size:12px;font-weight:600;text-transform:none;letter-spacing:0;color:#333;margin:0;cursor:pointer}
.av-ck input{width:auto}.av-off{opacity:.5}.av-chip{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;background:#f1ede1;color:#5a5240;margin:1px 2px 1px 0}
.av-ok{color:#2f7a2f}.av-er{color:#a12d2d}.av-pe{color:#8a6d00}
@media(max-width:900px){.av-form{grid-template-columns:1fr}.av-form>*{grid-column:auto!important}}
</style>`;
export function paginaAvisos(user, { ok = "", erro = "", ed = "" } = {}) {
  if (!podeGerir(user)) return null;
  const B = BASE_DOCS, d = B.ler(), cs = contatos(d), e = cs.find(c => c.id === ed) || null, esc = B.esc;
  const nomeObra = id => (OBRAS_DOCS.find(o => o.id === id) || {}).nome || id;
  const linha = c => `<tr class="${c.ativo === false ? "av-off" : ""}"><td><b>${esc(c.nome)}</b><br><span class="av-chip">${esc(c.funcao)}</span></td>
      <td style="font-size:12px">${c.email ? `✉️ ${esc(c.email)}<br>` : ""}${c.whats ? `🟢 +${esc(c.whats)}` : ""}${!c.email && !c.whats ? `<span class="av-er">sem contato</span>` : ""}</td>
      <td style="font-size:12px">${c.obras.includes("todas") ? "<b>Todas as obras</b>" : c.obras.map(nomeObra).map(esc).join(", ")}</td>
      <td style="font-size:12px">${EVENTOS.filter(x => c.eventos.includes(x.id)).map(x => esc(x.txt)).join("<br>")}</td>
      <td style="white-space:nowrap;text-align:right"><a class="dc-bt claro" href="/documentos/avisos?ed=${c.id}#form">editar</a>
        <form method="POST" action="/documentos/avisos" style="display:inline"><input type="hidden" name="acao" value="ativo"><input type="hidden" name="id" value="${c.id}"><button class="dc-x" style="color:#6a5e3a">${c.ativo === false ? "reativar" : "pausar"}</button></form>
        <form method="POST" action="/documentos/avisos" style="display:inline" onsubmit="return confirm('Remover ${esc(c.nome)} dos avisos? Fica no histórico.')"><input type="hidden" name="acao" value="remover"><input type="hidden" name="id" value="${c.id}"><button class="dc-x">remover</button></form></td></tr>`;
  const hist = (d.avisosRevisao || []).slice(-40).reverse().map(a => `<div style="padding:6px 0;border-bottom:1px solid #f3f0e6">${B.dh(a.em)} · <b>${esc(nomeObra(a.obra))}</b> · ${a.evento === "liberada" ? "✅ liberada" : "📝 enviada"}: ${a.docs.map(esc).join(", ")} — por ${esc(a.por)}<br>
      ${a.envios.length ? a.envios.map(x => `<span class="${x.ok ? "av-ok" : x.pendente ? "av-pe" : "av-er"}">${x.canal === "whatsapp" ? "🟢" : "✉️"} ${esc(x.nome)}${x.ok ? " ✓" : x.pendente ? " (aguardando o servidor)" : ` ✗ ${esc(x.erro || "")}`}</span>`).join(" · ") : `<span class="av-pe">ninguém cadastrado para esta obra</span>`}</div>`).join("");
  const sel = (v, x) => v === x ? " selected" : "";
  const body = `${B.CSS}${CSS_AV}${B.topoProjetos(user, "avisos")}
    ${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 10px">${esc(erro)}</div>` : ""}
    ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 10px">${esc(ok)}</div>` : ""}
    <div class="pj-quadro"><div class="pj-qt"><b>📣 Avisos de revisão</b><span>quem recebe WhatsApp e e-mail quando sai revisão nova de projeto</span></div>
      ${envioLigado() ? "" : `<div style="background:#fff6dd;border:1px solid #ecdcae;border-radius:10px;padding:8px 12px;font-size:12.5px;margin:8px 0">⏳ O envio de WhatsApp e e-mail ainda não está ligado no servidor: configure o e-mail no config.json. Até lá, cada aviso fica registrado aqui como "aguardando o servidor".</div>`}
      <table class="dc-t"><thead><tr><th>Nome</th><th>Contato</th><th>Obras</th><th>Recebe</th><th></th></tr></thead><tbody>${cs.map(linha).join("") || `<tr><td colspan="5" style="color:var(--mut)">Ninguém cadastrado ainda.</td></tr>`}</tbody></table>
      <form class="av-form" id="form" method="POST" action="/documentos/avisos"><input type="hidden" name="acao" value="salvar"><input type="hidden" name="id" value="${e ? e.id : ""}">
        <div style="grid-column:1/-1;font-weight:800">${e ? `✏️ Editar ${esc(e.nome)}` : "＋ Novo contato"}</div>
        <div><label>Nome</label><input name="nome" required maxlength="80" value="${e ? esc(e.nome) : ""}" placeholder="Ex.: Eng. Carlos (obra Centro)"></div>
        <div><label>Função</label><select name="funcao">${FUNCOES.map(f => `<option${sel(e && e.funcao, f)}>${f}</option>`).join("")}</select></div>
        <div><label>E-mail</label><input name="email" type="email" maxlength="120" value="${e ? esc(e.email || "") : ""}" placeholder="nome@empresa.com.br"></div>
        <div><label>WhatsApp (com DDD)</label><input name="whats" maxlength="20" inputmode="tel" value="${e && e.whats ? esc(e.whats.slice(2)) : ""}" placeholder="47 99999-9999"></div>
        <div style="grid-column:1/-1"><label>Obras</label><div class="av-ck"><label><input type="checkbox" name="obras" value="todas"${!e || e.obras.includes("todas") ? " checked" : ""}> <b>Todas</b></label>
          ${OBRAS_DOCS.map(o => `<label><input type="checkbox" name="obras" value="${o.id}"${e && e.obras.includes(o.id) ? " checked" : ""}> ${esc(o.nome)}</label>`).join("")}</div></div>
        <div style="grid-column:1/-2"><label>Recebe aviso de</label><div class="av-ck">${EVENTOS.map(x => `<label><input type="checkbox" name="eventos" value="${x.id}"${!e || e.eventos.includes(x.id) ? " checked" : ""}> ${x.txt}</label>`).join("")}</div></div>
        <div style="text-align:right"><button class="dc-bt" style="padding:9px 18px">${e ? "Gravar" : "Cadastrar"}</button>${e ? ` <a href="/documentos/avisos" style="font-size:12px">cancelar</a>` : ""}</div></form>
    </div>
    <details class="dc-disc"${hist ? " open" : ""}><summary>🕘 Avisos mandados<span class="n">${(d.avisosRevisao || []).length}</span></summary><div class="dc-corpo" style="font-size:12.5px;line-height:1.55">${hist || "Nenhum aviso ainda."}</div></details>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      Toda vez que alguém envia uma <b>revisão nova</b> de prancha (R01, R02…), quem está cadastrado aqui para aquela obra recebe: "saiu revisão nova, está em análise — continue usando a liberada".
      Quando a revisão é <b>liberada para a obra</b>, vai outro aviso: "use a nova e <b>descarte</b> a anterior". Pode marcar só um dos dois para cada pessoa.
      Vários arquivos enviados de uma vez viram <b>um aviso só</b>, com a lista das pranchas. O WhatsApp sai para o número com DDD (o 55 do Brasil o sistema põe sozinho).</div></details>`;
  return shell({ title: "Avisos · Projetos", body, user });
}
export function salvarAviso(user, campos) {
  if (!podeGerir(user)) return { erro: "Só o administrador mexe nos avisos." };
  const B = BASE_DOCS, d = B.ler(), lista = (d.contatosAviso = d.contatosAviso || []), em = agoraLocalISO(), quem = { por: B.quem(user), login: user.usuario, em };
  if (campos.acao === "ativo" || campos.acao === "remover") {
    const c = contatos(d).find(x => x.id === campos.id); if (!c) return { erro: "Contato não encontrado." };
    if (campos.acao === "remover") c.removido = quem; else { c.ativo = c.ativo === false; (c.historico = c.historico || []).push({ ...quem, ativo: c.ativo }); }
    B.gravar(d); return { ok: campos.acao === "remover" ? `${c.nome} saiu dos avisos.` : `${c.nome}: avisos ${c.ativo ? "reativados" : "pausados"}.` };
  }
  const nome = String(campos.nome || "").trim().slice(0, 80); if (!nome) return { erro: "Diga o nome." };
  const funcao = FUNCOES.includes(campos.funcao) ? campos.funcao : "Outro";
  const email = String(campos.email || "").trim() ? emailOk(campos.email) : "", whats = soDig(campos.whats) ? whatsOk(campos.whats) : "";
  if (String(campos.email || "").trim() && !email) return { erro: "E-mail inválido.", ed: campos.id };
  if (soDig(campos.whats) && !whats) return { erro: "WhatsApp inválido: DDD + número (ex.: 47 99999-9999).", ed: campos.id };
  if (!email && !whats) return { erro: "Informe o e-mail ou o WhatsApp (ou os dois).", ed: campos.id };
  const arr = v => [].concat(v || []);
  let obras = arr(campos.obras).filter(o => o === "todas" || OBRAS_DOCS.some(x => x.id === o)); if (obras.includes("todas")) obras = ["todas"];
  if (!obras.length) return { erro: "Marque ao menos uma obra (ou Todas).", ed: campos.id };
  const eventos = arr(campos.eventos).filter(x => EVENTOS.some(y => y.id === x)); if (!eventos.length) return { erro: "Marque o que a pessoa recebe.", ed: campos.id };
  const dados = { nome, funcao, email, whats, obras, eventos };
  if (campos.id) { const c = contatos(d).find(x => x.id === campos.id); if (!c) return { erro: "Contato não encontrado." };
    (c.anteriores = c.anteriores || []).push({ nome: c.nome, funcao: c.funcao, email: c.email, whats: c.whats, obras: c.obras, eventos: c.eventos, ate: em }); Object.assign(c, dados, { alterado: quem });
    B.gravar(d); return { ok: `${nome}: gravado.` }; }
  lista.push({ id: randomBytes(5).toString("hex"), ...dados, ativo: true, criado: quem }); B.gravar(d);
  return { ok: `${nome} cadastrado nos avisos.` };
}

// ---------- mandar ----------
/** Avisa todos os contatos da obra. evento: "enviada" (ids = arquivos enviados) ou "liberada" (ids = o liberado).
 *  Roda depois de a tela responder (não segura ninguém); o resultado fica no histórico da aba. */
export async function avisarRevisao({ evento, obra, ids, user }) {
  const B = BASE_DOCS, d = B.ler(), vv = B.vivos(d), o = OBRAS_DOCS.find(x => x.id === obra); if (!o) return;
  let docs = (ids || []).map(id => vv.find(a => a.id === id)).filter(Boolean);
  if (evento === "enviada") docs = docs.filter(a => a.rev > 0);       // prancha nova (R00) não é revisão: só as revisões avisam
  if (!docs.length) return;
  // a liberada que cada uma vai substituir (no envio) ou que ficou obsoleta (na liberação)
  const anterior = a => vv.filter(b => b.origem !== "marcacao" && b.obra === a.obra && b.disciplina === a.disciplina && b.numero === a.numero && b.rev < a.rev && b.liberado)
    .sort((x, y) => y.rev - x.rev)[0] || null;
  const quemFez = B.quem(user), quando = B.dh(agoraLocalISO()), site = siteAtual(), link = site ? `${site}/documentos/${obra}` : "";
  const itens = docs.map(a => { const ant = anterior(a); return evento === "enviada"
    ? `• ${B.codigo(a)} — ${a.descricao}${ant ? `\n  (vai substituir a ${B.codigo(ant)} quando for liberada)` : ""}`
    : `• ${B.codigo(a)} — ${a.descricao}${ant ? `\n  ⛔ A ${B.codigo(ant)} está DESATUALIZADA: descarte as cópias impressas e use a nova.` : "\n  (prancha nova)"}`; });
  const n = docs.length, pl = n === 1 ? "1 prancha" : `${n} pranchas`;
  const assunto = evento === "enviada" ? `Projetos · ${o.nome} — revisão nova em andamento (${pl})` : `Projetos · ${o.nome} — revisão LIBERADA para a obra: ${n === 1 ? B.codigo(docs[0]) : pl}`;
  const corpo = nome => [`Olá, ${nome}.`, "",
    evento === "enviada" ? `Saiu revisão nova de projeto da obra ${o.nome}. Ela está EM ANÁLISE e ainda NÃO foi liberada para a obra:` : `Revisão LIBERADA para a obra ${o.nome}:`, "",
    ...itens, "",
    evento === "enviada" ? `Até a liberação, continue usando a revisão liberada atual (no painel ela aparece com o aviso "Prancha com revisão em andamento").`
      : `Na prancha impressa, o QR code do canto mostra na hora se ela ainda vale.`, "",
    `${evento === "enviada" ? "Enviada" : "Liberada"} por ${quemFez} em ${quando}.`, ...(link ? [`Painel: ${link}`] : []), "",
    `Mensagem automática do sistema ${MARCA.nome} (não responder).`].join("\n");
  const alvo = contatos(d).filter(c => c.ativo !== false && c.eventos.includes(evento) && (c.obras.includes("todas") || c.obras.includes(obra)));
  const envios = [];
  for (const c of alvo) for (const [canal, para] of [["email", c.email], ["whatsapp", c.whats]]) {
    if (!para) continue; const reg = { nome: c.nome, canal, para };
    if (!envioLigado()) { envios.push({ ...reg, pendente: true }); continue; }
    try { const r = await PONTE.enviarMensagem({ canal, para, nome: c.nome, assunto, texto: corpo(c.nome.split(/\s+/)[0]), quem: quemFez, origem: `documentos/${obra}/revisao-${evento}/${docs.map(a => a.id).join("+")}` });
      envios.push(r && r.ok ? { ...reg, ok: true } : { ...reg, erro: (r && r.erro) || "sem resposta" }); }
    catch (e) { envios.push({ ...reg, erro: e.message }); }
  }
  const d2 = B.ler(); (d2.avisosRevisao = d2.avisosRevisao || []).push({ id: randomBytes(5).toString("hex"), em: agoraLocalISO(), evento, obra, ids: docs.map(a => a.id), docs: docs.map(B.codigo), por: quemFez, login: user.usuario, envios });
  B.gravar(d2);
}
