// server.js — o servidor do sistema: login, sessões, controle de acesso por área, Administração e os módulos.
//   node server.js        → http://localhost:4700 (porta e endereço no config.json → "servidor")
// Para publicar na internet, ponha na frente um proxy com HTTPS (ex.: Caddy) — ver LEIAME.md.
import http from "node:http";
import { readFile, existsSync, statSync, mkdirSync } from "node:fs";
import { join, basename, extname, normalize } from "node:path";
import { CONFIG, RAIZ, DIR_DADOS } from "./nucleo/config.js";
import { paginaLogin, paginaTrocarSenha } from "./nucleo/brand.js";
import { garantirPrimeiroUsuario, entrar, usuarioDaSessao, sair, trocarSenha, ARQ_PRIMEIRO } from "./nucleo/usuarios.js";
import { atualizarObras, DIR_SETORES, DIR_ANEXOS } from "./nucleo/obras.js";
import { paginaInicial, paginaAdmin, postAdmin } from "./nucleo/admin.js";
import { rotear } from "./engenharia/rotas.js";

for (const d of [DIR_DADOS, DIR_SETORES, DIR_ANEXOS]) if (!existsSync(d)) mkdirSync(d, { recursive: true });
if (garantirPrimeiroUsuario()) console.log(`\n  👤 Primeiro uso: criei o usuário "admin". A senha provisória está em:\n     ${ARQ_PRIMEIRO}\n`);
atualizarObras();

const SEGURO = !!CONFIG.servidor.https;          // atrás de HTTPS: o cookie só anda por conexão segura
const COOKIE = SEGURO ? "__Host-sid" : "sid";
const NAO = Symbol("nao");
const MIME = { ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const DIR_ASSETS = join(RAIZ, "assets");

// ---------------------------------------------------------------- utilidades
const cabecalhosSeguranca = res => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  if (SEGURO) res.setHeader("Strict-Transport-Security", "max-age=31536000");
};
const html = (res, h, s = 200) => { if (res.headersSent) return; res.writeHead(s, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(h); };
const redir = (res, url) => { res.writeHead(303, { Location: url }); res.end(); };
const LIMITE_FORM = 2 * 1024 * 1024;
const lerBody = req => new Promise((ok, falha) => {
  let d = "", n = 0;
  req.on("data", c => { n += c.length; if (n > LIMITE_FORM) { req.destroy(); return falha(new Error("formulário grande demais")); } d += c; });
  req.on("end", () => { const p = {}; new URLSearchParams(d).forEach((v, k) => { p[k] = k in p ? [].concat(p[k], v) : v; }); ok(p); });
  req.on("error", falha);
});
const cookieSid = req => { const m = String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)); return m ? m[1] : ""; };
const poeCookie = (res, sid) => res.setHeader("Set-Cookie", `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax${SEGURO ? "; Secure" : ""}${sid ? "" : "; Max-Age=0"}`);

/** Proteção contra formulário vindo de outro site: todo POST precisa vir desta mesma origem. */
function mesmaOrigem(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const de = req.headers.origin || req.headers.referer;
  if (!de) return false;
  try { return new URL(de).host === host; } catch { return false; }
}

// ---------------------------------------------------------------- quem entra onde
const tem = (u, s) => u.setores.includes("*") || u.setores.includes(s);
const ehPdfDeBoletim = path => /^\/obras\/medicao\/[^/]+\/boletim\/[^/]+\/pdf$/.test(path);
function podeEntrar(u, path, metodo) {
  if (u.nivel === "externo") return path === "/documentos" || path.startsWith("/documentos/");
  if (path === "/projetos" || path.startsWith("/projetos/")) return tem(u, "projetos");
  if (path === "/documentos" || path.startsWith("/documentos/")) return tem(u, "documentos");
  if (path === "/obras/medicao-rh") return tem(u, "obras") || tem(u, "rh");
  if (path === "/obras" || path.startsWith("/obras/")) return tem(u, "obras") || (tem(u, "rh") && metodo === "GET" && ehPdfDeBoletim(path));
  return false;
}

// ---------------------------------------------------------------- arquivos estáticos (/assets/)
function servirAsset(res, path) {
  const nome = normalize(decodeURIComponent(path.slice("/assets/".length))).replace(/^(\.\.[\\/])+/, "");
  const arq = join(DIR_ASSETS, nome);
  if (!arq.startsWith(DIR_ASSETS) || !existsSync(arq) || !statSync(arq).isFile()) { res.writeHead(404); return res.end(); }
  readFile(arq, (e, b) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[extname(arq).toLowerCase()] || "application/octet-stream", "Cache-Control": "public, max-age=86400" }); res.end(b);
  });
}

// ---------------------------------------------------------------- o servidor
http.createServer(async (req, res) => {
  cabecalhosSeguranca(res);
  const u = new URL(req.url, "http://local"), path = u.pathname;
  try {
    if (path.startsWith("/assets/")) return servirAsset(res, path);
    if (path === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (req.method === "POST" && !mesmaOrigem(req)) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Envio recusado: não veio desta página."); }
    atualizarObras();

    // --- sem login
    if (path === "/login") {
      if (req.method === "POST") {
        const f = await lerBody(req), r = entrar(String(f.usuario || ""), String(f.senha || ""));
        if (r.erro) return html(res, paginaLogin({ erro: r.erro }), 401);
        poeCookie(res, r.sid); return redir(res, "/app");
      }
      return html(res, paginaLogin({ aviso: u.searchParams.get("saiu") ? "Você saiu do sistema." : "" }));
    }
    // a página do QR da prancha abre sem login (quem está na obra confere a prancha impressa no celular)
    const sid = cookieSid(req), user = usuarioDaSessao(sid);
    if (!user && req.method === "GET" && /^\/documentos\/qr\/[^/]+$/.test(path)) {
      const r = await rotear({ req, res, path, u, sess: { user: null }, html, redir, lerBody, NAO });
      if (r === NAO && !res.headersSent) { res.writeHead(404); res.end(); }
      return;
    }
    if (!user) return req.method === "GET" ? redir(res, "/login") : (res.writeHead(401), res.end("Sessão encerrada. Entre de novo."));

    // --- com login
    if (path === "/logout") { sair(sid); poeCookie(res, ""); return redir(res, "/login?saiu=1"); }
    if (path === "/trocar-senha" || user.trocarSenha) {
      const obrigatoria = user.trocarSenha;
      if (path === "/trocar-senha" && req.method === "POST") {
        const r = trocarSenha(user.id, await lerBody(req), { obrigatoria, sid });
        return r.erro ? html(res, paginaTrocarSenha({ erro: r.erro, nome: user.nome, obrigatoria }), 400) : redir(res, "/app");
      }
      if (path !== "/trocar-senha") return redir(res, "/trocar-senha");
      return html(res, paginaTrocarSenha({ nome: user.nome, obrigatoria }));
    }
    if (path === "/" || path === "/app" || path === "/engenharia" || path === "/adm") {
      if (user.nivel === "externo") return redir(res, "/documentos");
      return html(res, paginaInicial(user));
    }
    if (path === "/admin" || path.startsWith("/admin/")) {
      if (user.nivel !== "master") return redir(res, "/app");
      if (req.method === "POST") { const r = postAdmin(path, await lerBody(req), user); if (!r) { res.writeHead(404); return res.end(); } return r.html ? html(res, r.html) : redir(res, r.redir); }
      const q = Object.fromEntries(u.searchParams);
      return html(res, paginaAdmin(user, q));
    }
    if (!podeEntrar(user, path, req.method)) return req.method === "GET" ? redir(res, "/app") : (res.writeHead(403), res.end("Sem acesso a esta área."));

    const r = await rotear({ req, res, path, u, sess: { user }, html, redir, lerBody, NAO });
    if (r === NAO && !res.headersSent) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Página não encontrada."); }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) html(res, `<p style="font-family:sans-serif;padding:30px">Algo deu errado nesta página. O erro foi registrado no servidor.</p>`, 500);
  }
}).listen(CONFIG.servidor.porta, CONFIG.servidor.host, () =>
  console.log(`  ✓ ${CONFIG.marca.nome} no ar: http://${CONFIG.servidor.host === "0.0.0.0" ? "localhost" : CONFIG.servidor.host}:${CONFIG.servidor.porta}`));
