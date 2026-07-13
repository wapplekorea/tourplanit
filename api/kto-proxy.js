// KTO (한국관광공사) OpenAPI 프록시 - Vercel Serverless Function

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { areaCode = "1", contentTypeId = "12", numOfRows = "20" } = req.query;

    const apiKey = process.env.VITE_KTO_API_KEY || "";
    if (!apiKey) {
      return res.status(500).json({ error: "KTO API key not configured" });
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

    const url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(500).json({ error: `KTO API error: ${response.status}` });
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

    return res.status(200).json({ spots });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
