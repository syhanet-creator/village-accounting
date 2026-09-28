// Vercel 서버리스 함수: 사이드바 메뉴(링크) 클릭 수를 MongoDB에 기록/조회한다.
// GET  /api/clicks              -> { counts: { [linkId]: number }, total: number }
// POST /api/clicks {linkId}     -> { linkId, count }
const { MongoClient } = require("mongodb");

// 이 화면 이동 메뉴들만 클릭 수를 기록한다(그 외 값은 거부해 남용을 막는다).
// index.html의 NAV_ITEMS 키와 반드시 같아야 한다.
const ALLOWED_LINK_IDS = new Set([
  "dashboard", "voucher", "ledger", "accounts", "asset", "contract", "reports", "yearend", "settings",
]);

let cachedClientPromise = null;
function getClient() {
  if (!cachedClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다.");
    cachedClientPromise = new MongoClient(uri).connect();
  }
  return cachedClientPromise;
}

module.exports = async (req, res) => {
  try {
    const client = await getClient();
    const col = client.db("village_accounting").collection("link_clicks");

    if (req.method === "GET") {
      const docs = await col.find({}).toArray();
      const counts = {};
      let total = 0;
      for (const d of docs) {
        counts[d._id] = d.count || 0;
        total += d.count || 0;
      }
      res.status(200).json({ counts, total });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body || "{}"); } catch (e) { body = {}; }
      }
      const linkId = body && body.linkId;
      if (typeof linkId !== "string" || !ALLOWED_LINK_IDS.has(linkId)) {
        res.status(400).json({ error: "invalid linkId" });
        return;
      }
      const result = await col.findOneAndUpdate(
        { _id: linkId },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: "after" }
      );
      const count = (result && result.value && result.value.count) || 1;
      res.status(200).json({ linkId, count });
      return;
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    // 원인 파악을 위해 실제 오류 메시지를 그대로 내려준다(비밀번호 등 민감정보는 포함되지 않음).
    res.status(500).json({ error: "server error", detail: e && e.message });
  }
};
