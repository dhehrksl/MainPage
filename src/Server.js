// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// SDK 초기화: apiKey는 .env의 GOOGLE_API_KEY 사용
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// POST /generate
// body: { text: string, numSimilars: number }
app.post("/generate", async (req, res) => {
  const { text, numSimilars = 5 } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  try {
    // prompt 구성 — 모델이 줄바꿈으로 리스트를 반환하도록 명시
    const prompt = `아래 문장을 기반으로 ${numSimilars}개의 유사 발화를 만들어줘.
각 발화는 자연스럽고 한 줄에 하나씩 출력해줘.
대표 발화: "${text}"`;

    // SDK 호출: model 이름은 프로젝트의 사용 가능한 모델로 바꿔도 됩니다
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      // SDK는 contents로 문자열도 받을 수 있음
      contents: prompt,
      config: {
        // thinkingBudget: 0 으로 'thinking' 비활성화 가능 (선택)
        thinkingConfig: { thinkingBudget: 0 },
        // 필요하면 그 외 config 추가
      },
    });

    // SDK 응답에서 텍스트 추출 — 형태가 달라질 수 있으니 안전하게 처리
    // (SDK의 response 형태에 따라 아래를 조정하세요)
    const rawText =
      // 가장 흔한 필드
      response?.text ||
      // fallback: results / candidates / output 같은 구조가 올 경우
      response?.results?.[0]?.content?.[0]?.text ||
      response?.candidates?.[0]?.content?.[0]?.text ||
      "";

    // 분리: 줄바꿈 기반 또는 번호형식 제거
    const similars = rawText
      .split(/\r?\n/)
      .map((t) => t.trim().replace(/^\d+\.\s*/, ""))
      .filter(Boolean)
      .slice(0, Number(numSimilars));

    // 보장: 요청한 개수만큼 채워서 반환(부족하면 (생성 실패)로 채움)
    while (similars.length < numSimilars) similars.push("(생성 실패)");

    return res.json({ base: text, similars });
  } catch (err) {
    console.error("GenAI error:", err);
    return res.status(500).json({ base: text, similars: Array(numSimilars).fill("(생성 실패)") });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server listening on ${port}`));
