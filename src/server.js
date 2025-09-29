import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.post("/api/llm", async (req, res) => {
  const { prompt } = req.body;

  try {
    const response = await axios.post("http://localhost:11434/api/generate", {
      model: "mistral",
      prompt,
    });

    res.json({ result: response.data.response });
  } catch (error) {
    console.error("LLM 호출 실패:", error.message);
    res.status(500).json({ error: "LLM 호출 실패" });
  }
});

const PORT = 4000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
