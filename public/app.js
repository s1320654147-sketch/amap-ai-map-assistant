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
  mapBounds: []
};

let map = null;
let overlays = [];

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
  els.contextResetButton?.addEventListener("click", resetContext);
  els.contextResetBannerButton?.addEventListener("click", resetContext);
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
    await refreshNearby();
  });

  walkSelect.addEventListener("change", async () => {
    state.filters.walkMinutes = Number(walkSelect.value);
    syncFilterSelectState();
    renderContext();
    await refreshNearby();
  });

  categorySelect.addEventListener("change", async () => {
    state.filters.category = categorySelect.value;
    syncFilterSelectState();
    renderContext();
    await refreshNearby();
  });

  fitMapButton?.addEventListener("click", fitMap);
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
    await refreshNearby();
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
    await refreshNearby();
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
    await refreshNearby();
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

  const pois = Array.isArray(payload.pois) ? payload.pois : [];
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
  const pois = Array.isArray(payload.pois) ? payload.pois : [];
  if (!pois.length) {
    els.evidence.innerHTML = `<p class="empty">没有找到可展示的周边结果。</p>`;
    return;
  }

  els.evidence.innerHTML = pois
    .slice(0, 6)
    .map((poi, index) =>
      evidenceRow(
        index + 1,
        poi.name,
        [poi.district, poi.address].filter(Boolean).join(" "),
        poi.distance ? `${poi.distance}m` : "-",
        state.filters.category,
        "高德"
      )
    )
    .join("");
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
  updateChatMode();
  renderContext();
  els.questionInput?.focus();
}

function currentAreaLabel() {
  return state.location.district || state.location.city || state.filters.city || "当前位置";
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  await askAgent(question);
}

async function handleQuestionKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  const question = els.questionInput?.value.trim();
  if (!question) return;
  if (els.questionInput) els.questionInput.value = "";
  await askAgent(question);
}

async function handleInlineSend() {
  const question = els.inlineInput?.value.trim();
  if (!question) return;
  els.inlineInput.value = "";
  await askAgent(question);
}

async function handleInlineKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await handleInlineSend();
}

async function askAgent(question) {
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

  const sendButton = els.form?.querySelector(".send-fab");
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "...";
  }

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
    appendMessage("assistant", `查询失败：${error instanceof Error ? error.message : String(error)}`, {
      title: "查询失败",
      icon: "green"
    });
    setStatus("失败");
  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = "➤";
    }
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
  if (context.lastLocation && !state.location.location) {
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
  const pois = payload.data?.pois || [];

  if ((payload.intent === "nearby" || payload.intent === "search") && pois.length) {
    els.evidence.innerHTML = pois
      .slice(0, 6)
      .map((poi, index) =>
        evidenceRow(
          index + 1,
          poi.name,
          [poi.district, poi.address].filter(Boolean).join(" "),
          poi.distance ? `${poi.distance}m` : "-",
          poi.rankingLabels?.length ? poi.rankingLabels.join(" / ") : state.filters.category,
          "高德"
        )
      )
      .join("");
    return;
  }

  if (payload.intent === "cluster" && Array.isArray(payload.data?.matches)) {
    els.evidence.innerHTML = payload.data.matches.length
      ? payload.data.matches
          .slice(0, 10)
          .map((match, index) => evidenceRow(index + 1, match.title, "多条件组合", `${match.maxPairDistanceMeters}m`, "4.6", "高德"))
          .join("")
      : `<p class="empty">没有找到满足条件的组合。</p>`;
    return;
  }

  if (payload.intent === "route" && payload.data?.route) {
    const route = payload.data.route;
    els.evidence.innerHTML = evidenceRow(1, "步行路线", "高德步行路径规划", `${route.distanceMeters}m`, `${Math.round(route.durationSeconds / 60)}min`, "高德");
    return;
  }

  els.evidence.innerHTML = `<p class="empty">${escapeHtml(payload.source || "暂无证据")}</p>`;
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
  if (!els.evidence) return;
  els.evidence.insertAdjacentHTML("afterbegin", `<p class="empty">${escapeHtml(message)}</p>`);
}

function clearMap() {
  overlays.forEach((overlay) => overlay.setMap(null));
  overlays = [];
}

function fitMap() {
  if (!map || !state.mapBounds.length) return;
  if (state.mapBounds.length === 1) {
    map.setZoomAndCenter(15, state.mapBounds[0]);
    return;
  }
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
  if (rankingCategory === "both") return "both";
  if (rankingCategory === "saojiebang") return "saojiebang";
  if (rankingCategory === "bichibang") return "bichibang";
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
  return text.endsWith("市") ? text : `${text}市`;
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
