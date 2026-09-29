// Sumas de dinero y de horas para los reportes (Sprint 5).
//
// Los montos son Decimal(14,2) en la base. Sumarlos como número flotante
// arrastra errores (0.1 + 0.2 = 0.30000000000000004); se suman en centavos
// enteros y se convierten a pesos al final. El mayor valor posible
// (999.999.999.999,99) cabe de sobra en un entero exacto de JavaScript.

/** Centavos enteros de un Decimal de Prisma, texto o número. Nulo = 0. */
function aCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  return Math.round(Number(String(valor)) * 100);
}

const aPesos = (centavos) => centavos / 100;

/** Horas con un decimal a partir de minutos; nulo si no se midió. */
const aHoras = (minutos) => (minutos === null || minutos === undefined ? null : Math.round(minutos / 6) / 10);

module.exports = { aCentavos, aPesos, aHoras };
