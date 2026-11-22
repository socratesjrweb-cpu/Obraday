// usuarios.js — cadastro de usuários, senhas e sessões (login).
//
// · Senha guardada com scrypt (sal próprio por pessoa); a senha em si nunca é gravada.
// · Sessão = código aleatório num cookie HttpOnly; vale SESSAO_HORAS e é gravada em disco (reiniciar o servidor não derruba ninguém).
// · Erro de senha 5 vezes seguidas bloqueia aquele usuário por 15 minutos.
// · Nada some: desativar marca "ativo: false"; cada alteração guarda quem fez e quando.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DIR_DADOS } from "./config.js";
import { agoraLocalISO } from "./datas.js";

export const DIR_SISTEMA = join(DIR_DADOS, "sistema");
const ARQ_USU = join(DIR_SISTEMA, "usuarios.json");
const ARQ_SES = join(DIR_SISTEMA, "sessoes.json");
export const ARQ_PRIMEIRO = join(DIR_SISTEMA, "PRIMEIRO-ACESSO.txt");
const SESSAO_HORAS = 12;
const MAX_ERROS = 5, BLOQUEIO_MIN = 15;

// ---------------------------------------------------------------- perfis
// Cada perfil já diz o nível e o que a pessoa enxerga por padrão. Os módulos leem user.perfil, user.nivel,
// user.setores, user.obras (Engenheiro) e user.obrasDocs (Externo).
export const PERFIS = {
  "Diretoria":             { nivel: "master",  setores: ["*"], desc: "vê e aprova tudo; administra o sistema" },
  "Gerente de Engenharia": { nivel: "comum",   setores: ["projetos", "obras", "documentos"], desc: "aprova boletins, libera pranchas, gere a medição" },
  "Administrador":         { nivel: "comum",   setores: ["projetos", "obras", "documentos"], desc: "gere a medição e as listas; libera pranchas" },
  "Engenheiro":            { nivel: "comum",   setores: ["obras", "documentos"], desc: "lança medição nas obras dele; vê as pranchas liberadas" },
  "RH":                    { nivel: "comum",   setores: ["rh"], desc: "só o Painel do RH (boletins do mês) e os PDFs" },
  "Externo":               { nivel: "externo", setores: ["documentos"], desc: "projetista de fora: só Projetos, só as obras marcadas" },
};
export const SETORES = [["projetos", "Documentos & Incorporações"], ["obras", "Medições"], ["documentos", "Projetos (pranchas)"]];

// ---------------------------------------------------------------- arquivo
const ler = (p, vazio) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return vazio; } };
function gravar(p, d) {
  if (!existsSync(DIR_SISTEMA)) mkdirSync(DIR_SISTEMA, { recursive: true });
  const t = p + ".tmp"; writeFileSync(t, JSON.stringify(d, null, 1)); renameSync(t, p);
}
const lerUsuarios = () => { const d = ler(ARQ_USU, null) || { lista: [], historico: [] }; d.lista ||= []; d.historico ||= []; return d; };
const quem = u => (u && (u.nome || u.usuario)) || "sistema";

// ---------------------------------------------------------------- senha
const hashSenha = (senha, sal = randomBytes(16).toString("hex")) => ({ sal, hash: scryptSync(String(senha), sal, 64).toString("hex") });
function confere(senha, guardada) {
  if (!guardada || !guardada.sal) return false;
  const a = Buffer.from(hashSenha(senha, guardada.sal).hash, "hex"), b = Buffer.from(guardada.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export const senhaFraca = s => String(s || "").length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : null;
const senhaAleatoria = () => randomBytes(9).toString("base64url");

// ---------------------------------------------------------------- o usuário como os módulos esperam
const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
export const loginValido = s => /^[a-z0-9._-]{3,40}$/.test(String(s || ""));
/** O que vai para a sessão (sem senha). */
function publico(u) {
  const P = PERFIS[u.perfil] || PERFIS["Engenheiro"];
  const setores = P.setores.includes("*") ? ["*"] : (Array.isArray(u.setores) && u.setores.length ? u.setores : P.setores);
  const obras = Array.isArray(u.obras) ? u.obras : [];
  return {
    id: u.id, usuario: u.usuario, nome: u.nome, email: u.email || "", perfil: u.perfil, nivel: P.nivel, setores,
    ...(u.perfil === "Engenheiro" ? { obras } : {}),
    ...(u.perfil === "Externo" ? { obrasDocs: obras } : {}),
    trocarSenha: !!u.trocarSenha,
  };
}
export const listarUsuarios = () => lerUsuarios().lista.map(u => ({ ...publico(u), ativo: u.ativo !== false, criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso || "" }));
export const temUsuarios = () => lerUsuarios().lista.length > 0;

/** No primeiro uso (nenhum usuário): cria "admin" (Diretoria) com senha aleatória, que precisa ser trocada no 1º acesso. */
export function garantirPrimeiroUsuario() {
  if (temUsuarios()) return null;
  const senha = senhaAleatoria(), d = lerUsuarios();
  d.lista.push({ id: "u-" + randomBytes(5).toString("hex"), usuario: "admin", nome: "Administrador", perfil: "Diretoria", ativo: true,
    trocarSenha: true, senha: hashSenha(senha), criadoEm: agoraLocalISO(), criadoPor: "sistema" });
  d.historico.push({ em: agoraLocalISO(), por: "sistema", txt: "Criou o usuário inicial admin" });
  gravar(ARQ_USU, d);
  writeFileSync(ARQ_PRIMEIRO, `Primeiro acesso ao sistema\n\nUsuário: admin\nSenha provisória: ${senha}\n\nNo primeiro acesso o sistema pede uma senha nova. Este arquivo se apaga sozinho quando a senha for trocada.\n`);
  return senha;
}

// ---------------------------------------------------------------- login e bloqueio
const erros = new Map();   // usuario → { n, ate }
export function entrar(usuario, senha) {
  const login = semAc(usuario);
  const e = erros.get(login);
  if (e && e.ate && e.ate > Date.now()) return { erro: `Muitas tentativas. Tente de novo em ${Math.ceil((e.ate - Date.now()) / 60000)} min.` };
  const d = lerUsuarios(), u = d.lista.find(x => x.usuario === login);
  if (!u || u.ativo === false || !confere(senha, u.senha)) {
    const n = (e && !e.ate ? e.n : 0) + 1;   // bloqueio vencido recomeça a conta
    erros.set(login, n >= MAX_ERROS ? { n, ate: Date.now() + BLOQUEIO_MIN * 60000 } : { n });
    return { erro: "Usuário ou senha incorretos." };
  }
  erros.delete(login);
  u.ultimoAcesso = agoraLocalISO(); gravar(ARQ_USU, d);
  return { ok: true, sid: novaSessao(u.id) };
}

// ---------------------------------------------------------------- sessões
let SESS = null;
const sessoes = () => (SESS ||= ler(ARQ_SES, {}));
const gravarSessoes = () => gravar(ARQ_SES, SESS);
function novaSessao(uid) {
  const s = sessoes(), agora = Date.now();
  for (const [k, v] of Object.entries(s)) if (v.ate < agora) delete s[k];   // limpa as vencidas
  const sid = randomBytes(32).toString("hex");
  s[sid] = { uid, ate: agora + SESSAO_HORAS * 3600000 };
  gravarSessoes(); return sid;
}
/** O usuário da sessão (ou null). Sessão vencida, usuário desativado ou apagado = null. */
export function usuarioDaSessao(sid) {
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  const s = sessoes()[sid]; if (!s) return null;
  if (s.ate < Date.now()) { delete SESS[sid]; gravarSessoes(); return null; }
  const u = lerUsuarios().lista.find(x => x.id === s.uid);
  return u && u.ativo !== false ? publico(u) : null;
}
export function sair(sid) { if (sid && sessoes()[sid]) { delete SESS[sid]; gravarSessoes(); } }
const derrubarSessoesDe = (uid, menos = "") => { const s = sessoes(); for (const [k, v] of Object.entries(s)) if (v.uid === uid && k !== menos) delete s[k]; gravarSessoes(); };

export function trocarSenha(uid, { atual, nova, nova2 }, { obrigatoria = false, sid = "" } = {}) {
  const d = lerUsuarios(), u = d.lista.find(x => x.id === uid); if (!u) return { erro: "Usuário não encontrado." };
  if (!obrigatoria && !confere(atual, u.senha)) return { erro: "A senha atual não confere." };
  const fraca = senhaFraca(nova); if (fraca) return { erro: fraca };
  if (nova !== nova2) return { erro: "As duas senhas não são iguais." };
  if (confere(nova, u.senha)) return { erro: "A senha nova precisa ser diferente da atual." };
  u.senha = hashSenha(nova); u.trocarSenha = false;
  d.historico.push({ em: agoraLocalISO(), por: quem(u), txt: `${u.usuario} trocou a própria senha` });
  gravar(ARQ_USU, d); derrubarSessoesDe(uid, sid);
  if (u.usuario === "admin" && existsSync(ARQ_PRIMEIRO)) try { unlinkSync(ARQ_PRIMEIRO); } catch {}
  return { ok: true };
}

// ---------------------------------------------------------------- administração (só Diretoria)
const lista = v => [].concat(v ?? []).map(String).filter(Boolean);
export function salvarUsuario(campos, por) {
  const d = lerUsuarios(), id = String(campos.id || "");
  const nome = String(campos.nome || "").trim().slice(0, 80), email = String(campos.email || "").trim().slice(0, 120);
  const perfil = PERFIS[campos.perfil] ? campos.perfil : null;
  if (!nome) return { erro: "Preencha o nome." };
  if (!perfil) return { erro: "Escolha o perfil." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };
  const setores = lista(campos.setores).filter(s => SETORES.some(([k]) => k === s));
  const obras = lista(campos.obras).slice(0, 200);
  if (id) {
    const u = d.lista.find(x => x.id === id); if (!u) return { erro: "Usuário não encontrado." };
    if (u.id === por.id && perfil !== "Diretoria") return { erro: "Você não pode tirar o seu próprio perfil de Diretoria." };
    const antes = { nome: u.nome, email: u.email, perfil: u.perfil, setores: u.setores, obras: u.obras };
    Object.assign(u, { nome, email, perfil, setores, obras });
    (u.alteracoes ||= []).push({ em: agoraLocalISO(), por: quem(por), antes });
    d.historico.push({ em: agoraLocalISO(), por: quem(por), txt: `Alterou o usuário ${u.usuario}` });
    gravar(ARQ_USU, d); return { ok: `Usuário ${u.usuario} salvo.` };
  }
  const usuario = semAc(campos.usuario);
  if (!loginValido(usuario)) return { erro: "Login inválido: de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado." };
  if (d.lista.some(x => x.usuario === usuario)) return { erro: `Já existe o usuário ${usuario}.` };
  const senha = senhaAleatoria();
  d.lista.push({ id: "u-" + randomBytes(5).toString("hex"), usuario, nome, email, perfil, setores, obras, ativo: true, trocarSenha: true,
    senha: hashSenha(senha), criadoEm: agoraLocalISO(), criadoPor: quem(por) });
  d.historico.push({ em: agoraLocalISO(), por: quem(por), txt: `Criou o usuário ${usuario} (${perfil})` });
  gravar(ARQ_USU, d);
  return { ok: `Usuário ${usuario} criado.`, senha, usuario };
}
export function ativarUsuario(id, ativo, por) {
  const d = lerUsuarios(), u = d.lista.find(x => x.id === id); if (!u) return { erro: "Usuário não encontrado." };
  if (u.id === por.id && !ativo) return { erro: "Você não pode desativar a si mesmo." };
  u.ativo = !!ativo; d.historico.push({ em: agoraLocalISO(), por: quem(por), txt: `${ativo ? "Reativou" : "Desativou"} o usuário ${u.usuario}` });
  gravar(ARQ_USU, d); if (!ativo) derrubarSessoesDe(u.id);
  return { ok: `Usuário ${u.usuario} ${ativo ? "reativado" : "desativado"}.` };
}
export function novaSenhaProvisoria(id, por) {
  const d = lerUsuarios(), u = d.lista.find(x => x.id === id); if (!u) return { erro: "Usuário não encontrado." };
  const senha = senhaAleatoria(); u.senha = hashSenha(senha); u.trocarSenha = true;
  d.historico.push({ em: agoraLocalISO(), por: quem(por), txt: `Gerou senha provisória para ${u.usuario}` });
  gravar(ARQ_USU, d); derrubarSessoesDe(u.id);
  return { ok: `Senha provisória gerada para ${u.usuario}.`, senha, usuario: u.usuario };
}
export const historicoUsuarios = () => lerUsuarios().historico.slice(-60).reverse();
