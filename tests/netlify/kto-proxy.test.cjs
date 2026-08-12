const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../../netlify/functions/kto-proxy.js");

const event = {
  httpMethod: "GET",
  queryStringParameters: { areaCode: "39", contentTypeId: "12", numOfRows: "1" },
};

test("requires the server-only KTO_API_KEY", async () => {
  const previous = process.env.KTO_API_KEY;
  delete process.env.KTO_API_KEY;
  try {
    const response = await handler(event);
    assert.equal(response.statusCode, 500);
    assert.equal(JSON.parse(response.body).source, undefined);
  } finally {
    if (previous !== undefined) process.env.KTO_API_KEY = previous;
  }
});

test("returns provenance only for a successful non-empty KTO response", async () => {
  const previousKey = process.env.KTO_API_KEY;
  const previousFetch = global.fetch;
  process.env.KTO_API_KEY = "test-only";
  global.fetch = async (url) => {
    assert.match(String(url), /KorService2\/areaBasedList2/);
    assert.match(String(url), /areaCode=39/);
    return {
      ok: true,
      json: async () => ({ response: { header: { resultCode: "0000" }, body: { items: { item: [{ title: "성산일출봉", addr1: "제주", contentid: "1", contenttypeid: "12" }] } } } }),
    };
  };
  try {
    const response = await handler(event);
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(body.spots.length, 1);
    assert.match(body.source.api, /KorService2 \/ areaBasedList2/);
    assert.ok(body.source.fields.includes("관광지명(title)"));
  } finally {
    if (previousKey === undefined) delete process.env.KTO_API_KEY;
    else process.env.KTO_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});

test("does not attach KTO provenance to an empty response", async () => {
  const previousKey = process.env.KTO_API_KEY;
  const previousFetch = global.fetch;
  process.env.KTO_API_KEY = "test-only";
  global.fetch = async () => ({ ok: true, json: async () => ({ response: { header: { resultCode: "0000" }, body: { items: "" } } }) });
  try {
    const body = JSON.parse((await handler(event)).body);
    assert.deepEqual(body.spots, []);
    assert.equal(body.source, null);
  } finally {
    if (previousKey === undefined) delete process.env.KTO_API_KEY;
    else process.env.KTO_API_KEY = previousKey;
    global.fetch = previousFetch;
  }
});
