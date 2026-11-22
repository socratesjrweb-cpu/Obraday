# O que falta para o sistema ficar totalmente operante

Situação em 19/11/2026. O sistema **já roda** no computador (`node server.js`): login, perfis, Administração (usuários e obras) e as três áreas, que são Medições, Projetos e Documentos & Incorporações. O teste automático (`npm run conferir`) abre todas as telas com cada perfil sem erro.

O que falta é **colocar no ar**, **ligar os serviços externos**, **testar os fluxos de ponta a ponta** e **fazer os cadastros iniciais**. A lista abaixo está em ordem de prioridade.

---

## 1. Guardar o código no GitHub (obrigatório)

- [ ] Criar um repositório **privado** no GitHub (sugestão: `gestao-obras`).
- [ ] Enviar o código: `git remote add origin …` e depois `git push -u origin main`.
- [ ] Conferir que **não** subiram a pasta `dados/` nem o `config.json` (o `.gitignore` já barra os dois).
- [ ] Nas configurações do repositório, deixar ligados o *Secret scanning* e o *Push protection*.

**Regra daqui em diante:** toda mudança passa pelo `npm run conferir` antes do `git push`.

## 2. Hospedagem (obrigatório)

O sistema precisa de um computador ligado 24 horas e acessível pela internet.

- [ ] **Contratar um servidor (VPS).** O mínimo é 1 vCPU, 2 GB de RAM e 40 GB de disco. Faixa de preço: R$ 30 a 60 por mês (Hostinger, Contabo, DigitalOcean, Hetzner, Magalu Cloud…). Escolha Ubuntu 24.04.
  - Cresça o disco conforme os anexos aumentarem. PDFs de prancha e IFC ocupam bastante espaço.
- [ ] **Registrar um domínio ou subdomínio**, por exemplo `obras.suaempresa.com.br`, e apontar o DNS (registro A) para o IP do servidor.
- [ ] **Instalar no servidor:** Node 20 ou mais novo, Git e Caddy (que faz o HTTPS sozinho).
- [ ] **Clonar o repositório** em `/opt/gestao-obras` e criar o `config.json` a partir do `config.exemplo.json`, com:
  - `"servidor": { "porta": 4700, "host": "127.0.0.1", "https": true }`
  - nome, empresa, cores e logo da marca.
- [ ] **Caddy** (`/etc/caddy/Caddyfile`):
  ```
  obras.suaempresa.com.br {
    reverse_proxy 127.0.0.1:4700
    request_body {
      max_size 450MB
    }
  }
  ```
- [ ] **Serviço do sistema** (systemd), para ele subir sozinho e reiniciar se cair. Arquivo `/etc/systemd/system/gestao-obras.service`:
  ```ini
  [Unit]
  Description=Gestão de Obras
  After=network.target

  [Service]
  WorkingDirectory=/opt/gestao-obras
  ExecStart=/usr/bin/node server.js
  Restart=always
  User=obras
  Environment=TZ=America/Sao_Paulo
  Environment=SMTP_SENHA=coloque-aqui
  Environment=NODE_ENV=production

  [Install]
  WantedBy=multi-user.target
  ```
  - **`TZ=America/Sao_Paulo` é obrigatório.** O sistema usa a hora local para datas de boletim, prazos e históricos, e servidores costumam vir em UTC (3 horas adiantado).
  - Rode com um usuário próprio (`obras`), não com o root.
- [ ] **Firewall:** abrir só as portas 22 (SSH), 80 e 443. A 4700 fica fechada para fora.
- [ ] **Primeiro acesso:** pegar a senha provisória em `dados/sistema/PRIMEIRO-ACESSO.txt` no servidor e trocá-la.

**Como atualizar depois:** no servidor, `git pull` e depois `sudo systemctl restart gestao-obras`.

## 3. Backup (obrigatório, antes de lançar dados reais)

Tudo o que o sistema guarda está na pasta `dados/`: usuários, obras, medições, boletins aprovados, assinaturas, pranchas e fotos. **Sem backup, um disco perdido apaga tudo.**

- [ ] Fazer um backup **diário** de `dados/` para **fora do servidor**. Opções:
  - `restic` ou `rclone` para Backblaze B2, Google Drive ou outro VPS (custa centavos por GB);
  - o snapshot automático do próprio provedor (cômodo, mas fica no mesmo provedor).
- [ ] Guardar pelo menos 30 dias de cópias.
- [ ] Criptografar o backup. Ele tem CPF/CNPJ de empreiteiros e assinaturas.
- [ ] **Testar a restauração** uma vez: subir uma cópia em outra pasta com `DADOS=/caminho node server.js` e conferir.

## 4. E-mail (necessário para avisos e envio de boletim)

Sem e-mail o sistema funciona, mas os avisos ficam "aguardando o servidor": revisão de prancha, alvará vencendo, pedido de plotagem e boletim ao empreiteiro.

- [ ] Criar uma conta de envio, por exemplo `sistema@suaempresa.com.br`, no provedor de e-mail da empresa, ou num serviço transacional (Brevo, Amazon SES, Mailgun).
- [ ] Preencher `email` no `config.json` (host, porta 465 com `seguro: true` ou 587 com `seguro: false`, usuário e remetente).
- [ ] Pôr a senha **só** na variável `SMTP_SENHA` (no serviço do systemd), nunca no `config.json` nem no Git.
- [ ] No DNS do domínio, configurar **SPF** e **DKIM** (o provedor mostra os registros). Sem isso os e-mails caem no spam.
- [ ] Testar: cadastrar um contato em Projetos › 📣 Avisos e liberar uma prancha.
- [ ] **Ligar o envio do boletim ao empreiteiro:** em `engenharia/medicao-chave.js`, trocar `ENVIO_BOLETIM = false` por `true`.

## 5. Cadastros iniciais (antes de liberar para a equipe)

- [ ] **Marca:** logo em `assets/logo.png` e `"logo": "/assets/logo.png"` no `config.json`; nome, empresa e cores.
- [ ] **Obras:** em ⚙️ Administração.
- [ ] **Usuários:** um por pessoa, com o perfil certo. Para o Engenheiro, marque as obras dele; para o Externo (projetista), as obras que ele vê.
- [ ] **Medições:**
  - [ ] Cadastro geral de serviços (Medições › Serviços): tipo, serviço, unidade e critério de medição.
  - [ ] Em cada obra: "Começar do zero" e montar a estrutura (grupos, pavimentos, locais e quantidades).
  - [ ] Preço de cada serviço por obra, com data de início.
  - [ ] Cadastro de empreiteiros (com CPF/CNPJ, WhatsApp, e-mail e "funcionário próprio"), habilitados nas obras.
- [ ] **Projetos:** listas de pavimentos e locais, tipos de prancha (e quais exigem carimbo), projetistas por obra × disciplina, contatos dos avisos.
- [ ] **config.json:** `plotadores` (quem recebe os pedidos de plotagem) e `municipios` (prefeituras: validade do alvará e documentos para renovar).

## 6. Testar os fluxos de ponta a ponta (com dados de teste)

O teste automático confere que as telas abrem; ele **não** percorre os fluxos. Antes de usar de verdade, faça cada um destes caminhos uma vez, de preferência no celular também:

**Medições**
- [ ] Lançar medição na grade (com fotos e com extra) → o boletim do empreiteiro aparece no mês.
- [ ] Enviar para aprovação → o Gerente aprova → o PDF sai com carimbo e código de conferência.
- [ ] Devolver um boletim com motivo → corrigir → reenviar.
- [ ] Assinatura do empreiteiro com o dedo (no celular) → o PDF assinado sai.
- [ ] "Habilitar edição" num boletim aprovado (revoga e recomeça o fluxo).
- [ ] Quantidade real alterada pelo Engenheiro → vai para aprovação → decidida.
- [ ] Excluir um boletim do mês, e ver em "Boletins excluídos".
- [ ] Painel do RH: o mês, os totais e "falta assinatura".
- [ ] Entrar como Engenheiro: vê só as obras dele e não aprova.

**Projetos (pranchas)**
- [ ] Enviar uma prancha (e um lote) → nome no padrão → liberar para a obra.
- [ ] Enviar uma revisão nova → a anterior fica obsoleta depois da liberação.
- [ ] Abrir o PDF baixado e ler o **QR** no celular **sem login** → "PRANCHA VÁLIDA" / "DESATUALIZADA".
- [ ] Chat da prancha com marcação e tarefa delegada com prazo.
- [ ] Compatibilização 2D (sobrepor duas disciplinas e registrar um clash).
- [ ] Pedido de plotagem → plotada → entrega assinada.
- [ ] Entrar como Externo (projetista): só as obras marcadas; não libera nem remove.

**Documentos & Incorporações**
- [ ] Ficha técnica (com o endereço contendo a cidade do `config.json`).
- [ ] Anexar alvará com data de emissão → o vencimento é calculado → a lista de renovação aparece.
- [ ] Documentos da obra e andamento da incorporação.

Anote o que der errado e corrija antes de chamar a equipe.

## 7. Pendências de funcionalidade (conhecidas)

| Item | Situação | O que fazer |
|---|---|---|
| **Modelo 3D (IFC)** | Tela pronta; falta a biblioteca | No seu computador: `npm i three web-ifc esbuild`, um arquivo de entrada que exporte `{ THREE, WEBIFC }` e `npx esbuild entrada.js --bundle --minify --format=iife --global-name=ENG3D --outfile=assets/engenharia-3d-2026-11.global.min.js`. Copie também `web-ifc.wasm` (e `web-ifc-mt.wasm`) de `node_modules/web-ifc/` para `assets/`. Teste enviando um IFC |
| **IFC grande na memória** | O envio é lido inteiro na memória (até 400 MB) | Com 2 GB de RAM, evite dois envios grandes ao mesmo tempo, ou adapte `nucleo/upload.js` para gravar direto em disco |
| **WhatsApp** | Não implementado (só e-mail) | WhatsApp Cloud API da Meta: número próprio, conta Business verificada e **modelo de mensagem aprovado** (o texto já existe em `mensagemBoletim`). O token vai numa variável de ambiente; implementar o canal `whatsapp` em `ponte-engenharia.js` |
| **Importar planilha .xlsm** | Espera o formato da planilha antiga | Decidir: tirar o botão, ou adaptar `engenharia/medicao-planilha.js` ao seu modelo de planilha |
| **Esqueci a senha** | Só o admin gera senha provisória (Administração › Nova senha) | Opcional: recuperação por e-mail, depois do item 4 |
| **Aprovação em 2 etapas** | Hoje só o Gerente aprova | Se quiser a Diretoria como 2ª etapa: `ETAPA_DIRETORIA = true` em `engenharia/medicao-chave.js` |
| **Restos da Medição antiga** | `medicoes-gravar.js` ainda guarda regras de aprovação usadas pela nova | Limpeza de código, sem efeito na tela; fazer com calma |

## 8. Segurança e LGPD

- [ ] HTTPS ligado (Caddy) e `"https": true` no `config.json`.
- [ ] Senhas fortes; desativar na hora quem sair da empresa (Administração › Desativar).
- [ ] O sistema guarda **dados pessoais**: CPF/CNPJ, telefone, e-mail e assinatura dos empreiteiros, além de fotos. Registre para que servem, quem acessa e por quanto tempo ficam. Avise os empreiteiros, e o backup fica criptografado (item 3).
- [ ] Manter o Ubuntu e o Node atualizados (`sudo apt upgrade`, uma vez por mês).
- [ ] Monitorar se o site está no ar (UptimeRobot ou Healthchecks.io, grátis) com aviso por e-mail.
- [ ] Logs: `journalctl -u gestao-obras` mostra os erros do servidor.

## 9. Depois de funcionando (melhorias)

- Dashboard geral com todas as obras.
- Previsto × medido por serviço.
- Aviso por e-mail de boletim parado na fila ou devolvido.
- Quantidade medida por mês por empreiteiro.
- A Estrutura da Medição carregar por pavimento, se ficar lenta em obras grandes.

---

## Resumo em ordem

1. GitHub privado.
2. VPS + domínio + Caddy + serviço (com `TZ=America/Sao_Paulo`).
3. Backup diário fora do servidor, testado.
4. E-mail (SMTP + SPF/DKIM) e `ENVIO_BOLETIM = true`.
5. Cadastros iniciais.
6. Teste de todos os fluxos com dados de teste.
7. Liberar para a equipe.
8. Depois: 3D, WhatsApp e melhorias.
