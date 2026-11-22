// obras.js — o cadastro ÚNICO de obras do sistema.
// Mora no projetos.json (o mesmo arquivo de Documentos & Incorporações), então Medição, Projetos e Documentos
// enxergam a mesma lista. Desativar marca "removido" (com quem e quando); nada é apagado.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DIR_DADOS } from "./config.js";
import { agoraLocalISO } from "./datas.js";

export const DIR_SETORES = join(DIR_DADOS, "setores");
export const DIR_ANEXOS = join(DIR_DADOS, "anexos");
const ARQ = join(DIR_SETORES, "projetos.json");

const ler = () => { try { const d = JSON.parse(readFileSync(ARQ, "utf8")); d.obras ||= []; return d; } catch { return { obras: [] }; } };
function gravar(d) {
  if (!existsSync(DIR_SETORES)) mkdirSync(DIR_SETORES, { recursive: true });
  const t = ARQ + ".tmp"; writeFileSync(t, JSON.stringify(d, null, 1)); renameSync(t, ARQ);
}
const semAc = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => semAc(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const sigla = nome => semAc(nome).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "OBR";
const quem = u => (u && (u.nome || u.usuario)) || "?";

/** A lista viva que os módulos importam (OBRAS_DOCS). É sempre o MESMO array: atualizado no lugar a cada pedido. */
export const OBRAS_DOCS = [];
export function atualizarObras() {
  const nova = ler().obras.filter(o => o.id && !o.removido).map(o => ({ id: o.id, nome: o.nome, sigla: o.sigla || sigla(o.nome) }));
  OBRAS_DOCS.splice(0, OBRAS_DOCS.length, ...nova);
  return OBRAS_DOCS;
}

export const listarObras = () => ler().obras.map(o => ({ id: o.id, nome: o.nome, spe: o.spe || "", cnpj: o.cnpj || "", projetoNovo: !!o.projetoNovo, ativa: !o.removido, criadoEm: o.criadoEm || "" }));

export function salvarObra(campos, por) {
  const d = ler(), id = String(campos.id || "");
  const nome = String(campos.nome || "").trim().slice(0, 80);
  if (!nome) return { erro: "Preencha o nome da obra." };
  const spe = String(campos.spe || "").trim().slice(0, 120), cnpj = String(campos.cnpj || "").trim().slice(0, 20);
  const projetoNovo = String(campos.projetoNovo || "") === "1";
  if (d.obras.some(o => o.id !== id && semAc(o.nome).toLowerCase() === semAc(nome).toLowerCase())) return { erro: `Já existe uma obra chamada ${nome}.` };
  if (id) {
    const o = d.obras.find(x => x.id === id); if (!o) return { erro: "Obra não encontrada." };
    (o.alteracoes ||= []).push({ em: agoraLocalISO(), por: quem(por), antes: { nome: o.nome, spe: o.spe, cnpj: o.cnpj, projetoNovo: !!o.projetoNovo } });
    Object.assign(o, { nome, spe, cnpj, projetoNovo });
    gravar(d); atualizarObras(); return { ok: `Obra ${nome} salva.` };
  }
  let novoId = slug(nome) || "obra", n = 2; const base = novoId;
  while (d.obras.some(o => o.id === novoId)) novoId = `${base}-${n++}`;
  d.obras.push({ id: novoId, nome, sigla: sigla(nome), spe, cnpj, projetoNovo, ficha: {}, pastas: {}, criadoEm: agoraLocalISO(), criadoPor: quem(por) });
  gravar(d); atualizarObras(); return { ok: `Obra ${nome} cadastrada.` };
}
export function ativarObra(id, ativa, por) {
  const d = ler(), o = d.obras.find(x => x.id === id); if (!o) return { erro: "Obra não encontrada." };
  if (ativa) delete o.removido; else o.removido = { por: quem(por), em: agoraLocalISO() };
  gravar(d); atualizarObras(); return { ok: `Obra ${o.nome} ${ativa ? "reativada" : "desativada"}.` };
}
