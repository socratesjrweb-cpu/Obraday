// medicao-estilo.js — estilo das tabelas usado pelas telas da Medição.
export const CSS = `<style>
.oc-topo{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin:10px 0 0}
.oc-topo h1{font-size:22px;margin:0}.oc-topo .tot{margin-left:auto;text-align:right}
.oc-topo .tot small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.oc-topo .tot b{font-size:26px;font-variant-numeric:tabular-nums}
.oc-abas{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 0;border-bottom:2px solid var(--escuro)}
.oc-abas a{border:1px solid #e0d9c4;border-bottom:0;background:#fff;color:#5a4e2e;border-radius:10px 10px 0 0;padding:9px 15px;font-size:13px;font-weight:700;text-decoration:none}
.oc-abas a.on{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.oc-abas a i{font-style:normal;margin-left:6px;background:#b03a3a;color:#fff;border-radius:999px;padding:1px 7px;font-size:11px}
.oc-abas a i.ok{background:#2f7d55}
.oc-painel{background:#fff;border:1px solid #ece8dc;border-top:0;border-radius:0 0 16px 16px;padding:18px 20px}
.oc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
.oc-k{background:#faf9f4;border:1px solid #efeade;border-radius:14px;padding:14px 16px}
.oc-k.escuro{background:var(--escuro);border-color:var(--escuro);color:#fff}.oc-k.escuro span{color:var(--acento-claro)}
.oc-k span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);margin-bottom:6px}
.oc-k b{display:block;font-size:25px;line-height:1.1;font-variant-numeric:tabular-nums}
.oc-k em{display:block;font-style:normal;font-size:12px;color:var(--mut);margin-top:5px}
.oc-k.alerta b{color:#b03a3a}.oc-k.bom b{color:#2f7d55}
.oc-t{width:100%;border-collapse:collapse;font-size:13px}
.oc-t th{position:sticky;top:0;background:#f4f1e6;text-align:left;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6a5e3a;padding:8px 10px;border-bottom:1px solid #e3dcc6;z-index:1}
.oc-t td{padding:7px 10px;border-bottom:1px solid #f1eee4;vertical-align:top}
.oc-t .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.oc-t .cod{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:#55555e;white-space:nowrap}
.oc-t tr.n1 td{background:var(--escuro);color:#fff;font-weight:800;font-size:13.5px;border-bottom:1px solid #2a2a31;cursor:pointer}
.oc-t tr.n1 td.r{color:var(--acento-claro)}.oc-t tr.n1 td.cod{color:var(--acento-claro)}.oc-t tr.n2 td.cod,.oc-t tr.n3 td.cod{color:#3a3a42}
.oc-t tr.n2 td{background:#efe9d8;font-weight:800;cursor:pointer}
.oc-t tr.n3 td{background:#faf8f1;font-weight:700;cursor:pointer}
.oc-t tr.n4:hover td{background:#fffdf3}
.oc-t tr.n4 td:nth-child(2){cursor:pointer}
.oc-t tr.n2 td:nth-child(2){padding-left:22px}.oc-t tr.n3 td:nth-child(2){padding-left:38px}.oc-t tr.n4 td:nth-child(2){padding-left:54px}
.oc-t .seta{display:inline-block;width:14px;color:var(--acento);transition:transform .12s}
.oc-t tr.ab .seta{transform:rotate(90deg)}
.oc-t tr.pend td{background:#fff8d6}
.oc-base{display:inline-block;border-radius:999px;padding:1px 8px;font-size:10px;font-weight:800;letter-spacing:.03em;color:var(--c);border:1px solid var(--c);white-space:nowrap}
.oc-mo{display:inline-block;border-radius:5px;padding:0 5px;font-size:10px;font-weight:800;background:#e8eef7;color:#2f5d9a;margin-left:6px}
.oc-tag{display:inline-block;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:700;background:#fde9a8;color:#7a4b00;margin:2px 4px 0 0}
.oc-tag.v{background:#fbe0e0;color:#8a2d2d}
.oc-barra{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.oc-barra input[type=search],.oc-barra input[type=text],.oc-barra select{padding:9px 12px;border:1px solid #ddd8c8;border-radius:10px;font:inherit;font-size:13px;background:#fff;min-width:260px}
.oc-btn{border:1px solid #d9d2bb;background:#fff;color:#5a4e2e;border-radius:9px;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none}
.oc-btn.p{background:var(--escuro);color:var(--acento-claro);border-color:var(--escuro)}
.oc-bar{height:8px;border-radius:999px;background:#eee9da;min-width:90px;overflow:hidden}.oc-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--acento),var(--acento-escuro))}
.oc-det>td{background:#fcfbf7 !important;padding:0 !important}
.oc-comp{margin:8px 10px 12px 54px;border:1px solid #e6dfc8;border-radius:12px;overflow:hidden;background:#fff}
.oc-comp table{width:100%;border-collapse:collapse;font-size:12.5px}
.oc-comp th{background:#f4f1e6;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#6a5e3a;padding:6px 9px}
.oc-comp td{padding:6px 10px !important;border-top:1px solid #f1eee4;border-bottom:0 !important}.oc-comp th{position:static !important}
.oc-comp tr.sub td{background:#fffbe6;font-weight:700}.oc-comp tr.falta td{background:#fbe9e9;color:#8a2d2d}
.oc-comp .pe td{background:#f8f6ee;font-weight:800}
.oc-comp table{table-layout:auto}.oc-comp .e,.ce-q .e{width:1%;white-space:nowrap}.ce-q td,.ce-q th{padding:6px 9px}.ce-q tbody tr:hover td{background:#fffbe6}.oc-comp td.dsc{min-width:280px;font-weight:600}
.oc-comp td.dsc .oc-btn{white-space:nowrap}
#ceUnDlg{position:fixed;inset:0;margin:auto;height:fit-content;max-height:90vh;overflow:auto;border:0;border-radius:16px;padding:0;width:calc(100% - 32px);max-width:540px;box-shadow:0 20px 60px rgba(0,0,0,.35)}#ceUnDlg.grande{max-width:1000px}#ceUnDlg::backdrop{background:rgba(14,14,17,.55)}.un-erro{color:#8a2d2d;font-size:13px;font-weight:700}.un-erro:empty{display:none}.un-sin{display:flex;gap:6px;margin-top:5px}.un-sin input{flex:1;min-width:120px;padding:5px 8px;border:1px solid #ddd8c8;border-radius:8px;font:inherit;font-size:12px}.un-sin .oc-btn{padding:3px 9px;font-size:11.5px}
.oc-tipo{display:inline-block;border-radius:6px;padding:1px 7px;font-size:10.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap}
.oc-tipo.c{background:var(--escuro);color:var(--acento-claro)}.oc-tipo.i{background:#e8eef7;color:#2f5d9a}
.oc-cls{display:inline-flex;width:24px;height:24px;border-radius:7px;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff}
.oc-cls.A{background:var(--escuro);color:var(--acento-claro)}.oc-cls.B{background:var(--acento)}.oc-cls.C{background:#b9b3a0}
.oc-sec{margin:22px 0 10px;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#6a5e3a}
.oc-vazio{color:var(--mut);font-size:13px;padding:16px 4px}
.oc-ok{background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:12px;padding:12px 14px;font-size:14px;font-weight:700}
.oc-nota{font-size:12.5px;color:#4a4a52;background:#f4f2ea;border-radius:9px;padding:9px 12px;margin:8px 0 12px;line-height:1.55}
.oc-chks{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px}.oc-chks label{display:flex;gap:5px;align-items:center}
.oc-rolar{overflow-x:auto}
.oc-m{display:none;border:1px solid #d9d2bb;background:#fff;color:#5a4e2e;border-radius:7px;padding:1px 9px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;line-height:1.4}
.oc-painel.edm .oc-m{display:inline-block}.oc-so-ed{display:none !important}.oc-painel.edm .oc-so-ed{display:flex !important}
.oc-ed{display:flex;gap:14px 22px;flex-wrap:wrap;align-items:center;margin:8px 10px 12px 54px;padding:12px 14px;border:1px solid var(--acento);border-radius:12px;background:#fffdf5}
.oc-ed form{display:flex;gap:8px;align-items:center;margin:0}.oc-ed label{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.oc-ed input[type=text]{padding:8px 10px;border:1px solid #ddd8c8;border-radius:9px;font:inherit;font-size:13px;background:#fff}
.oc-btn.v{color:#8a2d2d;border-color:#e6c3c3}
.oc-msg{background:#e8f2e2;border:1px solid #cfe3c4;color:#2f6b2f;border-radius:10px;padding:9px 12px;font-size:13px;margin:12px 0 0}
.oc-msg.e{background:#fbe9e9;border-color:#f0c9c9;color:#8a2d2d}
.oc-t tr.pisca td{background:#fff3c9 !important}
.oc-rem{margin-top:14px;font-size:12.5px}.oc-rem summary{cursor:pointer;font-weight:700;color:#6a5e3a;padding:6px 0}
.oc-rem div{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:5px 0;border-top:1px solid #f1eee4}.oc-rem form{margin:0}
.oc-ins summary{cursor:pointer;font-size:12px;font-weight:700;color:#6a5e3a}.oc-ins form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px}
.ce-g{display:grid;grid-template-columns:170px 1fr 130px;gap:12px;margin-bottom:14px}.ce-g label,.ce-b label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:4px}
.ce-g input,.ce-b input[type=text],.ce-b input[type=search],.ce-b select,#ceItens input{width:100%;padding:8px 10px;border:1px solid #ddd8c8;border-radius:9px;font:inherit;font-size:13px;background:#fff}
#ceItens input{width:96px;text-align:right}
.ce-b{border:1px dashed #cfc7ad;border-radius:12px;padding:12px 14px;margin:14px 0;background:#fcfbf7}.ce-b .l{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.ce-r{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid #f1eee4;font-size:12.5px}.ce-r span{flex:1}.ce-r b{white-space:nowrap}
.ce-tot{display:flex;justify-content:flex-end;gap:14px;align-items:baseline;margin:12px 0}.ce-tot b{font-size:24px;font-variant-numeric:tabular-nums}
@media(max-width:700px){.ce-g{grid-template-columns:1fr}}
.oc-ins input[type=text],.oc-ins select{padding:7px 9px;border:1px solid #ddd8c8;border-radius:8px;font:inherit;font-size:12.5px;background:#fff}
.pg-limpa:not(.exp) .xp{display:none !important}
.pg-pill{border:1px solid #d9d3c3;background:#fff;border-radius:999px;padding:7px 15px;font:inherit;font-size:12.5px;font-weight:700;color:#3a3a42;cursor:pointer}
.pg-pill:hover,.pg-pill.on{border-color:var(--acento);color:var(--acento-escuro)}
@media(max-width:800px){.oc-t .esc{display:none}.oc-comp{margin-left:10px}}
</style>`;
