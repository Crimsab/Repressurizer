(() => {
  const observed = new WeakSet();

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

  if (typeof document$ !== "undefined") {
    document$.subscribe(enhanceScrollableRegions);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceScrollableRegions, { once: true });
  } else {
    enhanceScrollableRegions();
  }
})();
