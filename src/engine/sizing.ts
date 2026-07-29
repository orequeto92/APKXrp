/**
 * Dimensionado de posicion para un perp coin-margined.
 *
 * El saldo es una cantidad de la moneda base (XRP) usada como margen; se valora
 * en USD (monedas x precio) y se arriesga un % fijo de eso. La distancia al SL
 * define el riesgo real, NO el apalancamiento.
 *
 * Es una aproximacion lineal: un contrato inverso real liquida algo antes en
 * largos, asi que conviene mantener el leverage bajo.
 *
 * Port de engine/sizing.py — cualquier cambio debe hacerse en ambos.
 */
import type { Contrato } from "./bitget.js";

export interface Tamano {
  dist_pct: number;
  risk_usd: number;
  risk_pct: number;
  qty: number;
  notional: number;
  margin: number;
  leverage: number;
  liq_pct: number;
  liq_ok: boolean;
  tp1: number;
  tp2: number;
  warnings: string[];
}

export function dimensionar(
  entrada: number,
  sl: number,
  lado: "long" | "short",
  saldoUsd: number,
  riesgoPct = 2.0,
  levMax = 10,
  contrato: Contrato | null = null,
  slMinPct = 1.5,
  slMaxPct = 4.0,
): Tamano | null {
  const dist = Math.abs(entrada - sl);
  if (dist <= 0 || entrada <= 0) return null;

  const distPct = (dist / entrada) * 100;
  const riesgoUsd = (saldoUsd * riesgoPct) / 100;

  const notionalIdeal = riesgoUsd / (distPct / 100);
  const levSeguro = Math.max(1, Math.floor(100 / distPct / 3)); // liquidacion >= 3x el SL
  const lev = Math.max(1, Math.min(levMax, levSeguro));

  const warnings: string[] = [];
  if (distPct < slMinPct) warnings.push(`SL ajustado (${distPct.toFixed(2)}%): el ruido puede sacarte.`);
  else if (distPct > slMaxPct) warnings.push(`SL ancho (${distPct.toFixed(2)}%): la posicion queda pequena.`);

  let qty: number;
  if (contrato) {
    const paso = contrato.step || contrato.min_num || 1;
    qty = Math.max(1, Math.round(notionalIdeal / entrada / paso)) * paso;
    if (qty < contrato.min_num) qty = contrato.min_num;
  } else {
    qty = notionalIdeal / entrada;
  }

  const notional = qty * entrada;
  const margin = notional / lev;
  const tp1 = lado === "long" ? entrada + dist : entrada - dist;
  const tp2 = lado === "long" ? entrada + dist * 2 : entrada - dist * 2;
  const liqPct = 100 / lev;

  return {
    dist_pct: +distPct.toFixed(2),
    risk_usd: +riesgoUsd.toFixed(2),
    risk_pct: riesgoPct,
    qty: +qty.toFixed(6),
    notional: +notional.toFixed(2),
    margin: +margin.toFixed(2),
    leverage: lev,
    liq_pct: +liqPct.toFixed(1),
    liq_ok: liqPct > distPct * 3,
    tp1: +tp1.toFixed(6),
    tp2: +tp2.toFixed(6),
    warnings,
  };
}
