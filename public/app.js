const $ = (selector) => document.querySelector(selector);

const els = {
  status: $("#status"),
  plannerBadge: $("#plannerBadge"),
  conversationRailTab: $("#conversationRailTab"),
  searchRailTab: $("#searchRailTab"),
  favoritesRailTab: $("#favoritesRailTab"),
  mobileConversationTab: $("#mobileConversationTab"),
  mobileSearchTab: $("#mobileSearchTab"),
  mobileFavoritesTab: $("#mobileFavoritesTab"),
  form: $("#agentForm"),
  questionInput: $("#questionInput"),
  inspireButton: $("#inspireButton"),
  voiceInputButton: $("#voiceInputButton"),
  mobileVoiceButton: $("#mobileVoiceButton"),
  inlineInput: $("#inlineQuestion"),
  inlineInspireButton: $("#inlineInspireButton"),
  inlineVoiceButton: $("#inlineVoiceButton"),
  mobileInlineVoiceButton: $("#mobileInlineVoiceButton"),
  inlineSend: $("#inlineSend"),
  chatPanel: $("#chatPanel"),
  chatPanelToggle: $("#chatPanelToggle"),
  chatPanelHint: $("#chatPanelHint"),
  conversation: $("#conversation"),
  evidence: $("#evidence"),
  mapTitle: $("#mapTitle"),
  contextBar: $("#contextBar"),
  contextBanner: $("#contextBanner"),
  heroAskCard: $("#heroAskCard"),
  followupInputBar: $("#followupInputBar"),
  quickPrompts: $("#quickPrompts"),
  moreButton: $(".more-button"),
  evidenceDrawer: $("#evidenceDrawer"),
  evidenceDrawerToggle: $("#evidenceDrawerToggle"),
  contextResetButton: $("#contextResetButton"),
  contextResetBannerButton: $("#contextResetBannerButton"),
  searchHint: $("#searchHint"),
  mapToolbar: $(".map-toolbar"),
  favoritesPanel: $("#favoritesPanel"),
  favoritesList: $("#favoritesList"),
  favoritesCount: $("#favoritesCount"),
  searchPanel: $("#searchPanel"),
  searchPanelForm: $("#searchPanelForm"),
  searchPanelInput: $("#searchPanelInput"),
  searchPanelResults: $("#searchPanelResults"),
  searchResultCount: $("#searchResultCount"),
  favoriteNoteSheet: $("#favoriteNoteSheet"),
  favoriteNotePlace: $("#favoriteNotePlace"),
  favoriteNoteInput: $("#favoriteNoteInput"),
  favoriteNoteSave: $("#favoriteNoteSave"),
  favoriteNoteSkip: $("#favoriteNoteSkip"),
  favoriteNoteCancel: $("#favoriteNoteCancel")
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
const FAVORITES_STORAGE_KEY = "amap_favorites";
const GUIDE_STORAGE_KEY = "amap_guided";

const state = {
  activeView: "chat",
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
    mode: "all",
    viewportCity: "",
    viewportCenter: null
  },
  layers: {
    walkRadius: true,
    pois: true,
    rankings: true
  },
  evidenceRows: [],
  evidenceInitialLimit: 6,
  evidenceExpanded: false,
  mobileDrawerExpanded: false,
  isVoiceMode: false,
  isChatCollapsed: false,
  search: {
    query: "",
    results: [],
    loading: false,
    lastRequestId: 0
  },
  favoriteDraft: null,
  favorites: [],
  isAsking: false,
  voice: {
    supported: false,
    isListening: false,
    targetKey: "questionInput",
    pendingTargetKey: "",
    baseText: "",
    recognition: null,
    mobileHoldActive: false,
    mobileHoldCanceled: false,
    mobileHoldStartY: 0,
    cancelOnEnd: false,
    suppressNextMobileClick: false
  }
};

let map = null;
let baseOverlays = [];
let walkRadiusOverlays = [];
let poiOverlays = [];
let rankingOverlays = [];
let favoriteStarOverlays = [];
let rankingInfoWindow = null;
let favoritePreviewOverlay = null;
let poiInfoWindow = null;
let guideDismissTimer = 0;
let searchDebounceTimer = 0;

const suggestions = [
  {
    label: () => "AI推荐",
    question: () => `按我当前定位，推荐${currentAreaLabel()}附近适合现在去的地方。`
  },
  {
    label: () => `${currentAreaLabel()}附近`,
    question: () => `${currentAreaLabel()}附近有什么值得吃的？`
  },
  {
    label: () => "步行5分钟",
    question: () => `帮我找${currentAreaLabel()}附近步行5分钟内的咖啡馆。`
  },
  {
    label: () => "商场",
    question: () => `${currentAreaLabel()}附近有哪些值得逛的商场？`
  }
];

const discoveryPrompts = [
  "帮我找一家附近适合朋友聚会、有特色且环境安静的宝藏餐厅",
  "推荐附近步行范围内，当地人评价极高、排队也要吃的隐藏市井小吃",
  "附近有什么适合下午办公、有插座且咖啡品质不错的安静咖啡馆？",
  "推荐一家适合周末晚上约会、审美在线的情调意式餐厅或小酒馆"
];

init();

async function init() {
  syncViewportHeight();
  restoreLocation();
  loadFavorites();
  renderToolbar();
  bindEvents();
  initVoiceInput();
  renderSuggestions();
  renderContext();
  renderFavoritesPanel();
  renderSearchPanel();
  updateChatMode();
  syncVoiceModeUI();
  showFirstVisitGuide();
  await initMap();
  renderFavoriteMarkers();
}

function bindEvents() {
  [els.conversationRailTab, els.mobileConversationTab].forEach((button) =>
    button?.addEventListener("click", () => setActiveView("chat"))
  );
  [els.searchRailTab, els.mobileSearchTab].forEach((button) =>
    button?.addEventListener("click", () => setActiveView("search"))
  );
  [els.favoritesRailTab, els.mobileFavoritesTab].forEach((button) =>
    button?.addEventListener("click", () => setActiveView("favorites"))
  );
  els.form?.addEventListener("submit", handleQuestionSubmit);
  els.questionInput?.addEventListener("keydown", handleQuestionKeydown);
  els.inlineSend?.addEventListener("click", handleInlineSend);
  els.inlineInput?.addEventListener("keydown", handleInlineKeydown);
  els.inspireButton?.addEventListener("click", handleAiDiscoveryClick);
  els.inlineInspireButton?.addEventListener("click", handleAiDiscoveryClick);
  els.voiceInputButton?.addEventListener("click", handleVoiceButtonClick);
  els.mobileVoiceButton?.addEventListener("click", handleVoiceButtonClick);
  els.inlineVoiceButton?.addEventListener("click", handleVoiceButtonClick);
  els.mobileInlineVoiceButton?.addEventListener("click", handleVoiceButtonClick);
  els.chatPanelToggle?.addEventListener("click", () => toggleChatCollapsed());
  els.questionInput?.addEventListener("input", syncDraftState);
  els.inlineInput?.addEventListener("input", syncDraftState);
  els.moreButton?.addEventListener("click", toggleEvidenceRows);
  els.evidenceDrawerToggle?.addEventListener("click", toggleEvidenceDrawer);
  els.contextResetButton?.addEventListener("click", resetContext);
  els.contextResetBannerButton?.addEventListener("click", resetContext);
  els.conversation?.addEventListener("click", handlePlaceCardInteraction);
  els.favoritesList?.addEventListener("click", handlePlaceCardInteraction);
  els.searchPanelResults?.addEventListener("click", handlePlaceCardInteraction);
  els.searchPanelForm?.addEventListener("submit", handleSearchPanelSubmit);
  els.searchPanelInput?.addEventListener("input", handleSearchPanelInput);
  els.favoriteNoteSave?.addEventListener("click", () => commitFavoriteDraft(true));
  els.favoriteNoteSkip?.addEventListener("click", () => commitFavoriteDraft(false));
  els.favoriteNoteCancel?.addEventListener("click", closeFavoriteNoteSheet);
  els.favoriteNoteSheet?.addEventListener("click", (event) => {
    if (event.target === els.favoriteNoteSheet) closeFavoriteNoteSheet();
  });
  window.addEventListener("favorites-changed", handleFavoritesChanged);
  bindMobileVoiceHoldEvents();
  bindEvidenceDrawerGestures();
  const handleViewportChange = () => {
    syncViewportHeight();
    syncEvidenceDrawerState();
    syncVoiceModeUI();
    syncChatCollapseUI();
  };
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);
  syncDraftState();
  syncEvidenceDrawerState();
  setAskingState(false);
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const favorites = JSON.parse(raw || "[]");
    state.favorites = Array.isArray(favorites) ? favorites.filter(Boolean).map(normalizeFavoriteRecord) : [];
  } catch {
    state.favorites = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
  } catch {
    // ignore storage failure
  }
}

function syncViewportHeight() {
  const viewportHeight = Math.round(
    window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0
  );
  if (!viewportHeight) return;
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
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
  `;

  const citySelect = $("#citySelect");
  const walkSelect = $("#walkSelect");
  const categorySelect = $("#categorySelect");

  citySelect.innerHTML = FILTERS.cities.map((city) => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("");
  walkSelect.innerHTML = FILTERS.walkMinutes.map((m) => `<option value="${m}">步行${m}分钟</option>`).join("");
  categorySelect.innerHTML = FILTERS.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");

  citySelect.value = state.filters.city;
  walkSelect.value = String(state.filters.walkMinutes);
  categorySelect.value = state.filters.category;
  syncFilterSelectState();

  citySelect.addEventListener("change", async () => {
    state.filters.city = citySelect.value;
    const selectedCenter = cityCenter(citySelect.value);
    state.location = {
      city: citySelect.value,
      district: "",
      address: "",
      formattedAddress: "",
      location: selectedCenter,
      source: "city-filter"
    };
    sessionStorage.setItem("amap.currentLocation", JSON.stringify(state.location));
    const selectedRankingCity = rankingCityName(citySelect.value);
    state.rankings.viewportCity = selectedRankingCity;
    state.rankings.viewportCenter = selectedRankingCity ? selectedCenter : null;
    if (map) {
      map.setZoomAndCenter(selectedRankingCity ? 11 : 13, selectedCenter);
    }
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
    .map((item) => {
      const isActive = state.rankings.mode === item.key || (item.key === "all" && state.rankings.mode === "all");
      const isNone = item.key === "all" && state.rankings.mode === "none";
      return `<button type="button" class="ranking-filter ranking-filter--${item.key}${isActive ? " is-active" : ""}${isNone ? " is-none" : ""}" data-mode="${item.key}">${rankingFilterIcon(item.key)}<span>${item.label}</span></button>`;
    })
    .join("");

  bar.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode || "all";
      state.rankings.mode = mode === "all"
        ? (state.rankings.mode === "all" ? "none" : "all")
        : mode;
      renderRankingToolbar();
      renderRankingLayer();
    });
  });

  mapWrap.appendChild(bar);
  renderLayerToggles();
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

async function loadRankingLayer(cityOverride = "") {
  try {
    const city = cityOverride || activeRankingCity();
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
    const loaded = state.rankings.markers.length && state.rankings.city === activeRankingCity()
      ? (renderRankingLayer(), true)
      : await loadRankingLayer();
    if (loaded) return;
  }
  await refreshNearby();
}

function renderRankingLayer() {
  if (!map) return;
  clearMap();

  const mapEntries = filterRankingMarkers(state.rankings.markers);
  const evidenceEntries = rankingEvidenceEntries();
  renderRankingEvidence(evidenceEntries);
  if (els.mapTitle) els.mapTitle.textContent = `上海三榜餐厅 · ${mapEntries.length} 家`;

  if (!state.rankings.viewportCity && Array.isArray(state.location.location)) {
    const origin = state.location.location;
    const originMarker = new window.AMap.Marker({
      position: origin,
      title: state.location.formattedAddress || state.location.address || "当前位置",
      label: {
        content: `<div class="map-label origin">我</div>`,
        direction: "top"
      }
    });
    addMapOverlay("base", originMarker);

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
    addMapOverlay("walkRadius", circle);
  }

  mapEntries.forEach((entry) => {
    if (!entry.location) return;
    const point = parseLocation(entry.location);
    const marker = new window.AMap.Marker({
      position: point,
      content: rankingMarkerContent(entry),
      offset: new window.AMap.Pixel(-16, -34),
      anchor: "bottom-center",
      zIndex: 80
    });
    marker.on("click", () => openRankingInfo(entry, marker.getPosition()));
    addMapOverlay("rankings", marker);
  });

  state.mapBounds = [];
  renderMapLegend();
  renderLayerToggles();
  applyLayerVisibility();
  fitMap();
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
  if (!state.layers.rankings || state.rankings.mode === "none") return [];
  if (state.rankings.mode === "all") return markers;
  if (state.rankings.mode === "multi") return markers.filter((item) => item.rankingCategory === "multi");
  return markers.filter((item) => Array.isArray(item.categories) && item.categories.includes(state.rankings.mode));
}

function rankingEvidenceEntries() {
  const anchor = rankingAnchorPoint();
  if (!hasRankingDataForCurrentCity() || !anchor) return [];
  const radius = state.rankings.viewportCity ? 8000 : Math.max(2000, walkMinutesToRadius(state.filters.walkMinutes));
  const sorted = filterRankingMarkers(state.rankings.markers)
    .map((entry) => ({
      ...entry,
      distanceMeters: entry.location ? Math.round(distanceBetweenPoints(anchor, parseLocation(entry.location))) : Number.POSITIVE_INFINITY
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters);
  const nearby = sorted.filter((entry) => Number.isFinite(entry.distanceMeters) && entry.distanceMeters <= radius);
  return nearby.length ? nearby : sorted.slice(0, 20);
}

function hasRankingDataForCurrentCity() {
  return Boolean(activeRankingCity());
}

function activeRankingCity() {
  return state.rankings.viewportCity || rankingCityName(state.filters.city);
}

function rankingAnchorPoint() {
  if (Array.isArray(state.rankings.viewportCenter)) return state.rankings.viewportCenter;
  return Array.isArray(state.location.location) ? state.location.location : null;
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
  const favRecord = normalizeFavoriteRecord({
    id: `poi-${cleanText(entry.name)}-${cleanText(entry.address)}`.toLowerCase(),
    name: entry.name,
    address: [entry.district, entry.area, entry.address].filter(Boolean).join(" "),
    location: entry.location,
    type: entry.cuisine || "",
    rankingLabels: entry.labels || [],
    savedAt: new Date().toISOString()
  });
  const isFaved = isFavoriteId(favRecord.id);
  rankingInfoWindow.setContent(`
    <div class="ranking-info-window">
      <strong>${escapeHtml(entry.name)}</strong>
      <div class="ranking-info-tags">${labels}</div>
      <p>${cuisine} · ${price}</p>
      <p>${escapeHtml([entry.district, entry.area, entry.address].filter(Boolean).join(" · "))}</p>
      <div class="ranking-info-actions">
        <button class="ranking-fav-btn${isFaved ? " is-faved" : ""}" type="button" data-favorite="${escapeHtml(encodeURIComponent(JSON.stringify(favRecord)))}">
          ${favoriteHeartIcon(isFaved)}
          <span>${isFaved ? "已收藏" : "收藏"}</span>
        </button>
      </div>
    </div>
  `);
  rankingInfoWindow.open(map, position);
  window.setTimeout(() => {
    const favBtn = document.querySelector(".ranking-fav-btn");
    if (!favBtn) return;
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const record = decodeFavoritePayload(favBtn.dataset.favorite);
      if (!record) return;
      const saved = toggleFavoriteRecord(record);
      pulseFavoriteButton(favBtn);
      rankingInfoWindow.close();
      showToast(saved ? "已加入收藏" : "已取消收藏");
    }, { once: true });
  }, 50);
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
    poiInfoWindow = new window.AMap.InfoWindow({
      offset: new window.AMap.Pixel(0, -24),
      closeWhenClickMap: true
    });

    bindManualMapPick();
    await initGeolocation();
    bindViewportRankingDiscovery();
  } catch (error) {
    setMapFallback(error instanceof Error ? error.message : "地图初始化失败");
  }
}

function bindViewportRankingDiscovery() {
  if (!map) return;
  map.on("dragend", handleMapViewportChange);
}

async function handleMapViewportChange() {
  if (!map) return;
  const center = map.getCenter();
  const point = [
    center?.getLng ? center.getLng() : center?.lng,
    center?.getLat ? center.getLat() : center?.lat
  ].map(Number);
  if (!point.every(Number.isFinite)) return;

  if (isPointInShanghai(point)) {
    const wasAlreadyBrowsingShanghai = state.rankings.viewportCity === "上海";
    state.rankings.viewportCity = "上海";
    state.rankings.viewportCenter = point;
    syncRankingToolbarVisibility();
    if (state.rankings.markers.length && state.rankings.city === "上海") {
      if (wasAlreadyBrowsingShanghai) {
        renderRankingEvidence(rankingEvidenceEntries());
        if (els.mapTitle) els.mapTitle.textContent = `上海三榜餐厅 · ${filterRankingMarkers(state.rankings.markers).length} 家`;
      } else {
        renderRankingLayer();
      }
    } else {
      await loadRankingLayer("上海");
    }
    return;
  }

  if (state.rankings.viewportCity) {
    state.rankings.viewportCity = "";
    state.rankings.viewportCenter = null;
    clearRankingOverlays();
    syncRankingToolbarVisibility();
    document.querySelector(".map-legend")?.remove();
    if (els.mapTitle) els.mapTitle.textContent = "当前地图视野";
    setEvidenceNotice("当前地图视野暂无已录入榜单，可点击地图设置新的周边位置。");
  }
}

function isPointInShanghai(point) {
  const [lng, lat] = point.map(Number);
  return lng >= 120.85 && lng <= 122.2 && lat >= 30.65 && lat <= 31.9;
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
  state.rankings.viewportCity = "";
  state.rankings.viewportCenter = null;
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
    addMapOverlay("base", originMarker);

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
    addMapOverlay("walkRadius", circle);
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
    marker.on("click", () => openPoiInfo(poi, point));
    addMapOverlay("pois", marker);
  });

  state.mapBounds = bounds;
  fitMap();
  renderFavoriteMarkers();
  renderMapLegend();
  renderLayerToggles();
  applyLayerVisibility();
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

function handleAiDiscoveryClick(event) {
  if (state.isAsking) return;
  const button = event?.currentTarget;
  const targetKey = button?.dataset?.target || "questionInput";
  const targetInput = targetKey === "inlineQuestion" ? els.inlineInput : els.questionInput;
  if (!targetInput) return;
  button?.classList.remove("is-spinning");
  button?.offsetWidth;
  button?.classList.add("is-spinning");

  const prompt = discoveryPrompts[Math.floor(Math.random() * discoveryPrompts.length)];
  targetInput.value = prompt;
  syncDraftState();
  targetInput.focus();
  window.setTimeout(() => {
    if (state.isAsking) return;
    if (targetKey === "inlineQuestion") {
      handleInlineSend();
      return;
    }
    if (els.form?.requestSubmit) els.form.requestSubmit();
    else els.form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, 180);
  window.setTimeout(() => button?.classList.remove("is-spinning"), 520);
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
  if (els.searchHint) {
    els.searchHint.textContent = `💡 提示：您可以试着输入“${currentArea} 附近有什么值得去的地方？”`;
  }
}

function setActiveView(view) {
  state.activeView = ["favorites", "search"].includes(view) ? view : "chat";
  applyActiveView();
}

function applyActiveView() {
  const isFavorites = state.activeView === "favorites";
  const isSearch = state.activeView === "search";
  document.body.classList.toggle("view-favorites", isFavorites);
  document.body.classList.toggle("view-search", isSearch);
  const tabs = [
    { el: els.conversationRailTab, view: "chat", rail: true },
    { el: els.searchRailTab, view: "search", rail: true },
    { el: els.favoritesRailTab, view: "favorites", rail: true },
    { el: els.mobileConversationTab, view: "chat", rail: false },
    { el: els.mobileSearchTab, view: "search", rail: false },
    { el: els.mobileFavoritesTab, view: "favorites", rail: false }
  ];

  tabs.forEach(({ el, view, rail }) => {
    if (!el) return;
    const active = state.activeView === view;
    el.classList.toggle("is-active", active);
    if (rail) el.classList.toggle("active", active);
    el.setAttribute("aria-current", active ? "page" : "false");
  });

  els.favoritesPanel?.setAttribute("aria-hidden", isFavorites ? "false" : "true");
  els.searchPanel?.setAttribute("aria-hidden", isSearch ? "false" : "true");
  if (isSearch) {
    renderSearchPanel();
    requestAnimationFrame(() => els.searchPanelInput?.focus());
  }
}

function updateChatMode() {
  const hasMessages = Boolean(els.conversation?.children.length);
  if (!hasMessages) state.isChatCollapsed = false;
  document.body.classList.toggle("has-messages", hasMessages);
  els.heroAskCard?.setAttribute("aria-hidden", hasMessages ? "true" : "false");
  els.followupInputBar?.setAttribute("aria-hidden", hasMessages ? "false" : "true");
  applyActiveView();
  syncVoiceModeUI();
  syncChatCollapseUI();
}

function favoriteIdFromRecord(record) {
  return `poi-${cleanText(record?.name)}-${cleanText(record?.address)}`.toLowerCase();
}

function normalizeFavoriteRecord(record) {
  const rankingLabels = Array.isArray(record?.rankingLabels) ? record.rankingLabels.filter(Boolean).map(String) : [];
  const location = Array.isArray(record?.location) ? pointToString(record.location) : cleanText(record?.location);
  const userNote = cleanText(record?.userNote || record?.note);
  const normalized = {
    id: cleanText(record?.id) || favoriteIdFromRecord(record),
    name: cleanText(record?.name) || "地点",
    address: cleanText(record?.address),
    location,
    type: cleanText(record?.type) || cleanText(record?.category),
    distance: cleanText(record?.distance),
    rankingLabels,
    userNote,
    savedSource: cleanText(record?.savedSource) || "收藏",
    savedAt: cleanText(record?.savedAt) || new Date().toISOString()
  };
  return normalized;
}

function favoriteRecordFromPoi(poi) {
  const address = cleanText([poi?.district, poi?.address].filter(Boolean).join(" "));
  const location = Array.isArray(poi?.location) ? pointToString(poi.location) : cleanText(poi?.location);
  const record = normalizeFavoriteRecord({
    id: favoriteIdFromRecord({ name: poi?.name, address }),
    name: poi?.name,
    address,
    location,
    type: poi?.type || state.filters.category,
    distance: poi?.distance,
    rankingLabels: Array.isArray(poi?.rankingLabels) ? poi.rankingLabels : [],
    savedAt: new Date().toISOString()
  });
  return record;
}

function isFavoriteId(id) {
  return state.favorites.some((favorite) => favorite.id === id);
}

function dispatchFavoritesChanged() {
  saveFavorites();
  window.dispatchEvent(new CustomEvent("favorites-changed", { detail: { favorites: state.favorites } }));
}

function handleFavoritesChanged(event) {
  const favorites = Array.isArray(event?.detail?.favorites) ? event.detail.favorites.map(normalizeFavoriteRecord) : state.favorites;
  state.favorites = favorites;
  renderFavoritesPanel();
  renderSearchPanel();
  syncFavoriteButtons();
  renderFavoriteMarkers();
}

function toggleFavoriteRecord(record) {
  const normalized = normalizeFavoriteRecord(record);
  const index = state.favorites.findIndex((favorite) => favorite.id === normalized.id);
  if (index >= 0) {
    state.favorites.splice(index, 1);
    dispatchFavoritesChanged();
    return false;
  }
  state.favorites.unshift(normalized);
  dispatchFavoritesChanged();
  return true;
}

function saveFavoriteRecord(record, note = "") {
  const normalized = normalizeFavoriteRecord({ ...record, userNote: note });
  const index = state.favorites.findIndex((favorite) => favorite.id === normalized.id);
  if (index >= 0) {
    state.favorites.splice(index, 1);
  }
  state.favorites.unshift(normalized);
  dispatchFavoritesChanged();
  return normalized;
}

function favoriteMetaLine(record) {
  return [cleanText(record.address), formatDistance(record.distance), cleanText(record.type)].filter(Boolean).join(" · ");
}

function favoriteHeartIcon(isFaved) {
  return `
    <svg class="fav-heart-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20.8 4.9 13.9a4.8 4.8 0 0 1 0-6.9 5 5 0 0 1 7 0l.1.1.1-.1a5 5 0 0 1 7 0 4.8 4.8 0 0 1 0 6.9Z" fill="${isFaved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function favoriteButtonMarkup(record) {
  const id = cleanText(record?.id) || favoriteIdFromRecord(record);
  const isFaved = isFavoriteId(id);
  const payload = escapeHtml(encodeURIComponent(JSON.stringify(normalizeFavoriteRecord({ ...record, id }))));
  return `
    <button
      class="fav-button${isFaved ? " is-faved" : ""}"
      type="button"
      aria-label="${isFaved ? "取消收藏" : "收藏地点"}"
      data-poi-id="${escapeHtml(id)}"
      data-favorite="${payload}"
    >
      ${favoriteHeartIcon(isFaved)}
    </button>
  `;
}

function favoriteNoteMarkup(record) {
  const note = cleanText(record?.userNote);
  if (!note) return "";
  return `<div class="favorite-note">${escapeHtml(note)}</div>`;
}

function renderFavoritesPanel() {
  if (!els.favoritesList) return;
  const orderedFavorites = [...state.favorites].sort((left, right) => {
    const noteDelta = Number(Boolean(cleanText(right.userNote))) - Number(Boolean(cleanText(left.userNote)));
    if (noteDelta) return noteDelta;
    return String(right.savedAt || "").localeCompare(String(left.savedAt || ""));
  });
  const count = orderedFavorites.length;
  if (els.favoritesCount) els.favoritesCount.textContent = `${count} 个地点`;

  if (!count) {
    els.favoritesList.innerHTML = `
      <div class="fav-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.8 4.9 13.9a4.8 4.8 0 0 1 0-6.9 5 5 0 0 1 7 0l.1.1.1-.1a5 5 0 0 1 7 0 4.8 4.8 0 0 1 0 6.9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <strong>还没有收藏的地点</strong>
          <p>在搜索结果中点击❤️即可收藏</p>
        </div>
      </div>
    `;
    return;
  }

  els.favoritesList.innerHTML = `
      <div class="favorites-card-list">
      ${orderedFavorites
        .map(
          (favorite, index) => `
            <article class="place-card place-card--favorite is-clickable" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}">
              <div class="place-photo place-photo-rank">${index + 1}</div>
              <div class="place-card-main">
                <strong>${escapeHtml(favorite.name)}</strong>
                <span class="place-inline-meta">${escapeHtml(favoriteMetaLine(favorite))}</span>
                ${favoriteNoteMarkup(favorite)}
                <div class="place-badges">${(favorite.rankingLabels || []).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
              </div>
              ${favoriteButtonMarkup(favorite)}
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSearchPanel() {
  if (!els.searchPanelResults) return;
  const query = cleanText(state.search.query);
  const results = Array.isArray(state.search.results) ? state.search.results : [];
  if (els.searchPanelInput && els.searchPanelInput.value !== state.search.query) {
    els.searchPanelInput.value = state.search.query;
  }

  if (els.searchResultCount) {
    if (state.search.loading) els.searchResultCount.textContent = "正在调用高德搜索...";
    else if (!query) els.searchResultCount.textContent = "输入关键词开始搜索";
    else els.searchResultCount.textContent = `高德返回 ${results.length} 个结果`;
  }

  if (!query) {
    els.searchPanelResults.innerHTML = `
      <div class="fav-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M16 16 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <div>
          <strong>搜索一个具体地点</strong>
          <p>例如：上海环贸停车场、某某大厦、便宜停车场</p>
        </div>
      </div>
    `;
    return;
  }

  if (!results.length) {
    els.searchPanelResults.innerHTML = `
      <div class="fav-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M16 16 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <div>
          <strong>还没有搜到稳定结果</strong>
          <p>试试换一个更具体的关键词，或补充城市名</p>
        </div>
      </div>
    `;
    return;
  }

  els.searchPanelResults.innerHTML = `
    <div class="search-results-list">
      ${results.map((poi) => searchResultCard(poi)).join("")}
    </div>
  `;
}

function searchResultCard(poi) {
  const favorite = favoriteRecordFromPoi(poi);
  const labels = [poi?.type, poi?.distance ? formatDistance(poi.distance) : ""].filter(Boolean).slice(0, 2);
  return `
    <article class="place-card search-result-card is-clickable" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}">
      <div class="place-photo"></div>
      <div class="place-card-main">
        <strong>${escapeHtml(poi?.name || "地点")}</strong>
        <span class="place-inline-meta">${escapeHtml([poi?.district, poi?.address].filter(Boolean).join(" · "))}</span>
        <div class="place-badges">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
      </div>
      ${favoriteButtonMarkup({ ...favorite, rankingLabels: Array.isArray(poi?.rankingLabels) ? poi.rankingLabels : [], savedSource: "搜索收藏" })}
    </article>
  `;
}

function handleSearchPanelInput(event) {
  const nextValue = String(event.target?.value || "");
  state.search.query = nextValue;
  window.clearTimeout(searchDebounceTimer);
  renderSearchPanel();
  if (!cleanText(nextValue)) {
    state.search.results = [];
    state.search.loading = false;
    renderSearchPanel();
    return;
  }
  searchDebounceTimer = window.setTimeout(() => {
    void runSearchPanelQuery(nextValue);
  }, 220);
}

function handleSearchPanelSubmit(event) {
  event.preventDefault();
  const query = cleanText(els.searchPanelInput?.value);
  if (!query) return;
  window.clearTimeout(searchDebounceTimer);
  void runSearchPanelQuery(query, { immediate: true });
}

async function runSearchPanelQuery(rawQuery, options = {}) {
  const query = cleanText(rawQuery);
  if (!query) return;
  const requestId = state.search.lastRequestId + 1;
  state.search.lastRequestId = requestId;
  state.search.query = query;
  state.search.loading = true;
  renderSearchPanel();
  try {
    const payload = await apiGet(`/api/search?keywords=${encodeURIComponent(query)}&city=${encodeURIComponent(state.filters.city || state.location.city || "")}`);
    if (requestId !== state.search.lastRequestId) return;
    state.search.results = sortPoisByDistance(Array.isArray(payload.pois) ? payload.pois : []).slice(0, 20);
    state.search.loading = false;
    renderSearchPanel();
    if (options.immediate && state.search.results[0]?.location && map) {
      const point = parseLocation(state.search.results[0].location);
      if (point.length === 2 && point.every(Number.isFinite)) map.setZoomAndCenter(15, point);
    }
  } catch (error) {
    if (requestId !== state.search.lastRequestId) return;
    state.search.loading = false;
    state.search.results = [];
    renderSearchPanel();
    showToast(error instanceof Error ? error.message : "搜索失败");
  }
}

function renderLayerToggles() {
  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) return;
  mapWrap.querySelector(".layer-toggles")?.remove();

  const container = document.createElement("div");
  container.className = "layer-toggles";
  container.innerHTML = `
    <button class="layer-toggle ${state.layers.walkRadius ? "" : "is-hidden"}" type="button" data-layer="walkRadius">
      ${state.layers.walkRadius ? "◎" : "○"} 步行范围
    </button>
    <button class="layer-toggle ${state.layers.pois ? "" : "is-hidden"}" type="button" data-layer="pois">
      ${state.layers.pois ? "◎" : "○"} 美食/店铺
    </button>
    <button class="layer-toggle ${state.layers.rankings ? "" : "is-hidden"}" type="button" data-layer="rankings">
      ${state.layers.rankings ? "◎" : "○"} 全部榜单
    </button>
  `;

  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => toggleLayer(button.dataset.layer));
  });

  mapWrap.appendChild(container);
}

function toggleLayer(layerKey) {
  if (!layerKey || !(layerKey in state.layers)) return;
  state.layers[layerKey] = !state.layers[layerKey];
  renderLayerToggles();
  applyLayerVisibility();
  fitMap();
}

function isLayerVisible(layerKey) {
  if (layerKey === "walkRadius") return state.layers.walkRadius;
  if (layerKey === "pois") return state.layers.pois;
  if (layerKey === "rankings") return state.layers.rankings;
  return true;
}

function addMapOverlay(layerKey, overlay) {
  if (!overlay) return;
  if (layerKey === "walkRadius") {
    walkRadiusOverlays.push(overlay);
  } else if (layerKey === "pois") {
    poiOverlays.push(overlay);
  } else if (layerKey === "rankings") {
    rankingOverlays.push(overlay);
  } else {
    baseOverlays.push(overlay);
  }
  overlay.setMap(isLayerVisible(layerKey) ? map : null);
}

function removeOverlayReference(overlay) {
  if (!overlay) return;
  baseOverlays = baseOverlays.filter((item) => item !== overlay);
  walkRadiusOverlays = walkRadiusOverlays.filter((item) => item !== overlay);
  poiOverlays = poiOverlays.filter((item) => item !== overlay);
  rankingOverlays = rankingOverlays.filter((item) => item !== overlay);
}

function visibleMapOverlays() {
  return [
    ...baseOverlays,
    ...(state.layers.walkRadius ? walkRadiusOverlays : []),
    ...(state.layers.pois ? poiOverlays : []),
    ...(state.layers.rankings ? rankingOverlays : [])
  ].filter(Boolean);
}

function applyLayerVisibility() {
  if (!map) return;
  walkRadiusOverlays.forEach((overlay) => overlay.setMap(state.layers.walkRadius ? map : null));
  poiOverlays.forEach((overlay) => overlay.setMap(state.layers.pois ? map : null));
  rankingOverlays.forEach((overlay) => overlay.setMap(state.layers.rankings ? map : null));
}

function decodeFavoritePayload(raw) {
  if (!raw) return null;
  try {
    return normalizeFavoriteRecord(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

function syncFavoriteButtons() {
  document.querySelectorAll(".fav-button").forEach((button) => {
    const record = decodeFavoritePayload(button.dataset.favorite);
    const fallbackId = cleanText(button.dataset.poiId);
    const id = record?.id || fallbackId;
    const isFaved = isFavoriteId(id);
    button.classList.toggle("is-faved", isFaved);
    button.setAttribute("aria-label", isFaved ? "取消收藏" : "收藏地点");
    button.innerHTML = favoriteHeartIcon(isFaved);
  });
}

function pulseFavoriteButton(button) {
  if (!button) return;
  button.classList.remove("is-popping");
  button.offsetWidth;
  button.classList.add("is-popping");
  window.setTimeout(() => button.classList.remove("is-popping"), 240);
}

function clearFavoritePreview() {
  if (!favoritePreviewOverlay) return;
  try {
    favoritePreviewOverlay.setMap?.(null);
  } catch {
    // ignore map cleanup failure
  }
  removeOverlayReference(favoritePreviewOverlay);
  favoritePreviewOverlay = null;
}

function openFavoriteNoteSheet(record) {
  state.favoriteDraft = normalizeFavoriteRecord(record);
  if (els.favoriteNotePlace) {
    els.favoriteNotePlace.textContent = [state.favoriteDraft.name, state.favoriteDraft.address].filter(Boolean).join(" · ");
  }
  if (els.favoriteNoteInput) {
    els.favoriteNoteInput.value = state.favoriteDraft.userNote || "";
  }
  if (els.favoriteNoteSheet) {
    els.favoriteNoteSheet.hidden = false;
  }
  requestAnimationFrame(() => els.favoriteNoteInput?.focus());
}

function closeFavoriteNoteSheet() {
  state.favoriteDraft = null;
  if (els.favoriteNoteSheet) {
    els.favoriteNoteSheet.hidden = true;
  }
  if (els.favoriteNoteInput) {
    els.favoriteNoteInput.value = "";
  }
}

function commitFavoriteDraft(withNote) {
  if (!state.favoriteDraft) return;
  const note = withNote ? cleanText(els.favoriteNoteInput?.value) : "";
  saveFavoriteRecord({ ...state.favoriteDraft, savedSource: state.activeView === "search" ? "搜索收藏" : "对话收藏" }, note);
  closeFavoriteNoteSheet();
  syncFavoriteButtons();
  showToast(note ? "已收藏并写入私人备注" : "已加入收藏");
}

function focusFavoriteOnMap(record) {
  const point = parseLocation(record?.location);
  if (!map || point.length !== 2 || !point.every(Number.isFinite)) {
    showToast("这个收藏地点暂时没有可用坐标");
    return;
  }

  clearFavoritePreview();
  favoritePreviewOverlay = new window.AMap.Marker({
    position: point,
    title: record?.name || "收藏地点",
    content: `<div class="map-favorite-star" aria-hidden="true">★</div>`
  });
  addMapOverlay("base", favoritePreviewOverlay);
  map.setZoomAndCenter(Math.max(Number(map.getZoom?.() || 15), 15), point);
}

function handlePlaceCardInteraction(event) {
  const suggestionChip = event.target instanceof Element ? event.target.closest(".followup-chip") : null;
  if (suggestionChip) {
    event.preventDefault();
    event.stopPropagation();
    const question = suggestionChip.dataset.question || suggestionChip.textContent || "";
    if (question.trim()) void handleSuggestedQuestion(question.trim());
    return;
  }

  const favoriteButton = event.target instanceof Element ? event.target.closest(".fav-button") : null;
  if (favoriteButton) {
    event.preventDefault();
    event.stopPropagation();
    const record = decodeFavoritePayload(favoriteButton.dataset.favorite);
    if (!record) return;
    const alreadySaved = isFavoriteId(record.id);
    if (alreadySaved) {
      toggleFavoriteRecord(record);
      pulseFavoriteButton(favoriteButton);
      showToast("已取消收藏");
      return;
    }
    pulseFavoriteButton(favoriteButton);
    openFavoriteNoteSheet(record);
    return;
  }

  const card = event.target instanceof Element ? event.target.closest(".place-card.is-clickable") : null;
  if (!card) return;
  const record = normalizeFavoriteRecord({
    id: card.dataset.poiId,
    location: card.dataset.location,
    name: card.querySelector("strong")?.textContent || "地点",
    address: card.querySelector(".place-inline-meta")?.textContent || ""
  });
  if (state.activeView === "favorites" || state.activeView === "search") {
    setActiveView("chat");
  }
  focusFavoriteOnMap(record);
}

async function handleSuggestedQuestion(question) {
  if (!question || state.isAsking) return;
  await askAgent(question);
}

function initVoiceInput() {
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    updateVoiceButtons();
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    state.voice.isListening = true;
    updateVoiceButtons();
    setStatus("语音输入中");
  });

  recognition.addEventListener("result", (event) => {
    const transcripts = collectSpeechTranscripts(event);
    applyVoiceTranscript(transcripts);
  });

  recognition.addEventListener("error", (event) => {
    state.voice.pendingTargetKey = "";
    state.voice.isListening = false;
    const shouldDiscard = state.voice.cancelOnEnd;
    state.voice.cancelOnEnd = false;
    state.voice.mobileHoldActive = false;
    state.voice.mobileHoldCanceled = false;
    if (shouldDiscard) restoreVoiceDraft();
    updateVoiceButtons();
    setStatus(state.isAsking ? "查询中" : "在线");
    const message = voiceErrorMessage(event?.error);
    if (message) showToast(message);
  });

  recognition.addEventListener("end", () => {
    state.voice.isListening = false;
    const shouldDiscard = state.voice.cancelOnEnd;
    state.voice.cancelOnEnd = false;
    state.voice.mobileHoldActive = false;
    state.voice.mobileHoldCanceled = false;
    if (shouldDiscard) {
      restoreVoiceDraft();
      showToast("已取消语音输入");
    } else if (isMobileViewport() && state.isVoiceMode) {
      toggleVoiceMode(false);
    }
    updateVoiceButtons();
    syncDraftState();
    setStatus(state.isAsking ? "查询中" : "在线");
    if (state.voice.pendingTargetKey) {
      const nextTargetKey = state.voice.pendingTargetKey;
      state.voice.pendingTargetKey = "";
      startVoiceRecognition(nextTargetKey);
    }
  });

  state.voice.supported = true;
  state.voice.recognition = recognition;
  updateVoiceButtons();
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

function handleVoiceButtonClick(event) {
  const button = event.currentTarget;
  const targetKey = button?.dataset?.target || "questionInput";
  if (button === els.inlineVoiceButton && isMobileViewport()) {
    if (!state.voice.supported || !state.voice.recognition) {
      showToast("当前环境暂不支持语音输入，请使用文字描述");
      return;
    }
    toggleVoiceMode();
    return;
  }
  if (!state.voice.supported || !state.voice.recognition) {
    showToast("当前环境暂不支持语音输入，请使用文字描述");
    return;
  }
  if (state.isAsking) return;
  if (isMobileHoldVoiceButton(button) && isMobileViewport()) {
    if (state.voice.suppressNextMobileClick) {
      state.voice.suppressNextMobileClick = false;
      return;
    }
    showToast("请长按说话，上滑取消");
    return;
  }

  if (state.voice.isListening) {
    if (state.voice.targetKey === targetKey) {
      state.voice.pendingTargetKey = "";
      state.voice.recognition.stop();
      return;
    }
    state.voice.pendingTargetKey = targetKey;
    state.voice.recognition.stop();
    return;
  }

  startVoiceRecognition(targetKey);
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

function toggleVoiceMode(forceValue) {
  const nextValue = typeof forceValue === "boolean" ? forceValue : !state.isVoiceMode;
  if (state.isVoiceMode === nextValue && isMobileViewport()) {
    syncVoiceModeUI();
    return;
  }
  state.isVoiceMode = nextValue;
  if (!nextValue && state.voice.isListening && state.voice.recognition) {
    state.voice.pendingTargetKey = "";
    state.voice.recognition.stop();
  }
  syncVoiceModeUI();
}

function appendMessage(role, content, options = {}) {
  if (!els.conversation) return document.createElement("article");
  const shouldStick = isConversationNearBottom();

  const message = document.createElement("article");
  message.className = `message ${role === "user" ? "user" : "assistant"}`;
  if (options.pending) message.classList.add("is-pending");

  const body = document.createElement("div");
  body.className = "message-body";

  const head = document.createElement("div");
  head.className = "message-head";
  head.innerHTML = `
    <div class="message-heading">
      <strong>${escapeHtml(options.title || (role === "user" ? "你" : "AI 地图助手"))}</strong>
      <span class="message-role-tag">${role === "user" ? "提问" : "回答"}</span>
    </div>
    <time>${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>
  `;

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

  message.append(body);
  els.conversation.appendChild(message);
  updateChatMode();
  if (shouldStick || role === "user") scrollConversationToBottom(true);
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
  const followupChips = buildFollowupChipStrip(payload);
  if (followupChips) message.querySelector(".message-body")?.insertAdjacentHTML("beforeend", followupChips);
  hidePendingThinkingMessage();
  scrollConversationToBottom();
}

function buildAnswerCards(payload) {
  const pois = payload?.data?.pois || [];
  if (Array.isArray(pois) && pois.length) {
    const limit = payload?.intent === "search" ? 3 : (isMobileViewport() ? 2 : 4);
    return `<div class="answer-list">${pois.slice(0, limit).map((poi) => placeCard(poi)).join("")}</div>`;
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
  const favorite = favoriteRecordFromPoi(poi);
  return `
    <article class="place-card is-clickable" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}">
      <div class="place-photo"></div>
      <div class="place-card-main">
        <strong>${escapeHtml(name)}</strong>
        <span class="place-inline-meta">${escapeHtml([address, distance].filter(Boolean).join(" · "))}</span>
        <div class="place-badges">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
      </div>
      ${favoriteButtonMarkup({ ...favorite, rankingLabels: labels })}
    </article>
  `;
}

function buildFollowupChipStrip(payload) {
  const questions = buildFollowupQuestions(payload);
  if (!questions.length) return "";
  return `
    <div class="followup-chip-strip" aria-label="快捷追问">
      ${questions.map((question) => `<button class="followup-chip" type="button" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join("")}
    </div>
  `;
}

function buildFollowupQuestions(payload) {
  const currentArea = currentAreaLabel();
  const walk = Number(state.filters.walkMinutes || 15);
  const category = cleanText(state.filters.category) || "美食";
  const intent = cleanText(payload?.intent) || "search";
  const options = new Set();

  if (intent === "route") {
    options.add("换成步行路线看看");
    options.add("也告诉我骑行大概多久");
    options.add("把公交方案也列出来");
  } else if (intent === "travel") {
    options.add(`${currentArea}附近还有什么适合散步的地方？`);
    options.add("换成适合朋友聚会的推荐");
    options.add("再推荐 3 个不太累的地方");
  } else if (intent === "cluster") {
    options.add(`还有哪些地方同时有${category}和咖啡馆？`);
    options.add("把离我最近的组合优先列出来");
    options.add("换成步行 15 分钟内再找一轮");
  } else {
    options.add(`换成步行${walk}分钟内再找一轮`);
    options.add(`再推荐附近的咖啡馆`);
    options.add(`按距离最近再给我 3 个`);
    options.add(`顺便告诉我怎么走过去`);
  }

  return Array.from(options).slice(0, 4);
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
    const shouldStick = isConversationNearBottom();
    streamedText += text;
    const target = thinkingElement?.querySelector(".message-text");
    if (target) target.textContent = streamedText;
    if (shouldStick) scrollConversationToBottom(true);
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

function isConversationNearBottom() {
  if (!els.conversation) return;
  const threshold = 60;
  return els.conversation.scrollTop + els.conversation.clientHeight >= els.conversation.scrollHeight - threshold;
}

function scrollConversationToBottom(force = false) {
  if (!els.conversation) return;
  const threshold = 60;
  const isNearBottom = force || els.conversation.scrollTop + els.conversation.clientHeight >= els.conversation.scrollHeight - threshold;
  if (isNearBottom) els.conversation.scrollTop = els.conversation.scrollHeight;
}

function hidePendingThinkingMessage() {
  const pendingMsg = els.conversation?.querySelector(".message.is-pending");
  if (pendingMsg) pendingMsg.style.display = "none";
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
    if (item.role === "origin" || item.role === "destination") {
      addMapOverlay("base", marker);
    } else {
      marker.on("click", () => openPoiInfo(item, point));
      addMapOverlay("pois", marker);
    }
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
    addMapOverlay("walkRadius", circle);
  }

  if (payload.map.route) {
    const routeMode = payload.map.route.mode || payload.data?.plan?.routeMode || "walking";
    const routePath = Array.isArray(payload.map.route.path) && payload.map.route.path.length
      ? payload.map.route.path.map(parseLocation).filter((point) => point.length === 2 && point.every(Number.isFinite))
      : [parseLocation(payload.map.route.origin), parseLocation(payload.map.route.destination)];
    const line = new window.AMap.Polyline({
      path: routePath,
      strokeColor: routeModeColor(routeMode),
      strokeWeight: 6,
      strokeOpacity: 0.88,
      strokeStyle: "solid",
      lineJoin: "round",
      lineCap: "round",
      showDir: true
    });
    addMapOverlay("base", line);
    routePath.forEach((point) => bounds.push(point));
  }

  state.mapBounds = bounds;
  fitMap();
  renderFavoriteMarkers();
  renderMapLegend();
  renderLayerToggles();
  applyLayerVisibility();
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
    const routeMode = payload.data?.plan?.routeMode || payload.map?.route?.mode || "walking";
    const routeLabel = routeModeText(routeMode);
    setEvidenceRows([
      evidenceRow(
        1,
        `${routeLabel}路线`,
        `高德${routeLabel}路径规划`,
        formatDistance(route.distanceMeters),
        `${Math.round(route.durationSeconds / 60)}min`,
        "高德"
      )
    ], 1);
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
  if (!state.mobileDrawerExpanded && isMobileViewport() && state.evidenceRows.length) {
    state.mobileDrawerExpanded = false;
  }
  renderEvidenceRows();
}

function setEvidenceNotice(message) {
  state.evidenceRows = [];
  state.evidenceExpanded = false;
  if (els.evidence) els.evidence.innerHTML = `<p class="empty">${escapeHtml(message)}</p>`;
  updateMoreButton();
  syncEvidenceScrollbarWidth();
  syncEvidenceDrawerState();
}

function renderEvidenceRows() {
  if (!els.evidence) return;
  const visibleCount = state.evidenceExpanded ? state.evidenceRows.length : state.evidenceInitialLimit;
  els.evidence.innerHTML = state.evidenceRows.slice(0, visibleCount).join("");
  updateMoreButton();
  syncEvidenceScrollbarWidth();
  syncEvidenceDrawerState();
}

function syncEvidenceScrollbarWidth() {
  const table = document.querySelector(".evidence-table");
  if (!table || !els.evidence) return;
  requestAnimationFrame(() => {
    const scrollbarWidth = Math.max(0, els.evidence.offsetWidth - els.evidence.clientWidth);
    table.style.setProperty("--evidence-scrollbar-width", `${scrollbarWidth}px`);
  });
}

function toggleEvidenceRows() {
  if (isMobileViewport() && !state.mobileDrawerExpanded) {
    state.mobileDrawerExpanded = true;
  }
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

function toggleEvidenceDrawer() {
  setEvidenceDrawerExpanded(!state.mobileDrawerExpanded);
}

function setEvidenceDrawerExpanded(expanded) {
  state.mobileDrawerExpanded = Boolean(expanded);
  syncEvidenceDrawerState();
}

function syncEvidenceDrawerState() {
  if (!els.evidenceDrawer || !els.evidenceDrawerToggle) return;
  const mobile = isMobileViewport();
  const expanded = mobile ? state.mobileDrawerExpanded : true;
  document.body.classList.toggle("drawer-expanded", mobile && expanded);
  document.body.classList.toggle("drawer-collapsed", mobile && !expanded);
  els.evidenceDrawer.classList.toggle("is-collapsed", mobile && !expanded);
  els.evidenceDrawer.classList.toggle("is-expanded", mobile && expanded);
  els.evidenceDrawerToggle.setAttribute("aria-expanded", String(expanded));
  els.evidenceDrawerToggle.setAttribute("aria-label", expanded ? "收起附近结果列表" : "展开附近结果列表");
  const handleText = els.evidenceDrawerToggle.querySelector(".drawer-handle-text");
  if (handleText) handleText.textContent = expanded ? "收起结果" : "附近结果";
}

function bindEvidenceDrawerGestures() {
  if (!els.evidenceDrawerToggle) return;
  let startY = 0;
  let tracking = false;

  els.evidenceDrawerToggle.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch || !isMobileViewport()) return;
      tracking = true;
      startY = touch.clientY;
    },
    { passive: true }
  );

  els.evidenceDrawerToggle.addEventListener(
    "touchend",
    (event) => {
      if (!tracking || !isMobileViewport()) return;
      tracking = false;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY;
      if (deltaY <= -28) {
        setEvidenceDrawerExpanded(true);
      } else if (deltaY >= 28) {
        setEvidenceDrawerExpanded(false);
      }
    },
    { passive: true }
  );
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function bindMobileVoiceHoldEvents() {
  [els.mobileVoiceButton, els.mobileInlineVoiceButton].forEach((button) => {
    if (!button) return;

    button.addEventListener(
      "touchstart",
      (event) => {
        if (!isMobileViewport()) return;
        if (!state.voice.supported || !state.voice.recognition) {
          showToast("当前环境暂不支持语音输入，请使用文字描述");
          return;
        }
        if (state.isAsking) return;
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        event.preventDefault();
        state.voice.suppressNextMobileClick = true;
        state.voice.mobileHoldActive = true;
        state.voice.mobileHoldCanceled = false;
        state.voice.mobileHoldStartY = touch.clientY;
        state.voice.cancelOnEnd = false;
        updateVoiceButtons();
        startVoiceRecognition(button.dataset.target || "questionInput");
      },
      { passive: false }
    );

    button.addEventListener(
      "touchmove",
      (event) => {
        if (!state.voice.mobileHoldActive || !isMobileViewport()) return;
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        const movedUp = state.voice.mobileHoldStartY - touch.clientY;
        const shouldCancel = movedUp >= 56;
        if (state.voice.mobileHoldCanceled !== shouldCancel) {
          state.voice.mobileHoldCanceled = shouldCancel;
          updateVoiceButtons();
        }
      },
      { passive: true }
    );

    const finalizeHold = (event, forceCancel = false) => {
      if (!state.voice.mobileHoldActive || !isMobileViewport()) return;
      event?.preventDefault?.();
      state.voice.suppressNextMobileClick = true;
      state.voice.cancelOnEnd = forceCancel || state.voice.mobileHoldCanceled;
      state.voice.mobileHoldActive = false;
      state.voice.mobileHoldCanceled = forceCancel || state.voice.mobileHoldCanceled;
      if (state.voice.isListening) {
        try {
          state.voice.recognition?.stop();
        } catch {
          if (state.voice.cancelOnEnd) {
            restoreVoiceDraft();
            showToast("已取消语音输入");
          }
          state.voice.cancelOnEnd = false;
          state.voice.mobileHoldCanceled = false;
          updateVoiceButtons();
          syncDraftState();
        }
      } else {
        if (state.voice.cancelOnEnd) {
          restoreVoiceDraft();
          showToast("已取消语音输入");
        }
        state.voice.cancelOnEnd = false;
        state.voice.mobileHoldCanceled = false;
        updateVoiceButtons();
        syncDraftState();
      }
    };

    button.addEventListener("touchend", (event) => finalizeHold(event, false), { passive: false });
    button.addEventListener("touchcancel", (event) => finalizeHold(event, true), { passive: false });
  });
}

function isMobileHoldVoiceButton(button) {
  return Boolean(button?.classList?.contains("mobile-voice-cta"));
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
  if (isAsking && state.voice.isListening && state.voice.recognition) {
    state.voice.pendingTargetKey = "";
    state.voice.recognition.stop();
  }
  updateVoiceButtons();
  syncDraftState();
}

function syncDraftState() {
  const hasMainDraft = Boolean(els.questionInput?.value.trim());
  const hasInlineDraft = Boolean(els.inlineInput?.value.trim());
  const sendButton = els.form?.querySelector(".send-fab");
  sendButton?.classList.toggle("is-ready", hasMainDraft && !state.isAsking);
  els.inlineSend?.classList.toggle("is-ready", hasInlineDraft && !state.isAsking);
}

function startVoiceRecognition(targetKey) {
  const input = inputElementByKey(targetKey);
  if (!input || !state.voice.recognition) return;

  state.voice.targetKey = targetKey;
  state.voice.baseText = input.value || "";
  if (!(isMobileViewport() && state.isVoiceMode && targetKey === "inlineQuestion")) {
    input.focus();
  }
  try {
    state.voice.recognition.start();
  } catch {
    showToast("语音输入暂时没有成功启动，请再点一次试试");
  }
}

function inputElementByKey(key) {
  if (key === "inlineQuestion") return els.inlineInput;
  return els.questionInput;
}

function collectSpeechTranscripts(event) {
  let finalText = "";
  let interimText = "";
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = String(result?.[0]?.transcript || "");
    if (result?.isFinal) finalText += transcript;
    else interimText += transcript;
  }
  return {
    finalText: normalizeSpeechText(finalText),
    interimText: normalizeSpeechText(interimText)
  };
}

function applyVoiceTranscript({ finalText = "", interimText = "" }) {
  const input = inputElementByKey(state.voice.targetKey);
  if (!input) return;

  const separator = state.voice.baseText && !/\s$/.test(state.voice.baseText) ? " " : "";
  const composed = `${state.voice.baseText}${separator}${finalText || interimText}`.trim();
  input.value = composed;
  syncDraftState();
}

function normalizeSpeechText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function restoreVoiceDraft() {
  const input = inputElementByKey(state.voice.targetKey);
  if (!input) return;
  input.value = state.voice.baseText || "";
}

function updateVoiceButtons() {
  const buttons = [els.voiceInputButton, els.mobileVoiceButton, els.inlineVoiceButton, els.mobileInlineVoiceButton];
  for (const button of buttons) {
    if (!button) continue;
    const isInlineModeToggle = button === els.inlineVoiceButton && isMobileViewport();
    const isInlineHoldButton = button === els.mobileInlineVoiceButton && isMobileViewport();
    button.hidden = isInlineHoldButton ? (!state.voice.supported || !state.isVoiceMode) : !state.voice.supported;
    button.disabled = state.isAsking;
    const isCurrentTarget = button.dataset.target === state.voice.targetKey;
    button.classList.toggle("is-listening", state.voice.isListening && isCurrentTarget);
    button.classList.toggle("is-pressing", isMobileHoldVoiceButton(button) && state.voice.mobileHoldActive && isCurrentTarget && !state.voice.mobileHoldCanceled);
    button.classList.toggle("is-canceling", isMobileHoldVoiceButton(button) && state.voice.mobileHoldCanceled && isCurrentTarget);
    button.setAttribute("aria-pressed", state.voice.isListening && isCurrentTarget ? "true" : "false");
    button.title = isInlineModeToggle
      ? (state.isVoiceMode ? "切回键盘输入" : "切换到按住说话")
      : (state.voice.isListening && isCurrentTarget ? "结束语音输入" : "语音输入");
    if (isInlineModeToggle) {
      button.setAttribute("aria-label", state.isVoiceMode ? "切回键盘输入" : "切换到按住说话");
      button.classList.toggle("is-mode-active", state.isVoiceMode);
      button.innerHTML = state.isVoiceMode ? keyboardIconMarkup() : micIconMarkup();
    }
    const label = button.querySelector("span");
    if (label && button.classList.contains("mobile-voice-cta")) {
      if (state.voice.mobileHoldCanceled && isCurrentTarget) {
        label.textContent = "松开取消发送";
      } else if (state.voice.mobileHoldActive && isCurrentTarget) {
        label.textContent = "松开发送，上滑取消";
      } else {
        label.textContent = "按住说话";
      }
    }
  }
  syncVoiceModeUI();
}

function syncVoiceModeUI() {
  const mobile = isMobileViewport();
  if (!mobile) {
    state.isVoiceMode = false;
  }
  els.followupInputBar?.removeAttribute("hidden");
  els.followupInputBar?.classList.toggle("is-voice-mode", mobile && state.isVoiceMode);
  if (els.inlineInput) {
    els.inlineInput.hidden = mobile && state.isVoiceMode;
  }
  if (els.inlineSend) {
    els.inlineSend.hidden = mobile && state.isVoiceMode;
  }
  if (els.mobileInlineVoiceButton) {
    els.mobileInlineVoiceButton.hidden = !(mobile && state.isVoiceMode && state.voice.supported);
    els.mobileInlineVoiceButton.style.display = mobile && state.isVoiceMode && state.voice.supported ? "" : "none";
  }
}

function toggleChatCollapsed(forceValue) {
  const hasMessages = Boolean(els.conversation?.children.length);
  if (!isMobileViewport() || !hasMessages) return;
  state.isChatCollapsed = typeof forceValue === "boolean" ? forceValue : !state.isChatCollapsed;
  syncChatCollapseUI();
}

function syncChatCollapseUI() {
  const mobile = isMobileViewport();
  const hasMessages = Boolean(els.conversation?.children.length);
  if (!mobile || !hasMessages) {
    state.isChatCollapsed = false;
  }
  const collapsed = mobile && hasMessages && state.isChatCollapsed;
  document.body.classList.toggle("chat-collapsed", collapsed);
  els.chatPanel?.classList.toggle("is-collapsed", collapsed);
  if (els.chatPanelToggle) {
    els.chatPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    els.chatPanelToggle.setAttribute("aria-label", collapsed ? "展开聊天面板" : "收起聊天面板");
  }
  if (els.chatPanelHint) {
    els.chatPanelHint.textContent = collapsed ? "点击展开聊天记录" : "点击收起，把更多空间留给地图";
  }
}

function micIconMarkup() {
  return `
    <svg class="voice-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-4a3.5 3.5 0 1 0-7 0v4A3.5 3.5 0 0 0 12 15Z" />
      <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" />
      <path d="M12 17v3" />
      <path d="M9 20h6" />
    </svg>
  `;
}

function keyboardIconMarkup() {
  return `
    <svg class="voice-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.5" />
      <path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M10 13h.01M13 13h4" />
    </svg>
  `;
}

function voiceErrorMessage(code) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "没有拿到麦克风权限，请先允许浏览器使用麦克风";
  }
  if (code === "audio-capture") {
    return "没有检测到可用麦克风，请检查手机或浏览器权限";
  }
  if (code === "no-speech") {
    return "没有听到清晰语音，请再试一次";
  }
  if (code === "network") {
    return "语音识别网络有点不稳，请稍后重试";
  }
  if (code === "aborted") return "";
  return "当前环境暂不支持语音输入，请使用文字描述";
}

function showToast(message) {
  if (!message) return;
  let toast = document.querySelector(".app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove("is-visible");
  window.clearTimeout(showToast.timer);
  window.requestAnimationFrame(() => toast.classList.add("is-visible"));
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function showFirstVisitGuide() {
  if (localStorage.getItem(GUIDE_STORAGE_KEY) || !els.heroAskCard) return;
  els.heroAskCard.querySelector(".first-visit-guide")?.remove();

  const guide = document.createElement("div");
  guide.className = "first-visit-guide";
  guide.innerHTML = `
    <div class="guide-content">
      <span class="guide-icon">👋</span>
      <div>
        <strong>试试这样问：</strong>
        <p>“附近有什么必吃榜的餐厅”<br>“步行10分钟内的咖啡馆”<br>“上海市中心有什么值得去的地方”</p>
      </div>
      <button class="guide-dismiss" type="button" aria-label="关闭提示">✕</button>
    </div>
  `;

  const dismiss = () => {
    if (!guide.isConnected) return;
    guide.classList.add("is-dismissing");
    window.clearTimeout(guideDismissTimer);
    localStorage.setItem(GUIDE_STORAGE_KEY, "1");
    window.setTimeout(() => guide.remove(), 400);
    document.removeEventListener("click", handleUserInteraction, true);
    document.removeEventListener("keydown", handleUserInteraction, true);
  };

  const handleUserInteraction = (event) => {
    if (event?.target instanceof Element && event.target.closest(".guide-dismiss")) {
      dismiss();
      return;
    }
    dismiss();
  };

  guide.querySelector(".guide-dismiss")?.addEventListener("click", dismiss);
  document.addEventListener("click", handleUserInteraction, true);
  document.addEventListener("keydown", handleUserInteraction, true);
  guideDismissTimer = window.setTimeout(dismiss, 6000);
  els.heroAskCard.prepend(guide);
}

function renderMapLegend() {
  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) return;
  mapWrap.querySelector(".map-legend")?.remove();
  if (isMobileViewport()) return;
  const legend = document.createElement("div");
  legend.className = "map-legend";
  legend.innerHTML = `
    <span><i class="legend-icon legend-icon-pin" aria-hidden="true">${legendPinSvg()}</i>美食/店铺</span>
    <span><i class="legend-icon legend-icon-radius" aria-hidden="true">${legendRadiusSvg()}</i>步行范围</span>
  `;
  mapWrap.appendChild(legend);
}

function openPoiInfo(poi, point) {
  if (!poiInfoWindow || !map) return;
  poiInfoWindow.setContent(`
    <div class="poi-info-window">
      <strong>${escapeHtml(poi?.name || "地点")}</strong>
      <p>${escapeHtml([poi?.district, poi?.area, poi?.address].filter(Boolean).join(" · "))}</p>
      <p>${poi?.distance ? `距离约 ${escapeHtml(formatDistance(poi.distance))}` : ""}</p>
    </div>
  `);
  poiInfoWindow.open(map, point);
}

function legendPinSvg() {
  return `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 2.8c-3.7 0-6.7 3-6.7 6.7 0 4.9 5.1 9.5 6.1 10.4a.9.9 0 0 0 1.2 0c1-.9 6.1-5.5 6.1-10.4 0-3.7-3-6.7-6.7-6.7Z" />
      <circle cx="12" cy="9.6" r="3" />
    </svg>
  `;
}

function legendRadiusSvg() {
  return `
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="7.5" />
    </svg>
  `;
}

function renderEvidenceNotice(message) {
  setEvidenceNotice(message);
}

function clearMap() {
  [...baseOverlays, ...walkRadiusOverlays, ...poiOverlays, ...rankingOverlays].forEach((overlay) => overlay.setMap?.(null));
  baseOverlays = [];
  walkRadiusOverlays = [];
  poiOverlays = [];
  rankingOverlays = [];
  favoritePreviewOverlay = null;
  poiInfoWindow?.close?.();
  rankingInfoWindow?.close?.();
}

function clearFavoriteMarkers() {
  favoriteStarOverlays.forEach((overlay) => overlay.setMap?.(null));
  favoriteStarOverlays = [];
}

function renderFavoriteMarkers() {
  if (!map) return;
  clearFavoriteMarkers();
  state.favorites.forEach((record) => {
    const point = parseLocation(record.location);
    if (point.length !== 2 || !point.every(Number.isFinite)) return;
    const marker = new window.AMap.Marker({
      position: point,
      title: record.name || "收藏地点",
      anchor: "bottom-center",
      offset: new window.AMap.Pixel(0, 0),
      content: `<div class="map-favorite-star" title="${escapeHtml(record.name || "收藏地点")}">★</div>`
    });
    marker.on("click", () => focusFavoriteOnMap(record));
    favoriteStarOverlays.push(marker);
    marker.setMap(map);
  });
}

function clearRankingOverlays() {
  rankingOverlays.forEach((overlay) => overlay.setMap?.(null));
  rankingOverlays = [];
  rankingInfoWindow?.close?.();
}

function fitMap() {
  if (!map || !state.mapBounds.length) return;
  if (state.mapBounds.length === 1) {
    map.setZoomAndCenter(15, state.mapBounds[0]);
    return;
  }
  const overlays = visibleMapOverlays();
  if (!overlays.length) return;
  map.setFitView(overlays, false, [80, 80, 80, 80], 16);
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

function routeModeText(mode) {
  return {
    driving: "驾车",
    transit: "公交",
    riding: "骑行",
    walking: "步行"
  }[mode] || "出行";
}

function routeModeColor(mode) {
  return {
    driving: "#2563eb",
    transit: "#7c3aed",
    riding: "#f59f2f",
    walking: "#008f81"
  }[mode] || "#008f81";
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

function normalizeCityDisplay(value) {
  const text = cleanText(value);
  if (!text) return "";
  if (["北京", "上海", "天津", "重庆"].includes(text)) return `${text}市`;
  return text;
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
