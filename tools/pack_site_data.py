#!/usr/bin/env python3
"""Pack dashboard JSON for the public static site.

Reads /workspace/nbl_dashboard (or --src) and writes /workspace/nbl_site/data.
Does not modify source files.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

DISTRICTS = ["เมืองหนองบัวลำภู", "นากลาง", "นาวัง", "ศรีบุญเรือง", "สุวรรณคูหา", "โนนสัง"]
CROPS = ["ข้าว", "มันสำปะหลัง", "อ้อย", "ยางพารา", "ข้าวโพด"]
OFFICIAL_VILLAGES = [154, 127, 51, 158, 91, 107]
V_COV = [[141, 7, 14], [111, 5, 5], [41, 3, 9], [139, 12, 4], [76, 4, 6], [104, 7, 11]]
GRID_KM = 9
SITE_BASE = "https://tongazung-ctrl.github.io/nbl-dashboard"

TMD = [
    ["พ. 18", "ฝน", 21, 32, 10, 8],
    ["พฤ. 19", "มีเมฆบางส่วน", 21, 31, 0, 8],
    ["ศ. 20", "มีเมฆบางส่วน", 20, 29, 0, 10],
    ["ส. 21", "มีเมฆบางส่วน", 18, 28, 0, 8],
    ["อา. 22", "มีเมฆบางส่วน", 18, 29, 0, 6],
    ["จ. 23", "มีเมฆบางส่วน", 19, 31, 0, 6],
    ["อ. 24", "มีเมฆบางส่วน", 21, 33, 0, 8],
]
TMD_NOTE = {
    "lead": "อีสาน 19–22 พ.ย.",
    "text": "อากาศเย็นตอนเช้า ลมแรง อุณหภูมิลด 3–5°C ลมตะวันออกเฉียงเหนือ 15–35 กม./ชม. ต่ำสุด 17–23°C ช่วง 23–24 พ.ย. อุ่นขึ้น 1–3°C",
}
SER_DATES = [
    "15 ต.ค.", "19 ต.ค.", "20 ต.ค.", "21 ต.ค.", "22 ต.ค.", "26 ต.ค.", "27 ต.ค.",
    "28 ต.ค.", "29 ต.ค.", "30 ต.ค.", "2 พ.ย.", "3 พ.ย.", "4 พ.ย.", "5 พ.ย.",
    "6 พ.ย.", "9 พ.ย.", "10 พ.ย.", "11 พ.ย.", "12 พ.ย.", "13 พ.ย.", "16 พ.ย.", "17 พ.ย.",
]
SERIES = {
    "ข้าว": {
        "name": "ข้าวเปลือกหอมมะลิ 105", "unit": "บาท/ตัน", "floor": 12000, "ceiling": 19000,
        "med": [17900, 17650, 17650, 17650, 17650, 17900, 17900, 17900, 17250, 17250, 14200, 14185, 14085, 14085, 14235, 14025, 14000, 13900, 14000, 14000, 13900, 13500],
        "lo": [14900, 14400, 14400, 14400, 14400, 14400, 14400, 14400, 13800, 13800, 13500, 13500, 13500, 13500, 13800, 13500, 13000, 13000, 13000, 13200, 13200, 13000],
        "hi": [18500, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 18333, 17500, 17500, 17500, 17500, 17500, 17500, 17500, 17500, 15500, 15500, 15500],
    },
    "มันสำปะหลัง": {
        "name": "หัวมันสด เชื้อแป้ง 25%", "unit": "บาท/กก.", "floor": 3.4, "ceiling": 4.2,
        "med": [4, 4, 4, 4, 3.95, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9, 3.9],
        "lo": [3.65, 3.65, 3.65, 3.65, 3.65, 3.65, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.6, 3.65, 3.65],
        "hi": [4, 4, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05, 4.05],
    },
    "ยางพารา": {
        "name": "ยางแผ่นดิบ ชั้น 3", "unit": "บาท/กก.", "floor": 76, "ceiling": 90,
        "med": [84.28, 85.55, 85.54, 83.95, 82.5, 85.23, 85.38, 85.05, 83.89, 84.33, 83.9, 82.73, 82.45, 82.71, 82.22, 81.81, 81.58, 80.19, 79.79, 79, 81.49, 80.3],
        "lo": [81, 82, 82.5, 82, 82, 82, 82, 82, 82, 83, 83, 82, 81.5, 80, 79, 78, 78, 77.5, 78, 78, 79, 79],
        "hi": [88.88, 87.59, 85.88, 87.88, 85.89, 87.98, 88.13, 88.79, 86.2, 85.65, 86.85, 83.88, 86.06, 85.89, 82.88, 85.5, 82.8, 83.1, 83.19, 83.99, 84.21, 82.71],
    },
    "ข้าวโพด": {
        "name": "ข้าวโพดเลี้ยงสัตว์ ความชื้น 14.5%", "unit": "บาท/กก.", "floor": 8, "ceiling": 13.5,
        "med": [9.25, 9.25, 9.25, 9.25, 9.25, 9.5, 9.5, 9.5, 9.5, 9.5, 10.1, 10.1, 10.1, 10.5, 10.5, 10.6, 10.6, 10.6, 10.6, 10.6, 10.6, 10.6],
        "lo": [8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9, 8.9],
        "hi": [9.95, 10.3, 10.3, 10.3, 10.4, 10.7, 10.7, 10.85, 10.9, 11.45, 11.65, 11.65, 11.65, 12.15, 12.4, 12.5, 12.6, 12.6, 12.8, 12.9, 12.5, 12.2],
    },
}
BUYER_PRICES = {
    "chaodee": {"price": "แป้ง 30% 4.65 · 25% 4.15 บาท/กก.", "priceDate": "เว็บ ณ 18 พ.ย. 69 (ไม่ระบุวันประกาศ)"},
    "baac_kk": {"price": "หอมมะลิ 105: 15,500 บาท/ตัน", "priceDate": "17 พ.ย. 69"},
    "raot_nk": {"price": "ก้อนถ้วย 76.05 บาท/กก.", "priceDate": "18 พ.ย. 69"},
}
OUTSIDE = {
    "chaodee": {"amp": "กุมภวาปี", "prov": "อุดรธานี", "tx": 850, "ty": 537, "km": 60},
    "baac_kk": {"amp": "เมืองขอนแก่น", "prov": "ขอนแก่น", "tx": 700, "ty": 1067, "km": 91},
    "raot_nk": {"amp": "เมืองหนองคาย", "prov": "หนองคาย", "tx": 690, "ty": -90, "km": 80},
}

# Prices as shown on the canvas (buyer flag + wording), with src from prices.json when available.
PRICES = {
    "ข้าว": [
        {"item": "หอมมะลิ 105 · ท่าข้าว ธ.ก.ส. ขอนแก่น", "value": "15,500", "unit": "บาท/ตัน", "date": "17 พ.ย. 69", "kind": "สศก./NABC", "buyer": True, "src": "https://nabc.go.th/dashboard/farm-prices"},
        {"item": "หอมมะลิ 105 · 12 ตลาดทั่วประเทศ (ค่ากลาง 13,500)", "value": "13,000–15,500", "unit": "บาท/ตัน", "date": "17 พ.ย. 69", "kind": "สศก./NABC", "buyer": False, "src": "https://nabc.go.th/dashboard/farm-prices"},
        {"item": "หอมมะลิ ความชื้น 15% · เฉลี่ยเดือน", "value": "16,100", "unit": "บาท/ตัน", "date": "พ.ย. 69", "kind": "กระทรวงพาณิชย์", "buyer": False, "src": "https://www.moc.go.th/th/gallery/category/detail/id/5/iid/9730338"},
        {"item": "ข้าวเหนียวเมล็ดยาว · เฉลี่ยเดือน", "value": "11,950", "unit": "บาท/ตัน", "date": "พ.ย. 69", "kind": "กระทรวงพาณิชย์", "buyer": False, "src": "https://www.moc.go.th/th/gallery/category/detail/id/5/iid/9730338"},
        {"item": "ข้าวเจ้า · เฉลี่ยเดือน", "value": "9,550", "unit": "บาท/ตัน", "date": "พ.ย. 69", "kind": "กระทรวงพาณิชย์", "buyer": False, "src": "https://www.moc.go.th/th/gallery/category/detail/id/5/iid/9730338"},
    ],
    "มันสำปะหลัง": [
        {"item": "หัวมันสด แป้ง 30% · เชาวน์ดี อีสาน (กุมภวาปี)", "value": "4.65", "unit": "บาท/กก.", "date": "เว็บ ณ 18 พ.ย. 69", "kind": "เว็บผู้รับซื้อ", "buyer": True, "src": "https://chaodeeesan.com/"},
        {"item": "หัวมันสด แป้ง 25% · เชาวน์ดี อีสาน (กุมภวาปี)", "value": "4.15", "unit": "บาท/กก.", "date": "เว็บ ณ 18 พ.ย. 69", "kind": "เว็บผู้รับซื้อ", "buyer": True, "src": "https://chaodeeesan.com/"},
        {"item": "หัวมันสด 25% · 3 โรงงานที่ สศก. รายงาน", "value": "3.65–4.05", "unit": "บาท/กก.", "date": "17 พ.ย. 69", "kind": "สศก./NABC", "buyer": False, "src": "https://nabc.go.th/dashboard/farm-prices"},
        {"item": "หัวมันสด 25% · โรงแป้ง อ.เมืองนครราชสีมา", "value": "3.70–3.90", "unit": "บาท/กก.", "date": "16 พ.ย. 69", "kind": "สมาคมโรงงานมันฯ อีสาน", "buyer": False, "src": "https://www.nettathai.org/2012-02-06-06-49-09.html"},
    ],
    "อ้อย": [
        {"item": "ราคาอ้อยขั้นต้น 2568/69 ที่ 10 ซี.ซี.เอส.", "value": "890", "unit": "บาท/ตัน", "date": "มติ ครม.", "kind": "ราคาเดียวทั่วประเทศ", "buyer": False, "src": "https://prd.go.th/main/article/7f7de6ae-0f72-425b-856a-a4e8687347e4"},
        {"item": "ราคาอ้อยขั้นต้น 2569/70", "value": "ยังไม่ประกาศ", "unit": "", "date": "ณ 18 พ.ย. 69", "kind": "สอน. คาดราว 1,100 (ยังไม่เป็นทางการ)", "buyer": False, "src": "https://www.matichon.co.th/economy/news_5956722"},
    ],
    "ยางพารา": [
        {"item": "ยางก้อนถ้วย · ตลาดกลาง กยท. หนองคาย", "value": "76.05", "unit": "บาท/กก.", "date": "18 พ.ย. 69", "kind": "ตลาดกลาง กยท.", "buyer": True, "src": "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"},
        {"item": "ยางแผ่นดิบ · ตลาดกลาง กยท. หนองคาย", "value": "81.20", "unit": "บาท/กก.", "date": "10 พ.ย. 69", "kind": "ตลาดกลาง กยท.", "buyer": True, "src": "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"},
        {"item": "ยางแผ่นดิบ · กยท. รวม 8 ตลาด", "value": "82.79", "unit": "บาท/กก.", "date": "18 พ.ย. 69", "kind": "กยท.", "buyer": False, "src": "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"},
        {"item": "ยางแผ่นรมควัน · กยท. รวม 8 ตลาด", "value": "85.69", "unit": "บาท/กก.", "date": "18 พ.ย. 69", "kind": "กยท.", "buyer": False, "src": "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"},
        {"item": "น้ำยางสด · กยท.", "value": "79.80", "unit": "บาท/กก.", "date": "17 พ.ย. 69", "kind": "กยท.", "buyer": False, "src": "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"},
    ],
    "ข้าวโพด": [
        {"item": "ข้าวโพดเลี้ยงสัตว์ 14.5% · 5 จุดที่ สศก. รายงาน", "value": "8.90–12.20", "unit": "บาท/กก.", "date": "17 พ.ย. 69", "kind": "สศก./NABC", "buyer": False, "src": "https://nabc.go.th/dashboard/farm-prices"},
        {"item": "ข้าวโพด 14.5% · สหกรณ์การเกษตรด่านขุนทด (โคราช)", "value": "11.30", "unit": "บาท/กก.", "date": "17 พ.ย. 69", "kind": "สศก./NABC", "buyer": False, "src": "https://nabc.go.th/dashboard/farm-prices"},
    ],
}

GAPS = [
    {"title": "ราคารายวันของผู้รับซื้อในจังหวัด", "detail": "ไม่มีโรงสี ลานมัน หรือสหกรณ์ในหนองบัวลำภูที่ประกาศราคาทางเว็บ"},
    {"title": "รายงานราคาพาณิชย์จังหวัด", "detail": "หน้าบริการข่าวตลาดของสำนักงานพาณิชย์จังหวัดไม่มีตัวเลข โทร 042-312-018"},
    {"title": "ลานรับซื้อข้าวโพด", "detail": "ยังไม่พบชื่อในจังหวัด ใช้ราคาอ้างอิงจาก สศก."},
    {"title": "พิกัดหมู่บ้านครบทั้ง 688 แห่ง", "detail": "มีพิกัดทางการ 612 แห่ง (GISTDA ข้อมูลปี 2552–2555) อีก 76 แห่งใช้จุดกลางตำบล ไฟล์กรมการปกครองปี 2566 เปิดเต็มไฟล์จากเครื่องสร้างหน้าไม่ได้ (ได้มาแค่ 39 แถวแรก) และมี 186 จุดที่ข้อมูลต้นทางไม่มีชื่อหมู่บ้าน แสดงเป็นเลขหมู่แทน"},
    {"title": "ราคาอ้อยฤดู 2569/70", "detail": "ยังไม่ประกาศ ณ 18 พ.ย. 69"},
    {"title": "พิกัดจริงของจุดรับซื้อ 4 แห่งในจังหวัด", "detail": "อุดรไพบูลย์ ไทยพิพัฒน์ สหกรณ์ฯ ศรีบุญเรือง และสหกรณ์ยางโนนสัง ปักไว้ที่จุดกลางอำเภอโดยประมาณ"},
]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.name} ({path.stat().st_size:,} bytes)")


def pack_weather(src: Path) -> dict:
    districts = load(src / "districts.json")
    raw = load(src / "data_20261118.json")
    by_name = {w["district"]: w for w in raw["weather"]["districts"]}
    weather = []
    days = []
    wx_at = ""
    for d in districts:
        w = by_name[d["name"]]
        cur = w["current"]
        if not wx_at and cur.get("time"):
            # keep original display too; also store ISO
            wx_at = cur["time"]
        daily = w["daily"]
        if not days:
            # Thai short labels come from the canvas fallback; also store ISO dates
            days = [x["date"] for x in daily]
        weather.append({
            "n": d["name"],
            "lat": d["lat"],
            "lon": d["lon"],
            "c": [cur["temp"], cur["feels"], cur["rh"], cur["wind"], cur["rain_mm"], cur["desc"]],
            "code": cur.get("code"),
            "d": [[x["tmin"], x["tmax"], x["rain_pct"], x["rain_mm"], x["wind_max"], x["rh"], x["desc"]] for x in daily],
            "codes": [x.get("code") for x in daily],
            "uv": [x.get("uv") for x in daily],
            "dates": [x["date"] for x in daily],
        })
    return {
        "updated": "18 พ.ย. 2569 เวลา 12:27 น. (เวลาไทย)",
        "fetched_at": raw.get("fetched_at"),
        "wx_at": "12:15 น. 18 พ.ย. 69",
        "wx_at_iso": wx_at,
        "days_iso": days,
        "days": ["พ. 18", "พฤ. 19", "ศ. 20", "ส. 21", "อา. 22", "จ. 23", "อ. 24"],
        "weather": weather,
        "tmd": TMD,
        "tmd_note": TMD_NOTE,
        "tmd_source": "https://www.tmd.go.th/forecast/sevendays",
        "open_meteo": "https://open-meteo.com/",
        "prices": PRICES,
        "series_dates": SER_DATES,
        "series": SERIES,
        "buyer_prices": BUYER_PRICES,
        "gaps": GAPS,
    }


def pack_buyers(src: Path) -> list:
    buyers = load(src / "buyers.json")
    msvg = load(src / "map_svg.json")
    pins = msvg.get("buyers", {})
    out = []
    for b in buyers:
        row = dict(b)
        if b["id"] in pins:
            row["pin"] = pins[b["id"]]
        if b["id"] in OUTSIDE:
            row["outside"] = OUTSIDE[b["id"]]
        if b["id"] in BUYER_PRICES:
            row.update(BUYER_PRICES[b["id"]])
        out.append(row)
    return out


def pack_villages_static(src: Path) -> dict:
    vs = load(src / "villages_static.json")
    tambons = [{"t": t["t"], "a": t["a"], "lat": t["lat"], "lon": t["lon"], "x": t["x"], "y": t["y"]} for t in vs["tambons"]]
    villages = [{
        "n": v["n"], "ti": v["ti"], "lat": v["lat"], "lon": v["lon"],
        "x": v["x"], "y": v["y"], "src": v.get("src"), "moo": v.get("moo"),
    } for v in vs["villages"]]
    return {
        "tambons": tambons,
        "villages": villages,
        "missing": vs["missing"],
        "cov": vs["stats"]["cov"],
        "official": OFFICIAL_VILLAGES,
        "stats": {
            "kept_official": vs["stats"]["kept_official"],
            "osm_extra": vs["stats"]["osm_extra"],
            "villages": vs["stats"]["villages"],
            "dopa": vs["stats"]["dopa"],
            "gistda": vs["stats"]["gistda"],
            "osm_named_blank": vs["stats"]["osm_named_blank"],
        },
    }


def pack_map(src: Path) -> dict:
    m = load(src / "map_svg.json")
    return {
        "W": m["W"],
        "H": m["H"],
        "proj": m["proj"],
        "districts": m["districts"],
        "neighbors": m["neighbors"],
        "wx_points": m["wx_points"],
        "buyers": m["buyers"],
        "outside": m["outside"],
    }


def pack_meta() -> dict:
    return {
        "title": "แดชบอร์ดหนองบัวลำภู: อากาศ และจุดรับซื้อผลผลิตเกษตร",
        "description": "แผนที่ 6 อำเภอ 59 ตำบล อากาศรายตำบล/หมู่บ้าน ฝนวัดจริงจากสถานี พยากรณ์ 7 วัน ราคาผลผลิตล่าสุด และจุดรับซื้อในจังหวัดหนองบัวลำภู",
        "site_base": SITE_BASE,
        "districts": DISTRICTS,
        "crops": CROPS,
        "grid_km": GRID_KM,
        "center": "เมืองหนองบัวลำภู",
        "crop_color": {"ข้าว": "#FFD166", "มันสำปะหลัง": "#FF8A5B", "อ้อย": "#5BE7A9", "ยางพารา": "#B794F6", "ข้าวโพด": "#F472B6"},
        "wcode": {
            "0": "แจ่มใส", "1": "ส่วนใหญ่แจ่มใส", "2": "มีเมฆบางส่วน", "3": "เมฆมาก",
            "45": "หมอก", "48": "หมอก", "51": "ฝนปรอยเล็กน้อย", "53": "ฝนปรอย", "55": "ฝนปรอยหนัก",
            "61": "ฝนเล็กน้อย", "63": "ฝนปานกลาง", "65": "ฝนหนัก", "80": "ฝนซู่", "81": "ฝนซู่",
            "82": "ฝนซู่หนัก", "95": "พายุฝนฟ้าคะนอง", "96": "พายุฝนฟ้าคะนอง", "99": "พายุฝนฟ้าคะนอง",
        },
        "rain_show_pct": 30,
        "rain_mid": 30,
        "rain_high": 60,
        "rain_code_min": 51,
        "search_max": 8,
        "be_offset": 543,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/workspace/nbl_dashboard")
    ap.add_argument("--dest", default="/workspace/nbl_site/data")
    args = ap.parse_args()
    src = Path(args.src)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)

    dump(dest / "meta.json", pack_meta())
    dump(dest / "daily.json", pack_weather(src))
    dump(dest / "buyers.json", pack_buyers(src))
    dump(dest / "map.json", pack_map(src))
    dump(dest / "villages_static.json", pack_villages_static(src))
    # daily village weather: copy as-is (authoritative, newer than the canvas block)
    shutil.copy2(src / "villages_daily.json", dest / "villages_daily.json")
    print(f"  wrote villages_daily.json ({(dest / 'villages_daily.json').stat().st_size:,} bytes)")
    print("done")


if __name__ == "__main__":
    main()
