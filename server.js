import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const rankingListsPath = path.join(dataDir, "lists.json");
const rankingResolvedPath = path.join(dataDir, "lists.resolved.json");

loadEnv(path.join(rootDir, ".env"));

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || "0.0.0.0";
const AMAP_BASE = "https://restapi.amap.com";
const AMAP_MIN_INTERVAL_MS = Number(process.env.AMAP_MIN_INTERVAL_MS || 800);
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 12000);
const AMAP_TIMEOUT_MS = Number(process.env.AMAP_TIMEOUT_MS || 18000);
const AMAP_RATE_LIMIT_RETRY_COUNT = Number(process.env.AMAP_RATE_LIMIT_RETRY_COUNT || 3);
const AMAP_RATE_LIMIT_BACKOFF_MS = Number(process.env.AMAP_RATE_LIMIT_BACKOFF_MS || 1200);
const OUTBOUND_FETCH_RETRY_COUNT = Number(process.env.OUTBOUND_FETCH_RETRY_COUNT || 2);
const OUTBOUND_FETCH_RETRY_BACKOFF_MS = Number(process.env.OUTBOUND_FETCH_RETRY_BACKOFF_MS || 900);
const SEARCH_COUNT_MAX_PAGES = Number(process.env.SEARCH_COUNT_MAX_PAGES || 20);
let nextAmapRequestAt = 0;
let amapQueue = Promise.resolve();

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, url, res);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "未知错误"
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AMap real query assistant running at http://localhost:${PORT}`);
});

async function handleApi(req, url, res) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const amapKey = getAmapKey();
  if (!amapKey || amapKey.includes("把你的")) {
    sendJson(res, 400, {
      ok: false,
      error: "还没有配置 AMAP_KEY。请复制 .env.example 为 .env，并填入高德开放平台的 Web服务 Key。"
    });
    return;
  }

  if (url.pathname === "/api/config") {
    loadEnv(path.join(rootDir, ".env"));
    sendJson(res, 200, {
      ok: true,
      amapJsKey: process.env.AMAP_JS_KEY || "",
      amapSecurityJsCode: process.env.AMAP_SECURITY_JS_CODE || ""
    });
    return;
  }

  if (url.pathname === "/api/agent") {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const question = String(body.question || url.searchParams.get("question") || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const context = body.context && typeof body.context === "object" ? body.context : {};
    if (!question) {
      throw new Error("请输入你想问的问题");
    }
    const requestId = Math.random().toString(36).slice(2, 8);
    const startedAt = Date.now();
    console.log(`[agent:${requestId}] start ${question}`);
    const result = await answerWithAmapV2(question, { history, context });
    console.log(`[agent:${requestId}] done ${Date.now() - startedAt}ms ${result.intent}/${result.planner}`);
    sendJson(res, 200, { ok: true, requestId, ...result });
    return;
  }

  if (url.pathname === "/api/agent/stream") {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const question = String(body.question || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];
    const context = body.context && typeof body.context === "object" ? body.context : {};
    if (!question) {
      sendJson(res, 400, { ok: false, error: "请输入你想问的问题" });
      return;
    }
    const requestId = Math.random().toString(36).slice(2, 8);
    const startedAt = Date.now();
    console.log(`[agent:${requestId}] start-stream ${question}`);
    setupSse(res);
    try {
      const result = await answerWithAmapV2(question, { history, context }, { skipNarration: true });
      writeSse(res, "meta", {
        requestId,
        intent: result.intent,
        planner: result.planner,
        context: result.context
      });
      let finalReply = result.analysis || "";
      try {
        finalReply = await streamDeepSeekNarration(result, { history, context }, res);
      } catch (streamError) {
        console.error(`[agent:${requestId}] stream-fallback`, streamError);
        if (finalReply) {
          writeSse(res, "delta", { text: finalReply });
        }
      }
      const payload = {
        ok: true,
        requestId,
        ...result,
        analysis: finalReply || result.analysis
      };
      console.log(`[agent:${requestId}] done-stream ${Date.now() - startedAt}ms ${result.intent}/${result.planner}`);
      writeSse(res, "done", payload);
    } catch (error) {
      console.error(`[agent:${requestId}] stream-error`, error);
      writeSse(res, "error", {
        ok: false,
        error: error instanceof Error ? error.message : "未知错误"
      });
    } finally {
      res.end();
    }
    return;
  }

  if (url.pathname === "/api/search") {
    const keywords = requiredParam(url, "keywords");
    const city = url.searchParams.get("city") || "";
    const pois = await searchText({ keywords, city, pageSize: 20, pages: 2 });
    sendJson(res, 200, { ok: true, pois });
    return;
  }

  if (url.pathname === "/api/nearby") {
    const address = url.searchParams.get("address") || "";
    const location = url.searchParams.get("location") || "";
    const keywords = url.searchParams.get("keywords") || url.searchParams.get("category") || "餐饮";
    const city = url.searchParams.get("city") || "";
    const walkMinutes = Number(url.searchParams.get("walkMinutes") || "");
    const radiusParam = url.searchParams.get("radius");
    const radius = radiusParam
      ? Number(radiusParam)
      : Number.isFinite(walkMinutes) && walkMinutes > 0
        ? walkMinutesToRadius(walkMinutes)
        : 2000;
    const origin = location
      ? {
          formattedAddress: address || location,
          province: "",
          city,
          district: "",
          location,
          level: "location"
        }
      : await geocode(requiredParam(url, "address"), city);
    const pois = await searchAround({
      location: origin.location,
      keywords,
      radius,
      pageSize: 25,
      pages: 2
    });
    sendJson(res, 200, {
      ok: true,
      origin,
      radius,
      walkMinutes: Number.isFinite(walkMinutes) ? walkMinutes : null,
      pois
    });
    return;
  }

  if (url.pathname === "/api/route") {
    const from = requiredParam(url, "from");
    const to = requiredParam(url, "to");
    const city = url.searchParams.get("city") || "";
    const origin = await geocode(from, city);
    const destination = await geocode(to, city);
    const route = await walkingRoute(origin.location, destination.location);
    sendJson(res, 200, { ok: true, origin, destination, route });
    return;
  }

  if (url.pathname === "/api/coexist") {
    const city = url.searchParams.get("city") || "上海";
    const brandA = url.searchParams.get("brandA") || "影石 insta360";
    const brandB = url.searchParams.get("brandB") || "大疆 DJI";
    const radius = Number(url.searchParams.get("radius") || 800);
    const result = await findCoexistingBrands({ city, brandA, brandB, radius });
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (url.pathname === "/api/cluster") {
    const city = url.searchParams.get("city") || "上海";
    const conditions = getConditions(url);
    const radius = Number(url.searchParams.get("radius") || 800);
    const maxResults = Number(url.searchParams.get("maxResults") || 30);
    const result = await findCoLocatedConditions({ city, conditions, radius, maxResults });
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (url.pathname === "/api/rankings/resolve") {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const city = String(body.city || url.searchParams.get("city") || "上海").trim() || "上海";
    const lists = body.lists || loadRankingLists().raw;
    const resolved = await resolveRankingLists(lists, city);
    persistResolvedRankingLists(resolved);
    sendJson(res, 200, { ok: true, city, resolved });
    return;
  }

  if (url.pathname === "/api/rankings/map") {
    const city = String(url.searchParams.get("city") || "上海").trim() || "上海";
    const lists = loadRankingLists();
    const missingResolved =
      !lists.resolved?.saojiebang?.length && !lists.resolved?.bichibang?.length && !lists.resolved?.bibendum?.length;
    const resolved = missingResolved ? await resolveRankingLists(lists.raw, city) : lists.resolved;
    if (missingResolved) persistResolvedRankingLists(resolved);
    const markers = buildRankingMapEntries({ raw: lists.raw, resolved });
    sendJson(res, 200, { ok: true, city, markers });
    return;
  }

  sendJson(res, 404, { ok: false, error: "接口不存在" });
}

async function answerWithAmapV2(question, session = {}, options = {}) {
  const plan = await planQuestion(question, session);

  if (plan.intent === "route") {
    const origin = await geocode(plan.from, plan.city);
    const destination = await geocode(plan.to, plan.city);
    const route = await walkingRoute(origin.location, destination.location);
    const minutes = Math.round(route.durationSeconds / 60);
    const kilometers = (route.distanceMeters / 1000).toFixed(2);
    return maybeFinalizeAgentResponse({
      intent: "route",
      planner: plan.planner,
      question,
      city: plan.city,
      analysis: buildRouteAnalysis({ origin, destination, kilometers, minutes }),
      answer: `${origin.formattedAddress} 到 ${destination.formattedAddress} 步行约 ${kilometers} 公里，预计 ${minutes} 分钟。`,
      map: {
        mode: "route",
        center: centerLocation([origin.location, destination.location]),
        markers: [
          { label: "起", title: origin.formattedAddress, location: origin.location },
          { label: "终", title: destination.formattedAddress, location: destination.location }
        ],
        route: { origin: origin.location, destination: destination.location }
      },
      data: { plan, origin, destination, route },
      source: "DeepSeek/规则解析 + 高德地理编码 + 高德步行路径规划",
      context: buildNextContext({ question, plan, origin, destination })
    }, session, options);
  }

  if (plan.intent === "nearby") {
    const origin = await resolvePlaceAnchor(plan.address, plan.city);
    const pois = await searchAround({
      location: origin.location,
      keywords: plan.keywords,
      radius: plan.radius,
      pageSize: 25,
      pages: 1
    });
    const taggedPois = tagRankingsForPois(pois);
    const top = taggedPois.slice(0, 10);
    return maybeFinalizeAgentResponse({
      intent: "nearby",
      planner: plan.planner,
      question,
      city: plan.city,
      analysis: buildNearbyAnalysis({
        origin,
        radius: plan.radius,
        keywords: plan.keywords,
        pois: taggedPois,
        top
      }),
      answer: `我在 ${origin.formattedAddress} 附近 ${plan.radius} 米内找到了 ${pois.length} 个「${plan.keywords}」相关地点，优先展示前 ${top.length} 个。`,
      map: {
        mode: "pois",
        center: origin.location,
        radius: plan.radius,
        markers: [
          { label: "中", title: origin.formattedAddress, location: origin.location, role: "origin" },
          ...top.map((poi, index) => poiToMarker(poi, String(index + 1)))
        ],
        legends: rankingLegendSummary(top)
      },
      data: { plan, origin, radius: plan.radius, pois: top },
      source: "DeepSeek/规则解析 + 高德地理编码 + 高德周边搜索",
      context: buildNextContext({ question, plan, origin })
    }, session, options);
  }

  if (plan.intent === "cluster") {
    const result = await findCoLocatedConditions({
      city: plan.city,
      conditions: plan.conditions,
      radius: plan.radius,
      maxResults: 24
    });
    const top = result.matches.slice(0, 12);
    const conditionText = result.conditions.map((item) => item.label).join("、");
    return maybeFinalizeAgentResponse({
      intent: "cluster",
      planner: plan.planner,
      question,
      city: plan.city,
      analysis: buildClusterAnalysis({
        top,
        radius: plan.radius,
        conditionText
      }),
      answer: top.length
        ? `我找到了 ${top.length} 个同时接近「${conditionText}」的候选区域，按各条件最远距离从近到远排序。`
        : `没有在 ${plan.radius} 米内找到同时接近「${conditionText}」的候选区域，可以放大半径或减少条件。`,
      map: {
        mode: "clusters",
        center: top[0]?.center || defaultCityCenter(plan.city),
        radius: plan.radius,
        markers: top.flatMap((match, index) =>
          match.members.map((member) => ({
            label: `${index + 1}`,
            title: `${member.label}: ${member.poi.name}`,
            location: member.poi.location,
            role: "cluster"
          }))
        )
      },
      data: { plan, ...result, matches: top },
      source: "DeepSeek/规则解析 + 高德关键字搜索 + 坐标距离计算",
      context: buildNextContext({ question, plan })
    }, session, options);
  }

  const searchResult = await searchTextWithMeta({
    keywords: plan.keywords,
    city: plan.city,
    pageSize: 25,
    pages: plan.countMode ? 6 : 2,
    countMode: plan.countMode
  });
  const taggedPois = tagRankingsForPois(searchResult.pois);
  const top = taggedPois.slice(0, 10);
  return maybeFinalizeAgentResponse({
    intent: "search",
    planner: plan.planner,
    question,
    city: plan.city,
      analysis: buildSearchAnalysis({
        city: plan.city,
        keywords: plan.keywords,
        countMode: plan.countMode,
        estimatedCount: searchResult.estimatedCount,
        countExhaustive: searchResult.countExhaustive,
        pois: taggedPois,
        top
      }),
    answer: plan.countMode
      ? `${searchResult.countExhaustive ? "我用" : "我至少用"}「${plan.keywords}」在${plan.city || "全国"}范围内基于高德真实结果查到了${searchResult.countExhaustive ? `${searchResult.estimatedCount}` : `至少 ${searchResult.estimatedCount}`}家相关门店。`
      : `我用「${plan.keywords}」在${plan.city || "全国"}搜索到了 ${taggedPois.length} 个高德 POI，当前先展示前 ${top.length} 个。`,
    map: {
      mode: "pois",
      center: top[0]?.location || defaultCityCenter(plan.city),
      markers: top.map((poi, index) => poiToMarker(poi, String(index + 1))),
      legends: rankingLegendSummary(top)
    },
    data: { plan, totalCount: searchResult.estimatedCount, countExhaustive: searchResult.countExhaustive, pois: top, allPois: taggedPois.slice(0, 80) },
    source: "DeepSeek/规则解析 + 高德关键字搜索",
    context: buildNextContext({ question, plan })
  }, session, options);
}

async function planQuestion(question, session = {}) {
  try {
    const deepseekPlan = await planQuestionWithDeepSeek(question, session);
    return { ...normalizePlan(deepseekPlan, question, session), planner: "deepseek-v4-flash" };
  } catch (error) {
    return {
      ...planQuestionWithRules(question, session),
      planner: "rules",
      plannerNote: error instanceof Error ? error.message : "DeepSeek planning failed"
    };
  }
}

async function planQuestionWithDeepSeek(question, session = {}) {
  loadEnv(path.join(rootDir, ".env"));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是地图查询意图解析器，只输出 JSON。不要回答用户事实问题。真实地点数据必须由高德 API 查询。JSON schema: {\"intent\":\"cluster|nearby|route|search\",\"city\":\"城市名\",\"radius\":数字米数,\"from\":\"起点\",\"to\":\"终点\",\"address\":\"中心地点\",\"keywords\":\"搜索关键词\",\"conditions\":[{\"label\":\"条件名\",\"aliases\":[\"别名\"]}]}。cluster 用于同时/都有/又有/兼具多个地点或业态；nearby 用于附近/周边；route 用于多远/多久/路线；search 用于普通搜索。城市缺省用上海。半径缺省 cluster=800, nearby=2000。如果用户当前问题依赖上文，比如“那附近”“那里”“再找点别的”，要结合 conversation_context 继承上一次的 city 和 address。重要约束：当用户提到具体品牌名时，默认理解为该品牌的官方门店/官方品牌点，而不是商场名、广场名、配送站、云仓、员工餐厅、内部食堂、奥莱、mini 或地址描述。若用户说“山姆”“大疆”“蜜雪冰城”“喜茶”等品牌，优先按官方品牌门店理解。"
        },
        {
          role: "system",
          content: `conversation_context=${JSON.stringify({
            context: session.context || {},
            history: Array.isArray(session.history) ? session.history.slice(-6) : []
          })}`
        },
        { role: "user", content: question }
      ]
    })
  }, DEEPSEEK_TIMEOUT_MS, "DeepSeek");
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek returned empty content");
  return JSON.parse(text);
}

function planQuestionWithRules(question, session = {}) {
  const intent = inferIntent(question, session.context);
  const city = inferCity(question, session.context);
  if (intent === "route") return normalizePlan({ intent, city, ...parseRouteQuestion(question, session.context) }, question, session);
  if (intent === "nearby") return normalizePlan({ intent, city, ...parseNearbyQuestion(question, session.context) }, question, session);
  if (intent === "cluster") return normalizePlan({ intent, city, ...parseClusterQuestion(question) }, question, session);
  return normalizePlan({ intent: "search", city, ...parseSearchQuestion(question, session.context) }, question, session);
}

function normalizePlan(rawPlan, question, session = {}) {
  const context = session.context || {};
  const contextualNearby = shouldUseContextualNearby(question, context, rawPlan);
  const inferredIntent = inferIntent(question, context);
  const intent = contextualNearby
    ? "nearby"
    : inferredIntent === "cluster"
      ? "cluster"
      : ["cluster", "nearby", "route", "search"].includes(rawPlan.intent)
        ? rawPlan.intent
        : inferredIntent;
  const city = shouldPreferContextCity(question, context) ? (context.lastCity || inferCity(question, context)) : (rawPlan.city || inferCity(question, context));
  const plan = { intent, city };

  if (intent === "route") {
    const parsed = safeParse(() => parseRouteQuestion(question, context), {});
    plan.from = cleanupPlace(rawPlan.from || parsed.from || context.lastFrom || "");
    plan.to = cleanupPlace(rawPlan.to || parsed.to || context.lastTo || "");
    if (!plan.from || !plan.to) throw new Error("我没有识别出起点和终点。可以这样问：上海静安寺到人民广场步行多久？");
    return plan;
  }

  if (intent === "nearby") {
    const parsed = parseNearbyQuestion(question, context);
    plan.address = cleanupPlace(contextualNearby ? (parsed.address || context.lastAddress) : (rawPlan.address || parsed.address || context.lastAddress));
    plan.keywords = cleanupPlace(rawPlan.keywords || parsed.keywords || "餐饮");
    plan.radius = clampRadius(rawPlan.radius || parsed.radius, 200, 10000, 2000);
    return plan;
  }

  if (intent === "cluster") {
    const parsed = parseClusterQuestion(question);
    const conditions = Array.isArray(rawPlan.conditions) ? rawPlan.conditions : parsed.conditions;
    plan.conditions = conditions
      .map((condition) => {
        if (typeof condition === "string") return parseCondition(condition);
        const aliases = Array.isArray(condition.aliases) ? condition.aliases : [condition.label].filter(Boolean);
        return {
          label: cleanupPlace(condition.label || aliases[0] || ""),
          aliases: aliases.map(cleanupPlace).filter(Boolean)
        };
      })
      .filter((condition) => condition.label && condition.aliases.length)
      .slice(0, 5);
    if (plan.conditions.length < 2) plan.conditions = parsed.conditions;
    plan.radius = clampRadius(rawPlan.radius || parsed.radius, 100, 10000, 1500);
    return plan;
  }

  const parsed = parseSearchQuestion(question, context);
  plan.keywords = cleanupPlace(rawPlan.keywords || parsed.keywords || question);
  plan.countMode = Boolean(rawPlan.countMode || parsed.countMode);
  return plan;
}

function safeParse(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function clampRadius(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function defaultCityCenter(city) {
  const centers = {
    上海: "121.473667,31.230525",
    北京: "116.407387,39.904179",
    广州: "113.264385,23.129112",
    深圳: "114.057868,22.543099",
    杭州: "120.155070,30.274084"
  };
  return centers[city] || centers.上海;
}

async function answerWithAmap(question) {
  const city = inferCity(question);
  const intent = inferIntent(question);

  if (intent === "route") {
    const routeQuery = parseRouteQuestion(question);
    const origin = await geocode(routeQuery.from, city);
    const destination = await geocode(routeQuery.to, city);
    const route = await walkingRoute(origin.location, destination.location);
    return {
      intent,
      question,
      city,
      answer: `${origin.formattedAddress} 到 ${destination.formattedAddress} 步行约 ${(route.distanceMeters / 1000).toFixed(2)} 公里，预计 ${Math.round(route.durationSeconds / 60)} 分钟。`,
      map: {
        mode: "route",
        center: centerLocation([origin.location, destination.location]),
        markers: [
          { label: "起点", title: origin.formattedAddress, location: origin.location },
          { label: "终点", title: destination.formattedAddress, location: destination.location }
        ],
        route: { origin: origin.location, destination: destination.location }
      },
      data: { origin, destination, route },
      source: "高德地理编码 + 高德步行路径规划"
    };
  }

  if (intent === "nearby") {
    const nearbyQuery = parseNearbyQuestion(question);
    const origin = await geocode(nearbyQuery.address, city);
    const pois = await searchAround({
      location: origin.location,
      keywords: nearbyQuery.keywords,
      radius: nearbyQuery.radius,
      pageSize: 25,
      pages: 1
    });
    const top = pois.slice(0, 8);
    return {
      intent,
      question,
      city,
      answer: `我在 ${origin.formattedAddress} 附近 ${nearbyQuery.radius} 米内找到了 ${pois.length} 个「${nearbyQuery.keywords}」相关地点，优先展示前 ${top.length} 个。`,
      map: {
        mode: "pois",
        center: origin.location,
        radius: nearbyQuery.radius,
        markers: [
          { label: "中心", title: origin.formattedAddress, location: origin.location, role: "origin" },
          ...top.map((poi, index) => poiToMarker(poi, String(index + 1)))
        ]
      },
      data: { origin, radius: nearbyQuery.radius, pois: top },
      source: "高德地理编码 + 高德周边搜索"
    };
  }

  if (intent === "cluster") {
    const clusterQuery = parseClusterQuestion(question);
    const result = await findCoLocatedConditions({
      city,
      conditions: clusterQuery.conditions,
      radius: clusterQuery.radius,
      maxResults: 24
    });
    const top = result.matches.slice(0, 12);
    const conditionText = result.conditions.map((item) => item.label).join("、");
    return {
      intent,
      question,
      city,
      answer: top.length
        ? `我找到了 ${top.length} 个同时接近「${conditionText}」的候选区域，按各条件最远距离从近到远排序。`
        : `没有在 ${clusterQuery.radius} 米内找到同时接近「${conditionText}」的候选区域，可以放大半径或减少条件。`,
      map: {
        mode: "clusters",
        center: top[0]?.center || "121.473667,31.230525",
        radius: clusterQuery.radius,
        markers: top.flatMap((match, index) =>
          match.members.map((member) => ({
            label: `${index + 1}`,
            title: `${member.label}: ${member.poi.name}`,
            location: member.poi.location,
            role: "cluster"
          }))
        )
      },
      data: { ...result, matches: top },
      source: "高德关键字搜索 + 坐标距离计算"
    };
  }

  const searchQuery = parseSearchQuestion(question);
  const pois = await searchText({ keywords: searchQuery.keywords, city, pageSize: 20, pages: 1 });
  const top = pois.slice(0, 10);
  return {
    intent: "search",
    question,
    city,
    answer: `我用「${searchQuery.keywords}」在${city || "全国"}搜索到了 ${pois.length} 个高德 POI，展示前 ${top.length} 个。`,
    map: {
      mode: "pois",
      center: top[0]?.location || "121.473667,31.230525",
      markers: top.map((poi, index) => poiToMarker(poi, String(index + 1)))
    },
    data: { pois: top },
    source: "高德关键字搜索"
  };
}

function inferIntent(question, context = {}) {
  if (shouldUseContextualNearby(question, context)) return "nearby";
  if (/(多远|多久|步行|走路|路线|怎么走|到.+要多久)/.test(question)) return "route";
  if (/(附近|周边|旁边|周围)/.test(question)) return "nearby";
  if (/(同时|都有|又有|兼具|共同|一起有|都拥有)/.test(question)) return "cluster";
  return "search";
}

function shouldUseContextualNearby(question, context = {}, rawPlan = {}) {
  if (!context.lastAddress) return false;
  if (rawPlan?.intent === "route" || rawPlan?.intent === "cluster") return false;
  return /(那|这|这里|那里|继续|再找|再来|还有|还有没有|有没有|换成|想吃|想找|改成)/.test(question);
}

function shouldPreferContextCity(question, context = {}) {
  if (!context.lastCity) return false;
  return !containsExplicitCity(question);
}

function containsExplicitCity(question) {
  const knownCities = ["上海", "北京", "广州", "深圳", "杭州", "南京", "苏州", "成都", "重庆", "武汉", "西安", "义乌", "金华", "泉州", "厦门", "福州", "宁波", "温州"];
  return knownCities.some((city) => question.includes(city));
}

function inferCity(question, context = {}) {
  const knownCities = [
    "上海",
    "北京",
    "广州",
    "深圳",
    "杭州",
    "南京",
    "苏州",
    "成都",
    "重庆",
    "武汉",
    "西安",
    "义乌",
    "金华",
    "泉州",
    "厦门",
    "福州",
    "宁波",
    "温州"
  ];
  return knownCities.find((city) => question.includes(city)) || context.lastCity || "上海";
}

function parseRouteQuestion(question, context = {}) {
  const cleaned = question.replace(/[？?。！!]/g, " ").trim();
  const match = cleaned.match(/(.+?)(?:到|去)(.+?)(?:多远|多久|步行|走路|路线|怎么走|要多久|$)/);
  if (!match) {
    if (context.lastFrom && context.lastTo) {
      return {
        from: cleanupPlace(context.lastFrom),
        to: cleanupPlace(context.lastTo)
      };
    }
    throw new Error("我没有识别出起点和终点。可以这样问：上海静安寺到人民广场步行多久？");
  }
  return {
    from: cleanupPlace(match[1]),
    to: cleanupPlace(match[2])
  };
}

function parseNearbyQuestion(question, context = {}) {
  const radiusMatch = question.match(/(\d+(?:\.\d+)?)\s*(公里|千米|km|米|m)/i);
  const radius = radiusMatch
    ? Math.min(10000, Math.max(200, Math.round(Number(radiusMatch[1]) * (/公里|千米|km/i.test(radiusMatch[2]) ? 1000 : 1))))
    : 2000;
  const rawAddress = question.match(/(.+?)(?:附近|周边|旁边|周围)/)?.[1];
  const inheritedAddress = /(那附近|这里附近|那里附近|这附近|附近还有|附近再找)/.test(question) ? context.lastAddress : "";
  const address = cleanupPlace((rawAddress || inheritedAddress || context.lastAddress || "上海人民广场").trim());
  const afterNearby = question.split(/附近|周边|旁边|周围/).slice(1).join(" ");
  const keywords = inferNearbyKeyword(afterNearby || question);
  return { address, keywords, radius };
}

function parseClusterQuestion(question) {
  const radiusMatch = question.match(/(\d+(?:\.\d+)?)\s*(公里|千米|km|米|m)/i);
  const radius = radiusMatch
    ? Math.min(10000, Math.max(100, Math.round(Number(radiusMatch[1]) * (/公里|千米|km/i.test(radiusMatch[2]) ? 1000 : 1))))
    : 1500;
  const core = question
    .replace(/^(帮我|请|查询|查一下|找一下|找找|看看)/, "")
    .replace(/有哪些|哪里|什么地方|地方|区域|商圈|附近|同时|都有|既有|既|又有|兼具|共同|拥有|有/g, " ")
    .replace(/在?上海|在?北京|在?广州|在?深圳|在?杭州/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(公里|千米|km|米|m)/gi, " ");
  const tokens = core
    .split(/[\s，,、和与及+＋/|;；\n]+/)
    .map((item) => cleanupPlace(item))
    .filter((item) => item.length >= 2)
    .slice(0, 5);
  const fallback = ["公园", "购物中心"];
  const labels = tokens.length >= 2 ? tokens : fallback;
  return {
    radius,
    conditions: labels.map(parseCondition)
  };
}

function parseSearchQuestion(question, context = {}) {
  const inherited = /(那里|那边|那附近|这边|这附近|继续|再找|还有没有)/.test(question) ? context.lastAddress || "" : "";
  return {
    countMode: /(一共|总共|总计|共有|多少家|几家|多少个|门店数|门店数量)/.test(question),
    keywords: cleanupPlace(
      question
        .replace(/^(帮我|请|查询|查一下|找一下|搜索)/, "")
        .replace(/一共|总共|总计|共有|多少家|几家|多少个|门店数|门店数量|有哪些|哪里|附近|高德|地图/g, " ")
    ),
    addressHint: inherited
  };
}

function inferNearbyKeyword(text) {
  if (/吃|餐|饭|美食|餐厅|小吃/.test(text)) return "餐饮";
  if (/咖啡/.test(text)) return "咖啡";
  if (/商场|商圈|购物|买/.test(text)) return "购物中心";
  if (/公园|散步/.test(text)) return "公园";
  if (/酒店|住宿/.test(text)) return "酒店";
  return cleanupPlace(text.replace(/有什么|有哪些|推荐|可以|的/g, " ")) || "餐饮";
}

function cleanupPlace(value) {
  return String(value || "")
    .replace(/[？?。！!]/g, " ")
    .replace(/^(从|在|到|去|离|请问|帮我|查一下|找一下)/, "")
    .replace(/(附近|周边|旁边|周围|有|有什么|有哪些|吗|呢|呀|吧)$/g, "")
    .trim();
}

function poiToMarker(poi, label) {
  return {
    label,
    title: poi.name,
    address: [poi.district, poi.address].filter(Boolean).join(" "),
    location: poi.location,
    type: poi.type,
    distance: poi.distance,
    rankingCategory: poi.rankingCategory || "",
    rankingLabels: poi.rankingLabels || []
  };
}

async function findCoLocatedConditions({ city, conditions, radius, maxResults }) {
  const poiGroups = await Promise.all(
    conditions.map((condition) =>
      searchConditionPois(condition, city).then((pois) => ({
        ...condition,
        pois
      }))
    )
  );

  const sourceCounts = Object.fromEntries(poiGroups.map((group) => [group.label, group.pois.length]));
  const usableGroups = poiGroups.filter((group) => group.pois.length > 0);
  if (usableGroups.length !== conditions.length) {
    return {
      city,
      conditions,
      radius,
      sourceCounts,
      estimatedAmapCalls: estimateClusterCalls(conditions),
      matches: []
    };
  }

  const anchorGroup = usableGroups.reduce((smallest, group) =>
    group.pois.length < smallest.pois.length ? group : smallest
  );
  const seen = new Set();
  const matches = [];

  for (const anchor of anchorGroup.pois) {
    const members = [];
    let valid = true;

    for (const group of usableGroups) {
      const nearest = findNearestPoi(anchor.location, group.pois, radius);
      if (!nearest) {
        valid = false;
        break;
      }
      members.push({
        label: group.label,
        poi: nearest.poi,
        distanceFromAnchorMeters: Math.round(nearest.distanceMeters)
      });
    }

    if (!valid) continue;

    const key = members
      .map((member) => member.poi.id || `${member.poi.name}|${member.poi.location}`)
      .sort()
      .join("::");
    if (seen.has(key)) continue;
    seen.add(key);

    const locations = members.map((member) => member.poi.location);
    const center = centerLocation(locations);
    const maxPairDistanceMeters = maxPairDistance(locations);
    matches.push({
      title: members.map((member) => member.poi.name).join(" + "),
      center,
      maxPairDistanceMeters: Math.round(maxPairDistanceMeters),
      members: members.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"))
    });
  }

  matches.sort((left, right) => left.maxPairDistanceMeters - right.maxPairDistanceMeters);

  return {
    city,
    conditions,
    radius,
    sourceCounts,
    estimatedAmapCalls: estimateClusterCalls(conditions),
    matches: matches.slice(0, maxResults)
  };
}

async function searchConditionPois(condition, city) {
  const groups = await Promise.all(
    condition.aliases.map((keyword) => searchText({ keywords: keyword, city, pageSize: 25, pages: 4 }))
  );
  const pois = dedupePois(groups.flat()).filter(
    (poi) => hasLocation(poi) && !isSuppressedPoiForQuery(condition.aliases, poi) && conditionMatchesPoi(condition, poi)
  );
  return tagRankingsForPois(await safeRefineConditionPoisWithDeepSeek(condition, pois));
}

function conditionMatchesPoi(condition, poi) {
  const rawName = String(poi?.name || "");
  const rawText = [poi?.name, poi?.address, poi?.district].filter(Boolean).join(" ");
  const text = rawText.toLowerCase();
  const normalizedName = normalizeLooseText(rawName);
  const normalizedText = normalizeLooseText(rawText);
  const conditionText = condition.aliases.join(" ").toLowerCase();

  if (/盒马|hema/.test(conditionText)) {
    return /盒马|hema/i.test(rawName) && !/员工餐厅|员工食堂/.test(rawName);
  }

  if (/山姆|sam/.test(conditionText)) {
    return /山姆会员商店|山姆会员店|sam'?s club/i.test(rawName) && !/配送站|云仓|极速达|app配送|仅限app配送|奥莱|mini/i.test(rawName);
  }

  if (/奥乐齐|奥乐奇|aldi/.test(conditionText)) {
    return /奥乐齐|aldi/i.test(rawName);
  }

  if (isLikelyOfficialBrandQuery(condition)) {
    return condition.aliases.some((alias) => {
      const normalizedAlias = normalizeLooseText(alias);
      return normalizedAlias && normalizedName.includes(normalizedAlias);
    }) && !isSuppressedBrandVariant(condition.aliases, poi);
  }

  return condition.aliases.some((alias) => {
    const normalizedAlias = normalizeLooseText(alias);
    return normalizedAlias && normalizedText.includes(normalizedAlias);
  }) || text.includes(condition.label.toLowerCase());
}

function isLikelyOfficialBrandQuery(condition) {
  const text = condition.aliases.join(" ").toLowerCase();
  if (/公园|商场|购物中心|景区|酒店|医院|地铁|学校|餐饮|美食|咖啡|火锅|超市|便利店/.test(text)) {
    return false;
  }
  return condition.aliases.some((alias) => normalizeLooseText(alias).length >= 2);
}

function isSuppressedBrandVariant(queryTerms, poi) {
  const queryText = queryTerms.join(" ");
  if (/配送站|云仓|奥莱|mini|express|极速达|app配送|仅限app配送/i.test(queryText)) return false;

  const poiText = [poi?.name, poi?.address, poi?.district, poi?.type].filter(Boolean).join(" ");
  return /配送站|云仓|奥莱|mini|express|极速达|app配送|仅限app配送/i.test(poiText);
}

function getConditions(url) {
  const repeated = url.searchParams.getAll("condition");
  const raw = repeated.length ? repeated : (url.searchParams.get("conditions") || "").split(/\r?\n/);
  const conditions = raw
    .map((item) => parseCondition(item))
    .filter((condition) => condition.aliases.length > 0);

  if (conditions.length < 2) {
    throw new Error("请至少输入两个条件，例如：影石 insta360、大疆 DJI，或：公园、购物中心");
  }

  if (conditions.length > 5) {
    throw new Error("免费 Key 建议一次最多输入 5 个条件，避免消耗过快");
  }

  return conditions;
}

function parseCondition(raw) {
  const cleaned = String(raw || "").trim();
  const baseAliases = cleaned
    .split(/[，,、|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const aliases = expandConditionAliases(baseAliases.length ? baseAliases : [cleaned]);
  return {
    label: aliases[0] || cleaned,
    aliases
  };
}

function expandConditionAliases(values) {
  const expanded = new Set(values.filter(Boolean));
  const text = values.join(" ").toLowerCase();

  if (/盒马|hema/.test(text)) {
    ["盒马", "盒马鲜生", "盒马X会员店", "Hema", "Hema Fresh"].forEach((item) => expanded.add(item));
  }

  if (/奥乐齐|奥乐奇|aldi/.test(text)) {
    ["奥乐齐", "奥乐奇", "ALDI", "Aldi", "阿尔迪"].forEach((item) => expanded.add(item));
  }

  if (/山姆|sam/.test(text)) {
    ["山姆", "山姆会员店", "山姆会员商店", "Sam's Club", "Sams Club"].forEach((item) => expanded.add(item));
  }

  return [...expanded];
}

function estimateClusterCalls(conditions) {
  return conditions.reduce((sum, condition) => sum + condition.aliases.length * 4, 0);
}

function buildRouteAnalysis({ origin, destination, kilometers, minutes }) {
  return [
    `先给你一个直接结论：从 ${origin.formattedAddress} 到 ${destination.formattedAddress}，步行大约 ${kilometers} 公里，预计 ${minutes} 分钟。`,
    `推荐理由：这条结果直接来自高德步行路径规划，所以更适合拿来做真实出行判断，不是模型凭空估时间。`,
    `适合谁：如果你现在在做线下踩点、安排行程，或者想判断两个点位能不能顺路，这个结果已经够用。`,
    `怎么选：如果 ${minutes} 分钟你能接受，就可以按步行来安排；如果你想更快，我下一步可以继续给你对比打车、公交或者骑行。`
  ].join("\n\n");
}

function buildNearbyAnalysis({ origin, radius, keywords, pois, top }) {
  const rankingStats = summarizeRankingStats(pois);
  const first = top[0];
  return [
    `我先帮你收一下结论：在 ${origin.formattedAddress} 附近 ${radius} 米内，我找到了 ${pois.length} 个和「${keywords}」相关的高德真实地点，当前优先展示前 ${top.length} 个。`,
    `推荐理由：这一批结果里优先保留了更近、信息更完整的点位${first ? `，像排在前面的「${first.name}」就更适合作为第一批参考` : ""}。${rankingStats.summary}`,
    `适合谁：如果你现在的目标是“附近先找一批靠谱候选”，这一层已经很适合；如果你后面还要做“预算内”“适合约会”“适合带客户”这种筛选，我可以继续往下收。`,
    `怎么选：你可以先看前 3 个，再告诉我你更在意哪一维，比如距离、环境、品牌、榜单命中，或者步行时间，我可以继续帮你二次排序。`
  ].join("\n\n");
}

function buildClusterAnalysis({ top, radius, conditionText }) {
  if (!top.length) {
    return [
      `这次我没有在 ${radius} 米范围内找到同时满足「${conditionText}」的候选区域。`,
      "推荐理由：这类问题本质上是在找多个条件能不能落到同一个商圈或一段步行半径里，所以半径太小的时候很容易直接归零。",
      "适合谁：如果你现在是在做选址、逛街路线、商圈筛选，这个判断依然是有价值的，因为它说明当前条件组合偏严格。",
      "怎么选：建议先把半径放大一点，或者暂时拿掉一个条件重查，我可以继续帮你做一版更宽松的结果。"
    ].join("\n\n");
  }

  const tightest = top[0];
  return [
    `我已经帮你找到了 ${top.length} 个同时接近「${conditionText}」的候选区域，当前是按“各条件之间最远距离”从近到远排的。`,
    `推荐理由：这种排法更符合真实逛街体验，因为它优先保证这些条件不是“理论上都在附近”，而是真的更容易走到一起。当前最紧凑的一组，最远点位间距大约 ${tightest.maxPairDistanceMeters} 米。`,
    "适合谁：如果你是在找能一站式完成多个目的的商圈、商场或街区，这类结果会比普通关键词搜索更有用。",
    "怎么选：优先从前 1 到前 3 个候选看起；如果你想要更严格，我可以把半径继续缩小；如果你想多找几个备选，也可以把半径放大。"
  ].join("\n\n");
}

function buildSearchAnalysis({ city, keywords, pois, top, countMode = false, estimatedCount = 0, countExhaustive = true }) {
  const rankingStats = summarizeRankingStats(pois);
  if (countMode) {
    const sampleText = top.length
      ? `我先拿高德真实结果给你核了一轮，当前这批里比较明确的样例有：${top.slice(0, 3).map((poi) => poi.name).join("、")}。`
      : "这次没有拿到足够稳定的样例门店。";
    return [
      `我先给你一个直接结论：按这轮高德真实结果核算，在 ${city || "全国"} 范围内，「${keywords}」${countExhaustive ? `共有 ${estimatedCount || pois.length}` : `至少有 ${estimatedCount || pois.length}`}家。`,
      sampleText,
      "说明一下：这种“总共有多少家”的问题，本质上是在做门店规模统计，所以我会优先回答总数，再把少量样例门店拿给你交叉确认，而不是默认只给前十家。",
      "如果你愿意，我下一步可以继续帮你拆成各区分布、官方门店名单，或者离你最近的几家。"
    ].join("\n\n");
  }
  return [
    `我用「${keywords}」在 ${city || "全国"} 范围内查到了 ${pois.length} 个高德真实 POI，当前先给你展示前 ${top.length} 个。`,
    `推荐理由：这一批结果适合作为第一轮粗筛，因为它先解决“有没有”和“都在哪”，后面再叠加条件会更稳。${rankingStats.summary}`,
    "适合谁：如果你现在的问题还比较宽，比如先找品牌、先找商圈、先找某类店，这一步刚好合适。",
    "怎么选：下一步你可以继续给我条件，比如附近、步行时间、预算、榜单、多个品牌同时存在，我可以直接在这一轮基础上继续往下筛。"
  ].join("\n\n");
}

function summarizeRankingStats(pois) {
  const stats = rankingLegendSummary(pois);
  if (!stats.total) {
    return { total: 0, summary: "目前这批结果里还没有命中你导入的榜单标记。" };
  }
  const parts = [];
  if (stats.both) parts.push(`${stats.both} 家同时命中扫街榜和必吃榜`);
  if (stats.saojiebangOnly) parts.push(`${stats.saojiebangOnly} 家命中扫街榜`);
  if (stats.bichibangOnly) parts.push(`${stats.bichibangOnly} 家命中必吃榜`);
  return {
    ...stats,
    summary: parts.length ? `另外，这批结果里还有 ${parts.join("，")}。` : "目前这批结果里还没有命中你导入的榜单标记。"
  };
}

function rankingLegendSummary(pois) {
  const summary = {
    total: 0,
    saojiebangOnly: 0,
    bichibangOnly: 0,
    both: 0
  };

  for (const poi of pois || []) {
    if (poi.rankingCategory === "both") {
      summary.total += 1;
      summary.both += 1;
    } else if (poi.rankingCategory === "saojiebang") {
      summary.total += 1;
      summary.saojiebangOnly += 1;
    } else if (poi.rankingCategory === "bichibang") {
      summary.total += 1;
      summary.bichibangOnly += 1;
    }
  }

  return summary;
}

async function maybeFinalizeAgentResponse(result, session = {}, options = {}) {
  if (options.skipNarration) return result;
  return finalizeAgentResponse(result, session);
}

async function finalizeAgentResponse(result, session = {}) {
  const deepseekNarration = await safeSummarizeWithDeepSeek(result, session);
  if (!deepseekNarration) return result;
  return {
    ...result,
    analysis: deepseekNarration.analysis || result.analysis,
    answer: deepseekNarration.answer || result.answer
  };
}

async function safeSummarizeWithDeepSeek(result, session = {}) {
  try {
    return await summarizeWithDeepSeek(result, session);
  } catch {
    return null;
  }
}

async function summarizeWithDeepSeek(result, session = {}) {
  loadEnv(path.join(rootDir, ".env"));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是 AI 地图助手。你只能根据提供给你的高德真实结果做总结，不能虚构任何地点、距离、路线、评分、榜单信息。凡是提到门店、商场、地点名称时，必须逐字使用输入数据里的原始 poi.name 或 title，绝对不要自己改写、简写、补全商场名、猜测分店名，也不要把地址改写成门店名。品牌查询默认表示官方品牌门店；如果原始结果没有明确证明某个点就是该品牌官方门店，就不要把它写进回复。宁可少说，也不要说错。输出 JSON：{\"analysis\":\"拟人化回复\",\"answer\":\"一句简明结论\"}。analysis 要用亲切、自然、像真人助理的中文来回答用户，不要机械罗列清单，要结合真实数据给出推荐，并在末尾主动发起下一轮沟通。answer 只保留一句最核心结论。"
          },
          {
            role: "system",
            content: `conversation_context=${JSON.stringify({
              context: session.context || {},
              history: Array.isArray(session.history) ? session.history.slice(-30) : []
            })}`
          },
          {
            role: "user",
            content: buildNarrationPrompt(result, session)
          }
        ]
      })
    },
    DEEPSEEK_TIMEOUT_MS,
    "DeepSeek总结"
  );
  if (!response.ok) throw new Error(`DeepSeek summarize HTTP ${response.status}`);
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("DeepSeek summarize returned empty content");
  return JSON.parse(text);
}

async function streamDeepSeekNarration(result, session = {}, res) {
  loadEnv(path.join(rootDir, ".env"));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return result.analysis || "";

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const response = await fetchWithTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          {
            role: "system",
            content:
              "你是 AI 地图助手。请严格根据高德 API 的真实结果回答，不能编造事实。凡是提到门店、商场、地点名称时，必须逐字使用输入数据里的原始 poi.name 或 title，绝对不要自己改写、简写、补全商场名、猜测分店名，也不要把地址改写成门店名。品牌查询默认表示官方品牌门店；如果原始结果没有明确证明某个点就是该品牌官方门店，就不要把它写进回复。宁可少说，也不要说错。回答要亲切、自然、拟人化，像一个会聊天的生活助理，不要机械罗列清单。你需要在结尾主动问用户下一步想继续筛什么。"
          },
          {
            role: "system",
            content: `conversation_context=${JSON.stringify({
              context: session.context || {},
              history: Array.isArray(session.history) ? session.history.slice(-30) : []
            })}`
          },
          {
            role: "user",
            content: buildNarrationPrompt(result, session)
          }
        ]
      })
    },
    DEEPSEEK_TIMEOUT_MS,
    "DeepSeek流式总结"
  );
  if (!response.ok || !response.body) {
    throw new Error(`DeepSeek stream HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = payload.choices?.[0]?.delta?.content || "";
      if (!delta) continue;
      fullText += delta;
      writeSse(res, "delta", { text: delta });
    }
  }

  return fullText.trim() || result.analysis || "";
}

function buildNarrationPrompt(result, session = {}) {
  const history = Array.isArray(session.history) ? session.history.slice(-12) : [];
  const exactNames = collectExactPoiNames(result);
  const facts = {
    question: result.question,
    city: result.city,
    intent: result.intent,
    source: result.source,
    context: result.context,
    data: result.data
  };
  return [
    `你是 AI 地图助手。用户刚才问了：${result.question}。`,
    `通过高德 API 查询到的真实数据如下：${JSON.stringify(facts, null, 2)}。`,
    `如果你需要提到具体门店或地点名称，只能从这份原始名称清单里逐字引用：${JSON.stringify(exactNames)}。`,
    `历史对话如下：${JSON.stringify(history, null, 2)}。`,
    "请结合上述真实数据，用亲切、自然的拟人化语言回答用户。回答风格要跟随问题本身：如果用户在问总数、规模、多少家，就优先直接回答数量和统计口径；如果用户在问推荐、附近、去哪儿，再进入推荐式表达。绝对不要把所有问题都回答成同一种模板。"
  ].join("\n\n");
}

function collectExactPoiNames(result) {
  const names = new Set();

  for (const poi of result?.data?.pois || []) {
    if (poi?.name) names.add(poi.name);
  }

  for (const match of result?.data?.matches || []) {
    if (match?.title) names.add(match.title);
    for (const member of match?.members || []) {
      if (member?.poi?.name) names.add(member.poi.name);
    }
  }

  return [...names].slice(0, 80);
}

async function searchTextWithMeta({ keywords, city = "", pageSize = 20, pages = 1, countMode = false }) {
  const firstPayload = await amapGet("/v3/place/text", {
    keywords,
    city,
    offset: String(pageSize),
    page: "1",
    extensions: "all",
    citylimit: city ? "true" : "false"
  });
  const rawCount = Number(firstPayload.count || 0);
  const availablePages = Math.max(1, Math.ceil(rawCount / pageSize));
  const targetPages = countMode
    ? Math.min(SEARCH_COUNT_MAX_PAGES, availablePages)
    : pages;

  const payloads = [firstPayload];
  if (targetPages > 1) {
    const requests = [];
    for (let page = 2; page <= targetPages; page += 1) {
      requests.push(
        amapGet("/v3/place/text", {
          keywords,
          city,
          offset: String(pageSize),
          page: String(page),
          extensions: "all",
          citylimit: city ? "true" : "false"
        })
      );
    }
    payloads.push(...(await Promise.all(requests)));
  }

  let pois = dedupePois(payloads.flatMap((payload) => payload.pois || []));

  const condition = parseCondition(keywords);
  if (isLikelyOfficialBrandQuery(condition)) {
    pois = dedupePois(
      (await safeRefineConditionPoisWithDeepSeek(
        condition,
        pois.filter((poi) => hasLocation(poi) && !isSuppressedPoiForQuery(condition.aliases, poi) && conditionMatchesPoi(condition, poi))
      )) || []
    );
  }

  return {
    pois,
    rawCount,
    countExhaustive: !countMode || availablePages <= SEARCH_COUNT_MAX_PAGES,
    estimatedCount: countMode ? pois.length : pois.length
  };
}

function buildNextContext({ question, plan, origin, destination }) {
  return {
    lastQuestion: question,
    lastIntent: plan?.intent || "",
    lastCity: plan?.city || origin?.city || "",
    lastAddress: plan?.address || origin?.name || origin?.formattedAddress || "",
    lastFrom: plan?.from || origin?.formattedAddress || "",
    lastTo: plan?.to || destination?.formattedAddress || "",
    lastKeywords: plan?.keywords || "",
    lastRadius: plan?.radius || "",
    lastResolvedOrigin: origin?.formattedAddress || "",
    lastUpdatedAt: new Date().toISOString()
  };
}

function findNearestPoi(location, pois, radius) {
  let nearest = null;
  for (const poi of pois) {
    const meters = distanceMeters(location, poi.location);
    if (meters > radius) continue;
    if (!nearest || meters < nearest.distanceMeters) {
      nearest = { poi, distanceMeters: meters };
    }
  }
  return nearest;
}

function centerLocation(locations) {
  const points = locations.map(parseLocation);
  const [lngSum, latSum] = points.reduce(
    ([lngTotal, latTotal], [lng, lat]) => [lngTotal + lng, latTotal + lat],
    [0, 0]
  );
  return `${(lngSum / points.length).toFixed(6)},${(latSum / points.length).toFixed(6)}`;
}

function maxPairDistance(locations) {
  let max = 0;
  for (let i = 0; i < locations.length; i += 1) {
    for (let j = i + 1; j < locations.length; j += 1) {
      max = Math.max(max, distanceMeters(locations[i], locations[j]));
    }
  }
  return max;
}

async function findCoexistingBrands({ city, brandA, brandB, radius }) {
  const [poisA, poisB] = await Promise.all([
    searchBrandVariants(brandA, city),
    searchBrandVariants(brandB, city)
  ]);

  const rawMatches = [];
  const mallCache = new Map();

  for (const a of poisA) {
    for (const b of poisB) {
      const meters = distanceMeters(a.location, b.location);
      if (meters > radius) continue;
      rawMatches.push({
        distanceMeters: Math.round(meters),
        brandA: a,
        brandB: b
      });
    }
  }

  rawMatches.sort((left, right) => left.distanceMeters - right.distanceMeters);

  const matches = [];
  for (const match of rawMatches.slice(0, 30)) {
      const a = match.brandA;
      const b = match.brandB;

      const midpoint = midpointLocation(a.location, b.location);
      const cacheKey = midpoint;
      let nearbyMalls = mallCache.get(cacheKey);
      if (!nearbyMalls) {
        nearbyMalls = await findNearbyCommercialPlaces(midpoint);
        mallCache.set(cacheKey, nearbyMalls);
      }

      matches.push({
        distanceMeters: match.distanceMeters,
        commercialArea: nearbyMalls[0] || null,
        brandA: a,
        brandB: b,
        nearbyMalls
      });
  }

  return {
    city,
    brandA,
    brandB,
    radius,
    sourceCounts: {
      [brandA]: poisA.length,
      [brandB]: poisB.length
    },
    matches: matches.slice(0, 30)
  };
}

async function searchBrandVariants(input, city) {
  const variants = input
    .split(/[,\s，、/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const keywords = variants.length ? variants : [input];
  const groups = await Promise.all(
    keywords.map((keyword) => searchText({ keywords: keyword, city, pageSize: 25, pages: 1 }))
  );
  const pois = dedupePois(groups.flat()).filter((poi) => hasLocation(poi) && !isSuppressedPoiForQuery(keywords, poi));
  return safeRefineConditionPoisWithDeepSeek({ label: input, aliases: keywords }, pois);
}

async function safeRefineConditionPoisWithDeepSeek(condition, pois) {
  try {
    return await refineConditionPoisWithDeepSeek(condition, pois);
  } catch {
    return pois;
  }
}

async function refineConditionPoisWithDeepSeek(condition, pois) {
  loadEnv(path.join(rootDir, ".env"));
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !Array.isArray(pois) || pois.length <= 3) return pois;

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  const batchSize = 40;
  const keptIds = new Set();

  for (let offset = 0; offset < pois.length; offset += batchSize) {
    const batch = pois.slice(offset, offset + batchSize).map((poi, index) => ({
      id: String(offset + index),
      name: poi.name,
      address: [poi.city, poi.district, poi.address].filter(Boolean).join(" "),
      type: poi.type
    }));

    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是高德 POI 候选过滤器。你只能根据用户目标条件和候选 POI 的名字、地址、类型做分类，不能编造新地点。输出 JSON：{\"keepIds\":[\"id1\",\"id2\"]}。保留规则必须严格：如果用户查的是品牌名，就默认理解为该品牌的官方门店/官方品牌点。不要把商场名、广场名、楼宇名、配送站、云仓、奥莱、mini、员工餐厅、内部食堂、柜台、快闪点、地址描述或无关商户算进去。判断时以候选点自己的 name 为第一依据，address 和 type 只做辅助。只要存在疑义，就宁可剔除，不要误保留。只有当候选点本身就是目标品牌、目标门店或目标业态时才保留。名字相近但不是同一品牌的点，一律剔除。"
            },
            {
              role: "user",
              content: JSON.stringify({
                target: {
                  label: condition.label,
                  aliases: condition.aliases
                },
                candidates: batch
              })
            }
          ]
        })
      },
      DEEPSEEK_TIMEOUT_MS,
      "DeepSeek候选过滤"
    );

    if (!response.ok) throw new Error(`DeepSeek filter HTTP ${response.status}`);
    const payload = await response.json();
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("DeepSeek filter returned empty content");
    const parsed = JSON.parse(text);
    for (const id of Array.isArray(parsed.keepIds) ? parsed.keepIds : []) {
      keptIds.add(String(id));
    }
  }

  return pois.filter((_, index) => keptIds.has(String(index)));
}

function isSuppressedPoiForQuery(queryTerms, poi) {
  const queryText = queryTerms.join(" ");
  if (explicitlyRequestsSuppressedPoi(queryText)) return false;

  const poiText = [poi?.name, poi?.address, poi?.district, poi?.type].filter(Boolean).join(" ");
  return matchesSuppressedPoiText(poiText);
}

function explicitlyRequestsSuppressedPoi(text) {
  return /员工餐厅|员工食堂|职工餐厅|职工食堂|内部餐厅|内部食堂|园区食堂|公司食堂/i.test(String(text || ""));
}

function matchesSuppressedPoiText(text) {
  return /员工餐厅|员工食堂|职工餐厅|职工食堂|内部餐厅|内部食堂|园区食堂|公司食堂/i.test(String(text || ""));
}

async function findNearbyCommercialPlaces(location) {
  const malls = await searchAround({ location, keywords: "购物中心", radius: 700, pageSize: 8, pages: 1 });
  return malls
    .filter((poi) => hasLocation(poi))
    .sort((left, right) => Number(left.distance || 999999) - Number(right.distance || 999999))
    .slice(0, 5);
}

async function searchText({ keywords, city = "", pageSize = 20, pages = 1 }) {
  const requests = [];
  for (let page = 1; page <= pages; page += 1) {
    requests.push(
      amapGet("/v3/place/text", {
        keywords,
        city,
        offset: String(pageSize),
        page: String(page),
        extensions: "all",
        citylimit: city ? "true" : "false"
      })
    );
  }
  const payloads = await Promise.all(requests);
  return dedupePois(payloads.flatMap((payload) => payload.pois || []));
}

async function searchAround({ location, keywords, radius = 2000, pageSize = 20, pages = 1 }) {
  const requests = [];
  for (let page = 1; page <= pages; page += 1) {
    requests.push(
      amapGet("/v3/place/around", {
        location,
        keywords,
        radius: String(radius),
        offset: String(pageSize),
        page: String(page),
        extensions: "all"
      })
    );
  }
  const payloads = await Promise.all(requests);
  return dedupePois(payloads.flatMap((payload) => payload.pois || []));
}

async function resolvePlaceAnchor(address, city = "") {
  const pois = await searchText({ keywords: address, city, pageSize: 8, pages: 1 });
  const bestPoi = chooseBestAnchorPoi(address, city, pois);
  if (bestPoi?.location) {
    return {
      formattedAddress: [bestPoi.city || city, bestPoi.district, bestPoi.address].filter(Boolean).join(" "),
      province: "",
      city: bestPoi.city || city,
      district: bestPoi.district || "",
      location: bestPoi.location,
      level: "poi",
      name: bestPoi.name
    };
  }
  return geocode(address, city);
}

function chooseBestAnchorPoi(address, city, pois) {
  const normalizedAddress = normalizeLooseText(address);
  const normalizedCity = normalizeLooseText(city);
  if (!pois.length) return null;
  const scored = pois.map((poi) => {
    const poiName = normalizeLooseText(poi.name);
    const poiAddress = normalizeLooseText([poi.city, poi.district, poi.address].filter(Boolean).join(" "));
    let score = 0;
    if (poiName === normalizedAddress) score += 100;
    else if (poiName.includes(normalizedAddress) || normalizedAddress.includes(poiName)) score += 60;
    if (normalizedCity && normalizeLooseText(poi.city).includes(normalizedCity)) score += 40;
    if (normalizedCity && poiAddress.includes(normalizedCity)) score += 20;
    return { poi, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].poi;
}

async function geocode(address, city = "") {
  const payload = await amapGet("/v3/geocode/geo", {
    address,
    city
  });
  const geocodeResult = payload.geocodes?.[0];
  if (!geocodeResult?.location) {
    throw new Error(`没有找到地址：${address}`);
  }
  return normalizeGeocode(geocodeResult);
}

async function walkingRoute(origin, destination) {
  const payload = await amapGet("/v3/direction/walking", {
    origin,
    destination
  });
  const path = payload.route?.paths?.[0];
  if (!path) {
    throw new Error("没有找到步行路线");
  }

  return {
    distanceMeters: Number(path.distance || 0),
    durationSeconds: Number(path.duration || 0),
    steps: (path.steps || []).map((step) => ({
      instruction: step.instruction,
      road: step.road,
      distanceMeters: Number(step.distance || 0),
      durationSeconds: Number(step.duration || 0)
    }))
  };
}

async function amapGet(endpoint, params) {
  for (let attempt = 0; attempt <= AMAP_RATE_LIMIT_RETRY_COUNT; attempt += 1) {
    await waitForAmapSlot();
    const amapKey = getAmapKey();
    const url = new URL(endpoint, AMAP_BASE);
    url.searchParams.set("key", amapKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetchWithTimeout(url, {}, AMAP_TIMEOUT_MS, "高德接口");
    if (!response.ok) {
      throw new Error(`高德接口 HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.status === "1") {
      return payload;
    }

    if (isAmapRateLimitError(payload) && attempt < AMAP_RATE_LIMIT_RETRY_COUNT) {
      const backoff = AMAP_RATE_LIMIT_BACKOFF_MS * (attempt + 1);
      nextAmapRequestAt = Math.max(nextAmapRequestAt, Date.now() + backoff);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      continue;
    }

    throw new Error(payload.info || payload.infocode || "高德接口返回失败");
  }
}

function isAmapRateLimitError(payload) {
  const text = `${payload?.info || ""} ${payload?.infocode || ""}`.toUpperCase();
  return text.includes("CUQPS_HAS_EXCEEDED_THE_LIMIT") || text.includes("USER_DAILY_QUERY_OVER_LIMIT");
}

function waitForAmapSlot() {
  const waiting = amapQueue.then(async () => {
    const now = Date.now();
    const delay = Math.max(0, nextAmapRequestAt - now);
    nextAmapRequestAt = Math.max(now, nextAmapRequestAt) + AMAP_MIN_INTERVAL_MS;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  });
  amapQueue = waiting.catch(() => {});
  return waiting;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000, label = "请求") {
  for (let attempt = 0; attempt <= OUTBOUND_FETCH_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        if (attempt < OUTBOUND_FETCH_RETRY_COUNT) {
          await waitBeforeRetry(attempt);
          continue;
        }
        throw new Error(`${label}超时，请稍后重试`);
      }

      const message = String(error?.message || "");
      const retryable =
        error instanceof TypeError ||
        /fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket/i.test(message);
      if (retryable && attempt < OUTBOUND_FETCH_RETRY_COUNT) {
        await waitBeforeRetry(attempt);
        continue;
      }
      throw new Error(retryable ? `${label}网络波动，请稍后重试` : message || `${label}失败`);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function waitBeforeRetry(attempt) {
  const delay = OUTBOUND_FETCH_RETRY_BACKOFF_MS * (attempt + 1);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function getAmapKey() {
  loadEnv(path.join(rootDir, ".env"));
  return process.env.AMAP_KEY || "";
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname === "/mobile" ? "/mobile.html" : pathname;
  const normalized = path.normalize(decodeURIComponent(safePath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end(data);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function dedupePois(pois) {
  const seen = new Set();
  const results = [];
  for (const poi of pois) {
    const normalized = normalizePoi(poi);
    const key = normalized.id || `${normalized.name}|${normalized.address}|${normalized.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
  }
  return results;
}

function loadRankingLists() {
  try {
    const raw = existsSync(rankingListsPath) ? parseJsonFile(rankingListsPath) : { saojiebang: [], bichibang: [], bibendum: [] };
    const resolved = existsSync(rankingResolvedPath)
      ? parseJsonFile(rankingResolvedPath)
      : { saojiebang: [], bichibang: [], bibendum: [] };

    return {
      raw,
      resolved,
      saojiebang: normalizeRankingEntries(resolved.saojiebang?.length ? resolved.saojiebang : raw.saojiebang),
      bichibang: normalizeRankingEntries(resolved.bichibang?.length ? resolved.bichibang : raw.bichibang),
      bibendum: normalizeRankingEntries(resolved.bibendum?.length ? resolved.bibendum : raw.bibendum)
    };
  } catch {
    return {
      raw: { saojiebang: [], bichibang: [], bibendum: [] },
      resolved: { saojiebang: [], bichibang: [], bibendum: [] },
      saojiebang: [],
      bichibang: [],
      bibendum: []
    };
  }
}

function parseJsonFile(filePath) {
  return JSON.parse(String(readFileSync(filePath, "utf8")).replace(/^\uFEFF/, ""));
}

function normalizeRankingEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          name: entry,
          address: "",
          normalizedName: normalizeLooseText(entry),
          normalizedAddress: ""
        };
      }

      return {
        name: textOrEmpty(entry.name || entry.title),
        address: textOrEmpty(entry.address),
        location: textOrEmpty(entry.location),
        cuisine: textOrEmpty(entry.cuisine || entry.category || entry.type),
        price: textOrEmpty(entry.price || entry.avgPrice || entry.averagePrice),
        district: textOrEmpty(entry.district || entry.region),
        area: textOrEmpty(entry.area),
        amapName: textOrEmpty(entry.amapName),
        normalizedName: normalizeLooseText(entry.name || entry.title),
        normalizedAddress: normalizeLooseText(entry.address)
      };
    })
    .filter((entry) => entry.normalizedName);
}

async function resolveRankingLists(lists, city) {
  return {
    saojiebang: await resolveRankingCategoryEntries(lists?.saojiebang || [], city),
    bichibang: await resolveRankingCategoryEntries(lists?.bichibang || [], city),
    bibendum: await resolveRankingCategoryEntries(lists?.bibendum || [], city)
  };
}

async function resolveRankingCategoryEntries(entries, city) {
  const normalized = normalizeRankingEntries(entries);
  const results = [];

  for (const entry of normalized) {
    if (entry.address && entry.location) {
      results.push({
        name: entry.name,
        address: entry.address,
        location: entry.location,
        cuisine: entry.cuisine || "",
        price: entry.price || "",
        district: entry.district || "",
        area: entry.area || "",
        amapName: entry.amapName || ""
      });
      continue;
    }

    const pois = await searchText({ keywords: entry.name, city, pageSize: 8, pages: 1 });
    const best = chooseBestRankingPoi(entry, pois);
    results.push({
      name: entry.name,
      address: best?.address || "",
      location: best?.location || "",
      amapName: best?.name || "",
      district: best?.district || "",
      cuisine: entry.cuisine || "",
      price: entry.price || "",
      area: entry.area || ""
    });
  }

  return results;
}

function chooseBestRankingPoi(entry, pois) {
  if (!pois.length) return null;
  const entryName = normalizeLooseText(entry.name);
  const scored = pois.map((poi) => {
    const poiName = normalizeLooseText(poi.name);
    const poiAddress = normalizeLooseText([poi.district, poi.address].filter(Boolean).join(" "));
    let score = 0;
    if (poiName === entryName) score += 100;
    else if (poiName.includes(entryName) || entryName.includes(poiName)) score += 60;
    if (entry.normalizedAddress && poiAddress.includes(entry.normalizedAddress)) score += 30;
    return { poi, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].poi;
}

function persistResolvedRankingLists(resolved) {
  try {
    if (!existsSync(dataDir)) return;
    writeFileSync(rankingResolvedPath, JSON.stringify(resolved, null, 2), "utf8");
  } catch {
    // ignore cache persistence failure
  }
}

function buildRankingMapEntries({ raw, resolved }) {
  const categories = [
    { key: "saojiebang", label: "扫街榜", rawEntries: raw?.saojiebang || [], resolvedEntries: resolved?.saojiebang || [] },
    { key: "bichibang", label: "必吃榜", rawEntries: raw?.bichibang || [], resolvedEntries: resolved?.bichibang || [] },
    { key: "bibendum", label: "必比登", rawEntries: raw?.bibendum || [], resolvedEntries: resolved?.bibendum || [] }
  ];

  const merged = new Map();
  for (const category of categories) {
    const normalizedRaw = normalizeRankingEntries(category.rawEntries);
    const normalizedResolved = normalizeRankingEntries(category.resolvedEntries);
    normalizedResolved.forEach((entry, index) => {
      if (!entry.location) return;
      const source = normalizedRaw[index] || {};
      const key = entry.location || `${entry.normalizedName}|${entry.normalizedAddress}`;
      const current = merged.get(key) || {
        id: key,
        name: entry.amapName || entry.name,
        sourceNames: [],
        address: entry.address || "",
        location: entry.location,
        district: entry.district || source.district || "",
        area: source.area || entry.area || "",
        cuisine: source.cuisine || entry.cuisine || "",
        price: source.price || entry.price || "",
        categories: [],
        labels: []
      };

      current.name = choosePreferredRankingName(current.name, entry.amapName || entry.name);
      current.address = current.address || entry.address || "";
      current.district = current.district || entry.district || source.district || "";
      current.area = current.area || source.area || entry.area || "";
      current.cuisine = current.cuisine || source.cuisine || entry.cuisine || "";
      current.price = current.price || source.price || entry.price || "";
      current.categories = [...new Set([...current.categories, category.key])];
      current.labels = [...new Set([...current.labels, category.label])];
      current.sourceNames = [...new Set([...current.sourceNames, source.name || entry.name].filter(Boolean))];
      merged.set(key, current);
    });
  }

  return [...merged.values()]
    .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
    .map((item) => ({
      ...item,
      rankingCategory: rankingCategoryFromKeys(item.categories)
    }));
}

function choosePreferredRankingName(currentName, candidateName) {
  const current = String(currentName || "").trim();
  const candidate = String(candidateName || "").trim();
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.length > current.length ? candidate : current;
}

function rankingCategoryFromKeys(keys) {
  const unique = [...new Set(keys || [])];
  if (unique.length > 1) return "multi";
  return unique[0] || "";
}

function tagRankingsForPois(pois) {
  const lists = loadRankingLists();
  return pois.map((poi) => applyRankingTags(poi, lists));
}

function applyRankingTags(poi, lists) {
  const matchedSaojie = lists.saojiebang.some((entry) => rankingEntryMatchesPoi(entry, poi));
  const matchedBichi = lists.bichibang.some((entry) => rankingEntryMatchesPoi(entry, poi));
  const matchedBibendum = lists.bibendum.some((entry) => rankingEntryMatchesPoi(entry, poi));
  const rankingLabels = [];
  let rankingCategory = "";

  if (matchedSaojie) rankingLabels.push("扫街榜");
  if (matchedBichi) rankingLabels.push("必吃榜");
  if (matchedBibendum) rankingLabels.push("必比登");

  if ([matchedSaojie, matchedBichi, matchedBibendum].filter(Boolean).length > 1) rankingCategory = "multi";
  else if (matchedSaojie) rankingCategory = "saojiebang";
  else if (matchedBichi) rankingCategory = "bichibang";
  else if (matchedBibendum) rankingCategory = "bibendum";

  return {
    ...poi,
    rankingLabels,
    rankingCategory
  };
}

function rankingEntryMatchesPoi(entry, poi) {
  const poiName = normalizeLooseText(poi.name);
  const poiAddress = normalizeLooseText([poi.district, poi.address].filter(Boolean).join(" "));
  if (!poiName || !entry.normalizedName) return false;

  const nameMatched = poiName.includes(entry.normalizedName) || entry.normalizedName.includes(poiName);
  if (!nameMatched) return false;

  if (!entry.normalizedAddress) return true;
  if (!poiAddress) return false;

  return poiAddress.includes(entry.normalizedAddress) || entry.normalizedAddress.includes(poiAddress);
}

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[（）()·•,，.。:：\-—_|｜/\\]/g, "")
    .replace(/(上海市|北京市|广州市|深圳市|杭州市)/g, "")
    .replace(/(店铺|门店|分店|旗舰店|店)/g, "");
}

function normalizePoi(poi) {
  return {
    id: textOrEmpty(poi.id),
    name: textOrEmpty(poi.name),
    type: textOrEmpty(poi.type),
    address: textOrEmpty(poi.address),
    city: textOrEmpty(poi.cityname),
    district: textOrEmpty(poi.adname),
    location: textOrEmpty(poi.location),
    tel: textOrEmpty(poi.tel),
    distance: textOrEmpty(poi.distance)
  };
}

function normalizeGeocode(item) {
  return {
    formattedAddress: textOrEmpty(item.formatted_address),
    province: textOrEmpty(item.province),
    city: textOrEmpty(item.city),
    district: textOrEmpty(item.district),
    location: textOrEmpty(item.location),
    level: textOrEmpty(item.level)
  };
}

function hasLocation(item) {
  return /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(item.location || "");
}

function distanceMeters(a, b) {
  const [lng1, lat1] = parseLocation(a);
  const [lng2, lat2] = parseLocation(b);
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function midpointLocation(a, b) {
  const [lng1, lat1] = parseLocation(a);
  const [lng2, lat2] = parseLocation(b);
  return `${((lng1 + lng2) / 2).toFixed(6)},${((lat1 + lat2) / 2).toFixed(6)}`;
}

function parseLocation(location) {
  return location.split(",").map(Number);
}

function requiredParam(url, name) {
  const value = url.searchParams.get(name)?.trim();
  if (!value) {
    throw new Error(`缺少参数：${name}`);
  }
  return value;
}

function walkMinutesToRadius(minutes) {
  return Math.max(200, Math.round(Number(minutes) * 80));
}

function textOrEmpty(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return value == null ? "" : String(value);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function setupSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Connection: "keep-alive"
  });
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("请求内容太大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求 JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
