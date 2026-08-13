# -*- coding: utf-8 -*-
"""Congela velas reales (1D/4H de XRP y BTC) y la senal que produce
engine/impulso.py (Python) en varios instantes conocidos, para comparar contra
impulso.ts.

USO:  python tools/paridad/capturar_impulso.py
"""
import sys, os, json, datetime

BOT = r"C:\Users\Brahian\xrp-signal-bot"
TRADING_B = r"C:\Users\Brahian\Trading-B\tools"
sys.path.insert(0, BOT)
sys.path.insert(0, TRADING_B)
from engine import impulso                          # noqa: E402
from test_zonas import traer_rango                   # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(AQUI, "fixture_impulso.json")

SYMBOL, DIR = "XRPUSDT", "BTCUSDT"
HASTA = "2026-08-13"
# instantes conocidos: la senal real de nov-2024 (long) + un instante actual (probable None)
INSTANTES = ["2024-11-22T04:00", "2026-08-12T20:00"]


def main():
    hasta_ts = int(datetime.datetime.strptime(HASTA, "%Y-%m-%d").replace(tzinfo=datetime.UTC).timestamp())
    cx_full = traer_rango(SYMBOL, "4H", 4400, hasta_ts * 1000)
    cx_full = [c for c in cx_full if c[0] <= hasta_ts]
    cb_full = traer_rango(DIR, "4H", 4400, hasta_ts * 1000)
    cb_full = [c for c in cb_full if c[0] <= hasta_ts]

    casos = {}
    for iso in INSTANTES:
        t = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M").replace(tzinfo=datetime.UTC)
        obj = int(t.timestamp())
        i = next((idx for idx, c in enumerate(cx_full) if c[0] == obj), None)
        if i is None:
            continue
        cb_hasta = [c for c in cb_full if c[0] <= cx_full[i][0]]
        s = impulso.señal(cx_full[:i + 1], cb_hasta)
        # guardar TODA la historia usada (no recortar) -- el ATR de Wilder de 50
        # periodos depende de la 'semilla' de todos los TR anteriores; recortar
        # cambia el resultado por varios puntos base aunque converja con el tiempo.
        casos[iso] = {"velas_sym": cx_full[:i + 1], "velas_dir": cb_hasta, "señal": s}

    json.dump({"casos": casos}, open(FIXTURE, "w", encoding="utf-8"))
    print("Fixture guardado:", FIXTURE)
    for iso, c in casos.items():
        print(iso, "->", c["señal"])


if __name__ == "__main__":
    main()
