# -*- coding: utf-8 -*-
"""Congela velas reales en un fixture y guarda lo que produce el motor Python.

Asi la comparacion con TypeScript usa EXACTAMENTE los mismos datos y cualquier
diferencia es una diferencia de logica, no del mercado moviendose.

USO:  python tools/paridad/capturar.py
"""
import sys, os, json

BOT = r"C:\Users\Brahian\xrp-signal-bot"
sys.path.insert(0, BOT)
from engine import bitget, ta, signal, params           # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(AQUI, "fixture.json")

TFS = ["1D", "4H", "1H", "15m"]
P = params.load(os.path.join(BOT, "params.json"))


def capturar(symbol):
    return {tf: bitget.candles(symbol, tf, 300) for tf in TFS}


def main():
    velas = {s: capturar(s) for s in (P["SYMBOL"], P["DIRECTOR_SYMBOL"])}
    tickers = {s: bitget.futures_info(s) for s in velas}
    contrato = bitget.contract(P["SYMBOL"])   # specs reales: min y step de la orden

    # Motor Python sobre esas velas exactas: parcheamos la capa de datos.
    orig_c, orig_f = bitget.candles, bitget.futures_info
    bitget.candles = lambda s, tf, limit=300, market="futures": velas[s][tf]
    bitget.futures_info = lambda s: tickers[s]
    try:
        class Cfg: pass
        params.apply_to(Cfg, os.path.join(BOT, "params.json"))
        d = signal.evaluate(P["SYMBOL"], 13.45, Cfg)
    finally:
        bitget.candles, bitget.futures_info = orig_c, orig_f

    esperado = {k: d.get(k) for k in
                ("decision", "score", "grade", "side", "reason", "price",
                 "zona15", "zona4", "zona1d", "pos1d", "gauge", "director", "sl", "tp1", "tp2")}
    if d.get("sizing"):
        esperado["qty"] = d["sizing"]["qty"]
        esperado["risk_pct"] = d["sizing"]["risk_pct"]
        esperado["dist_pct"] = d["sizing"]["dist_pct"]

    json.dump({"velas": velas, "tickers": tickers, "contrato": contrato,
               "saldo": 13.45, "esperado": esperado},
              open(FIXTURE, "w", encoding="utf-8"), indent=1)
    print("Fixture guardado:", FIXTURE)
    print(json.dumps(esperado, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
