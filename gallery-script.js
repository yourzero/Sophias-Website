;(function () {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const byText = (t) => (t||"").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g,"");
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const grid = $("#pf-grid");
  const tagsWrap = $("#pf-tags");
  const searchInput = $("#pf-search");
  const clearBtn = $("#pf-clear");
  const countEl = $("#pf-count");
  const errEl = $("#pf-error");
  const modal = $("#pf-modal");
  const mImg = $("#pf-modal-img");
  const mTitle = $("#pf-modal-title");
  const mCap = $("#pf-modal-cap");
  const mClose = $("#pf-modal-close");

  const parseTags = (el) => (el.getAttribute("data-tags")||"").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  function readData() {
    const dataScript = document.getElementById("pf-data");
    if (!dataScript) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "⚠️ Missing #pf-data JSON embed."; }
      return { items: [] };
    }
    try {
      const data = JSON.parse(dataScript.textContent || "{}");
      if (!Array.isArray(data.items)) return { baseUrl: data.baseUrl || "", items: [] };
      return { baseUrl: data.baseUrl || "", items: data.items };
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "⚠️ Invalid JSON in #pf-data."; }
      return { items: [] };
    }
  }

  function renderFromData(data) {
    if (!data.items.length) return;
    const base = data.baseUrl || "";
    grid.innerHTML = data.items.map(item => {
      const src = (item.src || "").startsWith("http") ? item.src : (base + (item.src || ""));
      const alt = (item.alt || "").replace(/"/g,'&quot;');
      const title = item.title || "";
      const caption = item.caption || "";
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const dataTags = tags.join(", ");
      const titleEsc = title.replace(/"/g,'&quot;');
      const captionEsc = caption.replace(/"/g,'&quot;');
      return (
        '<figure class="pf-item" data-tags="' + dataTags + '" data-title="' + titleEsc + '" data-caption="' + captionEsc + '">' +
          '<div class="thumb"><img src="' + src + '" alt="' + alt + '" loading="lazy" /></div>' +
          '<figcaption><strong>' + title + '</strong><small class="pf-card-tags"></small></figcaption>' +
        '</figure>'
      );
    }).join("");
  }

  function fly(fromRect, toRect, imgSrc, reverse, done) {
    if (!done) done = () => {};
    if (prefersReduced) { done(); return; }
    const ghost = document.createElement("img");
    ghost.src = imgSrc; ghost.alt = "";
    Object.assign(ghost.style, {
      position: "fixed",
      left: fromRect.left + "px",
      top: fromRect.top + "px",
      width: fromRect.width + "px",
      height: fromRect.height + "px",
      borderRadius: "12px",
      zIndex: "9999",
      pointerEvents: "none",
      transition: "transform .32s cubic-bezier(.2,.7,.2,1), opacity .32s ease",
      transformOrigin: "center center",
      willChange: "transform, opacity"
    });
    document.body.appendChild(ghost);
    const dx = (toRect.left + toRect.width/2) - (fromRect.left + fromRect.width/2);
    const dy = (toRect.top + toRect.height/2) - (fromRect.top + fromRect.height/2);
    const sx = toRect.width / fromRect.width;
    const sy = toRect.height / fromRect.height;
    const scale = Math.min(sx, sy);
    requestAnimationFrame(() => {
      ghost.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ")";
      if (reverse) ghost.style.opacity = "0.85";
    });
    ghost.addEventListener("transitionend", () => { ghost.remove(); done(); }, { once: true });
  }

  function viewportTargetRect() {
    const w = Math.min(window.innerWidth * 0.92, 1200);
    const h = window.innerHeight * 0.88;
    return {
      left: (window.innerWidth - w) / 2,
      top: (window.innerHeight - h) / 2,
      width: w,
      height: h
    };
  }

  function openModal(fromItem) {
    const img = fromItem.querySelector("img");
    mImg.src = img.src; mImg.alt = img.alt || "";
    mTitle.textContent = fromItem.getAttribute("data-title") || "";
    mCap.textContent = fromItem.getAttribute("data-caption") || "";

    const fromRect = img.getBoundingClientRect();
    const toRect = viewportTargetRect();

    fly(fromRect, toRect, img.src, false, () => {
      modal.classList.add("is-open");
      document.body.classList.add("pf-lock");
      modal.setAttribute("aria-hidden", "false");
    });
  }

  function closeModal() {
    const wasOpen = modal.classList.contains("is-open");
    modal.classList.remove("is-open");
    document.body.classList.remove("pf-lock");
    modal.setAttribute("aria-hidden", "true");
    if (wasOpen && mImg && !prefersReduced) {
      const target = grid.querySelector(`img[src="${mImg.src}"]`);
      if (target) {
        const targetRect = target.getBoundingClientRect();
        fly(viewportTargetRect(), targetRect, mImg.src, true);
      }
    }
  }

  function applyFilters(items, pushState) {
    if (pushState === void 0) pushState = false;
    const active = $$(".pf-tags input[type=checkbox]:checked", tagsWrap).map(cb => cb.value);
    const q = byText(searchInput ? searchInput.value : "");
    let visible = 0;
    items.forEach(function(i){
      const matchTags = active.every(tag => i.tags.includes(tag));
      const matchText = !q || i.title.includes(q) || i.caption.includes(q) || i.tags.join(" ").includes(q);
      const show = matchTags && matchText;
      i.el.classList.toggle("pf-hide", !show);
      if (show) visible++;
    });
    if (countEl) countEl.textContent = visible + " result" + (visible === 1 ? "" : "s");
  }

  function init() {
    const data = readData();
    renderFromData(data);

    const items = $$(".pf-item", grid).map(el => {
      return {
        el,
        title: byText(el.getAttribute("data-title")),
        caption: byText(el.getAttribute("data-caption")),
        tags: parseTags(el)
      };
    });

    items.forEach(i => {
      const box = i.el.querySelector(".pf-card-tags");
      if (box && i.tags.length) {
        box.innerHTML = i.tags.map(t => `<span class="pf-card-tag">${t}</span>`).join("");
      }
    });

    const allTags = Array.from(new Set(items.flatMap(i => i.tags))).sort();
    allTags.forEach(tag => {
      const id = "tg-" + tag.replace(/\s+/g,'-');
      const chip = document.createElement("label");
      chip.className = "pf-chip";
      chip.innerHTML = '<input type="checkbox" value="'+ tag +'" id="'+ id +'" aria-label="'+ tag +'"><span>'+ tag +'</span>';
      tagsWrap.appendChild(chip);
    });

    tagsWrap.addEventListener("change", e => {
      const cb = e.target.closest('input[type=checkbox]');
      if (cb) {
        const lab = cb.closest('.pf-chip');
        if (lab) lab.classList.toggle('active', cb.checked);
      }
      applyFilters(items, true);
    });

    searchInput.addEventListener("input", () => applyFilters(items, true));

    clearBtn.addEventListener("click", () => {
      $$(".pf-tags input[type=checkbox]", tagsWrap).forEach(cb => {
        cb.checked = false;
        const lab = cb.closest('.pf-chip');
        if (lab) lab.classList.remove('active');
      });
      searchInput.value = "";
      applyFilters(items, true);
    });

    wireTilt();
    applyFilters(items);

    grid.addEventListener("click", e => {
      const card = e.target.closest(".pf-item");
      if (card) openModal(card);
    });

    mClose.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  }

  function wireTilt() {
    if (prefersReduced) return;
    grid.addEventListener("mousemove", (e) => {
      const card = e.target.closest(".pf-item");
      if (!card) return;
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const dx = (e.clientX - cx) / r.width;
      const dy = (e.clientY - cy) / r.height;
      const max = 6;
      card.style.setProperty("--ry", (dx*max) + "deg");
      card.style.setProperty("--rx", (-dy*max) + "deg");
    });
    grid.addEventListener("mouseleave", (e) => {
      const c = e.target.closest(".pf-item");
      if (c) { c.style.setProperty("--ry","0deg"); c.style.setProperty("--rx","0deg"); }
    }, true);
  }

  document.addEventListener("DOMContentLoaded", init);
})();