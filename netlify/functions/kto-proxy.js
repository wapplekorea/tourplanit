// KTO (한국관광공사) OpenAPI 프록시
// CORS 문제를 해결하기 위해 서버사이드에서 API 호출

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { areaCode = "1", contentTypeId = "12", numOfRows = "20" } =
      event.queryStringParameters || {};

    const apiKey = process.env.VITE_KTO_API_KEY || "";
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "KTO API key not configured" }),
      };
    }

    const decodedKey = decodeURIComponent(apiKey);

    const params = new URLSearchParams({
      serviceKey: decodedKey,
      numOfRows,
      pageNo: "1",
      MobileOS: "ETC",
      MobileApp: "TourPlanit",
      _type: "json",
      areaCode,
      ...(contentTypeId && { contentTypeId }),
    });

    const url = `https://apis.data.go.kr/B551011/KorService1/areaBasedList1?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`KTO API responded with status ${response.status}`);
    }

    const data = await response.json();
    const items = data?.response?.body?.items?.item || [];

    const spots = Array.isArray(items)
      ? items.map((item) => ({
          title: item.title,
          addr: item.addr1,
          image: item.firstimage || item.firstimage2 || "",
          contentId: item.contentid,
          contentTypeId: item.contenttypeid,
        }))
      : items.title
      ? [{ title: items.title, addr: items.addr1, image: items.firstimage || "", contentId: items.contentid, contentTypeId: items.contenttypeid }]
      : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ spots }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
