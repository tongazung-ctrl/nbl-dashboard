#!/usr/bin/env python3
"""Refresh public-site daily weather (Open-Meteo) and copy village weather JSON.

Prices, TMD official forecast, and series are NOT invented here.
Update those in data/daily.json when the dashboard routine has new values
(see PUBLISH_HOWTO.md and /workspace/nbl_dashboard/UPDATE_HOWTO.md).

Usage:
  python3 tools/refresh_public_data.py
  python3 tools/refresh_public_data.py --src /workspace/nbl_dashboard --dest /workspace/nbl_site/data
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Bangkok")
BE = 543
TH_WD = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
WCODE = {
    0: "แจ่มใส", 1: "ส่วนใหญ่แจ่มใส", 2: "มีเมฆบางส่วน", 3: "เมฆมาก",
    45: "หมอก", 48: "หมอก", 51: "ฝนปรอยเล็กน้อย", 53: "ฝนปรอย", 55: "ฝนปรอยหนัก",
    61: "ฝนเล็กน้อย", 63: "ฝนปานกลาง", 65: "ฝนหนัก", 80: "ฝนซู่", 81: "ฝนซู่",
    82: "ฝนซู่หนัก", 95: "พายุฝนฟ้าคะนอง", 96: "พายุฝนฟ้าคะนอง", 99: "พายุฝนฟ้าคะนอง",
}


def wdesc(code) -> str:
    return WCODE.get(int(code), f"รหัส {code}")


def thai_day(iso: str) -> str:
    d = datetime.fromisoformat(iso).date()
    return f"{TH_WD[d.weekday()]} {d.day}"


def thai_now_label(dt: datetime) -> str:
    return f"{dt.day} {TH_MON[dt.month]} {dt.year + BE} เวลา {dt:%H:%M} น. (เวลาไทย)"


def thai_wx_at(iso: str) -> str:
    dt = datetime.fromisoformat(iso)
    return f"{dt:%H:%M} น. {dt.day} {TH_MON[dt.month]} {str(dt.year + BE)[2:]}"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fetch(url: str):
    last = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nbl-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(1.5 * attempt)
    p = subprocess.run(
        ["curl", "-sS", "-L", "--max-time", "45", "-A", "nbl-dashboard/1.0", url],
        capture_output=True, text=True,
    )
    if p.returncode == 0 and p.stdout:
        return json.loads(p.stdout)
    raise last if last is not None else RuntimeError("fetch failed")


def refresh_weather(daily: dict) -> None:
    lats = ",".join(str(w["lat"]) for w in daily["weather"])
    lons = ",".join(str(w["lon"]) for w in daily["weather"])
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,"
        "precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,uv_index_max"
        "&timezone=Asia%2FBangkok&forecast_days=7"
    )
    data = fetch(url)
    rows = data if isinstance(data, list) else [data]
    days_iso = None
    wx_iso = None
    for w, row in zip(daily["weather"], rows):
        c, d = row["current"], row["daily"]
        w["c"] = [c["temperature_2m"], c["apparent_temperature"], c["relative_humidity_2m"],
                  c["wind_speed_10m"], c["precipitation"], wdesc(c["weather_code"])]
        w["code"] = c["weather_code"]
        w["dates"] = d["time"]
        w["d"] = [
            [d["temperature_2m_min"][k], d["temperature_2m_max"][k], d["precipitation_probability_max"][k],
             d["precipitation_sum"][k], d["wind_speed_10m_max"][k], d["relative_humidity_2m_mean"][k],
             wdesc(d["weather_code"][k])]
            for k in range(len(d["time"]))
        ]
        w["codes"] = d["weather_code"]
        w["uv"] = d["uv_index_max"]
        days_iso = d["time"]
        wx_iso = c["time"]
    now = datetime.now(TZ)
    daily["days_iso"] = days_iso
    daily["days"] = [thai_day(x) for x in days_iso]
    daily["wx_at_iso"] = wx_iso
    daily["wx_at"] = thai_wx_at(wx_iso)
    daily["updated"] = thai_now_label(now)
    daily["fetched_at"] = now.strftime("%Y-%m-%d %H:%M") + " (UTC+7)"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/workspace/nbl_dashboard")
    ap.add_argument("--dest", default="/workspace/nbl_site/data")
    ap.add_argument("--skip-open-meteo", action="store_true")
    args = ap.parse_args()
    src, dest = Path(args.src), Path(args.dest)
    daily_path = dest / "daily.json"
    daily = load(daily_path)
    if not args.skip_open_meteo:
        refresh_weather(daily)
        daily_path.write_text(json.dumps(daily, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("updated", daily_path, "wx_at", daily["wx_at"], "updated", daily["updated"])
    vill_src = src / "villages_daily.json"
    if vill_src.exists():
        shutil.copy2(vill_src, dest / "villages_daily.json")
        print("copied villages_daily.json from", vill_src)
    else:
        print("no villages_daily.json at", vill_src, "(left existing public file)")


if __name__ == "__main__":
    main()
