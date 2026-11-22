// PLOTAGENS (05/11) — a aba 🖨️ Plotagens de Projetos (/documentos/plotagens), em DOIS CARDS:
//   📝 SOLICITAR PLOTAGEM (/documentos/plotagens/solicitar) — o processo inteiro, do pedido à assinatura:
//     · a OBRA pede: obra, pranchas LIBERADAS (por disciplina), cópias, cor (colorido / preto e branco), MATERIAL
//       (papel, plastificado, lona, PVC) e tamanho (A0…A4 ou "conforme arquivo"), e QUEM PLOTA (delegado);
//     · quem plota recebe AVISO POR E-MAIL (pela ponte, `enviarMensagem` — a mesma do boletim;
//       enquanto não existir no servidor, o pedido fica marcado "aviso aguardando o servidor");
//     · quem plota (ou a engenharia) marca "plotada" — essa é a data da impressão;
//     · na ENTREGA, quem recebe assina com o dedo na tela (o comprovante guarda nome, assinatura, data, hora e quem colheu).
//   📊 GESTÃO DAS PLOTAGENS (/documentos/plotagens/gestao) — os números: por prancha (quantas vezes, cópias, datas, quem
//     recebeu), por obra, por material × tamanho, por mês, por quem plota, prazos e revisões obsoletas a recolher.
// Nada some: cancelar marca o pedido como cancelado, com motivo, quem e quando; trocar quem plota fica no andamento.
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import * as PONTE from "../ponte-engenharia.js";
import { BASE_DOCS, DISCIPLINAS, DIR_DOCS } from "./documentos.js";
import { arquivoComQR, urlQR } from "./documentos-qr.js";

const { salvarArquivo, shell, agoraLocalISO } = PONTE;
const { ler, gravar, situacao, vivos, codigo, chaveP, acessoTotal, externo, podeObra, obrasDoUsuario, topoProjetos, CSS, esc, quem, dh, siglaObra, siglaDisc, registrar } = BASE_DOCS;

export const CORES = [{ id: "pb", nome: "Preto e branco" }, { id: "cor", nome: "Colorido" }];
export const MATERIAIS = [{ id: "papel", nome: "Papel" }, { id: "plastificado", nome: "Papel plastificado" }, { id: "lona", nome: "Lona" }, { id: "pvc", nome: "PVC" }];
export const TAMANHOS = [{ id: "arquivo", nome: "Conforme arquivo" }, { id: "A0", nome: "A0" }, { id: "A1", nome: "A1" }, { id: "A2", nome: "A2" }, { id: "A3", nome: "A3" }, { id: "A4", nome: "A4" }];
// QUEM PLOTA (delegado no pedido; a engenharia pode trocar). O e-mail recebe o aviso de cada pedido novo.
export { PLOTADORES } from "../ponte-engenharia.js";   // quem plota: config.json → "plotadores"
import { PLOTADORES, MARCA } from "../ponte-engenharia.js";
const SIT = {
  pedido: { txt: "Solicitada", cor: "#b8920f", fundo: "#fdf1c2", borda: "#f1d872" },
  plotado: { txt: "Plotada — aguardando entrega", cor: "#2f5d8a", fundo: "#e6eef8", borda: "#c5d6ea" },
  entregue: { txt: "Entregue", cor: "#22662a", fundo: "#dff1d8", borda: "#a9d69c" },
  cancelado: { txt: "Cancelada", cor: "#777", fundo: "#eee", borda: "#dcdcdc" },
};
const PASTA_ASS = join(DIR_DOCS, "plotagens");
const nomeDe = lista => id => (lista.find(x => x.id === id) || {}).nome || id || "—";
const nomeCor = nomeDe(CORES), nomeMat = nomeDe(MATERIAIS), nomeTam = nomeDe(TAMANHOS), nomePlot = nomeDe(PLOTADORES);
const plotagensDe = d => d.plotagens || [];
const vePlot = u => !!u && !externo(u);                       // o projetista de fora não entra em plotagens
const gerePlot = u => vePlot(u) && acessoTotal(u);             // troca quem plota, cancela pedido dos outros, marca recolhida
const login = u => String((u && u.usuario) || "").toLowerCase();
const podePlotar = (u, p) => gerePlot(u) || login(u) === p.plota;
const numPedido = p => `PL-${siglaObra(p.obra)}-${String(p.n).padStart(3, "0")}`;
const selo = s => `<span class="pl-sit" style="color:${SIT[s].cor};background:${SIT[s].fundo};border-color:${SIT[s].borda}">${SIT[s].txt}</span>`;
const impressa = p => p.situacao === "plotado" || p.situacao === "entregue";
const copiasDe = p => p.itens.reduce((s, it) => s + it.copias, 0);
const qs = o => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const lista = v => v == null ? [] : [].concat(v).map(String);
const dataBR = iso => String(iso || "").slice(0, 10).split("-").reverse().join("/");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const diasEntre = (a, b) => (new Date(String(b).slice(0, 16)) - new Date(String(a).slice(0, 16))) / 864e5;
const envioLigado = () => typeof PONTE.enviarMensagem === "function";
const descItem = it => `${it.copias}× · ${nomeCor(it.cor)} · ${nomeMat(it.material)} · ${nomeTam(it.tamanho)}`;
const LIMITE_ANEXO = 20 * 1024 * 1024;   // acima disso o .zip não vai no e-mail (os provedores barram ~25 MB): baixa no painel

// ---------- o pacote para a GRÁFICA: os PDFs num .zip e a mensagem pronta ----------
/** O nome de cada arquivo dentro do .zip já diz como plotar: "01 - ELC-ARQ-TER-P02-R01 - A1 - Lona - Colorido - 2x.pdf". */
const nomeNoZip = (it, i, ext) => `${String(i + 1).padStart(2, "0")} - ${it.codigo} - ${it.tamanho === "arquivo" ? "tamanho do arquivo" : it.tamanho} - ${nomeMat(it.material)} - ${nomeCor(it.cor)} - ${it.copias}x${ext}`;
/** O arquivo de cada prancha do pedido: a versão CARIMBADA quando existe em PDF (é a que vale na obra), senão o original. */
function arquivoDoItem(d, it) {
  const a = (d.arquivos || []).find(x => x.id === it.docId); if (!a) return null;
  // a cópia vai com o QR de validade (06/11): a obra confere no celular se a prancha impressa ainda vale
  const comQR = (caminho, ext, extra) => ext === ".pdf" ? { caminho, ext, ...extra, buffer: arquivoComQR(caminho, urlQR(a.id), codigo(a), a.qrPos || null).buf } : { caminho, ext, ...extra };
  if (a.carimbo && a.carimbo.ext === ".pdf" && existsSync(join(DIR_DOCS, a.carimbo.arquivo))) return comQR(join(DIR_DOCS, a.carimbo.arquivo), ".pdf", { carimbado: true });
  return existsSync(join(DIR_DOCS, a.arquivo)) ? comQR(join(DIR_DOCS, a.arquivo), a.ext, {}) : null;
}
/** A mensagem padrão para a gráfica: obra, prancha, tamanho da folha, tipo do papel, cor e quantidade. */
export function mensagemGrafica(p, nomeObra, anexos = [`${numPedido(p)}.zip`]) {
  return [`Olá!`, ``, `Segue o pedido de plotagem da ${MARCA.empresa}.`, ``,
    `Obra: ${nomeObra}`, `Pedido: ${numPedido(p)}`, ...(p.precisa ? [`Prazo: até ${dataBR(p.precisa)}`] : []), ``,
    ...p.itens.flatMap((it, i) => [`${i + 1}) Prancha: ${it.codigo} — ${it.descricao}`,
      `   Tamanho da folha: ${it.tamanho === "arquivo" ? "conforme o arquivo (tamanho original do PDF)" : it.tamanho}`,
      `   Tipo do papel: ${nomeMat(it.material)}`, `   Cor: ${nomeCor(it.cor)}`, `   Quantidade: ${it.copias}`, ``]),
    `Total: ${plural(p.itens.length, "prancha", "pranchas")}, ${plural(copiasDe(p), "cópia", "cópias")}.`,
    anexos.length > 1 ? `Os arquivos em PDF seguem em ${anexos.length} e-mails, nos anexos ${anexos.join(", ").replace(/, ([^,]*)$/, " e $1")} (o nome de cada arquivo traz o número do item, o tamanho, o papel, a cor e a quantidade).`
      : `Os arquivos em PDF seguem no anexo ${anexos[0]} (o nome de cada arquivo traz o número do item, o tamanho, o papel, a cor e a quantidade).`, ``,
    `Obrigado,`, `Engenharia — ${MARCA.empresa}`].join("\n");
}
// .zip feito aqui mesmo (só node:zlib): cabeçalho local + diretório central, nomes em UTF-8.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function montarZip(arquivos) {
  const partes = [], central = []; let pos = 0;
  const agora = new Date(), hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1),
    dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  for (const { nome, dados } of arquivos) {
    const nm = Buffer.from(nome, "utf8"), crc = crc32(dados), comp = deflateRawSync(dados, { level: 6 }), usa = comp.length < dados.length;
    const corpo = usa ? comp : dados, metodo = usa ? 8 : 0;
    const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(metodo, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(dia, 12); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(corpo.length, 18); loc.writeUInt32LE(dados.length, 22); loc.writeUInt16LE(nm.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(metodo, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(corpo.length, 20); cen.writeUInt32LE(dados.length, 24); cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(pos, 42);
    partes.push(loc, nm, corpo); central.push(cen, nm); pos += 30 + nm.length + corpo.length;
  }
  const cd = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, cd, fim]);
}
/** O .zip do pedido: os PDFs das pranchas (com o nome que diz como plotar) e a mensagem para a gráfica em texto. */
function zipDoPedido(d, p, nomeObra) {
  const arquivos = [], faltando = [];
  p.itens.forEach((it, i) => { const f = arquivoDoItem(d, it); if (!f) return faltando.push(it.codigo);
    arquivos.push({ nome: nomeNoZip(it, i, f.ext), dados: f.buffer || readFileSync(f.caminho) }); });
  arquivos.push({ nome: `${numPedido(p)} - mensagem para a gráfica.txt`, dados: Buffer.from(mensagemGrafica(p, nomeObra).replace(/\n/g, "\r\n"), "utf8") });
  return { buffer: montarZip(arquivos), nome: `${numPedido(p)}.zip`, faltando };
}
/** Para o E-MAIL: os PDFs repartidos em .zip de até LIMITE_ANEXO, na ordem dos itens (um e-mail por parte). Cada .zip leva
 *  também a mensagem para a gráfica. Prancha que sozinha passa do limite não cabe em e-mail: vai em "grandes" (baixar no painel). */
function pacotesDoPedido(d, p, nomeObra, limite = LIMITE_ANEXO) {
  const lidos = [], faltando = [], grandes = [];
  p.itens.forEach((it, i) => { const f = arquivoDoItem(d, it); if (!f) return faltando.push(it.codigo);
    const dados = f.buffer || readFileSync(f.caminho); if (dados.length + 4096 > limite) return grandes.push(it.codigo);
    lidos.push({ it, nome: nomeNoZip(it, i, f.ext), dados }); });
  const grupos = []; let atual = [], soma = 0;
  for (const x of lidos) {
    const peso = x.dados.length + 2 * Buffer.byteLength(x.nome) + 200;
    if (atual.length && soma + peso + 8192 > limite) { grupos.push(atual); atual = []; soma = 0; }
    atual.push(x); soma += peso;
  }
  if (atual.length) grupos.push(atual);
  const nomes = grupos.map((_, k) => grupos.length > 1 ? `${numPedido(p)} - parte ${k + 1} de ${grupos.length}.zip` : `${numPedido(p)}.zip`);
  const msg = Buffer.from(mensagemGrafica(p, nomeObra, nomes).replace(/\n/g, "\r\n"), "utf8");
  const pacotes = grupos.map((g, k) => ({ nome: nomes[k], codigos: g.map(x => x.it.codigo),
    buffer: montarZip([...g.map(x => ({ nome: x.nome, dados: x.dados })), { nome: `${numPedido(p)} - mensagem para a gráfica.txt`, dados: msg }]) }));
  return { pacotes, nomes, faltando, grandes };
}
/** Para a rota de download: o .zip do pedido (quem vê a obra). */
export function zipPlotagem(user, id) {
  if (!vePlot(user)) return null;
  const d = ler(), p = plotagensDe(d).find(x => x.id === id); if (!p || !podeObra(user, p.obra)) return null;
  return zipDoPedido(d, p, (obrasDoUsuario(user).find(o => o.id === p.obra) || {}).nome || p.obra);
}

const CSS_PL = `<style>
.pl-rola{overflow-x:auto;-webkit-overflow-scrolling:touch}.pl-rola .dc-t{min-width:560px}
.pl-sit{display:inline-block;border:1px solid;border-radius:999px;padding:2px 9px;font-size:10.5px;font-weight:800;white-space:nowrap}
.pl-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.pl-card{display:flex;flex-direction:column;gap:10px;background:#fff;border:1px solid #ece6d4;border-radius:18px;padding:20px;color:inherit;text-decoration:none;border-top:5px solid var(--acento);transition:box-shadow .15s,transform .15s}
.pl-card:hover{box-shadow:0 8px 22px rgba(0,0,0,.09);transform:translateY(-2px)}
.pl-card .t{display:flex;align-items:center;gap:10px}.pl-card .t b{font-size:19px;flex:1}.pl-card .t .ic{font-size:30px}.pl-card .ir{font-size:24px;color:#c9bd95}
.pl-card p{margin:0;font-size:13px;color:var(--mut);line-height:1.5}
.pl-card .nums{display:flex;flex-wrap:wrap;gap:8px 18px;border-top:1px dashed #e6e0cf;padding-top:10px}
.pl-card .nums span{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em;font-weight:700}.pl-card .nums b{display:block;font-size:26px;font-weight:900;color:var(--c,#1a1a1d);letter-spacing:0}
.pl-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:4px 0 0}
.pl-filtros label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:3px}
.pl-filtros select{padding:7px 9px;border:1px solid #ddd8c8;border-radius:9px;font-size:12.5px;font-family:inherit;background:#fff}
.pl-passos{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;font-size:12px;color:#5a5240}.pl-passos span{background:#f6f2e6;border-radius:999px;padding:3px 10px}.pl-passos i{font-style:normal;color:#c9bd95}
.pl-nova{background:#fcfbf7;border:1px dashed #d9d2bb;border-radius:14px;padding:14px;margin-top:14px}
.pl-nova>summary{cursor:pointer;font-weight:800;font-size:15px}
.pl-nova h4{margin:14px 0 6px;font-size:13.5px}
.pl-nova .linha{display:grid;grid-template-columns:26px minmax(0,1fr) 78px 128px 150px 150px;gap:8px;align-items:center;padding:6px 4px;border-bottom:1px solid #f0ece0}
.pl-nova .linha.cab{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);border-bottom:1px solid #e6e0cf}
.pl-nova input[type=number],.pl-nova select,.pl-nova input[type=date],.pl-nova input[type=text]{width:100%;padding:6px 8px;border:1px solid #ddd8c8;border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff;box-sizing:border-box}
.pl-nova .linha:not(.marcada):not(.cab) .q{opacity:.35}
.pl-nova .linha.marcada{background:#fffaf0}
.pl-nova .ja{font-size:11px;color:var(--mut)}
.pl-todos{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px;color:var(--mut);margin:10px 0 4px}
.pl-todos select{width:auto!important}
.pl-rodape{display:grid;grid-template-columns:150px 170px 1fr auto;gap:10px;align-items:end;margin-top:12px}
.pl-rodape label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);margin-bottom:3px}
.pl-itens{font-size:12px;line-height:1.6}.pl-itens .dc-cod{font-size:11px}
.pl-alerta{background:#fff4e5;border:1px solid #f3c69c;color:#8a4a00;border-radius:10px;padding:8px 12px;font-size:12.5px;margin-top:10px}
.pl-datas span{display:inline-block;background:#f3efe2;border-radius:6px;padding:1px 6px;margin:1px 2px 1px 0;font-size:11px;white-space:nowrap}
.pl-av{font-size:11px;color:var(--mut)}.pl-av.ok{color:#22662a}.pl-av.err{color:#a12d2d}
.pl-quadro-ass{position:relative;height:200px;border:2px dashed #c9bd95;border-radius:14px;background:#fff;touch-action:none}
.pl-quadro-ass canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.pl-quadro-ass .linha{position:absolute;left:24px;right:24px;bottom:42px;border-bottom:1px solid #bbb;pointer-events:none}
.pl-quadro-ass .dica{position:absolute;left:0;right:0;bottom:16px;text-align:center;font-size:12px;color:#aaa;pointer-events:none}
.pl-tl{font-size:13px;line-height:1.9}.pl-tl b{font-weight:700}
.pl-ass img{max-width:340px;width:100%;border-bottom:1px solid #999;display:block;background:#fff}
.pl-2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}.pl-2col>.pj-quadro{margin-top:16px}
.pl-barras{display:flex;align-items:flex-end;gap:6px;height:140px;padding-top:18px}
.pl-barras>div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.pl-barras i{display:block;width:100%;max-width:38px;background:var(--acento);border-radius:5px 5px 0 0;position:relative}
.pl-barras i b{position:absolute;top:-17px;left:0;right:0;text-align:center;font-size:11px;font-style:normal}
.pl-barras span{font-size:10.5px;color:var(--mut);margin-top:4px;white-space:nowrap}
.pl-t-num td,.pl-t-num th{text-align:center}.pl-t-num td:first-child,.pl-t-num th:first-child{text-align:left}
@media(max-width:800px){.pl-nova .linha{grid-template-columns:26px minmax(0,1fr) 60px}.pl-nova .linha .sel2{grid-column:2 / -1}.pl-nova .linha.cab .sel2{display:none}
  .pl-rodape{grid-template-columns:1fr}.pl-2col{grid-template-columns:1fr}}
@media print{header,nav,.pg-volta,.pj-abas,.pl-nao-imprime{display:none!important}}
</style>`;
const caixaMsg = (ok, erro) => `${erro ? `<div style="background:#fbe9e9;border:1px solid #f0c9c9;color:#8a2d2d;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 12px">${esc(erro)}</div>` : ""}
  ${ok ? `<div style="background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:0 0 12px">${esc(ok)}</div>` : ""}`;
const kpi = (v, rot, cor, dica) => `<div class="pj-kpi"${cor ? ` style="--c:${cor}"` : ""} title="${dica}"><b>${v}</b><span>${rot}</span></div>`;
const voltaPl = (rot = "Plotagens") => `<a class="pg-volta" href="/documentos/plotagens"><span class="seta">←</span> ${rot}</a>`;
const selFiltro = (nome, rot, vazio, opcoes, v) => `<div><label>${rot}</label><select name="${nome}" onchange="this.form.submit()"><option value="">${vazio}</option>${opcoes.map(([id, n]) => `<option value="${id}"${id === v ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></div>`;

/** Contas por prancha (todas as revisões de uma prancha juntas): pedidos impressos, cópias, datas, materiais, último
 *  recebimento e revisões impressas que ficaram obsoletas e ainda não foram recolhidas. */
function controle(d, pedidos) {
  const vv = vivos(d), porChave = {};
  for (const p of pedidos) {
    if (!impressa(p)) continue;
    for (const it of p.itens) {
      const c = porChave[it.chave] = porChave[it.chave] || { chave: it.chave, obra: p.obra, disciplina: it.disciplina, vezes: 0, copias: 0, datas: [], revs: {}, mats: {}, ultimo: null };
      c.vezes++; c.copias += it.copias; c.datas.push(p.plotado.em);
      c.mats[it.material] = (c.mats[it.material] || 0) + it.copias;
      const r = c.revs[it.docId] = c.revs[it.docId] || { docId: it.docId, codigo: it.codigo, rev: it.rev, copias: 0 };
      r.copias += it.copias;
      if (p.entregue && (!c.ultimo || p.entregue.em > c.ultimo.em)) c.ultimo = { nome: p.entregue.nome, em: p.entregue.em, id: p.id };
    }
  }
  return Object.values(porChave).map(c => {
    const atual = vv.filter(a => a.origem !== "marcacao" && chaveP(a) === c.chave).sort((a, b) => b.rev - a.rev)[0];
    const recolher = Object.values(c.revs).filter(r => {
      const doc = vv.find(a => a.id === r.docId);
      return (!doc || situacao(doc, vv) === "obsoleto") && !((d.plotRecolhidas || {})[r.docId]);
    });
    return { ...c, atual, recolher, datas: c.datas.sort() };
  });
}
/** Os pedidos que a pessoa vê (as obras dela), com os filtros de obra, disciplina e situação. */
function filtrar(user, d, q) {
  const obras = obrasDoUsuario(user), ids = new Set(obras.map(o => o.id));
  const fo = ids.has(q.o) ? q.o : "", fd = DISCIPLINAS.some(x => x.id === q.disc) ? q.disc : "", fs = SIT[q.s] ? q.s : "";
  const todos = plotagensDe(d).filter(p => ids.has(p.obra));
  const daObra = todos.filter(p => (!fo || p.obra === fo) && (!fd || p.itens.some(it => it.disciplina === fd)));
  return { obras, fo, fd, fs, todos, daObra, visiveis: daObra.filter(p => !fs || p.situacao === fs) };
}

// ---------- a entrada da aba: os dois cards ----------
export function paginaPlotagens(user, q = {}, { ok = "", erro = "" } = {}) {
  if (!vePlot(user)) return null;
  const d = ler(), { todos } = filtrar(user, d, {}), mes = agoraLocalISO().slice(0, 7);
  const nPed = todos.filter(p => p.situacao === "pedido").length, nPlot = todos.filter(p => p.situacao === "plotado").length;
  const meus = todos.filter(p => p.situacao === "pedido" && p.plota === login(user)).length;
  const copMes = todos.filter(p => impressa(p) && p.plotado.em.slice(0, 7) === mes).reduce((s, p) => s + copiasDe(p), 0);
  const nRecolher = controle(d, todos).reduce((s, c) => s + c.recolher.length, 0);
  const num = (v, rot, cor) => `<span style="--c:${v ? cor : "#1a1a1d"}"><b>${v}</b>${rot}</span>`;
  const body = `${CSS}${CSS_PL}${topoProjetos(user, "plot")}${caixaMsg(ok, erro)}
    <div class="pl-cards">
      <a class="pl-card" href="/documentos/plotagens/solicitar">
        <div class="t"><span class="ic">📝</span><b>Solicitar plotagem</b><span class="ir">›</span></div>
        <p>Pedir as pranchas para a obra (cor, material e tamanho), quem plota recebe o aviso, marca plotada, e na entrega quem recebe assina com o dedo.</p>
        <div class="nums">${num(nPed, "aguardando plotar", "#b8920f")}${num(nPlot, "aguardando entrega", "#2f5d8a")}${meus ? num(meus, "para você plotar", "#a12d2d") : ""}</div></a>
      <a class="pl-card" href="/documentos/plotagens/gestao">
        <div class="t"><span class="ic">📊</span><b>Gestão das plotagens</b><span class="ir">›</span></div>
        <p>Quantas vezes cada prancha foi impressa, as datas, quem recebeu, cópias por obra, material e tamanho, prazos e revisões obsoletas a recolher.</p>
        <div class="nums">${num(copMes, "cópias no mês", "#1a1a1d")}${num(nRecolher, "revisões obsoletas na obra", "#a12d2d")}</div></a>
    </div>`;
  return shell({ title: "Projetos · Plotagens", body, user });
}

// ---------- card 1: SOLICITAR PLOTAGEM (pedido → plotada → entregue com assinatura) ----------
export function paginaSolicitar(user, q = {}, { ok = "", erro = "" } = {}) {
  if (!vePlot(user)) return null;
  const d = ler(), vv = vivos(d), { obras, fo, fd, fs, todos, visiveis } = filtrar(user, d, q);
  const vezes = {}; controle(d, todos).forEach(c => { vezes[c.chave] = c.vezes; });
  const ordem = s => ({ pedido: 0, plotado: 1, entregue: 2, cancelado: 3 })[s];
  visiveis.sort((a, b) => ordem(a.situacao) - ordem(b.situacao) || String(b.solicitado.em).localeCompare(a.solicitado.em));
  const opc = (arr, sel) => arr.map(x => `<option value="${x.id}"${x.id === sel ? " selected" : ""}>${esc(x.nome)}</option>`).join("");
  const aqui = `/documentos/plotagens/solicitar${qs({ o: fo, disc: fd, s: fs }) ? "?" + qs({ o: fo, disc: fd, s: fs }) : ""}`;

  // o formulário de pedido: só com a obra escolhida; só pranchas LIBERADAS (a obra só imprime o que pode usar)
  let nova;
  if (fo) {
    const libs = vv.filter(a => a.obra === fo && a.origem !== "marcacao" && situacao(a, vv) === "liberado" && (!fd || a.disciplina === fd));
    const grupos = DISCIPLINAS.map(x => ({ x, ps: libs.filter(a => a.disciplina === x.id).sort((a, b) => codigo(a).localeCompare(codigo(b))) })).filter(g => g.ps.length);
    nova = `<details class="pl-nova pl-nao-imprime"${q.nova || !todos.length ? " open" : ""}><summary>➕ Nova solicitação — ${esc((obras.find(o => o.id === fo) || {}).nome)}</summary>
      ${grupos.length ? `<form method="POST" action="/documentos/plotagens/solicitar" id="plForm" onsubmit="return plConfere()">
        <input type="hidden" name="obra" value="${fo}"><input type="hidden" name="volta" value="${esc(aqui)}">
        <div class="pl-todos">Para todas as marcadas: <select id="plTCor"><option value="">cor…</option>${opc(CORES)}</select>
          <select id="plTMat"><option value="">material…</option>${opc(MATERIAIS)}</select>
          <select id="plTTam"><option value="">tamanho…</option>${opc(TAMANHOS)}</select>
          <span>· só aparecem as pranchas <b>liberadas para a obra</b></span></div>
        ${grupos.map(g => `<h4>${g.x.ic} ${esc(g.x.nome)}</h4>
          <div class="linha cab"><span></span><span>Prancha</span><span>Quantidade</span><span class="sel2">Cor</span><span class="sel2">Material</span><span class="sel2">Tamanho</span></div>
          ${g.ps.map(a => { const n = vezes[chaveP(a)] || 0; return `<label class="linha">
            <input type="checkbox" name="sel" value="${a.id}" class="plSel">
            <span><span class="dc-cod">${esc(codigo(a))}</span> ${esc(a.descricao)}${n ? `<div class="ja">🖨️ já impressa ${n}×</div>` : ""}</span>
            <span class="q"><input type="number" name="cp_${a.id}" value="1" min="1" max="50" step="1"></span>
            <span class="q sel2"><select name="co_${a.id}" class="plCor">${opc(CORES, "pb")}</select></span>
            <span class="q sel2"><select name="ma_${a.id}" class="plMat">${opc(MATERIAIS, "papel")}</select></span>
            <span class="q sel2"><select name="tm_${a.id}" class="plTam">${opc(TAMANHOS, "arquivo")}</select></span></label>`; }).join("")}`).join("")}
        <div class="pl-rodape">
          <div><label>Quem plota</label><select name="plota" required>${opc(PLOTADORES, PLOTADORES[0].id)}</select></div>
          <div><label>Precisa até</label><input type="date" name="precisa" min="${agoraLocalISO().slice(0, 10)}"></div>
          <div><label>Observação</label><input type="text" name="obs" maxlength="300" placeholder="Ex.: entregar ao mestre na segunda"></div>
          <button class="dc-bt" style="padding:9px 18px">Solicitar plotagem</button></div>
        <div class="dc-dica" id="plResumo">Nenhuma prancha marcada.</div>
        <div class="dc-dica">✉️ Quem plota recebe um aviso por e-mail${envioLigado() ? "" : " (assim que o envio for ligado no servidor — até lá, o pedido aparece aqui e no contador da aba)"}.</div></form>
      <script>(function(){ var f=document.getElementById('plForm');
        function conta(){ var n=0,c=0; f.querySelectorAll('.plSel').forEach(function(x){ var l=x.closest('.linha'); l.classList.toggle('marcada',x.checked);
          if(x.checked){ n++; c+=Math.max(1,parseInt(l.querySelector('input[type=number]').value)||1); } });
          document.getElementById('plResumo').textContent = n ? n+' prancha'+(n>1?'s':'')+' · '+c+' cópia'+(c>1?'s':'')+' no total' : 'Nenhuma prancha marcada.'; }
        f.addEventListener('change',conta); f.addEventListener('input',conta);
        function todos(id,cls){ document.getElementById(id).addEventListener('change',function(){ var v=this.value; if(!v) return;
          f.querySelectorAll('.plSel').forEach(function(x){ if(x.checked) x.closest('.linha').querySelector('.'+cls).value=v; }); this.value=''; }); }
        todos('plTCor','plCor'); todos('plTMat','plMat'); todos('plTTam','plTam');
        window.plConfere=function(){ if(!f.querySelector('.plSel:checked')){ alert('Marque ao menos uma prancha.'); return false; } return true; }; })();</script>`
      : `<div style="color:var(--mut);font-size:13px;margin-top:8px">Nenhuma prancha${fd ? " desta disciplina" : ""} liberada para a obra ainda — só dá para plotar o que foi liberado.</div>`}</details>`;
  } else {
    nova = `<div class="pl-nova pl-nao-imprime" style="font-size:13px">➕ <b>Nova solicitação:</b> escolha a <b>obra</b> no filtro acima.</div>`;
  }

  const linhas = visiveis.map(p => {
    const nCop = copiasDe(p), discs = [...new Set(p.itens.map(it => siglaDisc(it.disciplina)))].join(", ");
    return `<tr><td><a href="/documentos/plotagens/${p.id}" style="font-weight:800;color:inherit">${numPedido(p)}</a><br>${selo(p.situacao)}</td>
      <td class="opc">${esc((obras.find(o => o.id === p.obra) || {}).nome || p.obra)}<br><span style="color:var(--mut);font-size:11.5px">${esc(discs)}</span></td>
      <td><details class="pl-itens"><summary>${plural(p.itens.length, "prancha", "pranchas")} · ${plural(nCop, "cópia", "cópias")}</summary>
        ${p.itens.map(it => `<div><span class="dc-cod">${esc(it.codigo)}</span> · ${esc(descItem(it))}</div>`).join("")}</details>
        ${p.obs ? `<div style="font-size:11.5px;color:var(--mut)">${esc(p.obs)}</div>` : ""}</td>
      <td style="font-size:11.5px;white-space:nowrap"><b>${esc(p.solicitado.por)}</b><br><span style="color:var(--mut)">${dh(p.solicitado.em)}</span>${p.precisa ? `<br><span style="color:#8a4a00">precisa até ${dataBR(p.precisa)}</span>` : ""}</td>
      <td style="font-size:11.5px">🧑‍🔧 <b>${esc(nomePlot(p.plota))}</b><br>${avisoTxt(p)}</td>
      <td style="font-size:11.5px">${p.plotado ? `🖨️ ${dh(p.plotado.em)}<br>` : ""}${p.entregue ? `✍️ ${esc(p.entregue.nome)} · ${dh(p.entregue.em)}` : ""}${p.cancelado ? `<span style="color:#777">${esc(p.cancelado.motivo)}</span>` : ""}</td>
      <td style="text-align:right;white-space:nowrap">${botoes(user, p, aqui)}</td></tr>`;
  }).join("");

  const body = `${CSS}${CSS_PL}${topoProjetos(user, "plot")}${voltaPl()}
    <h2 style="margin:12px 0 4px">📝 Solicitar plotagem</h2>
    <div class="pl-passos"><span>1 · a obra pede</span><i>›</i><span>2 · quem plota recebe o aviso</span><i>›</i><span>3 · plotada</span><i>›</i><span>4 · entrega com assinatura</span></div>
    ${caixaMsg(ok, erro)}
    <div class="pj-quadro"><form method="GET" action="/documentos/plotagens/solicitar" class="pl-filtros">
      ${selFiltro("o", "Obra", "— todas as obras —", obras.map(o => [o.id, o.nome]), fo)}
      ${selFiltro("disc", "Disciplina", "— todas —", DISCIPLINAS.map(x => [x.id, `${x.ic} ${x.nome}`]), fd)}
      ${selFiltro("s", "Situação", "— todas —", Object.entries(SIT).map(([k, v]) => [k, v.txt]), fs)}
      ${fo || fd || fs ? `<a href="/documentos/plotagens/solicitar" class="dc-x" style="margin-bottom:8px">limpar filtros</a>` : ""}</form>
      ${nova}</div>
    <div class="pj-quadro"><div class="pj-qt"><b>📋 Pedidos de plotagem</b><span>${plural(visiveis.length, "pedido", "pedidos")}</span></div>
      ${linhas ? `<div class="pl-rola"><table class="dc-t"><thead><tr><th>Pedido</th><th class="opc">Obra</th><th>Pranchas</th><th>Pedido por</th><th>Quem plota</th><th>Plotado / entregue</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : `<div style="color:var(--mut);font-size:13px">Nenhum pedido${fo || fd || fs ? " com estes filtros" : " ainda"}.</div>`}</div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      <b>1. A obra pede:</b> escolhe a obra, marca as pranchas (só as <b>liberadas</b>), as cópias, a cor, o material (papel, plastificado, lona, PVC) e o tamanho — "conforme arquivo" imprime no tamanho do PDF — e quem plota.<br>
      <b>2. Quem plota recebe o aviso</b> por e-mail com a lista das pranchas.<br>
      <b>3. Plotou, marca "plotada"</b>: essa é a data que conta como impressão.<br>
      <b>4. Na entrega</b>, quem recebe <b>assina com o dedo</b> na tela do celular. O comprovante guarda o nome, a assinatura, a data e a hora.</div></details>`;
  return shell({ title: "Plotagens · Solicitar", body, user });
}
const avisoTxt = p => !p.aviso ? "" : p.aviso.ok ? `<span class="pl-av ok">✉️ avisado ${dh(p.aviso.em)}</span>`
  : p.aviso.pendente ? `<span class="pl-av" title="O envio de e-mail ainda não está ligado no servidor">✉️ aviso aguardando o servidor</span>`
  : `<span class="pl-av err" title="${esc(p.aviso.erro)}">✉️ aviso não saiu</span>`;

function botoes(user, p, volta, naPagina = false) {
  const f = (acao, rot, cls, conf, extra = "") => `<form method="POST" action="/documentos/plotagens/acao" style="display:inline" onsubmit="${conf}"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="acao" value="${acao}"><input type="hidden" name="volta" value="${esc(volta)}">${extra}<button class="${cls}">${rot}</button></form>`;
  const out = [];
  if (p.situacao === "pedido" && podePlotar(user, p)) out.push(f("plotado", "🖨️ Marcar plotada", "dc-lib", `return confirm('Marcar ${numPedido(p)} como plotada agora?')`));
  if (p.situacao === "plotado") out.push(`<a class="dc-bt" href="/documentos/plotagens/${p.id}#receber">✍️ Colher assinatura</a>`);
  if (p.situacao === "entregue" && !naPagina) out.push(`<a class="dc-bt claro" href="/documentos/plotagens/${p.id}">Comprovante</a>`);
  if ((p.situacao === "pedido" && (gerePlot(user) || p.solicitado.login === user.usuario)) || (p.situacao === "plotado" && gerePlot(user)))
    out.push(f("cancelar", "cancelar", "dc-x", `var m=prompt('Motivo do cancelamento de ${numPedido(p)}:'); if(!m) return false; this.motivo.value=m; return true;`, `<input type="hidden" name="motivo">`));
  return out.join(" ");
}

// ---------- card 2: GESTÃO DAS PLOTAGENS ----------
export function paginaGestao(user, q = {}, { ok = "", erro = "" } = {}) {
  if (!vePlot(user)) return null;
  const d = ler(), { obras, fo, fd, daObra } = filtrar(user, d, q), gere = gerePlot(user), hoje = agoraLocalISO();
  const meses = [...new Set(daObra.filter(impressa).map(p => p.plotado.em.slice(0, 7)))].sort().reverse();
  const fm = meses.includes(q.m) ? q.m : "";
  const noPeriodo = daObra.filter(p => !fm || (impressa(p) ? p.plotado.em : p.solicitado.em).slice(0, 7) === fm);
  const imp = noPeriodo.filter(impressa), itensImp = imp.flatMap(p => p.itens.filter(it => !fd || it.disciplina === fd).map(it => ({ ...it, p })));
  const copias = itensImp.reduce((s, it) => s + it.copias, 0);
  const ctl = controle(d, noPeriodo).filter(c => !fd || c.disciplina === fd);
  const ctlTodos = controle(d, daObra).filter(c => !fd || c.disciplina === fd);         // obsoletas: olha tudo, não só o período
  const nRecolher = ctlTodos.reduce((s, c) => s + c.recolher.length, 0);
  const tempos = imp.map(p => diasEntre(p.solicitado.em, p.plotado.em)).filter(x => x >= 0);
  const tMedio = tempos.length ? (tempos.reduce((s, x) => s + x, 0) / tempos.length) : null;
  const comPrazo = imp.filter(p => p.precisa), noPrazo = comPrazo.filter(p => p.plotado.em.slice(0, 10) <= p.precisa);
  const atrasados = daObra.filter(p => p.situacao === "pedido" && p.precisa && p.precisa < hoje.slice(0, 10));
  const semEntrega = daObra.filter(p => p.situacao === "plotado" && diasEntre(p.plotado.em, hoje) > 2);
  const aqui = `/documentos/plotagens/gestao${qs({ o: fo, disc: fd, mes: fm }) ? "?" + qs({ o: fo, disc: fd, mes: fm }) : ""}`;
  const fmtDias = x => x == null ? "—" : x < 1 ? `${Math.round(x * 24)} h` : `${x.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
  const nomeMes = m => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m.slice(5, 7) - 1] + "/" + m.slice(2, 4);

  // por prancha
  const tabCtl = ctl.sort((a, b) => b.recolher.length - a.recolher.length || b.vezes - a.vezes).map(c => {
    const rec = ctlTodos.find(x => x.chave === c.chave) || c;
    return `<tr><td><span class="dc-cod">${esc(c.atual ? codigo(c.atual) : Object.values(c.revs).pop().codigo)}</span><br><span style="font-size:11.5px;color:var(--mut)">${esc(c.atual ? c.atual.descricao : "")}</span>
        ${rec.recolher.map(r => `<div class="pl-alerta" style="margin-top:5px;padding:5px 9px">⚠️ ${plural(r.copias, "cópia", "cópias")} da <b>R${String(r.rev).padStart(2, "0")}</b> (obsoleta) na obra — recolher
          ${gere ? `<form method="POST" action="/documentos/plotagens/acao" style="display:inline" onsubmit="return confirm('Confirmar que as cópias de ${esc(r.codigo)} foram recolhidas da obra?')"><input type="hidden" name="acao" value="recolher"><input type="hidden" name="doc" value="${r.docId}"><input type="hidden" name="volta" value="${esc(aqui)}"><button class="dc-x" style="color:#8a4a00">marcar recolhidas</button></form>` : ""}</div>`).join("")}</td>
      <td style="text-align:center"><b style="font-size:18px">${c.vezes}</b>×</td><td style="text-align:center"><b>${c.copias}</b></td>
      <td style="font-size:11.5px">${Object.entries(c.mats).map(([m, n]) => `${esc(nomeMat(m))}: <b>${n}</b>`).join(" · ")}</td>
      <td class="pl-datas">${c.datas.map(x => `<span>${dataBR(x)}</span>`).join("")}</td>
      <td style="font-size:11.5px">${c.ultimo ? `<a href="/documentos/plotagens/${c.ultimo.id}" style="color:inherit">✍️ ${esc(c.ultimo.nome)}</a><br><span style="color:var(--mut)">${dh(c.ultimo.em)}</span>` : `<span style="color:var(--mut)">aguardando entrega</span>`}</td></tr>`;
  }).join("");

  // por obra
  const porObra = obras.filter(o => !fo || o.id === fo).map(o => {
    const ps = noPeriodo.filter(p => p.obra === o.id);
    return { o, ped: ps.filter(p => p.situacao !== "cancelado").length, plot: ps.filter(p => p.situacao === "pedido").length, ent: ps.filter(p => p.situacao === "plotado").length,
      cop: itensImp.filter(it => it.p.obra === o.id).reduce((s, it) => s + it.copias, 0) };
  }).filter(x => x.ped || x.cop);
  // material × tamanho (cópias)
  const tams = TAMANHOS.filter(t => itensImp.some(it => it.tamanho === t.id)), mats = MATERIAIS.filter(m => itensImp.some(it => it.material === m.id));
  const celula = (m, t) => itensImp.filter(it => it.material === m && (!t || it.tamanho === t)).reduce((s, it) => s + it.copias, 0);
  const porCor = CORES.map(c => ({ c, n: itensImp.filter(it => it.cor === c.id).reduce((s, it) => s + it.copias, 0) })).filter(x => x.n);
  // por mês (últimos 12 com impressão, sem o filtro de mês)
  const serie = [...new Set(daObra.filter(impressa).map(p => p.plotado.em.slice(0, 7)))].sort().slice(-12).map(m => ({ m,
    n: daObra.filter(p => impressa(p) && p.plotado.em.slice(0, 7) === m).flatMap(p => p.itens).filter(it => !fd || it.disciplina === fd).reduce((s, it) => s + it.copias, 0) }));
  const maxS = Math.max(1, ...serie.map(x => x.n));
  // por quem plota
  const porPlot = PLOTADORES.map(pl => {
    const ps = noPeriodo.filter(p => p.plota === pl.id), feitos = ps.filter(impressa), t = feitos.map(p => diasEntre(p.solicitado.em, p.plotado.em));
    return { pl, abertos: ps.filter(p => p.situacao === "pedido").length, feitos: feitos.length, cop: feitos.reduce((s, p) => s + copiasDe(p), 0), t: t.length ? t.reduce((s, x) => s + x, 0) / t.length : null };
  }).filter(x => x.abertos || x.feitos);
  const vazio = txt => `<div style="color:var(--mut);font-size:13px">${txt}</div>`;
  const pendencia = (p, txt) => `<div style="font-size:12.5px;padding:5px 0;border-bottom:1px solid #f3f0e6"><a href="/documentos/plotagens/${p.id}" style="font-weight:800;color:inherit">${numPedido(p)}</a> · ${esc((obras.find(o => o.id === p.obra) || {}).nome || p.obra)} · ${plural(copiasDe(p), "cópia", "cópias")} · <span style="color:#a12d2d">${txt}</span></div>`;

  const body = `${CSS}${CSS_PL}${topoProjetos(user, "plot")}${voltaPl()}
    <h2 style="margin:12px 0 10px">📊 Gestão das plotagens</h2>
    ${caixaMsg(ok, erro)}
    <div class="pj-quadro" style="margin-top:0"><form method="GET" action="/documentos/plotagens/gestao" class="pl-filtros">
      ${selFiltro("o", "Obra", "— todas as obras —", obras.map(o => [o.id, o.nome]), fo)}
      ${selFiltro("disc", "Disciplina", "— todas —", DISCIPLINAS.map(x => [x.id, `${x.ic} ${x.nome}`]), fd)}
      ${selFiltro("mes", "Mês", "— todo o período —", meses.map(m => [m, nomeMes(m)]), fm)}
      ${fo || fd || fm ? `<a href="/documentos/plotagens/gestao" class="dc-x" style="margin-bottom:8px">limpar filtros</a>` : ""}</form></div>
    <div class="pj-kpis" style="margin-top:16px">
      ${kpi(imp.length, "pedidos plotados", "", "Pedidos marcados como plotados (no período)")}
      ${kpi(copias, "cópias plotadas", "#b8920f", "Soma das cópias plotadas (no período)")}
      ${kpi(ctl.length, "pranchas diferentes", "", "Pranchas impressas — todas as revisões de uma prancha contam uma vez")}
      ${kpi(fmtDias(tMedio), "do pedido à plotagem", "", "Tempo médio entre a solicitação e a marcação de plotada")}
      ${kpi(comPrazo.length ? Math.round(noPrazo.length / comPrazo.length * 100) + "%" : "—", "plotadas no prazo", comPrazo.length && noPrazo.length < comPrazo.length ? "#a12d2d" : "#2f8a3a", "Dos pedidos com 'precisa até', quantos foram plotados até a data")}
      ${kpi(nRecolher, "revisões obsoletas na obra", nRecolher ? "#a12d2d" : "", "Revisões impressas que ficaram obsoletas e ainda não foram recolhidas")}
    </div>
    ${atrasados.length || semEntrega.length ? `<div class="pj-quadro"><div class="pj-qt"><b>⏰ Pendências</b><span>pedidos atrasados e plotagens paradas sem entrega</span></div>
      ${atrasados.map(p => pendencia(p, `passou do prazo (${dataBR(p.precisa)}) e não foi plotado`)).join("")}
      ${semEntrega.map(p => pendencia(p, `plotado em ${dataBR(p.plotado.em)} e ainda sem entrega`)).join("")}</div>` : ""}
    <div class="pj-quadro"><div class="pj-qt"><b>🗂️ Controle por prancha</b><span>quantas vezes cada prancha foi impressa, as datas e quem recebeu</span></div>
      ${tabCtl ? `<div class="pl-rola"><table class="dc-t"><thead><tr><th>Prancha (revisão atual)</th><th style="text-align:center">Impressa</th><th style="text-align:center">Cópias</th><th>Material</th><th>Datas de impressão</th><th>Último recebimento</th></tr></thead><tbody>${tabCtl}</tbody></table></div>`
        : vazio(`Nenhuma prancha impressa${fo || fd || fm ? " com estes filtros" : " ainda"}.`)}</div>
    <div class="pl-2col">
      <div class="pj-quadro"><div class="pj-qt"><b>🏗️ Por obra</b></div>
        ${porObra.length ? `<div class="pl-rola"><table class="dc-t pl-t-num" style="min-width:0"><thead><tr><th>Obra</th><th>Pedidos</th><th>Aguard. plotar</th><th>Aguard. entrega</th><th>Cópias</th></tr></thead><tbody>
          ${porObra.map(x => `<tr><td><a href="/documentos/plotagens/gestao?${qs({ o: x.o.id, disc: fd, mes: fm })}" style="color:inherit;font-weight:700">${esc(x.o.nome)}</a></td><td>${x.ped}</td><td>${x.plot || "—"}</td><td>${x.ent || "—"}</td><td><b>${x.cop}</b></td></tr>`).join("")}</tbody></table></div>` : vazio("Nada no período.")}</div>
      <div class="pj-quadro"><div class="pj-qt"><b>🧻 Material × tamanho</b><span>cópias plotadas</span></div>
        ${mats.length ? `<div class="pl-rola"><table class="dc-t pl-t-num" style="min-width:0"><thead><tr><th>Material</th>${tams.map(t => `<th>${esc(t.id === "arquivo" ? "Conf. arquivo" : t.nome)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
          ${mats.map(m => `<tr><td>${esc(m.nome)}</td>${tams.map(t => `<td>${celula(m.id, t.id) || "—"}</td>`).join("")}<td><b>${celula(m.id)}</b></td></tr>`).join("")}</tbody></table></div>
          <div style="font-size:12px;color:var(--mut);margin-top:8px">${porCor.map(x => `${esc(x.c.nome)}: <b>${x.n}</b>`).join(" · ")}</div>` : vazio("Nada plotado no período.")}</div>
      <div class="pj-quadro"><div class="pj-qt"><b>📅 Cópias por mês</b></div>
        ${serie.length ? `<div class="pl-barras">${serie.map(x => `<div><i style="height:${Math.max(3, x.n / maxS * 100)}%"><b>${x.n}</b></i><span>${nomeMes(x.m)}</span></div>`).join("")}</div>` : vazio("Nada plotado ainda.")}</div>
      <div class="pj-quadro"><div class="pj-qt"><b>🧑‍🔧 Por quem plota</b></div>
        ${porPlot.length ? `<table class="dc-t pl-t-num"><thead><tr><th>Quem plota</th><th>Em aberto</th><th>Plotados</th><th>Cópias</th><th>Tempo médio</th></tr></thead><tbody>
          ${porPlot.map(x => `<tr><td>${esc(x.pl.nome)}</td><td>${x.abertos || "—"}</td><td>${x.feitos}</td><td><b>${x.cop}</b></td><td>${fmtDias(x.t)}</td></tr>`).join("")}</tbody></table>` : vazio("Nada no período.")}</div>
    </div>
    <details class="dc-disc"><summary>Explique melhor</summary><div class="dc-corpo" style="font-size:13px;line-height:1.75">
      Conta como <b>impressão</b> o pedido marcado "plotada", na data em que foi marcado. Pedidos cancelados não entram.<br>
      <b>Controle por prancha:</b> todas as revisões de uma prancha contam juntas. Quando sai revisão nova e a impressa fica <b>obsoleta</b>, aparece o aviso para recolher as cópias da obra — e fica guardado quem recolheu e quando (esse aviso olha todo o período, mesmo com filtro de mês).<br>
      <b>Do pedido à plotagem:</b> tempo médio entre a solicitação e a marcação de plotada. <b>No prazo:</b> só os pedidos com "precisa até".<br>
      <b>Pendências:</b> pedido que passou do "precisa até" sem plotar, e plotagem há mais de 2 dias sem entrega.</div></details>`;
  return shell({ title: "Plotagens · Gestão", body, user });
}

// ---------- o pedido (comprovante) e a assinatura de recebimento ----------
export function paginaPlotagem(user, id, { ok = "", erro = "" } = {}) {
  if (!vePlot(user)) return null;
  const d = ler(), p = plotagensDe(d).find(x => x.id === id); if (!p || !podeObra(user, p.obra)) return null;
  const obra = (obrasDoUsuario(user).find(o => o.id === p.obra) || {}).nome || p.obra, nCop = copiasDe(p), aqui = `/documentos/plotagens/${p.id}`;
  const receber = p.situacao === "plotado" ? `<div class="pj-quadro pl-nao-imprime" id="receber"><div class="pj-qt"><b>✍️ Recebimento</b><span>quem recebe as pranchas assina com o dedo no quadro</span></div>
    <form method="POST" action="/documentos/plotagens/${p.id}/receber" id="plFA" onsubmit="return plAssina()" style="max-width:560px">
      <label style="display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--mut);margin-bottom:4px">Nome de quem recebe</label>
      <input name="nome" required maxlength="120" style="width:100%;padding:9px;border:1px solid #ddd8c8;border-radius:9px;font-size:14px;font-family:inherit;box-sizing:border-box" placeholder="Nome completo">
      <label style="display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--mut);margin:12px 0 4px">Assine com o dedo no quadro</label>
      <div class="pl-quadro-ass"><canvas id="plCanvas"></canvas><span class="linha"></span><span class="dica" id="plDica">assine aqui</span></div>
      <input type="hidden" name="assinatura" id="plAss">
      <div style="display:flex;gap:10px;margin-top:12px"><button type="button" class="dc-bt claro" onclick="plLimpa()" style="padding:10px 16px">Limpar</button>
        <button class="dc-bt" id="plOk" disabled style="flex:1;font-size:14px;padding:11px">Confirmar recebimento de ${plural(nCop, "cópia", "cópias")}</button></div>
      <div class="dc-dica">Ao confirmar, a assinatura fica gravada neste pedido, com data e hora e o nome de quem colheu (${esc(quem(user))}).</div></form>
    <script>(function(){ var c=document.getElementById('plCanvas'), x=c.getContext('2d'), riscou=false, des=false;
      function ajusta(){ var r=c.getBoundingClientRect(), k=window.devicePixelRatio||1; c.width=Math.round(r.width*k); c.height=Math.round(r.height*k); x.setTransform(k,0,0,k,0,0);
        x.lineWidth=2.6; x.lineCap='round'; x.lineJoin='round'; x.strokeStyle='#111'; riscou=false; document.getElementById('plOk').disabled=true; document.getElementById('plDica').style.display=''; }
      function pos(e){ var r=c.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
      c.addEventListener('pointerdown', function(e){ e.preventDefault(); c.setPointerCapture(e.pointerId); des=true; var q=pos(e); x.beginPath(); x.moveTo(q.x,q.y); x.lineTo(q.x+0.1,q.y+0.1); x.stroke(); });
      c.addEventListener('pointermove', function(e){ if(!des) return; e.preventDefault(); var q=pos(e); x.lineTo(q.x,q.y); x.stroke();
        if(!riscou){ riscou=true; document.getElementById('plOk').disabled=false; document.getElementById('plDica').style.display='none'; } });
      ['pointerup','pointercancel','pointerleave'].forEach(function(t){ c.addEventListener(t, function(){ des=false; }); });
      window.plLimpa=function(){ x.clearRect(0,0,c.width,c.height); ajusta(); };
      window.plAssina=function(){ if(!riscou){ alert('Assine no quadro antes de confirmar.'); return false; } document.getElementById('plAss').value=c.toDataURL('image/png'); document.getElementById('plOk').disabled=true; return true; };
      ajusta(); window.addEventListener('resize', function(){ if(!riscou) ajusta(); }); })();</script></div>` : "";
  const msgG = mensagemGrafica(p, obra), faltam = p.itens.filter(it => !arquivoDoItem(d, it)).map(it => it.codigo);
  const grafica = p.situacao === "cancelado" ? "" : `<div class="pj-quadro pl-nao-imprime"><div class="pj-qt"><b>📦 Para a gráfica</b><span>os PDFs num arquivo compactado e a mensagem pronta — é só mandar</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px"><a class="dc-bt" style="padding:9px 16px" href="/documentos/plotagens/${p.id}/zip">⬇️ Baixar as pranchas (${numPedido(p)}.zip)</a>
      <button type="button" class="dc-bt claro" style="padding:9px 16px" onclick="var t=document.getElementById('plMsg');t.select();(navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(function(){},function(){document.execCommand('copy')});this.textContent='✓ Mensagem copiada'">📋 Copiar a mensagem</button></div>
    ${faltam.length ? `<div class="pl-alerta" style="margin:0 0 10px">⚠️ Não achei o arquivo de ${esc(faltam.join(", "))} — ele não vai no .zip.</div>` : ""}
    <textarea id="plMsg" readonly style="width:100%;box-sizing:border-box;min-height:220px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.5;padding:10px;border:1px solid #e6e0cf;border-radius:10px;background:#fcfbf7">${esc(msgG)}</textarea>
    <div class="dc-dica">Dentro do .zip, cada PDF vem com o nome que diz como plotar (ex.: <i>01 - ${esc(p.itens[0].codigo)} - …</i>) e a mensagem vai junto em texto. Prancha com versão carimbada vai carimbada.</div></div>`;
  const trocar = p.situacao === "pedido" && gerePlot(user) && PLOTADORES.length > 1 ? `<form method="POST" action="/documentos/plotagens/acao" class="pl-nao-imprime" style="display:inline-flex;gap:6px;align-items:center;margin-left:8px">
      <input type="hidden" name="id" value="${p.id}"><input type="hidden" name="acao" value="plota"><input type="hidden" name="volta" value="${aqui}">
      <select name="plota" style="padding:4px 6px;border:1px solid #ddd8c8;border-radius:7px;font-family:inherit">${PLOTADORES.map(x => `<option value="${x.id}"${x.id === p.plota ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select><button class="dc-x">trocar</button></form>` : "";
  const reavisar = p.situacao === "pedido" && p.aviso && !p.aviso.ok && envioLigado() && gerePlot(user)
    ? `<form method="POST" action="/documentos/plotagens/acao" class="pl-nao-imprime" style="display:inline"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="acao" value="avisar"><input type="hidden" name="volta" value="${aqui}"><button class="dc-x">mandar o aviso de novo</button></form>` : "";
  const body = `${CSS}${CSS_PL}<a class="pg-volta" href="/documentos/plotagens/solicitar?o=${p.obra}"><span class="seta">←</span> Solicitar plotagem</a>
    <div style="margin-top:12px">${caixaMsg(ok, erro)}</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:10px 0 0"><h1 style="margin:0">🖨️ ${numPedido(p)}</h1>${selo(p.situacao)}
      <span style="margin-left:auto" class="pl-nao-imprime">${botoes(user, p, aqui, true)} <button class="dc-bt claro" onclick="window.print()">Imprimir</button></span></div>
    <div style="font-size:14px;margin-top:4px"><b>${esc(obra)}</b> · ${plural(p.itens.length, "prancha", "pranchas")} · ${plural(nCop, "cópia", "cópias")} · quem plota: <b>${esc(nomePlot(p.plota))}</b>${trocar}</div>
    <div class="pj-quadro"><div class="pl-rola"><table class="dc-t"><thead><tr><th>Prancha</th><th>Descrição</th><th style="text-align:center">Quantidade</th><th>Cor</th><th>Material</th><th>Tamanho</th></tr></thead><tbody>
      ${p.itens.map(it => `<tr><td><span class="dc-cod">${esc(it.codigo)}</span></td><td>${esc(it.descricao)}</td><td style="text-align:center"><b>${it.copias}</b></td><td>${esc(nomeCor(it.cor))}</td><td>${esc(nomeMat(it.material))}</td><td>${esc(nomeTam(it.tamanho))}</td></tr>`).join("")}
      </tbody></table></div>${p.obs ? `<div style="font-size:12.5px;margin-top:8px"><b>Observação:</b> ${esc(p.obs)}</div>` : ""}</div>
    <div class="pj-quadro pl-tl"><div class="pj-qt"><b>🕘 Andamento</b></div>
      <div>📝 Solicitado por <b>${esc(p.solicitado.por)}</b> em ${dh(p.solicitado.em)}${p.precisa ? ` · precisa até <b>${dataBR(p.precisa)}</b>` : ""}</div>
      ${(p.log || []).map(l => `<div>${esc(l.ic || "•")} ${esc(l.txt)} — <b>${esc(l.por)}</b> em ${dh(l.em)}</div>`).join("")}
      ${p.aviso ? `<div>✉️ ${p.aviso.ok ? `Aviso por e-mail para <b>${esc(p.aviso.para)}</b> em ${dh(p.aviso.em)}${(p.aviso.anexos || []).length > 1 ? ` — em ${p.aviso.anexos.length} e-mails (${esc(p.aviso.anexos.join(", "))})` : (p.aviso.anexos || []).length ? ` — com o ${esc(p.aviso.anexos[0])} anexado` : " — sem anexo (baixar o .zip aqui)"}${(p.aviso.grandes || []).length ? ` · ${esc(p.aviso.grandes.join(", "))} não coube em e-mail: baixar aqui` : ""}` : p.aviso.pendente ? `Aviso por e-mail para <b>${esc(p.aviso.para)}</b>: aguardando o envio ser ligado no servidor` : `Aviso por e-mail não saiu: ${esc(p.aviso.erro)}`} ${reavisar}</div>` : ""}
      ${p.plotado ? `<div>🖨️ Plotado — marcado por <b>${esc(p.plotado.por)}</b> em ${dh(p.plotado.em)}</div>` : ""}
      ${p.entregue ? `<div>✍️ Recebido por <b>${esc(p.entregue.nome)}</b> em ${dh(p.entregue.em)} · assinatura colhida por ${esc(p.entregue.coletadoPor)}</div>
        <div class="pl-ass" style="margin-top:8px"><img src="/documentos/plotagens/${p.id}/assinatura" alt="assinatura de ${esc(p.entregue.nome)}"><div style="font-size:12px">${esc(p.entregue.nome)}</div></div>` : ""}
      ${p.cancelado ? `<div>✖ Cancelado por <b>${esc(p.cancelado.por)}</b> em ${dh(p.cancelado.em)} — ${esc(p.cancelado.motivo)}</div>` : ""}</div>
    ${grafica}
    ${receber}`;
  return shell({ title: `Plotagem ${numPedido(p)}`, body, user });
}

// ---------- o aviso por e-mail a quem plota ----------
/** Manda o aviso (pela ponte, se o servidor tiver o envio ligado) e devolve o registro para guardar no pedido. */
async function avisar(p, user) {
  const pl = PLOTADORES.find(x => x.id === p.plota), para = pl && pl.email;
  if (!para) return { erro: "quem plota não tem e-mail cadastrado", em: agoraLocalISO() };
  if (!envioLigado()) return { pendente: true, para, em: agoraLocalISO() };
  const obra = (obrasDoUsuario(user).find(o => o.id === p.obra) || {}).nome || p.obra, nCop = copiasDe(p);
  // os PDFs vão anexados em .zip de até 20 MB — passou disso, o pedido vai em vários e-mails ("parte 1 de N"), um .zip
  // em cada; é só encaminhar todos à gráfica. O 1º leva o recado e a mensagem completa; os outros dizem o que trazem.
  let pk; try { pk = pacotesDoPedido(ler(), p, obra); } catch (e) { pk = { pacotes: [], nomes: [], faltando: [], grandes: [], falhou: e.message }; }
  const N = pk.pacotes.length, painel = `Engenharia e Obra › Projetos › Plotagens › Solicitar plotagem › ${numPedido(p)}`;
  const avisos = [...(pk.faltando.length ? [`Atenção: não achei o arquivo de ${pk.faltando.join(", ")}.`] : []),
    ...(pk.grandes.length ? [`Atenção: ${pk.grandes.join(", ")} passa${pk.grandes.length > 1 ? "m" : ""} de ${LIMITE_ANEXO / 1048576} MB sozinha${pk.grandes.length > 1 ? "s" : ""} e não cabe${pk.grandes.length > 1 ? "m" : ""} em e-mail: baixe no painel (${painel}).`] : []),
    ...(pk.falhou ? [`Não deu para montar o .zip (${pk.falhou}): baixe no painel (${painel}).`] : [])];
  const assunto = k => `Plotagem ${numPedido(p)} — ${obra} — ${plural(nCop, "cópia", "cópias")}${N > 1 ? ` (parte ${k + 1} de ${N})` : ""}`;
  const texto1 = [`Olá, ${pl.nome}.`, "", `Nova solicitação de plotagem ${numPedido(p)} — ${obra}, pedida por ${p.solicitado.por} em ${dh(p.solicitado.em)}${p.precisa ? ` (precisa até ${dataBR(p.precisa)})` : ""}.`,
    ...(p.obs ? [`Observação de quem pediu: ${p.obs}`] : []), "",
    N > 1 ? `Os PDFs passaram de ${LIMITE_ANEXO / 1048576} MB e foram divididos em ${N} e-mails (este é a parte 1, com ${pk.pacotes[0].nome}). Para mandar à gráfica, encaminhe os ${N} e-mails.`
      : N ? `Os PDFs estão no anexo ${pk.pacotes[0].nome}. Para mandar à gráfica, é só encaminhar este e-mail (ou copiar a mensagem abaixo junto com o anexo).` : "",
    ...avisos, "", "———————— MENSAGEM PARA A GRÁFICA ————————", "", mensagemGrafica(p, obra, N ? pk.nomes : [`${numPedido(p)}.zip`])].join("\n");
  const textoK = k => [`Parte ${k + 1} de ${N} do pedido de plotagem ${numPedido(p)} — ${obra}.`, "",
    `Neste anexo (${pk.pacotes[k].nome}): ${pk.pacotes[k].codigos.join(", ")}.`, "",
    `A mensagem para a gráfica está no e-mail "parte 1 de ${N}" e também dentro de cada .zip. Encaminhe os ${N} e-mails à gráfica.`].join("\n");
  const enviados = [];
  try {
    for (let k = 0; k < Math.max(1, N); k++) {
      const r = await PONTE.enviarMensagem({ canal: "email", para, nome: pl.nome, assunto: assunto(k), texto: k === 0 ? texto1 : textoK(k),
        ...(N ? { anexo: { nomeArquivo: pk.pacotes[k].nome, tipo: "application/zip", conteudo: pk.pacotes[k].buffer } } : {}),
        quem: quem(user), origem: `documentos/plotagens/${p.id}${N > 1 ? `/parte-${k + 1}` : ""}` });
      if (!(r && r.ok)) return { erro: `${N > 1 ? `parte ${k + 1} de ${N}: ` : ""}${(r && r.erro) || "sem resposta"}`, para, em: agoraLocalISO(), anexos: enviados };
      if (N) enviados.push(pk.pacotes[k].nome);
    }
    return { ok: true, para, em: agoraLocalISO(), anexos: enviados, grandes: pk.grandes };
  } catch (e) { return { erro: e.message, para, em: agoraLocalISO(), anexos: enviados }; }
}
/** Grava o resultado do aviso no pedido (relendo o arquivo, porque o envio pode ter demorado). */
function guardarAviso(id, aviso) {
  const d = ler(), p = plotagensDe(d).find(x => x.id === id); if (!p) return;
  p.aviso = aviso; gravar(d);
}

// ---------- gravações ----------
export async function solicitarPlotagem(user, campos) {
  if (!vePlot(user)) return { erro: "Sem acesso a plotagens." };
  const obra = String(campos.obra || ""); if (!podeObra(user, obra)) return { erro: "Obra não encontrada." };
  const plota = String(campos.plota || ""); if (!PLOTADORES.some(x => x.id === plota)) return { erro: "Escolha quem vai plotar." };
  const d = ler(), vv = vivos(d), itens = [];
  for (const id of [...new Set(lista(campos.sel))]) {
    const a = vv.find(x => x.id === id && x.obra === obra && x.origem !== "marcacao");
    if (!a) return { erro: "Uma das pranchas marcadas não existe mais. Confira e peça de novo." };
    if (situacao(a, vv) !== "liberado") return { erro: `${codigo(a)} não está liberada para a obra — só dá para plotar o que foi liberado.` };
    const copias = Number(campos["cp_" + id]);
    if (!Number.isInteger(copias) || copias < 1 || copias > 50) return { erro: `${codigo(a)}: o nº de cópias vai de 1 a 50.` };
    const cor = String(campos["co_" + id] || ""), material = String(campos["ma_" + id] || ""), tamanho = String(campos["tm_" + id] || "");
    if (!CORES.some(x => x.id === cor)) return { erro: `${codigo(a)}: escolha a cor.` };
    if (!MATERIAIS.some(x => x.id === material)) return { erro: `${codigo(a)}: escolha o material.` };
    if (!TAMANHOS.some(x => x.id === tamanho)) return { erro: `${codigo(a)}: escolha o tamanho.` };
    itens.push({ docId: a.id, chave: chaveP(a), codigo: codigo(a), descricao: a.descricao, disciplina: a.disciplina, rev: a.rev, copias, cor, material, tamanho });
  }
  if (!itens.length) return { erro: "Marque ao menos uma prancha." };
  const precisa = /^\d{4}-\d{2}-\d{2}$/.test(String(campos.precisa || "")) ? String(campos.precisa) : "";
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), n: plotagensDe(d).filter(x => x.obra === obra).length + 1, obra, itens, plota,
    obs: String(campos.obs || "").trim().slice(0, 300), precisa, situacao: "pedido",
    solicitado: { por: quem(user), login: user.usuario, em: agoraLocalISO() } };
  (d.plotagens = d.plotagens || []).push(p);
  registrar(d, user, obra, `Plotagem ${numPedido(p)} solicitada a ${nomePlot(plota)}: ${itens.length} prancha(s), ${copiasDe(p)} cópia(s)`);
  gravar(d);
  const aviso = await avisar(p, user); guardarAviso(p.id, aviso);
  const txtAviso = aviso.ok ? ` ${nomePlot(plota)} foi avisado por e-mail${(aviso.anexos || []).length > 1 ? ` (${aviso.anexos.length} e-mails, por causa do tamanho dos PDFs)` : ""}.` : aviso.pendente ? "" : ` (O aviso por e-mail não saiu: ${aviso.erro}.)`;
  return { ok: `Pedido ${numPedido(p)} feito.${txtAviso}`, id: p.id };
}

export async function acaoPlotagem(user, campos) {
  if (!vePlot(user)) return { erro: "Sem acesso a plotagens." };
  const d = ler(), acao = String(campos.acao || ""), agora = { por: quem(user), login: user.usuario, em: agoraLocalISO() };
  if (acao === "recolher") {
    if (!gerePlot(user)) return { erro: "Só a engenharia marca as cópias como recolhidas." };
    const a = (d.arquivos || []).find(x => x.id === String(campos.doc || "")); if (!a || !podeObra(user, a.obra)) return { erro: "Prancha não encontrada." };
    (d.plotRecolhidas = d.plotRecolhidas || {})[a.id] = agora;
    registrar(d, user, a.obra, `Plotagem: cópias de ${codigo(a)} (obsoleta) recolhidas da obra`); gravar(d);
    return { ok: `Cópias de ${codigo(a)} marcadas como recolhidas.` };
  }
  const p = plotagensDe(d).find(x => x.id === String(campos.id || "")); if (!p || !podeObra(user, p.obra)) return { erro: "Pedido não encontrado." };
  if (acao === "plotado") {
    if (!podePlotar(user, p)) return { erro: `Quem marca como plotada é ${nomePlot(p.plota)} ou a engenharia.` };
    if (p.situacao !== "pedido") return { erro: `${numPedido(p)} não está aguardando plotagem.` };
    p.situacao = "plotado"; p.plotado = agora;
    registrar(d, user, p.obra, `Plotagem ${numPedido(p)} plotada`); gravar(d);
    return { ok: `${numPedido(p)} plotada. Falta entregar e colher a assinatura.` };
  }
  if (acao === "plota") {
    if (!gerePlot(user)) return { erro: "Só a engenharia troca quem plota." };
    const novo = String(campos.plota || ""); if (!PLOTADORES.some(x => x.id === novo)) return { erro: "Escolha quem vai plotar." };
    if (p.situacao !== "pedido") return { erro: `${numPedido(p)} não está mais aguardando plotagem.` };
    if (novo === p.plota) return { ok: "Nada mudou." };
    (p.log = p.log || []).push({ ic: "🔁", txt: `Quem plota: ${nomePlot(p.plota)} → ${nomePlot(novo)}`, ...agora }); p.plota = novo;
    registrar(d, user, p.obra, `Plotagem ${numPedido(p)}: agora quem plota é ${nomePlot(novo)}`); gravar(d);
    guardarAviso(p.id, await avisar(p, user));
    return { ok: `${numPedido(p)} agora é com ${nomePlot(novo)}.` };
  }
  if (acao === "avisar") {
    if (!gerePlot(user)) return { erro: "Só a engenharia manda o aviso de novo." };
    const aviso = await avisar(p, user); guardarAviso(p.id, aviso);
    return aviso.ok ? { ok: "Aviso enviado." } : { erro: aviso.pendente ? "O envio de e-mail ainda não está ligado no servidor." : "O aviso não saiu: " + aviso.erro };
  }
  if (acao === "cancelar") {
    const pode = (p.situacao === "pedido" && (gerePlot(user) || p.solicitado.login === user.usuario)) || (p.situacao === "plotado" && gerePlot(user));
    if (!pode) return { erro: "Este pedido não pode mais ser cancelado por você." };
    const motivo = String(campos.motivo || "").trim().slice(0, 200); if (!motivo) return { erro: "Diga o motivo do cancelamento." };
    p.cancelado = { ...agora, motivo, situacaoAntes: p.situacao }; p.situacao = "cancelado";
    registrar(d, user, p.obra, `Plotagem ${numPedido(p)} cancelada: ${motivo}`); gravar(d);
    return { ok: `${numPedido(p)} cancelada.` };
  }
  return { erro: "Ação desconhecida." };
}

export function receberPlotagem(user, id, campos) {
  if (!vePlot(user)) return { erro: "Sem acesso a plotagens." };
  const d = ler(), p = plotagensDe(d).find(x => x.id === id); if (!p || !podeObra(user, p.obra)) return { erro: "Pedido não encontrado." };
  if (p.situacao !== "plotado") return { erro: p.situacao === "entregue" ? "Este pedido já foi entregue." : "Só dá para colher a assinatura depois de plotado." };
  const nome = String(campos.nome || "").trim().slice(0, 120); if (nome.length < 3) return { erro: "Escreva o nome de quem recebe." };
  const m = String(campos.assinatura || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { erro: "A assinatura não chegou. Assine no quadro e confirme de novo." };
  const buffer = Buffer.from(m[1], "base64");
  if (buffer.length < 900) return { erro: "A assinatura ficou vazia ou pequena demais. Assine de novo." };
  if (buffer.length > 2 * 1024 * 1024) return { erro: "A imagem da assinatura ficou grande demais." };
  let arquivo; try { arquivo = salvarArquivo({ ext: ".png", buffer, nomeOriginal: "assinatura.png" }, PASTA_ASS); } catch (e) { return { erro: "Não deu para guardar a assinatura: " + e.message }; }
  p.entregue = { nome, arquivo, em: agoraLocalISO(), coletadoPor: quem(user), login: user.usuario }; p.situacao = "entregue";
  registrar(d, user, p.obra, `Plotagem ${numPedido(p)} entregue a ${nome} (assinatura colhida)`); gravar(d);
  return { ok: `Recebimento de ${numPedido(p)} registrado com a assinatura de ${nome}.` };
}

/** A imagem da assinatura de recebimento (só para quem vê a obra). */
export function assinaturaPlotagem(user, id) {
  if (!vePlot(user)) return null;
  const p = plotagensDe(ler()).find(x => x.id === id); if (!p || !p.entregue || !podeObra(user, p.obra)) return null;
  const caminho = join(PASTA_ASS, p.entregue.arquivo); if (!existsSync(caminho)) return null;
  return { buffer: readFileSync(caminho), nome: `assinatura-${numPedido(p)}.png` };
}
