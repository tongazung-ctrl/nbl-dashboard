/* เฟส 1: ท่องเที่ยว อากาศ ปฏิทิน เตือนฝน ช่วยเหลือ */
(function () {
  "use strict";
  const DATA = "./data";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const phase = {
    attractions: null,
    air: null,
    climate: null,
    alerts: null,
    aid: null,
    calendar: null,
    rainCfg: null,
    aqiScale: null,
    advice: null,
    tourFilter: "ทั้งหมด",
  };
  window.NBLPhase1 = phase;

  function fetchJSON(path) {
    return fetch(path).then((r) => {
      if (!r.ok) throw new Error(path + " " + r.status);
      return r.json();
    });
  }
  function classify(mm, levels) {
    if (mm == null || !levels) return null;
    const v = Number(mm);
    if (Number.isNaN(v)) return null;
    for (const lv of levels) {
      const lo = lv.min_mm, hi = lv.max_mm;
      if (lo == null && hi != null && v <= hi) return lv;
      if (lo != null && hi == null && v >= lo) return lv;
      if (lo != null && hi != null && v >= lo && v <= hi) return lv;
    }
    return null;
  }
  function navBtns(nav) {
    if (!nav) return "";
    return `<div class="nav-btns">
      <a href="${esc(nav.google_dir)}" target="_blank" rel="noopener">นำทางใน Google Maps</a>
      <a href="${esc(nav.apple_dir)}" target="_blank" rel="noopener">นำทางใน Apple Maps</a>
    </div>`;
  }
  function phoneLine(p) {
    if (!p) return `<div class="muted">ไม่พบเบอร์ในแหล่งที่เปิดเผย</div>`;
    const tel = String(p).replace(/[^0-9+]/g, "");
    return `<div class="phone"><a class="nb-link" href="tel:${esc(tel)}">${esc(p)}</a></div>`;
  }

  function renderAir() {
    const box = $("air-body"); if (!box) return;
    const a = phase.air, sc = phase.aqiScale;
    if (!a) { box.textContent = "โหลดข้อมูลอากาศไม่สำเร็จ"; return; }
    const st = a.station, lv = st.level || {};
    const model = a.model;
    $("air-caption").textContent = "สถานี " + (st.name || "115t") + " · ค่าวัด ณ " + (st.date || "") + " เวลา " + (st.time || "") + " น. · แหล่ง Air4Thai กรมควบคุมมลพิษ";
    const days = (model.forecast_daily || []).map((d) => {
      const plv = classify(d.pm25_mean, (sc.levels || []).map((x) => ({...x, min_mm: x.pm25_min, max_mm: x.pm25_max})));
      return `<article class="nb-glass day-card">
        <div class="name">${esc(d.date.slice(8))}/${esc(d.date.slice(5, 7))}</div>
        <div>PM2.5 เฉลี่ย ${d.pm25_mean}</div>
        <div class="muted">สูงสุด ${d.pm25_max} มคก./ลบ.ม.</div>
        <div class="muted">${plv ? esc(plv.label) + " (เทียบสเกลไทยจากค่าโมเดล)" : ""}</div>
      </article>`;
    }).join("");
    box.innerHTML = `<div class="two-col">
      <article class="nb-glass panel">
        <div class="live-badge on"><i></i>ค่าวัดสถานี 115t</div>
        <div class="aq-big" style="color:${esc(lv.color || "#7dd3fc")}">${st.pm25 ?? "—"}</div>
        <div>PM2.5 มคก./ลบ.ม. · AQI ไทย ${st.aqi ?? "—"} · ${esc(lv.label || "")}</div>
        <p class="muted">${esc(st.area || "")} · พารามิเตอร์ที่ใช้คิด AQI: ${esc(st.aqi_param || "—")}</p>
        <p class="muted">แหล่ง: <a class="nb-link" href="${esc(st.source_url)}" target="_blank" rel="noopener">Air4Thai</a> · สเกลสีตามประกาศกรมควบคุมมลพิษ พ.ศ. 2566
          (<a class="nb-link" href="${esc((a.scale_source || {}).url)}" target="_blank" rel="noopener">ราชกิจจานุเบกษา</a>)</p>
        ${st.ssl_verified === false ? "<p class=\"muted\">หมายเหตุ: เซิร์ฟเวอร์ Air4Thai มีปัญหาใบรับรอง TLS ตอนดึงข้อมูลสำรอง</p>" : ""}
      </article>
      <article class="nb-glass panel">
        <div class="live-badge">โมเดล Open-Meteo — ไม่ใช่ค่าวัดสถานี</div>
        <p>ณ ${esc((model.current || {}).time || "")}: PM2.5 โมเดล ${model.current && model.current.pm2_5 != null ? model.current.pm2_5 : "—"} มคก./ลบ.ม.</p>
        <p class="muted">${esc(model.note)}</p>
        <p class="muted">แหล่ง: <a class="nb-link" href="${esc(model.source_url)}" target="_blank" rel="noopener">Open-Meteo Air Quality</a></p>
      </article>
    </div>
    <h3 style="margin-top:16px">พยากรณ์ PM2.5 จากโมเดล 5 วัน</h3>
    <div class="grid-7">${days}</div>`;
  }

  function cats() {
    const items = (phase.attractions && phase.attractions.items) || [];
    const set = new Set(items.map((x) => x.category).filter(Boolean));
    return ["ทั้งหมด", ...set];
  }

  function renderTourism() {
    const a = phase.attractions; if (!a) return;
    if (!$("tourism-grid")) return;
    $("tourism-caption").textContent = a.source + " · อัปเดต " + a.updated + " · บนแผนที่ " + a.counts.on_map + " จาก " + a.counts.listed + " แห่ง (แก้พิกัด " + a.counts.corrected + " / ไม่ปัก " + a.counts.uncertain + ")";
    const fil = $("tourism-filters");
    fil.innerHTML = "";
    for (const c of cats()) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nb-chip" + (phase.tourFilter === c ? " is-on" : "");
      b.textContent = c === "ทั้งหมด" ? c : c.replace("แหล่งท่องเที่ยวทาง", "");
      b.addEventListener("click", () => { phase.tourFilter = c; renderTourism(); });
      fil.append(b);
    }
    const list = a.items.filter((x) => phase.tourFilter === "ทั้งหมด" || x.category === phase.tourFilter);
    $("tourism-grid").innerHTML = list.map((x) => {
      const flag = x.status === "corrected" ? "<span class=\"tag buyer\">แก้พิกัดแล้ว</span>" :
        x.status === "uncertain_no_pin" || x.status === "outside_dropped" || x.status === "no_coord" ? "<span class=\"tag\">ไม่ปักแผนที่</span>" :
        x.status === "flag_district" ? "<span class=\"tag buyer\">ตรวจเขตอำเภอ</span>" : "";
      return `<article class="nb-glass buyer">
        <h3>${esc(x.name)}</h3>
        <div class="muted">${esc(x.type || x.category || "")} · ${esc([x.subdistrict, x.district].filter(Boolean).map((s,i)=> i===1||!x.subdistrict? "อ."+s : "ต."+s).join(" ") )}</div>
        ${x.hours ? `<div>${esc(x.hours)}</div>` : ""}
        ${phoneLine(x.phone)}
        ${flag}
        ${x.note ? `<p class="muted">${esc(x.note)}</p>` : ""}
        ${x.on_map ? navBtns(x.nav) : ""}
        <p class="muted">แหล่ง: <a class="nb-link" href="${esc(x.source_url)}" target="_blank" rel="noopener">ททท.</a>${x.coord_source ? " · " + esc(x.coord_source) : ""}</p>
      </article>`;
    }).join("");
    const nb = $("nearby-body");
    nb.innerHTML = `<h3>ทริปใกล้เคียง นอกจังหวัด</h3>
      <p class="caption">ไม่ปักในแผนที่จังหวัดว่าเป็นสถานที่ของหนองบัวลำภู</p>
      <div class="tour-grid">${(a.nearby_trips || []).map((t) => `
        <article class="nb-glass buyer nearby">
          <h3>${esc(t.name)}</h3>
          <div class="muted">อ.${esc(t.district)} จ.${esc(t.province)} · ทริปวันเดียวจากหนองบัวลำภู</div>
          <p>${esc(t.note)}</p>
          ${t.season_note ? `<p class="muted">${esc(t.season_note)}</p>` : ""}
          ${navBtns(t.nav)}
          <p class="muted">พิกัด: ${esc(t.coord_source)} · <a class="nb-link" href="${esc(t.src)}" target="_blank" rel="noopener">DASTA</a></p>
        </article>`).join("")}</div>`;
  }

  function renderCalendar() {
    const box = $("calendar-body"); if (!box) return;
    const c = phase.calendar, rules = phase.advice, rain = phase.rainCfg;
    if (!c) { box.textContent = "โหลดปฏิทินไม่สำเร็จ"; return; }
    const now = new Date();
    const month = now.getMonth() + 1;
    const seasons = (c.seasons || []).map((s) => {
      const on = (s.months || []).includes(month);
      return `<article class="nb-glass panel ${on ? "nearby" : ""}">
        <h3>${esc(s.label)}${on ? " · ช่วงนี้อยู่ในกรอบฤดูนี้" : ""}</h3>
        <p>${esc(s.from)} – ${esc(s.to)}</p>
        <p class="muted">${esc(s.hint)}</p>
      </article>`;
    }).join("");
    const crops = (c.crops || []).map((x) => `<li><b>${esc(x.name)}</b> — ${esc(x.note)}</li>`).join("");
    // advice from 7-day of currently selected village if the main app exposed it
    let adviceHtml = "";
    const app = window.NBLApp;
    const levels = rain && rain.rain_24h && rain.rain_24h.levels;
    if (app && app.forecastDays && levels) {
      const days = app.forecastDays();
      const hits = [];
      (days || []).forEach((d, i) => {
        const lv = classify(d.rain, levels);
        if (lv && (lv.id === "heavy" || lv.id === "very_heavy")) hits.push({ i, lv, rain: d.rain, label: d.label });
      });
      const sum = (days || []).reduce((s, d) => s + (Number(d.rain) || 0), 0);
      const sumLv = classify(sum, levels);
      const activeSeason = (c.seasons || []).find((s) => (s.months || []).includes(month));
      const fired = [];
      const dayLevels = (days || []).map((d) => classify(d.rain, levels)).filter(Boolean);
      for (const r of (rules && rules.rules) || []) {
        const w = r.when || {};
        if (w.forecast_daily_rain_level && hits.some((h) => w.forecast_daily_rain_level.includes(h.lv.id))) fired.push(r);
        if (w.all_forecast_days_level && w.season && activeSeason && activeSeason.id === w.season
            && dayLevels.length && dayLevels.every((lv) => w.all_forecast_days_level.includes(lv.id))) fired.push(r);
      }
      const stWarn = (window.NBLPhase1.alerts && window.NBLPhase1.alerts.warning_24h) || [];
      for (const r of (rules && rules.rules) || []) {
        if (r.when && r.when.station_rain_24h_level && stWarn.some((s) => r.when.station_rain_24h_level.includes(s.level_24h))) {
          if (!fired.includes(r)) fired.push(r);
        }
      }
      adviceHtml = `<div class="nb-glass callout"><strong>คำแนะนำจากพยากรณ์จุดที่เลือก และสถานีฝน</strong>
        <p>ฝนรวม 7 วันของจุดที่เลือก ${sum.toFixed(1)} มม.${sumLv ? " (" + esc(sumLv.label) + ")" : ""} ตามเกณฑ์กรมอุตุฯ</p>
        ${hits.length ? `<p>วันที่เข้าเกณฑ์ฝนหนัก/หนักมาก: ${hits.map((h) => esc(h.label) + " " + h.rain + " มม. (" + h.lv.label + ")").join(" · ")}</p>` : "<p>ไม่มีวันที่พยากรณ์เข้าเกณฑ์ฝนหนักของกรมอุตุฯ</p>"}
        ${fired.length ? fired.map((r) => `<p><b>${esc(r.title)}</b> — ${esc(r.message)}</p>`).join("") : "<p>ยังไม่มีเงื่อนไขในไฟล์ตั้งค่าที่เข้าข่ายในรอบนี้</p>"}
        <p class="muted">เกณฑ์จาก <a class="nb-link" href="${esc(rain.rain_24h.source.url)}" target="_blank" rel="noopener">${esc(rain.rain_24h.source.name)}</a></p>
      </div>`;
    }
    box.innerHTML = `<p class="muted">${esc(c.disclaimer)}</p>
      <p class="muted">แหล่งฤดู: <a class="nb-link" href="${esc(c.seasons_source.url)}" target="_blank" rel="noopener">${esc(c.seasons_source.name)}</a> ตรวจ ${esc(c.seasons_source.checked)}</p>
      <div class="two-col" style="margin:12px 0">${seasons}</div>
      <ul>${crops}</ul>
      ${adviceHtml}
      <p>สอบถามรายละเอียดแปลงในจังหวัดที่ <a class="nb-link" href="${esc(c.local_office.url)}" target="_blank" rel="noopener">${esc(c.local_office.name)}</a>
      และ <a class="nb-link" href="${esc(c.doae.url)}" target="_blank" rel="noopener">${esc(c.doae.name)}</a></p>`;
  }

  function renderAlerts() {
    const box = $("rain-alert-body"); if (!box) return;
    const a = phase.alerts; if (!a) { box.textContent = "โหลดเตือนฝนไม่สำเร็จ"; return; }
    const warn = a.warning_24h || [];
    const rows = (a.stations || []).map((s) => `<tr>
      <td>${esc(s.n)}</td><td>${esc(s.amp || "")}${s.prov && s.prov !== "หนองบัวลำภู" ? " จ." + esc(s.prov) : ""}</td>
      <td>${esc(s.ag || "")}</td>
      <td>${s.r24 == null ? "ไม่มีค่า" : s.r24 + " มม."}</td>
      <td>${esc(s.label_24h || "")}</td>
      <td>${s.r1 == null ? "ไม่มีค่า" : s.r1 + " มม."}${s.label_1h ? " (" + esc(s.label_1h) + ")" : ""}</td>
      <td>${esc(s.t || "")}</td>
    </tr>`).join("");
    box.innerHTML = `${warn.length ? `<div class="nb-glass callout"><strong>มีสถานีเข้าเกณฑ์ฝนหนักหรือฝนหนักมาก</strong>
      <ul>${warn.map((s) => `<li>${esc(s.n)} · ${s.r24} มม./24 ชม. (${esc(s.label_24h)})</li>`).join("")}</ul></div>`
      : `<div class="nb-glass callout"><strong>ขณะนี้ยังไม่มีสถานีในชุดนี้เข้าเกณฑ์ฝนหนักของกรมอุตุฯ</strong><p>ค่าสูงสุดในรอบข้อมูลนี้อยู่ในเกณฑ์ต่ำกว่านั้น ดูตารางด้านล่าง</p></div>`}
      <p class="muted">${esc(a.source)} · ข้อมูลสถานี ณ ${esc(a.rain_obs_at || a.updated || "")} · เกณฑ์: <a class="nb-link" href="${esc(a.threshold_source.url)}" target="_blank" rel="noopener">${esc(a.threshold_source.name)}</a></p>
      <p class="muted">${esc(a.disclaimer)} · <a class="nb-link" href="${esc(a.official_situation_url)}" target="_blank" rel="noopener">สถานการณ์ภัยจังหวัด</a></p>
      <div class="table-wrap"><table><thead><tr><th>สถานี</th><th>พื้นที่</th><th>หน่วยงาน</th><th>ฝน 24 ชม.</th><th>เกณฑ์ 24 ชม.</th><th>ฝนชั่วโมงล่าสุด</th><th>เวลา</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderClimate(targetId) {
    const box = $(targetId || "climate-body"); if (!box) return;
    const c = phase.climate; if (!c) { box.textContent = "โหลดสถิติอากาศไม่สำเร็จ"; return; }
    const months = c.open_meteo.months;
    const maxR = Math.max(...months.map((m) => m.rain_mean || 0), 1);
    const bars = months.map((m) => {
      const h = Math.max(6, (m.rain_mean / maxR) * 100);
      return `<article class="nb-glass month-card${m.relatively_cool_and_dry ? " is-best" : ""}">
        <div class="name">${esc(m.label)}</div>
        <div class="bars" style="height:80px"><div class="bar" style="height:${h}%;margin:0 auto;width:40%"></div></div>
        <div>${m.temp_mean}°C</div>
        <div class="muted">${m.rain_mean} มม.</div>
        ${m.relatively_cool_and_dry ? "<div class=\"level-pill\" style=\"background:rgba(125,211,252,.2)\">เย็นและแห้งกว่ามัธยฐาน</div>" : ""}
      </article>`;
    }).join("");
    const best = months.filter((m) => m.relatively_cool_and_dry).map((m) => m.label).join(" · ");
    box.innerHTML = `<div class="nb-glass panel">
        <p><b>ค่าปกติฝนรวม 30 ปี (กรมอุตุฯ, สอต.หนองบัวลำภู): ${c.tmd_official.annual_rain_normal_mm.toLocaleString("th-TH")} มม./ปี</b></p>
        <p class="muted">${esc(c.tmd_official.period)} · <a class="nb-link" href="${esc(c.tmd_official.source_url)}" target="_blank" rel="noopener">ศูนย์อุตุฯ ภาคตะวันออกเฉียงเหนือตอนบน</a></p>
        <p class="muted">${esc(c.tmd_official.note)}</p>
      </div>
      <h3>กรอบฤดูอย่างเป็นทางการ</h3>
      <p class="muted">แหล่ง: <a class="nb-link" href="${esc(c.tmd_seasons.source_url)}" target="_blank" rel="noopener">${esc(c.tmd_seasons.source)}</a> ตรวจ ${esc(c.tmd_seasons.checked)}</p>
      <div class="two-col">${c.tmd_seasons.items.map((s) => `<article class="nb-glass panel"><h3>${esc(s.label)}</h3><p>${esc(s.text)}</p></article>`).join("")}</div>
      <h3>ค่าเฉลี่ยรายเดือนจาก Open-Meteo ปี 2020–2024</h3>
      <p class="muted">${esc(c.open_meteo.note)} · ที่ ${esc(c.location.name)} (${c.location.lat}, ${c.location.lon}) · <a class="nb-link" href="${esc(c.open_meteo.source_url)}" target="_blank" rel="noopener">Historical Weather API</a></p>
      <p>เดือนที่อุณหภูมิและฝนในชุดนี้ไม่สูงกว่ามัธยฐาน (${c.open_meteo.median_temp}°C / ${c.open_meteo.median_rain} มม.): <b>${esc(best)}</b> — เหมาะกับการวางแผนเที่ยวถ้ำ ภูเขา และงานประเพณีในหน้าแล้ง แต่เป็นสถิติโมเดล ไม่ใช่ประกาศทางการ</p>
      <div class="month-grid">${bars}</div>
      <p class="muted">อัปเดตชุดนี้ ${esc(c.updated)}</p>`;
  }

  function renderAid() {
    const box = $("aid-body"); if (!box) return;
    const a = phase.aid; if (!a) { box.textContent = "โหลดลิงก์ไม่สำเร็จ"; return; }
    box.innerHTML = `<p class="muted">${esc(a.note)} · ทบทวนลิงก์ ${esc(a.updated)}</p>
      <div class="tour-grid">${(a.steps || []).map((s) => `<article class="nb-glass buyer">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.detail)}</p>
        <p><a class="nb-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.org)}</a></p>
      </article>`).join("")}</div>`;
  }

  phase.drawTourism = function (svg, state) {
    if (!svg || !phase.attractions || !state || !state.showTourism) return;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("id", "tour-pins");
    for (const x of phase.attractions.items) {
      if (!x.on_map || !x.xy) continue;
      if (phase.tourFilter !== "ทั้งหมด" && x.category !== phase.tourFilter) continue;
      const wrap = document.createElementNS("http://www.w3.org/2000/svg", "g");
      wrap.setAttribute("class", "pin-tour-g map-hit");
      wrap.setAttribute("transform", "translate(" + x.xy[0] + "," + x.xy[1] + ")");
      wrap.setAttribute("data-tip", x.name);
      let typ = (x.type || x.category || "").split("(")[0].trim();
      if (typ.length > 42) typ = typ.split("/")[0].trim();
      const sub = [typ, x.district ? ("อ." + x.district) : ""].filter(Boolean).join(" · ");
      wrap.setAttribute("data-tip-sub", sub);
      wrap.setAttribute("data-tip-kind", "สถานที่ท่องเที่ยว");
      wrap.setAttribute("tabindex", "0");
      wrap.setAttribute("role", "button");
      wrap.setAttribute("aria-label", x.name);
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("class", "hit-area");
      hit.setAttribute("r", "13");
      hit.setAttribute("fill", "transparent");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "pin-tour");
      c.setAttribute("r", "6");
      c.setAttribute("fill", "#FDE68A");
      c.setAttribute("stroke", "#0b1a28");
      c.setAttribute("stroke-width", "1.2");
      c.setAttribute("pointer-events", "none");
      wrap.addEventListener("click", () => {
        const el = $("tourism");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      wrap.appendChild(hit);
      wrap.appendChild(c);
      g.appendChild(wrap);
    }
    svg.appendChild(g);
  };

  phase.renderAdvice = renderCalendar;

  Promise.all([
    fetchJSON(DATA + "/attractions.json"),
    fetchJSON(DATA + "/air.json"),
    fetchJSON(DATA + "/climate.json"),
    fetchJSON(DATA + "/rain_alerts.json"),
    fetchJSON(DATA + "/aid_links.json"),
    fetchJSON(DATA + "/crop_calendar.json"),
    fetchJSON(DATA + "/config/rain_thresholds.json"),
    fetchJSON(DATA + "/config/aqi_scale.json"),
    fetchJSON(DATA + "/config/advice_rules.json"),
  ]).then(([attractions, air, climate, alerts, aid, calendar, rainCfg, aqiScale, advice]) => {
    Object.assign(phase, { attractions, air, climate, alerts, aid, calendar, rainCfg, aqiScale, advice });
    renderAir(); renderTourism(); renderCalendar(); renderAlerts(); renderClimate(); renderAid();
    if (window.NBLApp && window.NBLApp.rerender) window.NBLApp.rerender();
  }).catch((err) => {
    console.error(err);
    ["air-body", "calendar-body", "rain-alert-body", "climate-body", "aid-body"].forEach((id) => {
      const n = $(id); if (n && /กำลังโหลด/.test(n.textContent)) n.textContent = "โหลดข้อมูลเฟส 1 ไม่สำเร็จ";
    });
  });

  // if this file is used on climate.html only
  if (document.body && document.body.dataset && document.body.dataset.page === "climate") {
    // renderClimate will run after fetch
  }
})();
