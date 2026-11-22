// brand.js — identidade visual do sistema e moldura das páginas.
// Nome, cores e logo vêm do config.json (ver nucleo/config.js); nenhuma marca fica escrita aqui.
import { CONFIG } from "./config.js";

const M = CONFIG.marca, C = M.cores;
export const MARCA = { nome: M.nome, sufixo: M.sufixo, slogan: M.slogan, empresa: M.empresa };

export const CSS = `
:root{
  --escuro:${C.escuro}; --escuro2:color-mix(in srgb,${C.escuro} 88%,#fff); --escuro3:color-mix(in srgb,${C.escuro} 78%,#fff);
  --acento:${C.acento}; --acento-claro:${C.acentoClaro}; --acento-escuro:${C.acentoEscuro};
  --branco:#FFFFFF; --fundo:${C.fundo}; --linha:#2a2a31;
  --texto:#1a1a1d; --mut:#8a8a93; --mut-claro:#b9b9c2;
  --ok:#3fb27f; --alerta:#e2b53f;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--texto);background:var(--fundo);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.acento{color:var(--acento)}
/* ===== marca em texto (topo do app) ===== */
.wordmark{font-weight:800;letter-spacing:.5px;font-size:20px;color:#fff}
.wordmark .dot{color:var(--acento)}
.wordmark small{display:block;font-size:9.5px;letter-spacing:4px;color:var(--mut-claro);font-weight:600;margin-top:-2px}
/* ===== LOGIN ===== */
.login-bg{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:radial-gradient(1200px 600px at 50% -10%,color-mix(in srgb,var(--acento) 22%,transparent),transparent 60%),radial-gradient(800px 500px at 50% 120%,color-mix(in srgb,var(--acento) 10%,transparent),transparent 60%),var(--escuro);
  padding:24px}
.login-card{width:100%;max-width:390px;background:#fff;border-radius:20px;padding:34px 30px 30px;
  box-shadow:0 30px 80px rgba(0,0,0,.55);border-top:5px solid var(--acento);position:relative}
.login-nome{text-align:center;font-size:22px;font-weight:800;color:var(--escuro);margin:2px 0 6px}
.login-card .logo{display:block;width:190px;max-width:75%;margin:2px auto 6px}
.login-card h1{font-size:15px;text-align:center;color:#111;font-weight:700;margin-bottom:2px}
.login-card .sub{text-align:center;color:var(--mut);font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:22px}
.campo{margin-bottom:14px}
.campo label{display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:6px}
.campo input{width:100%;padding:12px 14px;border:1.5px solid #e3e0d6;border-radius:11px;font-size:15px;background:#fbfaf6;transition:.15s}
.campo input:focus{outline:none;border-color:var(--acento);background:#fff;box-shadow:0 0 0 4px color-mix(in srgb,var(--acento) 15%,transparent)}
.btn{width:100%;border:0;border-radius:11px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;
  background:linear-gradient(135deg,var(--acento-claro),var(--acento) 45%,var(--acento-escuro));color:#fff;
  box-shadow:0 8px 20px color-mix(in srgb,var(--acento) 35%,transparent);transition:.15s}
.btn:hover{filter:brightness(1.05);transform:translateY(-1px)}
.btn.dark{background:var(--escuro2);color:#fff;box-shadow:none}
.erro{background:#fdeaea;border:1px solid #f3c4c4;color:#b23b3b;font-size:13px;padding:10px 12px;border-radius:10px;margin-bottom:14px;text-align:center}
.aviso{background:#fdf7e6;border:1px solid #f0dfa8;color:#8a6d1e;font-size:12.5px;padding:10px 12px;border-radius:10px;margin-bottom:14px;text-align:center}
.slogan{color:var(--acento-claro);font-size:15px;font-weight:600;letter-spacing:.3px}
.login-foot{color:#6a6a72;font-size:11px;letter-spacing:1.5px;text-transform:uppercase}
/* ===== APP shell ===== */
.topbar{background:var(--escuro);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:12px 22px;position:sticky;top:0;z-index:20;border-bottom:1px solid #26262d}
.topbar .right{display:flex;align-items:center;gap:14px}
.userchip{display:flex;align-items:center;gap:9px;background:#1c1c22;border:1px solid #2c2c34;border-radius:999px;padding:5px 6px 5px 13px}
.userchip .nm{font-size:13px;font-weight:600}
.userchip .av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--acento),var(--acento-escuro));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
.sair{color:var(--mut-claro);font-size:12.5px;font-weight:600;border:1px solid #2c2c34;border-radius:8px;padding:7px 12px}
.sair:hover{color:#fff;border-color:var(--acento)}
.wrap{max-width:1080px;margin:0 auto;padding:26px 22px 60px}
.hello{margin:6px 0 4px;font-size:24px;font-weight:800;color:#15151a}
.hello b{color:var(--acento-escuro)}
.hoje{color:var(--mut);font-size:13.5px;margin-bottom:22px}
/* ===== cabeçalho de página (padrão para os setores) ===== */
.pg{margin:0 0 22px}
.pg-volta{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#6a6a72;
  margin-bottom:15px;padding:6px 13px;border:1px solid #e6e2d6;border-radius:999px;background:#fff;transition:.15s}
.pg-volta:hover{border-color:var(--acento);color:var(--acento-escuro);background:#fffdf7}
.pg-volta .seta{font-size:13px;line-height:1}
.pg h1{font-size:21px;font-weight:700;letter-spacing:-.25px;color:#15151a;display:flex;align-items:baseline;gap:10px;margin:0}
.pg h1 .ic{font-size:17px;opacity:.8}
.pg .sub{margin-top:7px;font-size:13px;line-height:1.55;color:var(--mut);max-width:76ch;font-weight:400}
.pg .fio{height:2px;width:40px;background:var(--acento);border-radius:2px;margin-top:14px}
/* ===== selos de situação — padrão comum a todos os setores ===== */
.selo{display:inline-block;margin-top:5px;padding:2px 9px;border-radius:999px;font-size:9.5px;font-weight:700;
  letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.sl-vermelho{background:#fbe9e9;color:#b03a3a}
.sl-amarelo{background:#fdf3d8;color:#8a6d1e}
.sl-azul{background:#e8f0fa;color:#2f6db0}
.sl-verde{background:#e8f2e2;color:#2f7d55}
.sl-cinza{background:#f0efe9;color:#6a6a72}
/* etiqueta de documentação, no fim da linha */
.doc-ok{background:#e8f2e2;color:#2f7d55;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}
.doc-falta{background:#fbe9e9;color:#b03a3a;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}
/* meio do caminho: um documento anexado, falta o outro. Amarelo para não parecer nem pronto nem vazio. */
.doc-meio{background:#fdf3d8;color:#8a6d1e;padding:3px 9px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap}
.doc-legenda{display:flex;gap:10px 22px;flex-wrap:wrap;align-items:center;font-size:11.5px;color:var(--mut);margin:8px 0 10px}
.doc-legenda .lg-g{display:inline-flex;align-items:center;gap:6px}
.doc-legenda .lg-g b{color:#4a4a52;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.doc-legenda .lg-g i{font-style:normal;font-weight:700;color:#3a3a42;margin-right:6px}
.doc-legenda .lg-nota{color:#8a8a93;font-style:italic}
.doc-legenda span.b{font-weight:700}
/* selo de PDF ao lado do anexo: mostra de olho que ali tem arquivo */
.pdf-sel{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #f0d5d5;border-radius:7px;
  padding:2px 7px 2px 5px;font-size:10px;font-weight:800;color:#b03a3a;letter-spacing:.03em;white-space:nowrap}
.pdf-sel svg{display:block}
.arq-pdf{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid #ecd2d2;border-radius:11px;padding:7px 12px 7px 9px;color:#1a1a1d;text-decoration:none;font-size:12.5px;font-weight:700;line-height:1.2;max-width:100%}
.arq-pdf:hover{border-color:#b03a3a;background:#fff8f8;box-shadow:0 4px 12px rgba(176,58,58,.10)}
.arq-pdf svg{flex:none}.arq-pdf small{display:block;font-weight:500;font-size:10.5px;color:var(--mut);margin-top:1px}
.arq-pdf .ab{margin-left:6px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#b03a3a}
.arq-lista{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.arq-vazio{font-size:12px;color:var(--mut);margin-bottom:8px}
/* o botão "escolher arquivo" do navegador, com a cara do sistema (vale para todos os setores) */
input[type=file]{font-size:12px;color:var(--mut)}
input[type=file]::file-selector-button{font:inherit;font-size:12px;font-weight:700;color:#5a4e2e;background:#fff;border:1px solid #d9d2bb;border-radius:8px;padding:6px 12px;margin-right:10px;cursor:pointer}
input[type=file]::file-selector-button:hover{border-color:var(--acento);color:var(--acento-escuro)}
/* barra de ações da página — evita que botão de largura total atropele a linha seguinte */
.pg-acoes{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:0 0 18px}
.pg-acoes .dica{font-size:12px;color:var(--mut);flex:1;min-width:200px}
.secao{margin:30px 0 12px;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#8a8a93;display:flex;align-items:center;gap:10px}
.secao::after{content:"";flex:1;height:1px;background:#e6e2d6}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:14px}
.card{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:18px;transition:.15s;position:relative;overflow:hidden;display:block}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--acento);opacity:.9}
.card:hover{transform:translateY(-3px);box-shadow:0 14px 30px rgba(20,20,25,.10);border-color:#e1d9c0}
.card .ic{font-size:26px;display:block;margin-bottom:10px}
.card h3{font-size:15.5px;color:#17171b;margin-bottom:3px}
.card p{font-size:12.5px;color:var(--mut);line-height:1.45}
.tag{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 9px;border-radius:999px;margin-top:11px}
.tag.pronto{background:#e9f7f0;color:#1f8a5b;border:1px solid #b6e6cf}
.tag.breve{background:#f3f1e8;color:#9a8a55;border:1px solid #e3ddc6}
.tag.master{background:#fbf3dd;color:#8a6d1e;border:1px solid #efdfa6}
.card.disabled{opacity:.45}
.card.disabled:hover{transform:none;box-shadow:none}
.card-vermelho{background:#fbe4e4;border-color:#eab0b0}
.card-vermelho::before{background:#d64545;opacity:1;width:5px}
.card-verde{background:#daf1e4;border-color:#9ad6b6}
.card-verde::before{background:#2fa06a;opacity:1;width:5px}
.foot{max-width:1080px;margin:30px auto 0;padding:16px 22px;color:var(--mut);font-size:11.5px;display:flex;justify-content:space-between;border-top:1px solid #e6e2d6}
.foot b{color:var(--acento-escuro)}
/* lista de relatórios */
.rel{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:4px 6px;margin-top:6px}
.rel a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-radius:10px}
.rel a:hover{background:var(--fundo)}
.rel a+a{border-top:1px solid #f1eee3}
.rel .nm{font-weight:600;font-size:14.5px;color:#1a1a1d;display:flex;align-items:center;gap:11px}
.rel .nm .ic{font-size:19px}
.rel .meta{font-size:12px;color:var(--mut)}
.rel .abrir{color:var(--acento-escuro);font-weight:700;font-size:12.5px}
.voltar{display:inline-block;color:var(--mut);font-size:13px;font-weight:600;margin-bottom:14px}
.voltar:hover{color:var(--acento-escuro)}
.vazio{color:var(--mut);font-size:14px;background:#fff;border:1px dashed #ddd6c2;border-radius:14px;padding:26px;text-align:center}
/* admin: usuários */
.painel{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:18px 20px;margin-top:8px}
.painel h3{font-size:15px;margin-bottom:12px;color:#17171b}
.tab-u{width:100%;border-collapse:collapse;font-size:14px}
.tab-u th{text-align:left;font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);padding:8px 10px;border-bottom:2px solid #eee7d6}
.tab-u td{padding:11px 10px;border-bottom:1px solid #f2efe4;vertical-align:middle}
.tab-u tr:last-child td{border-bottom:0}
.badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 9px;border-radius:999px}
.badge.dir{background:#fbf3dd;color:#8a6d1e;border:1px solid #efdfa6}
.badge.ges{background:#e8f0fb;color:#3a5f97;border:1px solid #c4d7f0}
.badge.ope{background:#eef0ee;color:#5a6b5a;border:1px solid #d5ddd5}
.badge.on{background:#e9f7f0;color:#1f8a5b;border:1px solid #b6e6cf}
.badge.off{background:#f6eaea;color:#9a4a4a;border:1px solid #e6c4c4}
.tab-u td.v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.tab-u td.ck,.tab-u th.ck{text-align:center;white-space:nowrap}
.tab-u td.v.pos{color:#b23b3b}.tab-u td.v.neg{color:#1f8a5b}
.tab-u tr.tot td{font-weight:800;border-top:2px solid var(--acento);background:#fbf7ec}
.tab-u tr.so td{color:#b9b9c2}
.tab-u th.v{text-align:right}
.acoes{display:flex;gap:7px;flex-wrap:wrap}
.btn-sm{border:1px solid #e0d9c4;background:#fff;color:#5a4e2e;border-radius:8px;padding:6px 11px;font-size:12px;font-weight:600;cursor:pointer}
.btn-sm:hover{border-color:var(--acento);color:var(--acento-escuro)}
.btn-sm.danger{color:#9a4a4a;border-color:#e6c4c4}.btn-sm.danger:hover{border-color:#c96;color:#8a3a3a}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.form-grid .full{grid-column:1/-1}
.form-grid label{display:block;font-size:12px;font-weight:600;color:#444;margin-bottom:5px}
.form-grid input,.form-grid select{width:100%;padding:10px 12px;border:1.5px solid #e3e0d6;border-radius:10px;font-size:14px;background:#fbfaf6}
.form-grid input:focus,.form-grid select:focus{outline:none;border-color:var(--acento);background:#fff}
.chks{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:2px}
.chks label{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#333;margin:0}
.chks input{width:auto}
.msg{padding:10px 14px;border-radius:10px;font-size:13.5px;margin-bottom:12px}
.msg.ok{background:#e9f7f0;border:1px solid #b6e6cf;color:#1f7a52}
.msg.err{background:#fdeaea;border:1px solid #f3c4c4;color:#b23b3b}
.btn.inline{width:auto;padding:11px 22px;margin-top:2px}
@media(max-width:640px){.form-grid{grid-template-columns:1fr}.tab-u thead{display:none}.tab-u td{display:block;border:0;padding:4px 0}.tab-u tr{display:block;border-bottom:1px solid #eee;padding:10px 0}}
/* cartões de número */
.kpi{background:#fff;border:1px solid #ece8dc;border-radius:14px;padding:15px 16px;border-top:3px solid var(--acento)}
.kpi.dark{background:var(--escuro);border:1px solid #26262d;border-top:3px solid var(--acento)}
.kpi-lbl{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--mut)}
.kpi.dark .kpi-lbl{color:var(--acento-claro)}
.kpi-val{font-size:23px;font-weight:800;color:#15151a;margin-top:4px;letter-spacing:-.5px}
.kpi.dark .kpi-val{color:#fff}
.kpi-sub{font-size:11.5px;color:var(--mut);margin-top:2px}
.kpi.dark .kpi-sub{color:var(--mut-claro)}
.aud-nota{background:#fdf9ee;border:1px solid #efe2bf;border-left:4px solid var(--acento);border-radius:10px;padding:12px 15px;font-size:13px;color:#5f5330;margin:14px 0}
.aud-p{font-size:13.5px;color:#3a3a40;line-height:1.6;max-width:760px;margin:6px 0}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:6px}
.pcard{background:#fff;border:1px solid #ece8dc;border-radius:12px;padding:12px 14px}
.pcard .pl{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--acento-escuro)}
.pcard .pv{font-size:14px;color:#222;margin-top:3px}
table.dre{width:100%;border-collapse:collapse;font-size:14px}
table.dre td{padding:9px 12px;border-bottom:1px solid #f2efe4}
table.dre td.v{text-align:right;font-variant-numeric:tabular-nums;color:#15151a;font-weight:600}
table.dre td.v.neg{color:#b23b3b}
table.dre tr.forte td{background:#fbf7ec;font-weight:800;color:#15151a}
table.dre tr.forte td.v{color:#15151a}
table.dre tr:last-child td{border-bottom:0}
/* simulador */
.sim-wrap{display:grid;grid-template-columns:330px 1fr;gap:18px;margin-top:10px}
.sim-ctrls{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:16px 18px}
.sim-ctrls .cl{display:block;font-size:12.5px;font-weight:700;color:#3a3a40;margin:14px 0 6px}
.sim-ctrls .cl b{color:var(--acento-escuro);float:right;font-weight:800}
.sim-ctrls .cl-sub{font-size:11.5px;color:var(--mut);margin-top:3px}
.sim-ctrls input[type=range]{width:100%;accent-color:var(--acento);cursor:pointer}
.segs{display:flex;gap:6px;margin-top:4px}
.seg{flex:1;border:1.5px solid #e3e0d6;background:#fbfaf6;border-radius:9px;padding:8px 4px;font-size:12.5px;font-weight:700;color:#6a5e3a;cursor:pointer}
.seg.on{background:linear-gradient(135deg,var(--acento-claro),var(--acento));border-color:var(--acento);color:#fff}
.estrut{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.estrut>div{display:flex;align-items:center;gap:6px;font-size:12px;color:#555}
.estrut span{flex:1}
.estrut input{width:56px;padding:6px 8px;border:1.5px solid #e3e0d6;border-radius:8px;font-size:13px;background:#fbfaf6}
.somaEstrut{grid-column:1/-1;text-align:right;font-size:11.5px;font-weight:700}
.row{display:flex;gap:8px;align-items:center}
.row input[type=range]{flex:1}
.box{width:62px;padding:7px 8px;border:1.5px solid #e3e0d6;border-radius:8px;font-size:13px;background:#fbfaf6;text-align:right}
.box.wide{width:104px}
.box:focus{outline:none;border-color:var(--acento);background:#fff}
.estrut2{margin-top:10px;border:1px solid #efe7cf;border-radius:10px;padding:8px 12px;background:#fdfbf4}
.er{display:grid;grid-template-columns:96px 62px 8px 1fr;align-items:center;gap:6px;font-size:12px;color:#555;padding:6px 0;border-bottom:1px solid #f2ecda}
.er.er-val{grid-template-columns:96px 1fr}
.er:last-of-type{border-bottom:0}
.er>span:first-child{white-space:nowrap}
.er i{font-style:normal;color:var(--mut);text-align:center}
.er em{color:var(--acento-escuro);font-style:normal;font-weight:700;font-size:11px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.box2{width:100%;padding:6px;border:1.5px solid #e3e0d6;border-radius:8px;font-size:13px;background:#fbfaf6;text-align:right}
.box2:focus{outline:none;border-color:var(--acento);background:#fff}
.er .box.wide{width:100%}
.sim-out{display:flex;flex-direction:column;gap:12px}
.vpl3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.v3{background:#fff;border:1px solid #ece8dc;border-radius:12px;padding:10px 12px;text-align:center}
.v3 span{display:block;font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.v3 b{font-size:16px;color:#15151a}
.chartbox{background:#fff;border:1px solid #ece8dc;border-radius:16px;padding:14px 16px}
.chart-leg{font-size:12px;margin-bottom:6px}
.lg{font-weight:700;margin-right:10px}.lg.base{color:#9a9aa3}.lg.novo{color:var(--acento-escuro)}
.chartbox svg{width:100%;height:auto;display:block}
.simlink{display:inline-block;margin:2px 0 0;background:linear-gradient(135deg,var(--acento-claro),var(--acento) 45%,var(--acento-escuro));color:#fff;font-weight:800;border-radius:10px;padding:10px 18px;font-size:14px;box-shadow:0 6px 16px color-mix(in srgb,var(--acento) 30%,transparent)}
.simlink:hover{filter:brightness(1.05)}
@media(max-width:760px){.sim-wrap{grid-template-columns:1fr}}
@media(max-width:520px){.hello{font-size:20px}.wrap{padding:20px 16px 50px}}
/* 22/11: no celular o topo não estoura a largura (ele alargava a página inteira e empurrava as janelas para fora da tela) */
@media(max-width:640px){.topbar{flex-wrap:wrap;gap:8px;padding:10px 14px}.topbar .right{flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-left:auto}.topbar .sair{padding:7px 10px}.userchip{padding:4px}.userchip .nm{display:none}}
`;
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const logoOuNome = () => M.logo ? `<img class="logo" src="${esc(M.logo)}" alt="${esc(M.nome)}">` : `<div class="login-nome">${esc(M.nome)}</div>`;

function telaAcesso({ titulo, sub = "", action, conteudo, erro = "", aviso = "" }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · ${esc(M.nome)}</title><style>${CSS}</style></head>
<body><div class="login-bg">
  <form class="login-card" method="POST" action="${action}" autocomplete="on">
    ${logoOuNome()}
    <h1>${esc(titulo)}</h1>
    <div class="sub">${esc(sub)}</div>
    ${erro ? `<div class="erro">${esc(erro)}</div>` : ""}
    ${aviso ? `<div class="aviso">${esc(aviso)}</div>` : ""}
    ${conteudo}
  </form>
  ${M.slogan ? `<div class="slogan">${esc(M.slogan)}</div>` : ""}
  <div class="login-foot">Uso interno</div>
</div></body></html>`;
}

export const paginaLogin = ({ erro = "", aviso = "" } = {}) => telaAcesso({ titulo: "Entrar", sub: M.sufixo, action: "/login", erro, aviso, conteudo: `
    <div class="campo"><label>Usuário</label><input name="usuario" autofocus autocapitalize="off" autocomplete="username" placeholder="seu.usuario"></div>
    <div class="campo"><label>Senha</label><input name="senha" type="password" autocomplete="current-password" placeholder="••••••••"></div>
    <button class="btn" type="submit">Entrar</button>` });

export const paginaTrocarSenha = ({ erro = "", nome = "", obrigatoria = false } = {}) => telaAcesso({ titulo: "Definir nova senha", sub: nome, action: "/trocar-senha", erro,
  aviso: obrigatoria ? "Por segurança, crie uma senha só sua no primeiro acesso." : "", conteudo: `
    ${obrigatoria ? "" : `<div class="campo"><label>Senha atual</label><input name="atual" type="password" autocomplete="current-password"></div>`}
    <div class="campo"><label>Nova senha</label><input name="nova" type="password" autocomplete="new-password" placeholder="mínimo 8 caracteres"></div>
    <div class="campo"><label>Repetir senha</label><input name="nova2" type="password" autocomplete="new-password" placeholder="repita a senha"></div>
    <button class="btn" type="submit">Salvar e entrar</button>
    ${obrigatoria ? "" : `<p style="text-align:center;margin-top:12px;font-size:12.5px"><a href="/app" style="color:var(--mut)">← voltar</a></p>`}` });

// ---- moldura das páginas com login (barra do topo + rodapé) ----
function topbar(user) {
  const iniciais = String(user.nome || user.usuario || "?").split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const admin = user.nivel === "master" ? `<a class="sair" href="/admin">⚙️ Administração</a>` : "";
  return `<div class="topbar">
    <a href="/app" class="wordmark">${esc(M.nome)}<small>${esc(M.sufixo)}</small></a>
    <div class="right">
      ${admin}
      <div class="userchip"><span class="nm">${esc(user.nome)}</span><span class="av">${esc(iniciais)}</span></div>
      <a class="sair" href="/trocar-senha">Trocar senha</a>
      <form method="POST" action="/logout" style="display:inline"><button class="sair" style="background:none;cursor:pointer">Sair</button></form>
    </div>
  </div>`;
}
function rodape() {
  return `<div class="foot"><span><b>${esc(M.nome)}</b>${M.slogan ? " · " + esc(M.slogan) : ""}</span><span>${esc(M.empresa)}</span></div>`;
}
export const obraBonita = o => o;

/** Número da unidade sem a palavra "apartamento" e afins — a obra já aparece ao lado. */
export const unidadeCurta = u => String(u || "").toUpperCase().trim()
  .replace(/^(APARTAMENTO|APTO|DUPLEX|GARDEN|COBERTURA|FLAT|SALA|LOJA)\s*/, "")
  .replace(/^(\d{3,4})\s+([AB])$/, "$1$2")
  .trim();

/** Cabeçalho padrão das telas: volta, título, subtítulo e fio de destaque. */
export function cabecalhoPagina({ icone = "", titulo, sub = "", voltar = "/app", voltarRotulo = "Painel" }) {
  return `<div class="pg">
    ${voltar ? `<a class="pg-volta" href="${voltar}"><span class="seta">←</span> ${voltarRotulo}</a>` : ""}
    <h1>${icone ? `<span class="ic">${icone}</span>` : ""}${titulo}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ""}
    <div class="fio"></div>
  </div>`;
}

export function shell({ title, body, user }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · ${esc(M.nome)}</title><style>${CSS}</style></head>
<body>${topbar(user)}<div class="wrap">${body}</div>${rodape()}</body></html>`;
}

/** Um arquivo PDF que dá para abrir: o desenho do PDF, o que é, e uma linha fina embaixo (quem anexou, de onde veio). */
export const linkPDF = (href, rotulo, nota = "") => `<a class="arq-pdf" href="${href}" target="_blank" title="Abrir o PDF">`
  + `<svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden="true"><path d="M2 3a2 2 0 0 1 2-2h9.2L20 7.8V25a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3Z" fill="#fdeaea" stroke="#b03a3a" stroke-width="1.4"/>`
  + `<path d="M13.2 1v6.8H20" stroke="#b03a3a" stroke-width="1.4" fill="none"/><text x="11" y="21" text-anchor="middle" font-size="6.6" font-weight="800" fill="#b03a3a" font-family="Arial,sans-serif">PDF</text></svg>`
  + `<span>${rotulo}${nota ? `<small>${nota}</small>` : ""}</span><span class="ab">abrir</span></a>`;

/** Selo "PDF" para pôr ao lado de um anexo já guardado. */
export const seloPDF = (rotulo = "PDF") => `<span class="pdf-sel" title="arquivo em PDF">`
  + `<svg width="11" height="14" viewBox="0 0 11 14" fill="none" aria-hidden="true">`
  + `<path d="M1 1.5A1 1 0 0 1 2 .5h4.3L10 4.2V12.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V1.5Z" fill="#fdeaea" stroke="#b03a3a" stroke-width="1"/>`
  + `<path d="M6.3.5V4.2H10" stroke="#b03a3a" stroke-width="1" fill="none"/></svg>${rotulo}</span>`;
