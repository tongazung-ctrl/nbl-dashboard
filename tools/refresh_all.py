#!/usr/bin/env python3
"""Daily refresh for GitHub Actions or the box.

Updates:
  - data/daily.json district weather (Open-Meteo)
  - data/villages_daily.json cell forecasts (Open-Meteo ECMWF IFS) + ThaiWater rain
  - data/air.json (Air4Thai 115t + Open-Meteo AQ)
  - data/rain_alerts.json (stations vs official TMD thresholds in config)

Leaves prices, TMD official table, attractions, climate, calendar, aid links unchanged
unless those sources are updated in a separate curated step.

Never invents numbers. If a source fails, keeps the previous file.
"""
from __future__ import annotations

import json
import math
import ssl
import subprocess
import sys
import time
import traceback
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# allow running as "python tools/refresh_all.py" from repo root
ROOT = Path(__file__).resolve().parents[1]
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

TZ = ZoneInfo("Asia/Bangkok")
UA = "NBL-Dashboard/1.0 (https://tongazung-ctrl.github.io/nbl-dashboard/; public civic dashboard)"
DATA = ROOT / "data"


def log(msg: str) -> None:
    print(msg, flush=True)


def http_get(url: str, insecure=False, timeout=90) -> bytes:
    last = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,*/*"})
            ctx = ssl._create_unverified_context() if insecure else ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.read()
        except Exception as e:
            last = e
            time.sleep(1.5 * attempt)
    cmd = ["curl", "-sS", "-L", "--max-time", str(int(timeout)), "-A", UA, "-H", "Accept: application/json,*/*"]
    if insecure:
        cmd.append("-k")
    cmd.append(url)
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode == 0 and p.stdout:
        return p.stdout
    raise last if last is not None else RuntimeError("http_get failed")


def hav(lat1, lon1, lat2, lon2):
    R = 6371
    la1, lo1, la2, lo2 = map(math.radians, (lat1, lon1, lat2, lon2))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def save(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def refresh_district_weather_here() -> None:
    sys.path.insert(0, str(ROOT / "tools"))
    import refresh_public_data as rpd
    daily_path = DATA / "daily.json"
    daily = json.loads(daily_path.read_text(encoding="utf-8"))
    rpd.refresh_weather(daily)
    save(daily_path, daily)
    log("updated daily.json weather " + daily.get("wx_at", ""))


def om_cells(cells):
    lats = ",".join(str(c[0]) for c in cells)
    lons = ",".join(str(c[1]) for c in cells)
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code"
        "&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,weather_code"
        "&timezone=Asia%2FBangkok&forecast_days=7&models=ecmwf_ifs"
    )
    data = json.loads(http_get(url, timeout=60))
    return data if isinstance(data, list) else [data]


def refresh_villages() -> None:
    path = DATA / "villages_daily.json"
    vd = json.loads(path.read_text(encoding="utf-8"))
    cells = vd["cells"]
    # rebuild point list from static file to refresh nearest stations
    static = json.loads((DATA / "villages_static.json").read_text(encoding="utf-8"))
    pts = [(t["lat"], t["lon"]) for t in static["tambons"]] + [(v["lat"], v["lon"]) for v in static["villages"]]
    if len(pts) != len(vd["cell_of"]):
        raise RuntimeError(f"point count {len(pts)} != cell_of {len(vd['cell_of'])}")
    rows = om_cells(cells)
    if len(rows) != len(cells):
        raise RuntimeError(f"open-meteo cells {len(rows)} != {len(cells)}")
    wx = []
    at = None
    for r in rows:
        c, d = r["current"], r["daily"]
        at = c["time"]
        wx.append({
            "c": [c["temperature_2m"], c["relative_humidity_2m"], c["precipitation"], c["weather_code"]],
            "d": [
                [d["temperature_2m_min"][j], d["temperature_2m_max"][j],
                 d["precipitation_probability_max"][j] or 0, d["precipitation_sum"][j] or 0, d["weather_code"][j]]
                for j in range(len(d["time"]))
            ],
            "dates": d["time"],
        })
    # ThaiWater
    raw = json.loads(http_get("https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h", timeout=90))["data"]
    la0 = min(p[0] for p in pts) - 0.35
    la1 = max(p[0] for p in pts) + 0.35
    lo0 = min(p[1] for p in pts) - 0.35
    lo1 = max(p[1] for p in pts) + 0.35
    S = []
    for x in raw:
        s = x.get("station") or {}
        try:
            la = float(s["tele_station_lat"]); lo = float(s["tele_station_long"])
        except Exception:
            continue
        if not (la0 < la < la1 and lo0 < lo < lo1):
            continue
        g = x.get("geocode") or {}
        S.append({
            "n": (s.get("tele_station_name") or {}).get("th", ""),
            "lat": la, "lon": lo,
            "r24": x.get("rain_24h"), "r1": x.get("rain_1h"),
            "t": x.get("rainfall_datetime", ""),
            "ag": ((x.get("agency") or {}).get("agency_shortname") or {}).get("th", ""),
            "amp": (g.get("amphoe_name") or {}).get("th", ""),
            "prov": (g.get("province_name") or {}).get("th", ""),
        })
    if not S:
        raise RuntimeError("no ThaiWater stations in bbox")
    near = []
    for la, lo in pts:
        best = min(range(len(S)), key=lambda j: hav(la, lo, S[j]["lat"], S[j]["lon"]))
        near.append([best, round(hav(la, lo, S[best]["lat"], S[best]["lon"]), 1)])
    used = sorted(set(n[0] for n in near))
    remap = {o: i for i, o in enumerate(used)}
    S = [S[o] for o in used]
    near = [[remap[n[0]], n[1]] for n in near]
    vd = {"at": at, "cells": cells, "cell_of": vd["cell_of"], "wx": wx, "stations": S, "near": near}
    save(path, vd)
    log(f"updated villages_daily.json at={at} stations={len(S)}")


def refresh_air_and_alerts() -> None:
    # reuse build_phase1 functions with path-safe imports
    sys.path.insert(0, str(ROOT / "tools"))
    import build_phase1 as b
    # point DATA in that module to this repo
    b.DATA = DATA
    aqi_scale = json.loads((DATA / "config/aqi_scale.json").read_text(encoding="utf-8"))
    rain_cfg = json.loads((DATA / "config/rain_thresholds.json").read_text(encoding="utf-8"))
    save(DATA / "air.json", b.build_air(aqi_scale))
    log("updated air.json")
    save(DATA / "rain_alerts.json", b.build_alerts(rain_cfg))
    log("updated rain_alerts.json")


def main() -> int:
    failed = []
    for name, fn in [
        ("district_weather", refresh_district_weather_here),
        ("villages", refresh_villages),
        ("air_alerts", refresh_air_and_alerts),
    ]:
        try:
            fn()
        except Exception as e:
            failed.append(name)
            log(f"WARN {name} failed, kept previous file: {e}")
            traceback.print_exc()
    if failed:
        log("completed with warnings: " + ", ".join(failed))
        return 0  # do not fail the workflow if some sources are down
    log("all refresh steps ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
