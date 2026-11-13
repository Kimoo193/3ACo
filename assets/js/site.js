/* 3A Technology Solution — site behaviour. Content works without this file. */
(function () {
  "use strict";
  var S = window.__3A || {};
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  // ---- remember language choice (never auto-redirect)
  $$("a[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () { try { localStorage.setItem("3a-lang", a.dataset.lang); } catch (e) {} });
  });

  // ---- mobile menu
  var menuBtn = $(".menu-btn"), nav = $("#nav");
  if (menuBtn && nav) {
    var setMenu = function (open) {
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? S.close : S.menu);
    };
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); menuBtn.focus(); } });
  }

  // ---- seven-segment readouts
  var SEG = { 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };
  var PATHS = {
    a: "M4 2h12l-2 3H6z", b: "M17 3l1 1v11l-2 1.5-1-1V6z", c: "M17 18.5l1 1v11l-1 1-2-3V19z",
    d: "M4 32h12l-2-3H6z", e: "M3 18.5l-1 1v11l1 1 2-3V19z", f: "M3 3L2 4v11l2 1.5 1-1V6z", g: "M5 15.8h10l1.5 1.2L15 18.2H5L3.5 17z"
  };
  function digitSVG() {
    var s = '<svg viewBox="0 0 20 34" aria-hidden="true">';
    for (var k in PATHS) s += '<path class="s" data-s="' + k + '" d="' + PATHS[k] + '"/>';
    return s + "</svg>";
  }
  function setDigit(svg, d) {
    var on = SEG[d] || "";
    $$(".s", svg).forEach(function (p) { p.classList.toggle("on", on.indexOf(p.dataset.s) > -1); });
  }
  var segs = $$(".seg");
  segs.forEach(function (el) {
    var v = el.dataset.value; el.textContent = "";
    for (var i = 0; i < v.length; i++) el.insertAdjacentHTML("beforeend", digitSVG());
    $$("svg", el).forEach(function (svg, i) { setDigit(svg, reduce ? v[i] : 8); });
  });
  function runSegs() {
    segs.forEach(function (el, n) {
      var v = el.dataset.value, svgs = $$("svg", el), t = 0;
      var iv = setInterval(function () {
        t++;
        svgs.forEach(function (svg, i) {
          if (t > 6 + i * 2 + n) setDigit(svg, v[i]); else setDigit(svg, Math.floor(Math.random() * 10));
        });
        if (t > 8 + v.length * 2 + n) clearInterval(iv);
      }, 70);
    });
  }

  // ---- in-view triggers
  var touch = window.matchMedia("(hover: none)").matches;
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      if (el.classList.contains("rv")) el.classList.add("in");
      if (el.classList.contains("meters")) { if (!reduce) runSegs(); }
      if (el.classList.contains("pull")) el.classList.add("is-on");
      if (el.classList.contains("level")) el.classList.add("lit");
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -18% 0px", threshold: 0.15 }) : null;

  if (io) {
    $$(".sec-head, .directory, .stack, .trail, .badges, .faq-list, .bgrid, .order, .direct").forEach(function (el) { el.classList.add("rv"); io.observe(el); });
    $$(".meters, .pull").forEach(function (el) { io.observe(el); });
    if (touch) $$(".level").forEach(function (el) { io.observe(el); });
  } else {
    $$(".pull").forEach(function (el) { el.classList.add("is-on"); });
    segs.forEach(function (el) { $$("svg", el).forEach(function (svg, i) { setDigit(svg, el.dataset.value[i]); }); });
  }

  // ---- header solid, riser current, lift floor indicator
  var top = $(".top"), tower = $("#tower"), lift = $(".lift"), hero = $(".hero");
  var floors = $$(".floor"), liftNo = lift && $(".lift-no", lift), liftName = lift && $(".lift-name", lift);
  var lastY = window.scrollY, cur = null, ticking = false;
  // the riser current chases the scroll position with an eased follow, so it glides instead of jumping
  var pTarget = 0, pNow = 0, towerH = 0, easing = false, tPrev = 0;
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function easeRiser(now) {
    var dt = tPrev ? Math.min(64, now - tPrev) : 16; tPrev = now;
    var d = pTarget - pNow;
    pNow = still || Math.abs(d) < 0.0004 ? pTarget : pNow + d * (1 - Math.exp(-dt / 140));
    tower.style.setProperty("--p", pNow.toFixed(5));
    tower.style.setProperty("--py", (pNow * towerH).toFixed(1) + "px");
    if (pNow !== pTarget) requestAnimationFrame(easeRiser); else { easing = false; tPrev = 0; }
  }
  function onScroll() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    if (top) top.classList.toggle("solid", y > 40);
    if (tower) {
      var r = tower.getBoundingClientRect();
      pTarget = Math.min(1, Math.max(0, (vh * 0.6 - r.top) / r.height));
      towerH = r.height;
      if (!easing) { easing = true; requestAnimationFrame(easeRiser); }
    }
    var mark = vh * 0.45, active = null;
    floors.forEach(function (f) {
      var fr = f.getBoundingClientRect();
      if (fr.top < vh * 0.7) f.classList.add("live");
      if (fr.top <= mark && fr.bottom > mark) active = f;
    });
    if (lift) {
      var heroOut = hero ? hero.getBoundingClientRect().bottom < vh * 0.5 : true;
      lift.classList.toggle("on", !!active && heroOut);
      lift.classList.toggle("down", y >= lastY);
      if (active && active !== cur) {
        cur = active;
        liftNo.textContent = active.dataset.floor;
        liftName.textContent = active.dataset.name;
      }
    }
    lastY = y;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  onScroll();

  // ---- access badges tilt toward the pointer
  if (!reduce && !touch) {
    $$(".badge").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, yy = (e.clientY - r.top) / r.height;
        b.classList.add("tilting");
        b.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
        b.style.setProperty("--rx", ((0.5 - yy) * 8).toFixed(2) + "deg");
        b.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        b.style.setProperty("--my", (yy * 100).toFixed(1) + "%");
      });
      b.addEventListener("pointerleave", function () {
        b.classList.remove("tilting");
        b.style.setProperty("--rx", "0deg"); b.style.setProperty("--ry", "0deg");
      });
    });
  }

  // ---- project filter: chips over the light-trail timeline
  var stops = $$("#rows .stop"), years = $$("#rows .yr"), count = $("#pcount"), list = $("#rows");
  $$(".chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var f = btn.dataset.filter, n = 0;
      $$(".chip").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      stops.forEach(function (r) {
        var show = f === "all" || (" " + r.dataset.sys + " ").indexOf(" " + f + " ") > -1;
        r.hidden = !show; if (show) n++;
      });
      years.forEach(function (y) {
        y.hidden = !stops.some(function (r) { return !r.hidden && r.dataset.year === y.dataset.year; });
      });
      if (count) count.textContent = S.count.replace("{n}", n);
      if (list && !reduce) { list.classList.remove("snap"); void list.offsetWidth; list.classList.add("snap"); }
    });
  });

  // ---- quote form -> WhatsApp work order
  var form = $("#rfq"), err = $("#rfq-err");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form), problems = [];
      var name = (fd.get("name") || "").trim(), phone = (fd.get("phone") || "").trim();
      var digits = phone.replace(/[^\d+]/g, "").replace(/[٠-٩]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".indexOf(d); });
      form.name.setAttribute("aria-invalid", String(!name));
      if (!name) problems.push(["name", S.errName]);
      var okPhone = /^\+?\d{8,15}$/.test(digits);
      form.phone.setAttribute("aria-invalid", String(!okPhone));
      if (!okPhone) problems.push(["phone", S.errPhone]);
      if (problems.length) {
        err.hidden = false;
        err.innerHTML = "<strong>" + S.errTitle + "</strong><ul>" + problems.map(function (p) {
          return '<li><a href="#" data-f="' + p[0] + '">' + p[1] + "</a></li>";
        }).join("") + "</ul>";
        $$("a[data-f]", err).forEach(function (a) { a.addEventListener("click", function (ev) { ev.preventDefault(); form[a.dataset.f].focus(); }); });
        err.focus();
        return;
      }
      err.hidden = true;
      var L = S.labels, lines = [S.waIntro, ""];
      ["name", "company", "phone", "type", "place", "details"].forEach(function (k) {
        var v = (fd.get(k) || "").trim(); if (v) lines.push("• " + L[k] + ": " + v);
      });
      window.open("https://wa.me/" + S.wa + "?text=" + encodeURIComponent(lines.join("\n")), "_blank", "noopener");
    });
  }

  // ---- 3D cinematic: progressive enhancement only, after load, never on reduced-motion / Save-Data / weak devices
  if (/[?&]bare\b/.test(location.search)) doc.classList.add("bare");
  var rack = $("#scene");
  function can3D() {
    if (reduce || !rack) return false;
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    try {
      var t = document.createElement("canvas"), gl = t.getContext("webgl2") || t.getContext("webgl");
      if (!gl) return false;
      // no real GPU (software rasteriser): the film would run on the CPU and freeze the page, so keep the poster
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      var r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
      return /[?&]cine=/.test(location.search) || !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
    } catch (e) { return false; }
  }
  function boot3D(m) {
    var qs = new URLSearchParams(location.search), fz = qs.get("cine");
    m.mount(rack, { freeze: fz !== null ? parseFloat(fz) : undefined, capture: qs.has("bare") });
  }
  if (can3D()) {
    // start downloading the cinematic now (in parallel with the page); mount it once the page has loaded
    var src = (document.querySelector('script[src*="site.js"]').src).replace(/site\.js(\?[^#]*)?.*$/, "scene3d.js$1");
    var mod = import(src);
    var go = function () {
      mod.then(function (m) {
        if ("requestIdleCallback" in window) requestIdleCallback(function () { boot3D(m); }, { timeout: 600 }); else setTimeout(function () { boot3D(m); }, 50);
      }).catch(function () { /* poster stays */ });
    };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  }
})();
