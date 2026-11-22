// admin.js — telas de Administração (só Diretoria): usuários e obras. Mais a página inicial (/app).
import { shell, cabecalhoPagina } from "./brand.js";
import { PERFIS, SETORES, listarUsuarios, salvarUsuario, ativarUsuario, novaSenhaProvisoria, historicoUsuarios } from "./usuarios.js";
import { listarObras, salvarObra, ativarObra } from "./obras.js";

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dataBR = iso => iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—";
const tem = (user, s) => user.setores.includes("*") || user.setores.includes(s);

// ---------------------------------------------------------------- página inicial
export function paginaInicial(user) {
  const cards = [];
  if (tem(user, "projetos")) cards.push(["/projetos", "📐", "Documentos & Incorporações", "Ficha técnica, alvarás, documentos e andamento da incorporação de cada obra."]);
  if (tem(user, "obras")) cards.push(["/obras/medicao", "📏", "Medições", "Estrutura da obra, lançamento, boletins do mês, aprovação e assinatura do empreiteiro."]);
  if (tem(user, "documentos")) cards.push(["/documentos", "📑", "Projetos", "Pranchas: revisões, liberação para a obra, chat com projetistas, compatibilização e plotagens."]);
  if (tem(user, "rh") || user.nivel === "master") cards.push(["/obras/medicao-rh", "🧾", "Painel do RH", "Boletins do mês de todas as obras: aprovado, falta assinatura e total."]);
  if (user.nivel === "master") cards.push(["/admin", "⚙️", "Administração", "Usuários, perfis e o cadastro de obras."]);
  const primeiro = String(user.nome || "").split(/\s+/)[0];
  return shell({ title: "Início", user, body: `
    <h1 class="hello">Olá, <b>${esc(primeiro)}</b></h1>
    <div class="hoje">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    <div class="grid">${cards.map(([h, ic, t, p]) => `<a class="card" href="${h}"><span class="ic">${ic}</span><h3>${t}</h3><p>${p}</p></a>`).join("")
      || `<div class="vazio">Seu usuário ainda não tem acesso a nenhuma área. Fale com a Diretoria.</div>`}</div>` });
}

// ---------------------------------------------------------------- administração
const msgs = ({ ok = "", erro = "", senha = "", usuario = "" }) => `${ok ? `<div class="msg ok">${esc(ok)}</div>` : ""}${erro ? `<div class="msg err">${esc(erro)}</div>` : ""}
  ${senha ? `<div class="msg ok" style="font-size:15px">Senha provisória de <b>${esc(usuario)}</b>: <code style="font-size:17px;background:#fff;padding:2px 8px;border-radius:6px">${esc(senha)}</code><br><small>Anote e passe para a pessoa agora — ela não aparece de novo. No primeiro acesso o sistema pede uma senha nova.</small></div>` : ""}`;

function formUsuario(u, obras) {
  const novo = !u; u ||= { perfil: "Engenheiro", setores: [], obras: [] };
  const setoresMarcados = u.setores && u.setores.length && !u.setores.includes("*") ? u.setores : (PERFIS[u.perfil] || {}).setores || [];
  const obrasMarcadas = u.obras || u.obrasDocs || [];
  return `<form method="POST" action="/admin/usuario" class="form-grid">
    ${novo ? "" : `<input type="hidden" name="id" value="${esc(u.id)}">`}
    <div><label>Login</label>${novo ? `<input name="usuario" required pattern="[a-z0-9._\\-]{3,40}" placeholder="ex.: joao.silva" autocapitalize="off">` : `<input value="${esc(u.usuario)}" disabled>`}</div>
    <div><label>Nome</label><input name="nome" required maxlength="80" value="${esc(u.nome || "")}"></div>
    <div><label>E-mail</label><input name="email" type="email" maxlength="120" value="${esc(u.email || "")}"></div>
    <div><label>Perfil</label><select name="perfil">${Object.entries(PERFIS).map(([k, p]) => `<option value="${esc(k)}"${k === u.perfil ? " selected" : ""}>${esc(k)} — ${esc(p.desc)}</option>`).join("")}</select></div>
    <div class="full"><label>Áreas (vale para Gerente, Administrador e Engenheiro; em branco = o padrão do perfil)</label><div class="chks">
      ${SETORES.map(([k, n]) => `<label><input type="checkbox" name="setores" value="${k}"${setoresMarcados.includes(k) ? " checked" : ""}> ${esc(n)}</label>`).join("")}</div></div>
    <div class="full"><label>Obras (Engenheiro: as que ele mede · Externo: as que ele vê em Projetos; os outros perfis veem todas)</label><div class="chks">
      ${obras.filter(o => o.ativa).map(o => `<label><input type="checkbox" name="obras" value="${esc(o.id)}"${obrasMarcadas.includes(o.id) ? " checked" : ""}> ${esc(o.nome)}</label>`).join("") || `<span style="color:var(--mut);font-size:13px">Nenhuma obra cadastrada ainda.</span>`}</div></div>
    <div class="full"><button class="btn inline" type="submit">${novo ? "Criar usuário" : "Salvar"}</button></div>
  </form>`;
}

export function paginaAdmin(user, q = {}) {
  const us = listarUsuarios(), obras = listarObras(), editU = q.u ? us.find(x => x.id === q.u) : null, editO = q.o ? obras.find(x => x.id === q.o) : null;
  const badge = p => `<span class="badge ${p === "Diretoria" ? "dir" : p === "Externo" || p === "RH" ? "ope" : "ges"}">${esc(p)}</span>`;
  const linhaU = u => `<tr${u.ativo ? "" : ` class="so"`}><td><b>${esc(u.nome)}</b><br><small style="color:var(--mut)">${esc(u.usuario)}${u.email ? " · " + esc(u.email) : ""}</small></td>
    <td>${badge(u.perfil)}${u.trocarSenha ? `<br><small style="color:#8a6d1e">aguardando 1º acesso</small>` : ""}</td>
    <td>${u.ativo ? `<span class="badge on">ativo</span>` : `<span class="badge off">inativo</span>`}</td><td>${dataBR(u.ultimoAcesso)}</td>
    <td><div class="acoes"><a class="btn-sm" href="/admin?u=${esc(u.id)}#form-u">Editar</a>
      <form method="POST" action="/admin/usuario/senha" onsubmit="return confirm('Gerar uma senha provisória nova para ${esc(u.usuario)}? A atual deixa de valer.')"><input type="hidden" name="id" value="${esc(u.id)}"><button class="btn-sm">Nova senha</button></form>
      ${u.id === user.id ? "" : `<form method="POST" action="/admin/usuario/ativo"><input type="hidden" name="id" value="${esc(u.id)}"><input type="hidden" name="ativo" value="${u.ativo ? "0" : "1"}"><button class="btn-sm${u.ativo ? " danger" : ""}">${u.ativo ? "Desativar" : "Reativar"}</button></form>`}</div></td></tr>`;
  const linhaO = o => `<tr${o.ativa ? "" : ` class="so"`}><td><b>${esc(o.nome)}</b>${o.projetoNovo ? ` <span class="badge ges">projeto novo</span>` : ""}<br><small style="color:var(--mut)">${esc(o.id)}</small></td>
    <td>${esc(o.spe || "—")}<br><small style="color:var(--mut)">${esc(o.cnpj)}</small></td><td>${o.ativa ? `<span class="badge on">ativa</span>` : `<span class="badge off">desativada</span>`}</td>
    <td><div class="acoes"><a class="btn-sm" href="/admin?o=${esc(o.id)}#form-o">Editar</a>
      <form method="POST" action="/admin/obra/ativa"><input type="hidden" name="id" value="${esc(o.id)}"><input type="hidden" name="ativa" value="${o.ativa ? "0" : "1"}"><button class="btn-sm${o.ativa ? " danger" : ""}">${o.ativa ? "Desativar" : "Reativar"}</button></form></div></td></tr>`;
  return shell({ title: "Administração", user, body: `
    ${cabecalhoPagina({ icone: "⚙️", titulo: "Administração", sub: "Usuários, perfis e o cadastro de obras. Nada é apagado: desativar guarda o histórico." })}
    ${msgs(q)}
    <div class="secao">🏗️ Obras — ${obras.filter(o => o.ativa).length} ativa(s)</div>
    <div class="painel"><table class="tab-u"><thead><tr><th>Obra</th><th>SPE / CNPJ</th><th>Situação</th><th></th></tr></thead>
      <tbody>${obras.map(linhaO).join("") || `<tr><td colspan="4" style="color:var(--mut)">Nenhuma obra ainda. Cadastre a primeira abaixo.</td></tr>`}</tbody></table></div>
    <div class="painel" id="form-o"><h3>${editO ? `Editar obra: ${esc(editO.nome)}` : "Nova obra"}</h3>
      <form method="POST" action="/admin/obra" class="form-grid">${editO ? `<input type="hidden" name="id" value="${esc(editO.id)}">` : ""}
        <div><label>Nome da obra</label><input name="nome" required maxlength="80" value="${esc(editO ? editO.nome : "")}" placeholder="ex.: Residencial Bela Vista"></div>
        <div><label>SPE (razão social, opcional)</label><input name="spe" maxlength="120" value="${esc(editO ? editO.spe : "")}"></div>
        <div><label>CNPJ (opcional)</label><input name="cnpj" maxlength="20" value="${esc(editO ? editO.cnpj : "")}"></div>
        <div><label>&nbsp;</label><div class="chks"><label><input type="checkbox" name="projetoNovo" value="1"${editO && editO.projetoNovo ? " checked" : ""}> Ainda em projeto (não começou)</label></div></div>
        <div class="full"><button class="btn inline">${editO ? "Salvar" : "Cadastrar obra"}</button>${editO ? ` <a class="btn-sm" href="/admin#form-o">cancelar</a>` : ""}</div></form></div>
    <div class="secao">👥 Usuários — ${us.filter(u => u.ativo).length} ativo(s)</div>
    <div class="painel"><table class="tab-u"><thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
      <tbody>${us.map(linhaU).join("")}</tbody></table></div>
    <div class="painel" id="form-u"><h3>${editU ? `Editar usuário: ${esc(editU.usuario)}` : "Novo usuário"}</h3>${formUsuario(editU, obras)}
      ${editU ? `<p style="margin-top:10px"><a class="btn-sm" href="/admin#form-u">cancelar</a></p>` : `<p style="margin-top:10px;font-size:12.5px;color:var(--mut)">O sistema gera uma senha provisória; a pessoa troca no primeiro acesso.</p>`}</div>
    <div class="secao">🕘 Histórico</div>
    <div class="painel" style="font-size:13px">${historicoUsuarios().map(h => `<div style="padding:4px 0;border-bottom:1px solid #f2efe4"><b>${esc(String(h.em).slice(0, 16).replace("T", " "))}</b> · ${esc(h.por)} — ${esc(h.txt)}</div>`).join("") || "—"}</div>` });
}

/** As gravações da Administração. Devolve { html } ou { redir }. */
export function postAdmin(path, campos, user) {
  const volta = (r, ancora) => {
    if (r.senha) return { html: paginaAdmin(user, { ok: r.ok, senha: r.senha, usuario: r.usuario }) };   // a senha só aparece nesta resposta
    return { redir: "/admin?" + new URLSearchParams(r.erro ? { erro: r.erro } : { ok: r.ok }) + ancora };
  };
  if (path === "/admin/usuario") return volta(salvarUsuario(campos, user), "#form-u");
  if (path === "/admin/usuario/ativo") return volta(ativarUsuario(campos.id, campos.ativo === "1", user), "");
  if (path === "/admin/usuario/senha") return volta(novaSenhaProvisoria(campos.id, user), "");
  if (path === "/admin/obra") return volta(salvarObra(campos, user), "#form-o");
  if (path === "/admin/obra/ativa") return volta(ativarObra(campos.id, campos.ativa === "1", user), "");
  return null;
}
