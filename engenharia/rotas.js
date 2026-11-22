// rotas.js — TODAS as rotas da Engenharia e Obra: /projetos, /obras e /documentos (21/10/2026).
//
// O server.js já conferiu o login e o setor de quem pede (DONO_DA_ROTA) antes de chamar esta função;
// aqui é só a tela e a gravação. Devolva NAO quando a rota não for daqui.
// Só importar de "./…" e de "../ponte-engenharia.js".
import { readFile, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { lerFormulario, salvarArquivo, nomeSeguro, LIMITE_LOTE, tipoDoArquivo } from "../ponte-engenharia.js";
import { paginaProjetos, paginaObra, ler as lerProjetos, salvar as salvarProjetos, DIR_PROJETOS, PASTAS as PASTAS_PROJ } from "./projetos.js";
import { camposAnexoAlvara, gravarAlvara, verificarAvisoSemanal } from "./projetos-alvara.js";
import { camposAnexoDocObra, gravarDocObra } from "./projetos-docobra.js";
import { paginaEntrada as medEntrada, paginaObra as medObra, paginaLancar as medLancar, paginaBoletim, pdfBoletim as medPdf, paginaPdfBoletim as medPdfTela, nomeArquivoBoletim as medNomePdf, paginaEmpreiteiros as medEmpreiteiros, paginaAssinar as medAssinar, mandarAoEmpreiteiro as medMandar, paginaPlanilha as medPlanilha, paginaServicos as medServicos, paginaRH as medRH, paginaAcesso as medAcesso, receberPlanilha as medRecebePlanilha, confirmarPlanilha as medConfirmaPlanilha } from "./medicao-telas.js";
import * as MED from "./medicao-dados.js";
import { paginaDocumentos, paginaDocumentosObra, enviarDocumentos, removerDocumento as removerDocProjeto, arquivoDocumento, paginaLocais, salvarLocal, liberarDocumento, paginaPainel, trocarResponsavel, paginaTipos, salvarTipo, carimbarDocumento, paginaChat, postarChat, acaoChat, imagemChat, paginaProjetistas, salvarProjetistas,
  paginaCompatEntrada, paginaCompat, postarCompat, acaoCompat, imagemCompat, salvarAlinhamento, salvarCalibracao, salvarReferencia } from "./documentos.js";
import { paginaLote, enviarLote } from "./documentos-lote.js";
import { paginaMateriaisEntrada, paginaMateriais, salvarMaterial, acaoMaterial, fotoMaterial } from "./documentos-materiais.js";
import { paginaAvisos, salvarAviso, avisarRevisao } from "./documentos-avisos.js";
import { paginaQR, arquivoComQR, urlQR, lembrarSite, salvarPosicaoQR, paginaPosicaoQR } from "./documentos-qr.js";
import { enviarModelo, acaoModelo, salvarAjuste3d, mandarModelo, limiteIFC } from "./documentos-3d.js";
import { paginaPlotagens,paginaSolicitar, paginaGestao, paginaPlotagem, solicitarPlotagem, acaoPlotagem, receberPlotagem, assinaturaPlotagem, zipPlotagem } from "./documentos-plotagens.js";

/** ctx = { req, res, path, u (URL), sess, html, redir, lerBody, NAO } */
export async function rotear({ req, res, path, u, sess, html, redir, lerBody, NAO }) {
  // aviso semanal do vencimento dos alvarás (13/11): o primeiro acesso da semana dispara, sem esperar (projetos-alvara.js)
  verificarAvisoSemanal(lerProjetos, salvarProjetos);
  // ---------- Projetos & Incorporações (setor isolado: não toca no fluxo) ----------
  if (path === "/projetos") return html(res, paginaProjetos(sess.user, u.searchParams.get("e") || u.searchParams.get("m") || ""));

  if (path.startsWith("/projetos/arquivo/")) {
    const nome = basename(path);
    if (!nomeSeguro(nome)) { res.writeHead(400); return res.end("arquivo inválido"); }
    const arq = join(DIR_PROJETOS, nome);
    if (!existsSync(arq)) { res.writeHead(404); return res.end("arquivo não encontrado"); }
    return readFile(arq, (e, buf) => {
      if (e) { res.writeHead(404); return res.end(); }
      const t = tipoDoArquivo(nome);     // PDF e imagem abrem na tela; DWG/DXF baixam
      res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `${t.abre}; filename="${nome}"`, "Cache-Control": "private, max-age=60" });
      res.end(buf);
    });
  }

  if (path === "/projetos/ficha" && req.method === "POST") {
    let f; try { f = await lerFormulario(req); }
    catch (e) { return html(res, paginaProjetos(sess.user), 400); }
    const d = lerProjetos();
    const o = (d.obras || []).find(x => x.id === f.campos.id);
    if (!o) { res.writeHead(404); return res.end("obra não encontrada"); }
    const CAMPOS = ["endereco", "terreno", "pavimentos", "unidades", "arquiteto", "previsaoEntrega"];
    o.ficha = o.ficha || {};
    for (const k of CAMPOS) o.ficha[k] = String(f.campos[k] || "").slice(0, 200).trim();
    o.ficha.observacoes = String(f.campos.observacoes || "").slice(0, 4000);
    o.atualizadoPor = sess.user.nome;
    o.atualizadoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    salvarProjetos(d);
    return redir(res, "/projetos/" + o.id);
  }

  if (path === "/projetos/anexo" && req.method === "POST") {
    let f; try { f = await lerFormulario(req); }
    catch (e) { return html(res, paginaProjetos(sess.user), 400); }
    const d = lerProjetos();
    const o = (d.obras || []).find(x => x.id === f.campos.id);
    if (!o) { res.writeHead(404); return res.end("obra não encontrada"); }
    const pasta = f.campos.pasta;
    if (!PASTAS_PROJ.some(([k]) => k === pasta)) return html(res, paginaObra(sess.user, o.id, "Pasta desconhecida."), 400);
    // alvará (13/11): a data de emissão é obrigatória — dela sai o vencimento
    const alv = pasta === "alvara" ? camposAnexoAlvara(f.campos) : {};
    if (alv.erro) return redir(res, `/projetos/${o.id}?e=${encodeURIComponent(alv.erro + " Nada foi anexado.")}#alvara`);
    // Documentos Obra (13/11): qual documento da lista, nº e data (opcionais)
    const dob = pasta === "docsobra" ? camposAnexoDocObra(f.campos) : {};
    if (dob.erro) return redir(res, `/projetos/${o.id}?e=${encodeURIComponent(dob.erro + " Nada foi anexado.")}#docsobra`);
    try {
      for (const a of f.arquivos) {
        if (a.campo !== "arquivo") continue;
        o.pastas = o.pastas || {}; o.pastas[pasta] = o.pastas[pasta] || [];
        o.pastas[pasta].push({
          arquivo: salvarArquivo(a, DIR_PROJETOS),
          titulo: String(f.campos.titulo || dob.nome || a.nome || "documento").slice(0, 160).trim(),
          ...(pasta === "alvara" ? { emissao: alv.emissao, numero: alv.numero } : {}),
          ...(pasta === "docsobra" ? { tipo: dob.tipo, numero: dob.numero, data: dob.data } : {}),
          enviadoPor: sess.user.nome,
          em: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
        });
      }
    } catch (e) { return html(res, paginaObra(sess.user, o.id, "Anexo recusado: " + e.message), 400); }
    o.atualizadoPor = sess.user.nome;
    o.atualizadoEm = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    salvarProjetos(d);
    return redir(res, "/projetos/" + o.id + (pasta === "alvara" ? "?m=" + encodeURIComponent("Alvará anexado.") + "#alvara"
      : pasta === "docsobra" ? "?m=" + encodeURIComponent(dob.nome + ": anexado.") + "#docsobra" : ""));
  }

  // Alvará (13/11): prefeitura, data de emissão, documentos da renovação e a lista de cada prefeitura
  if (path === "/projetos/alvara" && req.method === "POST") {
    const b = await lerBody(req), d = lerProjetos(), r = await gravarAlvara(d, sess.user, b);
    if (r.ok && r.ok !== "Nada mudou.") salvarProjetos(d);
    const q = r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok);
    return redir(res, r.o ? `/projetos/${r.o.id}?${q}#alvara` : `/projetos?${q}#alvaras`);
  }

  // Documentos Obra (13/11): tirar arquivo (só marca) e "não se aplica"
  if (path === "/projetos/docobra" && req.method === "POST") {
    const b = await lerBody(req), d = lerProjetos(), r = gravarDocObra(d, sess.user, b);
    if (r.ok && r.ok !== "Nada mudou.") salvarProjetos(d);
    const q = r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok);
    return redir(res, r.o ? `/projetos/${r.o.id}?${q}#docsobra` : `/projetos?${q}`);
  }

  // Corrigir um registro do histórico da incorporação (07/10): fase, comentário e a descrição dos documentos.
  // Quem pode: quem lançou e a Diretoria. O texto de antes fica guardado em `correcoes` — nada é apagado.
  if (path === "/projetos/incorporacao/editar" && req.method === "POST") {
    const b = await lerBody(req), d = lerProjetos(), o = (d.obras || []).find(x => x.id === b.id);
    if (!o) { res.writeHead(404); return res.end("obra não encontrada"); }
    const L = (o.incorporacao && o.incorporacao.andamentos) || [], a = L[Number(b.i)];
    if (!a || a.em !== b.em) return html(res, paginaObra(sess.user, o.id, "Registro não encontrado — a página estava desatualizada. Abra de novo e repita."), 400);
    if (!(sess.user.nivel === "master" || a.quem === sess.user.nome)) return html(res, paginaObra(sess.user, o.id, "Só quem lançou o registro, ou a Diretoria, pode editar."), 403);
    const docs = (a.arquivos && a.arquivos.length) ? a.arquivos : (a.arquivo ? (a.arquivos = [{ arquivo: a.arquivo, descricao: "" }]) : []);
    const novo = { fase: String(b.fase || "").slice(0, 160).trim(), comentario: String(b.comentario || "").slice(0, 4000).trim(),
                   descricoes: docs.map((x, k) => (("desc_" + k) in b ? String(b["desc_" + k] || "").slice(0, 200).trim() : x.descricao || "")) };
    const antes = { fase: a.fase || "", comentario: a.comentario || "", descricoes: docs.map(x => x.descricao || "") };
    if (JSON.stringify(antes) !== JSON.stringify(novo)) {
      const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      (a.correcoes = a.correcoes || []).push({ ...antes, por: sess.user.nome, em: agora });
      a.fase = novo.fase; a.comentario = novo.comentario; docs.forEach((x, k) => { x.descricao = novo.descricoes[k]; });
      a.editadoPor = sess.user.nome; a.editadoEm = agora;
      // se o registro corrigido é o que definiu a fase de hoje, a fase da obra acompanha
      if (Number(b.i) === L.length - 1 || !L.slice(Number(b.i) + 1).some(x => x.fase)) { if (novo.fase) o.incorporacao.fase = novo.fase; }
      o.atualizadoPor = sess.user.nome; o.atualizadoEm = agora;
      salvarProjetos(d);
    }
    return redir(res, "/projetos/" + o.id);
  }
  if (path === "/projetos/incorporacao" && req.method === "POST") {
    let f; try { f = await lerFormulario(req, LIMITE_LOTE); }     // vários documentos na mesma atualização
    catch (e) { return html(res, paginaProjetos(sess.user), 400); }
    const d = lerProjetos();
    const o = (d.obras || []).find(x => x.id === f.campos.id);
    if (!o) { res.writeHead(404); return res.end("obra não encontrada"); }
    const inc = o.incorporacao = o.incorporacao || { andamentos: [] };

    const quem = sess.user.nome;
    const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    // TUDO que a pessoa inserir vira linha do histórico, com o nome dela ao lado.
    // Sem isto, anexar só a certidão (ou só virar a chave para "incorporada") não deixava rastro.
    const feitos = [];

    if (["incorporada", "em_andamento"].includes(f.campos.situacao) && f.campos.situacao !== inc.situacao) {
      inc.situacao = f.campos.situacao;
      feitos.push(inc.situacao === "incorporada" ? "marcou como <b>já incorporada</b>" : "voltou para <b>em fase de incorporação</b>");
    }

    let fase = String(f.campos.fase || "").trim();
    if (fase === "__outra") fase = String(f.campos.faseOutra || "").slice(0, 160).trim();
    if (fase === "__outra") fase = "";
    if (fase && fase !== inc.fase) { inc.fase = fase; feitos.push("mudou a fase"); }

    // Documentos da atualização: vários, cada um com a descrição que a pessoa escreveu ao lado (07/10).
    const anexos = [];
    try {
      for (const a of f.arquivos) {
        if (a.campo === "certidao") {
          inc.certidao = { arquivo: salvarArquivo(a, DIR_PROJETOS), por: quem, em: agora };
          feitos.push("anexou a <b>certidão de incorporação</b>");
        }
        const m = /^anexo(?:_(\d{1,2}))?$/.exec(a.campo);
        if (m) anexos.push({ arquivo: salvarArquivo(a, DIR_PROJETOS), descricao: String(f.campos["anexoDesc_" + (m[1] || "")] || "").slice(0, 200).trim() });
      }
    } catch (e) { return html(res, paginaObra(sess.user, o.id, "Anexo recusado: " + e.message), 400); }

    if (anexos.length) feitos.push(anexos.length === 1 ? "anexou um documento" : `anexou ${anexos.length} documentos`);
    const anexo = anexos.length ? anexos[0].arquivo : null;
    const comentario = String(f.campos.comentario || "").slice(0, 4000).trim();
    if (comentario) feitos.push("comentou");

    if (feitos.length) {
      inc.andamentos = inc.andamentos || [];
      inc.andamentos.push({
        fase: fase || inc.fase || "", comentario, arquivo: anexo, arquivos: anexos,
        oQueFez: feitos.join(" · "), quem, em: agora,
      });
      o.atualizadoPor = quem; o.atualizadoEm = agora;
      salvarProjetos(d);
      return redir(res, "/projetos/" + o.id);
    }
    // nada mudou: não inventa linha no histórico
    return html(res, paginaObra(sess.user, o.id, "Nada foi alterado — preencha a fase, um comentário ou anexe um arquivo."));
  }

  if (path.startsWith("/projetos/")) {
    const id = basename(path);
    return html(res, paginaObra(sess.user, id, u.searchParams.get("e") || u.searchParams.get("m") || ""));
  }

  if (path === "/obras" || path === "/obras/medicoes") return redir(res, "/obras/medicao");

  // ---- Documentos (21/10): projetos das 10 obras, upload com nomenclatura, revisões, marcações e acesso externo
  if (path.startsWith("/documentos")) lembrarSite(req);       // o QR das pranchas leva o endereço do painel
  if (path === "/documentos") return html(res, paginaDocumentos(sess.user));
  // QR de validade (06/11): a prancha impressa aponta para cá — "válida" ou "desatualizada, descarte"
  if (path.startsWith("/documentos/qr/") && req.method === "GET") return html(res, paginaQR(sess.user, basename(path)));
  // onde o QR entra na prancha: achado sozinho (espaço em branco) ou ajustado na mão
  if (path === "/documentos/qrpos" && req.method === "POST") { const r = salvarPosicaoQR(sess.user, await lerBody(req)); res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)); }
  if (path.startsWith("/documentos/qr-posicao/") && req.method === "GET") { const p = paginaPosicaoQR(sess.user, basename(path)); return p ? html(res, p) : redir(res, "/documentos"); }
  if (path.startsWith("/documentos/arquivo/")) {
    const a = arquivoDocumento(sess.user, basename(path), u.searchParams.get("carimbado") === "1"); if (!a) { res.writeHead(404); return res.end("arquivo não encontrado"); }
    if (a.ext === ".pdf" && a.qr && u.searchParams.get("original") !== "1") {   // a cópia com o QR (o guardado não muda)
      let r; try { r = arquivoComQR(a.caminho, urlQR(a.id), a.codigo, a.qrPos); } catch { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "Cache-Control": "private, no-cache" }); return res.end(r.buf);
    }
    return readFile(a.caminho, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } const t = tipoDoArquivo("x" + a.ext);
      res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `${t.abre}; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "Cache-Control": "private, max-age=60" }); res.end(buf); });
  }
  // Marcar (04/11): agora é na tela do chat, com o PDF ao lado — o endereço antigo leva para lá, já marcando
  if (path.startsWith("/documentos/marcar/") && req.method === "GET") { const id = basename(path); return redir(res, `/documentos/chat/${id}?v=${id}&marcar=1`); }
  // Chat da prancha (04/11): mensagens, marcações em alta, etiquetas e tarefas
  if (path.startsWith("/documentos/chat/")) {
    const [id, acao, msgId, i] = path.slice("/documentos/chat/".length).split("/");
    const volta = (r, ancora = "") => redir(res, `/documentos/chat/${id}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}${ancora}`);
    if (acao === "img" && req.method === "GET") {
      const a = imagemChat(sess.user, id, msgId, i); if (!a) { res.writeHead(404); return res.end("imagem não encontrada"); }
      return readFile(a.caminho, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } const t = tipoDoArquivo("x" + a.ext);
        res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "Cache-Control": "private, max-age=3600" }); res.end(buf); });
    }
    if (acao === "acao" && req.method === "POST") {
      const b = await lerBody(req), r = acaoChat(sess.user, id, b); if (!r.id) return redir(res, "/documentos");
      return redir(res, `/documentos/chat/${id}?${b.f ? "f=" + encodeURIComponent(b.f) + "&" : ""}${r.erro ? "e=" + encodeURIComponent(r.erro) : ""}${r.msg ? "#m-" + r.msg : ""}`);
    }
    if (!acao && req.method === "POST") {
      // a tela manda pelo navegador e quer a resposta em dados (para manter o zoom); sem isso, volta para a página
      const emDados = /application\/json/.test(req.headers.accept || ""), responde = r => { res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: r.ok, erro: r.erro, msg: r.msg })); };
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { const r = { erro: "Não deu para receber o envio: " + e.message }; return emDados ? responde(r) : volta(r); }
      const r = postarChat(sess.user, id, f.campos, f.arquivos); if (emDados) return responde(r);
      if (!r.id) return redir(res, "/documentos");
      return r.erro ? volta(r) : redir(res, `/documentos/chat/${id}#m-${r.msg}`);
    }
    if (!acao && req.method === "GET") {
      const q = k => u.searchParams.get(k) || "";
      const p = paginaChat(sess.user, id, { ok: q("m"), erro: q("e"), f: q("f"), v: q("v"), marcar: q("marcar") === "1" }); return p ? html(res, p) : redir(res, "/documentos");
    }
  }
  // Compatibilização (04/11): sobreposição das disciplinas, chat geral da obra e clashes
  // Plotagens (05/11): entrada com 2 cards — Solicitar (pedido → plotada → entrega com assinatura) e Gestão
  if (path === "/documentos/plotagens" || path === "/documentos/plotagens/solicitar" || path === "/documentos/plotagens/gestao") {
    const q = k => u.searchParams.get(k) || "", msg = { ok: q("m"), erro: q("e") };
    if (path === "/documentos/plotagens/solicitar" && req.method === "POST") {
      const b = await lerBody(req), r = await solicitarPlotagem(sess.user, b), v = String(b.volta || "");
      const volta = v.startsWith("/documentos/plotagens/solicitar") ? v : "/documentos/plotagens/solicitar";
      return redir(res, r.erro ? volta + (volta.includes("?") ? "&" : "?") + "nova=1&e=" + encodeURIComponent(r.erro) : `/documentos/plotagens/${r.id}?m=` + encodeURIComponent(r.ok));
    }
    const filtros = { o: q("o"), disc: q("disc"), s: q("s"), nova: q("nova") === "1" };
    const p = path.endsWith("/solicitar") ? paginaSolicitar(sess.user, filtros, msg) : path.endsWith("/gestao") ? paginaGestao(sess.user, { ...filtros, m: q("mes") }, msg) : paginaPlotagens(sess.user, filtros, msg);
    return p ? html(res, p) : redir(res, "/documentos");
  }
  if (path === "/documentos/plotagens/acao" && req.method === "POST") {
    const b = await lerBody(req), r = await acaoPlotagem(sess.user, b), v = String(b.volta || "");
    const volta = v.startsWith("/documentos/plotagens") ? v : "/documentos/plotagens";
    return redir(res, volta + (volta.includes("?") ? "&" : "?") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)));
  }
  if (path.startsWith("/documentos/plotagens/")) {
    const [id, sub] = path.slice("/documentos/plotagens/".length).split("/"), q = k => u.searchParams.get(k) || "";
    if (sub === "assinatura" && req.method === "GET") { const a = assinaturaPlotagem(sess.user, id); if (!a) { res.writeHead(404); return res.end("assinatura não encontrada"); }
      res.writeHead(200, { "Content-Type": "image/png", "Content-Disposition": `inline; filename*=UTF-8${encodeURIComponent(a.nome)}`, "Cache-Control": "private, max-age=3600" }); return res.end(a.buffer); }
    if (sub === "zip" && req.method === "GET") { let z; try { z = zipPlotagem(sess.user, id); } catch (e) { res.writeHead(500); return res.end("não deu para montar o .zip: " + e.message); }
      if (!z) { res.writeHead(404); return res.end("pedido não encontrado"); }
      res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8${encodeURIComponent(z.nome)}`, "Cache-Control": "private, no-store" }); return res.end(z.buffer); }
    if (sub === "receber" && req.method === "POST") { const r = receberPlotagem(sess.user, id, await lerBody(req));
      return redir(res, `/documentos/plotagens/${id}?${r.erro ? "e=" + encodeURIComponent(r.erro) + "#receber" : "m=" + encodeURIComponent(r.ok)}`); }
    if (!sub && req.method === "GET") { const p = paginaPlotagem(sess.user, id, { ok: q("m"), erro: q("e") }); return p ? html(res, p) : redir(res, "/documentos/plotagens"); }
  }
  if (path === "/documentos/compat") { const p = paginaCompatEntrada(sess.user); return p ? html(res, p) : redir(res, "/documentos"); }
  if (path.startsWith("/documentos/compat/")) {
    const [obra, acao, msgId, i] = path.slice("/documentos/compat/".length).split("/"), q = k => u.searchParams.get(k) || "";
    const emDados = /application\/json/.test(req.headers.accept || ""), responde = r => { res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: r.ok, erro: r.erro, msg: r.msg })); };
    if (acao === "img" && req.method === "GET") {
      const a = imagemCompat(sess.user, obra, msgId, i); if (!a) { res.writeHead(404); return res.end("imagem não encontrada"); }
      return readFile(a.caminho, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } const t = tipoDoArquivo("x" + a.ext);
        res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "Cache-Control": "private, max-age=3600" }); res.end(buf); });
    }
    if (acao === "alinhar" && req.method === "POST") return responde(salvarAlinhamento(sess.user, obra, await lerBody(req)));
    // 🧊 modelo 3D (05/11): envio do IFC (limite próprio), o arquivo, remover e ajustar
    if (acao === "modelo" && req.method === "POST") {
      let f; try { f = await lerFormulario(req, limiteIFC()); } catch (e) { return responde({ erro: "Não deu para receber o envio: " + e.message }); }
      const r = enviarModelo(sess.user, obra, f.campos, f.arquivos); res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r));
    }
    if (acao === "modelo" && req.method === "GET") { if (!mandarModelo(res, sess.user, obra, msgId)) { res.writeHead(404); res.end("modelo não encontrado"); } return; }
    if (acao === "modelo-acao" && req.method === "POST") { const r = acaoModelo(sess.user, obra, await lerBody(req)); return redir(res, `/documentos/compat/${obra}?v=3d&` + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok))); }
    if (acao === "ajuste3d" && req.method === "POST") { const r = salvarAjuste3d(sess.user, obra, await lerBody(req)); res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)); }
    if ((acao === "calibrar" || acao === "referencia") && req.method === "POST") {      // escala e origem (05/11): resposta em dados
      const r = (acao === "calibrar" ? salvarCalibracao : salvarReferencia)(sess.user, obra, await lerBody(req));
      res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r));
    }
    if (acao === "acao" && req.method === "POST") {
      const b = await lerBody(req), r = acaoCompat(sess.user, obra, b); if (!r.id) return redir(res, "/documentos/compat");
      return redir(res, `/documentos/compat/${obra}?${b.v === "3d" ? "v=3d&" : ""}${b.l ? "l=" + encodeURIComponent(b.l) + "&" : ""}${b.f ?"f=" + encodeURIComponent(b.f) + "&" : ""}${r.erro ? "e=" + encodeURIComponent(r.erro) : ""}${r.msg ? "#m-" + r.msg : ""}`);
    }
    if (!acao && req.method === "POST") {
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { const r = { erro: "Não deu para receber o envio: " + e.message }; return emDados ? responde(r) : redir(res, `/documentos/compat/${obra}?e=` + encodeURIComponent(r.erro)); }
      const r = postarCompat(sess.user, obra, f.campos, f.arquivos); if (emDados) return responde(r);
      return redir(res, r.erro ? `/documentos/compat/${obra}?e=` + encodeURIComponent(r.erro) : `/documentos/compat/${obra}#m-${r.msg}`);
    }
    if (!acao && req.method === "GET") { const p = paginaCompat(sess.user, obra, { ok: q("m"), erro: q("e"), f: q("f"), l: q("l") || null, v: q("v") });return p ? html(res, p) : redir(res, "/documentos/compat"); }
  }
  // Projetistas (04/11): cadastro + quadradinhos obra × disciplina (vários por disciplina), com filtro por obra
  if (path === "/documentos/projetistas") {
    if (req.method === "POST") { const r = salvarProjetistas(sess.user, await lerBody(req));
      return redir(res, "/documentos/projetistas?" + (r.o ? "o=" + encodeURIComponent(r.o) + "&" : "") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok))); }
    const p = paginaProjetistas(sess.user, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "", o: u.searchParams.get("o") || "" }); return p ? html(res, p) : redir(res, "/documentos");
  }
  // Pavimentos e locais (04/11): a lista do envio, que só o administrador mexe
  if (path === "/documentos/locais") {
    if (req.method === "POST") { const r = salvarLocal(sess.user, await lerBody(req)); return redir(res, "/documentos/locais?" + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok))); }
    const p = paginaLocais(sess.user, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "" }); return p ? html(res, p) : redir(res, "/documentos");
  }
  // Tipos de prancha (04/11): uma lista por disciplina, que só o administrador mexe
  if (path === "/documentos/tipos") {
    if (req.method === "POST") { const r = salvarTipo(sess.user, await lerBody(req));
      return redir(res, `/documentos/tipos?d=${r.disc || ""}&` + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)) + (r.disc ? "#t-" + r.disc : "")); }
    const p = paginaTipos(sess.user, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "", disc: u.searchParams.get("d") || "" }); return p ? html(res, p) : redir(res, "/documentos");
  }
  // Carimbo do aprovativo (04/11): anexa o PDF carimbado, com data e protocolo
  if (path === "/documentos/carimbar" && req.method === "POST") {
    let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return redir(res, "/documentos?e=" + encodeURIComponent("Não deu para receber o envio: " + e.message)); }
    const r = carimbarDocumento(sess.user, f.campos, f.arquivos);
    return redir(res, r.obra ? `/documentos/${r.obra}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}` : "/documentos");
  }
  // Liberar para a obra / cancelar a liberação (04/11)
  // Painel de projetos (04/11): em revisão × liberado × obsoleto, fila de liberação com prazo e responsável
  const voltaPainel = (b, r) => { const v = String(b.volta || ""); if (!v.startsWith("/documentos/painel")) return null;
    return v + (v.includes("?") ? "&" : "?") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)); };
  if (path === "/documentos/painel") {
    const q = Object.fromEntries(u.searchParams), p = paginaPainel(sess.user, q, { ok: q.m || "", erro: q.e || "" }); return p ? html(res, p) : redir(res, "/documentos");
  }
  if (path === "/documentos/responsavel" && req.method === "POST") {
    const b = await lerBody(req), r = trocarResponsavel(sess.user, b); return redir(res, voltaPainel(b, r) || "/documentos/painel");
  }
  if (path === "/documentos/liberar" && req.method === "POST") {
    const b = await lerBody(req), r = liberarDocumento(sess.user, b), vp = voltaPainel(b, r);
    if (r.liberou) avisarRevisao({ evento: "liberada", obra: r.obra, ids: [r.liberou], user: sess.user }).catch(() => {});   // 📣 avisa depois de responder
    if (vp) return redir(res, vp);
    return redir(res, r.obra ? `/documentos/${r.obra}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}` : "/documentos");
  }
  // 🎨 Materiais e acabamentos (09/11): por obra, com foto, link e quantidade
  if (path === "/documentos/materiais") { const p = paginaMateriaisEntrada(sess.user); return p ? html(res, p) : redir(res, "/documentos"); }
  if (path.startsWith("/documentos/materiais/")) {
    const [obra, acao, id] = path.slice("/documentos/materiais/".length).split("/");
    const volta = r => redir(res, `/documentos/materiais/${obra}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}${r.k ? "#m-" + r.k : ""}`);
    if (acao === "salvar" && req.method === "POST") {
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return volta({ erro: "Não deu para receber o envio: " + e.message }); }
      return volta(salvarMaterial(sess.user, obra, f.campos, f.arquivos)); }
    if (acao === "acao" && req.method === "POST") return volta(acaoMaterial(sess.user, obra, await lerBody(req)));
    if (acao === "foto" && req.method === "GET") {
      const a = fotoMaterial(sess.user, obra, id); if (!a) { res.writeHead(404); return res.end("foto não encontrada"); }
      return readFile(a.caminho, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } const t = tipoDoArquivo("x" + a.ext);
        res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "Cache-Control": "private, max-age=3600" }); res.end(buf); }); }
    if (!acao && req.method === "GET") { const p = paginaMateriais(sess.user, obra, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "" }); return p ? html(res, p) : redir(res, "/documentos/materiais"); }
  }
  // 📣 Avisos de revisão (06/11): contatos que recebem WhatsApp e e-mail
  if (path === "/documentos/avisos") {
    if (req.method === "POST") { const r = salvarAviso(sess.user, await lerBody(req)); return redir(res, "/documentos/avisos?" + (r.ed ? "ed=" + r.ed + "&" : "") + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)) + (r.erro ? "#form" : "")); }
    const p = paginaAvisos(sess.user, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "", ed: u.searchParams.get("ed") || "" }); return p ? html(res, p) : redir(res, "/documentos");
  }
  if (path === "/documentos/remover" && req.method === "POST") {
    const b = await lerBody(req), r = removerDocProjeto(sess.user, b.id);
    return redir(res, r.obra ? `/documentos/${r.obra}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}` : "/documentos");
  }
  if (path.startsWith("/documentos/")) {
    const [obra, acao] = path.slice("/documentos/".length).split("/");
    if (acao === "enviar" && req.method === "POST") {
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return redir(res, `/documentos/${obra}?e=` + encodeURIComponent("Não deu para receber o envio: " + e.message)); }
      const r = enviarDocumentos(sess.user, obra, f.campos, f.arquivos);
      if (r.ids) avisarRevisao({ evento: "enviada", obra, ids: r.ids, user: sess.user }).catch(() => {});
      return redir(res, `/documentos/${obra}?${r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + encodeURIComponent(r.ok)}`);
    }
    // 📦 envio em lote (06/11): cada arquivo com os seus campos; tudo ou nada
    if (acao === "lote" && req.method === "GET") { const p = paginaLote(sess.user, obra); return p ? html(res, p) : redir(res, "/documentos/" + obra); }
    if (acao === "lote" && req.method === "POST") {
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ erro: "Não deu para receber o envio: " + e.message + ". Nada foi gravado." })); }
      const r = enviarLote(sess.user, obra, f.campos, f.arquivos);
      if (r.ids) avisarRevisao({ evento: "enviada", obra, ids: r.ids, user: sess.user }).catch(() => {});
      res.writeHead(r.erro ? 400 : 200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r));
    }
    if (!acao && req.method === "GET") { const p = paginaDocumentosObra(sess.user, obra, { ok: u.searchParams.get("m") || "", erro: u.searchParams.get("e") || "" }); return p ? html(res, p) : redir(res, "/documentos"); }
  }
  // ---- Medição, versão nova (03/11): estrutura e modelos, folha em grade, boletim do mês. A anterior segue em /obras/medicoes.
  if (path === "/obras/medicao") return html(res, medEntrada(sess.user, { m: u.searchParams.get("m") || "", e: u.searchParams.get("e") || "" }));
  // como o sistema me vê (12/11): o perfil e as obras que chegam do painel, e o que a medição faz com isso
  if (path === "/obras/medicao-acesso" && req.method === "GET") return html(res, medAcesso(sess.user));
  // o PAINEL DO RH (12/11): o mês de todas as obras — boletins, resumo por obra e quem teve medição
  if (path === "/obras/medicao-rh" && req.method === "GET" && !MED.podeRH(sess.user)) return redir(res, "/obras/medicao?e=" + encodeURIComponent("O Painel do RH é do RH, do Administrador, do Gerente de Engenharia e da Diretoria."));
  if (path === "/obras/medicao-rh" && req.method === "GET") return html(res, medRH(sess.user, { mes: u.searchParams.get("mes") || "" }));
  // o cadastro GERAL de serviços (10/11): todos os serviços do grupo e o preço de hoje em cada obra
  if (path === "/obras/medicao-servicos" && req.method === "GET")
    return html(res, medServicos(sess.user, { m: u.searchParams.get("m") || "", e: u.searchParams.get("e") || "", obra: u.searchParams.get("obra") || "" }));
  if (path.startsWith("/obras/medicao-servicos/") && req.method === "POST") {
    const acao = basename(path), f = await lerBody(req), us = sess.user, ob = /^[a-z0-9-]{2,40}$/.test(String(f.obra || "")) ? "&obra=" + f.obra : "";
    const volta = r => redir(res, "/obras/medicao-servicos?" + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + (r.igual ? "z" : "s")) + ob);
    if (acao === "novo") return volta(MED.novoServicoCatalogo(f, us));
    if (acao === "editar") return volta(MED.editarServicoCatalogo(f, us));
    return redir(res, "/obras/medicao-servicos");
  }
  // o cadastro ÚNICO de empreiteiros (todas as obras): obras em que cada um está habilitado, ativo/inativo
  if (path === "/obras/medicao-empreiteiros" && req.method === "GET")
    return html(res, medEmpreiteiros(sess.user, { m: u.searchParams.get("m") || "", e: u.searchParams.get("e") || "", obra: u.searchParams.get("obra") || "" }));
  if (path.startsWith("/obras/medicao-empreiteiros/") && req.method === "POST") {
    const acao = basename(path), f = await lerBody(req), us = sess.user, volta = r => redir(res, "/obras/medicao-empreiteiros?" + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + (r.igual ? "z" : "e")));
    if (acao === "salvar") { const pode = MED.obrasQueHabilita(us); return volta(MED.salvarEmpreiteiro({ ...f, obra: [].concat(f.obra || []).filter(o => pode.includes(o)) }, us)); }
    if (acao === "obras") return volta(MED.definirObras(f.id, f.obra, us));
    if (acao === "ativo") return volta(MED.definirAtivo(f.id, !!f.ativo, f.motivo, us));
    return redir(res, "/obras/medicao-empreiteiros");
  }
  if (path.startsWith("/obras/medicao/") && req.method === "GET") {
    const [obra, resto, extra] = path.slice("/obras/medicao/".length).split("/"), q = u.searchParams, b = "/obras/medicao/" + encodeURIComponent(obra);
    if (!MED.podeObra(sess.user, obra)) return redir(res, "/obras/medicao?e=" + encodeURIComponent("Você não tem acesso a esta obra na medição."));   // perfis (12/11)
    if (resto === "planilha") { const p = medPlanilha(sess.user, obra, { e: q.get("e") || "" }); return p ? html(res, p) : redir(res, "/obras/medicao"); }   // importar da planilha (10/11)
    if (resto === "lancar") { const p = medLancar(sess.user, obra, { pavs: q.getAll("pav"), locs: q.getAll("loc"), tipo: q.get("tipo") || "", cat: q.get("cat") || "", valores: { emp1: q.get("emp") || "", data: q.get("data") || "" } }); return p ? html(res, p) : redir(res, "/obras/medicao"); }
    // o boletim de medição (um por empreiteiro por mês): /boletim/<id>  ·  /boletim/<id>/pdf (aprovado: a versão aprovada; senão, a prévia)
    if (resto === "boletim" && extra && path.endsWith("/pdf")) {
      const volta = `${b}/boletim/${encodeURIComponent(extra)}`;                 // o PDF sai com a estrutura da tela (medicao-pdf.js)
      let buf; try { buf = medPdf(obra, extra); } catch (e) { console.log("  ⚠️  boletim (medição nova): " + String(e.message).split("\n")[0]); return redir(res, volta + "?e=" + encodeURIComponent("Não deu para gerar o PDF agora.")); }
      if (!buf) return redir(res, volta);
      if (q.get("visual") === "1") { const p = medPdfTela(sess.user, obra, extra, path); return p ? html(res, p) : redir(res, volta); }   // 13/11: a tela do PDF com Imprimir
      res.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": `${q.get("baixar") === "1" ? "attachment" : "inline"}; filename="Boletim_${obra}_${extra}.pdf"; filename*=UTF-8''${encodeURIComponent(medNomePdf(obra, extra))}` });   // nome completo do empreiteiro (05/11)
      return res.end(buf);
    }
    if (resto === "boletim" && extra && path.endsWith("/imprimir")) return redir(res, `${b}/boletim/${encodeURIComponent(extra)}/pdf?visual=1`);   // 13/11: a impressão é o PDF (a página HTML saiu)
    if (resto === "boletim" && extra && path.endsWith("/assinar")) { const p = medAssinar(sess.user, obra, extra, { e: q.get("e") || "" }); return p ? html(res, p) : redir(res, `${b}/boletim/${encodeURIComponent(extra)}?e=` + encodeURIComponent("A assinatura é colhida depois da aprovação final.")); }
    if (resto === "boletim" && extra) { const p = paginaBoletim(sess.user, obra, extra, { m: q.get("m") || "", e: q.get("e") || "", v: q.get("v") || "" }); return p ? html(res, p) : redir(res, b + "?aba=boletins"); }
    if (resto === "foto") {
      if (!nomeSeguro(extra) || !/^[a-z0-9-]{2,40}$/.test(obra)) { res.writeHead(400); return res.end("arquivo inválido"); }
      const arq = join(MED.PASTA_FOTOS, obra, extra);
      return readFile(arq, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } const t = tipoDoArquivo(extra);
        res.writeHead(200, { "Content-Type": t.mime, "Content-Disposition": `inline; filename="${extra}"`, "Cache-Control": "private, max-age=300" }); res.end(buf); });
    }
    const p = resto ? null : medObra(sess.user, obra, { aba: q.get("aba") || "", m: q.get("m") || "", e: q.get("e") || "", pav: q.get("pav") || "", local: q.get("local") || "",
      modelo: q.get("modelo") || "", cat: q.get("cat") || "", tipo: q.get("tipo") || "", st: q.get("st") || "", mes: q.get("mes") || "", emp: q.get("emp") || "" });
    return p ? html(res, p) : redir(res, "/obras/medicao");
  }
  if (path.startsWith("/obras/medicao/") && req.method === "POST") {
    const [obra, acao, bid, sub] = path.slice("/obras/medicao/".length).split("/"), us = sess.user, b = "/obras/medicao/" + encodeURIComponent(obra);
    const sufixo = (r, m) => r.erro ? "e=" + encodeURIComponent(r.erro) : "m=" + (r.igual ? "z" : m);
    if (!MED.podeObra(us, obra)) return redir(res, "/obras/medicao?e=" + encodeURIComponent("Você não tem acesso a esta obra na medição."));   // perfis (12/11)
    // o CATÁLOGO, o critério e os modelos: só quem gere (perfis). A estrutura (pavimentos, locais, grupos, serviços) o
    // Engenheiro também monta desde 13/11; QUANTIDADE e TIRAR SERVIÇO do local continuam só de quem gere (13/11).
    if (["modelo", "modelo-salvar", "modelo-aplicar", "catalogo", "criterio", "quantidade", "item-remover"].includes(acao) && !MED.podeGerir(us))
      return redir(res, b + "?aba=estrutura&e=" + encodeURIComponent("Catálogo, quantidades e tirar serviço do local são com a engenharia (Gerente, Administrador) ou a Diretoria."));
    if (acao === "planilha") {                                                       // importar da planilha: a planilha vem como anexo (10/11)
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return redir(res, b + "/planilha?e=" + encodeURIComponent("Não deu para receber a planilha: " + e.message)); }
      const p = medRecebePlanilha(us, obra, (f.arquivos || []).find(a => a.campo === "planilha")); return p ? html(res, p) : redir(res, "/obras/medicao");
    }
    if (acao === "lancar") {                                                         // o lançamento vem com fotos (multipart)
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return redir(res, b + "/lancar?e=" + encodeURIComponent("Não deu para receber o lançamento: " + e.message)); }
      const r = MED.lancar(obra, f.campos, f.arquivos, us);
      if (r.erro) { const p = medLancar(us, obra, { pavs: String(f.campos.pavs || "").split(",").filter(Boolean), locs: String(f.campos.locs || "").split("\n").filter(Boolean), tipo: f.campos.tipo || "", cat: f.campos.cat || "", erro: r.erro, valores: f.campos }); return p ? html(res, p, 400) : redir(res, b); }
      const m = r.reabertos ? "lancre" : "lanc";
      return redir(res, r.boletins.length === 1 ? `${b}/boletim/${encodeURIComponent(r.boletins[0])}?m=${m}` : `${b}?aba=boletins&mes=${String(f.campos.data || "").slice(0, 7)}&m=${m}`);
    }
    if (acao === "boletim" && bid && sub === "fotos") {                             // fotos no boletim (multipart)
      const volta = `${b}/boletim/${encodeURIComponent(bid)}`;
      let f; try { f = await lerFormulario(req, LIMITE_LOTE); } catch (e) { return redir(res, volta + "?e=" + encodeURIComponent("Não deu para receber as fotos: " + e.message)); }
      return redir(res, `${volta}?${sufixo(MED.anexarFotos(obra, bid, f.arquivos, us, String(f.campos.alvo || "")), "f")}`);
    }
    if (acao === "boletim" && bid) {                                                 // o que se faz no boletim: mexer, enviar, aprovar, devolver
      const f = await lerBody(req), volta = (r, m) => redir(res, `${b}/boletim/${encodeURIComponent(bid)}?${sufixo(r, m)}`);
      const reab = r => r.reaberto ? "re" : "s";                               // mexeu em boletim enviado/aprovado: ele voltou em aberto
      if (sub === "pct") { const r = MED.alterarLancamento(obra, bid, f.id, f.pct, us); return volta(r, reab(r)); }
      if (sub === "remover") { const r = MED.removerDoBoletim(obra, bid, f.qual, f.id, us); return r.sumiu ? redir(res, `${b}?aba=boletins&m=vaz`) : volta(r, reab(r)); }
      if (sub === "extra") { const r = MED.novoExtra(obra, bid, f, us); return volta(r, reab(r)); }
      if (sub === "obs") return volta(MED.salvarObsBoletim(obra, bid, f.obs, us), "s");
      if (sub === "nota") return volta(MED.salvarNota(obra, bid, String(f.alvo || ""), f.texto, us), "s");
      if (sub === "enviar") return volta(MED.enviarBoletim(obra, bid, us), "env");
      if (sub === "aprovar") return volta(MED.aprovarBoletim(obra, bid, us), "a");
      if (sub === "assinar") { const r = MED.assinarBoletim(obra, bid, f, us); return r.erro ? redir(res, `${b}/boletim/${encodeURIComponent(bid)}/assinar?e=${encodeURIComponent(r.erro)}`) : volta(r, "ass"); }
      if (sub === "mandar") return volta(await medMandar(us, obra, bid, String(f.canal || "")), "env2");
      if (sub === "enviado") { const r = MED.registrarEnvio(obra, bid, f.canal, us); res.writeHead(r.erro ? 400 : 204); return res.end(); }
      if (sub === "devolver") return volta(MED.devolverBoletim(obra, bid, f.motivo, us), "dev");
      if (sub === "revogar") return volta(MED.revogarBoletim(obra, bid, f, us), "rev");   // 13/11: retirar da aprovação / revogar a aprovação
      if (sub === "excluir") { const r = MED.excluirBoletim(obra, bid, f, us); return r.erro ? volta(r, "") : redir(res, `${b}?aba=boletins&m=exc`); }   // 13/11: excluir o boletim inteiro
      return redir(res, `${b}/boletim/${encodeURIComponent(bid)}`);
    }
    const f = await lerBody(req), aba = (a, r, m, extra = "") => redir(res, `${b}?aba=${a}${extra}&${sufixo(r, m)}`);
    const est = (r, m) => aba("estrutura", r, m, (f.pav ? "&pav=" + encodeURIComponent([].concat(f.pav)[0]) : "") + (f.local && !Array.isArray(f.local) ? "&local=" + encodeURIComponent(f.local) : f.volta ? "&local=" + encodeURIComponent(f.volta) : "") + (f.id && String(f.id).startsWith("md-") ? "&modelo=" + encodeURIComponent(f.id) : ""));
    if (acao === "importar") { const r = MED.importarDaAnterior(obra, us); return r.erro ? redir(res, "/obras/medicao?e=" + encodeURIComponent(r.erro)) : redir(res, b + "?m=imp"); }
    if (acao === "planilha-confirmar") { const r = medConfirmaPlanilha(us, obra, f.cod); return r.erro ? redir(res, b + "/planilha?e=" + encodeURIComponent(r.erro)) : redir(res, b + "?m=impp"); }
    if (acao === "recomecar") { const r = MED.recomecarObra(obra, f.nome, us); return redir(res, "/obras/medicao?" + (r.erro ? "e=" + encodeURIComponent(r.erro) : "m=recom")); }
    if (acao === "comecar") { const r = MED.comecarDoZero(obra, us); return r.erro ? redir(res, "/obras/medicao?e=" + encodeURIComponent(r.erro)) : redir(res, b + "?aba=estrutura&m=zero"); }
    if (acao === "pavimento") return est(MED.novoPavimento(obra, f, us), "s");
    if (acao === "pav-mover") { const r = MED.moverPavimento(obra, f.id, f.dir, us); return aba("estrutura", r, "s", "&pav=" + encodeURIComponent(f.id)); }
    if (acao === "pav-nome") { const r = MED.renomearPavimento(obra, f.id, f.nome, us); return aba("estrutura", r, "s", "&pav=" + encodeURIComponent(f.id)); }
    if (acao === "grupo") return aba("estrutura", MED.novoGrupo(obra, f, us), "s");
    if (acao === "grupo-auto") return aba("estrutura", MED.agruparAutomatico(obra, us), "s");
    if (acao === "grupo-mover") return aba("estrutura", MED.moverGrupo(obra, f.id, f.dir, us), "s");
    if (acao === "grupo-nome") return aba("estrutura", MED.renomearGrupo(obra, f.id, f.nome, us), "s");
    if (acao === "grupo-remover") return aba("estrutura", MED.removerGrupo(obra, f.id, us), "s");
    if (acao === "grupo-por") return aba("estrutura", MED.porNoGrupo(obra, f, us), "s");
    if (acao === "local") return est(MED.novoLocal(obra, f, us), "s");
    if (acao === "loc-mover") { const r = MED.moverLocal(obra, f.id, f.dir, us); return aba("estrutura", r, "s", "&pav=" + encodeURIComponent(f.pav || "") + "&local=" + encodeURIComponent(f.id)); }
    if (acao === "itens") return est(MED.adicionarItens(obra, f, us), "s");
    if (acao === "quantidade") return est(MED.salvarQuantidade(obra, f, us), "s");
    if (acao === "qtd-propor") { const r = MED.proporQtdReal(obra, f, us); return est(r, r.direto ? "qrok" : "qp"); }     // 13/11: o Engenheiro propõe a quantidade real
    if (acao === "qtd-decidir") return est(MED.decidirQtd(obra, f, us), "qd");
    if (acao === "qtd-visto") { MED.marcarDecisoesVistas(obra, us); return redir(res, String(f.volta || "").startsWith("/obras/medicao") ? String(f.volta) : b); }   // 13/11: "ok, vi" do sino
    if (acao === "qtd-massa") { const r = MED.quantidadesEmMassa(obra, f, us); return est(r, r.aprov ? "qma" : "qm"); }   // 13/11: edição em massa       // Gerente / Administrador aprova ou recusa
    if (acao === "item-remover") return est(MED.removerItem(obra, f.id, us), "s");
    if (acao === "modelo") { const r = MED.criarModelo(obra, f, us); return aba("estrutura", r, "s"); }
    if (acao === "modelo-salvar") return est(MED.salvarModelo(obra, f, us), "s");
    if (acao === "modelo-aplicar") { const r = MED.aplicarModelo(obra, f, us); return aba("estrutura", r, "s", "&modelo=" + encodeURIComponent(f.id || "")); }
    if (acao === "preco") return aba("precos", MED.novoPreco(obra, f, us), "p");
    if (acao === "catalogo") return aba("precos", MED.novoServicoCatalogo(f, us), "s");
    if (acao === "criterio") return aba("precos", MED.salvarCriterio(f, us), "s");
    if (acao === "empreiteiro") { const r = MED.salvarEmpreiteiro(f, us); if (r.ok && f.equipe && r.id) MED.equipe(obra, r.id, true, us); return aba("empreiteiros", r, "e"); }
    if (acao === "equipe") return aba("empreiteiros", MED.equipe(obra, f.e, !!f.entra, us), "s");
    return redir(res, b);
  }
  return NAO;
}
