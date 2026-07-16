(() => {
  const observed = new WeakSet();
  let lightboxTrigger = null;

  const labelFor = (region) => {
    if (region.matches("code")) return "Scrollable code example";

    const table = region.querySelector("table");
    const caption = table?.querySelector("caption")?.textContent?.trim();
    if (caption) return caption;

    const heading = region
      .closest(".md-content__inner")
      ?.querySelector("h1");
    return heading?.textContent?.replace("¶", "").trim()
      ? `Scrollable table: ${heading.textContent.replace("¶", "").trim()}`
      : "Scrollable table";
  };

  const updateRegion = (region) => {
    const overflows = region.scrollWidth > region.clientWidth + 1;

    if (overflows) {
      region.tabIndex = 0;
      region.setAttribute("role", "region");
      region.setAttribute("aria-label", labelFor(region));
      region.dataset.rpScrollable = "true";
    } else if (region.dataset.rpScrollable === "true") {
      region.removeAttribute("tabindex");
      region.removeAttribute("role");
      region.removeAttribute("aria-label");
      delete region.dataset.rpScrollable;
    }
  };

  const enhanceScrollableRegions = () => {
    document.querySelectorAll(".md-typeset__scrollwrap, .highlight code").forEach((region) => {
      updateRegion(region);
      if (observed.has(region)) return;

      observed.add(region);
      new ResizeObserver(() => updateRegion(region)).observe(region);
    });
  };

  const enhanceLightbox = () => {
    const dialog = document.querySelector(".glightbox-container[role='dialog']");

    if (!dialog) {
      if (lightboxTrigger?.isConnected) lightboxTrigger.focus();
      lightboxTrigger = null;
      return;
    }

    if (dialog.dataset.rpAccessible === "true") return;

    const active = document.activeElement;
    lightboxTrigger = active?.matches?.(".glightbox") ? active : null;
    dialog.setAttribute("aria-modal", "true");
    dialog.dataset.rpAccessible = "true";

    const close = dialog.querySelector(".gclose");
    if (close && lightboxTrigger) requestAnimationFrame(() => close.focus());
  };

  const lightboxObserver = new MutationObserver(enhanceLightbox);

  const startEnhancements = () => {
    enhanceScrollableRegions();
    enhanceLightbox();
    lightboxObserver.observe(document.body, { childList: true });
  };

  if (typeof document$ !== "undefined") {
    document$.subscribe(startEnhancements);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEnhancements, { once: true });
  } else {
    startEnhancements();
  }
})();
