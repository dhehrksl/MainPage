import React, { useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import fuzz from "fuzzball";
import axios from "axios";

const TcChecker = () => {
  const [results, setResults] = useState([]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const newResults = [];
    for (const row of rows) {
      const input = row["발화"];
      const expected = row["기대값"];

      try {
        const res = await axios.post("http://localhost:4000/api/llm", { prompt: input });
        const actual = res.data.result.trim();
        const score = fuzz.ratio(expected, actual);
        const status = score > 80 ? "PASS" : "FAIL";

        newResults.push({
          발화: input,
          기대값: expected,
          결과값: actual,
          유사도: score,
          상태: status,
        });
      } catch (err) {
        console.error("API 호출 오류:", err.message);
        newResults.push({
          발화: input,
          기대값: expected,
          결과값: "API 호출 실패",
          유사도: 0,
          상태: "FAIL",
        });
      }
    }

    setResults(newResults);

    // 새로운 엑셀 생성
    const ws = XLSX.utils.json_to_sheet(newResults);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");

    const excelBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    saveAs(new Blob([excelBuffer], { type: "application/octet-stream" }), "tc_results.xlsx");
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">유사 TC 검증기 (무료 LLM 기반)</h2>
      <input type="file" accept=".xlsx" onChange={handleFileUpload} />
      <div className="mt-4">
        {results.map((r, i) => (
          <div
            key={i}
            className={`p-2 border-b ${
              r.상태 === "PASS" ? "text-green-600" : "text-red-600"
            }`}
          >
            <b>발화:</b> {r.발화} | <b>기대:</b> {r.기대값} | <b>결과:</b> {r.결과값} |{" "}
            <b>유사도:</b> {r.유사도}% | <b>상태:</b> {r.상태}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TcChecker;
