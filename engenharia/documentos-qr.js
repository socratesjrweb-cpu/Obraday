// documentos-qr.js — o QR CODE DE VALIDADE da prancha (06/11).
//
//   · toda prancha em PDF que sai do painel (Abrir, baixar, plotagem) leva um QR code no canto de cima, à direita;
//   · na obra, com a prancha impressa, a pessoa aponta o celular: abre a página /documentos/qr/<id>, que diz na hora
//     "PRANCHA VÁLIDA" ou "PRANCHA DESATUALIZADA, POR FAVOR DESCARTE E ATUALIZE" (e qual é a revisão que vale);
//   · o PDF GUARDADO NUNCA MUDA: o QR é posto numa CÓPIA, na hora de entregar (atualização incremental do PDF: o
//     original fica inteiro e o QR vai acrescentado no fim do arquivo). PDF que não der para ler sai sem QR (como antes);
//   · o QR é desenhado aqui mesmo (sem programa nenhum): texto em modo byte, correção de erro M.
// Cada leitura do QR fica registrada (quem, quando) em documentos.json → qrLeituras.
import { readFileSync, statSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { shell, agoraLocalISO, OBRAS_DOCS } from "../ponte-engenharia.js";
import { BASE_DOCS } from "./documentos.js";

// ======================================================================================================
// 1) O QR CODE (modo byte, correção M, versões 1 a 10 — sobra para o endereço da prancha)
// ======================================================================================================
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];      // palavras de correção por bloco
const BLOCOS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];             // nº de blocos
const modulosDados = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
const palavrasDados = v => Math.floor(modulosDados(v) / 8) - ECC_M[v] * BLOCOS_M[v];
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
function rsDivisor(grau) { const r = new Array(grau).fill(0); r[grau - 1] = 1; let raiz = 1;
  for (let i = 0; i < grau; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], raiz); if (j + 1 < r.length) r[j] ^= r[j + 1]; } raiz = gfMul(raiz, 0x02); } return r; }
function rsResto(dados, div) { const r = div.map(() => 0); for (const b of dados) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }
const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** Devolve a matriz do QR (array de linhas de true/false) para o texto. */
export function qrMatriz(texto) {
  const bytes = [...Buffer.from(String(texto), "utf8")];
  let v = 1; while (v <= 10 && 4 + (v <= 9 ? 8 : 16) + bytes.length * 8 > palavrasDados(v) * 8) v++;
  if (v > 10) throw new Error("texto grande demais para o QR");
  // os bits: modo byte (0100), tamanho, os bytes, terminador e enchimento
  const bb = []; const poe = (val, n) => { for (let i = n - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
  poe(4, 4); poe(bytes.length, v <= 9 ? 8 : 16); bytes.forEach(b => poe(b, 8));
  const cap = palavrasDados(v) * 8; poe(0, Math.min(4, cap - bb.length)); poe(0, (8 - bb.length % 8) % 8);
  for (let p = 0xEC; bb.length < cap; p ^= 0xEC ^ 0x11) poe(p, 8);
  const dados = []; for (let i = 0; i < bb.length; i += 8) dados.push(parseInt(bb.slice(i, i + 8).join(""), 2));
  // blocos com a correção de erro, intercalados
  const nB = BLOCOS_M[v], eL = ECC_M[v], tot = Math.floor(modulosDados(v) / 8), nCurtos = nB - tot % nB, lenCurto = Math.floor(tot / nB), div = rsDivisor(eL);
  const blocos = []; for (let i = 0, k = 0; i < nB; i++) { const dat = dados.slice(k, k + lenCurto - eL + (i < nCurtos ? 0 : 1)); k += dat.length; const ecc = rsResto(dat, div); if (i < nCurtos) dat.push(0); blocos.push(dat.concat(ecc)); }
  const fim = []; for (let i = 0; i < blocos[0].length; i++) blocos.forEach((b, j) => { if (i !== lenCurto - eL || j >= nCurtos) fim.push(b[i]); });
  // a matriz e os desenhos fixos
  const n = v * 4 + 17, M = Array.from({ length: n }, () => new Array(n).fill(false)), F = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixo = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < n; i++) { fixo(6, i, i % 2 === 0); fixo(i, 6, i % 2 === 0); }
  [[3, 3], [n - 4, 3], [3, n - 4]].forEach(([x, y]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < n && yy >= 0 && yy < n) fixo(xx, yy, d !== 2 && d !== 4); } });
  if (v > 1) { const na = Math.floor(v / 7) + 2, passo = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, pos = [6]; for (let p = n - 7; pos.length < na; p -= passo) pos.splice(1, 0, p);
    pos.forEach((x, i) => pos.forEach((y, j) => { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixo(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); })); }
  const formato = mask => { const dat = (0 << 3) | mask; let r = dat; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const bits = ((dat << 10) | r) ^ 0x5412;   // correção M = 00
    for (let i = 0; i <= 5; i++) fixo(8, i, bit(bits, i)); fixo(8, 7, bit(bits, 6)); fixo(8, 8, bit(bits, 7)); fixo(7, 8, bit(bits, 8)); for (let i = 9; i < 15; i++) fixo(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) fixo(n - 1 - i, 8, bit(bits, i)); for (let i = 8; i < 15; i++) fixo(8, n - 15 + i, bit(bits, i)); fixo(8, n - 8, true); };
  formato(0);
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const bits = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const b = bit(bits, i), a = n - 11 + i % 3, c = Math.floor(i / 3); fixo(a, c, b); fixo(c, a, b); } }
  // os dados, em zigue-zague
  let i = 0; for (let dir = n - 1; dir >= 1; dir -= 2) { if (dir === 6) dir = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) { const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? n - 1 - vert : vert;
      if (!F[y][x] && i < fim.length * 8) { M[y][x] = bit(fim[i >>> 3], 7 - (i & 7)); i++; } } }
  // a máscara que deixa o QR mais fácil de ler
  const inverte = (m, x, y) => [(x + y) % 2, y % 2, x % 3, (x + y) % 3, (Math.floor(x / 3) + Math.floor(y / 2)) % 2, x * y % 2 + x * y % 3, (x * y % 2 + x * y % 3) % 2, ((x + y) % 2 + x * y % 3) % 2][m] === 0;
  const aplica = m => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && inverte(m, x, y)) M[y][x] = !M[y][x]; };
  const pena = () => { let p = 0, escuros = 0;
    for (let y = 0; y < n; y++) for (const lin of [M[y], M.map(r => r[y])]) { let corrida = 1; for (let x = 1; x <= n; x++) { if (x < n && lin[x] === lin[x - 1]) corrida++; else { if (corrida >= 5) p += corrida - 2; corrida = 1; } } }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    M.forEach(r => r.forEach(c => { if (c) escuros++; })); p += Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n)) * 10; return p; };
  let melhor = 0, menor = Infinity; for (let m = 0; m < 8; m++) { aplica(m); formato(m); const p = pena(); if (p < menor) { menor = p; melhor = m; } aplica(m); }
  aplica(melhor); formato(melhor); return M;
}

/** O QR em SVG (para mostrar na tela). */
export function qrSVG(texto, px = 180) {
  const M = qrMatriz(texto), n = M.length, q = 4; let d = "";
  M.forEach((r, y) => r.forEach((c, x) => { if (c) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// ======================================================================================================
// 2) LER O PDF (o mínimo para achar as páginas): tabela xref clássica ou em fluxo, fluxos de objetos, Flate
// ======================================================================================================
const BRANCO = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set("()<>[]{}/%".split("").map(c => c.charCodeAt(0)));
class Leitor {
  constructor(buf) { this.b = buf; this.s = buf.toString("latin1"); this.xref = {}; this.cache = {}; this.stm = {}; }
  pula(p) { const s = this.s; for (;;) { while (p < s.length && BRANCO.has(s.charCodeAt(p))) p++; if (s[p] === "%") { while (p < s.length && s[p] !== "\n" && s[p] !== "\r") p++; continue; } return p; } }
  valor(p) {
    const s = this.s; p = this.pula(p); const c = s[p];
    if (c === "<" && s[p + 1] === "<") { const m = {}; p += 2;
      for (;;) { p = this.pula(p); if (s[p] === ">" && s[p + 1] === ">") return [{ t: "d", m }, p + 2]; const [k, p2] = this.valor(p); if (!k || k.t !== "n") throw new Error("dicionário estranho"); const [val, p3] = this.valor(p2); m[k.v] = val; p = p3; } }
    if (c === "[") { const a = []; p++; for (;;) { p = this.pula(p); if (s[p] === "]") return [{ t: "a", v: a }, p + 1]; const [val, p2] = this.valor(p); a.push(val); p = p2; } }
    if (c === "<") { const f = s.indexOf(">", p); return [{ t: "x", v: s.slice(p, f + 1) }, f + 1]; }
    if (c === "(") { let i = p + 1, prof = 1; while (prof > 0 && i < s.length) { const k = s[i]; if (k === "\\") i++; else if (k === "(") prof++; else if (k === ")") prof--; i++; } return [{ t: "x", v: s.slice(p, i) }, i]; }
    if (c === "/") { let i = p + 1; while (i < s.length && !BRANCO.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++; return [{ t: "n", v: s.slice(p, i) }, i]; }
    let i = p; while (i < s.length && !BRANCO.has(s.charCodeAt(i)) && !DELIM.has(s.charCodeAt(i))) i++; const tok = s.slice(p, i);
    if (!tok) throw new Error("PDF: valor vazio em " + p);
    if (/^\d+$/.test(tok)) { const m = /^\s+(\d+)\s+R(?=[\s\/\[\]<>()%]|$)/.exec(s.slice(i, i + 24)); if (m) return [{ t: "r", n: +tok, g: +m[1] }, i + m[0].length]; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return [{ t: "#", v: tok, num: +tok }, i];
    return [{ t: "k", v: tok }, i];
  }
  /** O objeto que começa em p ("n g obj"), com o fluxo, se houver. */
  objetoEm(p) {
    const m = /^\s*(\d+)\s+(\d+)\s+obj/.exec(this.s.slice(p, p + 40)); if (!m) throw new Error("PDF: objeto não está onde a tabela diz");
    let [v, q] = this.valor(p + m[0].length); q = this.pula(q);
    if (this.s.startsWith("stream", q)) { q += 6; if (this.s[q] === "\r") q++; if (this.s[q] === "\n") q++;
      let len = this.res(v.m["/Length"]); len = len && len.t === "#" ? len.num : -1;
      if (len < 0 || this.s.slice(q + len, q + len + 30).indexOf("endstream") < 0) { len = this.s.indexOf("endstream", q) - q; while (len > 0 && (this.s[q + len - 1] === "\n" || this.s[q + len - 1] === "\r")) len--; }
      return { v, dados: this.b.subarray(q, q + len) }; }
    return { v };
  }
  obj(n) {
    if (this.cache[n]) return this.cache[n]; const e = this.xref[n]; if (!e) return { v: { t: "k", v: "null" } };
    let o; if (e.o !== undefined) o = this.objetoEm(e.o);
    else { const st = this.stm[e.stm] || (this.stm[e.stm] = (() => { const so = this.obj(e.stm), txt = decodifica(so, this).toString("latin1"), N = so.v.m["/N"].num, first = so.v.m["/First"].num;
        const nums = txt.slice(0, first).trim().split(/\s+/).map(Number), offs = {}; for (let i = 0; i < N; i++) offs[nums[2 * i]] = first + nums[2 * i + 1]; return { sub: new Leitor(Buffer.from(txt, "latin1")), offs }; })());
      o = { v: st.sub.valor(st.offs[n])[0] }; }
    return (this.cache[n] = o);
  }
  res(v) { return v && v.t === "r" ? this.obj(v.n).v : v; }
  /** Lê todas as tabelas xref (da mais nova para a mais velha). Devolve o trailer mais novo. */
  lerXref() {
    const m = [...this.s.slice(-2048).matchAll(/startxref\s+(\d+)/g)].pop(); if (!m) throw new Error("PDF sem startxref");
    this.inicioXref = +m[1]; let trailer = null; const vistos = new Set(), fila = [+m[1]];
    while (fila.length) { const off = fila.shift(); if (vistos.has(off) || off <= 0 || off >= this.b.length) continue; vistos.add(off);
      let t; if (this.s.startsWith("xref", this.pula(off))) { let p = this.pula(off) + 4;
        for (;;) { p = this.pula(p); if (this.s.startsWith("trailer", p)) break; const h = /^(\d+)\s+(\d+)/.exec(this.s.slice(p, p + 30)); if (!h) throw new Error("PDF: xref ilegível"); p += h[0].length;
          const ini = +h[1], cont = +h[2], re = /\s*(\d{10})\s+(\d{5})\s+([nf])/y; re.lastIndex = p;
          for (let i = 0; i < cont; i++) { const e = re.exec(this.s); if (!e) throw new Error("PDF: linha da xref ilegível"); if (!(ini + i in this.xref)) this.xref[ini + i] = e[3] === "n" ? { o: +e[1], g: +e[2] } : { livre: true }; p = re.lastIndex; } }
        t = this.valor(p + 7)[0]; if (!trailer) { trailer = t; this.tipoXref = "classica"; }
        if (t.m["/XRefStm"]) fila.unshift(t.m["/XRefStm"].num);
      } else { const o = this.objetoEm(off); t = o.v; if (!trailer) { trailer = t; this.tipoXref = "fluxo"; }
        const W = t.m["/W"].v.map(x => x.num), dados = decodifica(o, this), idx = t.m["/Index"] ? t.m["/Index"].v.map(x => x.num) : [0, t.m["/Size"].num], tam = W[0] + W[1] + W[2];
        const campo = (p, w) => { let r = 0; for (let k = 0; k < w; k++) r = r * 256 + dados[p + k]; return r; };
        let p = 0; for (let s = 0; s < idx.length; s += 2) for (let i = 0; i < idx[s + 1]; i++, p += tam) { const num = idx[s] + i, tipo = W[0] ? campo(p, W[0]) : 1, f2 = campo(p + W[0], W[1]), f3 = campo(p + W[0] + W[1], W[2]);
          if (num in this.xref) continue; this.xref[num] = tipo === 1 ? { o: f2, g: f3 } : tipo === 2 ? { stm: f2, idx: f3, g: 0 } : { livre: true }; } }
      if (t.m["/Prev"]) fila.push(t.m["/Prev"].num); }
    return trailer;
  }
}
/** Abre o fluxo (só Flate, com o "predictor" PNG das tabelas xref). */
function decodifica(o, L) {
  let f = L.res(o.v.m["/Filter"]); const fs = !f ? [] : f.t === "a" ? f.v.map(x => x.v) : [f.v];
  let dp = L.res(o.v.m["/DecodeParms"]); if (dp && dp.t === "a") dp = L.res(dp.v[0]);
  let d = o.dados; for (const x of fs) { if (x !== "/FlateDecode") throw new Error("filtro " + x + " não suportado"); d = inflateSync(d); }
  const pred = dp && dp.t === "d" && dp.m["/Predictor"] ? dp.m["/Predictor"].num : 1;
  if (pred >= 10) { const col = dp.m["/Columns"] ? dp.m["/Columns"].num : 1, lin = col + 1, out = Buffer.alloc(Math.floor(d.length / lin) * col); let ant = Buffer.alloc(col);
    for (let r = 0; r * lin < d.length - col; r++) { const t = d[r * lin], cur = Buffer.from(d.subarray(r * lin + 1, r * lin + 1 + col));
      for (let i = 0; i < col; i++) { const a = i ? cur[i - 1] : 0, b = ant[i], c = i ? ant[i - 1] : 0;
        cur[i] = (cur[i] + (t === 1 ? a : t === 2 ? b : t === 3 ? (a + b) >> 1 : t === 4 ? ((pa, pb, pc) => pa <= pb && pa <= pc ? a : pb <= pc ? b : c)(Math.abs(b - c), Math.abs(a - c), Math.abs(a + b - 2 * c)) : 0)) & 0xFF; }
      cur.copy(out, r * col); ant = cur; }
    d = out; }
  return d;
}
const ser = v => v.t === "d" ? "<<" + Object.entries(v.m).map(([k, x]) => k + " " + ser(x)).join(" ") + ">>" : v.t === "a" ? "[" + v.v.map(ser).join(" ") + "]" : v.t === "r" ? `${v.n} ${v.g} R` : v.v;
const n2 = x => Math.round(x * 1000) / 1000;

// ======================================================================================================
// 3) PÔR O QR NA CÓPIA DO PDF (atualização incremental: o original fica inteiro, o QR vai no fim)
// ======================================================================================================
/** Devolve um Buffer novo com o QR em todas as páginas, ou null se o PDF não der para ler. */
export function pdfComQR(buf, { url, codigo, pos: lugar = null }) {
  try {
    const L = new Leitor(buf), tr = L.lerXref(); if (tr.m["/Encrypt"]) return null;
    const raiz = L.res(tr.m["/Root"]), paginas = [];
    const anda = (ref, her, prof) => { if (prof > 30) return; const no = L.obj(ref.n).v; if (!no || no.t !== "d") return;
      const h = { ...her }; ["/MediaBox", "/CropBox", "/Rotate", "/Resources"].forEach(k => { if (no.m[k]) h[k] = no.m[k]; });
      const tipo = no.m["/Type"] && no.m["/Type"].v; const kids = L.res(no.m["/Kids"]);
      if (tipo === "/Pages" || (kids && kids.t === "a" && tipo !== "/Page")) (kids ? kids.v : []).forEach(k => k.t === "r" && anda(k, h, prof + 1));
      else paginas.push({ ref, d: no, h }); };
    anda(raiz.m["/Pages"], {}, 0); if (!paginas.length) return null;
    // o QR: módulos em retângulos (corridas na mesma linha juntas) — o mesmo desenho serve a todas as páginas
    const M = qrMatriz(url), n = M.length, q = 2;
    let prox = tr.m["/Size"].num; const novos = [];
    const novo = (corpo, dados) => { const num = prox++; novos.push({ num, g: 0, corpo, dados }); return { t: "r", n: num, g: 0 }; };
    const fonte = novo("<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
    const formas = {}, abre = novo("<</Length 2>>", Buffer.from("q\n", "latin1"));
    for (const pg of paginas) {
      const caixa = L.res(pg.h["/CropBox"] || pg.h["/MediaBox"]); if (!caixa || caixa.t !== "a") continue;
      const [ax0, ay0, ax1, ay1] = caixa.v.map(x => L.res(x).num), x0 = Math.min(ax0, ax1), x1 = Math.max(ax0, ax1), y0 = Math.min(ay0, ay1), y1 = Math.max(ay0, ay1);
      const rot = (((pg.h["/Rotate"] ? L.res(pg.h["/Rotate"]).num : 0) % 360) + 360) % 360;
      const Wv = rot % 180 ? y1 - y0 : x1 - x0, Hv = rot % 180 ? x1 - x0 : y1 - y0, mm = 72 / 25.4;
      // tamanho: 3% do lado menor da folha, entre 18 e 25 mm (o celular lê de perto); encostado no canto, a 4 mm da borda,
      // para cobrir o mínimo do desenho (o fundo é branco)
      const S = Math.max(18 * mm, Math.min(25 * mm, Math.min(Wv, Hv) * 0.03)), fs = Math.max(3.5, S / 11), Hf = S + fs * 2.6, mg = QR_MARGEM * mm;
      const chave = `${n2(S)}`; if (!formas[chave]) {
        const mod = S / (n + 2 * q); let c = `1 1 1 rg 0 0 ${n2(S)} ${n2(Hf)} re f 0 0 0 rg\n`;
        M.forEach((lin, y) => { for (let x = 0; x < n;) { if (!lin[x]) { x++; continue; } let k = x; while (k < n && lin[k]) k++;
          c += `${n2((x + q) * mod)} ${n2(Hf - (y + q + 1) * mod)} ${n2((k - x) * mod)} ${n2(mod)} re\n`; x = k; } });
        const t1 = "CONFIRA A VALIDADE", t2 = String(codigo || "").replace(/[^\x20-\x7e]/g, "").slice(0, 40), larg = (t, f) => t.length * f * 0.56;
        const f2 = Math.min(fs, S / Math.max(1, t2.length * 0.56));
        c += `f\nBT /F1 ${n2(fs)} Tf ${n2(Math.max(0, (S - larg(t1, fs)) / 2))} ${n2(fs * 1.45)} Td (${t1}) Tj ET\n`;
        if (t2) c += `BT /F1 ${n2(f2)} Tf ${n2(Math.max(0, (S - larg(t2, f2)) / 2))} ${n2(fs * 0.35)} Td (${t2.replace(/[()\\]/g, "\\$&")}) Tj ET\n`;
        const z = deflateSync(Buffer.from(c, "latin1"));
        formas[chave] = { ref: novo(`<</Type/XObject/Subtype/Form/BBox[0 0 ${n2(S)} ${n2(Hf)}]/Resources<</Font<</F1 ${fonte.n} 0 R>>>>/Filter/FlateDecode/Length ${z.length}>>`, z), Hf, S };
      }
      const fm = formas[chave];
      // canto de cima, à direita, na folha como ela aparece (contando o giro da página)
      // onde: no ESPAÇO EM BRANCO achado na prancha (pos = canto de cima-esquerda do QR, em fração da folha) ou, sem isso, no canto
      const temPos = lugar && Number.isFinite(lugar.u) && Number.isFinite(lugar.v);
      const ua = temPos ? Math.max(0, Math.min(Wv - fm.S, lugar.u * Wv)) : Wv - mg - fm.S, vb = temPos ? Math.max(0, Math.min(Hv - fm.Hf, lugar.v * Hv)) + fm.Hf : mg + fm.Hf;
      const cm = rot === 0 ? [1, 0, 0, 1, x0 + ua, y1 - vb] : rot === 90 ? [0, 1, -1, 0, x0 + vb, y0 + ua] : rot === 180 ? [-1, 0, 0, -1, x1 - ua, y0 + vb] : [0, -1, 1, 0, x1 - vb, y1 - ua];
      const fecha = novo(null, Buffer.from(`Q\nq ${cm.map(n2).join(" ")} cm /QRval Do Q\n`, "latin1"));
      // a página nova: conteúdo antigo entre q…Q + o QR; recursos com o desenho do QR
      const d = { t: "d", m: { ...pg.d.m } }, cont = L.res(pg.d.m["/Contents"]);
      const antigos = !pg.d.m["/Contents"] ? [] : pg.d.m["/Contents"].t === "r" && cont && cont.t === "a" ? cont.v : pg.d.m["/Contents"].t === "a" ? pg.d.m["/Contents"].v : [pg.d.m["/Contents"]];
      d.m["/Contents"] = { t: "a", v: [abre, ...antigos, fecha] };
      const rs = L.res(pg.h["/Resources"]), r2 = { t: "d", m: { ...(rs && rs.t === "d" ? rs.m : {}) } }, xo = L.res(r2.m["/XObject"]);
      r2.m["/XObject"] = { t: "d", m: { ...(xo && xo.t === "d" ? xo.m : {}), "/QRval": fm.ref } }; d.m["/Resources"] = r2;
      const e = L.xref[pg.ref.n] || {}; novos.push({ num: pg.ref.n, g: e.g || 0, corpo: ser(d) });
    }
    if (!novos.some(x => x.num < tr.m["/Size"].num)) return null;
    // escreve os objetos e a tabela nova, apontando para a antiga
    const partes = [buf, Buffer.from(buf[buf.length - 1] === 10 ? "" : "\n", "latin1")]; let pos = buf.length + partes[1].length; const offs = [];
    const escreve = b => { partes.push(b); pos += b.length; };
    for (const o of novos) { offs.push({ num: o.num, g: o.g, off: pos });
      if (o.dados) escreve(Buffer.concat([Buffer.from(`${o.num} ${o.g} obj\n${o.corpo || `<</Length ${o.dados.length}>>`}\nstream\n`, "latin1"), o.dados, Buffer.from("\nendstream\nendobj\n", "latin1")]));
      else escreve(Buffer.from(`${o.num} ${o.g} obj\n${o.corpo}\nendobj\n`, "latin1")); }
    const extra = ["/Root", "/Info", "/ID"].filter(k => tr.m[k]).map(k => `${k} ${ser(tr.m[k])}`).join(" ");
    if (L.tipoXref === "classica") {
      offs.sort((a, b) => a.num - b.num); const xpos = pos; let t = "xref\n";
      for (let i = 0; i < offs.length;) { let k = i; while (k + 1 < offs.length && offs[k + 1].num === offs[k].num + 1) k++;
        t += `${offs[i].num} ${k - i + 1}\n`; for (let j = i; j <= k; j++) t += `${String(offs[j].off).padStart(10, "0")} ${String(offs[j].g).padStart(5, "0")} n\r\n`; i = k + 1; }
      t += `trailer\n<</Size ${prox} ${extra} /Prev ${L.inicioXref}>>\nstartxref\n${xpos}\n%%EOF\n`; escreve(Buffer.from(t, "latin1"));
    } else {
      const xnum = prox++, xpos = pos; offs.push({ num: xnum, g: 0, off: xpos }); offs.sort((a, b) => a.num - b.num);
      const linhas = Buffer.alloc(offs.length * 7); offs.forEach((o, i) => { linhas[i * 7] = 1; linhas.writeUInt32BE(o.off, i * 7 + 1); linhas.writeUInt16BE(o.g, i * 7 + 5); });
      escreve(Buffer.concat([Buffer.from(`${xnum} 0 obj\n<</Type/XRef/Size ${prox}/W[1 4 2]/Index[${offs.map(o => `${o.num} 1`).join(" ")}] ${extra} /Prev ${L.inicioXref}/Length ${linhas.length}>>\nstream\n`, "latin1"),
        linhas, Buffer.from(`\nendstream\nendobj\nstartxref\n${xpos}\n%%EOF\n`, "latin1")]));
    }
    return Buffer.concat(partes);
  } catch (e) { return null; }
}

export const QR_MARGEM = 4;   // mm até a borda da folha
// guarda as últimas cópias com QR (o mesmo arquivo pedido várias vezes não é refeito)
const memo = new Map();
/** O arquivo (caminho) com o QR, ou o original se não der. Devolve { buf, comQR }. */
export function arquivoComQR(caminho, url, codigo, pos = null) {
  const st = statSync(caminho), k = `${caminho}|${st.mtimeMs}|${url}|${codigo}|${pos ? pos.u + "," + pos.v : ""}`;
  if (memo.has(k)) return memo.get(k);
  const orig = readFileSync(caminho), feito = pdfComQR(orig, { url, codigo, pos }), r = { buf: feito || orig, comQR: !!feito };
  memo.set(k, r); if (memo.size > 12) memo.delete(memo.keys().next().value); return r;
}

// o endereço do painel, aprendido do próprio pedido (rotas.js chama lembrarSite) — o QR leva o endereço completo
let SITE = "";
export function lembrarSite(req) {
  const h = String((req && req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "").split(",")[0].trim();
  if (!/^[a-z0-9.:-]+$/i.test(h)) return; const prot = String(req.headers["x-forwarded-proto"] || (req.socket && req.socket.encrypted ? "https" : "http")).split(",")[0].trim();
  SITE = `${prot === "https" ? "https" : "http"}://${h}`;
}
export const urlQR = id => `${SITE}/documentos/qr/${id}`;
export const siteAtual = () => SITE;

// ======================================================================================================
// 4) A PÁGINA QUE O QR ABRE: válida ou desatualizada
// ======================================================================================================
/** A situação da prancha para quem está na obra. */
export function validade(d, id) {
  const B = BASE_DOCS, todos = d.arquivos || [], a = todos.find(x => x.id === id && x.origem !== "marcacao"); if (!a) return null;
  const vv = B.vivos(d), revs = vv.filter(b => b.origem !== "marcacao" && b.obra === a.obra && b.disciplina === a.disciplina && b.numero === a.numero);
  const lib = revs.filter(b => B.situacao(b, vv) === "liberado").sort((x, y) => y.rev - x.rev)[0] || null;
  const andamento = revs.filter(b => B.situacao(b, vv) === "revisao" && (!lib || b.rev > lib.rev)).sort((x, y) => y.rev - x.rev)[0] || null;
  let est; if (a.removido) est = "cancelada"; else { const s = B.situacao(a, vv); est = s === "liberado" ? "valida" : s === "obsoleto" ? "desatualizada" : "naoliberada"; }
  return { a, est, lib, andamento };
}
const CSS_QR = `<style>
.qr-box{max-width:560px;margin:18px auto;text-align:center;font-family:inherit}
.qr-sit{border-radius:18px;padding:26px 18px;color:#fff;box-shadow:0 6px 22px rgba(0,0,0,.18)}
.qr-sit .ic{font-size:64px;line-height:1}.qr-sit h1{margin:10px 0 4px;font-size:30px;letter-spacing:.5px;line-height:1.15;color:#fff}.qr-sit p{margin:6px 0 0;font-size:16px;line-height:1.4}
.qr-ok{background:#1f7a33}.qr-ruim{background:#b3261e}.qr-atn{background:#a86a00}
.qr-cod{display:inline-block;margin-top:14px;font:800 18px ui-monospace,Menlo,monospace;background:#111;color:#e9d49a;border-radius:10px;padding:8px 14px}
.qr-info{margin-top:14px;background:#fff;border:1px solid #e6e1d3;border-radius:14px;padding:12px 14px;text-align:left;font-size:14px;line-height:1.6}
.qr-alerta{margin-top:12px;background:#fff4d6;border:2px solid #e3b23c;color:#6b4a00;border-radius:14px;padding:12px 14px;font-size:15px;font-weight:700;line-height:1.45}
.qr-bt{display:inline-block;margin-top:14px;background:var(--preto,#111);color:var(--acento-claro,#e9d49a);border-radius:12px;padding:12px 18px;font-weight:800;text-decoration:none;font-size:15px}
</style>`;
export function paginaQR(user, id) {
  const B = BASE_DOCS, d = B.ler(), v = validade(d, id);
  if (v) { (d.qrLeituras = d.qrLeituras || []).push({ id, em: agoraLocalISO(), por: user ? B.quem(user) : "sem login", login: (user && user.usuario) || "", est: v.est }); if (d.qrLeituras.length > 5000) d.qrLeituras.splice(0, d.qrLeituras.length - 5000); B.gravar(d); }
  const o = v && OBRAS_DOCS.find(x => x.id === v.a.obra), pode = !!(v && user && B.podeObra(user, v.a.obra));
  const cx = !v ? `<div class="qr-sit qr-ruim"><div class="ic">❓</div><h1>PRANCHA NÃO ENCONTRADA</h1><p>Este QR code não é de uma prancha do painel. Não use sem conferir com a engenharia.</p></div>`
    : v.est === "valida" ? `<div class="qr-sit qr-ok"><div class="ic">✅</div><h1>PRANCHA VÁLIDA</h1><p>Esta é a revisão liberada para a obra. Pode usar.</p></div>`
    : v.est === "desatualizada" ? `<div class="qr-sit qr-ruim"><div class="ic">⛔</div><h1>PRANCHA DESATUALIZADA, POR FAVOR DESCARTE E ATUALIZE</h1><p>Saiu revisão nova desta prancha. Não use esta cópia.</p></div>`
    : v.est === "cancelada" ? `<div class="qr-sit qr-ruim"><div class="ic">⛔</div><h1>PRANCHA CANCELADA, POR FAVOR DESCARTE</h1><p>Esta prancha foi retirada do projeto. Não use esta cópia.</p></div>`
    : `<div class="qr-sit qr-ruim"><div class="ic">⛔</div><h1>PRANCHA NÃO LIBERADA PARA A OBRA</h1><p>Esta revisão ainda está em análise. Não use para executar.</p></div>`;
  const valeAgora = v && v.est !== "valida" && v.lib ? `<div class="qr-info">A revisão que vale hoje é <b>${B.esc(B.codigo(v.lib))}</b>, liberada em ${B.dh(v.lib.liberado && v.lib.liberado.em)}.${pode ? "" : " Peça a cópia nova à engenharia."}</div>
      ${pode ? `<a class="qr-bt" href="/documentos/arquivo/${v.lib.id}" target="_blank">📄 Abrir a revisão válida</a>` : ""}` : "";
  const andamento = v && v.est === "valida" && v.andamento ? `<div class="qr-alerta">⚠️ Prancha com revisão em andamento (${B.esc(B.codigo(v.andamento))}). Continue usando esta até a nova ser liberada — confira de novo antes de executar.</div>` : "";
  const info = v ? `<div class="qr-cod">${B.esc(B.codigo(v.a))}</div>
    <div class="qr-info"><b>${B.esc(o ? o.nome : v.a.obra)}</b> · ${B.esc(v.a.descricao || "")}<br>
      ${v.a.liberado ? `Liberada em ${B.dh(v.a.liberado.em)} por ${B.esc(v.a.liberado.por)}` : `Enviada em ${B.dh(v.a.em)}`} · conferido agora, ${B.dh(agoraLocalISO())}</div>` : "";
  const body = `${CSS_QR}<div class="qr-box">${cx}${andamento}${info}${valeAgora}
    ${pode ? `<div><a class="qr-bt" style="background:#fff;color:#333;border:1px solid #ddd8c8" href="/documentos/${v.a.obra}">Projetos da obra</a></div>` : ""}</div>`;
  return shell({ title: v ? `${v.est === "valida" ? "✅ Válida" : "⛔ Não use"} · ${B.codigo(v.a)}` : "Prancha não encontrada", body, user });
}

// ======================================================================================================
// 5) ONDE O QR ENTRA: num ESPAÇO EM BRANCO da prancha (06/11 — no canto ele cobria desenho)
// ======================================================================================================
// O navegador desenha a 1ª página (pdf.js), marca o que tem tinta e procura um quadrado do tamanho do QR sem nada, o mais
// perto possível de um canto (de preferência o de cima, à direita). Roda sozinho na página da obra para as pranchas que
// ainda não têm lugar escolhido; quem quiser, ajusta na mão em "📍 QR". O lugar fica gravado na prancha (a.qrPos).
const ACHA_QR = `
window.achaLugarQR=async function(url){
  if(window.pdfjsLib&&!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc='/assets/pdfjs-3.11.174.worker.min.js';
  var pdf=await pdfjsLib.getDocument(url).promise, pg=await pdf.getPage(1), v1=pg.getViewport({scale:1}), W1=v1.width, H1=v1.height, mm=72/25.4;
  var S=Math.max(18*mm,Math.min(25*mm,Math.min(W1,H1)*0.03)), fs=Math.max(3.5,S/11), Hf=S+fs*2.6, sc=1400/Math.max(W1,H1), vp=pg.getViewport({scale:sc});
  var c=document.createElement('canvas'); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height); var g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,c.width,c.height);
  await pg.render({canvasContext:g,viewport:vp}).promise;
  var W=c.width, H=c.height, px=g.getImageData(0,0,W,H).data, II=new Int32Array((W+1)*(H+1));
  for(var y=0;y<H;y++){ var lin=0; for(var x=0;x<W;x++){ var i=(y*W+x)*4; lin+=(px[i]+px[i+1]+px[i+2]<744)?1:0; II[(y+1)*(W+1)+x+1]=II[y*(W+1)+x+1]+lin; } }
  var soma=function(x0,y0,x1,y1){ return II[y1*(W+1)+x1]-II[y0*(W+1)+x1]-II[y1*(W+1)+x0]+II[y0*(W+1)+x0]; };
  var pad=Math.ceil(2*mm*sc), bw=Math.ceil(S*sc)+2*pad, bh=Math.ceil(Hf*sc)+2*pad, m=Math.ceil(3*mm*sc), passo=Math.max(2,Math.round(bw/14)), melhor=null;
  // preferência: canto de cima à direita, depois cima-esquerda, baixo-esquerda e baixo-direita (onde costuma ficar o carimbo)
  var cantos=[[W,0,1],[0,0,1.15],[0,H,1.3],[W,H,1.6]];
  for(var yy=m;yy+bh<=H-m;yy+=passo) for(var xx=m;xx+bw<=W-m;xx+=passo){ var t=soma(xx,yy,xx+bw,yy+bh), cx=xx+bw/2, cy=yy+bh/2, d=1e9;
    cantos.forEach(function(k){ d=Math.min(d,Math.hypot(cx-k[0],cy-k[1])*k[2]); }); var nota=t*1e7+d; if(!melhor||nota<melhor.nota) melhor={nota:nota,x:xx,y:yy,t:t}; }
  if(!melhor) return null;
  return {u:(melhor.x+pad)/W, v:(melhor.y+pad)/H, tinta:melhor.t};
};`;

/** Na página da obra (engenharia): acha sozinho o lugar do QR das pranchas que ainda não têm, uma de cada vez. */
export function scriptAutoQR(lista) {
  if (!lista.length) return "";
  return `<div id="qrAuto" style="position:fixed;right:14px;bottom:14px;z-index:50;background:#1a1a1d;color:#e9d49a;border-radius:10px;padding:7px 12px;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,.3)">📍 posicionando o QR das pranchas…</div>
    <script src="/assets/pdfjs-3.11.174.min.js"></script><script>${ACHA_QR}
    (async function(){ var L=${JSON.stringify(lista).replace(/</g, "\\u003c")}, box=document.getElementById('qrAuto'), feitos=0;
      for(var i=0;i<L.length;i++){ box.textContent='📍 achando espaço em branco para o QR: '+(i+1)+' de '+L.length+'…';
        try{ var r=await window.achaLugarQR('/documentos/arquivo/'+L[i]+'?original=1'); if(r) { await fetch('/documentos/qrpos',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:L[i],u:r.u,v:r.v,auto:'1',tinta:r.tinta})}); feitos++; } }catch(e){} }
      box.textContent='📍 QR posicionado em '+feitos+' prancha'+(feitos===1?'':'s')+'.'; setTimeout(function(){ box.remove(); },3000); })();</script>`;
}

/** Grava o lugar do QR (automático ou na mão). O automático não passa por cima de um ajuste feito na mão. */
export function salvarPosicaoQR(user, campos) {
  const B = BASE_DOCS, d = B.ler(), a = B.vivos(d).find(x => x.id === campos.id && x.origem !== "marcacao");
  if (!a || !B.podeObra(user, a.obra) || !B.acessoTotal(user)) return { erro: "Prancha não encontrada." };
  const u = Number(campos.u), v = Number(campos.v), auto = campos.auto === "1";
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return { erro: "Posição inválida." };
  if (auto && a.qrPos && !a.qrPos.auto) return { ok: "Mantida a posição ajustada na mão." };
  if (a.qrPos) (a.qrPosAnteriores = a.qrPosAnteriores || []).push(a.qrPos);
  a.qrPos = { u: Math.round(u * 10000) / 10000, v: Math.round(v * 10000) / 10000, auto, ...(auto && Number.isFinite(+campos.tinta) ? { tinta: +campos.tinta } : {}), por: B.quem(user), login: user.usuario, em: agoraLocalISO() };
  if (!auto) B.registrar(d, user, a.obra, `ajustou na mão o lugar do QR de ${B.codigo(a)}`);
  B.gravar(d); return { ok: "Lugar do QR gravado.", obra: a.obra };
}

/** A tela de ajustar o QR na mão: a prancha inteira, o quadro do QR por cima; arrasta, ou pede para achar o espaço em branco. */
export function paginaPosicaoQR(user, id) {
  const B = BASE_DOCS, d = B.ler(), a = B.vivos(d).find(x => x.id === id && x.origem !== "marcacao" && x.ext === ".pdf");
  if (!a || !B.podeObra(user, a.obra) || !B.acessoTotal(user)) return null;
  const p = a.qrPos, esc = B.esc;
  const body = `<style>.qp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}.qp-palco{position:relative;display:inline-block;box-shadow:0 2px 14px rgba(0,0,0,.25);background:#fff;max-width:100%}
    .qp-palco canvas{display:block;max-width:100%;max-height:calc(100vh - 210px);width:auto;height:auto}.qp-qr{position:absolute;border:3px solid #e0a800;background:rgba(255,214,64,.35);cursor:move;box-sizing:border-box;touch-action:none;display:flex;align-items:center;justify-content:center;font:800 11px sans-serif;color:#5a4300}
    .qp-st{font-size:12.5px;color:var(--mut)}</style>
    <a class="pg-volta" href="/documentos/${a.obra}"><span class="seta">←</span> Projetos da obra</a>
    <h1 style="margin:8px 0 0">📍 Lugar do QR · <span class="dc-cod">${esc(B.codigo(a))}</span></h1>
    <div class="qp-bar"><button type="button" class="dc-bt" id="qpAcha">🔍 Achar espaço em branco</button><button type="button" class="dc-bt" id="qpGrava" style="background:#1f7a33;border-color:#1f7a33;color:#fff">✓ Gravar este lugar</button>
      <a class="dc-bt claro" href="/documentos/arquivo/${a.id}" target="_blank">📄 Ver o PDF com o QR</a>
      <span class="qp-st" id="qpSt">${p ? (p.auto ? `Escolhido sozinho (espaço em branco) em ${B.dh(p.em)}.` : `Ajustado na mão por ${esc(p.por)} em ${B.dh(p.em)}.`) : "Ainda sem lugar escolhido: hoje sai no canto de cima, à direita."}</span></div>
    <div class="qp-st" style="margin-bottom:8px">Arraste o quadro amarelo para um lugar <b>sem desenho</b> e grave. O QR sai exatamente ali, em todas as cópias (abrir, baixar e plotagem).</div>
    <div class="qp-palco" id="qpPalco"><canvas id="qpCv"></canvas><div class="qp-qr" id="qpQR">QR</div></div>
    <script src="/assets/pdfjs-3.11.174.min.js"></script><script>${ACHA_QR}
    (async function(){ var $=function(i){return document.getElementById(i);}, cv=$('qpCv'), qr=$('qpQR'), st=$('qpSt'), pos=${JSON.stringify(p ? { u: p.u, v: p.v } : null)}, dim=null;
      pdfjsLib.GlobalWorkerOptions.workerSrc='/assets/pdfjs-3.11.174.worker.min.js';
      var pdf=await pdfjsLib.getDocument('/documentos/arquivo/${a.id}?original=1').promise, pg=await pdf.getPage(1), v1=pg.getViewport({scale:1}), mm=72/25.4;
      var S=Math.max(18*mm,Math.min(25*mm,Math.min(v1.width,v1.height)*0.03)), Hf=S+Math.max(3.5,S/11)*2.6; dim={S:S/v1.width,Hf:Hf/v1.height};
      var vp=pg.getViewport({scale:Math.min(2,1600/v1.width)}); cv.width=vp.width; cv.height=vp.height; await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      if(!pos) pos={u:1-dim.S-4*mm/v1.width, v:4*mm/v1.height};
      var poe=function(){ qr.style.left=(pos.u*100)+'%'; qr.style.top=(pos.v*100)+'%'; qr.style.width=(dim.S*100)+'%'; qr.style.height=(dim.Hf*100)+'%'; }; poe();
      var arr=null; qr.addEventListener('pointerdown',function(e){ qr.setPointerCapture(e.pointerId); arr={x:e.clientX,y:e.clientY,u:pos.u,v:pos.v}; });
      qr.addEventListener('pointermove',function(e){ if(!arr) return; var r=cv.getBoundingClientRect(); pos.u=Math.max(0,Math.min(1-dim.S,arr.u+(e.clientX-arr.x)/r.width)); pos.v=Math.max(0,Math.min(1-dim.Hf,arr.v+(e.clientY-arr.y)/r.height)); poe(); });
      qr.addEventListener('pointerup',function(){ arr=null; st.textContent='Lugar mudado — clique em "Gravar este lugar".'; });
      $('qpAcha').onclick=async function(){ st.textContent='procurando…'; var r=await window.achaLugarQR('/documentos/arquivo/${a.id}?original=1'); if(!r){ st.textContent='Não achei.'; return; }
        pos={u:r.u,v:r.v}; poe(); st.textContent=r.tinta?'Não há espaço totalmente em branco do tamanho do QR: escolhi o que tem menos desenho. Confira e ajuste.':'Achei um espaço em branco. Confira e grave.'; };
      $('qpGrava').onclick=async function(){ var j=await (await fetch('/documentos/qrpos',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({id:'${a.id}',u:pos.u,v:pos.v})})).json(); st.textContent=j.erro||j.ok; };
    })();</script>`;
  return shell({ title: `Lugar do QR · ${B.codigo(a)}`, body, user });
}
