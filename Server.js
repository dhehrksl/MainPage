import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("GOOGLE_API_KEY:", process.env.GOOGLE_API_KEY);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// 🔹 유사 TC 생성 엔드포인트
app.post("/generate", async (req, res) => {
  const { text, numSimilars = 5 } = req.body;

  console.log("========== 새 요청 ==========");
  console.log("수신 text:", text);
  console.log("numSimilars:", numSimilars);

  if (!text || !text.trim()) {
    return res.status(400).json({
      base: text || "(빈 발화)",
      similars: Array(numSimilars).fill("(생성 실패)"),
      error: "대표 발화가 비어있습니다."
    });
  }

  try {
    // 🔹 지원 모델로 변경
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `아래 문장을 기반으로 ${numSimilars}개의 유사 발화를 만들어줘.
각 발화는 한 줄에 하나씩 출력해줘.
대표 발화: "${text}"`;

    console.log("Prompt sent to AI:\n", prompt);

    const result = await model.generateContent(prompt);

    if (!result || !result.response || !result.response.text) {
      throw new Error("AI 응답이 비정상적입니다.");
    }

    const rawText = result.response.text();
    console.log("Raw AI response:\n", rawText);

    const similars = rawText
      .split(/\r?\n/)
      .map((t) => t.trim().replace(/^\d+\.\s*/, ""))
      .filter(Boolean)
      .slice(0, Number(numSimilars));

    while (similars.length < numSimilars) similars.push("(생성 실패)");

    console.log("최종 similars 배열:", similars);

    return res.json({ base: text, similars });

  } catch (err) {
    console.error("AI Error:", err);
    return res.status(500).json({
      base: text,
      similars: Array(numSimilars).fill("(생성 실패)"),
      error: err.message || "(알 수 없는 오류)"
    });
  }
});

// 🔹 테스트용 엔드포인트
app.post("/generate-test", async (req, res) => {
  return res.json({ base: "테스트 발화", similars: ["유사 발화 1", "유사 발화 2", "유사 발화 3"] });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
