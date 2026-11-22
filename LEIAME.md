# Gestão de Obras — Engenharia

Sistema web com três áreas:

| Área | Endereço | O que faz |
|---|---|---|
| **Medições** | `/obras/medicao` | Estrutura da obra (pavimentos, locais e serviços), lançamento, boletim do mês por empreiteiro, aprovação, assinatura com o dedo, PDF e Painel do RH |
| **Projetos** | `/documentos` | Pranchas com nomenclatura, revisões, liberação para a obra, chat, compatibilização 2D/3D, plotagens, QR de validade, materiais e acabamentos |
| **Documentos & Incorporações** | `/projetos` | Ficha técnica, alvarás (com vencimento), documentos da obra e andamento da incorporação |

Não tem nenhuma dependência: só o **Node 20 ou mais novo**. Os dados ficam em arquivos JSON e os anexos numa pasta, as duas dentro de `dados/`.

## Rodar no computador

```powershell
node server.js
```

Depois abra http://localhost:4700.

**Primeiro uso:** o sistema cria o usuário `admin` (perfil Diretoria) e grava a senha provisória em `dados/sistema/PRIMEIRO-ACESSO.txt`. No primeiro acesso ele pede uma senha nova, e o arquivo se apaga sozinho. Em seguida:

1. Vá em **⚙️ Administração** e cadastre as **obras**.
2. Crie os **usuários**. O sistema mostra uma senha provisória uma vez só; passe para a pessoa.

## Configuração (`config.json`)

Copie `config.exemplo.json` para `config.json` e ajuste. Tudo é opcional: sem o arquivo, valem os padrões.

- **marca**: nome, empresa (sai nos boletins), slogan, logo (ponha o arquivo em `assets/` e escreva `"/assets/logo.png"`) e cores.
- **servidor**: porta e endereço. Use `"https": true` quando estiver atrás de HTTPS (o cookie passa a ser só seguro).
- **email**: servidor SMTP para os avisos (boletim, revisão de prancha, alvarás, plotagem). **A senha não vai no arquivo**: fica na variável de ambiente `SMTP_SENHA`. Sem e-mail configurado, os avisos ficam registrados como "aguardando".
- **plotadores**: quem recebe os pedidos de plotagem.
- **municipios**: prefeituras do vencimento de alvará (validade e lista de documentos para a renovação). A cidade da obra é reconhecida pelo endereço da ficha técnica.

O `config.json` e a pasta `dados/` **não vão para o Git**.

## Perfis

| Perfil | O que pode |
|---|---|
| Diretoria | tudo, inclusive a Administração |
| Gerente de Engenharia | aprova boletins, libera pranchas e gere a medição |
| Administrador | gere a medição e as listas e libera pranchas |
| Engenheiro | lança medição só nas obras marcadas e vê as pranchas liberadas |
| RH | só o Painel do RH e os PDFs dos boletins |
| Externo | projetista de fora: só Projetos, só as obras marcadas |

## Conferir antes de publicar

```powershell
npm run conferir
```

Confere a sintaxe de todos os arquivos e sobe o sistema numa pasta de dados **temporária**. Depois entra com cada perfil e abre todas as telas (os dados de verdade não são tocados). Para barrar palavras no código, passe uma lista em `PROIBIDAS` (separada por vírgula).

## Pendências conhecidas

- **Modelo 3D (IFC):** a tela está pronta, mas precisa da biblioteca `assets/engenharia-3d-2026-11.global.min.js` (three.js + web-ifc gerados em formato IIFE com `--global-name=ENG3D`) e de `web-ifc.wasm` em `assets/`.
- **WhatsApp:** ainda não implementado (o boletim e os avisos saem por e-mail).
- **Importar planilha (.xlsm) na Medição:** espera o leiaute de planilha antigo (pavimentos, serviços e meses). Para obras novas, comece do zero pela tela.

## Colocar na internet

1. Um servidor (VPS) com Node 20+.
2. Clone o repositório, crie o `config.json` e rode `node server.js` como serviço (systemd ou pm2), com `"host": "127.0.0.1"`.
3. Na frente, o **Caddy** com o seu domínio. Ele faz o HTTPS sozinho:
   ```
   obras.suaempresa.com.br {
     reverse_proxy 127.0.0.1:4700
   }
   ```
4. No `config.json`, `"https": true`.
5. **Backup diário da pasta `dados/`** (é lá que está tudo).
