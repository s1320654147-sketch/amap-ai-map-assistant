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
  chatPanelDragHandle: $("#chatPanelDragHandle"),
  chatPanelToggle: $("#chatPanelToggle"),
  chatPanelFullscreenToggle: $("#chatPanelFullscreenToggle"),
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
  favoritesTagFilter: $("#favoritesTagFilter"),
  searchPanel: $("#searchPanel"),
  searchPanelForm: $("#searchPanelForm"),
  searchPanelInput: $("#searchPanelInput"),
  searchPanelResults: $("#searchPanelResults"),
  searchResultCount: $("#searchResultCount"),
  favoriteNoteSheet: $("#favoriteNoteSheet"),
  favoriteNotePlace: $("#favoriteNotePlace"),
  favoriteNoteInput: $("#favoriteNoteInput"),
  favoriteTagsInput: $("#favoriteTagsInput"),
  favoriteTagPresets: $("#favoriteTagPresets"),
  favoriteNoteSave: $("#favoriteNoteSave"),
  favoriteNoteSkip: $("#favoriteNoteSkip"),
  favoriteNoteCancel: $("#favoriteNoteCancel"),
  appStatusBanner: $("#appStatusBanner"),
  appStatusBannerText: $("#appStatusBannerText"),
  appStatusBannerAction: $("#appStatusBannerAction")
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
  chat: {
    history: [],
    summary: "",
    isAsking: false,
    isCollapsed: false,
    isFullscreen: false,
    requestController: null
  },
  map: {
    bounds: [],
    center: null,
    zoom: 14,
    selectedPlaceId: "",
    activeInfoWindow: "",
    chatDrawerCollapsed: false,
    chatDrawerMode: "half",
    evidenceDrawerExpanded: false
  },
  nearbyRequestId: 0,
  manualPickGuardAt: 0,
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
    rankings: true,
    menuOpen: false
  },
  evidenceRows: [],
  evidenceInitialLimit: 6,
  evidenceExpanded: false,
  mobileDrawerExpanded: false,
  isVoiceMode: false,
  search: {
    query: "",
    results: [],
    loading: false,
    lastRequestId: 0,
    requestController: null
  },
  app: {
    online: typeof navigator === "undefined" || navigator.onLine !== false,
    mapReady: false,
    statusAction: null,
    storageAvailable: true,
    sessionStorageAvailable: true,
    lastGlobalErrorAt: 0
  },
  favoriteDraft: null,
  favoriteTagFilter: "",
  favorites: [],
  viewport: {
    stableHeight: 0,
    keyboardOpen: false
  },
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
const mapRuntime = {
  overlays: {
    base: [],
    walkRadius: [],
    pois: [],
    rankings: [],
    favorites: []
  },
  infoWindows: {
    ranking: null,
    poi: null
  },
  placeMarkers: new Map(),
  placeRecords: new Map(),
  resizeFrame: 0,
  resizeTimer: 0,
  rankingRenderTimer: 0,
  rankingRenderMode: "settled",
  rankingBatchToken: 0,
  mapInteractionTimer: 0,
  cardSelectionFrame: 0,
  cardSelectionLockUntil: 0
};
let guideDismissTimer = 0;
let searchDebounceTimer = 0;
let chatDrawerGestureAt = 0;

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

const searchIntentCities = [
  "义乌市",
  "义乌",
  "金华市",
  "金华",
  "上海市",
  "上海",
  "北京市",
  "北京",
  "广州市",
  "广州",
  "深圳市",
  "深圳",
  "杭州市",
  "杭州",
  "南京市",
  "南京",
  "苏州市",
  "苏州",
  "成都市",
  "成都",
  "重庆市",
  "重庆",
  "武汉市",
  "武汉",
  "西安市",
  "西安",
  "泉州市",
  "泉州",
  "厦门市",
  "厦门",
  "福州市",
  "福州",
  "宁波市",
  "宁波",
  "温州市",
  "温州"
];

void init().catch((error) => handleUnexpectedAppError(error));

async function init() {
  syncViewportHeight();
  installAppGuards();
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

function installAppGuards() {
  window.addEventListener("offline", handleOfflineState);
  window.addEventListener("online", handleOnlineState);
  window.addEventListener("error", (event) => {
    if (event?.target && event.target !== window) return;
    const error = event?.error || new Error(event?.message || "页面脚本异常");
    handleUnexpectedAppError(error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isAbortError(event?.reason)) return;
    event?.preventDefault?.();
    handleUnexpectedAppError(event?.reason || new Error("异步任务异常"));
  });
}

function handleOfflineState() {
  state.app.online = false;
  state.chat.requestController?.abort();
  state.search.requestController?.abort();
  setStatus("离线");
  showAppBanner("当前没有网络，地图和 AI 查询暂时无法更新。网络恢复后可以继续。", {
    tone: "warning"
  });
}

function handleOnlineState() {
  state.app.online = true;
  setStatus(state.chat.isAsking ? "查询中" : "在线");
  hideAppBanner();
  showToast("网络已恢复，可以继续查询");
}

function handleUnexpectedAppError(error) {
  const now = Date.now();
  if (now - state.app.lastGlobalErrorAt < 1500) return;
  state.app.lastGlobalErrorAt = now;
  showAppBanner("页面刚刚遇到一点小问题，地图和收藏仍可继续使用。", {
    tone: "error",
    actionLabel: "重新加载",
    action: () => window.location.reload()
  });
}

function showAppBanner(message, { tone = "warning", action = null, actionLabel = "重试" } = {}) {
  state.app.statusAction = typeof action === "function" ? action : null;
  if (!els.appStatusBanner || !els.appStatusBannerText || !els.appStatusBannerAction) return;
  els.appStatusBanner.dataset.tone = tone;
  els.appStatusBannerText.textContent = message;
  els.appStatusBannerAction.textContent = actionLabel;
  els.appStatusBannerAction.hidden = !state.app.statusAction;
  els.appStatusBanner.hidden = false;
}

function hideAppBanner() {
  state.app.statusAction = null;
  if (els.appStatusBanner) els.appStatusBanner.hidden = true;
  if (els.appStatusBannerAction) els.appStatusBannerAction.hidden = true;
}

function isAbortError(error) {
  return error?.name === "AbortError" || /请求已取消|查询已取消/i.test(String(error?.message || error || ""));
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
  els.chatPanelFullscreenToggle?.addEventListener("click", () => toggleChatFullscreen());
  els.questionInput?.addEventListener("input", syncDraftState);
  els.inlineInput?.addEventListener("input", syncDraftState);
  els.moreButton?.addEventListener("click", toggleEvidenceRows);
  els.evidenceDrawerToggle?.addEventListener("click", toggleEvidenceDrawer);
  els.contextResetButton?.addEventListener("click", resetContext);
  els.contextResetBannerButton?.addEventListener("click", resetContext);
  els.conversation?.addEventListener("click", handlePlaceCardInteraction);
  els.favoritesList?.addEventListener("click", handlePlaceCardInteraction);
  els.searchPanelResults?.addEventListener("click", handlePlaceCardInteraction);
  els.conversation?.addEventListener("keydown", handlePlaceCardKeydown);
  els.favoritesList?.addEventListener("keydown", handlePlaceCardKeydown);
  els.searchPanelResults?.addEventListener("keydown", handlePlaceCardKeydown);
  els.favoritesTagFilter?.addEventListener("click", handleFavoriteTagFilterClick);
  els.favoriteTagPresets?.addEventListener("click", handleFavoriteTagPresetClick);
  els.favoriteTagsInput?.addEventListener("input", syncFavoriteTagPresetState);
  els.searchPanelForm?.addEventListener("submit", handleSearchPanelSubmit);
  els.searchPanelInput?.addEventListener("input", handleSearchPanelInput);
  els.favoriteNoteSave?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    commitFavoriteDraft(true);
  });
  els.favoriteNoteSkip?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    commitFavoriteDraft(false);
  });
  els.favoriteNoteCancel?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeFavoriteNoteSheet();
  });
  els.favoriteNoteSheet?.addEventListener("click", (event) => {
    if (event.target === els.favoriteNoteSheet) closeFavoriteNoteSheet();
  });
  els.appStatusBannerAction?.addEventListener("click", async () => {
    const action = state.app.statusAction;
    if (typeof action !== "function") return;
    els.appStatusBannerAction.disabled = true;
    try {
      await action();
    } finally {
      if (els.appStatusBannerAction) els.appStatusBannerAction.disabled = false;
    }
  });
  window.addEventListener("favorites-changed", handleFavoritesChanged);
  els.conversation?.addEventListener("scroll", scheduleVisiblePlaceSelection, { passive: true });
  bindMobileVoiceHoldEvents();
  bindEvidenceDrawerGestures();
  bindChatDrawerGestures();
  const handleViewportChange = () => {
    syncViewportHeight();
    syncEvidenceDrawerState();
    syncVoiceModeUI();
    syncChatCollapseUI();
    requestMapResize({ settle: true });
  };
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);
  document.addEventListener("focusin", () => window.setTimeout(handleViewportChange, 24), true);
  document.addEventListener("focusout", () => window.setTimeout(handleViewportChange, 180), true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.chat.isFullscreen) setChatDrawerMode("half");
  });
  syncDraftState();
  syncEvidenceDrawerState();
  setAskingState(false);
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const favorites = JSON.parse(raw || "[]");
    state.favorites = Array.isArray(favorites) ? favorites.filter(Boolean).map(normalizeFavoriteRecord) : [];
    state.app.storageAvailable = true;
  } catch {
    state.favorites = [];
    state.app.storageAvailable = false;
    showAppBanner("当前浏览器不允许使用本地存储，收藏会暂时保留在本次打开期间。", {
      tone: "warning"
    });
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state.favorites));
    state.app.storageAvailable = true;
    return true;
  } catch {
    state.app.storageAvailable = false;
    showAppBanner("收藏已暂存，但当前浏览器无法持久化保存，刷新后可能丢失。", {
      tone: "warning"
    });
    return false;
  }
}

function syncViewportHeight() {
  const layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
  if (!layoutHeight) return;

  const visualViewport = window.visualViewport;
  const visualHeight = Math.round(visualViewport?.height || layoutHeight);
  const visualOffsetTop = Math.round(visualViewport?.offsetTop || 0);
  const activeElement = document.activeElement;
  const hasTextFocus = Boolean(
    activeElement instanceof HTMLElement &&
      (activeElement.matches("input, textarea") || activeElement.isContentEditable)
  );
  if (!hasTextFocus) {
    state.viewport.stableHeight = Math.max(layoutHeight, visualHeight);
  } else if (!state.viewport.stableHeight) {
    state.viewport.stableHeight = Math.max(layoutHeight, visualHeight);
  }

  const stableHeight = Math.max(state.viewport.stableHeight || 0, layoutHeight);
  const keyboardOpen = isMobileViewport() && hasTextFocus && stableHeight - visualHeight > 100;
  state.viewport.keyboardOpen = keyboardOpen;

  const appHeight = isMobileViewport() ? visualHeight : layoutHeight;
  const bottomGap = 0;

  document.body.classList.toggle("keyboard-open", keyboardOpen);
  document.documentElement.style.setProperty("--app-height", `${appHeight}px`);
  document.documentElement.style.setProperty("--viewport-bottom-gap", `${bottomGap}px`);
  document.documentElement.style.setProperty("--viewport-offset-top", `${keyboardOpen ? visualOffsetTop : 0}px`);
  document.documentElement.style.setProperty("--keyboard-open", keyboardOpen ? "1" : "0");
}

function syncMapViewportState() {
  if (!map) return;
  const center = map.getCenter?.();
  const lng = Number(center?.getLng?.() ?? center?.lng);
  const lat = Number(center?.getLat?.() ?? center?.lat);
  state.map.center = Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : state.map.center;
  const zoom = Number(map.getZoom?.());
  state.map.zoom = Number.isFinite(zoom) ? zoom : state.map.zoom;
}

function requestMapResize({ settle = false } = {}) {
  if (!map || typeof map.resize !== "function") return;
  if (!mapRuntime.resizeFrame) {
    mapRuntime.resizeFrame = window.requestAnimationFrame(() => {
      mapRuntime.resizeFrame = 0;
      map?.resize?.();
      syncMapViewportState();
    });
  }
  if (!settle) return;
  window.clearTimeout(mapRuntime.resizeTimer);
  mapRuntime.resizeTimer = window.setTimeout(() => {
    map?.resize?.();
    syncMapViewportState();
  }, 380);
}

function selectMapPlace(record, source = "") {
  const normalized = normalizeFavoriteRecord(record);
  state.map.selectedPlaceId = normalized.id;
  state.map.activeInfoWindow = source;
  syncSelectedPlaceUI();
  return normalized;
}

function selectLinkedPlace(record, options = {}) {
  const normalized = selectMapPlace(record, options.source || "place");
  const point = parseLocation(normalized.location);
  if (map && point.length === 2 && point.every(Number.isFinite) && options.pan !== false) {
    const nextZoom = options.zoom
      ? Number(options.zoom)
      : Math.max(Number(map.getZoom?.() || 14), options.keepZoom ? 0 : 15);
    if (options.keepZoom) map.panTo?.(point);
    else map.setZoomAndCenter(nextZoom, point);
  }
  if (options.openInfo && point.length === 2 && point.every(Number.isFinite)) {
    openPoiInfo(normalized, point);
  }
  if (options.scrollCard) scrollPlaceCardIntoView(normalized.id);
  return normalized;
}

function scrollPlaceCardIntoView(placeId) {
  const id = cleanText(placeId);
  if (!id) return;
  const wasCollapsed = isMobileViewport() && state.chat.isCollapsed;
  mapRuntime.cardSelectionLockUntil = Date.now() + (wasCollapsed ? 1100 : 700);
  if (wasCollapsed) setChatDrawerMode("half");
  window.setTimeout(() => {
    const cards = [...document.querySelectorAll(".place-card.is-clickable[data-poi-id]")];
    const card = cards.find((item) => cleanText(item.dataset.poiId) === id && item.offsetParent !== null);
    card?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, wasCollapsed ? 340 : 40);
}

function syncSelectedPlaceUI() {
  document.querySelectorAll(".place-card.is-clickable[data-poi-id]").forEach((card) => {
    const selected = cleanText(card.dataset.poiId) === state.map.selectedPlaceId;
    card.classList.toggle("is-selected", selected);
    if (selected) card.setAttribute("aria-current", "location");
    else card.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-place-id]").forEach((markerElement) => {
    markerElement.classList.toggle("is-selected", cleanText(markerElement.dataset.placeId) === state.map.selectedPlaceId);
  });
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
    state.app.sessionStorageAvailable = false;
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
    showToast("榜单数据暂时不可用，已继续显示普通地图结果");
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

  mapRuntime.rankingRenderMode = "compact";
  renderRankingViewportMarkers({ compact: true });

  state.map.bounds = [];
  renderMapLegend();
  renderLayerToggles();
  applyLayerVisibility();
  fitMap();
  scheduleRankingViewportRender({ compact: false, delay: 220 });
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

function rankingEntriesForViewport(entries, options = {}) {
  if (!map || !Array.isArray(entries)) return [];
  const compact = typeof options.compact === "boolean"
    ? options.compact
    : mapRuntime.rankingRenderMode === "compact";
  const center = map.getCenter?.();
  const centerPoint = [
    Number(center?.getLng?.() ?? center?.lng),
    Number(center?.getLat?.() ?? center?.lat)
  ];
  const zoom = Number(map.getZoom?.() || 11);
  const radiusByZoom = zoom <= 11 ? 32000 : zoom <= 12 ? 18000 : zoom <= 13 ? 10000 : zoom <= 14 ? 5600 : zoom <= 15 ? 3000 : 1800;
  const limit = isMobileViewport()
    ? (zoom <= 11 ? 42 : zoom <= 13 ? 56 : zoom <= 14 ? 64 : 80)
    : (zoom <= 11 ? 90 : zoom <= 13 ? 140 : 180);
  const ranked = entries
    .filter((entry) => entry?.location && isValidPoint(parseLocation(entry.location)))
    .map((entry) => ({
      entry,
      distanceMeters: centerPoint.every(Number.isFinite)
        ? distanceBetweenPoints(centerPoint, parseLocation(entry.location))
        : Number.POSITIVE_INFINITY,
      priority: entry.rankingCategory === "multi" ? 1 : 0
    }))
    .sort((left, right) => right.priority - left.priority || left.distanceMeters - right.distanceMeters);
  const nearby = ranked.filter((item) => item.distanceMeters <= radiusByZoom);
  if (!compact) return ranked.map((item) => item.entry);
  return (nearby.length ? nearby : ranked).slice(0, limit).map((item) => item.entry);
}

function renderRankingViewportMarkers({ compact = mapRuntime.rankingRenderMode === "compact" } = {}) {
  if (!map || !hasRankingDataForCurrentCity() || !state.rankings.markers.length) return;
  clearRankingOverlays();
  const entries = filterRankingMarkers(state.rankings.markers);
  const visibleEntries = rankingEntriesForViewport(entries, { compact });
  if (compact) {
    visibleEntries.forEach(addRankingMarker);
    applyLayerVisibility();
    syncSelectedPlaceUI();
    return;
  }

  const token = mapRuntime.rankingBatchToken;
  let offset = 0;
  const appendBatch = () => {
    if (token !== mapRuntime.rankingBatchToken) return;
    visibleEntries.slice(offset, offset + 24).forEach(addRankingMarker);
    offset += 24;
    applyLayerVisibility();
    syncSelectedPlaceUI();
    if (offset < visibleEntries.length) {
      window.requestAnimationFrame(appendBatch);
    }
  };
  window.requestAnimationFrame(appendBatch);
}

function scheduleRankingViewportRender({ compact = mapRuntime.rankingRenderMode === "compact", delay = 90 } = {}) {
  if (!map || !hasRankingDataForCurrentCity() || !state.rankings.markers.length) return;
  window.clearTimeout(mapRuntime.rankingRenderTimer);
  mapRuntime.rankingRenderTimer = window.setTimeout(() => {
    mapRuntime.rankingRenderMode = compact ? "compact" : "settled";
    renderRankingViewportMarkers({ compact });
  }, delay);
}

function addRankingMarker(entry) {
  if (!entry?.location || !window.AMap) return;
  const point = parseLocation(entry.location);
  if (!isValidPoint(point)) return;
  const record = favoriteRecordFromRankingEntry(entry);
  const marker = new window.AMap.Marker({
    position: point,
    content: rankingMarkerContent(entry, record.id),
    offset: new window.AMap.Pixel(-16, -34),
    anchor: "bottom-center",
    zIndex: 80
  });
  marker.on("click", () => {
    openRankingInfo(entry, marker.getPosition());
    selectLinkedPlace(record, { source: "ranking-marker", scrollCard: true });
  });
  addMapOverlay("rankings", marker);
  registerPlaceMarker(record, marker, "rankings");
}

function rankingMarkerContent(entry, placeId = "") {
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
    <div class="ranking-marker ranking-${escapeHtml(entry.rankingCategory || "single")}" data-place-id="${escapeHtml(placeId)}">
      <div class="ranking-marker-badges">${badges.join("")}</div>
      <div class="ranking-marker-pin"></div>
    </div>
  `;
}

function openRankingInfo(entry, position) {
  if (!mapRuntime.infoWindows.ranking || !map) return;
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
  mapRuntime.infoWindows.ranking.setContent(`
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
  mapRuntime.infoWindows.ranking.open(map, position);
  selectMapPlace(favRecord, "ranking");
  window.setTimeout(() => {
    const favBtn = document.querySelector(".ranking-fav-btn");
    if (!favBtn) return;
    favBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const record = decodeFavoritePayload(favBtn.dataset.favorite);
      if (!record) return;
      const saved = toggleFavoriteRecord(record);
      pulseFavoriteButton(favBtn);
      mapRuntime.infoWindows.ranking.close();
      showToast(saved ? "已加入收藏" : "已取消收藏");
    }, { once: true });
  }, 50);
}

async function initMap() {
  setMapFallback("正在准备地图服务…", { loading: true, retry: false });
  try {
    const cfg = await apiGet("/api/config");
    if (!cfg.amapJsKey || !cfg.amapSecurityJsCode) {
      setMapFallback("地图配置暂时不可用，请稍后重试。");
      return;
    }

    window._AMapSecurityConfig = { securityJsCode: cfg.amapSecurityJsCode };
    await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.amapJsKey)}`);

    const mapElement = $("#map");
    if (mapElement) mapElement.innerHTML = "";
    map = new window.AMap.Map("map", {
      zoom: 14,
      center: cityCenter(state.filters.city),
      viewMode: "2D",
      mapStyle: "amap://styles/light",
      showLabel: true,
      doubleClickZoom: false
    });

    mapRuntime.infoWindows.ranking = new window.AMap.InfoWindow({
      offset: new window.AMap.Pixel(0, -24),
      closeWhenClickMap: true
    });
    mapRuntime.infoWindows.poi = new window.AMap.InfoWindow({
      offset: new window.AMap.Pixel(0, -24),
      closeWhenClickMap: true
    });

    syncMapViewportState();
    bindManualMapPick();
    await initGeolocation();
    bindViewportRankingDiscovery();
    state.app.mapReady = true;
  } catch (error) {
    state.app.mapReady = false;
    if (!state.app.online) {
      showAppBanner("当前没有网络，地图暂时无法加载。网络恢复后可以重试。", { tone: "warning" });
    }
    setMapFallback(friendlyMapErrorMessage(error));
  }
}

async function retryMapInitialization() {
  hideAppBanner();
  setMapFallback("正在重新加载地图…", { loading: true, retry: false });
  try {
    clearMap();
    map?.destroy?.();
  } catch {
    // A partially created AMap instance may not support destroy safely.
  }
  map = null;
  state.app.mapReady = false;
  await initMap();
  renderFavoriteMarkers();
}

function bindViewportRankingDiscovery() {
  if (!map) return;
  ["dragstart", "movestart", "zoomstart"].forEach((eventName) => map.on(eventName, beginMapInteraction));
  map.on("dragend", () => {
    void handleMapViewportChange().catch((error) => showToast(friendlyErrorMessage(error)));
  });
  map.on("moveend", () => {
    syncMapViewportState();
    endMapInteraction();
  });
  map.on("zoomend", () => {
    syncMapViewportState();
    scheduleRankingViewportRender();
    endMapInteraction();
  });
}

function beginMapInteraction() {
  window.clearTimeout(mapRuntime.mapInteractionTimer);
  if (state.layers.menuOpen) {
    state.layers.menuOpen = false;
    renderLayerToggles();
  }
  if (hasRankingDataForCurrentCity() && state.rankings.markers.length) {
    mapRuntime.rankingRenderMode = "compact";
    renderRankingViewportMarkers({ compact: true });
  }
  document.body.classList.add("map-interacting");
}

function endMapInteraction() {
  window.clearTimeout(mapRuntime.mapInteractionTimer);
  mapRuntime.mapInteractionTimer = window.setTimeout(() => {
    document.body.classList.remove("map-interacting");
    scheduleRankingViewportRender({ compact: false, delay: 0 });
  }, 80);
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
        scheduleRankingViewportRender();
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
    try {
      await commitLocationFromPoint(point, "manual-pick");
      map.setCenter(point);
      await refreshLocalResults();
    } catch (error) {
      showToast(friendlyErrorMessage(error));
      setStatus("失败");
    }
  };

  map.on("click", pickHandler);
  map.on("dblclick", pickHandler);
}

async function initGeolocation() {
  setStatus("定位中");
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
  } catch (error) {
    const fallback = cityCenter(state.filters.city);
    showAppBanner(locationErrorMessage(error), {
      tone: "warning",
      actionLabel: "重新定位",
      action: retryLocation
    });
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

async function retryLocation() {
  hideAppBanner();
  await initGeolocation();
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
  try {
    sessionStorage.setItem("amap.currentLocation", JSON.stringify(state.location));
    state.app.sessionStorageAvailable = true;
  } catch {
    state.app.sessionStorageAvailable = false;
  }
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
  setEvidenceNotice("正在查询真实周边结果…");

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
    if (isAbortError(error)) return;
    const message = friendlyErrorMessage(error);
    renderEvidenceNotice(message);
    showAppBanner(message, {
      tone: "warning",
      actionLabel: "重试周边",
      action: refreshNearby
    });
    setStatus("失败");
  }
}

function renderNearbyMap(payload) {
  clearMap();

  const pois = sortPoisByDistance(Array.isArray(payload.pois) ? payload.pois : []);
  const bounds = [];
  const originCandidate = payload.origin?.location ? parseLocation(payload.origin.location) : state.location.location;
  const origin = isValidPoint(originCandidate) ? originCandidate : null;

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
    if (!cleanText(poi?.name)) return;
    const point = parseLocation(poi.location);
    if (!isValidPoint(point)) return;
    const record = favoriteRecordFromPoi(poi);
    bounds.push(point);
    const marker = new window.AMap.Marker({
      position: point,
      title: poi.name,
      label: {
        content: `<div class="map-label cluster" data-place-id="${escapeHtml(record.id)}">${index + 1}</div>`,
        direction: "top"
      }
    });
    marker.on("click", () => selectLinkedPlace(record, {
      source: "nearby-marker",
      openInfo: true,
      keepZoom: true,
      scrollCard: true
    }));
    addMapOverlay("pois", marker);
    registerPlaceMarker(record, marker, "pois");
  });

  state.map.bounds = bounds;
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
  if (state.chat.isAsking) return;
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
    if (state.chat.isAsking) return;
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
  if (!hasMessages) {
    state.chat.isCollapsed = false;
    state.chat.isFullscreen = false;
  }
  document.body.classList.toggle("has-messages", hasMessages);
  els.heroAskCard?.setAttribute("aria-hidden", hasMessages ? "true" : "false");
  els.followupInputBar?.setAttribute("aria-hidden", hasMessages ? "false" : "true");
  applyActiveView();
  syncVoiceModeUI();
  syncChatCollapseUI();
}

function favoriteIdFromRecord(record) {
  const suppliedId = cleanText(record?.id || record?.poiId);
  if (suppliedId) return suppliedId;
  return `poi-${cleanText(record?.name)}-${cleanText(record?.address)}`.toLowerCase();
}

function normalizeFavoriteRecord(record) {
  const rankingLabels = Array.isArray(record?.rankingLabels) ? record.rankingLabels.filter(Boolean).map(String) : [];
  const suppliedPoint = [Number(record?.lng ?? record?.longitude), Number(record?.lat ?? record?.latitude)];
  const cachedPoint = parseLocation(record?.location);
  const point = suppliedPoint.every(Number.isFinite) ? suppliedPoint : cachedPoint;
  const location = point.length === 2 && point.every(Number.isFinite)
    ? pointToString(point)
    : cleanText(record?.location);
  const note = cleanText(record?.note || record?.userNote);
  const tags = Array.isArray(record?.tags) ? record.tags.filter(Boolean).map((tag) => cleanText(tag)).filter(Boolean) : [];
  const now = new Date().toISOString();
  const createdAt = cleanText(record?.createdAt || record?.savedAt) || now;
  const updatedAt = cleanText(record?.updatedAt || record?.savedAt) || createdAt;
  return {
    id: cleanText(record?.id) || favoriteIdFromRecord(record),
    name: cleanText(record?.name) || "地点",
    address: cleanText(record?.address),
    location,
    lng: point.length === 2 && Number.isFinite(point[0]) ? point[0] : null,
    lat: point.length === 2 && Number.isFinite(point[1]) ? point[1] : null,
    tags,
    note,
    source: cleanText(record?.source || record?.savedSource) || "收藏",
    createdAt,
    updatedAt,
    type: cleanText(record?.type) || cleanText(record?.category),
    distance: cleanText(record?.distance),
    rankingLabels,
    // Retain the legacy field names so existing UI and local records keep working.
    userNote: note,
    savedSource: cleanText(record?.savedSource || record?.source) || "收藏",
    savedAt: createdAt
  };
}

function favoriteRecordFromPoi(poi) {
  const address = cleanText([poi?.district, poi?.address].filter(Boolean).join(" "));
  const location = Array.isArray(poi?.location) ? pointToString(poi.location) : cleanText(poi?.location);
  const record = normalizeFavoriteRecord({
    id: cleanText(poi?.id || poi?.poiId) || favoriteIdFromRecord({ name: poi?.name, address }),
    name: poi?.name,
    address,
    location,
    type: poi?.type || state.filters.category,
    distance: poi?.distance,
    rankingLabels: Array.isArray(poi?.rankingLabels) ? poi.rankingLabels : [],
    source: "对话收藏",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return record;
}

function favoriteRecordFromRankingEntry(entry) {
  return normalizeFavoriteRecord({
    id: cleanText(entry?.id) || favoriteIdFromRecord({ name: entry?.name, address: entry?.address }),
    name: entry?.name,
    address: [entry?.district, entry?.area, entry?.address].filter(Boolean).join(" "),
    location: entry?.location,
    type: entry?.cuisine || "餐饮",
    rankingLabels: Array.isArray(entry?.labels) ? entry.labels : [],
    source: "榜单地点"
  });
}

function isFavoriteId(id) {
  return state.favorites.some((favorite) => favorite.id === id);
}

function dispatchFavoritesChanged() {
  const persisted = saveFavorites();
  window.dispatchEvent(new CustomEvent("favorites-changed", { detail: { favorites: state.favorites } }));
  return persisted;
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
  const normalized = normalizeFavoriteRecord({ ...record, note });
  const index = state.favorites.findIndex((favorite) => favorite.id === normalized.id);
  const existing = index >= 0 ? state.favorites[index] : null;
  const merged = normalizeFavoriteRecord({
    ...existing,
    ...normalized,
    tags: normalized.tags,
    createdAt: existing?.createdAt || existing?.savedAt || normalized.createdAt,
    updatedAt: new Date().toISOString()
  });
  if (index >= 0) {
    state.favorites.splice(index, 1);
  }
  state.favorites.unshift(merged);
  dispatchFavoritesChanged();
  return merged;
}

function favoriteMetaLine(record) {
  const distance = cleanText(record.distance) ? formatDistance(record.distance) : "";
  return [cleanText(record.address), distance, cleanText(record.type)].filter(Boolean).join(" · ");
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
  const note = cleanText(record?.note || record?.userNote);
  if (!note) return "";
  return `<div class="favorite-note">${escapeHtml(note)}</div>`;
}

function favoriteTagsMarkup(record) {
  const tags = [...new Set([...(record?.tags || []), ...(record?.rankingLabels || [])].map(cleanText).filter(Boolean))];
  if (!tags.length) return "";
  return `<div class="favorite-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function favoriteEditButtonMarkup(record) {
  const payload = escapeHtml(encodeURIComponent(JSON.stringify(normalizeFavoriteRecord(record))));
  return `
    <button class="favorite-edit-btn" type="button" aria-label="编辑收藏信息" title="编辑收藏信息" data-favorite="${payload}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.5 6.5 17.5 10.5M5 19l3.6-.7L18.4 8.5a2.1 2.1 0 0 0-3-3L5.7 15.2Z" />
      </svg>
    </button>
  `;
}

function favoriteTagList() {
  return [...new Set(state.favorites.flatMap((favorite) => favorite.tags || []).map(cleanText).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function renderFavoriteTagFilter() {
  if (!els.favoritesTagFilter) return;
  const tags = favoriteTagList();
  if (state.favoriteTagFilter && !tags.includes(state.favoriteTagFilter)) state.favoriteTagFilter = "";
  els.favoritesTagFilter.hidden = !tags.length;
  els.favoritesTagFilter.innerHTML = tags.length
    ? ["", ...tags].map((tag) => `
        <button type="button" class="favorite-tag-filter-btn${state.favoriteTagFilter === tag ? " is-active" : ""}" data-tag="${escapeHtml(tag)}">
          ${escapeHtml(tag || "全部")}
        </button>
      `).join("")
    : "";
}

function handleFavoriteTagFilterClick(event) {
  const button = event.target instanceof Element ? event.target.closest("button[data-tag]") : null;
  if (!button) return;
  state.favoriteTagFilter = cleanText(button.dataset.tag);
  renderFavoritesPanel();
}

function renderFavoritesPanel() {
  if (!els.favoritesList) return;
  renderFavoriteTagFilter();
  const allFavorites = [...state.favorites].sort((left, right) => {
    const noteDelta = Number(Boolean(cleanText(right.note || right.userNote))) - Number(Boolean(cleanText(left.note || left.userNote)));
    if (noteDelta) return noteDelta;
    return String(right.updatedAt || right.savedAt || "").localeCompare(String(left.updatedAt || left.savedAt || ""));
  });
  const orderedFavorites = state.favoriteTagFilter
    ? allFavorites.filter((favorite) => (favorite.tags || []).includes(state.favoriteTagFilter))
    : allFavorites;
  const count = allFavorites.length;
  if (els.favoritesCount) {
    els.favoritesCount.textContent = state.favoriteTagFilter
      ? `${orderedFavorites.length} / ${count} 个地点`
      : `${count} 个地点`;
  }

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

  if (!orderedFavorites.length) {
    els.favoritesList.innerHTML = `
      <div class="fav-empty">
        <div>
          <strong>这个标签下还没有地点</strong>
          <p>编辑收藏信息后可添加或调整私人标签</p>
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
            <article class="place-card place-card--favorite is-clickable" role="button" tabindex="0" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}" data-place-id="${escapeHtml(favorite.id)}" data-place-record="${escapeHtml(encodeURIComponent(JSON.stringify(favorite)))}">
              <div class="place-photo place-photo-rank">${index + 1}</div>
              <div class="place-card-main">
                <strong>${escapeHtml(favorite.name)}</strong>
                <span class="place-inline-meta">${escapeHtml(favoriteMetaLine(favorite))}</span>
                ${favoriteNoteMarkup(favorite)}
                ${favoriteTagsMarkup(favorite)}
              </div>
              ${favoriteEditButtonMarkup(favorite)}
              ${favoriteButtonMarkup(favorite)}
            </article>
          `
        )
        .join("")}
    </div>
  `;
  syncSelectedPlaceUI();
}

function renderSearchPanel() {
  if (!els.searchPanelResults) return;
  const query = cleanText(state.search.query);
  const results = Array.isArray(state.search.results) ? state.search.results : [];
  const scope = describeSearchPanelScope(query);
  if (els.searchPanelInput && els.searchPanelInput.value !== state.search.query) {
    els.searchPanelInput.value = state.search.query;
  }

  if (els.searchResultCount) {
    if (state.search.loading) els.searchResultCount.textContent = `正在调用高德搜索 · ${scope}`;
    else if (!query) els.searchResultCount.textContent = "输入关键词开始搜索";
    else els.searchResultCount.textContent = `${scope} · 高德返回 ${results.length} 个结果`;
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
          <p>默认全国范围搜索；例如：上海环贸停车场、静安寺、便宜停车场</p>
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
  syncSelectedPlaceUI();
}

function searchResultCard(poi) {
  const favorite = favoriteRecordFromPoi(poi);
  mapRuntime.placeRecords.set(favorite.id, favorite);
  const labels = [poi?.type, poi?.distance ? formatDistance(poi.distance) : ""].filter(Boolean).slice(0, 2);
  return `
    <article class="place-card search-result-card is-clickable" role="button" tabindex="0" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}" data-place-id="${escapeHtml(favorite.id)}" data-place-record="${escapeHtml(encodeURIComponent(JSON.stringify(favorite)))}">
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
  const searchIntent = resolveSearchPanelIntent(query);
  const requestId = state.search.lastRequestId + 1;
  state.search.lastRequestId = requestId;
  state.search.requestController?.abort();
  const requestController = new AbortController();
  state.search.requestController = requestController;
  state.search.query = query;
  state.search.results = [];
  state.search.loading = true;
  renderSearchPanel();
  try {
    const payload = await apiGet(
      `/api/search?keywords=${encodeURIComponent(searchIntent.keywords)}&city=${encodeURIComponent(searchIntent.city)}`,
      { signal: requestController.signal }
    );
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
    if (isAbortError(error)) {
      state.search.loading = false;
      renderSearchPanel();
      return;
    }
    state.search.loading = false;
    state.search.results = [];
    renderSearchPanel();
    const message = friendlyErrorMessage(error);
    showToast(message);
    showAppBanner(message, {
      tone: "warning",
      actionLabel: "重试搜索",
      action: () => runSearchPanelQuery(query, options)
    });
  } finally {
    if (state.search.requestController === requestController) state.search.requestController = null;
  }
}

function resolveSearchPanelIntent(rawQuery) {
  const query = cleanText(rawQuery);
  if (!query) return { city: "", keywords: "", scopeLabel: "全国搜索" };

  const matchedCity = searchIntentCities.find((cityName) => query.includes(cityName)) || "";
  const normalizedCity = matchedCity ? normalizeCityName(matchedCity.replace(/市$/, "")) : "";
  const strippedKeywords = matchedCity
    ? cleanText(query.replace(matchedCity, " ").replace(/\s+/g, " "))
    : query;

  return {
    city: normalizedCity,
    keywords: strippedKeywords || query,
    scopeLabel: normalizedCity ? `${normalizedCity} 内搜索` : "全国搜索"
  };
}

function describeSearchPanelScope(rawQuery) {
  return resolveSearchPanelIntent(rawQuery).scopeLabel;
}

function renderLayerToggles() {
  const mapWrap = document.querySelector(".map-wrap");
  if (!mapWrap) return;
  mapWrap.querySelector(".layer-toggles")?.remove();

  const container = document.createElement("div");
  container.className = `layer-toggles${state.layers.menuOpen ? " is-open" : ""}`;
  container.innerHTML = `
    <button class="layer-menu-toggle" type="button" aria-expanded="${state.layers.menuOpen}" aria-label="地图图层" title="地图图层">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3-8 4.5 8 4.5 8-4.5Z" />
        <path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" />
      </svg>
    </button>
    <div class="layer-menu" aria-label="地图图层开关" aria-hidden="${!state.layers.menuOpen}">
      <button class="layer-toggle ${state.layers.walkRadius ? "" : "is-hidden"}" type="button" data-layer="walkRadius" tabindex="${state.layers.menuOpen ? "0" : "-1"}">
        ${state.layers.walkRadius ? "◎" : "○"} 步行范围
      </button>
      <button class="layer-toggle ${state.layers.pois ? "" : "is-hidden"}" type="button" data-layer="pois" tabindex="${state.layers.menuOpen ? "0" : "-1"}">
        ${state.layers.pois ? "◎" : "○"} 美食/店铺
      </button>
      <button class="layer-toggle ${state.layers.rankings ? "" : "is-hidden"}" type="button" data-layer="rankings" tabindex="${state.layers.menuOpen ? "0" : "-1"}">
        ${state.layers.rankings ? "◎" : "○"} 全部榜单
      </button>
    </div>
  `;

  container.querySelector(".layer-menu-toggle")?.addEventListener("click", () => {
    state.layers.menuOpen = !state.layers.menuOpen;
    renderLayerToggles();
  });
  container.querySelectorAll("button").forEach((button) => {
    if (button.dataset.layer) button.addEventListener("click", () => toggleLayer(button.dataset.layer));
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
    mapRuntime.overlays.walkRadius.push(overlay);
  } else if (layerKey === "pois") {
    mapRuntime.overlays.pois.push(overlay);
  } else if (layerKey === "rankings") {
    mapRuntime.overlays.rankings.push(overlay);
  } else {
    mapRuntime.overlays.base.push(overlay);
  }
  overlay.setMap(isLayerVisible(layerKey) ? map : null);
}

function registerPlaceMarker(record, marker, layer = "pois") {
  const normalized = normalizeFavoriteRecord(record);
  if (!normalized.id || !marker) return;
  mapRuntime.placeMarkers.set(normalized.id, { marker, layer });
  mapRuntime.placeRecords.set(normalized.id, normalized);
}

function unregisterPlaceMarkers(layer = "") {
  for (const [id, entry] of mapRuntime.placeMarkers.entries()) {
    if (layer && entry.layer !== layer) continue;
    mapRuntime.placeMarkers.delete(id);
    if (!state.favorites.some((favorite) => favorite.id === id)) mapRuntime.placeRecords.delete(id);
  }
}

function visibleMapOverlays() {
  return [
    ...mapRuntime.overlays.base,
    ...(state.layers.walkRadius ? mapRuntime.overlays.walkRadius : []),
    ...(state.layers.pois ? mapRuntime.overlays.pois : []),
    ...(state.layers.rankings ? mapRuntime.overlays.rankings : [])
  ].filter(Boolean);
}

function applyLayerVisibility() {
  if (!map) return;
  mapRuntime.overlays.walkRadius.forEach((overlay) => overlay.setMap(state.layers.walkRadius ? map : null));
  mapRuntime.overlays.pois.forEach((overlay) => overlay.setMap(state.layers.pois ? map : null));
  mapRuntime.overlays.rankings.forEach((overlay) => overlay.setMap(state.layers.rankings ? map : null));
}

function decodeFavoritePayload(raw) {
  if (!raw) return null;
  try {
    return normalizeFavoriteRecord(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

function decodePlaceRecord(raw) {
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

function openFavoriteNoteSheet(record) {
  state.favoriteDraft = normalizeFavoriteRecord(record);
  if (els.favoriteNotePlace) {
    els.favoriteNotePlace.textContent = [state.favoriteDraft.name, state.favoriteDraft.address].filter(Boolean).join(" · ");
  }
  if (els.favoriteNoteInput) {
    els.favoriteNoteInput.value = state.favoriteDraft.userNote || "";
  }
  if (els.favoriteTagsInput) {
    els.favoriteTagsInput.value = (state.favoriteDraft.tags || []).join("，");
  }
  if (els.favoriteNoteSheet) {
    els.favoriteNoteSheet.hidden = false;
    els.favoriteNoteSheet.setAttribute("aria-hidden", "false");
  }
  syncFavoriteTagPresetState();
  requestAnimationFrame(() => els.favoriteNoteInput?.focus());
}

function closeFavoriteNoteSheet() {
  state.favoriteDraft = null;
  if (els.favoriteNoteSheet) {
    els.favoriteNoteSheet.hidden = true;
    els.favoriteNoteSheet.setAttribute("aria-hidden", "true");
  }
  if (els.favoriteNoteInput) {
    els.favoriteNoteInput.value = "";
  }
  if (els.favoriteTagsInput) els.favoriteTagsInput.value = "";
  syncFavoriteTagPresetState();
}

function parseFavoriteTags(value) {
  return [...new Set(String(value || "").split(/[，,、]/).map(cleanText).filter(Boolean))].slice(0, 8);
}

function handleFavoriteTagPresetClick(event) {
  const button = event.target instanceof Element ? event.target.closest("button[data-tag]") : null;
  if (!button || !els.favoriteTagsInput) return;
  const tag = cleanText(button.dataset.tag);
  const tags = parseFavoriteTags(els.favoriteTagsInput.value);
  const nextTags = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
  els.favoriteTagsInput.value = nextTags.join("，");
  syncFavoriteTagPresetState();
}

function syncFavoriteTagPresetState() {
  const selected = new Set(parseFavoriteTags(els.favoriteTagsInput?.value));
  els.favoriteTagPresets?.querySelectorAll("button[data-tag]").forEach((button) => {
    button.classList.toggle("is-active", selected.has(cleanText(button.dataset.tag)));
    button.setAttribute("aria-pressed", String(selected.has(cleanText(button.dataset.tag))));
  });
}

function commitFavoriteDraft(withNote) {
  if (!state.favoriteDraft) {
    closeFavoriteNoteSheet();
    return;
  }
  const note = withNote ? cleanText(els.favoriteNoteInput?.value) : "";
  const tags = withNote ? parseFavoriteTags(els.favoriteTagsInput?.value) : state.favoriteDraft.tags || [];
  saveFavoriteRecord({
    ...state.favoriteDraft,
    tags,
    savedSource: state.activeView === "search" ? "搜索收藏" : "对话收藏"
  }, note);
  closeFavoriteNoteSheet();
  syncFavoriteButtons();
  showToast(state.app.storageAvailable
    ? (note ? "已收藏并写入私人备注" : "已加入收藏")
    : "已暂存收藏，但刷新后可能丢失");
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

  const editButton = event.target instanceof Element ? event.target.closest(".favorite-edit-btn") : null;
  if (editButton) {
    event.preventDefault();
    event.stopPropagation();
    const record = decodeFavoritePayload(editButton.dataset.favorite);
    if (record) openFavoriteNoteSheet(record);
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
  const record = decodePlaceRecord(card.dataset.placeRecord) || mapRuntime.placeRecords.get(cleanText(card.dataset.poiId)) || normalizeFavoriteRecord({
      id: card.dataset.poiId,
      location: card.dataset.location,
      name: card.querySelector("strong")?.textContent || "地点",
      address: card.querySelector(".place-inline-meta")?.textContent || ""
    });
  if (state.activeView === "favorites" || state.activeView === "search") {
    setActiveView("chat");
    requestMapResize({ settle: true });
  }
  requestAnimationFrame(() => selectLinkedPlace(record, {
    source: "place-card",
    openInfo: true,
    zoom: 15
  }));
}

function scheduleVisiblePlaceSelection() {
  if (mapRuntime.cardSelectionFrame || state.activeView !== "chat" || Date.now() < mapRuntime.cardSelectionLockUntil) return;
  mapRuntime.cardSelectionFrame = window.requestAnimationFrame(() => {
    mapRuntime.cardSelectionFrame = 0;
    const conversationRect = els.conversation?.getBoundingClientRect();
    if (!conversationRect) return;
    const centerY = conversationRect.top + conversationRect.height / 2;
    const visibleCards = [...els.conversation.querySelectorAll(".place-card.is-clickable[data-poi-id]")]
      .map((card) => ({ card, rect: card.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom > conversationRect.top + 24 && rect.top < conversationRect.bottom - 24)
      .sort((left, right) => Math.abs((left.rect.top + left.rect.bottom) / 2 - centerY) - Math.abs((right.rect.top + right.rect.bottom) / 2 - centerY));
    const id = cleanText(visibleCards[0]?.card?.dataset?.poiId);
    const record = mapRuntime.placeRecords.get(id);
    if (record && id !== state.map.selectedPlaceId) selectMapPlace(record, "card-scroll");
  });
}

function handlePlaceCardKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.target instanceof Element && event.target.closest("button, input, textarea, select")) return;
  const card = event.target instanceof Element ? event.target.closest(".place-card.is-clickable") : null;
  if (!card) return;
  event.preventDefault();
  card.click();
}

async function handleSuggestedQuestion(question) {
  if (!question || state.chat.isAsking) return;
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
    setStatus(state.chat.isAsking ? "查询中" : "在线");
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
    setStatus(state.chat.isAsking ? "查询中" : "在线");
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
  state.chat.history = [];
  state.chat.summary = "";
  if (els.conversation) els.conversation.innerHTML = "";
  state.map.bounds = [];
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
  state.map.bounds = [];
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
  if (/没有找到|暂无|没有可展示|未找到/.test(raw)) return raw;
  return "这次查询没有稳定完成，请稍后重试或换个更具体的问法。";
}

function friendlyMapErrorMessage(error) {
  const raw = String(error?.message || error || "");
  if (/配置|AMAP|key|安全|权限/i.test(raw)) return "地图配置暂时不可用，请稍后重试。";
  if (/超时|网络|fetch failed|加载/i.test(raw)) return "地图服务响应有点慢，请检查网络后重试。";
  return "地图暂时没有加载成功，请稍后重试。";
}

function locationErrorMessage(error) {
  const raw = String(error?.message || error || "");
  if (/denied|not.?allowed|permission|权限|拒绝|PERMISSION/i.test(raw)) {
    return "没有拿到定位权限，当前先使用城市中心位置。允许定位后可获取真实周边结果。";
  }
  if (/超时|timeout/i.test(raw)) return "定位响应超时，当前先使用城市中心位置。";
  return "暂时无法获取真实定位，当前先使用城市中心位置。";
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  if (state.chat.isAsking) return;
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  syncDraftState();
  await askAgent(question);
}

async function handleQuestionKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  if (state.chat.isAsking) return;
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  syncDraftState();
  await askAgent(question);
}

async function handleInlineSend() {
  if (state.chat.isAsking) return;
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
  if (state.chat.isAsking) return;
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

async function askAgent(question, { retry = false } = {}) {
  if (state.chat.isAsking) return;
  const requestController = new AbortController();
  state.chat.requestController = requestController;
  setAskingState(true);
  clearResultSurface("正在获取新的地点证据...");
  if (!retry) {
    state.chat.history.push({ role: "user", content: question });
    appendMessage("user", question);
  }
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
        history: state.chat.history.slice(-40),
        context: buildContextPayload()
      },
      thinking,
      { signal: requestController.signal }
    );

    appendAnswer(payload);
    renderAgentMap(payload);
    renderAgentEvidence(payload);
    applyServerContext(payload.context);
    state.chat.history.push({
      role: "assistant",
      content: [payload.analysis, payload.answer].filter(Boolean).join("\n")
    });
    state.chat.summary = buildHistorySummary();
    renderContext();
    setStatus("完成");
    requestAnimationFrame(() => els.inlineInput?.focus());
  } catch (error) {
    thinking.remove();
    updateChatMode();
    if (!isAbortError(error) || state.app.online) {
      const message = friendlyErrorMessage(error);
      appendMessage("assistant", message, {
        title: "查询失败",
        icon: "green"
      });
      if (state.app.online) {
        showAppBanner(message, {
          tone: "warning",
          actionLabel: "重试查询",
          action: () => askAgent(question, { retry: true })
        });
      }
      setStatus("失败");
    } else {
      setStatus("离线");
    }
  } finally {
    setAskingState(false);
    if (state.chat.requestController === requestController) state.chat.requestController = null;
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
  const answerText = cleanText(payload?.answer) || cleanText(payload?.source) || "这次没有拿到足够稳定的地点结果，请换个更具体的问法再试一次。";

  const message = appendMessage("assistant", answerText, {
    title: intentLabel(payload?.intent || "search"),
    icon: "green",
    chips: [payload?.source || "高德 API"].filter(Boolean)
  });

  const cards = buildAnswerCards(payload);
  if (cards) message.querySelector(".message-body")?.insertAdjacentHTML("beforeend", cards);
  const followupChips = buildFollowupChipStrip(payload);
  if (followupChips) message.querySelector(".message-body")?.insertAdjacentHTML("beforeend", followupChips);
  syncSelectedPlaceUI();
  hidePendingThinkingMessage();
  scrollConversationToBottom();
}

function buildAnswerCards(payload) {
  const pois = (payload?.data?.pois || []).filter(validPoiForDisplay);
  if (Array.isArray(pois) && pois.length) {
    const limit = isMobileViewport() ? 6 : 8;
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
  mapRuntime.placeRecords.set(favorite.id, favorite);
  const recordPayload = escapeHtml(encodeURIComponent(JSON.stringify(favorite)));
  return `
    <article class="place-card is-clickable" role="button" tabindex="0" data-location="${escapeHtml(favorite.location)}" data-poi-id="${escapeHtml(favorite.id)}" data-place-id="${escapeHtml(favorite.id)}" data-place-record="${recordPayload}">
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

async function streamAgentReply(path, body, thinkingElement, { signal: externalSignal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  let abortedByCaller = Boolean(externalSignal?.aborted);
  const forwardAbort = () => {
    abortedByCaller = true;
    controller.abort();
  };
  if (externalSignal) {
    if (externalSignal.aborted) forwardAbort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 60000);
  let streamRenderFrame = 0;

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
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
    let shouldStickToBottom = false;

    const renderStreamedText = () => {
      streamRenderFrame = 0;
      const target = thinkingElement?.querySelector(".message-text");
      if (target) target.textContent = streamedText;
      if (shouldStickToBottom) scrollConversationToBottom(true);
    };

    const applyDelta = (text) => {
      if (!text) return;
      shouldStickToBottom = isConversationNearBottom();
      streamedText += text;
      if (!streamRenderFrame) streamRenderFrame = window.requestAnimationFrame(renderStreamedText);
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
    if (streamRenderFrame) {
      window.cancelAnimationFrame(streamRenderFrame);
      renderStreamedText();
    }
    const deepseekText = (streamedText || finalPayload.analysis || "").trim();
    if (deepseekText) {
      finalPayload.analysis = deepseekText;
      const target = thinkingElement?.querySelector(".message-text");
      if (target) target.textContent = deepseekText;
    }
    // Keep the streamed placeholder marked as pending until appendAnswer replaces it.
    updateChatMode();
    return finalPayload;
  } catch (error) {
    if (error?.name === "AbortError") {
      if (abortedByCaller) throw new Error("查询已取消");
      if (timedOut) throw new Error("AI 查询超时，请稍后重试");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    if (streamRenderFrame) window.cancelAnimationFrame(streamRenderFrame);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
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
    summary: state.chat.summary
  };
}

function buildHistorySummary() {
  return state.chat.history.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n").slice(-4000);
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
  const mapMarkers = Array.isArray(payload.map.markers) ? payload.map.markers : [];
  mapMarkers.forEach((item) => {
    if (!cleanText(item?.title || item?.name)) return;
    const point = parseLocation(item.location);
    if (!isValidPoint(point)) return;
    const record = favoriteRecordFromPoi({
      ...item,
      name: item.title,
      id: item.id,
      location: item.location
    });
    bounds.push(point);
    const marker = new window.AMap.Marker({
      position: point,
      title: item.title,
      label: {
        content: `<div class="map-label ${markerClass(item.rankingCategory, item.role)}"${item.role === "origin" || item.role === "destination" ? "" : ` data-place-id="${escapeHtml(record.id)}"`}>${escapeHtml(item.label || "")}</div>`,
        direction: "top"
      }
    });
    if (item.role === "origin" || item.role === "destination") {
      addMapOverlay("base", marker);
    } else {
      marker.on("click", () => selectLinkedPlace(record, {
        source: "agent-marker",
        openInfo: true,
        keepZoom: true,
        scrollCard: true
      }));
      addMapOverlay("pois", marker);
      registerPlaceMarker(record, marker, "pois");
    }
  });

  const mapCenter = payload.map.center ? parseLocation(payload.map.center) : null;
  if (payload.map.radius && isValidPoint(mapCenter)) {
    const circle = new window.AMap.Circle({
      center: mapCenter,
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
    if (routePath.length < 2 || routePath.some((point) => !isValidPoint(point))) {
      setEvidenceNotice("路线数据不完整，暂时无法在地图上绘制路径。");
    } else {
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
  }

  if (!mapMarkers.length && !payload.map.route && els.mapTitle) {
    els.mapTitle.textContent = "暂无可定位的地点";
  }

  state.map.bounds = bounds;
  fitMap();
  renderFavoriteMarkers();
  renderMapLegend();
  renderLayerToggles();
  applyLayerVisibility();
}

function renderAgentEvidence(payload) {
  if (!els.evidence) return;
  const pois = sortPoisByDistance(Array.isArray(payload.data?.allPois) && payload.data.allPois.length ? payload.data.allPois : payload.data?.pois || []);

  if (payload.intent === "nearby" || payload.intent === "search" || payload.intent === "travel") {
    if (!pois.length) {
      setEvidenceNotice(payload.answer || "当前没有找到可展示的真实地点，可以换个区域或更具体的关键词。");
      return;
    }
    setEvidenceRows(pois.map((poi, index) =>
      evidenceRow(
        index + 1,
        poi.name,
        [poi.district, poi.address].filter(Boolean).join(" "),
        formatDistance(poi.distance),
        formatRating(poi.rating),
        "高德"
      )
    ), 6);
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
  return [...(pois || [])]
    .filter(validPoiForDisplay)
    .sort((left, right) => numericDistance(left.distance) - numericDistance(right.distance));
}

function validPoiForDisplay(poi) {
  return Boolean(cleanText(poi?.name) && isValidPoint(parseLocation(poi?.location)));
}

function numericDistance(distance) {
  const value = Number(distance);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function formatDistance(distance) {
  if (!cleanText(distance)) return "-";
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
    setEvidenceDrawerExpanded(true);
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
  requestMapResize({ settle: true });
}

function syncEvidenceDrawerState() {
  if (!els.evidenceDrawer || !els.evidenceDrawerToggle) return;
  const mobile = isMobileViewport();
  const expanded = mobile ? state.mobileDrawerExpanded : true;
  document.body.classList.toggle("drawer-expanded", mobile && expanded);
  document.body.classList.toggle("drawer-collapsed", mobile && !expanded);
  state.map.evidenceDrawerExpanded = mobile && expanded;
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
        if (state.chat.isAsking) return;
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
  state.chat.isAsking = isAsking;
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
  sendButton?.classList.toggle("is-ready", hasMainDraft && !state.chat.isAsking);
  els.inlineSend?.classList.toggle("is-ready", hasInlineDraft && !state.chat.isAsking);
}

function startVoiceRecognition(targetKey) {
  const input = inputElementByKey(targetKey);
  if (!input || !state.voice.recognition) return;

  state.voice.targetKey = targetKey;
  state.voice.baseText = input.value || "";
  const shouldAvoidMobileFocus = isMobileViewport() && (targetKey === "questionInput" || targetKey === "inlineQuestion");
  if (!(shouldAvoidMobileFocus || (isMobileViewport() && state.isVoiceMode && targetKey === "inlineQuestion"))) {
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
    button.disabled = state.chat.isAsking;
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
  if (!isMobileViewport() || !hasMessages || Date.now() - chatDrawerGestureAt < 400) return;
  if (state.chat.isFullscreen && typeof forceValue !== "boolean") {
    setChatDrawerMode("half");
    return;
  }
  setChatDrawerMode(
    typeof forceValue === "boolean"
      ? (forceValue ? "collapsed" : "half")
      : (state.chat.isCollapsed ? "half" : "collapsed")
  );
}

function toggleChatFullscreen() {
  const hasMessages = Boolean(els.conversation?.children.length);
  if (!isMobileViewport() || !hasMessages || Date.now() - chatDrawerGestureAt < 400) return;
  setChatDrawerMode(state.chat.isFullscreen ? "half" : "fullscreen");
}

function setChatDrawerMode(mode) {
  const nextMode = ["collapsed", "half", "fullscreen"].includes(mode) ? mode : "half";
  state.chat.isCollapsed = nextMode === "collapsed";
  state.chat.isFullscreen = nextMode === "fullscreen";
  syncChatCollapseUI();
}

function syncChatCollapseUI() {
  const mobile = isMobileViewport();
  const hasMessages = Boolean(els.conversation?.children.length);
  if (!mobile || !hasMessages) {
    state.chat.isCollapsed = false;
    state.chat.isFullscreen = false;
  }
  const collapsed = mobile && hasMessages && state.chat.isCollapsed;
  const fullscreen = mobile && hasMessages && state.chat.isFullscreen && !collapsed;
  const drawerMode = collapsed ? "collapsed" : fullscreen ? "fullscreen" : "half";
  if (collapsed && state.layers.menuOpen) {
    state.layers.menuOpen = false;
    renderLayerToggles();
  }
  document.body.classList.toggle("chat-collapsed", collapsed);
  document.body.classList.toggle("chat-fullscreen", fullscreen);
  els.chatPanel?.classList.toggle("is-collapsed", collapsed);
  els.chatPanel?.classList.toggle("is-fullscreen", fullscreen);
  if (state.map.chatDrawerCollapsed !== collapsed) {
    state.map.chatDrawerCollapsed = collapsed;
    requestMapResize({ settle: true });
  }
  if (state.map.chatDrawerMode !== drawerMode) {
    state.map.chatDrawerMode = drawerMode;
    requestMapResize({ settle: true });
  }
  if (els.chatPanelToggle) {
    els.chatPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    els.chatPanelToggle.setAttribute(
      "aria-label",
      collapsed ? "展开聊天面板" : fullscreen ? "返回半屏并查看地图" : "收起聊天面板"
    );
  }
  if (els.chatPanelFullscreenToggle) {
    els.chatPanelFullscreenToggle.hidden = collapsed;
    els.chatPanelFullscreenToggle.setAttribute("aria-pressed", String(fullscreen));
    els.chatPanelFullscreenToggle.setAttribute("aria-label", fullscreen ? "恢复半屏聊天" : "全屏查看聊天");
    els.chatPanelFullscreenToggle.setAttribute("title", fullscreen ? "恢复半屏聊天" : "全屏查看聊天");
  }
  if (els.chatPanelHint) {
    els.chatPanelHint.textContent = collapsed
      ? "点击展开聊天记录"
      : fullscreen
        ? "下拉或点击左侧返回半屏"
        : "上滑或点击右侧全屏查看";
  }
}

function bindChatDrawerGestures() {
  if (!els.chatPanelDragHandle) return;
  let startY = 0;
  let tracking = false;

  els.chatPanelDragHandle.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches?.[0];
      if (!touch || !isMobileViewport() || !els.conversation?.children.length) return;
      tracking = true;
      startY = touch.clientY;
    },
    { passive: true }
  );

  els.chatPanelDragHandle.addEventListener(
    "touchend",
    (event) => {
      if (!tracking || !isMobileViewport()) return;
      tracking = false;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const deltaY = touch.clientY - startY;
      if (deltaY <= -36) {
        chatDrawerGestureAt = Date.now();
        setChatDrawerMode("fullscreen");
      } else if (deltaY >= 36 && state.chat.isFullscreen) {
        chatDrawerGestureAt = Date.now();
        setChatDrawerMode("half");
      }
    },
    { passive: true }
  );

  els.chatPanelDragHandle.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });
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
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
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
  if (!els.heroAskCard) return;
  try {
    if (localStorage.getItem(GUIDE_STORAGE_KEY)) return;
  } catch {
    return;
  }
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
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, "1");
    } catch {
      // The guide can still be dismissed for this session if storage is blocked.
    }
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
  if (!mapRuntime.infoWindows.poi || !map) return;
  const record = favoriteRecordFromPoi({ ...poi, location: pointToString(point) });
  const isFaved = isFavoriteId(record.id);
  mapRuntime.infoWindows.poi.setContent(`
    <div class="poi-info-window">
      <strong>${escapeHtml(poi?.name || "地点")}</strong>
      <p>${escapeHtml([poi?.district, poi?.area, poi?.address].filter(Boolean).join(" · "))}</p>
      <p>${poi?.distance ? `距离约 ${escapeHtml(formatDistance(poi.distance))}` : ""}</p>
      <button class="poi-info-fav-btn${isFaved ? " is-faved" : ""}" type="button" data-favorite="${escapeHtml(encodeURIComponent(JSON.stringify(record)))}">
        ${favoriteHeartIcon(isFaved)}
        <span>${isFaved ? "已收藏" : "收藏"}</span>
      </button>
    </div>
  `);
  mapRuntime.infoWindows.poi.open(map, point);
  window.setTimeout(() => {
    const button = document.querySelector(".poi-info-fav-btn");
    if (!button) return;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const favorite = decodeFavoritePayload(button.dataset.favorite);
      if (!favorite) return;
      if (isFavoriteId(favorite.id)) {
        toggleFavoriteRecord(favorite);
        showToast("已取消收藏");
      } else {
        openFavoriteNoteSheet(favorite);
      }
      mapRuntime.infoWindows.poi.close();
    }, { once: true });
  }, 40);
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
  [...mapRuntime.overlays.base, ...mapRuntime.overlays.walkRadius, ...mapRuntime.overlays.pois, ...mapRuntime.overlays.rankings].forEach((overlay) => overlay.setMap?.(null));
  mapRuntime.overlays.base = [];
  mapRuntime.overlays.walkRadius = [];
  mapRuntime.overlays.pois = [];
  mapRuntime.overlays.rankings = [];
  unregisterPlaceMarkers("base");
  unregisterPlaceMarkers("pois");
  unregisterPlaceMarkers("rankings");
  mapRuntime.infoWindows.poi?.close?.();
  mapRuntime.infoWindows.ranking?.close?.();
  state.map.selectedPlaceId = "";
  state.map.activeInfoWindow = "";
  syncSelectedPlaceUI();
}

function clearFavoriteMarkers() {
  mapRuntime.overlays.favorites.forEach((overlay) => overlay.setMap?.(null));
  mapRuntime.overlays.favorites = [];
  unregisterPlaceMarkers("favorites");
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
      content: `<div class="map-favorite-star" data-place-id="${escapeHtml(record.id)}" title="${escapeHtml(record.name || "收藏地点")}">★</div>`
    });
    marker.on("click", () => selectLinkedPlace(record, {
      source: "favorite-marker",
      openInfo: true,
      keepZoom: true,
      scrollCard: true
    }));
    mapRuntime.overlays.favorites.push(marker);
    marker.setMap(map);
    registerPlaceMarker(record, marker, "favorites");
  });
  syncSelectedPlaceUI();
}

function clearRankingOverlays() {
  mapRuntime.rankingBatchToken += 1;
  mapRuntime.overlays.rankings.forEach((overlay) => overlay.setMap?.(null));
  mapRuntime.overlays.rankings = [];
  unregisterPlaceMarkers("rankings");
  mapRuntime.infoWindows.ranking?.close?.();
}

function fitMap() {
  if (!map || !state.map.bounds.length) return;
  if (state.map.bounds.length === 1) {
    map.setZoomAndCenter(15, state.map.bounds[0]);
    return;
  }
  const overlays = visibleMapOverlays();
  if (!overlays.length) return;
  map.setFitView(overlays, false, [80, 80, 80, 80], 16);
}

async function apiGet(path, options = {}) {
  if (!state.app.online) throw new Error("当前处于离线状态");
  const response = await fetchWithTimeout(path, options, 20000, "服务请求");
  const payload = await readJsonPayload(response);
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `请求失败：${response.status}`);
  return payload;
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
  const payload = await readJsonPayload(response);
  if (!response.ok || payload.ok === false) throw new Error(payload.error || "请求失败");
  return payload;
}

async function readJsonPayload(response) {
  const raw = await response.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("服务返回了无法读取的数据");
  }
}

function loadPlugin(name, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!window.AMap?.plugin) {
      reject(new Error("高德地图服务尚未准备好"));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("地图插件加载超时"));
    }, timeoutMs);
    window.AMap.plugin([name], () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    });
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000, label = "请求") {
  const controller = new AbortController();
  let abortedByCaller = Boolean(options.signal?.aborted);
  const handleCallerAbort = () => {
    abortedByCaller = true;
    controller.abort();
  };
  if (options.signal) {
    if (options.signal.aborted) handleCallerAbort();
    else options.signal.addEventListener("abort", handleCallerAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      if (abortedByCaller) throw new Error("请求已取消");
      if (timedOut) throw new Error(`${label}超时`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", handleCallerAbort);
  }
}

function loadScript(src, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      script.remove();
      reject(new Error("高德地图 JS API 加载超时"));
    }, timeoutMs);
    script.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(new Error("高德地图 JS API 加载失败"));
    };
    document.head.appendChild(script);
  });
}

function setMapFallback(message, { loading = false, retry = true } = {}) {
  const mapEl = $("#map");
  if (!mapEl) return;
  mapEl.innerHTML = `
    <div class="map-fallback${loading ? " is-loading" : ""}">
      <div class="map-fallback-content">
        <span class="map-fallback-icon" aria-hidden="true">${loading ? "…" : "!"}</span>
        <strong>${loading ? "地图加载中" : "地图暂时不可用"}</strong>
        <span>${escapeHtml(message)}</span>
        ${retry ? '<button class="map-fallback-retry" type="button">重试地图</button>' : ""}
      </div>
    </div>
  `;
  mapEl.querySelector(".map-fallback-retry")?.addEventListener("click", () => void retryMapInitialization());
}

function parseLocation(location) {
  return String(location).split(",").map((value) => Number(value));
}

function isValidPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every((value) => Number.isFinite(Number(value)));
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
  if (els.status) {
    els.status.textContent = text;
    els.status.dataset.status = /失败|离线/.test(text) ? "error" : /查询中|刷新中|定位中/.test(text) ? "loading" : "ready";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
