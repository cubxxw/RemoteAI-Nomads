import { esc, money } from "./ranking.js";
const NS = "http://www.w3.org/2000/svg";
const element = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const [key, val] of Object.entries(attrs)) e.setAttribute(key, val);
  return e;
};
export const project = (lat, lon) => [
  ((lon + 180) / 360) * 1000,
  ((85 - Math.max(-60, Math.min(85, lat))) / 145) * 480,
];
export class RankMap {
  constructor({ stage, selection, onHover, onSelect }) {
    this.stage = stage;
    this.selection = selection;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.cities = [];
    this.nodes = new Map();
    this.view = [0, 0, 1000, 480];
    this.active = null;
    this.ready = false;
    this.picker = document.createElement("div");
    this.picker.className = "map-city-picker";
    this.picker.innerHTML =
      '<label class="sr-only" for="map-city-select">在地图中选择城市</label><select id="map-city-select"><option value="">选择城市，在地图中查看</option></select>';
    this.selection.before(this.picker);
    this.picker.querySelector("select").addEventListener("change", (e) => {
      if (e.target.value) this.onHover(e.target.value);
    });
    this.load();
  }
  async load() {
    this.stage.setAttribute("aria-busy", "true");
    try {
      const response = await fetch("/map/world.json");
      if (!response.ok) throw new Error("Map request failed");
      const world = await response.json();
      if (!Array.isArray(world.paths)) throw new Error("Invalid map data");
      this.svg = element("svg", {
        viewBox: "0 0 1000 480",
        class: "rank-map-svg",
        role: "group",
        "aria-label": "城市地图，可用方向键选择地图点",
      });
      const lands = element("g", { class: "map-land", "aria-hidden": "true" });
      for (const d of world.paths) lands.append(element("path", { d }));
      this.dots = element("g", { class: "map-dots" });
      this.svg.append(lands, this.dots);
      this.stage.replaceChildren(this.svg);
      this.ready = true;
      this.update(this.cities);
      this.bind();
      this.stage.setAttribute("aria-busy", "false");
    } catch {
      this.stage.innerHTML =
        '<div class="map-error" role="status"><strong>地图暂时没有加载成功</strong><p>排行与筛选仍可使用。</p><button type="button" class="quiet-button" id="retry-map">重新加载地图</button></div>';
      this.stage
        .querySelector("#retry-map")
        .addEventListener("click", () => this.load());
      this.stage.setAttribute("aria-busy", "false");
    }
  }
  bind() {
    this.svg.addEventListener("pointerover", (e) => {
      const point = e.target.closest("[data-map-city]");
      if (point) this.onHover(point.dataset.mapCity);
    });
    this.svg.addEventListener("click", (e) => {
      if (this.dragged) return;
      const point = e.target.closest("[data-map-city]");
      if (point) {
        this.onSelect(point.dataset.mapCity, true);
        return;
      }
      let nearest = null,
        distance = 22;
      for (const c of this.cities) {
        const matrix = this.nodes.get(c.slug)?.getScreenCTM();
        if (!matrix) continue;
        const d = Math.hypot(matrix.e - e.clientX, matrix.f - e.clientY);
        if (d < distance) {
          distance = d;
          nearest = c.slug;
        }
      }
      if (nearest) this.onHover(nearest);
    });
    this.svg.addEventListener("focusin", (e) => {
      const point = e.target.closest("[data-map-city]");
      if (point) this.onHover(point.dataset.mapCity);
    });
    this.svg.addEventListener("keydown", (e) => {
      const points = this.cities.filter(
        (c) => c.lat !== null && c.lon !== null,
      );
      if (!points.length) return;
      let index = points.findIndex((c) => c.slug === this.active);
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        index =
          (index +
            (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) +
            points.length) %
          points.length;
        this.onHover(points[index].slug);
        this.nodes.get(points[index].slug)?.focus();
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (this.active) this.onSelect(this.active, true);
      }
    });
    this.svg.addEventListener("pointerdown", (e) => {
      this.dragged = false;
      if (e.target.closest("[data-map-city]") || e.pointerType === "touch")
        return;
      this.dragStart = { x: e.clientX, y: e.clientY, view: [...this.view] };
      this.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener("pointermove", (e) => {
      if (!this.dragStart) return;
      const dx = e.clientX - this.dragStart.x,
        dy = e.clientY - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) this.dragged = true;
      const rect = this.svg.getBoundingClientRect(),
        scale = this.dragStart.view[2] / rect.width;
      this.view = [
        this.dragStart.view[0] - dx * scale,
        this.dragStart.view[1] - dy * scale,
        ...this.dragStart.view.slice(2),
      ];
      this.applyView();
    });
    this.svg.addEventListener("pointerup", () => {
      this.dragStart = null;
    });
    this.svg.addEventListener("pointercancel", () => {
      this.dragStart = null;
    });
  }
  update(cities) {
    this.cities = cities;
    const picker = this.picker.querySelector("select");
    picker.innerHTML =
      '<option value="">选择城市，在地图中查看</option>' +
      cities
        .map(
          (c) =>
            `<option value="${esc(c.slug)}">${c.rank ? "#" + c.rank + " " : ""}${esc(c.name)} · ${esc(c.country)}</option>`,
        )
        .join("");
    picker.value = this.active || "";
    const mapped = cities.filter(
      (c) => Number.isFinite(c.lat) && Number.isFinite(c.lon),
    );
    document.querySelector("#map-count").textContent =
      `${mapped.length} 个位置${cities.length > mapped.length ? " · " + (cities.length - mapped.length) + " 个待补" : ""}`;
    if (!this.ready) return;
    const focused = document.activeElement,
      restoreFocus = this.dots.contains(focused);
    const frag = document.createDocumentFragment();
    for (const [index, c] of mapped.entries()) {
      let point = this.nodes.get(c.slug);
      if (!point) {
        const [x, y] = project(c.lat, c.lon);
        point = element("g", {
          "data-map-city": c.slug,
          class: "map-city",
          transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
          role: "button",
          tabindex: index === 0 ? "0" : "-1",
          "aria-label": c.name + "，" + c.country,
        });
        point.append(
          element("circle", { r: 12, class: "map-hit" }),
          element("circle", { r: 3.5, class: "map-dot" }),
        );
        this.nodes.set(c.slug, point);
      }
      point.classList.toggle("is-active", c.slug === this.active);
      point
        .querySelector(".map-dot")
        .setAttribute(
          "r",
          c.score === null ? "2.5" : String(2.5 + c.score / 5),
        );
      frag.append(point);
    }
    this.dots.replaceChildren(frag);
    if (restoreFocus && focused.isConnected)
      focused.focus({ preventScroll: true });
    if (this.active && !cities.some((c) => c.slug === this.active)) {
      this.active = null;
      this.selection.innerHTML =
        "<span>选择一座城市</span><p>悬停列表或点选地图，查看同一个地方。</p>";
    }
    if (
      mapped.length &&
      !mapped.some(
        (c) => this.nodes.get(c.slug)?.getAttribute("tabindex") === "0",
      )
    )
      this.nodes.get(mapped[0].slug).setAttribute("tabindex", "0");
    if (!cities.length)
      this.selection.innerHTML =
        "<span>没有符合条件的城市</span><p>清除筛选条件后，地图会重新显示位置。</p>";
  }
  highlight(slug) {
    if (this.active) this.nodes.get(this.active)?.classList.remove("is-active");
    this.active = slug;
    const c = this.cities.find((c) => c.slug === slug);
    if (!c) return;
    this.picker.querySelector("select").value = slug;
    const point = this.nodes.get(slug);
    if (point) {
      point.classList.add("is-active");
      for (const n of this.nodes.values())
        n.setAttribute("tabindex", n === point ? "0" : "-1");
    }
    this.selection.innerHTML = `<div class="map-selection-title"><strong>${esc(c.name)}</strong><span>${c.rank ? "#" + c.rank : "待补资料"}${c.score === null ? "" : " · " + c.score.toFixed(1)}</span></div><p>${esc(c.nameEn)} · ${esc(c.country)}${c.lat === null ? " · 位置待补" : ""}</p><div class="map-selection-stats"><span>${c.budget === null ? "预算待补" : "≈ " + money(c.budget) + " / 月"}</span><span>${esc(c.visa.label)} *</span></div><div class="map-selection-actions"><a href="/cities/${esc(c.slug)}/">查看城市详情</a><button type="button" data-map-locate="${esc(c.slug)}">在列表中定位</button></div>`;
  }
  clear() {
    if (this.active) this.nodes.get(this.active)?.classList.remove("is-active");
    this.active = null;
    this.picker.querySelector("select").value = "";
    this.selection.innerHTML =
      "<span>选择一座城市</span><p>悬停列表或点选地图，查看同一个地方。</p>";
  }
  zoom(factor) {
    const [x, y, w, h] = this.view,
      nw = Math.max(125, Math.min(1000, w * factor)),
      nh = nw * 0.48;
    this.view = [x + (w - nw) / 2, y + (h - nh) / 2, nw, nh];
    this.applyView();
  }
  reset() {
    this.view = [0, 0, 1000, 480];
    this.applyView();
  }
  applyView() {
    if (this.svg)
      this.svg.setAttribute(
        "viewBox",
        this.view.map((n) => n.toFixed(1)).join(" "),
      );
  }
}
