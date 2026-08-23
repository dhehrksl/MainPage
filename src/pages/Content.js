import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, Table, Badge, Flex, EmptyState, colors,
} from "../styles/theme";
import {
  fetchTestcases, createTestcase, updateTestcase, deleteTestcase, bulkImportTestcases,
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

  // 테이블 행 다중 선택 상태 (tc.id 기준)
  const [selectedRows, setSelectedRows] = useState(new Set());
  // 행 클릭 시 설명/기대결과를 펼쳐 보여주는 상세보기 상태 (tc.id 기준, 1개만 펼침)
  const [expandedId, setExpandedId] = useState(null);
  const toggleExpanded = (id) => setExpandedId((prev) => (prev === id ? null : id));

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
      setSelectedRows((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await reload();
    }
  };

  // 행 체크박스 토글
  const toggleRow = (id) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 현재 필터된 목록 전체 선택/해제
  const toggleSelectAll = (ids) => {
    setSelectedRows((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  // 선택된 TC 일괄 삭제
  const handleDeleteSelected = async () => {
    if (selectedRows.size === 0) return;
    if (!window.confirm(`선택한 ${selectedRows.size}개의 TC를 삭제하시겠습니까?`)) return;
    await Promise.all([...selectedRows].map((id) => deleteTestcase(id)));
    setSelectedRows(new Set());
    await reload();
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
          {selectedRows.size > 0 && (
            <Button $variant="danger" onClick={handleDeleteSelected}>
              <span className="material-icons" style={{ fontSize: 18 }}>delete_sweep</span>
              선택 삭제 ({selectedRows.size})
            </Button>
          )}
        </Flex>
        <Flex $gap="10px" $wrap>
          <Button $variant="primary" onClick={() => { resetForm(); setShowForm(true); }}>
            <span className="material-icons" style={{ fontSize: 18 }}>add</span>
            TC 추가
          </Button>
          <Button as={Link} to="/generate-tc" $variant="primary" style={{ background: colors.info }}>
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
                <th style={{ width: 32 }} />
                <th style={{ textAlign: "center", width: 40 }}>
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((tc) => selectedRows.has(tc.id))}
                    onChange={() => toggleSelectAll(filtered.map((tc) => tc.id))}
                    title="전체 선택"
                  />
                </th>
                <th>ID</th>
                <th>TC명</th>
                <th>카테고리</th>
                <th>우선순위</th>
                <th>상태</th>
                <th style={{ textAlign: "center" }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tc) => {
                const isExpanded = expandedId === tc.id;
                return (
                  <React.Fragment key={tc.id}>
                    <ExpandableRow $expanded={isExpanded} onClick={() => toggleExpanded(tc.id)}>
                      <td style={{ textAlign: "center", color: colors.textSecondary }}>
                        <span className="material-icons" style={{ fontSize: 18 }}>
                          {isExpanded ? "expand_more" : "chevron_right"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(tc.id)}
                          onChange={() => toggleRow(tc.id)}
                        />
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{tc.id}</td>
                      <td style={{ fontWeight: 500 }}>{tc.title}</td>
                      <td>{tc.category || "-"}</td>
                      <td>{priorityBadge(tc.priority || "Medium")}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={tc.status}
                          onChange={(e) => handleStatusChange(tc.id, e.target.value)}
                          style={{ padding: "4px 8px", fontSize: "0.8rem", border: "none", background: "transparent", fontWeight: 600 }}
                        >
                          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Flex $justify="center" $gap="6px">
                          <ActionBtn onClick={() => handleEdit(tc)} title="수정">
                            <span className="material-icons">edit</span>
                          </ActionBtn>
                          <ActionBtn onClick={() => handleDelete(tc.id)} title="삭제" $danger>
                            <span className="material-icons">delete</span>
                          </ActionBtn>
                        </Flex>
                      </td>
                    </ExpandableRow>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <DetailPanel>
                            <DetailField>
                              <DetailLabel>설명</DetailLabel>
                              <DetailValue>{tc.description || "(설명 없음)"}</DetailValue>
                            </DetailField>
                            <DetailField>
                              <DetailLabel>기대 결과</DetailLabel>
                              <DetailValue>{tc.expectedResult || "(기대 결과 없음)"}</DetailValue>
                            </DetailField>
                          </DetailPanel>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </PageWrapper>
  );
};

// ── Styled ──

const ExpandableRow = styled.tr`
  cursor: pointer;
  background: ${(p) => (p.$expanded ? colors.bgMain : "transparent")};
  &:hover {
    background: ${colors.bgMain};
  }
`;

const DetailPanel = styled.div`
  padding: 14px 20px 18px 52px;
  background: ${colors.bgMain};
  border-bottom: 1px solid ${colors.border};
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const DetailField = styled.div``;

const DetailLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
  color: ${colors.textSecondary};
  margin-bottom: 4px;
`;

const DetailValue = styled.div`
  font-size: 0.88rem;
  color: ${colors.text};
  white-space: pre-wrap;
  line-height: 1.5;
`;

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
