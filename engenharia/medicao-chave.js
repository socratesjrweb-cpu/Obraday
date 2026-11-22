// medicao-chave.js — QUAL versão das Medições o painel de Engenharia abre (03/11/2026).
//
//   true  → a versão NOVA (/obras/medicao): obra em estrutura e modelos, folha de medição em grade, boletim do mês,
//           cadastro único de empreiteiros e o dashboard. É a que vale desde 04/11/2026.
//   false → a versão ANTERIOR (/obras/medicoes). Os arquivos dela continuam aqui (a nova lê os dados de lá para trazer as
//           obras), mas o botão para ela saiu da tela em 04/11. Voltar de vez = o Git (etiqueta "medicoes-antes-da-nova").
export const MEDICAO_NOVA = true;

// ENVIO DO BOLETIM AO EMPREITEIRO: DESLIGADO até o e-mail/WhatsApp estar configurado. Com false, o passo 4 do boletim ("Compartilhar PDF": WhatsApp, e-mail e
// compartilhar pelo aparelho) não aparece e o servidor recusa o envio. Tudo continua pronto no código (medicao-telas.js:
// envioBotoes, mandarAoEmpreiteiro, mensagemBoletim): para religar, é só trocar para true.
export const ENVIO_BOLETIM = false;

// APROVAÇÃO DA DIRETORIA (12/11/2026): DESLIGADA. O boletim aprovado pelo Gerente de
// Engenharia já fica APROVADO (versão congelada, impressão, assinatura). A Diretoria continua podendo aprovar e devolver.
// Boletim que já estava "aguardando Diretoria" é aprovado normalmente (pelo Gerente ou pela Diretoria). true = volta a 2ª etapa.
export const ETAPA_DIRETORIA = false;
