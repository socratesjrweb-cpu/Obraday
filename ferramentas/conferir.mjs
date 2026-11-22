#!/usr/bin/env node
// conferir.mjs — a conferência antes de publicar (npm run conferir). Duas partes:
//   1. TRAVA: procura no código palavras que não podem estar no sistema (lista PROIBIDAS abaixo) e confere a sintaxe.
//   2. TELAS: sobe o sistema numa pasta de dados TEMPORÁRIA (os dados de verdade não são tocados), entra com cada perfil
//      e abre todas as telas principais. Qualquer erro 500 ou tela quebrada = ✗.
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
let falhas = 0;
const ok = m => console.log("  ✓ " + m), ruim = m => { console.log("  ✗ " + m); falhas++; };

// ---------------------------------------------------------------- 1. trava
// Palavras que não podem aparecer no código (marca, pessoas e lugares de onde o sistema veio). Amplie se precisar.
const PROIBIDAS = (process.env.PROIBIDAS || "").split(",").filter(Boolean);
const arquivos = [];
const anda = d => { for (const n of readdirSync(d)) { if (["dados", "node_modules", ".git", "assets"].includes(n)) continue; const p = join(d, n);
  statSync(p).isDirectory() ? anda(p) : [".js", ".mjs", ".json", ".md", ".py", ".txt"].includes(extname(n)) && arquivos.push(p); } };
anda(RAIZ);
console.log("Trava");
let achou = 0;
for (const a of arquivos) {
  if (a.endsWith("conferir.mjs")) continue;
  const t = readFileSync(a, "utf8");
  for (const w of PROIBIDAS) if (t.toLowerCase().includes(w.toLowerCase())) { ruim(`"${w}" em ${a.slice(RAIZ.length + 1)}`); achou++; }
  if (/\.(m?js)$/.test(a)) try { execFileSync(process.execPath, ["--check", a], { stdio: "pipe" }); } catch (e) { ruim(`sintaxe: ${a.slice(RAIZ.length + 1)}\n${e.stderr}`); }
}
if (!achou) ok(`${arquivos.length} arquivos sem palavras proibidas${PROIBIDAS.length ? "" : " (lista vazia: passe PROIBIDAS=a,b,c)"}`);

// ---------------------------------------------------------------- 2. telas
console.log("Telas");
const DADOS = mkdtempSync(join(tmpdir(), "conferir-")), PORTA = 4799, BASE = `http://127.0.0.1:${PORTA}`;
const srv = spawn(process.execPath, [join(RAIZ, "server.js")], { env: { ...process.env, DADOS, PORTA: String(PORTA) }, stdio: ["ignore", "pipe", "pipe"] });
let log = ""; srv.stdout.on("data", d => log += d); srv.stderr.on("data", d => log += d);
const espera = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 50 && !log.includes("no ar"); i++) await espera(100);

const ORIGEM = { Origin: BASE };
const pede = async (cookie, path, { metodo = "GET", corpo = null, cab = {} } = {}) => {
  const r = await fetch(BASE + path, { method: metodo, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(corpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...cab },
    body: corpo ? new URLSearchParams(corpo) : undefined });
  return { s: r.status, loc: r.headers.get("location") || "", txt: await r.text(), ck: (r.headers.get("set-cookie") || "").split(";")[0] };
};
async function login(usuario, senha) { const r = await pede("", "/login", { metodo: "POST", corpo: { usuario, senha }, cab: ORIGEM }); return r.s === 303 ? r.ck : null; }
const senhaDoTexto = t => (/Senha provisória[^:]*: (?:<code[^>]*>)?([A-Za-z0-9_-]{8,})/.exec(t) || [])[1];

try {
  const primeiro = readFileSync(join(DADOS, "sistema", "PRIMEIRO-ACESSO.txt"), "utf8"), prov = senhaDoTexto(primeiro);
  let ck = await login("admin", prov); ck ? ok("login do admin com a senha provisória") : ruim("login do admin");
  const forcada = await pede(ck, "/app"); forcada.loc === "/trocar-senha" ? ok("1º acesso obriga a trocar a senha") : ruim("não pediu troca de senha");
  const SENHA = "teste-" + Math.random().toString(36).slice(2, 12);
  const tr = await pede(ck, "/trocar-senha", { metodo: "POST", corpo: { nova: SENHA, nova2: SENHA }, cab: ORIGEM }); tr.s === 303 ? ok("senha trocada") : ruim("troca de senha: " + tr.s);
  ck = await login("admin", SENHA);
  (await pede("", "/login", { metodo: "POST", corpo: { usuario: "admin", senha: SENHA } })).s === 403 ? ok("POST sem origem é recusado") : ruim("POST sem origem passou");
  (await login("admin", "errada")) === null ? ok("senha errada não entra") : ruim("senha errada entrou");

  const ob = await pede(ck, "/admin/obra", { metodo: "POST", corpo: { nome: "Residencial Teste", spe: "SPE Teste Ltda" }, cab: ORIGEM }); ob.s === 303 ? ok("obra cadastrada") : ruim("cadastro de obra");
  const OBRA = "residencial-teste";
  const senhas = {};
  for (const [usuario, perfil, extra] of [["gerente", "Gerente de Engenharia", {}], ["eng", "Engenheiro", { obras: OBRA }], ["rh.teste", "RH", {}], ["proj", "Externo", { obras: OBRA }]]) {
    const r = await pede(ck, "/admin/usuario", { metodo: "POST", corpo: { usuario, nome: perfil + " Teste", perfil, ...extra }, cab: ORIGEM });
    const s = senhaDoTexto(r.txt); s ? (senhas[usuario] = s, ok(`usuário ${perfil} criado`)) : ruim(`criar ${perfil}`);
  }
  (await pede(ck, `/obras/medicao/${OBRA}/comecar`, { metodo: "POST", corpo: {}, cab: ORIGEM })).s === 303 ? ok("obra começada na medição") : ruim("começar obra na medição");

  const TELAS = {
    admin: ["/app", "/admin", "/projetos", `/projetos/${OBRA}`, "/obras/medicao", `/obras/medicao/${OBRA}`, ...["resumo", "estrutura", "boletins", "aprovacao", "precos", "empreiteiros"].map(a => `/obras/medicao/${OBRA}?aba=${a}`),
      `/obras/medicao/${OBRA}/lancar`, `/obras/medicao/${OBRA}/planilha`, "/obras/medicao-rh", "/obras/medicao-acesso", "/obras/medicao-servicos", "/obras/medicao-empreiteiros",
      "/documentos", `/documentos/${OBRA}`, `/documentos/${OBRA}/lote`, "/documentos/painel", "/documentos/compat", `/documentos/compat/${OBRA}`, "/documentos/plotagens", "/documentos/plotagens/solicitar",
      "/documentos/plotagens/gestao", "/documentos/materiais", `/documentos/materiais/${OBRA}`, "/documentos/locais", "/documentos/tipos", "/documentos/projetistas", "/documentos/avisos"],
    gerente: ["/app", "/projetos", "/obras/medicao", `/obras/medicao/${OBRA}?aba=aprovacao`, "/documentos/painel"],
    eng: ["/app", "/obras/medicao", `/obras/medicao/${OBRA}?aba=boletins`, `/obras/medicao/${OBRA}/lancar`, "/documentos", `/documentos/${OBRA}`],
    "rh.teste": ["/app", "/obras/medicao-rh"],
    proj: ["/documentos", `/documentos/${OBRA}`],
  };
  const BARRADAS = { eng: ["/admin", "/projetos", "/obras/medicao-rh"], "rh.teste": ["/obras/medicao", "/documentos", "/admin"], proj: ["/obras/medicao", "/projetos", "/app"] };
  for (const [quem, telas] of Object.entries(TELAS)) {
    let c = ck;
    if (quem !== "admin") {
      c = await login(quem, senhas[quem]);
      const S2 = "teste-" + Math.random().toString(36).slice(2, 12);
      await pede(c, "/trocar-senha", { metodo: "POST", corpo: { nova: S2, nova2: S2 }, cab: ORIGEM }); c = await login(quem, S2);
    }
    let bons = 0;
    for (const t of telas) {
      const r = await pede(c, t);
      if (r.s >= 500 || r.txt.includes("Algo deu errado")) ruim(`${quem} ${t}: erro ${r.s}`);
      else if (r.s === 303 && (r.loc === "/app" || r.loc === "/login")) ruim(`${quem} ${t}: barrado (→ ${r.loc})`);
      else bons++;
    }
    for (const t of BARRADAS[quem] || []) { const r = await pede(c, t); (r.s === 303 && !r.loc.startsWith(t)) ? bons++ : ruim(`${quem} ${t}: devia ser barrado (${r.s})`); }
    ok(`${quem}: ${bons} telas conferidas`);
  }
  const semLogin = await pede("", "/obras/medicao"); semLogin.loc === "/login" ? ok("sem login vai para a tela de entrada") : ruim("página aberta sem login");
} catch (e) { ruim("teste parou: " + e.stack); }
finally {
  srv.kill();
  await espera(300);
  if (/Error|TypeError|ReferenceError/.test(log)) { ruim("o servidor registrou erro:\n" + log.split("\n").filter(l => /Error|at /.test(l)).slice(0, 12).join("\n")); }
  try { rmSync(DADOS, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\n✗ ${falhas} problema(s)` : "\n✓ tudo certo");
process.exit(falhas ? 1 : 0);
