const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("./ai-draft.js");

test("normalizes missing and UNKNOWN promotion fields with useful copy", () => {
  const plan = _test.normalizePlan({
    productName: "제주 여행",
    schedule: [{ day: "Day 1", morning: "공항 집결", afternoon: "해변", evening: "숙소" }],
    instagram: "<UNKNOWN>", blog: null, kakao: "undefined",
  }, 1, { region: "제주", duration: "당일치기", theme: "자연/힐링", target: "가족" });
  assert.match(plan.instagram, /제주/);
  assert.match(plan.blog, /제주/);
  assert.match(plan.kakao, /제주/);
  assert.doesNotMatch(JSON.stringify(plan), /UNKNOWN|null|undefined/i);
});

test("extracts tool input and JSON text responses", () => {
  assert.deepEqual(_test.extractPlan({ content: [{ type: "tool_use", name: "submit_travel_plan", input: { productName: "A" } }] }), { productName: "A" });
  assert.deepEqual(_test.extractPlan({ content: [{ type: "text", text: "```json\n{\"productName\":\"B\"}\n```" }] }), { productName: "B" });
});

test("fills an incomplete schedule to the requested length", () => {
  const plan = _test.normalizePlan({}, 3, { region: "부산", duration: "2박 3일", theme: "미식", target: "친구" });
  assert.equal(plan.schedule.length, 3);
  assert.ok(plan.schedule.every((day) => day.morning && day.afternoon && day.evening && day.tip));
});

test("does not disguise an upstream API authentication failure as fallback success", async () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = "test-only";
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: "invalid x-api-key" } }),
  });
  try {
    const response = await require("./ai-draft.js").handler({
      httpMethod: "POST",
      body: JSON.stringify({ kind: "plan", dayCount: 1, form: { region: "제주" }, spots: "성산일출봉" }),
    });
    assert.equal(response.statusCode, 401);
    assert.match(JSON.parse(response.body).error, /invalid x-api-key/);
    assert.equal(JSON.parse(response.body).plan, undefined);
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});
