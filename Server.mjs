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
    // ── 자동 실행용 (URL→TC 생성 시에만 채워짐) ──
    sourceUrl: String, // 이 TC를 생성한 원본 페이지 URL — 재실행 시 여기로 접속한다
    actions: [mongoose.Schema.Types.Mixed], // 기계가 재현할 수 있는 조작 단계 (click/type/assertText/assertUrlChange)
    // ── 마지막 자동 실행 결과 캐시 (목록에서 바로 보여주기용, 이력은 TestRun에 별도 저장) ──
    lastRunStatus: String, // Pass | Fail | Error | null(아직 실행 안 함)
    lastRunAt: Date,
    lastRunMessage: String,
    lastRunDiagnosis: String, // 실패 시 AI가 추정한 원인/다음 액션
  },
  { timestamps: true }
);

const TestRunSchema = new mongoose.Schema(
  {
    tcId: { type: String, index: true },
    tcTitle: String,
    status: { type: String, required: true }, // Pass | Fail | Error
    message: String, // 실패/에러 사유
    screenshot: String, // 실패했을 때만 base64 PNG 저장 (용량 절약)
    aiDiagnosis: String, // 실패했을 때 Gemini가 추정한 원인/다음 액션 (선택적)
    durationMs: Number,
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
    screenshot: String, // AI 자동 생성 버그일 때만 채워짐 (실패 스크린샷 base64 PNG)
    resolvedAt: Date,
    // ── "Resolved" 처리 시 관련 TC를 자동 재실행한 결과 (재검증 안 된 버그는 전부 비어있음) ──
    verifiedAt: Date,
    verifiedStatus: String, // Pass | Fail | Error
    verifiedMessage: String,
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
const TestRun = mongoose.model("TestRun", TestRunSchema);

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
// 3-2) TC 자동 실행 엔진 — 생성된 TC의 actions를 실제 브라우저에서 재현하고 Pass/Fail을 판정한다.
// CSS 셀렉터가 아니라 "화면에 보이는 텍스트"로 요소를 찾는다 — 클래스명이 바뀌어도
// 텍스트만 같으면 계속 동작하는 셀프힐링에 가까운 방식이고, URL→TC 생성 때 쓰는
// 스크래핑 방식과 원리가 같아서 일관적이다.
// ─────────────────────────────────────
const PUPPETEER_SAFE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--single-process",
];

// 화면에 실제로 "보이고 클릭 가능한" 요소 중 text를 포함하는 걸 찾아 elementHandle을 돌려준다.
// 모달/오버레이에 가려졌거나 화면 밖으로 밀려난 요소는 DOM에는 남아있어도 실제로
// 클릭할 수 없으므로 후보에서 제외한다 — 그래야 AI가 이미 가려져서 실패한 대상을
// 계속 재시도하며 스텝을 낭비하지 않는다.
const findClickableByText = async (page, text) => {
  const handle = await page.evaluateHandle((searchText) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const topEl = document.elementFromPoint(cx, cy);
      return !!topEl && (topEl === el || el.contains(topEl) || topEl.contains(el));
    };
    const candidates = Array.from(
      document.querySelectorAll("button, a, [role=button], input[type=button], input[type=submit]")
    );
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    // 텍스트/aria-label/value가 다 비어있는 아이콘 전용 버튼은 URL→TC 생성 때
    // 클래스명(예: header__partner-button)을 힌트로 대신 썼을 수 있어서, 여기서도
    // 같은 순서로 폴백해야 그 TC를 실행할 수 있다.
    const classHint = (el) => {
      const cls = typeof el.className === "string" ? el.className : "";
      return cls.split(/\s+/).find((c) => c.length > 3) || "";
    };
    return candidates.find((el) => {
      if (!isVisible(el)) return false;
      const label =
        norm(el.textContent) || norm(el.getAttribute("aria-label")) || norm(el.value) || classHint(el);
      return label.includes(searchText);
    }) || null;
  }, text);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return element;
};

// 입력 필드를 placeholder/label/현재 포커스 여부로 찾아 elementHandle을 돌려준다.
// 후보를 보이는 것만으로 좁혀서, 가려진 입력창 대신 실제로 지금 열려있는 입력창을 잡는다.
const findInputByHint = async (page, hint) => {
  const handle = await page.evaluateHandle((searchHint) => {
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const topEl = document.elementFromPoint(cx, cy);
      return !!topEl && (topEl === el || el.contains(topEl) || topEl.contains(el));
    };
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const inputs = Array.from(document.querySelectorAll("input, textarea")).filter(isVisible);
    if (!searchHint) return inputs[0] || null;
    return (
      inputs.find((el) => {
        const label = el.labels?.[0] ? norm(el.labels[0].textContent) : "";
        return norm(el.placeholder).includes(searchHint) || label.includes(searchHint);
      }) || inputs[0] || null
    );
  }, hint);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return element;
};

// action 하나를 수행한다. 실패하면 어떤 action인지 알 수 있게 에러 메시지에 남긴다.
const performAction = async (page, action, index) => {
  const label = `${index + 1}번째 단계(${action.type})`;
  try {
    if (action.type === "click") {
      let el = await findClickableByText(page, action.text);
      if (!el) throw new Error(`"${action.text}" 텍스트를 가진 클릭 요소를 찾지 못함`);
      try {
        await el.click();
      } catch (clickErr) {
        // React/SPA 재렌더링으로 DOM 노드가 교체됐을 때 재탐색 후 1회 재시도
        if (/detached|Execution context/i.test(clickErr.message)) {
          await el.dispose().catch(() => {});
          await new Promise((r) => setTimeout(r, 600));
          el = await findClickableByText(page, action.text);
          if (!el) throw new Error(`"${action.text}" 클릭 재시도 실패 — 요소가 DOM에서 사라졌습니다`);
          await el.click();
        } else {
          throw clickErr;
        }
      }
      await el.dispose().catch(() => {});
    } else if (action.type === "type") {
      const el = await findInputByHint(page, action.targetHint || "");
      if (!el) throw new Error("입력할 필드를 찾지 못함");
      await el.click();
      await el.type(String(action.text || ""), { delay: 30 });
      await el.dispose();
    } else if (action.type === "assertText") {
      const bodyText = await page.evaluate(() => document.body.innerText || "");
      if (!bodyText.includes(action.text)) {
        throw new Error(`"${action.text}" 텍스트가 화면에 없음`);
      }
    } else if (action.type === "assertUrlChange") {
      // 클릭 직후 페이지 이동이 아직 진행 중일 수 있으므로 최대 8초간 폴링
      const deadline = Date.now() + 8000;
      while (page.url() === action.beforeUrl && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (page.url() === action.beforeUrl) {
        throw new Error("URL이 이전과 동일함 (페이지 이동 안 됨)");
      }
    } else {
      throw new Error(`알 수 없는 action.type: ${action.type}`);
    }
    await new Promise((r) => setTimeout(r, 700)); // 렌더링/네비게이션이 안정될 시간
  } catch (err) {
    throw new Error(`${label} 실패 — ${err.message}`);
  }
};

// TC 하나를 실제로 실행해서 { status, message, screenshot, durationMs }를 돌려준다.
// 절대 throw하지 않는다 — 실행 자체의 실패도 결과(Error 상태)로 정상 반환한다.
const runTestcase = async (tc) => {
  const startedAt = Date.now();
  if (!tc.sourceUrl || !Array.isArray(tc.actions) || tc.actions.length === 0) {
    return { status: "Error", message: "이 TC는 자동 실행 정보(sourceUrl/actions)가 없습니다. URL→TC 생성으로 만든 TC만 실행 가능합니다.", screenshot: null, durationMs: 0 };
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: PUPPETEER_SAFE_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(tc.sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2000));

    // assertUrlChange는 "테스트 시작 시점"과 비교해야 한다 — 바로 앞 단계(클릭 등)에서
    // 이미 이동이 끝난 뒤에 현재 URL을 기준으로 잡으면 자기 자신과 비교하는 꼴이 되어
    // 항상 "변화 없음"으로 오판정된다.
    const initialUrl = page.url();
    for (let i = 0; i < tc.actions.length; i++) {
      const action = { ...tc.actions[i] };
      if (action.type === "assertUrlChange") {
        action.beforeUrl = initialUrl;
      }
      await performAction(page, action, i);
    }

    await browser.close();
    browser = null;
    return { status: "Pass", message: "", screenshot: null, durationMs: Date.now() - startedAt };
  } catch (err) {
    let screenshot = null;
    try {
      if (browser) {
        const pages = await browser.pages();
        const target = pages[pages.length - 1];
        screenshot = await target.screenshot({ type: "png", encoding: "base64" });
      }
    } catch {
      // 스크린샷 실패는 무시 — 실패 사유 메시지만으로도 충분히 유용하다
    }
    return { status: "Fail", message: err.message, screenshot, durationMs: Date.now() - startedAt };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};

// 실패한 실행 결과를 Gemini에게 보여주고 원인과 다음 액션을 짧게 설명받는다.
// 진단 자체가 실패해도(쿼터 초과 등) 절대 throw하지 않는다 — 진단은 부가 정보일 뿐,
// 실행 결과 자체를 막아서는 안 된다.
const diagnoseFailure = async (tc, result) => {
  try {
    const prompt = `너는 QA 엔지니어를 돕는 어시스턴트야. 아래는 자동 실행한 테스트 케이스가 실패한 기록이야. 왜 실패했을지 원인을 1~2문장으로 추정하고, 사람이 다음에 뭘 확인/수정하면 좋을지 1문장으로 제안해줘. 확신 없는 추측은 "~일 가능성이 있습니다"처럼 표현하고, 모르면 모른다고 해. 마크다운이나 목록 기호 없이 짧은 평문 2~3문장으로만 답해.

TC 제목: ${tc.title}
TC 설명: ${tc.description}
기대 결과: ${tc.expectedResult}
실행 중 발생한 에러: ${result.message}`;

    const parts = [{ text: prompt }];
    if (result.screenshot) {
      parts.push({ inlineData: { mimeType: "image/png", data: result.screenshot } });
    }
    const { response } = await generateContentWithFallback(parts);
    return response.text().trim();
  } catch (err) {
    console.warn("⚠️  실패 원인 진단 실패:", err.message);
    return "";
  }
};

const BUG_SEVERITY_OPTIONS = ["Critical", "Major", "Minor", "Trivial"];
const BUG_PRIORITY_BY_SEVERITY = { Critical: "Urgent", Major: "High", Minor: "Medium", Trivial: "Low" };

// 실패한 실행 기록 하나를 받아 버그 트래커에 바로 등록할 수 있는 정식 버그 리포트 초안을 작성한다.
// diagnoseFailure와 달리 이건 사람이 읽을 리포트 자체를 완성하는 게 목적이라 JSON으로 구조화해서 받는다.
const generateBugReportFromRun = async (run) => {
  const prompt = `너는 QA 엔지니어를 돕는 어시스턴트야. 아래는 자동 실행한 테스트 케이스가 실패한 기록이야. 이 내용을 바탕으로 버그 트래커에 바로 등록할 정식 버그 리포트를 작성해줘.

TC 제목: ${run.tcTitle}
실행 중 발생한 에러: ${run.message}
AI 원인 진단(참고용): ${run.aiDiagnosis || "없음"}

아래 JSON 형식으로만 답해. 코드블록이나 다른 설명 없이 JSON만.
{
  "title": "버그 제목 (한 문장, 실제 증상 중심, 추측성 표현 없이 단정적으로)",
  "description": "무엇이 잘못됐는지 2~3문장 설명",
  "stepsToReproduce": "1. ...\\n2. ...\\n3. ... 형식의 재현 절차",
  "severity": "Critical|Major|Minor|Trivial 중 하나"
}`;

  const parts = [{ text: prompt }];
  if (run.screenshot) {
    parts.push({ inlineData: { mimeType: "image/png", data: run.screenshot } });
  }
  const { response } = await generateContentWithFallback(parts);
  const rawText = response.text().trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI가 JSON 형식으로 응답하지 않았습니다.");
  const parsed = JSON.parse(jsonMatch[0]);

  const severity = BUG_SEVERITY_OPTIONS.includes(parsed.severity) ? parsed.severity : "Major";
  return {
    title: String(parsed.title || run.tcTitle).trim(),
    description: String(parsed.description || run.message || "").trim(),
    stepsToReproduce: String(parsed.stepsToReproduce || "").trim(),
    severity,
    priority: BUG_PRIORITY_BY_SEVERITY[severity],
  };
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
// URL 하나를 열어서 페이지 구조(헤딩/버튼/링크/입력필드)를 뽑아온다.
// URL→TC 생성과 자연어 즉석 테스트 둘 다 이 함수로 페이지를 "읽는다".
// 지금 열려있는 page의 구조(헤딩/버튼/링크/입력필드)를 뽑아온다.
// scrapePage(최초 1회 로드)와 자연어 즉석 테스트의 에이전트 루프(매 단계마다 재관찰)
// 양쪽에서 다 쓰는, 살아있는 page 객체 하나를 대상으로 한 순수 관찰 함수다.
//
// 모바일/데스크톱 메뉴가 둘 다 DOM에 있는 등 같은 요소가 중복 렌더링되는
// 사이트가 많아서, 캡(최대 개수)을 자르기 전에 먼저 중복을 제거한다.
// 안 그러면 캡의 절반이 똑같은 항목 반복에 낭비되고, 정작 캡 밖에 있는
// 다른 요소(로그인, 신청 버튼, 푸터 링크 등)는 아예 AI한테 전달조차 안 된다.
const extractPageInfo = (page) =>
  page.evaluate(() => {
    const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
    // 텍스트/aria-label/value가 전부 없는 아이콘 전용 버튼(예: SVG만 있는 버튼)은
    // 클래스명이라도 힌트로 넘긴다. 클래스명에 의미 있는 이름(예: "header__partner-button")이
    // 붙어있는 경우가 많아서, 이거라도 없으면 AI가 그 요소의 존재 자체를 모르게 된다.
    const classHint = (el) => {
      const cls = typeof el.className === "string" ? el.className : "";
      return cls.split(/\s+/).find((c) => c.length > 3) || "";
    };
    // 모달/오버레이에 가려졌거나 화면 밖으로 밀려난 요소는 DOM에는 남아있어도
    // 실제로 클릭/입력할 수 없다. 이런 요소를 AI에게 "보이는 것"처럼 보고하면,
    // AI가 존재하지도 않는 접근법(가려진 요소 클릭)을 매 단계 반복 시도하다
    // 실행 예산(스텝 수)만 낭비하게 된다 — 그래서 여기서 미리 걸러낸다.
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
      const topEl = document.elementFromPoint(cx, cy);
      return !!topEl && (topEl === el || el.contains(topEl) || topEl.contains(el));
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
      bodyTextSample: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1500),
      headings: dedupeBy(
        Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((h) => ({ tag: h.tagName.toLowerCase(), text: txt(h) }))
          .filter((h) => h.text),
        (h) => h.tag + "|" + h.text
      ).slice(0, 20),
      buttons: dedupe(
        Array.from(document.querySelectorAll("button, [role=button], input[type=button], input[type=submit]"))
          .filter(isVisible)
          .map((b) => txt(b) || b.getAttribute("aria-label") || b.getAttribute("title") || b.value || classHint(b))
          .filter(Boolean)
      ).slice(0, 30),
      links: (() => {
        // 사이트 이동 메뉴(사이드바/헤더)가 링크 수백 개를 차지하는 사이트가 많다
        // (예: 클리앙은 게시글 목록보다 앞서 나오는 메뉴 링크만 260개 중 60개).
        // 캡을 그냥 등장 순서로 자르면 진짜 콘텐츠(게시글 제목 등)는 캡 밖으로
        // 밀려서 AI가 아예 보지도 못한다. 메뉴 라벨은 보통 공백 없는 짧은 단어이고
        // 실제 콘텐츠(게시글 제목 등)는 공백 섞인 문장에 가까우니, 문장형 링크를
        // 먼저 채우고 남는 자리에 메뉴 링크를 채운다.
        const all = dedupe(
          Array.from(document.querySelectorAll("a"))
            .filter(isVisible)
            .map((a) => txt(a) || a.getAttribute("aria-label") || a.getAttribute("title") || classHint(a))
            .filter(Boolean)
        );
        const looksLikeContent = (label) => label.length >= 8 && label.includes(" ");
        const content = all.filter(looksLikeContent);
        const chrome = all.filter((label) => !looksLikeContent(label));
        return [...content, ...chrome].slice(0, 90);
      })(),
      inputs: dedupeBy(
        Array.from(document.querySelectorAll("input, textarea, select")).filter(isVisible).map((i) => {
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

const scrapePage = async (url, useScreenshot) => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: PUPPETEER_SAFE_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // networkidle2는 광고/채팅위젯/분석 스크립트가 계속 통신하는 사이트에서
    // 네트워크가 절대 안 잠잠해져 타임아웃만 나기 쉽다. DOM만 준비되면 되므로
    // domcontentloaded로 받고, 지연 렌더링되는 요소를 위해 잠깐만 더 기다린다.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const pageInfo = await extractPageInfo(page);

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
    return { pageInfo, screenshotBase64 };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};

// ─────────────────────────────────────
// 5-1-1) 자연어 즉석 테스트 — 여러 페이지를 넘나드는 에이전트 루프
//
// 예전 방식은 시작 페이지 하나만 보고 액션 전체를 한 번에 미리 써버렸다.
// "게시판에서 OO 관련 글 찾아 클릭" 같은, 아직 안 가본 다음 페이지의
// 실제 내용을 알아야 하는 지시는 그 방식으로는 원천적으로 못 푼다(AI가
// 모르는 내용을 지어낼 수밖에 없음).
//
// 그래서 여기서는 "한 걸음 보고 → 한 걸음 결정 → 실행 → 다시 관찰"을
// 반복한다. 매 단계 AI에게 지금 페이지에 실제로 있는 버튼/링크/본문을
// 보여주고 "다음 한 걸음"만 고르게 하면, 다음 페이지 내용을 미리 알 필요가
// 없어진다 — 그 페이지에 도착한 다음에 보고 고르니까.
// ─────────────────────────────────────
const AGENT_MAX_STEPS = 7;
const AGENT_ACTION_TYPES = new Set(["click", "type", "assertText", "assertUrlChange", "finish"]);

const describeAgentAction = (action) => {
  if (action.type === "click") return `"${action.text}" 클릭`;
  if (action.type === "type") return `"${action.targetHint || "입력필드"}"에 "${action.text}" 입력`;
  if (action.type === "assertText") return `"${action.text}" 텍스트 존재 확인`;
  if (action.type === "assertUrlChange") return "URL 변경 확인";
  return action.type;
};

// 클릭/입력 후 다음 관찰까지 안정적으로 기다린다. 네비게이션이 실제로 일어나면
// 최대 4초까지 기다려주고, 안 일어나면(같은 페이지 내 변화) 1.2초만 대기하고 넘어간다.
const settleAfterAction = async (page) => {
  await Promise.race([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 4000 }).catch(() => {}),
    new Promise((r) => setTimeout(r, 1200)),
  ]);
  await new Promise((r) => setTimeout(r, 400));
};

const runAgenticNlTest = async (url, instruction) => {
  const startedAt = Date.now();
  const history = []; // { action, outcome }
  const executedActions = []; // 저장/재실행용 — finish/실패한 시도는 제외한 성공한 액션만
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: PUPPETEER_SAFE_ARGS });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1500));

    let verdict = null; // { success, message } — finish 액션이나 스텝 한도 초과로 채워짐

    for (let step = 0; step < AGENT_MAX_STEPS; step++) {
      const pageInfo = await extractPageInfo(page);
      const beforeUrl = page.url();

      const prompt = `너는 QA 엔지니어를 돕는 자동화 에이전트야. 사용자가 자연어로 설명한 목표를 달성하기 위해, 지금 보고 있는 화면 상태만 보고 "바로 다음에 할 행동 딱 하나"를 결정해.

전체 목표: "${instruction}"
시작 URL: ${url}
지금은 ${step + 1}번째 단계 (최대 ${AGENT_MAX_STEPS}단계 안에 끝내야 함)

지금까지 실행한 단계:
${history.length ? history.map((h, i) => `${i + 1}. ${describeAgentAction(h.action)} → ${h.outcome}`).join("\n") : "(아직 없음)"}

현재 화면 상태:
- 현재 URL: ${beforeUrl}
- 타이틀: ${pageInfo.title}
- 헤딩: ${JSON.stringify(pageInfo.headings.map((h) => h.text))}
- 버튼: ${JSON.stringify(pageInfo.buttons)}
- 링크: ${JSON.stringify(pageInfo.links)}
- 입력 필드: ${JSON.stringify(pageInfo.inputs)}
- 본문 일부: ${pageInfo.bodyTextSample}

규칙:
- click/type의 text·targetHint는 위 목록에 실제로 있는 것만 쓸 것. 목록에 없는 걸 지어내지 말 것.
- 목표를 이루려면 여러 화면을 거쳐야 할 수도 있다 — 지금은 그 중 "다음 한 걸음"만 고를 것.
- 지금 화면의 링크/헤딩/본문 중에 목표와 실제로 관련된 항목(예: 특정 키워드가 포함된 게시글 제목)이 이미 보이면, 검색을 새로 시도하지 말고 그 항목을 바로 클릭할 것.
- 이전 단계에서 이미 "성공"으로 기록된 클릭 항목이 현재 화면에 다시 보여도 절대 다시 클릭하지 말 것. 그건 이미 그 페이지로 이동했거나 그 동작을 수행한 뒤 남은 흔적(breadcrumb, 헤딩 등)이다 — 다음 단계를 찾을 것.
- 같은 text로 click을 2회 연속 실패했다면 그 접근을 포기하고 다른 방법(다른 버튼/링크)을 시도할 것. 방법이 없으면 finish(success=false)로 끝낼 것.
- 목표를 이미 달성했다고 판단되면(원하는 화면/내용이 보임) type을 "finish", success를 true로. 더 진행할 방법이 없거나 목표 달성에 실패했다고 판단되면 type을 "finish", success를 false로.
- message는 이 행동을 고른 이유(진행 중일 때) 또는 최종 결과 설명(finish일 때)을 한국어 1~2문장으로.

다음 JSON 형식으로만 응답해. 다른 설명이나 마크다운 없이 순수 JSON만:
{ "action": { "type": "click|type|assertText|assertUrlChange|finish", "text": "...", "targetHint": "...", "success": true, "message": "..." } }`;

      const { response } = await generateContentWithFallback(prompt);
      const rawText = response.text();

      let parsed;
      try {
        const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("AI 응답을 JSON으로 파싱할 수 없습니다.");
      }

      const raw = parsed.action || {};
      if (!AGENT_ACTION_TYPES.has(raw.type)) {
        history.push({ action: { type: "unknown" }, outcome: "AI가 알 수 없는 action.type을 응답함 — 건너뜀" });
        continue;
      }

      if (raw.type === "finish") {
        verdict = { success: !!raw.success, message: String(raw.message || "").trim() || "완료" };
        break;
      }

      const action =
        raw.type === "click" ? { type: "click", text: String(raw.text || "").trim() } :
        raw.type === "type" ? { type: "type", targetHint: String(raw.targetHint || "").trim(), text: String(raw.text || "").trim() } :
        raw.type === "assertText" ? { type: "assertText", text: String(raw.text || "").trim() } :
        { type: "assertUrlChange", beforeUrl };

      console.log(`   [${step + 1}/${AGENT_MAX_STEPS}] ${describeAgentAction(action)}${raw.message ? " — " + raw.message : ""}`);

      try {
        await performAction(page, action, step);
        if (action.type === "click" || action.type === "assertUrlChange") {
          await settleAfterAction(page);
        }
        history.push({ action, outcome: "성공" });
        executedActions.push(action);
      } catch (err) {
        // 한 걸음 실패했다고 바로 포기하지 않는다 — 실패 사실을 AI에게 알려주고
        // 다음 단계에서 다른 방법을 고르게 한다 (버튼 텍스트를 잘못 짚었을 수도 있으니).
        history.push({ action, outcome: `실패 — ${err.message}` });
      }
    }

    if (!verdict) {
      verdict = { success: false, message: `${AGENT_MAX_STEPS}단계 안에 목표를 달성하지 못했습니다.` };
    }

    let screenshot = null;
    try {
      screenshot = await page.screenshot({ type: "png", encoding: "base64" });
    } catch {
      // 스크린샷 실패는 무시
    }

    await browser.close();
    browser = null;

    return {
      status: verdict.success ? "Pass" : "Fail",
      message: verdict.message,
      screenshot,
      actions: executedActions,
      stepLog: history.map((h) => `${describeAgentAction(h.action)} → ${h.outcome}`),
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    let screenshot = null;
    try {
      if (browser) {
        const pages = await browser.pages();
        screenshot = await pages[pages.length - 1].screenshot({ type: "png", encoding: "base64" });
      }
    } catch {}
    return {
      status: "Error",
      message: err.message,
      screenshot,
      actions: executedActions,
      stepLog: history.map((h) => `${describeAgentAction(h.action)} → ${h.outcome}`),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};

// TC 생성은 Puppeteer 인스턴스를 띄우므로 동시 실행 1개로 제한한다.
// 서버 RAM(1 GB)에서 Puppeteer 2개 동시 실행은 메모리 부족 → 타임아웃으로 이어진다.
let tcGenerationBusy = false;

app.post("/api/tc-from-url", async (req, res) => {
  const { url, numTCs = 10, useScreenshot = false } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL이 필요합니다." });
  }
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "http:// 또는 https:// 로 시작하는 URL만 지원합니다." });
  }
  if (tcGenerationBusy) {
    return res.status(503).json({ error: "TC 생성이 이미 진행 중입니다. 완료 후 다시 시도해주세요." });
  }
  tcGenerationBusy = true;

  console.log("\n========== URL→TC 생성 요청 ==========");
  console.log("URL:", url);

  try {
    const { pageInfo, screenshotBase64 } = await scrapePage(url, useScreenshot);

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
- expectedResult에 두 가지 이상의 가능성을 나열하는 것. "~하거나 ~한다" 형태뿐 아니라 "...한다 (또는 ~)"처럼 괄호로 대안을 슬쩍 끼워 넣는 것도 전부 금지. 확신이 없어서 대안을 적고 싶어진다면, 이벤트·게시글 링크 클릭처럼 "페이지 이동"이 목적인 경우엔 expectedResult를 "다른 페이지로 이동한다"로만 쓰고 actions 마지막에 {"type":"assertUrlChange"}를 사용할 것. 그 외에 대안이 필요하다면 TC 자체를 빼라.
- 서로 다른 링크·버튼 여러 개를 한 TC의 description에 나열하는 것 (예: "1. A 클릭 2. B 클릭 ... 10. J 클릭"). 하나의 TC는 하나의 독립된 시나리오만 검증해야 하며, 검증하고 싶은 요소가 여러 개면 TC를 그 개수만큼 나눠서 각각 만들 것.
- "가독성이 좋다", "이해하기 쉽다", "효과적으로 전달한다"처럼 사람마다 판단이 갈리는 주관적 항목. TC는 반드시 명확하게 참/거짓으로 판별 가능한 조건만 다룰 것.
- 텍스트/제목/메타데이터가 "페이지에 표시되는지 확인한다" 유형의 단순 존재 확인 TC는 전체 응답에서 최대 2개까지만 포함할 것 (3개째부터는 만들지 말 것). 버튼·입력·폼·링크 클릭처럼 실제 상호작용을 검증하는 TC를 항상 우선할 것.
- 이벤트 목록·게시판·기사 목록처럼 같은 유형의 클릭 가능한 항목이 여러 개 있는 페이지에서는, 각 항목을 개별 TC로 만들어 요청 개수(${numTCs}개)에 최대한 맞출 것. 항목이 충분히 있다면 가능한 한 ${numTCs}개를 채워라.
- 위 기준들 때문에 만들 수 있는 TC가 ${numTCs}개보다 적어지는 건, 페이지에 실제로 상호작용 요소가 부족할 때만 정상이다. 항목(링크·버튼)이 충분한데 개수를 줄이는 건 잘못된 판단이다.

각 TC마다 description을 실제 브라우저에서 자동으로 재현할 수 있는 "actions" 배열도 함께 만들어줘. actions의 각 항목은 아래 4종류 중 하나여야 해:
- {"type":"click","text":"버튼/링크에 실제로 표시된 텍스트 그대로"} — 그 텍스트를 포함하는 클릭 가능 요소를 클릭
- {"type":"type","targetHint":"입력필드의 placeholder나 라벨 일부","text":"입력할 값"} — 해당 입력 필드에 값을 입력
- {"type":"assertText","text":"이 문자열이 포함되어 있으면 성공"} — expectedResult에서 실제로 관찰 가능한 핵심 문구를 그대로 뽑아서 검증 조건으로 쓸 것
- {"type":"assertUrlChange"} — expectedResult가 "다른 페이지로 이동한다"는 뜻이면 사용 (파라미터 없음)
actions는 description의 단계 순서와 정확히 대응해야 하고, 마지막엔 반드시 expectedResult를 검증하는 assertText 또는 assertUrlChange가 있어야 한다. click/type에 쓰는 text는 위에 제공된 버튼/링크/입력필드 목록에 실제로 있는 텍스트만 쓸 것 — 지어내지 말 것.

예시 (형식 참고용 — 실제 케이스는 반드시 위에서 제공된 이 페이지의 실제 데이터에 근거해서 작성):
{
  "title": "이메일 형식이 아닌 값을 입력했을 때 에러 메시지 노출을 확인한다",
  "description": "1. 이메일 입력란에 'abc123'을 입력한다\\n2. '로그인' 버튼을 클릭한다",
  "expectedResult": "이메일 형식 오류 메시지가 입력란 하단에 표시되고 로그인이 진행되지 않는다",
  "priority": "High",
  "category": "로그인",
  "actions": [
    {"type":"type","targetHint":"이메일","text":"abc123"},
    {"type":"click","text":"로그인"},
    {"type":"assertText","text":"이메일 형식"}
  ]
}

다음 JSON 형식으로만 응답해줘. 다른 설명이나 마크다운 코드블록 표시 없이 순수 JSON만:

{
  "testcases": [
    {
      "title": "TC 제목",
      "description": "1. ... \\n2. ... \\n3. ...",
      "expectedResult": "기대 결과",
      "priority": "High",
      "category": "카테고리명",
      "actions": [ { "type": "click", "text": "..." } ]
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

    // actions 배열 검증 — 실행 엔진이 아는 타입만, 필요한 필드가 문자열로 있을 때만 통과시킨다.
    const ACTION_TYPES = new Set(["click", "type", "assertText", "assertUrlChange"]);
    const sanitizeActions = (actions) => {
      if (!Array.isArray(actions)) return [];
      return actions
        .filter((a) => a && ACTION_TYPES.has(a.type))
        .map((a) => {
          if (a.type === "click") return { type: "click", text: String(a.text || "").trim() };
          if (a.type === "type") return { type: "type", targetHint: String(a.targetHint || "").trim(), text: String(a.text || "").trim() };
          if (a.type === "assertText") return { type: "assertText", text: String(a.text || "").trim() };
          return { type: "assertUrlChange" };
        })
        .filter((a) => a.type === "assertUrlChange" || a.text); // text가 필요한 타입인데 비었으면 제외
    };

    const rawTestcases = (parsed.testcases || [])
      .filter((t) => t && t.title)
      .map((t) => ({
        title: String(t.title || "").trim(),
        description: String(t.description || "").trim(),
        expectedResult: String(t.expectedResult || "").trim(),
        priority: ["High", "Medium", "Low"].includes(t.priority) ? t.priority : "Medium",
        category: String(t.category || "").trim() || "URL 자동 생성",
        status: "Pending",
        sourceUrl: url,
        actions: sanitizeActions(t.actions),
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
    // scrapePage()가 자체 finally에서 브라우저를 정리하므로 여기서 더 닫을 게 없다.

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
  } finally {
    tcGenerationBusy = false;
  }
});

// 이 엔진은 "화면 하나 보고 액션 하나 결정"을 반복할 뿐, 여러 항목의 값을
// 한꺼번에 모아서 비교·정렬하는 능력은 없다 — click/type/assertText 중
// 어떤 action에도 "여러 개 중 최솟값 찾기"에 해당하는 게 없기 때문이다.
// "가장 싼 요금제 찾아줘" 같은 지시를 그냥 흘려보내면 AI가 아무 화면에서나
// 그럴듯한 이름의 항목을 찍고 끝내버려서, 사용자 입장에선 왜 틀렸는지도
// 알기 어려운 결과가 나온다. 실행 전에 걸러서 명확한 이유를 안내한다.
const looksLikeComparisonRequest = (text) => {
  if (/(최저가|최고가)/.test(text)) return true;
  const superlative = /(가장|제일|최고|최저)/.test(text);
  const cheapExpensive = /(싸|싼|저렴|비싸|비쌈)/.test(text);
  const priceWord = /(가격|요금|금액|가격대)/.test(text);
  const compareWord = /(비교|정렬|순위|랭킹|순으로)/.test(text);
  return (superlative && cheapExpensive) || (priceWord && (compareWord || superlative));
};

// ─────────────────────────────────────
// 5-2) 자연어 즉석 테스트 — "이 페이지에서 ~해봐"를 한 줄로 입력하면
// 그 자리에서 실행까지 끝내고 결과를 보여준다. URL→TC 생성(여러 개를 뽑아
// 목록에 저장)과 달리, 딱 하나를 즉시 만들어서 바로 실행하는 용도다.
// ─────────────────────────────────────
app.post("/api/nl-test", async (req, res) => {
  const { url, instruction } = req.body;

  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "http:// 또는 https:// 로 시작하는 URL이 필요합니다." });
  }
  if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
    return res.status(400).json({ error: "어떤 걸 테스트할지 자연어로 입력해주세요." });
  }
  if (looksLikeComparisonRequest(instruction)) {
    return res.status(422).json({
      error: "이 기능은 클릭/입력 같은 단일 동작 확인에 특화되어 있어서, 여러 항목의 가격을 비교해야 하는 요청은 지원하지 않습니다. 특정 화면에서의 단일 동작(예: 'OO 요금제 버튼 클릭해봐')을 지시해주세요.",
    });
  }

  console.log("\n========== 자연어 즉석 테스트 (에이전트 모드) ==========");
  console.log("URL:", url, "| 지시:", instruction);

  try {
    const result = await runAgenticNlTest(url, instruction.trim());
    console.log(`→ ${result.status} (${result.durationMs}ms, ${result.stepLog.length}단계 시도) — ${result.message}`);

    const tcLike = {
      title: instruction.trim().slice(0, 80),
      description: result.stepLog.length
        ? result.stepLog.map((s, i) => `${i + 1}. ${s}`).join("\n")
        : "(실행된 단계가 없습니다)",
      expectedResult: result.message,
      priority: "Medium",
      category: "자연어 테스트",
      sourceUrl: url,
      actions: result.actions,
    };

    const diagnosis =
      result.status === "Fail" || result.status === "Error"
        ? await diagnoseFailure(tcLike, result)
        : "";
    if (diagnosis) console.log(`   AI 진단: ${diagnosis}`);

    res.json({
      ...tcLike,
      status: result.status,
      message: result.message,
      screenshot: result.screenshot,
      aiDiagnosis: diagnosis,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error("❌ 자연어 즉석 테스트 오류:", err);
    let userMessage = err.message || "테스트 실행 중 오류가 발생했습니다.";
    if (err.status === 429) {
      userMessage = "Gemini API 쿼터 초과 — 잠시 후 다시 시도해주세요.";
    } else if (/timeout|Navigation timeout/i.test(err.message || "")) {
      userMessage = "페이지 로딩 시간 초과 — 봇 차단이 있는 사이트일 수 있습니다.";
    }
    res.status(500).json({ error: userMessage });
  }
});

// ─────────────────────────────────────
// 6) Testcases CRUD
// ─────────────────────────────────────
app.get("/api/testcases", requireDb, async (req, res) => {
  // 생성 시각이 아니라 TC 번호 순으로 정렬 — 수정/재생성으로 createdAt이 뒤섞여도
  // 항상 TC-0001, 0002... 순서로 보이게 한다.
  const list = await Testcase.find().sort({ tcId: 1 }).lean();
  res.json(list.map(({ _id, __v, tcId, ...rest }) => ({ tcId, ...rest })));
});

app.post("/api/testcases", requireDb, async (req, res) => {
  try {
    const tcId = await nextTcId();
    const doc = await Testcase.create({ tcId, ...req.body });
    const { _id, __v, tcId: tid, ...rest } = doc.toObject();
    res.status(201).json({ tcId: tid, ...rest });
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
    res.json({ tcId, ...rest });
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
    out.push({ tcId: tid, ...rest });
  }
  res.status(201).json(out);
});

// ─────────────────────────────────────
// 6-1) TC 자동 실행
// ─────────────────────────────────────

// 하나의 TC를 실제로 실행하고, 결과를 TC 문서(캐시)와 TestRun(이력)에 같이 기록한다.
app.post("/api/testcases/:id/run", requireDb, async (req, res) => {
  const tc = await Testcase.findOne({ tcId: req.params.id }).lean();
  if (!tc) return res.status(404).json({ error: "not found" });

  console.log(`\n========== TC 실행: ${tc.tcId} ==========`);
  const result = await runTestcase(tc);
  console.log(`→ ${result.status} (${result.durationMs}ms)${result.message ? " — " + result.message : ""}`);

  // 실패했을 때만 AI 진단을 추가로 받는다 (성공한 건 진단할 게 없음)
  const diagnosis = result.status === "Fail" ? await diagnoseFailure(tc, result) : "";
  if (diagnosis) console.log(`   AI 진단: ${diagnosis}`);

  await Testcase.updateOne(
    { tcId: req.params.id },
    { $set: { lastRunStatus: result.status, lastRunAt: new Date(), lastRunMessage: result.message || "", lastRunDiagnosis: diagnosis } }
  );
  await TestRun.create({
    tcId: req.params.id,
    tcTitle: tc.title,
    status: result.status,
    message: result.message || "",
    screenshot: result.screenshot || null,
    aiDiagnosis: diagnosis,
    durationMs: result.durationMs,
  });

  res.json({
    tcId: req.params.id,
    status: result.status,
    message: result.message,
    screenshot: result.screenshot,
    aiDiagnosis: diagnosis,
    durationMs: result.durationMs,
  });
});

// 여러 TC를 순서대로(동시 실행 아님 — 서버 메모리가 작아서 한 번에 하나씩) 실행한다.
// ids를 안 주면 actions가 있는 TC 전체를 실행한다.
app.post("/api/testcases/run-batch", requireDb, async (req, res) => {
  const { ids } = req.body || {};
  const query = Array.isArray(ids) && ids.length > 0
    ? { tcId: { $in: ids } }
    : { actions: { $exists: true, $ne: [] } };
  const list = await Testcase.find(query).lean();

  console.log(`\n========== TC 일괄 실행 (${list.length}건) ==========`);
  const results = [];
  for (const tc of list) {
    const result = await runTestcase(tc);
    console.log(`→ ${tc.tcId} ${result.status}${result.message ? " — " + result.message : ""}`);

    const diagnosis = result.status === "Fail" ? await diagnoseFailure(tc, result) : "";
    if (diagnosis) console.log(`   AI 진단: ${diagnosis}`);

    await Testcase.updateOne(
      { tcId: tc.tcId },
      { $set: { lastRunStatus: result.status, lastRunAt: new Date(), lastRunMessage: result.message || "", lastRunDiagnosis: diagnosis } }
    );
    await TestRun.create({
      tcId: tc.tcId,
      tcTitle: tc.title,
      status: result.status,
      message: result.message || "",
      screenshot: result.screenshot || null,
      aiDiagnosis: diagnosis,
      durationMs: result.durationMs,
    });

    results.push({ tcId: tc.tcId, title: tc.title, status: result.status, message: result.message, aiDiagnosis: diagnosis, durationMs: result.durationMs });
  }

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === "Pass").length,
    fail: results.filter((r) => r.status === "Fail").length,
    error: results.filter((r) => r.status === "Error").length,
  };
  res.json({ summary, results });
});

// 실행 이력 조회 (최근 순). ?tcId=TC-0001 로 특정 TC만 필터 가능.
app.get("/api/test-runs", requireDb, async (req, res) => {
  const query = req.query.tcId ? { tcId: req.query.tcId } : {};
  const list = await TestRun.find(query).sort({ createdAt: -1 }).limit(100).lean();
  res.json(
    list.map(({ _id, __v, ...rest }) => ({ id: _id, ...rest }))
  );
});

// 실패/에러로 끝난 실행 기록 하나를 골라 AI가 정식 버그 리포트를 작성하고 Bugs 목록에 바로 등록한다.
app.post("/api/test-runs/:id/bug-report", requireDb, async (req, res) => {
  try {
    const run = await TestRun.findById(req.params.id).lean();
    if (!run) return res.status(404).json({ error: "실행 기록을 찾을 수 없습니다." });
    if (run.status !== "Fail" && run.status !== "Error") {
      return res.status(400).json({ error: "실패한 실행 기록에서만 버그 리포트를 만들 수 있습니다." });
    }

    console.log(`\n========== 버그 리포트 자동 생성: ${run.tcId} ==========`);
    const draft = await generateBugReportFromRun(run);

    const bugId = await nextBugId();
    const doc = await Bug.create({
      bugId,
      ...draft,
      status: "Open",
      relatedTC: run.tcId,
      environment: "자동 실행 (Puppeteer)",
      screenshot: run.screenshot || null,
    });
    const { _id, __v, bugId: bid, ...rest } = doc.toObject();
    console.log(`→ ${bid} 등록됨: ${draft.title}`);
    res.status(201).json({ bugId: bid, ...rest });
  } catch (err) {
    console.error("버그 리포트 생성 실패:", err.message);
    if (/429|quota/i.test(err.message || "")) {
      return res.status(429).json({ error: "AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." });
    }
    res.status(500).json({ error: "버그 리포트 생성에 실패했습니다: " + err.message });
  }
});

// ─────────────────────────────────────
// 7) Bugs CRUD
// ─────────────────────────────────────
app.get("/api/bugs", requireDb, async (req, res) => {
  const list = await Bug.find().sort({ createdAt: 1 }).lean();
  res.json(list.map(({ _id, __v, bugId, ...rest }) => ({ bugId, ...rest })));
});

app.post("/api/bugs", requireDb, async (req, res) => {
  try {
    const bugId = await nextBugId();
    const doc = await Bug.create({ bugId, ...req.body });
    const { _id, __v, bugId: bid, ...rest } = doc.toObject();
    res.status(201).json({ bugId: bid, ...rest });
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

    let updated = await Bug.findOneAndUpdate(
      { bugId: req.params.id },
      { $set: patch },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: "not found" });

    // "Resolved"로 바뀌었고 자동 실행 가능한 TC와 연결돼 있으면, 사람 확인만 믿지 않고
    // 그 자리에서 TC를 다시 돌려 실제로 고쳐졌는지 확인한다. 여전히 실패하면
    // Resolved 표시를 그대로 믿지 않고 자동으로 Open으로 되돌린다.
    if (patch.status === "Resolved" && updated.relatedTC) {
      const tc = await Testcase.findOne({ tcId: updated.relatedTC }).lean();
      if (tc && tc.sourceUrl && Array.isArray(tc.actions) && tc.actions.length > 0) {
        console.log(`\n========== 버그 해결 자동 재검증: ${updated.bugId} → ${tc.tcId} ==========`);
        const result = await runTestcase(tc);
        const diagnosis = result.status === "Fail" ? await diagnoseFailure(tc, result) : "";
        console.log(`→ ${result.status}${diagnosis ? " | AI 진단: " + diagnosis : ""}`);

        await Testcase.updateOne(
          { tcId: tc.tcId },
          { $set: { lastRunStatus: result.status, lastRunAt: new Date(), lastRunMessage: result.message || "", lastRunDiagnosis: diagnosis } }
        );
        await TestRun.create({
          tcId: tc.tcId,
          tcTitle: tc.title,
          status: result.status,
          message: result.message || "",
          screenshot: result.screenshot || null,
          aiDiagnosis: diagnosis,
          durationMs: result.durationMs,
        });

        const verifyPatch = {
          verifiedAt: new Date(),
          verifiedStatus: result.status,
          verifiedMessage:
            result.status === "Pass"
              ? "자동 재검증 통과 — 실제로 해결된 것을 확인했습니다."
              : `자동 재검증 실패 — 아직 재현됩니다. ${result.message || ""}`.trim(),
        };
        if (result.status !== "Pass") {
          verifyPatch.status = "Open";
          verifyPatch.resolvedAt = null;
        }

        updated = await Bug.findOneAndUpdate(
          { bugId: req.params.id },
          { $set: verifyPatch },
          { new: true }
        ).lean();
        console.log(`→ ${updated.bugId} 최종 상태: ${updated.status}`);
      }
    }

    const { _id, __v, bugId, ...rest } = updated;
    res.json({ bugId, ...rest });
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
  res.json(list.map(({ _id, __v, postId, ...rest }) => ({ postId, ...rest })));
});

app.get("/api/posts/:id", requireDb, async (req, res) => {
  const p = await Post.findOne({ postId: Number(req.params.id) }).lean();
  if (!p) return res.status(404).json({ error: "not found" });
  const { _id, __v, postId, ...rest } = p;
  res.json({ postId, ...rest });
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
    res.status(201).json({ postId: pid, ...rest });
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
