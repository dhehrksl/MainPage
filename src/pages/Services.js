import { useState } from "react";
import * as XLSX from "xlsx";

const Services = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [tcResults, setTcResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet);
      setUploadedData(json);
    };
    reader.readAsArrayBuffer(file);
  };

  const generateSimilarTC = async () => {
    if (!uploadedData.length) return alert("엑셀을 업로드하세요!");
    setLoading(true);
    const results = [];

    for (let row of uploadedData) {
      const baseText = row["대표 발화"];
      const response = await fetch(
        "https://api-inference.huggingface.co/models/gpt2",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: `이 문장을 기반으로 5개의 유사 발화를 만들어줘: ${baseText}`,
          }),
        }
      );
      const data = await response.json();
      let similars = [];
      if (data[0]?.generated_text) {
        similars = data[0].generated_text
          .split("\n")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5);
      }
      results.push({ base: baseText, similars });
    }

    setTcResults(results);
    setLoading(false);
  };

  const downloadExcel = () => {
    const exportData = tcResults.map((tc) => ({
      "대표 발화": tc.base,
      "유사 TC": tc.similars.join(", "),
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "유사 TC");
    XLSX.writeFile(wb, "generated_TC.xlsx");
  };

  return (
    <section style={{ padding: "40px", textAlign: "center" }}>
      <h1>유사 TC 생성기</h1>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        style={{ margin: "20px 0", padding: "10px", fontSize: "16px" }}
      />
      <br />
      <button
        onClick={generateSimilarTC}
        style={{ padding: "10px 20px", marginRight: "10px", cursor: "pointer" }}
      >
        {loading ? "생성중..." : "유사 TC 생성"}
      </button>
      <button
        onClick={downloadExcel}
        style={{ padding: "10px 20px", cursor: "pointer" }}
      >
        엑셀 다운로드
      </button>

      <div style={{ marginTop: "30px" }}>
        {tcResults.map((tc, idx) => (
          <div key={idx} style={cardStyle}>
            <h3>대표 발화: {tc.base}</h3>
            <ul>
              {tc.similars.map((sim, i) => (
                <li key={i}>{sim}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};

const cardStyle = {
  background: "#fff",
  padding: "20px",
  borderRadius: "15px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
  margin: "15px auto",
  maxWidth: "600px",
  textAlign: "left",
  transition: "0.3s",
};

export default Services;
