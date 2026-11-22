// medicao-telas.js — MEDIÇÃO, versão nova (03/11/2026): as telas. Os dados e as contas estão em medicao-dados.js.
//
// Entrada (as obras) → a obra, em abas: Resumo (dashboard + MAPA da obra), Boletins de medição, Aprovação, Estrutura
// (pavimentos, locais, serviços e modelos), Serviços e preços, Empreiteiros, Histórico.
// O lançamento é uma GRADE: locais nas linhas, serviços nas colunas; em cada célula o que já estava medido,
// o que ANDOU agora e como fica. O boletim sai por empreiteiro e mês, no formato da planilha (tabela, extras à parte).
// TELA LIMPA: número em destaque; explicação só com a classe `xp`, atrás do botão "Explique melhor".
import { shell as shellPainel, CORES_PDF } from "../ponte-engenharia.js";
import { readFileSync } from "node:fs";
import { DocPDF, largura } from "./medicao-pdf.js";
import { planilhaParaObra } from "./medicao-planilha.js";
import { ENVIO_BOLETIM } from "./medicao-chave.js";
/** A empresa do BOLETIM: o nome da empresa do config.json (tela, impressão, PDF e mensagem). */
export const EMPRESA_BOLETIM = D.EMPRESA_PROPRIA;   // 13/11: agora depende do empreiteiro (D.empresaDoEmp) — o boletim usa M.empresa
/** O ícone da câmera (fotos), fora das funções: usado no boletim e na grade do lançamento. */
const ICONE_CAM = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 7h4l2-2.5h6L17 7h4v12H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
import { CSS as CSS_ORC } from "./medicao-estilo.js";
import { prefixoTipo } from "./medicoes-gravar.js";
import * as D from "./medicao-dados.js";
// a ponte inteira (como objeto) só para saber se o envio automático está ligado (enviarMensagem): uma importação
// com o nome dela quebraria a pasta enquanto a função não existir na ponte do servidor
import * as PONTE from "../ponte-engenharia.js";
/** O envio automático (WhatsApp/e-mail pelo servidor) está ligado? Depende do e-mail configurado no config.json. */
export const envioLigado = () => typeof PONTE.enviarMensagem === "function";

const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, min = 2, max = min) => v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
const pct = (v, c = 0) => num((v || 0) * 100, c, c) + "%";
const dataBR = iso => /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : "—";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesBR = m => m ? MESES[+m.slice(5, 7) - 1] + "/" + m.slice(2, 4) : "—";
const mesLongo = m => m ? MESES_LONGOS[+m.slice(5, 7) - 1] + " de " + m.slice(0, 4) : "—";
const quandoBR = iso => iso ? dataBR(String(iso).slice(0, 10)) + " " + String(iso).slice(11, 16) : "";
const doc = d => { d = String(d || ""); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d; };
const fone = t => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 ? d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : d.length === 10 ? d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : d; };
export const base = obra => `/obras/medicao/${encodeURIComponent(obra)}`;
const lab = t => `<label class="mc-l">${t}</label>`;
const btnExp = `<button type="button" class="pg-pill" onclick="mcExp(this)">Explique melhor</button>`;
// o mapa pinta cada local pela % do VALOR já medido (aprovado), em faixas fixas — a mesma tabela monta a legenda
const FAIXAS = [{ ate: 0, cor: "#eeebe2", rot: "0% · não começou" }, { ate: 0.5, cor: "#ecd68c", rot: "0 a 50%" },
  { ate: 0.9999, cor: "var(--acento)", rot: "50 a 100%" }, { ate: Infinity, cor: "#b8e0c2", rot: "100% · todo medido" }];
const corDe = p => (FAIXAS.find(f => p <= f.ate) || FAIXAS[FAIXAS.length - 1]).cor;
const nomeEmp = (R, e) => (R.emp[e] || {}).nome || "—";
const equipeTxt = (R, partes) => partes.map(p => `${esc(nomeEmp(R, p.e))}${partes.length > 1 ? ` <small>${pct(p.p)}</small>` : ""}`).join(" · ");
const chip = st => st === D.ESTADOS.ok ? `<span class="md-st aprovada">aprovado</span>` : st === D.ESTADOS.aberto ? `<span class="md-st aberto">em aberto</span>`
  : st === D.ESTADOS.fila2 ? `<span class="md-st fila">${D.ETAPA_DIRETORIA ? "aguardando Diretoria" : "aguardando aprovação"}</span>` : `<span class="md-st fila">aguardando engenharia</span>`;
const totBol = B => B.itens.reduce((a, i) => a + i.valor, 0) + B.extras.reduce((a, x) => a + x.valor, 0);
/** A situação do boletim, com o aviso de reaberto (já tinha sido aprovado e voltou porque mexeram nos itens). */
/** Devolvido e ainda não corrigido/reenviado: está em aberto e a última devolução é depois da última reabertura. */
// ================================================================ O SINO (13/11): os avisos do que depende da pessoa, nas telas da Medição
// Um aviso por OBRA e por TIPO (nunca um por boletim). Quem aprova: boletins na fila dela e alterações de quantidade pendentes. Quem não aprova
// (o engenheiro): boletins aprovados esperando a assinatura do empreiteiro, boletins devolvidos para correção e as decisões das propostas de
// quantidade dele (aprovadas/recusadas), que somem no "ok, vi". O sino fica no topo da página.
function avisosDe(user) {
  const P = D.papel(user), aprova = P.engenharia || P.diretoria, ger = D.podeGerir(user), out = [];
  for (const { o, nova } of D.obrasDaMedicao()) {
    if (!nova || !D.podeObra(user, o.id)) continue;
    const O = D.lerObra(o.id); if (!O) continue;
    const b = "/obras/medicao/" + encodeURIComponent(o.id), nome = String(o.nome || o.id).replace(/ Residence$/, "");
    if (aprova) { const n = O.boletins.filter(B => D.etapaDeAprovar(B, P)).length;
      if (n) out.push({ ic: "📋", obra: nome, txt: `${n} boletim(ns) aguardando a sua aprovação`, href: `${b}?aba=aprovacao`, acao: true }); }
    if (ger) { const n = (O.qtdAlteracoes || []).filter(a => a.status === "pendente").length;
      if (n) out.push({ ic: "📐", obra: nome, txt: `${n} alteração(ões) de quantidade aguardando aprovação`, href: `${b}?aba=estrutura&qa=1`, acao: true }); }
    if (!aprova) {
      const ass = O.boletins.filter(B => situacaoAssinatura(B) === "falta").length;
      if (ass) out.push({ ic: "✍️", obra: nome, txt: `${ass} boletim(ns) aprovado(s) aguardando a assinatura do empreiteiro`, href: `${b}?aba=boletins&st=assinar`, acao: true });
      const dev = O.boletins.filter(devolvido).length;
      if (dev) out.push({ ic: "↩️", obra: nome, txt: `${dev} boletim(ns) devolvido(s) para correção`, href: `${b}?aba=boletins&st=devolvido`, acao: true });
    }
    const ds = D.decisoesNaoVistas(O, user);
    if (ds.length) { const ap = ds.filter(a => a.status === "aprovada").length, rc = ds.length - ap;
      out.push({ ic: "📐", obra: nome, txt: `Suas alterações de quantidade foram decididas: ${ap ? ap + " aprovada(s)" : ""}${ap && rc ? " e " : ""}${rc ? rc + " recusada(s)" : ""}`, decisoes: ds.map(a => ({ ...a, onde: D.ondeItem(O, a.item) })), obraId: o.id }); }
  }
  return out;
}
function sinoMedicao(user) {
  let av = []; try { av = avisosDe(user); } catch { av = []; }
  const n = av.length, n4 = v => num(+v || 0, 0, 4);
  const item = a => a.decisoes ? `<div class="mc-sn-i"><div><b>${esc(a.obra)}</b> · ${esc(a.txt)}</div>
      <table class="mc-sn-t">${a.decisoes.map(x => `<tr><td>${x.status === "aprovada" ? `<b style="color:#2e7d32">✓ aprovada</b>` : `<b style="color:#a8321f">✗ recusada</b>`}</td><td>${esc(x.onde)}<br><small>real ${x.qrAntes ? n4(x.qrAntes) : "(vazia)"} → <b>${n4(x.qrNova)}</b> · ${esc(x.decididoPor || "")} · ${quandoBR(x.decididoEm)}${x.motivoDecisao ? ` · motivo: ${esc(x.motivoDecisao)}` : ""}</small></td></tr>`).join("")}</table>
      <form method="POST" action="/obras/medicao/${encodeURIComponent(a.obraId)}/qtd-visto" style="margin:6px 0 0"><input type="hidden" name="volta" class="mc-sn-volta"><button class="mc-mini">ok, vi</button></form></div>`
    : `<a class="mc-sn-i" href="${a.href}"><span>${a.ic}</span><div><b>${esc(a.obra)}</b> · ${esc(a.txt)}</div><span class="seta">›</span></a>`;
  return `<div class="mc-sn noprint"><button type="button" class="mc-sn-b${n ? " tem" : ""}" onclick="var p=this.nextElementSibling;p.hidden=!p.hidden;document.querySelectorAll('.mc-sn-volta').forEach(function(i){i.value=location.pathname+location.search;});" title="${n ? n + " aviso(s)" : "Nenhum aviso"}"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a6 6 0 0 0-6 6v3.6c0 .9-.3 1.8-.9 2.5L4 15.5V17h16v-1.5l-1.1-1.4c-.6-.7-.9-1.6-.9-2.5V8a6 6 0 0 0-6-6Z"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0Z"/></svg>${n ? `<i>${n}</i>` : ""}</button>
    <div class="mc-sn-p" hidden><div class="mc-sn-h">Avisos${n ? ` <small>${n}</small>` : ""}</div>${n ? av.map(item).join("") : `<div class="mc-sn-vz">Nada esperando por você.</div>`}</div></div>`;
}
const CSS_SINO = `<style>.mc-sn{position:relative;float:right;margin:0 0 0 10px;z-index:30}.mc-sn-b{position:relative;border:1px solid #e3dcc6;background:#fff;border-radius:999px;width:38px;height:38px;cursor:pointer;line-height:1;color:#17171b;display:inline-flex;align-items:center;justify-content:center}.mc-sn-b i{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;border-radius:999px;background:#a8321f;color:#fff;font-style:normal;font-size:11px;font-weight:800;line-height:18px;padding:0 4px}
.mc-sn-p{position:absolute;right:0;top:44px;width:min(440px,92vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #e3dcc6;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.18);padding:6px}
.mc-sn-h{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);padding:8px 10px 6px}.mc-sn-h small{background:#a8321f;color:#fff;border-radius:999px;padding:1px 7px;margin-left:4px}
.mc-sn-i{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:10px;color:inherit;text-decoration:none;font-size:13px;line-height:1.35;flex-wrap:wrap}a.mc-sn-i:hover{background:#faf5e4}.mc-sn-i>div{flex:1;min-width:0}.mc-sn-i .seta{color:var(--mut)}
div.mc-sn-i{display:block;border-top:1px solid #f0ebdc}.mc-sn-t{width:100%;margin-top:6px;border-collapse:collapse;font-size:12px}.mc-sn-t td{padding:4px 4px;border-top:1px solid #f4efe2;vertical-align:top}.mc-sn-t td:first-child{white-space:nowrap}
.mc-sn-vz{padding:14px 10px;color:var(--mut);font-size:13px}@media print{.mc-sn{display:none}}</style>`;
/** Toda tela da Medição passa por aqui: o sino entra no topo da página, ao lado do nome da pessoa. */
const shell = o => shellPainel({ ...o, body: CSS_SINO + sinoMedicao(o.user) + o.body });
const devolvido = B => !!(B.devolucoes && B.devolucoes.length && B.status === D.ESTADOS.aberto && (!B.reaberturas.length || B.devolucoes[B.devolucoes.length - 1].em > B.reaberturas[B.reaberturas.length - 1].em));
const chipBol = B => chip(B.status) + (B.status !== D.ESTADOS.ok && (B.versoes || []).length ? ` <span class="md-st reab" title="Já tinha sido aprovado (versão ${B.versoes.length}); voltou porque itens foram lançados, alterados ou removidos">reaberto</span>` : "")
  + (devolvido(B) ? ` <span class="md-st rep">devolvido</span>` : "");

export const CSS = `<style>
.mc-l{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:4px}
.mc-i{padding:8px 10px;border:1px solid #ddd8c8;border-radius:9px;font:inherit;font-size:13px;background:#fff;width:100%;box-sizing:border-box}
.md-st{display:inline-block;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:800;white-space:nowrap}
.md-st.aprovada{background:#e8f2e2;color:#2f6b2f}.md-st.rep{background:#fbe0e0;color:#8a2d2d}.md-st.fila{background:#fde9a8;color:#7a4b00}
.md-st.aberto{background:#e8eef7;color:#2f5d9a}.md-st.reab{background:#f3e3ff;color:#6b2f9a}.md-st.novo{background:#dff3e6;color:#1f7a45}.md-st.alt{background:#fde9a8;color:#7a4b00}
.oc-abas a i.ab{background:#2f5d9a}
.mc-bol tr.mc-mudou td{background:#fffbe6}.mc-bol tr.mc-removido td{color:#8a2d2d;text-decoration:line-through;background:#fdf2f2}
.mc-lanc{margin-top:4px;font-size:11.5px}.mc-lanc summary{cursor:pointer;color:#6a5e3a;font-weight:700}.mc-lanc div{padding:3px 0;border-top:1px dashed #eee6d0}
.mc-acoes{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0}
.mc-chips{display:flex;gap:6px;flex-wrap:wrap}.mc-chip{border:1px solid #e0d9c4;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:700;color:#5a4e2e;text-decoration:none;background:#fff}
.mc-chip b{margin-left:4px}.mc-chip.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.mc-tempo{display:flex;flex-direction:column;gap:4px;font-size:12.5px}.mc-tempo div{display:grid;grid-template-columns:120px minmax(0,1fr) auto;gap:10px;border-bottom:1px solid #f1eee4;padding:4px 0}
.mc-tempo span{color:var(--mut);font-variant-numeric:tabular-nums}.mc-tempo small{color:var(--mut)}
.mc-bol td.mc-ac,.mc-bol th.mc-ac{width:96px;padding:3px 6px;white-space:nowrap;vertical-align:middle}.mc-ac div{display:flex;gap:4px;justify-content:flex-end}
.mc-ico{position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #ddd6bf;border-radius:7px;background:#fff;color:#8a8a92;cursor:pointer;padding:0}
.mc-ico:hover{border-color:var(--acento);color:var(--escuro)}.mc-ico.tem{color:#9a7a14;border-color:#e2cf8f;background:#fbf3dd}
.mc-ico i{position:absolute;top:-6px;right:-6px;min-width:15px;height:15px;border-radius:999px;background:var(--escuro);color:var(--acento-claro);font-style:normal;font-size:9.5px;font-weight:800;line-height:15px;text-align:center;padding:0 3px}
.mc-obsbox{border:1px solid #e6e1d2;border-radius:10px;padding:10px 12px}.mc-obsg{white-space:pre-line;line-height:1.6;margin:0 0 6px}
.mc-obsi{border-top:1px dashed #e6e1d2;padding:7px 0}.mc-obsi>small{color:var(--mut)}.mc-obsi .t{white-space:pre-line;margin-top:3px;line-height:1.5}.mc-obsi .t small{color:var(--mut)}.mc-obsi .t.l{color:#4a4a52;font-size:12px}
.mc-obsi .mc-fotos img{height:64px}
.soprint{display:none}@media print{.soprint{display:block}}
.mc-dlg{box-sizing:border-box;border:0;border-radius:16px;padding:18px 20px;width:min(520px,92vw);margin:auto;inset:0;position:fixed;height:fit-content;max-height:90vh;overflow:auto;box-shadow:0 18px 48px rgba(0,0,0,.3)}.mc-dlg::backdrop{background:rgba(23,23,27,.45)}
details.mc-add{margin-top:12px}details.mc-add>summary{list-style:none;display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border:1.5px dashed #d8c78f;border-radius:10px;background:#fffcf2;color:#6a5310;font-size:13px;font-weight:700;cursor:pointer}
details.mc-add>summary::-webkit-details-marker{display:none}details.mc-add>summary::before{content:"+";display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;background:var(--acento);color:#fff;font-size:15px;line-height:1}
details.mc-add>summary:hover{border-style:solid;border-color:var(--acento);background:#fbf3dd}details.mc-add[open]>summary{border-style:solid;border-color:var(--acento);background:#fbf3dd;border-radius:10px 10px 0 0}
details.mc-add[open]>form,details.mc-add[open]>div{border:1.5px solid var(--acento);border-radius:0 10px 10px 10px;padding:12px 14px;margin-top:-1.5px;background:#fff}
.mc-novo{display:inline-flex;align-items:center;gap:7px}.mc-novo::before{content:"+";display:inline-flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:999px;background:rgba(255,255,255,.25);font-size:15px;line-height:1}
.mc-conf{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}.mc-conf td{padding:7px 6px;border-top:1px solid #eee9da;vertical-align:middle}.mc-conf .ok{color:#1f6b3a;font-weight:700}.mc-conf .nao{color:#a8321f;font-weight:700}
.mc-dlg.lg{width:min(680px,94vw)}@media(max-width:520px){.mc-dlg,.mc-dlg.lg{width:96vw;padding:16px 14px}}
.mc-arvore{display:flex;flex-direction:column;gap:8px}.mc-arg{display:flex;flex-direction:column;gap:5px;margin:6px 0 4px 10px}
details.mc-ar{border:1px solid #e6e0cf;border-radius:10px;background:#fff;overflow:hidden}details.mc-ar>summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap;list-style:none;cursor:pointer;padding:7px 10px;user-select:none}
details.mc-ar>summary::-webkit-details-marker{display:none}details.mc-ar>summary .nm{font-weight:800}details.mc-ar>summary small{color:var(--mut);font-weight:600;font-size:12px}
details.mc-ar>summary .ac{margin-left:auto;display:flex;gap:6px;align-items:center}details.mc-ar>.in{display:flex;flex-direction:column;gap:5px}
/* PAVIMENTO: faixa dourada e fundo creme; aberto, o miolo fica num creme mais claro */
details.mc-ar.p{border-color:#e2d3a4}details.mc-ar.p>summary{background:#f5edd5;border-left:5px solid var(--acento);padding:8px 10px 8px 9px}
details.mc-ar.p>summary .nm{font-size:15px;color:#2a2410}details.mc-ar.p>summary:hover{background:#efe3bf}
details.mc-ar.p[open]>summary{background:#ecdcab;border-bottom:1px solid #dcc98e}details.mc-ar.p>.in{background:#fcf9f0;padding:8px 10px 10px 18px}
/* LOCAL: branco, faixa cinza-azulada; aberto, cabeçalho cinza claro e a tabela de serviços no branco */
details.mc-ar.l{border-color:#dcdde3;background:#fff}details.mc-ar.l>summary{background:#fff;border-left:4px solid #8d93a5;padding:6px 10px 6px 9px}
details.mc-ar.l>summary .nm{font-weight:700;font-size:13.5px;color:#23262f}details.mc-ar.l>summary:hover{background:#f3f4f7}
details.mc-ar.l[open]>summary{background:#e9ebf1;border-bottom:1px solid #d6d9e2}details.mc-ar.l>.in{background:#fff;padding:6px 8px 8px 12px}
details.mc-ar.l .oc-t thead th{background:#f6f7fa}
.mc-mais{color:#6a5310;border-color:#e2cf8f;background:#fffcf2}.mc-mais:hover{border-color:var(--acento);background:#fbf3dd}
.mc-pvf{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}.mc-pvf form{display:flex;gap:5px;align-items:center;margin:0}.mc-pvf .mc-i{width:170px;padding:4px 8px;font-size:12.5px}
.mc-arv{border:1px solid #ece8dc;border-radius:10px;padding:8px 10px;max-height:46vh;overflow:auto;background:#fdfcf8}.mc-avg{margin:0 0 6px}
.mc-avg .gt{display:flex;gap:6px;align-items:center;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6a5e3a;margin:4px 0}
.mc-arv details.pv{border:1px solid #ece8dc;border-radius:8px;margin:0 0 4px 18px;background:#fff}.mc-arv details.pv>summary{display:flex;gap:6px;align-items:center;cursor:pointer;padding:5px 8px;font-size:12.5px;list-style:none}
.mc-arv details.pv>summary::-webkit-details-marker{display:none}.mc-arv details.pv>summary .n{color:var(--mut);margin-left:auto}
.mc-arv .ls{display:flex;gap:4px 14px;flex-wrap:wrap;padding:4px 10px 8px 30px;font-size:12.5px}.mc-arv .ls label{display:flex;gap:4px;align-items:center}
.mc-arv .pv.off{margin:0 0 4px 18px;padding:5px 8px;font-size:12.5px;color:#9a9aa2}.mc-arv .pv.off small{font-size:11.5px}
.mc-rep{border:1px solid #ece8dc;border-radius:10px;padding:10px 12px;background:#fdfcf8}.mc-rep label{display:flex;gap:6px;align-items:center;font-size:13px}
.mc-alvo{margin-top:8px;max-height:34vh;overflow:auto;display:flex;flex-direction:column;gap:3px}.mc-alvo .li{display:flex;gap:6px;align-items:center;font-size:12.5px;padding:3px 4px}
.mc-alvo .ori{color:#1f6b3a}.mc-alvo .fora{color:#9a9aa2}
.mc-conf2 p{margin:0 0 8px;font-size:13.5px}.mc-conf2 .rt{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6a5e3a;margin:10px 0 4px}
.mc-conf2 ul{margin:0;padding-left:18px;font-size:13px;line-height:1.6}.mc-conf2 ul.cols{columns:2 220px;max-height:38vh;overflow:auto}
.mc-hist{display:flex;flex-direction:column;gap:4px;margin-top:10px}details.mc-hl{border:1px solid #ece7d8;border-radius:9px;background:#fff}
details.mc-hl>summary{display:grid;grid-template-columns:16px 112px minmax(90px,150px) 1fr auto;gap:8px;align-items:baseline;list-style:none;cursor:pointer;padding:7px 10px;font-size:13px}
details.mc-hl>summary::-webkit-details-marker{display:none}details.mc-hl>summary:hover{background:#fbf8ef;border-radius:9px}details.mc-hl[data-sem]>summary{color:#6b6b72}
details.mc-hl>summary .q{white-space:nowrap;color:var(--mut);font-variant-numeric:tabular-nums}details.mc-hl>summary .p{font-weight:700}details.mc-hl>summary small{color:var(--mut);white-space:nowrap}
details.mc-hl[open]>summary{border-bottom:1px solid #f0ece0;background:#faf8f1;border-radius:9px 9px 0 0}details.mc-hl>.in{padding:8px 12px 10px 34px}
details.mc-hl ul{margin:0;padding-left:16px;font-size:12.5px;line-height:1.65}.mc-hd-mais{color:#1f6b3a}.mc-hd-menos{color:#a8321f}
@media(max-width:700px){details.mc-hl>summary{grid-template-columns:16px 1fr auto}details.mc-hl>summary .p,details.mc-hl>summary .t{grid-column:2/-1}}
.mc-etqs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0}
.mc-etq{display:inline-flex;gap:6px;align-items:center;padding:3px 10px;border-radius:999px;background:#fbf3dd;border:1px solid #e2cf8f;color:#5a4510;font-size:12px;font-weight:700;text-decoration:none}
.mc-etq b{font-size:10px;color:#9a7a14}.mc-etq:hover{border-color:var(--acento);background:#f7ebc6}
#mcBarraLugar{margin:0 0 14px}#mcBarraLugar .mc-filtros{margin:0}.mc-etq.lp{background:#fff;border-color:#ddd6bf;color:#6b6b72}
.mc-fixa{position:fixed;left:0;right:0;top:64px;z-index:30;display:none;justify-content:center;pointer-events:none}.mc-fixa.on{display:flex}
.mc-fixa-in{pointer-events:auto;width:min(1180px,calc(100vw - 24px));background:rgba(250,249,244,.98);border:1px solid #efeade;border-top:0;border-radius:0 0 12px 12px;box-shadow:0 8px 18px rgba(0,0,0,.12);padding:7px 10px}
.mc-fixa .mc-filtros{margin:0;padding:0;border:0;background:transparent;gap:8px}.mc-fixa .mc-filtros>div>:not(select){display:none}.mc-fixa .mc-filtros select{padding:5px 8px!important;font-size:12.5px!important}
.mc-fixa .mc-etqs{margin-top:6px}.mc-fbt{display:none}
html{overflow-anchor:none}.mc-carregando{opacity:.55;transition:opacity .15s;pointer-events:none}
@media(max-width:700px){.mc-fixa{flex-direction:column;align-items:flex-start;padding:0 12px}.mc-fixa-in{width:100%;border-radius:12px;border-top:1px solid #efeade}
  .mc-fbt{display:inline-flex;align-items:center;gap:6px;margin:6px 0;padding:7px 14px;border-radius:999px;border:0;background:var(--escuro);color:var(--acento-claro);font:inherit;font-size:13px;font-weight:800;box-shadow:0 4px 12px rgba(0,0,0,.2);cursor:pointer;pointer-events:auto}
  .mc-fixa:not(.aberto) .mc-fixa-in{display:none}.mc-fixa .mc-filtros{grid-template-columns:1fr}}
.mc-ftb{position:relative;display:inline-flex;align-items:center;justify-content:center;width:24px;height:19px;border:1px solid #d9d2bb;border-radius:6px;background:#fff;color:#7a7a82;cursor:pointer;flex:none}
.mc-ftb:hover{border-color:var(--acento);color:var(--escuro)}.mc-ftb input{display:none}.mc-ftb.tem{background:#fbf3dd;border-color:#e2cf8f;color:#9a7a14}
.mc-ftb i{position:absolute;top:-6px;right:-6px;min-width:15px;height:15px;border-radius:999px;background:var(--escuro);color:var(--acento-claro);font-style:normal;font-size:9.5px;font-weight:800;line-height:15px;text-align:center;padding:0 3px}.mc-ftb i:empty{display:none}
.mc-exb{display:inline-block;margin:0;border:1px dashed #d8c78f;background:#fffcf2;color:#6a5310;border-radius:5px;font:inherit;font-size:11px;font-weight:700;padding:1px 5px;line-height:1.35;cursor:pointer;white-space:nowrap;flex:none}
.mc-exb:hover{border-style:solid;border-color:var(--acento)}.mc-exb.tem{background:var(--acento);border:1px solid var(--acento);color:#fff}
.mc-g .mc-c .mc-exb:not(.tem),.mc-g .mc-c .mc-ftb:not(.tem){display:none}
.mc-gmodo{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 8px}
.mc-seg{display:inline-flex;align-items:center;border:1px solid #d9d2bb;border-radius:999px;overflow:hidden;background:#fff;margin-right:6px}.mc-seg>span{font-size:11.5px;font-weight:700;color:var(--mut);padding:0 8px 0 12px}
.mc-seg button{border:0;border-left:1px solid #e6e1d2;background:#fff;font:inherit;font-size:12.5px;font-weight:700;padding:6px 12px;cursor:pointer;color:#3a3220}.mc-seg button.on{background:var(--escuro);color:var(--acento-claro)}
.mc-c small.qt{margin-top:0;color:#6a6a72}.mc-c small.tot{color:#8a8a92;font-size:10.5px;margin-top:2px}
.mc-c .dir{margin-left:auto;padding-top:1px;display:grid;grid-template-columns:auto auto auto;column-gap:3px;justify-items:end;align-items:baseline;font-size:10px;line-height:1.45}
.mc-c .dir small{display:contents}.mc-c .dir i{font-style:normal;color:#9a9aa2;font-size:8.5px}.mc-c .dir span,.mc-c .dir b{font-size:10px}.mc-c .dir span{justify-self:end}.mc-c .dir i{justify-self:center}.mc-c .dir b{justify-self:start}.mc-c .dir small.qt span,.mc-c .dir small.qt b{color:#6a6a72}.mc-c .dir small.qt b{color:#3a3a42}.mc-c .lin{gap:6px}.mc-gmodo .oc-btn.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.mc-gmodo .dica{font-size:12.5px;font-weight:700;color:#8a6d00}
#mcGradeBox.modo td.mc-c:not(.nada){cursor:copy}#mcGradeBox.modo td.mc-c:not(.nada):hover{outline:2px solid var(--acento);outline-offset:-2px;background:#fffaea}
#mcGradeBox.modo-foto td.mc-c.cheio,#mcGradeBox.modo-foto td.mc-c.pend{opacity:.45;cursor:not-allowed}#mcGradeBox.modo-foto td.mc-c.cheio:hover{outline:0;background:none}
.mc-exl{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid #ece7d8;border-left:4px solid var(--acento);border-radius:8px;padding:7px 10px;margin:0 0 6px;background:#fff;font-size:13px}
.mc-exl .txt small{display:block;color:var(--mut);font-size:12px;margin-top:2px}.mc-exl .ac{display:flex;gap:6px;flex:none}
.mc-verpv{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6a5e3a;margin:12px 0 4px;border-bottom:1px solid #ece7d8;padding-bottom:3px}
.mc-verl{display:grid;grid-template-columns:minmax(0,1fr) auto 100px 26px;gap:10px;align-items:baseline;font-size:12.5px;padding:3px 0}.mc-verl b{text-align:right;font-variant-numeric:tabular-nums}.mc-verl small{color:var(--mut)}
.mc-verx{border:1px solid #e3c9c4;background:#fff;color:#a8321f;border-radius:6px;font:inherit;font-weight:800;font-size:13px;line-height:1;padding:3px 0;width:24px;cursor:pointer}.mc-verx:hover{background:#a8321f;color:#fff}
.mc-verl.tot{border-top:2px solid var(--escuro);margin-top:8px;padding-top:6px;font-weight:800}
#mcDlgVer{max-height:85vh}
.mc-conf-p{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:12px 14px;margin:12px 0}
.mc-conf-g{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(220px,1fr);gap:16px;align-items:start}@media(max-width:760px){.mc-conf-g{grid-template-columns:1fr}}.mc-conf-g>div{min-width:0}.mc-al{overflow-wrap:anywhere}.mc-cmp .c{min-width:0}@media(max-width:600px){.mc-cmp{gap:4px}.mc-cmp .c .v{font-size:9.5px}.mc-cmp .c small{font-size:10px}.mc-mm{grid-template-columns:70px minmax(0,1fr)}}
.mc-al{border-left:4px solid;border-radius:8px;padding:7px 10px;margin:0 0 6px;font-size:13px;cursor:default}.mc-al[onclick]{cursor:pointer}.mc-al[onclick]:hover{filter:brightness(.97)}
.mc-al .d{font-size:12px;color:#4a4a52;margin-top:2px}.mc-al .lk{color:#6a5e3a;font-weight:700;text-decoration:underline;margin-left:4px}
.mc-cmp{position:relative;display:flex;gap:8px;align-items:flex-end;height:110px;padding-top:4px}.mc-cmp .c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.mc-cmp .c i{display:block;width:70%;max-width:34px;background:#cfc8b2;border-radius:3px 3px 0 0}.mc-cmp .c.on i{background:var(--acento)}.mc-cmp .c .v{font-size:11px;font-weight:700;margin-bottom:2px;white-space:nowrap}
.mc-cmp .c small{font-size:11px;color:#5f5f66;margin-top:3px}.mc-cmp .c.on small,.mc-cmp .c.on .v{color:var(--escuro);font-weight:800}
.mc-cmp .md{position:absolute;left:0;right:0;border-top:2px dashed #b03a3a;font-size:10.5px;color:#b03a3a;text-align:right;line-height:1;padding-top:2px}
.mc-mm{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px;align-items:start;margin:0 0 5px;font-size:12px}.mc-mm>div{display:flex;flex-wrap:wrap;gap:4px}
.mc-mm span{border:1px solid #e6e1d2;border-radius:6px;padding:2px 6px;color:#8a8a92;background:#fbfaf6}.mc-mm span.on{background:var(--acento-claro);border-color:var(--acento);color:#2a2410;font-weight:700}
.mc-mm span small{margin-left:4px;font-weight:600;color:#6a5310}
tr.mc-ftrow td{padding-top:0!important;border-top:0!important}tr.mc-ftrow .mc-fotos{margin:0 0 4px}tr.mc-ftrow .mc-fotos img{height:46px}
tr.mc-pisca td{animation:mcPisca 2.2s ease-out}@keyframes mcPisca{0%,40%{background:#fff1b8}100%{background:transparent}}
.mc-filaconf{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px}.mc-filaconf .t{font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#f1f1f3;color:#4a4a52}
.mc-filaconf .t.a{background:#fbe7e3;color:#a8321f}.mc-filaconf .t.m{background:#fdf2d8;color:#9a6a0a}.mc-filaconf .t.ok{background:#e6f3ea;color:#1f6b3a}.mc-filaal{font-size:12.5px;color:#4a4a52}
.mc-obv{display:flex;flex-direction:column}.mc-obv .mc-oblk{display:block;color:inherit;text-decoration:none;flex:1}
.mc-recom{align-self:flex-end;margin-top:8px;border:0;background:none;padding:0;font:inherit;font-size:11.5px;color:#8a8a92;text-decoration:underline;cursor:pointer}.mc-recom:hover{color:#a8321f}
.mc-tserv td small.mc-sn{display:block;font-size:10.5px;color:var(--mut);font-weight:600}.mc-tserv td a:hover b{text-decoration:underline}
.mc-rhobs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:12px;align-items:start}.mc-rhob .oc-t td,.mc-rhob .oc-t th{white-space:nowrap}
.mc-rht{table-layout:fixed;width:100%;min-width:700px}.mc-rht td:first-child{overflow:hidden;text-overflow:ellipsis}
.mc-rhok{color:#1f6b3a;font-weight:700}.mc-rhok small{color:#4a4a52;font-weight:600}.mc-rhno{color:#a8321f;font-weight:700}
@media print{.mc-rhobs{grid-template-columns:1fr}.mc-quadro{break-inside:avoid}}
.mc-dlg .rot{font-size:13px;font-weight:700;margin:0 0 10px;color:#3a3a42}
.mc-ass2{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px}.mc-ass2 .cx{display:flex;flex-direction:column;justify-content:flex-end;min-height:120px}
.mc-ass2 .t{font-size:12px;line-height:1.55;padding:0 4px 6px}.mc-ass2 .t .ok{color:#1f6b3a;font-weight:700}.mc-ass2 .t small{color:var(--mut)}.mc-ass2 .t.vazio{height:70px}
.mc-ass2 .t img{display:block;max-height:80px;max-width:100%;margin:0 auto 4px}.mc-ass2 .l{border-top:1px solid #333;text-align:center;padding-top:5px;font-size:12px;font-weight:700}
.mc-cod{text-align:center;font-size:11.5px;color:var(--mut);margin-top:14px;letter-spacing:.02em}.mc-cod b{color:#17171b;font-family:ui-monospace,Menlo,monospace}
@media(max-width:640px){.mc-ass2{grid-template-columns:1fr}}
.mc-final{display:flex;gap:8px;flex-wrap:wrap;align-items:stretch;background:#faf9f4;border:1px solid #efeade;border-radius:14px;padding:10px 12px;margin:12px 0 0}
.mc-final .p{display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;padding:4px 8px;border-radius:10px;color:var(--mut)}.mc-final .p>b{display:inline-flex;width:20px;height:20px;border-radius:999px;align-items:center;justify-content:center;background:#e6e1d2;color:#5a4e2e;font-size:11px}
.mc-final .p.on{color:#17171b}.mc-final .p.on>b{background:var(--escuro);color:var(--acento-claro)}.mc-final .p.ok>b{background:#2f7d55;color:#fff}.mc-final a{color:inherit}
.mc-envio{display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center}
.mc-opcs{display:flex;flex-direction:column;gap:8px}.mc-opc{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;border:1px solid #e0d9c4;border-radius:12px;background:#fff;padding:11px 14px;font:inherit;cursor:pointer}
.mc-opc:hover:not(:disabled){border-color:var(--acento);background:#fffbef}.mc-opc b{font-size:14px}.mc-opc small{font-size:12px;color:var(--mut)}.mc-opc:disabled{cursor:not-allowed;opacity:.55;background:#faf9f4}.mc-dica{font-size:11.5px;color:var(--mut);font-weight:600}
.mc-assinar{max-width:560px;margin:0 auto}.mc-quadro-ass{position:relative;border:2px dashed var(--acento);border-radius:14px;background:#fff;height:240px;touch-action:none}
.mc-quadro-ass canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}.mc-quadro-ass .linha{position:absolute;left:8%;right:8%;bottom:28%;border-top:1px solid #d8d2bf;pointer-events:none}
.mc-quadro-ass .dica{position:absolute;left:0;right:0;bottom:12%;text-align:center;color:#c4bda6;font-size:13px;pointer-events:none}
.mc-mx{width:min(1400px,97vw);max-width:97vw;height:92vh;max-height:92vh;padding:14px 16px;display:none;flex-direction:column}.mc-mx[open]{display:flex}
.mc-mxf{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:8px}.mc-mxf label{display:block;font-size:10.5px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.mc-mxf select{padding:6px 8px;border:1px solid #ddd8c8;border-radius:8px;font:inherit;font-size:12.5px;background:#fff;min-width:150px;max-width:260px}
.mc-mxw{flex:1;overflow:auto;border:1px solid #d9d3c2;border-radius:8px;background:#fff}
.mc-mxt{border-collapse:collapse;font-size:12px;width:100%}.mc-mxt th{position:sticky;top:0;background:#f4f1e6;z-index:2;font-size:11px;text-align:left;padding:5px 6px;border:1px solid #e3dcc6;white-space:nowrap;vertical-align:bottom}
.mc-mxt td{border:1px solid #ece7d8;padding:0 6px;height:26px;white-space:nowrap}.mc-mxt td.n{text-align:right;font-variant-numeric:tabular-nums}.mc-mxt tr:hover td{background:#fffcf2}
.mc-mxt td.ed{padding:0;background:#fffdf6}.mc-mxt td.ed input{width:100%;min-width:84px;height:26px;border:0;background:transparent;text-align:right;font:inherit;font-size:12.5px;padding:0 6px;font-variant-numeric:tabular-nums}
.mc-mxt td.ed input:focus{outline:2px solid var(--acento);outline-offset:-2px;background:#fff}.mc-mxt td.ed.mud{background:#fff1c4}.mc-mxt td.ed.ruim{background:#fbe0e0}
.mc-mxt th .ap{display:flex;gap:2px;margin-top:3px}.mc-mxt th .ap input{width:70px;padding:2px 4px;border:1px solid #cfc8b2;border-radius:5px;font:inherit;font-size:11px;text-align:right}.mc-mxt th .ap button{border:1px solid #d9d2bb;background:#fff;border-radius:5px;font:inherit;font-size:10.5px;padding:1px 5px;cursor:pointer}
#mcDlgMxC{height:auto!important}#mcDlgMxC .oc-btn:disabled{opacity:.4;cursor:not-allowed}.mc-mxb{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:8px;flex-wrap:wrap}.mc-mxb .info{margin-right:auto;font-size:12.5px;color:var(--mut)}
.mc-qpend{font-size:11px;font-weight:700;color:#8a6d00;background:#fff6dc;border:1px solid #ecd9a0;border-radius:6px;padding:1px 6px;margin-top:3px;display:inline-block;white-space:nowrap}
.mc-qaban{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff6dc;border:1px solid #ecd9a0;border-radius:12px;padding:9px 12px;margin:0 0 12px;font-size:13px}
.mc-qat td,.mc-qat th{font-size:12px;vertical-align:top}.mc-qat .imp{font-size:11.5px;color:#4a4a52;min-width:190px;line-height:1.45}.mc-qat td,.mc-qat th{padding-left:6px!important;padding-right:6px!important}.mc-qat td:nth-child(3){min-width:130px}.mc-qat th{white-space:normal}.mc-qat .imp b.ruim{color:#a8321f}
.mc-pgr{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;margin-bottom:10px}
.mc-pg{border:1px solid #e6e1d2;border-radius:12px;background:#fff;min-width:200px}.mc-pg>summary{list-style:none;cursor:pointer;padding:8px 12px;font-size:13px;display:flex;gap:6px;align-items:baseline}
.mc-pg>summary::-webkit-details-marker{display:none}.mc-pg>summary small{color:var(--mut);font-weight:600}.mc-pg>summary small.on{color:#8a6d00}
.mc-pgl{display:flex;flex-direction:column;gap:2px;padding:0 12px 6px}.mc-pgl label{display:flex;gap:7px;align-items:center;font-size:13px;padding:3px 0;cursor:pointer}
.mc-pgb{display:flex;gap:6px;flex-wrap:wrap;padding:4px 12px 10px}
.mc-lls{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.mc-ll{border:1px solid #e6e1d2;border-radius:12px;background:#fff;min-width:180px;padding-top:8px}
.mc-ll .t{font-size:12.5px;font-weight:800;padding:0 12px 4px}.mc-ll .t small{display:block;font-weight:600;color:var(--mut)}
.mc-bw{position:relative}#mcFiltro .mc-bw{width:240px;max-width:100%}#mcServBox .mc-bw{width:360px}.mc-bw select.mc-busca{display:none}.mc-bw input{width:100%}
.mc-bl{position:absolute;left:0;min-width:100%;width:max-content;max-width:min(560px,78vw);top:100%;z-index:20;background:#fff;border:1px solid #ddd8c8;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:260px;overflow:auto;margin-top:2px;display:none}
.mc-bl.on{display:block}.mc-bl div{padding:7px 10px;font-size:13px;cursor:pointer;border-bottom:1px solid #f2efe6}.mc-bl div:last-child{border-bottom:0}
.mc-bl div.sel,.mc-bl div:hover{background:#faf5e4}.mc-bl div.off{color:#b5b0a2;cursor:default;background:#fff}.mc-bl .nada{color:var(--mut);cursor:default}
.mc-cheia{position:fixed;inset:0;z-index:9999;background:#fff;display:none;touch-action:none;overscroll-behavior:none}.mc-cheia.on{display:block}
.mc-cheia canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.mc-cheia .linha{position:absolute;left:6%;right:6%;bottom:24%;border-top:2px solid #e2dccb;pointer-events:none}
.mc-cheia .dica{position:absolute;left:0;right:0;bottom:12%;text-align:center;color:#c4bda6;font-size:15px;pointer-events:none}
.mc-cheia .barra{position:absolute;top:0;left:0;right:0;display:flex;gap:8px;align-items:center;padding:8px 10px;background:rgba(23,23,27,.92);color:#fff;font-size:13px;z-index:2}
.mc-cheia .barra b{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mc-cheia .barra button{font:inherit;font-weight:700;border-radius:9px;padding:9px 14px;border:1px solid #555;background:transparent;color:#fff}
.mc-cheia .barra button.p{background:var(--acento);border-color:var(--acento);color:#17171b}.mc-cheia .barra button:disabled{opacity:.45}
.mc-cheia .vire{position:absolute;inset:52px 0 0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;text-align:center;color:#6b6658;font-size:15px;pointer-events:none}
@media (orientation:portrait){.mc-cheia.vazia .vire{display:flex}.mc-cheia.vazia .dica{display:none}}
.mc-cheia .vire span{font-size:54px;display:inline-block;transform:rotate(90deg)}
@media print{.mc-imp{box-shadow:none}.mc-bol table{font-size:10.5px}}
.mc-corl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid #f1eee4;padding:8px 0}.mc-corl>div:first-child{flex:1;min-width:150px}.mc-corl small{display:block;color:var(--mut);font-size:11.5px}
.mc-corf{display:flex;gap:5px;align-items:center;margin:0}.mc-dlg .bt{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.mc-obras{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.mc-ob{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:16px;text-decoration:none;color:inherit;display:block}
.mc-ob:hover{border-color:var(--acento)}.mc-ob h3{margin:0 0 6px;font-size:15px}.mc-ob b.v{font-size:21px;display:block;font-variant-numeric:tabular-nums}
.mc-ob small{color:var(--mut);font-size:12px}.mc-ob.off{background:#faf9f4}
/* cards de número: sempre em fileiras iguais (1, 2 ou 3) e o valor encolhe com o card — nunca passa da borda */
.mc-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:479px){.mc-kpis .oc-k{padding:8px 10px}.mc-kpis .oc-k b{font-size:clamp(13px,12.5cqi,20px)}.mc-kpis .oc-k em{font-size:10.5px}}
@media(min-width:760px){.mc-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1000px){.mc-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(max-width:759px){.mc-kpis .oc-k:last-child:nth-child(odd){grid-column:1/-1}}
.mc-kpis{gap:10px;margin-bottom:12px}.mc-kpis .oc-k{padding:10px 12px}.mc-kpis .oc-k span{margin-bottom:4px;font-size:10px}.mc-kpis .oc-k em{font-size:11.5px;margin-top:3px}
@media(min-width:1000px){.mc-kpis .oc-k b{font-size:clamp(14px,12cqi,21px)}}
.mc-kpis .oc-k,.mc-ob{container-type:inline-size;min-width:0;overflow:hidden}
.mc-kpis .oc-k b{font-size:clamp(15px,11.5cqi,25px);white-space:nowrap}
.mc-kpis .oc-k em{overflow-wrap:anywhere}
.mc-ob b.v{font-size:clamp(15px,9cqi,21px);white-space:nowrap}
/* o dashboard (aba Dashboard; o endereço continua ?aba=resumo) */
.mc-filtros{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end;background:#faf9f4;border:1px solid #efeade;border-radius:14px;padding:12px 14px;margin:0 0 14px}
.mc-quadros{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin:12px 0 4px}
@media(min-width:900px){.mc-quadros{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.mc-largo{grid-column:1/-1}}
.mc-unids{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 22px;align-items:start}.mc-unid{min-width:0}.mc-unids .mc-sub{margin-top:2px}
.mc-colq{display:flex;flex-direction:column;gap:12px;min-width:0}.mc-tabemp>summary::-webkit-details-marker{display:none}.mc-alem{display:none!important}.mc-bars.todos .mc-alem{display:grid!important}
.mc-vertodos{align-self:flex-start;margin-top:4px;border:0;background:none;padding:2px 4px;font:inherit;font-size:12px;font-weight:700;color:#8a6d12;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.mc-quadro{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:12px 14px;min-width:0}
.mc-qt{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6a5e3a;margin:0 0 10px}.mc-qt small{margin-left:8px;letter-spacing:0;text-transform:none;font-weight:600;color:var(--mut)}
.mc-sub{font-size:11px;font-weight:800;color:var(--mut);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.06em}
.mc-bars{display:flex;flex-direction:column;gap:3px}
.mc-bar{display:grid;grid-template-columns:minmax(90px,34%) minmax(0,1fr) 108px;gap:8px;align-items:center;font-size:12px;color:inherit;text-decoration:none;border-radius:6px;padding:2px 4px}
a.mc-bar:hover{background:#faf6e8}
.mc-bar .rot{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mc-bar .rot small{display:block;font-weight:600;color:var(--mut);font-size:10.5px;overflow:hidden;text-overflow:ellipsis}
.mc-bar .trilho{position:relative;display:flex;height:14px;background:#f4f1e8;border-radius:4px;overflow:visible}
.mc-bar .trilho i.a{background:#17171b;border-radius:4px 0 0 4px}.mc-bar .trilho i.b{background:var(--acento)}.mc-bar .trilho i:last-of-type{border-radius:0 4px 4px 0}
.mc-bar .trilho i.media{position:absolute;top:-3px;bottom:-3px;width:0;border-left:2px dashed #b03a3a;z-index:1}
.mc-bar .val{font-variant-numeric:tabular-nums;font-weight:800;white-space:nowrap;font-size:11.5px;text-align:right}
.mc-colg{display:flex;gap:6px;align-items:flex-end;height:150px;overflow-x:auto;padding-bottom:2px}
.mc-col{flex:1 0 46px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;text-decoration:none;color:inherit;border-radius:8px;padding:2px}
.mc-col:hover,.mc-col.on{background:#faf6e8}.mc-col.on small{color:var(--escuro);font-weight:800}
.mc-col .v{font-size:10px;font-weight:800;white-space:nowrap;margin-bottom:3px;font-variant-numeric:tabular-nums}
.mc-col .pilha{display:flex;flex-direction:column;justify-content:flex-end;width:70%;max-width:42px;height:100px}.mc-col .pilha i{display:block;width:100%}
.mc-col .pilha i.a{background:#17171b;border-radius:0 0 3px 3px}.mc-col .pilha i.b{background:var(--acento);border-radius:3px 3px 0 0}
.mc-col small{font-size:10.5px;color:var(--mut);margin-top:4px;white-space:nowrap}
.mc-rosca{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.mc-rosca svg circle{transform-origin:center}
.mc-leg2{display:flex;flex-direction:column;gap:6px;font-size:12px}.mc-leg2 span{display:flex;gap:6px;align-items:center}.mc-leg2 i{display:inline-block;width:12px;height:12px;border-radius:3px}
.mc-quadro .mc-leg2{flex-direction:row;gap:14px}.mc-rosca .mc-leg2{flex-direction:column}
.mc-top{margin:0;padding-left:18px;font-size:12px;display:flex;flex-direction:column;gap:4px}.mc-top li span{display:inline}.mc-top li b{float:right;font-variant-numeric:tabular-nums;margin-left:8px}
/* Por mês + Por empreiteiro: um embaixo do outro (lado a lado não cabia nem em tela grande). A tabela nunca passa da caixa:
   no celular, rola dentro dela */
.mc-dupla{display:grid;grid-template-columns:minmax(0,1fr);margin-top:6px}
.mc-mapa{display:flex;flex-direction:column;gap:4px;margin:6px 0 4px}
.mc-pv{display:flex;gap:10px;align-items:flex-start}.mc-pv>b{width:150px;flex:none;font-size:12px;text-align:right;padding-top:5px}
.mc-pv>b small{display:block;color:var(--mut);font-weight:600}
.mc-lcs{display:flex;gap:3px;flex-wrap:wrap}
.mc-gr{border:1px solid #ece8dc;border-radius:12px;padding:8px 10px;margin:0 0 8px;background:#fdfcf8}
.mc-grc{display:flex;flex-direction:column;gap:4px;margin-top:6px}
.mc-grt{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#6a5e3a;cursor:pointer;list-style:none;user-select:none}.mc-grt::-webkit-details-marker{display:none}
.mc-grt small{margin-left:10px;letter-spacing:0;text-transform:none;font-weight:600;color:var(--mut)}
.mc-seta{display:inline-block;width:14px;margin-right:4px;transition:transform .12s;color:var(--acento)}details[open]>summary .mc-seta{transform:rotate(90deg)}
.mc-grls{display:flex;flex-direction:column;gap:6px}
.mc-grl>summary.grt{display:flex;gap:8px;align-items:center;list-style:none;cursor:pointer;user-select:none;background:var(--escuro);color:var(--acento-claro);border-radius:9px;padding:6px 10px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.mc-grl>summary.grt::-webkit-details-marker{display:none}.mc-grl>summary.grt small{color:#bdb6a2;letter-spacing:0;font-weight:600}
.mc-grl>summary .mc-mini{background:transparent;color:var(--acento-claro);border-color:#555}.mc-grl>.mc-lista{margin-top:4px}
.mc-lc{display:inline-block;min-width:56px;padding:4px 7px;border-radius:7px;font-size:10.5px;font-weight:700;text-align:center;text-decoration:none;color:#222;border:1px solid rgba(0,0,0,.07);line-height:1.25}
.mc-lc span{display:block;font-weight:800;font-size:11px}.mc-lc.fila{outline:2px dashed #d39b12;outline-offset:-2px}
.mc-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--mut);margin:8px 0 0}.mc-leg i{display:inline-block;width:14px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.mc-g{overflow:auto;max-height:70vh;border:1px solid #ece8dc;border-radius:12px}
.mc-g table{border-collapse:separate;border-spacing:0;font-size:13px}
.mc-g th{position:sticky;top:0;background:#f4f1e6;z-index:2;padding:5px 6px;text-align:left;font-size:12px;color:#3a3220;border-bottom:1px solid #e3dcc6;border-right:1px solid #efe9d6;min-width:138px;max-width:160px;vertical-align:top;line-height:1.25}
.mc-g th.tg{height:22px;box-sizing:border-box;padding:3px 7px;background:var(--tc);color:#fff;font-size:11.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:none;border-right:2px solid #fff}
.mc-g tr.sv th{top:22px;background:color-mix(in srgb,var(--tc) 9%,#fbf9f2);box-shadow:inset 0 3px 0 var(--tc)}
.mc-g th.ini,.mc-g td.ini{border-left:2px solid #d9d2bb}
.mc-g th .tp{display:block;font-size:11.5px;font-weight:600;color:#6a5e3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-g th b{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;padding-top:2px;hyphens:auto;overflow-wrap:break-word}
.mc-g th small{display:block;font-weight:600;color:#5f5f66;font-size:10.5px;white-space:nowrap}
.mc-g th .ap{display:flex;gap:2px;margin-top:4px}.mc-g th .ap input{width:30px;min-width:0;padding:2px 4px;border:1px solid #cfc8b2;border-radius:5px;font:inherit;font-size:11.5px;text-align:right}
.mc-g th .ap button{font-size:10.5px!important;padding:1px 3px!important}.mc-g tr.sv th .ap{gap:1px}.mc-g tr.sv th .ap input{width:26px;padding:2px 3px}
.mc-g tr.sv th{padding-bottom:31px}.mc-g tr.sv th .ap{position:absolute;left:6px;bottom:6px;margin:0}.mc-g tr.sv th .ap>*{flex:none}
.mc-g th .ap button,.mc-g td.loc button{border:1px solid #d9d2bb;background:#fff;border-radius:5px;font:inherit;font-size:11.5px;font-weight:700;padding:2px 5px;cursor:pointer;color:#3a3220}
.mc-g td{border-bottom:1px solid #f0ece0;border-right:1px solid #f4f1e8;padding:5px 6px;vertical-align:top;background:#fff}
.mc-g .loc{position:sticky;left:0;z-index:1;background:#fff;min-width:118px;font-weight:700}.mc-g td.loc .ln{display:flex;gap:6px;align-items:center;justify-content:space-between}.mc-g th.loc{z-index:3;background:#f4f1e6}
.mc-g td.loc small{display:block;color:#5f5f66;font-weight:600;font-size:12px}
.mc-g tr.pv td{background:var(--escuro);color:var(--acento-claro);font-weight:800;font-size:12px;padding:0}.mc-g tr.pv td>span{position:sticky;left:0;display:inline-block;padding:6px 9px;font-size:13px;background:var(--escuro)}
.mc-c input{width:68px;padding:3px 5px;border:1px solid #cfc8b2;border-radius:6px;font:inherit;font-size:13.5px;text-align:right}
.mc-c .lin{display:flex;gap:4px;align-items:center;justify-content:space-between;margin-top:2px}.mc-c .pilha{display:flex;flex-direction:column;align-items:flex-end;gap:2px}.mc-ftb svg{width:13px;height:13px}.mc-c .lin{align-items:flex-start}.mc-c .esq{min-width:0}.mc-c.cheio .lin{justify-content:center}
.mc-c small{display:block;font-size:11px;line-height:1.3;color:#4a4a52;margin-top:3px;white-space:nowrap}.mc-c small b{color:#17171b}
.mc-c .bar{height:4px;background:#eeebe2;border-radius:3px;overflow:hidden;margin-bottom:2px;display:flex}.mc-c .bar i{height:100%;background:#2f7d55}.mc-c .bar i.f{background:#e5b33a}.mc-c .bar i.n{background:var(--acento)}
.mc-c.pend{background:#fff6dc;color:#8a6d00;font-weight:700;font-size:11.5px;text-align:center;cursor:not-allowed}.mc-c.pend small{display:inline;font-weight:600;color:#a08a40}.mc-c.pend .lin{display:block}
.mc-c.mexe{background:#fffbe8}.mc-c.passa{background:#fbe0e0}.mc-c.cheio{background:#eef6ea;color:#2f6b2f;font-weight:800;text-align:center}.mc-c.nada{background:#fbfaf6}
.mc-rod{position:sticky;bottom:10px;z-index:5;display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:var(--escuro);color:#fff;border-radius:14px;padding:12px 18px;margin-top:16px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
.mc-rod b{color:var(--acento-claro);font-size:20px;font-variant-numeric:tabular-nums}.mc-rod small{color:#bdb6a2;font-size:12px}
.mc-rod .oc-btn.p{background:var(--acento);color:var(--escuro);border-color:var(--acento);font-size:14px;padding:10px 18px;margin-left:auto}
@media(max-width:600px){.mc-rod{gap:4px 12px;padding:8px 12px;bottom:6px}.mc-rod b{font-size:15px}.mc-rod small{font-size:10.5px}
  .mc-rod .oc-btn{font-size:12px;padding:6px 10px}.mc-rod .oc-btn.p{font-size:13px;padding:7px 12px}.mc-rod>div{line-height:1.15}}
.mc-cart{border:1px solid #ece8dc;border-radius:14px;padding:14px 16px;margin:0 0 12px;background:#fff}
.mc-cart h3{margin:0;font-size:15px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.mc-cart h3 .v{margin-left:auto;font-size:20px;font-variant-numeric:tabular-nums}
.mc-cart .meta{font-size:12.5px;color:#4a4a52;margin:4px 0 8px}.mc-cart .acoes{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}
.mc-fotos{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.mc-fotos a{display:block;border:1px solid #ece8dc;border-radius:8px;overflow:hidden;font-size:11px;color:#5a4e2e;text-decoration:none}
.mc-fotos img{display:block;height:84px;width:auto}.mc-fotos span{display:block;padding:3px 6px;max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:12px}
.mc-sel details{border:1px solid #ece8dc;border-radius:9px;margin:0 0 5px;background:#fff}.mc-sel summary{cursor:pointer;padding:6px 10px;font-weight:700;font-size:12.5px}
.mc-sel .ls{display:flex;gap:4px 12px;flex-wrap:wrap;padding:4px 10px 8px;font-size:12.5px}.mc-sel label{display:flex;gap:4px;align-items:center}
.mc-lista{display:flex;flex-direction:column;gap:4px}.mc-lista>div{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid #f0ece0;border-radius:9px;padding:6px 10px;background:#fff}
.mc-lista>div.on{border-color:var(--escuro);background:#faf8f1}.mc-lista a.nm{font-weight:800;color:inherit;text-decoration:none;flex:1;min-width:0}
.mc-lista form{margin:0}.mc-mini{border:1px solid #d9d2bb;background:#fff;border-radius:6px;font:inherit;font-size:11px;font-weight:700;padding:2px 7px;cursor:pointer;color:#5a4e2e}
.mc-cols{display:grid;grid-template-columns:minmax(260px,1fr) minmax(230px,1fr) minmax(420px,2.4fr);gap:16px;align-items:start}
@media(max-width:900px){.mc-cols{grid-template-columns:1fr}.mc-pv>b{width:90px}}
.mc-bol{font-size:12.5px}.mc-bol table{width:100%;border-collapse:collapse;margin-bottom:6px}.mc-bol th{background:var(--escuro);color:var(--acento-claro);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:6px 7px;text-align:left}
.mc-bol td{border:1px solid #e6e1d2;padding:5px 7px;vertical-align:top}.mc-bol td.r,.mc-bol th.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mc-bol tr.tot td{font-weight:800;background:#f4f1e6}.mc-bol .cab td{border:0;padding:3px 7px}.mc-bol .cab td:first-child{font-weight:800;color:var(--mut);width:110px}
.mc-bol h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin:18px 0 6px}.mc-ass{display:flex;gap:60px;margin-top:50px}.mc-ass div{flex:1;border-top:1px solid #333;text-align:center;padding-top:5px;font-size:12px}
.mc-previa{background:#fff3c9;border:1px dashed #d39b12;border-radius:10px;padding:8px 12px;font-weight:800;color:#7a4b00;margin:0 0 12px}
@media print{.topbar,.foot,.noprint,.pg-volta{display:none !important}.wrap{max-width:none !important;padding:0 !important}.oc-painel{border:0 !important;padding:0 !important}body{background:#fff !important}}
</style>`;

export const JS = `<script>
function mcExp(b){ var p=b.closest('.pg-limpa'); if(!p) return; var on=p.classList.toggle('exp'); b.classList.toggle('on',on); b.textContent = on ? 'Ocultar explicações' : 'Explique melhor'; }
function mcNum(s){ s=String(s==null?'':s).trim().replace('%','').replace(/\\s/g,''); if(!s) return 0; if(s.indexOf(',')>=0) s=s.replace(/\\./g,'').replace(',','.'); var n=parseFloat(s); return isFinite(n)?n:NaN; }
function mcFmt(n,c){ return Number(n).toLocaleString('pt-BR',{minimumFractionDigits:c||0,maximumFractionDigits:c==null?2:c}); }
function mcMarca(box, v){ box.querySelectorAll('input[type=checkbox]').forEach(function(c){ c.checked=v; }); }
function mcMarcaNome(inp){ var n=String(inp.value||'').trim().toLowerCase(); if(!n) return; var box=inp.closest('form'); box.querySelectorAll('input[type=checkbox][data-nome]').forEach(function(c){ if(c.getAttribute('data-nome').toLowerCase()===n) c.checked=true; }); mcConta(box); }
function mcConta(box){ var n=box.querySelectorAll('.mc-sel input[type=checkbox]:checked').length, s=box.querySelector('.mc-nsel'); if(s) s.textContent=n+' marcado'+(n===1?'':'s'); }
// grupos de pavimentos recolhíveis: cada pessoa vê do jeito que deixou (guardado neste navegador). Vem ANTES da rolagem,
// para a página já estar com os grupos fechados quando voltar à posição.
function mcGrTodos(b,abre){ (b.closest('.oc-painel')||document).querySelectorAll('details.mc-gr').forEach(function(d){ d.open=abre; }); }
function mcGkIni(raiz){ (raiz||document).querySelectorAll('details[data-gk]').forEach(function(d){ var k='mcGr:'+d.getAttribute('data-gk');
  try{ if(localStorage.getItem(k)==='0' && !d.hasAttribute('data-forca')) d.open=false; }catch(e){}
  d.addEventListener('toggle', function(){ try{ if(d.open) localStorage.removeItem(k); else localStorage.setItem(k,'0'); }catch(e){} }); }); }
document.addEventListener('DOMContentLoaded', function(){ mcGkIni(document); mcFixaVer(); });
// FILTRO DO RESUMO SEM RECARREGAR (04/11): busca a página filtrada e troca só o bloco do Resumo — a tela não sai do lugar.
// Vale para os seletores, o "Limpar filtros" e os cliques nas barras/colunas dos gráficos. Se der erro, abre do jeito antigo.
var mcFiltrando=0;
function mcFiltra(url){ var meu=++mcFiltrando, bl=document.getElementById('mcResumo'); if(!bl){ location.href=url; return; }
  bl.classList.add('mc-carregando');
  fetch(url,{credentials:'same-origin'}).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(h){ if(meu!==mcFiltrando) return;
    var d=new DOMParser().parseFromString(h,'text/html'), novo=d.getElementById('mcResumo'); if(!novo) throw 0;
    var aberto=document.getElementById('mcFixa'); aberto=aberto&&aberto.classList.contains('aberto');
    var an=mcAncora(bl); bl.replaceWith(novo); mcGkIni(novo); history.replaceState(null,'',url); mcAncoraVolta(novo,an);
    try{ sessionStorage.removeItem('mcRolagem'); }catch(e){}
    if(aberto) document.getElementById('mcFixa').classList.add('aberto'); mcFixaVer(); })
  .catch(function(){ location.href=url; }); }
// a ÂNCORA: o bloco que está no alto da tela (gráfico, mapa, grupo do mapa…) continua no mesmo lugar depois do filtro,
// mesmo que os blocos de cima mudem de tamanho
// a ÂNCORA (04/11): o que está no LIMITE DE CIMA da tela (logo abaixo do cabeçalho/barra de filtros) fica na mesma posição depois
// do filtro; o que entrou ou saiu acima ou abaixo se ajusta em volta. Âncora = o item MENOR que cruza essa linha (linha do pavimento no
// mapa, barra do gráfico, linha da tabela, quadro…); se ele sumir com o filtro, vale o próximo item visível logo abaixo.
function mcTx(n){ return String(n&&n.textContent||'').replace(/\\s+/g,' ').trim(); }
function mcChave(e){
  if(e.getAttribute('data-gk')) return 'gk:'+e.getAttribute('data-gk');
  if(e.id) return 'id:'+e.id;
  var c=e.classList, q=e.closest('.mc-quadro'), qk=q&&q!==e?mcChave(q)+'|':'';
  if(c.contains('mc-pv')){ var b=e.querySelector('b'); return 'pv:'+mcTx(b&&b.firstChild); }
  if(c.contains('mc-quadro')){ var tt=e.querySelector('.mc-qt'); return 'q:'+mcTx(tt&&tt.firstChild); }
  if(c.contains('mc-bar')||c.contains('mc-col')) return qk+'b:'+String(e.getAttribute('title')||'').split(' — ')[0];
  if(c.contains('mc-sub')) return qk+'u:'+mcTx(e);
  if(c.contains('oc-k')) return 'k:'+[].indexOf.call(e.parentNode.children,e);
  if(c.contains('mc-kpis')) return 'kpis';
  if(c.contains('oc-sec')) return 's:'+mcTx(e.firstChild);
  if(e.tagName==='TR'&&e.parentNode.tagName==='TBODY') return 'tr:'+mcTx(e.cells[0]);
  if(c.contains('mc-qt')) return qk+'t';
  return null; }
var mcSELAN='.mc-kpis,.oc-k,.mc-quadro,.mc-qt,.mc-sub,.mc-bar,.mc-col,.oc-sec,details.mc-gr,.mc-pv,tbody>tr';
function mcAlvos(bl){ return [].slice.call(bl.querySelectorAll(mcSELAN)).filter(function(e){ return e.offsetParent!==null; }); }
function mcTopoUtil(){ var fx=document.getElementById('mcFixa'), tb=document.querySelector('.topbar'), h=tb?Math.max(0,tb.getBoundingClientRect().bottom):0;
  if(fx&&fx.classList.contains('on')){ var i=fx.querySelector('.mc-fixa-in'), b=fx.querySelector('.mc-fbt'); [i,b].forEach(function(x){ if(x&&x.offsetParent!==null) h=Math.max(h,x.getBoundingClientRect().bottom); }); } return h; }
function mcAncora(bl){ var h=mcTopoUtil(), al=mcAlvos(bl), cruza=[], abaixo=[];
  al.forEach(function(e){ var r=e.getBoundingClientRect(), k; if(r.height<=0||!(k=mcChave(e))) return;
    if(r.top<=h+1&&r.bottom>h+1) cruza.push({k:k,top:r.top,alt:r.height}); else if(r.top>h+1) abaixo.push({k:k,top:r.top}); });
  cruza.sort(function(a,b){ return a.alt-b.alt; }); abaixo.sort(function(a,b){ return a.top-b.top; });
  var folha=function(x){ return !/^(q:[^|]*|gk:.*|kpis|id:.*)$/.test(x.k); };   // item miúdo (linha, barra, cartão) vem antes do bloco que o contém
  return cruza.filter(folha).concat(abaixo.filter(folha).slice(0,15), cruza.filter(function(x){ return !folha(x); }), abaixo.filter(function(x){ return !folha(x); }).slice(0,5)); }
function mcAncoraVolta(bl,an){ if(!an||!an.length) return; var mapa={}; mcAlvos(bl).forEach(function(e){ var k=mcChave(e); if(k&&!(k in mapa)) mapa[k]=e; });
  for(var i=0;i<an.length;i++){ var e=mapa[an[i].k]; if(e){ window.scrollBy(0, e.getBoundingClientRect().top-an[i].top); return; } } }
function mcFiltraForm(f){ var p=new URLSearchParams(new FormData(f)); Array.from(p.keys()).forEach(function(k){ if(!p.get(k)) p.delete(k); }); p.set('aba','resumo'); mcFiltra(location.pathname+'?'+p.toString()); }
document.addEventListener('click', function(ev){ var a=ev.target.closest&&ev.target.closest('#mcResumo a[href]'); if(!a||ev.ctrlKey||ev.metaKey||ev.shiftKey||ev.button) return;
  var u=new URL(a.href, location.href); if(u.pathname!==location.pathname||u.searchParams.get('aba')!=='resumo') return;
  ev.preventDefault(); mcFiltra(u.pathname+u.search); });
// a barra flutuante: aparece quando a barra do lugar sai da tela; fica logo abaixo do cabeçalho do painel (ou no topo, se ele já saiu)
function mcFixaVer(){ var fx=document.getElementById('mcFixa'), lu=document.getElementById('mcBarraLugar'); if(!fx||!lu) return;
  var tb=document.querySelector('.topbar'), h=tb?Math.max(0,tb.getBoundingClientRect().bottom):0; fx.style.top=h+'px';
  var on=lu.getBoundingClientRect().bottom<h; fx.classList.toggle('on',on); if(!on) fx.classList.remove('aberto'); }
addEventListener('scroll',mcFixaVer,{passive:true}); addEventListener('resize',mcFixaVer);
// filtro do mapa: volta exatamente para onde estava na tela (âncora fazia a página correr)
function mcGuardaRolagem(){ try{ sessionStorage.setItem('mcRolagem', location.pathname+'|'+Math.round(window.scrollY)); }catch(e){} }
(function(){ try{ var v=sessionStorage.getItem('mcRolagem'); if(!v) return; sessionStorage.removeItem('mcRolagem'); var p=v.split('|');
  if(p[0]!==location.pathname) return; if('scrollRestoration' in history) history.scrollRestoration='manual';
  var y=+p[1]; var ir=function(){ window.scrollTo(0,y); }; if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ir); else ir(); }catch(e){} })();
</script>`;

const MSG = { imp: "Obra trazida da versão anterior. Confira a estrutura e os números.", zero: "Obra começada do zero. Os pavimentos e os locais vêm do cadastro da obra (painel Obras); aqui na aba Estrutura você põe os serviços.",
  lanc: "Medição lançada no boletim do mês de cada empreiteiro. Confira e envie para aprovação.", lancre: "Medição lançada. Atenção: boletim que já estava enviado ou aprovado voltou para \"em aberto\" — envie de novo.",
  impp: "Obra importada da planilha. Confira o Dashboard e os boletins.", recom: "Obra recomeçada: o arquivo anterior ficou guardado no servidor.",
  env: "Boletim enviado. Está na aba Aprovação, esperando a engenharia.", a: "Aprovado.", dev: "Boletim devolvido para correção, com o motivo.",
  rev: "Edição habilitada: o boletim voltou para em aberto. Depois de editar, envie para aprovação de novo.", ass: "Assinatura colhida.", env2: "Boletim mandado ao empreiteiro.", vaz: "O boletim ficou sem nenhum lançamento e deixou de existir. Se houver medição nova do empreiteiro no mês, ele volta.", exc: "Boletim excluído. Ele e os lançamentos dele saíram da medição; fica guardado em \"Boletins excluídos\", no fim desta aba.",
  re: "Salvo. O boletim já tinha sido enviado ou aprovado: voltou para \"em aberto\" e precisa ser enviado de novo.", f: "Fotos anexadas.",
  s: "Salvo.", z: "Nada mudou.", qp: "Quantidade real proposta. Ela aguarda a aprovação do Gerente ou do Administrador (aviso no topo desta aba).", qd: "Decisão gravada.", qrok: "Quantidade real gravada.", qm: "Quantidades gravadas.", qma: "Quantidades gravadas; as alterações de quantidade real já preenchida foram para a aprovação do Gerente ou do Administrador.", e: "Empreiteiro salvo.", p: "Preço salvo. As medições já feitas não mudam." };
const aviso = (m, e) => e ? `<div class="oc-msg e">${esc(String(e).slice(0, 300))}</div>` : MSG[m] ? `<div class="oc-msg">${esc(MSG[m])}</div>` : "";

// ================================================================ entrada: as obras
export function paginaEntrada(user, { m = "", e = "" } = {}) {
  const ger = D.podeGerir(user);
  const cards = D.obrasDaMedicao().filter(({ o }) => D.podeObra(user, o.id)).map(({ o, nova, anterior }) => {   // perfis (12/11): só as obras da pessoa
    if (nova) {
      const R = D.calcular(D.lerObra(o.id));
      return `<div class="mc-ob mc-obv"><a class="mc-oblk" href="${base(o.id)}"><h3>${esc(o.nome)}</h3><b class="v">${brl(R.medido + R.extra)}</b><small>medido · avanço ${pct(R.avanco)}</small>
        <div class="oc-bar" style="margin-top:8px"><i style="width:${(R.avanco * 100).toFixed(1)}%"></i></div>
        ${R.nFila || R.nAbertos ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${R.nFila ? `<span class="md-st fila">${R.nFila} boletim(ns) na fila</span>` : ""}${R.nAbertos ? `<span class="md-st aberto">${R.nAbertos} em aberto</span>` : ""}</div>` : ""}</a>
        ${ger ? `<button type="button" class="mc-recom" onclick="mcRecomeca('${esc(o.id)}','${esc(o.nome).replace(/'/g, "")}',${R.O.boletins.length},${R.O.itens.length},${R.locais.length})">recomeçar a obra</button>` : ""}</div>`;
    }
    return `<div class="mc-ob off"><h3>${esc(o.nome)}</h3><small>Ainda não começou na medição.</small>
      ${ger ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <a class="oc-btn p" href="${base(o.id)}/planilha">📥 Importar da planilha</a>
        <!-- "Trazer da versão anterior" saiu da tela em 10/11: as obras entram pela planilha -->
        <form method="POST" action="${base(o.id)}/comecar" style="margin:0" onsubmit="return confirm('Começar do zero, sem importar a planilha?')"><button class="oc-btn">Começar do zero</button></form></div>`
        : `<div style="margin-top:8px;font-size:12px;color:var(--mut)">A engenharia ou a Diretoria começa esta obra aqui.</div>`}</div>`;
  }).join("");
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="/engenharia"><span class="seta">←</span> Engenharia</a>
  <div class="oc-topo"><h1>📏 Medições</h1><span style="margin-left:auto"></span>${D.podeRH(user) ? `<a class="oc-btn p" href="/obras/medicao-rh">🧾 Painel do RH</a>` : ""}<a class="oc-btn p" href="/obras/medicao-servicos">📋 Cadastro de serviços</a><a class="oc-btn p" href="/obras/medicao-empreiteiros">👷 Cadastro de empreiteiros</a></div>
  ${aviso(m, e)}
  <div class="oc-painel pg-limpa" style="border-top:1px solid #ece8dc;border-radius:16px;margin-top:16px">
    <div class="oc-barra">${btnExp}</div>
    <div class="oc-nota xp">Versão nova das medições: a obra é cadastrada como estrutura (pavimentos e locais em ordem),
      a medição é lançada numa grade (o que andou em cada serviço de cada local) e vai para o <b>boletim</b> do empreiteiro no mês — um boletim
      por empreiteiro por mês, aprovado inteiro pelo Gerente de Engenharia, com o valor bruto. Cada obra começa <b>importando a planilha de medição</b> dela
      (estrutura, preços, empreiteiros e todo o histórico de medições, conferido antes de gravar) ou do zero.</div>
    <div class="mc-obras">${cards || `<div class="oc-vazio">Nenhuma obra liberada para você na medição. Fale com a engenharia.</div>`}</div>
    <div style="font-size:12px;margin-top:10px"><a href="/obras/medicao-acesso" style="color:var(--mut)">Como o sistema me vê na medição (perfil e obras)</a></div></div>
  ${ger ? `<dialog class="mc-dlg" id="mcDlgRec"><form method="POST" id="mcFRec" style="display:block;margin:0"><p class="rot" style="font-size:15px;color:#a8321f">Recomeçar a obra</p>
    <div id="mcRecTxt" style="font-size:13.5px;line-height:1.55"></div>
    <div style="font-size:12.5px;color:#4a4a52;margin:10px 0 6px">Nada é apagado: o arquivo da obra fica <b>guardado</b> no servidor (dá para trazer de volta). Cadastro de empreiteiros e
      catálogo de serviços não mudam. Depois, a obra aparece como “não começada”, com o <b>Importar da planilha</b>.</div>
    ${lab("Para confirmar, escreva o nome da obra")}<input name="nome" class="mc-i" autocomplete="off" required>
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn v">Recomeçar a obra</button></div></form></dialog>
  <script>function mcRecomeca(id,nome,nb,ni,nl){ var d=document.getElementById('mcDlgRec'); document.getElementById('mcFRec').action='/obras/medicao/'+id+'/recomecar';
    document.getElementById('mcRecTxt').innerHTML='Tirar da medição tudo o que foi feito em <b>'+nome+'</b>: '+nb+' boletim(ns), '+ni+' serviço(s) em '+nl+' local(is). Escreva <b>'+nome+'</b> abaixo para confirmar.';
    d.querySelector('input[name=nome]').value=''; d.showModal(); }</script>` : ""}`;
  return shell({ title: "Medições", body, user });
}

// ================================================================ IMPORTAR DA PLANILHA (10/11): enviar → conferir → confirmar
/** A página: sem planilha, o formulário de envio; com a planilha lida, a CONFERÊNCIA (totais, meses, empreiteiros, avisos)
 *  e o botão de confirmar. Nada é gravado na obra antes da confirmação. */
export function paginaPlanilha(user, obra, { e = "", cod = "", resumo = null, arquivo = "" } = {}) {
  const o = D.obrasDaMedicao().find(x => x.o.id === obra); if (!o) return null;
  const b = base(obra), ger = D.podeGerir(user), ja = o.nova;
  let corpo;
  if (!ger) corpo = `<div class="oc-msg e">Quem importa a obra é o Gerente de Engenharia, o Administrador ou a Diretoria.</div>`;
  else if (ja) corpo = `<div class="oc-msg e">${esc(o.o.nome)} já está na medição nova. Para importar a planilha de novo, use <b>recomeçar a obra</b> na entrada das Medições.</div>`;
  else if (!resumo) corpo = `<form method="POST" action="${b}/planilha" enctype="multipart/form-data" class="mc-cart" style="max-width:720px">
      <div class="oc-sec" style="margin-top:0">1. Escolha a planilha de medição de ${esc(o.o.nome)}</div>
      <div style="font-size:13px;color:#4a4a52;margin:0 0 10px">A planilha de medição da obra, em Excel (.xlsm). Feche a planilha no Excel antes, para enviar a versão salva.
        O sistema lê pavimentos, locais, serviços (com quantidade e preço), empreiteiros e todas as medições (aprovadas e reprovadas). Medição que estiver
        “Em aprovação” na planilha não entra.</div>
      <input type="file" name="planilha" accept=".xlsm,.xlsx" required>
      <div class="bt" style="justify-content:flex-start;margin-top:12px"><button class="oc-btn p">Ler a planilha e conferir</button><a class="oc-btn" href="/obras/medicao">Cancelar</a></div></form>`;
  else {
    const R = resumo, bate = Math.abs(R.total - R.totalPlanilha) < 0.005;
    const meses = Object.keys(R.porMes).sort();
    corpo = `<div class="mc-cart"><div class="oc-sec" style="margin-top:0">2. Confira antes de gravar <small style="text-transform:none;letter-spacing:0;color:var(--mut)">${esc(arquivo)}</small></div>
      <div class="oc-kpis mc-kpis" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="oc-k escuro"><span>Total medido (aprovado)</span><b>${brl(R.total)}</b><em>${R.medicoes} medição(ões) até ${dataBR(R.ultimaData)}</em></div>
        <div class="oc-k${bate ? "" : " alerta"}"><span>Soma da planilha</span><b>${brl(R.totalPlanilha)}</b><em>${bate ? "✔ bate centavo a centavo" : "✖ NÃO bate — não importe"}</em></div>
        <div class="oc-k"><span>Estrutura</span><b>${R.pavimentos} pav.</b><em>${R.locais} locais · ${R.servicos} serviços</em></div>
        <div class="oc-k"><span>Empreiteiros</span><b>${R.empreiteiros}</b><em>${R.reprovadas} medição(ões) reprovada(s) guardada(s)</em></div></div>
      ${R.avisos.length ? `<div class="mc-previa" style="margin:10px 0"><b>Avisos da leitura:</b><ul style="margin:4px 0 0;padding-left:18px">${R.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : `<div class="oc-ok" style="margin:10px 0">A planilha foi lida sem avisos.</div>`}
      <div class="mc-cols" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:8px">
        <div><div class="mc-qt">Por mês (vira um boletim por empreiteiro por mês)</div><table class="oc-t"><tbody>${meses.map(m => `<tr><td>${mesLongo(m)}</td><td class="r">${brl(R.porMes[m])}</td></tr>`).join("")}</tbody></table></div>
        <div><div class="mc-qt">Por empreiteiro</div><table class="oc-t"><tbody>${Object.entries(R.porEmp).sort((a, c) => c[1] - a[1]).map(([n, v]) => `<tr><td>${esc(D.nomeProprio(n))}</td><td class="r">${brl(v)}</td></tr>`).join("")}</tbody></table></div></div>
      <div style="font-size:12.5px;color:#4a4a52;margin:12px 0 0">Ao confirmar: a obra é montada com essa estrutura, os empreiteiros entram (ou são juntados pelo CPF/CNPJ) no cadastro único
        e ficam habilitados nesta obra, e cada mês vira o boletim do empreiteiro, já <b>aprovado</b> (foi pago pela planilha). A partir daí, a medição desta obra é feita
        só no sistema.</div>
      <form method="POST" action="${b}/planilha-confirmar" style="margin:12px 0 0;display:flex;gap:8px;flex-wrap:wrap"><input type="hidden" name="cod" value="${esc(cod)}">
        ${bate ? `<button class="oc-btn p" style="font-size:14px;padding:10px 18px" onclick="this.disabled=true;this.form.submit()">Confirmar e importar</button>` : ""}<a class="oc-btn" href="${b}/planilha">Enviar outra planilha</a><a class="oc-btn" href="/obras/medicao">Cancelar</a></form></div>`;
  }
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="/obras/medicao"><span class="seta">←</span> Medições</a>
  <div class="oc-topo"><h1>📥 Importar da planilha · ${esc(o.o.nome)}</h1></div>
  ${e ? `<div class="oc-msg e">${esc(e)}</div>` : ""}<div class="pg-limpa" style="margin-top:14px">${corpo}</div>`;
  return shell({ title: "Importar da planilha · " + o.o.nome, body, user });
}
/** Recebe a planilha: lê, guarda e mostra a conferência (ou o erro de leitura). */
export function receberPlanilha(user, obra, arquivo) {
  const o = D.obrasDaMedicao().find(x => x.o.id === obra); if (!o) return null;
  if (!arquivo) return paginaPlanilha(user, obra, { e: "Escolha a planilha (.xlsm)." });
  if (![".xlsm", ".xlsx"].includes(arquivo.ext)) return paginaPlanilha(user, obra, { e: `"${arquivo.nomeOriginal}" não é planilha do Excel (.xlsm ou .xlsx).` });
  let lido; try { lido = planilhaParaObra(arquivo.buffer, o.o.nome, arquivo.nomeOriginal); } catch (er) { return paginaPlanilha(user, obra, { e: "Não deu para ler a planilha: " + er.message }); }
  const cod = D.guardarPlanilha(obra, arquivo.buffer, arquivo.nomeOriginal);
  return paginaPlanilha(user, obra, { cod, resumo: lido.resumo, arquivo: arquivo.nomeOriginal });
}
/** Confirma: lê de novo a planilha guardada e monta a obra. */
export function confirmarPlanilha(user, obra, cod) {
  const o = D.obrasDaMedicao().find(x => x.o.id === obra); if (!o) return { erro: "Obra não encontrada." };
  const g = D.lerPlanilhaGuardada(obra, cod); if (!g) return { erro: "A planilha enviada não foi encontrada. Envie de novo." };
  let lido; try { lido = planilhaParaObra(g.buf, o.o.nome, g.nome); } catch (er) { return { erro: "Não deu para ler a planilha: " + er.message }; }
  if (Math.abs(lido.resumo.total - lido.resumo.totalPlanilha) >= 0.005) return { erro: "O total lido não bate com a soma da planilha: importação cancelada." };
  return D.importarDaPlanilha(obra, lido.M, user, g.nome);
}

// ================================================================ a obra, em abas
const ABAS = [["resumo", "Dashboard"], ["boletins", "Boletins de medição"], ["aprovacao", "Aprovação"], ["estrutura", "Estrutura"], ["precos", "Serviços e preços"], ["empreiteiros", "Empreiteiros"], ["historico", "Histórico"]];
function moldura(user, R, aba, corpo, { m = "", e = "" } = {}) {
  const O = R.O;
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="/obras/medicao"><span class="seta">←</span> Medições</a>
  <div class="oc-topo"><h1>Medições · ${esc(O.nome)}</h1>
    <div class="tot"><small>Medido (aprovado)</small><b>${brl(R.medido + R.extra)}</b></div></div>
  ${aviso(m, e)}
  <div class="oc-abas">${ABAS.map(([k, n]) => `<a href="${base(O.obra)}?aba=${k}"${k === aba ? ` class="on"` : ""}>${n}${k === "aprovacao" && R.nFila ? `<i>${R.nFila}</i>` : ""}${k === "boletins" && R.nAbertos ? `<i class="ab">${R.nAbertos}</i>` : ""}</a>`).join("")}</div>
  <div class="oc-painel pg-limpa">${corpo}</div>`;
  return shell({ title: "Medições · " + O.nome, body, user });
}
export function paginaObra(user, obra, q = {}) {
  const O = D.lerObra(obra); if (!O) return null;
  const R = D.calcular(O), aba = ABAS.some(([k]) => k === q.aba) ? q.aba : "resumo";
  const f = { resumo: abaResumo, aprovacao: abaAprovacao, boletins: abaBoletins, estrutura: abaEstrutura, precos: abaPrecos, empreiteiros: abaEmpreiteiros, historico: abaHistorico }[aba];
  return moldura(user, R, aba, f(R, user, q), q);
}

// ---------------------------------------------------------------- Resumo + mapa da obra
/** O prédio de pé: do grupo mais alto para o mais baixo e, dentro de cada um, do pavimento mais alto para o térreo.
 *  Pavimento sem grupo aparece no alto, para ser notado. */
export function predio(R) {
  const blocos = [], soltos = R.pavs.filter(p => !R.grupos.some(g => g.id === p.grupo));
  if (soltos.length) blocos.push({ g: null, pavs: soltos.slice().reverse() });
  for (const g of R.grupos.slice().reverse()) blocos.push({ g, pavs: R.pavs.filter(p => p.grupo === g.id).reverse() });
  return blocos;
}
/** O mapa, com filtro opcional de tipo de serviço e de serviço: cada local é pintado só pelo que passa no filtro. */
function mapa(R, { tipo = "", cat = "" } = {}) {
  if (!R.pavs.length) return `<div class="oc-vazio">A obra ainda não tem pavimentos. Comece pela aba Estrutura.</div>`;
  const passa = x => (!tipo || x.tipo === tipo) && (!cat || x.cat === cat), filtrado = !!(tipo || cat);
  const conta = l => { const its = l.itens.filter(passa); return { n: its.length, tot: its.reduce((a, x) => a + x.total, 0), med: its.reduce((a, x) => a + x.total * Math.min(1, x.aprov), 0), fila: its.some(x => x.fila > 0) }; };
  const linhaPav = p => {
    const ls = R.locais.filter(l => l.pav === p.id).map(l => ({ l, c: conta(l) })), tot = ls.reduce((a, x) => a + x.c.tot, 0), med = ls.reduce((a, x) => a + x.c.med, 0);
    if (filtrado && !ls.some(x => x.c.n)) return { html: "", tot: 0, med: 0 };
    return { tot, med, html: `<div class="mc-pv"><b>${esc(p.nome)}<small>${tot ? pct(med / tot) : "—"}</small></b><div class="mc-lcs">${ls.map(({ l, c }) => { const v = c.tot ? c.med / c.tot : 0;
      if (filtrado && !c.n) return `<span class="mc-lc" style="background:#fff;color:#c4c0b4;border-style:dashed" title="${esc(l.nome)} não tem esse serviço">${esc(l.nome)}<span>·</span></span>`;
      return `<a class="mc-lc${c.fila ? " fila" : ""}" style="background:${corDe(v)}" href="${base(R.O.obra)}?aba=estrutura&pav=${esc(p.id)}&local=${esc(l.id)}" title="${esc(p.nome)} · ${esc(l.nome)} — ${pct(v)} de ${brl(c.tot)}${c.fila ? " · tem medição na fila" : ""}">${esc(l.nome)}<span>${c.tot ? pct(v) : "—"}</span></a>`; }).join("") || `<span style="font-size:12px;color:var(--mut)">sem locais</span>`}</div></div>` };
  };
  const html = predio(R).map(({ g, pavs }) => {
    const ls = pavs.map(linhaPav), tot = ls.reduce((a, x) => a + x.tot, 0), med = ls.reduce((a, x) => a + x.med, 0), corpo = ls.map(x => x.html).join("");
    if (!corpo) return "";
    return R.grupos.length ? `<details class="mc-gr" open data-gk="mapa|${esc(R.O.obra)}|${g ? esc(g.id) : "sem"}"><summary class="mc-grt"><span class="mc-seta">▸</span>${g ? esc(g.nome) : "Sem grupo"}<small>${tot ? pct(med / tot) + " · " + brl(med) + " de " + brl(tot) : ""}</small></summary><div class="mc-grc">${corpo}</div></details>` : corpo;
  }).join("");
  return `${R.grupos.length ? `<div style="display:flex;gap:6px;margin:0 0 6px"><button type="button" class="mc-mini" onclick="mcGrTodos(this,true)">abrir todos os grupos</button><button type="button" class="mc-mini" onclick="mcGrTodos(this,false)">fechar todos</button></div>` : ""}
  <div class="mc-mapa">${html || `<div class="oc-vazio">Nenhum local tem esse serviço.</div>`}</div>
  <div class="mc-leg"><b style="font-weight:700">% do valor medido (aprovado):</b>${FAIXAS.map(f => `<span><i style="background:${f.cor}"></i>${f.rot}</span>`).join("")}<span><i style="background:#fff;outline:2px dashed #d39b12;outline-offset:-2px"></i>tem medição esperando aprovação</span><span><b style="margin-right:4px">—</b>local sem serviço cadastrado</span></div>`;
}
// ---------------------------------------------------------------- o DASHBOARD (a aba Dashboard, endereço ?aba=resumo)
// Filtros no alto valem para tudo: mês, tipo de serviço, serviço e empreiteiro (clicar numa barra também filtra).
// Só entra o que está APROVADO na final (a última versão aprovada de cada boletim);
// a fila aparece à parte. O mês é o de competência do boletim. Tudo sai dos boletins — nada digitado.
/** As linhas aprovadas: { mes, e, item, tipo, cat, servico, unidade, qtd, valor } e os extras. */
function fatosDaObra(R) {
  const linhas = [], extras = [];
  for (const B of R.O.boletins) {
    const V = D.versaoAprovada(B); if (!V) continue;
    for (const li of V.itens) { const x = R.I[li.item] || {};
      linhas.push({ mes: B.mes, e: B.emp, item: li.item, local: x.local, tipo: x.tipo || "?", cat: x.cat || "", servico: x.servico || "?", unidade: x.unidade || "", qtd: li.qtd, valor: li.valor }); }
    for (const ex of V.extras) { const x = ex.item ? R.I[ex.item] || {} : {};
      extras.push({ mes: B.mes, e: B.emp, tipo: x.tipo || "", cat: x.cat || "", categoria: ex.categoria || "Outro", motivo: ex.motivo || "", valor: ex.valor }); }
  }
  return { linhas, extras };
}
const curtoBRL = v => Math.abs(v) >= 1e6 ? "R$ " + num(v / 1e6, 1, 2) + " mi" : Math.abs(v) >= 1e3 ? "R$ " + num(v / 1e3, 1, 1) + " mil" : brl(v);
const somaPor = (lista, k, v = x => x.valor) => { const m = new Map(); for (const x of lista) m.set(k(x), (m.get(k(x)) || 0) + v(x)); return m; };
/** Barras horizontais. linhas: [{ rot, sub, a, b, href }] — a = medição normal (preto), b = extra (dourado). */
function barras(linhas, { fmt = brl, vazio = "Nada no filtro.", media = null, limite = 8 } = {}) {
  if (!linhas.length) return `<div class="oc-vazio">${vazio}</div>`;
  const max = Math.max(...linhas.map(l => (l.a || 0) + (l.b || 0)), media || 0) || 1;
  return `<div class="mc-bars">${linhas.map((l, i) => { const t = (l.a || 0) + (l.b || 0), tag = l.href ? "a" : "div";
    return `<${tag} class="mc-bar${i >= limite ? " mc-alem" : ""}"${l.href ? ` href="${l.href}" onclick="mcGuardaRolagem()"` : ""} title="${esc(l.rot)} — ${esc(fmt(t))}${l.b ? ` (${esc(fmt(l.a || 0))} + extra ${esc(fmt(l.b))})` : ""}">
      <span class="rot">${esc(l.rot)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</span>
      <span class="trilho">${media ? `<i class="media" style="left:${(media / max * 100).toFixed(2)}%"></i>` : ""}<i class="a" style="width:${((l.a || 0) / max * 100).toFixed(2)}%"></i><i class="b" style="width:${((l.b || 0) / max * 100).toFixed(2)}%"></i></span>
      <span class="val">${esc(fmt(t))}</span></${tag}>`; }).join("")}${linhas.length > limite ? `<button type="button" class="mc-vertodos" onclick="var b=this.closest('.mc-bars');b.classList.toggle('todos');this.textContent=b.classList.contains('todos')?'mostrar só os ${limite} maiores':'ver todos (${linhas.length})'">ver todos (${linhas.length})</button>` : ""}</div>`;
}
/** Colunas por mês (normal + extra empilhados). */
function colunas(meses, hrefDe, mesSel) {
  if (!meses.length) return `<div class="oc-vazio">Nada aprovado no filtro.</div>`;
  const max = Math.max(...meses.map(m => m.a + m.b)) || 1;
  return `<div class="mc-colg">${meses.map(m => `<a class="mc-col${m.mes === mesSel ? " on" : ""}" href="${hrefDe(m.mes)}" onclick="mcGuardaRolagem()" title="${mesLongo(m.mes)} — ${brl(m.a + m.b)}${m.b ? ` (${brl(m.a)} + extra ${brl(m.b)})` : ""}">
    <span class="v">${curtoBRL(m.a + m.b)}</span><span class="pilha"><i class="b" style="height:${(m.b / max * 100).toFixed(2)}%"></i><i class="a" style="height:${(m.a / max * 100).toFixed(2)}%"></i></span><small>${mesBR(m.mes)}</small></a>`).join("")}</div>`;
}
/** Rosca normal × extra. */
function rosca(a, b) {
  const t = a + b; if (!t) return `<div class="oc-vazio">Nada no filtro.</div>`;
  const pb = b / t * 100;
  return `<div class="mc-rosca"><svg viewBox="0 0 42 42" width="150" height="150" role="img" aria-label="Normal ${pct(a / t, 1)}, extra ${pct(b / t, 1)}">
    <circle cx="21" cy="21" r="15.915" fill="none" stroke="#17171b" stroke-width="6"/>
    ${b ? `<circle cx="21" cy="21" r="15.915" fill="none" style="stroke:var(--acento)" stroke-width="6" stroke-dasharray="${pb.toFixed(3)} ${(100 - pb).toFixed(3)}" stroke-dashoffset="25"/>` : ""}
    <text x="21" y="20" text-anchor="middle" font-size="5.2" font-weight="800">${pct(b / t, 1)}</text><text x="21" y="25.5" text-anchor="middle" font-size="3" fill="#6b6b72">de extra</text></svg>
    <div class="mc-leg2"><span><i style="background:#17171b"></i>Normal <b>${brl(a)}</b></span><span><i style="background:var(--acento)"></i>Extra <b>${brl(b)}</b></span></div></div>`;
}
function abaResumo(R, user, q = {}) {
  const b0 = base(R.O.obra), F = fatosDaObra(R);
  // os filtros (só valem os que existem nos dados)
  const mesesTodos = [...new Set([...F.linhas, ...F.extras].map(x => x.mes))].sort().reverse();
  const tipos = [...new Set(Object.values(R.I).map(x => x.tipo))].sort((a, c) => a.localeCompare(c, "pt-BR"));
  const mes = mesesTodos.includes(q.mes) ? q.mes : "", tipo = tipos.includes(q.tipo) ? q.tipo : "";
  const servs = [...new Map(Object.values(R.I).filter(x => !tipo || x.tipo === tipo).map(x => [x.cat, x])).values()].sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
  const cat = servs.some(x => x.cat === q.cat) ? q.cat : "";
  const empsTodos = [...new Set([...F.linhas, ...F.extras].map(x => x.e))].sort((a, c) => nomeEmp(R, a).localeCompare(nomeEmp(R, c), "pt-BR"));
  const emp = empsTodos.includes(q.emp) ? q.emp : "";
  const filtro = { mes, tipo, cat, emp }, link = mud => { const p = new URLSearchParams({ aba: "resumo" }); for (const [k, v] of Object.entries({ ...filtro, ...mud })) if (v) p.set(k, v); return `${b0}?${p}`; };
  const passaServ = x => (!tipo || x.tipo === tipo) && (!cat || x.cat === cat);
  const L = F.linhas.filter(x => passaServ(x) && (!emp || x.e === emp)), Lm = L.filter(x => !mes || x.mes === mes);
  const X = F.extras.filter(x => (!tipo && !cat || passaServ(x)) && (!emp || x.e === emp)), Xm = X.filter(x => !mes || x.mes === mes);
  const normal = Lm.reduce((a, x) => a + x.valor, 0), extra = Xm.reduce((a, x) => a + x.valor, 0), total = normal + extra;
  const empsP = new Set([...Lm, ...Xm].map(x => x.e)), mesesP = new Set([...Lm, ...Xm].map(x => x.mes));
  const mediaEmp = empsP.size && mesesP.size ? total / (empsP.size * mesesP.size) : 0;
  const sel = `padding:8px 10px;border:1px solid #ddd8c8;border-radius:9px;font:inherit;font-size:13px;background:#fff;min-width:0;width:100%`;
  const filtrado = mes || tipo || cat || emp;
  const formFiltro = (fixa = false) => `<form method="GET" class="mc-filtros" onsubmit="event.preventDefault();mcFiltraForm(this)"><input type="hidden" name="aba" value="resumo">
    <div>${lab("Mês")}<select name="mes" style="${sel}" onchange="mcFiltraForm(this.form)"><option value="">Todos os meses</option>${mesesTodos.map(m => `<option value="${m}"${m === mes ? " selected" : ""}>${mesLongo(m)}</option>`).join("")}</select></div>
    <div>${lab("Tipo de serviço")}<select name="tipo" style="${sel}" onchange="this.form.cat.value='';mcFiltraForm(this.form)"><option value="">Todos os tipos</option>${tipos.map(t => `<option${t === tipo ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
    <div>${lab("Serviço")}<select name="cat" style="${sel}" onchange="mcFiltraForm(this.form)"><option value="">Todos os serviços</option>${servs.map(x => `<option value="${esc(x.cat)}"${x.cat === cat ? " selected" : ""}>${tipo ? "" : esc(x.tipo) + " — "}${esc(x.servico)} (${esc(x.unidade)})</option>`).join("")}</select></div>
    <div>${lab("Empreiteiro")}<select name="emp" style="${sel}" onchange="mcFiltraForm(this.form)"><option value="">Todos os empreiteiros</option>${empsTodos.map(e => `<option value="${esc(e)}"${e === emp ? " selected" : ""}>${esc(nomeEmp(R, e))}</option>`).join("")}</select></div>
    ${filtrado && !fixa ? `<div style="align-self:end"><a class="oc-btn" href="${b0}?aba=resumo">Limpar filtros</a></div>` : ""}</form>`;
  const servSelF = servs.find(x => x.cat === cat), nAtivos = [mes, tipo, cat, emp].filter(Boolean).length;
  // a barra no lugar (fica sempre do mesmo tamanho: nada empurra a página) + a barra FLUTUANTE, que aparece presa no alto quando a de cima sai da tela
  const barraFiltro = `<div id="mcBarraLugar">${formFiltro()}</div>
    <div class="mc-fixa" id="mcFixa"><button type="button" class="mc-fbt" onclick="document.getElementById('mcFixa').classList.toggle('aberto')">⚲ Filtros${nAtivos ? ` (${nAtivos})` : ""}</button>
      <div class="mc-fixa-in">${formFiltro(true)}</div></div>`;
  // os quadros
  const porMes = [...somaPor(L, x => x.mes)].map(([m, a]) => ({ mes: m, a, b: X.filter(x => x.mes === m).reduce((s, x) => s + x.valor, 0) }));
  for (const m of new Set(X.map(x => x.mes))) if (!porMes.some(p => p.mes === m)) porMes.push({ mes: m, a: 0, b: X.filter(x => x.mes === m).reduce((s, x) => s + x.valor, 0) });
  porMes.sort((a, c) => a.mes.localeCompare(c.mes));
  const porEmpA = somaPor(Lm, x => x.e), porEmpB = somaPor(Xm, x => x.e);
  const barrasEmp = [...new Set([...porEmpA.keys(), ...porEmpB.keys()])].map(e => ({ e, rot: nomeEmp(R, e), sub: (R.emp[e] || {}).funcao || "", a: porEmpA.get(e) || 0, b: porEmpB.get(e) || 0, href: link({ emp: e === emp ? "" : e }) }))
    .sort((a, c) => (c.a + c.b) - (a.a + a.b));
  const barrasTipo = [...somaPor(Lm, x => x.tipo)].map(([t, a]) => ({ rot: t, a, href: link({ tipo: t === tipo ? "" : t, cat: "" }) })).sort((a, c) => c.a - a.a);
  const qtdServ = [...somaPor(Lm, x => x.cat, x => x.qtd)].map(([c, qv]) => { const s = servs.find(x => x.cat === c) || Object.values(R.I).find(x => x.cat === c) || {}; return { cat: c, rot: s.servico || "?", sub: s.tipo || "", unidade: s.unidade || "", a: qv }; });
  const unidades = [...new Set(qtdServ.map(x => x.unidade))].sort((a, c) => qtdServ.filter(x => x.unidade === c).reduce((s, x) => s + x.a, 0) - qtdServ.filter(x => x.unidade === a).reduce((s, x) => s + x.a, 0));
  const fq = u => v => num(v, 2) + " " + u;
  const blocoQtd = unidades.length ? unidades.map(u => `<div class="mc-unid"><div class="mc-sub">${esc(u || "sem unidade")}</div>${barras(qtdServ.filter(x => x.unidade === u).sort((a, c) => c.a - a.a)
    .map(x => ({ ...x, href: link({ cat: x.cat === cat ? "" : x.cat, tipo: "" }) })), { fmt: fq(u), limite: 5 })}</div>`).join("") : `<div class="oc-vazio">Nada no filtro.</div>`;
  // produção em quantidade por empreiteiro: só faz sentido com UM serviço (uma unidade) — somar m², m e un juntos não faz sentido
  const servSel = cat ? servs.find(x => x.cat === cat) : null;
  let blocoProd = `<div class="oc-vazio">Escolha um <b>serviço</b> no filtro para comparar a produção dos empreiteiros em quantidade (m², m, un…). Somar unidades diferentes não dá um número que se compare.</div>`;
  if (servSel) {
    const pq = [...somaPor(Lm, x => x.e, x => x.qtd)].filter(([, a]) => a > 0.00001).map(([e, a]) => ({ rot: nomeEmp(R, e), sub: (R.emp[e] || {}).funcao || "", a, href: link({ emp: e === emp ? "" : e }) })).sort((a, c) => c.a - a.a);
    const media = pq.length ? pq.reduce((s, x) => s + x.a, 0) / pq.length : 0;
    blocoProd = `<div style="font-size:12px;color:var(--mut);margin:-4px 0 8px">${esc(servSel.tipo)} — ${esc(servSel.servico)} · a linha marca a <b>média da equipe</b> (${num(media, 2)} ${esc(servSel.unidade)})</div>
      ${barras(pq.map(x => ({ ...x, sub: `${x.sub ? x.sub + " · " : ""}${media ? pct(x.a / media, 0) + " da média" : ""}` })), { fmt: fq(servSel.unidade), media })}`;
  }
  const porCat = [...somaPor(Xm, x => x.tipo || "sem serviço ligado")].map(([c, b]) => ({ rot: c, b })).sort((a, c) => c.b - a.b);
  const motivos = [...somaPor(Xm, x => x.motivo.trim() || "(sem motivo)")].map(([m, v]) => ({ m, v })).sort((a, c) => c.v - a.v).slice(0, 5);
  const totObra = R.medido + R.extra;
  const tabEmp = barrasEmp.length ? `<div class="oc-rolar"><table class="oc-t"><thead><tr><th>Empreiteiro</th><th class="r">Normal</th><th class="r">Extra</th><th class="r">Total</th><th class="r">% do filtro</th><th class="r">Última</th></tr></thead><tbody>
    ${barrasEmp.map(x => { const e = x.e; return `<tr><td><a href="${x.href}" onclick="mcGuardaRolagem()" style="color:inherit"><b>${esc(x.rot)}</b></a><br><small style="color:var(--mut)">${esc(x.sub || "—")}</small></td>
      <td class="r">${brl(x.a)}</td><td class="r">${x.b ? brl(x.b) : "—"}</td><td class="r"><b>${brl(x.a + x.b)}</b></td><td class="r">${total ? pct((x.a + x.b) / total, 1) : "—"}</td><td class="r">${dataBR((R.porEmp[e] || {}).ultima)}</td></tr>`; }).join("")}
    <tr style="font-weight:800;background:#f4f1e6"><td>Total</td><td class="r">${brl(normal)}</td><td class="r">${brl(extra)}</td><td class="r">${brl(total)}</td><td class="r">100%</td><td></td></tr></tbody></table></div>` : `<div class="oc-vazio">Nada no filtro.</div>`;
  return `<div id="mcResumo"><div class="oc-barra">${btnExp}</div>
  <div class="oc-nota xp">O painel da obra. Os <b>filtros</b> do alto valem para tudo (e clicar numa barra filtra por ela;
    clicar de novo tira). Entra só medição <b>aprovada na final</b>; o que está na fila aparece no quadro "Na fila". Média por empreiteiro = total ÷ empreiteiros ÷ meses
    com medição no filtro. O <b>mapa</b> mostra quanto do valor de cada local já foi medido (desde o início, não só no mês).</div>
  ${barraFiltro}
  <div class="oc-kpis mc-kpis">
    <div class="oc-k escuro"><span>Medido ${mes ? "em " + mesBR(mes) : filtrado ? "no filtro" : "até hoje"}</span><b>${brl(total)}</b><em>${brl(normal)} normal${extra ? " + " + brl(extra) + " extra" : ""}</em></div>
    <div class="oc-k"><span>Empreiteiros com medição</span><b>${empsP.size}</b><em>${mesesP.size} mês(es) no filtro</em></div>
    <div class="oc-k"><span>Média por empreiteiro / mês</span><b>${empsP.size ? brl(mediaEmp) : "—"}</b><em>total ÷ empreiteiros ÷ meses</em></div>
    <div class="oc-k"><span>Avanço físico da obra</span><b>${pct(R.avanco, 1)}</b><em>falta ${brl(R.total * (1 - R.avanco))} de ${curtoBRL(R.total)}</em></div>
    <div class="oc-k${R.nFila ? " alerta" : ""}"><span>Na fila de aprovação</span><b>${R.nFila}</b><em>${R.nFila ? brl(R.filaValor) + " esperando" : "nada esperando"}</em></div>
  </div>
  <div class="mc-quadro"><div class="mc-qt">Medido por mês ${mes ? `<small>clique no mês de novo para ver todos</small>` : `<small>clique num mês para filtrar</small>`}</div>${colunas(porMes, m => link({ mes: m === mes ? "" : m }), mes)}
    <div class="mc-leg2" style="margin-top:6px"><span><i style="background:#17171b"></i>Normal</span><span><i style="background:var(--acento)"></i>Extra</span></div></div>
  <div class="mc-quadros">
    <div class="mc-colq">
    <div class="mc-quadro"><div class="mc-qt">Medido por empreiteiro</div>${barras(barrasEmp)}</div>
    <div class="mc-quadro"><div class="mc-qt">Valor por tipo de serviço</div>${barras(barrasTipo)}</div>
    </div><div class="mc-colq">
    <div class="mc-quadro"><div class="mc-qt">Normal × extra</div>${rosca(normal, extra)}
      <div class="mc-qt" style="margin-top:14px">Extras por tipo de serviço</div>${barras(porCat, { vazio: "Sem extras no filtro." })}
      ${motivos.length ? `<div class="mc-qt" style="margin-top:14px">Top 5 motivos de extra</div><ol class="mc-top">${motivos.map(x => `<li><span>${esc(x.m)}</span><b>${brl(x.v)}</b></li>`).join("")}</ol>` : ""}</div>
    <div class="mc-quadro"><div class="mc-qt">Produção por empreiteiro (quantidade)</div>${blocoProd}</div>
    </div>
    <div class="mc-quadro mc-largo"><div class="mc-qt">Quantidade medida por serviço</div><div class="mc-unids">${blocoQtd}</div></div>
  </div>
  <div class="oc-sec" id="mapa">Mapa da obra ${tipo || cat ? `<small style="text-transform:none;letter-spacing:0;color:var(--mut);font-weight:600"> · só ${esc(cat ? (servSel || {}).servico || "" : tipo)}</small>` : ""}</div>${resumoMapa(R, tipo, cat)}${mapa(R, { tipo, cat })}
  <details class="mc-quadro mc-tabemp" data-gk="tabemp|${esc(R.O.obra)}" style="margin-top:14px"><summary class="mc-qt" style="cursor:pointer;margin:0;list-style:none"><span class="mc-seta">▸</span>Tabela por empreiteiro ${filtrado ? "<small>no filtro</small>" : ""}<small>clique para abrir</small></summary><div style="margin-top:10px">${tabEmp}</div></details></div>`;
}
/** A linha que conta o recorte do mapa (quando há filtro de tipo ou serviço). */
function resumoMapa(R, tipo, cat) {
  if (!tipo && !cat) return "";
  const its = Object.values(R.I).filter(x => (!tipo || x.tipo === tipo) && (!cat || x.cat === cat)), tot = its.reduce((a, x) => a + x.total, 0), med = its.reduce((a, x) => a + x.total * Math.min(1, x.aprov), 0);
  return `<div style="font-size:12.5px;color:#4a4a52;margin:0 0 8px"><b>${pct(tot ? med / tot : 0, 1)}</b> medido · ${brl(med)} de ${brl(tot)} · ${its.length} serviço(s) em ${new Set(its.map(x => x.local)).size} local(is)</div>`;
}

// ---------------------------------------------------------------- Boletins de medição: um por empreiteiro por mês de competência
/** Assinatura do empreiteiro (12/11): o boletim aprovado no sistema precisa ser assinado (a versão aprovada). Os que vieram
 *  da planilha (já pagos lá) não precisam. Devolve "falta", "ok" ou "" (não se aplica). */
function situacaoAssinatura(B) {
  if (B.status !== D.ESTADOS.ok || B.pagoNaPlanilha) return "";
  const V = D.versaoAprovada(B); if (!V || V.por === "planilha") return "";
  return V.assinatura ? "ok" : "falta";
}
function abaBoletins(R, user, q) {
  const b0 = base(R.O.obra), todos = R.O.boletins;
  const meses = [...new Set(todos.map(B => B.mes))].sort().reverse(), emps = [...new Set(todos.map(B => B.emp))].sort((a, c) => nomeEmp(R, a).localeCompare(nomeEmp(R, c), "pt-BR"));
  const mes = meses.includes(q.mes) ? q.mes : "", emp = emps.includes(q.emp) ? q.emp : "", st = ["aberto", "fila", "ok", "assinar", "reaberto", "devolvido"].includes(q.st) ? q.st : "";
  const passaSt = B => !st || (st === "assinar" ? situacaoAssinatura(B) === "falta" : st === "devolvido" ? devolvido(B) : st === "aberto" ? B.status === D.ESTADOS.aberto : st === "fila" ? D.NA_FILA.includes(B.status) : st === "ok" ? B.status === D.ESTADOS.ok : B.status !== D.ESTADOS.ok && B.versoes.length);
  const vis = todos.filter(B => (!mes || B.mes === mes) && (!emp || B.emp === emp) && passaSt(B)).sort((a, c) => c.mes.localeCompare(a.mes) || nomeEmp(R, a.emp).localeCompare(nomeEmp(R, c.emp), "pt-BR"));
  const conta = f => todos.filter(f).length, sel = `padding:8px 10px;border:1px solid #ddd8c8;border-radius:9px;font:inherit;font-size:13px;background:#fff;width:100%`;
  const ultimaAcao = B => { const ev = [...B.envios.map(x => ({ ...x, t: "enviado" })), ...B.aprovacoes.map(x => ({ ...x, t: "aprovado (" + x.etapa + ")" })), ...B.devolucoes.map(x => ({ ...x, t: "devolvido" })),
    ...B.reaberturas.map(x => ({ ...x, t: "reaberto" })), ...(B.versoes || []).map(x => ({ ...x, t: "aprovado (final)" }))].sort((a, c) => String(c.em).localeCompare(String(a.em)))[0];
    return ev ? `${ev.t} · ${esc(ev.por)} · ${quandoBR(ev.em)}` : `criado · ${esc(B.criadoPor)}`; };
  let ult = "", linhas = "";
  for (const B of vis) {
    if (B.mes !== ult) { ult = B.mes; const doMes = vis.filter(x => x.mes === B.mes);
      linhas += `<tr class="n2"><td colspan="7">${mesLongo(B.mes)} <small style="font-weight:600;color:var(--mut)">· ${doMes.length} boletim(ns) · ${brl(doMes.reduce((a, x) => a + totBol(x), 0))}</small></td></tr>`; }
    const s = D.somaBoletim(B.itens, B.extras);
    linhas += `<tr><td><a href="${b0}/boletim/${esc(B.id)}" style="color:inherit"><b>${esc(nomeEmp(R, B.emp))}</b></a><br><small style="color:var(--mut)">${esc((R.emp[B.emp] || {}).funcao || "—")}</small></td>
      <td class="r">nº ${B.numero}</td><td class="r">${B.itens.length}${B.extras.length ? ` <small style="color:var(--mut)">+ ${B.extras.length} extra(s)</small>` : ""}</td><td class="r"><b>${brl(s.normal + s.extra)}</b>${s.extra ? `<br><small style="color:var(--mut)">extra ${brl(s.extra)}</small>` : ""}</td>
      <td>${chipBol(B)}${B.pagoNaPlanilha ? ` <span class="oc-tag">planilha</span>` : ""}${situacaoAssinatura(B) === "falta" ? `<br><small style="color:#a8321f;font-weight:700">✍️ falta a assinatura do empreiteiro</small>` : situacaoAssinatura(B) === "ok" ? `<br><small style="color:#2e7d32;font-weight:600">✍️ assinado</small>` : ""}</td><td style="font-size:12px">${ultimaAcao(B)}</td><td class="r"><a class="oc-btn${B.status === D.ESTADOS.aberto && (B.itens.length || B.extras.length) ? " p" : ""}" href="${b0}/boletim/${esc(B.id)}">Abrir</a></td></tr>`;
  }
  return `<div class="oc-barra"><a class="oc-btn p" href="${b0}/lancar">+ Lançar medição</a>${btnExp}</div>
  <div class="oc-nota xp">Cada empreiteiro tem <b>um boletim por mês</b> (o mês da data do serviço). Tudo o que for lançado para ele no mês entra no boletim dele;
    serviço dividido entre dois vai, com a parte de cada um, para o boletim de cada um. Quando o boletim do mês estiver completo, <b>envie para aprovação</b>:
    ${D.ETAPA_DIRETORIA ? "o Gerente de Engenharia aprova ou devolve, e depois a Diretoria" : "o Gerente de Engenharia aprova ou devolve"}. Aprovado, falta <b>colher a assinatura do empreiteiro</b>
    (filtro "Falta assinatura"; os boletins que vieram da planilha não precisam). Se um boletim enviado ou aprovado receber um lançamento ou alteração, a aprovação cai e ele
    volta <b>em aberto</b>, marcado como <b>reaberto</b>, mostrando o que mudou desde a última aprovação.</div>
  <div class="mc-chips"><a class="mc-chip${!st ? " on" : ""}" href="${b0}?aba=boletins${mes ? "&mes=" + mes : ""}">Todos <b>${todos.length}</b></a>
    <a class="mc-chip${st === "aberto" ? " on" : ""}" href="${b0}?aba=boletins&st=aberto">Em aberto <b>${conta(B => B.status === D.ESTADOS.aberto)}</b></a>
    <a class="mc-chip${st === "fila" ? " on" : ""}" href="${b0}?aba=boletins&st=fila">Na aprovação <b>${conta(B => D.NA_FILA.includes(B.status))}</b></a>
    <a class="mc-chip${st === "ok" ? " on" : ""}" href="${b0}?aba=boletins&st=ok">Aprovados <b>${conta(B => B.status === D.ESTADOS.ok)}</b></a>
    <a class="mc-chip${st === "assinar" ? " on" : ""}" href="${b0}?aba=boletins&st=assinar">Falta assinatura <b>${conta(B => situacaoAssinatura(B) === "falta")}</b></a>
    <a class="mc-chip${st === "reaberto" ? " on" : ""}" href="${b0}?aba=boletins&st=reaberto">Reabertos <b>${conta(B => B.status !== D.ESTADOS.ok && B.versoes.length)}</b></a>
    <a class="mc-chip${st === "devolvido" ? " on" : ""}" href="${b0}?aba=boletins&st=devolvido">Devolvidos <b>${conta(devolvido)}</b></a></div>
  <form method="GET" class="mc-filtros" style="margin-top:10px"><input type="hidden" name="aba" value="boletins"><input type="hidden" name="st" value="${esc(st)}">
    <div>${lab("Mês de competência")}<select name="mes" style="${sel}" onchange="this.form.submit()"><option value="">Todos os meses</option>${meses.map(m => `<option value="${m}"${m === mes ? " selected" : ""}>${mesLongo(m)}</option>`).join("")}</select></div>
    <div>${lab("Empreiteiro")}<select name="emp" style="${sel}" onchange="this.form.submit()"><option value="">Todos</option>${emps.map(e => `<option value="${esc(e)}"${e === emp ? " selected" : ""}>${esc(nomeEmp(R, e))}</option>`).join("")}</select></div></form>
  ${vis.length ? `<div class="oc-rolar"><table class="oc-t"><thead><tr><th>Empreiteiro</th><th class="r">Boletim</th><th class="r">Serviços</th><th class="r">Valor</th><th>Situação</th><th>Último passo</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
    : `<div class="oc-vazio">Nenhum boletim${st || mes || emp ? " neste filtro" : " ainda. Use \"+ Lançar medição\""}.</div>`}
  ${(R.O.boletinsExcluidos || []).length ? `<details class="oc-ins" style="margin-top:14px"><summary>Boletins excluídos (${R.O.boletinsExcluidos.length})</summary><table class="oc-t"><thead><tr><th class="r">Nº</th><th>Empreiteiro</th><th>Mês</th><th class="r">Lançamentos</th><th class="r">Valor</th><th>Situação quando excluído</th><th>Excluído por</th><th>Motivo</th></tr></thead><tbody>
    ${R.O.boletinsExcluidos.slice().reverse().map(x => { const s = D.somaBoletim(x.itens || [], x.extras || []); return `<tr><td class="r">${x.numero}</td><td>${esc(x.empNome || nomeEmp(R, x.emp))}</td><td>${mesBR(x.mes)}</td><td class="r">${(x.itens || []).length}${(x.extras || []).length ? ` + ${(x.extras || []).length} extra(s)` : ""}</td><td class="r">${brl(s.normal + s.extra)}</td>
      <td>${esc(x.excluido.status || "")}${x.excluido.assinado ? ` <span class="oc-tag">assinado</span>` : ""}</td><td style="font-size:12px">${esc(x.excluido.por)} · ${quandoBR(x.excluido.em)}</td><td style="font-size:12px">${esc(x.excluido.motivo)}</td></tr>`; }).join("")}</tbody></table></details>` : ""}
  ${R.O.anteriores.length ? `<details class="oc-ins" style="margin-top:14px"><summary>Boletins fechados na versão anterior (${R.O.anteriores.length})</summary><table class="oc-t"><thead><tr><th class="r">Nº</th><th>Empreiteiro</th><th>Mês</th><th class="r">Total</th><th>Fechado</th><th></th></tr></thead><tbody>
    ${R.O.anteriores.map(x => `<tr><td class="r">${x.numero}</td><td>${esc(x.empNome)}</td><td>${mesBR(x.mes)}</td><td class="r">${brl(x.total)}</td><td style="font-size:12px">${esc(x.fechadoPor)} · ${quandoBR(x.fechadoEm)}</td>
      <td class="r">${x.formato ? "" : `<a class="oc-btn" href="/obras/medicoes/${esc(R.O.obra)}/boletim.pdf?b=${esc(x.id)}&visual=1">PDF</a>`}</td></tr>`).join("")}</tbody></table></details>` : ""}`;
}

// ---------------------------------------------------------------- Aprovação: os boletins na fila (aprova-se o boletim inteiro)
function abaAprovacao(R, user) {
  const b0 = base(R.O.obra), P = D.papel(user);
  const fila = R.O.boletins.filter(B => D.NA_FILA.includes(B.status)).sort((a, c) => String((a.envios[a.envios.length - 1] || {}).em).localeCompare(String((c.envios[c.envios.length - 1] || {}).em)));
  const minha = B => !!D.etapaDeAprovar(B, P);
  return `<div class="oc-barra">${btnExp}</div>
  <div class="oc-nota xp">Aprova-se o <b>boletim inteiro</b> do empreiteiro no mês: ${D.ETAPA_DIRETORIA ? `<b>1. Gerente de Engenharia</b> aprova ou devolve; <b>2. Diretoria</b> dá a aprovação final.` : `o <b>Gerente de Engenharia</b> aprova (já é a aprovação final) ou devolve. A Diretoria também pode aprovar e devolver.`}
    Devolver pede o motivo e o boletim volta em aberto para corrigir. Abra o boletim para conferir e aprovar; nele, o que mudou desde uma aprovação anterior
    vem marcado.</div>
  ${fila.length ? fila.map(B => { const s = D.somaBoletim(B.itens, B.extras), dif = D.diferencas(B), env = B.envios[B.envios.length - 1] || {};
    const nDif = Object.keys(dif.itens).length + Object.keys(dif.extras).length + dif.removidos.itens.length + dif.removidos.extras.length;
    return `<div class="mc-cart"><h3>Boletim nº ${B.numero} · ${esc(nomeEmp(R, B.emp))} · ${mesLongo(B.mes)} ${chipBol(B)}<span class="v">${brl(s.normal + s.extra)}</span></h3>
      <div class="meta">${B.itens.length} lançamento(s)${B.extras.length ? ` + ${B.extras.length} extra(s) (${brl(s.extra)})` : ""} · enviado por ${esc(env.por || "—")} ${quandoBR(env.em)}
        ${B.aprovacoes.map(a => ` · aprovado (${esc(a.etapa)}) por ${esc(a.por)} ${quandoBR(a.em)}`).join("")}</div>
      ${(() => { const C = D.conferencia(R.O, B), n = k => C.alertas.filter(a => a.nivel === k).length, nf = [...C.M.itens, ...C.M.extras].reduce((a, x) => a + (x.fotos || []).length, 0) + (B.fotos || []).length;
        return `<div class="mc-filaconf">${n("alto") ? `<span class="t a">${n("alto")} atenção</span>` : ""}${n("medio") ? `<span class="t m">${n("medio")} conferir</span>` : ""}${!n("alto") && !n("medio") ? `<span class="t ok">nada fora do comum</span>` : ""}<span class="t f">📷 ${nf} foto(s)</span>
          ${C.media ? `<span class="t f">média do empreiteiro ${brl(C.media)}</span>` : ""}</div>${C.alertas.filter(a => a.nivel !== "baixo").slice(0, 3).map(a => `<div class="mc-filaal">• ${esc(a.titulo)}</div>`).join("")}`; })()}
      ${dif.base ? `<div class="mc-previa" style="margin:6px 0 0">Já foi aprovado antes (versão ${dif.base.n}, ${brl(D.somaBoletim(dif.base.itens, dif.base.extras).normal + D.somaBoletim(dif.base.itens, dif.base.extras).extra)}). Mudou desde então: <b>${nDif} item(ns)</b> — marcados no boletim.</div>` : ""}
      <div class="acoes"><a class="oc-btn p" href="${b0}/boletim/${esc(B.id)}">Abrir para conferir${minha(B) ? " e aprovar" : ""}</a>
        ${minha(B) ? "" : `<span style="font-size:12px;color:var(--mut)">${!D.ETAPA_DIRETORIA ? "Quem aprova: Gerente de Engenharia" : B.status === D.ESTADOS.fila1 ? "Quem aprova esta etapa: Gerente de Engenharia (io)" : "Quem aprova esta etapa: Diretoria"}</span>`}</div></div>`; }).join("")
    : `<div class="oc-ok">Nenhum boletim esperando aprovação.</div>`}`;
}

// ---------------------------------------------------------------- Estrutura: pavimentos → locais → serviços; modelos
/** Caixinhas de locais, por pavimento (dobráveis), com "marcar todos com o nome…". */
function seletorLocais(R, marcados = []) {
  const set = new Set(marcados);
  return `<div class="mc-sel">
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px;font-size:12px"><input type="text" placeholder="Nome do local (ex.: Apto 01)" class="mc-i" style="width:190px;padding:5px 8px" onkeydown="if(event.key==='Enter'){event.preventDefault();mcMarcaNome(this);}">
      <button type="button" class="mc-mini" onclick="mcMarcaNome(this.previousElementSibling)">marcar em todos os pavimentos</button>
      <button type="button" class="mc-mini" onclick="mcMarca(this.closest('.mc-sel'),false);mcConta(this.closest('form'))">limpar</button><b class="mc-nsel" style="margin-left:auto">${set.size} marcado${set.size === 1 ? "" : "s"}</b></div>
    ${R.pavs.map(p => { const ls = R.locais.filter(l => l.pav === p.id); if (!ls.length) return "";
      return `<details${ls.some(l => set.has(l.id)) ? " open" : ""}><summary>${esc(p.nome)} <small style="color:var(--mut)">(${ls.length})</small>
        <button type="button" class="mc-mini" style="margin-left:8px" onclick="event.preventDefault();var d=this.closest('details');d.open=true;mcMarca(d,true);mcConta(this.closest('form'))">marcar o pavimento</button></summary>
        <div class="ls">${ls.map(l => `<label><input type="checkbox" name="local" value="${esc(l.id)}" data-nome="${esc(l.nome)}"${set.has(l.id) ? " checked" : ""} onchange="mcConta(this.closest('form'))">${esc(l.nome)}</label>`).join("")}</div></details>`; }).join("")}</div>`;
}
/** CAIXA DE ESCOLHA COM PESQUISA (13/11): o select com a classe "mc-busca" vira uma caixa de digitar — a lista abre ao clicar
 *  no campo ou ao digitar (filtra sem acento, por várias palavras); o select continua por baixo, escondido, e é ele que vai no formulário.
 *  Usado no "Adicionar serviço" da Estrutura e no Lançar medição (tipo de serviço e empreiteiros). É JS puro: entra dentro de um <script>. */
const BUSCA_JS = `  function mcSemAc(s){ return String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(); }
  function mcBuscaSel(sel){ if(sel.dataset.busca) return; sel.dataset.busca='1';
    function vale(o){ return o.value || (o.text && o.text.charAt(0)!=='—'); }   // "Todos os tipos" vale; o "—" é só o vazio
    var w=document.createElement('div'); w.className='mc-bw'; sel.parentNode.insertBefore(w,sel); w.appendChild(sel);
    var inp=document.createElement('input'); inp.type='text'; inp.className='mc-i'; inp.autocomplete='off'; if(sel.required){ inp.required=true; sel.required=false; } w.appendChild(inp);
    inp.addEventListener('change', function(e){ e.stopPropagation(); });
    var lista=document.createElement('div'); lista.className='mc-bl'; w.appendChild(lista);
    var vis=[], pos=-1, ultimo=sel.value;
    function txtSel(){ var o=sel.options[sel.selectedIndex]; return o&&vale(o)?o.text:''; }
    function mostra(){ var ps=mcSemAc(inp.value).split(/\\s+/).filter(Boolean); vis=[];
      Array.prototype.forEach.call(sel.options, function(o){ if(!vale(o)) return; var tx=mcSemAc(o.text); if(ps.every(function(p){ return tx.indexOf(p)>=0; })) vis.push(o); });
      pos=-1; lista.innerHTML=vis.length?'':'<div class="nada">Nada com esse texto.</div>';
      vis.slice(0,200).forEach(function(o,k){ var d=document.createElement('div'); d.textContent=o.text; if(o.disabled) d.className='off';
        d.addEventListener('mousedown', function(e){ e.preventDefault(); if(!o.disabled) escolhe(o); }); lista.appendChild(d); });
      lista.classList.add('on'); }
    function escolhe(o){ sel.value=o.value; inp.value=o.text; lista.classList.remove('on'); ultimo=sel.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
    function marca(){ Array.prototype.forEach.call(lista.children, function(d,k){ d.classList.toggle('sel', k===pos); if(k===pos) d.scrollIntoView({block:'nearest'}); }); }
    inp.addEventListener('focus', function(){ inp.select(); });
    inp.addEventListener('click', function(){ if(!lista.classList.contains('on')) mostra(); });   // abre quando a PESSOA clica no campo (o foco automático do popup não abre)
    // só vale o que está na lista: texto digitado que não é exatamente uma opção deixa a escolha VAZIA (e some ao sair do campo)
    inp.addEventListener('input', function(){ var tx=mcSemAc(inp.value).trim(), ach=null; Array.prototype.forEach.call(sel.options, function(o){ if(!ach && vale(o) && !o.disabled && mcSemAc(o.text).trim()===tx) ach=o; }); sel.value=ach?ach.value:''; mostra(); });
    inp.addEventListener('keydown', function(e){
      if(e.key==='ArrowDown'){ e.preventDefault(); if(!lista.classList.contains('on')) mostra(); pos=Math.min(pos+1, Math.min(vis.length,200)-1); marca(); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); pos=Math.max(pos-1,0); marca(); }
      else if(e.key==='Enter'){ e.preventDefault(); var o=vis[pos<0?0:pos]; if(o&&!o.disabled&&lista.classList.contains('on')) escolhe(o); }
      else if(e.key==='Escape'){ if(lista.classList.contains('on')){ e.preventDefault(); e.stopPropagation(); lista.classList.remove('on'); sel.value=ultimo; inp.value=txtSel(); } } });
    inp.addEventListener('blur', function(){ setTimeout(function(){ lista.classList.remove('on'); inp.value=txtSel();
      if(sel.value!==ultimo){ ultimo=sel.value; sel.dispatchEvent(new Event('change',{bubbles:true})); } },120); });
    sel.mcSync=function(){ inp.value=txtSel(); ultimo=sel.value; }; inp.value=txtSel(); }
  function mcBuscaIni(){ document.querySelectorAll('select.mc-busca').forEach(mcBuscaSel); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', mcBuscaIni); else setTimeout(mcBuscaIni,0);
`;
function linhasServico(R, n, pre = []) {
  const ops = sel => `<option value="">—</option>${R.C.servicos.filter(c => !c.removido).sort((a, b) => (a.tipo + a.servico).localeCompare(b.tipo + b.servico, "pt-BR"))
    .map(c => { const pu = D.precoNaData(R.O, c.id); return `<option value="${esc(c.id)}"${sel === c.id ? " selected" : ""}${pu == null ? " disabled" : ""}>${esc(c.tipo)} — ${esc(c.servico)} (${esc(c.unidade)}${pu == null ? " · sem preço nesta obra" : " · " + brl(pu)})</option>`; }).join("")}`;
  return Array.from({ length: n }, (_, i) => { const p = pre[i] || {}; return `<tr><td><select name="cat${i + 1}" class="mc-i mc-busca">${ops(p.cat)}</select></td>
    <td class="r"><input name="${p.q != null || pre.length ? "q" : "qp"}${i + 1}" value="${p.q != null ? esc(num(p.q, 0, 4)) : ""}" inputmode="decimal" class="mc-i" style="width:110px;text-align:right"></td>
    ${pre.length ? "" : `<td class="r"><input name="qr${i + 1}" inputmode="decimal" class="mc-i" style="width:110px;text-align:right"></td>`}</tr>`; }).join("");
}
function abaEstrutura(R, user, q) {
  const O = R.O, b = base(O.obra), obra = esc(O.obra), ger = D.podeGerir(user), est = true;   // 13/11: o Engenheiro também monta a estrutura das obras dele (serviços, pavimentos, locais, grupos); quantidade e tirar serviço: só quem gere
  const pavQ = R.pavs.find(p => p.id === q.pav), locQ = pavQ && R.L[q.local] && R.L[q.local].pav === pavQ.id ? R.L[q.local] : null;
  // locais: ↑ = mais para a esquerda (cima/baixo); pavimentos e grupos: ↑ = um andar para cima (sobe/desce), porque a lista mostra o prédio de pé
  const mover = (acao, idv, extra = "", [up, down] = ["cima", "baixo"]) => !est ? "" : `<form method="POST" action="${b}/${acao}" style="display:inline"><input type="hidden" name="id" value="${esc(idv)}">${extra}<button class="mc-mini" name="dir" value="${up}" title="subir">↑</button><button class="mc-mini" name="dir" value="${down}" title="descer">↓</button></form>`;
  const vivosGr = R.grupos, semGrupo = R.pavs.filter(p => !vivosGr.some(g => g.id === p.grupo)), blocos = predio(R);
  const locaisDe = p => R.locais.filter(l => l.pav === p.id);
  const maisServ = (tipo, idv, rot) => !est ? "" : `<button type="button" class="mc-mini mc-mais" title="${esc(rot)}" onclick="event.preventDefault();event.stopPropagation();mcServ('${esc(idv)}')">+ serviço</button>`;
  // ---- QUANTIDADE REAL PROPOSTA (13/11): o Engenheiro propõe pelo lápis; fica "⏳" até o Gerente/Administrador decidir
  const pendQ = (O.qtdAlteracoes || []).filter(a => a.status === "pendente"), pendDe = iid => pendQ.find(a => a.item === iid);
  const LAPIS = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
  const extraQ = (x, p, loc, med) => { const pq = pendDe(x.id);
    return `${!ger ? `<button type="button" class="mc-ico" style="margin-left:6px;vertical-align:middle" title="${x.qtdReal ? "Propor alteração da quantidade REAL (vai para a aprovação do Gerente ou do Administrador)" : "Preencher a quantidade real"}" onclick="mcQrAbre(this)"
      data-id="${esc(x.id)}" data-pav="${esc(p.id)}" data-local="${esc(loc.id)}" data-rot="${esc(`${p.nome} › ${loc.nome} · ${x.tipo} - ${x.servico}`)}" data-qp="${x.qtdPrev ? esc(num(x.qtdPrev, 0, 4)) : "—"}" data-qr="${x.qtdReal ? esc(num(x.qtdReal, 0, 4)) : "—"}" data-un="${esc(x.unidade)}" data-med="${med ? esc(num(med, 0, 4)) : ""}">${LAPIS}</button>` : ""}${pq ? `<div><span class="mc-qpend" title="Proposta por ${esc(pq.por)} em ${quandoBR(pq.em)} — aguarda o Gerente ou o Administrador">⏳ real proposta: ${num(pq.qrNova, 0, 4)}</span></div>` : ""}`; };
  // ---- os serviços de um local (a tabela de sempre: quantidade prevista/real, preço, valor, medido, tirar)
  const tabelaServ = (p, loc) => {
    const its = loc.itens.slice().sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
    if (!its.length) return `<div class="oc-vazio" style="margin:4px 0">Nenhum serviço neste local ainda. Use “+ serviço”.</div>`;
    return `<div class="oc-rolar"><table class="oc-t"><thead><tr><th>Serviço</th><th class="r">Previsto · real</th><th class="r">Preço</th><th class="r">Valor</th><th class="r">Medido</th><th></th></tr></thead><tbody>
      ${its.map(x => { const trav = x.temMedicao, med = trav ? D.qtdMedida(O, x.id) : 0, fq = x.qtdReal > 0 ? x.qtdReal : (x.qtdPrev || 0);
        const txtQ = `${x.qtdPrev ? num(x.qtdPrev, 0, 4) : "—"} · <b>${x.qtdReal ? num(x.qtdReal, 0, 4) : "—"}</b> ${esc(x.unidade)}`;
        // sem medição: qualquer um corrige. Com medição: só quem gere (lápis), e a confirmação mostra como a % do que já foi medido fica
        const form = escondido => `<form method="POST" action="${b}/quantidade" class="mc-qf" style="margin:0;display:${escondido ? "none" : "flex"};gap:4px;justify-content:flex-end"${trav ? ` data-med="${med}" data-un="${esc(x.unidade)}" data-q="${fq}" onsubmit="return mcConfQtd(this)"` : ""}><input type="hidden" name="id" value="${esc(x.id)}"><input type="hidden" name="pav" value="${esc(p.id)}"><input type="hidden" name="local" value="${esc(loc.id)}">
          <input name="qp" value="${x.qtdPrev ? esc(num(x.qtdPrev, 0, 4)) : ""}" placeholder="previsto" title="quantidade prevista" class="mc-i" style="width:76px;text-align:right;padding:4px 6px"><input name="qr" value="${x.qtdReal ? esc(num(x.qtdReal, 0, 4)) : ""}" placeholder="real" title="quantidade real" class="mc-i" style="width:76px;text-align:right;padding:4px 6px"><button class="mc-mini">ok</button></form>`;
        return `<tr><td>${esc(x.tipo)} — <b>${esc(x.servico)}</b>${trav ? `<br><small style="color:var(--mut)">já medido: ${num(med, 0, 4)} ${esc(x.unidade)}</small>` : ""}</td>
        <td class="r">${!trav ? (ger ? form(false) : txtQ) : ger ? `<div class="mc-qv" style="display:flex;gap:6px;justify-content:flex-end;align-items:center"><span>${txtQ}</span><button type="button" class="mc-ico" title="Corrigir a quantidade (serviço já medido — só a engenharia)" onclick="var td=this.closest('td');td.querySelector('.mc-qv').style.display='none';td.querySelector('form').style.display='flex';"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button></div>${form(true)}` : txtQ}${extraQ(x, p, loc, med)}</td>
        <td class="r">${x.pu == null ? "—" : brl(x.pu)}</td><td class="r">${brl(x.total)}</td><td class="r">${pct(x.aprov)}${x.fila ? ` <span class="md-st fila">+${pct(x.fila)} fila</span>` : ""}</td>
        <td class="r">${trav || !ger ? "" : `<form method="POST" action="${b}/item-remover" style="margin:0" onsubmit="return confirm('Tirar este serviço deste local?')"><input type="hidden" name="id" value="${esc(x.id)}"><input type="hidden" name="pav" value="${esc(p.id)}"><input type="hidden" name="local" value="${esc(loc.id)}"><button class="mc-mini" style="color:#8a2d2d">tirar</button></form>`}</td></tr>`; }).join("")}
    </tbody></table></div>`;
  };
  // ---- a árvore: Grupo › Pavimento › Local › Serviços (grupos abertos; pavimentos e locais fechados, a não ser o que se acabou de mexer)
  const nodoLocal = (p, l) => `<details class="mc-ar l" data-ak="est|${obra}|${esc(l.id)}"${locQ && locQ.id === l.id ? " open data-forca" : ""}>
    <summary><span class="mc-seta">▸</span><span class="nm">${esc(l.nome)}</span><small>${l.itens.length} serviço${l.itens.length === 1 ? "" : "s"}${l.total ? " · " + pct(l.medido / l.total) + " medido" : ""}</small>
      <span class="ac">${maisServ("l", l.id, "Adicionar serviço neste local")}</span></summary>
    <div class="in">${tabelaServ(p, l)}</div></details>`;
  const nodoPav = p => { const ls = locaisDe(p), ns = ls.reduce((a, l) => a + l.itens.length, 0);
    return `<details class="mc-ar p" data-ak="est|${obra}|${esc(p.id)}"${pavQ && pavQ.id === p.id ? " open data-forca" : ""}>
    <summary><span class="mc-seta">▸</span><span class="nm">${esc(p.nome)}</span><small>${ls.length} ${ls.length === 1 ? "local" : "locais"} · ${ns} serviço${ns === 1 ? "" : "s"}</small>
      </summary>
    <div class="in">${ls.map(l => nodoLocal(p, l)).join("") || `<div class="oc-vazio" style="margin:4px 0">Nenhum local neste pavimento.</div>`}
      </div></details>`; };
  const arvore = blocos.map(({ g, pavs }) => {
    const dentro = pavs.map(nodoPav).join("") || (g ? `<div style="font-size:12px;color:var(--mut);padding:4px 2px">vazio</div>` : "");
    if (!vivosGr.length) return dentro;
    return `<details class="mc-grl" open data-gk="est|${obra}|${g ? esc(g.id) : "sem"}"${pavQ && pavs.some(p => p.id === pavQ.id) ? " data-forca" : ""}><summary class="grt"><span class="mc-seta">▸</span><span style="flex:1">${g ? esc(g.nome) : "Sem grupo"} <small>${pavs.length} pavimento${pavs.length === 1 ? "" : "s"}</small></span></summary>
      <div class="mc-arg">${dentro}</div></details>`; }).join("") || `<div class="oc-vazio">Nenhum pavimento ainda. A estrutura (pavimentos e locais) é cadastrada no <a href="/empreendimentos/${encodeURIComponent(O.obra)}" style="text-decoration:underline">cadastro da obra</a>.</div>`;
  // ---- a janela "Adicionar serviço": serviço entra SEMPRE num LOCAL. Opcional: replicar nos pavimentos tipo iguais — a regra da planilha:
  //      o pavimento tipo é o nome antes do número ("Tipo 01" → "Tipo"); vai para o local de MESMO NOME em cada pavimento com o mesmo começo.
  //      Antes de gravar, a janela mostra a lista de onde vai entrar (dá para desmarcar) e pede a confirmação.
  const dlg = (id, titulo, corpo) => `<dialog class="mc-dlg lg" id="${id}"><p class="rot" style="font-size:15px">${titulo}</p>${corpo}</dialog>`;
  const fechar = `<button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button>`;
  const LOC = R.pavs.flatMap(p => locaisDe(p).map(l => ({ id: l.id, nome: l.nome, pav: p.id, pavNome: p.nome, pre: prefixoTipo(p.nome) || "" })));
  const dlgServ = dlg("mcDlgServ", "Adicionar serviço", `<form method="POST" action="${b}/itens" id="mcFormServ" style="display:block;margin:0" onsubmit="mcGuardaRolagem()">
    <input type="hidden" name="pav" id="mcSvPav"><input type="hidden" name="volta" id="mcSvVolta">
    <div id="mcSvP1">
      ${lab("Local")}<select name="local" id="mcSvLocal" class="mc-i mc-busca" onchange="mcSvRep()"><option value="">— escolha o local —</option>${blocos.map(({ pavs }) => pavs.map(p => { const ls = locaisDe(p); return ls.length ? `<optgroup label="${esc(p.nome)}">${ls.map(l => `<option value="${esc(l.id)}">${esc(p.nome)} › ${esc(l.nome)}</option>`).join("")}</optgroup>` : ""; }).join("")).join("")}</select>
      <table class="oc-t" style="margin-top:10px"><thead><tr><th>Serviço do catálogo (com o preço desta obra)</th><th class="r">Previsto</th><th class="r">Real</th></tr></thead><tbody>${linhasServico(R, 5)}</tbody></table>
      <div style="font-size:12px;color:var(--mut);margin:4px 0 12px">Serviço que não está na lista: cadastre antes na aba “Serviços e preços”.</div>
      <div class="mc-rep"><label><input type="checkbox" id="mcSvRepl" onchange="mcSvRep()"> <b id="mcSvRepRot">Replicar nos pavimentos tipo iguais</b></label>
        <div id="mcSvRepInfo" style="font-size:12px;color:var(--mut);margin-top:4px"></div><div id="mcSvAlvo"></div></div>
      <div class="bt">${fechar}<button type="button" class="oc-btn p" onclick="mcSvAvanca()">Adicionar</button></div></div>
    <div id="mcSvP2" hidden><div id="mcSvResumo"></div>
      <div class="bt"><button type="button" class="oc-btn" onclick="mcSvVolta()">Voltar e corrigir</button><button class="oc-btn p">Confirmar e adicionar</button></div></div></form>`);
  // ---- 22/11: pavimentos e locais em LINHAS (um campo por nome), no lugar da caixa "um por linha". Pensado para o celular na obra:
  // campo grande, Enter pula para o próximo (e cria um novo no fim), ✕ tira a linha, colar uma lista do Excel vira várias linhas,
  // e "Gerar em série" monta Tipo 01…Tipo 20 de uma vez (o número no nome é o que liga a replicação nos pavimentos tipo).
  const linhaUma = (ph, i) => `<div class="mc-lin-r"><span class="mc-lin-n">${i + 1}</span><input name="nome" class="mc-i mc-lin-i" maxlength="80" autocomplete="off" placeholder="${esc(ph)}" onkeydown="mcLinTecla(event,this)" onpaste="mcLinCola(event,this)"><button type="button" class="mc-lin-x" title="Tirar esta linha" aria-label="Tirar esta linha" onclick="mcLinTira(this)">✕</button></div>`;
  const linhas = (oque, phs) => `<div class="mc-lin">${phs.map(linhaUma).join("")}</div>
    <button type="button" class="mc-mini mc-lin-mais" onclick="mcLinMais(this.previousElementSibling,true)">+ outro ${oque}</button>`;
  const serie = pre => `<details class="mc-lin-s"><summary>Gerar em série (ex.: ${esc(pre)} 01 até ${esc(pre)} 10)</summary>
    <div class="mc-lin-sg"><input class="mc-i" value="${esc(pre)}" aria-label="Nome" placeholder="Nome"><span>de</span><input class="mc-i" type="number" inputmode="numeric" min="0" value="1" aria-label="Do número"><span>até</span><input class="mc-i" type="number" inputmode="numeric" min="0" value="10" aria-label="Até o número"><button type="button" class="oc-btn" onclick="mcLinSerie(this)">Gerar</button></div></details>`;
  const LIN_CSS_JS = `<style>
    .mc-lin{display:flex;flex-direction:column;gap:6px;max-height:46vh;overflow:auto;padding:2px}
    .mc-lin-r{display:flex;align-items:center;gap:6px}
    .mc-lin-n{min-width:22px;text-align:right;font-size:12px;font-weight:700;color:var(--mut);font-variant-numeric:tabular-nums}
    .mc-lin-i{flex:1;font-size:16px;padding:10px 12px;min-height:44px}
    .mc-lin-x{flex:none;width:44px;height:44px;border:1px solid #e0d9c4;border-radius:10px;background:#fff;color:#8a2d2d;font-size:16px;cursor:pointer}
    .mc-lin-x:hover{background:#fbeeee}
    .mc-lin-mais{margin:8px 0 0 28px;padding:9px 14px;font-size:13px}
    .mc-lin-s{margin:12px 0 0;font-size:13px}.mc-lin-s summary{cursor:pointer;color:var(--acento-escuro,#7a1f1f);font-weight:700;padding:6px 0}
    .mc-lin-sg{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:6px}
    .mc-lin-sg input{width:84px;font-size:16px;padding:8px 10px}.mc-lin-sg input:first-child{width:130px}
  </style><script>
    function mcLinNum(box){ box.querySelectorAll('.mc-lin-n').forEach(function(n,i){ n.textContent=i+1; }); }
    function mcLinMais(box,foca,valor){ var r=box.querySelector('.mc-lin-r').cloneNode(true), i=r.querySelector('input'); i.value=valor||''; i.placeholder=''; box.appendChild(r); mcLinNum(box); if(foca){ i.focus(); r.scrollIntoView({block:'nearest'}); } return i; }
    function mcLinTira(b){ var r=b.closest('.mc-lin-r'), box=r.parentNode; if(box.querySelectorAll('.mc-lin-r').length>1) r.remove(); else r.querySelector('input').value=''; mcLinNum(box); }
    function mcLinTecla(e,i){ if(e.key!=='Enter') return; e.preventDefault(); var r=i.closest('.mc-lin-r'), prox=r.nextElementSibling;
      if(prox) prox.querySelector('input').focus(); else if(i.value.trim()) mcLinMais(r.parentNode,true); }
    function mcLinCola(e,i){ var t=(e.clipboardData||window.clipboardData).getData('text'); if(!/[\\n;\\t]/.test(t)) return; e.preventDefault();
      var ns=t.split(/[\\r\\n;\\t]+/).map(function(x){ return x.trim(); }).filter(Boolean); if(!ns.length) return;
      var box=i.closest('.mc-lin'); i.value=ns.shift(); var vazias=[].slice.call(box.querySelectorAll('input')).filter(function(x){ return x!==i && !x.value.trim(); });
      ns.forEach(function(n){ var v=vazias.shift(); if(v) v.value=n; else mcLinMais(box,false,n); }); mcLinNum(box); }
    function mcLinSerie(b){ var c=b.parentNode.querySelectorAll('input'), pre=c[0].value.trim(), de=parseInt(c[1].value,10), ate=parseInt(c[2].value,10);
      if(!pre||isNaN(de)||isNaN(ate)||ate<de){ alert('Confira o nome e os números (o “até” não pode ser menor que o “de”).'); return; }
      if(ate-de>199){ alert('No máximo 200 de uma vez.'); return; }
      var box=b.closest('form').querySelector('.mc-lin'), vazias=[].slice.call(box.querySelectorAll('input')).filter(function(x){ return !x.value.trim(); }), w=String(ate).length<2?2:String(ate).length;
      for(var k=de;k<=ate;k++){ var n=pre+' '+String(k).padStart(w,'0'), v=vazias.shift(); if(v) v.value=n; else mcLinMais(box,false,n); }
      vazias.forEach(function(v){ if(box.querySelectorAll('.mc-lin-r').length>1) v.closest('.mc-lin-r').remove(); }); mcLinNum(box); b.closest('details').open=false; }
    function mcLinValida(f){ var ok=[].some.call(f.querySelectorAll('.mc-lin input'),function(x){ return x.value.trim(); }); if(!ok){ alert('Preencha pelo menos um nome.'); f.querySelector('.mc-lin input').focus(); } return ok; }
  </script>`;
  const dlgPav = dlg("mcDlgPav", "Adicionar pavimentos", `<form method="POST" action="${b}/pavimento" style="display:block;margin:0" onsubmit="return mcLinValida(this)">
    ${LIN_CSS_JS}<div style="font-size:12.5px;color:var(--mut);margin:0 0 8px">Um pavimento por campo, <b>de baixo para cima</b> (o 1º é o mais baixo). Entram acima do último pavimento; depois é só pôr no grupo certo (botão “Grupos de pavimentos”).</div>
    ${linhas("pavimento", ["Ex.: Térreo", "Ex.: Tipo 01", "Ex.: Tipo 02"])}
    ${serie("Tipo")}
    <div class="bt">${fechar}<button class="oc-btn p">Cadastrar</button></div></form>`);
  const dlgLoc = dlg("mcDlgLoc", "Adicionar locais", `<form method="POST" action="${b}/local" style="display:block;margin:0" onsubmit="return mcLinValida(this)">
    <div style="font-size:12.5px;color:var(--mut);margin:0 0 8px">Um local por campo.</div>
    ${linhas("local", ["Ex.: Apto 01", "Ex.: Apto 02", "Ex.: Hall"])}
    ${serie("Apto")}
    ${lab("Em quais pavimentos")}<div class="mc-arv">${blocos.map(({ g, pavs }) => `<div class="mc-avg">${vivosGr.length ? `<label class="gt"><input type="checkbox" onchange="var v=this.checked;this.closest('.mc-avg').querySelectorAll('input[name=pav]').forEach(function(c){c.checked=v;})">${g ? esc(g.nome) : "Sem grupo"}</label>` : ""}
      <div class="oc-chks" style="padding:2px 0 6px 22px">${pavs.map(p => `<label><input type="checkbox" name="pav" value="${esc(p.id)}">${esc(p.nome)}</label>`).join("")}</div></div>`).join("")}</div>
    <div class="bt">${fechar}<button class="oc-btn p">Cadastrar</button></div></form>`);
  const dlgGr = dlg("mcDlgGr", "Grupos de pavimentos", `<div style="display:flex;flex-direction:column;gap:12px">
      ${semGrupo.length && vivosGr.length ? `<div><span class="oc-tag">${semGrupo.length} pavimento(s) sem grupo</span></div>` : ""}
      ${semGrupo.length ? `<form method="POST" action="${b}/grupo-auto" style="margin:0"><button class="oc-btn p" title="Térreo, G1, Lazer… → Embasamento · Tipo, Telhado, Reservatório… → Torre · Fachada → Fachadas">Organizar pelo nome</button></form>` : ""}
      <form method="POST" action="${b}/grupo" style="margin:0;display:flex;gap:6px"><input name="nome" placeholder="Grupo novo (ex.: Torre B)" class="mc-i" style="width:200px"><button class="oc-btn">Criar grupo</button></form>
      ${vivosGr.length ? `<form method="POST" action="${b}/grupo-por" style="display:block;margin:0">${lab("Pôr os pavimentos marcados no grupo")}
        <select name="grupo" class="mc-i" style="width:auto;margin-bottom:6px">${vivosGr.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join("")}<option value="">— sem grupo —</option></select>
        <div class="oc-chks">${R.pavs.slice().reverse().map(p => `<label><input type="checkbox" name="pav" value="${esc(p.id)}">${esc(p.nome)}</label>`).join("")}</div>
        <button class="oc-btn p" style="margin-top:6px">Pôr no grupo</button></form>
        <form method="POST" action="${b}/grupo-nome" style="margin:0">${lab("Renomear grupo")}<div style="display:flex;gap:6px;flex-wrap:wrap"><select name="id" class="mc-i" style="width:auto">${vivosGr.map(g => `<option value="${esc(g.id)}">${esc(g.nome)}</option>`).join("")}</select><input name="nome" placeholder="nome novo" class="mc-i" style="width:160px"><button class="oc-btn">Salvar</button></div></form>` : ""}
      <div class="bt" style="margin:0"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></div>`);
  const abre = id => `onclick="document.getElementById('${id}').showModal()"`;
  const topo = `<div class="oc-barra" style="margin-bottom:6px"><button type="button" class="oc-btn" onclick="mcMxAbre()" title="Tabela com todos os serviços, para mudar muitas quantidades de uma vez">✎ Editar quantidades em massa</button></div><div class="oc-barra">${!est ? `<span style="font-size:12.5px;color:var(--mut)">A estrutura da obra é mexida pela engenharia (Gerente, Administrador) ou pela Diretoria — aqui você só vê.</span>` : `<button type="button" class="oc-btn p mc-novo" onclick="mcServ('')">Adicionar serviço</button>
    <a class="oc-btn" href="/empreendimentos/${encodeURIComponent(O.obra)}" title="Pavimentos, locais e grupos ficam no cadastro central da obra">🏗️ Pavimentos e locais (cadastro da obra)</a>`}
    <span style="margin-left:auto;display:flex;gap:6px;align-items:center"><button type="button" class="mc-mini" onclick="mcArTodos(true)">abrir os pavimentos</button><button type="button" class="mc-mini" onclick="mcArTodos(false)">recolher tudo</button>${btnExp}</span></div>`;
  // (o "Modelo de unidade" saiu da tela em 10/11: não é útil para a engenharia. Os dados de modelos já
  //  gravados continuam no arquivo da obra; só não aparecem.)
  // ---- aviso das alterações de quantidade pendentes e o popup (aprovar item a item; histórico)
  const R_I = R.I, linhaQa = (a, comBotoes) => { const x = R_I[a.item] || {}, l = R.L[x.local] || {}, im = D.impactoQtd(O, R, a), un = esc(x.unidade || "");
    const imp = im.sumiu ? "O serviço saiu da estrutura." : !im.temMed ? `Ainda não medido.<br>Valor do serviço: ${brl(im.valorAntes)} → <b>${brl(im.valorDepois)}</b>`
      : `<b>${num(im.med, 0, 2)} ${un}</b> em ${im.boletins} boletim(ns)<br>% medido: ${pct(im.pctAntes, 1)} → <b>${pct(im.pctDepois, 1)}</b><br>Falta medir: ${num(Math.max(0, im.atual - im.med), 0, 2)} → <b>${num(Math.max(0, a.qrNova - im.med), 0, 2)}</b> ${un}
        <br><small style="color:var(--mut)">a quantidade e o valor já medidos não mudam; o % dos boletins se ajusta</small>${im.invalido ? `<br><b class="ruim">Menor que o já medido: não pode ser aprovada.</b>` : ""}`;
    return `<tr><td>${esc(l.pavNome || "—")}</td><td>${esc(l.nome || "—")}</td><td>${esc(x.tipo || "")} — <b>${esc(x.servico || "?")}</b></td>
      <td class="r">${x.qtdPrev ? num(x.qtdPrev, 0, 4) : "—"}</td><td class="r">${a.qrAntes ? num(a.qrAntes, 0, 4) : "—"}${im.mudouDesde ? `<br><small style="color:#a8321f">hoje: ${x.qtdReal ? num(x.qtdReal, 0, 4) : "—"}</small>` : ""}</td><td class="r"><b>${num(a.qrNova, 0, 4)}</b> ${un}</td>
      <td class="imp">${im.temMed ? `<span class="oc-tag">já medido</span><br>` : ""}${imp}</td>
      <td style="font-size:11.5px">${esc(a.por)}<br>${quandoBR(a.em)}${a.motivo ? `<br><i>${esc(a.motivo)}</i>` : ""}</td>
      ${comBotoes ? `<td style="white-space:nowrap"><form method="POST" action="${b}/qtd-decidir" style="display:flex;flex-direction:column;gap:4px;margin:0" onsubmit="try{sessionStorage.setItem('mcQaAbre','1')}catch(e){}"><input type="hidden" name="id" value="${esc(a.id)}"><input type="hidden" name="motivo">
        ${im.invalido || im.sumiu ? "" : `<button class="oc-btn p" name="decisao" value="aprovar" style="padding:4px 10px;font-size:12px">Aprovar</button>`}<button class="oc-btn" name="decisao" value="recusar" style="padding:4px 10px;font-size:12px" onclick="var m=prompt('Motivo da recusa (opcional):',''); if(m===null) return false; this.form.motivo.value=m;">Recusar</button></form></td>` : ""}</tr>`; };
  const feitas = (O.qtdAlteracoes || []).filter(a => a.status !== "pendente").slice(-60).reverse();
  const cabQa = comBotoes => `<tr><th>Pavimento</th><th>Local</th><th>Serviço</th><th class="r">Prevista</th><th class="r">Real anterior</th><th class="r">Real proposta</th><th>Medido e impacto</th><th>Pedido por</th>${comBotoes ? "<th></th>" : ""}</tr>`;
  const avisoQa = pendQ.length ? `<div class="mc-qaban">⏳ <b>${pendQ.length} alteração(ões) de quantidade real</b> aguardando a aprovação do Gerente ou do Administrador.
      <button type="button" class="oc-btn${ger ? " p" : ""}" onclick="document.getElementById('mcDlgQa').showModal()">${ger ? "Ver e aprovar" : "Ver"}</button></div>`
    : feitas.length ? `<div style="font-size:12px;margin:0 0 10px"><a href="#" style="color:var(--mut)" onclick="document.getElementById('mcDlgQa').showModal();return false;">Histórico das alterações de quantidade real (${feitas.length})</a></div>` : "";
  const dlgQa = `<dialog class="mc-dlg lg" id="mcDlgQa" style="width:min(1200px,96vw);max-width:96vw"><p class="rot" style="font-size:15px">Alterações de quantidade real</p>
    ${pendQ.length ? `<div class="oc-rolar"><table class="oc-t mc-qat"><thead>${cabQa(ger)}</thead><tbody>${pendQ.map(a => linhaQa(a, ger)).join("")}</tbody></table></div>
      <div style="font-size:12px;color:var(--mut);margin-top:6px">${ger ? "Aprove ou recuse item a item. Aprovada, a quantidade real passa a valer na hora (na grade, no boletim e no dashboard)." : "Quem aprova é o Gerente de Engenharia ou o Administrador."}</div>`
      : `<div class="oc-vazio">Nenhuma alteração aguardando aprovação.</div>`}
    ${feitas.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700;font-size:13px">Histórico (${feitas.length})</summary><div class="oc-rolar"><table class="oc-t mc-qat"><thead><tr><th>Pavimento</th><th>Local</th><th>Serviço</th><th class="r">Real anterior</th><th class="r">Real proposta</th><th>Pedido por</th><th>Decisão</th></tr></thead><tbody>
      ${feitas.map(a => { const x = R_I[a.item] || {}, l = R.L[x.local] || {}; return `<tr><td>${esc(l.pavNome || "—")}</td><td>${esc(l.nome || "—")}</td><td>${esc(x.servico || "?")}</td><td class="r">${a.qrAntes ? num(a.qrAntes, 0, 4) : "—"}</td><td class="r">${num(a.qrNova, 0, 4)}</td>
        <td style="font-size:11.5px">${esc(a.por)} · ${quandoBR(a.em)}${a.motivo ? `<br><i>${esc(a.motivo)}</i>` : ""}</td><td style="font-size:11.5px"><b style="color:${a.status === "aprovada" ? "#2e7d32" : a.status === "preenchida" ? "#3a3a42" : "#a8321f"}">${esc(a.status)}</b> · ${esc(a.decididoPor || "")} · ${quandoBR(a.decididoEm)}${a.motivoDecisao ? `<br><i>${esc(a.motivoDecisao)}</i>` : ""}</td></tr>`; }).join("")}</tbody></table></div></details>` : ""}
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>`;
  const dlgQr = ger ? "" : `<dialog class="mc-dlg" id="mcDlgQr"><form method="POST" action="${b}/qtd-propor" style="display:block;margin:0" onsubmit="mcGuardaRolagem()">
    <p class="rot" style="font-size:15px">Propor nova quantidade real</p><div id="mcQrRot" style="font-size:12.5px;font-weight:700;margin-bottom:8px"></div>
    <input type="hidden" name="id"><input type="hidden" name="pav"><input type="hidden" name="local">
    <div style="font-size:12.5px;line-height:1.6">Prevista (escritório): <b id="mcQrQp"></b> · Real hoje: <b id="mcQrQr"></b><span id="mcQrMed"></span></div>
    ${lab("Nova quantidade real")}<div style="display:flex;gap:6px;align-items:center"><input name="qr" inputmode="decimal" class="mc-i" style="width:140px;text-align:right" required><span id="mcQrUn" style="font-size:13px"></span></div>
    <div id="mcQrMotLab">${lab("Motivo da alteração")}</div><input name="motivo" maxlength="300" minlength="5" class="mc-i" placeholder="Ex.: medida conferida na obra">
    <div id="mcQrNota" style="font-size:12px;color:var(--mut);margin-top:8px"></div>
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p" id="mcQrOk">Enviar para aprovação</button></div></form></dialog>`;
  // ---- EDIÇÃO EM MASSA (13/11): os dados da tabela (o prédio de cima para baixo; serviços em ordem de tipo e nome) e o script
  const MX = []; for (const { g, pavs } of blocos) for (const pv of pavs) for (const l of locaisDe(pv)) for (const x of l.itens.slice().sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"))) {
    const med = x.temMedicao ? D.qtdMedida(O, x.id) : 0;
    MX.push([x.id, g ? g.nome : "Sem grupo", pv.nome, l.nome, x.tipo, x.servico, x.unidade, x.qtdPrev || 0, x.qtdReal || 0, +med.toFixed(6), x.pu || 0, pendDe(x.id) ? 1 : 0]); }
  const dlgMx = `<dialog class="mc-dlg mc-mx" id="mcDlgMx"><div style="display:flex;align-items:baseline;gap:10px"><p class="rot" style="font-size:15px;margin:0">Editar quantidades em massa</p>
      <span style="font-size:12px;color:var(--mut)">${ger ? "Você muda a prevista e a real." : "Você muda a real: em branco vale na hora; já preenchida, vai para a aprovação do Gerente ou do Administrador. A prevista é do escritório."} Enter ou ↓ desce na coluna.</span></div>
    <div class="mc-mxf"><div><label>Grupo</label><select id="mxG" onchange="mcMxFiltra(1)"></select></div><div><label>Pavimento</label><select id="mxP" onchange="mcMxFiltra(2)"></select></div>
      <div><label>Local</label><select id="mxL" onchange="mcMxFiltra(3)"></select></div><div><label>Serviço</label><select id="mxS" onchange="mcMxFiltra(4)"></select></div>
      <div><label>&nbsp;</label><button type="button" class="oc-btn" onclick="mcMxLimpa()">Limpar filtros</button></div><div style="margin-left:auto;font-size:12px;color:var(--mut)" id="mxConta"></div></div>
    <div class="mc-mxw"><table class="mc-mxt"><thead><tr><th>Grupo</th><th>Pavimento</th><th>Local</th><th>Serviço</th><th>Un</th><th class="n">Medido</th><th class="n">Prevista</th>
      ${ger ? `<th>Prevista nova<div class="ap"><input id="mxApP" placeholder="valor"><button type="button" onclick="mcMxAplica('p')" title="Pôr este valor na prevista de todos os serviços que estão na tela (filtrados)">em todos</button></div></th>` : ""}
      <th class="n">Real</th><th>Real nova<div class="ap"><input id="mxApR" placeholder="valor"><button type="button" onclick="mcMxAplica('r')" title="Pôr este valor na real de todos os serviços que estão na tela (filtrados)">em todos</button></div></th></tr></thead><tbody id="mxCorpo"></tbody></table></div>
    <div class="mc-mxb"><span class="info" id="mxInfo">Nenhuma alteração.</span><button type="button" class="oc-btn" onclick="mcMxFecha()">Fechar</button><button type="button" class="oc-btn p" id="mxRev" onclick="mcMxRevisa()" disabled>Revisar alterações</button></div></dialog>
  <dialog class="mc-dlg mc-mx" id="mcDlgMxC" style="height:auto;max-height:92vh"><form method="POST" action="${b}/qtd-massa" style="display:flex;flex-direction:column;margin:0;min-height:0;max-height:86vh" onsubmit="return mcMxEnvia(this)">
    <p class="rot" style="font-size:15px;margin:0 0 6px">Confira as alterações antes de gravar</p><div id="mxResumo" style="font-size:13px;margin-bottom:8px"></div>
    <div class="mc-mxw" style="max-height:56vh"><table class="mc-mxt"><thead><tr><th>Pavimento › Local</th><th>Serviço</th><th class="n">Prevista</th><th class="n">Real</th><th>Situação</th><th>Medido e impacto</th></tr></thead><tbody id="mxConf"></tbody></table></div>
    <input type="hidden" name="linhas"><div id="mxMot" style="margin-top:8px">${lab("Motivo das alterações da quantidade real (obrigatório — vão para aprovação)")}<input name="motivo" maxlength="300" class="mc-i" placeholder="Ex.: medidas conferidas na obra"></div>
    <div class="mc-mxb"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Voltar e corrigir</button><button class="oc-btn p" id="mxOk">Gravar alterações</button></div></form></dialog>`;
  const scriptMx = `<script>
  var MX=${JSON.stringify(MX).replace(/</g, "\\u003c")}, MXGER=${ger ? 1 : 0}, MXM={};
  function mcMxN(s){ s=String(s==null?'':s).trim(); if(!s) return null; if(s.indexOf(',')>=0) s=s.split('.').join('').replace(',','.'); var n=+s; return isNaN(n)?NaN:n; }
  function mcMxF(n,c){ return (+n||0).toLocaleString('pt-BR',{maximumFractionDigits:c==null?4:c}); }
  function mcMxE(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function mcMxOpcoes(sel, lista, rot){ var v=sel.value; sel.innerHTML='<option value="">'+rot+'</option>'+lista.map(function(x){ return '<option'+(x===v?' selected':'')+'>'+mcMxE(x)+'</option>'; }).join(''); if(lista.indexOf(v)<0) sel.value=''; }
  function mcMxUnicos(f,k){ var s={}, o=[]; MX.forEach(function(r){ if(f(r) && !s[r[k]]){ s[r[k]]=1; o.push(r[k]); } }); return o; }
  function mcMxPassa(r){ var g=document.getElementById('mxG').value, p=document.getElementById('mxP').value, l=document.getElementById('mxL').value, s=document.getElementById('mxS').value;
    return (!g||r[1]===g)&&(!p||r[2]===p)&&(!l||r[3]===l)&&(!s||(r[4]+' — '+r[5])===s); }
  function mcMxFiltra(nivel){ var G=document.getElementById('mxG'), P=document.getElementById('mxP'), L=document.getElementById('mxL'), S=document.getElementById('mxS');
    if(nivel<1) mcMxOpcoes(G, mcMxUnicos(function(){ return true; },1), 'Todos os grupos');
    if(nivel<2) mcMxOpcoes(P, mcMxUnicos(function(r){ return !G.value||r[1]===G.value; },2), 'Todos os pavimentos');
    if(nivel<3) mcMxOpcoes(L, mcMxUnicos(function(r){ return (!G.value||r[1]===G.value)&&(!P.value||r[2]===P.value); },3).sort(function(a,b){ return a.localeCompare(b,'pt-BR',{numeric:true}); }), 'Todos os locais');
    if(nivel<4){ var sv={}; MX.forEach(function(r){ if((!G.value||r[1]===G.value)&&(!P.value||r[2]===P.value)&&(!L.value||r[3]===L.value)) sv[r[4]+' — '+r[5]]=1; }); mcMxOpcoes(S, Object.keys(sv).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); }), 'Todos os serviços'); }
    mcMxDesenha(); }
  function mcMxLimpa(){ ['mxG','mxP','mxL','mxS'].forEach(function(i){ document.getElementById(i).value=''; }); mcMxFiltra(0); }
  function mcMxCel(r,k){ var m=MXM[r[0]]||{}, v=m[k]; return v==null ? '' : v; }
  function mcMxDesenha(){ var h=[], n=0; MX.forEach(function(r,i){ if(!mcMxPassa(r)) return; n++;
      h.push('<tr data-i="'+i+'"><td>'+mcMxE(r[1])+'</td><td>'+mcMxE(r[2])+'</td><td>'+mcMxE(r[3])+'</td><td>'+mcMxE(r[4])+' — <b>'+mcMxE(r[5])+'</b>'+(r[11]?' <span title="Já tem alteração de quantidade real aguardando aprovação">⏳</span>':'')+'</td><td>'+mcMxE(r[6])+'</td>'
        +'<td class="n">'+(r[9]?mcMxF(r[9],2)+' <small style="color:var(--mut)">('+mcMxF(r[9]/((r[8]||r[7])||1)*100,1)+'%)</small>':'—')+'</td><td class="n">'+(r[7]?mcMxF(r[7]):'—')+'</td>'
        +(MXGER?'<td class="ed" data-k="p"><input data-k="p" value="'+mcMxE(mcMxCel(r,'p'))+'" oninput="mcMxMuda(this)" onkeydown="mcMxTecla(event,this)"></td>':'')
        +'<td class="n">'+(r[8]?mcMxF(r[8]):'—')+'</td><td class="ed" data-k="r"><input data-k="r" value="'+mcMxE(mcMxCel(r,'r'))+'" oninput="mcMxMuda(this)" onkeydown="mcMxTecla(event,this)"></td></tr>'); });
    document.getElementById('mxCorpo').innerHTML=h.join('')||'<tr><td colspan="9" style="padding:12px;color:var(--mut)">Nenhum serviço neste filtro.</td></tr>';
    document.getElementById('mxConta').textContent=n+' serviço(s) na tela';
    document.querySelectorAll('#mxCorpo td.ed input').forEach(function(i){ mcMxPinta(i); }); }
  function mcMxPinta(inp){ var r=MX[+inp.closest('tr').getAttribute('data-i')], k=inp.getAttribute('data-k'), v=mcMxN(inp.value), td=inp.parentNode, atual=k==='p'?r[7]:r[8];
    var ruim= v!=null && (isNaN(v)||v<=0); if(!ruim && v!=null && r[9]>0){ var ef = k==='r' ? v : (r[8]||v); if(ef+1e-9<r[9]) ruim=true; }
    td.classList.toggle('ruim', ruim); td.classList.toggle('mud', !ruim && v!=null && Math.abs(v-atual)>1e-9); td.title= ruim ? (v!=null&&v>0&&r[9]>0 ? 'Menor que o já medido ('+mcMxF(r[9])+')' : 'Quantidade inválida') : ''; }
  function mcMxMuda(inp){ var id=MX[+inp.closest('tr').getAttribute('data-i')][0], k=inp.getAttribute('data-k'); MXM[id]=MXM[id]||{}; if(inp.value.trim()) MXM[id][k]=inp.value; else delete MXM[id][k]; mcMxPinta(inp); mcMxConta(); }
  function mcMxTecla(e,inp){ if(e.key!=='Enter'&&e.key!=='ArrowDown'&&e.key!=='ArrowUp') return; e.preventDefault(); var tr=inp.closest('tr'), alvo=(e.key==='ArrowUp'?tr.previousElementSibling:tr.nextElementSibling); if(alvo){ var i=alvo.querySelector('input[data-k="'+inp.getAttribute('data-k')+'"]'); if(i){ i.focus(); i.select(); } } }
  function mcMxAplica(k){ var v=document.getElementById(k==='p'?'mxApP':'mxApR').value; if(!v.trim()) return; document.querySelectorAll('#mxCorpo input[data-k="'+k+'"]').forEach(function(i){ i.value=v; mcMxMuda(i); }); }
  function mcMxMudancas(){ var out=[]; MX.forEach(function(r){ var m=MXM[r[0]]; if(!m) return; var p=m.p!=null?mcMxN(m.p):null, q=m.r!=null?mcMxN(m.r):null;
      var mp=p!=null&&!isNaN(p)&&Math.abs(p-r[7])>1e-9, mr=q!=null&&!isNaN(q)&&Math.abs(q-r[8])>1e-9, ruimP=p!=null&&(isNaN(p)||p<=0), ruimR=q!=null&&(isNaN(q)||q<=0);
      if(mp||mr||ruimP||ruimR) out.push({r:r,p:mp?p:null,q:mr?q:null,ruim:ruimP||ruimR}); }); return out; }
  function mcMxConta(){ var ms=mcMxMudancas(), b=document.getElementById('mxRev'); b.disabled=!ms.length; b.textContent= ms.length ? 'Revisar alterações ('+ms.length+')' : 'Revisar alterações';
    document.getElementById('mxInfo').textContent= ms.length ? ms.length+' serviço(s) alterado(s) — nada é gravado até confirmar.' : 'Nenhuma alteração.'; }
  function mcMxAbre(){ var d=document.getElementById('mcDlgMx'); if(!document.getElementById('mxG').options.length) mcMxFiltra(0); d.showModal(); }
  function mcMxFecha(){ if(mcMxMudancas().length && !confirm('Fechar sem gravar? As alterações da tabela ficam guardadas enquanto esta página estiver aberta.')) return; document.getElementById('mcDlgMx').close(); }
  function mcMxRevisa(){ var ms=mcMxMudancas(), h=[], erros=0, nd=0, na=0, vA=0, vD=0;
    ms.forEach(function(x){ var r=x.r, un=mcMxE(r[6]), pA=r[7], rA=r[8], pN=x.p!=null?x.p:pA, rN=x.q!=null?x.q:rA, efA=rA||pA, efN=rN||pN, med=r[9];
      var ruim=x.ruim||(med>0&&efN+1e-9<med), aprova=!MXGER&&x.q!=null&&rA>0; if(ruim) erros++; else if(aprova) na++; else nd++;
      vA+=efA*r[10]; vD+=efN*r[10];
      var sit= ruim ? '<b style="color:#a8321f">não pode</b>' : aprova ? '⏳ vai para aprovação' : '✓ grava na hora';
      var imp= med>0 ? mcMxF(med,2)+' '+un+' medido · '+mcMxF(med/(efA||1)*100,1)+'% → <b>'+mcMxF(med/(efN||1)*100,1)+'%</b> · falta '+mcMxF(Math.max(0,efA-med),2)+' → <b>'+mcMxF(Math.max(0,efN-med),2)+'</b> '+un+(ruim?' <b style="color:#a8321f">· menor que o já medido</b>':'') : 'ainda não medido · valor '+(efA*r[10]).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' → <b>'+(efN*r[10]).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'</b>';
      h.push('<tr><td>'+mcMxE(r[2])+' › '+mcMxE(r[3])+'</td><td>'+mcMxE(r[4])+' — <b>'+mcMxE(r[5])+'</b></td><td class="n">'+(x.p!=null?(pA?mcMxF(pA):'(vazia)')+' → <b>'+mcMxF(pN)+'</b>':(pA?mcMxF(pA):'—'))+'</td><td class="n">'+(x.q!=null?(rA?mcMxF(rA):'(vazia)')+' → <b>'+mcMxF(rN)+'</b>':(rA?mcMxF(rA):'—'))+'</td><td>'+sit+'</td><td style="white-space:normal;min-width:260px">'+imp+'</td></tr>'); });
    document.getElementById('mxConf').innerHTML=h.join('');
    document.getElementById('mxResumo').innerHTML='<b>'+ms.length+' serviço(s)</b>: '+nd+' gravado(s) na hora'+(na?', <b>'+na+' vão para a aprovação</b> do Gerente ou do Administrador':'')+(erros?', <b style="color:#a8321f">'+erros+' com problema (corrija antes)</b>':'')+'. Valor dos serviços alterados: '+vA.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' → <b>'+vD.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+'</b>. Nas medições já feitas, a quantidade e o valor medidos não mudam; o % se ajusta.';
    var mot=document.getElementById('mxMot'); mot.hidden=!na; mot.querySelector('input').required=!!na; document.getElementById('mxOk').disabled=!!erros;
    var f=document.querySelector('#mcDlgMxC form'); f.linhas.value=JSON.stringify(ms.filter(function(x){ return !x.ruim; }).map(function(x){ var o={id:x.r[0]}; if(x.p!=null) o.qp=String(x.p).replace('.',','); if(x.q!=null) o.qr=String(x.q).replace('.',','); return o; }));
    document.getElementById('mcDlgMxC').showModal(); }
  function mcMxEnvia(f){ document.getElementById('mxOk').disabled=true; mcGuardaRolagem(); return true; }
  </script>`;
  return `${topo}${avisoQa}
  <div class="oc-nota xp">A obra em tópicos: <b>grupo › pavimento › local › serviços</b> — clique na setinha para abrir ou recolher. A ordem daqui (↑↓) é a do mapa e
    do boletim. Serviço entra sempre num <b>local</b>: use o “+ serviço” do local (ou <b>Adicionar serviço</b>, no topo, e escolha o local). Para repetir nos
    pavimentos tipo, marque <b>Replicar nos pavimentos tipo iguais</b>, como na planilha: vai para o local de mesmo nome em cada pavimento com o mesmo
    começo de nome (Tipo 01, Tipo 02…). A janela mostra a lista de onde vai entrar e pede a confirmação antes de gravar. A quantidade <b>prevista</b> é do escritório
    (projeto); a <b>real</b> o Engenheiro preenche pelo lápis ✎ do serviço — em branco, vale na hora; já preenchida, a alteração vale depois da aprovação do Gerente ou do Administrador (aviso no topo desta aba).</div>
  <div class="mc-arvore" onsubmit="mcGuardaRolagem()">${arvore}</div>
  ${dlgServ}${dlgPav}${dlgLoc}${dlgGr}${dlgQa}${dlgQr}${dlgMx}${scriptMx}
  <script>
  function mcQrAbre(b){ var d=document.getElementById('mcDlgQr'), f=d.querySelector('form'); ['id','pav','local'].forEach(function(k){ f[k].value=b.getAttribute('data-'+k); });
    document.getElementById('mcQrRot').textContent=b.getAttribute('data-rot'); document.getElementById('mcQrQp').textContent=b.getAttribute('data-qp')+' '+b.getAttribute('data-un');
    document.getElementById('mcQrQr').textContent=b.getAttribute('data-qr')+' '+b.getAttribute('data-un'); document.getElementById('mcQrUn').textContent=b.getAttribute('data-un');
    var m=b.getAttribute('data-med'); document.getElementById('mcQrMed').textContent= m ? ' · Já medido: '+m+' '+b.getAttribute('data-un')+' (a real não pode ficar menor)' : ''; var vazio=b.getAttribute('data-qr')==='—'; d.querySelector('.rot').textContent= vazio ? 'Preencher a quantidade real' : 'Propor alteração da quantidade real';
    document.getElementById('mcQrNota').textContent= vazio ? 'A real está em branco: o que você preencher já vale (sem aprovação). A prevista é do escritório e não muda.' : 'A real já está preenchida: a alteração vale depois da aprovação do Gerente de Engenharia ou do Administrador. A prevista é do escritório e não muda.';
    document.getElementById('mcQrOk').textContent= vazio ? 'Gravar' : 'Enviar para aprovação';
    f.motivo.required=!vazio; var ml=document.getElementById('mcQrMotLab').firstElementChild||document.getElementById('mcQrMotLab'); ml.textContent= vazio ? 'Observação (opcional)' : 'Motivo da alteração (obrigatório)'; f.qr.value=''; f.motivo.value=''; d.showModal(); f.qr.focus(); }
  try{ if(sessionStorage.getItem('mcQaAbre') || new URLSearchParams(location.search).has('qa')){ sessionStorage.removeItem('mcQaAbre'); var dq=document.getElementById('mcDlgQa'); if(dq && dq.querySelector('form')) dq.showModal(); } }catch(e){}
  var mcLOC=${JSON.stringify(LOC).replace(/</g, "\\u003c")};
  function mcE(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function mcN(s){ return String(s||'').trim().toLowerCase(); }
  function mcSvRep(){ var id=document.getElementById('mcSvLocal').value, o=mcLOC.find(function(x){ return x.id===id; }), cb=document.getElementById('mcSvRepl'),
      info=document.getElementById('mcSvRepInfo'), alvo=document.getElementById('mcSvAlvo'), rot=document.getElementById('mcSvRepRot');
    document.getElementById('mcSvPav').value=o?o.pav:''; document.getElementById('mcSvVolta').value=o?o.id:''; alvo.innerHTML='';
    if(!o){ cb.checked=false; cb.disabled=true; rot.textContent='Replicar nos pavimentos tipo iguais'; info.textContent='Escolha o local primeiro.'; return; }
    if(!o.pre){ cb.checked=false; cb.disabled=true; rot.textContent='Replicar nos pavimentos tipo iguais'; info.textContent='“'+o.pavNome+'” não tem número no nome, então não é pavimento tipo: o serviço entra só neste local.'; return; }
    var pavs=[]; mcLOC.forEach(function(x){ if(mcN(x.pre)===mcN(o.pre) && x.pav!==o.pav && pavs.indexOf(x.pav)<0) pavs.push(x.pav); });
    if(!pavs.length){ cb.checked=false; cb.disabled=true; rot.textContent='Replicar nos pavimentos “'+o.pre+'” iguais'; info.textContent='Não há outro pavimento “'+o.pre+'” com locais.'; return; }
    cb.disabled=false; rot.textContent='Replicar nos pavimentos “'+o.pre+'” iguais ('+pavs.length+' outro'+(pavs.length>1?'s':'')+')';
    info.innerHTML='Vai também para o local <b>“'+mcE(o.nome)+'”</b> de cada pavimento “'+mcE(o.pre)+'”. Pavimento que não tem esse local fica de fora.';
    if(!cb.checked) return;
    var h='<div class="mc-alvo"><div class="li ori">✔ '+mcE(o.pavNome)+' › <b>'+mcE(o.nome)+'</b> <small>(o escolhido)</small></div>';
    pavs.forEach(function(pv){ var l=mcLOC.find(function(x){ return x.pav===pv && mcN(x.nome)===mcN(o.nome); }), pn=mcLOC.find(function(x){ return x.pav===pv; }).pavNome;
      h+= l ? '<label class="li"><input type="checkbox" name="local" value="'+mcE(l.id)+'" checked> '+mcE(pn)+' › <b>'+mcE(l.nome)+'</b></label>'
            : '<div class="li fora">✖ '+mcE(pn)+' — não tem “'+mcE(o.nome)+'”, fica de fora</div>'; });
    alvo.innerHTML=h+'</div>'; }
  function mcSvAvanca(){ var f=document.getElementById('mcFormServ'), id=document.getElementById('mcSvLocal').value;
    if(!id){ alert('Escolha o local.'); return; }
    var sv=[]; for(var i=1;i<=5;i++){ var s=f.querySelector('select[name=cat'+i+']'); if(!s||!s.value) continue; var qp=f.querySelector('[name=qp'+i+']').value, qr=f.querySelector('[name=qr'+i+']').value;
      if(!qp&&!qr){ alert('Escreva a quantidade prevista ou a real de: '+s.options[s.selectedIndex].text); return; }
      sv.push(s.options[s.selectedIndex].text.replace(/ \\(.*\\)$/,'')+' — '+(qr?('real '+qr):('previsto '+qp))); }
    if(!sv.length){ alert('Escolha ao menos um serviço.'); return; }
    var outros=[].slice.call(f.querySelectorAll('#mcSvAlvo input[name=local]:checked'));
    if(!document.getElementById('mcSvRepl').checked || !outros.length){ f.requestSubmit(); return; }
    var o=mcLOC.find(function(x){ return x.id===id; }), ls=[o].concat(outros.map(function(c){ return mcLOC.find(function(x){ return x.id===c.value; }); })), n=ls.length;
    document.getElementById('mcSvResumo').innerHTML='<div class="mc-conf2"><p>Confira antes de gravar. Vai adicionar <b>'+sv.length+' serviço'+(sv.length>1?'s':'')+'</b> em <b>'+n+' locais</b> (a quantidade vale para cada um):</p>'
      +'<div class="rt">Serviços</div><ul>'+sv.map(function(x){ return '<li>'+mcE(x)+'</li>'; }).join('')+'</ul>'
      +'<div class="rt">Onde ('+n+')</div><ul class="cols">'+ls.map(function(x){ return '<li>'+mcE(x.pavNome)+' › <b>'+mcE(x.nome)+'</b></li>'; }).join('')+'</ul>'
      +'<p style="font-size:12px;color:var(--mut)">Local que já tem o serviço não duplica.</p></div>';
    document.getElementById('mcSvP1').hidden=true; document.getElementById('mcSvP2').hidden=false; }
  function mcSvVolta(){ document.getElementById('mcSvP1').hidden=false; document.getElementById('mcSvP2').hidden=true; }
${BUSCA_JS}
  function mcServ(id){ var dl=document.getElementById('mcDlgServ'); mcSvVolta(); document.getElementById('mcSvLocal').value=id||''; document.getElementById('mcSvRepl').checked=false; mcSvRep(); document.querySelectorAll('#mcDlgServ select.mc-busca').forEach(function(s){ if(s.mcSync) s.mcSync(); }); dl.showModal(); }
  function mcNum(s){ s=String(s||'').trim(); if(!s) return 0; if(s.indexOf(',')>=0) s=s.replace(/\\./g,'').replace(',','.'); return +s||0; }
  function mcFmt(n){ return n.toLocaleString('pt-BR',{maximumFractionDigits:2}); }
  function mcConfQtd(f){ var med=+f.getAttribute('data-med'), un=f.getAttribute('data-un'), q0=+f.getAttribute('data-q'), q=mcNum(f.qr.value)||mcNum(f.qp.value);
    if(!q||Math.abs(q-q0)<1e-9) return true;
    if(q<med-1e-9){ alert('Já foram medidos '+mcFmt(med)+' '+un+' deste serviço: a quantidade não pode ficar menor que isso.'); return false; }
    return confirm('Este serviço já tem medição.\\n\\nQuantidade: '+mcFmt(q0)+' → '+mcFmt(q)+' '+un+'\\nJá medido: '+mcFmt(med)+' '+un+' — continua '+mcFmt(med)+' '+un+', com o mesmo valor em R$.\\nA % do que foi medido passa de '+mcFmt(med/q0*100)+'% para '+mcFmt(med/q*100)+'%.\\n\\nAs aprovações dos boletins continuam valendo. Confirma?'); }
  function mcArTodos(abre){ document.querySelectorAll('.mc-arvore details.mc-ar').forEach(function(d){ if(!abre||d.classList.contains('p')) d.open=abre; }); }
  document.addEventListener('DOMContentLoaded', function(){ document.querySelectorAll('details[data-ak]').forEach(function(d){ var k='mcAb:'+d.getAttribute('data-ak');
    try{ if(localStorage.getItem(k)==='1') d.open=true; }catch(e){}
    d.addEventListener('toggle', function(){ try{ if(d.open) localStorage.setItem(k,'1'); else localStorage.removeItem(k); }catch(e){} }); }); });
  </script>
`;
}

// ---------------------------------------------------------------- Serviços (catálogo do grupo) e preços desta obra
function abaPrecos(R, user, q) {
  const b = base(R.O.obra), ger = D.podeGerir(user), hoje = new Date().toISOString().slice(0, 10);
  const usos = {}; for (const x of Object.values(R.I)) usos[x.cat] = (usos[x.cat] || 0) + 1;
  const todos = R.C.servicos.filter(c => !c.removido).sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
  const hist = c => R.O.precos.filter(p => p.cat === c.id).sort((a, d) => d.desde.localeCompare(a.desde) || String(d.em).localeCompare(String(a.em)));
  const daObra = todos.filter(c => usos[c.id] || hist(c).length || q.cat === c.id);          // a tabela de preços DESTA obra
  return `<div class="oc-barra"><a class="oc-btn p" href="/obras/medicao-servicos?obra=${esc(R.O.obra)}">Abrir o cadastro geral de serviços</a>${btnExp}</div>
  <div class="oc-nota xp">Aqui ficam os <b>preços desta obra</b>: cada preço tem data de início — o novo vale a partir dela e o anterior continua guardado;
    cada medição usa o preço da data dela, e o que já foi medido não muda. O <b>cadastro dos serviços</b> (tipo, serviço, unidade e critério de medição) é um
    só para todas as obras, no <b>cadastro geral de serviços</b> (botão acima) — lá dá para ver o preço de cada serviço em todas as obras.</div>
  ${ger ? `<form method="POST" action="${b}/preco" class="mc-cart" style="margin:0 0 10px;max-width:760px"><div class="oc-sec" style="margin-top:0">Preço novo nesta obra</div>
      <div class="mc-2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)"><div>${lab("Serviço (do cadastro geral)")}<select name="cat" class="mc-i" required><option value="">—</option>${todos.map(c => `<option value="${esc(c.id)}"${q.cat === c.id ? " selected" : ""}>${esc(c.tipo)} — ${esc(c.servico)} (${esc(c.unidade)})</option>`).join("")}</select></div>
        <div>${lab("Preço (R$)")}<input name="valor" inputmode="decimal" class="mc-i" required placeholder="35,00"></div><div>${lab("Vale a partir de")}<input type="date" name="desde" value="${hoje}" class="mc-i" required></div></div>
      <button class="oc-btn p">Salvar preço</button>
      <span style="font-size:12px;color:var(--mut);margin-left:8px">Serviço que não está na lista: cadastre antes no <a href="/obras/medicao-servicos?obra=${esc(R.O.obra)}">cadastro geral</a>.</span></form>` : ""}
  <div class="oc-rolar"><table class="oc-t"><thead><tr><th>Tipo</th><th>Serviço</th><th>Un.</th><th>Critério de medição</th><th class="r">Preço hoje</th><th class="r">Itens na obra</th><th></th></tr></thead><tbody>
    ${daObra.map(c => { const h = hist(c), pu = D.precoNaData(R.O, c.id, hoje); return `<tr${usos[c.id] ? "" : ` style="color:#8a8a92"`}><td>${esc(c.tipo)}</td><td><b>${esc(c.servico)}</b></td><td>${esc(c.unidade)}</td>
      <td style="max-width:320px;font-size:12.5px">${c.criterio ? esc(c.criterio) : `<i style="color:var(--mut)">sem critério</i>`}</td>
      <td class="r"><b>${pu == null ? "—" : brl(pu)}</b>${h.length > 1 ? `<details class="oc-ins"><summary>${h.length} preços</summary>${h.map(p => `<div style="font-size:11.5px">${brl(p.valor)} desde ${dataBR(p.desde)} <span style="color:var(--mut)">· ${esc(p.por)}</span></div>`).join("")}</details>` : ""}</td>
      <td class="r">${usos[c.id] || "—"}</td><td class="r">${ger ? `<a class="mc-mini" style="text-decoration:none" href="${b}?aba=precos&cat=${esc(c.id)}">novo preço</a>` : ""}</td></tr>`; }).join("")
      || `<tr><td colspan="7"><div class="oc-vazio">Nenhum serviço com preço nesta obra ainda.</div></td></tr>`}
  </tbody></table></div>`;
}

// ---------------------------------------------------------------- Empreiteiros da obra (o cadastro em si é único: /obras/medicao-empreiteiros)
const docTxt = e => e.doc ? ([11, 14].includes(e.doc.length) ? esc(doc(e.doc)) : `${esc(e.doc)} <span class="oc-tag v">incompleto</span>`) : `<span class="oc-tag v">sem CPF/CNPJ</span>`;
/** WhatsApp e e-mail do cadastro (para onde vai o boletim assinado); falta = etiqueta amarela. */
const contato = e => `<div style="font-size:12.5px;line-height:1.6;white-space:nowrap">${e.telefone ? "📱 " + esc(fone(e.telefone)) : `<span class="oc-tag v">sem WhatsApp</span>`}<br>${e.email ? "✉ " + esc(e.email) : `<span class="oc-tag v">sem e-mail</span>`}</div>`;
const chipAtivo = e => D.ativo(e) ? `<span class="md-st aprovada">ativo</span>` : `<span class="md-st rep" title="${esc(`inativo desde ${quandoBR(e.inativo.em)} por ${e.inativo.por}${e.inativo.motivo ? " — " + e.inativo.motivo : ""}`)}">inativo</span>`;
/** A CONFERÊNCIA DO MÊS: cada empreiteiro ativo e habilitado nesta obra já tem boletim (com algo lançado) no mês de
 *  referência? Para o engenheiro saber se mediu todo mundo. Um quadro por mês; o seletor troca. */
function conferenciaMes(R, ativos) {
  const b = base(R.O.obra), hoje = new Date(), atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const meses = [...new Set([atual, ...R.O.boletins.map(B => B.mes)])].filter(Boolean).sort().reverse();
  const temBol = (e, m) => R.O.boletins.filter(B => B.emp === e.id && B.mes === m && (B.itens.length || B.extras.length));
  const primeiro = e => R.O.boletins.filter(B => B.emp === e.id && (B.itens.length || B.extras.length)).map(B => B.mes).sort()[0] || "";
  // 16/11: o mês atual usa o cadastro de hoje (ativos e habilitados aqui); os meses passados, quem ESTAVA ativo e habilitado naquele mês
  // (D.habilitadoNoMes) — e quem teve boletim no mês sempre entra, mesmo que hoje não esteja mais aqui
  const quem = m => m === atual ? ativos : R.E.lista.filter(e => D.habilitadoNoMes(e, R.O.obra, m, primeiro(e)) || temBol(e, m).length);
  const quadro = m => {
    const ls = quem(m).map(e => ({ e, bs: temBol(e, m) }));
    const feitos = ls.filter(x => x.bs.length).length, faltam = ls.length - feitos;
    return `<div class="mcConfM" data-mes="${m}"${m === atual ? "" : " hidden"}>
      <p style="margin:4px 0 8px;font-size:13.5px">${!ls.length ? (m === atual ? "Ninguém ativo e habilitado nesta obra." : `Ninguém estava ativo e habilitado nesta obra em ${mesLongo(m)}.`) : faltam ? `<b class="nao" style="color:#a8321f">Faltam ${faltam} de ${ls.length}</b> empreiteiros ${m === atual ? "ativos" : "da época"} sem medição em ${mesLongo(m)}.` : `<b style="color:#1f6b3a">Todos os ${ls.length} empreiteiros ${m === atual ? "ativos" : "da época"} têm medição em ${mesLongo(m)}.</b>`}</p>
      <table class="mc-conf">${ls.sort((x, y) => (x.bs.length > 0) - (y.bs.length > 0) || x.e.nome.localeCompare(y.e.nome, "pt-BR")).map(({ e, bs }) => `<tr><td><b>${esc(e.nome)}</b><br><small style="color:var(--mut)">${esc(e.funcao || "—")}</small></td>
        ${bs.length ? `<td class="ok">✔ medido</td><td>${bs.map(B => { const s = D.somaBoletim(B.itens, B.extras); return `<a href="${b}/boletim/${encodeURIComponent(B.id)}">nº ${B.numero}</a> · ${esc(B.status)} · ${brl(s.normal + s.extra)}`; }).join("<br>")}</td>`
          : `<td class="nao">✖ sem medição</td><td><a href="${b}/lancar?emp=${encodeURIComponent(e.id)}">lançar medição</a></td>`}</tr>`).join("")}</table></div>`;
  };
  return `<dialog class="mc-dlg lg" id="mcDlgConf"><p class="rot" style="font-size:15px">Conferir medições do mês</p>
    <label style="font-size:12.5px;color:var(--mut)">Mês de referência <select class="mc-i" style="width:auto" onchange="document.querySelectorAll('.mcConfM').forEach(function(d){ d.hidden=d.getAttribute('data-mes')!==this.value; }, this)">
      ${meses.map(m => `<option value="${m}"${m === atual ? " selected" : ""}>${mesLongo(m)}</option>`).join("")}</select></label>
    <p style="font-size:12px;color:var(--mut);margin:6px 0 0">Mês atual: os empreiteiros <b>ativos</b> e <b>habilitados nesta obra</b> hoje. Meses passados: quem <b>estava</b> ativo e habilitado aqui
      naquele mês (pelo histórico do cadastro — quem foi cadastrado depois não entra) e quem teve boletim no mês. Conta como medido quem tem boletim do mês com algum serviço ou extra lançado, em qualquer situação.</p>
    ${meses.map(quadro).join("")}
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>`;
}
function abaEmpreiteiros(R, user) {
  const b = base(R.O.obra), obra = R.O.obra, ger = D.podeGerir(user), ord = (a, c) => a.nome.localeCompare(c.nome, "pt-BR");
  const aqui = R.E.lista.filter(e => (e.obras || []).includes(obra)).sort(ord), fora = R.E.lista.filter(e => !(e.obras || []).includes(obra) && D.ativo(e)).sort(ord);
  const semHab = Object.keys(R.porEmp).filter(id => !aqui.some(e => e.id === id)).map(id => R.emp[id]).filter(Boolean);   // têm medição aqui, mas não estão mais habilitados
  const botao = (e, entra) => D.obrasQueHabilita(user).includes(obra) ? `<form method="POST" action="${b}/equipe" style="display:inline"><input type="hidden" name="e" value="${esc(e.id)}"><input type="hidden" name="entra" value="${entra ? "1" : ""}"><button class="mc-mini">${entra ? "habilitar nesta obra" : "tirar desta obra"}</button></form>` : "";
  const linha = (e, entra) => `<tr data-sit="${D.ativo(e) ? "ativo" : "inativo"}"${D.ativo(e) ? "" : ` style="color:#8a8a92"`}><td><b>${esc(e.nome)}</b><br><small style="color:var(--mut)">${esc(e.funcao || "—")}</small></td><td class="cod">${docTxt(e)}</td><td>${contato(e)}</td><td>${chipAtivo(e)}</td>
    <td class="r" style="white-space:nowrap">${botao(e, entra)}</td></tr>`;
  const cab = `<thead><tr><th>Empreiteiro</th><th>CPF / CNPJ</th><th>WhatsApp e e-mail</th><th>Situação</th><th></th></tr></thead>`;
  const ativosAqui = aqui.filter(D.ativo).length;
  return `<div class="oc-barra"><a class="oc-btn p" href="/obras/medicao-empreiteiros?obra=${esc(obra)}">Abrir o cadastro de empreiteiros</a>
    <button type="button" class="oc-btn" onclick="document.getElementById('mcDlgConf').showModal()">✔ Conferir medições do mês</button>
    <select id="mcSitE" onchange="mcSitE()" class="mc-i" style="width:auto"><option value="ativo">Só ativos</option><option value="inativo">Só inativos</option><option value="">Ativos e inativos</option></select>${btnExp}</div>
  ${conferenciaMes(R, aqui.filter(D.ativo))}
  <script>function mcSitE(){ var s=document.getElementById('mcSitE').value; document.querySelectorAll('tr[data-sit]').forEach(function(tr){ tr.hidden=!!s&&tr.getAttribute('data-sit')!==s; }); } document.addEventListener('DOMContentLoaded', mcSitE);</script>
  <div class="oc-nota xp">O <b>cadastro de empreiteiros é um só</b> para todas as obras (botão acima): lá cada um tem as obras em que está <b>habilitado</b> e a
    situação (<b>ativo</b> ou inativo). Na hora de lançar medição nesta obra só aparece quem está ativo e habilitado aqui. Inativar ou tirar da obra não apaga nada:
    o histórico de medições continua.</div>
  <div class="oc-sec">Habilitados nesta obra (${ativosAqui} ativo${ativosAqui === 1 ? "" : "s"}${aqui.length > ativosAqui ? `, ${aqui.length - ativosAqui} inativo(s)` : ""})</div>
  ${aqui.length ? `<div class="oc-rolar"><table class="oc-t">${cab}<tbody>${aqui.map(e => linha(e, false)).join("")}</tbody></table></div>` : `<div class="oc-vazio">Ninguém habilitado nesta obra ainda.</div>`}
  ${semHab.length ? `<div class="oc-sec">Com medição aqui, mas não habilitados (${semHab.length})</div><div class="oc-rolar"><table class="oc-t">${cab}<tbody>${semHab.map(e => linha(e, true)).join("")}</tbody></table></div>` : ""}
  <details class="oc-ins" style="margin-top:14px"><summary>Outros ativos do cadastro (${fora.length - semHab.filter(e => D.ativo(e)).length})</summary>
    <div class="oc-rolar"><table class="oc-t">${cab}<tbody>${fora.filter(e => !semHab.includes(e)).map(e => linha(e, true)).join("")}</tbody></table></div></details>`;
}

// ================================================================ COMO O SISTEMA ME VÊ (12/11): o perfil e as obras que chegam do painel
/** Mostra o que o painel manda sobre quem está logado (perfil, obras, nível, setores) e o que a Medição faz com isso. Serve para
 *  conferir os perfis sem mexer em nada: cada pessoa abre e vê o próprio acesso. */
export function paginaAcesso(user) {
  const campos = ["usuario", "nome", "nivel", "perfil", "perfilMedicao", ...D.CAMPOS_OBRAS, "obrasDocs", "setores"];
  const v = x => x == null ? `<i style="color:var(--mut)">(não veio)</i>` : esc(Array.isArray(x) ? (x.length ? x.join(", ") : "(lista vazia)") : String(x));
  const lista = D.obrasPermitidas(user), obras = D.obrasDaMedicao().map(x => x.o);
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="/obras/medicao"><span class="seta">←</span> Medições</a>
  <div class="oc-topo"><h1>🔑 Como o sistema me vê na medição</h1></div>
  <div class="oc-painel pg-limpa" style="border-top:1px solid #ece8dc;border-radius:16px;margin-top:16px;max-width:820px">
    <div class="mc-qt">O que o painel manda sobre você</div>
    <table class="oc-t"><tbody>${campos.map(k => `<tr><td style="width:180px"><code>${k}</code></td><td>${v(user && user[k])}</td></tr>`).join("")}</tbody></table>
    <div class="mc-qt" style="margin-top:16px">O que a Medição faz com isso</div>
    <table class="oc-t"><tbody>
      <tr><td style="width:180px">Perfil na medição</td><td><b>${esc(D.perfilMedicao(user))}</b>${user && (user.perfilMedicao || user.perfil) != null ? "" : ` <small style="color:var(--mut)">(o perfil sem perfil no cadastro: Diretoria pelo nível, o resto como Engenheiro)</small>`}</td></tr>
      <tr><td>Obras que vê</td><td>${lista ? (lista.length ? lista.map(id => esc((obras.find(o => o.id === id) || { nome: id }).nome)).join(", ") : `<b style="color:#a8321f">nenhuma</b>`) : `<b>todas</b>${D.perfilMedicao(user) === "Engenheiro" ? ` <small style="color:#a8321f">(a usuário sem obras marcadas — o Engenheiro ainda vê todas)</small>` : ""}`}</td></tr>
      <tr><td>Painel do RH</td><td>${D.podeRH(user) ? "sim" : "não"}</td></tr>
      <tr><td>Monta a estrutura da obra (serviços, pavimentos, locais, grupos)</td><td>sim</td></tr>
      <tr><td>Mexe no catálogo, nos preços, nas quantidades e tira serviço do local</td><td>${D.podeGerir(user) ? "sim" : "não (só vê)"}</td></tr>
      <tr><td>Habilita empreiteiro em</td><td>${D.obrasQueHabilita(user).map(id => esc((obras.find(o => o.id === id) || { nome: id }).nome)).join(", ") || "nenhuma obra"}</td></tr>
      <tr><td>Aprova boletim</td><td>${!D.ETAPA_DIRETORIA ? (D.papel(user).engenharia ? "sim (Gerente: aprovação final)" : D.papel(user).diretoria ? "sim (Diretoria)" : "não") : D.papel(user).diretoria ? "sim (Diretoria: aprovação final)" : D.papel(user).engenharia ? "sim (1ª aprovação)" : "não"}</td></tr></tbody></table>
    <div class="oc-nota" style="margin-top:12px">O perfil e as obras vêm de Usuários &amp; Acessos (tela de Administração › Usuários). A medição procura as obras nos campos
      <code>${D.CAMPOS_OBRAS.join("</code>, <code>")}</code> (aceita o código ou o nome da obra). Se algo aqui não bater, confira o cadastro do usuário.</div></div>`;
  return shell({ title: "Como o sistema me vê · Medições", body, user });
}

// ================================================================ PAINEL DO RH (12/11): o MÊS de todas as obras juntas
/** Todos os boletins do mês de competência, o resumo por obra (empreiteiros e valores) e a conferência de quem teve ou não
 *  medição no mês. Não é por obra: junta todas as obras começadas na medição nova. Valores BRUTOS (o pagamento é com o RH). */
export function paginaRH(user, { mes = "" } = {}) {
  const soRH = !D.podeGerir(user);   // 12/11: o RH entra pelo card Administrativo / RH, sem o setor Obras — só lê: nada de "abrir", só o PDF
  const obras = D.obrasDaMedicao().filter(x => x.nova && D.podeObra(user, x.o.id)).map(x => { const O = D.lerObra(x.o.id); return O ? { o: x.o, O, R: D.calcular(O) } : null; }).filter(Boolean);
  // SÓ OS PRÓPRIOS: entram só os boletins dos empreiteiros marcados como funcionário próprio no cadastro
  const E = D.lerEmpreiteiros(), curto = n => n.replace(/\s*Residence\s*$/i, ""), daWE = new Set(E.lista.filter(D.ehProprio).map(e => e.id));
  const vale = B => daWE.has(B.emp) && (B.itens.length || B.extras.length);
  const meses = [...new Set(obras.flatMap(({ O }) => O.boletins.filter(vale).map(B => B.mes)))].sort().reverse();
  const m = meses.includes(mes) ? mes : meses[0] || new Date().toISOString().slice(0, 7);
  const nomeE = id => (E.lista.find(e => e.id === id) || {}).nome || "?";
  const aprov = B => B.status === D.ESTADOS.ok;
  const val = B => { const s = D.somaBoletim(B.itens, B.extras); return { n: s.normal, x: s.extra, t: s.normal + s.extra }; };
  const porObra = obras.map(({ o, O }) => ({ o, bs: O.boletins.filter(B => B.mes === m && vale(B)).sort((a, c) => nomeE(a.emp).localeCompare(nomeE(c.emp), "pt-BR")) }));
  const todos = porObra.flatMap(x => x.bs.map(B => ({ ...x, B, v: val(B) })));
  const soma = l => l.reduce((a, x) => a + x.v.t, 0), tAprov = soma(todos.filter(x => aprov(x.B))), tPend = soma(todos.filter(x => !aprov(x.B)));
  // 18/11: aprovado não é o fim — falta a ASSINATURA do empreiteiro (situacaoAssinatura); o RH vê em cada boletim e no total
  const assRH = B => { const s = situacaoAssinatura(B);
    return s === "falta" ? `<br><span class="oc-tag v" style="margin-top:3px;display:inline-block" title="Aprovado, mas o empreiteiro ainda não assinou o boletim">✍️ falta assinatura</span>`
      : s === "ok" ? `<br><small style="color:#1f6b3a;font-weight:700">✔ assinado</small>` : ""; };
  const nFaltaAss = todos.filter(x => situacaoAssinatura(x.B) === "falta").length;
  const empsMes = new Set(todos.map(x => x.B.emp));
  // a conferência: cada empreiteiro ATIVO, as obras em que está habilitado e onde teve medição no mês
  // 16/11: o mês atual usa o cadastro de hoje; os meses passados, as obras em que cada um ESTAVA ativo e habilitado naquele mês
  // (D.habilitadoNoMes, pela linha do tempo do cadastro) — quem foi cadastrado depois não aparece; quem teve boletim no mês sempre entra
  const hj = new Date(), atual = `${hj.getFullYear()}-${String(hj.getMonth() + 1).padStart(2, "0")}`, doMes = m === atual;
  const primeiro = (e, O) => O.boletins.filter(B => B.emp === e.id && (B.itens.length || B.extras.length)).map(B => B.mes).sort()[0] || "";
  const habNoMes = e => doMes ? (D.ativo(e) ? (e.obras || []).filter(ob => obras.some(x => x.o.id === ob)) : []) : obras.filter(x => D.habilitadoNoMes(e, x.o.id, m, primeiro(e, x.O))).map(x => x.o.id);
  const conf = E.lista.filter(D.ehProprio).map(e => { const hab = habNoMes(e), com = todos.filter(x => x.B.emp === e.id);
    return { e, hab, com, tot: com.reduce((a, x) => a + x.v.t, 0), falta: hab.filter(ob => !com.some(x => x.o.id === ob)) }; })
    .filter(c => c.hab.length || c.com.length).sort((a, c) => a.e.nome.localeCompare(c.e.nome, "pt-BR"));
  const ativos = conf.map(c => c.e);
  const semNada = conf.filter(c => !c.com.length).length;
  const nomeObra = id => curto((obras.find(x => x.o.id === id) || { o: { nome: id } }).o.nome);
  const linkB = (o, B) => `/obras/medicao/${encodeURIComponent(o.id)}/boletim/${encodeURIComponent(B.id)}`;
  const tabObra = ({ o, bs }) => { const l = bs.map(B => ({ B, v: val(B) })), st = l.reduce((a, x) => a + x.v.t, 0);
    return `<div class="mc-quadro mc-rhob"><div class="mc-qt" style="display:flex;gap:8px;align-items:baseline">${esc(curto(o.nome))}<small>${l.length} boletim(ns)</small><b style="margin-left:auto;font-size:14px;letter-spacing:0;color:var(--escuro)">${brl(st)}</b></div>
      ${l.length ? `<div class="oc-rolar"><table class="oc-t mc-rht"><colgroup><col style="width:31%"><col style="width:8%"><col style="width:15%"><col style="width:12%"><col style="width:10%"><col style="width:13%"><col style="width:11%"></colgroup><thead><tr><th>Empreiteiro</th><th>Boletim</th><th>Situação</th><th class="r">Medição</th><th class="r">Extra</th><th class="r">Total bruto</th><th class="noprint"></th></tr></thead><tbody>
        ${l.map(({ B, v }) => `<tr><td><b>${esc(nomeE(B.emp))}</b></td><td>nº ${B.numero}</td><td>${chipBol(B)}${assRH(B)}</td><td class="r">${brl(v.n)}</td><td class="r">${v.x ? brl(v.x) : "—"}</td><td class="r"><b>${brl(v.t)}</b></td>
          <td class="r noprint" style="white-space:nowrap">${soRH ? "" : `<a class="mc-mini" style="text-decoration:none" href="${linkB(o, B)}">abrir</a>`}${aprov(B) ? ` <a class="mc-mini" style="text-decoration:none" href="${linkB(o, B)}/pdf?visual=1">PDF</a>` : ""}</td></tr>`).join("")}
        <tr class="tot"><td colspan="3" class="r">Total da obra</td><td class="r">${brl(l.reduce((a, x) => a + x.v.n, 0))}</td><td class="r">${brl(l.reduce((a, x) => a + x.v.x, 0))}</td><td class="r">${brl(st)}</td><td class="noprint"></td></tr></tbody></table></div>`
        : `<div class="oc-vazio" style="margin:0">Nenhum boletim nesta obra em ${mesLongo(m)}.</div>`}</div>`; };
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta noprint" href="${soRH ? "/adm" : "/obras/medicao"}"><span class="seta">←</span> ${soRH ? "Administrativo / RH" : "Medições"}</a>
  <div class="oc-topo"><h1>🧾 Painel do RH · medições do mês</h1><div class="tot"><small>Total bruto de ${mesLongo(m)}</small><b>${brl(tAprov + tPend)}</b></div></div>
  <div class="oc-painel pg-limpa" style="border-top:1px solid #ece8dc;border-radius:16px;margin-top:16px">
    <form method="GET" class="oc-barra noprint" style="align-items:end"><div>${lab("Mês de competência")}<select name="mes" class="mc-i" style="width:auto" onchange="this.form.submit()">${(meses.length ? meses : [m]).map(x => `<option value="${x}"${x === m ? " selected" : ""}>${mesLongo(x)}</option>`).join("")}</select></div>
      <button type="button" class="oc-btn" onclick="window.print()">🖨 Imprimir</button>${btnExp}</form>
    <div class="oc-nota xp">Só os empreiteiros <b>funcionários próprios</b> (marcados no cadastro); os terceiros não entram aqui.
      O mês de <b>todas as obras</b> juntas, para o RH: os boletins de medição de cada empreiteiro (um por obra), com os valores <b>brutos</b>,
      e a conferência de quem teve ou não medição no mês. Conta para pagamento o boletim <b>aprovado</b>; os outros aparecem com a situação, para saber o que
      ainda falta aprovar. "Abrir" mostra o boletim; "PDF" é a versão aprovada.</div>
    <div class="oc-kpis mc-kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="oc-k escuro"><span>Aprovado (para pagar)</span><b>${brl(tAprov)}</b><em>${todos.filter(x => aprov(x.B)).length} boletim(ns)${nFaltaAss ? `<span style="display:block;margin-top:3px;color:#f3c969;font-weight:700;font-size:12px;line-height:1.3;text-transform:none;letter-spacing:0">✍️ ${nFaltaAss} sem assinatura do empreiteiro</span>` : ""}</em></div>
      <div class="oc-k${tPend ? " alerta" : ""}"><span>Ainda não aprovado</span><b>${brl(tPend)}</b><em>${todos.filter(x => !aprov(x.B)).length} boletim(ns) em aberto ou na aprovação</em></div>
      <div class="oc-k"><span>Empreiteiros com medição</span><b>${empsMes.size}</b><em>de ${ativos.length} ${doMes ? "ativos nas obras" : "nas obras naquele mês"}</em></div>
      <div class="oc-k${semNada ? " alerta" : ""}"><span>Sem medição no mês</span><b>${semNada}</b><em>empreiteiro(s) ativo(s) sem boletim</em></div></div>
    <div class="oc-sec">Resumo por obra · ${mesLongo(m)}</div>
    <div class="mc-rhobs">${porObra.filter(x => x.bs.length).map(tabObra).join("") || `<div class="oc-vazio">Nenhum boletim em ${mesLongo(m)}.</div>`}</div>
    ${porObra.some(x => !x.bs.length) ? `<div style="font-size:12.5px;color:#4a4a52;margin:8px 0 0">Sem boletim em ${mesLongo(m)}: <b>${porObra.filter(x => !x.bs.length).map(x => esc(curto(x.o.nome))).join(", ")}</b></div>` : ""}
    <div class="mc-quadro" style="margin-top:12px"><div class="mc-qt" style="display:flex;gap:8px;align-items:baseline">Total geral de ${mesLongo(m)}<b style="margin-left:auto;font-size:15px;letter-spacing:0;color:var(--escuro)">${brl(tAprov + tPend)}</b></div>
      <div style="font-size:12.5px;color:#4a4a52">Aprovado ${brl(tAprov)} · ainda não aprovado ${brl(tPend)} · ${todos.length} boletim(ns) em ${porObra.filter(x => x.bs.length).length} obra(s)</div></div>
    <div class="oc-sec" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">Conferência: quem teve medição em ${mesLongo(m)}
      <label class="noprint" style="font-size:12.5px;text-transform:none;letter-spacing:0;font-weight:600;color:#4a4a52;display:flex;gap:5px;align-items:center"><input type="checkbox" id="mcSoSem" onchange="mcRhFiltra()"> só quem está sem medição</label></div>
    <div class="oc-rolar"><table class="oc-t" id="mcRhConf"><thead><tr><th>Empreiteiro</th><th>Função</th><th>Habilitado nas obras</th><th>Medição no mês</th><th class="r">Total bruto no mês</th></tr></thead><tbody>
      ${conf.map(c => `<tr data-sem="${c.com.length ? 0 : 1}"><td><b>${esc(c.e.nome)}</b></td><td>${esc(c.e.funcao || "—")}</td><td style="font-size:12.5px">${c.hab.map(nomeObra).map(esc).join(", ")}</td>
        <td>${c.com.length ? `<span class="mc-rhok">✔ ${c.com.map(x => esc(nomeObra(x.o.id)) + ` <small>(nº ${x.B.numero}${aprov(x.B) ? "" : ", " + esc(x.B.status)})</small>`).join(" · ")}</span>${c.falta.length ? `<br><small style="color:var(--mut)">sem medição em: ${c.falta.map(nomeObra).map(esc).join(", ")}</small>` : ""}`
          : `<span class="mc-rhno">✖ sem medição em nenhuma obra</span>`}</td><td class="r">${c.tot ? `<b>${brl(c.tot)}</b>` : "—"}</td></tr>`).join("") || `<tr><td colspan="5"><div class="oc-vazio">${doMes ? "Nenhum empreiteiro ativo nas obras." : "Nenhum empreiteiro estava nas obras naquele mês."}</div></td></tr>`}
    </tbody></table></div></div>
  <script>function mcRhFiltra(){ var s=document.getElementById('mcSoSem').checked; document.querySelectorAll('#mcRhConf tbody tr[data-sem]').forEach(function(tr){ tr.hidden=s&&tr.getAttribute('data-sem')!=='1'; }); }</script>`;
  return shell({ title: "Painel do RH · " + mesLongo(m), body, user });
}

// ================================================================ CADASTRO GERAL DE SERVIÇOS (10/11): todos os serviços × o preço em cada obra
export function paginaServicos(user, { m = "", e = "", obra = "" } = {}) {
  const C = D.lerCatalogo(), ger = D.podeGerir(user), hoje = new Date().toISOString().slice(0, 10);
  const obras = D.obrasDaMedicao().filter(x => x.nova && D.podeObra(user, x.o.id)).map(x => ({ o: x.o, O: D.lerObra(x.o.id) })).filter(x => x.O);
  const curto = n => n.replace(/\s*Residence\s*$/i, "");
  const usos = new Map(obras.map(({ o, O }) => { const u = {}; for (const it of O.itens) if (!it.removido) u[it.cat] = (u[it.cat] || 0) + 1; return [o.id, u]; }));
  const lista = C.servicos.filter(c => !c.removido).sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
  const tipos = [...new Set(lista.map(c => c.tipo))].sort((a, c) => a.localeCompare(c, "pt-BR"));
  const campos = (c = {}) => `<div class="mc-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) 90px;margin:0 0 8px"><div>${lab("Tipo")}<input name="tipo" value="${esc(c.tipo || "")}" class="mc-i" required list="mcTiposS" placeholder="Reboco interno"></div>
      <div>${lab("Serviço")}<input name="servico" value="${esc(c.servico || "")}" class="mc-i" required placeholder="Reboco"></div><div>${lab("Unidade")}<input name="unidade" value="${esc(c.unidade || "")}" class="mc-i" required placeholder="m2"></div>
      <div style="grid-column:1/-1">${lab("Critério de medição")}<input name="criterio" value="${esc(c.criterio || "")}" class="mc-i" placeholder="Como se mede (ex.: m² de parede pronta, descontando vãos maiores que 2 m²)"></div></div>`;
  const preco = (c, o, O) => { const pu = D.precoNaData(O, c.id, hoje), n = (usos.get(o.id) || {})[c.id] || 0, h = O.precos.filter(p => p.cat === c.id).length;
    const t = pu == null ? (n ? `<span class="oc-tag v">sem preço</span>` : `<span style="color:#c4c0b4">—</span>`) : `<b>${brl(pu)}</b>`;
    return `<td class="r" title="${esc(curto(o.nome))}: ${pu == null ? "sem preço" : brl(pu)}${h > 1 ? ` (${h} preços na história)` : ""} · ${n} item(ns) na obra">${ger ? `<a href="${base(o.id)}?aba=precos&cat=${esc(c.id)}" style="color:inherit;text-decoration:none">${t}</a>` : t}${n ? `<small class="mc-sn">${n} it.</small>` : ""}</td>`; };
  const linha = c => { const emAlguma = obras.some(({ o }) => (usos.get(o.id) || {})[c.id]);
    return `<tr data-busca="${esc((c.tipo + " " + c.servico + " " + (c.criterio || "")).toLowerCase())}" data-tipo="${esc(c.tipo)}" data-usado="${emAlguma ? 1 : 0}">
      <td>${esc(c.tipo)}</td><td><b>${esc(c.servico)}</b></td><td>${esc(c.unidade)}</td><td style="max-width:260px;font-size:12.5px">${c.criterio ? esc(c.criterio) : `<i style="color:var(--mut)">sem critério</i>`}</td>
      ${obras.map(({ o, O }) => preco(c, o, O)).join("")}
      <td class="r">${ger ? `<button type="button" class="mc-mini" onclick="mcEditaServ(this)">✏️ editar</button><template>${campos(c)}<input type="hidden" name="id" value="${esc(c.id)}"></template>` : ""}</td></tr>`; };
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="${obra ? base(obra) + "?aba=precos" : "/obras/medicao"}"><span class="seta">←</span> ${obra ? "Serviços e preços da obra" : "Medições"}</a>
  <div class="oc-topo"><h1>📋 Serviços · cadastro geral</h1><div class="tot"><small>Serviços</small><b>${lista.length}</b></div></div>
  ${aviso(m, e)}
  <div class="oc-painel pg-limpa" style="border-top:1px solid #ece8dc;border-radius:16px;margin-top:16px">
    <div class="oc-barra">${ger ? `<button type="button" class="oc-btn p mc-novo" onclick="document.getElementById('mcDlgServN').showModal()">Serviço novo</button>` : ""}
      <input type="search" id="mcBs" placeholder="Buscar tipo, serviço ou critério…" oninput="mcFs()">
      <select id="mcTs" onchange="mcFs()" class="mc-i" style="width:auto"><option value="">Todos os tipos</option>${tipos.map(x => `<option>${esc(x)}</option>`).join("")}</select>
      <select id="mcUs" onchange="mcFs()" class="mc-i" style="width:auto"><option value="">Usados e não usados</option><option value="1">Só os usados em alguma obra</option><option value="0">Só os não usados</option></select>
      <b id="mcNs" style="font-size:12.5px;color:var(--mut)"></b>${btnExp}</div>
    <div class="oc-nota xp">Um cadastro só de serviços para todas as obras: <b>tipo, serviço, unidade e critério de medição</b>. Cada coluna de obra mostra o
      <b>preço de hoje</b> naquela obra (o número pequeno é quantos itens da obra usam o serviço); clicar no preço abre os preços da obra para lançar um novo.
      "Sem preço" = a obra usa o serviço mas ainda não tem preço. Corrigir um serviço não muda as medições já feitas e guarda o que era.</div>
    <div class="oc-rolar" style="margin-top:12px"><table class="oc-t mc-tserv" id="mcTs2"><thead><tr><th>Tipo</th><th>Serviço</th><th>Un.</th><th>Critério de medição</th>${obras.map(({ o }) => `<th class="r">${esc(curto(o.nome))}</th>`).join("")}<th></th></tr></thead>
      <tbody>${lista.map(linha).join("")}</tbody></table></div></div>
  <datalist id="mcTiposS">${tipos.map(x => `<option value="${esc(x)}">`).join("")}</datalist>
  ${ger ? `<dialog class="mc-dlg lg" id="mcDlgServN"><form method="POST" action="/obras/medicao-servicos/novo" style="display:block;margin:0"><input type="hidden" name="obra" value="${esc(obra)}"><p class="rot" style="font-size:15px">Serviço novo</p>${campos()}
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Cadastrar</button></div></form></dialog>
    <dialog class="mc-dlg lg" id="mcDlgServE"><form method="POST" action="/obras/medicao-servicos/editar" style="display:block;margin:0"><input type="hidden" name="obra" value="${esc(obra)}"><p class="rot" style="font-size:15px">Corrigir serviço</p><div class="corpo"></div>
      <div style="font-size:12px;color:var(--mut);margin:0 0 6px">As medições já feitas não mudam; o que era fica guardado.</div>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Salvar</button></div></form></dialog>` : ""}
  <script>function mcFs(){ var q=String(document.getElementById('mcBs').value||'').toLowerCase().trim(), t=document.getElementById('mcTs').value, u=document.getElementById('mcUs').value, n=0;
    document.querySelectorAll('#mcTs2 tbody tr').forEach(function(tr){ var ok=(!q||tr.getAttribute('data-busca').indexOf(q)>=0)&&(!t||tr.getAttribute('data-tipo')===t)&&(!u||tr.getAttribute('data-usado')===u); tr.hidden=!ok; if(ok) n++; });
    document.getElementById('mcNs').textContent=n+' serviço'+(n===1?'':'s'); } mcFs();
  function mcEditaServ(b){ var d=document.getElementById('mcDlgServE'), c=d.querySelector('.corpo'); c.innerHTML=''; c.appendChild(b.parentNode.querySelector('template').content.cloneNode(true)); d.showModal(); }</script>`;
  return shell({ title: "Serviços · cadastro geral", body, user });
}

// ================================================================ CADASTRO ÚNICO DE EMPREITEIROS (todas as obras)
export function paginaEmpreiteiros(user, { m = "", e = "", obra = "" } = {}) {
  const E = D.lerEmpreiteiros(), obras = D.obrasDaMedicao().map(x => x.o), ger = D.podeGerir(user), ord = (a, c) => a.nome.localeCompare(c.nome, "pt-BR");
  const curto = id => (obras.find(o => o.id === id) || { nome: id }).nome.replace(/\s*Residence\s*$/i, "");
  const habil = D.obrasQueHabilita(user);   // perfis (12/11): o Engenheiro só marca/desmarca as obras dele; as outras ficam desativadas
  const caixas = (marcadas = []) => `<div class="oc-chks">${obras.map(o => `<label${habil.includes(o.id) ? "" : ` title="Só a engenharia ou quem é desta obra habilita aqui" style="opacity:.55"`}><input type="checkbox" name="obra" value="${esc(o.id)}"${marcadas.includes(o.id) ? " checked" : ""}${habil.includes(o.id) ? "" : " disabled"}>${esc(curto(o.id))}</label>`).join("")}</div>`;
  const campos = (x = {}) => `<div class="mc-2" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);margin:0 0 8px"><div>${lab("Nome completo")}<input name="nome" value="${esc(x.nome || "")}" class="mc-i" required maxlength="120"></div>
    <div>${lab("CPF ou CNPJ")}<input name="doc" value="${esc(doc(x.doc || ""))}" class="mc-i" required inputmode="numeric" maxlength="20"></div><div>${lab("Função")}<input name="funcao" value="${esc(x.funcao || "")}" class="mc-i" placeholder="PEDREIRO" maxlength="60"></div>
    <div>${lab("WhatsApp")}<input name="telefone" value="${esc(fone(x.telefone))}" class="mc-i" inputmode="tel" placeholder="47 99999-9999" maxlength="20"></div><div style="grid-column:span 2">${lab("E-mail")}<input name="email" type="email" value="${esc(x.email || "")}" class="mc-i" placeholder="nome@exemplo.com" maxlength="120"></div></div>
    <input type="hidden" name="proprioCampo" value="1"><label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:0 0 8px"><input type="checkbox" name="proprio" value="1"${D.ehProprio(x.id ? x : null) ? " checked" : ""} style="margin-top:2px">
      <span><b>Funcionário próprio</b><br><small style="color:var(--mut)">Marcado: entra no Painel do RH. Desmarcado: terceiro (prestador de serviço).</small></span></label>`;
  const hist = x => (x.alteracoes || []).map(a => `${quandoBR(a.em)} · ${a.por}: ${a.antes.obras ? "obras eram " + (a.antes.obras.map(curto).join(", ") || "nenhuma") : a.antes.ativo != null ? (a.antes.ativo ? "estava ativo" : "estava inativo") + (a.motivo ? " (" + a.motivo + ")" : "") : `era ${a.antes.nome} / ${doc(a.antes.doc)} / ${a.antes.funcao || "—"}`}`).reverse();
  const lista = E.lista.slice().sort((a, c) => (D.ativo(c) - D.ativo(a)) || ord(a, c));
  const linha = x => { const h = hist(x);
    return `<tr data-busca="${esc((x.nome + " " + x.doc + " " + (x.funcao || "") + " " + (x.telefone || "") + " " + (x.email || "")).toLowerCase())}" data-sit="${D.ativo(x) ? "ativo" : "inativo"}" data-obras="${esc((x.obras || []).join(" "))}"${D.ativo(x) ? "" : ` style="color:#8a8a92"`}>
      <td><b>${esc(x.nome)}</b> ${D.ehProprio(x) ? `<span class="oc-tag" title="Funcionário próprio">próprio</span>` : `<span class="oc-tag v" title="Terceiro (prestador de serviço)">terceiro</span>`}<br><small style="color:var(--mut)">${esc(x.funcao || "—")} · ${docTxt(x)}</small>${h.length ? `<details class="oc-ins"><summary>${h.length} alteração(ões)</summary>${h.map(t => `<div style="font-size:11.5px">${esc(t)}</div>`).join("")}</details>` : ""}</td>
      <td>${contato(x)}</td>
      <td>${chipAtivo(x)}${ger ? `<form method="POST" action="/obras/medicao-empreiteiros/ativo" style="margin:6px 0 0" ${D.ativo(x) ? `onsubmit="var t=prompt('Por que inativar ${esc(x.nome).replace(/'/g, "")}? (opcional)'); if(t===null) return false; this.motivo.value=t;"` : ""}>
        <input type="hidden" name="id" value="${esc(x.id)}"><input type="hidden" name="ativo" value="${D.ativo(x) ? "" : "1"}"><input type="hidden" name="motivo"><button class="mc-mini">${D.ativo(x) ? "inativar" : "reativar"}</button></form>` : ""}</td>
      <td><form method="POST" action="/obras/medicao-empreiteiros/obras" style="margin:0"><input type="hidden" name="id" value="${esc(x.id)}">${caixas(x.obras || [])}${habil.length ? `<button class="mc-mini" style="margin-top:4px">salvar obras</button>` : ""}</form></td>
      <td class="r"><button type="button" class="mc-mini" onclick="mcEditaEmp(this)">✏️ editar</button><template>
        <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 4px"><b style="font-size:15px">${esc(x.nome)}</b>${chipAtivo(x)}</div>
        <div style="font-size:12.5px;color:#4a4a52;margin:0 0 10px">${esc(x.funcao || "—")} · ${docTxt(x)} · ${D.ehProprio(x) ? "funcionário próprio" : "terceiro"} · habilitado em: <b>${(x.obras || []).map(curto).map(esc).join(", ") || "nenhuma obra"}</b></div>
        <input type="hidden" name="id" value="${esc(x.id)}">${campos(x)}
        ${h.length ? `<details class="oc-ins"><summary>${h.length} alteração(ões)</summary>${h.map(t => `<div style="font-size:11.5px">${esc(t)}</div>`).join("")}</details>` : ""}</template></td></tr>`; };
  const nAt = E.lista.filter(D.ativo).length;
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="${obra ? base(obra) + "?aba=empreiteiros" : "/obras/medicao"}"><span class="seta">←</span> ${obra ? "Empreiteiros da obra" : "Medições"}</a>
  <div class="oc-topo"><h1>👷 Empreiteiros · cadastro do grupo</h1><div class="tot"><small>Ativos</small><b>${nAt} de ${E.lista.length}</b></div></div>
  ${aviso(m, e)}
  <div class="oc-painel pg-limpa" style="border-top:1px solid #ece8dc;border-radius:16px;margin-top:16px">
    <div class="oc-barra">${ger ? `<button type="button" class="oc-btn p mc-novo" onclick="document.getElementById('mcDlgNovo').showModal()">Empreiteiro novo</button>` : ""}<input type="search" id="mcBe" placeholder="Buscar nome, CPF/CNPJ, função, WhatsApp ou e-mail…" oninput="mcFe()">
      <select id="mcSe" onchange="mcFe()"><option value="ativo">Só ativos</option><option value="inativo">Só inativos</option><option value="">Ativos e inativos</option></select>
      <select id="mcOe" onchange="mcFe()"><option value="">Todas as obras</option>${obras.map(o => `<option value="${esc(o.id)}"${o.id === obra ? " selected" : ""}>Habilitados em ${esc(curto(o.id))}</option>`).join("")}</select>
      <b id="mcNe" style="font-size:12.5px;color:var(--mut)"></b>${btnExp}</div>
    <div class="oc-nota xp">Um cadastro só para todas as obras: uma pessoa, um CPF/CNPJ. Em cada empreiteiro, marque as <b>obras em que ele está habilitado</b>
      para ser medido e salve. <b>Inativo</b> não aparece para lançar medição em nenhuma obra; <b>não habilitado</b> numa obra não aparece para lançar naquela obra.
      Nos dois casos o histórico de medições continua inteiro. O <b>WhatsApp e o e-mail</b> são para onde vai o boletim assinado: preencha em <b>✏️ editar</b>. Corrigir nome ou documento guarda o que era antes. Quem habilita, inativa e reativa: engenharia ou Diretoria.</div>
    <dialog class="mc-dlg lg" id="mcDlgNovo"><form method="POST" action="/obras/medicao-empreiteiros/salvar" style="display:block;margin:0"><p class="rot" style="font-size:15px">Empreiteiro novo</p>${campos()}
      ${lab("Habilitado nas obras")}${caixas(obra ? [obra] : [])}<div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Cadastrar</button></div></form></dialog>
    <dialog class="mc-dlg lg" id="mcDlgEdE"><form method="POST" action="/obras/medicao-empreiteiros/salvar" style="display:block;margin:0"><p class="rot" style="font-size:15px">Editar empreiteiro</p><div class="corpo"></div>
      <div style="font-size:12px;color:var(--mut);margin:6px 0">Corrigir nome ou documento guarda o que era antes.</div>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Salvar</button></div></form></dialog>
    <div class="oc-rolar" style="margin-top:12px"><table class="oc-t" id="mcTe"><thead><tr><th>Empreiteiro</th><th>WhatsApp e e-mail</th><th>Situação</th><th>Habilitado nas obras</th><th></th></tr></thead>
      <tbody>${lista.map(linha).join("")}</tbody></table></div></div>
  <script>function mcFe(){ var q=String(document.getElementById('mcBe').value||'').toLowerCase().trim(), s=document.getElementById('mcSe').value, o=document.getElementById('mcOe').value, n=0;
    document.querySelectorAll('#mcTe tbody tr').forEach(function(tr){ var ok=(!q||tr.getAttribute('data-busca').indexOf(q)>=0)&&(!s||tr.getAttribute('data-sit')===s)&&(!o||(' '+tr.getAttribute('data-obras')+' ').indexOf(' '+o+' ')>=0); tr.hidden=!ok; if(ok) n++; });
    document.getElementById('mcNe').textContent=n+' empreiteiro'+(n===1?'':'s'); } mcFe();
  function mcEditaEmp(b){ var d=document.getElementById('mcDlgEdE'), c=d.querySelector('.corpo'); c.innerHTML=''; c.appendChild(b.parentNode.querySelector('template').content.cloneNode(true)); d.showModal(); var i=c.querySelector('input[name=nome]'); if(i) i.focus(); }</script>`;
  return shell({ title: "Empreiteiros", body, user });
}

// ---------------------------------------------------------------- Histórico
function abaHistorico(R) {
  const h = R.O.historico.slice().reverse();
  const quem = [...new Set(h.map(x => x.por))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const cor = s => s.startsWith("+") ? "mc-hd-mais" : s.startsWith("−") ? "mc-hd-menos" : "";
  return `<div class="oc-barra"><input type="search" id="mcHb" placeholder="Buscar (serviço, local, boletim, empreiteiro…)" oninput="mcHf()" style="min-width:260px">
      <select id="mcHq" onchange="mcHf()" class="mc-i" style="width:auto"><option value="">Todas as pessoas</option>${quem.map(q => `<option>${esc(q)}</option>`).join("")}</select>
      <button type="button" class="mc-mini" onclick="mcHt(true)">abrir todos</button><button type="button" class="mc-mini" onclick="mcHt(false)">recolher todos</button><b id="mcHn" style="font-size:12.5px;color:var(--mut)"></b></div>
    <div class="oc-nota">Clique numa linha para ver <b>tudo o que mudou</b> (o que entrou <span class="mc-hd-mais">+</span>, o que saiu <span class="mc-hd-menos">−</span> e o que foi alterado, de → para).
      Os detalhes existem a partir de 04/11/2026; as linhas antigas só têm o resumo.</div>
    <div class="mc-hist" id="mcHl">${h.map(x => { const d = x.det || [];
      return `<details class="mc-hl" data-q="${esc(x.por)}" data-b="${esc((x.txt + " " + d.join(" ")).toLowerCase())}"${d.length ? "" : " data-sem"}>
        <summary><span class="mc-seta">▸</span><span class="q">${esc(dataBR(String(x.em).slice(0, 10)))} ${esc(String(x.em).slice(11, 16))}</span><span class="p">${esc(x.por)}</span><span class="t">${esc(x.txt)}</span>
          <small>${d.length ? `${d.length} detalhe${d.length === 1 ? "" : "s"}` : "sem detalhes"}</small></summary>
        <div class="in">${d.length ? `<ul>${d.map(s => `<li class="${cor(s)}">${esc(s)}</li>`).join("")}</ul>` : `<div style="color:var(--mut);font-size:12.5px">Registro de antes de 04/11/2026: só o resumo foi guardado.</div>`}</div></details>`; }).join("") || `<div class="oc-vazio">Nada no histórico ainda.</div>`}</div>
    <script>function mcHf(){ var q=String(document.getElementById('mcHb').value||'').toLowerCase().trim(), p=document.getElementById('mcHq').value, n=0;
      document.querySelectorAll('#mcHl details').forEach(function(d){ var ok=(!q||d.getAttribute('data-b').indexOf(q)>=0)&&(!p||d.getAttribute('data-q')===p); d.hidden=!ok; if(ok) n++; });
      document.getElementById('mcHn').textContent=n+' registro'+(n===1?'':'s'); }
    function mcHt(a){ document.querySelectorAll('#mcHl details:not([hidden])').forEach(function(d){ d.open=a; }); } mcHf();</script>`;
}

// ================================================================ a FOLHA DE MEDIÇÃO (a grade)
export function paginaLancar(user, obra, { pavs = [], locs = [], tipo = "", cat = "", erro = "", valores = {} } = {}) {
  const O = D.lerObra(obra); if (!O) return null;
  const R = D.calcular(O), b = base(obra), hoje = new Date().toISOString().slice(0, 10), v = k => esc(valores[k] ?? "");
  const doAlto = predio(R).flatMap(x => x.pavs), sel = doAlto.filter(p => pavs.includes(p.id));   // a grade mostra o prédio de pé
  const tipos = [...new Set(Object.values(R.I).map(x => x.tipo))].sort((a, c) => a.localeCompare(c, "pt-BR"));
  // LOCAIS (13/11): uma lista por "tipo" de pavimento — "Tipo 13" e "Tipo 14" (mesmo começo) juntam numa lista só, com os
  // locais dos dois; "Garagem 3" fica noutra. Marcar "Apto 02" na lista do Tipo = o Apto 02 de cada Tipo marcado. Nada marcado = todos.
  const chaveLista = p => prefixoTipo(p.nome) || "#" + p.id, escolhidos = new Set(locs);
  const listas = []; for (const p of sel) { const k = chaveLista(p); let L = listas.find(x => x.k === k); if (!L) listas.push(L = { k, pref: prefixoTipo(p.nome), pavs: [], nomes: [] });
    L.pavs.push(p); for (const l of R.locais.filter(l => l.pav === p.id)) if (!L.nomes.includes(l.nome)) L.nomes.push(l.nome); }
  for (const L of listas) L.marcados = L.nomes.filter(n => escolhidos.has(L.k + "::" + n));
  const localVale = idLocal => { const l = R.L[idLocal]; if (!l) return false; const p = sel.find(x => x.id === l.pav); if (!p) return false;
    const L = listas.find(x => x.k === chaveLista(p)); return !L.marcados.length || L.marcados.includes(l.nome); };
  const servOps = []; for (const x of Object.values(R.I)) if ((!tipo || x.tipo === tipo) && (!sel.length || localVale(x.local)) && !servOps.some(c => c.cat === x.cat)) servOps.push({ cat: x.cat, tipo: x.tipo, servico: x.servico, unidade: x.unidade });
  servOps.sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
  if (!servOps.some(c => c.cat === cat)) cat = "";
  const blocoServ = `${lab("Serviço")}<select name="cat" class="mc-i mc-busca" style="width:auto;min-width:300px"><option value=""></option>${servOps.map(c => `<option value="${esc(c.cat)}"${c.cat === cat ? " selected" : ""}>${tipo ? "" : esc(c.tipo) + " — "}${esc(c.servico)} (${esc(c.unidade)})</option>`).join("")}</select>`;
  const blocoLocais = !sel.length ? `<div style="font-size:12.5px;color:var(--mut);margin-bottom:10px">Marque os pavimentos: os locais deles aparecem aqui.</div>`
    : `<div class="mc-lls">${listas.map(L => `<div class="mc-ll"><div class="t">${L.pavs.length > 1 ? `${esc(L.pref)} <small>${L.pavs.length} pavimentos: ${esc(L.pavs.map(p => p.nome).join(", "))}</small>` : esc(L.pavs[0].nome)}
        <small>${L.marcados.length ? L.marcados.length + " de " + L.nomes.length + " marcado(s)" : "todos (" + L.nomes.length + ")"}</small></div>
        <div class="mc-pgl">${L.nomes.map(n => `<label><input type="checkbox" name="loc" value="${esc(L.k + "::" + n)}"${escolhidos.has(L.k + "::" + n) ? " checked" : ""}>${esc(n)}</label>`).join("") || `<small style="color:var(--mut)">sem locais</small>`}</div>
        <div class="mc-pgb"><button type="button" class="mc-mini" onclick="mcMarcaCx(this,true)">todos</button><button type="button" class="mc-mini" onclick="mcMarcaCx(this,false)">limpar</button></div></div>`).join("")}</div>
      <div style="font-size:11.5px;color:var(--mut);margin:6px 0 10px">Lista sem nenhum local marcado = todos os locais dela.</div>`;
  const filtro = `<form method="GET" action="${b}/lancar" class="mc-cart" id="mcFiltro" style="margin:0 0 12px" onchange="mcGradeMuda()" onsubmit="event.preventDefault();mcGradeBusca()">
    <div class="oc-sec" style="margin-top:0">1. O que vai medir</div>
    ${lab("Pavimentos")}<div class="mc-pgr">${predio(R).filter(x => x.pavs.length).map(({ g, pavs: ps }) => {
      const n = ps.filter(p => pavs.includes(p.id)).length, pref = {}; for (const p of ps) { const k = prefixoTipo(p.nome); if (k) (pref[k] ||= []).push(p.id); }
      return `<details class="mc-pg"${n ? " open" : ""}><summary><span class="mc-seta">▸</span><b>${g ? esc(g.nome) : "Sem grupo"}</b><small${n ? ` class="on"` : ""}>${n ? n + " de " + ps.length + " marcado(s)" : ps.length + " pavimento(s)"}</small></summary>
        <div class="mc-pgl">${ps.map(p => `<label><input type="checkbox" name="pav" value="${esc(p.id)}"${pavs.includes(p.id) ? " checked" : ""} data-g="${esc(prefixoTipo(p.nome) || "")}">${esc(p.nome)}</label>`).join("")}</div>
        <div class="mc-pgb">${Object.entries(pref).filter(([, ids]) => ids.length > 1).map(([k, ids]) => `<button type="button" class="mc-mini" data-pref="${esc(k)}" onclick="mcMarcaCx(this,true,this.getAttribute('data-pref'))">todos os "${esc(k)}" (${ids.length})</button>`).join("")}
          <button type="button" class="mc-mini" onclick="mcMarcaCx(this,true)">todos</button><button type="button" class="mc-mini" onclick="mcMarcaCx(this,false)">limpar</button></div></details>`; }).join("")}</div>
    ${lab("Locais")}<div id="mcLocBox">${blocoLocais}</div>
    <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div>${lab("Tipo de serviço")}<select name="tipo" class="mc-i mc-busca" style="width:auto;min-width:240px"><option value=""></option>${tipos.map(t => `<option${t === tipo ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      <div id="mcServBox">${blocoServ}</div><button type="button" class="oc-btn" id="mcLimpar" onclick="mcLimpaFiltros()">Limpar filtros</button></div>
    <div style="margin-top:6px"><span id="mcGradeEst" style="font-size:12px;color:var(--mut)">a grade se atualiza sozinha; o que já foi preenchido fica guardado ao trocar de pavimento ou de tipo</span></div></form>`;
  let grade = "";
  if (sel.length) {
    const cols = new Map();
    const its = Object.values(R.I).filter(x => (!tipo || x.tipo === tipo) && (!cat || x.cat === cat) && localVale(x.local));
    for (const x of its) if (!cols.has(x.cat)) cols.set(x.cat, { cat: x.cat, tipo: x.tipo, servico: x.servico, unidade: x.unidade, pu: x.pu });
    const cs = [...cols.values()].sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"));
    const porLC = {}; for (const x of its) porLC[x.local + "|" + x.cat] = x;
    if (!cs.length) grade = `<div class="oc-vazio">Nenhum serviço cadastrado nesses pavimentos${tipo ? " com esse tipo" : ""}. Cadastre na aba Estrutura.</div>`;
    else {
      const exb = x => { const l = R.L[x.local] || {}; return `<button type="button" class="mc-exb" data-item="${esc(x.id)}" data-rot="${esc(`${l.pavNome} › ${l.nome} · ${x.tipo} - ${x.servico}`)}" onclick="mcExAbre(this)" title="Medição extra neste serviço deste local">+ extra</button>`; };
      const cel = (x, k) => {
        if (!x) return `<td class="mc-c nada"></td>`;
        const a = Math.min(1, x.aprov + x.fila);
        if (a >= 0.9999) return `<td class="mc-c cheio" data-col="${k}"><div class="lin">✓ 100% ${exb(x)}</div></td>`;
        if (D.qtdPendente(R.O, x.id)) return `<td class="mc-c pend" data-col="${k}" title="A quantidade real deste serviço está aguardando aprovação do Gerente ou do Administrador (aba Estrutura). Até a decisão, ele não pode ser medido."><div class="lin">⏳ quantidade em aprovação<br><small>não pode ser medido agora</small> ${exb(x)}</div></td>`;
        const val = valores["d_" + x.id] ?? "";
        const lr = R.L[x.local] || {};
        return `<td class="mc-c" data-col="${k}" data-a="${a}" data-q="${x.qtd}" data-un="${esc(x.unidade)}" data-pu="${x.pu || 0}" data-pav="${esc(lr.pavNome || "")}" data-rot="${esc(`${lr.pavNome} › ${lr.nome} · ${x.tipo} - ${x.servico}`)}" title="${esc(x.servico)} · ${num(x.qtd, 2)} ${esc(x.unidade)} a ${brl(x.pu)} — aprovado ${pct(x.aprov)}${x.fila ? ", na fila " + pct(x.fila) : ""}">
          <div class="bar"><i style="width:${(x.aprov * 100).toFixed(1)}%"></i><i class="f" style="width:${(x.fila * 100).toFixed(1)}%"></i><i class="n" style="width:0"></i></div>
          <div class="lin"><div class="esq"><input name="d_${esc(x.id)}" value="${esc(val)}" inputmode="decimal" placeholder="+%" oninput="mcCalc()"><small class="qt tot">de ${num(x.qtd, 0, 2)} ${esc(x.unidade)}</small></div>
            <div class="dir"><small><span>${pct(a, a * 100 % 1 ? 1 : 0)}</span><i>→</i><b>${pct(a, a * 100 % 1 ? 1 : 0)}</b></small><small class="qt"><span>${num(x.qtd * a, 0, 2)}</span><i>→</i><b>${num(x.qtd * a, 0, 2)}</b></small></div><div class="pilha">${exb(x)}<label class="mc-ftb" title="Fotos deste serviço (vão para a linha dele no boletim)">${ICONE_CAM}<i></i><input type="file" name="f_${esc(x.id)}" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*" onchange="mcFotoConta(this)"></label></div></div></td>`;
      };
      // 13/11: cada TIPO de serviço com uma cor (a mesma em qualquer filtro: vem da ordem dos tipos da obra)
      const CORES_TIPO = ["#2f6f9f", "#b7791f", "#4f7d3a", "#8b3f6e", "#2c8c8c", "#6b5aa8", "#b0453a", "#7a7f2a", "#c0567f", "#3d5a80", "#8a5a2b", "#5f8f3a"];
      const corTipo = tp => CORES_TIPO[Math.max(0, tipos.indexOf(tp)) % CORES_TIPO.length];
      const ini = new Set(cs.map((c, k) => k).filter(k => k === 0 || cs[k].tipo !== cs[k - 1].tipo));
      const faixas = []; cs.forEach((c, k) => { const f = faixas[faixas.length - 1]; if (f && f.tipo === c.tipo) f.n++; else faixas.push({ tipo: c.tipo, n: 1 }); });
      const celT = (x, k) => ini.has(k) ? cel(x, k).replace('<td class="mc-c', '<td class="ini mc-c') : cel(x, k);
      grade = `<div class="mc-gmodo"><span class="mc-seg" title="Como escrever o que andou nos quadrados"><span>Medir em</span><button type="button" data-un="pct" onclick="mcUn('pct')">%</button><button type="button" data-un="qtd" onclick="mcUn('qtd')">Quantidade</button></span><button type="button" class="oc-btn" data-modo="foto" onclick="mcModo('foto')">📷 Adicionar foto</button><button type="button" class="oc-btn" data-modo="extra" onclick="mcModo('extra')">+ Extra</button><span class="dica" id="mcModoDica"></span></div>
      <div class="mc-g"><table><thead><tr><th class="loc" rowspan="2">Local</th>${faixas.map(f => `<th class="tg" colspan="${f.n}" style="--tc:${corTipo(f.tipo)}" title="${esc(f.tipo)}">${esc(f.tipo)}</th>`).join("")}</tr>
        <tr class="sv">${cs.map((c, k) => `<th class="${ini.has(k) ? "ini" : ""}" style="--tc:${corTipo(c.tipo)}" title="${esc(c.tipo)} - ${esc(c.servico)} · ${esc(c.unidade)} · ${c.pu == null ? "sem preço" : brl(c.pu)}"><b>${esc(c.servico)}</b><small>${esc(c.unidade)} · ${c.pu == null ? "sem preço" : brl(c.pu)}</small>
        <div class="ap"><input placeholder="%" data-ap="${k}" title="% para todos os locais da coluna (Enter aplica)" onkeydown="if(event.key==='Enter'){event.preventDefault();mcCol(${k},this.value);}"><button type="button" onclick="mcCol(${k},this.previousElementSibling.value)" title="Pôr este % em todos os locais da coluna">→</button><button type="button" onclick="mcCol(${k},'falta')" title="Completar até 100% em toda a coluna">100</button></div></th>`).join("")}</tr></thead><tbody>
        ${sel.map(p => { const ls = R.locais.filter(l => l.pav === p.id && localVale(l.id) && cs.some(c => porLC[l.id + "|" + c.cat])); if (!ls.length) return "";
          return `<tr class="pv"><td colspan="${cs.length + 1}"><span>${esc(p.nome)}</span></td></tr>` + ls.map(l => `<tr><td class="loc"><div class="ln"><span>${esc(l.nome)}</span></div><small>${pct(l.total ? l.medido / l.total : 0)} medido</small></td>${cs.map((c, k) => celT(porLC[l.id + "|" + c.cat], k)).join("")}</tr>`).join(""); }).join("")}
      </tbody></table></div>`;
    }
  }
  // o que foi preenchido em quadrados que NÃO estão na grade de agora (outro pavimento ou tipo) — volta guardado depois de um erro
  const naGrade = new Set(sel.length ? Object.values(R.I).filter(x => (!tipo || x.tipo === tipo) && sel.some(p => (R.L[x.local] || {}).pav === p.id)).map(x => x.id) : []);
  const guardados = Object.entries(valores).filter(([k, val]) => k.startsWith("d_") && String(val).trim() && R.I[k.slice(2)] && !naGrade.has(k.slice(2))).map(([k, val]) => {
    const x = R.I[k.slice(2)], lr = R.L[x.local] || {}, a = Math.min(1, x.aprov + x.fila);
    return `<input type="hidden" name="${esc(k)}" value="${esc(val)}" data-a="${a}" data-q="${x.qtd}" data-pu="${x.pu || 0}" data-pav="${esc(lr.pavNome || "")}" data-rot="${esc(`${lr.pavNome} › ${lr.nome} · ${x.tipo} - ${x.servico}`)}">`; }).join("");
  // só quem está ATIVO e HABILITADO nesta obra no cadastro de empreiteiros
  const podem = R.E.lista.filter(e => D.habilitado(e, obra)).sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"));
  const optE = s => `<option value="">—</option>${podem.map(e => `<option value="${esc(e.id)}"${s === e.id ? " selected" : ""}>${esc(e.nome)}${e.funcao ? " · " + esc(e.funcao) : ""}</option>`).join("")}`;
  // os EXTRAS (10/11): cada um nasce do botão "+ extra" de um quadrado da grade (serviço de um local). A janela pede valor,
  // motivo curto, observação detalhada e fotos; a seção 4 lista os extras deste lançamento (dá para editar ou tirar)
  const usados = {}; for (const B of O.boletins) for (const x of B.extras) if (x.motivo && x.motivo.length <= 60) usados[x.motivo] = (usados[x.motivo] || 0) + 1;
  const motivos = Object.entries(usados).sort((a, c) => c[1] - a[1]).slice(0, 40).map(([m]) => m);
  const exVolta = []; for (let n = 1; n <= 40; n++) { const it = valores[`ex${n}_item`]; if (!it || !R.I[it]) continue; const x = R.I[it], l = R.L[x.local] || {};
    exVolta.push({ n, item: it, rot: `${l.pavNome} › ${l.nome} · ${x.tipo} - ${x.servico}`, valor: valores[`ex${n}_valor`] || "", motivo: valores[`ex${n}_motivo`] || "", obs: valores[`ex${n}_obs`] || "" }); }
  const linhaEx = e => `<div class="mc-exl" data-n="${e.n}" data-item="${esc(e.item)}" data-rot="${esc(e.rot)}"><input type="hidden" name="ex${e.n}_item" value="${esc(e.item)}"><input type="hidden" name="ex${e.n}_valor" value="${esc(e.valor)}"><input type="hidden" name="ex${e.n}_motivo" value="${esc(e.motivo)}"><input type="hidden" name="ex${e.n}_obs" value="${esc(e.obs)}"><span class="arqs" hidden></span>
    <div class="txt"></div><div class="ac"><button type="button" class="mc-mini" onclick="mcExEdita(this.closest('.mc-exl'))">editar</button><button type="button" class="mc-mini" style="color:#8a2d2d" onclick="mcExTira(this.closest('.mc-exl'))">tirar</button></div></div>`;
  const dlgEx = `<dialog class="mc-dlg" id="mcDlgEx" onkeydown="if(event.key==='Enter'&&event.target.tagName!=='TEXTAREA'){event.preventDefault();}"><p class="rot" style="font-size:15px;margin-bottom:2px">Medição extra</p><div id="mcExRot" style="font-size:12.5px;color:var(--mut);margin:0 0 12px"></div>
    <div class="mc-2" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr);margin:0 0 8px"><div>${lab("Valor (R$)")}<input id="mcExV" inputmode="decimal" class="mc-i" placeholder="0,00"></div>
      <div>${lab("Motivo (curto)")}<input id="mcExM" list="mcExMot" maxlength="60" class="mc-i" placeholder="ex.: Andaime, Retrabalho…"><datalist id="mcExMot">${motivos.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div></div>
    <div style="font-size:11.5px;color:var(--mut);margin:-4px 0 8px">O motivo curto é o que aparece no Dashboard ("top motivos"): use os mesmos nomes para extras parecidos (a lista sugere os já usados).</div>
    ${lab("Observação (detalhe o extra: memória de cálculo, motivo detalhado…)")}<textarea id="mcExO" rows="5" maxlength="3000" class="mc-i"></textarea>
    <div style="margin-top:8px">${lab("Fotos (opcional · sem limite)")}<span id="mcExSlot"></span><div id="mcExTem" style="font-size:12px;color:var(--mut);margin-top:3px"></div></div>
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button type="button" class="oc-btn p" onclick="mcExSalva()">Salvar extra</button></div></dialog>`;
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="${b}?aba=boletins"><span class="seta">←</span> Boletins · ${esc(O.nome)}</a>
  <div class="oc-topo"><h1>Lançar medição · ${esc(O.nome)}</h1><span style="font-size:12.5px;color:var(--mut)">vai para o boletim do mês de cada empreiteiro</span></div>
  ${erro ? `<div class="oc-msg e">${esc(erro)}</div>` : ""}
  <div class="pg-limpa" style="margin-top:14px">${filtro}
  <form method="POST" action="${b}/lancar" enctype="multipart/form-data" id="mcF" onsubmit="return mcEnvia()">
    <input type="hidden" name="modo" value="${valores.modo === "qtd" ? "qtd" : "pct"}"><input type="hidden" name="pavs" value="${esc(pavs.join(","))}"><input type="hidden" name="locs" value="${esc(locs.join("\n"))}"><input type="hidden" name="cat" value="${esc(cat)}"><input type="hidden" name="tipo" value="${esc(tipo)}">
    <div class="mc-cart"><div class="oc-sec" style="margin-top:0">2. De quem e quando <small style="text-transform:none;letter-spacing:0;color:var(--mut)">— a data define o mês do boletim; cada empreiteiro recebe a sua parte no boletim dele</small></div>
      <div class="mc-2"><div>${lab("Data da medição")}<input type="date" name="data" value="${v("data") || hoje}" max="${hoje}" class="mc-i" style="width:auto;max-width:190px" required></div></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${lab("Empreiteiros e a parte de cada um (somam 100%)")}<b id="mcPSoma" style="font-size:12px"></b><button type="button" class="mc-mini" onclick="mcPartesIgual()">dividir igual</button></div>
      <div style="font-size:11.5px;color:var(--mut);margin:0 0 6px">Ao escolher mais de um empreiteiro, a parte se divide sozinha. Se digitar a parte de um, os outros se ajustam para fechar 100%.</div>
      ${podem.length ? "" : `<div class="oc-msg e" style="margin:0 0 8px">Nenhum empreiteiro ativo habilitado nesta obra. Habilite no <a href="/obras/medicao-empreiteiros?obra=${esc(obra)}">cadastro de empreiteiros</a>.</div>`}
      ${["1", "2", "3"].map(k => `<div style="display:grid;grid-template-columns:1fr 110px;gap:10px;margin-bottom:6px;max-width:620px"><select name="emp${k}" class="mc-i mc-busca"${k === "1" ? " required" : ""} onchange="mcPartes(${k})">${optE(valores["emp" + k])}</select>
        <input name="parte${k}" value="${v("parte" + k) || (k === "1" ? "100" : "")}" inputmode="decimal" placeholder="%" class="mc-i" oninput="this.setAttribute('data-manual','1');mcPartes()"></div>`).join("")}
    </div>
    <div class="mc-cart"><div class="oc-sec" style="margin-top:0">3. O que andou <small style="text-transform:none;letter-spacing:0;color:var(--mut)">— escreva só o que andou desde a última medição, em % ou em quantidade (escolha acima da grade); a célula mostra de quanto estava → para quanto vai</small></div>
      <div id="mcGradeBox">${sel.length ? grade : `<div class="oc-vazio">Marque os pavimentos acima: a grade aparece sozinha. O extra também se lança pela grade (botão <b>+ extra</b> no quadrado do serviço).</div>`}</div>
      <div id="mcGuarda" hidden>${guardados}</div>
      <div class="mc-leg"><span><i style="background:#2f7d55"></i>aprovado</span><span><i style="background:#e5b33a"></i>lançado, ainda não aprovado</span><span><i style="background:var(--acento)"></i>esta folha</span><span><i style="background:#fbe0e0"></i>passa de 100% (não deixa lançar)</span><span><i style="background:#fff6dc;border:1px solid #ecd9a0"></i>quantidade em aprovação (não mede)</span></div></div>
    <div class="mc-cart"><div class="oc-sec" style="margin-top:0">4. Extras deste lançamento <small style="text-transform:none;letter-spacing:0;color:var(--mut)">— cada extra é ligado ao serviço de um local: aperte <b>+ extra</b> no quadrado da grade</small></div>
      <div id="mcExLista">${exVolta.map(linhaEx).join("")}</div><div id="mcExVazio" class="oc-vazio"${exVolta.length ? " hidden" : ""}>Nenhum extra neste lançamento.</div>
      ${exVolta.length && erro ? `<div style="font-size:12px;color:#8a2d2d;margin-top:4px">As fotos dos extras precisam ser escolhidas de novo (editar).</div>` : ""}</div>
    <div class="mc-cart"><div class="oc-sec" style="margin-top:0">5. Observações e fotos <small style="text-transform:none;letter-spacing:0;color:var(--mut)">— opcional, valem para o lançamento todo</small></div>
      <textarea name="obs" rows="3" class="mc-i" maxlength="1000" placeholder="Observação geral do lançamento (opcional).">${v("obs")}</textarea>
      <div style="margin-top:8px">${lab("Fotos (opcional · jpg, png, webp ou PDF)")}<input type="file" name="fotos" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*"></div>
      ${erro ? `<div style="font-size:12px;color:#8a2d2d;margin-top:4px">Se tinha escolhido fotos, escolha de novo.</div>` : ""}</div>
    <div class="mc-rod"><div><small>Este lançamento</small><br><b id="mcTot">R$ 0,00</b></div><div><small>Serviços</small><br><b id="mcN">0</b></div><div><small>Extras</small><br><b id="mcEx2">R$ 0,00</b></div>
      <button type="button" class="oc-btn" style="background:transparent;color:#fff;border-color:#55524a" onclick="mcVer()">ver o que preenchi</button>
      <button type="button" class="oc-btn" style="background:transparent;color:#f0b8ae;border-color:#6a3b33" onclick="mcLimpaTudo()" title="Apaga tudo o que foi preenchido neste lançamento: %/quantidades, fotos e extras">limpar lançamentos</button>
      <button class="oc-btn p">Lançar nos boletins</button></div>
    <dialog class="mc-dlg lg" id="mcDlgVer"><p class="rot" style="font-size:15px">O que está preenchido neste lançamento</p><div id="mcVerLista"></div>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>
    ${dlgEx}
  </form></div>
  <script>${JS.replace(/<\/?script>/g, "")}
${BUSCA_JS}
  // MEDIR EM % OU EM QUANTIDADE (13/11): o campo é o mesmo; em quantidade, o que se escreve vira % pela quantidade do serviço no local
  function mcEmQtd(){ var m=document.querySelector('#mcF input[name=modo]'); return !!m && m.value==='qtd'; }
  function mcP(v,q){ return mcEmQtd() ? (q>0 ? v/q*100 : NaN) : v; }
  function mcUnPinta(){ var qt=mcEmQtd(); document.querySelectorAll('.mc-seg button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-un')===(qt?'qtd':'pct')); });
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a] input[name^="d_"]').forEach(function(i){ i.placeholder= qt ? '+'+(i.closest('td').getAttribute('data-un')||'qtd') : '+%'; });
    document.querySelectorAll('#mcGradeBox input[data-ap]').forEach(function(i){ i.placeholder= qt ? 'qtd' : '%'; }); }
  function mcUn(u){ var m=document.querySelector('#mcF input[name=modo]'); if(!m || m.value===u) return; var paraQ= u==='qtd';
    var conv=function(el,q){ var v=mcNum(el.value); if(!el.value.trim()||isNaN(v)) return; var n= paraQ ? v*q/100 : (q>0 ? v/q*100 : v); el.value=(Math.round(n*1e4)/1e4).toLocaleString('pt-BR',{maximumFractionDigits:4}); };
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a] input[name^="d_"]').forEach(function(i){ conv(i, +i.closest('td').getAttribute('data-q')); });
    document.querySelectorAll('#mcGuarda input[name^="d_"]').forEach(function(h){ conv(h, +h.getAttribute('data-q')); });
    document.querySelectorAll('#mcGradeBox input[data-ap]').forEach(function(i){ i.value=''; });
    m.value=u; mcUnPinta(); mcCalc(); }
  function mcCel(td){ var i=td.querySelector('input'); if(!i) return 0; var q=+td.getAttribute('data-q'), d=mcP(mcNum(i.value),q), a=+td.getAttribute('data-a')*100, pu=+td.getAttribute('data-pu');
    var ok=!isNaN(d), novo=a+(ok?d:0), s=td.querySelector('small b'); s.textContent=mcFmt(novo,novo%1?1:0)+'%';
    var s2=td.querySelector('small.qt b'); if(s2) s2.textContent=mcFmt(q*novo/100);
    td.classList.toggle('passa', !ok || novo>100.0001 || d<0); td.classList.toggle('mexe', ok && d>0 && novo<=100.0001);
    var n=td.querySelector('.bar .n'); if(n) n.style.width=Math.max(0,Math.min(100-a,ok?d:0))+'%';
    return ok && d>0 ? q*pu*d/100 : 0; }
  function mcCalc(){ var t=0,n=0,pv={}; document.querySelectorAll('td.mc-c[data-a]').forEach(function(td){ var v=mcCel(td); if(v>0){t+=v;n++;pv[td.getAttribute('data-pav')]=1;} });
    document.querySelectorAll('#mcGuarda input[name^="d_"]').forEach(function(h){ var d=mcP(mcNum(h.value),+h.getAttribute('data-q')); if(d>0){ t+=(+h.getAttribute('data-q'))*(+h.getAttribute('data-pu'))*d/100; n++; pv[h.getAttribute('data-pav')]=1; } });
    var npv=Object.keys(pv).length;
    var ex=0; document.querySelectorAll('input[name$="_valor"]').forEach(function(i){ var v=mcNum(i.value); if(v>0) ex+=v; });
    document.getElementById('mcTot').textContent=(t+ex).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); document.getElementById('mcN').textContent=n+(npv>1?' em '+npv+' pav.':'');
    document.getElementById('mcEx2').textContent=ex.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function mcFalta(td){ var a=+td.getAttribute('data-a')*100, f=Math.max(0,100-a); if(f<1e-6) return '';
    if(mcEmQtd()){ var fq=Math.floor(+td.getAttribute('data-q')*f/100*1e4+1e-9)/1e4; return fq.toLocaleString('pt-BR',{maximumFractionDigits:4}); } var r=Math.round(f); if(Math.abs(f-r)<1e-9) return String(r);
    var v=Math.floor(f*1e4+1e-9)/1e4; return v.toLocaleString('pt-BR',{maximumFractionDigits:4}); }   // 13/11: cortado em 4 casas (o servidor fecha o resto exato); arredondar para cima passava de 100%
  function mcCol(k,v){ document.querySelectorAll('td.mc-c[data-a][data-col="'+k+'"]').forEach(function(td){ td.querySelector('input').value = v==='falta' ? mcFalta(td) : v; }); mcCalc(); }
  function mcLinha(b){ b.closest('tr').querySelectorAll('td.mc-c[data-a]').forEach(function(td){ td.querySelector('input').value=mcFalta(td); }); mcCalc(); }
  function mcEnvia(){ if(document.querySelector('td.mc-c.passa')){ alert('Tem célula passando de 100% (em vermelho). Corrija antes de lançar.'); return false; }
    var semPct=[]; document.querySelectorAll('#mcF input[type=file][name^="f_"]').forEach(function(f){ if(!f.files.length) return; var nm='d_'+f.name.slice(2), i=document.querySelector('#mcF input[name="'+nm+'"]');
      if(!i || !(mcNum(i.value)>0)){ var td=f.closest('td'); semPct.push(f.getAttribute('data-rot')||(td&&td.getAttribute('data-rot'))||'um serviço'); } });
    if(semPct.length){ alert('Tem foto em serviço sem % lançado. A foto vai junto com a medição do serviço: escreva o % ou tire a foto. Serviço(s): '+semPct.join(' · ')); return false; }
    var s=mcPartesSoma(); if(s.n>0 && Math.abs(s.soma-100)>0.01){ alert('As partes dos empreiteiros somam '+mcFmt(s.soma,2)+'%: têm de somar 100%.'); return false; } return true; }
  // ---- extras (10/11)
  var mcExN=0, mcExEd=null; document.querySelectorAll('#mcExLista .mc-exl').forEach(function(r){ mcExN=Math.max(mcExN,+r.getAttribute('data-n')); });
  function mcExArq(){ var s=document.getElementById('mcExSlot'); s.innerHTML=''; var i=document.createElement('input'); i.type='file'; i.multiple=true; i.accept='.jpg,.jpeg,.png,.webp,.pdf,image/*'; s.appendChild(i); return i; }
  function mcExCampo(r,k){ return r.querySelector('input[name="ex'+r.getAttribute('data-n')+'_'+k+'"]'); }
  function mcExNFotos(r){ var n=0; r.querySelectorAll('.arqs input[type=file]').forEach(function(i){ n+=i.files.length; }); return n; }
  function mcExAbre(b){ mcExEd=null; var d=document.getElementById('mcDlgEx'); d.setAttribute('data-item',b.getAttribute('data-item')); d.setAttribute('data-rot',b.getAttribute('data-rot'));
    document.getElementById('mcExRot').textContent=b.getAttribute('data-rot'); document.getElementById('mcExV').value=''; document.getElementById('mcExM').value=''; document.getElementById('mcExO').value='';
    document.getElementById('mcExTem').textContent=''; mcExArq(); d.showModal(); document.getElementById('mcExV').focus(); }
  function mcExEdita(r){ mcExEd=r; var d=document.getElementById('mcDlgEx'); d.setAttribute('data-item',r.getAttribute('data-item')); d.setAttribute('data-rot',r.getAttribute('data-rot'));
    document.getElementById('mcExRot').textContent=r.getAttribute('data-rot'); document.getElementById('mcExV').value=mcExCampo(r,'valor').value; document.getElementById('mcExM').value=mcExCampo(r,'motivo').value; document.getElementById('mcExO').value=mcExCampo(r,'obs').value;
    var nf=mcExNFotos(r); document.getElementById('mcExTem').textContent= nf ? nf+' foto(s) já escolhida(s); as que escolher agora entram junto.' : ''; mcExArq(); d.showModal(); }
  function mcExSalva(){ var d=document.getElementById('mcDlgEx'), v=mcNum(document.getElementById('mcExV').value), m=document.getElementById('mcExM').value.trim(), o=document.getElementById('mcExO').value.trim();
    if(!(v>0)){ alert('Escreva o valor do extra.'); return; } if(m.length<3){ alert('Escreva o motivo (curto).'); return; } if(o.length<5){ alert('Escreva a observação detalhando o extra.'); return; }
    var r=mcExEd; if(!r){ var n=++mcExN; r=document.createElement('div'); r.className='mc-exl'; r.setAttribute('data-n',n); r.setAttribute('data-item',d.getAttribute('data-item')); r.setAttribute('data-rot',d.getAttribute('data-rot'));
      r.innerHTML='<span class="arqs" hidden></span><div class="txt"></div><div class="ac"><button type="button" class="mc-mini">editar</button><button type="button" class="mc-mini" style="color:#8a2d2d">tirar</button></div>';
      ['item','valor','motivo','obs'].forEach(function(k){ var h=document.createElement('input'); h.type='hidden'; h.name='ex'+n+'_'+k; r.insertBefore(h,r.firstChild); });
      var bs=r.querySelectorAll('.ac button'); bs[0].onclick=function(){ mcExEdita(r); }; bs[1].onclick=function(){ mcExTira(r); };
      mcExCampo(r,'item').value=d.getAttribute('data-item'); document.getElementById('mcExLista').appendChild(r); }
    mcExCampo(r,'valor').value=document.getElementById('mcExV').value.trim(); mcExCampo(r,'motivo').value=m; mcExCampo(r,'obs').value=o;
    var f=document.querySelector('#mcExSlot input[type=file]'); if(f && f.files.length){ f.name='ex'+r.getAttribute('data-n')+'_fotos'; r.querySelector('.arqs').appendChild(f); }
    d.close(); mcExConta(); mcCalc(); }
  function mcExTira(r){ if(confirm('Tirar este extra do lançamento?')){ r.remove(); mcExConta(); mcCalc(); } }
  function mcExConta(){ var por={}; document.querySelectorAll('#mcExLista .mc-exl').forEach(function(r){ var it=r.getAttribute('data-item'); por[it]=(por[it]||0)+1;
      var nf=mcExNFotos(r), v=mcNum(mcExCampo(r,'valor').value);
      r.querySelector('.txt').innerHTML='<b>'+(v>0?v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—')+'</b> · '+mcE(r.getAttribute('data-rot'))+'<small>'+mcE(mcExCampo(r,'motivo').value)+(nf?' · '+nf+' foto(s)':'')+' — '+mcE(mcExCampo(r,'obs').value.slice(0,140))+(mcExCampo(r,'obs').value.length>140?'…':'')+'</small>'; });
    document.querySelectorAll('.mc-exb').forEach(function(b){ var n=por[b.getAttribute('data-item')]||0; b.textContent= n ? '+ extra ('+n+')' : '+ extra'; b.classList.toggle('tem', n>0); });
    document.getElementById('mcExVazio').hidden=!!document.querySelector('#mcExLista .mc-exl'); }
  function mcE(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  // ---- partes dos empreiteiros (10/11): dividem sozinhas; a digitada à mão fica, as outras fecham os 100%
  function mcPartesSoma(){ var n=0, soma=0; ['1','2','3'].forEach(function(k){ if(document.querySelector('select[name=emp'+k+']').value){ n++; soma+=mcNum(document.querySelector('input[name=parte'+k+']').value)||0; } }); return {n:n,soma:soma}; }
  function mcPartes(mudou){ var ch=[], man=[], soma=0;
    ['1','2','3'].forEach(function(k){ var s=document.querySelector('select[name=emp'+k+']'), i=document.querySelector('input[name=parte'+k+']');
      if(!s.value){ if(mudou){ i.value=''; i.removeAttribute('data-manual'); } return; } ch.push(i); if(i.getAttribute('data-manual')){ man.push(i); soma+=mcNum(i.value)||0; } });
    var auto=ch.filter(function(i){ return man.indexOf(i)<0; });
    if(!man.length && ch.length===1){ ch[0].value='100'; }
    else if(auto.length){ var resto=Math.max(0,100-soma), cada=Math.floor(resto/auto.length*100)/100, usado=0;
      auto.forEach(function(i,j){ var v= j===auto.length-1 ? Math.round((resto-usado)*100)/100 : cada; usado+=v; i.value=mcFmt(v,2); }); }
    var s=mcPartesSoma(), el=document.getElementById('mcPSoma'); el.textContent= s.n ? 'soma: '+mcFmt(s.soma,2)+'%' : ''; el.style.color= Math.abs(s.soma-100)>0.01 ? '#a8321f' : '#1f6b3a'; }
  function mcPartesIgual(){ document.querySelectorAll('input[name^=parte]').forEach(function(i){ i.removeAttribute('data-manual'); }); mcPartes(); }
  // ---- a grade se atualiza sozinha (10/11): troca só a caixa da grade; o que foi digitado vai para a "guarda" e volta
  var mcGT=null, mcGSeq=0;
  // limpar não pode pular a tela: o botão "Limpar filtros" fica no MESMO lugar da tela (o que está acima encolhe; a vista acompanha)
  var mcFixaY=null;
  function mcAncora(){ var b=document.getElementById('mcLimpar'); if(!b||mcFixaY==null) return; window.scrollBy(0, b.getBoundingClientRect().top-mcFixaY); }
  function mcSegura(){ var b=document.getElementById('mcLimpar'); document.documentElement.style.overflowAnchor='none'; document.body.style.minHeight=document.documentElement.scrollHeight+'px'; mcFixaY=b?b.getBoundingClientRect().top:null; }
  function mcSolta(){ if(mcFixaY==null) return; mcAncora(); requestAnimationFrame(function(){ mcAncora(); mcFixaY=null; document.body.style.minHeight=''; document.documentElement.style.overflowAnchor=''; mcAncora(); }); }
  function mcLimpaFiltros(){ mcSegura(); document.querySelectorAll('#mcFiltro input[type=checkbox]').forEach(function(c){ c.checked=false; }); document.querySelectorAll('#mcFiltro details.mc-pg').forEach(function(g){ g.open=false; });
    document.querySelectorAll('#mcFiltro select.mc-busca').forEach(function(s){ s.value=''; if(s.mcSync) s.mcSync(); }); if(document.activeElement) document.activeElement.blur(); mcGradeMuda(); mcAncora(); }
  function mcMarcaCx(b,v,pref){ b.closest('.mc-pg,.mc-ll').querySelectorAll('input[type=checkbox]').forEach(function(c){ if(pref==null||c.getAttribute('data-g')===pref) c.checked=v; }); mcGradeMuda(); }
  function mcGradeMuda(){ ++mcGSeq; clearTimeout(mcGT); if(mcFixaY==null){ document.body.style.minHeight=''; document.documentElement.style.overflowAnchor=''; } document.getElementById('mcGradeEst').textContent='atualizando a grade…'; mcGT=setTimeout(mcGradeBusca,450); }
  function mcGuardaTudo(){ var g=document.getElementById('mcGuarda');
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a] input[type=file]').forEach(function(i){ if(i.files.length){ var td=i.closest('td'); ['data-pav','data-rot'].forEach(function(k){ i.setAttribute(k, td.getAttribute(k)||''); }); g.appendChild(i); } });
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a] input[name^="d_"]').forEach(function(i){ var v=i.value.trim(), h=g.querySelector('input[name="'+i.name+'"]');
      if(!v){ if(h) h.remove(); return; } if(!h){ h=document.createElement('input'); h.type='hidden'; h.name=i.name; g.appendChild(h); } h.value=v;
      var td=i.closest('td'); ['data-a','data-q','data-pu','data-pav','data-rot'].forEach(function(k){ h.setAttribute(k, td.getAttribute(k)||''); }); }); }
  function mcRestaura(){ document.querySelectorAll('#mcGuarda input[type=file]').forEach(function(f){ var i=document.querySelector('#mcGradeBox input[type=file][name="'+f.name+'"]'); if(i){ i.parentNode.replaceChild(f,i); mcFotoConta(f); } });
    document.querySelectorAll('#mcGuarda input[name^="d_"]').forEach(function(h){ var i=document.querySelector('#mcGradeBox input[name="'+h.name+'"]'); if(i){ i.value=h.value; h.remove(); } }); }
  // FOTO e EXTRA (13/11): os botões ficam acima da grade; aperta o botão e clica no quadrado do serviço
  var mcModoAt='';
  function mcModoPinta(){ var g=document.getElementById('mcGradeBox'); if(!g) return; g.classList.toggle('modo', !!mcModoAt); g.classList.toggle('modo-foto', mcModoAt==='foto'); g.classList.toggle('modo-extra', mcModoAt==='extra');
    g.querySelectorAll('.mc-gmodo .oc-btn').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-modo')===mcModoAt); });
    var dc=document.getElementById('mcModoDica'); if(dc) dc.textContent= mcModoAt==='foto' ? 'Clique no quadrado do serviço que vai receber a foto (Esc cancela)' : mcModoAt==='extra' ? 'Clique no quadrado do serviço do extra (Esc cancela)' : ''; }
  function mcModo(m){ mcModoAt = mcModoAt===m ? '' : m; mcModoPinta(); }
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && mcModoAt){ mcModoAt=''; mcModoPinta(); } });
  document.addEventListener('click', function(e){ if(!mcModoAt) return; var td=e.target.closest && e.target.closest('#mcGradeBox td.mc-c'); if(!td || td.classList.contains('nada')) return;
    e.preventDefault(); e.stopPropagation(); var m=mcModoAt;
    if(m==='foto'){ var f=td.querySelector('input[type=file]'); if(!f){ alert(td.classList.contains('pend') ? 'A quantidade real deste serviço está aguardando aprovação: ele não pode ser medido agora.' : 'Este serviço já está em 100%: a foto vai junto com o % lançado.'); return; } mcModoAt=''; mcModoPinta(); f.click(); }
    else { var b=td.querySelector('.mc-exb'); if(!b) return; mcModoAt=''; mcModoPinta(); mcExAbre(b); } }, true);
  function mcFotoConta(i){ var l=i.closest('label'); if(!l) return; var n=i.files.length; l.querySelector('i').textContent= n ? n : ''; l.classList.toggle('tem', n>0); l.title= n ? n+' foto(s) escolhida(s) para este serviço — clique para trocar' : 'Fotos deste serviço (vão para a linha dele no boletim)'; }
  function mcGradeBusca(){ var f=document.getElementById('mcFiltro'), p=new URLSearchParams(new FormData(f)), url=f.getAttribute('action')+'?'+p.toString(), meu=++mcGSeq, box=document.getElementById('mcGradeBox'), est=document.getElementById('mcGradeEst');
    box.classList.add('mc-carregando');
    fetch(url,{credentials:'same-origin'}).then(function(r){ if(!r.ok) throw 0; return r.text(); }).then(function(h){ if(meu!==mcGSeq) return;
      var d=new DOMParser().parseFromString(h,'text/html'), nb=d.getElementById('mcGradeBox'); if(!nb) throw 0;
      mcGuardaTudo(); box.innerHTML=nb.innerHTML; box.classList.remove('mc-carregando'); mcRestaura();
      var nl=d.getElementById('mcLocBox'), lb=document.getElementById('mcLocBox'); if(nl&&lb) lb.innerHTML=nl.innerHTML; mcModoPinta(); mcUnPinta();
      var ns=d.getElementById('mcServBox'), sb=document.getElementById('mcServBox'); if(ns&&sb && !sb.contains(document.activeElement)){ sb.innerHTML=ns.innerHTML; mcBuscaIni(); }
      var cs=d.querySelectorAll('#mcFiltro .mc-pg>summary small'); document.querySelectorAll('#mcFiltro .mc-pg>summary small').forEach(function(s,k){ if(cs[k]){ s.textContent=cs[k].textContent; s.className=cs[k].className; } });
      document.querySelector('#mcF input[name=pavs]').value=p.getAll('pav').join(','); document.querySelector('#mcF input[name=tipo]').value=p.get('tipo')||''; document.querySelector('#mcF input[name=locs]').value=p.getAll('loc').join('\\n'); document.querySelector('#mcF input[name=cat]').value=p.get('cat')||'';
      history.replaceState(null,'',url); mcSolta(); est.textContent='grade atualizada; o que foi preenchido fica guardado ao trocar de pavimento ou de tipo'; mcExConta(); mcCalc(); })
    .catch(function(){ if(meu!==mcGSeq) return; box.classList.remove('mc-carregando'); est.textContent='não deu para atualizar a grade agora — tente de novo (o que foi preenchido continua guardado)'; }); }
  // 13/11: tirar UM lançamento (o % / quantidade e as fotos daquele serviço) ou um extra pela lista; ou limpar tudo
  function mcTiraLanc(nm){ var id=String(nm).slice(2), i=document.querySelector('#mcGradeBox input[name="'+nm+'"]'); if(i) i.value='';
    document.querySelectorAll('#mcGuarda input[name="'+nm+'"]').forEach(function(h){ h.remove(); });
    document.querySelectorAll('#mcF input[type=file][name="f_'+id+'"]').forEach(function(f){ if(f.closest('#mcGuarda')) f.remove(); else { f.value=''; mcFotoConta(f); } });
    mcCalc(); mcVerMonta(); }
  function mcTiraEx(n){ var r=document.querySelector('#mcExLista .mc-exl[data-n="'+n+'"]'); if(r) r.remove(); mcExConta(); mcCalc(); mcVerMonta(); }
  function mcLimpaTudo(){ if(!confirm('Apagar tudo o que foi preenchido neste lançamento (% / quantidades, fotos e extras)?')) return;
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a] input[name^="d_"], #mcGradeBox input[data-ap]').forEach(function(i){ i.value=''; });
    document.querySelectorAll('#mcGuarda input').forEach(function(h){ h.remove(); });
    document.querySelectorAll('#mcGradeBox input[type=file][name^="f_"]').forEach(function(f){ f.value=''; mcFotoConta(f); });
    document.querySelectorAll('#mcExLista .mc-exl').forEach(function(r){ r.remove(); }); mcExConta(); mcCalc(); }
  function mcVer(){ mcVerMonta(); document.getElementById('mcDlgVer').showModal(); }
  function mcVerMonta(){ var L=[], tot=0;
    var fts={}; document.querySelectorAll('#mcF input[type=file][name^="f_"]').forEach(function(f){ if(f.files.length) fts[f.name.slice(2)]=f.files.length; });
    var poe=function(rot,pav,d,q,pu,a,nm){ var v=q*pu*d/100; tot+=v; L.push({rot:rot,pav:pav,d:d,v:v,a:a,nm:nm,f:fts[String(nm).slice(2)]||0}); };
    document.querySelectorAll('#mcGradeBox td.mc-c[data-a]').forEach(function(td){ var d=mcP(mcNum(td.querySelector('input').value),+td.getAttribute('data-q')); if(d>0) poe(td.getAttribute('data-rot'),td.getAttribute('data-pav'),d,+td.getAttribute('data-q'),+td.getAttribute('data-pu'),+td.getAttribute('data-a')*100,td.querySelector('input').name); });
    document.querySelectorAll('#mcGuarda input[name^="d_"]').forEach(function(h){ var d=mcP(mcNum(h.value),+h.getAttribute('data-q')); if(d>0) poe(h.getAttribute('data-rot'),h.getAttribute('data-pav'),d,+h.getAttribute('data-q'),+h.getAttribute('data-pu'),+h.getAttribute('data-a')*100,h.name); });
    var R$=function(v){ return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }, h='', pv={};
    L.forEach(function(x){ (pv[x.pav]=pv[x.pav]||[]).push(x); });
    Object.keys(pv).forEach(function(k){ h+='<div class="mc-verpv">'+mcE(k)+'</div>'; pv[k].forEach(function(x){ h+='<div class="mc-verl"><span>'+mcE(x.rot.split(' › ').slice(1).join(' › '))+'</span><span>+'+mcFmt(x.d,2)+'% <small>('+mcFmt(x.a,1)+'% → '+mcFmt(x.a+x.d,1)+'%)'+(x.f?' · '+x.f+' foto(s)':'')+'</small></span><b>'+R$(x.v)+'</b><button type="button" class="mc-verx" title="Tirar este lançamento" onclick="mcTiraLanc(\\''+mcE(x.nm)+'\\')">×</button></div>'; }); });
    var ex=document.querySelectorAll('#mcExLista .mc-exl'), te=0; if(ex.length){ h+='<div class="mc-verpv">Extras</div>'; ex.forEach(function(r){ var v=mcNum(mcExCampo(r,'valor').value)||0; te+=v; h+='<div class="mc-verl"><span>'+mcE(r.getAttribute('data-rot'))+'</span><span>'+mcE(mcExCampo(r,'motivo').value)+'</span><b>'+R$(v)+'</b><button type="button" class="mc-verx" title="Tirar este extra" onclick="mcTiraEx(\\''+r.getAttribute('data-n')+'\\')">×</button></div>'; }); }
    document.getElementById('mcVerLista').innerHTML= (L.length||ex.length) ? h+'<div class="mc-verl tot"><span>Total deste lançamento</span><span>'+L.length+' serviço(s)'+(ex.length?' + '+ex.length+' extra(s)':'')+'</span><b>'+R$(tot+te)+'</b><span></span></div>' : '<div class="oc-vazio">Nada preenchido ainda.</div>'; }
  mcExConta(); mcPartes(); mcUnPinta(); mcCalc();
  </script>`;
  return shell({ title: "Lançar medição · " + O.nome, body, user });
}

// ================================================================ o BOLETIM DE MEDIÇÃO (a tela onde se confere, mexe, envia e aprova; e o PDF)
/** Os serviços da obra por pavimento (para escolher o serviço do extra): "Local · Tipo - Serviço". */
function servicosPorPav(R) {
  return predio(R).flatMap(x => x.pavs).map(p => ({ pav: p.nome, its: R.locais.filter(l => l.pav === p.id).flatMap(l => l.itens.slice().sort((a, c) => (a.tipo + a.servico).localeCompare(c.tipo + c.servico, "pt-BR"))
    .map(x => ({ id: x.id, rot: `${l.nome} · ${x.tipo} - ${x.servico}` }))) })).filter(g => g.its.length);
}
const MARCA = { novo: `<span class="md-st novo">novo</span>`, alterado: `<span class="md-st alt">alterado</span>` };
function tabelaBoletim(M, { editar = false, b0 = "", servs = [] } = {}) {
  const bid = M.B.id, removidos = M.dif.removidos || { itens: [], extras: [] }, ac = !M.versao;   // ac = a coluna dos ícones (não sai na impressão)
  // os dois botões de cada linha, só ícone, no fim da linha: observação (popup com o texto) e câmera (popup para anexar, sem limite)
  const SVG_OBS = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 4h16v12H8l-4 4z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const SVG_CAM = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M3 7h4l2-2.5h6L17 7h4v12H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const SVG_LAP = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14.5 6.5l3 3" stroke="currentColor" stroke-width="1.8"/></svg>`;
  // o lápis: um popup para corrigir a linha — mudar o % de cada lançamento ou remover (item) / remover (extra). Reabre o boletim.
  const reabre = M.B.status !== D.ESTADOS.aberto ? `<div class="mc-previa" style="margin:0 0 10px">Este boletim está ${esc(M.B.status)}: alterar ou remover <b>reabre</b> o boletim (a aprovação cai e ele precisa ser enviado de novo).</div>` : "";
  const remover = (qual, id, oque) => `<form method="POST" action="${b0}/boletim/${esc(bid)}/remover" style="margin:0" onsubmit="return confirm('Remover ${oque} do boletim?')"><input type="hidden" name="qual" value="${qual}"><input type="hidden" name="id" value="${esc(id)}"><button class="oc-btn v">Remover</button></form>`;
  const corrigir = x => x.lancs
    ? x.lancs.map(li => `<div class="mc-corl"><div><b>${dataBR(li.data)}</b> · ${brl(li.valor)}<small>lançado por ${esc(li.por || "—")}${li.dividido ? ` · dividido com ${li.dividido.filter(d => d.e !== M.B.emp).length} outro(s)` : ""}</small></div>
        <form method="POST" action="${b0}/boletim/${esc(bid)}/pct" class="mc-corf"><input type="hidden" name="id" value="${esc(li.id)}"><input name="pct" value="${esc(num(li.pct * 100, 0, 2))}" inputmode="decimal" class="mc-i" style="width:80px;text-align:right">%<button class="oc-btn p">Alterar</button></form>
        ${remover("lanc", li.id, "este lançamento")}</div>`).join("")
    : `<div class="mc-corl"><div><b>${brl(x.valor)}</b> · ${esc(x.servico)}<small>${esc(x.motivo)}</small></div>${remover("extra", x.id, "este extra")}</div>`;
  const icones = (x, rot) => !ac ? "" : !editar ? `<td class="mc-ac noprint"><div>
      ${x.nota ? `<button type="button" class="mc-ico tem" title="Ver a observação" aria-label="Observação" data-rot="${esc(rot)}" data-txt="${esc(x.nota)}" onclick="var d=document.getElementById('mcDlgVeNota');d.querySelector('.rot').textContent=this.getAttribute('data-rot');d.querySelector('.txt').textContent=this.getAttribute('data-txt');d.showModal();">${SVG_OBS}</button>` : ""}
      ${x.fotos.length ? `<button type="button" class="mc-ico tem" title="${x.fotos.length} foto(s) — ver" aria-label="Fotos" onclick="var r=this.closest('tr').nextElementSibling;if(r){r.scrollIntoView({block:'center'});r.style.outline='2px solid var(--acento)';setTimeout(function(){r.style.outline='';},1500);}">${SVG_CAM}<i>${x.fotos.length}</i></button>` : ""}</div></td>` : `<td class="mc-ac noprint"><div>
      <button type="button" class="mc-ico${x.nota ? " tem" : ""}" title="${x.nota ? "Ver / editar a observação" : "Acrescentar observação"}" aria-label="Observação" data-alvo="${esc(x.alvo)}" data-rot="${esc(rot)}" data-txt="${esc(x.nota)}" onclick="mcAbreNota(this)">${SVG_OBS}</button>
      <button type="button" class="mc-ico${x.fotos.length ? " tem" : ""}" title="${x.fotos.length ? x.fotos.length + " foto(s) — acrescentar mais" : "Acrescentar fotos"}" aria-label="Fotos" data-alvo="${esc(x.alvo)}" data-rot="${esc(rot)}" onclick="mcAbreFoto(this)">${SVG_CAM}${x.fotos.length ? `<i>${x.fotos.length}</i>` : ""}</button>
      <button type="button" class="mc-ico" title="Corrigir (alterar % ou remover)" aria-label="Corrigir" data-rot="${esc(rot)}" onclick="mcAbreCor(this)">${SVG_LAP}</button>
      <template>${reabre}${corrigir(x)}</template></div></td>`;
  const vazio = ac ? `<td class="mc-ac noprint"></td>` : "", th = ac ? `<th class="mc-ac noprint"></th>` : "";
  // as fotos da linha à vista (miniaturas logo abaixo dela; clicar abre a foto) — não saem na impressão
  const fotosLinha = (x, cols) => (x.fotos || []).length ? `<tr class="mc-ftrow noprint"><td></td><td colspan="${cols - 1 + (ac ? 1 : 0)}">${miniaturas(x.fotos, b0)}</td></tr>` : "";
  return `<h2>Medições</h2><div class="oc-rolar"><table><thead><tr><th class="r">Nº</th><th>Descrição</th><th>Pavimento</th><th>Local</th><th>Un.</th><th class="r">Valor un.</th><th class="r">Quant. medida</th><th class="r">% medido</th><th class="r">% anterior</th><th class="r">% acumulado</th><th class="r">Valor</th>${th}</tr></thead><tbody>
    ${M.itens.map(x => `<tr id="mc-ln-${x.n}"${x.marca ? ` class="mc-mudou"` : ""}><td class="r">${x.n}</td><td>${esc(x.tipo)} - ${esc(x.servico)} ${x.marca ? MARCA[x.marca] : ""}</td><td>${esc(x.pavimento)}</td><td>${esc(x.local)}</td><td>${esc(x.unidade)}</td><td class="r">${brl(x.pu)}</td><td class="r">${num(x.qtd, 2)}</td>
      <td class="r">${pct(x.pct, 1)}</td><td class="r">${pct(x.anterior, 1)}</td><td class="r">${pct(x.acumulado, 1)}</td><td class="r">${brl(x.valor)}</td>${icones(x, `Item ${x.n} · ${x.tipo} - ${x.servico} · ${x.pavimento} · ${x.local}`)}</tr>${fotosLinha(x, 11)}`).join("") || `<tr><td colspan="11">Sem medições normais.</td>${vazio}</tr>`}
    ${removidos.itens.map(li => `<tr class="mc-removido"><td></td><td colspan="9">removido desde a aprovação: lançamento de ${dataBR(li.data)} · ${pct(li.pct, 1)}</td><td class="r">${brl(li.valor)}</td>${vazio}</tr>`).join("")}
    <tr class="tot"><td colspan="10" class="r">Total medições</td><td class="r">${brl(M.valor)}</td>${vazio}</tr></tbody></table></div>
  <h2>Medições extras</h2><div class="oc-rolar"><table><thead><tr><th class="r">Nº</th><th>Serviço</th><th>Pavimento</th><th>Local</th><th>Motivo</th><th class="r">Valor</th>${th}</tr></thead><tbody>
    ${M.extras.map(x => `<tr id="mc-ln-${x.n}"${x.marca ? ` class="mc-mudou"` : ""}><td class="r">${x.n}</td><td>${esc(x.servico)} ${x.marca ? MARCA[x.marca] : ""}</td><td>${esc(x.pavimento || "—")}</td><td>${esc(x.local || "—")}</td><td>${esc(x.motivo)}</td>
      <td class="r">${brl(x.valor)}</td>${icones(x, `Item ${x.n} (extra) · ${x.servico} · ${x.pavimento} · ${x.local}`)}</tr>${fotosLinha(x, 6)}`).join("") || `<tr><td colspan="6">Sem extras.</td>${vazio}</tr>`}
    ${removidos.extras.map(x => `<tr class="mc-removido"><td></td><td colspan="4">removido desde a aprovação: extra — ${esc(x.motivo || x.descricao || x.categoria || "")}</td><td class="r">${brl(x.valor)}</td>${vazio}</tr>`).join("")}
    <tr class="tot"><td colspan="5" class="r">Total extras</td><td class="r">${brl(M.extra)}</td>${vazio}</tr></tbody></table></div>
  ${editar ? `<details class="oc-ins mc-add noprint" style="margin:6px 0 0"><summary>Adicionar extra neste boletim</summary><form method="POST" action="${b0}/boletim/${esc(bid)}/extra" style="display:block;margin-top:6px">
    <div class="mc-2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))"><div style="grid-column:1/-1">${lab("Serviço do local")}<select name="item" class="mc-i" required><option value=""></option>${servs.map(g => `<optgroup label="${esc(g.pav)}">${g.its.map(s => `<option value="${esc(s.id)}">${esc(s.rot)}</option>`).join("")}</optgroup>`).join("")}</select></div>
      <div>${lab("Data")}<input type="date" name="data" value="${M.mes}-01" min="${M.mes}-01" max="${D.ultimoDiaDoMes(M.mes)}" class="mc-i" required></div>
      <div>${lab("Valor (R$)")}<input name="valor" inputmode="decimal" class="mc-i" required></div>
      <div style="grid-column:1/-1">${lab("Motivo (curto)")}<input name="motivo" class="mc-i" required maxlength="60" placeholder="ex.: Andaime, Retrabalho…"></div>
      <div style="grid-column:1/-1">${lab("Observação (detalhe o extra: memória de cálculo, motivo detalhado…)")}<textarea name="obs" rows="4" class="mc-i" required maxlength="3000"></textarea></div></div>
    <div style="font-size:12px;color:var(--mut);margin:4px 0 8px">As fotos do extra entram depois, pelo ícone da câmera na linha do extra.</div>
    <button class="oc-btn p">Acrescentar extra</button></form></details>` : ""}
  ${editar ? "" : `<dialog class="mc-dlg" id="mcDlgVeNota"><p class="rot" style="font-size:14px"></p><div class="txt" style="white-space:pre-wrap;font-size:13px;line-height:1.5"></div><div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>`}
  ${observacoes(M, { editar, b0 })}
  <h2>Resumo</h2><table style="width:auto;min-width:320px"><tbody><tr><td>Medição</td><td class="r">${brl(M.valor)}</td></tr><tr><td>Medição extra</td><td class="r">${brl(M.extra)}</td></tr><tr class="tot"><td>Total bruto</td><td class="r">${brl(M.total)}</td></tr></tbody></table>`;
}
const miniaturas = (lista, b0) => lista.length ? `<div class="mc-fotos">${lista.map(ft => `<a href="${b0}/foto/${esc(ft.arquivo)}" target="_blank" title="${esc(ft.nome)} · ${esc(ft.por || "")} ${dataBR(ft.data)}">${/\.pdf$/i.test(ft.arquivo) ? `<span>📄 ${esc(ft.nome)}</span>` : `<img src="${b0}/foto/${esc(ft.arquivo)}" alt="" loading="lazy"><span>${esc(ft.nome)}</span>`}</a>`).join("")}</div>` : "";
/** Observações: o campo GERAL do boletim (editável) e, logo abaixo, tudo o que foi anotado em cada item e extra
 *  (o texto do botão 💬, o que veio no lançamento e as fotos 📷 da linha). */
function observacoes(M, { editar = false, b0 = "" } = {}) {
  const bid = M.B.id, porItem = [...M.itens.map(x => ({ x, rot: `${x.tipo} - ${x.servico} · ${x.pavimento} · ${x.local}`, lanc: x.obs })), ...M.extras.map(x => ({ x, rot: `extra · ${x.servico} · ${x.pavimento} · ${x.local} · ${x.motivo}`, lanc: [] }))]
    .filter(({ x, lanc }) => x.nota || lanc.length || x.fotos.length);
  const geral = editar ? `<form method="POST" action="${b0}/boletim/${esc(bid)}/obs" class="noprint" style="margin:0 0 10px">
      <textarea name="obs" rows="4" class="mc-i" maxlength="3000" placeholder="Observação geral do boletim (vale para o boletim inteiro)">${esc(M.obs)}</textarea>
      <button class="oc-btn" style="margin-top:6px">Salvar observação geral</button></form><div class="soprint mc-obsg">${esc(M.obs) || "—"}</div>`
    : `<div class="mc-obsg">${esc(M.obs) || "—"}</div>`;
  return `<h2>Observações</h2><div class="mc-obsbox"><div class="mc-sub" style="margin-top:0">Geral</div>${geral}
    <div class="mc-sub">Por item ${porItem.length ? `<small style="text-transform:none;letter-spacing:0;font-weight:600">(${porItem.length})</small>` : ""}</div>
    ${porItem.length ? porItem.map(({ x, rot, lanc }) => `<div class="mc-obsi"><b>Item ${x.n}</b> <small>${esc(rot)}</small>
      ${x.nota ? `<div class="t">${esc(x.nota)}${x.notaPor ? ` <small>— ${esc(x.notaPor)}, ${quandoBR(x.notaEm)}</small>` : ""}</div>` : ""}
      ${lanc.length ? `<div class="t l">No lançamento: ${esc(lanc.join(" · "))}</div>` : ""}${miniaturas(x.fotos, b0)}</div>`).join("") : `<div class="oc-vazio" style="padding:2px 0">Nenhuma observação nem foto nos itens. Use os botões 💬 e 📷 de cada linha.</div>`}</div>`;
}
/** A linha do tempo do boletim: criado, enviado, aprovado, devolvido, reaberto. */
function linhaDoTempo(B) {
  const ev = [{ em: B.criadoEm, por: B.criadoPor, t: "Boletim criado" }, ...B.envios.map(x => ({ ...x, t: "Enviado para aprovação" })), ...B.aprovacoes.map(x => ({ ...x, t: `Aprovado (${x.etapa})` })),
    ...(B.versoes || []).map(v => ({ em: v.em, por: v.por, t: `Aprovado na final — versão ${v.n} (${brl(D.somaBoletim(v.itens, v.extras).normal + D.somaBoletim(v.itens, v.extras).extra)})` })),
    ...B.devolucoes.map(x => ({ ...x, t: `Devolvido (${x.etapa}): ${x.motivo}` })), ...B.reaberturas.map(x => ({ ...x, t: `Reaberto — estava "${x.de}": ${x.motivo}` })),
    ...(B.removidos || []).map(x => ({ em: x.removidoEm, por: x.removidoPor, t: `Removido: ${x.tipo} de ${brl(x.valor)}` }))]
    .filter(x => x.em).sort((a, c) => String(c.em).localeCompare(String(a.em)));
  return `<div class="mc-tempo">${ev.map(x => `<div><span>${quandoBR(x.em)}</span><b>${esc(x.t)}</b><small>${esc(x.por || "")}</small></div>`).join("")}</div>`;
}
/** EXCLUIR O BOLETIM (13/11): no fim da página, discreto. Mostra por que não dá, quando não dá; quando dá, a janela pede o motivo
 *  (e, se já foi assinado pelo empreiteiro, o "estou ciente" com o aviso). */
function zonaExcluir(B, user, b0, M) {
  const pd = D.podeExcluirBoletim(B, user);
  if (!pd.pode) return `<div class="noprint" style="margin-top:22px;font-size:12px;color:var(--mut)">🗑 Excluir boletim: ${esc(pd.motivo)}</div>`;
  const nLanc = B.itens.length, nEx = B.extras.length;
  return `<div class="noprint" style="margin-top:22px;border-top:1px dashed #e3c9c4;padding-top:12px"><button type="button" class="oc-btn" style="color:#a8321f;border-color:#e3c9c4" onclick="document.getElementById('mcDlgExc').showModal()">🗑 Excluir este boletim</button>
    <span style="font-size:12px;color:var(--mut);margin-left:8px">tira o boletim inteiro e todos os lançamentos dele da medição</span></div>
  <dialog class="mc-dlg" id="mcDlgExc"><form method="POST" action="${b0}/boletim/${esc(B.id)}/excluir" style="display:block;margin:0" onsubmit="return confirm('Excluir o boletim nº ${B.numero} de vez? Os lançamentos dele saem da medição.')">
    <p class="rot" style="font-size:15px;color:#a8321f">Excluir o boletim nº ${B.numero} · ${esc(M.empNome)} · ${mesBR(B.mes)}</p>
    <div style="font-size:13px;line-height:1.5">Sai da medição o boletim inteiro: <b>${nLanc} lançamento(s)</b>${nEx ? ` e <b>${nEx} extra(s)</b>` : ""}, no valor de <b>${brl(M.total)}</b>.
      O % medido desses serviços volta ao que era antes deles, e isso muda o "anterior" e o "acumulado" de quem mediu os mesmos serviços depois.
      ${B.status === D.ESTADOS.ok ? `<br><b>Este boletim está aprovado</b> — a aprovação sai junto.` : D.NA_FILA.includes(B.status) ? `<br>Ele está na fila de aprovação e sai de lá.` : ""}
      <br>Nada se apaga de verdade: o boletim fica guardado em "Boletins excluídos", com quem excluiu, quando e o motivo. O número dele não volta a ser usado.</div>
    ${pd.assinado ? `<div class="oc-msg e" style="margin:10px 0 0">⚠️ <b>Este boletim já foi ASSINADO pelo empreiteiro.</b> A via assinada (impressa ou em PDF) deixa de valer no sistema. Combine com o empreiteiro e com o RH antes de excluir.</div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px;font-weight:700"><input type="checkbox" name="ciente" value="1" required> Estou ciente de que o boletim assinado vai ser excluído</label>` : ""}
    ${lab("Motivo da exclusão")}<textarea name="motivo" rows="3" class="mc-i" required minlength="5" maxlength="300" placeholder="Ex.: boletim lançado no empreiteiro errado"></textarea>
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn" style="background:#a8321f;border-color:#a8321f;color:#fff">Excluir boletim</button></div></form></dialog>`;
}
/** REVOGAR (13/11): na fila = "Retirar da aprovação para editar"; aprovado = "Revogar aprovação para editar" (motivo; se já assinado, o ciente). */
function botaoRevogar(B, b0, aprovado, ult) {
  const ass = aprovado && ult && ult.assinatura;
  if (!aprovado) return `<form method="POST" action="${b0}/boletim/${esc(B.id)}/revogar" style="margin:0" onsubmit="return confirm('Habilitar a edição do boletim nº ${B.numero}? Ele sai da aprovação e volta para em aberto; depois de editar, precisa ser enviado de novo.')"><button class="oc-btn" title="Tira o boletim da fila de aprovação e libera a edição">✎ Habilitar edição</button></form>`;
  return `<button type="button" class="oc-btn" title="Revoga a aprovação e libera a edição" onclick="document.getElementById('mcDlgRev').showModal()">✎ Habilitar edição</button>
  <dialog class="mc-dlg" id="mcDlgRev"><form method="POST" action="${b0}/boletim/${esc(B.id)}/revogar" style="display:block;margin:0">
    <p class="rot" style="font-size:15px">Habilitar a edição do boletim nº ${B.numero}</p>
    <div style="font-size:13px;line-height:1.5">Para editar, a <b>aprovação é revogada</b>: o boletim volta para <b>em aberto</b> e o fluxo recomeça (enviar → aprovar → assinatura). A versão aprovada fica guardada no histórico.</div>
    ${ass ? `<div class="oc-msg e" style="margin:10px 0 0">⚠️ <b>Este boletim já foi assinado pelo empreiteiro.</b> Depois de editado e aprovado de novo, será preciso colher a assinatura outra vez.</div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:8px;font-size:13px;font-weight:700"><input type="checkbox" name="ciente" value="1" required> Estou ciente</label>` : ""}
    ${lab("Motivo")}<input name="motivo" class="mc-i" required minlength="5" maxlength="300" placeholder="Ex.: corrigir a quantidade lançada no Apto 02">
    <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Revogar aprovação e editar</button></div></form></dialog>`;
}
export function paginaBoletim(user, obra, bid, { m = "", e = "", v = "" } = {}) {
  const O = D.lerObra(obra); if (!O) return null;
  const B = O.boletins.find(x => x.id === bid); if (!B) return null;
  const R = D.calcular(O), b0 = base(obra), P = D.papel(user), V = v ? (B.versoes || []).find(x => String(x.n) === String(v)) : null;
  const M = D.montarBoletim(O, B, { versao: V }), emp = R.emp[B.emp] || {};
  const minha = !!D.etapaDeAprovar(B, P);   // 12/11: uma etapa só enquanto ETAPA_DIRETORIA estiver desligada
  const podeDev = D.podeDevolverAgora(B, P), editar = !V, mexe = editar && B.status === D.ESTADOS.aberto;   // 13/11: enviado/aprovado = só leitura
  const ult = D.versaoAprovada(B), reab = B.reaberturas[B.reaberturas.length - 1], dev = B.devolucoes[B.devolucoes.length - 1];
  const aviso2 = [];
  if (V) aviso2.push(`<div class="mc-previa">Você está vendo a <b>versão ${V.n}</b>, aprovada em ${quandoBR(V.em)} por ${esc(V.por)} — congelada. <a href="${b0}/boletim/${esc(B.id)}">Voltar para o boletim atual</a></div>`);
  else {
    if (B.status !== D.ESTADOS.ok && ult) aviso2.push(`<div class="mc-previa">Este boletim <b>já tinha sido aprovado</b> (versão ${ult.n}, ${quandoBR(ult.em)}, ${brl(D.somaBoletim(ult.itens, ult.extras).normal + D.somaBoletim(ult.itens, ult.extras).extra)}) e voltou${reab ? ` em ${quandoBR(reab.em)} (${esc(reab.por)}: ${esc(reab.motivo)})` : ""}.
      ${M.dif.algo ? `Os itens <b>novos</b> e <b>alterados</b> estão marcados; os <b>removidos</b> aparecem riscados.` : ""} Precisa ser aprovado de novo.</div>`);
    if (B.status === D.ESTADOS.aberto && dev && (!reab || dev.em > reab.em)) aviso2.push(`<div class="oc-msg e">Devolvido (${esc(dev.etapa)}) por ${esc(dev.por)} em ${quandoBR(dev.em)}: <b>${esc(dev.motivo)}</b></div>`);
    if (B.pagoNaPlanilha) aviso2.push(`<div class="oc-nota" style="margin:8px 0">Este mês veio da planilha e já foi pago nos boletins dela. Mexer aqui reabre o boletim.</div>`);
  }
  const ultLanc = [...B.itens, ...B.extras].map(x => x.data).sort().pop() || `${B.mes}-01`;
  const aprovado = B.status === D.ESTADOS.ok && ult;
  // O FLUXO DO BOLETIM (13/11): 1. Enviado para aprovação → 2. Aprovado → 3. Assinatura do empreiteiro (→ 4. envio, se religado)
  const naFila = D.NA_FILA.includes(B.status), assinado = !!(aprovado && ult.assinatura), envio = B.envios[B.envios.length - 1];
  const passo = (n, est, txt) => `<div class="p${est ? " " + est : ""}"><b>${n}</b> ${txt}</div>`;
  const fluxoFinal = !(B.itens.length || B.extras.length || aprovado) ? "" : `<div class="noprint mc-final">
    ${passo(1, aprovado || naFila ? "ok" : "on", aprovado || naFila ? `Enviado para aprovação ✔${envio ? ` <small style="font-weight:600;color:var(--mut)">${quandoBR(envio.em)}</small>` : ""}` : `Enviar para aprovação <small style="font-weight:600;color:var(--mut)">(botão abaixo)</small>`)}
    ${passo(2, aprovado ? "ok" : naFila ? "on" : "", aprovado ? "Aprovado ✔" : naFila ? "Aguardando aprovação" : "Aprovação")}
    ${passo(3, assinado ? "ok" : aprovado ? "on" : "", assinado ? `Assinado por ${esc(ult.assinatura.nome)} ✔` : aprovado ? `<a class="oc-btn p" href="${b0}/boletim/${esc(B.id)}/assinar">✍ Colher assinatura do empreiteiro</a>` : "Assinatura do empreiteiro")}
    ${ENVIO_BOLETIM ? passo(4, assinado ? "on" : "", assinado ? envioBotoes(B, ult, emp, O, b0) : `<span style="color:var(--mut)">Mandar ao empreiteiro (depois da assinatura)</span>`) : ""}</div>`;   // passo 4 (envio): desligado em 12/11 — medicao-chave.js
  const acoes = editar ? `${fluxoFinal}<div class="noprint mc-acoes">
    ${mexe ? `<a class="oc-btn" href="${b0}/lancar?emp=${esc(B.emp)}&data=${esc(ultLanc)}">+ Lançar serviços</a>` : D.podeRevogar(B, user) ? botaoRevogar(B, b0, aprovado, ult) : ""}
    ${B.itens.length || B.extras.length ? `<a class="oc-btn" href="${b0}/boletim/${esc(B.id)}/pdf?visual=1" title="${aprovado ? "PDF da versão aprovada — para salvar ou imprimir" : "Prévia em PDF do que está no boletim (ainda não aprovado) — para salvar ou imprimir"}">📄 PDF</a>` : ""}
    ${(B.versoes || []).length ? `<select class="oc-btn" onchange="if(this.value) location.href='${b0}/boletim/${esc(B.id)}?v='+this.value"><option value="">Versões aprovadas…</option>${B.versoes.map(x => `<option value="${x.n}">versão ${x.n} · ${quandoBR(x.em)}</option>`).join("")}</select>` : ""}
    <span style="flex:1"></span>
    ${B.status === D.ESTADOS.aberto && (B.itens.length || B.extras.length) ? `<form method="POST" action="${b0}/boletim/${esc(B.id)}/enviar" style="margin:0" onsubmit="return confirm('Enviar o boletim nº ${B.numero} de ${esc(nomeEmp(R, B.emp)).replace(/'/g, "")} para aprovação?')"><button class="oc-btn p" style="font-size:14px;padding:10px 18px">Enviar para aprovação</button></form>` : ""}
    ${minha ? `<form method="POST" action="${b0}/boletim/${esc(B.id)}/aprovar" style="margin:0"><button class="oc-btn p" style="font-size:14px;padding:10px 18px">${B.status === D.ESTADOS.fila1 ? "Aprovar (engenharia)" : "Aprovar (final)"}</button></form>` : ""}
    ${podeDev ? `<form method="POST" action="${b0}/boletim/${esc(B.id)}/devolver" style="margin:0;display:flex;gap:6px" onsubmit="var t=this.motivo.value.trim(); if(t.length<5){ alert('Escreva o motivo da devolução.'); return false; }">
      <input name="motivo" list="mcMotDev" maxlength="300" placeholder="Motivo da devolução (escolha ou escreva)" class="mc-i" style="min-width:260px;width:auto"><datalist id="mcMotDev">${MOTIVOS_DEVOLVER.map(x => `<option value="${esc(x)}">`).join("")}</datalist><button class="oc-btn v">Devolver</button></form>` : ""}
    ${D.NA_FILA.includes(B.status) && !minha && !podeDev ? `<span style="font-size:12px;color:var(--mut)">${!D.ETAPA_DIRETORIA ? "Esperando o Gerente de Engenharia" : B.status === D.ESTADOS.fila1 ? "Esperando a engenharia" : "Esperando a Diretoria"}</span>` : ""}</div>` : `<div class="noprint mc-acoes"><button class="oc-btn" onclick="window.print()">Imprimir / salvar em PDF</button></div>`;
  const cab = `<table class="cab"><tbody><tr><td>Obra</td><td><b>${esc(O.nome)}</b></td><td>Empreiteiro</td><td><b>${esc(M.empNome)}</b></td></tr>
    <tr><td>Competência</td><td>${mesLongo(B.mes)}</td><td>CPF/CNPJ</td><td>${esc(doc(M.empDoc)) || "—"}</td></tr>
    <tr><td>Boletim</td><td><b>nº ${B.numero}</b>${V ? ` · versão ${V.n}` : ""}</td><td>Função</td><td>${esc(M.empFuncao) || "—"}</td></tr>
    <tr><td>Situação</td><td colspan="3">${V ? `<span class="md-st aprovada">aprovado</span> versão ${V.n}` : chipBol(B)}${!V && ult && B.status === D.ESTADOS.ok ? ` · aprovado em ${quandoBR(ult.em)} por ${esc(ult.por)}` : ""}</td></tr></tbody></table>`;
  const fotos = (B.fotos || []).length || mexe ? `<div class="noprint"><h2 style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;margin:18px 0 6px">Fotos do boletim <small style="text-transform:none;letter-spacing:0;color:var(--mut);font-weight:600">(gerais; as de cada item ficam no 📷 da linha)</small></h2>
    ${miniaturas(B.fotos || [], b0) || `<div class="oc-vazio" style="padding:4px">Sem fotos gerais.</div>`}
    ${mexe ? `<form method="POST" action="${b0}/boletim/${esc(B.id)}/fotos" enctype="multipart/form-data" style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="file" name="fotos" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*" required><button class="oc-btn">Anexar</button></form>` : ""}</div>` : "";
  // os dois popups (observação e foto de uma linha) — um só de cada, preenchido pelo botão clicado
  const popups = mexe ? `<dialog id="mcDlgNota" class="mc-dlg"><form method="POST" action="${b0}/boletim/${esc(B.id)}/nota"><input type="hidden" name="alvo">
      <div class="mc-qt" style="margin:0 0 4px">Observação</div><div class="rot"></div>
      <textarea name="texto" rows="6" class="mc-i" maxlength="1500" placeholder="Escreva a observação deste item (vazio apaga)"></textarea>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Salvar</button></div></form></dialog>
    <dialog id="mcDlgFoto" class="mc-dlg"><form method="POST" action="${b0}/boletim/${esc(B.id)}/fotos" enctype="multipart/form-data"><input type="hidden" name="alvo">
      <div class="mc-qt" style="margin:0 0 4px">Fotos</div><div class="rot"></div><div class="ja"></div>
      <input type="file" name="fotos" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/*" required style="margin:8px 0">
      <div style="font-size:12px;color:var(--mut)">Pode escolher várias de uma vez, sem limite. Imagem (jpg, png, webp) ou PDF.</div>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Cancelar</button><button class="oc-btn p">Anexar</button></div></form></dialog>
    <script>
    function mcAbreNota(b){ var d=document.getElementById('mcDlgNota'); d.querySelector('[name=alvo]').value=b.getAttribute('data-alvo'); d.querySelector('.rot').textContent=b.getAttribute('data-rot');
      var t=d.querySelector('textarea'); t.value=b.getAttribute('data-txt')||''; mcGuardaRolagem(); d.showModal(); t.focus(); }
    function mcAbreFoto(b){ var d=document.getElementById('mcDlgFoto'); d.querySelector('[name=alvo]').value=b.getAttribute('data-alvo'); d.querySelector('.rot').textContent=b.getAttribute('data-rot');
      d.querySelector('input[type=file]').value=''; mcGuardaRolagem(); d.showModal(); }
    function mcAbreCor(b){ var d=document.getElementById('mcDlgCor'), c=d.querySelector('.corpo'); d.querySelector('.rot').textContent=b.getAttribute('data-rot');
      c.innerHTML=''; c.appendChild(b.parentNode.querySelector('template').content.cloneNode(true)); mcGuardaRolagem(); d.showModal(); }
    </script>
    <dialog id="mcDlgCor" class="mc-dlg"><div class="mc-qt" style="margin:0 0 4px">Corrigir</div><div class="rot"></div><div class="corpo"></div>
      <div style="font-size:12px;color:var(--mut);margin-top:8px">O % é a parte deste empreiteiro sobre o serviço inteiro. Nada some: o removido fica guardado, com quem e quando.</div>
      <div class="bt"><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>` : "";
  const body = `${CSS_ORC}${CSS}${JS}
  <a class="pg-volta" href="${b0}?aba=boletins&mes=${esc(B.mes)}"><span class="seta">←</span> Boletins · ${esc(O.nome)}</a>
  <div class="oc-topo"><h1>Boletim nº ${B.numero} · ${esc(emp.nome || "?")} · ${mesBR(B.mes)}</h1><div class="tot"><small>Total bruto</small><b>${brl(M.total)}</b></div></div>
  ${aviso(m, e)}${aviso2.join("")}${acoes}
  ${!V && B.status !== D.ESTADOS.ok && (B.itens.length || B.extras.length) ? painelConferencia(O, B, R, D.conferencia(O, B)) : ""}
  <div class="oc-painel mc-bol" style="border-top:1px solid #ece8dc;border-radius:16px">
    <div style="display:flex;align-items:baseline;gap:12px;border-bottom:3px solid var(--acento);padding-bottom:8px;margin-bottom:10px"><b style="font-size:18px;letter-spacing:.04em">${esc(M.empresa)}</b><span style="font-size:16px;font-weight:800">Boletim de medição</span>
      ${!V && B.status !== D.ESTADOS.ok ? `<span class="md-st fila" style="margin-left:auto">ainda não aprovado</span>` : ""}</div>
    ${cab}${tabelaBoletim(M, { editar: mexe, b0, servs: mexe ? servicosPorPav(R) : [] })}${fotos}${popups}
    ${blocoAssinaturas(B, V || (B.status === D.ESTADOS.ok ? ult : null), M.empNome, b0, M.empresa)}</div>
  <div class="oc-sec noprint">Linha do tempo do boletim</div><div class="noprint">${linhaDoTempo(B)}</div>
  ${zonaExcluir(B, user, b0, M)}`;
  return shell({ title: `Boletim nº ${B.numero} · ${M.empNome} · ${O.nome}`, body, user });
}
/** CONFERÊNCIA PARA APROVAÇÃO (10/11): alertas (com as linhas), comparativo com os meses anteriores e o mini-mapa de onde foi
 *  medido. Aparece no boletim ainda não aprovado; clicar no alerta leva às linhas (que piscam). */
/** Motivos prontos para devolver um boletim (aparecem como sugestão; dá para completar o texto). */
const MOTIVOS_DEVOLVER = ["Falta foto do serviço medido", "% lançado acima do executado na obra", "Extra sem justificativa suficiente", "Serviço lançado no local errado",
  "Serviço lançado para o empreiteiro errado", "Valor fora do combinado", "Medição de serviço que não é deste mês"];
const NIVEL = { alto: ["#a8321f", "#fbe7e3", "Atenção"], medio: ["#9a6a0a", "#fdf2d8", "Conferir"], baixo: ["#5f5f66", "#f1f1f3", "Para saber"] };
function painelConferencia(O, B, R, C) {
  const al = C.alertas.length ? C.alertas.map(a => { const [cor, fundo, rot] = NIVEL[a.nivel];
    return `<div class="mc-al" style="border-left-color:${cor};background:${fundo}"${a.linhas.length ? ` onclick="mcVaiLinhas('${a.linhas.join(",")}')" title="Clique para ver as linhas no boletim"` : ""}>
      <b style="color:${cor}">${rot}</b> ${esc(a.titulo)}${a.linhas.length ? ` <small class="lk">ver linhas ${a.linhas.length > 12 ? a.linhas.slice(0, 12).join(", ") + "…" : a.linhas.join(", ")}</small>` : ""}<div class="d">${esc(a.detalhe)}</div></div>`; }).join("")
    : `<div class="oc-ok" style="margin:0">Nada fora do comum neste boletim.</div>`;
  const mx = Math.max(...C.historico.map(h => h.total), C.media || 0, 1);
  const comp = C.historico.length > 1 ? `<div class="mc-cmp">${C.historico.map(h => `<div class="c${h.atual ? " on" : ""}" title="${mesLongo(h.mes)}: ${brl(h.total)}"><span class="v">${curtoBRL(h.total)}</span><i style="height:${Math.max(2, h.total / mx * 70).toFixed(1)}px"></i><small>${mesBR(h.mes)}</small></div>`).join("")}
      ${C.media ? `<div class="md" style="bottom:${(18 + C.media / mx * 70).toFixed(1)}px" title="média dos meses anteriores">média ${curtoBRL(C.media)}</div>` : ""}</div>`
    : `<div style="font-size:12.5px;color:var(--mut)">Primeiro boletim deste empreiteiro nesta obra: sem meses anteriores para comparar.</div>`;
  const pavs = predio(R).flatMap(x => x.pavs).filter(p => R.locais.some(l => l.pav === p.id && C.porLocal[l.id]));
  const mapa = pavs.length ? pavs.map(p => `<div class="mc-mm"><b>${esc(p.nome)}</b><div>${R.locais.filter(l => l.pav === p.id).map(l => C.porLocal[l.id]
      ? `<span class="on" title="${esc(l.nome)}: ${brl(C.porLocal[l.id])} neste boletim">${esc(l.nome)}<small>${curtoBRL(C.porLocal[l.id])}</small></span>` : `<span>${esc(l.nome)}</span>`).join("")}</div></div>`).join("")
    : `<div style="font-size:12.5px;color:var(--mut)">Sem locais (só extras gerais).</div>`;
  return `<div class="noprint mc-conf-p"><div class="mc-qt" style="margin:0 0 8px">Conferência para aprovação <small>o que merece atenção, calculado do próprio boletim</small></div>
    <div class="mc-conf-g"><div>${al}</div><div><div class="mc-qt" style="margin:0 0 6px;font-size:10.5px">Total do boletim × meses anteriores</div>${comp}</div></div>
    <details class="mc-mmb"${pavs.length <= 4 ? " open" : ""}><summary class="mc-qt" style="margin:10px 0 6px;font-size:10.5px">Onde foi medido <small>${pavs.length} pavimento(s) — em dourado os locais deste boletim</small></summary>${mapa}</details></div>
    <script>function mcVaiLinhas(s){ var ns=s.split(','), pri=null; document.querySelectorAll('.mc-pisca').forEach(function(e){ e.classList.remove('mc-pisca'); });
      ns.forEach(function(n){ var tr=document.getElementById('mc-ln-'+n); if(tr){ tr.classList.add('mc-pisca'); if(!pri) pri=tr; } }); if(pri) pri.scrollIntoView({behavior:'smooth',block:'center'}); }</script>`;
}
// ---------------------------------------------------------------- assinaturas, impressão, assinatura com o dedo e envio
const diaHora = iso => iso ? `${dataBR(String(iso).slice(0, 10))} às ${String(iso).slice(11, 16)}` : "";
/** As linhas das aprovações de uma versão (ou as que já aconteceram, se ainda não há versão): o "carimbo" digital. */
function carimbos(B, V) {
  const ap = V ? (V.aprovacoes || []) : (B.aprovacoes || []), eng = ap.find(a => a.etapa === "engenharia"), dir = ap.find(a => a.etapa === "diretoria");
  if (V && !ap.length) return [`✔ Aprovado ${V.por === "planilha" ? "na planilha de medição (antes do sistema)" : `por ${V.por}`}`];
  const lEng = eng && `✔ Aprovado digitalmente por ${eng.por} (engenharia) em ${diaHora(eng.em)}`, lDir = dir && `✔ Aprovado digitalmente por ${dir.por} (Diretoria) em ${diaHora(dir.em)}`;
  if (!D.ETAPA_DIRETORIA) { const l = [lEng, lDir].filter(Boolean); return l.length ? l : ["Aguardando a aprovação do Gerente de Engenharia"]; }   // 12/11: uma etapa só
  return [lEng || "Aguardando a aprovação da engenharia", lDir || "Aguardando a aprovação da Diretoria"];
}
/** O campo de assinaturas do boletim: a aprovação digital (engenharia e Diretoria) e a assinatura do empreiteiro (desenhada
 *  com o dedo no celular), mais o código de conferência da versão. */
function blocoAssinaturas(B, V, empNome, b0, empresa = EMPRESA_BOLETIM) {
  const ass = V && V.assinatura;
  return `<div class="mc-ass2">
    <div class="cx"><div class="t">${carimbos(B, V).map(t => `<div${t.startsWith("✔") ? ` class="ok"` : ""}>${esc(t)}</div>`).join("")}</div><div class="l">Aprovação · ${esc(empresa)} · Engenharia</div></div>
    <div class="cx">${ass ? `<div class="t"><img src="${b0}/foto/${esc(ass.arquivo)}" alt="assinatura"><div class="ok">Assinado por ${esc(ass.nome)} em ${diaHora(ass.em)}</div><small>colhida por ${esc(ass.coletadoPor)} na tela do celular</small></div>`
      : `<div class="t vazio"></div>`}<div class="l">${esc(empNome)} · empreiteiro</div></div></div>
  ${V ? `<div class="mc-cod">Versão ${V.n} · código de conferência <b>${esc(D.codigoDe(B, V))}</b></div>` : ""}`;
}
/** O botão "Compartilhar PDF" do boletim assinado, que abre as três opções: WhatsApp cadastrado e e-mail cadastrado (o
 *  SERVIDOR manda, com o PDF anexado — precisa do e-mail configurado) e Compartilhar (a lista do próprio
 *  aparelho: WhatsApp, Gmail…, já com o PDF). */
function envioBotoes(B, V, emp, O, b0) {
  const url = `${b0}/boletim/${encodeURIComponent(B.id)}/pdf`, reg = `${b0}/boletim/${encodeURIComponent(B.id)}/enviado`, auto = envioLigado();
  const total = D.somaBoletim(V.itens, V.extras), txt = `Boletim de medição nº ${B.numero} — ${O.nome} — ${mesLongo(B.mes)}. Total ${brl(total.normal + total.extra)}. Código de conferência ${D.codigoDe(B, V)}.`;
  const nomeArq = nomeDoPDF(B, emp, O);
  const tel = String(emp.telefone || "").replace(/\D/g, ""), ult = (V.envios || [])[(V.envios || []).length - 1];
  const opcao = (canal, rotulo, destino, falta) => `<form method="POST" action="${b0}/boletim/${esc(B.id)}/mandar" style="margin:0"><input type="hidden" name="canal" value="${canal}">
    <button class="mc-opc"${!destino || !auto ? " disabled" : ""}><b>${rotulo}</b><small>${destino ? esc(destino) : falta}${destino && !auto ? " · falta ligar no servidor" : ""}</small></button></form>`;
  return `<span class="mc-envio"><button type="button" class="oc-btn p" onclick="document.getElementById('mcDlgEnvio').showModal()">📤 Compartilhar PDF</button>
    ${ult ? `<span class="mc-dica">mandado ${V.envios.length}× · último ${quandoBR(ult.em)} (${esc(ult.canal)}${ult.para ? " · " + esc(ult.para) : ""})</span>` : ""}</span>
  <dialog id="mcDlgEnvio" class="mc-dlg"><div class="mc-qt" style="margin:0 0 4px">Mandar o boletim ao empreiteiro</div><div class="rot">${esc(emp.nome || "")} · boletim nº ${B.numero} · versão ${V.n}</div>
    <div class="mc-opcs">
      ${opcao("whatsapp", "Enviar para o WhatsApp cadastrado", tel ? fone(tel) : "", "sem WhatsApp no cadastro de empreiteiros")}
      ${opcao("email", "Enviar para o e-mail cadastrado", emp.email || "", "sem e-mail no cadastro de empreiteiros")}
      <button type="button" class="mc-opc" onclick="mcCompartilhar('${url}','${esc(nomeArq).replace(/'/g, "")}','${esc(txt).replace(/'/g, "")}','${reg}')"><b>Compartilhar</b><small>abre a lista do próprio aparelho (WhatsApp, Gmail…), já com o PDF</small></button>
    </div>
    ${!tel || !emp.email ? `<div style="font-size:12px;margin-top:8px"><a href="/obras/medicao-empreiteiros?obra=${esc(O.obra)}">Completar o WhatsApp e o e-mail no cadastro de empreiteiros</a></div>` : ""}
    <div class="bt"><a class="oc-btn" href="${url}?baixar=1" onclick="mcRegistra('${reg}','baixar')">Baixar PDF</a><button type="button" class="oc-btn" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>
  <script>
  function mcRegistra(reg, canal){ try{ fetch(reg,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'canal='+canal,keepalive:true}); }catch(e){} }
  async function mcCompartilhar(url, nome, txt, reg){
    try{ var r=await fetch(url); if(!r.ok) throw new Error('o PDF não saiu'); var b=await r.blob(); var f=new File([b], nome, {type:'application/pdf'});
      if(navigator.canShare && navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:nome, text:txt}); mcRegistra(reg,'compartilhar'); }
      else { alert('Este aparelho não compartilha arquivo direto (no computador é assim). O PDF vai ser baixado: anexe no WhatsApp ou no e-mail.'); mcRegistra(reg,'baixar'); location.href=url+'?baixar=1'; } }
    catch(e){ if(e && e.name==='AbortError') return; alert('Não deu para compartilhar: '+e.message); } }
  </script>`;
}
/** O nome do arquivo do PDF de um boletim (para o download pelo navegador). */
/** A TELA DO PDF DO BOLETIM (13/11): o PDF no quadro e, em cima, IMPRIMIR, Salvar em PDF, Abrir em aba nova e Voltar.
 *  (A moldura do painel, paginaVisualizador, só tem o Salvar — por isso a do boletim é nossa.) */
export function paginaPdfBoletim(user, obra, bid, urlPdf) {
  const O = D.lerObra(obra), B = O && O.boletins.find(x => x.id === bid); if (!B) return null;
  const aprov = B.status === D.ESTADOS.ok && !!D.versaoAprovada(B), emp = (D.calcular(O).emp || {})[B.emp] || {}, volta = `${base(obra)}/boletim/${encodeURIComponent(bid)}`;
  const body = `${CSS_ORC}${CSS}<style>.bp-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 12px}.bp-bar h2{font-size:17px;font-weight:800;margin:0}.bp-bar small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
    .bp-ac{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}.bp-q{position:relative;background:#fff;border:1px solid #eae5d6;border-radius:12px;overflow:hidden;height:78vh;min-height:480px}
    .bp-q iframe{width:100%;height:100%;border:0;display:block}@media(max-width:760px){.bp-q{height:64vh}.bp-ac{margin-left:0;width:100%}}</style>
    <a class="pg-volta" href="${volta}"><span class="seta">←</span> Boletim</a>
    <div class="bp-bar"><div><h2>Boletim nº ${B.numero} · ${esc(emp.nome || "?")} · ${mesBR(B.mes)}</h2><small>${aprov ? "versão aprovada" : `<b style="color:#a8321f">prévia — ainda não aprovado</b>`}</small></div>
      <div class="bp-ac"><button type="button" class="oc-btn p" onclick="bpImprime()">🖨 Imprimir</button><a class="oc-btn" href="${urlPdf}?baixar=1">⬇ Salvar em PDF</a>
        <a class="oc-btn" href="${urlPdf}" target="_blank">Abrir em aba nova</a><a class="oc-btn" href="${volta}">Voltar</a></div></div>
    <div class="bp-q"><iframe id="bpPdf" src="${urlPdf}" title="Boletim de medição"></iframe></div>
    <div style="font-size:11.5px;color:var(--mut);margin-top:8px">Se o documento não aparecer no quadro (alguns celulares), use <b>Abrir em aba nova</b> — e imprima de lá.</div>
    <script>function bpImprime(){ var f=document.getElementById('bpPdf'); try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ window.open(f.src,'_blank'); } }</script>`;
  return shell({ title: `PDF · Boletim nº ${B.numero} · ${emp.nome || ""}`, body, user });
}
export function nomeArquivoBoletim(obra, bid) { const O = D.lerObra(obra), B = O && O.boletins.find(x => x.id === bid); if (!B) return "Boletim.pdf"; return nomeDoPDF(B, (D.calcular(O).emp || {})[B.emp] || {}, O); }
const nomeDoPDF = (B, emp, O) => `Boletim ${B.numero} - ${emp.nome || "Empreiteiro"} - ${O.nome} - ${B.mes}.pdf`.replace(/[\\/:*?"<>|]/g, "-");   // nome COMPLETO do empreiteiro (05/11)
/** Manda o boletim assinado pelo SERVIDOR (WhatsApp ou e-mail do cadastro), com o PDF da versão aprovada anexado.
 *  Quem manda de verdade é a ponte (enviarMensagem); sem ela, avisa. */
/** A MENSAGEM que vai com o boletim (05/11). E-mail curto, saudação, o resumo em valores
 *  e os contatos, assinado pela empresa, com o aviso de mensagem automática (não responder); o detalhe está no PDF anexado. WhatsApp: o mesmo conteúdo, no formato do WhatsApp.
 *  Valores BRUTOS: o pagamento é com o RH/Financeiro (decisão de 03/11). */
export function mensagemBoletim(O, B, V, emp, canal = "email") {
  const M = D.montarBoletim(O, B, { versao: V }), nome1 = String(emp.nome || "").trim().split(/\s+/)[0] || "";
  const Nome1 = nome1 ? nome1.charAt(0).toUpperCase() + nome1.slice(1).toLowerCase() : "";
  const mes = mesLongo(B.mes), assunto = `Boletim de medição nº ${B.numero} · ${O.nome} · ${mes} · ${emp.nome || ""}`.trim();
  // WhatsApp (05/11): o mesmo resumo e os mesmos contatos do e-mail, sem código de conferência; *negrito* e _itálico_ do WhatsApp
  if (canal === "whatsapp") return { assunto, texto: [
    `Olá, ${Nome1 || "tudo bem"}!`,
    `Segue em anexo o boletim de medição dos serviços executados na obra ${O.nome}, referente a ${mes}.`,
    ``,
    `*RESUMO*`,
    `Medição: ${brl(M.valor)}`,
    `Medição extra: ${brl(M.extra)}`,
    `*TOTAL BRUTO: ${brl(M.total)}*`,
    ``,
    `Os valores acima são BRUTOS. Dúvidas sobre pagamento: RH / Financeiro da ${M.empresa}.`,
    `Dúvidas sobre a medição: fale com a engenharia da obra.`,
    ``,
    `Engenharia · ${M.empresa}`,
    `_Esta é uma mensagem automática. Por favor, não responda._`,
  ].join("\n"),
    // para o MODELO aprovado na Meta (WhatsApp Business): o texto fixo fica na Meta; vão só as 6 partes que mudam
    modelo: "boletim_medicao", variaveis: [Nome1 || "tudo bem", O.nome, mes, brl(M.valor), brl(M.extra), brl(M.total)] };
  const partes = [
    `Olá, ${Nome1 || "tudo bem"}!`,
    ``,
    `Segue em anexo o boletim de medição dos serviços executados na obra ${O.nome}, referente a ${mes}.`,
    ``,
    `RESUMO`,
    `Medição: ${brl(M.valor)}`,
    `Medição extra: ${brl(M.extra)}`,
    `TOTAL BRUTO: ${brl(M.total)}`,
    ``,
    `Os valores acima são BRUTOS. Dúvidas sobre pagamento: RH / Financeiro da ${M.empresa}.`,
    `Dúvidas sobre a medição: fale com a engenharia da obra.`,
    ``,
    `Atenciosamente,`,
    `Engenharia · ${M.empresa}`,
    ``,
    `Esta é uma mensagem automática. Por favor, não responda este e-mail.`,
  ];
  return { assunto, texto: partes.join("\n") };
}
export async function mandarAoEmpreiteiro(user, obra, bid, canal) {
  if (!ENVIO_BOLETIM) return { erro: "O envio do boletim ao empreiteiro está desligado por enquanto (medicao-chave.js)." };
  if (!envioLigado()) return { erro: "O envio automático ainda não está ligado no servidor (configure o e-mail no config.json). Use \"Compartilhar\"." };
  const O = D.lerObra(obra); if (!O) return { erro: "Obra não encontrada." };
  const B = O.boletins.find(x => x.id === bid); if (!B) return { erro: "Boletim não encontrado." };
  const V = D.versaoAprovada(B); if (!V || !V.assinatura || B.status !== D.ESTADOS.ok) return { erro: "Só dá para mandar o boletim aprovado e assinado." };
  const emp = (D.calcular(O).emp || {})[B.emp] || {};
  if (!["whatsapp", "email"].includes(canal)) return { erro: "Escolha WhatsApp ou e-mail." };
  const para = canal === "whatsapp" ? String(emp.telefone || "").replace(/\D/g, "") : String(emp.email || "");
  if (!para) return { erro: `${emp.nome || "O empreiteiro"} está sem ${canal === "whatsapp" ? "WhatsApp" : "e-mail"} no cadastro.` };
  const { assunto, texto, modelo, variaveis } = mensagemBoletim(O, B, V, emp, canal);
  let r;
  try {
    r = await PONTE.enviarMensagem({ canal, para: canal === "whatsapp" ? "55" + para : para, nome: emp.nome || "", assunto, texto, ...(modelo ? { modelo, variaveis } : {}),
      anexo: { nomeArquivo: nomeDoPDF(B, emp, O), tipo: "application/pdf", conteudo: pdfBoletim(obra, bid) }, quem: user && (user.nome || user.usuario), origem: `medicao/${obra}/${bid}/v${V.n}` });
  } catch (e) { return { erro: "O servidor não conseguiu mandar: " + String(e.message || e).slice(0, 200) }; }
  if (!r || r.erro) return { erro: "O servidor não conseguiu mandar: " + String((r && r.erro) || "sem resposta").slice(0, 200) };
  D.registrarEnvio(obra, bid, canal, user, { para: canal === "whatsapp" ? fone(para) : para, automatico: true });
  return { ok: true };
}
/** COLHER A ASSINATURA: tela para o celular — o empreiteiro confere o resumo e assina com o dedo no quadro. */
export function paginaAssinar(user, obra, bid, { e = "" } = {}) {
  const O = D.lerObra(obra); if (!O) return null;
  const B = O.boletins.find(x => x.id === bid); if (!B) return null;
  const V = D.versaoAprovada(B), b0 = base(obra), R = D.calcular(O), emp = R.emp[B.emp] || {};
  if (!V || B.status !== D.ESTADOS.ok) return null;
  const s = D.somaBoletim(V.itens, V.extras);
  const body = `${CSS_ORC}${CSS}
  <a class="pg-volta" href="${b0}/boletim/${esc(B.id)}"><span class="seta">←</span> Voltar ao boletim</a>
  ${e ? `<div class="oc-msg e">${esc(e)}</div>` : ""}
  <div class="mc-assinar">
    ${V.assinatura ? `<div class="oc-ok">Esta versão já foi assinada por ${esc(V.assinatura.nome)} em ${diaHora(V.assinatura.em)}.</div>` : `
    <div class="mc-cart" style="margin:12px 0"><div class="mc-qt" style="margin:0">Boletim de medição nº ${B.numero} · versão ${V.n}</div>
      <div style="font-size:15px;font-weight:800;margin:4px 0">${esc(emp.nome || "?")}</div>
      <div style="font-size:13px">${esc(O.nome)} · ${mesLongo(B.mes)}</div>
      <div style="font-size:24px;font-weight:800;margin:8px 0 2px;font-variant-numeric:tabular-nums">${brl(s.normal + s.extra)}</div>
      <div style="font-size:12px;color:var(--mut)">${V.itens.length} lançamento(s)${V.extras.length ? ` + ${V.extras.length} extra(s)` : ""} · código <b>${esc(D.codigoDe(B, V))}</b></div>
      <div style="margin-top:8px"><a href="${b0}/boletim/${esc(B.id)}/pdf?visual=1" target="_blank">Ver o boletim completo (PDF)</a></div></div>
    <form method="POST" action="${b0}/boletim/${esc(B.id)}/assinar" id="mcFA" onsubmit="mcAbreAss(); return false;">
      <label class="mc-l">Nome de quem assina</label><input name="nome" value="${esc(emp.nome || "")}" class="mc-i" required maxlength="120">
      <input type="hidden" name="assinatura" id="mcAss">
      <button type="button" class="oc-btn p" id="mcAbre" onclick="mcAbreAss()" style="width:100%;font-size:16px;padding:16px;margin-top:14px">✍️ Coletar assinatura</button>
      <div style="font-size:12px;color:var(--mut);margin-top:8px;text-align:center">Abre a tela inteira para assinar. Vire o celular de lado.</div>
      <div style="font-size:12px;color:var(--mut);margin-top:10px">Ao confirmar, a assinatura fica gravada nesta versão do boletim (código ${esc(D.codigoDe(B, V))}), com data e hora.</div>
    </form>
    <div class="mc-cheia vazia" id="mcCheia">
      <div class="barra"><button type="button" onclick="mcFechaAss()">Cancelar</button><b>${esc(emp.nome || "")} · nº ${B.numero} · ${brl(s.normal + s.extra)}</b>
        <button type="button" onclick="mcLimpa()">Limpar</button><button type="button" class="p" id="mcOk" disabled onclick="mcAssina()">Confirmar</button></div>
      <canvas id="mcCanvas"></canvas><span class="linha"></span><span class="dica" id="mcDica">assine aqui, com o dedo</span>
      <div class="vire"><span>📱</span>Vire o celular de lado para assinar<br><small>(ou assine assim mesmo)</small></div>
    </div>
    <script>
    (function(){ var tela=document.getElementById('mcCheia'), c=document.getElementById('mcCanvas'), x=c.getContext('2d'), ok=document.getElementById('mcOk');
      var tracos=[], atual=null;   // os traços guardados em fração da tela: redesenha ao virar o celular
      function ajusta(){ var r=c.getBoundingClientRect(), d=window.devicePixelRatio||1; if(!r.width) return; c.width=Math.round(r.width*d); c.height=Math.round(r.height*d); x.setTransform(d,0,0,d,0,0); desenha(); }
      function estilo(){ x.lineWidth=3; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#111'; }
      function desenha(){ var r=c.getBoundingClientRect(); x.clearRect(0,0,r.width,r.height); estilo();
        tracos.forEach(function(t){ x.beginPath(); t.forEach(function(p,k){ var X=p[0]*r.width, Y=p[1]*r.height; if(k) x.lineTo(X,Y); else { x.moveTo(X,Y); x.lineTo(X+0.1,Y+0.1); } }); x.stroke(); }); }
      function marca(){ var tem=tracos.length>0; ok.disabled=!tem; tela.classList.toggle('vazia', !tem); document.getElementById('mcDica').style.display=tem?'none':''; }
      function pos(e){ var r=c.getBoundingClientRect(); return [(e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height]; }
      c.addEventListener('pointerdown', function(e){ e.preventDefault(); c.setPointerCapture(e.pointerId); atual=[pos(e)]; tracos.push(atual); desenha(); marca(); });
      c.addEventListener('pointermove', function(e){ if(!atual) return; e.preventDefault(); var r=c.getBoundingClientRect(), a=atual[atual.length-1], p=pos(e); atual.push(p);
        estilo(); x.beginPath(); x.moveTo(a[0]*r.width,a[1]*r.height); x.lineTo(p[0]*r.width,p[1]*r.height); x.stroke(); });
      ['pointerup','pointercancel'].forEach(function(t){ c.addEventListener(t, function(){ atual=null; }); });
      window.mcLimpa=function(){ tracos=[]; atual=null; desenha(); marca(); };
      window.mcAbreAss=function(){
        var nome=document.querySelector('#mcFA [name=nome]'); if(!nome.value || nome.value.trim().length<3){ alert('Escreva o nome de quem está assinando.'); nome.focus(); return; }
        tela.classList.add('on'); document.body.style.overflow='hidden';
        var el=document.documentElement, fs=el.requestFullscreen||el.webkitRequestFullscreen;
        var vira=function(){ try{ if(screen.orientation&&screen.orientation.lock) screen.orientation.lock('landscape').catch(function(){}); }catch(_){} };
        try{ var pr=fs&&fs.call(el); if(pr&&pr.then) pr.then(vira).catch(function(){}); else vira(); }catch(_){}
        setTimeout(ajusta,60); };
      window.mcFechaAss=function(){ tela.classList.remove('on'); document.body.style.overflow='';
        try{ if(screen.orientation&&screen.orientation.unlock) screen.orientation.unlock(); }catch(_){}
        try{ var sai=document.exitFullscreen||document.webkitExitFullscreen; if(document.fullscreenElement||document.webkitFullscreenElement) sai.call(document); }catch(_){} };
      window.mcAssina=function(){ if(!tracos.length){ alert('Assine antes de confirmar.'); return; }
        // a imagem: só a área assinada (com folga), em até 1200 px de largura
        var r=c.getBoundingClientRect(), x0=1,y0=1,x1=0,y1=0; tracos.forEach(function(t){ t.forEach(function(p){ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); }); });
        var X0=x0*r.width-20, Y0=y0*r.height-20, W=(x1-x0)*r.width+40, H=(y1-y0)*r.height+40, k=Math.min(2, 1200/W), o=document.createElement('canvas');
        o.width=Math.max(60,Math.round(W*k)); o.height=Math.max(40,Math.round(H*k)); var ox=o.getContext('2d'); ox.lineWidth=3*k; ox.lineCap='round'; ox.lineJoin='round'; ox.strokeStyle='#111';
        tracos.forEach(function(t){ ox.beginPath(); t.forEach(function(p,n){ var X=(p[0]*r.width-X0)*k, Y=(p[1]*r.height-Y0)*k; if(n) ox.lineTo(X,Y); else { ox.moveTo(X,Y); ox.lineTo(X+0.1,Y+0.1); } }); ox.stroke(); });
        document.getElementById('mcAss').value=o.toDataURL('image/png'); ok.disabled=true; mcFechaAss(); document.getElementById('mcFA').submit(); };
      window.addEventListener('resize', function(){ if(tela.classList.contains('on')) setTimeout(ajusta,60); });
      document.addEventListener('fullscreenchange', function(){ if(tela.classList.contains('on')) setTimeout(ajusta,60); }); })();
    </script>`}
  </div>`;
  return shell({ title: `Assinatura · boletim nº ${B.numero} · ${emp.nome || ""}`, body, user });
}
/** O PDF do boletim: a ÚLTIMA VERSÃO APROVADA (congelada), com a MESMA estrutura da tela (medicao-pdf.js desenha). Sem
 *  versão aprovada não há PDF — só o "Imprimir (prévia)" da tela. Devolve o arquivo (Buffer) ou null. */
export function pdfBoletim(obra, bid) {
  const O = D.lerObra(obra); if (!O) return null;
  const B = O.boletins.find(x => x.id === bid); if (!B) return null;
  const Vap = D.versaoAprovada(B), aprov = !!(Vap && B.status === D.ESTADOS.ok);   // 13/11: sem aprovação, sai a PRÉVIA do que está no boletim
  if (!aprov && !B.itens.length && !B.extras.length) return null;
  const V = aprov ? Vap : { n: 0, aprovacoes: [], assinatura: null };
  const M = D.montarBoletim(O, B, { versao: aprov ? Vap : null }), cod = aprov ? D.codigoDe(B, Vap) : "prévia";
  const pd = new DocPDF(), ML = 28, MR = pd.L - 28, W = MR - ML, BASE = pd.A - 40, LH = 8.6, TD = 7.2;
  let y = 0;
  const cabecalho = (continua = "") => {
    y = 28;
    pd.texto(ML, y + 14, M.empresa, { tam: 16, negrito: true }); pd.texto(ML + largura(M.empresa, 16, true) + 12, y + 14, "Boletim de medição", { tam: 12.5, negrito: true });
    pd.texto(MR, y + 14, aprov ? `nº ${B.numero} · versão ${V.n}` : `nº ${B.numero} · PRÉVIA — ainda não aprovado`, { tam: 9, alinhar: "d", c: aprov ? "#6b6b72" : "#a8321f", negrito: !aprov });
    pd.ret(ML, y + 21, W, 2.2, { fundo: CORES_PDF.acento }); y += 32;
    if (continua) { pd.texto(ML, y + 4, `${M.empNome} · ${O.nome} · ${mesLongo(B.mes)} — ${continua}`, { tam: 8, c: "#6b6b72" }); y += 12; }
  };
  const quebraPagina = (h, continua) => { if (y + h <= BASE) return false; pd.nova(); cabecalho(continua); return true; };
  cabecalho();
  // o quadro de dados (como na tela)
  for (const [k1, v1, k2, v2] of [["Obra", O.nome, "Empreiteiro", M.empNome], ["Competência", mesLongo(B.mes), "CPF/CNPJ", doc(M.empDoc) || "—"], ["Boletim", aprov ? `nº ${B.numero} · versão ${V.n}` : `nº ${B.numero} · prévia (ainda não aprovado)`, "Função", M.empFuncao || "—"]]) {
    pd.texto(ML, y + 9, k1, { tam: 8, negrito: true, c: "#8a8a92" }); pd.texto(ML + 72, y + 9, v1, { tam: 8.5, negrito: true, maxW: W / 2 - 80 });
    pd.texto(ML + W / 2, y + 9, k2, { tam: 8, negrito: true, c: "#8a8a92" }); pd.texto(ML + W / 2 + 72, y + 9, v2, { tam: 8.5, negrito: true, maxW: W / 2 - 76 }); y += 13;
  }
  y += 8;
  // uma tabela da tela: cabeçalho preto com letra dourada, linhas compactas, total; continua na página seguinte se precisar
  const tabela = (titulo, cols, linhas, rotTotal, total, vazio) => {
    const thH = 15, cab = () => { pd.ret(ML, y, W, thH, { fundo: CORES_PDF.escuro }); let x = ML;
      for (const c of cols) { pd.texto(c.d ? x + c.w - 4 : x + 4, y + 10, c.t.toUpperCase(), { tam: 6.3, negrito: true, c: CORES_PDF.acentoClaro, alinhar: c.d ? "d" : "e", maxW: c.w - 6 }); x += c.w; } y += thH; };
    quebraPagina(16 + thH + 18, "continuação");
    pd.texto(ML, y + 9, titulo.toUpperCase(), { tam: 9, negrito: true }); y += 14; cab();
    linhas.forEach((ln, i) => {
      const cel = cols.map(c => c.quebra ? pd.quebra(c.v(ln), c.w - 8, TD, false, 3) : [c.v(ln)]), h = Math.max(...cel.map(l => l.length)) * LH + 4.5;
      if (quebraPagina(h, `${titulo.toLowerCase()} (continuação)`)) cab();
      if (i % 2) pd.ret(ML, y, W, h, { fundo: "#faf8f2" });
      let x = ML;
      cols.forEach((c, k) => { cel[k].forEach((t, j) => pd.texto(c.d ? x + c.w - 4 : x + 4, y + 9 + j * LH, t, { tam: TD, alinhar: c.d ? "d" : "e", maxW: c.quebra ? 0 : c.w - 7 })); x += c.w; });
      y += h; pd.linha(ML, y, MR, y, { c: "#e6e1d2", esp: 0.4 });
    });
    if (!linhas.length) { pd.texto(ML + 4, y + 11, vazio, { tam: TD, c: "#8a8a92" }); y += 16; }
    quebraPagina(16, `${titulo.toLowerCase()} (continuação)`);
    pd.ret(ML, y, W, 15, { fundo: "#f4f1e6" });
    pd.texto(MR - cols[cols.length - 1].w - 8, y + 10.3, rotTotal, { tam: 8, negrito: true, alinhar: "d" }); pd.texto(MR - 4, y + 10.3, total, { tam: 8, negrito: true, alinhar: "d" });
    y += 15 + 14;
  };
  tabela("Medições", [
    { t: "Nº", w: 18, d: 1, v: x => String(x.n) }, { t: "Descrição", w: 128, quebra: 1, v: x => `${x.tipo} - ${x.servico}` }, { t: "Pavimento", w: 58, quebra: 1, v: x => x.pavimento },
    { t: "Local", w: 50, quebra: 1, v: x => x.local }, { t: "Un.", w: 22, v: x => x.unidade }, { t: "Valor un.", w: 52, d: 1, v: x => brl(x.pu) }, { t: "Quant.", w: 46, d: 1, v: x => num(x.qtd, 2) },
    { t: "% med.", w: 38, d: 1, v: x => pct(x.pct, 1) }, { t: "% ant.", w: 38, d: 1, v: x => pct(x.anterior, 1) }, { t: "% acum.", w: 36, d: 1, v: x => pct(x.acumulado, 1) },
    { t: "Valor", w: W - 486, d: 1, v: x => brl(x.valor) }], M.itens, "Total medições", brl(M.valor), "Sem medições normais.");
  tabela("Medições extras", [
    { t: "Nº", w: 18, d: 1, v: x => String(x.n) }, { t: "Serviço", w: 170, quebra: 1, v: x => x.servico },
    { t: "Pavimento", w: 70, quebra: 1, v: x => x.pavimento || "—" }, { t: "Local", w: 62, quebra: 1, v: x => x.local || "—" }, { t: "Motivo", w: W - 320 - 56, quebra: 1, v: x => x.motivo },
    { t: "Valor", w: 56, d: 1, v: x => brl(x.valor) }], M.extras, "Total extras", brl(M.extra), "Sem extras.");
  // observações: a geral e as de cada item (texto; as fotos ficam no sistema — só a contagem)
  const obs = [];
  if (M.obs) obs.push({ rot: "Geral", txt: M.obs });
  for (const x of [...M.itens, ...M.extras]) {
    const t = [x.nota, ...(x.obs || [])].filter(Boolean).join(" · ");
    if (t || (x.fotos || []).length) obs.push({ rot: `Item ${x.n}`, txt: (t || "") + ((x.fotos || []).length ? `${t ? " " : ""}(${x.fotos.length} foto${x.fotos.length > 1 ? "s" : ""} no sistema)` : "") });
  }
  if (obs.length) {
    quebraPagina(30, "observações (continuação)");
    pd.texto(ML, y + 9, "OBSERVAÇÕES", { tam: 9, negrito: true }); y += 15;
    for (const o of obs) {
      const ls = pd.quebra(o.txt, W - 62, 7.8);
      if (quebraPagina(Math.min(ls.length, 3) * 10 + 4, "observações (continuação)")) {}
      pd.texto(ML + 4, y + 8, o.rot, { tam: 7.8, negrito: true });
      ls.forEach((l, j) => { if (j && quebraPagina(10, "observações (continuação)")) {} pd.texto(ML + 56, y + 8, l, { tam: 7.8 }); y += 10; });
      y += 3;
    }
    y += 8;
  }
  // resumo + assinaturas ficam juntos (não se separam entre páginas)
  quebraPagina(70 + 150, "resumo e assinaturas");
  pd.texto(ML, y + 9, "RESUMO", { tam: 9, negrito: true }); y += 14;
  for (const [k, v, n] of [["Medição", brl(M.valor)], ["Medição extra", brl(M.extra)], ["Total bruto", brl(M.total), 1]]) {
    if (n) pd.ret(ML, y, 230, 15, { fundo: "#f4f1e6" });
    pd.texto(ML + 6, y + 10.5, k, { tam: 8.5, negrito: !!n }); pd.texto(ML + 224, y + 10.5, v, { tam: 8.5, negrito: !!n, alinhar: "d" });
    pd.linha(ML, y + 15, ML + 230, y + 15, { c: "#e6e1d2", esp: 0.4 }); y += 15;
  }
  y += 22;
  const cw = W / 2 - 14, xd = ML + W / 2 + 14, alto = 96;
  // o carimbo de aprovação fica logo ACIMA da linha (como a assinatura do outro lado), centralizado — 13/11
  const linhasCar = []; for (const c of carimbos(B, aprov ? V : null)) for (const l of pd.quebra(c.replace("✔ ", "✓ ").replace("✓ ", ""), cw - 8, 8, c.startsWith("✔"))) linhasCar.push({ l, ok: c.startsWith("✔") });
  let ye = y + alto - 8 - linhasCar.length * 11;
  for (const { l, ok } of linhasCar) { pd.texto(ML + cw / 2, ye + 8, l, { tam: 8, negrito: ok, c: ok ? "#1f6b3a" : "#8a8a92", alinhar: "c" }); ye += 11; }
  const ass = V.assinatura;
  if (ass) {
    let png = null; try { png = readFileSync(`${D.PASTA_FOTOS}/${obra}/${ass.arquivo}`); } catch {}
    if (png) pd.imagem(png, xd + 10, y, cw - 20, 64);
    pd.texto(xd + cw / 2, y + 76, `Assinado por ${ass.nome} em ${diaHora(ass.em)}`, { tam: 7.8, negrito: true, c: "#1f6b3a", alinhar: "c", maxW: cw });
    pd.texto(xd + cw / 2, y + 86, `colhida por ${ass.coletadoPor} na tela do celular`, { tam: 7, c: "#8a8a92", alinhar: "c", maxW: cw });
  }
  pd.linha(ML, y + alto, ML + cw, y + alto, { c: "#333333", esp: 0.7 }); pd.linha(xd, y + alto, xd + cw, y + alto, { c: "#333333", esp: 0.7 });
  pd.texto(ML + cw / 2, y + alto + 11, `Aprovação · ${M.empresa} · Engenharia`, { tam: 8, negrito: true, alinhar: "c" });
  pd.texto(xd + cw / 2, y + alto + 11, `${M.empNome} · empreiteiro`, { tam: 8, negrito: true, alinhar: "c", maxW: cw });
  pd.texto(ML + W / 2, y + alto + 32, aprov ? `Versão ${V.n} · código de conferência ${cod}` : "PRÉVIA — ainda não aprovado: sem código de conferência", { tam: 8, c: "#6b6b72", alinhar: "c" });
  // rodapé de todas as páginas
  const n = pd.paginas.length;
  pd.paginas.forEach((pg, i) => { pd.pg = pg;
    pd.linha(ML, pd.A - 26, MR, pd.A - 26, { c: "#e6e1d2", esp: 0.5 });
    pd.texto(ML, pd.A - 16, `${M.empresa} · Boletim de medição nº ${B.numero} · ${M.empNome} · ${O.nome} · ${mesBR(B.mes)} · ${aprov ? "código " + cod : "PRÉVIA, ainda não aprovado"}`, { tam: 7, c: "#8a8a92", maxW: W - 60 });
    pd.texto(MR, pd.A - 16, `pág. ${i + 1}/${n}`, { tam: 7, c: "#8a8a92", alinhar: "d" }); });
  // prévia: marca d'água em todas as páginas (13/11) — não é o documento que vale
  if (!aprov) pd.marcaDagua(["PRÉVIA", D.NA_FILA.includes(B.status) ? "EM APROVAÇÃO" : "NÃO APROVADO"], { tam: 76, entre: 1.05 });
  return pd.pdf();
}
