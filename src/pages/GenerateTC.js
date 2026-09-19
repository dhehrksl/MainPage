import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, TextArea, Badge, Flex, Spinner, colors,
} from "../styles/theme";
import { generateTCFromUrl, bulkImportTestcases, runNaturalLanguageTest, createTestcase } from "../api/client";

// 데모/발표용 프리셋 — 봇 차단 없이 실제로 동작 확인된 조합만 넣는다 (라이브 시연 중 예측 불가한 실패를 피하기 위함).
const NL_DEMO_PRESETS = [
  {
    label: "젤라또 · AI 상품 검색",
    url: "https://gelatto.ai",
    instruction: "검색창에 '5만원대 깔끔한 출근용 블라우스 찾아줘'라고 입력하고 검색해봐",
  },
  {
    label: "위키피디아 · 언어별 검색",
    url: "https://www.wikipedia.org",
    instruction: "한국어로 이동해서 검색창에 Korea를 검색해줘",
  },
];

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

  // 경과 시간 카운터
  const [elapsed, setElapsed] = useState(0);
  const [nlElapsed, setNlElapsed] = useState(0);
  const elapsedRef = useRef(null);
  const nlElapsedRef = useRef(null);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(elapsedRef.current);
    }
    return () => clearInterval(elapsedRef.current);
  }, [loading]);

  useEffect(() => {
    if (nlLoading) {
      setNlElapsed(0);
      nlElapsedRef.current = setInterval(() => setNlElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(nlElapsedRef.current);
    }
    return () => clearInterval(nlElapsedRef.current);
  }, [nlLoading]);

  // 자연어 즉석 테스트
  const [nlUrl, setNlUrl] = useState("");
  const [nlInstruction, setNlInstruction] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState("");
  const [nlResult, setNlResult] = useState(null);
  const [nlSaving, setNlSaving] = useState(false);
  const [nlSaved, setNlSaved] = useState(false);

  // overrideUrl/overrideInstruction이 오면(데모 프리셋 클릭) state 업데이트를 기다리지 않고 바로 그 값으로 실행한다.
  const handleNlTest = async (overrideUrl, overrideInstruction) => {
    const url = (overrideUrl ?? nlUrl).trim();
    const instruction = (overrideInstruction ?? nlInstruction).trim();
    setNlUrl(url);
    setNlInstruction(instruction);

    if (!url || !/^https?:\/\//i.test(url)) {
      setNlError("http:// 또는 https:// 로 시작하는 URL을 입력하세요.");
      return;
    }
    if (!instruction) {
      setNlError("어떤 걸 테스트할지 문장으로 입력하세요.");
      return;
    }
    setNlLoading(true);
    setNlError("");
    setNlResult(null);
    setNlSaved(false);
    try {
      const data = await runNaturalLanguageTest(url, instruction);
      setNlResult(data);
    } catch (err) {
      setNlError(err.message || "실행 실패");
    } finally {
      setNlLoading(false);
    }
  };

  const handleSaveNlResult = async () => {
    if (!nlResult) return;
    setNlSaving(true);
    try {
      await createTestcase({
        title: nlResult.title,
        description: nlResult.description,
        expectedResult: nlResult.expectedResult,
        priority: nlResult.priority,
        category: nlResult.category,
        sourceUrl: nlResult.sourceUrl,
        actions: nlResult.actions,
        status: nlResult.status === "Pass" ? "Pass" : nlResult.status === "Fail" ? "Fail" : "Pending",
      });
      setNlSaved(true);
    } finally {
      setNlSaving(false);
    }
  };

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

      {/* 자연어 즉석 테스트 — 한 줄 지시 → 그 자리에서 실행까지 */}
      <Card style={{ marginBottom: 20, borderColor: colors.info }}>
        <Flex $gap="8px" style={{ marginBottom: 12 }}>
          <span className="material-icons" style={{ color: colors.info }}>bolt</span>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>자연어로 즉석 테스트</h3>
        </Flex>
        <PageSubtitle style={{ marginBottom: 16 }}>
          "검색창에 블라우스를 검색해봐" 처럼 한 문장으로 지시하면, AI가 바로 실행 가능한 테스트로 바꿔서 그 자리에서 실행하고 결과를 보여줍니다.
        </PageSubtitle>

        <DemoPresetRow>
          <span>데모 프리셋</span>
          {NL_DEMO_PRESETS.map((preset) => (
            <PresetChip
              key={preset.label}
              type="button"
              disabled={nlLoading}
              onClick={() => handleNlTest(preset.url, preset.instruction)}
              title={`${preset.url} — ${preset.instruction}`}
            >
              <span className="material-icons" style={{ fontSize: 15 }}>play_arrow</span>
              {preset.label}
            </PresetChip>
          ))}
        </DemoPresetRow>

        <FormGroup>
          <label>페이지 URL</label>
          <Input
            value={nlUrl}
            onChange={(e) => setNlUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={nlLoading}
            style={{ width: "100%" }}
          />
        </FormGroup>
        <FormGroup>
          <label>테스트하고 싶은 것 (자연어)</label>
          <TextArea
            value={nlInstruction}
            onChange={(e) => setNlInstruction(e.target.value)}
            placeholder="예: 검색창에 '블라우스'를 입력하고 검색해봐"
            rows={2}
            disabled={nlLoading}
            style={{ width: "100%" }}
          />
        </FormGroup>
        <Flex $justify="flex-end">
          <Button $variant="primary" onClick={() => handleNlTest()} disabled={nlLoading} style={{ background: colors.info }}>
            <span className="material-icons" style={{ fontSize: 18 }}>{nlLoading ? "hourglass_top" : "play_circle"}</span>
            {nlLoading ? "생성 + 실행 중..." : "지금 실행"}
          </Button>
        </Flex>

        {nlError && (
          <ErrorBanner style={{ marginTop: 12 }}>
            <span className="material-icons" style={{ fontSize: 18 }}>error_outline</span>
            {nlError}
          </ErrorBanner>
        )}

        {nlLoading && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Spinner />
            <p style={{ color: colors.textSecondary, fontSize: "0.85rem", marginTop: 8 }}>
              페이지 분석 → 테스트 생성 → 실제 실행 중 (보통 1~3분 소요)
            </p>
            <ElapsedBadge>{nlElapsed}초 경과</ElapsedBadge>
          </div>
        )}

        {nlResult && !nlLoading && (
          <NlResultBox>
            <Flex $justify="space-between" $wrap style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: "0.95rem" }}>{nlResult.title}</strong>
              <NlStatusBadge $status={nlResult.status}>{nlResult.status}</NlStatusBadge>
            </Flex>
            <p style={{ fontSize: "0.85rem", color: colors.textSecondary, whiteSpace: "pre-line", margin: "0 0 8px" }}>{nlResult.description}</p>
            <p style={{ fontSize: "0.85rem", margin: "0 0 8px" }}><strong>기대 결과:</strong> {nlResult.expectedResult}</p>
            {nlResult.message && <p style={{ fontSize: "0.85rem", color: colors.danger, margin: "0 0 8px" }}>{nlResult.message}</p>}
            {nlResult.aiDiagnosis && (
              <AiDiagnosisBox>
                <span className="material-icons" style={{ fontSize: 16, verticalAlign: "-3px" }}>smart_toy</span>
                {" "}{nlResult.aiDiagnosis}
              </AiDiagnosisBox>
            )}
            {nlResult.screenshot && (
              <img
                src={`data:image/png;base64,${nlResult.screenshot}`}
                alt="실행 결과 스크린샷"
                style={{ maxWidth: "100%", marginTop: 10, border: `1px solid ${colors.border}`, borderRadius: 8 }}
              />
            )}
            <Flex $justify="flex-end" style={{ marginTop: 12 }}>
              <Button $variant="success" onClick={handleSaveNlResult} disabled={nlSaving || nlSaved}>
                <span className="material-icons" style={{ fontSize: 18 }}>save</span>
                {nlSaved ? "TC로 저장됨" : nlSaving ? "저장 중..." : "TC로 저장"}
              </Button>
            </Flex>
          </NlResultBox>
        )}
      </Card>

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
              ? "페이지 로딩 → 스크린샷 → AI 분석 중 (보통 1~2분 소요)"
              : "페이지 로딩 → 구조 분석 → AI 분석 중 (보통 40~90초 소요)"}
          </p>
          <ElapsedBadge>{elapsed}초 경과</ElapsedBadge>
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

const DemoPresetRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  span:first-child {
    font-size: 0.78rem;
    font-weight: 600;
    color: ${colors.textSecondary};
    margin-right: 2px;
  }
`;

const PresetChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${colors.info};
  background: ${colors.infoLight};
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  &:hover:not(:disabled) {
    border-color: ${colors.info};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const NlResultBox = styled.div`
  margin-top: 16px;
  padding: 14px 16px;
  background: ${colors.bgMain};
  border: 1px solid ${colors.border};
  border-radius: 10px;
`;

const NlStatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  color: ${({ $status }) =>
    $status === "Pass" ? colors.success : $status === "Fail" ? colors.danger : colors.gray};
  background: ${({ $status }) =>
    $status === "Pass" ? colors.successLight : $status === "Fail" ? colors.dangerLight : colors.border};
`;

const AiDiagnosisBox = styled.div`
  margin: 8px 0;
  padding: 10px 12px;
  background: ${colors.infoLight};
  color: ${colors.dark};
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
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

const ElapsedBadge = styled.div`
  display: inline-block;
  margin-top: 6px;
  padding: 3px 12px;
  background: ${colors.border};
  color: ${colors.textSecondary};
  border-radius: 999px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
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
