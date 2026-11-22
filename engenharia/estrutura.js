// estrutura.js — a ESTRUTURA DO EMPREENDIMENTO, num lugar só (22/11/2026).
//
// Grupos (torre, bloco, embasamento…), pavimentos (em ordem física, de baixo para cima) e locais de cada pavimento
// (apartamentos, áreas comuns, fachadas…). É cadastrada no painel da obra (empreendimentos.js) e usada pelas outras
// áreas: a Medição lê e grava aqui (medicao-dados.js), a Medição Contratos usa para replicar serviços.
//
// Os ids são os mesmos da Medição ("pv-…", "lc-…", "gr-…"), então os serviços, boletins e medições que apontam
// para um local continuam apontando para ele. A primeira leitura de uma obra que já tinha estrutura na Medição
// traz essa estrutura para cá (medicao-dados.js → lerObra). Nada é apagado: remover marca "removido".
// Arquivo: dados/setores/estrutura/obra-<id>.json
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DIR_SETORES, agoraLocalISO } from "../ponte-engenharia.js";

const PASTA = join(DIR_SETORES, "estrutura");
const OBRA_OK = o => /^[a-z0-9-]{1,60}$/.test(String(o || ""));
const arq = obra => join(PASTA, `obra-${obra}.json`);
const quem = u => (u && (u.nome || u.usuario)) || "sistema";

/** A estrutura gravada da obra, ou null se ainda não existe. */
export function lerEstrutura(obra) {
  if (!OBRA_OK(obra)) return null;
  let E; try { E = JSON.parse(readFileSync(arq(obra), "utf8")); } catch { return null; }
  E.grupos ||= []; E.pavimentos ||= []; E.locais ||= []; E.historico ||= [];
  return E;
}
/** A estrutura da obra, criando vazia se ainda não existe (não grava). */
export const estruturaOuVazia = obra => lerEstrutura(obra) || { obra, grupos: [], pavimentos: [], locais: [], historico: [] };
export const existeEstrutura = obra => OBRA_OK(obra) && existsSync(arq(obra));

/** Grava a estrutura com a linha do histórico (quem, quando, o quê). */
export function gravarEstrutura(obra, E, user, texto) {
  if (!OBRA_OK(obra)) throw new Error("obra inválida");
  if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true });
  const G = { obra, grupos: E.grupos || [], pavimentos: E.pavimentos || [], locais: E.locais || [], historico: [...((lerEstrutura(obra) || {}).historico || [])] };
  if (texto) G.historico.push({ em: agoraLocalISO(), por: quem(user), txt: texto });
  if (G.historico.length > 2000) G.historico = G.historico.slice(-2000);
  const t = arq(obra) + ".tmp"; writeFileSync(t, JSON.stringify(G, null, 1)); renameSync(t, arq(obra));
  return G;
}

/** Vivos e em ordem: grupos e pavimentos de baixo para cima; locais na ordem do pavimento. */
export function vivos(E) {
  const grupos = E.grupos.filter(g => !g.removido).sort((a, b) => a.ordem - b.ordem);
  const pavimentos = E.pavimentos.filter(p => !p.removido).sort((a, b) => a.ordem - b.ordem);
  const locais = E.locais.filter(l => !l.removido && pavimentos.some(p => p.id === l.pav)).sort((a, b) => a.ordem - b.ordem);
  return { grupos, pavimentos, locais };
}

/** Para as outras áreas: pavimentos de baixo para cima, com o grupo e os locais de cada um. */
export function resumoEstrutura(obra) {
  const E = lerEstrutura(obra); if (!E) return null;
  const V = vivos(E), gnome = Object.fromEntries(V.grupos.map(g => [g.id, g.nome])), gord = Object.fromEntries(V.grupos.map(g => [g.id, g.ordem]));
  return V.pavimentos.slice().sort((a, b) => (gord[a.grupo] ?? 999) - (gord[b.grupo] ?? 999) || a.ordem - b.ordem)
    .map(p => ({ id: p.id, nome: p.nome, grupo: gnome[p.grupo] || "", locais: V.locais.filter(l => l.pav === p.id).map(l => l.nome) }));
}
