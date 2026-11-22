// config.js — lê o config.json da raiz do sistema (nome, cores, porta, e-mail).
// Tudo tem valor padrão: o sistema sobe mesmo sem o arquivo.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const PADRAO = {
  marca: {
    nome: "Gestão de Obras",       // aparece no topo, no login e nos PDFs
    sufixo: "ENGENHARIA",          // linha pequena embaixo do nome
    slogan: "",                    // frase do rodapé e do login (vazio = não mostra)
    empresa: "Minha Construtora",  // nome da empresa nos boletins e relatórios
    logo: "",                      // ex.: "/assets/logo.png" (vazio = só o nome em texto)
    cores: { escuro: "#0f172a", acento: "#2563eb", acentoClaro: "#93c5fd", acentoEscuro: "#1e40af", fundo: "#f5f7fa" },
  },
  servidor: { porta: 4700, host: "127.0.0.1", https: false },
  dados: "dados",                   // pasta dos dados (relativa à raiz)
  email: { host: "", porta: 465, seguro: true, usuario: "", remetente: "" },   // a senha fica na variável de ambiente SMTP_SENHA
};

const junta = (a, b) => {
  const r = { ...a };
  for (const k of Object.keys(b || {})) r[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? junta(a[k] || {}, b[k]) : b[k];
  return r;
};

const arq = join(RAIZ, "config.json");
let lido = {};
if (existsSync(arq)) {
  try { lido = JSON.parse(readFileSync(arq, "utf8")); }
  catch (e) { console.error("⚠️  config.json com erro — usando o padrão:", e.message); }
}
export const CONFIG = junta(PADRAO, lido);
// para testes: DADOS e PORTA no ambiente trocam a pasta de dados e a porta sem mexer no config.json
if (process.env.DADOS) CONFIG.dados = process.env.DADOS;
if (process.env.PORTA) CONFIG.servidor.porta = Number(process.env.PORTA);
export const DIR_DADOS = isAbsolute(CONFIG.dados) ? CONFIG.dados : join(RAIZ, CONFIG.dados);
