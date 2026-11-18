#!/usr/bin/env python3
"""Build Phase 1 public data: attractions, air, climate, rain alerts, aid links, crop calendar.

Does not invent coordinates or official thresholds. Corrections are cited (OSM / official pages).
"""
from __future__ import annotations

import csv
import json
import math
import ssl
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Bangkok")
UA = "NBL-Dashboard/1.0 (https://tongazung-ctrl.github.io/nbl-dashboard/; public civic dashboard)"
SITE = Path("/workspace/nbl_site")
DATA = SITE / "data"
CFG = DATA / "config"
EXP = Path("/workspace/nbl_expansion")
TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

# In-province padded box from village/tambon extrema in villages_static.json (plus small margin already in data)
# Used only as a first filter; TAT points inside the box can still be flagged if they contradict district clusters.
LAT_MIN, LAT_MAX = 16.70, 17.72
LON_MIN, LON_MAX = 101.90, 102.75

# Known TAT errors and OSM-verified replacements (queried 2026-11-19)
COORD_FIXES = {
    "ภูพานน้อย": {
        "lat": 17.1931223, "lon": 102.4752416,
        "status": "corrected",
        "coord_source": "OpenStreetMap Nominatim (จุดชมวิว ภูพานน้อย, อ.เมืองหนองบัวลำภู)",
        "note": "พิกัดในชุด ททท. อยู่ที่ประมาณ 7.88, 98.39 ซึ่งอยู่นอกภาคอีสาน จึงไม่ใช้ และแทนด้วยพิกัด OSM ในจังหวัด",
    },
    "วัดสันติธรรมบรรพต": {
        "lat": 17.2954911, "lon": 102.1880301,
        "status": "corrected",
        "coord_source": "OpenStreetMap Nominatim (วัดสันติธรรมบรรพต, อ.นากลาง)",
        "note": "พิกัดในชุด ททท. (17.14269, 102.39221) ซ้ำกับพีซี แรนซ์ ฟาร์ม และไม่อยู่ในอำเภอนากลางตามที่ระบุ จึงไม่ใช้",
    },
    "วัดถ้ำเอราวัณ": {
        "lat": 17.3451076, "lon": 102.0185995,
        "status": "corrected",
        "coord_source": "OpenStreetMap Nominatim (วัดถ้ำเอราวัณ / ถ้ำเอราวัณ)",
        "note": "พิกัดลองจิจูดในชุด ททท. ประมาณ 102.61 ไม่สอดคล้องกับกลุ่มจุดในอำเภอนาวัง (ราว 102.04–102.12) จึงไม่ใช้ ใช้พิกัด OSM แทน หมายเหตุ: OSM ระบุเขตการปกครองเป็นอำเภอเอราวัณ จังหวัดเลย แต่ ททท. ระบุตำบลเทพคีรี อำเภอนาวัง และอบจ. ระบุบ้านผาอินทร์แปลง ตำบลวังทอง อำเภอนาวัง จังหวัดหนองบัวลำภู จึงติดป้ายความต่างนี้ไว้",
        "admin_conflict": True,
    },
}

DROP_FROM_MAP = {
    "เจดีย์หลวงปู่ขาว": "พิกัดในชุด ททท. อยู่ที่ประมาณ 19.58, 99.49 ซึ่งอยู่นอกจังหวัด ค้น OSM เมื่อ 19 พ.ย. 2569 ไม่พบจุดชื่อเจดีย์นี้โดยตรง (พบเพียงพิพิธภัณฑ์อัฐบริขาร หลวงปู่ขาว อนาลโย ใกล้วัดถ้ำกลองเพล) จึงไม่ปักหมุด รายชื่อยังแสดงไว้ให้ค้น",
}

NEARBY_TRIPS = [
    {
        "name": "ทะเลบัวแดง",
        "province": "อุดรธานี",
        "district": "กุมภวาปี",
        "lat": 17.1715265,
        "lon": 103.0329930,
        "coord_source": "OpenStreetMap Nominatim (ทะเลบัวแดง, อ.กุมภวาปี จ.อุดรธานี) 19 พ.ย. 2569",
        "note": "ไม่อยู่ในจังหวัดหนองบัวลำภู เป็นทริปใกล้เคียงวันเดียว จากหนองบัวลำภูไปกุมภวาปี ห้ามปักในแผนที่ว่าเป็นสถานที่ของจังหวัด",
        "season_note": "แหล่ง DASTA ระบุสถานที่นี้ที่บึงหนองหาน อำเภอกุมภวาปี จังหวัดอุดรธานี",
        "src": "https://smartdastaapp.dasta.or.th/place/614?lang=th",
        "maps": None,
    }
]


def now_iso() -> str:
    return datetime.now(TZ).strftime("%Y-%m-%dT%H:%M")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(SITE)} ({path.stat().st_size:,} bytes)")


def http_get(url: str, insecure=False, timeout=40) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})
    ctx = ssl._create_unverified_context() if insecure else ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return r.read()


def project(lon, lat, proj):
    x = (lon - proj["lon0"]) * proj["cos"] * proj["K"]
    y = (proj["lat1"] - lat) * proj["K"]
    return [round(x, 1), round(y, 1)]


def maps_links(lat, lon, name=""):
    dest = f"{lat},{lon}"
    return {
        "google_dir": f"https://www.google.com/maps/dir/?api=1&destination={dest}",
        "apple_dir": f"https://maps.apple.com/?daddr={dest}",
        "geo": f"geo:{dest}",
    }


def parse_loc(s):
    if not s or not str(s).strip() or str(s).strip() in "-":
        return None
    parts = [p.strip() for p in str(s).replace(" ", "").split(",") if p.strip()]
    if len(parts) < 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        return None


def in_box(lat, lon):
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def classify_level(mm, levels):
    if mm is None:
        return None
    try:
        v = float(mm)
    except (TypeError, ValueError):
        return None
    for lv in levels:
        lo = lv["min_mm"]
        hi = lv["max_mm"]
        if lo is None and hi is not None and v <= hi:
            return lv
        if lo is not None and hi is None and v >= lo:
            return lv
        if lo is not None and hi is not None and lo <= v <= hi:
            return lv
    return None


def aqi_level(scale, aqi_val=None, color_id=None):
    if color_id is not None:
        for lv in scale["levels"]:
            if str(lv["id"]) == str(color_id):
                return lv
    if aqi_val is not None:
        try:
            v = float(aqi_val)
        except (TypeError, ValueError):
            return None
        for lv in scale["levels"]:
            lo, hi = lv["aqi_min"], lv["aqi_max"]
            if hi is None and v >= lo:
                return lv
            if hi is not None and lo <= v <= hi:
                return lv
    return None


def build_attractions(proj):
    rows = list(csv.DictReader((EXP / "_tat_nbl_attractions.tsv").open(encoding="utf-8"), delimiter="\t"))
    items = []
    dropped_empty = 0
    for r in rows:
        name = (r.get("ATT_NAME_TH") or "").strip()
        if not name:
            dropped_empty += 1
            continue
        loc = parse_loc(r.get("ATT_LOCATION"))
        rec = {
            "name": name,
            "name_en": (r.get("ATT_NAME_EN") or "").strip() or None,
            "district": (r.get("DISTRICT_NAME_TH") or "").strip() or None,
            "subdistrict": (r.get("SUBDISTRICT_NAME_TH") or "").strip() or None,
            "category": (r.get("ATT_CATEGORY_LABEL") or "").strip() or None,
            "type": (r.get("ATT_TYPE_LABEL") or "").strip() or None,
            "phone": None if (r.get("ATT_TEL") or "").strip() in ("", "-") else (r.get("ATT_TEL") or "").strip(),
            "website": (r.get("ATT_WEBSITE") or "").strip() or None,
            "hours": (r.get("ATT_START_END") or "").strip() or None,
            "tat_lat": loc[0] if loc else None,
            "tat_lon": loc[1] if loc else None,
            "on_map": False,
            "status": "ok",
            "source": "ชุดข้อมูลแหล่งท่องเที่ยว การท่องเที่ยวแห่งประเทศไทย (datacatalog.tat.or.th)",
            "source_url": "https://datacatalog.tat.or.th/dataset/tourist-attraction",
        }
        if name in DROP_FROM_MAP:
            rec.update({
                "status": "uncertain_no_pin",
                "lat": None, "lon": None,
                "note": DROP_FROM_MAP[name],
                "on_map": False,
            })
            items.append(rec)
            continue
        if name in COORD_FIXES:
            fx = COORD_FIXES[name]
            rec.update({
                "lat": fx["lat"], "lon": fx["lon"],
                "status": fx["status"],
                "coord_source": fx["coord_source"],
                "note": fx["note"],
                "on_map": True,
            })
            rec["xy"] = project(fx["lon"], fx["lat"], proj)
            rec["nav"] = maps_links(fx["lat"], fx["lon"], name)
            items.append(rec)
            continue
        if not loc:
            rec.update({"status": "no_coord", "lat": None, "lon": None, "note": "ชุด ททท. ไม่มีพิกัด จึงไม่ปักหมุด", "on_map": False})
            items.append(rec)
            continue
        lat, lon = loc
        if not in_box(lat, lon):
            rec.update({
                "status": "outside_dropped",
                "lat": None, "lon": None,
                "note": f"พิกัดในชุด ททท. ({lat}, {lon}) อยู่นอกกรอบจังหวัด จึงไม่ปักหมุดและไม่ใช้ค่านี้",
                "on_map": False,
            })
            items.append(rec)
            continue
        rec.update({"lat": lat, "lon": lon, "status": "tat", "coord_source": "พิกัดตามชุด ททท. อยู่ในกรอบจังหวัด", "on_map": True})
        rec["xy"] = project(lon, lat, proj)
        rec["nav"] = maps_links(lat, lon, name)
        # district vs name hint (กุดแห่ is in นากลาง)
        if "กุดแห่" in name and rec["district"] and rec["district"] != "นากลาง":
            rec["note"] = (rec.get("note") or "") + " ชุด ททท. ระบุอำเภอว่า “" + rec["district"] + "” แต่ชื่อสถานที่อ้างถึงกุดแห่ซึ่งอยู่ในอำเภอนากลาง จึงติดป้ายให้ตรวจสอบเขต"
            rec["status"] = "flag_district"
        items.append(rec)

    nearby = []
    for t in NEARBY_TRIPS:
        row = dict(t)
        row["nav"] = maps_links(t["lat"], t["lon"], t["name"])
        row["on_map_province"] = False
        nearby.append(row)

    return {
        "updated": now_iso(),
        "source": "การท่องเที่ยวแห่งประเทศไทย Open Data Common ชุด tourist-attraction กรองจังหวัดหนองบัวลำภู แล้วตรวจพิกัดกับกรอบจังหวัดและ OSM Nominatim เมื่อ 19 พ.ย. 2569",
        "source_url": "https://datacatalog.tat.or.th/dataset/tourist-attraction",
        "osm_credit": "© OpenStreetMap contributors (ODbL) สำหรับพิกัดที่แก้ไขจาก OSM",
        "counts": {
            "listed": len(items),
            "on_map": sum(1 for i in items if i["on_map"]),
            "corrected": sum(1 for i in items if i["status"] == "corrected"),
            "uncertain": sum(1 for i in items if i["status"] in ("uncertain_no_pin", "outside_dropped", "no_coord")),
            "empty_rows_dropped": dropped_empty,
        },
        "items": items,
        "nearby_trips": nearby,
    }


def build_air(aqi_scale):
    station = None
    air4_note = "ดึงจาก Air4Thai JSON"
    try:
        raw = http_get("https://air4thai.pcd.go.th/services/getNewAQI_JSON.php")
        air4_note += " (ตรวจใบรับรอง TLS ผ่าน)"
        ssl_ok = True
    except Exception as e:
        raw = http_get("https://air4thai.pcd.go.th/services/getNewAQI_JSON.php", insecure=True)
        air4_note += f" (เซิร์ฟเวอร์มีปัญหาใบรับรอง TLS จึงดึงแบบไม่ตรวจสายใบรับรอง: {type(e).__name__})"
        ssl_ok = False
    data = json.loads(raw)
    for s in data.get("stations") or []:
        if s.get("stationID") == "115t":
            station = s
            break
    if not station:
        raise RuntimeError("Air4Thai station 115t not found")
    last = station.get("AQILast") or {}
    pm = last.get("PM25") or {}
    aqi = last.get("AQI") or {}
    level = aqi_level(aqi_scale, aqi.get("aqi"), pm.get("color_id") or aqi.get("color_id"))
    st_out = {
        "id": "115t",
        "name": station.get("nameTH"),
        "area": station.get("areaTH"),
        "lat": float(station["lat"]),
        "lon": float(station["long"]),
        "date": last.get("date"),
        "time": last.get("time"),
        "pm25": float(pm["value"]) if pm.get("value") not in (None, "") else None,
        "aqi": int(float(aqi["aqi"])) if aqi.get("aqi") not in (None, "") else None,
        "aqi_param": aqi.get("param"),
        "color_id": aqi.get("color_id") or pm.get("color_id"),
        "level": level,
        "pollutants": {
            k: last[k] for k in ("PM25", "PM10", "O3", "CO", "NO2", "SO2", "AQI") if k in last
        },
        "source": "Air4Thai กรมควบคุมมลพิษ รหัสสถานี 115t",
        "source_url": "https://air4thai.pcd.go.th/services/getNewAQI_JSON.php",
        "fetch_note": air4_note,
        "ssl_verified": ssl_ok,
    }
    # Open-Meteo AQ at the station coordinates
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={station['lat']}&longitude={station['long']}"
        "&current=pm2_5,pm10,us_aqi,european_aqi"
        "&hourly=pm2_5,pm10,us_aqi&forecast_days=5&timezone=Asia%2FBangkok"
    )
    om = json.loads(http_get(url))
    cur = om.get("current") or {}
    hourly = om.get("hourly") or {}
    # daily max PM2.5 from hourly for the next days (model, not station)
    by_day = defaultdict(list)
    for t, v in zip(hourly.get("time") or [], hourly.get("pm2_5") or []):
        if v is None:
            continue
        by_day[t[:10]].append(v)
    forecast = [{"date": d, "pm25_max": round(max(vs), 1), "pm25_mean": round(sum(vs) / len(vs), 1)} for d, vs in by_day.items()]
    return {
        "updated": now_iso(),
        "station": st_out,
        "model": {
            "name": "Open-Meteo Air Quality (โมเดล ไม่ใช่ค่าวัดสถานี)",
            "source_url": "https://open-meteo.com/en/docs/air-quality-api",
            "lat": float(station["lat"]),
            "lon": float(station["long"]),
            "current": cur,
            "forecast_daily": forecast,
            "note": "ค่า US AQI ในโมเดลนี้ไม่ใช่ดัชนีคุณภาพอากาศของประเทศไทย ใช้ดูแนวโน้ม PM2.5 เป็นหลัก และเทียบสีด้วยสเกลไทยจากไฟล์ตั้งค่าเมื่อพูดถึงค่าโมเดล PM2.5",
        },
        "scale_source": aqi_scale["source"],
    }


def build_climate():
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        "?latitude=17.2042&longitude=102.4405"
        "&start_date=2020-01-01&end_date=2024-12-31"
        "&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FBangkok"
    )
    # reuse fetched file if present and complete
    cache = Path("/tmp/nbl_fetch/om_hist.json")
    if cache.exists() and cache.stat().st_size > 1000:
        hist = json.loads(cache.read_text())
    else:
        hist = json.loads(http_get(url, timeout=60))
    days = hist["daily"]["time"]
    temps = hist["daily"]["temperature_2m_mean"]
    rains = hist["daily"]["precipitation_sum"]
    acc = {m: {"t": [], "r": []} for m in range(1, 13)}
    # monthly totals then average across years
    month_year = defaultdict(lambda: {"t": [], "r": 0.0, "n": 0})
    for d, t, r in zip(days, temps, rains):
        if t is None or r is None:
            continue
        y, m, _ = d.split("-")
        key = (int(y), int(m))
        month_year[key]["t"].append(t)
        month_year[key]["r"] += r
        month_year[key]["n"] += 1
    by_m = {m: {"temps": [], "rains": []} for m in range(1, 13)}
    for (y, m), v in month_year.items():
        if v["n"] < 28:
            continue
        by_m[m]["temps"].append(sum(v["t"]) / len(v["t"]))
        by_m[m]["rains"].append(v["r"])
    months = []
    for m in range(1, 13):
        ts, rs = by_m[m]["temps"], by_m[m]["rains"]
        months.append({
            "month": m,
            "label": TH_MON[m - 1],
            "temp_mean": round(sum(ts) / len(ts), 1) if ts else None,
            "rain_mean": round(sum(rs) / len(rs), 1) if rs else None,
            "years": len(ts),
        })
    rains = [x["rain_mean"] for x in months if x["rain_mean"] is not None]
    temps = [x["temp_mean"] for x in months if x["temp_mean"] is not None]
    rain_med = sorted(rains)[len(rains) // 2]
    temp_med = sorted(temps)[len(temps) // 2]
    # relative conditions from this series only (no invented official monthly thresholds)
    for x in months:
        x["cooler_than_median"] = x["temp_mean"] is not None and x["temp_mean"] <= temp_med
        x["drier_than_median"] = x["rain_mean"] is not None and x["rain_mean"] <= rain_med
        x["relatively_cool_and_dry"] = x["cooler_than_median"] and x["drier_than_median"]
    official = {
        "annual_rain_normal_mm": 1290.4,
        "station": "สอต.หนองบัวลำภู",
        "period": "ค่าปกติฝนรวม 30 ปี ตามตารางเปิดของศูนย์อุตุนิยมวิทยาภาคตะวันออกเฉียงเหนือตอนบน (ตรวจในรายงานวิจัย 19 พ.ย. 2569)",
        "source_url": "https://khonkaen.tmd.go.th/open-government-data/",
        "note": "มีค่ายืนยันได้เป็นปริมาณฝนรวมทั้งปี ไม่ใช่ค่าปกติรายเดือน ดังนั้นกราฟรายเดือนด้านล่างเป็นชุด Open-Meteo ปี 2020–2024 ไม่ใช่ค่าปกติ 30 ปีของ ทส.",
    }
    seasons = {
        "source": "กรมอุตุนิยมวิทยา ฤดูกาลของประเทศไทย",
        "source_url": "https://tmd.go.th/info/%E0%B8%A4%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A5%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%97%E0%B8%A8%E0%B9%84%E0%B8%97%E0%B8%A2",
        "checked": "2026-11-19",
        "items": [
            {"id": "summer", "label": "ฤดูร้อน", "text": "เริ่มต้นประมาณกลางเดือนกุมภาพันธ์ถึงกลางเดือนพฤษภาคม"},
            {"id": "rainy", "label": "ฤดูฝน", "text": "เริ่มต้นประมาณกลางเดือนพฤษภาคมถึงกลางเดือนตุลาคม"},
            {"id": "winter", "label": "ฤดูหนาว", "text": "เริ่มต้นประมาณกลางเดือนตุลาคมถึงกลางเดือนกุมภาพันธ์ เมื่อมรสุมตะวันออกเฉียงเหนือพัดปกคลุม ประเทศไทยตอนบนจะเริ่มมีอากาศเย็นและฝนลดลง โดยเฉพาะภาคเหนือและภาคตะวันออกเฉียงเหนือ"},
        ],
    }
    return {
        "updated": now_iso(),
        "location": {"name": "ใกล้ตัวเมืองหนองบัวลำภู", "lat": 17.2042, "lon": 102.4405},
        "open_meteo": {
            "period": "2020-01-01 ถึง 2024-12-31",
            "source_url": "https://open-meteo.com/en/docs/historical-weather-api",
            "note": "ค่าเฉลี่ยรายเดือนจากโมเดลย้อนหลัง ไม่ใช่ค่าปกติ 30 ปีของกรมอุตุฯ",
            "months": months,
            "median_temp": temp_med,
            "median_rain": rain_med,
            "rule": "เดือนที่อุณหภูมิเฉลี่ยและฝนเฉลี่ยในชุดนี้ไม่สูงกว่ามัธยฐานของ 12 เดือน ถือเป็นช่วงที่โดยทั่วไปเย็นและแห้งกว่าในรอบปีของชุดนี้",
        },
        "tmd_official": official,
        "tmd_seasons": seasons,
    }


def build_alerts(rain_cfg):
    daily = json.loads((DATA / "villages_daily.json").read_text(encoding="utf-8"))
    levels = rain_cfg["rain_24h"]["levels"]
    levels_1h = rain_cfg["rain_1h"]["levels"]
    stations = []
    for s in daily.get("stations") or []:
        lv24 = classify_level(s.get("r24"), levels)
        lv1 = classify_level(s.get("r1"), levels_1h)
        stations.append({
            "n": s.get("n"), "amp": s.get("amp"), "prov": s.get("prov"),
            "ag": s.get("ag"), "t": s.get("t"),
            "r24": s.get("r24"), "r1": s.get("r1"),
            "level_24h": lv24["id"] if lv24 else None,
            "label_24h": lv24["label"] if lv24 else ("ไม่มีค่า" if s.get("r24") is None else None),
            "level_1h": lv1["id"] if lv1 else None,
            "label_1h": lv1["label"] if lv1 else ("ไม่มีค่า" if s.get("r1") is None else None),
        })
    order = {k: i for i, k in enumerate(["very_heavy", "heavy", "moderate", "light", "none", None])}
    stations.sort(key=lambda s: (order.get(s["level_24h"], 99), -(s["r24"] or -1)))
    highest = [s for s in stations if s["level_24h"] in ("heavy", "very_heavy")]
    return {
        "updated": daily.get("at"),
        "rain_obs_at": stations[0]["t"] if stations else None,
        "source": "ค่าฝนสถานีจาก ThaiWater สสน. เทียบเกณฑ์ปริมาณฝนของกรมอุตุนิยมวิทยาในไฟล์ตั้งค่า ไม่ใช่ประกาศเตือนภัยทางการของจังหวัด",
        "thaiwater_url": "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h",
        "threshold_source": rain_cfg["rain_24h"]["source"],
        "stations": stations,
        "warning_24h": highest,
        "disclaimer": "เป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำสั่งอพยพหรือประกาศภัยของ ปภ. หรือจังหวัด ดูประกาศทางการเพิ่มที่สำนักงานเกษตรและสหกรณ์จังหวัด",
        "official_situation_url": "https://www.opsmoac.go.th/nongbualamphu-news-situation",
    }


def build_aid():
    return {
        "updated": "2026-11-19",
        "note": "เป็นลิงก์ขั้นตอนและช่องทางราชการ ไม่ใช่ระบบยื่นแทนเกษตรกร และไม่มีตัวเลขยอดชดเชยฝังในหน้านี้ เพราะหลักเกณฑ์เปลี่ยนตามมติคณะรัฐมนตรีในแต่ละปี",
        "steps": [
            {"title": "ขึ้นทะเบียนเกษตรกร", "detail": "ติดต่อสำนักงานเกษตรอำเภอ/จังหวัด เพื่อขึ้นทะเบียนให้ตรงกับแปลงและพืชที่ปลูก", "url": "https://nongbualamphu.doae.go.th/", "org": "สำนักงานเกษตรจังหวัดหนองบัวลำภู"},
            {"title": "แจ้งความเสียหายเมื่อเกิดภัย", "detail": "เมื่อพืชเสียหายจากภัยธรรมชาติ ให้แจ้งหน่วยงานเกษตรในพื้นที่และติดตามสถานการณ์จังหวัด", "url": "https://www.opsmoac.go.th/nongbualamphu-news-situation", "org": "สำนักงานเกษตรและสหกรณ์จังหวัดหนองบัวลำภู"},
            {"title": "ประกันภัยพืชผล ธ.ก.ส.", "detail": "ดูรายละเอียดผลิตภัณฑ์ประกันภัยและช่องทางดิจิทัลของ ธ.ก.ส. จากหน้าทางการ ไม่คัดลอกหลักเกณฑ์ปีเก่ามาแสดงเป็นยอดเงิน", "url": "https://www.baac.or.th/products/insurance-services", "org": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"},
            {"title": "แอป/บริการ A Insure ของ ธ.ก.ส.", "detail": "ช่องทางดิจิทัลของ ธ.ก.ส. สำหรับงานประกันภัย", "url": "https://www.baac.or.th/products/digital/a-insure", "org": "ธ.ก.ส."},
            {"title": "กรมส่งเสริมการเกษตร", "detail": "ประกาศ หลักเกณฑ์ช่วยเหลือ และข่าวปีปัจจุบันของกรม", "url": "https://www.doae.go.th/", "org": "กรมส่งเสริมการเกษตร"},
        ],
    }


def build_calendar():
    # Only official, sourced framework. No invented month-by-month crop grid.
    return {
        "updated": "2026-11-19",
        "disclaimer": "ยังไม่พบตารางปฏิทินเพาะปลูกของจังหวัดแบบ JSON พร้อมใช้จากหน่วยงาน จึงไม่สมมติเดือนปลูก–เก็บเกี่ยวรายพืช ตารางด้านล่างเป็นกรอบฤดูอย่างเป็นทางการของกรมอุตุฯ ประกอบพยากรณ์ 7 วันที่มีอยู่ คำแนะนำเป็นเงื่อนไขจากไฟล์ตั้งค่า ไม่ใช่คำวินิจฉัยแทนเจ้าหน้าที่",
        "seasons_source": {
            "name": "กรมอุตุนิยมวิทยา ฤดูกาลของประเทศไทย",
            "url": "https://tmd.go.th/info/%E0%B8%A4%E0%B8%94%E0%B8%81%E0%B8%B2%E0%B8%A5%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B9%80%E0%B8%97%E0%B8%A8%E0%B9%84%E0%B8%97%E0%B8%A2",
            "checked": "2026-11-19",
        },
        "seasons": [
            {"id": "winter", "label": "ฤดูหนาว", "from": "กลางตุลาคม", "to": "กลางกุมภาพันธ์", "months": [10, 11, 12, 1, 2], "hint": "อากาศเย็นและฝนลดลงในภาคตะวันออกเฉียงเหนือ ตามคำอธิบายของกรมอุตุฯ"},
            {"id": "summer", "label": "ฤดูร้อน", "from": "กลางกุมภาพันธ์", "to": "กลางพฤษภาคม", "months": [2, 3, 4, 5], "hint": "ช่วงร้อนก่อนมรสุมตะวันตกเฉียงใต้ ตามกรมอุตุฯ"},
            {"id": "rainy", "label": "ฤดูฝน", "from": "กลางพฤษภาคม", "to": "กลางตุลาคม", "months": [5, 6, 7, 8, 9, 10], "hint": "มรสุมตะวันตกเฉียงใต้พัดปกคลุม มีช่วงฝนทิ้งช่วงได้ในบางปี ตามกรมอุตุฯ"},
        ],
        "crops": [
            {"name": "ข้าว", "note": "รายละเอียดรอบนาปี/นาปรังของแปลงในจังหวัด ให้ยืนยันกับสำนักงานเกษตรจังหวัด"},
            {"name": "มันสำปะหลัง", "note": "รายละเอียดช่วงปลูก–ขุดของแปลงในจังหวัด ให้ยืนยันกับสำนักงานเกษตรจังหวัด"},
            {"name": "อ้อย", "note": "รายละเอียดฤดูหีบและราคาอ้อยประจำปี เป็นประกาศส่วนกลาง/โรงงาน ดูข่าวปีนั้น"},
            {"name": "ยางพารา", "note": "การกรีดอาจชะลอเมื่อฝนหนักตามสภาพสวน ให้ดูพยากรณ์และเกณฑ์ฝนกรมอุตุฯ"},
        ],
        "local_office": {"name": "สำนักงานเกษตรจังหวัดหนองบัวลำภู", "url": "https://nongbualamphu.doae.go.th/"},
        "doae": {"name": "กรมส่งเสริมการเกษตร", "url": "https://www.doae.go.th/"},
        "advice_rules_file": "data/config/advice_rules.json",
    }


def build_advice_rules():
    return {
        "updated": "2026-11-19",
        "note": "เงื่อนไขอ่านระดับจาก data/config/rain_thresholds.json ไม่ฝังตัวเลขมิลลิเมตรในโค้ดหน้าเว็บ",
        "rules": [
            {
                "id": "station_heavy",
                "when": {"station_rain_24h_level": ["heavy", "very_heavy"]},
                "title": "สถานีฝนในพื้นที่เข้าเกณฑ์ฝนหนักของกรมอุตุฯ",
                "message": "มีสถานีวัดฝนที่ปริมาณ 24 ชั่วโมงเข้าเกณฑ์ฝนหนักหรือฝนหนักมากตามกรมอุตุนิยมวิทยา ควรระวังน้ำท่วมขังแปลง การเดินทาง และความชื้นผลผลิต แล้วติดตามประกาศจังหวัด",
            },
            {
                "id": "forecast_heavy",
                "when": {"forecast_daily_rain_level": ["heavy", "very_heavy"]},
                "title": "พยากรณ์ 7 วันมีวันที่เข้าเกณฑ์ฝนหนัก",
                "message": "พยากรณ์รายวันของจุดที่เลือกมีปริมาณฝนเข้าเกณฑ์ฝนหนักหรือฝนหนักมากของกรมอุตุฯ ช่วงนี้ไม่เหมาะกับงานที่ต้องการความแห้ง เช่น ตากผลผลิต และควรเตรียมการระบายน้ำ",
            },
            {
                "id": "forecast_dry_rainy_season",
                "when": {"season": "rainy", "forecast_7day_sum_level": ["none", "light"]},
                "title": "ฤดูฝนแต่ฝนสะสมพยากรณ์ 7 วันยังน้อย",
                "message": "อยู่ในกรอบฤดูฝนตามกรมอุตุฯ แต่ฝนรวม 7 วันของจุดที่เลือกยังอยู่ในเกณฑ์ไม่มีฝนหรือฝนเล็กน้อย การปลูกตามน้ำฝนอาจต้องรอหรือยืนยันกับสำนักงานเกษตร ไม่ใช่คำสั่งให้ปลูกหรือชะลอแทนเจ้าหน้าที่",
            },
        ],
    }


def main():
    mapj = json.loads((DATA / "map.json").read_text(encoding="utf-8"))
    rain_cfg = json.loads((CFG / "rain_thresholds.json").read_text(encoding="utf-8"))
    aqi_scale = json.loads((CFG / "aqi_scale.json").read_text(encoding="utf-8"))
    dump(DATA / "attractions.json", build_attractions(mapj["proj"]))
    dump(DATA / "air.json", build_air(aqi_scale))
    dump(DATA / "climate.json", build_climate())
    dump(DATA / "rain_alerts.json", build_alerts(rain_cfg))
    dump(DATA / "aid_links.json", build_aid())
    dump(DATA / "crop_calendar.json", build_calendar())
    dump(CFG / "advice_rules.json", build_advice_rules())
    print("phase1 data done")


if __name__ == "__main__":
    main()
