import React, { useState } from "react";
import * as XLSX from "xlsx";

const Services = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [tcResults, setTcResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [numSimilars, setNumSimilars] = useState(5);
  const [error, setError] = useState("");

<<<<<<< HEAD
  // 📂 엑셀 업로드 핸들러
=======
  // 🔹 엑셀 업로드
>>>>>>> c105bd6a4f7cbf87e924c64efa5e961abd6d16b6
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        setUploadedData(json);
        setError("");
        console.log("📄 업로드된 데이터:", json);
      } catch (err) {
        console.error("❌ 엑셀 파싱 오류:", err);
        setError("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

<<<<<<< HEAD
  // 🤖 AI 서버 호출 (유사 발화 생성)
  const generateSimilarTC = async () => {
    if (uploadedData.length === 0) {
      return alert("먼저 엑셀 파일을 업로드해주세요!");
    }

    setLoading(true);
    setError("");
    setTcResults([]);

    try {
      const results = [];

      for (const [index, row] of uploadedData.entries()) {
        const baseText = row["대표 발화"] || row["대표발화"] || row["utterance"] || "";
        if (!baseText.trim()) {
          results.push({
            base: "(대표 발화 없음)",
            similars: Array(numSimilars).fill("(입력 없음)"),
          });
          continue;
        }

        try {
          const response = await fetch("http://localhost:5000/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: baseText, numSimilars }),
          });

          if (!response.ok) {
            throw new Error(`서버 오류 (${response.status})`);
          }

          const data = await response.json();
          console.log(`✅ [${index + 1}] 응답:`, data);
          results.push(data);
        } catch (err) {
          console.error(`❌ [${index + 1}] API 호출 실패:`, err);
          results.push({
            base: baseText,
            similars: Array(numSimilars).fill("(생성 실패)"),
          });
        }
      }

      setTcResults(results);
    } catch (err) {
      console.error("❌ 전체 처리 오류:", err);
      setError("AI 서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 💾 결과 엑셀 다운로드
  const downloadExcel = () => {
    if (tcResults.length === 0) return;

    const exportData = tcResults.map((result) => {
      const row = { "대표 발화": result.base };
      result.similars.forEach((s, i) => {
        row[`유사 발화 ${i + 1}`] = s;
      });
=======
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
>>>>>>> c105bd6a4f7cbf87e924c64efa5e961abd6d16b6
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "유사 발화 생성 결과");
    XLSX.writeFile(workbook, "유사_발화_생성_결과.xlsx");
  };

  return (
    <section style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>유사 발화 생성기 (AI)</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          type="number"
          min={1}
          max={20}
          value={numSimilars}
          onChange={(e) => setNumSimilars(Number(e.target.value))}
          style={{
            width: 80,
            padding: 8,
            marginRight: 8,
            textAlign: "center",
          }}
        />
        <span>개의 유사 발화를 생성합니다.</span>
      </div>

      <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} />
      <br />

<<<<<<< HEAD
      <div style={{ marginTop: 20 }}>
        <button
          onClick={generateSimilarTC}
          disabled={loading || uploadedData.length === 0}
          style={{
            marginRight: 8,
            padding: "10px 15px",
            backgroundColor: loading ? "#ccc" : "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "생성 중..." : "유사 발화 생성 시작"}
        </button>
        <button
          onClick={downloadExcel}
          disabled={tcResults.length === 0}
          style={{
            padding: "10px 15px",
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: tcResults.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          결과 엑셀 다운로드
        </button>
=======
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
>>>>>>> c105bd6a4f7cbf87e924c64efa5e961abd6d16b6
      </div>

      {error && (
        <p style={{ color: "red", marginTop: 15, fontWeight: "bold" }}>⚠ {error}</p>
      )}

      <div style={{ marginTop: 30 }}>
        {tcResults.map((tc, idx) => (
          <div key={idx} style={cardStyle}>
            <h3>대표 발화: {tc.base}</h3>
            <ul style={{ paddingLeft: 20 }}>
              {tc.similars.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

const cardStyle = {
  background: "#f9f9f9",
  padding: 20,
  borderRadius: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  margin: "12px auto",
  maxWidth: 700,
  textAlign: "left",
};

export default Services;
