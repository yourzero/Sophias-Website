
; (function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const byText = (t) => (t || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "");

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

  // Motion settings & state
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let __pf_animating = false;
  let __pf_lastThumb = null;

  // Compute transform-origin on the modal .inner so that scaling centers on the modal image
  function setInnerOriginToImage(innerEl, imgEl) {
    const innerRect = innerEl.getBoundingClientRect();
    const imgRect = imgEl.getBoundingClientRect();
    const ox = imgRect.left - innerRect.left;
    const oy = imgRect.top - innerRect.top;
    innerEl.style.transformOrigin = ox + "px " + oy + "px";
    return { innerRect, imgRect };
  }

  // Given a thumbnail rect and the modal image rect, compute the transform that makes the modal image overlap the thumb
  function computeStartTransform(fromRect, toImgRect) {
    const sx = fromRect.width / toImgRect.width;
    const sy = fromRect.height / toImgRect.height;
    const tx = fromRect.left - toImgRect.left;
    const ty = fromRect.top - toImgRect.top;
    return { sx, sy, tx, ty };
  }

  function withTransition(el, value) {
    el.style.transition = value;
  }

  const parseTags = (el) => (el.getAttribute("data-tags") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  
  function readItemsData() {
    const itemsScript = document.getElementById("pf-items") || document.getElementById("pf-items-data") || document.getElementById("pf-data");
    if (!itemsScript) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "⚠️ Missing items JSON (<script id='pf-items'>)."; }
      return { baseUrl: "", items: [] };
    }
    try {
      const data = JSON.parse(itemsScript.textContent || "{}");
      const items = Array.isArray(data.items) ? data.items : [];
      const baseUrl = (typeof data.baseUrl === "string") ? data.baseUrl : "";
      return { baseUrl, items };
    } catch (e) {
      if (errEl) { errEl.hidden = false; errEl.textContent = "⚠️ Invalid JSON in items script."; }
      return { baseUrl: "", items: [] };
    }
  }

  function readTagGroupsData() {
    const tgScript = document.getElementById("pf-tag-groups") || document.getElementById("pf-tags-data") || document.getElementById("pf-data");
    if (!tgScript) return { groups: [] };
    try {
      const data = JSON.parse(tgScript.textContent || "{}");
      const rawGroups = Array.isArray(data.groups) ? data.groups : [];
      const groups = rawGroups.map(g => ({
        id: g.id,
        tags: Array.isArray(g.tags) ? g.tags : [],
        multi: (g["multi-select"] !== false) // default true
      }));
      return { groups };
    } catch (e) {
      console.error("[pf-gallery] Invalid JSON in tag groups script.", e);
      return { groups: [] };
    }
  }

      return { items: [] };
    }
    try {
      const data = JSON.parse(dataScript.textContent || "{}");
      if (!Array.isArray(data.items)) return { baseUrl: data.baseUrl || "", items: [] };
      return { baseUrl: data.baseUrl || "", items: data.items, tags: data.tags || {} };
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
      const alt = (item.alt || "").replace(/"/g, '&quot;');
      const title = item.title || "";
      const caption = item.caption || "";
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const dataTags = tags.join(", ");
      const titleEsc = title.replace(/"/g, '&quot;');
      const captionEsc = caption.replace(/"/g, '&quot;');
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
    const thumbImg = fromItem.querySelector("img");
    __pf_lastThumb = thumbImg;

    // Populate modal content
    mImg.src = thumbImg.src;
    mImg.alt = thumbImg.alt || "";
    mTitle.textContent = fromItem.getAttribute("data-title") || "";
    mCap.textContent = fromItem.getAttribute("data-caption") || "";

    // Ensure modal image is ready for accurate rects
    const proceed = () => {
      const inner = modal.querySelector(".inner");

      // Make modal visible so measurement is correct, but prepare FLIP start state
      modal.classList.add("is-open");
      document.body.classList.add("pf-lock");
      modal.setAttribute("aria-hidden", "false");

      // Measure and set transform origin to the modal image position
      const { imgRect: toImgRect } = setInnerOriginToImage(inner, mImg);
      const fromRect = thumbImg.getBoundingClientRect();
      const { sx, sy, tx, ty } = computeStartTransform(fromRect, toImgRect);

      // Set starting transform (no transition), then animate to identity
      __pf_animating = true;
      withTransition(inner, "none");
      inner.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + sx + ", " + sy + ")";
      // force reflow
      inner.offsetWidth;
      withTransition(inner, "transform .36s cubic-bezier(.2,.7,.2,1)");
      inner.style.transform = "none";

      function end() {
        inner.removeEventListener("transitionend", end);
        withTransition(inner, "");
        __pf_animating = false;
      }
      inner.addEventListener("transitionend", end, { once: true });
    };

    if (!mImg.complete) {
      mImg.addEventListener("load", proceed, { once: true });
    } else {
      proceed();
    }
    return;
    // Instant open for reduced motion
    if (prefersReduced) {
      modal.classList.add("is-open");
      document.body.classList.add("pf-lock");
      modal.setAttribute("aria-hidden", "false");
      return;
    }

    const inner = modal.querySelector(".inner");

    // Make modal visible so measurement is correct, but prepare FLIP start state
    modal.classList.add("is-open");
    document.body.classList.add("pf-lock");
    modal.setAttribute("aria-hidden", "false");

    // Measure and set transform origin to the modal image position
    const { imgRect: toImgRect } = setInnerOriginToImage(inner, mImg);
    const fromRect = thumbImg.getBoundingClientRect();
    const { sx, sy, tx, ty } = computeStartTransform(fromRect, toImgRect);

    // Set starting transform (no transition), then animate to identity
    __pf_animating = true;
    withTransition(inner, "none");
    inner.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + sx + ", " + sy + ")";
    // force reflow
    inner.offsetWidth;
    withTransition(inner, "transform .36s cubic-bezier(.2,.7,.2,1)");
    inner.style.transform = "none";

    function end() {
      inner.removeEventListener("transitionend", end);
      withTransition(inner, "");
      __pf_animating = false;
    }
    inner.addEventListener("transitionend", end, { once: true });
  }

  function closeModal() {
    if (__pf_animating) return;

    // Instant close for reduced motion
    if (prefersReduced) {
      modal.classList.remove("is-open");
      document.body.classList.remove("pf-lock");
      modal.setAttribute("aria-hidden", "true");
      return;
    }

    const inner = modal.querySelector(".inner");
    const thumb = __pf_lastThumb || (grid ? grid.querySelector('img[src="' + (mImg.src || "") + '"]') : null);

    if (!thumb) {
      // Fallback
      modal.classList.remove("is-open");
      document.body.classList.remove("pf-lock");
      modal.setAttribute("aria-hidden", "true");
      return;
    }

    // Measure rects and transform-origin
    const { imgRect: toImgRect } = setInnerOriginToImage(inner, mImg);
    const fromRect = thumb.getBoundingClientRect();
    const { sx, sy, tx, ty } = computeStartTransform(fromRect, toImgRect);

    __pf_animating = true;
    withTransition(inner, "transform .32s cubic-bezier(.2,.7,.2,1)");
    inner.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + sx + ", " + sy + ")";

    function end() {
      inner.removeEventListener("transitionend", end);
      withTransition(inner, "");

      // Begin overlay fade; keep the inner at the collapsed transform until fade completes,
      // to prevent a visible "expand while fading" ghost effect.
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("pf-lock");

      let cleaned = false;
      const afterFade = () => {
        if (cleaned) return;
        cleaned = true;
        inner.style.transform = "none";
        __pf_animating = false;
      };

      // Prefer to wait for the modal's opacity transition to finish
      const onFade = (ev) => {
        if (ev.target === modal && ev.propertyName === "opacity") {
          modal.removeEventListener("transitionend", onFade);
          afterFade();
        }
      };
      modal.addEventListener("transitionend", onFade);

      // Fallback: just in case the browser doesn't fire transitionend
      setTimeout(afterFade, 400);
    }
    inner.addEventListener("transitionend", end, { once: true });
  }

  function applyFilters(items) {
    const active = $$(".pf-tags input[type=checkbox]:checked", tagsWrap).map(cb => cb.value);
    const q = byText(searchInput ? searchInput.value : "");
    let visible = 0;
    items.forEach(function (i) {
      const matchTags = active.every(tag => i.tags.includes(tag));
      const matchText = !q || i.title.includes(q) || i.caption.includes(q) || i.tags.join(" ").includes(q);
      const show = matchTags && matchText;
      i.el.classList.toggle("pf-hide", !show);
      if (show) visible++;
    });
    if (countEl) countEl.textContent = visible + " result" + (visible === 1 ? "" : "s");
  }

  function init() {
    const itemsData = readItemsData();
    renderFromData(itemsData);

    const tagsData = readTagGroupsData();

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

    
    // Build tag chips from config.tags.groups if provided; otherwise derive from items
    if (tagsData && Array.isArray(tagsData.groups) && tagsData.groups.length) {
      tagsWrap.innerHTML = "";
      const groups = [...tagsData.groups].sort((a,b) => (a.id || 0) - (b.id || 0));
      groups.forEach((g, idx) => {
        const groupBox = document.createElement("div");
        groupBox.className = "pf-tags-group";
        groupBox.style.gridColumn = "1 / -1"; // span full width of outer grid
        groupBox.dataset.multiselect = (g.multi ? "true" : "false");

        const gridBox = document.createElement("div");
        gridBox.className = "pf-tags"; // reuse existing responsive grid styles

        (g.tags || []).forEach(tag => {
          const id = "tg-" + String(tag).replace(/\s+/g, '-');
          const chip = document.createElement("label");
          chip.className = "pf-chip";
          chip.innerHTML = '<input type="checkbox" value="' + tag + '" id="' + id + '" aria-label="' + tag + '"><span>' + tag + '</span>';
          gridBox.appendChild(chip);
        });

        groupBox.appendChild(gridBox);
        tagsWrap.appendChild(groupBox);

        if (idx < groups.length - 1) {
          const hr = document.createElement("hr");
          hr.className = "pf-tags-sep";
          hr.style.gridColumn = "1 / -1";
          hr.style.border = "0";
          hr.style.borderTop = "1px solid var(--panelB-border)";
          hr.style.margin = ".5rem 0";
          tagsWrap.appendChild(hr);
        }
      });
    } else {
      const allTags = Array.from(new Set(items.flatMap(i => i.tags))).sort();
      allTags.forEach(tag => {
        const id = "tg-" + tag.replace(/\s+/g, '-');
        const chip = document.createElement("label");
        chip.className = "pf-chip";
        chip.innerHTML = '<input type="checkbox" value="' + tag + '" id="' + id + '" aria-label="' + tag + '"><span>' + tag + '</span>';
        tagsWrap.appendChild(chip);
      });
    }
    
    tagsWrap.addEventListener("change", e => {
      const cb = e.target.closest('input[type=checkbox]');
      if (cb) {
        const lab = cb.closest('.pf-chip');
        if (lab) lab.classList.toggle('active', cb.checked);

        // Per-group single-select enforcement
        const groupBox = cb.closest('.pf-tags-group');
        if (groupBox && groupBox.dataset.multiselect === "false" && cb.checked) {
          const others = Array.from(groupBox.querySelectorAll('input[type=checkbox]')).filter(x => x !== cb);
          others.forEach(o => {
            if (o.checked) {
              o.checked = false;
              const olab = o.closest('.pf-chip');
              if (olab) olab.classList.remove('active');
            }
          });
        }
      }
      applyFilters(items);
    });
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
