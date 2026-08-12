const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

// Netlify Functions has a short execution window.  The draft must be concise
// enough to return reliably; the model can still be overridden per environment.
const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const AI_TIMEOUT_MS = 24_000;

const PLAN_TOOL = {
  name: "submit_travel_plan",
  description: "Return a complete travel plan ready for TourPlanit to render.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "productName",
      "slogan",
      "concept",
      "schedule",
      "highlights",
      "included",
      "excluded",
      "targetDesc",
      "estimatedPrice",
      "instagram",
      "blog",
      "kakao",
    ],
    properties: {
      productName: { type: "string" },
      slogan: { type: "string" },
      concept: { type: "string" },
      schedule: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["day", "morning", "afternoon", "evening", "tip"],
          properties: {
            day: { type: "string" },
            morning: { type: "string" },
            afternoon: { type: "string" },
            evening: { type: "string" },
            tip: { type: "string" },
          },
        },
      },
      highlights: { type: "array", items: { type: "string" } },
      included: { type: "array", items: { type: "string" } },
      excluded: { type: "array", items: { type: "string" } },
      targetDesc: { type: "string" },
      estimatedPrice: { type: "string" },
      instagram: { type: "string" },
      blog: { type: "string" },
      kakao: { type: "string" },
    },
  },
};

function planPrompt({ form, spots, dayCount }) {
  return `관광상품 기획 전문가로서 아래 조건을 바탕으로 TourPlanit에 바로 표시할 여행상품 초안을 작성하세요.
조건: 지역=${form.region}, 기간=${form.duration}, 테마=${form.theme}, 타깃=${form.target}, 예산=${form.budget || "중간"}, 운영조건=${form.special || "없음"}, 관광지=${spots}
규칙: 일정은 정확히 ${dayCount}일, 각 일정 칸은 한 문장으로 간결하게 작성할 것. 확인되지 않은 가격·영업시간·예약 가능 여부를 사실처럼 단정하지 말 것. 모든 문자열은 한 줄. 제출 도구로 완성된 초안을 반환하세요.`;
}

function oneLine(value) {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/<UNKNOWN>|\bUNKNOWN\b|null|undefined/gi, " ").replace(/\s+/g, " ").trim();
  return cleaned === "-" ? "" : cleaned;
}

function toStringList(value) {
  return Array.isArray(value) ? value.map(oneLine).filter(Boolean) : [];
}

function fallbackCopy(form = {}) {
  const region = oneLine(form.region) || "선택 지역";
  const duration = oneLine(form.duration) || "선택 일정";
  const theme = oneLine(form.theme) || "맞춤 여행";
  const target = oneLine(form.target) || "여행 고객";
  return {
    productName: `${region} ${theme} 여행`,
    slogan: `${target}을 위한 ${duration} 여행 초안`,
    concept: `${region}의 대표 장소를 ${theme} 관점으로 연결한 ${duration} 상품 초안입니다. 장소별 운영 여부와 이동 동선은 담당자가 확인해야 합니다.`,
    highlights: [`${region} 대표 장소 중심의 동선`, `${theme}에 맞춘 일정 구성`, "운영 전 최신 정보와 예약 조건 확인"],
    included: ["일정표에 기재된 관광 일정", "기획 단계의 기본 운영 항목"],
    excluded: ["개인 경비", "확정 전 선택 관광·추가 비용"],
    targetDesc: `${target} 고객을 기준으로 작성한 검토용 상품 초안입니다.`,
    estimatedPrice: oneLine(form.budget) || "요청 조건에 따라 별도 산정",
    instagram: `${region}에서 만나는 ${theme} 여행. ${duration} 일정의 핵심만 담았습니다. 상세 일정과 판매 조건은 문의 후 확인해 주세요. #${region}여행 #여행상품`,
    blog: `${region} ${theme} 여행을 준비하는 고객을 위한 ${duration} 상품 초안입니다. 일정과 포함 조건은 담당자 검토 후 확정됩니다.`,
    kakao: `${region} ${duration} ${theme} 여행을 소개합니다. 일정·가격·예약 가능 여부는 상담 시 확인해 주세요.`,
  };
}

function fallbackSchedule(dayCount, form = {}) {
  const region = oneLine(form.region) || "선택 지역";
  return Array.from({ length: dayCount }, (_, index) => ({
    day: `Day ${index + 1}`,
    morning: index === 0 ? `${region} 집결 후 이동 동선 확인` : `${region} 주요 장소 오전 일정 검토`,
    afternoon: `${region} 추천 관광지와 식사 동선 검토`,
    evening: index === dayCount - 1 ? "귀환 또는 해산 일정 확인" : "숙박·저녁 일정과 운영 조건 확인",
    tip: "운영시간, 이동시간, 예약 가능 여부는 담당자가 최신 정보로 확인하세요.",
  }));
}

function normalizePlan(raw, dayCount, form = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const fallback = fallbackCopy(form);
  const schedule = Array.isArray(raw.schedule)
    ? raw.schedule.slice(0, dayCount).map((item, index) => ({
        day: oneLine(item?.day) || `Day ${index + 1}`,
        morning: oneLine(item?.morning),
        afternoon: oneLine(item?.afternoon),
        evening: oneLine(item?.evening),
        tip: oneLine(item?.tip),
      }))
    : [];

  const completeSchedule = fallbackSchedule(dayCount, form).map((base, index) => ({ ...base, ...(schedule[index] || {}) }));

  return {
    productName: oneLine(raw.productName) || fallback.productName,
    slogan: oneLine(raw.slogan) || fallback.slogan,
    concept: oneLine(raw.concept) || fallback.concept,
    schedule: completeSchedule,
    highlights: toStringList(raw.highlights).length ? toStringList(raw.highlights) : fallback.highlights,
    included: toStringList(raw.included).length ? toStringList(raw.included) : fallback.included,
    excluded: toStringList(raw.excluded).length ? toStringList(raw.excluded) : fallback.excluded,
    targetDesc: oneLine(raw.targetDesc) || fallback.targetDesc,
    estimatedPrice: oneLine(raw.estimatedPrice) || fallback.estimatedPrice,
    instagram: oneLine(raw.instagram) || fallback.instagram,
    blog: oneLine(raw.blog) || fallback.blog,
    kakao: oneLine(raw.kakao) || fallback.kakao,
  };
}

function extractPlan(data) {
  const toolUse = data?.content?.find((block) => block.type === "tool_use" && block.name === PLAN_TOOL.name);
  if (toolUse?.input && typeof toolUse.input === "object") return toolUse.input;
  const text = data?.content?.filter((block) => block.type === "text").map((block) => block.text || "").join("\n");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

function blogPrompt(plan) {
  return `네이버 블로그용 여행상품 소개 초안을 한국어로 작성하세요. 사실 여부가 확인되지 않은 가격·운영시간·포함 조건은 확정 표현하지 말고, 담당자가 검토해야 한다고 자연스럽게 적으세요. 마크다운 없이 소제목 3개와 본문, 마지막 문의 CTA와 해시태그 12개 이상을 포함하세요.
상품=${plan.productName}\n슬로건=${plan.slogan}\n지역=${plan.region}\n기간=${plan.duration}\n테마=${plan.theme}\n타깃=${plan.target}\n컨셉=${plan.concept}\n일정=${(plan.schedule || []).map(d => `${d.day}: ${d.morning}/${d.afternoon}/${d.evening}`).join(" | ")}\n핵심=${(plan.highlights || []).join(", ")}\n예상 가격=${plan.estimatedPrice}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "POST 요청만 지원합니다." });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(503, { error: "AI 초안 기능이 아직 설정되지 않았습니다. 관리자에게 ANTHROPIC_API_KEY 설정을 요청하세요." });
  try {
    const payload = JSON.parse(event.body || "{}");
    const dayCount = Math.min(5, Math.max(1, Number(payload.dayCount) || 1));
    const prompt = payload.kind === "blog"
      ? blogPrompt(payload.plan || {})
      : planPrompt({ ...payload, dayCount });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    let response;
    try {
      const aiRequest = {
        model: AI_MODEL,
        max_tokens: payload.kind === "blog" ? 1600 : 1800,
        messages: [{ role: "user", content: prompt }],
      };
      if (payload.kind !== "blog") {
        aiRequest.tools = [PLAN_TOOL];
        aiRequest.tool_choice = { type: "tool", name: PLAN_TOOL.name };
      }
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(aiRequest),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(response.status, { error: data?.error?.message || "AI API 요청에 실패했습니다." });
    if (payload.kind === "blog") {
      const text = data?.content?.filter((block) => block.type === "text").map((block) => block.text || "").join("\n").trim();
      if (!oneLine(text)) return json(422, { error: "AI가 블로그 초안을 반환하지 못했습니다. 잠시 후 다시 시도해주세요." });
      return json(200, { text });
    }

    const rawPlan = extractPlan(data);
    const plan = normalizePlan(rawPlan || {}, dayCount, payload.form || {});
    const recovered = !rawPlan;
    if (recovered) console.error("[ai-draft] invalid structured response; returned explicit local fallback draft");
    return json(200, {
      plan,
      generation: recovered
        ? { status: "fallback", warning: "AI 응답 형식을 읽지 못해 입력 조건 기반의 검토용 초안을 표시합니다." }
        : { status: "ai" },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return json(504, { error: "AI 응답 시간이 길어 초안 생성을 중단했습니다. 잠시 후 다시 시도해주세요." });
    }
    console.error("[ai-draft] unexpected error", error?.message || "unknown error");
    return json(500, { error: "AI 초안 생성 중 오류가 발생했습니다. 다시 시도해주세요." });
  }
};

exports._test = { oneLine, normalizePlan, extractPlan, fallbackCopy, fallbackSchedule };
