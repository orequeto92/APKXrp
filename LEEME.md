# XRP-App

App Android de la estrategia **XRPUSD** (coin-margined, Bitget). Hace lo mismo que el
bot de Telegram pero con interfaz, al instante y con **parametros editables**.

> **Nunca coloca ordenes.** Solo lee datos publicos de Bitget, analiza y propone.
> Tu ejecutas manualmente en el exchange. Material educativo, no asesoria financiera.

## Pantallas
| Pantalla | Equivale a |
|---|---|
| **Escaner** | `/oportunidades` — setup completo con score y tamano |
| **Posicion** | tu operacion abierta: P&L en vivo, distancia al SL, cierre con P&L real |
| **Zonas** | `/alertas` — niveles para poner alertas de precio en Bitget |
| **Capital** | `/saldo` + `/registrar` + `/estado` — interes compuesto e historial |
| **Ajustes** | parametros de estrategia + **sincronizacion con el bot** |
| **Reglas** | la estrategia, para consulta |

## Contexto regulatorio (CLARITY Act)
El Escaner consulta el estado de la **H.R. 3633** en la API publica de **GovTrack**
(sin API key; congress.gov y la web de GovTrack devuelven 403 a peticiones automaticas).

Muestra el hito actual, lo traduce a lectura de mercado y **avisa si cambio** desde tu
ultima consulta — un hito legislativo mueve el precio con fuerza.

> **Limitacion:** la API refleja HITOS (paso por una camara, firma), no la agenda diaria
> del pleno. **No detecta** que se presente una mocion de cloture ni que se agende un voto,
> que es justo el evento con riesgo de gap. Para eso hay que mirar noticias.

Es **solo contexto**: no altera el score ni la decision, para que la app y el bot sigan
dando exactamente la misma senal (ver Paridad).

## Sincronizacion con el bot
La fuente unica de verdad es `params.json` en el repo **orequeto92/xrp-signal-bot**.

```
GitHub (params.json)  ->  app la lee al abrir Ajustes
                      <-  boton "Sincronizar" sube tus cambios
```

Los cambios en la app son **inmediatos y locales**; solo afectan al bot cuando pulsas
**Sincronizar**. Asi puedes probar sin miedo. La pantalla avisa si app y bot quedaron
desalineados y muestra el valor que usa cada uno.

Para sincronizar hace falta un **token fine-grained de GitHub**, limitado a ese
repositorio y con permiso *Contents: Read and write*. Se guarda solo en el telefono.

**No se sincronizan** (el repo es publico): tu **saldo** y el token de Telegram.

## Paridad con el bot
El motor esta portado a TypeScript. Para comprobar que decide igual que el Python:

```
npm run paridad
```

Congela las mismas velas para ambos motores y compara campo por campo. **Cualquier
cambio de reglas debe hacerse en los dos sitios**, o app y bot daran senales distintas.

## Desarrollo
```
npm install
npm run dev        # navegador, con proxy a Bitget
npm run build      # typecheck + bundle a dist/
npm run sync       # copia dist/ al proyecto Android
npm run apk        # genera el APK de debug
```

El APK sale en `android/app/build/outputs/apk/debug/`.
