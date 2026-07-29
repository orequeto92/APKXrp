/**
 * Estado persistente: saldo en monedas, posicion abierta e historial.
 *
 * El saldo es la pieza que une todo: cada operacion cerrada lo actualiza y el
 * escaner dimensiona SIEMPRE con el saldo vigente. Eso es el interes compuesto.
 *
 * El saldo vive SOLO en el telefono (y en el secret del bot). Nunca se sube al
 * repo publico junto con los parametros.
 *
 * Usa Capacitor Preferences en el APK y localStorage en el navegador.
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type Resultado = "TP1" | "TP2" | "SL" | "BE" | "MANUAL";

export interface Operacion {
  id: string;
  fecha: string;              // ISO
  lado: "long" | "short";
  entrada: number;
  sl: number;
  tp1: number;
  tp2: number;
  unidades: number;
  lev: number;
  score: number | null;
  resultado: Resultado | null;
  pnl_monedas: number | null;
  saldo_antes: number;
  saldo_despues: number | null;
  nota: string;
  propia: boolean;            // true = decision propia, no del sistema
}

export interface Estado {
  saldo: number;              // en monedas (XRP)
  saldo_inicial: number;
  operaciones: Operacion[];
}

const CLAVE = "estado_xrp";

const INICIAL: Estado = { saldo: 13.45, saldo_inicial: 13.65, operaciones: [] };

async function leer(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) return (await Preferences.get({ key: CLAVE })).value;
  return localStorage.getItem(CLAVE);
}

async function escribir(v: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: CLAVE, value: v });
  else localStorage.setItem(CLAVE, v);
}

export async function cargar(): Promise<Estado> {
  try {
    const txt = await leer();
    if (!txt) return { ...INICIAL };
    return { ...INICIAL, ...JSON.parse(txt) };
  } catch {
    return { ...INICIAL };
  }
}

export async function guardar(e: Estado): Promise<void> {
  await escribir(JSON.stringify(e));
}

export async function fijarSaldo(saldo: number): Promise<Estado> {
  const e = await cargar();
  e.saldo = saldo;
  await guardar(e);
  return e;
}

/** Registra una operacion abierta (sin resultado todavia). */
export async function abrir(op: Omit<Operacion, "id" | "fecha" | "saldo_antes" |
                                       "resultado" | "pnl_monedas" | "saldo_despues">): Promise<Estado> {
  const e = await cargar();
  e.operaciones.unshift({
    ...op,
    id: `${Date.now()}`,
    fecha: new Date().toISOString(),
    saldo_antes: e.saldo,
    resultado: null,
    pnl_monedas: null,
    saldo_despues: null,
  });
  await guardar(e);
  return e;
}

/** Cierra una operacion con su P&L real y aplica el interes compuesto. */
export async function cerrar(id: string, resultado: Resultado, pnl: number): Promise<Estado> {
  const e = await cargar();
  const op = e.operaciones.find((o) => o.id === id);
  if (!op || op.resultado) return e;
  op.resultado = resultado;
  op.pnl_monedas = pnl;
  e.saldo = +(e.saldo + pnl).toFixed(8);
  op.saldo_despues = e.saldo;
  await guardar(e);
  return e;
}

export async function borrar(id: string): Promise<Estado> {
  const e = await cargar();
  e.operaciones = e.operaciones.filter((o) => o.id !== id);
  await guardar(e);
  return e;
}

export interface Stats {
  total: number; cerradas: number; ganadas: number; perdidas: number;
  acierto: number; pnl: number; crecimiento: number; abierta: Operacion | null;
}

export function estadisticas(e: Estado): Stats {
  const cerradas = e.operaciones.filter((o) => o.resultado);
  const ganadas = cerradas.filter((o) => (o.pnl_monedas || 0) > 0).length;
  const perdidas = cerradas.filter((o) => (o.pnl_monedas || 0) < 0).length;
  const pnl = cerradas.reduce((s, o) => s + (o.pnl_monedas || 0), 0);
  return {
    total: e.operaciones.length,
    cerradas: cerradas.length,
    ganadas, perdidas,
    acierto: ganadas + perdidas ? (ganadas / (ganadas + perdidas)) * 100 : 0,
    pnl,
    crecimiento: e.saldo_inicial ? (e.saldo / e.saldo_inicial - 1) * 100 : 0,
    abierta: e.operaciones.find((o) => !o.resultado) || null,
  };
}
