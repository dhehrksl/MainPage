import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import puppeteer from "puppeteer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "./.env" });

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET이 .env에 없어 개발용 기본값을 사용합니다. 배포 시 반드시 .env에 JWT_SECRET을 설정하세요.");
}

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

// 이 API 키로 실제 호출 가능한 "무료 등급이 문서상 확인된" 텍스트/비전 생성 모델들.
// 1) /v1beta/models 응답으로 이 키에서 실제 접근 가능한지 확인하고,
// 2) ai.google.dev/gemini-api/docs/pricing 에서 free tier가 명시된 것만 남겼다.
// "-latest" 별칭과 free tier 여부가 문서에 명시되지 않은 preview 하나는
// 확실치 않아 제외했다 (2026-08-23 기준 확인).
// 우선순위대로 시도하다가 쿼터 초과/오류가 나면 자동으로 다음 모델로 넘어간다.
// Gemma는 Gemini와 별도 쿼터라 마지막 보루로 포함했다.
const FREE_MODEL_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
  "gemma-4-26b-a4b-it",
  "gemma-4-31b-it",
];

// prompt(문자열 또는 parts 배열)를 위 목록 순서대로 시도한다.
// 하나가 실패(쿼터 초과, 일시적 오류 등)하면 바로 다음 모델로 넘어가고,
// 전부 실패해야만 마지막 에러를 던져서 각 라우트의 기존 에러 분류 로직이 처리하게 한다.
const generateContentWithFallback = async (parts) => {
  let lastErr;
  for (const modelName of FREE_MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(parts);
      const response = await result.response;
      return { response, modelUsed: modelName };
    } catch (err) {
      console.warn(`⚠️  모델 [${modelName}] 실패 — 다음 모델로 전환: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr;
};

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
// 로그인 인증 헬퍼
// ─────────────────────────────────────
const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" });

// Authorization: Bearer <token> 헤더를 검사해 req.user를 채우는 미들웨어.
// 아래 app.use(requireAuth)로 등록된 지점 이후의 모든 라우트에 적용된다.
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "로그인이 필요합니다." });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "세션이 만료됐습니다. 다시 로그인해주세요." });
  }
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
    scores: [Number], // similars와 같은 순서의 AI 자체 평가 점수 (0~100)
    numSimilars: Number,
    source: { type: String, default: "manual" }, // manual | excel
  },
  { timestamps: true }
);

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "" },
  },
  { timestamps: true }
);

const Testcase = mongoose.model("Testcase", TestcaseSchema);
const Bug = mongoose.model("Bug", BugSchema);
const Post = mongoose.model("Post", PostSchema);
const Utterance = mongoose.model("Utterance", UtteranceSchema);
const User = mongoose.model("User", UserSchema);

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
// 4) 인증 API (로그인 없이 접근 가능한 유일한 구간)
// ─────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    server: "ok",
    db: dbReady ? "connected" : "disconnected",
    mongoUri: MONGODB_URI,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 입력하세요." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다." });
  }
  if (!dbReady) {
    return res.status(503).json({ error: "DB가 연결되지 않았습니다. 잠시 후 다시 시도해주세요." });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail }).lean();
    if (exists) {
      return res.status(409).json({ error: "이미 가입된 이메일입니다." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: normalizedEmail, passwordHash, name: name || "" });
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("❌ 회원가입 오류:", err);
    res.status(500).json({ error: "회원가입 중 오류가 발생했습니다." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "이메일과 비밀번호를 입력하세요." });
  }
  if (!dbReady) {
    return res.status(503).json({ error: "DB가 연결되지 않았습니다. 잠시 후 다시 시도해주세요." });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    console.error("❌ 로그인 오류:", err);
    res.status(500).json({ error: "로그인 중 오류가 발생했습니다." });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email });
});

// ─────────────────────────────────────
// 이 지점 아래의 모든 라우트는 로그인(JWT)이 필요하다.
// ─────────────────────────────────────
app.use(requireAuth);

// ─────────────────────────────────────
// 5) Gemini 유사 발화 생성
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
    const prompt = `너는 챗봇 NLU 데이터를 검수하는 QA 엔지니어야. 다음 대표 발화를 참고해서 ${numSimilars}개의 자연스러운 유사 발화를 만들고, 각 발화에 대해 QA 관점의 점수(score, 0~100 정수)를 스스로 매겨줘.

점수 기준:
- 대표 발화와 "의도(intent)"가 동일한가 (다른 의미로 새면 크게 감점)
- 문장이 자연스럽고 실제 사용자가 말할 법한가
- 대표 발화와 표현이 지나치게 동일하거나(=사실상 복사) 아무 차이가 없으면 감점 (변별력 있는 패러프레이즈일수록 고득점)

대표 발화: "${text}"

다음 JSON 형식으로만 응답해줘. 다른 설명이나 마크다운 코드블록 없이 순수 JSON만:
{
  "similars": [
    { "text": "유사 발화 문장", "score": 92 }
  ]
}`;

    const { response, modelUsed } = await generateContentWithFallback(prompt);
    const rawText = response.text();

    console.log(`AI 응답 원본 (모델: ${modelUsed}):`, rawText);

    const usage = response.usageMetadata;
    if (usage) {
      console.log(`📊 토큰 사용량 [발화 생성] 입력=${usage.promptTokenCount} / 출력=${usage.candidatesTokenCount} / 합계=${usage.totalTokenCount}`);
    }

    // JSON 파싱 (실패 시 줄바꿈 파싱으로 폴백 — 점수는 null 처리)
    let items = [];
    try {
      const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned);
      items = Array.isArray(parsed.similars) ? parsed.similars : [];
    } catch {
      items = rawText
        .split(/\r?\n/)
        .map((line) => line.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
        .map((line) => ({ text: line, score: null }));
    }

    let similars = items
      .filter((it) => it && String(it.text || "").trim())
      .map((it) => ({
        text: String(it.text).trim(),
        score: Number.isFinite(it.score) ? Math.max(0, Math.min(100, Math.round(it.score))) : null,
      }))
      .slice(0, numSimilars);

    while (similars.length < numSimilars) {
      similars.push({ text: "(생성 실패)", score: 0 });
    }

    // DB 저장 옵션
    if (persist && dbReady) {
      try {
        await Utterance.create({
          base: text,
          similars: similars.map((s) => s.text),
          scores: similars.map((s) => s.score),
          numSimilars,
        });
      } catch (e) {
        console.warn("Utterance 저장 실패:", e.message);
      }
    }

    res.json({ base: text, similars });
  } catch (err) {
    console.error("❌ AI 생성 오류:", err);
    res.status(500).json({
      base: text,
      similars: Array(numSimilars).fill({ text: "(생성 실패)", score: 0 }),
      error: err.message,
    });
  }
});

// 여러 대표 발화를 한 번의 Gemini 호출로 처리 — 무료 등급의 분당/일당 "요청 횟수" 한도를
// 아끼기 위한 용도 (엑셀 행 수만큼 호출하던 것을 배치 단위 호출로 줄임)
app.post("/generate-batch", async (req, res) => {
  const { texts = [], numSimilars = 5, persist = false } = req.body;
  const baseTexts = texts.map((t) => String(t || "").trim()).filter(Boolean);

  if (baseTexts.length === 0) {
    return res.status(400).json({ error: "대표 발화 목록이 비어있습니다.", results: [] });
  }

  console.log(`\n========== 배치 발화 생성 요청 (${baseTexts.length}건) ==========`);

  try {
    const listBlock = baseTexts.map((t, i) => `${i + 1}. "${t}"`).join("\n");

    const prompt = `너는 챗봇 NLU 데이터를 검수하는 QA 엔지니어야. 아래는 대표 발화 목록이야. 각 대표 발화마다 자연스러운 유사 발화를 ${numSimilars}개씩 만들고, 각 유사 발화에 QA 관점의 점수(score, 0~100 정수)를 스스로 매겨줘.

점수 기준:
- 대표 발화와 "의도(intent)"가 동일한가 (다른 의미로 새면 크게 감점)
- 문장이 자연스럽고 실제 사용자가 말할 법한가
- 대표 발화와 표현이 지나치게 동일하거나(=사실상 복사) 아무 차이가 없으면 감점 (변별력 있는 패러프레이즈일수록 고득점)

대표 발화 목록 (총 ${baseTexts.length}개, 반드시 이 순서를 그대로 유지해서 응답할 것):
${listBlock}

다음 JSON 형식으로만 응답해줘. results 배열의 길이와 순서는 위 목록과 정확히 일치해야 해. 다른 설명이나 마크다운 코드블록 없이 순수 JSON만:
{
  "results": [
    {
      "base": "1번 대표 발화 원문",
      "similars": [
        { "text": "유사 발화 문장", "score": 92 }
      ]
    }
  ]
}`;

    const { response, modelUsed } = await generateContentWithFallback(prompt);
    const rawText = response.text();
    console.log(`배치 응답 모델: ${modelUsed}`);

    let parsedResults = [];
    try {
      const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : cleaned);
      parsedResults = Array.isArray(parsed.results) ? parsed.results : [];
    } catch (e) {
      console.error("❌ 배치 응답 JSON 파싱 실패:", e.message);
    }

    // 입력 순서 기준으로 정규화 — AI가 개수를 못 맞추거나 파싱이 실패해도 항상 baseTexts와 같은 길이로 응답
    const results = baseTexts.map((baseText, i) => {
      const item = parsedResults[i];
      let similars = Array.isArray(item?.similars) ? item.similars : [];
      similars = similars
        .filter((s) => s && String(s.text || "").trim())
        .map((s) => ({
          text: String(s.text).trim(),
          score: Number.isFinite(s.score) ? Math.max(0, Math.min(100, Math.round(s.score))) : null,
        }))
        .slice(0, numSimilars);
      while (similars.length < numSimilars) similars.push({ text: "(생성 실패)", score: 0 });
      return { base: baseText, similars };
    });

    if (persist && dbReady) {
      try {
        await Utterance.insertMany(
          results.map((r) => ({
            base: r.base,
            similars: r.similars.map((s) => s.text),
            scores: r.similars.map((s) => s.score),
            numSimilars,
            source: "excel",
          }))
        );
      } catch (e) {
        console.warn("Utterance 일괄 저장 실패:", e.message);
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("❌ 배치 발화 생성 오류:", err);
    let userMessage = err.message || "발화 생성 중 오류가 발생했습니다.";
    let statusCode = 500;
    if (err.status === 429) {
      const retry = err.errorDetails?.find((d) => d?.["@type"]?.includes("RetryInfo"))?.retryDelay;
      userMessage = `Gemini API 쿼터 초과 — ${retry || "약 30초~1분"} 후 다시 시도해주세요.`;
      statusCode = 429;
    }
    res.status(statusCode).json({
      error: userMessage,
      results: baseTexts.map((baseText) => ({
        base: baseText,
        similars: Array(numSimilars).fill({ text: "(생성 실패)", score: 0 }),
      })),
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
// 5-1) URL → TC 자동 생성 (Puppeteer + Gemini Vision)
// ─────────────────────────────────────
app.post("/api/tc-from-url", async (req, res) => {
  const { url, numTCs = 10, useScreenshot = false } = req.body;

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
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // 메모리가 작은 서버(1GB 등)에서 /dev/shm 부족으로 크롬이 죽는 걸 방지
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // networkidle2는 광고/채팅위젯/분석 스크립트가 계속 통신하는 사이트에서
    // 네트워크가 절대 안 잠잠해져 타임아웃만 나기 쉽다. DOM만 준비되면 되므로
    // domcontentloaded로 받고, 지연 렌더링되는 요소를 위해 잠깐만 더 기다린다.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 페이지 구조 추출
    // 모바일/데스크톱 메뉴가 둘 다 DOM에 있는 등 같은 요소가 중복 렌더링되는
    // 사이트가 많아서, 캡(최대 개수)을 자르기 전에 먼저 중복을 제거한다.
    // 안 그러면 캡의 절반이 똑같은 항목 반복에 낭비되고, 정작 캡 밖에 있는
    // 다른 요소(로그인, 신청 버튼, 푸터 링크 등)는 아예 AI한테 전달조차 안 된다.
    const pageInfo = await page.evaluate(() => {
      const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
      // 텍스트/aria-label/value가 전부 없는 아이콘 전용 버튼(예: SVG만 있는 버튼)은
      // 클래스명이라도 힌트로 넘긴다. 클래스명에 의미 있는 이름(예: "header__partner-button")이
      // 붙어있는 경우가 많아서, 이거라도 없으면 AI가 그 요소의 존재 자체를 모르게 된다.
      const classHint = (el) => {
        const cls = typeof el.className === "string" ? el.className : "";
        return cls.split(/\s+/).find((c) => c.length > 3) || "";
      };
      const dedupe = (arr) => [...new Set(arr)];
      const dedupeBy = (arr, keyFn) => {
        const seen = new Set();
        return arr.filter((item) => {
          const key = keyFn(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      return {
        title: document.title,
        metaDescription: document.querySelector('meta[name="description"]')?.content || "",
        bodyTextSample: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 800),
        headings: dedupeBy(
          Array.from(document.querySelectorAll("h1, h2, h3"))
            .map((h) => ({ tag: h.tagName.toLowerCase(), text: txt(h) }))
            .filter((h) => h.text),
          (h) => h.tag + "|" + h.text
        ).slice(0, 20),
        buttons: dedupe(
          Array.from(document.querySelectorAll("button, [role=button], input[type=button], input[type=submit]"))
            .map((b) => txt(b) || b.getAttribute("aria-label") || b.getAttribute("title") || b.value || classHint(b))
            .filter(Boolean)
        ).slice(0, 30),
        links: dedupe(
          Array.from(document.querySelectorAll("a"))
            .map((a) => txt(a) || a.getAttribute("aria-label") || a.getAttribute("title") || classHint(a))
            .filter(Boolean)
        ).slice(0, 30),
        inputs: dedupeBy(
          Array.from(document.querySelectorAll("input, textarea, select")).map((i) => {
            const labelText = i.labels?.[0] ? txt(i.labels[0]) : "";
            return {
              type: (i.type || i.tagName).toLowerCase(),
              name: i.name || "",
              placeholder: i.placeholder || "",
              label: labelText,
              required: !!i.required,
            };
          }),
          (i) => i.type + "|" + i.name + "|" + i.placeholder + "|" + i.label
        ).slice(0, 30),
        formCount: document.querySelectorAll("form").length,
      };
    });

    // 스크린샷 (뷰포트만 — fullPage는 용량 큼)
    // useScreenshot=false면 촬영을 건너뛰어 토큰(비용)을 크게 절약한다.
    let screenshotBase64 = null;
    if (useScreenshot) {
      screenshotBase64 = await page.screenshot({
        type: "png",
        fullPage: false,
        encoding: "base64",
      });
    }

    await browser.close();
    browser = null;

    console.log(`페이지 수집 완료: title="${pageInfo.title}", buttons=${pageInfo.buttons.length}, inputs=${pageInfo.inputs.length}, screenshot=${useScreenshot ? "포함" : "생략"}`);

    // Gemini 호출 (vision 지원 모델 우선 순회)
    const sourceDesc = useScreenshot
      ? "첨부된 웹 페이지 스크린샷과 아래 구조 정보를"
      : "아래 웹 페이지 구조 정보를";
    const prompt = `너는 숙련된 QA 엔지니어야. ${sourceDesc} 분석해서, 이 페이지의 기능을 검증하기 위한 테스트 케이스를 생성해줘. 최대 ${numTCs}개까지 만들 수 있지만, 이 아래 근거만으로 의미 있는 케이스가 그보다 적다면 억지로 개수를 채우지 말고 실제 근거가 있는 만큼만 생성해줘.

URL: ${url}
페이지 타이틀: ${pageInfo.title}
메타 설명: ${pageInfo.metaDescription || "(없음)"}
페이지 본문 텍스트 일부: ${pageInfo.bodyTextSample || "(추출 안됨)"}
헤딩: ${JSON.stringify(pageInfo.headings)}
버튼: ${JSON.stringify(pageInfo.buttons)}
링크: ${JSON.stringify(pageInfo.links)}
입력 필드: ${JSON.stringify(pageInfo.inputs)}
폼 개수: ${pageInfo.formCount}

요구사항:
- 반드시 위에 제공된 실제 요소(헤딩/버튼/링크/입력필드/본문 텍스트)에 근거해서만 작성할 것. 페이지에 없는 기능(예: 존재하지 않는 결제, 회원가입 등)을 상상해서 만들지 말 것.
- description은 "1. ... 2. ... 3. ..." 형태로, 실제 버튼/입력 필드 이름을 그대로 인용하며 누가 봐도 똑같이 재현할 수 있는 구체적 조작 순서로 작성할 것. "정상적으로 동작하는지 확인한다" 같은 막연한 문장 금지.
- expectedResult는 마지막 단계 수행 직후 화면에서 실제로 관찰 가능한 결과를 구체적으로 쓸 것 (예: "'이메일 형식이 올바르지 않습니다' 메시지가 입력창 아래 빨간 글씨로 표시된다")
- 긍정 케이스, 부정 케이스(잘못된 입력 등), 경계값 케이스를 균형있게 섞을 것
- 우선순위(priority)는 기능의 핵심도에 따라 High/Medium/Low로 판단 (로그인·결제 등 핵심 흐름은 High)
- 카테고리(category)는 한국어로 페이지의 의미있는 분류명 작성 (예: 로그인, 회원가입, 검색, 네비게이션, 폼 검증, 접근성 등)
- 제목은 "~을 확인한다" 형태의 한국어 한 줄

절대 하지 말아야 할 것 (아래 중 하나라도 해당하면 그 TC는 만들지 말고 통째로 제외할 것):
- 페이지에 실제로 존재하는지 확신할 수 없는 요소에 대한 TC. 제목이나 설명에 "(추정)", "(만약 존재한다면)", "~일 것으로 예상" 같은 불확실성을 나타내는 표현이 들어간다면, 그건 근거가 부족하다는 신호이니 TC 자체를 빼라.
- expectedResult에 두 가지 이상의 가능성을 나열하는 것. "~하거나 ~한다" 형태뿐 아니라 "...한다 (또는 ~)"처럼 괄호로 대안을 슬쩍 끼워 넣는 것도 전부 금지. 확신이 없어서 대안을 적고 싶어진다면, 그건 그 TC를 만들면 안 된다는 신호다 — 대안을 적지 말고 TC 자체를 빼라.
- 서로 다른 링크·버튼 여러 개를 한 TC의 description에 나열하는 것 (예: "1. A 클릭 2. B 클릭 ... 10. J 클릭"). 하나의 TC는 하나의 독립된 시나리오만 검증해야 하며, 검증하고 싶은 요소가 여러 개면 TC를 그 개수만큼 나눠서 각각 만들 것.
- "가독성이 좋다", "이해하기 쉽다", "효과적으로 전달한다"처럼 사람마다 판단이 갈리는 주관적 항목. TC는 반드시 명확하게 참/거짓으로 판별 가능한 조건만 다룰 것.
- 텍스트/제목/메타데이터가 "페이지에 표시되는지 확인한다" 유형의 단순 존재 확인 TC는 전체 응답에서 최대 2개까지만 포함할 것 (3개째부터는 만들지 말 것). 버튼·입력·폼·링크 클릭처럼 실제 상호작용을 검증하는 TC를 항상 우선할 것.
- 위 기준들 때문에 만들 수 있는 TC가 ${numTCs}개보다 적어지는 건 정상이다. 페이지에 상호작용 요소가 별로 없다면 5개, 3개만 반환해도 되고, 그게 개수를 억지로 채운 것보다 훨씬 낫다. 개수보다 품질이 항상 우선이다.

예시 (형식 참고용 — 실제 케이스는 반드시 위에서 제공된 이 페이지의 실제 데이터에 근거해서 작성):
{
  "title": "이메일 형식이 아닌 값을 입력했을 때 에러 메시지 노출을 확인한다",
  "description": "1. 이메일 입력란에 'abc123'을 입력한다\\n2. '로그인' 버튼을 클릭한다",
  "expectedResult": "이메일 형식 오류 메시지가 입력란 하단에 표시되고 로그인이 진행되지 않는다",
  "priority": "High",
  "category": "로그인"
}

다음 JSON 형식으로만 응답해줘. 다른 설명이나 마크다운 코드블록 표시 없이 순수 JSON만:

{
  "testcases": [
    {
      "title": "TC 제목",
      "description": "1. ... \\n2. ... \\n3. ...",
      "expectedResult": "기대 결과",
      "priority": "High",
      "category": "카테고리명"
    }
  ]
}`;

    const parts = [{ text: prompt }];
    if (useScreenshot && screenshotBase64) {
      parts.push({ inlineData: { mimeType: "image/png", data: screenshotBase64 } });
    }
    const { response, modelUsed } = await generateContentWithFallback(parts);
    const rawText = response.text();
    console.log(`Gemini 응답 길이: ${rawText.length} (모델: ${modelUsed})`);

    // 토큰 사용량 출력 (모드별 비용 비교용)
    const usage = response.usageMetadata;
    if (usage) {
      console.log(
        `📊 토큰 사용량 [${useScreenshot ? "이미지 포함" : "텍스트만"}] ` +
        `입력=${usage.promptTokenCount} / 출력=${usage.candidatesTokenCount} / 합계=${usage.totalTokenCount}`
      );
    } else {
      console.log("📊 토큰 사용량: (응답에 usageMetadata 없음)");
    }

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

    const rawTestcases = (parsed.testcases || [])
      .filter((t) => t && t.title)
      .map((t) => ({
        title: String(t.title || "").trim(),
        description: String(t.description || "").trim(),
        expectedResult: String(t.expectedResult || "").trim(),
        priority: ["High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
        category: String(t.category || "").trim() || "URL 자동 생성",
        status: "Pending",
      }));

    // 프롬프트만으로는 flash-lite 같은 작은 모델이 아래 두 규칙을 안정적으로
    // 지키지 못해서, 코드에서 한 번 더 강제로 걸러낸다.
    // 괄호 안팎 위치나 "또는/혹은" 같은 동의어로 우회하는 걸 막기 위해
    // 기대결과 문자열 전체에서 헤징 단어를 찾는다.
    const HEDGE_WORDS = /또는|혹은|거나|다를 수 있으나|것으로 예상|예상되|추정되|경우에 따라|정보만으로는|알 수 없으므로|예측하기 어렵|파악하기 어렵/;
    const HAS_INTERACTION = /클릭|입력|제출|선택|체크박스|드래그|호버|스와이프/;
    const MAX_CONTENT_ONLY_TCS = 2;

    let contentOnlyCount = 0;
    const testcases = rawTestcases.filter((tc) => {
      // 기대결과에 대안/헤징 표현이 있으면(위치 무관) 제외
      if (HEDGE_WORDS.test(tc.expectedResult)) return false;

      // 클릭/입력 등 실제 상호작용이 description에 하나도 없으면
      // "텍스트가 존재하는지 확인" 류로 보고, 최대 2개까지만 허용
      if (!HAS_INTERACTION.test(tc.description)) {
        contentOnlyCount++;
        return contentOnlyCount <= MAX_CONTENT_ONLY_TCS;
      }
      return true;
    });

    console.log(`TC 필터링: 생성 ${rawTestcases.length}개 → 최종 ${testcases.length}개 (헤징/과도한 존재확인 제외)`);

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
      userMessage = "페이지 로딩 시간 초과 — 대부분 대상 사이트의 봇 차단(사람 확인) 시스템이 자동화 브라우저 접속을 막아서 발생합니다. 이런 사이트는 이 기능으로 분석할 수 없습니다. 다른 URL로 시도해주세요.";
    } else if (/net::|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(err.message || "")) {
      userMessage = "해당 URL에 접속할 수 없습니다. URL을 다시 확인해주세요.";
    }

    res.status(statusCode).json({ error: userMessage });
  }
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
