import React, { useState } from "react";
import * as XLSX from "xlsx";

const Services = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [tcResults, setTcResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [numSimilars, setNumSimilars] = useState(5);

  // 🔹 엑셀 업로드
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      setUploadedData(json);
      console.log("업로드된 데이터:", json);
    };
    reader.readAsArrayBuffer(file);
  };

  // 🔹 AI 호출하여 유사 TC 생성
  const generateSimilarTC = async () => {
    if (!uploadedData.length) return alert("엑셀을 업로드하세요!");
    setLoading(true);

    try {
      const promises = uploadedData.map(async (row) => {
        const baseText = row["대표 발화"] || row["대표발화"] || row["utterance"] || "";
        if (!baseText.trim()) {
          return { base: "(대표 발화 없음)", similars: Array(numSimilars).fill("(생성 실패)") };
        }
        try {
          const resp = await fetch("http://localhost:5000/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: baseText, numSimilars }),
          });

          console.log("서버 상태:", resp.status);

          if (!resp.ok) throw new Error(`서버 상태: ${resp.status}`);

          const data = await resp.json();
          console.log("서버 응답 데이터:", data);

          if (data.error) {
            console.warn("서버 에러 메시지:", data.error);
          }
          return data;
        } catch (err) {
          console.error("서버 호출 오류:", err);
          return { base: baseText, similars: Array(numSimilars).fill("(생성 실패)") };
        }
      });

      const results = await Promise.all(promises);
      setTcResults(results);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 테스트용 AI 호출 (엑셀 없이)
  const generateTestTC = async () => {
    setLoading(true);
    try {
      const resp = await fetch("http://localhost:5000/generate-test", { method: "POST" });
      const data = await resp.json();
      console.log("테스트 서버 응답:", data);
      setTcResults([data]);
    } catch (err) {
      console.error("테스트 호출 오류:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 결과 엑셀 다운로드
  const downloadExcel = () => {
    if (!tcResults.length) return;
    const exportData = tcResults.map((tc) => {
      const row = { "대표 발화": tc.base };
      tc.similars.forEach((s, i) => (row[`유사 발화 ${i + 1}`] = s));
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "유사 TC");
    XLSX.writeFile(wb, "generated_TC.xlsx");
  };

  return (
    <section style={{ padding: 40, textAlign: "center" }}>
      <h1>유사 TC 생성기</h1>

      <div style={{ marginBottom: 12 }}>
        <input
          type="number"
          min={1}
          max={20}
          value={numSimilars}
          onChange={(e) => setNumSimilars(Number(e.target.value))}
          style={{ width: 80, padding: 6, marginRight: 8 }}
        />
        <span>개 유사 발화 생성</span>
      </div>

      <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
      <br />

      <div style={{ marginTop: 12 }}>
        <button onClick={generateSimilarTC} disabled={loading} style={{ marginRight: 8 }}>
          {loading ? "생성중..." : "유사 TC 생성"}
        </button>

        <button onClick={generateTestTC} disabled={loading} style={{ marginRight: 8 }}>
          테스트 발화 생성
        </button>

        <button onClick={downloadExcel} disabled={!tcResults.length}>
          엑셀 다운로드
        </button>
      </div>

      <div style={{ marginTop: 30 }}>
        {tcResults.map((tc, idx) => (
          <div key={idx} style={cardStyle}>
            <h3>대표 발화: {tc.base}</h3>
            <ul>{tc.similars.map((s, i) => (<li key={i}>{s}</li>))}</ul>
          </div>
        ))}
      </div>
    </section>
  );
};

const cardStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 8px 20px rgba(0,0,0,0.06)",
  margin: "12px auto",
  maxWidth: 700,
  textAlign: "left",
};

export default Services;
