import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config({ path: "./.env" });

const app = express();
app.use(cors());
app.use(express.json());

console.log("✅ GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY ? "로드됨" : "(없음)");

let genAI;
try {
  genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
} catch (err) {
  console.error("❌ GoogleGenerativeAI 초기화 실패:", err.message);
}

app.post("/generate", async (req, res) => {
  const { text, numSimilars = 5 } = req.body;

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
      // ✅ 모델 이름 최신화 (이 부분이 중요!)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `다음 대표 발화를 참고해서 ${numSimilars}개의 자연스러운 유사 발화를 만들어줘.
각 발화는 한 줄에 하나씩 출력하고, 번호나 특수문자는 붙이지 마.

대표 발화: "${text}"`;

    const result = await model.generateContent(prompt);

    const response = await result.response;
    const rawText = response.text();

    console.log("AI 응답 원본:", rawText);

    const similars = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, numSimilars);

    while (similars.length < numSimilars) {
      similars.push("(생성 실패)");
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

// 테스트용
app.post("/generate-test", (req, res) => {
  res.json({
    base: "테스트 발화",
    similars: ["유사 발화 1", "유사 발화 2", "유사 발화 3"],
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`🚀 서버가 ${port}번 포트에서 실행 중입니다.`));
