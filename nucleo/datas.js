// Ajuda a transformar "hoje" / "semana" em um intervalo de datas (YYYY-MM-DD).

/** A data do DIA LOCAL (YYYY-MM-DD).
 *
 * NÃO usar toISOString() para isto: ele converte para UTC, então das 21h em diante
 * (Brasília) "hoje" vira amanhã — e o relatório do dia sai do dia errado. Aqui a data
 * é montada a partir dos campos locais, sem passar por UTC.
 */
export function isoLocal(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const iso = isoLocal;

/** Agora em hora LOCAL com o fuso junto — o toISOString() devolve UTC e adianta o relógio. */
export function agoraLocalISO(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const p = n => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
    + (off >= 0 ? "+" : "-") + p(off / 60) + ":" + p(off % 60);
}

export function periodo(intervalo) {
  const hoje = new Date();
  if (intervalo === "semana") {
    // Semana atual: de segunda a domingo.
    const diaSemana = (hoje.getDay() + 6) % 7; // 0 = segunda-feira
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - diaSemana);
    const dom = new Date(seg);
    dom.setDate(seg.getDate() + 6);
    return { de: iso(seg), ate: iso(dom), rotulo: "esta semana" };
  }
  if (intervalo === "mes") {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    return { de: iso(ini), ate: iso(fim), rotulo: "este mês" };
  }
  // Padrão: hoje.
  const d = iso(hoje);
  return { de: d, ate: d, rotulo: "hoje" };
}
