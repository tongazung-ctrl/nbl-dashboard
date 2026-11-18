/* แดชบอร์ดหนองบัวลำภู — static site */
(function () {
  "use strict";

  const DATA = "./data";
  const RAIN_DROPS_PER_PCT = 0.7;
  const PARTICLES = 26;
  const PIN_R = 8;
  const EDGE_INSET = 40;
  const APPROX_R = 24;
  const CENTER = "เมืองหนองบัวลำภู";

  const state = {
    meta: null,
    daily: null,
    buyers: [],
    map: null,
    villages: null,
    vdaily: null,
    dist: CENTER,
    cropFilter: "ทั้งหมด",
    selBuyer: "",
    showV: true,
    vsel: 0,
    vq: "",
    priceCrop: "ข้าว",
    bDist: "ทั้งหมด",
    bCrop: "ทั้งหมด",
    liveWx: false,
    liveVillages: false,
    liveNote: "กำลังโหลดข้อมูลสำรอง",
    showTourism: true,
  };

  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "html") n.innerHTML = v;
        else if (k === "text") n.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
        else if (v === false || v == null) continue;
        else n.setAttribute(k, v);
      }
    }
    for (const c of kids) {
      if (c == null || c === false) continue;
      n.append(c.nodeType ? c : document.createTextNode(c));
    }
    return n;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const wdesc = (code) => state.meta.wcode[String(code)] || ("รหัส " + code);
  const rainColor = (pct) => (pct >= state.meta.rain_high ? "#60A5FA" : pct >= state.meta.rain_mid ? "#7DD3FC" : "#FDE68A");
  const host = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  const fmtAt = (s) => {
    if (!s) return "ไม่ระบุเวลา";
    if (s.length >= 16 && s[4] === "-") {
      const be = Number(s.slice(0, 4)) + state.meta.be_offset;
      return s.slice(11, 16) + " น. " + Number(s.slice(8, 10)) + "/" + Number(s.slice(5, 7)) + "/" + be;
    }
    return s;
  };
  const dayLabel = (iso, fallback) => {
    if (fallback) return fallback;
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00+07:00");
    const th = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
    return th[d.getDay()] + " " + d.getDate();
  };
  const refFor = (crop) => (state.daily.prices[crop] || []).find((p) => !p.buyer) || (state.daily.prices[crop] || [])[0];
  const wxOf = (name) => state.daily.weather.find((w) => w.n === name) || state.daily.weather[0];

  function vpts() {
    const tams = state.villages.tambons;
    const vills = state.villages.villages;
    const pts = tams.map((t, i) => ({ i, name: "ต." + t.t + " (จุดกลางตำบล)", tam: i, amp: t.a, x: t.x, y: t.y, isTam: true }));
    for (let j = 0; j < vills.length; j++) {
      const v = vills[j];
      pts.push({ i: tams.length + j, name: v.n, tam: v.ti, amp: tams[v.ti].a, x: v.x, y: v.y, isTam: false, src: v.src });
    }
    return pts;
  }
  function cellOf(i) {
    const idx = state.vdaily.cell_of[i];
    const wx = state.vdaily.wx[idx];
    const p = state.vdaily.cells[idx];
    return { p, c: wx.c, d: wx.d, dates: wx.dates, idx };
  }

  function buildPins() {
    const W = state.map.W, H = state.map.H;
    const c0 = state.map.wx_points[CENTER];
    const total = {};
    for (const b of state.buyers) {
      if (!state.map.buyers[b.id] && !b.outside) {
        total[b.district] = (total[b.district] || 0) + 1;
      }
    }
    const seen = {};
    const pins = [];
    for (const b of state.buyers) {
      const exact = state.map.buyers[b.id];
      const out = b.outside;
      let x, y, approx = false, ang = 0;
      if (exact) {
        x = exact[0]; y = exact[1];
      } else if (out) {
        const dx = out.tx - c0[0], dy = out.ty - c0[1];
        const tx = dx > 0 ? (W - EDGE_INSET - c0[0]) / dx : dx < 0 ? (EDGE_INSET - c0[0]) / dx : Infinity;
        const ty = dy > 0 ? (H - EDGE_INSET - c0[1]) / dy : dy < 0 ? (EDGE_INSET - c0[1]) / dy : Infinity;
        const t = Math.min(1, tx, ty);
        x = c0[0] + dx * t; y = c0[1] + dy * t;
        approx = true; ang = Math.atan2(dy, dx);
      } else {
        const c = state.map.wx_points[b.district] || c0;
        const i = seen[b.district] || 0;
        seen[b.district] = i + 1;
        const n = total[b.district] || 1;
        const a = Math.PI / 4 + (i * 2 * Math.PI) / n;
        x = c[0] + Math.cos(a) * APPROX_R;
        y = c[1] + Math.sin(a) * APPROX_R;
        approx = true; ang = a;
      }
      pins.push({ b, x, y, approx, out, ang });
    }
    return pins;
  }

  /* ---------- render map ---------- */
  function renderMap() {
    const m = state.map;
    const wx = wxOf(state.dist);
    const pts = vpts();
    const vp = pts[state.vsel] || pts[0];
    const pins = buildPins();
    const match = (b) => state.cropFilter === "ทั้งหมด" || b.crops.includes(state.cropFilter);
    const rainPct = wx.d[0][2];
    const raining = rainPct >= state.meta.rain_show_pct || wx.c[4] > 0;
    const cloudy = /เมฆ|ฝน/.test(wx.c[5] + wx.d[0][6]);
    const sunny = /แจ่มใส/.test(wx.c[5]);

    const neigh = m.neighbors.map((n) =>
      `<path d="${esc(n.d)}" fill="rgba(148,163,184,.08)" stroke="rgba(148,163,184,.25)" stroke-width="1"/>
       <text x="${n.lx}" y="${n.ly}" fill="rgba(234,242,255,.28)" font-size="18" text-anchor="middle">${esc(n.n)}</text>`
    ).join("");

    const dists = m.districts.map((s) => {
      const on = s.n === state.dist;
      return `<path class="nb-dist nb-draw${on ? " is-on" : ""}" data-dist="${esc(s.n)}" d="${esc(s.d)}" fill="${on ? "rgba(125,211,252,.28)" : "rgba(56,189,248,.10)"}" stroke="${on ? "#7DD3FC" : "rgba(125,211,252,.45)"}" stroke-width="${on ? 2.4 : 1.4}" tabindex="0" role="button" aria-label="อำเภอ${esc(s.n)}"/>`;
    }).join("");

    let vdots = "";
    if (state.showV) {
      for (const p of pts) {
        if (p.isTam) continue;
        const col = rainColor(cellOf(p.i).d[0][2]);
        const on = p.i === vp.i;
        vdots += `<circle class="vdot" data-vi="${p.i}" cx="${p.x}" cy="${p.y}" r="${on ? 4.5 : 2.4}" fill="${col}" opacity="${on ? 1 : 0.7}" stroke="${on ? "#fff" : "none"}" stroke-width="1"/>`;
      }
      for (const p of pts) {
        if (!p.isTam) continue;
        const col = rainColor(cellOf(p.i).d[0][2]);
        const on = p.i === vp.i;
        vdots += `<circle class="tdot" data-vi="${p.i}" cx="${p.x}" cy="${p.y}" r="${on ? 6 : 4.2}" fill="${col}" stroke="#fff" stroke-width="${on ? 1.6 : 0.8}" opacity=".95"/>`;
      }
    }

    const wxpts = state.daily.weather.map((w) => {
      const pt = m.wx_points[w.n];
      if (!pt) return "";
      const on = w.n === state.dist;
      return `<g class="wxpt" data-dist="${esc(w.n)}" transform="translate(${pt[0]},${pt[1]})" style="cursor:pointer">
        <circle r="16" fill="${on ? "rgba(125,211,252,.25)" : "rgba(0,0,0,.25)"}" stroke="${on ? "#7DD3FC" : "rgba(255,255,255,.2)"}"/>
        <text y="4" text-anchor="middle" fill="#EAF2FF" font-size="11" font-weight="600">${w.c[0].toFixed(0)}°</text>
      </g>`;
    }).join("");

    const pinSvg = pins.map((p) => {
      const col = state.meta.crop_color[p.b.crops[0]] || "#7DD3FC";
      const col2 = p.b.crops[1] ? state.meta.crop_color[p.b.crops[1]] : col;
      const on = p.b.id === state.selBuyer;
      const dim = !match(p.b);
      return `<g class="nb-pin" data-bid="${esc(p.b.id)}" transform="translate(${p.x},${p.y})" opacity="${dim ? 0.25 : 1}" tabindex="0" role="button" aria-label="${esc(p.b.name)}">
        ${on ? `<circle class="nb-pulse" r="8" fill="${col}" opacity=".5"/>` : ""}
        <circle class="nb-core" r="${on ? 10 : PIN_R}" fill="url(#pin-${esc(p.b.id)})" stroke="#fff" stroke-width="1.4"/>
        ${p.approx ? `<circle r="13" fill="none" stroke="${col}" stroke-dasharray="3 3" opacity=".7"/>` : ""}
        <defs><linearGradient id="pin-${esc(p.b.id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col2}"/></linearGradient></defs>
      </g>`;
    }).join("");

    $("map-svg").innerHTML = `<svg class="map" viewBox="0 0 ${m.W} ${m.H}" role="img" aria-label="แผนที่จังหวัดหนองบัวลำภู 6 อำเภอ">
      <defs>
        <linearGradient id="nbFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0ea5e9" stop-opacity=".15"/>
          <stop offset="1" stop-color="#22d3ee" stop-opacity=".05"/>
        </linearGradient>
        <filter id="nbGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${neigh}
      ${dists}
      <g filter="url(#nbGlow)">${vdots}</g>
      ${wxpts}
      ${pinSvg}
    </svg>`;

    $("map-svg").querySelectorAll("[data-dist]").forEach((n) => {
      const go = () => { state.dist = n.getAttribute("data-dist"); state.selBuyer = ""; rerender(); };
      n.addEventListener("click", go);
      n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    $("map-svg").querySelectorAll("[data-vi]").forEach((n) => {
      n.style.cursor = "pointer";
      n.addEventListener("click", () => {
        pickV(Number(n.getAttribute("data-vi")));
      });
    });
    $("map-svg").querySelectorAll("[data-bid]").forEach((n) => {
      const go = () => { state.selBuyer = n.getAttribute("data-bid"); rerender(); };
      n.addEventListener("click", go);
      n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });

    renderVfx(raining, rainPct, cloudy, sunny);
    renderHud(pins, match);
    renderMapCard(pins, wx);
    renderStats(pins);
    renderTicker();
    const svg = $("map-svg").querySelector("svg");
    if (window.NBLPhase1 && window.NBLPhase1.drawTourism && svg) window.NBLPhase1.drawTourism(svg, state);
  }

  function renderVfx(raining, rainPct, cloudy, sunny) {
    const box = $("vfx");
    box.innerHTML = "";
    if (raining) {
      const n = Math.round(rainPct * RAIN_DROPS_PER_PCT);
      for (let i = 0; i < n; i++) {
        const d = el("div", { class: "drop" });
        d.style.left = (i * 37) % 100 + "%";
        d.style.animationDelay = ((i * 0.13) % 2) + "s";
        d.style.animationDuration = (1.6 + (i % 5) * 0.15) + "s";
        box.append(d);
      }
    }
    if (cloudy) {
      for (let i = 0; i < 3; i++) {
        const c = el("div", { class: "cloud" });
        c.style.top = (6 + i * 10) + "%";
        c.style.animationDuration = (24 + i * 8) + "s";
        c.style.animationDelay = (-i * 7) + "s";
        c.style.opacity = String(0.5 + i * 0.15);
        box.append(c);
      }
    }
    if (sunny && !raining) {
      for (let i = 0; i < PARTICLES; i++) {
        const s = el("div", { class: "sun" });
        s.style.left = ((i * 17) % 100) + "%";
        s.style.bottom = ((i * 9) % 40) + "%";
        s.style.animationName = i % 2 ? "nbFloatB" : "nbFloatA";
        s.style.animationDelay = ((i * 0.2) % 4) + "s";
        box.append(s);
      }
    }
  }

  function renderHud(pins, match) {
    const crops = ["ทั้งหมด"].concat(state.meta.crops.filter((c) => state.buyers.some((b) => b.crops.includes(c))));
    const hud = $("map-hud");
    hud.innerHTML = "";
    const row = el("div", { class: "chips" });
    for (const d of state.meta.districts) {
      row.append(el("button", { class: "nb-chip" + (state.dist === d ? " is-on" : ""), type: "button", onclick: () => { state.dist = d; state.selBuyer = ""; rerender(); } }, d.replace("เมืองหนองบัวลำภู", "เมือง")));
    }
    hud.append(row);
    const row2 = el("div", { class: "chips" });
    for (const c of crops) {
      const col = c === "ทั้งหมด" ? null : state.meta.crop_color[c];
      const btn = el("button", { class: "nb-chip" + (state.cropFilter === c ? " is-on" : ""), type: "button", onclick: () => { state.cropFilter = c; rerender(); } }, c);
      if (col) btn.style.borderColor = col;
      row2.append(btn);
    }
    row2.append(el("button", { class: "nb-chip" + (state.showV ? " is-on" : ""), type: "button", onclick: () => { state.showV = !state.showV; rerender(); } }, state.showV ? "ซ่อนจุดหมู่บ้าน" : "แสดงจุดหมู่บ้าน"));
    row2.append(el("button", { class: "nb-chip" + (state.showTourism ? " is-on" : ""), type: "button", onclick: () => { state.showTourism = !state.showTourism; rerender(); } }, state.showTourism ? "ซ่อนจุดเที่ยว" : "แสดงจุดเที่ยว"));
    hud.append(row2);
  }

  function renderMapCard(pins, wx) {
    const box = $("map-card");
    const sel = pins.find((p) => p.b.id === state.selBuyer);
    if (sel) {
      const b = sel.b;
      const phone = b.phone ? `<div class="phone"><a class="nb-link" href="tel:${esc(String(b.phone).replace(/[^0-9+]/g, ""))}">${esc(b.phone)}</a></div>` : `<div class="muted">ไม่พบเบอร์ในแหล่งที่เปิดเผย</div>`;
      const price = b.price ? `<div><b>${esc(b.price)}</b><div class="muted">${esc(b.priceDate || "")} · ผู้ซื้อ</div></div>` : (() => {
        const r = refFor(b.crops[0]);
        return r ? `<div>ราคาอ้างอิง ${esc(r.item)}: <b>${esc(r.value)}</b> ${esc(r.unit)} <div class="muted">${esc(r.date)} · ${esc(r.kind)}</div></div>` : "";
      })();
      box.innerHTML = `<h3>${esc(b.name)}</h3>
        <p>${esc(b.type)} · ${esc(b.district === "ใกล้เคียง" && b.outside ? b.outside.amp + " จ." + b.outside.prov + " (ห่างราว " + b.outside.km + " กม.)" : "อ." + b.district)}</p>
        <p>${esc(b.address || "")}${sel.approx ? " · ตำแหน่งโดยประมาณ" : ""}</p>
        ${phone}
        ${price}
        <p><a class="nb-link" href="${esc(b.maps)}" target="_blank" rel="noopener">เปิดแผนที่</a>
        ${b.lat && b.lon ? ` · <a class="nb-link" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}" target="_blank" rel="noopener">นำทาง</a>` : ""}
        · แหล่ง: <a class="nb-link" href="${esc(b.src)}" target="_blank" rel="noopener">${esc(host(b.src))}</a></p>`;
      return;
    }
    const nIn = state.buyers.filter((b) => b.district === state.dist).length;
    box.innerHTML = `<h3>อ.${esc(state.dist)}</h3>
      <p>${esc(wx.c[5])} · ${wx.c[0].toFixed(1)}°C รู้สึกเหมือน ${wx.c[1].toFixed(1)}°C</p>
      <p>ความชื้น ${wx.c[2]}% · ลม ${wx.c[3]} กม./ชม. · ฝนตอนนี้ ${wx.c[4]} มม.</p>
      <p>วันนี้ต่ำสุด ${wx.d[0][0]}° สูงสุด ${wx.d[0][1]}° · โอกาสฝน ${wx.d[0][2]}% (${wx.d[0][3]} มม.)</p>
      <p class="muted">จุดรับซื้อในอำเภอนี้ ${nIn} แห่ง · แตะหมุดหรือชื่ออำเภอเพื่อดูรายละเอียด</p>`;
  }

  function renderStats() {
    const box = $("map-stats");
    const exactN = state.buyers.filter((b) => state.map.buyers[b.id]).length;
    box.innerHTML = "";
    const items = [
      [state.meta.districts.length, "อำเภอ"],
      [state.villages.tambons.length, "ตำบล"],
      [state.villages.villages.length, "จุดหมู่บ้าน"],
      [state.buyers.length, "จุดรับซื้อ (" + exactN + " มีพิกัด)"],
    ];
    for (const [n, label] of items) {
      box.append(el("div", { class: "nb-glass stat" }, el("b", { text: String(n) }), el("span", { text: label })));
    }
  }

  function renderTicker() {
    const parts = [];
    for (const c of state.meta.crops) {
      for (const p of state.daily.prices[c] || []) {
        parts.push(`${c} · ${p.item}  ${p.value}${p.unit ? " " + p.unit : ""} (${p.date})`);
      }
    }
    const line = parts.join("   •   ");
    $("ticker").innerHTML = `<span>${esc(line)}</span><span>${esc(line)}</span>`;
  }

  /* ---------- now / 7day / tmd ---------- */
  function renderNow() {
    const wx = wxOf(state.dist);
    const live = state.liveWx;
    $("now-panel").innerHTML = "";
    $("now-panel").append(
      el("div", { style: "display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap" },
        el("h2", { text: "อากาศตอนนี้ · อ." + state.dist }),
        el("span", { class: "live-badge" + (live ? " on" : "") }, el("i"), live ? "สดจาก Open-Meteo" : "ข้อมูลสำรอง")
      ),
      el("div", { class: "now-temp" }, String(wx.c[0].toFixed(1)), el("small", { text: " °C" })),
      el("div", { class: "muted" }, wx.c[5] + " · รู้สึกเหมือน " + wx.c[1].toFixed(1) + "°C"),
      el("div", { class: "kv" },
        kv("ความชื้น", wx.c[2] + "%"),
        kv("ลม", wx.c[3] + " กม./ชม."),
        kv("ฝนตอนนี้", wx.c[4] + " มม."),
        kv("โอกาสฝนวันนี้", wx.d[0][2] + "% · " + wx.d[0][3] + " มม."),
      ),
      el("p", { class: "muted" }, live
        ? "ดึงสดจาก Open-Meteo ในเบราว์เซอร์ ถ้าดึงไม่ได้จะใช้ข้อมูลสำรองในเว็บ"
        : "เวลาค่าปัจจุบัน (สำรอง): " + state.daily.wx_at + " · อัปเดตหน้า " + state.daily.updated)
    );

    const tmd = $("tmd-mini");
    tmd.innerHTML = `<h2>กรมอุตุฯ ทั้งจังหวัด</h2>
      <p><b>${esc(state.daily.tmd_note.lead)}</b></p>
      <p class="muted">${esc(state.daily.tmd_note.text)}</p>
      <p class="muted">ดูตาราง 7 วันด้านล่าง · แหล่ง: <a class="nb-link" href="https://www.tmd.go.th/forecast/sevendays" target="_blank" rel="noopener">tmd.go.th</a></p>`;
  }
  function kv(k, v) { return el("div", {}, el("span", { class: "muted", text: k }), el("b", { text: v })); }

  function renderWx7() {
    const wx = wxOf(state.dist);
    $("wx7-title").textContent = "พยากรณ์ 7 วัน · อ." + state.dist;
    const box = $("wx7-grid");
    box.innerHTML = "";
    const lo = Math.min(...wx.d.map((d) => d[0]));
    const hi = Math.max(...wx.d.map((d) => d[1]));
    const span = Math.max(1, hi - lo);
    wx.d.forEach((d, i) => {
      const h = ((d[1] - d[0]) / span) * 100;
      const label = dayLabel(wx.dates ? wx.dates[i] : state.daily.days_iso[i], state.liveWx ? null : state.daily.days[i]);
      const card = el("article", { class: "nb-glass day-card" },
        el("div", { class: "name", text: label }),
        el("div", { text: d[6] }),
        el("div", { class: "bars" }, el("div", { class: "bar", style: "height:" + Math.max(8, h) + "%" })),
        el("div", { class: "hi", text: d[1].toFixed(1) + "°" }),
        el("div", { class: "lo", text: d[0].toFixed(1) + "°" }),
        el("div", { class: "muted", text: "ฝน " + d[2] + "% · " + d[3] + " มม." }),
        el("div", { class: "muted", text: "ลม " + d[4] + " · ความชื้น " + d[5] + "%" }),
      );
      box.append(card);
    });
  }

  function renderTmd() {
    const box = $("tmd-body");
    box.innerHTML = "";
    box.append(el("div", { class: "nb-glass callout" },
      el("strong", { text: state.daily.tmd_note.lead }),
      document.createTextNode(state.daily.tmd_note.text)
    ));
    const grid = el("div", { class: "grid-7" });
    for (const r of state.daily.tmd) {
      grid.append(el("article", { class: "nb-glass day-card" },
        el("div", { class: "name", text: r[0] }),
        el("div", { text: r[1] }),
        el("div", { class: "hi", text: r[3] + "°" }),
        el("div", { class: "lo", text: r[2] + "°" }),
        el("div", { class: "muted", text: "ฝน " + r[4] + "%" }),
        el("div", { class: "muted", text: "ลม " + r[5] + " กม./ชม." }),
      ));
    }
    box.append(grid);
    box.append(el("p", { class: "muted" }, "ตัวเลขในตารางนี้มาจากกรมอุตุฯ (สำรองในเว็บ) ไม่ดึงสดอัตโนมัติ เพราะ API ของกรมอุตุฯ อาจไม่เปิดให้เบราว์เซอร์เรียกข้ามเว็บ"));
  }

  /* ---------- villages ---------- */
  function pickV(i) {
    state.vsel = i;
    const pts = vpts();
    const p = pts[i];
    if (p) state.dist = state.meta.districts[p.amp];
    state.vq = "";
    rerender();
    $("village").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderVillage() {
    const pts = vpts();
    const vp = pts[state.vsel] || pts[0];
    const vcell = cellOf(vp.i);
    const near = state.vdaily.near[vp.i];
    const vstn = state.vdaily.stations[near[0]];
    const vkm = near[1];
    const vSame = state.vdaily.cell_of.filter((c) => c === vcell.idx).length;
    const tams = pts.filter((p) => p.isTam && p.amp === vp.amp);
    const vills = pts.filter((p) => !p.isTam && p.tam === vp.tam);
    const vName = vp.isTam ? vp.name : vp.name + " ต." + state.villages.tambons[vp.tam].t;
    const vq2 = state.vq.trim();
    const matches = vq2 ? pts.filter((p) => p.name.includes(vq2) || state.villages.tambons[p.tam].t.includes(vq2)).slice(0, state.meta.search_max) : [];

    $("village-caption").textContent = (state.liveVillages
      ? "พยากรณ์สดจาก Open-Meteo ECMWF IFS"
      : "พยากรณ์สำรอง ณ " + fmtAt(state.vdaily.at)) +
      " · ฝนวัดจริงจากสถานี ณ " + fmtAt(vstn.t || state.vdaily.at) + " (เวลาไทย)";

    const filters = $("village-filters");
    filters.innerHTML = "";
    const search = el("div", { class: "field" },
      el("label", { text: "ค้นหาชื่อหมู่บ้านหรือตำบล" }),
      el("input", { type: "search", value: state.vq, placeholder: "เช่น บ้านกุดจิก, นาวัง", oninput: (e) => { state.vq = e.target.value; renderVillage(); } })
    );
    if (matches.length) {
      const sug = el("div", { class: "suggest", role: "listbox" });
      for (const p of matches) {
        sug.append(el("button", { type: "button", onclick: () => pickV(p.i) },
          p.name + " · อ." + state.meta.districts[p.amp] + (p.isTam ? "" : " ต." + state.villages.tambons[p.tam].t)
        ));
      }
      search.append(sug);
    } else if (vq2) {
      search.append(el("div", { class: "suggest" }, el("div", { style: "padding:8px 12px", class: "muted", text: "ไม่พบ \"" + vq2 + "\" ในรายชื่อที่มีพิกัด เลือกตำบลที่หมู่บ้านนั้นอยู่แทน ค่าจะใกล้เคียงกันเพราะอยู่ช่องกริดเดียวกันหรือติดกัน" })));
    }
    const ampSel = el("select", { onchange: (e) => {
      const a = state.meta.districts.indexOf(e.target.value);
      const t = pts.find((p) => p.isTam && p.amp === a);
      if (t) pickV(t.i);
    } });
    for (const d of state.meta.districts) ampSel.append(el("option", { value: d, selected: state.meta.districts[vp.amp] === d }, d));
    const tamSel = el("select", { onchange: (e) => pickV(Number(e.target.value)) });
    for (const t of tams) tamSel.append(el("option", { value: String(t.i), selected: t.tam === vp.tam }, "ต." + state.villages.tambons[t.tam].t));
    const vilSel = el("select", { onchange: (e) => pickV(Number(e.target.value)) });
    vilSel.append(el("option", { value: String(tams.find((t) => t.tam === vp.tam).i), selected: vp.isTam }, "จุดกลางตำบล"));
    for (const v of vills) vilSel.append(el("option", { value: String(v.i), selected: v.i === vp.i }, v.name));

    filters.append(
      search,
      el("div", { class: "field" }, el("label", { text: "อำเภอ" }), ampSel),
      el("div", { class: "field" }, el("label", { text: "ตำบล" }), tamSel),
      el("div", { class: "field" }, el("label", { text: "หมู่บ้าน" }), vilSel),
    );

    const r24 = vstn.r24 == null ? "ไม่มีค่า" : vstn.r24 + " มม.";
    const r1 = vstn.r1 == null ? "ไม่มีค่า" : vstn.r1 + " มม.";
    const body = $("village-body");
    body.innerHTML = "";
    body.append(
      el("div", { class: "nb-glass panel" },
        el("h2", { text: vName + " · อ." + state.meta.districts[vp.amp] }),
        el("div", { class: "now-temp" }, String(vcell.c[0].toFixed(1)), el("small", { text: " °C" })),
        el("div", { class: "muted" }, wdesc(vcell.c[3]) + (vcell.c[2] > 0 ? " · ฝนตอนนี้ " + vcell.c[2] + " มม." : "") + " · ความชื้น " + vcell.c[1] + "%"),
        el("div", { class: "kv" },
          kv("สถานีฝนใกล้สุด", vstn.n + (vstn.amp ? " · " + vstn.amp : "") + (vstn.prov && vstn.prov !== "หนองบัวลำภู" ? " จ." + vstn.prov : "")),
          kv("ระยะจากจุด", vkm + " กม. · หน่วยงาน " + (vstn.ag || "—")),
          kv("ฝน 24 ชม. (วัดจริง)", r24),
          kv("ฝนชั่วโมงล่าสุด", r1),
        ),
        el("p", { class: "muted" }, "เวลาสถานี: " + fmtAt(vstn.t) + " · แหล่ง ThaiWater สสน. (ค่าที่เกิดแล้ว ไม่ใช่พยากรณ์)")
      ),
      el("div", { class: "nb-glass callout" },
        el("strong", { text: "ความละเอียดจริง ~" + state.meta.grid_km + " กม." }),
        document.createTextNode("พยากรณ์จากโมเดล ECMWF IFS ความละเอียดราว " + state.meta.grid_km + " กม. (ดึงผ่าน Open-Meteo) ไม่ใช่พยากรณ์เฉพาะหมู่บ้าน หมู่บ้านที่อยู่ช่องกริดเดียวกันจะได้ค่าเดียวกัน จุดนี้อยู่ช่องกริดที่กึ่งกลาง " + vcell.p[0].toFixed(3) + ", " + vcell.p[1].toFixed(3) + " และมี " + vSame + " จุดในหน้านี้ร่วมช่องเดียวกัน ไม่มีแหล่งฟรีที่ละเอียดกว่านี้สำหรับไทย")
      )
    );
    const grid = el("div", { class: "grid-7" });
    vcell.d.forEach((d, i) => {
      const label = dayLabel((vcell.dates || [])[i]);
      grid.append(el("article", { class: "nb-glass day-card" },
        el("div", { class: "name", text: label }),
        el("div", { text: wdesc(d[4]) }),
        el("div", { class: "hi", text: d[1].toFixed(1) + "°" }),
        el("div", { class: "lo", text: d[0].toFixed(1) + "°" }),
        el("div", { class: "muted", text: "ฝน " + d[2] + "% · " + d[3] + " มม." }),
      ));
    });
    body.append(el("h3", { text: "พยากรณ์ 7 วันของช่องกริดนี้" }), grid);
  }

  /* ---------- prices / series / buyers ---------- */
  function renderPrices() {
    const chips = $("price-crops");
    chips.innerHTML = "";
    for (const c of state.meta.crops) {
      chips.append(el("button", { class: "nb-chip" + (state.priceCrop === c ? " is-on" : ""), type: "button", style: "border-color:" + state.meta.crop_color[c], onclick: () => { state.priceCrop = c; renderPrices(); } }, c));
    }
    const rows = state.daily.prices[state.priceCrop] || [];
    $("price-table").innerHTML = `<table><thead><tr><th>รายการ</th><th>ราคา</th><th>หน่วย</th><th>วันที่</th><th>ชนิดราคา</th><th>แหล่ง</th></tr></thead><tbody>${
      rows.map((p) => `<tr><td>${esc(p.item)}</td><td><b>${esc(p.value)}</b></td><td>${esc(p.unit)}</td><td>${esc(p.date)}</td><td><span class="tag ${p.buyer ? "buyer" : "ref"}">${p.buyer ? "ผู้ซื้อ" : "อ้างอิง"} · ${esc(p.kind)}</span></td><td>${p.src ? `<a class="nb-link" href="${esc(p.src)}" target="_blank" rel="noopener">${esc(host(p.src))}</a>` : ""}</td></tr>`).join("")
    }</tbody></table>`;

    const ser = state.daily.series[state.priceCrop];
    const block = $("series-block");
    if (!ser) { block.innerHTML = "<p class=\"muted\">พืชนี้ยังไม่มีซีรีส์ราคาย้อนหลังจาก สศก.</p>"; return; }
    const w = 1000, h = 220, pL = 54, pR = 16, pT = 16, pB = 36;
    const dates = state.daily.series_dates;
    const n = ser.med.length;
    const x = (i) => pL + (i * (w - pL - pR)) / Math.max(1, n - 1);
    const y = (v) => pT + (1 - (v - ser.floor) / (ser.ceiling - ser.floor)) * (h - pT - pB);
    const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const area = path(ser.hi) + " " + ser.lo.slice().reverse().map((v, i) => "L" + x(n - 1 - i).toFixed(1) + " " + y(v).toFixed(1)).join(" ") + "Z";
    const ticks = dates.map((d, i) => (i % 3 === 0 || i === n - 1) ? `<text x="${x(i)}" y="${h - 10}" text-anchor="middle" fill="rgba(234,242,255,.45)" font-size="11">${esc(d)}</text>` : "").join("");
    block.innerHTML = `<h3>ราคาย้อนหลัง 1 เดือน · ${esc(ser.name)}</h3>
      <p class="caption">${esc(ser.unit)} · ค่ากลางและช่วงต่ำสุด–สูงสุดของตลาดที่ สศก. รายงาน</p>
      <svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="กราฟราคา ${esc(ser.name)}">
        <path d="${area}" fill="rgba(125,211,252,.15)" stroke="none"/>
        <path d="${path(ser.med)}" fill="none" stroke="#7DD3FC" stroke-width="2.2"/>
        <path d="${path(ser.lo)}" fill="none" stroke="rgba(253,230,138,.6)" stroke-width="1" stroke-dasharray="4 3"/>
        <path d="${path(ser.hi)}" fill="none" stroke="rgba(196,181,253,.6)" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="${pL}" y="14" fill="rgba(234,242,255,.55)" font-size="11">${ser.ceiling}</text>
        <text x="${pL}" y="${h - pB + 4}" fill="rgba(234,242,255,.55)" font-size="11">${ser.floor}</text>
        ${ticks}
      </svg>
      <p class="muted">เส้นฟ้า = ค่ากลาง · เส้นประ = ต่ำสุด / สูงสุด</p>`;
  }

  function renderBuyers() {
    const dists = ["ทั้งหมด"].concat(state.meta.districts).concat(["ใกล้เคียง"]);
    const crops = ["ทั้งหมด"].concat(state.meta.crops);
    const box = $("buyer-filters");
    box.innerHTML = "";
    for (const d of dists) box.append(el("button", { class: "nb-chip" + (state.bDist === d ? " is-on" : ""), type: "button", onclick: () => { state.bDist = d; renderBuyers(); } }, d));
    box.append(el("span", { class: "muted", text: " · " }));
    for (const c of crops) box.append(el("button", { class: "nb-chip" + (state.bCrop === c ? " is-on" : ""), type: "button", onclick: () => { state.bCrop = c; renderBuyers(); } }, c));

    const list = state.buyers.filter((b) => (state.bDist === "ทั้งหมด" || b.district === state.bDist) && (state.bCrop === "ทั้งหมด" || b.crops.includes(state.bCrop)));
    const grid = $("buyer-grid");
    grid.innerHTML = "";
    for (const b of list) {
      const col = state.meta.crop_color[b.crops[0]];
      const phone = b.phone
        ? el("div", { class: "phone" }, el("a", { class: "nb-link", href: "tel:" + String(b.phone).replace(/[^0-9+]/g, "") }, b.phone))
        : el("div", { class: "muted", text: "ไม่พบเบอร์ในแหล่งที่เปิดเผย" });
      const price = b.price
        ? el("p", {}, el("b", { text: b.price }), el("div", { class: "muted", text: (b.priceDate || "") + " · ผู้ซื้อ" }))
        : el("p", { class: "muted", text: "ยังไม่มีราคาประกาศของรายนี้ ใช้ราคาอ้างอิงด้านบน" });
      const loc = b.outside ? b.outside.amp + " จ." + b.outside.prov + " (ห่างราว " + b.outside.km + " กม.)" : "อ." + b.district;
      grid.append(el("article", { class: "nb-glass buyer" },
        el("h3", {}, el("span", { class: "dot", style: "background:" + col }), " ", b.name),
        el("div", { class: "muted", text: b.type + " · " + loc }),
        el("div", { text: b.address || "" }),
        el("div", { text: "พืช: " + b.crops.join(", ") }),
        phone, price,
        el("p", {},
          el("a", { class: "nb-link", href: b.maps, target: "_blank", rel: "noopener" }, "เปิดแผนที่"),
          b.lat && b.lon ? " · " : "",
          b.lat && b.lon ? el("a", { class: "nb-link", href: "https://www.google.com/maps/dir/?api=1&destination=" + b.lat + "," + b.lon, target: "_blank", rel: "noopener" }, "นำทาง") : null,
          " · ",
          el("a", { class: "nb-link", href: b.src, target: "_blank", rel: "noopener" }, host(b.src))
        )
      ));
    }
  }

  /* ---------- sources ---------- */
  function renderSources() {
    const km = state.meta.grid_km;
    const rows = [
      ["Open-Meteo (โมเดล ECMWF IFS)", "ถามได้ทุกพิกัด แต่ค่าเปลี่ยนทุกช่องกริด ~" + km + " กม. (ทดสอบแล้ว: จุดห่างกัน 2 กม. ได้ฝนเท่ากัน)", "ใช้: อำเภอ ตำบล หมู่บ้าน", "ฟรี ไม่ต้องใช้คีย์ รายตำบล/หมู่บ้านล็อกโมเดล ecmwf_ifs รายอำเภอใช้ค่าตั้งต้น (ได้ช่องกริด ECMWF เดียวกัน + ค่า UV)"],
      ["Open-Meteo โมเดลฟรีอื่นที่ครอบคลุมไทย", "ทดสอบที่หนองบัวลำภู 18 พ.ย. 69: UKMO ~10 กม., KMA GDPS ~10 กม. (ไม่มีค่าส่งกลับมา), GFS ~13 กม., ICON และ CMA ~14 กม., GEM ~17 กม., ECMWF IFS 0.25° และ ARPEGE ~28 กม., JMA ~55 กม. ส่วน best_match ใช้ ECMWF IFS ตัวเดียวกัน", "ไม่ใช้", "ฟรี แต่ไม่มีตัวไหนละเอียดกว่า ECMWF IFS สำหรับไทย"],
      ["ThaiWater สสน. (สถานีวัดฝนหลายหน่วยงาน)", "รายสถานี ฝนวัดจริงรายชั่วโมง/24 ชม. ในจังหวัดมี 29 สถานี (เป็นค่าที่เกิดแล้ว ไม่ใช่พยากรณ์)", "ใช้: สถานีใกล้สุดของทุกจุด", "ฟรี API สาธารณะ"],
      ["กรมอุตุนิยมวิทยา พยากรณ์ 7 วัน", "รายจังหวัด", "ใช้: พยากรณ์ทางการ", "ฟรี"],
      ["กรมอุตุนิยมวิทยา NWP API", "ตามพิกัดหรือชื่อตำบล รายชั่วโมง 48 ชม. จากโดเมน 2 กม. / รายวันจากโดเมน 18–27 กม. (ตามเอกสาร API)", "ยังไม่ใช้", "ฟรี แต่ต้องสมัครและสร้าง token เอง จำกัด 60 ครั้ง/นาที"],
      ["Google Weather API (Maps Platform)", "ตามพิกัด ระดับไม่กี่ กม. โมเดล WeatherNext 3 (อุณหภูมิ/ความชื้น 5 กม. ค่าผิวอื่น 10 กม.) ไทยอยู่ในพื้นที่รองรับ", "ยังไม่ใช้", "ต้องมี API key + เปิด billing — ไม่ใช้เพราะป๋าไม่ต้องการเสียเงิน"],
      ["Google Search / แอป Weather ของ Google", "ตามตำแหน่งที่ค้น ใช้โมเดล WeatherNext 3 เดียวกัน", "ยังไม่ใช้", "ดูฟรีทีละจุด ไม่มีช่องทางดึงข้อมูลเข้าหน้านี้โดยตรง"],
      ["GISTDA", "ภาพฝนจากดาวเทียมทุก 30 นาที กริด 0.1° (~11 กม.) เป็นชั้นแผนที่ภาพ", "ยังไม่ใช้", "ภาพดูฟรี ไม่ละเอียดกว่า Open-Meteo"],
      ["เรดาร์กรมอุตุฯ / ThaiWater", "ภาพกลุ่มฝนตอนนี้ ละเอียดระดับกิโลเมตร", "ลิงก์ไปดูภาพ", "ฟรี เป็นภาพ ไม่ใช่ตัวเลขรายหมู่บ้าน"],
    ];
    const official = state.villages.official;
    const cov = state.villages.cov;
    const tams = state.villages.tambons;
    const districts = state.meta.districts;
    const noCoord = official.map((o, a) => Math.max(0, o - cov[a][0]));
    const offTotal = cov.reduce((s, c) => s + c[0], 0);
    const officialTotal = official.reduce((s, x) => s + x, 0);
    const osmTotal = cov.reduce((s, c) => s + c[1], 0);
    const covRows = districts.map((n, a) => [n, tams.filter((t) => t.a === a).length, official[a], cov[a][0], cov[a][1], noCoord[a], Math.min(100, Math.round((cov[a][0] * 100) / official[a])) + "%"]);
    covRows.push(["รวม", tams.length, officialTotal, offTotal, osmTotal, noCoord.reduce((s, x) => s + x, 0), Math.round((offTotal * 100) / officialTotal) + "%"]);

    const missRows = state.villages.missing.map((m) => ["ต." + tams[m[0]].t, districts[tams[m[0]].a], m[1].map((k) => "ม." + k).join(", ")]);

    $("wxsrc-body").innerHTML = `
      ${table(["แหล่ง", "ละเอียดสุดที่มีจริง", "ในหน้านี้", "เงื่อนไข / ค่าใช้จ่าย"], rows)}
      <p>ความครบถ้วนของพิกัดหมู่บ้านบนหน้านี้ เทียบจำนวนหมู่บ้านทางการปี 2569 พิกัดหลักมาจากชั้นข้อมูล "ตำแหน่งหมู่บ้าน" ของ GISTDA (รหัสหมู่บ้านกรมการปกครอง ข้อมูลปี 2552–2555) ใช้ไฟล์กรมการปกครองปี 2566 แทนเมื่อมีรหัสเดียวกัน ตรวจแล้วทุกจุดต้องอยู่ในตำบลของตัวเอง เติมจุดจาก OpenStreetMap เมื่อชื่อไม่ซ้ำ หมู่บ้านที่ยังไม่มีพิกัดให้ดูจุดกลางตำบล รวมมีจุดหมู่บ้าน ${state.villages.villages.length} จุด</p>
      ${table(["อำเภอ", "ตำบล", "หมู่บ้านทางการ (2569)", "มีพิกัดทางการ", "จุด OSM เพิ่ม", "ใช้จุดกลางตำบล", "ครอบคลุม"], covRows)}
      <p>เลขหมู่ที่รู้ว่าขาดพิกัด (เลขที่ข้ามไปในลำดับหมู่ของตำบล) ใช้ค่าพยากรณ์ของจุดกลางตำบล หมู่บ้านตั้งใหม่หลังปี 2555 ที่ไม่อยู่ในข้อมูลไม่มีรายชื่อให้แสดง</p>
      ${table(["ตำบล", "อำเภอ", "หมู่ที่ไม่มีพิกัด (ใช้จุดกลางตำบล)"], missRows)}
      <div class="links" style="margin-top:14px">${sourceLinks([
        ["Open-Meteo: เอกสาร API และรายชื่อโมเดล", "open-meteo.com", "https://open-meteo.com/en/docs"],
        ["Open-Meteo: ECMWF IFS 9 กม.", "open-meteo.com", "https://open-meteo.com/en/docs/ecmwf-api"],
        ["ThaiWater: ฝน 24 ชม. ทุกสถานี (API สาธารณะ)", "api-v3.thaiwater.net", "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h"],
        ["ThaiWater: เรดาร์ฝน", "thaiwater.net", "https://www.thaiwater.net/weather/radar"],
        ["กรมอุตุฯ: เรดาร์และภาพอากาศ", "weather.tmd.go.th", "https://weather.tmd.go.th/"],
        ["กรมอุตุฯ: NWP API พยากรณ์ตามพิกัด", "data.tmd.go.th", "https://data.tmd.go.th/nwpapi/doc/apidoc/forecast_location.html"],
        ["GISTDA: ชั้นข้อมูลฝน 30 นาที", "gistdaportal.gistda.or.th", "https://gistdaportal.gistda.or.th/data/rest/services/GFlood/GFlood_Inno_WMS/MapServer/0"],
        ["GISTDA: ชั้นข้อมูลตำแหน่งหมู่บ้าน (แหล่งพิกัดหลัก)", "gistdaportal.gistda.or.th", "https://gistdaportal.gistda.or.th/arcgis/rest/services/%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B9%80%E0%B8%82%E0%B8%95%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%9B%E0%B8%81%E0%B8%84%E0%B8%A3%E0%B8%AD%E0%B8%87/MapServer/1"],
        ["ตำแหน่งหมู่บ้าน OpenStreetMap (เติมจุดที่ขาด)", "openstreetmap.org", "https://www.openstreetmap.org/"],
        ["กรมการปกครอง: ที่ตั้งหมู่บ้าน 76 จังหวัด", "data.go.th", "https://data.go.th/dataset/gis-01"],
        ["จำนวนหมู่บ้านทั้งสิ้นในจังหวัด (2569)", "thaigovdata.com", "https://thaigovdata.com/datasets/mooban"],
      ])}</div>`;

    $("gaps-body").innerHTML = "";
    for (const g of state.daily.gaps) {
      $("gaps-body").append(el("article", { class: "nb-glass" }, el("h3", { text: g.title }), el("p", { class: "muted", text: g.detail })));
    }
    $("sources-body").innerHTML = sourceLinks([
      ["Open-Meteo พยากรณ์รายอำเภอ", "open-meteo.com", "https://open-meteo.com/"],
      ["พยากรณ์ 7 วัน กรมอุตุนิยมวิทยา", "tmd.go.th", "https://www.tmd.go.th/forecast/sevendays"],
      ["ราคาสินค้าเกษตรรายวันรายตลาด", "nabc.go.th", "https://nabc.go.th/dashboard/farm-prices"],
      ["ราคายางตลาดกลาง กยท. 8 จังหวัด", "rubberth.com", "https://rubberth.com/%E0%B8%A3%E0%B8%B2%E0%B8%84%E0%B8%B2%E0%B8%A2%E0%B8%B2%E0%B8%87-%E0%B8%81%E0%B8%A2%E0%B8%97"],
      ["ราคาหัวมันสด สมาคมโรงงานมันฯ อีสาน", "nettathai.org", "https://www.nettathai.org/2012-02-06-06-49-09.html"],
      ["ราคามันวันนี้ เชาวน์ดี อีสาน", "chaodeeesan.com", "https://chaodeeesan.com/"],
      ["ราคาข้าวเปลือกเฉลี่ย พ.ย. 69", "moc.go.th", "https://www.moc.go.th/th/gallery/category/detail/id/5/iid/9730338"],
      ["ราคาอ้อยขั้นต้น 2568/69 (890 บาท)", "prd.go.th", "https://prd.go.th/main/article/7f7de6ae-0f72-425b-856a-a4e8687347e4"],
      ["รายชื่อธุรกิจในหนองบัวลำภู", "thaisupplyhub.com", "https://thaisupplyhub.com/city/nong_bua_lam_phu"],
      ["ขอบเขตอำเภอสำหรับแผนที่", "github.com/chingchai/OpenGISData-Thailand", "https://github.com/chingchai/OpenGISData-Thailand"],
    ]);
  }
  function table(cols, rows) {
    return `<div class="table-wrap" style="margin:12px 0"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
    }</tbody></table></div>`;
  }
  function sourceLinks(items) {
    return items.map(([title, site, href]) => `<a class="nb-glass" href="${esc(href)}" target="_blank" rel="noopener">${esc(title)}<small>${esc(site)}</small></a>`).join("");
  }

  function rerender() {
    renderMap();
    renderNow();
    renderWx7();
    renderVillage();
  }

  /* ---------- live Open-Meteo ---------- */
  function omUrl(lats, lons, kind) {
    const base = "https://api.open-meteo.com/v1/forecast";
    if (kind === "district") {
      return `${base}?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,relative_humidity_2m_mean,uv_index_max&timezone=Asia%2FBangkok&forecast_days=7`;
    }
    return `${base}?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,weather_code&timezone=Asia%2FBangkok&forecast_days=7&models=ecmwf_ifs`;
  }
  function asList(data) { return Array.isArray(data) ? data : [data]; }

  async function refreshLiveDistricts() {
    const lats = state.daily.weather.map((w) => w.lat).join(",");
    const lons = state.daily.weather.map((w) => w.lon).join(",");
    const res = await fetch(omUrl(lats, lons, "district"));
    if (!res.ok) throw new Error("open-meteo district " + res.status);
    const list = asList(await res.json());
    list.forEach((row, i) => {
      const w = state.daily.weather[i];
      if (!w || !row.current) return;
      const c = row.current, d = row.daily;
      w.c = [c.temperature_2m, c.apparent_temperature, c.relative_humidity_2m, c.wind_speed_10m, c.precipitation, wdesc(c.weather_code)];
      w.code = c.weather_code;
      w.dates = d.time;
      w.d = d.time.map((_, k) => [
        d.temperature_2m_min[k], d.temperature_2m_max[k], d.precipitation_probability_max[k],
        d.precipitation_sum[k], d.wind_speed_10m_max[k], d.relative_humidity_2m_mean[k], wdesc(d.weather_code[k]),
      ]);
      w.codes = d.weather_code;
      w.uv = d.uv_index_max;
    });
    if (list[0] && list[0].current && list[0].current.time) {
      state.daily.wx_at_iso = list[0].current.time;
      state.daily.days_iso = list[0].daily.time;
    }
    state.liveWx = true;
  }

  async function refreshLiveCells() {
    const cells = state.vdaily.cells;
    const lats = cells.map((c) => c[0]).join(",");
    const lons = cells.map((c) => c[1]).join(",");
    const res = await fetch(omUrl(lats, lons, "cell"));
    if (!res.ok) throw new Error("open-meteo cells " + res.status);
    const list = asList(await res.json());
    list.forEach((row, i) => {
      const wx = state.vdaily.wx[i];
      if (!wx || !row.current) return;
      const c = row.current, d = row.daily;
      wx.c = [c.temperature_2m, c.relative_humidity_2m, c.precipitation, c.weather_code];
      wx.dates = d.time;
      wx.d = d.time.map((_, k) => [
        d.temperature_2m_min[k], d.temperature_2m_max[k],
        d.precipitation_probability_max[k], d.precipitation_sum[k], d.weather_code[k],
      ]);
    });
    if (list[0] && list[0].current && list[0].current.time) state.vdaily.at = list[0].current.time;
    state.liveVillages = true;
  }

  async function boot() {
    try {
      const [meta, daily, buyers, map, villages, vdaily] = await Promise.all([
        fetch(DATA + "/meta.json").then((r) => r.json()),
        fetch(DATA + "/daily.json").then((r) => r.json()),
        fetch(DATA + "/buyers.json").then((r) => r.json()),
        fetch(DATA + "/map.json").then((r) => r.json()),
        fetch(DATA + "/villages_static.json").then((r) => r.json()),
        fetch(DATA + "/villages_daily.json").then((r) => r.json()),
      ]);
      Object.assign(state, { meta, daily, buyers, map, villages, vdaily });
      renderTmd();
      renderPrices();
      renderBuyers();
      renderSources();
      rerender();
    } catch (err) {
      $("now-panel").textContent = "โหลดข้อมูลไม่สำเร็จ: " + err.message;
      return;
    }
    try {
      await refreshLiveDistricts();
      rerender();
    } catch (e) {
      state.liveWx = false;
      renderNow();
    }
    try {
      await refreshLiveCells();
      rerender();
    } catch (e) {
      state.liveVillages = false;
      renderVillage();
    }
  }

  window.NBLApp = {
    rerender,
    forecastDays() {
      if (!state.vdaily || !state.villages) return [];
      const tams = state.villages.tambons;
      const i = state.vsel || 0;
      const idx = state.vdaily.cell_of[i];
      const wx = state.vdaily.wx[idx];
      if (!wx) return [];
      return (wx.d || []).map((d, k) => ({
        rain: d[3],
        label: (wx.dates && wx.dates[k]) ? wx.dates[k] : ("วัน " + (k + 1)),
      }));
    },
  };

  boot();
})();
