/**
 * Estado de la CLARITY Act (H.R. 3633) — contexto regulatorio de XRP.
 *
 * Fuente: API publica de GovTrack (sin API key). congress.gov y la web de GovTrack
 * bloquean el acceso automatizado (403), pero su API si responde.
 *
 * LIMITACION IMPORTANTE: esta API refleja HITOS (paso por una camara, firma), no
 * la agenda diaria del pleno. NO detecta que se presente una mocion de cloture ni
 * que se agende un voto — que es justo el evento con riesgo de gap. Para eso hay
 * que mirar noticias. Aqui se informa el hito y, sobre todo, se avisa si CAMBIO.
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const API = "https://www.govtrack.us/api/v2/bill" +
            "?congress=119&bill_type=house_bill&number=3633";
const CLAVE = "clarity_ultimo";

export interface Clarity {
  titulo: string;
  estado: string;            // codigo interno de GovTrack
  etiqueta: string;          // "Passed House (Senate next)"
  descripcion: string;
  fecha: string;             // ISO del ultimo hito
  viva: boolean;
  enlace: string;
  diasDesde: number;         // dias desde el ultimo hito
  cambio: boolean;           // cambio respecto a la ultima consulta
  lectura: string;           // que significa para el mercado
  aviso: "info" | "atencion";
}

/** Traduce el hito legislativo a contexto de mercado para XRP. */
function interpretar(estado: string, viva: boolean): { lectura: string; aviso: "info" | "atencion" } {
  if (!viva) {
    return { aviso: "atencion",
      lectura: "La ley murió. Se acaba la expectativa regulatoria: posible decepción bajista " +
               "y vuelta al statu quo." };
  }
  if (estado.startsWith("enacted") || estado.includes("signed")) {
    return { aviso: "atencion",
      lectura: "APROBADA Y FIRMADA. Catalizador alcista fuerte: es peligroso estar corto." };
  }
  if (estado.startsWith("pass_back") || estado === "passed_bill") {
    return { aviso: "atencion",
      lectura: "Pasó ambas cámaras. Movimiento fuerte probable: no abrir apalancado a ciegas." };
  }
  if (estado === "pass_over_house" || estado === "pass_over_senate") {
    return { aviso: "info",
      lectura: "Aprobada en una cámara, pendiente en la otra. Mientras no se resuelva, la " +
               "incertidumbre mantiene al precio en rango: pocos setups de tendencia limpia." };
  }
  if (estado.startsWith("reported") || estado.startsWith("referred")) {
    return { aviso: "info",
      lectura: "En comité, lejos de resolverse. Sin catalizador cercano: el precio se mueve " +
               "por técnico, no por regulación." };
  }
  return { aviso: "info", lectura: "Estado sin lectura específica; míralo en el enlace." };
}

async function leer(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) return (await Preferences.get({ key: CLAVE })).value;
  return localStorage.getItem(CLAVE);
}

async function escribir(v: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Preferences.set({ key: CLAVE, value: v });
  else localStorage.setItem(CLAVE, v);
}

export async function estadoClarity(): Promise<Clarity | null> {
  let d: any;
  try {
    // Sin parametros extra: GovTrack rechaza (400) cualquier clave que no conozca,
    // asi que el anti-cache va por cabecera, no por query string.
    const r = await fetch(API, { cache: "no-store" });
    if (!r.ok) return null;
    d = (await r.json())?.objects?.[0];
  } catch {
    return null;                      // sin red: la app sigue funcionando
  }
  if (!d) return null;

  const estado = String(d.current_status || "");
  const fecha = String(d.current_status_date || "");
  const previo = await leer();
  const cambio = previo != null && previo !== `${estado}|${fecha}`;
  await escribir(`${estado}|${fecha}`);

  const dias = fecha
    ? Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000) : 0;
  const { lectura, aviso } = interpretar(estado, !!d.is_alive);

  return {
    titulo: String(d.title_without_number || "Digital Asset Market Clarity Act"),
    estado,
    etiqueta: String(d.current_status_label || estado),
    descripcion: String(d.current_status_description || ""),
    fecha, viva: !!d.is_alive,
    enlace: String(d.link || "https://www.govtrack.us/congress/bills/119/hr3633"),
    diasDesde: dias,
    cambio,
    lectura,
    // un hito reciente (o un cambio detectado) merece cautela extra
    aviso: cambio || dias <= 3 ? "atencion" : aviso,
  };
}
