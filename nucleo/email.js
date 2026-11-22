// email.js — envio de e-mail por SMTP, sem pacote nenhum (node:net / node:tls).
// Configuração no config.json → "email" (host, porta, seguro, usuario, remetente). A SENHA fica fora do arquivo:
// na variável de ambiente SMTP_SENHA. Porta 465 = TLS direto (seguro: true); 587 = STARTTLS (seguro: false).
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";
import { CONFIG } from "./config.js";

const C = CONFIG.email;
export const emailConfigurado = () => !!(C.host && C.usuario && C.remetente && process.env.SMTP_SENHA);

const b64 = s => Buffer.from(String(s), "utf8").toString("base64");
const cabecalho = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const quebra76 = s => s.replace(/.{1,76}/g, "$&\r\n");

function montar({ para, assunto, texto, anexo }) {
  const fronteira = "----=_" + randomBytes(12).toString("hex");
  const cab = [
    `From: ${cabecalho(CONFIG.marca.nome)} <${C.remetente}>`, `To: <${para}>`, `Subject: ${cabecalho(assunto || "")}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomBytes(10).toString("hex")}@${C.remetente.split("@")[1] || "local"}>`, "MIME-Version: 1.0",
  ];
  const corpoTexto = [`Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: base64`, ``, quebra76(b64(texto || ""))].join("\r\n");
  if (!anexo || !anexo.conteudo) return [...cab, corpoTexto].join("\r\n");
  return [...cab, `Content-Type: multipart/mixed; boundary="${fronteira}"`, ``,
    `--${fronteira}`, corpoTexto,
    `--${fronteira}`, `Content-Type: ${anexo.tipo || "application/octet-stream"}; name="${cabecalho(anexo.nomeArquivo)}"`,
    `Content-Transfer-Encoding: base64`, `Content-Disposition: attachment; filename="${cabecalho(anexo.nomeArquivo)}"`, ``,
    quebra76(Buffer.from(anexo.conteudo).toString("base64")), `--${fronteira}--`, ``].join("\r\n");
}

/** Conversa SMTP: manda um comando e espera a resposta com o código certo. */
function conversa(sock) {
  let buf = "", espera = null;
  const tenta = () => {
    if (!espera) return;
    const linhas = buf.split("\r\n"); const fim = linhas.findIndex(l => /^\d{3} /.test(l));
    if (fim < 0) return;
    const resp = linhas.slice(0, fim + 1).join("\n"); buf = linhas.slice(fim + 1).join("\r\n");
    const { ok, falha, codigos } = espera; espera = null;
    codigos.includes(Number(resp.slice(0, 3))) ? ok(resp) : falha(new Error("SMTP: " + resp.split("\n").pop()));
  };
  const ouvir = s => { s.on("data", d => { buf += d.toString("utf8"); tenta(); }); };
  ouvir(sock);
  return {
    ouvir,
    cmd: (linha, codigos) => new Promise((ok, falha) => { espera = { ok, falha, codigos }; if (linha != null) sock.write(linha + "\r\n"); tenta(); }),
  };
}

export async function enviarEmail({ para, assunto, texto, anexo }) {
  if (!emailConfigurado()) throw new Error("e-mail não configurado (config.json → email, e a variável SMTP_SENHA)");
  const porta = Number(C.porta) || 465;
  let sock = C.seguro ? tls.connect({ host: C.host, port: porta, servername: C.host }) : net.connect({ host: C.host, port: porta });
  sock.setTimeout(30000, () => sock.destroy(new Error("SMTP: tempo esgotado")));
  const erroConexao = new Promise((_, falha) => sock.once("error", falha));
  const corre = (async () => {
    let S = conversa(sock);
    await S.cmd(null, [220]);
    await S.cmd(`EHLO ${C.host}`, [250]);
    if (!C.seguro) {
      await S.cmd("STARTTLS", [220]);
      sock.removeAllListeners("data");
      sock = tls.connect({ socket: sock, servername: C.host });
      S = conversa(sock);
      await new Promise((ok, falha) => { sock.once("secureConnect", ok); sock.once("error", falha); });
      await S.cmd(`EHLO ${C.host}`, [250]);
    }
    await S.cmd("AUTH LOGIN", [334]);
    await S.cmd(b64(C.usuario), [334]);
    await S.cmd(b64(process.env.SMTP_SENHA), [235]);
    await S.cmd(`MAIL FROM:<${C.remetente}>`, [250]);
    await S.cmd(`RCPT TO:<${para}>`, [250, 251]);
    await S.cmd("DATA", [354]);
    const msg = montar({ para, assunto, texto, anexo }).replace(/\r\n\./g, "\r\n..");
    await S.cmd(msg + "\r\n.", [250]);
    await S.cmd("QUIT", [221]).catch(() => {});
    sock.end();
    return { ok: true };
  })();
  return Promise.race([corre, erroConexao]);
}
