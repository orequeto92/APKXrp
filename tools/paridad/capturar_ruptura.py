# -*- coding: utf-8 -*-
"""Congela el historico real (1D y 4H) usado por el regimen RUPTURA en un fixture,
y guarda lo que produce engine/ruptura.py (Python, ya validado). Cubre los DOS
episodios reales conocidos (nov-2024 y feb-2026) para que la comparacion con
TypeScript sea sobre casos reales, no solo el estado actual (que hoy esta inactivo).

USO:  python tools/paridad/capturar_ruptura.py
"""
import sys, os, json, datetime

BOT = r"C:\Users\Brahian\xrp-signal-bot"
TRADING_B = r"C:\Users\Brahian\Trading-B\tools"
sys.path.insert(0, BOT)
sys.path.insert(0, TRADING_B)
from engine import ruptura, ta                      # noqa: E402
from test_zonas import traer_rango                  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(AQUI, "fixture_ruptura.json")

SYMBOL = "XRPUSDT"
DESDE, HASTA = "2023-11-01", "2026-08-11"
DIAS_ENTRADA_CONOCIDOS = ["2024-11-22", "2026-02-11"]   # las 2 confirmaciones ya validadas


def main():
    hasta_ts = int(datetime.datetime.strptime(HASTA, "%Y-%m-%d").replace(tzinfo=datetime.UTC).timestamp())
    desde_ts = int(datetime.datetime.strptime(DESDE, "%Y-%m-%d").replace(tzinfo=datetime.UTC).timestamp())
    dias_1d = int((hasta_ts - desde_ts) / 86400) + 120
    horas_4h = int((hasta_ts - desde_ts) / 14400) + 120

    candles_1d = traer_rango(SYMBOL, "1D", dias_1d, hasta_ts * 1000)
    candles_1d = [c for c in candles_1d if c[0] <= hasta_ts]
    candles_4h = traer_rango(SYMBOL, "4H", horas_4h, hasta_ts * 1000)
    candles_4h = [c for c in candles_4h if c[0] <= hasta_ts]

    activo, trend, atr_pct, lado = ruptura._detectar(candles_1d)

    # setup()/SL en cada dia de entrada conocido, usando SOLO velas de 4H hasta ese
    # instante (walk-forward real, igual que hace el bot en vivo)
    setups = {}
    for dia_str in DIAS_ENTRADA_CONOCIDOS:
        dia_ts = int(datetime.datetime.strptime(dia_str, "%Y-%m-%d").replace(tzinfo=datetime.UTC).timestamp())
        c1d_hasta = [c for c in candles_1d if c[0] <= dia_ts]
        c4h_hasta = [c for c in candles_4h if c[0] <= dia_ts + 3600]  # 1a vela de 4H de ese dia
        if len(c1d_hasta) < ruptura.MIN_VELAS_1D or len(c4h_hasta) < 30:
            continue
        estado = ruptura.estado_regimen(c1d_hasta)
        m4 = ta.compute(SYMBOL, "4H", c4h_hasta[-320:])
        entrada = ruptura.setup(estado, m4)
        setups[dia_str] = {"estado": estado, "m4_price": m4["price"], "m4_atr": m4["atr"],
                            "m4_supports": m4["supports"], "m4_resistances": m4["resistances"],
                            "entrada": entrada}

    fixture = {
        "candles_1d": candles_1d,
        "activo": activo, "trend": trend, "atr_pct": atr_pct, "lado": lado,
        "setups": setups,
    }
    json.dump(fixture, open(FIXTURE, "w", encoding="utf-8"))
    print("Fixture guardado:", FIXTURE)
    print("Velas 1D:", len(candles_1d))
    print("Dias en RUPTURA (Python):", sum(activo))
    for dia_str, s in setups.items():
        print(dia_str, "->", s["entrada"])


if __name__ == "__main__":
    main()
