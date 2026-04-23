import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, Table, Badge, Flex, EmptyState, Spinner, colors,
} from "../styles/theme";
import {
  fetchTestcases, createTestcase, updateTestcase, deleteTestcase, bulkImportTestcases,
  generateTCFromUrl,
} from "../api/client";

const STATUS_OPTIONS = ["Pending", "Pass", "Fail", "Blocked", "Skip"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];

const Content = () => {
  const [testcases, setTestcases] = useState([]);
  const [source, setSource] = useState("local");
  const [filter, setFilter] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", expectedResult: "",
    status: "Pending", priority: "Medium", category: "",
  });

  // URL → TC 자동 생성 모달 상태
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [urlResult, setUrlResult] = useState(null); // { url, pageTitle, testcases, meta }
  const [selectedIdx, setSelectedIdx] = useState(new Set());
  const [numTCs, setNumTCs] = useState(10);

  const reload = async () => {
    const { data, source } = await fetchTestcases();
    setTestcases(data);
    setSource(source);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const resetForm = () => {
    setForm({ title: "", description: "", expectedResult: "", status: "Pending", priority: "Medium", category: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    if (editingId) {
      await updateTestcase(editingId, form);
    } else {
      await createTestcase(form);
    }
    await reload();
    resetForm();
  };

  const handleEdit = (tc) => {
    setForm({
      title: tc.title, description: tc.description || "",
      expectedResult: tc.expectedResult || "", status: tc.status,
      priority: tc.priority || "Medium", category: tc.category || "",
    });
    setEditingId(tc.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("이 TC를 삭제하시겠습니까?")) {
      await deleteTestcase(id);
      await reload();
    }
  };

  const handleStatusChange = async (id, status) => {
    await updateTestcase(id, { status });
    await reload();
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rows = json.map((row, i) => ({
          title: row["TC명"] || row["title"] || row["제목"] || `Imported TC ${i + 1}`,
          description: row["설명"] || row["description"] || "",
          expectedResult: row["기대결과"] || row["expected"] || "",
          status: row["상태"] || row["status"] || "Pending",
          priority: row["우선순위"] || row["priority"] || "Medium",
          category: row["카테고리"] || row["category"] || "",
        }));
        await bulkImportTestcases(rows);
        await reload();
      } catch {
        alert("엑셀 파일 읽기에 실패했습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const resetUrlModal = () => {
    setShowUrlModal(false);
    setUrlInput("");
    setUrlError("");
    setUrlResult(null);
    setSelectedIdx(new Set());
    setUrlLoading(false);
  };

  const handleGenerateFromUrl = async () => {
    const url = urlInput.trim();
    if (!url) {
      setUrlError("URL을 입력하세요.");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      setUrlError("http:// 또는 https:// 로 시작해야 합니다.");
      return;
    }

    setUrlLoading(true);
    setUrlError("");
    setUrlResult(null);

    try {
      const data = await generateTCFromUrl(url, numTCs);
      setUrlResult(data);
      // 기본값으로 전체 선택
      setSelectedIdx(new Set(data.testcases.map((_, i) => i)));
    } catch (err) {
      setUrlError(err.message || "생성 실패");
    } finally {
      setUrlLoading(false);
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

  const handleSaveGeneratedTCs = async () => {
    if (!urlResult || selectedIdx.size === 0) return;
    const rows = urlResult.testcases.filter((_, i) => selectedIdx.has(i));
    await bulkImportTestcases(rows);
    await reload();
    resetUrlModal();
  };

  const handleExportExcel = () => {
    const exportData = testcases.map((tc) => ({
      "TC ID": tc.id,
      "TC명": tc.title,
      "설명": tc.description,
      "기대결과": tc.expectedResult,
      "상태": tc.status,
      "우선순위": tc.priority,
      "카테고리": tc.category,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TestCases");
    XLSX.writeFile(wb, "TC_관리_목록.xlsx");
  };

  const filtered = testcases.filter((tc) => {
    const matchFilter = filter === "All" || tc.status === filter;
    const matchSearch = tc.title.toLowerCase().includes(searchTerm.toLowerCase())
      || (tc.category || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchFilter && matchSearch;
  });

  const priorityBadge = (p) => {
    const map = { High: "danger", Medium: "warning", Low: "info" };
    return <Badge $color={map[p] || "gray"}>{p}</Badge>;
  };

  return (
    <PageWrapper>
      <PageHeader>
        <Flex $justify="space-between" $wrap>
          <div>
            <PageTitle>TC 관리</PageTitle>
            <PageSubtitle>테스트 케이스를 등록, 수정, 관리하세요</PageSubtitle>
          </div>
          <SourceBadge $db={source === "db"}>
            <span className="material-icons" style={{ fontSize: 14 }}>
              {source === "db" ? "cloud_done" : "cloud_off"}
            </span>
            {source === "db" ? "DB 연결됨" : "로컬 모드"}
          </SourceBadge>
        </Flex>
      </PageHeader>

      {/* 툴바 */}
      <Flex $justify="space-between" $wrap style={{ marginBottom: 20 }}>
        <Flex $gap="10px" $wrap>
          <Input
            placeholder="TC 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            $width="220px"
          />
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="All">전체 상태</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button $variant="secondary" onClick={reload} title="새로고침">
            <span className="material-icons" style={{ fontSize: 18 }}>refresh</span>
          </Button>
        </Flex>
        <Flex $gap="10px" $wrap>
          <Button $variant="primary" onClick={() => { resetForm(); setShowForm(true); }}>
            <span className="material-icons" style={{ fontSize: 18 }}>add</span>
            TC 추가
          </Button>
          <Button $variant="primary" onClick={() => setShowUrlModal(true)} style={{ background: colors.info }}>
            <span className="material-icons" style={{ fontSize: 18 }}>auto_awesome</span>
            URL로 TC 생성
          </Button>
          <label>
            <Button as="span" $variant="secondary">
              <span className="material-icons" style={{ fontSize: 18 }}>upload_file</span>
              엑셀 가져오기
            </Button>
            <input type="file" accept=".xlsx,.xls" onChange={handleImportExcel} hidden />
          </label>
          <Button $variant="success" onClick={handleExportExcel} disabled={testcases.length === 0}>
            <span className="material-icons" style={{ fontSize: 18 }}>download</span>
            엑셀 내보내기
          </Button>
        </Flex>
      </Flex>

      {/* 요약 카드 */}
      <Flex $gap="12px" style={{ marginBottom: 20 }} $wrap>
        {["All", ...STATUS_OPTIONS].map((s) => {
          const count = s === "All" ? testcases.length : testcases.filter((t) => t.status === s).length;
          return (
            <MiniStat key={s} $active={filter === s} onClick={() => setFilter(s)}>
              <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>{count}</span>
              <span style={{ fontSize: "0.75rem", color: colors.textSecondary }}>{s === "All" ? "전체" : s}</span>
            </MiniStat>
          );
        })}
      </Flex>

      {/* 폼 모달 */}
      {showForm && (
        <FormOverlay onClick={() => resetForm()}>
          <FormCard onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>{editingId ? "TC 수정" : "TC 추가"}</h3>
            <form onSubmit={handleSubmit}>
              <FormGroup>
                <label>TC명 *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} $width="100%" required />
              </FormGroup>
              <FormGroup>
                <label>설명</label>
                <StyledTextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </FormGroup>
              <FormGroup>
                <label>기대 결과</label>
                <Input value={form.expectedResult} onChange={(e) => setForm({ ...form, expectedResult: e.target.value })} $width="100%" />
              </FormGroup>
              <Flex $gap="12px" $wrap>
                <FormGroup style={{ flex: 1 }}>
                  <label>상태</label>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: "100%" }}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>우선순위</label>
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ width: "100%" }}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>카테고리</label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} $width="100%" placeholder="예: 로그인" />
                </FormGroup>
              </Flex>
              <Flex $justify="flex-end" $gap="10px" style={{ marginTop: 20 }}>
                <Button type="button" $variant="secondary" onClick={resetForm}>취소</Button>
                <Button type="submit" $variant="primary">{editingId ? "수정" : "추가"}</Button>
              </Flex>
            </form>
          </FormCard>
        </FormOverlay>
      )}

      {/* URL → TC 생성 모달 */}
      {showUrlModal && (
        <FormOverlay onClick={() => !urlLoading && resetUrlModal()}>
          <UrlModalCard onClick={(e) => e.stopPropagation()}>
            <Flex $justify="space-between" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>
                <span className="material-icons" style={{ verticalAlign: "-5px", marginRight: 6, color: colors.info }}>auto_awesome</span>
                URL로 TC 자동 생성
              </h3>
              <ActionBtn onClick={() => !urlLoading && resetUrlModal()} title="닫기">
                <span className="material-icons">close</span>
              </ActionBtn>
            </Flex>

            <PageSubtitle style={{ marginBottom: 16 }}>
              페이지 URL을 입력하면 AI가 스크린샷과 구조를 분석해 TC를 생성합니다.
            </PageSubtitle>

            <FormGroup>
              <label>페이지 URL</label>
              <Flex $gap="8px">
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com/login"
                  $width="100%"
                  disabled={urlLoading}
                  onKeyDown={(e) => { if (e.key === "Enter" && !urlLoading) handleGenerateFromUrl(); }}
                />
                <Select
                  value={numTCs}
                  onChange={(e) => setNumTCs(Number(e.target.value))}
                  disabled={urlLoading}
                  style={{ minWidth: 90 }}
                >
                  {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}개</option>)}
                </Select>
                <Button
                  $variant="primary"
                  onClick={handleGenerateFromUrl}
                  disabled={urlLoading || !urlInput.trim()}
                >
                  {urlLoading ? "분석 중..." : "생성"}
                </Button>
              </Flex>
            </FormGroup>

            {urlError && (
              <ErrorBanner>
                <span className="material-icons" style={{ fontSize: 18 }}>error_outline</span>
                {urlError}
              </ErrorBanner>
            )}

            {urlLoading && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <Spinner />
                <p style={{ color: colors.textSecondary, fontSize: "0.85rem", marginTop: 8 }}>
                  페이지 로딩 → 스크린샷 → AI 분석 중 (약 10~30초)
                </p>
              </div>
            )}

            {urlResult && !urlLoading && (
              <>
                <ResultSummary>
                  <div>
                    <strong>{urlResult.pageTitle || "(제목 없음)"}</strong>
                    <ResultUrl>{urlResult.url}</ResultUrl>
                  </div>
                  <Flex $gap="6px">
                    <Badge $color="info">헤딩 {urlResult.meta.headingCount}</Badge>
                    <Badge $color="info">버튼 {urlResult.meta.buttonCount}</Badge>
                    <Badge $color="info">입력 {urlResult.meta.inputCount}</Badge>
                  </Flex>
                </ResultSummary>

                <Flex $justify="space-between" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: "0.85rem", color: colors.textSecondary }}>
                    생성된 TC: {urlResult.testcases.length}개 (선택됨 {selectedIdx.size}개)
                  </span>
                  <Flex $gap="6px">
                    <SmallBtn onClick={() => setSelectedIdx(new Set(urlResult.testcases.map((_, i) => i)))}>전체 선택</SmallBtn>
                    <SmallBtn onClick={() => setSelectedIdx(new Set())}>전체 해제</SmallBtn>
                  </Flex>
                </Flex>

                <GeneratedList>
                  {urlResult.testcases.map((tc, i) => (
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
                        {tc.description && (
                          <TcDesc>설명: {tc.description}</TcDesc>
                        )}
                        {tc.expectedResult && (
                          <TcDesc>기대결과: {tc.expectedResult}</TcDesc>
                        )}
                      </div>
                    </GeneratedItem>
                  ))}
                </GeneratedList>

                <Flex $justify="flex-end" $gap="10px" style={{ marginTop: 20 }}>
                  <Button $variant="secondary" onClick={resetUrlModal}>취소</Button>
                  <Button
                    $variant="primary"
                    onClick={handleSaveGeneratedTCs}
                    disabled={selectedIdx.size === 0}
                  >
                    <span className="material-icons" style={{ fontSize: 18 }}>save</span>
                    선택한 {selectedIdx.size}개 TC 저장
                  </Button>
                </Flex>
              </>
            )}
          </UrlModalCard>
        </FormOverlay>
      )}

      {/* 테이블 */}
      <Card $padding="0">
        {filtered.length === 0 ? (
          <EmptyState>
            <span className="material-icons" style={{ fontSize: 48, color: colors.border }}>checklist</span>
            <p>등록된 TC가 없습니다</p>
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>TC명</th>
                <th>카테고리</th>
                <th>우선순위</th>
                <th>상태</th>
                <th style={{ textAlign: "center" }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tc) => (
                <tr key={tc.id}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{tc.id}</td>
                  <td style={{ fontWeight: 500 }}>{tc.title}</td>
                  <td>{tc.category || "-"}</td>
                  <td>{priorityBadge(tc.priority || "Medium")}</td>
                  <td>
                    <Select
                      value={tc.status}
                      onChange={(e) => handleStatusChange(tc.id, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.8rem", border: "none", background: "transparent", fontWeight: 600 }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                  <td>
                    <Flex $justify="center" $gap="6px">
                      <ActionBtn onClick={() => handleEdit(tc)} title="수정">
                        <span className="material-icons">edit</span>
                      </ActionBtn>
                      <ActionBtn onClick={() => handleDelete(tc.id)} title="삭제" $danger>
                        <span className="material-icons">delete</span>
                      </ActionBtn>
                    </Flex>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageWrapper>
  );
};

// ── Styled ──

const SourceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${(p) => (p.$db ? "#DCFCE7" : "#FEE2E2")};
  color: ${(p) => (p.$db ? "#166534" : "#991B1B")};
`;

const MiniStat = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: ${(p) => (p.$active ? colors.primaryLight : colors.bgCard)};
  border: 1px solid ${(p) => (p.$active ? colors.primary : colors.border)};
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 80px;

  &:hover { border-color: ${colors.primary}; }
`;

const FormOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
`;

const FormCard = styled(Card)`
  width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
`;

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

const StyledTextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  font-size: 0.9rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-family: inherit;
  resize: vertical;
  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight};
  }
`;

const UrlModalCard = styled(Card)`
  width: 820px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
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
  margin-bottom: 12px;
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
  max-height: 400px;
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

const ActionBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: ${(p) => (p.$danger ? colors.danger : colors.textSecondary)};
  transition: all 0.15s;

  &:hover {
    background: ${(p) => (p.$danger ? colors.dangerLight : colors.bgMain)};
  }

  .material-icons { font-size: 18px; }
`;

export default Content;
