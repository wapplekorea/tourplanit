const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

function planPrompt({ form, spots, dayCount }) {
  const schedule = Array.from({ length: dayCount }, (_, index) =>
    `{"day":"Day ${index + 1}","morning":"구체적 오전 일정","afternoon":"구체적 오후 일정","evening":"구체적 저녁 일정","tip":"실무 운영 팁"}`,
  ).join(",");
  return `다음 JSON 형식만 반환하세요. 다른 설명이나 마크다운은 쓰지 마세요.
조건: 지역=${form.region}, 기간=${form.duration}, 테마=${form.theme}, 타깃=${form.target}, 예산=${form.budget || "중간"}, 운영조건=${form.special || "없음"}, 관광지=${spots}
규칙: 일정은 정확히 ${dayCount}일, 확인되지 않은 가격·영업시간·예약 가능 여부를 사실처럼 단정하지 말 것. 모든 문자열은 한 줄.
{"productName":"상품명","slogan":"슬로건","concept":"컨셉 설명","schedule":[${schedule}],"highlights":["핵심 1","핵심 2","핵심 3"],"included":["포함 1","포함 2","포함 3","포함 4"],"excluded":["불포함 1","불포함 2","불포함 3"],"targetDesc":"타깃 설명","estimatedPrice":"1인 예상 가격대","instagram":"인스타 문구","blog":"블로그 소개","kakao":"카카오 홍보 문구"}`;
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
    const prompt = payload.kind === "blog" ? blogPrompt(payload.plan || {}) : planPrompt(payload);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: payload.kind === "blog" ? 2800 : 4000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json();
    if (!response.ok) return json(response.status, { error: data?.error?.message || "AI API 요청에 실패했습니다." });
    const text = data?.content?.[0]?.text?.trim() || "";
    if (payload.kind === "blog") return json(200, { text });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) return json(422, { error: "AI 응답 형식을 읽지 못했습니다. 다시 시도하세요." });
    return json(200, { plan: JSON.parse(text.slice(start, end + 1)) });
  } catch (error) {
    return json(500, { error: error.message || "AI 초안 생성 중 오류가 발생했습니다." });
  }
};
