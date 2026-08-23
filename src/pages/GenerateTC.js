import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, Badge, Flex, Spinner, colors,
} from "../styles/theme";
import { generateTCFromUrl, bulkImportTestcases } from "../api/client";

const GenerateTC = () => {
  const navigate = useNavigate();
  const [urlInput, setUrlInput] = useState("");
  const [numTCs, setNumTCs] = useState(10);
  const [useScreenshot, setUseScreenshot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { url, pageTitle, testcases, meta }
  const [selectedIdx, setSelectedIdx] = useState(new Set());

  const handleGenerate = async () => {
    const url = urlInput.trim();
    if (!url) {
      setError("URL을 입력하세요.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setError("http:// 또는 https:// 로 시작해야 합니다.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await generateTCFromUrl(url, numTCs, useScreenshot);
      setResult(data);
      setSelectedIdx(new Set(data.testcases.map((_, i) => i)));
    } catch (err) {
      setError(err.message || "생성 실패");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (idx) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleSave = async () => {
    if (!result || selectedIdx.size === 0) return;
    setSaving(true);
    try {
      const rows = result.testcases.filter((_, i) => selectedIdx.has(i));
      await bulkImportTestcases(rows);
      navigate("/content");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader>
        <PageTitle>URL로 TC 자동 생성</PageTitle>
        <PageSubtitle>페이지 URL을 입력하면 AI가 페이지 구조(선택 시 스크린샷 포함)를 분석해 테스트 케이스를 생성합니다</PageSubtitle>
      </PageHeader>

      <Card>
        <FormGroup>
          <label>페이지 URL</label>
          <Flex $gap="8px" $wrap>
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/login"
              disabled={loading}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleGenerate(); }}
              style={{ flex: 1, minWidth: 240 }}
            />
            <Select
              value={numTCs}
              onChange={(e) => setNumTCs(Number(e.target.value))}
              disabled={loading}
              style={{ minWidth: 90 }}
            >
              {[5, 8, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{n}개</option>)}
            </Select>
            <Button $variant="primary" onClick={handleGenerate} disabled={loading || !urlInput.trim()}>
              {loading ? "분석 중..." : "생성"}
            </Button>
          </Flex>
          <ScreenshotOption title="켜면 페이지 스크린샷까지 AI가 분석합니다(디자인·레이아웃 반영). 끄면 페이지 구조 텍스트만 분석해 토큰(비용)을 크게 절약합니다.">
            <input
              type="checkbox"
              checked={useScreenshot}
              onChange={(e) => setUseScreenshot(e.target.checked)}
              disabled={loading}
            />
            <span>
              스크린샷(이미지) 분석 포함
              <em>{useScreenshot ? " — 시각 분석 O, 토큰 더 사용" : " — 텍스트만 분석, 저렴(권장)"}</em>
            </span>
          </ScreenshotOption>
        </FormGroup>

        {error && (
          <ErrorBanner>
            <span className="material-icons" style={{ fontSize: 18 }}>error_outline</span>
            {error}
          </ErrorBanner>
        )}
      </Card>

      {loading && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <Spinner />
          <p style={{ color: colors.textSecondary, fontSize: "0.9rem" }}>
            {useScreenshot
              ? "페이지 로딩 → 스크린샷 → AI 분석 중 (약 10~30초)"
              : "페이지 로딩 → 구조 분석 → AI 분석 중 (약 10~20초)"}
          </p>
        </div>
      )}

      {result && !loading && (
        <ResultCard>
          <ResultSummary>
            <div>
              <strong>{result.pageTitle || "(제목 없음)"}</strong>
              <ResultUrl>{result.url}</ResultUrl>
            </div>
            <Flex $gap="6px" $wrap>
              <Badge $color="info">헤딩 {result.meta.headingCount}</Badge>
              <Badge $color="info">버튼 {result.meta.buttonCount}</Badge>
              <Badge $color="info">입력 {result.meta.inputCount}</Badge>
            </Flex>
          </ResultSummary>

          <Flex $justify="space-between" $wrap style={{ marginBottom: 10 }}>
            <span style={{ fontSize: "0.85rem", color: colors.textSecondary }}>
              생성된 TC: {result.testcases.length}개 (선택됨 {selectedIdx.size}개)
            </span>
            <Flex $gap="6px">
              <SmallBtn onClick={() => setSelectedIdx(new Set(result.testcases.map((_, i) => i)))}>전체 선택</SmallBtn>
              <SmallBtn onClick={() => setSelectedIdx(new Set())}>전체 해제</SmallBtn>
            </Flex>
          </Flex>

          <GeneratedList>
            {result.testcases.map((tc, i) => (
              <GeneratedItem key={i} $selected={selectedIdx.has(i)} onClick={() => toggleSelected(i)}>
                <input
                  type="checkbox"
                  checked={selectedIdx.has(i)}
                  onChange={() => toggleSelected(i)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div style={{ flex: 1 }}>
                  <Flex $gap="8px" style={{ marginBottom: 4 }} $wrap>
                    <strong style={{ fontSize: "0.9rem" }}>{tc.title}</strong>
                    <Badge $color={tc.priority === "High" ? "danger" : tc.priority === "Medium" ? "warning" : "info"}>
                      {tc.priority}
                    </Badge>
                    <Badge $color="gray">{tc.category}</Badge>
                  </Flex>
                  {tc.description && <TcDesc>설명: {tc.description}</TcDesc>}
                  {tc.expectedResult && <TcDesc>기대결과: {tc.expectedResult}</TcDesc>}
                </div>
              </GeneratedItem>
            ))}
          </GeneratedList>

          <Flex $justify="flex-end" $gap="10px" style={{ marginTop: 20 }}>
            <Button
              $variant="primary"
              onClick={handleSave}
              disabled={selectedIdx.size === 0 || saving}
            >
              <span className="material-icons" style={{ fontSize: 18 }}>save</span>
              {saving ? "저장 중..." : `선택한 ${selectedIdx.size}개 TC 저장`}
            </Button>
          </Flex>
        </ResultCard>
      )}
    </PageWrapper>
  );
};

// ── Styled ──

const FormGroup = styled.div`
  margin-bottom: 14px;
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: ${colors.textSecondary};
    margin-bottom: 6px;
  }
`;

const ScreenshotOption = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  color: ${colors.text};
  cursor: pointer;
  input { cursor: pointer; }
  em {
    font-style: normal;
    font-size: 0.78rem;
    color: ${colors.textSecondary};
  }
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: ${colors.dangerLight};
  color: ${colors.danger};
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  margin-top: 12px;
`;

const ResultCard = styled(Card)`
  margin-top: 20px;
`;

const ResultSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: ${colors.bgMain};
  border: 1px solid ${colors.border};
  border-radius: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const ResultUrl = styled.div`
  font-size: 0.75rem;
  color: ${colors.textSecondary};
  margin-top: 2px;
  font-family: monospace;
  word-break: break-all;
`;

const GeneratedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 500px;
  overflow-y: auto;
  padding: 2px;
`;

const GeneratedItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid ${(p) => (p.$selected ? colors.primary : colors.border)};
  background: ${(p) => (p.$selected ? colors.primaryLight + "33" : colors.bgCard)};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover { border-color: ${colors.primary}; }

  input[type="checkbox"] {
    margin-top: 4px;
    cursor: pointer;
  }
`;

const TcDesc = styled.p`
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: ${colors.textSecondary};
  line-height: 1.4;
  white-space: pre-line;
`;

const SmallBtn = styled.button`
  padding: 4px 10px;
  font-size: 0.75rem;
  border: 1px solid ${colors.border};
  background: ${colors.bgCard};
  border-radius: 6px;
  cursor: pointer;
  color: ${colors.textSecondary};

  &:hover { border-color: ${colors.primary}; color: ${colors.primary}; }
`;

export default GenerateTC;
