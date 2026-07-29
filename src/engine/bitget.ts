/**
 * Cliente de la API PUBLICA de Bitget (solo lectura).
 *
 * IMPORTANTE: esta app NUNCA coloca, modifica ni cancela ordenes, y no maneja
 * claves de API. Solo consulta datos de mercado publicos. Toda la ejecucion la
 * hace el usuario a mano en Bitget.
 *
 * CORS: dentro del APK el WebView sirve desde capacitor://localhost, asi que las
 * peticiones a api.bitget.com son cross-origin. Se resuelve con CapacitorHttp
 * (activado en capacitor.config.ts), que las hace de forma nativa saltando CORS.
 * En `npm run dev` se usa el proxy de Vite (ver vite.config.ts).
 */
import type { Candle } from "./ta.js";

const EN_NAVEGADOR_DEV = typeof window !== "undefined" && window.location?.port === "5173";
const BASE = EN_NAVEGADOR_DEV ? "/bitget" : "https://api.bitget.com";
const PT = "USDT-FUTURES";

export interface Contrato {
  min_num: number;
  min_usdt: number;
  lev_max: number;
  step: number;
}

export interface Ticker {
  bidPr?: string;
  askPr?: string;
  usdtVolume?: string;
  lastPr?: string;
  change24h?: string;      // variacion 24h en tanto por uno (0.0275 = +2.75%)
  holdingAmount?: string;  // open interest en unidades de la moneda base
  fundingRate?: string;
  indexPrice?: string;
}

async function get(path: string, params: Record<string, string>): Promise<any> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  let ultimo: unknown = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { headers: { "Content-Type": "application/json" } });
      if (!r.ok) return { code: `http_${r.status}`, data: null };
      return await r.json();
    } catch (e) {
      ultimo = e;
      if (intento < 2) await new Promise((s) => setTimeout(s, 800));
    }
  }
  throw new Error(`Bitget no responde: ${String(ultimo)}`);
}

export async function getCandles(symbol: string, gran: string, limit = 300): Promise<Candle[]> {
  const d = await get("/api/v2/mix/market/candles", {
    symbol, productType: PT, granularity: gran, limit: String(limit),
  });
  return (d?.data ?? []) as Candle[];
}

export async function getTicker(symbol: string): Promise<Ticker> {
  const d = await get("/api/v2/mix/market/ticker", { symbol, productType: PT });
  return (d?.data?.[0] ?? {}) as Ticker;
}

export async function getFunding(symbol: string): Promise<number | null> {
  try {
    const d = await get("/api/v2/mix/market/current-fund-rate", { symbol, productType: PT });
    const v = d?.data?.[0]?.fundingRate;
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

/** Especificaciones de contrato. El `step` es critico para el redondeo de tamano. */
export async function getContratos(): Promise<Record<string, Contrato>> {
  const d = await get("/api/v2/mix/market/contracts", { productType: PT });
  const out: Record<string, Contrato> = {};
  for (const c of d?.data ?? []) {
    try {
      const vp = parseInt(c.volumePlace ?? "0", 10);
      out[c.symbol] = {
        min_num: Number(c.minTradeNum ?? 0),
        min_usdt: Number(c.minTradeUSDT ?? 0),
        lev_max: Number(c.maxLever ?? 100),
        step: vp > 0 ? 10 ** -vp : 1.0,
      };
    } catch {
      continue;
    }
  }
  return out;
}

/** Hora del servidor, para detectar un reloj local desajustado. */
export async function getServerTime(): Promise<number | null> {
  try {
    const d = await get("/api/v2/public/time", {});
    return d?.data?.serverTime ? Number(d.data.serverTime) : null;
  } catch {
    return null;
  }
}
