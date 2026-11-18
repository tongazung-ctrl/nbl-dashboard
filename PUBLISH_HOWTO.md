# วิธีเผยแพร่และอัปเดตแดชบอร์ดหนองบัวลำภูบน GitHub Pages

ไซต์สแตติกอยู่ที่ `/workspace/nbl_site/` (ไฟล์นี้รวมอยู่ในโฟลเดอร์เดียวกัน)

ลิงก์ที่ตั้งใจให้คนทั่วไปเปิด (หลังเปิด GitHub Pages แล้ว):

- เว็บ: https://tongazung-ctrl.github.io/nbl-dashboard/
- คลังโค้ด: https://github.com/tongazung-ctrl/nbl-dashboard

บัญชี GitHub ที่เชื่อมแล้วคือ `@tongazung-ctrl` ใช้ของฟรีเท่านั้น ไม่เปิด billing

## สิ่งที่เครื่องมือ GitHub ใน Cursor ทำได้ / ทำไม่ได้ (ณ 19 พ.ย. 2569)

ตรวจสอบแล้ว: เนมสเปซ `cursor-github` เชื่อมบัญชี `@tongazung-ctrl` ได้ และ `get_me` / `list_my_repositories` ใช้ได้

**ทำได้:** อ่านบัญชี, ดูรายชื่อคลัง, อ่านไฟล์/คอมมิต/พูลรีเควสต์ หลังจากคลังถูกสร้างและ Cursor ได้รับสิทธิ์เข้าถึงคลังนั้น

**ทำไม่ได้ (ไม่มีเครื่องมือในเนมสเปซนี้):**

- สร้างคลังโค้ด (`create_repository` ไม่มี)
- เขียนหรือพุชไฟล์ (`create_or_update_file` / `push` ไม่มี)
- เปิด GitHub Pages (`/repos/{owner}/{repo}/pages` ไม่มี)

`gh` บนเครื่องกล่องยังไม่ได้ล็อกอิน (`gh auth status` = not logged in) และในสภาพแวดล้อมไม่มีตัวแปร `GH_TOKEN` / `GITHUB_TOKEN` ให้ใช้ จึงพุชจากกล่องไม่ได้จนกว่าจะมีคลังเปล่าและวิธียืนยันตัวตนของ `git`/`gh` ที่เจ้าของบัญชีให้มาเอง

ดังนั้นขั้นตอนด้านล่างนี้คือวิธีที่ต้องทำให้เสร็จครั้งแรก (ทำครั้งเดียว) จากนั้นรูทีนอัปเดตรายวันจะอัปเดตแค่ไฟล์ข้อมูลแล้วพุชขึ้น `main`

## 1) สร้างคลังสาธารณะครั้งแรก

1. เข้า GitHub ด้วยบัญชี `tongazung-ctrl`
2. สร้างคลังใหม่ชื่อ **`nbl-dashboard`**
   - Visibility: **Public** (ถ้าเป็น Private, GitHub Pages ของบัญชีฟรีเปิดให้คนนอกดูไม่ได้)
   - **อย่า**เลือก Add a README / .gitignore / license (ให้ว่างไว้ จะได้พุชโฟลเดอร์นี้เป็นคอมมิตแรกได้ตรง ๆ)
3. อย่าเปลี่ยนชื่อเจ้าของคลัง

ถ้าสร้างจากเทอร์มินัลที่ล็อกอิน `gh` เป็น `@tongazung-ctrl` แล้ว:

```bash
gh repo create tongazung-ctrl/nbl-dashboard --public --description "แดชบอร์ดหนองบัวลำภู: อากาศ และจุดรับซื้อผลผลิตเกษตร"
```

## 2) พุชไฟล์จาก `/workspace/nbl_site`

อย่าพุชทั้งโฟลเดอร์ `/workspace/nbl_dashboard` (มีไฟล์ดิบขนาดใหญ่และสำเนาที่ไม่ใช่เว็บ)

```bash
cd /workspace/nbl_site
git init -b main
git add index.html 404.html robots.txt .nojekyll .gitignore README.md PUBLISH_HOWTO.md
git add css js data assets tools
git -c user.name="tongazung-ctrl" -c user.email="tongazung-ctrl@users.noreply.github.com" \
  commit -m "Initial public Nong Bua Lamphu dashboard"
git remote add origin https://github.com/tongazung-ctrl/nbl-dashboard.git
git push -u origin main
```

ไฟล์สำคัญที่ต้องอยู่ในรากของ `main` (ไม่ใช่โฟลเดอร์ย่อย `docs/`):

- `index.html`, `css/`, `js/`, `data/`, `assets/og.png`, `.nojekyll`

`.nojekyll` จำเป็น เพื่อให้ GitHub Pages ไม่ประมวลผลแบบ Jekyll

หาก Cursor ถามสิทธิ์เข้าถึงคลังใหม่ ให้เปิดสิทธิ์คลัง `tongazung-ctrl/nbl-dashboard` แล้วค่อยใช้เครื่องมือ GitHub อ่านสถานะได้

## 3) เปิด GitHub Pages (branch `main`, โฟลเดอร์ราก)

บน GitHub:

1. เปิด `https://github.com/tongazung-ctrl/nbl-dashboard/settings/pages`
2. Build and deployment → Source: **Deploy from a branch**
3. Branch: **`main`** โฟลเดอร์: **`/` (root)**
4. บันทึก แล้วรอ 1–3 นาที

ถ้าใช้ `gh` ที่ล็อกอินแล้ว:

```bash
gh api -X POST repos/tongazung-ctrl/nbl-dashboard/pages \
  -H "Accept: application/vnd.github+json" \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

ถ้าคลังเพิ่งถูกสร้าง บางครั้งต้องใช้ `POST` ครั้งแรก ครั้งถัดไปใช้ `PUT` ที่พาธเดียวกัน

ตรวจว่าเปิดแล้ว:

```bash
curl -sS -o /tmp/nbl.html -w "%{http_code} %{url_effective}\n" \
  https://tongazung-ctrl.github.io/nbl-dashboard/
# ต้องได้ 200 (ถ้าได้ 404 แปลว่า Pages ยังไม่พร้อม หรือเลือกโฟลเดอร์ผิด)
```

หน้าเว็บต้องมีชื่อเรื่องภาษาไทย, แผนที่ 6 อำเภอ, ส่วนค้นหาหมู่บ้าน และรูปพรีวิวที่

`https://tongazung-ctrl.github.io/nbl-dashboard/assets/og.png`

## 4) โพสต์เฟสบุ๊ค

ลิงก์ที่จะแปะคือ `https://tongazung-ctrl.github.io/nbl-dashboard/`

Open Graph ใส่ไว้แล้ว (`og:title`, `og:description`, `og:image` 1200×630) ถ้าเฟสยังโชว์พรีวิวเก่า ให้ใช้ Facebook Sharing Debugger แล้วกด scrape ใหม่ อย่าส่งโพสต์จนกว่าป๋าจะยืนยันข้อความ

## 5) อัปเดตรายวัน (08:00 เวลาไทย)

กลไกหลักหลังเปิดคลังแล้วคือ **GitHub Actions ฟรี** ไฟล์ `.github/workflows/daily-refresh.yml` ตั้ง cron เป็น `0 1 * * *` (01:00 น. UTC = 08:00 น. เวลาไทย) และกดรันมือได้ที่แท็บ Actions (workflow_dispatch)

แต่ละรอบจะรัน `python tools/refresh_all.py` แล้วคอมมิตเฉพาะไฟล์ที่เปลี่ยน:

- `data/daily.json` อากาศ 6 อำเภอจาก Open-Meteo
- `data/villages_daily.json` พยากรณ์รายช่องกริด ECMWF IFS + ฝนสถานี ThaiWater
- `data/air.json` สถานี Air4Thai 115t + พยากรณ์ Open-Meteo AQ
- `data/rain_alerts.json` เทียบเกณฑ์กรมอุตุฯ จาก `data/config/rain_thresholds.json`

ถ้าแหล่งใดล่ม สคริปต์คงไฟล์เดิมไว้และไม่ทำให้เวิร์กโฟลว์ล้มทั้งงาน ราคา, ตารางกรมอุตุฯ รายจังหวัด, ปฏิทินเกษตร, ลิงก์ช่วยเหลือ และสถิติภูมิอากาศระยะยาว **ไม่ถูกเขียนทับอัตโนมัติ** ต้องอัปเดตแบบคัดกรองตาม `/workspace/nbl_dashboard/UPDATE_HOWTO.md` เมื่อมีค่าใหม่

รูทีน 08:00 บนกล่องไม่ต้องพุชซ้ำทุกวันถ้า Actions ทำงานแล้วคอมมิตได้ ใช้กล่องเป็นทางสำรองเมื่อ Actions ล้ม หรือเมื่อต้องอัปเดตราคา/ตารางกรมอุตุฯ แบบคัดกรอง

คำสั่งสำรองบนกล่อง (ชุดเดียวกับ Actions ไม่ต้องผ่าน `/workspace/nbl_dashboard`):

```bash
cd /workspace/nbl_site
python3 tools/refresh_all.py
git add data/daily.json data/villages_daily.json data/air.json data/rain_alerts.json
git diff --cached --quiet || git commit -m "Daily data refresh (08:00 Thai)"
git push origin main
```

ห้ามแต่งตัวเลข ถ้าแหล่งใดล่ม สคริปต์จะคงไฟล์เดิมไว้

ทางเลือกเดิมถ้าต้องสร้าง `villages_daily.json` จากโฟลเดอร์งาน `/workspace/nbl_dashboard` ก่อน แล้วคัดลอกเข้าไซต์:


### 5.1 อากาศรายตำบล/หมู่บ้าน + สถานีฝน

```bash
cd /workspace/nbl_dashboard
python3 build_villages.py
# เขียน villages_daily.json และ villages_daily.ts.txt
```

สคริปต์นี้ดึง Open-Meteo (ECMWF IFS, ล็อกโมเดล) และ ThaiWater ฝน 24 ชม. รายละเอียดอยู่ใน `/workspace/nbl_dashboard/UPDATE_HOWTO.md` ข้อ 1b

### 5.2 อากาศรายอำเภอ และแพ็กเข้าเว็บสาธารณะ

```bash
cd /workspace/nbl_site
python3 tools/refresh_public_data.py
```

สคริปต์นี้จะ

- ดึง Open-Meteo จุดกลาง 6 อำเภอ แล้วอัปเดต `data/daily.json` เฉพาะบล็อกอากาศ, `days`, `wx_at`, `updated`
- คัดลอก `/workspace/nbl_dashboard/villages_daily.json` ทับ `data/villages_daily.json`

**ไม่แตะ** ราคา, ซีรีส์ สศก., และตารางกรมอุตุฯ (ต้องอัปเดตเองเมื่อมีค่าใหม่จากแหล่ง)

### 5.3 ราคา / กรมอุตุฯ (เมื่อรูทีนดึงค่าใหม่ได้)

ตาม `/workspace/nbl_dashboard/UPDATE_HOWTO.md` ข้อ 1 และ 2 แล้วสะท้อนเข้า `data/daily.json`:

- `tmd`, `tmd_note` จากพยากรณ์ 7 วันกรมอุตุฯ (ทั้งจังหวัด)
- `prices`, `series`, `series_dates`, `buyer_prices` จากราคาที่ตรวจแล้ว
- `gaps` ถ้าสถานะข้อขาดข้อมูลเปลี่ยน

กติกาเดิม: ห้ามแต่งราคา ระบุชัดว่าผู้ซื้อหรืออ้างอิง วันหยุดราชการ สศก./กยท. ไม่มีราคาใหม่ให้คงวันที่เดิม

แผนที่และรายชื่อหมู่บ้าน (`data/map.json`, `data/buyers.json`, `data/villages_static.json`, `data/meta.json`) ไม่ต้องแก้ม regular ทุกวัน

### 5.4 พุชขึ้น GitHub Pages

```bash
cd /workspace/nbl_site
git add data/daily.json data/villages_daily.json
# ถ้ามีการแก้ราคาหรือ TMD ใน daily.json ให้ add ไฟล์เดียวกัน
git commit -m "Daily data refresh $(TZ=Asia/Bangkok date '+%Y-%m-%d %H:%M %Z')"
git push origin main
```

Pages จะเผยแพร่ไฟล์ใหม่จาก `main` ในไม่กี่นาที ไม่ต้องเปิดตั้งค่า Pages ซ้ำ

ถ้าเครื่องมือ GitHub ใน Cursor มีคำสั่งพุชไฟล์ในอนาคต ให้อัปเดตสองไฟล์นี้บนสาขา `main` ที่พาธ `data/daily.json` และ `data/villages_daily.json` ผลเหมือนกัน

## โครงสร้างไฟล์

| พาธ | บทบาท | ความถี่ |
|---|---|---|
| `index.html` `css/` `js/` | หน้าเว็บ | เมื่อแก้หน้า |
| `assets/og.png` | รูปพรีวิวเฟสบุ๊ค | เมื่อเปลี่ยนแบรนด์ |
| `data/daily.json` | อากาศรายอำเภอสำรอง, ราคา, TMD, ซีรีส์ | ทุกวัน |
| `data/villages_daily.json` | พยากรณ์รายช่องกริด + สถานีฝน | ทุกวัน |
| `data/villages_static.json` | รายชื่อตำบล/หมู่บ้านและพิกัด | เมื่อรายชื่อเปลี่ยน |
| `data/buyers.json` `data/map.json` `data/meta.json` | จุดรับซื้อ แผนที่ ค่าคงที่ | นาน ๆ ครั้ง |
| `tools/pack_site_data.py` | สร้างไฟล์ data ครั้งแรกจาก `/workspace/nbl_dashboard` | เมื่อโครงสร้างเปลี่ยน |
| `tools/refresh_public_data.py` | อัปเดตอากาศรายวันเข้า `data/` | ทุกวัน |
| `tools/make_og.py` | สร้าง `assets/og.png` | เมื่อแก้รูปพรีวิว |

แหล่งข้อมูลห้ามแต่งและวิธีดึงราคา/TMD ทั้งชุด อยู่ที่ `/workspace/nbl_dashboard/UPDATE_HOWTO.md` ห้ามลบหรือแก้ไฟล์ต้นทางโดยไม่สำรอง `.bak_YYYYMMDD_HHMM`
