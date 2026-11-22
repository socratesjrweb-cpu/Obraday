// contratos.js — MEDIÇÃO POR CONTRATO (22/11/2026).
//
// Um contrato = um prestador de serviço (nome, CPF ou CNPJ, endereço) + a lista de serviços contratados
// (quantidade, valor unitário e total) + o arquivo do contrato. A medição é lançada por item, em % ou em
// quantidade (um vira o outro na hora), e nunca passa do saldo. Cada medição fica no histórico com quem fez,
// quando, o valor e os anexos; cancelar exige motivo e não apaga nada.
//
// Quem faz o quê: Diretoria, Gerente de Engenharia e Administrador cadastram, editam contratos e cancelam
// medição; o Engenheiro vê e mede os contratos das obras dele (as mesmas regras de obra da Medição).
// Dados: dados/setores/contratos/contratos.json · arquivos: dados/anexos/contratos/
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readFile } from "node:fs";
import { join } from "node:path";
import { shell, cabecalhoPagina, lerFormulario, salvarArquivo, nomeSeguro, tipoDoArquivo, LIMITE_LOTE,
  DIR_SETORES, DIR_ANEXOS, OBRAS_DOCS, agoraLocalISO, isoLocal, MARCA } from "../ponte-engenharia.js";
import { podeGerir, podeObra, lerObra } from "./medicao-dados.js";
import { resumoEstrutura, existeEstrutura } from "./estrutura.js";

const PASTA = join(DIR_SETORES, "contratos"), ARQ = join(PASTA, "contratos.json");
export const PASTA_ARQ = join(DIR_ANEXOS, "contratos");
const BASE = "/obras/contratos";
const EXT_CONTRATO = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

// ---------------------------------------------------------------- formatos
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const r4 = v => Math.round((Number(v) || 0) * 10000) / 10000;
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v, max = 2, min = 0) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
const pct = (v, c = 1) => (Number.isFinite(v) ? v * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }) + "%";
const dataBR = iso => /^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "—";
const quandoBR = iso => iso ? `${dataBR(iso)} ${String(iso).slice(11, 16)}` : "";
const quem = u => (u && (u.nome || u.usuario)) || "?";
const soDig = s => String(s || "").replace(/\D/g, "");
const docFmt = d => { d = soDig(d); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d; };
const txt = (s, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const novoId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Número digitado do jeito brasileiro: "1.234,56", "1234,5", "12" (e também "12.5" quando não há vírgula). */
export function lerNum(t) {
  let s = String(t ?? "").trim().replace(/[^\d,.-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s); return Number.isFinite(n) ? n : null;
}

/** CPF e CNPJ com os dígitos verificadores. */
export function cpfOk(c) {
  c = soDig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}
export function cnpjOk(c) {
  c = soDig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += +c[i] * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +c[12] && dv(13) === +c[13];
}

// ---------------------------------------------------------------- arquivo
function ler() {
  let d; try { d = JSON.parse(readFileSync(ARQ, "utf8")); } catch { d = null; }
  d ||= {}; d.prestadores ||= []; d.contratos ||= []; d.seq ||= {};
  return d;
}
function gravar(d) {
  if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true });
  const t = ARQ + ".tmp"; writeFileSync(t, JSON.stringify(d, null, 1)); renameSync(t, ARQ);
}
const obraNome = id => (OBRAS_DOCS.find(o => o.id === id) || {}).nome || id;
const obrasDoUsuario = user => OBRAS_DOCS.filter(o => podeObra(user, o.id));
const vivas = C => (C.medicoes || []).filter(m => !m.cancelada);

/** As contas do contrato: por item (contratado, medido, saldo) e o total. */
export function contas(C) {
  const med = {}, val = {};
  for (const m of vivas(C)) for (const l of m.linhas) { med[l.item] = (med[l.item] || 0) + l.qtd; val[l.item] = (val[l.item] || 0) + l.valor; }
  const itens = (C.itens || []).filter(i => !i.removido).map(i => {
    const total = r2(i.qtd * i.pu), medido = r4(med[i.id] || 0), valMed = r2(val[i.id] || 0);
    return { ...i, total, medido, valMed, saldo: r4(i.qtd - medido), saldoValor: r2(total - valMed), p: i.qtd > 0 ? medido / i.qtd : 0 };
  });
  const total = r2(itens.reduce((s, i) => s + i.total, 0)), medido = r2(itens.reduce((s, i) => s + i.valMed, 0));
  return { itens, total, medido, saldo: r2(total - medido), p: total > 0 ? medido / total : 0 };
}
/** Nome do item: "Alvenaria — Tipo 01" quando é um local de um serviço macro. */
export const rotulo = i => i.local ? `${i.desc} — ${i.local}` : i.desc;
/** Os itens em blocos para a tela: serviço simples, ou o serviço macro com os locais dele (na ordem do cadastro). */
function blocos(itens) {
  const out = [], porG = new Map();
  for (const i of itens) {
    if (!i.grupo) { out.push({ item: i }); continue; }
    let b = porG.get(i.grupo); if (!b) { b = { grupo: i.grupo, nome: i.desc, itens: [] }; porG.set(i.grupo, b); out.push(b); }
    b.itens.push(i);
  }
  for (const b of out) if (b.itens) {
    const s = k => b.itens.reduce((t, i) => t + (i[k] || 0), 0), uns = new Set(b.itens.map(i => i.un));
    Object.assign(b, { total: r2(s("total")), valMed: r2(s("valMed")), saldoValor: r2(s("saldoValor")), un: uns.size === 1 ? b.itens[0].un : "" });
    b.p = b.total > 0 ? b.valMed / b.total : 0;
    if (b.un) Object.assign(b, { qtd: r4(s("qtd")), medido: r4(s("medido")), saldo: r4(s("saldo")) });
  }
  return out;
}
const situacao = (C, K) => C.encerrado ? ["Encerrado", "sl-cinza"] : !vivas(C).length ? ["Sem medição", "sl-amarelo"] : K.saldo <= 0.005 ? ["100% medido", "sl-verde"] : ["Em andamento", "sl-azul"];
const podeVer = (user, C) => !!C && podeObra(user, C.obra);
const prestadorDe = (d, C) => d.prestadores.find(p => p.id === C.prestador) || { nome: "?", doc: "", endereco: "" };

// ---------------------------------------------------------------- estilo das telas
const CSS = `<style>
.ct-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 16px}
.ct-kpi{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:12px 14px}
.ct-kpi small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
.ct-kpi b{display:block;font-size:20px;font-variant-numeric:tabular-nums;margin-top:3px}.ct-kpi em{font-style:normal;font-size:12px;color:var(--mut)}
.ct-bar{height:8px;background:#efebe0;border-radius:99px;overflow:hidden;margin:8px 0 4px}.ct-bar i{display:block;height:100%;background:var(--acento);border-radius:99px}
.ct-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.ct-chip{border:1px solid #d9d3c3;background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;color:#3a3a42}
.ct-chip.on{background:var(--escuro);border-color:var(--escuro);color:#fff}
.ct-busca{flex:1;min-width:200px;padding:11px 14px;border:1.5px solid #e3e0d6;border-radius:11px;font-size:16px;background:#fff}
.ct-lista{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.ct-card{display:block;background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:16px;position:relative;transition:.15s}
.ct-card:hover{box-shadow:0 10px 24px rgba(20,20,25,.08);border-color:#e1d9c0}
.ct-card .nr{font-size:11px;font-weight:800;letter-spacing:.06em;color:var(--acento-escuro)}
.ct-card h3{font-size:16px;margin:3px 0 2px}.ct-card .ob{font-size:12.5px;color:var(--mut)}
.ct-card .vl{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#4a4a52;margin-top:6px;font-variant-numeric:tabular-nums}
.ct-card .selo{position:absolute;top:12px;right:12px;margin:0}
.ct-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #e0d9c4;background:#fff;color:#3a3226;border-radius:12px;padding:12px 18px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;min-height:46px}
.ct-btn:hover{border-color:var(--acento);color:var(--acento-escuro)}
.ct-btn.p{background:var(--escuro);border-color:var(--escuro);color:#fff}.ct-btn.p:hover{filter:brightness(1.15);color:#fff}
.ct-btn.g{font-size:15px;padding:14px 22px}
.ct-btn.mini{min-height:34px;padding:6px 12px;font-size:12.5px;border-radius:9px}
.ct-btn.perigo{color:#9a3a3a;border-color:#e6c4c4}
.ct-acoes{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 18px}
.ct-sec{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:16px 18px;margin:0 0 14px}
.ct-sec>h3{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6a6a72;margin:0 0 10px}
.ct-dados{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 18px;font-size:14px}
.ct-dados small{display:block;font-size:11px;color:var(--mut);font-weight:600}
.ct-t{width:100%;border-collapse:collapse;font-size:13.5px}
.ct-t th{text-align:left;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);padding:7px 8px;border-bottom:2px solid #eee7d6;white-space:nowrap}
.ct-t td{padding:9px 8px;border-bottom:1px solid #f2efe4;vertical-align:top}
.ct-t .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ct-t tr.tot td{font-weight:800;border-top:2px solid var(--acento);background:#fbf7ec}
.ct-t tr.canc td{color:#b0b0b8;text-decoration:line-through}.ct-t tr.canc td.nao{text-decoration:none}
.ct-rolar{overflow-x:auto}
.ct-f label{display:block;font-size:12.5px;font-weight:700;color:#444;margin:0 0 5px}
.ct-f input,.ct-f select,.ct-f textarea{width:100%;padding:11px 12px;border:1.5px solid #e3e0d6;border-radius:10px;font:inherit;font-size:16px;background:#fbfaf6}
.ct-f input:focus,.ct-f select:focus,.ct-f textarea:focus{outline:none;border-color:var(--acento);background:#fff}
.ct-g{display:grid;grid-template-columns:repeat(2,1fr);gap:12px 16px}.ct-g .full{grid-column:1/-1}
.ct-dica{font-size:12px;color:var(--mut);margin-top:4px}
.ct-err{font-size:12px;color:#b23b3b;margin-top:4px;min-height:0}
/* editor de itens */
.ct-it{display:grid;grid-template-columns:26px minmax(180px,1fr) 70px 110px 130px 120px 92px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px dashed #eee7d6}
.ct-it .n{font-size:12px;font-weight:700;color:var(--mut);text-align:right}
.ct-it .tt{font-weight:700;text-align:right;font-variant-numeric:tabular-nums;font-size:14px}
.ct-it .x{width:44px;height:44px;border:1px solid #e0d9c4;border-radius:10px;background:#fff;color:#8a2d2d;font-size:16px;cursor:pointer}
.ct-it .x:disabled{opacity:.3;cursor:not-allowed}
.ct-it .trava{grid-column:2/-1;font-size:11.5px;color:#8a6d1e}
.ct-it-cab{display:grid;grid-template-columns:26px minmax(180px,1fr) 70px 110px 130px 120px 92px;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.ct-it-tot{display:flex;justify-content:flex-end;gap:10px;font-size:15px;padding:10px 98px 0 0}
/* medição: um cartão por item */
.ct-mi{border:1px solid #ece8dc;border-radius:14px;padding:12px 14px;margin:0 0 10px;background:#fff}
.ct-mi.on{border-color:var(--acento);box-shadow:0 0 0 3px color-mix(in srgb,var(--acento) 14%,transparent)}
.ct-mi.cheio{opacity:.55}
.ct-mi h4{font-size:15px;margin:0 0 4px}
.ct-mi .lin{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12.5px;color:#4a4a52;font-variant-numeric:tabular-nums}
.ct-mi .ent{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.ct-modo{display:inline-flex;border:1px solid #d9d3c3;border-radius:11px;overflow:hidden}
.ct-modo button{border:0;background:#fff;padding:0 16px;min-height:46px;font:inherit;font-size:14px;font-weight:800;color:#5a5a62;cursor:pointer}
.ct-modo button.on{background:var(--escuro);color:#fff}
.ct-mi .v{width:140px;padding:11px 12px;border:1.5px solid #e3e0d6;border-radius:11px;font-size:18px;text-align:right;font-variant-numeric:tabular-nums}
.ct-mi .v:focus{outline:none;border-color:var(--acento)}
.ct-mi .eq{font-size:13px;color:#2f4f3a;font-weight:700;font-variant-numeric:tabular-nums}
.ct-mi .eq.ruim{color:#b23b3b}
.ct-rodape{position:sticky;bottom:0;background:var(--escuro);color:#fff;border-radius:16px 16px 0 0;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;z-index:5}
.ct-rodape b{font-size:19px;font-variant-numeric:tabular-nums}.ct-rodape small{display:block;font-size:11px;opacity:.75}
.ct-rodape .ct-btn{margin-left:auto}
.ct-arqs{display:flex;gap:8px;flex-wrap:wrap}
.ct-log{font-size:12.5px}.ct-log div{padding:5px 0;border-bottom:1px solid #f2efe4}
.ct-vazio{color:var(--mut);font-size:14px;background:#fff;border:1px dashed #ddd6c2;border-radius:14px;padding:22px;text-align:center}
.ct-gw{border:1px solid #e6dfca;border-radius:12px;margin:8px 0;padding:0 8px 4px;background:#fdfbf5}
.ct-gh{display:grid;grid-template-columns:22px minmax(160px,1fr) auto auto;gap:8px;align-items:center;padding:8px 0}
.ct-gh .seta{color:var(--acento-escuro);font-weight:800;text-align:center}
.ct-gh .gn{font-weight:800}.ct-gh .st{font-size:13px;color:#4a4a52;white-space:nowrap;font-variant-numeric:tabular-nums}
.ct-gh .ac{display:flex;gap:6px}
.ct-it.sub .loc{background:#fff;border-style:dashed}
.ct-it .ac{display:flex;gap:4px}
.ct-it .b{width:44px;height:44px;border:1px solid #e0d9c4;border-radius:10px;background:#fff;color:#5a4e2e;font-size:16px;cursor:pointer}
.ct-it .b.x{color:#8a2d2d}.ct-it .b:disabled{opacity:.3;cursor:not-allowed}
.ct-it .b.rep{font-weight:800;color:var(--acento-escuro)}
dialog.ct-rep{width:min(620px,96vw);max-height:92vh}
.ct-rep-l{display:flex;flex-direction:column;gap:2px;max-height:34vh;overflow:auto;margin:6px 0}
.ct-rep-l .pv{border-bottom:1px solid #f2efe4;padding:4px 0}.ct-rep-l .gt{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6a6a72;margin:8px 0 0}
.ct-rep-l label{display:inline-flex;align-items:center;gap:8px;font-size:14px;min-height:36px;cursor:pointer}
.ct-rep-l input[type=checkbox]{width:20px;height:20px}
.ct-rep-l .lk{border:0;background:none;color:var(--acento-escuro);font-size:12px;font-weight:700;cursor:pointer;margin-left:6px}
.ct-rep-l .lcs{display:flex;flex-wrap:wrap;gap:0 16px;padding-left:28px}.ct-rep-l .lcs[hidden]{display:none}
.ct-rep-o{border-top:1px solid #eee7d6;margin-top:8px;padding-top:8px}
.ct-rep-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0}
.ct-in{width:100%;flex:1;padding:9px 10px;border:1.5px solid #e3e0d6;border-radius:10px;font:inherit;font-size:16px;background:#fbfaf6;min-width:0}
.ct-rep-row label{font-size:12px;font-weight:700;color:#444}
.ct-rd{display:flex;align-items:center;gap:8px;font-size:14px;min-height:36px;cursor:pointer}.ct-rd input{width:20px;height:20px}
.ct-t tr.grp td{background:#fbf7ec;font-weight:700;border-top:1px solid #e6dfca}
.ct-t tr.sub td:first-child{padding-left:22px}
.ct-mg{border:1px solid #e6dfca;border-radius:16px;padding:12px 12px 2px;margin:0 0 12px;background:#fdfbf5}
.ct-mg>h4{font-size:15.5px;margin:0 0 2px}.ct-mg .lin{font-size:12.5px;color:#4a4a52;font-variant-numeric:tabular-nums}
.ct-mg .tds{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 10px;font-size:13px;font-weight:700}
.ct-mg .tds .gv{width:100px;padding:9px 10px;border:1.5px solid #e3e0d6;border-radius:10px;font-size:16px;text-align:right}
dialog.ct-dlg{margin:auto;inset:0;position:fixed;height:fit-content;max-height:92vh;overflow:auto;border:0;border-radius:16px;padding:18px;width:min(460px,94vw);box-sizing:border-box;box-shadow:0 18px 48px rgba(0,0,0,.3)}
dialog.ct-dlg::backdrop{background:rgba(23,23,27,.45)}
@media(max-width:760px){
  .ct-g{grid-template-columns:1fr}
  .ct-it-cab{display:none}
  .ct-it{padding:10px 0}
  .ct-it .n{grid-area:n}.ct-it .d{grid-area:d}.ct-it .u{grid-area:u}.ct-it .q{grid-area:q}.ct-it .p{grid-area:p}.ct-it .tt{grid-area:t;align-self:center}
  .ct-it .trava{grid-column:2/-1}
  .ct-it-tot{padding-right:0}
  .ct-it{grid-template-columns:22px 1fr 1fr 92px;grid-template-areas:"n d d ac" ". u q ." ". p t ."}.ct-it .ac{grid-area:ac;justify-content:flex-end}
  .ct-gh{grid-template-columns:22px 1fr;}.ct-gh .st{grid-column:2}.ct-gh .ac{grid-column:2}
  .ct-t.cel thead{display:none}.ct-t.cel tr{display:block;border-bottom:1px solid #eee7d6;padding:8px 0}.ct-t.cel td{display:flex;justify-content:space-between;gap:10px;border:0;padding:3px 0}
  .ct-t.cel td::before{content:attr(data-r);font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
  .ct-t.cel td.r{text-align:right}
}
@media print{.topbar,.foot,.pg-volta,.no-print{display:none !important}body{background:#fff}.wrap{padding:0;max-width:none}.ct-sec{border:0;padding:0}}
</style>`;

const msg = (m, e) => `${m ? `<div class="msg ok">${esc(m)}</div>` : ""}${e ? `<div class="msg err">${esc(e)}</div>` : ""}`;
const barra = p => `<div class="ct-bar"><i style="width:${Math.max(0, Math.min(100, p * 100)).toFixed(1)}%"></i></div>`;
const linkArq = a => `<a class="arq-pdf" href="${BASE}/arquivo/${esc(a.nome)}" target="_blank" rel="noopener">📄 <span>${esc(a.original || a.nome)}<small>${esc(quem({ nome: a.por }))} · ${dataBR(a.em)}</small></span><span class="ab">abrir</span></a>`;

// ---------------------------------------------------------------- 1. lista de contratos
export function paginaLista(user, { obra = "", m = "", e = "" } = {}) {
  const d = ler(), obras = obrasDoUsuario(user), ids = new Set(obras.map(o => o.id));
  const todos = d.contratos.filter(C => ids.has(C.obra)), lista = obra ? todos.filter(C => C.obra === obra) : todos;
  const Ks = lista.map(C => [C, contas(C)]);
  const tot = Ks.reduce((s, [, K]) => ({ t: s.t + K.total, m: s.m + K.medido }), { t: 0, m: 0 });
  const chips = obras.length > 1 ? `<a class="ct-chip${obra ? "" : " on"}" href="${BASE}">Todas</a>${obras.filter(o => todos.some(C => C.obra === o.id)).map(o => `<a class="ct-chip${obra === o.id ? " on" : ""}" href="${BASE}?obra=${encodeURIComponent(o.id)}">${esc(o.nome)}</a>`).join("")}` : "";
  const cards = Ks.sort((a, b) => String(b[0].criadoEm).localeCompare(String(a[0].criadoEm))).map(([C, K]) => {
    const P = prestadorDe(d, C), [st, cls] = situacao(C, K);
    return `<a class="ct-card" href="${BASE}/${esc(C.id)}" data-busca="${esc((C.numero + " " + P.nome + " " + soDig(P.doc) + " " + C.objeto + " " + obraNome(C.obra)).toLowerCase())}">
      <span class="selo ${cls}">${st}</span><div class="nr">${esc(C.numero)}</div><h3>${esc(P.nome)}</h3>
      <div class="ob">${C.objeto ? esc(C.objeto) + " · " : ""}${esc(obraNome(C.obra))}</div>${barra(K.p)}
      <div class="vl"><span>Medido <b>${brl(K.medido)}</b> (${pct(K.p)})</span><span>de ${brl(K.total)}</span></div>
      <div class="vl"><span>Saldo <b>${brl(K.saldo)}</b></span><span>${vivas(C).length} medição(ões)</span></div></a>`;
  }).join("");
  const body = `${CSS}${cabecalhoPagina({ icone: "📝", titulo: "Medição Contratos", sub: "Contratos por prestador de serviço: itens, valores, medição em % ou quantidade, saldo e histórico.", voltar: "/engenharia", voltarRotulo: "Engenharia" })}
    ${msg(m, e)}
    ${podeGerir(user) ? `<div class="ct-acoes"><a class="ct-btn p g" href="${BASE}/novo${obra ? "?obra=" + encodeURIComponent(obra) : ""}">+ Novo contrato</a></div>` : ""}
    <div class="ct-kpis"><div class="ct-kpi"><small>Contratado</small><b>${brl(tot.t)}</b><em>${lista.length} contrato(s)</em></div>
      <div class="ct-kpi"><small>Medido</small><b>${brl(tot.m)}</b><em>${pct(tot.t ? tot.m / tot.t : 0)}</em></div>
      <div class="ct-kpi"><small>Saldo a medir</small><b>${brl(tot.t - tot.m)}</b></div></div>
    <div class="ct-filtros">${chips}${lista.length > 3 ? `<input class="ct-busca" type="search" placeholder="Buscar prestador, CNPJ, nº ou serviço…" oninput="var t=this.value.toLowerCase().trim();document.querySelectorAll('.ct-card').forEach(function(c){c.style.display=!t||c.getAttribute('data-busca').indexOf(t)>-1?'':'none';})">` : ""}</div>
    ${cards ? `<div class="ct-lista">${cards}</div>` : `<div class="ct-vazio">${!obras.length ? "Nenhuma obra liberada para você. Fale com a engenharia." : podeGerir(user) ? "Nenhum contrato ainda. Comece pelo <b>+ Novo contrato</b>." : "Nenhum contrato cadastrado nas suas obras ainda."}</div>`}`;
  return shell({ title: "Medição Contratos", body, user });
}

// ---------------------------------------------------------------- 2. cadastro / edição do contrato
// Os serviços: um serviço simples numa linha, ou um SERVIÇO MACRO (ex.: Alvenaria) desdobrado por pavimento/local
// (Alvenaria — Tipo 01, Tipo 02…), cada local com quantidade e valor unitário próprios (iguais ou diferentes).
// O botão ⤵ da linha replica o serviço nos pavimentos/locais da obra (os mesmos da estrutura da Medição) ou em
// locais digitados. Cada local vira um item do contrato (é ele que se mede); o grupo junta os locais na tela.
const JS_FORM = String.raw`<script>
var CT=JSON.parse(document.getElementById('ctIni').textContent),ctCtx=null;
function ctNum(t){var s=String(t==null?'':t).trim().replace(/[^\d,.-]/g,'');if(!s||!/\d/.test(s))return null;if(s.indexOf(',')>-1)s=s.replace(/\./g,'').replace(',','.');else if((s.match(/\./g)||[]).length>1||/^\d{1,3}\.\d{3}$/.test(s))s=s.replace(/\./g,'');var n=Number(s);return isFinite(n)?n:null;}
function ctBRL(v){return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function ctN(v){return v==null||v===''?'':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:4});}
function ctPU(v){return v==null||v===''?'':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function ctE(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function ctEl(h){var t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstElementChild;}
function ctBox(){return document.getElementById('ctItens');}
function ctLinha(it,sub){it=it||{};var trava=+it.medido>0;
  var r=ctEl('<div class="ct-it'+(sub?' sub':'')+'"><span class="n"></span>'+(sub?'<input class="d loc" maxlength="80" placeholder="Pavimento / local" aria-label="Pavimento ou local">':'<input class="d" maxlength="160" placeholder="Serviço (ex.: Alvenaria de vedação)" aria-label="Serviço">')+
    '<input class="u" maxlength="12" placeholder="un" aria-label="Unidade"><input class="q" inputmode="decimal" placeholder="Qtd" aria-label="Quantidade"><input class="p" inputmode="decimal" placeholder="Valor unit. R$" aria-label="Valor unitário">'+
    '<span class="tt">—</span><span class="ac">'+(sub?'':'<button type="button" class="b rep" title="Replicar em pavimentos / locais" aria-label="Replicar em pavimentos ou locais">⤵</button>')+'<button type="button" class="b x" title="Tirar" aria-label="Tirar">✕</button></span>'+
    (trava?'<div class="trava">Já medido '+ctN(it.medido)+' '+ctE(it.un)+': a quantidade não pode ficar menor e o valor unitário fica travado.</div>':'')+'</div>');
  r.setAttribute('data-id',it.id||'');r.setAttribute('data-med',+it.medido||0);
  r.querySelector('.d').value=sub?(it.local||''):(it.desc||'');r.querySelector('.u').value=it.un||'un';r.querySelector('.q').value=ctN(it.qtd);r.querySelector('.p').value=ctPU(it.pu);
  if(trava){r.querySelector('.p').readOnly=true;r.querySelector('.p').title='Já tem medição: o valor unitário não muda';r.querySelector('.x').disabled=true;var rp=r.querySelector('.rep');if(rp)rp.disabled=true;}
  return r;}
function ctGrupo(nome,gid){var w=ctEl('<div class="ct-gw"><div class="ct-gh"><span class="seta" title="Serviço macro">▾</span><input class="gn" maxlength="160" placeholder="Serviço macro" aria-label="Serviço macro"><span class="st"></span>'+
    '<span class="ac"><button type="button" class="ct-btn mini gadd">+ locais</button><button type="button" class="ct-btn mini gdes" title="Juntar os locais de volta numa linha só">desfazer</button></span></div><div class="ct-gb"></div></div>');
  w.setAttribute('data-grupo',gid||('g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)));w.querySelector('.gn').value=nome||'';return w;}
function ctMonta(its){var box=ctBox(),gs={};box.innerHTML='';
  (its||[]).forEach(function(it){if(it.grupo){var w=gs[it.grupo];if(!w){w=gs[it.grupo]=ctGrupo(it.desc,it.grupo);box.appendChild(w);}w.querySelector('.ct-gb').appendChild(ctLinha(it,true));}else box.appendChild(ctLinha(it));});
  if(!box.children.length)for(var k=0;k<3;k++)box.appendChild(ctLinha({}));ctConta();}
function ctConta(){var tot=0,n=0;
  ctBox().querySelectorAll('.ct-it').forEach(function(r){r.querySelector('.n').textContent=++n;var q=ctNum(r.querySelector('.q').value),p=ctNum(r.querySelector('.p').value),t=Math.round((q||0)*(p||0)*100)/100;
    r.querySelector('.tt').textContent=q!=null&&p!=null?ctBRL(t):'—';r.setAttribute('data-t',t);tot+=t;});
  ctBox().querySelectorAll('.ct-gw').forEach(function(w){var s=0,rs=w.querySelectorAll('.ct-it'),med=0;rs.forEach(function(r){s+=+r.getAttribute('data-t');med+=+r.getAttribute('data-med');});
    w.querySelector('.st').innerHTML=rs.length+' local(is) · <b>'+ctBRL(s)+'</b>';w.querySelector('.gdes').disabled=med>0;});
  document.getElementById('ctTot').textContent=ctBRL(tot);}
function ctNovaLinha(depois,foca){var r=ctLinha({});if(depois&&depois.parentNode)depois.parentNode.insertBefore(r,depois.nextSibling);else ctBox().appendChild(r);ctConta();if(foca)r.querySelector('.d').focus();return r;}
function ctTopo(r){return r.closest('.ct-gw')||r;}
function ctTira(r){var w=r.closest('.ct-gw');
  if(w){if(w.querySelectorAll('.ct-it').length>1)r.remove();else w.remove();}
  else if(ctBox().children.length>1)r.remove();else r.querySelectorAll('input').forEach(function(i){i.value=i.classList.contains('u')?'un':'';});
  if(!ctBox().children.length)ctNovaLinha(null,false);ctConta();}
function ctDesfaz(w){var rs=w.querySelectorAll('.ct-it'),q=0,v=0,pus={};rs.forEach(function(r){var a=ctNum(r.querySelector('.q').value)||0,p=ctNum(r.querySelector('.p').value)||0;q+=a;v+=a*p;pus[p]=1;});
  var varios=Object.keys(pus).length>1;
  if(!confirm('Juntar os '+rs.length+' locais numa linha só?'+(varios?' Os valores unitários são diferentes: fica o valor médio.':'')))return;
  var pu=q?Math.round(v/q*100)/100:ctNum(rs[0].querySelector('.p').value);
  var r=ctLinha({desc:w.querySelector('.gn').value,un:rs[0].querySelector('.u').value,qtd:Math.round(q*10000)/10000,pu:pu});w.parentNode.replaceChild(r,w);ctConta();}
// ---- a janela "Replicar em pavimentos / locais"
function ctRepAbre(alvo){var f=document.querySelector('form.ct-f'),ob=f.obra.value,est=CT.est[ob]||[],w=alvo.closest('.ct-gw'),r=w?w.querySelector('.ct-it'):alvo.closest('.ct-it');
  var nome=w?w.querySelector('.gn').value.trim():r.querySelector('.d').value.trim();
  if(!nome){alert('Escreva o serviço antes de replicar (ex.: Alvenaria).');(w?w.querySelector('.gn'):r.querySelector('.d')).focus();return;}
  var ja={};if(w)w.querySelectorAll('.ct-it .d').forEach(function(i){ja[i.value.trim().toLowerCase()]=1;});
  ctCtx={w:w,r:w?null:r};
  document.getElementById('ctRepNome').textContent=nome;
  document.getElementById('ctRepQ').value=r.querySelector('.q').value;document.getElementById('ctRepP').value=r.querySelector('.p').value;document.getElementById('ctRepUn').textContent=r.querySelector('.u').value||'un';
  var h='',gAnt=null;est.forEach(function(p){var lcs=p.locais||[];if(p.grupo!==gAnt){gAnt=p.grupo;if(p.grupo)h+='<div class="gt">'+ctE(p.grupo)+'</div>';}
    h+='<div class="pv"><label class="pvl"><input type="checkbox" value="'+ctE(p.nome)+'"'+(ja[p.nome.toLowerCase()]?' checked disabled':'')+'> <b>'+ctE(p.nome)+'</b></label>'+
      (lcs.length?'<button type="button" class="lk" onclick="this.nextElementSibling.hidden=!this.nextElementSibling.hidden">'+lcs.length+' local(is) ▸</button><div class="lcs" hidden>'+lcs.map(function(l){var v=p.nome+' › '+l;return '<label><input type="checkbox" value="'+ctE(v)+'"'+(ja[v.toLowerCase()]?' checked disabled':'')+'> '+ctE(l)+'</label>';}).join('')+'</div>':'')+'</div>';});
  document.getElementById('ctRepLista').innerHTML=h||'<div class="ct-dica">'+(ob?'Esta obra ainda não tem pavimentos no cadastro da obra (painel Obras).':'Escolha a obra lá em cima para ver os pavimentos dela.')+' Use os campos abaixo para criar os locais.</div>';
  document.getElementById('ctRepTodos').hidden=!est.length;document.getElementById('ctRepOutros').innerHTML='';
  document.querySelector('input[name=ctModo][value=igual]').checked=true;ctRepModo();document.getElementById('ctDlgRep').showModal();}
function ctRepTodos(){var cs=[].slice.call(document.querySelectorAll('#ctRepLista .pvl input:not(:disabled)')),todos=cs.every(function(c){return c.checked;});cs.forEach(function(c){c.checked=!todos;});}
function ctRepMais(v){v=String(v||'').trim();if(!v)return;var box=document.getElementById('ctRepOutros');
  if([].some.call(document.querySelectorAll('#ctDlgRep input[type=checkbox]'),function(c){return c.value.toLowerCase()===v.toLowerCase();}))return;
  box.appendChild(ctEl('<label><input type="checkbox" value="'+ctE(v)+'" checked> '+ctE(v)+'</label>'));}
function ctRepUm(){var i=document.getElementById('ctRepNovo');ctRepMais(i.value);i.value='';i.focus();}
function ctRepSerie(){var pre=document.getElementById('ctRsPre').value.trim(),de=parseInt(document.getElementById('ctRsDe').value,10),ate=parseInt(document.getElementById('ctRsAte').value,10);
  if(!pre||isNaN(de)||isNaN(ate)||ate<de){alert('Confira o nome e os números (o “até” não pode ser menor que o “de”).');return;}if(ate-de>199){alert('No máximo 200 de uma vez.');return;}
  var w=String(ate).length<2?2:String(ate).length;for(var k=de;k<=ate;k++)ctRepMais(pre+' '+String(k).padStart(w,'0'));}
function ctRepModo(){var m=(document.querySelector('input[name=ctModo]:checked')||{}).value,n=document.querySelectorAll('#ctDlgRep input[type=checkbox]:checked:not(:disabled)').length,q=ctNum(document.getElementById('ctRepQ').value);
  document.getElementById('ctRepInfo').textContent=!n?'Marque os locais.':m==='vazio'?n+' local(is): a quantidade de cada um você preenche depois.':q==null?n+' local(is).':m==='divide'?n+' local(is) com '+ctN(Math.round(q/n*10000)/10000)+' cada (total '+ctN(q)+').':n+' local(is) com '+ctN(q)+' cada (total '+ctN(Math.round(q*n*10000)/10000)+').';}
function ctRepOk(){var ls=[].slice.call(document.querySelectorAll('#ctDlgRep input[type=checkbox]:checked:not(:disabled)')).map(function(c){return c.value;});
  if(!ls.length){alert('Marque pelo menos um pavimento ou local.');return;}
  var m=document.querySelector('input[name=ctModo]:checked').value,q=ctNum(document.getElementById('ctRepQ').value),p=ctNum(document.getElementById('ctRepP').value),un=document.getElementById('ctRepUn').textContent,qs=[];
  if(m!=='vazio'&&(q==null||q<=0)){alert('Preencha a quantidade (ou escolha “preencher depois”).');return;}
  ls.forEach(function(l,k){qs.push(m==='vazio'?null:m==='igual'?q:Math.round(q/ls.length*10000)/10000);});
  if(m==='divide'){var s=0;for(var k=0;k<qs.length-1;k++)s+=qs[k];qs[qs.length-1]=Math.round((q-s)*10000)/10000;}
  var w=ctCtx.w;if(!w){var r=ctCtx.r;w=ctGrupo(r.querySelector('.d').value.trim());r.parentNode.replaceChild(w,r);}
  var gb=w.querySelector('.ct-gb');ls.forEach(function(l,k){gb.appendChild(ctLinha({local:l,un:un,qtd:qs[k],pu:p},true));});
  document.getElementById('ctDlgRep').close();ctConta();var vz=gb.querySelector('.q[value=""],.q:placeholder-shown');if(m==='vazio'&&vz)vz.focus();}
// ---- teclado, colar, cliques
function ctTecla(e){var i=e.target;if(e.key!=='Enter'||i.tagName!=='INPUT')return;e.preventDefault();var r=i.closest('.ct-it');if(!r){if(i.classList.contains('gn')){var f=i.closest('.ct-gw').querySelector('.ct-it .d');if(f)f.focus();}return;}
  var cs=[].slice.call(r.querySelectorAll('input:not([readonly])')),k=cs.indexOf(i);if(k>-1&&k<cs.length-1){cs[k+1].focus();return;}
  var todas=[].slice.call(ctBox().querySelectorAll('.ct-it')),j=todas.indexOf(r);if(j<todas.length-1){todas[j+1].querySelector('.d').focus();return;}
  ctNovaLinha(ctTopo(r),true);}
function ctCola(e){var i=e.target;if(!i.classList||!i.classList.contains('d')||i.classList.contains('loc'))return;var t=(e.clipboardData||window.clipboardData).getData('text');if(t.indexOf('\n')<0&&t.indexOf('\t')<0)return;e.preventDefault();
  var linhas=t.split(/\r?\n/).map(function(l){return l.split('\t').map(function(c){return c.trim();});}).filter(function(c){return c.join('');});
  var r=i.closest('.ct-it');linhas.forEach(function(c,k){if(k>0){var nx=r.nextElementSibling;r=nx&&nx.classList.contains('ct-it')&&!nx.querySelector('.d').value?nx:ctNovaLinha(r,false);}
    var f=['d','u','q','p'];for(var j=0;j<f.length&&j<c.length;j++){var el=r.querySelector('.'+f[j]);if(!el.readOnly&&c[j]!=='')el.value=c[j];}});ctConta();}
function ctDoc(i){var d=i.value.replace(/\D/g,'');if(d.length===11)i.value=d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');else if(d.length===14)i.value=d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');}
function ctPrest(i){var o=document.querySelector('#ctPrestList option[value="'+i.value.replace(/"/g,'\\"')+'"]');if(!o)return;var f=i.form;f.doc.value=o.getAttribute('data-doc');f.endereco.value=o.getAttribute('data-end');f.telefone.value=o.getAttribute('data-tel')||'';f.email.value=o.getAttribute('data-mail')||'';}
function ctEnvia(f){var its=[],erro='',n=0;
  function le(r,base){n++;var q=ctNum(r.querySelector('.q').value),p=ctNum(r.querySelector('.p').value),u=r.querySelector('.u').value.trim()||'un',d=r.querySelector('.d').value.trim();
    var nome=base?base.nome+' — '+(d||'?'):d;if(!base&&!d&&q==null&&p==null)return;
    if(base&&!d)erro=erro||('Linha '+n+' ('+base.nome+'): escreva o pavimento ou local.');else if(!base&&!d)erro=erro||('Linha '+n+': escreva o serviço.');
    else if(q==null||q<=0)erro=erro||('Linha '+n+' ('+nome+'): quantidade maior que zero.');else if(p==null||p<0)erro=erro||('Linha '+n+' ('+nome+'): valor unitário.');
    its.push(base?{id:r.getAttribute('data-id')||'',desc:base.nome,local:d,grupo:base.gid,un:u,qtd:q,pu:p}:{id:r.getAttribute('data-id')||'',desc:d,un:u,qtd:q,pu:p});}
  [].forEach.call(ctBox().children,function(el){if(el.classList.contains('ct-gw')){var nome=el.querySelector('.gn').value.trim();if(!nome)erro=erro||'Escreva o nome do serviço macro.';
      var vistos={};el.querySelectorAll('.ct-it').forEach(function(r){var l=r.querySelector('.d').value.trim().toLowerCase();if(l&&vistos[l])erro=erro||(nome+': o local '+r.querySelector('.d').value.trim()+' aparece duas vezes.');vistos[l]=1;le(r,{nome:nome,gid:el.getAttribute('data-grupo')});});}
    else le(el,null);});
  if(!erro&&!its.length)erro='Cadastre pelo menos um serviço do contrato.';
  if(erro){alert(erro);return false;}f.itensJson.value=JSON.stringify(its);var b=f.querySelector('button[type=submit]');b.disabled=true;b.textContent='Gravando…';return true;}
document.addEventListener('DOMContentLoaded',function(){var box=ctBox();ctMonta(CT.itens);
  box.addEventListener('input',ctConta);box.addEventListener('keydown',ctTecla);box.addEventListener('paste',ctCola);
  box.addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.classList.contains('x'))ctTira(b.closest('.ct-it'));else if(b.classList.contains('rep'))ctRepAbre(b);else if(b.classList.contains('gadd'))ctRepAbre(b);else if(b.classList.contains('gdes'))ctDesfaz(b.closest('.ct-gw'));});
  document.getElementById('ctDlgRep').addEventListener('change',ctRepModo);document.getElementById('ctRepQ').addEventListener('input',ctRepModo);
  document.getElementById('ctRepNovo').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();ctRepUm();}});});
</script>`;

/** Os pavimentos (de baixo para cima, por grupo) e os locais de cada um: a estrutura do CADASTRO CENTRAL da obra. */
function estruturaObra(obra) {
  if (!existeEstrutura(obra)) { try { lerObra(obra); } catch {} }      // a obra que só tinha estrutura na Medição leva para o central
  return resumoEstrutura(obra) || [];
}

/** rascunho = o que a pessoa enviou quando a gravação recusou ({ campos, its }): a tela volta preenchida. */
export function paginaForm(user, id = "", { obra = "", e = "", rascunho = null } = {}) {
  if (!podeGerir(user)) return null;
  const d = ler(), C = id ? d.contratos.find(x => x.id === id) : null;
  if (id && !podeVer(user, C)) return null;
  const P = C ? prestadorDe(d, C) : {}, K = C ? contas(C) : null, obras = obrasDoUsuario(user), R = rascunho && rascunho.campos;
  const medidoDe = iid => { const k = K && iid ? K.itens.find(x => x.id === iid) : null; return k ? k.medido : 0; };
  const itensIni = rascunho ? (rascunho.its || []).map(x => ({ ...x, medido: medidoDe(x.id) }))
    : C ? K.itens.map(i => ({ id: i.id, desc: i.desc, local: i.local || "", grupo: i.grupo || "", un: i.un, qtd: i.qtd, pu: i.pu, medido: i.medido })) : [];
  const ini = JSON.stringify({ itens: itensIni, est: Object.fromEntries(obras.map(o => [o.id, estruturaObra(o.id)])) }).replace(/</g, "\\u003c");
  const v = (k, padrao = "") => esc(R ? R[k] ?? "" : C ? C[k] ?? padrao : padrao);
  const vp = (k, campo = k) => esc(R ? R[campo] ?? "" : campo === "doc" ? docFmt(P.doc || "") : P[k] || "");
  const obraSel = R ? R.obra : C ? C.obra : obra, travaObra = C && vivas(C).length;
  const body = `${CSS}<script type="application/json" id="ctIni">${ini}</script>${JS_FORM}${cabecalhoPagina({ icone: "📝", titulo: C ? `Editar ${esc(C.numero)}` : "Novo contrato", voltar: C ? `${BASE}/${esc(C.id)}` : BASE, voltarRotulo: C ? esc(C.numero) : "Contratos" })}
  ${msg("", e)}
  <form class="ct-f" method="POST" action="${C ? `${BASE}/${esc(C.id)}/editar` : `${BASE}/novo`}" enctype="multipart/form-data" onsubmit="return ctEnvia(this)">
    <input type="hidden" name="itensJson">
    <div class="ct-sec"><h3>Contrato</h3><div class="ct-g">
      <div><label>Obra</label><select name="obra" required${travaObra ? " disabled" : ""}><option value="">Escolha a obra…</option>${obras.map(o => `<option value="${esc(o.id)}"${obraSel === o.id ? " selected" : ""}>${esc(o.nome)}</option>`).join("")}</select>
        ${travaObra ? `<input type="hidden" name="obra" value="${esc(C.obra)}"><div class="ct-dica">Já tem medição: a obra não muda.</div>` : ""}</div>
      <div><label>Nº do contrato</label><input name="numero" maxlength="30" value="${v("numero")}" placeholder="em branco = o sistema numera (CT-001…)"></div>
      <div class="full"><label>Objeto (opcional)</label><input name="objeto" maxlength="160" value="${v("objeto")}" placeholder="Ex.: Execução de alvenaria e reboco — Torre A"></div>
      <div><label>Data de assinatura</label><input type="date" name="data" value="${v("data", isoLocal())}"></div>
      <div><label>Término previsto (opcional)</label><input type="date" name="termino" value="${v("termino")}"></div>
    </div></div>
    <div class="ct-sec"><h3>Prestador de serviço</h3><div class="ct-dica" style="margin:-4px 0 10px">Só o nome é obrigatório; o resto dá para completar depois em “Editar contrato”.</div><div class="ct-g">
      <div class="full"><label>Nome / Razão social</label><input name="pnome" list="ctPrestList" required maxlength="120" value="${vp("nome", "pnome")}" oninput="ctPrest(this)" autocomplete="off" placeholder="Digite: se já tem cadastro, os dados vêm sozinhos">
        <datalist id="ctPrestList">${d.prestadores.map(p => `<option value="${esc(p.nome)}" data-doc="${esc(docFmt(p.doc))}" data-end="${esc(p.endereco)}" data-tel="${esc(p.telefone || "")}" data-mail="${esc(p.email || "")}"></option>`).join("")}</datalist></div>
      <div><label>CPF ou CNPJ (opcional)</label><input name="doc" inputmode="numeric" maxlength="18" value="${vp("doc")}" onblur="ctDoc(this)" placeholder="só números ou com pontos"></div>
      <div><label>Telefone (opcional)</label><input name="telefone" type="tel" maxlength="20" value="${vp("telefone")}"></div>
      <div class="full"><label>Endereço (opcional)</label><input name="endereco" maxlength="200" value="${vp("endereco")}" placeholder="Rua, número, bairro, cidade/UF"></div>
      <div class="full"><label>E-mail (opcional)</label><input name="email" type="email" maxlength="120" value="${vp("email")}"></div>
    </div></div>
    <div class="ct-sec"><h3>Serviços do contrato</h3>
      <div class="ct-dica" style="margin:-4px 0 10px">Um serviço por linha. <b>Enter</b> pula para o próximo campo; dá para <b>colar da planilha</b> (serviço, unidade, quantidade, valor unitário).
        Para dividir um serviço por pavimento ou local (Alvenaria → Tipo 01, Tipo 02…), use <b>⤵</b> na linha: cada local fica com quantidade e valor próprios.</div>
      <div class="ct-it-cab"><span></span><span>Serviço</span><span>Un</span><span>Qtd</span><span>Valor unit.</span><span style="text-align:right">Total</span><span></span></div>
      <div id="ctItens"></div>
      <button type="button" class="ct-btn mini" style="margin-top:10px" onclick="ctNovaLinha(null,true)">+ outro serviço</button>
      <div class="ct-it-tot">Total do contrato <b id="ctTot">R$ 0,00</b></div></div>
    <div class="ct-sec"><h3>Arquivo do contrato</h3>
      ${C && (C.arquivos || []).filter(a => !a.removido).length ? `<div class="ct-arqs" style="margin-bottom:10px">${C.arquivos.filter(a => !a.removido).map(linkArq).join("")}</div>` : ""}
      <input type="file" name="arquivo" multiple accept="${EXT_CONTRATO.join(",")}"><div class="ct-dica">PDF ou foto (JPG/PNG). Pode escolher mais de um (contrato, aditivo, proposta).${rascunho ? " <b>Escolha o arquivo de novo</b>: o envio anterior não foi gravado." : ""}</div></div>
    <div class="ct-acoes"><button type="submit" class="ct-btn p g">${C ? "Salvar alterações" : "Cadastrar contrato"}</button><a class="ct-btn" href="${C ? `${BASE}/${esc(C.id)}` : BASE}">Cancelar</a></div>
  </form>
  <dialog class="ct-dlg ct-rep" id="ctDlgRep"><p style="font-weight:800;font-size:15px;margin:0 0 2px">Replicar em pavimentos / locais</p>
    <div class="ct-dica" style="margin:0 0 10px"><b id="ctRepNome"></b>: cada local marcado vira uma linha com quantidade e valor próprios (dá para ajustar um por um depois).</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:12.5px">Pavimentos da obra</b><button type="button" class="ct-btn mini" id="ctRepTodos" onclick="ctRepTodos()">marcar todos</button></div>
    <div id="ctRepLista" class="ct-rep-l"></div>
    <div class="ct-rep-o"><b style="font-size:12.5px">Outros locais</b>
      <div class="ct-rep-row"><input id="ctRepNovo" class="ct-in" maxlength="80" placeholder="Ex.: Fachada norte, Subsolo, Torre B"><button type="button" class="ct-btn mini" onclick="ctRepUm()">adicionar</button></div>
      <div class="ct-rep-row"><input id="ctRsPre" class="ct-in" value="Tipo" aria-label="Nome" style="max-width:120px"><span>de</span><input id="ctRsDe" class="ct-in" type="number" inputmode="numeric" value="1" style="max-width:70px" aria-label="Do número"><span>até</span><input id="ctRsAte" class="ct-in" type="number" inputmode="numeric" value="10" style="max-width:70px" aria-label="Até o número"><button type="button" class="ct-btn mini" onclick="ctRepSerie()">gerar série</button></div>
      <div id="ctRepOutros" class="ct-rep-l"></div></div>
    <div class="ct-rep-o"><div class="ct-rep-row"><label style="flex:1">Quantidade<input id="ctRepQ" class="ct-in" inputmode="decimal"></label><span id="ctRepUn" style="padding-top:18px;font-weight:700"></span><label style="flex:1">Valor unit. R$<input id="ctRepP" class="ct-in" inputmode="decimal"></label></div>
      <label class="ct-rd"><input type="radio" name="ctModo" value="igual" checked> A mesma quantidade em cada local</label>
      <label class="ct-rd"><input type="radio" name="ctModo" value="divide"> Dividir a quantidade igualmente entre eles</label>
      <label class="ct-rd"><input type="radio" name="ctModo" value="vazio"> Preencher a quantidade de cada um depois</label>
      <div class="ct-dica" id="ctRepInfo"></div></div>
    <div class="ct-acoes" style="margin:12px 0 0;justify-content:flex-end"><button type="button" class="ct-btn" onclick="this.closest('dialog').close()">Voltar</button><button type="button" class="ct-btn p" onclick="ctRepOk()">Replicar</button></div></dialog>`;
  return shell({ title: C ? `Editar ${C.numero}` : "Novo contrato", body, user });
}

/** Grava (novo ou edição). f = campos do formulário multipart, arqs = arquivos enviados. */
export function salvarContrato(user, id, f, arqs) {
  if (!podeGerir(user)) return { erro: "Só a Diretoria, o Gerente de Engenharia ou o Administrador cadastram contrato." };
  const d = ler(), C = id ? d.contratos.find(x => x.id === id) : null;
  if (id && !podeVer(user, C)) return { erro: "Contrato não encontrado." };
  const K = C ? contas(C) : null;
  const obra = C && vivas(C).length ? C.obra : txt(f.obra, 60);
  if (!OBRAS_DOCS.some(o => o.id === obra) || !podeObra(user, obra)) return { erro: "Escolha a obra." };
  const objeto = txt(f.objeto, 160);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(f.data || "") ? f.data : "", termino = /^\d{4}-\d{2}-\d{2}$/.test(f.termino || "") ? f.termino : "";
  // prestador: só o nome é obrigatório
  const pnome = txt(f.pnome, 120), doc = soDig(f.doc), endereco = txt(f.endereco, 200);
  if (pnome.length < 3) return { erro: "Escreva o nome ou a razão social do prestador." };
  // CPF/CNPJ é opcional; se vier, tem que estar certo (um número errado no boletim é pior que nenhum)
  if (doc && (doc.length === 11 ? !cpfOk(doc) : doc.length === 14 ? !cnpjOk(doc) : true)) return { erro: `CPF ou CNPJ inválido (${f.doc}). Confira os números ou deixe em branco.` };
  // itens (o serviço macro chega como vários itens com o mesmo "grupo", um por local)
  let lista; try { lista = JSON.parse(f.itensJson || "[]"); } catch { lista = null; }
  if (!Array.isArray(lista) || !lista.length) return { erro: "Cadastre pelo menos um serviço do contrato." };
  const itens = [], vistos = new Set();
  for (const [k, x] of lista.entries()) {
    const desc = txt(x.desc, 160), local = txt(x.local, 80), grupo = /^[a-z0-9]{1,40}$/i.test(String(x.grupo || "")) ? String(x.grupo) : "";
    const un = txt(x.un, 12) || "un", qtd = r4(lerNum(x.qtd)), pu = r2(lerNum(x.pu)), nome = rotulo({ desc, local });
    if (desc.length < 2) return { erro: `Linha ${k + 1}: escreva o serviço.` };
    if (grupo && !local) return { erro: `Linha ${k + 1} (${desc}): escreva o pavimento ou local.` };
    if (grupo) { const ch = grupo + "|" + local.toLowerCase(); if (vistos.has(ch)) return { erro: `${desc}: o local ${local} aparece duas vezes.` }; vistos.add(ch); }
    if (!(qtd > 0)) return { erro: `Linha ${k + 1} (${nome}): a quantidade precisa ser maior que zero.` };
    if (!(pu >= 0)) return { erro: `Linha ${k + 1} (${nome}): valor unitário inválido.` };
    const velho = C && x.id ? K.itens.find(i => i.id === x.id) : null;
    if (velho && velho.medido > 0) {
      if (qtd + 1e-9 < velho.medido) return { erro: `${nome}: já foram medidos ${num(velho.medido, 4)} ${velho.un}; a quantidade não pode ficar menor.` };
      if (Math.abs(pu - velho.pu) > 0.001) return { erro: `${nome}: já tem medição, o valor unitário não muda.` };
    }
    itens.push({ id: velho ? velho.id : novoId("it"), desc, local: grupo ? local : "", grupo, un, qtd, pu });
  }
  if (C) for (const i of K.itens) if (i.medido > 0 && !itens.some(x => x.id === i.id)) return { erro: `${rotulo(i)}: já tem medição e não pode sair do contrato.` };
  // arquivos (antes de gravar qualquer coisa: se um falhar, nada muda)
  let novos; try { novos = guardarArquivos(arqs, "arquivo", user); } catch (er) { return { erro: er.message }; }
  // grava. Prestador: acha pelo CPF/CNPJ; sem ele, pelo nome
  const chaveNome = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  let P = doc ? d.prestadores.find(p => p.doc === doc) : null;
  if (!P) P = d.prestadores.find(p => chaveNome(p.nome) === chaveNome(pnome) && (!p.doc || !doc));
  const agora = agoraLocalISO();
  if (!P) { P = { id: novoId("pr"), criadoEm: agora, criadoPor: quem(user) }; d.prestadores.push(P); }
  Object.assign(P, { nome: pnome, doc: doc || P.doc || "", endereco: endereco || P.endereco || "", telefone: txt(f.telefone, 20) || P.telefone || "", email: txt(f.email, 120) || P.email || "" });
  let numero = txt(f.numero, 30);
  if (C) {
    const antes = { obra: C.obra, numero: C.numero, objeto: C.objeto, prestador: C.prestador, total: K.total, itens: K.itens.length };
    if (numero && d.contratos.some(x => x !== C && x.obra === obra && x.numero.toLowerCase() === numero.toLowerCase())) return { erro: `Já existe o contrato ${numero} nesta obra.` };
    const porId = new Map((C.itens || []).map(i => [i.id, i]));
    const removidos = (C.itens || []).filter(i => !i.removido && !itens.some(x => x.id === i.id)).map(i => ({ ...i, removido: { em: agora, por: quem(user) } }));
    Object.assign(C, { obra, numero: numero || C.numero, objeto, data, termino, prestador: P.id, itens: [...itens.map(x => ({ ...(porId.get(x.id) || {}), ...x })), ...removidos, ...(C.itens || []).filter(i => i.removido)] });
    C.arquivos = [...(C.arquivos || []), ...novos];
    const depois = contas(C);
    const mud = [antes.total !== depois.total ? `valor ${brl(antes.total)} → ${brl(depois.total)}` : "", antes.itens !== depois.itens.length ? `itens ${antes.itens} → ${depois.itens.length}` : "",
      antes.prestador !== P.id ? `prestador → ${P.nome}` : "", antes.objeto !== objeto ? "objeto" : "", novos.length ? `${novos.length} arquivo(s)` : ""].filter(Boolean).join(" · ");
    (C.historico ||= []).push({ em: agora, por: quem(user), txt: `Editou o contrato${mud ? ": " + mud : ""}` });
    gravar(d); return { ok: true, id: C.id };
  }
  if (!numero) { d.seq[obra] = (d.seq[obra] || 0) + 1; numero = `CT-${String(d.seq[obra]).padStart(3, "0")}`; while (d.contratos.some(x => x.obra === obra && x.numero === numero)) { d.seq[obra]++; numero = `CT-${String(d.seq[obra]).padStart(3, "0")}`; } }
  else if (d.contratos.some(x => x.obra === obra && x.numero.toLowerCase() === numero.toLowerCase())) return { erro: `Já existe o contrato ${numero} nesta obra.` };
  const novo = { id: novoId("ct"), obra, numero, objeto, data, termino, prestador: P.id, itens, arquivos: novos, medicoes: [], criadoEm: agora, criadoPor: quem(user), historico: [] };
  const K2 = contas(novo);
  novo.historico.push({ em: agora, por: quem(user), txt: `Cadastrou o contrato: ${itens.length} item(ns), ${brl(K2.total)}${novos.length ? `, ${novos.length} arquivo(s)` : ""}` });
  d.contratos.push(novo); gravar(d);
  return { ok: true, id: novo.id };
}

function guardarArquivos(arqs, campo, user) {
  const lista = (arqs || []).filter(a => a.campo === campo);
  for (const a of lista) if (!EXT_CONTRATO.includes(a.ext)) throw new Error(`${a.nomeOriginal}: só PDF ou foto (JPG, PNG).`);
  const em = agoraLocalISO();
  return lista.map(a => ({ nome: salvarArquivo(a, PASTA_ARQ), original: txt(a.nomeOriginal, 120), em, por: quem(user) }));
}

// ---------------------------------------------------------------- 3. o contrato
export function paginaContrato(user, id, { m = "", e = "" } = {}) {
  const d = ler(), C = d.contratos.find(x => x.id === id);
  if (!podeVer(user, C)) return null;
  const P = prestadorDe(d, C), K = contas(C), ger = podeGerir(user), [st, cls] = situacao(C, K);
  const arqs = (C.arquivos || []).filter(a => !a.removido);
  const meds = (C.medicoes || []).slice().reverse();
  const itensT = `<div class="ct-rolar"><table class="ct-t cel"><thead><tr><th>Serviço</th><th class="r">Contratado</th><th class="r">Valor unit.</th><th class="r">Total</th><th class="r">Medido</th><th class="r">Saldo</th></tr></thead><tbody>
    ${blocos(K.itens).map(b => b.item ? linhaServ(b.item, false) : `<tr class="grp"><td data-r="Serviço">▾ ${esc(b.nome)} <small style="font-weight:500;color:var(--mut)">${b.itens.length} local(is)</small></td>
      <td class="r" data-r="Contratado">${b.un ? `${num(b.qtd, 4)} ${esc(b.un)}` : ""}</td><td></td><td class="r" data-r="Total">${brl(b.total)}</td>
      <td class="r" data-r="Medido">${b.un ? `${num(b.medido, 4)} ${esc(b.un)} · ` : ""}<b>${pct(b.p)}</b><br><small>${brl(b.valMed)}</small></td><td class="r" data-r="Saldo">${b.un ? `${num(b.saldo, 4)} ${esc(b.un)}<br>` : ""}<small>${brl(b.saldoValor)}</small></td></tr>
      ${b.itens.map(i => linhaServ(i, true)).join("")}`).join("")}
    <tr class="tot"><td data-r="">Total</td><td></td><td></td><td class="r" data-r="Total">${brl(K.total)}</td><td class="r" data-r="Medido">${brl(K.medido)} · ${pct(K.p)}</td><td class="r" data-r="Saldo">${brl(K.saldo)}</td></tr></tbody></table></div>`;
  const medsT = meds.length ? `<div class="ct-rolar"><table class="ct-t cel"><thead><tr><th>Nº</th><th>Data</th><th>Lançada por</th><th class="r">Valor</th><th class="r">Acumulado</th><th></th></tr></thead><tbody>
    ${meds.map(M => { const ac = acumuladoAte(C, M); return `<tr class="${M.cancelada ? "canc" : ""}"><td data-r="Nº"><b>${M.n}ª</b></td><td data-r="Data">${dataBR(M.data)}</td><td data-r="Lançada por">${esc(M.por)}<br><small>${quandoBR(M.em)}</small></td>
      <td class="r" data-r="Valor"><b>${brl(M.valor)}</b></td><td class="r" data-r="Acumulado">${M.cancelada ? "—" : `${brl(ac)} · ${pct(K.total ? ac / K.total : 0)}`}</td>
      <td class="nao" data-r="">${M.cancelada ? `<span class="selo sl-vermelho">cancelada</span><br><small>${esc(M.cancelada.por)}: ${esc(M.cancelada.motivo)}</small>` : `<a class="ct-btn mini" href="${BASE}/${esc(C.id)}/medicao/${esc(M.id)}">Ver / imprimir</a>${ger ? ` <button type="button" class="ct-btn mini perigo" onclick="ctCancela('${esc(M.id)}',${M.n})">Cancelar</button>` : ""}`}</td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="ct-vazio">Nenhuma medição ainda.</div>`;
  const body = `${CSS}${cabecalhoPagina({ icone: "📝", titulo: `${esc(C.numero)} · ${esc(P.nome)}`, sub: `${C.objeto ? esc(C.objeto) + " · " : ""}${esc(obraNome(C.obra))}`, voltar: `${BASE}?obra=${encodeURIComponent(C.obra)}`, voltarRotulo: "Contratos" })}
  ${msg(m, e)}
  <div class="ct-kpis"><div class="ct-kpi"><small>Valor do contrato</small><b>${brl(K.total)}</b><em>${K.itens.length} serviço(s) · <span class="selo ${cls}" style="margin:0">${st}</span></em></div>
    <div class="ct-kpi"><small>Medido</small><b>${brl(K.medido)}</b>${barra(K.p)}<em>${pct(K.p)} do contrato</em></div>
    <div class="ct-kpi"><small>Saldo a medir</small><b>${brl(K.saldo)}</b><em>${vivas(C).length} medição(ões)</em></div></div>
  <div class="ct-acoes no-print">${!C.encerrado && K.saldo > 0.005 ? `<a class="ct-btn p g" href="${BASE}/${esc(C.id)}/medir">📏 Nova medição</a>` : ""}
    ${ger ? `<a class="ct-btn" href="${BASE}/${esc(C.id)}/editar">✎ Editar contrato</a>
      <form method="POST" action="${BASE}/${esc(C.id)}/encerrar" style="margin:0" onsubmit="return confirm('${C.encerrado ? "Reabrir este contrato para novas medições?" : "Encerrar o contrato? Ele para de aceitar medição (dá para reabrir)."}')"><input type="hidden" name="encerrar" value="${C.encerrado ? "0" : "1"}"><button class="ct-btn">${C.encerrado ? "Reabrir contrato" : "Encerrar contrato"}</button></form>` : ""}</div>
  <div class="ct-sec"><h3>Prestador</h3><div class="ct-dados">
    <div><small>Nome / Razão social</small><b>${esc(P.nome)}</b></div>${P.doc ? `<div><small>${soDig(P.doc).length === 11 ? "CPF" : "CNPJ"}</small>${esc(docFmt(P.doc))}</div>` : ""}
    ${P.endereco ? `<div><small>Endereço</small>${esc(P.endereco)}</div>` : ""}${P.telefone ? `<div><small>Telefone</small><a href="tel:${esc(soDig(P.telefone))}">${esc(P.telefone)}</a></div>` : ""}${P.email ? `<div><small>E-mail</small>${esc(P.email)}</div>` : ""}
    <div><small>Assinatura</small>${dataBR(C.data)}${C.termino ? ` · término ${dataBR(C.termino)}` : ""}</div></div></div>
  <div class="ct-sec"><h3>Arquivos do contrato</h3>${arqs.length ? `<div class="ct-arqs">${arqs.map(linkArq).join("")}</div>` : `<div class="ct-dica">Nenhum arquivo anexado.</div>`}
    ${ger ? `<form method="POST" action="${BASE}/${esc(C.id)}/arquivo" enctype="multipart/form-data" class="no-print" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="file" name="arquivo" multiple required accept="${EXT_CONTRATO.join(",")}"><button class="ct-btn mini">Anexar</button></form>` : ""}</div>
  <div class="ct-sec"><h3>Serviços · saldo</h3>${itensT}</div>
  <div class="ct-sec"><h3>Medições</h3>${medsT}</div>
  <div class="ct-sec"><h3>Histórico</h3><div class="ct-log">${(C.historico || []).slice().reverse().map(h => `<div><b>${quandoBR(h.em)}</b> · ${esc(h.por)} — ${esc(h.txt)}</div>`).join("") || "—"}</div></div>
  ${ger ? `<dialog class="ct-dlg" id="ctDlgCanc"><form method="POST" class="ct-f" id="ctFCanc" style="margin:0"><p style="font-weight:800;font-size:15px;margin:0 0 6px">Cancelar a <span id="ctCancN"></span> medição</p>
    <div class="ct-dica" style="margin-bottom:10px">Nada é apagado: a medição fica no histórico riscada, e o valor volta para o saldo.</div>
    <label>Motivo</label><textarea name="motivo" rows="3" required minlength="5" maxlength="300" placeholder="Ex.: lançada no contrato errado"></textarea>
    <div class="ct-acoes" style="margin:12px 0 0;justify-content:flex-end"><button type="button" class="ct-btn" onclick="this.closest('dialog').close()">Voltar</button><button class="ct-btn p">Cancelar a medição</button></div></form></dialog>
    <script>function ctCancela(mid,n){var f=document.getElementById('ctFCanc');f.action='${BASE}/${esc(C.id)}/medicao/'+mid+'/cancelar';document.getElementById('ctCancN').textContent=n+'ª';document.getElementById('ctDlgCanc').showModal();}</script>` : ""}`;
  return shell({ title: `${C.numero} · ${P.nome}`, body, user });
}
const linhaServ = (i, sub) => `<tr${sub ? ' class="sub"' : ""}><td data-r="${sub ? "Local" : "Serviço"}">${sub ? `↳ ${esc(i.local)}` : `<b>${esc(i.desc)}</b>`}</td><td class="r" data-r="Contratado">${num(i.qtd, 4)} ${esc(i.un)}</td><td class="r" data-r="Valor unit.">${brl(i.pu)}</td><td class="r" data-r="Total">${brl(i.total)}</td>
      <td class="r" data-r="Medido">${num(i.medido, 4)} ${esc(i.un)} · <b>${pct(i.p)}</b><br><small>${brl(i.valMed)}</small></td><td class="r" data-r="Saldo">${num(i.saldo, 4)} ${esc(i.un)}<br><small>${brl(i.saldoValor)}</small></td></tr>`;
function acumuladoAte(C, M) { let s = 0; for (const x of C.medicoes || []) { if (!x.cancelada) s += x.valor; if (x === M) break; } return r2(s); }

export function anexarArquivo(user, id, arqs) {
  if (!podeGerir(user)) return { erro: "Só quem gere os contratos anexa arquivo." };
  const d = ler(), C = d.contratos.find(x => x.id === id); if (!podeVer(user, C)) return { erro: "Contrato não encontrado." };
  let novos; try { novos = guardarArquivos(arqs, "arquivo", user); } catch (er) { return { erro: er.message }; }
  if (!novos.length) return { erro: "Escolha o arquivo." };
  C.arquivos = [...(C.arquivos || []), ...novos];
  (C.historico ||= []).push({ em: agoraLocalISO(), por: quem(user), txt: `Anexou ${novos.map(a => a.original).join(", ")}` });
  gravar(d); return { ok: true, id };
}
export function encerrarContrato(user, id, encerrar) {
  if (!podeGerir(user)) return { erro: "Só quem gere os contratos encerra." };
  const d = ler(), C = d.contratos.find(x => x.id === id); if (!podeVer(user, C)) return { erro: "Contrato não encontrado." };
  if (encerrar) C.encerrado = { em: agoraLocalISO(), por: quem(user) }; else delete C.encerrado;
  (C.historico ||= []).push({ em: agoraLocalISO(), por: quem(user), txt: encerrar ? "Encerrou o contrato" : "Reabriu o contrato" });
  gravar(d); return { ok: true, id };
}

// ---------------------------------------------------------------- 4. lançar medição
const JS_MEDIR = String.raw`<script>
function ctNum(t){var s=String(t==null?'':t).trim().replace(/[^\d,.-]/g,'');if(!s||!/\d/.test(s))return null;if(s.indexOf(',')>-1)s=s.replace(/\./g,'').replace(',','.');else if((s.match(/\./g)||[]).length>1||/^\d{1,3}\.\d{3}$/.test(s))s=s.replace(/\./g,'');var n=Number(s);return isFinite(n)?n:null;}
function ctBRL(v){return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function ctN(v,c){return (v||0).toLocaleString('pt-BR',{maximumFractionDigits:c==null?4:c});}
function ctQtd(card){var v=ctNum(card.querySelector('.v').value);if(v==null)return 0;var Q=+card.getAttribute('data-q');return card.getAttribute('data-modo')==='p'?Math.round(Q*v/100*10000)/10000:v;}
function ctAtual(card){var Q=+card.getAttribute('data-q'),M=+card.getAttribute('data-m'),S=+card.getAttribute('data-s'),pu=+card.getAttribute('data-pu'),un=card.getAttribute('data-un'),q=ctQtd(card),eq=card.querySelector('.eq');
  card.classList.toggle('on',q>0);if(!card.querySelector('.v').value.trim()){eq.textContent='';eq.classList.remove('ruim');return 0;}
  if(q<0){eq.textContent='Valor negativo não vale.';eq.classList.add('ruim');return 0;}
  if(q>S+1e-6){eq.textContent='Passa do saldo ('+ctN(S)+' '+un+' = '+ctN(Q?S/Q*100:0,1)+'%).';eq.classList.add('ruim');return 0;}
  eq.classList.remove('ruim');eq.textContent=(card.getAttribute('data-modo')==='p'?'= '+ctN(q)+' '+un:'= '+ctN(Q?q/Q*100:0,2)+'%')+' · '+ctBRL(Math.round(q*pu*100)/100)+' → acumulado '+ctN(Q?(M+q)/Q*100:0,1)+'%';return Math.round(q*pu*100)/100;}
function ctSoma(){var t=0,n=0,ruim=0;document.querySelectorAll('.ct-mi[data-id]').forEach(function(c){var v=ctAtual(c);if(v>0){t+=v;n++;}if(c.querySelector('.eq.ruim'))ruim++;});
  document.getElementById('ctSoma').textContent=ctBRL(t);document.getElementById('ctSomaN').textContent=n+' serviço(s)'+(ruim?' · '+ruim+' com erro':'');var b=document.getElementById('ctGrava');b.disabled=!n||ruim>0;}
function ctModo(b,m){var c=b.closest('.ct-mi'),q=ctQtd(c),Q=+c.getAttribute('data-q');c.setAttribute('data-modo',m);c.querySelectorAll('.ct-modo button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-m')===m);});
  var i=c.querySelector('.v');if(i.value.trim())i.value=m==='p'?ctN(Q?q/Q*100:0,2):ctN(q);i.placeholder=m==='p'?'%':c.getAttribute('data-un');c.querySelector('.uni').textContent=m==='p'?'%':c.getAttribute('data-un');ctSoma();i.focus();}
function ctTudo(b){var c=b.closest('.ct-mi');if(c.getAttribute('data-modo')!=='q')ctModo(c.querySelector('.ct-modo button[data-m=q]'),'q');c.querySelector('.v').value=ctN(+c.getAttribute('data-s'));ctSoma();}
function ctTodos(b){var g=b.closest('.ct-mg'),v=g.querySelector('.gv').value;if(!v.trim())return;g.querySelectorAll('.ct-mi[data-id]').forEach(function(c){if(c.getAttribute('data-modo')!=='p')ctModo(c.querySelector('.ct-modo button[data-m=p]'),'p');c.querySelector('.v').value=v;});ctSoma();}
function ctEnvia(f){var ls=[];document.querySelectorAll('.ct-mi[data-id]').forEach(function(c){var q=ctQtd(c);if(q>0)ls.push({item:c.getAttribute('data-id'),qtd:q});});
  if(!ls.length){alert('Preencha pelo menos um serviço.');return false;}f.linhasJson.value=JSON.stringify(ls);
  if(!confirm('Gravar a medição de '+document.getElementById('ctSoma').textContent+' ('+ls.length+' serviço(s))?'))return false;var b=document.getElementById('ctGrava');b.disabled=true;b.textContent='Gravando…';return true;}
document.addEventListener('DOMContentLoaded',ctSoma);
</script>`;

export function paginaMedir(user, id, { e = "" } = {}) {
  const d = ler(), C = d.contratos.find(x => x.id === id);
  if (!podeVer(user, C)) return null;
  const P = prestadorDe(d, C), K = contas(C);
  const card = (i, sub) => { const t = sub ? esc(i.local) : esc(i.desc);
    return i.saldo <= 1e-9 ? `<div class="ct-mi cheio"><h4>${t}</h4><div class="lin"><span>${num(i.qtd, 4)} ${esc(i.un)} · 100% medido</span></div></div>`
    : `<div class="ct-mi" data-id="${esc(i.id)}" data-q="${i.qtd}" data-m="${i.medido}" data-s="${i.saldo}" data-pu="${i.pu}" data-un="${esc(i.un)}" data-modo="p">
      <h4>${t}</h4>
      <div class="lin"><span>Contratado <b>${num(i.qtd, 4)} ${esc(i.un)}</b> · ${brl(i.pu)}/${esc(i.un)}</span><span>Já medido <b>${pct(i.p)}</b> (${num(i.medido, 4)} ${esc(i.un)})</span><span>Saldo <b>${num(i.saldo, 4)} ${esc(i.un)}</b></span></div>
      ${barra(i.p)}
      <div class="ent"><span class="ct-modo"><button type="button" class="on" data-m="p" onclick="ctModo(this,'p')">%</button><button type="button" data-m="q" onclick="ctModo(this,'q')">Qtd</button></span>
        <input class="v" inputmode="decimal" placeholder="%" oninput="ctSoma()" aria-label="Quanto andou"><span class="uni" style="font-weight:700;color:#5a5a62">%</span>
        <button type="button" class="ct-btn mini" onclick="ctTudo(this)">todo o saldo</button></div>
      <div class="eq"></div></div>`; };
  const cards = blocos(K.itens).map(b => b.item ? card(b.item, false) : `<div class="ct-mg"><h4>${esc(b.nome)}</h4>
      <div class="lin">${b.itens.length} local(is) · ${brl(b.total)} · já medido <b>${pct(b.p)}</b></div>${barra(b.p)}
      ${b.itens.some(i => i.saldo > 1e-9) ? `<div class="tds">O mesmo % em todos os locais: <input class="gv" inputmode="decimal" placeholder="%" aria-label="Percentual para todos os locais"><button type="button" class="ct-btn mini" onclick="ctTodos(this)">aplicar</button></div>` : ""}
      ${b.itens.map(i => card(i, true)).join("")}</div>`).join("");
  const body = `${CSS}${JS_MEDIR}${cabecalhoPagina({ icone: "📏", titulo: `Medição ${vivas(C).length + 1}ª · ${esc(C.numero)}`, sub: `${esc(P.nome)} · ${esc(obraNome(C.obra))}. Em cada serviço, o quanto andou <b>nesta</b> medição: em % do contratado ou em quantidade.`, voltar: `${BASE}/${esc(C.id)}`, voltarRotulo: esc(C.numero) })}
  ${msg("", e)}${C.encerrado ? `<div class="msg err">Contrato encerrado: reabra para medir.</div>` : `
  <form class="ct-f" method="POST" action="${BASE}/${esc(C.id)}/medir" enctype="multipart/form-data" onsubmit="return ctEnvia(this)"><input type="hidden" name="linhasJson">
    <div class="ct-sec"><div class="ct-g"><div><label>Data da medição</label><input type="date" name="data" value="${isoLocal()}" required max="${isoLocal()}"></div>
      <div><label>Fotos ou documentos (opcional)</label><input type="file" name="foto" multiple accept="${EXT_CONTRATO.join(",")}"></div>
      <div class="full"><label>Observação (opcional)</label><textarea name="obs" rows="2" maxlength="1000" placeholder="Ex.: medição até o 4º pavimento; falta arremate das janelas"></textarea></div></div></div>
    ${cards}
    <div class="ct-rodape"><div><small>Esta medição</small><b id="ctSoma">R$ 0,00</b><small id="ctSomaN"></small></div><button id="ctGrava" type="submit" class="ct-btn p g" style="background:var(--acento);border-color:var(--acento)" disabled>Gravar medição</button></div>
  </form>`}`;
  return shell({ title: `Medição · ${C.numero}`, body, user });
}

export function registrarMedicao(user, id, f, arqs) {
  const d = ler(), C = d.contratos.find(x => x.id === id);
  if (!podeVer(user, C)) return { erro: "Contrato não encontrado." };
  if (C.encerrado) return { erro: "Contrato encerrado: reabra para medir." };
  const data = /^\d{4}-\d{2}-\d{2}$/.test(f.data || "") ? f.data : "";
  if (!data) return { erro: "Escolha a data da medição." };
  if (data > isoLocal()) return { erro: "A data da medição não pode ser no futuro." };
  let ls; try { ls = JSON.parse(f.linhasJson || "[]"); } catch { ls = null; }
  if (!Array.isArray(ls) || !ls.length) return { erro: "Preencha pelo menos um serviço." };
  const K = contas(C), linhas = [];
  for (const l of ls) {
    const it = K.itens.find(i => i.id === l.item), q = r4(Number(l.qtd));
    if (!it) return { erro: "Serviço não encontrado no contrato (a tela estava desatualizada?). Abra a medição de novo." };
    if (!(q > 0)) continue;
    if (linhas.some(x => x.item === it.id)) return { erro: `${rotulo(it)} veio duas vezes.` };
    if (q > it.saldo + 1e-6) return { erro: `${rotulo(it)}: ${num(q, 4)} ${it.un} passa do saldo (${num(it.saldo, 4)} ${it.un}).` };
    linhas.push({ item: it.id, desc: rotulo(it), un: it.un, pu: it.pu, qtd: q, valor: r2(q * it.pu) });
  }
  if (!linhas.length) return { erro: "Preencha pelo menos um serviço." };
  let anexos; try { anexos = guardarArquivos(arqs, "foto", user); } catch (er) { return { erro: er.message }; }
  const M = { id: novoId("md"), n: (C.medicoes || []).length + 1, data, obs: txt(f.obs, 1000), linhas, valor: r2(linhas.reduce((s, l) => s + l.valor, 0)), anexos, por: quem(user), em: agoraLocalISO() };
  (C.medicoes ||= []).push(M);
  (C.historico ||= []).push({ em: M.em, por: M.por, txt: `Lançou a ${M.n}ª medição: ${brl(M.valor)} (${linhas.length} serviço(s))` });
  gravar(d); return { ok: true, id, mid: M.id, n: M.n };
}

export function cancelarMedicao(user, id, mid, motivo) {
  if (!podeGerir(user)) return { erro: "Só a Diretoria, o Gerente ou o Administrador cancelam medição." };
  const d = ler(), C = d.contratos.find(x => x.id === id); if (!podeVer(user, C)) return { erro: "Contrato não encontrado." };
  const M = (C.medicoes || []).find(x => x.id === mid); if (!M) return { erro: "Medição não encontrada." };
  if (M.cancelada) return { erro: "Essa medição já estava cancelada." };
  motivo = txt(motivo, 300); if (motivo.length < 5) return { erro: "Escreva o motivo do cancelamento." };
  M.cancelada = { em: agoraLocalISO(), por: quem(user), motivo };
  (C.historico ||= []).push({ em: M.cancelada.em, por: M.cancelada.por, txt: `Cancelou a ${M.n}ª medição (${brl(M.valor)}): ${motivo}` });
  gravar(d); return { ok: true, id };
}

// ---------------------------------------------------------------- 5. boletim da medição (tela e impressão)
export function paginaMedicao(user, id, mid) {
  const d = ler(), C = d.contratos.find(x => x.id === id);
  if (!podeVer(user, C)) return null;
  const M = (C.medicoes || []).find(x => x.id === mid); if (!M) return null;
  const P = prestadorDe(d, C), K = contas(C);
  // anterior = o que já estava medido antes desta (só as válidas)
  const ant = {}; for (const x of C.medicoes) { if (x === M) break; if (!x.cancelada) for (const l of x.linhas) ant[l.item] = (ant[l.item] || 0) + l.qtd; }
  const atual = Object.fromEntries(M.linhas.map(l => [l.item, l]));
  const lin = (i, sub) => {
    const a = r4(ant[i.id] || 0), e = atual[i.id] ? atual[i.id].qtd : 0, ac = r4(a + e);
    return `<tr${sub ? ' class="sub"' : ""}><td data-r="${sub ? "Local" : "Serviço"}">${sub ? `↳ ${esc(i.local)}` : `<b>${esc(i.desc)}</b>`}</td><td class="r" data-r="Contratado">${num(i.qtd, 4)} ${esc(i.un)}<br><small>${brl(i.pu)}</small></td>
      <td class="r" data-r="Anterior">${num(a, 4)} · ${pct(i.qtd ? a / i.qtd : 0)}</td>
      <td class="r" data-r="Esta medição"><b>${num(e, 4)} · ${pct(i.qtd ? e / i.qtd : 0)}</b><br><small>${brl(atual[i.id] ? atual[i.id].valor : 0)}</small></td>
      <td class="r" data-r="Acumulado">${num(ac, 4)} · ${pct(i.qtd ? ac / i.qtd : 0)}</td><td class="r" data-r="Saldo">${num(r4(i.qtd - ac), 4)} ${esc(i.un)}</td></tr>`;
  };
  const tem = i => atual[i.id] || ant[i.id];
  const linhas = blocos(K.itens).map(b => b.item ? (tem(b.item) ? lin(b.item, false) : "") : !b.itens.some(tem) ? ""
    : `<tr class="grp"><td colspan="3" data-r="">▾ ${esc(b.nome)}</td><td class="r" data-r="Esta medição">${brl(b.itens.reduce((t, i) => t + (atual[i.id] ? atual[i.id].valor : 0), 0))}</td><td colspan="2"></td></tr>${b.itens.filter(tem).map(i => lin(i, true)).join("")}`).join("");
  const acAnt = acumuladoAte(C, M) - (M.cancelada ? 0 : M.valor);
  const body = `${CSS}${cabecalhoPagina({ icone: "📏", titulo: `${M.n}ª medição · ${esc(C.numero)}`, voltar: `${BASE}/${esc(C.id)}`, voltarRotulo: esc(C.numero) })}
  ${M.cancelada ? `<div class="msg err">Medição CANCELADA em ${quandoBR(M.cancelada.em)} por ${esc(M.cancelada.por)}: ${esc(M.cancelada.motivo)}</div>` : ""}
  <div class="ct-acoes no-print"><button type="button" class="ct-btn p" onclick="print()">🖨️ Imprimir / salvar PDF</button></div>
  <div class="ct-sec"><h3>${esc(MARCA.empresa || MARCA.nome || "")} · Boletim de medição de contrato</h3><div class="ct-dados">
    <div><small>Obra</small><b>${esc(obraNome(C.obra))}</b></div><div><small>Contrato</small>${esc(C.numero)}${C.objeto ? ` — ${esc(C.objeto)}` : ""}</div>
    <div><small>Prestador</small><b>${esc(P.nome)}</b>${P.doc ? `<br>${soDig(P.doc).length === 11 ? "CPF" : "CNPJ"} ${esc(docFmt(P.doc))}` : ""}</div>${P.endereco ? `<div><small>Endereço</small>${esc(P.endereco)}</div>` : ""}
    <div><small>Medição</small>${M.n}ª · ${dataBR(M.data)}</div><div><small>Lançada por</small>${esc(M.por)} · ${quandoBR(M.em)}</div></div></div>
  <div class="ct-sec"><div class="ct-rolar"><table class="ct-t cel"><thead><tr><th>Serviço</th><th class="r">Contratado</th><th class="r">Anterior</th><th class="r">Esta medição</th><th class="r">Acumulado</th><th class="r">Saldo</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div class="ct-kpis" style="margin-top:14px"><div class="ct-kpi"><small>Valor do contrato</small><b>${brl(K.total)}</b></div><div class="ct-kpi"><small>Acumulado anterior</small><b>${brl(acAnt)}</b></div>
      <div class="ct-kpi"><small>Esta medição</small><b>${brl(M.valor)}</b><em>${pct(K.total ? M.valor / K.total : 0)} do contrato</em></div><div class="ct-kpi"><small>Saldo do contrato</small><b>${brl(K.total - acAnt - (M.cancelada ? 0 : M.valor))}</b></div></div>
    ${M.obs ? `<p style="margin-top:12px;font-size:13.5px"><b>Observação:</b> ${esc(M.obs)}</p>` : ""}
    ${(M.anexos || []).length ? `<div class="ct-arqs no-print" style="margin-top:12px">${M.anexos.map(linkArq).join("")}</div>` : ""}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px;font-size:12.5px;text-align:center"><div style="border-top:1px solid #333;padding-top:6px">Engenharia — ${esc(MARCA.empresa || "")}</div><div style="border-top:1px solid #333;padding-top:6px">${esc(P.nome)}</div></div></div>`;
  return shell({ title: `${M.n}ª medição · ${C.numero}`, body, user });
}

// ---------------------------------------------------------------- rotas (/obras/contratos…)
export async function rotaContratos({ req, res, path, u, sess, html, redir, NAO }) {
  const user = sess.user, q = u.searchParams, post = req.method === "POST";
  const volta = (url, r, ok = "Salvo.") => redir(res, url + (url.includes("?") ? "&" : "?") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(ok)));
  const form = async () => { try { return await lerFormulario(req, LIMITE_LOTE); } catch (er) { return { erro: "Não deu para receber o envio: " + er.message }; } };
  const partes = path.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent);
  const [id, acao, sub, acao2] = partes;

  if (!id) return html(res, paginaLista(user, { obra: q.get("obra") || "", m: q.get("m") || "", e: q.get("e") || "" }));

  if (id === "arquivo") {     // um anexo: só abre se a pessoa vê o contrato dele
    const nome = acao || "";
    if (!nomeSeguro(nome)) { res.writeHead(400); return res.end("arquivo inválido"); }
    const d = ler(), C = d.contratos.find(c => (c.arquivos || []).some(a => a.nome === nome) || (c.medicoes || []).some(m => (m.anexos || []).some(a => a.nome === nome)));
    if (!podeVer(user, C)) { res.writeHead(404); return res.end("arquivo não encontrado"); }
    return readFile(join(PASTA_ARQ, nome), (er, buf) => {
      if (er) { res.writeHead(404); return res.end("arquivo não encontrado"); }
      const t = tipoDoArquivo(nome);
      res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `inline; filename="${nome}"`, "Cache-Control": "private, max-age=300" }); res.end(buf);
    });
  }

  if (id === "novo") {
    if (!post) { const p = paginaForm(user, "", { obra: q.get("obra") || "", e: q.get("e") || "" }); return p ? html(res, p) : redir(res, BASE); }
    const f = await form(); if (f.erro) return volta(`${BASE}/novo`, f);
    const r = salvarContrato(user, "", f.campos, f.arquivos);
    return r.erro ? html(res, paginaFormComErro(user, "", f.campos, r.erro), 400) : volta(`${BASE}/${r.id}`, r, "Contrato cadastrado.");
  }

  if (!acao) { const p = paginaContrato(user, id, { m: q.get("m") || "", e: q.get("e") || "" }); return p ? html(res, p) : redir(res, BASE); }
  if (acao === "editar") {
    if (!post) { const p = paginaForm(user, id, { e: q.get("e") || "" }); return p ? html(res, p) : redir(res, `${BASE}/${encodeURIComponent(id)}`); }
    const f = await form(); if (f.erro) return volta(`${BASE}/${encodeURIComponent(id)}/editar`, f);
    const r = salvarContrato(user, id, f.campos, f.arquivos);
    return r.erro ? html(res, paginaFormComErro(user, id, f.campos, r.erro), 400) : volta(`${BASE}/${encodeURIComponent(id)}`, r, "Contrato salvo.");
  }
  if (acao === "medir") {
    if (!post) { const p = paginaMedir(user, id, { e: q.get("e") || "" }); return p ? html(res, p) : redir(res, BASE); }
    const f = await form(); if (f.erro) return volta(`${BASE}/${encodeURIComponent(id)}/medir`, f);
    const r = registrarMedicao(user, id, f.campos, f.arquivos);
    return r.erro ? volta(`${BASE}/${encodeURIComponent(id)}/medir`, r) : volta(`${BASE}/${encodeURIComponent(id)}`, r, `${r.n}ª medição gravada.`);
  }
  if (acao === "arquivo" && post) { const f = await form(); if (f.erro) return volta(`${BASE}/${encodeURIComponent(id)}`, f); return volta(`${BASE}/${encodeURIComponent(id)}`, anexarArquivo(user, id, f.arquivos), "Arquivo anexado."); }
  if (acao === "encerrar" && post) { const f = await lerCorpoSimples(req); return volta(`${BASE}/${encodeURIComponent(id)}`, encerrarContrato(user, id, f.encerrar === "1"), f.encerrar === "1" ? "Contrato encerrado." : "Contrato reaberto."); }
  if (acao === "medicao" && sub && acao2 === "cancelar" && post) { const f = await lerCorpoSimples(req); return volta(`${BASE}/${encodeURIComponent(id)}`, cancelarMedicao(user, id, sub, f.motivo), "Medição cancelada."); }
  if (acao === "medicao" && sub && !acao2) { const p = paginaMedicao(user, id, sub); return p ? html(res, p) : redir(res, `${BASE}/${encodeURIComponent(id)}`); }
  return redir(res, BASE);
}

/** Formulário simples (sem anexo): application/x-www-form-urlencoded. */
function lerCorpoSimples(req) {
  return new Promise((ok, falha) => { let s = "", n = 0;
    req.on("data", c => { n += c.length; if (n > 100000) { req.destroy(); return falha(new Error("grande demais")); } s += c; });
    req.on("end", () => { const o = {}; new URLSearchParams(s).forEach((v, k) => { o[k] = v; }); ok(o); }); req.on("error", falha); }).catch(() => ({}));
}

/** Quando a gravação recusa, a tela volta com o que a pessoa digitou (ninguém redigita 30 itens). */
function paginaFormComErro(user, id, campos, erro) {
  let its = []; try { its = JSON.parse(campos.itensJson || "[]"); } catch {}
  return paginaForm(user, id, { e: erro, obra: campos.obra || "", rascunho: { campos, its: Array.isArray(its) ? its : [] } }) || "";
}
