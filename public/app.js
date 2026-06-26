const $ = (selector) => document.querySelector(selector);

const els = {
  status: $("#status"),
  plannerBadge: $("#plannerBadge"),
  form: $("#agentForm"),
  questionInput: $("#questionInput"),
  inlineInput: $("#inlineQuestion"),
  inlineSend: $("#inlineSend"),
  conversation: $("#conversation"),
  evidence: $("#evidence"),
  mapTitle: $("#mapTitle"),
  contextBar: $("#contextBar"),
  contextBanner: $("#contextBanner"),
  heroAskCard: $("#heroAskCard"),
  followupInputBar: $("#followupInputBar"),
  quickPrompts: $("#quickPrompts"),
  moreButton: $(".more-button"),
  contextResetButton: $("#contextResetButton"),
  contextResetBannerButton: $("#contextResetBannerButton"),
  searchHint: $("#searchHint"),
  mapToolbar: $(".map-toolbar")
};

const FILTERS = {
  cities: ["上海市", "北京市", "广州市", "深圳市", "杭州市", "金华市", "义乌市"],
  walkMinutes: [5, 10, 15, 20, 30],
  categories: ["美食", "商场", "电影院", "咖啡馆", "酒店"],
  defaultCity: "上海市",
  defaultWalkMinutes: 15,
  defaultCategory: "美食"
};

const RANKING_CITY_NAMES = new Set(["上海", "上海市"]);

const state = {
  location: {
    city: FILTERS.defaultCity,
    district: "",
    address: "",
    formattedAddress: "",
    location: null,
    source: "init"
  },
  filters: {
    city: FILTERS.defaultCity,
    walkMinutes: FILTERS.defaultWalkMinutes,
    category: FILTERS.defaultCategory
  },
  history: [],
  summary: "",
  nearbyRequestId: 0,
  manualPickGuardAt: 0,
  mapBounds: [],
  rankings: {
    city: "上海",
    markers: [],
    mode: "all"
  },
  evidenceRows: [],
  evidenceInitialLimit: 6,
  evidenceExpanded: false,
  isAsking: false
};

let map = null;
let overlays = [];
let rankingOverlays = [];
let rankingInfoWindow = null;

const suggestions = [
  {
    label: () => `${currentAreaLabel()}附近`,
    question: () => `${currentAreaLabel()}附近有什么值得吃的？`
  },
  {
    label: () => "步行5分钟",
    question: () => `帮我找${currentAreaLabel()}附近步行5分钟内的咖啡馆。`
  },
  {
    label: () => "电影院",
    question: () => `${currentAreaLabel()}附近有哪些电影院？`
  },
  {
    label: () => "商场",
    question: () => `${currentAreaLabel()}附近有哪些商场？`
  },
  {
    label: () => "AI推荐",
    question: () => `按我当前定位，推荐${currentAreaLabel()}附近适合现在去的地方。`
  }
];

init();

async function init() {
  restoreLocation();
  renderToolbar();
  bindEvents();
  renderSuggestions();
  renderContext();
  updateChatMode();
  await initMap();
}

function bindEvents() {
  els.form?.addEventListener("submit", handleQuestionSubmit);
  els.questionInput?.addEventListener("keydown", handleQuestionKeydown);
  els.inlineSend?.addEventListener("click", handleInlineSend);
  els.inlineInput?.addEventListener("keydown", handleInlineKeydown);
  els.questionInput?.addEventListener("input", syncDraftState);
  els.inlineInput?.addEventListener("input", syncDraftState);
  els.moreButton?.addEventListener("click", toggleEvidenceRows);
  els.contextResetButton?.addEventListener("click", resetContext);
  els.contextResetBannerButton?.addEventListener("click", resetContext);
  syncDraftState();
  setAskingState(false);
}

function restoreLocation() {
  try {
    const raw = sessionStorage.getItem("amap.currentLocation");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;
    state.location = {
      city: saved.city || state.location.city,
      district: saved.district || "",
      address: saved.address || "",
      formattedAddress: saved.formattedAddress || "",
      location: Array.isArray(saved.location) ? saved.location : null,
      source: saved.source || "restore"
    };
    state.filters.city = state.location.city;
  } catch {
    // ignore invalid cache
  }
}

function renderToolbar() {
  if (!els.mapToolbar) return;

  els.mapToolbar.innerHTML = `
    <label class="filter-select-wrap">
      <span class="sr-only">城市</span>
      <select id="citySelect" class="toolbar-select top-filter-select"></select>
    </label>
    <label class="filter-select-wrap">
      <span class="sr-only">步行时间</span>
      <select id="walkSelect" class="toolbar-select top-filter-select"></select>
    </label>
    <label class="filter-select-wrap">
      <span class="sr-only">品类</span>
      <select id="categorySelect" class="toolbar-select top-filter-select"></select>
    </label>
    <button class="round" id="fitMapButton" type="button" aria-label="适配地图视野">↗</button>
  `;

  const citySelect = $("#citySelect");
  const walkSelect = $("#walkSelect");
  const categorySelect = $("#categorySelect");
  const fitMapButton = $("#fitMapButton");

  citySelect.innerHTML = FILTERS.cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("");
  walkSelect.innerHTML = FILTERS.walkMinutes.map((m) => `<option value="${m}">步行${m}分钟</option>`).join("");
  categorySelect.innerHTML = FILTERS.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");

  citySelect.value = state.filters.city;
  walkSelect.value = String(state.filters.walkMinutes);
  categorySelect.value = state.filters.category;
  syncFilterSelectState();

  citySelect.addEventListener("change", async () => {
    state.filters.city = citySelect.value;
    syncFilterSelectState();
    renderContext();
    await refreshLocalResults();
  });

  walkSelect.addEventListener("change", async () => {
    state.filters.walkMinutes = Number(walkSelect.value);
    syncFilterSelectState();
    renderContext();
    await refreshLocalResults();
  });

  categorySelect.addEventListener("change", async () => {
    state.filters.category = categorySelect.value;
    syncFilterSelectState();
    renderContext();
    await refreshLocalResults();
  });

  fitMapButton?.addEventListener("click", fitMap);
  renderRankingToolbar();
}

function renderRankingToolbar() {
  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) return;
  mapWrap.querySelector(".ranking-toolbar")?.remove();

  const options = [
    { key: "all", label: "全部榜单" },
    { key: "bichibang", label: "必吃榜" },
    { key: "saojiebang", label: "扫街榜" },
    { key: "bibendum", label: "必比登" },
    { key: "multi", label: "双榜/多榜" }
  ];

  const bar = document.createElement("div");
  bar.className = "ranking-toolbar";
  bar.innerHTML = options
    .map(
      (item) =>
        `<button type="button" class="ranking-filter ranking-filter--${item.key}${state.rankings.mode === item.key ? " is-active" : ""}" data-mode="${item.key}">${rankingFilterIcon(item.key)}<span>${item.label}</span></button>`
    )
    .join("");

  bar.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.rankings.mode = button.dataset.mode || "all";
      renderRankingToolbar();
      renderRankingLayer();
    });
  });

  mapWrap.appendChild(bar);
}

function rankingFilterIcon(mode) {
  if (mode === "bichibang") {
    return `<img class="ranking-filter-icon" src="/assets/bichibang-logo.jpg" alt="" aria-hidden="true" />`;
  }
  if (mode === "saojiebang") {
    return `<img class="ranking-filter-icon" src="/assets/saojiebang-logo.png" alt="" aria-hidden="true" />`;
  }
  if (mode === "bibendum") {
    return `<img class="ranking-filter-icon" src="/assets/bibendum-logo.jpg" alt="" aria-hidden="true" />`;
  }
  if (mode === "multi") {
    return `
      <span class="ranking-filter-icon ranking-filter-icon--stack" aria-hidden="true">
        <img src="/assets/bichibang-logo.jpg" alt="" />
        <img src="/assets/saojiebang-logo.png" alt="" />
      </span>
    `;
  }
  return `
    <span class="ranking-filter-icon ranking-filter-icon--stack ranking-filter-icon--triple" aria-hidden="true">
      <img src="/assets/bichibang-logo.jpg" alt="" />
      <img src="/assets/saojiebang-logo.png" alt="" />
      <img src="/assets/bibendum-logo.jpg" alt="" />
    </span>
  `;
}

function syncToolbarValues() {
  const citySelect = $("#citySelect");
  const walkSelect = $("#walkSelect");
  const categorySelect = $("#categorySelect");
  if (citySelect) citySelect.value = state.filters.city;
  if (walkSelect) walkSelect.value = String(state.filters.walkMinutes);
  if (categorySelect) categorySelect.value = state.filters.category;
  syncFilterSelectState();
}

function syncFilterSelectState() {
  const citySelect = $("#citySelect");
  const walkSelect = $("#walkSelect");
  const categorySelect = $("#categorySelect");
  citySelect?.classList.toggle("is-active", citySelect.value !== FILTERS.defaultCity);
  walkSelect?.classList.toggle("is-active", Number(walkSelect.value) !== FILTERS.defaultWalkMinutes);
  categorySelect?.classList.toggle("is-active", categorySelect.value !== FILTERS.defaultCategory);
}

function ensureCityOption(city) {
  const citySelect = $("#citySelect");
  if (!citySelect || !city) return;
  if (![...citySelect.options].some((option) => option.value === city)) {
    citySelect.insertAdjacentHTML("afterbegin", `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`);
  }
  citySelect.value = city;
  syncFilterSelectState();
}

async function loadRankingLayer() {
  try {
    const city = rankingCityName(state.location.city || state.filters.city);
    if (!city) return false;
    state.rankings.city = city;
    const payload = await apiGet(`/api/rankings/map?city=${encodeURIComponent(city)}`);
    state.rankings.markers = Array.isArray(payload.markers) ? payload.markers : [];
    renderRankingLayer();
    return true;
  } catch {
    // Keep this layer quiet if ranking data is unavailable.
    return false;
  }
}

async function refreshLocalResults() {
  syncRankingToolbarVisibility();
  if (hasRankingDataForCurrentCity() && Array.isArray(state.location.location)) {
    const loaded = state.rankings.markers.length && state.rankings.city === rankingCityName(state.location.city || state.filters.city)
      ? (renderRankingLayer(), true)
      : await loadRankingLayer();
    if (loaded) return;
  }
  await refreshNearby();
}

function renderRankingLayer() {
  if (!map) return;
  clearMap();
  rankingOverlays.forEach((overlay) => overlay.setMap(null));
  rankingOverlays = [];

  const entries = localRankingEntries();
  renderRankingEvidence(entries);
  if (els.mapTitle) els.mapTitle.textContent = `${rankingCityName(state.location.city || state.filters.city)}周边榜单 · ${entries.length} 家`;
  const bounds = [];
  if (Array.isArray(state.location.location)) {
    const origin = state.location.location;
    bounds.push(origin);
    const originMarker = new window.AMap.Marker({
      position: origin,
      title: state.location.formattedAddress || state.location.address || "当前位置",
      label: {
        content: `<div class="map-label origin">我</div>`,
        direction: "top"
      }
    });
    originMarker.setMap(map);
    rankingOverlays.push(originMarker);

    const circle = new window.AMap.Circle({
      center: origin,
      radius: walkMinutesToRadius(state.filters.walkMinutes),
      strokeColor: "#008f81",
      strokeOpacity: 0.66,
      strokeWeight: 2,
      strokeStyle: "dashed",
      fillColor: "#008f81",
      fillOpacity: 0.08
    });
    circle.setMap(map);
    rankingOverlays.push(circle);
  }
  entries.forEach((entry) => {
    if (!entry.location) return;
    const point = parseLocation(entry.location);
    bounds.push(point);
    const marker = new window.AMap.Marker({
      position: point,
      content: rankingMarkerContent(entry),
      offset: new window.AMap.Pixel(-16, -34),
      anchor: "bottom-center",
      zIndex: 80
    });
    marker.on("click", () => openRankingInfo(entry, marker.getPosition()));
    marker.setMap(map);
    rankingOverlays.push(marker);
  });
  state.mapBounds = bounds;
  fitMap();
  renderMapLegend();
}

function renderRankingEvidence(entries) {
  if (!els.evidence) return;
  const rows = entries;
  if (!rows.length) {
    setEvidenceNotice("当前筛选下没有可展示的榜单店铺。");
    return;
  }

  setEvidenceRows(
    rows.map((entry, index) =>
      evidenceRow(
        index + 1,
        entry.name,
        [entry.cuisine, entry.area || entry.district].filter(Boolean).join(" · "),
        formatDistance(entry.distanceMeters),
        formatRating(entry.rating),
        (entry.labels || []).join(" / ") || "榜单"
      )
    ),
    8
  );
}

function filterRankingMarkers(markers) {
  if (state.rankings.mode === "all") return markers;
  if (state.rankings.mode === "multi") return markers.filter((item) => item.rankingCategory === "multi");
  return markers.filter((item) => Array.isArray(item.categories) && item.categories.includes(state.rankings.mode));
}

function localRankingEntries() {
  if (!hasRankingDataForCurrentCity() || !Array.isArray(state.location.location)) return [];
  const radius = walkMinutesToRadius(state.filters.walkMinutes);
  return filterRankingMarkers(state.rankings.markers)
    .map((entry) => ({
      ...entry,
      distanceMeters: entry.location ? Math.round(distanceBetweenPoints(state.location.location, parseLocation(entry.location))) : Number.POSITIVE_INFINITY
    }))
    .filter((entry) => Number.isFinite(entry.distanceMeters) && entry.distanceMeters <= radius)
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
}

function hasRankingDataForCurrentCity() {
  return Boolean(rankingCityName(state.location.city || state.filters.city));
}

function rankingCityName(city) {
  const normalized = normalizeCityDisplay(city);
  if (!RANKING_CITY_NAMES.has(normalized)) return "";
  return "上海";
}

function syncRankingToolbarVisibility() {
  const toolbar = document.querySelector(".ranking-toolbar");
  if (toolbar) toolbar.hidden = !hasRankingDataForCurrentCity();
}

function rankingMarkerContent(entry) {
  const badges = (entry.categories || []).slice(0, 3).map((key) => {
    const src =
      key === "bichibang"
        ? "/assets/bichibang-logo.jpg"
        : key === "saojiebang"
          ? "/assets/saojiebang-logo.png"
          : "/assets/bibendum-logo.jpg";
    const label = key === "bichibang" ? "必吃榜" : key === "saojiebang" ? "扫街榜" : "必比登";
    return `<img src="${src}" alt="${label}" />`;
  });

  return `
    <div class="ranking-marker ranking-${escapeHtml(entry.rankingCategory || "single")}">
      <div class="ranking-marker-badges">${badges.join("")}</div>
      <div class="ranking-marker-pin"></div>
    </div>
  `;
}

function openRankingInfo(entry, position) {
  if (!rankingInfoWindow || !map) return;
  const price = entry.price ? `人均 ${escapeHtml(String(entry.price))}` : "人均未标注";
  const cuisine = entry.cuisine ? escapeHtml(entry.cuisine) : "菜系未标注";
  const labels = (entry.labels || []).map((label) => `<span>${escapeHtml(label)}</span>`).join("");
  rankingInfoWindow.setContent(`
    <div class="ranking-info-window">
      <strong>${escapeHtml(entry.name)}</strong>
      <div class="ranking-info-tags">${labels}</div>
      <p>${cuisine} · ${price}</p>
      <p>${escapeHtml([entry.district, entry.area, entry.address].filter(Boolean).join(" · "))}</p>
    </div>
  `);
  rankingInfoWindow.open(map, position);
}

async function initMap() {
  try {
    const cfg = await apiGet("/api/config");
    if (!cfg.amapJsKey || !cfg.amapSecurityJsCode) {
      setMapFallback("缺少高德地图前端配置。");
      return;
    }

    window._AMapSecurityConfig = { securityJsCode: cfg.amapSecurityJsCode };
    await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.amapJsKey)}`);

    map = new window.AMap.Map("map", {
      zoom: 14,
      center: cityCenter(state.filters.city),
      viewMode: "2D",
      mapStyle: "amap://styles/light",
      showLabel: true,
      doubleClickZoom: false
    });

    rankingInfoWindow = new window.AMap.InfoWindow({
      offset: new window.AMap.Pixel(0, -24),
      closeWhenClickMap: true
    });

    bindManualMapPick();
    await initGeolocation();
  } catch (error) {
    setMapFallback(error instanceof Error ? error.message : "地图初始化失败");
  }
}

function bindManualMapPick() {
  if (!map) return;

  const pickHandler = async (event) => {
    const lng = event?.lnglat?.getLng ? event.lnglat.getLng() : event?.lnglat?.lng;
    const lat = event?.lnglat?.getLat ? event.lnglat.getLat() : event?.lnglat?.lat;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const now = Date.now();
    if (now - state.manualPickGuardAt < 250) return;
    state.manualPickGuardAt = now;

    const point = [lng, lat];
    await commitLocationFromPoint(point, "manual-pick");
    map.setCenter(point);
    await refreshLocalResults();
  };

  map.on("click", pickHandler);
  map.on("dblclick", pickHandler);
}

async function initGeolocation() {
  try {
    await loadPlugin("AMap.Geolocation");
    const geolocation = new window.AMap.Geolocation({
      enableHighAccuracy: true,
      timeout: 10000,
      zoomToAccuracy: true,
      buttonPosition: "RB",
      showMarker: true,
      showCircle: true
    });
    map.addControl(geolocation);

    const result = await new Promise((resolve, reject) => {
      geolocation.getCurrentPosition((status, payload) => {
        if (status === "complete" && payload?.position) resolve(payload);
        else reject(payload || new Error("定位失败"));
      });
    });

    await commitLocationFromGeoResult(result);
    await refreshLocalResults();
  } catch {
    const fallback = cityCenter(state.filters.city);
    await commitLocation({
      point: fallback,
      city: state.filters.city,
      district: "",
      address: "",
      formattedAddress: "",
      source: "fallback"
    });
    map?.setCenter(fallback);
    map?.setZoom(13);
    await refreshLocalResults();
  }
}

async function commitLocationFromGeoResult(result) {
  const lng = result?.position?.lng;
  const lat = result?.position?.lat;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error("定位结果无效");

  const point = [lng, lat];
  const reverse = await reverseGeocode(point).catch(() => null);
  const city = normalizeCityName(
    result?.addressComponent?.city ||
      result?.addressComponent?.district ||
      result?.addressComponent?.province ||
      reverse?.addressComponent?.city ||
      reverse?.addressComponent?.district ||
      reverse?.addressComponent?.province ||
      state.filters.city
  );
  const district = cleanText(
    result?.addressComponent?.district ||
      result?.addressComponent?.township ||
      reverse?.addressComponent?.district ||
      reverse?.addressComponent?.township ||
      ""
  );

  await commitLocation({
    point,
    city,
    district,
    address: reverse?.formattedAddress || result?.formattedAddress || "",
    formattedAddress: reverse?.formattedAddress || result?.formattedAddress || "",
    source: "geolocation"
  });
}

async function commitLocationFromPoint(point, source) {
  const reverse = await reverseGeocode(point).catch(() => null);
  await commitLocation({
    point,
    city: normalizeCityName(
      reverse?.addressComponent?.city ||
        reverse?.addressComponent?.district ||
        reverse?.addressComponent?.province ||
        state.filters.city
    ),
    district: cleanText(reverse?.addressComponent?.district || reverse?.addressComponent?.township || ""),
    address: reverse?.formattedAddress || "",
    formattedAddress: reverse?.formattedAddress || "",
    source
  });
}

async function commitLocation({ point, city, district, address, formattedAddress, source }) {
  state.location = {
    city: city || state.filters.city,
    district: district || "",
    address: address || "",
    formattedAddress: formattedAddress || address || "",
    location: point,
    source: source || "unknown"
  };
  state.filters.city = state.location.city;
  sessionStorage.setItem("amap.currentLocation", JSON.stringify(state.location));
  ensureCityOption(state.filters.city);
  syncToolbarValues();
  renderContext();
  renderSuggestions();
}

async function reverseGeocode(point) {
  await loadPlugin("AMap.Geocoder");
  const geocoder = new window.AMap.Geocoder({ radius: 1000 });
  return new Promise((resolve, reject) => {
    geocoder.getAddress(point, (status, data) => {
      if (status === "complete" && data?.regeocode) resolve(data.regeocode);
      else reject(data || new Error("逆地理失败"));
    });
  });
}

async function refreshNearby() {
  if (!map || !Array.isArray(state.location.location)) return;
  const requestId = ++state.nearbyRequestId;
  setStatus("刷新中");

  try {
    const query = new URLSearchParams({
      city: state.filters.city,
      location: pointToString(state.location.location),
      address: state.location.formattedAddress || state.location.address || "",
      walkMinutes: String(state.filters.walkMinutes),
      category: state.filters.category,
      keywords: state.filters.category,
      radius: String(walkMinutesToRadius(state.filters.walkMinutes))
    });

    const payload = await apiGet(`/api/nearby?${query.toString()}`);
    if (requestId !== state.nearbyRequestId) return;

    renderNearbyMap(payload);
    renderNearbyEvidence(payload);
    renderContext();
    setStatus("在线");
  } catch (error) {
    if (requestId !== state.nearbyRequestId) return;
    renderEvidenceNotice(error instanceof Error ? error.message : "周边刷新失败");
    setStatus("失败");
  }
}

function renderNearbyMap(payload) {
  clearMap();

  const pois = sortPoisByDistance(Array.isArray(payload.pois) ? payload.pois : []);
  const bounds = [];
  const origin = payload.origin?.location ? parseLocation(payload.origin.location) : state.location.location;

  if (els.mapTitle) {
    const titleCity = payload.origin?.city || state.location.city || state.filters.city;
    els.mapTitle.textContent = `📍 ${titleCity} · ${state.filters.category} · 步行${state.filters.walkMinutes}分钟`;
  }
  if (els.plannerBadge) els.plannerBadge.textContent = "高德实时筛选";

  if (origin) {
    bounds.push(origin);
    const originMarker = new window.AMap.Marker({
      position: origin,
      title: payload.origin?.formattedAddress || "当前位置",
      label: {
        content: `<div class="map-label origin">我</div>`,
        direction: "top"
      }
    });
    originMarker.setMap(map);
    overlays.push(originMarker);

    const circle = new window.AMap.Circle({
      center: origin,
      radius: Number(payload.radius || walkMinutesToRadius(state.filters.walkMinutes)),
      strokeColor: "#008f81",
      strokeOpacity: 0.66,
      strokeWeight: 2,
      strokeStyle: "dashed",
      fillColor: "#008f81",
      fillOpacity: 0.08
    });
    circle.setMap(map);
    overlays.push(circle);
  }

  pois.slice(0, 10).forEach((poi, index) => {
    if (!poi.location) return;
    const point = parseLocation(poi.location);
    bounds.push(point);
    const marker = new window.AMap.Marker({
      position: point,
      title: poi.name,
      label: {
        content: `<div class="map-label cluster">${index + 1}</div>`,
        direction: "top"
      }
    });
    marker.setMap(map);
    overlays.push(marker);
  });

  state.mapBounds = bounds;
  fitMap();
  renderMapLegend();
}

function renderNearbyEvidence(payload) {
  if (!els.evidence) return;
  const pois = sortPoisByDistance(Array.isArray(payload.pois) ? payload.pois : []);
  if (!pois.length) {
    setEvidenceNotice("没有找到可展示的周边结果。");
    return;
  }

  setEvidenceRows(
    pois.map((poi, index) =>
      evidenceRow(
        index + 1,
        poi.name,
        [poi.district, poi.address].filter(Boolean).join(" "),
        formatDistance(poi.distance),
        formatRating(poi.rating),
        "高德"
      )
    ),
    6
  );
}

function renderSuggestions() {
  if (!els.quickPrompts) return;
  els.quickPrompts.innerHTML = suggestions
    .map((item) => `<button type="button" class="shortcut-tag" data-question="${escapeHtml(item.question())}">${escapeHtml(item.label())}</button>`)
    .join("");

  els.quickPrompts.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const question = button.dataset.question || "";
      if (!els.questionInput) return;
      els.questionInput.value = els.questionInput.value.trim() ? `${els.questionInput.value.trim()} ${question}` : question;
      els.heroAskCard?.classList.add("has-draft-feedback");
      window.setTimeout(() => els.heroAskCard?.classList.remove("has-draft-feedback"), 650);
      syncDraftState();
      els.questionInput.focus();
    });
  });
}

function renderContext() {
  const city = state.location.city || state.filters.city || "未锁定城市";
  const district = state.location.district || "";
  const address = state.location.formattedAddress || state.location.address || "未锁定地点";
  const category = state.filters.category || "未锁定主题";
  const currentArea = district || city;

  const contextText = `当前上下文：${city}${district ? ` · ${district}` : ""} · ${address} · ${category}`;
  const bannerText = `当前搜索范围：${city}${district ? ` · ${district}` : ""} · ${category}`;

  const contextTextEl = els.contextBar?.querySelector(".context-text");
  const bannerTextEl = els.contextBanner?.querySelector(".context-banner-text");

  if (contextTextEl) contextTextEl.textContent = contextText;
  if (bannerTextEl) bannerTextEl.textContent = bannerText;
  if (els.searchHint) els.searchHint.textContent = `💡 提示：您可以试着输入“${currentArea} 附近有什么电影院？”`;
}

function updateChatMode() {
  const hasMessages = Boolean(els.conversation?.children.length);
  document.body.classList.toggle("has-messages", hasMessages);
  els.heroAskCard?.setAttribute("aria-hidden", hasMessages ? "true" : "false");
  els.followupInputBar?.setAttribute("aria-hidden", hasMessages ? "false" : "true");
}

function resetContext() {
  state.history = [];
  state.summary = "";
  if (els.conversation) els.conversation.innerHTML = "";
  state.mapBounds = [];
  clearMap();
  document.querySelector(".map-legend")?.remove();
  setEvidenceNotice("上下文已重置。你可以重新输入地点需求。");
  if (els.mapTitle) els.mapTitle.textContent = "📍 我的周边";
  if (els.plannerBadge) els.plannerBadge.textContent = "DeepSeek 解析";
  updateChatMode();
  renderContext();
  renderSuggestions();
  els.questionInput?.focus();
}

function currentAreaLabel() {
  return compactAreaLabel({
    city: state.location.city || state.filters.city,
    district: state.location.district,
    address: state.location.formattedAddress || state.location.address
  });
}

function compactAreaLabel({ city, district, address }) {
  const cleanCity = cleanText(city);
  const cleanDistrict = cleanText(district);
  const cleanAddress = cleanText(address);
  if (cleanCity && cleanDistrict) {
    if (cleanCity.includes(cleanDistrict)) return cleanCity;
    return `${cleanCity}${cleanDistrict}`;
  }
  if (cleanDistrict) return cleanDistrict;
  if (cleanAddress) return trimAddressForPrompt(cleanAddress);
  return cleanCity || "当前位置";
}

function trimAddressForPrompt(address) {
  const text = cleanText(address).replace(/\s+/g, "");
  if (!text) return "";
  const districtMatch = text.match(/([^省市区县旗]+[区县旗])/);
  if (districtMatch) return districtMatch[1];
  return text.length > 14 ? text.slice(0, 14) : text;
}

function clearResultSurface(message = "正在查询...") {
  state.mapBounds = [];
  clearMap();
  document.querySelector(".map-legend")?.remove();
  setEvidenceNotice(message);
  if (els.mapTitle) els.mapTitle.textContent = "正在查询";
}

function friendlyErrorMessage(error) {
  const raw = String(error?.message || error || "");
  if (/ENGINE_RESPONSE_DATA_ERROR|没有返回完整结果|500|502|503|504|HTTP 5/i.test(raw)) {
    return "这次地图数据没有稳定返回。你可以换个更具体的地点或稍后再试，我不会把旧结果当成新答案。";
  }
  if (/timeout|超时|fetch failed|网络|Failed to fetch/i.test(raw)) {
    return "这次网络有点不稳，地图数据暂时没取完整。你可以稍后重试，或者把地点说得更具体一点。";
  }
  if (/起点|终点|路线|怎么走|识别/.test(raw)) {
    return "我还没稳稳识别出起点和终点。你可以换成“从某地到某地怎么走”再试一次。";
  }
  return `这次查询没有稳定完成：${raw || "请换个更具体的问法再试一次。"}`;
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  if (state.isAsking) return;
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  syncDraftState();
  await askAgent(question);
}

async function handleQuestionKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  if (state.isAsking) return;
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  syncDraftState();
  await askAgent(question);
}

async function handleInlineSend() {
  if (state.isAsking) return;
  const question = els.inlineInput?.value.trim();
  if (!question) return;
  els.inlineInput.value = "";
  syncDraftState();
  await askAgent(question);
}

async function handleInlineKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await handleInlineSend();
}

async function askAgent(question) {
  if (state.isAsking) return;
  setAskingState(true);
  clearResultSurface("正在获取新的地点证据...");
  state.history.push({ role: "user", content: question });
  appendMessage("user", question);
  updateChatMode();

  const thinking = appendMessage("assistant", "正在分析问题，并调用高德 API 获取真实数据...", {
    title: "DeepSeek 解析",
    icon: "blue",
    chips: ["理解意图", "抽取地点", "查询高德"],
    pending: true
  });
  setStatus("查询中");

  try {
    const payload = await streamAgentReply(
      "/api/agent/stream",
      {
        question,
        history: state.history.slice(-40),
        context: buildContextPayload()
      },
      thinking
    );

    appendAnswer(payload);
    renderAgentMap(payload);
    renderAgentEvidence(payload);
    applyServerContext(payload.context);
    state.history.push({
      role: "assistant",
      content: [payload.analysis, payload.answer].filter(Boolean).join("\n")
    });
    state.summary = buildHistorySummary();
    renderContext();
    setStatus("完成");
    requestAnimationFrame(() => els.inlineInput?.focus());
  } catch (error) {
    thinking.remove();
    appendMessage("assistant", friendlyErrorMessage(error), {
      title: "查询失败",
      icon: "green"
    });
    setStatus("失败");
  } finally {
    setAskingState(false);
  }
}

function appendMessage(role, content, options = {}) {
  if (!els.conversation) return document.createElement("article");

  const message = document.createElement("article");
  message.className = `message ${role === "user" ? "user" : "assistant"}`;
  if (options.pending) message.classList.add("is-pending");

  const avatar = document.createElement("div");
  avatar.className = role === "user" ? "avatar" : `avatar ai-assistant-avatar ${options.icon === "green" ? "message-icon green" : ""}`;
  avatar.textContent = role === "user" ? "你" : "AI";

  const body = document.createElement("div");
  body.className = "message-body";

  const head = document.createElement("div");
  head.className = "message-head";
  head.innerHTML = `<strong>${escapeHtml(options.title || (role === "user" ? "你" : "AI 地图助手"))}</strong><time>${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>`;

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = content || "";

  body.append(head, text);

  if (Array.isArray(options.chips) && options.chips.length) {
    const tools = document.createElement("div");
    tools.className = "tool-strip";
    tools.innerHTML = options.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
    body.appendChild(tools);
  }

  message.append(avatar, body);
  els.conversation.appendChild(message);
  updateChatMode();
  scrollConversationToBottom();
  return message;
}

function appendAnswer(payload, options = {}) {
  const answerText = payload?.answer || payload?.source || "以下是真实高德数据返回的地点证据。";

  const message = appendMessage("assistant", answerText, {
    title: intentLabel(payload?.intent || "search"),
    icon: "green",
    chips: [payload?.source || "高德 API"].filter(Boolean)
  });

  const cards = buildAnswerCards(payload);
  if (cards) message.querySelector(".message-body")?.insertAdjacentHTML("beforeend", cards);
  scrollConversationToBottom();
}

function buildAnswerCards(payload) {
  const pois = payload?.data?.pois || [];
  if (Array.isArray(pois) && pois.length) {
    return `<div class="answer-list">${pois.slice(0, 4).map((poi) => placeCard(poi)).join("")}</div>`;
  }

  const matches = payload?.data?.matches || [];
  if (Array.isArray(matches) && matches.length) {
    return `<div class="answer-list">${matches.slice(0, 8).map((match) => `
      <article class="place-card">
        <div class="place-photo"></div>
        <div class="place-card-main">
          <strong>${escapeHtml(match.title || "候选组合")}</strong>
          <span class="place-inline-meta">最远点距 ${escapeHtml(match.maxPairDistanceMeters || "-")}m</span>
        </div>
      </article>
    `).join("")}</div>`;
  }

  return "";
}

function placeCard(poi) {
  const name = poi?.name || "地点";
  const address = [poi?.district, poi?.address].filter(Boolean).join(" ");
  const distance = poi?.distance ? `${poi.distance}m` : "";
  const labels = poi?.rankingLabels?.length ? poi.rankingLabels : [state.filters.category].filter(Boolean);
  return `
    <article class="place-card">
      <div class="place-photo"></div>
      <div class="place-card-main">
        <strong>${escapeHtml(name)}</strong>
        <span class="place-inline-meta">${escapeHtml([address, distance].filter(Boolean).join(" · "))}</span>
        <div class="place-badges">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
      </div>
    </article>
  `;
}

async function streamAgentReply(path, body, thinkingElement) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    throw new Error(`请求失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];
  let streamedText = "";
  let finalPayload = null;

  const applyDelta = (text) => {
    if (!text) return;
    streamedText += text;
    const target = thinkingElement?.querySelector(".message-text");
    if (target) target.textContent = streamedText;
    scrollConversationToBottom();
  };

  const handleEvent = (name, data) => {
    let payload = {};
    try {
      payload = data ? JSON.parse(data) : {};
    } catch {
      payload = {};
    }

    if (name === "delta") applyDelta(payload.text || "");
    if (name === "error") throw new Error(payload.error || "查询失败");
    if (name === "done") {
      finalPayload = payload;
      finalPayload.__renderAnalysis = !streamedText;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      } else if (line === "") {
        if (dataLines.length) {
          handleEvent(eventName, dataLines.join("\n"));
          dataLines = [];
          eventName = "message";
        }
      }
    }

    if (done) break;
  }

  if (!finalPayload) throw new Error("查询没有返回完整结果");
  const deepseekText = (streamedText || finalPayload.analysis || "").trim();
  if (deepseekText) {
    finalPayload.analysis = deepseekText;
    const target = thinkingElement?.querySelector(".message-text");
    if (target) target.textContent = deepseekText;
  }
  thinkingElement?.classList.remove("is-pending");
  updateChatMode();
  return finalPayload;
}

function scrollConversationToBottom() {
  if (!els.conversation) return;
  els.conversation.scrollTop = els.conversation.scrollHeight;
}

function buildContextPayload() {
  return {
    lastCity: state.location.city,
    lastDistrict: state.location.district,
    lastAddress: state.location.formattedAddress || state.location.address,
    lastKeywords: state.filters.category,
    lastWalkMinutes: state.filters.walkMinutes,
    lastLocation: pointToString(state.location.location),
    summary: state.summary
  };
}

function buildHistorySummary() {
  return state.history.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n").slice(-4000);
}

function applyServerContext(context) {
  if (!context || typeof context !== "object") return;

  if (context.lastCity) {
    state.location.city = normalizeCityName(context.lastCity);
    state.filters.city = state.location.city;
    ensureCityOption(state.location.city);
  }
  if (context.lastDistrict) state.location.district = cleanText(context.lastDistrict);
  if (context.lastAddress) state.location.address = String(context.lastAddress);
  if (context.lastResolvedOrigin) state.location.formattedAddress = String(context.lastResolvedOrigin);
  if (context.lastKeywords) state.filters.category = String(context.lastKeywords);
  if (context.lastWalkMinutes) state.filters.walkMinutes = Number(context.lastWalkMinutes) || state.filters.walkMinutes;
  if (context.lastRadius && !context.lastWalkMinutes) {
    state.filters.walkMinutes = Math.max(5, Math.round(Number(context.lastRadius) / 80)) || state.filters.walkMinutes;
  }
  if (context.lastLocation) {
    const parsed = parseLocation(context.lastLocation);
    if (parsed.length === 2 && parsed.every((v) => Number.isFinite(v))) {
      state.location.location = parsed;
    }
  }

  syncToolbarValues();
  renderContext();
  renderSuggestions();
}

function renderAgentMap(payload) {
  if (!map || !payload?.map) return;
  clearMap();

  if (els.mapTitle) els.mapTitle.textContent = `${intentLabel(payload.intent)}（${resultCount(payload)}）`;
  if (els.plannerBadge) els.plannerBadge.textContent = plannerText(payload.planner);

  const bounds = [];
  (payload.map.markers || []).forEach((item) => {
    if (!item.location) return;
    const point = parseLocation(item.location);
    bounds.push(point);
    const marker = new window.AMap.Marker({
      position: point,
      title: item.title,
      label: {
        content: `<div class="map-label ${markerClass(item.rankingCategory, item.role)}">${escapeHtml(item.label || "")}</div>`,
        direction: "top"
      }
    });
    marker.setMap(map);
    overlays.push(marker);
  });

  if (payload.map.radius && payload.map.center) {
    const circle = new window.AMap.Circle({
      center: parseLocation(payload.map.center),
      radius: Number(payload.map.radius),
      strokeColor: "#008f81",
      strokeOpacity: 0.66,
      strokeWeight: 2,
      strokeStyle: "dashed",
      fillColor: "#008f81",
      fillOpacity: 0.08
    });
    circle.setMap(map);
    overlays.push(circle);
  }

  if (payload.map.route) {
    const line = new window.AMap.Polyline({
      path: [parseLocation(payload.map.route.origin), parseLocation(payload.map.route.destination)],
      strokeColor: "#f59f2f",
      strokeWeight: 4,
      strokeStyle: "dashed"
    });
    line.setMap(map);
    overlays.push(line);
  }

  state.mapBounds = bounds;
  fitMap();
  renderMapLegend();
}

function renderAgentEvidence(payload) {
  if (!els.evidence) return;
  const pois = sortPoisByDistance(Array.isArray(payload.data?.allPois) && payload.data.allPois.length ? payload.data.allPois : payload.data?.pois || []);

  if ((payload.intent === "nearby" || payload.intent === "search" || payload.intent === "travel") && pois.length) {
    setEvidenceRows(
      pois.map((poi, index) =>
        evidenceRow(
          index + 1,
          poi.name,
          [poi.district, poi.address].filter(Boolean).join(" "),
          formatDistance(poi.distance),
          formatRating(poi.rating),
          "高德"
        )
      ),
      6
    );
    return;
  }

  if (payload.intent === "cluster" && Array.isArray(payload.data?.matches)) {
    if (payload.data.matches.length) {
      setEvidenceRows(
        payload.data.matches.map((match, index) =>
          evidenceRow(index + 1, match.title, "多条件组合", `${match.maxPairDistanceMeters}m`, "组合", "高德")
        ),
        10
      );
    } else {
      setEvidenceNotice("没有找到满足条件的组合。");
    }
    return;
  }

  if (payload.intent === "route" && payload.data?.route) {
    const route = payload.data.route;
    setEvidenceRows([evidenceRow(1, "步行路线", "高德步行路径规划", `${route.distanceMeters}m`, `${Math.round(route.durationSeconds / 60)}min`, "高德")], 1);
    return;
  }

  setEvidenceNotice(payload.source || "暂无证据");
}

function evidenceRow(rank, name, address, distance, score, source) {
  return `
    <article class="evidence-row poi-table-row">
      <span>${rank}</span>
      <strong>${escapeHtml(name)}</strong>
      <em>${escapeHtml(address)}</em>
      <b>${escapeHtml(distance)}</b>
      <b>${escapeHtml(score)}</b>
      <b>${escapeHtml(source)}</b>
    </article>
  `;
}

function sortPoisByDistance(pois) {
  return [...(pois || [])].sort((left, right) => numericDistance(left.distance) - numericDistance(right.distance));
}

function numericDistance(distance) {
  const value = Number(distance);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function formatDistance(distance) {
  const meters = Number(distance);
  if (!Number.isFinite(meters)) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km`;
  return `${Math.round(meters)}m`;
}

function formatRating(rating) {
  const text = String(rating || "").trim();
  if (!text || text === "0" || text === "[]") return "-";
  return text;
}

function distanceBetweenPoints(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return Number.POSITIVE_INFINITY;
  const [lng1, lat1] = a.map(Number);
  const [lng2, lat2] = b.map(Number);
  if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function setEvidenceRows(rows, initialLimit = 6) {
  state.evidenceRows = Array.isArray(rows) ? rows : [];
  state.evidenceInitialLimit = initialLimit;
  state.evidenceExpanded = state.evidenceRows.length <= initialLimit;
  renderEvidenceRows();
}

function setEvidenceNotice(message) {
  state.evidenceRows = [];
  state.evidenceExpanded = false;
  if (els.evidence) els.evidence.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
  updateMoreButton();
}

function renderEvidenceRows() {
  if (!els.evidence) return;
  const visibleCount = state.evidenceExpanded ? state.evidenceRows.length : state.evidenceInitialLimit;
  els.evidence.innerHTML = state.evidenceRows.slice(0, visibleCount).join("");
  updateMoreButton();
}

function toggleEvidenceRows() {
  if (!state.evidenceRows.length || state.evidenceRows.length <= state.evidenceInitialLimit) return;
  state.evidenceExpanded = !state.evidenceExpanded;
  renderEvidenceRows();
}

function updateMoreButton() {
  if (!els.moreButton) return;
  const total = state.evidenceRows.length;
  const canExpand = total > state.evidenceInitialLimit;
  els.moreButton.hidden = !canExpand;
  els.moreButton.disabled = !canExpand;
  if (!canExpand) {
    els.moreButton.textContent = "查看更多";
    return;
  }
  els.moreButton.textContent = state.evidenceExpanded ? "收起" : `查看更多（${total - state.evidenceInitialLimit}）`;
}

function setAskingState(isAsking) {
  state.isAsking = isAsking;
  document.body.classList.toggle("is-asking", isAsking);
  const sendButton = els.form?.querySelector(".send-fab");
  if (sendButton) {
    sendButton.disabled = isAsking;
    sendButton.textContent = isAsking ? "..." : "➤";
  }
  if (els.inlineSend) {
    els.inlineSend.disabled = isAsking;
    els.inlineSend.textContent = isAsking ? "..." : "➤";
  }
  syncDraftState();
}

function syncDraftState() {
  const hasMainDraft = Boolean(els.questionInput?.value.trim());
  const hasInlineDraft = Boolean(els.inlineInput?.value.trim());
  const sendButton = els.form?.querySelector(".send-fab");
  sendButton?.classList.toggle("is-ready", hasMainDraft && !state.isAsking);
  els.inlineSend?.classList.toggle("is-ready", hasInlineDraft && !state.isAsking);
}

function renderMapLegend() {
  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) return;
  mapWrap.querySelector(".map-legend")?.remove();
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i class="legend-dot bichibang"></i>${escapeHtml(state.filters.category)}</span>
    <span><i class="legend-dot saojiebang"></i>步行 ${state.filters.walkMinutes} 分钟</span>
  `;
  mapWrap.appendChild(legend);
}

function renderEvidenceNotice(message) {
  setEvidenceNotice(message);
}

function clearMap() {
  overlays.forEach((overlay) => overlay.setMap(null));
  overlays = [];
  rankingOverlays.forEach((overlay) => overlay.setMap(null));
  rankingOverlays = [];
}

function fitMap() {
  if (!map || !state.mapBounds.length) return;
  if (state.mapBounds.length === 1) {
    map.setZoomAndCenter(15, state.mapBounds[0]);
    return;
  }
  map.setFitView([...overlays, ...rankingOverlays], false, [80, 80, 80, 80], 16);
}

function apiGet(path) {
  return fetch(path).then(async (response) => {
    const payload = await response.json();
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "请求失败");
    return payload;
  });
}

async function apiPost(path, body) {
  const response = await fetchWithTimeout(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    45000
  );
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "请求失败");
  return payload;
}

function loadPlugin(name) {
  return new Promise((resolve, reject) => {
    window.AMap.plugin([name], () => {
      try {
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("高德地图 JS API 加载失败"));
    document.head.appendChild(script);
  });
}

function setMapFallback(message) {
  const mapEl = $("#map");
  if (mapEl) mapEl.innerHTML = `<div class="map-fallback">${escapeHtml(message)}</div>`;
}

function parseLocation(location) {
  return String(location).split(",").map((value) => Number(value));
}

function pointToString(point) {
  if (!Array.isArray(point) || point.length < 2) return "";
  return `${point[0]},${point[1]}`;
}

function resultCount(payload) {
  if (!payload?.data) return 0;
  if (payload.intent === "cluster") return Array.isArray(payload.data.matches) ? payload.data.matches.length : 0;
  if (Array.isArray(payload.data.pois)) return payload.data.pois.length;
  return 1;
}

function intentLabel(intent) {
  return {
    cluster: "高德返回证据",
    nearby: "高德返回证据",
    travel: "旅行候选",
    route: "路线证据",
    search: "搜索证据"
  }[intent] || "高德返回证据";
}

function plannerText(planner) {
  return planner === "deepseek-v4-flash" ? "DeepSeek 解析" : "规则解析";
}

function markerClass(rankingCategory, role) {
  if (role === "origin") return "origin";
  if (role === "cluster") return "cluster";
  if (rankingCategory === "multi") return "multi";
  if (rankingCategory === "saojiebang") return "saojiebang";
  if (rankingCategory === "bichibang") return "bichibang";
  if (rankingCategory === "bibendum") return "bibendum";
  return "default";
}

function walkMinutesToRadius(minutes) {
  return Math.max(200, Math.round(Number(minutes) * 80));
}

function cityCenter(city) {
  return {
    "上海市": [121.473667, 31.230525],
    "北京市": [116.407387, 39.904179],
    "广州市": [113.264385, 23.129112],
    "深圳市": [114.057868, 22.543099],
    "杭州市": [120.15507, 30.274084],
    "义乌市": [120.074911, 29.30558],
    "金华市": [119.647265, 29.079195]
  }[city] || [121.473667, 31.230525];
}

function normalizeCityName(value) {
  const text = cleanText(value);
  if (!text) return state.filters.city || FILTERS.defaultCity;
  if (["北京", "上海", "天津", "重庆"].includes(text)) return `${text}市`;
  if (/(市|区|县|旗|盟|州|地区|特别行政区)$/.test(text)) return text;
  return `${text}市`;
}

function cleanText(value) {
  return String(value || "").trim();
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
