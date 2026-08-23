import React, { useState } from "react";
import * as XLSX from "xlsx";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Flex, Spinner, Badge, colors, fadeIn,
} from "../styles/theme";
import { API_BASE, fetchUtterances } from "../api/client";

// 점수 등급: 85+ 우수(초록) / 60~84 양호(주황) / 60 미만 주의(빨강)
const scoreTier = (score) => {
  if (score >= 85) return "good";
  if (score >= 60) return "mid";
  return "low";
};

const Services = () => {
  const [uploadedData, setUploadedData] = useState([]);
  const [tcResults, setTcResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [numSimilars, setNumSimilars] = useState(5);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [persist, setPersist] = useState(true);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  const openHistory = async () => {
    const { data } = await fetchUtterances();
    setHistory(data);
    setShowHistory(true);
  };

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
        setTcResults([]);
      } catch {
        setError("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const generateSimilarTC = async () => {
    if (uploadedData.length === 0) return;

    setLoading(true);
    setError("");
    setTcResults([]);

    try {
      const rows = uploadedData.map((row) => String(row["대표 발화"] || row["대표발화"] || row["utterance"] || "").trim());
      const results = new Array(rows.length).fill(null);

      // 빈 대표 발화는 API 호출 없이 로컬에서 바로 처리
      const validIdxs = [];
      rows.forEach((text, i) => {
        if (text) validIdxs.push(i);
        else results[i] = { base: "(대표 발화 없음)", similars: Array(numSimilars).fill({ text: "(입력 없음)", score: null }) };
      });

      // 대표 발화 여러 개를 한 번의 API 호출에 묶어서 보낸다.
      // 무료 등급은 "요청 횟수" 자체가 한도이므로, 배치 크기는 (발화 수 × numSimilars)가
      // 너무 커지지 않도록 numSimilars에 반비례해서 정한다.
      const batchSize = Math.max(3, Math.floor(60 / Math.max(numSimilars, 1)));
      const batches = [];
      for (let i = 0; i < validIdxs.length; i += batchSize) {
        batches.push(validIdxs.slice(i, i + batchSize));
      }

      setProgress({ current: 0, total: batches.length });

      for (const [batchIdx, idxGroup] of batches.entries()) {
        setProgress({ current: batchIdx + 1, total: batches.length });
        const texts = idxGroup.map((i) => rows[i]);

        try {
          const response = await fetch(`${API_BASE}/generate-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts, numSimilars, persist }),
          });

          if (!response.ok) throw new Error(`서버 오류 (${response.status})`);

          const data = await response.json();
          idxGroup.forEach((originalIdx, j) => {
            results[originalIdx] = data.results?.[j] || {
              base: texts[j],
              similars: Array(numSimilars).fill({ text: "(생성 실패)", score: 0 }),
            };
          });
        } catch {
          idxGroup.forEach((originalIdx, j) => {
            results[originalIdx] = { base: texts[j], similars: Array(numSimilars).fill({ text: "(생성 실패)", score: 0 }) };
          });
        }
      }

      setTcResults(results);
    } catch {
      setError("AI 서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (tcResults.length === 0) return;

    const exportData = tcResults.map((result) => {
      const row = { "대표 발화": result.base };
      result.similars.forEach((s, i) => {
        row[`유사 발화 ${i + 1}`] = s.text ?? s;
        row[`점수 ${i + 1}`] = s.score ?? "";
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "유사 발화 생성 결과");
    XLSX.writeFile(workbook, "유사_발화_생성_결과.xlsx");
  };

  return (
    <PageWrapper>
      <PageHeader>
        <PageTitle>유사 발화 생성기</PageTitle>
        <PageSubtitle>엑셀 파일을 업로드하면 AI가 유사 발화를 자동으로 생성합니다</PageSubtitle>
      </PageHeader>

      <Card>
        {/* 업로드 영역 */}
        <UploadZone htmlFor="file-upload" $hasFile={uploadedData.length > 0}>
          <span className="material-icons" style={{ fontSize: 40 }}>
            {uploadedData.length > 0 ? "check_circle" : "cloud_upload"}
          </span>
          <UploadText>
            {uploadedData.length > 0
              ? `${uploadedData.length}개 항목 로드됨`
              : "엑셀 파일을 선택하세요 (.xlsx, .xls)"}
          </UploadText>
          <input id="file-upload" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} hidden />
        </UploadZone>

        {/* 컨트롤 영역 */}
        <Flex $justify="space-between" $wrap style={{ marginTop: 24 }}>
          <Flex $gap="16px" $wrap>
            <Flex $gap="10px">
              <span style={{ fontSize: "0.9rem", color: colors.textSecondary }}>유사 발화 수:</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={numSimilars}
                onChange={(e) => setNumSimilars(Number(e.target.value))}
                $width="80px"
                style={{ textAlign: "center" }}
              />
            </Flex>
            <PersistToggle>
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                id="persist-toggle"
              />
              <label htmlFor="persist-toggle">
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: "-3px" }}>save</span>
                {" "}DB에 저장
              </label>
            </PersistToggle>
          </Flex>
          <Flex $gap="10px">
            <Button $variant="secondary" onClick={openHistory}>
              <span className="material-icons" style={{ fontSize: 18 }}>history</span>
              이력 보기
            </Button>
            <Button
              $variant="primary"
              onClick={generateSimilarTC}
              disabled={loading || uploadedData.length === 0}
            >
              <span className="material-icons" style={{ fontSize: 18 }}>auto_awesome</span>
              {loading ? `생성 중 (배치 ${progress.current}/${progress.total})` : "유사 발화 생성"}
            </Button>
            <Button
              $variant="success"
              onClick={downloadExcel}
              disabled={tcResults.length === 0}
            >
              <span className="material-icons" style={{ fontSize: 18 }}>download</span>
              엑셀 다운로드
            </Button>
          </Flex>
        </Flex>

        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>

      {loading && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Spinner />
          <p style={{ color: colors.textSecondary, fontSize: "0.9rem" }}>
            AI가 유사 발화를 생성하고 있습니다... (배치 {progress.current}/{progress.total})
          </p>
        </div>
      )}

      {/* 업로드 미리보기 */}
      {uploadedData.length > 0 && tcResults.length === 0 && !loading && (
        <PreviewSection>
          <SectionLabel>업로드된 발화 미리보기</SectionLabel>
          {uploadedData.slice(0, 10).map((row, i) => {
            const text = row["대표 발화"] || row["대표발화"] || row["utterance"] || "(없음)";
            return (
              <PreviewItem key={i}>
                <Badge $color="info">{i + 1}</Badge>
                <span>{text}</span>
              </PreviewItem>
            );
          })}
          {uploadedData.length > 10 && (
            <p style={{ color: colors.textSecondary, fontSize: "0.85rem", textAlign: "center", marginTop: 8 }}>
              ... 외 {uploadedData.length - 10}개 항목
            </p>
          )}
        </PreviewSection>
      )}

      {/* 이력 모달 */}
      {showHistory && (
        <HistoryOverlay onClick={() => setShowHistory(false)}>
          <HistoryCard onClick={(e) => e.stopPropagation()}>
            <Flex $justify="space-between" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>유사 발화 생성 이력</h3>
              <CloseBtn onClick={() => setShowHistory(false)}>
                <span className="material-icons">close</span>
              </CloseBtn>
            </Flex>
            {history.length === 0 ? (
              <p style={{ color: colors.textSecondary, textAlign: "center", padding: "24px 0" }}>
                저장된 이력이 없습니다 (DB 미연결 또는 저장 내역 없음)
              </p>
            ) : (
              history.map((h, i) => (
                <HistoryItem key={h._id || i}>
                  <Flex $justify="space-between" style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: "0.9rem", color: colors.primary }}>{h.base}</strong>
                    <span style={{ fontSize: "0.75rem", color: colors.textSecondary }}>
                      {new Date(h.createdAt).toLocaleString("ko-KR")}
                    </span>
                  </Flex>
                  <ul style={{ margin: "6px 0 0 20px", padding: 0, fontSize: "0.85rem", color: colors.text, listStyle: "none" }}>
                    {(h.similars || []).map((s, idx) => {
                      const score = h.scores?.[idx];
                      return (
                        <li key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span>{s}</span>
                          {Number.isFinite(score) && <ScoreBadge $tier={scoreTier(score)}>{score}점</ScoreBadge>}
                        </li>
                      );
                    })}
                  </ul>
                </HistoryItem>
              ))
            )}
          </HistoryCard>
        </HistoryOverlay>
      )}

      {/* 결과 */}
      {tcResults.length > 0 && (
        <ResultsSection>
          <SectionLabel>생성 결과 ({tcResults.length}건)</SectionLabel>
          {tcResults.map((tc, idx) => {
            const validScores = tc.similars.map((s) => s.score).filter((n) => Number.isFinite(n));
            const avgScore = validScores.length
              ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
              : null;
            return (
              <ResultCard key={idx}>
                <ResultHeader>
                  <Badge $color="info">#{idx + 1}</Badge>
                  <ResultBase>{tc.base}</ResultBase>
                  {avgScore !== null && <ScoreBadge $tier={scoreTier(avgScore)}>평균 {avgScore}점</ScoreBadge>}
                </ResultHeader>
                <SimilarGrid>
                  {tc.similars.map((s, i) => {
                    const text = typeof s === "string" ? s : s.text;
                    const score = typeof s === "string" ? null : s.score;
                    return (
                      <SimilarItem key={i}>
                        <SimilarNum>{i + 1}</SimilarNum>
                        <span>{text}</span>
                        {score !== null && <ScoreBadge $tier={scoreTier(score)}>{score}점</ScoreBadge>}
                      </SimilarItem>
                    );
                  })}
                </SimilarGrid>
              </ResultCard>
            );
          })}
        </ResultsSection>
      )}
    </PageWrapper>
  );
};

// ── Styled ──

const UploadZone = styled.label`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px;
  border: 2px dashed ${(p) => (p.$hasFile ? colors.success : colors.border)};
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  color: ${(p) => (p.$hasFile ? colors.success : colors.textSecondary)};

  &:hover {
    border-color: ${colors.primary};
    background: ${colors.primaryLight}22;
  }
`;

const UploadText = styled.span`
  font-size: 0.95rem;
  font-weight: 500;
`;

const ErrorMsg = styled.p`
  color: ${colors.danger};
  font-weight: 600;
  margin-top: 16px;
  font-size: 0.9rem;
`;

const SectionLabel = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${colors.text};
  margin-bottom: 16px;
`;

const PreviewSection = styled.div`
  margin-top: 24px;
`;

const PreviewItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 0.9rem;
`;

const ResultsSection = styled.div`
  margin-top: 32px;
`;

const ResultCard = styled(Card)`
  margin-bottom: 12px;
  animation: ${fadeIn} 0.4s ease-out;
`;

const ResultHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid ${colors.border};
`;

const ResultBase = styled.span`
  font-weight: 600;
  font-size: 1rem;
  color: ${colors.primary};
`;

const SimilarGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const SimilarItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: ${colors.bgMain};
  border-radius: 6px;
  font-size: 0.9rem;
`;

const PersistToggle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: ${colors.bgMain};
  border: 1px solid ${colors.border};
  border-radius: 8px;

  input {
    cursor: pointer;
  }
  label {
    cursor: pointer;
    font-size: 0.85rem;
    color: ${colors.textSecondary};
    font-weight: 500;
  }
`;

const HistoryOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const HistoryCard = styled(Card)`
  width: 700px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
`;

const HistoryItem = styled.div`
  padding: 12px;
  margin-bottom: 8px;
  background: ${colors.bgMain};
  border-radius: 8px;
  border: 1px solid ${colors.border};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${colors.textSecondary};
  padding: 4px;
  &:hover { color: ${colors.text}; }
`;

const scoreTierColors = {
  good: { bg: colors.successLight, text: "#065F46" },
  mid: { bg: "#FEF3C7", text: "#92400E" },
  low: { bg: colors.dangerLight, text: colors.danger },
};

const ScoreBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  margin-left: auto;
  flex-shrink: 0;
  background: ${(p) => scoreTierColors[p.$tier].bg};
  color: ${(p) => scoreTierColors[p.$tier].text};
`;

const SimilarNum = styled.span`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${colors.primaryLight};
  color: ${colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
`;

export default Services;
