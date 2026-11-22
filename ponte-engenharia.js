// ponte-engenharia.js — tudo o que os módulos (pasta engenharia/) usam do sistema: tela, envio de arquivo, datas,
// pastas de dados, a lista de obras, a marca e o envio de mensagens. Os módulos só importam daqui e de ./engenharia/.
import { CONFIG } from "./nucleo/config.js";
import { enviarEmail, emailConfigurado } from "./nucleo/email.js";

export { shell, cabecalhoPagina, obraBonita, unidadeCurta, linkPDF, seloPDF, MARCA } from "./nucleo/brand.js";
export { ACCEPT, salvarArquivo, nomeSeguro, lerFormulario, LIMITE_LOTE, LIMITE_BYTES, LIMITE_IFC, tipoDoArquivo } from "./nucleo/upload.js";
export { isoLocal, agoraLocalISO } from "./nucleo/datas.js";
export { DIR_SETORES, DIR_ANEXOS, OBRAS_DOCS, listarObras, salvarObra } from "./nucleo/obras.js";

/** Cores da marca em hexadecimal, para o que é desenhado em PDF (lá não existe var(--…)). */
export const CORES_PDF = CONFIG.marca.cores;
/** Quem recebe os pedidos de plotagem: config.json → "plotadores": [{ "id", "nome", "email" }]. */
export const PLOTADORES = Array.isArray(CONFIG.plotadores) && CONFIG.plotadores.length ? CONFIG.plotadores : [{ id: "plotagem", nome: "Plotagem", email: "" }];
/** Prefeituras do vencimento de alvará: config.json → "municipios". */
export const MUNICIPIOS = Array.isArray(CONFIG.municipios) ? CONFIG.municipios : [];

export function lerDinheiro(t) {
  let s = String(t ?? "").replace(/[^\d,.-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Envio de mensagem (boletim, avisos de revisão, alvarás, plotagem). Só existe quando o e-mail está configurado:
 *  os módulos testam `typeof enviarMensagem === "function"` para saber se o envio está ligado. WhatsApp ainda não. */
async function enviar({ canal, para, assunto, texto, anexo }) {
  if (canal !== "email") return { erro: "O envio por WhatsApp ainda não está configurado. Use o e-mail." };
  if (!para) return { erro: "sem destinatário" };
  try { await enviarEmail({ para, assunto, texto, anexo }); return { ok: true }; }
  catch (e) { console.error("  ✉️  falha no e-mail para", para, "—", e.message); return { erro: "Não deu para enviar o e-mail: " + e.message }; }
}
export const enviarMensagem = emailConfigurado() ? enviar : undefined;
