// upload.js — leitura de formulário com anexo (multipart/form-data), sem dependências.
// O servidor só sabia ler formulário simples; isto acrescenta o anexo de PDF.
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";

export const LIMITE_BYTES = 25 * 1024 * 1024;       // 25 MB no envio de uma linha
export const LIMITE_LOTE = 120 * 1024 * 1024;      // 120 MB quando vêm vários de uma vez
export const LIMITE_IFC = 400 * 1024 * 1024;       // 400 MB no envio de modelo 3D (IFC)
// Tipos aceitos. A extensão sozinha não vale nada (é texto de fora) — cada um tem que
// provar o que é pela ASSINATURA dos primeiros bytes. Ampliado em 14/09 para a arquitetura
// poder mandar planta em DWG/DXF e foto de prancha.
const TIPOS_OK = {
  ".pdf":  { mime: "application/pdf",       abre: "inline" },
  ".dwg":  { mime: "image/vnd.dwg",         abre: "attachment" },
  ".dxf":  { mime: "image/vnd.dxf",         abre: "attachment" },
  ".jpg":  { mime: "image/jpeg",            abre: "inline" },
  ".jpeg": { mime: "image/jpeg",            abre: "inline" },
  ".png":  { mime: "image/png",             abre: "inline" },
  ".webp": { mime: "image/webp",            abre: "inline" },
  ".ifc":  { mime: "application/x-step",    abre: "attachment" },
  ".ifczip": { mime: "application/zip",     abre: "attachment" },
};

const comeca = (buf, txt) => buf.slice(0, txt.length).toString("latin1") === txt;
const bytes = (buf, ...b) => b.every((v, i) => buf[i] === v);

/** Confere se o conteúdo é mesmo do tipo que a extensão diz. */
function pareceMesmo(ext, buf) {
  switch (ext) {
    case ".pdf":  return comeca(buf, "%PDF-");
    case ".jpg":
    case ".jpeg": return bytes(buf, 0xFF, 0xD8, 0xFF);
    case ".png":  return bytes(buf, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
    case ".webp": return comeca(buf, "RIFF") && buf.slice(8, 12).toString("latin1") === "WEBP";
    // DWG carimba a versão do AutoCAD no começo: AC1015, AC1018, AC1021, AC1024, AC1027, AC1032…
    case ".dwg":  return /^AC10[0-9]{2}$/.test(buf.slice(0, 6).toString("latin1"));
    // DXF tem duas caras: o texto (que abre com um grupo 0 SECTION) e o binário, que se anuncia.
    case ".dxf":  return comeca(buf, "AutoCAD Binary DXF")
                      || /^\s*0\s*[\r\n]+\s*SECTION/.test(buf.slice(0, 200).toString("latin1"));
    case ".ifc":  return comeca(buf, "ISO-10303-21;");
    case ".ifczip": return bytes(buf, 0x50, 0x4B, 0x03, 0x04);
    default:      return false;
  }
}

/** O tipo e o modo de abrir, a partir do nome que este sistema gerou. */
export function tipoDoArquivo(nome) {
  const ext = String(nome || "").slice(String(nome).lastIndexOf(".")).toLowerCase();
  return TIPOS_OK[ext] || { mime: "application/octet-stream", abre: "attachment" };
}

export const EXTENSOES_OK = Object.keys(TIPOS_OK);
export const ACCEPT = EXTENSOES_OK.join(",");

const mb = b => (b / 1048576).toFixed(1).replace(".", ",") + " MB";

// Lê o corpo bruto da requisição respeitando o limite.
// Passou do limite: NÃO derruba a conexão (isso fazia o navegador mostrar "erro ao enviar" em vez da
// nossa explicação, e o usuário ficava sem saber o que houve). Larga o que já veio, continua ouvindo
// até o envio terminar e aí devolve uma mensagem clara, com o tamanho que veio e o limite.
// Só desliga na marra em envio absurdo (4× o limite), para não ficar recebendo à toa.
function corpoBruto(req, limite = LIMITE_BYTES) {
  return new Promise((resolve, reject) => {
    let partes = []; let total = 0; let passou = false;
    const recusa = () => reject(new Error(
      `o envio inteiro tem ${mb(total)} e o limite é ${mb(limite)} de cada vez — mande em levas menores`));
    req.on("data", c => {
      total += c.length;
      if (passou) { if (total > limite * 4) { req.destroy(); recusa(); } return; }
      if (total > limite) { passou = true; partes = []; return; }   // solta a memória já usada
      partes.push(c);
    });
    req.on("end", () => passou ? recusa() : resolve(Buffer.concat(partes)));
    req.on("error", reject);
  });
}

// Separa o corpo nas partes delimitadas pela fronteira do multipart.
function fatiar(buf, boundary) {
  const marca = Buffer.from("--" + boundary);
  const pedacos = []; let i = buf.indexOf(marca);
  while (i !== -1) {
    const ini = i + marca.length;
    const prox = buf.indexOf(marca, ini);
    if (prox === -1) break;
    pedacos.push(buf.slice(ini, prox));
    i = prox;
  }
  return pedacos;
}

function cabecalhoValor(cab, chave) {
  const m = cab.match(new RegExp(chave + '="([^"]*)"', "i"));
  return m ? m[1] : "";
}

/**
 * Lê um formulário com anexo.
 * Devolve { campos, arquivos } — arquivos = [{ campo, nomeOriginal, buffer, ext }].
 * Não grava nada em disco; quem grava é salvarArquivo().
 */
export async function lerFormulario(req, limite = LIMITE_BYTES) {
  const ct = req.headers["content-type"] || "";
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!/multipart\/form-data/i.test(ct) || !m) throw new Error("formulário sem anexo");
  const boundary = (m[1] || m[2]).trim();

  const buf = await corpoBruto(req, limite);
  const campos = {}, arquivos = [];

  for (const p of fatiar(buf, boundary)) {
    const corte = p.indexOf("\r\n\r\n");
    if (corte === -1) continue;
    const cab = p.slice(0, corte).toString("utf8");
    let corpo = p.slice(corte + 4);
    if (corpo.slice(-2).toString() === "\r\n") corpo = corpo.slice(0, -2);   // tira o CRLF final

    const nome = cabecalhoValor(cab, "name");
    if (!nome) continue;
    const arquivo = cabecalhoValor(cab, "filename");

    if (arquivo) {
      if (!corpo.length) continue;                                  // campo de anexo deixado vazio
      arquivos.push({ campo: nome, nomeOriginal: arquivo, buffer: corpo, ext: extname(arquivo).toLowerCase() });
    } else {
      campos[nome] = corpo.toString("utf8");
    }
  }
  return { campos, arquivos };
}

/**
 * Grava um anexo com nome sorteado (nunca o nome enviado, que é texto de fora).
 * Devolve o nome do arquivo gravado, para guardar na linha do registro.
 */
export function salvarArquivo(arq, destino) {
  const ext = arq.ext;
  if (!TIPOS_OK[ext]) {
    throw new Error(`tipo não aceito (${ext || "sem extensão"}). Vale ${EXTENSOES_OK.join(", ")}`);
  }
  if (!pareceMesmo(ext, arq.buffer)) {
    throw new Error(`o arquivo não parece ser ${ext} de verdade — confira se não trocou a extensão`);
  }
  if (!existsSync(destino)) mkdirSync(destino, { recursive: true });
  const nome = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  writeFileSync(join(destino, nome), arq.buffer);
  return nome;
}

// Só deixa passar nome de arquivo que este sistema mesmo gerou.
const EXT_RE = EXTENSOES_OK.map(e => e.slice(1)).join("|");
export const nomeSeguro = n => new RegExp(`^[0-9]{10,}-[0-9a-f]{12}\\.(${EXT_RE})$`).test(String(n || ""));
