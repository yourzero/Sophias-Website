;(function () {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const byText = (t) => (t||"").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g,"");

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

  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let __pf_animating = false;
  let __pf_lastThumb = null;

  function flyBetweenRects(imgSrc, fromRect, toRect, onDone) {
    if (prefersReduced) { onDone && onDone(); return; }
    __pf_animating = true;
    const ghost = document.createElement("img");
    ghost.src = imgSrc; ghost.alt = "";
    Object.assign(ghost.style, {
      position: "fixed",
      left: fromRect.left + "px",
      top: fromRect.top + "px",
      width: fromRect.width + "px",
      height: fromRect.height + "px",
      borderRadius: "8px",
      zIndex: "99999",
      pointerEvents: "none",
      transition: "transform .34s cubic-bezier(.2,.7,.2,1), opacity .34s ease"
    });
    document.body.appendChild(ghost);
    const dx = (toRect.left + toRect.width/2) - (fromRect.left + fromRect.width/2);
    const dy = (toRect.top + toRect.height/2) - (fromRect.top + fromRect.height/2);
    const sx = toRect.width / fromRect.width;
    const sy = toRect.height / fromRect.height;
    const scale = Math.min(sx, sy);
    requestAnimationFrame(() => {
      ghost.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ")";
    });
    ghost.addEventListener("transitionend", () => {
      ghost.remove();
      __pf_animating = false;
      onDone && onDone();
    }, { once: true });
  }

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

  
  function openModal(fromItem) {
    if (__pf_animating) return;
    const img = fromItem.querySelector("img");
    __pf_lastThumb = img;
    mImg.src = img.src; mImg.alt = img.alt || "";
    mTitle.textContent = fromItem.getAttribute("data-title") || "";
    mCap.textContent = fromItem.getAttribute("data-caption") || "";

    const fromRect = img.getBoundingClientRect();

    // Show modal but hide inner during the flight so we can measure the final image rect
    const inner = modal.querySelector(".inner");
    const prevInnerOpacity = inner.style.opacity;
    inner.style.opacity = "0";
    modal.classList.add("is-open");
    document.body.classList.add("pf-lock");
    modal.setAttribute("aria-hidden", "false");

    // Wait a tick for layout, then measure target rect and animate
    requestAnimationFrame(() => {
      const toRect = mImg.getBoundingClientRect();
      if (prefersReduced) {
        inner.style.opacity = prevInnerOpacity || "";
        return;
      }
      flyBetweenRects(img.src, fromRect, toRect, () => {
        inner.style.opacity = prevInnerOpacity || "";
      });
    });
  }


  
  function closeModal() {
    if (__pf_animating) return;
    const inner = modal.querySelector(".inner");
    const fromRect = mImg.getBoundingClientRect();
    const target = __pf_lastThumb || (grid ? grid.querySelector('img[src="' + mImg.src + '"]') : null);
    if (!target || prefersReduced) {
      // Fallback: immediate close
      modal.classList.remove("is-open");
      document.body.classList.remove("pf-lock");
      modal.setAttribute("aria-hidden", "true");
      return;
    }
    // Keep overlay up, hide the chrome, and fly back to the thumb.
    const prevInnerOpacity = inner.style.opacity;
    inner.style.opacity = "0";
    flyBetweenRects(mImg.src, fromRect, target.getBoundingClientRect(), () => {
      inner.style.opacity = prevInnerOpacity || "";
      modal.classList.remove("is-open");
      document.body.classList.remove("pf-lock");
      modal.setAttribute("aria-hidden", "true");
    });
  }


  function applyFilters(items) {
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
      applyFilters(items);
    });

    searchInput.addEventListener("input", () => applyFilters(items));

    clearBtn.addEventListener("click", () => {
      $$(".pf-tags input[type=checkbox]", tagsWrap).forEach(cb => {
        cb.checked = false;
        const lab = cb.closest('.pf-chip');
        if (lab) lab.classList.remove('active');
      });
      searchInput.value = "";
      applyFilters(items);
    });

    grid.addEventListener("click", e => {
      const card = e.target.closest(".pf-item");
      if (card) openModal(card);
    });

    mClose.addEventListener("click", closeModal);
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    applyFilters(items);
  }

  document.addEventListener("DOMContentLoaded", init);
})();