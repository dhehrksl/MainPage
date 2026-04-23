import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "./.env" });

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ─────────────────────────────────────
// 1) Gemini 초기화
// ─────────────────────────────────────
console.log("✅ GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? "로드됨" : "(없음)");

let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
} catch (err) {
  console.error("❌ GoogleGenerativeAI 초기화 실패:", err.message);
}

// ─────────────────────────────────────
// 2) MongoDB 연결 (실패해도 서버는 계속 동작)
// ─────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/qa_platform";
let dbReady = false;

mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 })
  .then(() => {
    dbReady = true;
    console.log(`✅ MongoDB 연결됨: ${MONGODB_URI}`);
  })
  .catch((err) => {
    console.warn(`⚠️  MongoDB 연결 실패 (${err.message}) — CRUD API는 503 반환, 프론트는 localStorage로 동작합니다.`);
  });

// DB 준비 여부를 라우트에서 체크하는 미들웨어
const requireDb = (req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({ error: "DB가 연결되지 않았습니다. MongoDB를 실행 후 서버를 재시작하세요." });
  }
  next();
};

// ─────────────────────────────────────
// 3) 스키마 / 모델
// ─────────────────────────────────────
const TestcaseSchema = new mongoose.Schema(
  {
    tcId: { type: String, unique: true, index: true }, // TC-0001 형식
    title: { type: String, required: true },
    description: String,
    expectedResult: String,
    status: { type: String, default: "Pending" }, // Pending/Pass/Fail/Blocked/Skip
    priority: { type: String, default: "Medium" },
    category: String,
  },
  { timestamps: true }
);

const BugSchema = new mongoose.Schema(
  {
    bugId: { type: String, unique: true, index: true }, // BUG-0001
    title: { type: String, required: true },
    description: String,
    stepsToReproduce: String,
    severity: { type: String, default: "Major" },
    priority: { type: String, default: "Medium" },
    status: { type: String, default: "Open" },
    assignee: String,
    environment: String,
    relatedTC: String, // TC-0001 참조
    resolvedAt: Date,
  },
  { timestamps: true }
);

const PostSchema = new mongoose.Schema(
  {
    postId: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: String, default: "익명" },
    category: { type: String, default: "기타" },
    date: String,
  },
  { timestamps: true }
);

const UtteranceSchema = new mongoose.Schema(
  {
    base: { type: String, required: true },
    similars: [String],
    numSimilars: Number,
    source: { type: String, default: "manual" }, // manual | excel
  },
  { timestamps: true }
);

const Testcase = mongoose.model("Testcase", TestcaseSchema);
const Bug = mongoose.model("Bug", BugSchema);
const Post = mongoose.model("Post", PostSchema);
const Utterance = mongoose.model("Utterance", UtteranceSchema);

// ID 자동 생성 헬퍼
const nextTcId = async () => {
  const last = await Testcase.findOne().sort({ createdAt: -1 }).lean();
  const n = last?.tcId ? parseInt(last.tcId.replace("TC-", ""), 10) : 0;
  return `TC-${String(n + 1).padStart(4, "0")}`;
};
const nextBugId = async () => {
  const last = await Bug.findOne().sort({ createdAt: -1 }).lean();
  const n = last?.bugId ? parseInt(last.bugId.replace("BUG-", ""), 10) : 0;
  return `BUG-${String(n + 1).padStart(4, "0")}`;
};
const nextPostId = async () => {
  const last = await Post.findOne().sort({ postId: -1 }).lean();
  return (last?.postId || 0) + 1;
};

// ─────────────────────────────────────
// 4) Gemini 유사 발화 생성
// ─────────────────────────────────────
app.post("/generate", async (req, res) => {
  const { text, numSimilars = 5, persist = false } = req.body;

  console.log("\n========== 새 요청 ==========");
  console.log("수신 text:", text);

  if (!text?.trim()) {
    console.error("❌ 에러: 대표 발화가 비어있습니다.");
    return res.status(400).json({
      base: text || "(빈 발화)",
      similars: Array(numSimilars).fill("(생성 실패)"),
      error: "대표 발화가 비어있습니다.",
    });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `다음 대표 발화를 참고해서 ${numSimilars}개의 자연스러운 유사 발화를 만들어줘.
각 발화는 한 줄에 하나씩 출력하고, 번호나 특수문자는 붙이지 마.

대표 발화: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();

    console.log("AI 응답 원본:", rawText);

    const similars = rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, numSimilars);

    while (similars.length < numSimilars) {
      similars.push("(생성 실패)");
    }

    // DB 저장 옵션
    if (persist && dbReady) {
      try {
        await Utterance.create({ base: text, similars, numSimilars });
      } catch (e) {
        console.warn("Utterance 저장 실패:", e.message);
      }
    }

    res.json({ base: text, similars });
  } catch (err) {
    console.error("❌ AI 생성 오류:", err);
    res.status(500).json({
      base: text,
      similars: Array(numSimilars).fill("(생성 실패)"),
      error: err.message,
    });
  }
});

app.post("/generate-test", (req, res) => {
  res.json({
    base: "테스트 발화",
    similars: ["유사 발화 1", "유사 발화 2", "유사 발화 3"],
  });
});

// ─────────────────────────────────────
// 4-1) URL → TC 자동 생성 (Puppeteer + Gemini Vision)
// ─────────────────────────────────────
app.post("/api/tc-from-url", async (req, res) => {
  const { url, numTCs = 10 } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL이 필요합니다." });
  }
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "http:// 또는 https:// 로 시작하는 URL만 지원합니다." });
  }

  console.log("\n========== URL→TC 생성 요청 ==========");
  console.log("URL:", url);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // 페이지 구조 추출
    const pageInfo = await page.evaluate(() => {
      const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      return {
        title: document.title,
        headings: Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((h) => ({ tag: h.tagName.toLowerCase(), text: txt(h) }))
          .filter((h) => h.text)
          .slice(0, 20),
        buttons: Array.from(document.querySelectorAll("button, [role=button], input[type=button], input[type=submit]"))
          .map((b) => txt(b) || b.getAttribute("aria-label") || b.value || "")
          .filter(Boolean)
          .slice(0, 30),
        links: Array.from(document.querySelectorAll("a"))
          .map((a) => txt(a))
          .filter(Boolean)
          .slice(0, 30),
        inputs: Array.from(document.querySelectorAll("input, textarea, select"))
          .map((i) => {
            const labelText = i.labels?.[0] ? txt(i.labels[0]) : "";
            return {
              type: (i.type || i.tagName).toLowerCase(),
              name: i.name || "",
              placeholder: i.placeholder || "",
              label: labelText,
              required: !!i.required,
            };
          })
          .slice(0, 30),
        formCount: document.querySelectorAll("form").length,
      };
    });

    // 스크린샷 (뷰포트만 — fullPage는 용량 큼)
    const screenshotBase64 = await page.screenshot({
      type: "png",
      fullPage: false,
      encoding: "base64",
    });

    await browser.close();
    browser = null;

    console.log(`페이지 수집 완료: title="${pageInfo.title}", buttons=${pageInfo.buttons.length}, inputs=${pageInfo.inputs.length}`);

    // Gemini 호출 (vision 지원 모델)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `너는 숙련된 QA 엔지니어야. 첨부된 웹 페이지 스크린샷과 아래 구조 정보를 분석해서, 이 페이지의 기능을 검증하기 위한 테스트 케이스 ${numTCs}개를 생성해줘.

URL: ${url}
페이지 타이틀: ${pageInfo.title}
헤딩: ${JSON.stringify(pageInfo.headings)}
버튼: ${JSON.stringify(pageInfo.buttons)}
링크: ${JSON.stringify(pageInfo.links)}
입력 필드: ${JSON.stringify(pageInfo.inputs)}
폼 개수: ${pageInfo.formCount}

요구사항:
- 긍정 케이스, 부정 케이스(잘못된 입력 등), 경계값 케이스를 균형있게 섞을 것
- 우선순위(priority)는 기능의 핵심도에 따라 High/Medium/Low로 판단 (로그인·결제 등 핵심 흐름은 High)
- 카테고리(category)는 한국어로 페이지의 의미있는 분류명 작성 (예: 로그인, 회원가입, 검색, 네비게이션, 폼 검증, 접근성 등)
- 제목은 "~을 확인한다" 형태의 한국어 한 줄

다음 JSON 형식으로만 응답해줘. 다른 설명이나 마크다운 코드블록 표시 없이 순수 JSON만:

{
  "testcases": [
    {
      "title": "TC 제목",
      "description": "테스트 대상 및 수행 절차",
      "expectedResult": "기대 결과",
      "priority": "High",
      "category": "카테고리명"
    }
  ]
}`;

    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/png", data: screenshotBase64 } },
    ]);
    const rawText = (await result.response).text();
    console.log("Gemini 응답 길이:", rawText.length);

    // JSON 파싱 (코드블록/여분 텍스트 제거)
    let parsed;
    try {
      const cleaned = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // 중괄호 블록만 추출 시도
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("AI 응답을 JSON으로 파싱할 수 없습니다.");
    }

    const testcases = (parsed.testcases || [])
      .filter((t) => t && t.title)
      .map((t) => ({
        title: String(t.title || "").trim(),
        description: String(t.description || "").trim(),
        expectedResult: String(t.expectedResult || "").trim(),
        priority: ["High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
        category: String(t.category || "").trim() || "URL 자동 생성",
        status: "Pending",
      }));

    res.json({
      url,
      pageTitle: pageInfo.title,
      testcases,
      meta: {
        headingCount: pageInfo.headings.length,
        buttonCount: pageInfo.buttons.length,
        inputCount: pageInfo.inputs.length,
      },
    });
  } catch (err) {
    console.error("❌ URL→TC 생성 오류:", err);
    if (browser) {
      try { await browser.close(); } catch {}
    }

    // 에러 유형별 친절한 메시지
    let userMessage = err.message || "페이지 분석 중 오류가 발생했습니다.";
    let statusCode = 500;

    if (err.status === 429) {
      // retryDelay 추출 시도
      const retry = err.errorDetails?.find(
        (d) => d?.["@type"]?.includes("RetryInfo")
      )?.retryDelay;
      userMessage = `Gemini API 쿼터 초과 — ${retry || "약 30초~1분"} 후 다시 시도해주세요. (분당/일당 요청 한도)`;
      statusCode = 429;
    } else if (err.status === 404) {
      userMessage = "Gemini 모델을 찾을 수 없습니다. 모델 이름이 잘못됐거나 해당 키로 접근 불가합니다.";
    } else if (err.status === 400 && /api.?key/i.test(err.message || "")) {
      userMessage = "Gemini API 키가 유효하지 않습니다. .env의 GOOGLE_API_KEY를 확인하세요.";
    } else if (/timeout|Navigation timeout/i.test(err.message || "")) {
      userMessage = "페이지 로딩 시간 초과 — 다른 URL로 시도하거나 네트워크를 확인해주세요.";
    } else if (/net::|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(err.message || "")) {
      userMessage = "해당 URL에 접속할 수 없습니다. URL을 다시 확인해주세요.";
    }

    res.status(statusCode).json({ error: userMessage });
  }
});

// ─────────────────────────────────────
// 5) 상태 엔드포인트
// ─────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    server: "ok",
    db: dbReady ? "connected" : "disconnected",
    mongoUri: MONGODB_URI,
  });
});

// ─────────────────────────────────────
// 6) Testcases CRUD
// ─────────────────────────────────────
app.get("/api/testcases", requireDb, async (req, res) => {
  const list = await Testcase.find().sort({ createdAt: 1 }).lean();
  res.json(list.map(({ _id, __v, tcId, ...rest }) => ({ id: tcId, ...rest })));
});

app.post("/api/testcases", requireDb, async (req, res) => {
  try {
    const tcId = await nextTcId();
    const doc = await Testcase.create({ tcId, ...req.body });
    const { _id, __v, tcId: tid, ...rest } = doc.toObject();
    res.status(201).json({ id: tid, ...rest });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/testcases/:id", requireDb, async (req, res) => {
  try {
    const updated = await Testcase.findOneAndUpdate(
      { tcId: req.params.id },
      { $set: req.body },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "not found" });
    const { _id, __v, tcId, ...rest } = updated;
    res.json({ id: tcId, ...rest });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/testcases/:id", requireDb, async (req, res) => {
  const r = await Testcase.findOneAndDelete({ tcId: req.params.id });
  if (!r) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// 엑셀 일괄 삽입 (ID 자동 발급)
app.post("/api/testcases/bulk", requireDb, async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [];
  const out = [];
  for (const r of rows) {
    const tcId = await nextTcId();
    const doc = await Testcase.create({ tcId, ...r });
    const { _id, __v, tcId: tid, ...rest } = doc.toObject();
    out.push({ id: tid, ...rest });
  }
  res.status(201).json(out);
});

// ─────────────────────────────────────
// 7) Bugs CRUD
// ─────────────────────────────────────
app.get("/api/bugs", requireDb, async (req, res) => {
  const list = await Bug.find().sort({ createdAt: 1 }).lean();
  res.json(list.map(({ _id, __v, bugId, ...rest }) => ({ id: bugId, ...rest })));
});

app.post("/api/bugs", requireDb, async (req, res) => {
  try {
    const bugId = await nextBugId();
    const doc = await Bug.create({ bugId, ...req.body });
    const { _id, __v, bugId: bid, ...rest } = doc.toObject();
    res.status(201).json({ id: bid, ...rest });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/bugs/:id", requireDb, async (req, res) => {
  try {
    const patch = { ...req.body };
    // 상태가 Resolved/Closed로 바뀌면 resolvedAt 기록
    if (["Resolved", "Closed"].includes(patch.status)) {
      patch.resolvedAt = patch.resolvedAt || new Date();
    } else if (patch.status && !["Resolved", "Closed"].includes(patch.status)) {
      patch.resolvedAt = null;
    }
    const updated = await Bug.findOneAndUpdate(
      { bugId: req.params.id },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "not found" });
    const { _id, __v, bugId, ...rest } = updated;
    res.json({ id: bugId, ...rest });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/bugs/:id", requireDb, async (req, res) => {
  const r = await Bug.findOneAndDelete({ bugId: req.params.id });
  if (!r) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ─────────────────────────────────────
// 8) Posts CRUD (게시판)
// ─────────────────────────────────────
app.get("/api/posts", requireDb, async (req, res) => {
  const list = await Post.find().sort({ postId: -1 }).lean();
  res.json(list.map(({ _id, __v, postId, ...rest }) => ({ id: postId, ...rest })));
});

app.get("/api/posts/:id", requireDb, async (req, res) => {
  const p = await Post.findOne({ postId: Number(req.params.id) }).lean();
  if (!p) return res.status(404).json({ error: "not found" });
  const { _id, __v, postId, ...rest } = p;
  res.json({ id: postId, ...rest });
});

app.post("/api/posts", requireDb, async (req, res) => {
  try {
    const postId = await nextPostId();
    const doc = await Post.create({
      postId,
      date: new Date().toISOString().slice(0, 10),
      ...req.body,
    });
    const { _id, __v, postId: pid, ...rest } = doc.toObject();
    res.status(201).json({ id: pid, ...rest });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/posts/:id", requireDb, async (req, res) => {
  const r = await Post.findOneAndDelete({ postId: Number(req.params.id) });
  if (!r) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// ─────────────────────────────────────
// 9) Utterances (유사 발화 이력)
// ─────────────────────────────────────
app.get("/api/utterances", requireDb, async (req, res) => {
  const list = await Utterance.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json(list);
});

// ─────────────────────────────────────
// 10) QA 리포트용 집계 API
// ─────────────────────────────────────
app.get("/api/report/summary", requireDb, async (req, res) => {
  const { from, to } = req.query;
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  const tcQuery = Object.keys(range).length ? { updatedAt: range } : {};
  const bugQuery = Object.keys(range).length ? { updatedAt: range } : {};

  const [testcases, bugs] = await Promise.all([
    Testcase.find(tcQuery).lean(),
    Bug.find(bugQuery).lean(),
  ]);

  // 카테고리별 통과율
  const byCategory = {};
  for (const tc of testcases) {
    const k = tc.category || "(미분류)";
    if (!byCategory[k]) byCategory[k] = { total: 0, pass: 0, fail: 0, pending: 0 };
    byCategory[k].total++;
    if (tc.status === "Pass") byCategory[k].pass++;
    else if (tc.status === "Fail") byCategory[k].fail++;
    else if (tc.status === "Pending") byCategory[k].pending++;
  }

  // 담당자별 버그
  const byAssignee = {};
  for (const b of bugs) {
    const k = b.assignee || "(미지정)";
    if (!byAssignee[k]) byAssignee[k] = { total: 0, open: 0, resolved: 0 };
    byAssignee[k].total++;
    if (b.status === "Open" || b.status === "In Progress") byAssignee[k].open++;
    else byAssignee[k].resolved++;
  }

  // 최근 14일 실행 추이
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const key = d.toISOString().slice(0, 10);
    const dayTcs = testcases.filter((tc) => {
      const u = new Date(tc.updatedAt);
      return u >= d && u < next;
    });
    daily.push({
      date: key,
      pass: dayTcs.filter((t) => t.status === "Pass").length,
      fail: dayTcs.filter((t) => t.status === "Fail").length,
    });
  }

  res.json({ byCategory, byAssignee, daily, tcTotal: testcases.length, bugTotal: bugs.length });
});

// ─────────────────────────────────────
// 서버 시작
// ─────────────────────────────────────
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`🚀 서버가 ${port}번 포트에서 실행 중입니다.`));
