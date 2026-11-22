// medicao-pdf.js — o PDF do BOLETIM DE MEDIÇÃO com a MESMA estrutura da tela.
//
// O desenhista padrão (enviarRelatorio, da ponte) faz um bloco por item — um boletim de 60 itens virava muitas páginas e
// não parecia o boletim da tela. Aqui a pasta desenha o PDF ela mesma, sem programa nenhum (só node:zlib): cabeçalho
// a empresa do boletim com a linha de destaque, quadro de dados, TABELA compacta (cabeçalho preto, as mesmas colunas), extras, observações,
// resumo e o campo de assinaturas (carimbo digital + a imagem da assinatura do empreiteiro). Muitas linhas: a tabela
// continua na página seguinte com o cabeçalho repetido; rodapé com a página e o código de conferência.
// Fontes: Helvetica e Helvetica-Bold (as que todo leitor de PDF tem), texto em WinAnsi (acentos do português).
import { deflateSync, inflateSync } from "node:zlib";

// ---------------------------------------------------------------- larguras das letras (milésimos do tamanho da fonte)
const LARG = {
  n: { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
    u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, "{": 334, "|": 260, "}": 334, "~": 584, "º": 365, "ª": 370, "°": 400, "·": 278, "–": 556, "—": 1000, "•": 350, "…": 1000, "“": 333, "”": 333, "‘": 222, "’": 222, "×": 584, "²": 333 },
  b: { " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
    A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333, a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
    u: 611, v: 556, w: 778, x: 556, y: 556, z: 500, "{": 389, "|": 280, "}": 389, "~": 584, "º": 365, "ª": 370, "°": 400, "·": 278, "–": 556, "—": 1000, "•": 350, "…": 1000, "“": 500, "”": 500, "‘": 278, "’": 278, "×": 584, "²": 333 },
};
const BASE = c => c.normalize("NFD").replace(/[̀-ͯ]/g, "");      // á → a (a largura do acentuado é a da letra)
const DIG = "0123456789";
function larguraLetra(c, f) { const t = LARG[f]; if (t[c] != null) return t[c]; if (DIG.includes(c)) return 556; const b = BASE(c); return t[b] != null ? t[b] : 556; }
export const largura = (s, tam, negrito = false) => [...String(s)].reduce((a, c) => a + larguraLetra(c, negrito ? "b" : "n"), 0) * tam / 1000;

// ---------------------------------------------------------------- texto em WinAnsi (o que a Helvetica do PDF entende)
const WIN = { "€": 128, "‚": 130, "ƒ": 131, "„": 132, "…": 133, "†": 134, "‡": 135, "ˆ": 136, "‰": 137, "Š": 138, "‹": 139, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "˜": 152, "™": 153, "š": 154, "›": 155, "œ": 156, "ž": 158, "Ÿ": 159 };
function emPDF(s) {
  let o = "";
  for (const c of String(s)) {
    let k = c.codePointAt(0);
    if (k >= 128) k = WIN[c] ?? (k >= 160 && k <= 255 ? k : 63);           // fora da tabela vira "?"
    if (k === 40 || k === 41 || k === 92) o += "\\" + String.fromCharCode(k);
    else if (k < 32 || k > 126) o += "\\" + k.toString(8).padStart(3, "0");
    else o += String.fromCharCode(k);
  }
  return o;
}
const cor = hex => { const h = hex.replace("#", ""); return [0, 2, 4].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(" "); };

// ---------------------------------------------------------------- PNG → RGB + transparência (para a assinatura)
function lerPNG(buf) {
  if (!buf || buf.length < 33 || buf.toString("latin1", 1, 4) !== "PNG") return null;
  let p = 8, w = 0, h = 0, prof = 0, tipo = 0, entre = 0; const idat = [];
  while (p < buf.length) {
    const tam = buf.readUInt32BE(p), nome = buf.toString("latin1", p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + tam);
    if (nome === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; entre = d[12]; }
    else if (nome === "IDAT") idat.push(d); else if (nome === "IEND") break;
    p += 12 + tam;
  }
  if (prof !== 8 || entre !== 0 || ![2, 6].includes(tipo) || !w || !h) return null;   // a assinatura do navegador é RGBA de 8 bits
  const bpp = tipo === 6 ? 4 : 3, linha = w * bpp, cru = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(linha * h);
  for (let y = 0; y < h; y++) {
    const f = cru[y * (linha + 1)], o = y * (linha + 1) + 1;
    for (let x = 0; x < linha; x++) {
      const v = cru[o + x], a = x >= bpp ? px[y * linha + x - bpp] : 0, b = y ? px[(y - 1) * linha + x] : 0, c = x >= bpp && y ? px[(y - 1) * linha + x - bpp] : 0;
      let r = v;
      if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[y * linha + x] = r & 255;
    }
  }
  const rgb = Buffer.alloc(w * h * 3), alfa = tipo === 6 ? Buffer.alloc(w * h) : null;
  for (let i = 0; i < w * h; i++) { rgb[i * 3] = px[i * bpp]; rgb[i * 3 + 1] = px[i * bpp + 1]; rgb[i * 3 + 2] = px[i * bpp + 2]; if (alfa) alfa[i] = px[i * bpp + 3]; }
  return { w, h, rgb, alfa };
}

// ---------------------------------------------------------------- o documento (A4 em pé; y contado de cima, como na tela)
export class DocPDF {
  constructor() { this.L = 595.28; this.A = 841.89; this.paginas = []; this.imagens = []; this.nova(); }
  nova() { this.pg = []; this.paginas.push(this.pg); return this; }
  ret(x, y, w, h, { fundo = null, borda = null, esp = 0.5 } = {}) {
    const Y = this.A - y - h;
    if (fundo) this.pg.push(`${cor(fundo)} rg ${x.toFixed(2)} ${Y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    if (borda) this.pg.push(`${esp} w ${cor(borda)} RG ${x.toFixed(2)} ${Y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  }
  linha(x1, y1, x2, y2, { c = "#333333", esp = 0.6 } = {}) { this.pg.push(`${esp} w ${cor(c)} RG ${x1.toFixed(2)} ${(this.A - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.A - y2).toFixed(2)} l S`); }
  /** Texto com a LINHA DE BASE em y. alinhar: e (esquerda) · d (direita, x = borda direita) · c (centro, x = meio). */
  /** MARCA D'ÁGUA (13/11): texto grande, claro, na diagonal, no meio de TODAS as páginas — desenhado por baixo do conteúdo. */
  marcaDagua(linhas, { tam = 50, c = "#ece4cc", entre = 1.25 } = {}) {
    const k = Math.SQRT1_2, cx = this.L / 2, cy = this.A / 2, ops = [];
    linhas.forEach((s, i) => { const t = tam * (i ? 0.62 : 1), w = largura(s, t, true), d = (i - (linhas.length - 1) / 2) * tam * entre;   // d: deslocamento perpendicular
      const x0 = cx - (w / 2) * k + d * k, y0 = cy - (w / 2) * k - d * k;
      ops.push(`BT /F2 ${t} Tf ${cor(c)} rg ${k.toFixed(4)} ${k.toFixed(4)} ${(-k).toFixed(4)} ${k.toFixed(4)} ${x0.toFixed(2)} ${y0.toFixed(2)} Tm (${emPDF(s)}) Tj ET`); });
    for (const p of this.paginas) p.unshift(...ops);
  }
  texto(x, y, s, { tam = 8, negrito = false, c = "#17171b", alinhar = "e", maxW = 0 } = {}) {
    s = String(s ?? ""); if (maxW) s = this.corta(s, maxW, tam, negrito);
    const w = largura(s, tam, negrito), X = alinhar === "d" ? x - w : alinhar === "c" ? x - w / 2 : x;
    this.pg.push(`BT /${negrito ? "F2" : "F1"} ${tam} Tf ${cor(c)} rg ${X.toFixed(2)} ${(this.A - y).toFixed(2)} Td (${emPDF(s)}) Tj ET`);
  }
  corta(s, maxW, tam, negrito) { if (largura(s, tam, negrito) <= maxW) return s; let t = s; while (t.length > 1 && largura(t + "…", tam, negrito) > maxW) t = t.slice(0, -1); return t.trimEnd() + "…"; }
  /** Quebra o texto em linhas que cabem em maxW (até maxLinhas; a última leva "…" se sobrar). */
  quebra(s, maxW, tam, negrito = false, maxLinhas = 99) {
    const linhas = [];
    for (const par of String(s ?? "").split("\n")) {
      let atual = "";
      for (const pal of par.split(/\s+/).filter(Boolean)) {
        const t = atual ? atual + " " + pal : pal;
        if (largura(t, tam, negrito) <= maxW) atual = t;
        else { if (atual) linhas.push(atual); atual = largura(pal, tam, negrito) > maxW ? this.corta(pal, maxW, tam, negrito) : pal; }
      }
      linhas.push(atual);
    }
    if (linhas.length > maxLinhas) { const r = linhas.slice(0, maxLinhas); r[maxLinhas - 1] = this.corta(r[maxLinhas - 1] + " …", maxW, tam, negrito); return r; }
    return linhas;
  }
  /** Imagem PNG (a assinatura) dentro da caixa w×h, mantendo a proporção. */
  imagem(png, x, y, w, h) {
    const im = lerPNG(png); if (!im) return false;
    const k = Math.min(w / im.w, h / im.h), W = im.w * k, H = im.h * k, n = this.imagens.push(im);
    this.pg.push(`q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} ${(x + (w - W) / 2).toFixed(2)} ${(this.A - y - (h + H) / 2).toFixed(2)} cm /Im${n} Do Q`);
    return true;
  }
  /** Monta o arquivo. */
  pdf() {
    const obj = [], add = s => { obj.push(s); return obj.length; };
    const fontes = [add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")];
    const ims = this.imagens.map(im => {
      const sm = im.alfa ? add({ dic: `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, dados: deflateSync(im.alfa) }) : 0;
      return add({ dic: `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${sm ? ` /SMask ${sm} 0 R` : ""}`, dados: deflateSync(im.rgb) });
    });
    const recursos = `<< /Font << /F1 ${fontes[0]} 0 R /F2 ${fontes[1]} 0 R >> /XObject << ${ims.map((n, i) => `/Im${i + 1} ${n} 0 R`).join(" ")} >> >>`;
    const idPaginas = obj.length + 1 + this.paginas.length * 2;           // o objeto "Pages" vem depois das páginas
    const pags = this.paginas.map(pg => { const c = add({ dic: "/Filter /FlateDecode", dados: deflateSync(Buffer.from(pg.join("\n"), "latin1")) });
      return add(`<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${this.L} ${this.A}] /Resources ${recursos} /Contents ${c} 0 R >>`); });
    add(`<< /Type /Pages /Kids [${pags.map(n => n + " 0 R").join(" ")}] /Count ${pags.length} >>`);
    const cat = add(`<< /Type /Catalog /Pages ${idPaginas} 0 R >>`);
    const partes = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")], ofs = [];
    let tam = partes[0].length;
    obj.forEach((o, i) => {
      const cab = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
      const corpo = typeof o === "string" ? Buffer.from(o + "\n", "latin1")
        : Buffer.concat([Buffer.from(`<< ${o.dic} /Length ${o.dados.length} >>\nstream\n`, "latin1"), o.dados, Buffer.from("\nendstream\n", "latin1")]);
      const fim = Buffer.from("endobj\n", "latin1");
      ofs.push(tam); partes.push(cab, corpo, fim); tam += cab.length + corpo.length + fim.length;
    });
    const xref = [`xref\n0 ${obj.length + 1}\n0000000000 65535 f \n`, ...ofs.map(o => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    partes.push(Buffer.from(`${xref}trailer\n<< /Size ${obj.length + 1} /Root ${cat} 0 R >>\nstartxref\n${tam}\n%%EOF\n`, "latin1"));
    return Buffer.concat(partes);
  }
}
