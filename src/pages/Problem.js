import React, { useState, useEffect } from "react";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, Table, Badge, Flex, EmptyState, colors,
} from "../styles/theme";
import { fetchBugs, createBug, updateBug, deleteBug } from "../api/client";

const SEVERITY_OPTIONS = ["Critical", "Major", "Minor", "Trivial"];
const STATUS_OPTIONS = ["Open", "In Progress", "Resolved", "Closed"];
const PRIORITY_OPTIONS = ["Urgent", "High", "Medium", "Low"];

const Problem = () => {
  const [bugs, setBugs] = useState([]);
  const [source, setSource] = useState("local");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterSeverity, setFilterSeverity] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "", description: "", stepsToReproduce: "",
    severity: "Major", priority: "Medium", status: "Open",
    assignee: "", environment: "", relatedTC: "",
  });

  const reload = async () => {
    const { data, source } = await fetchBugs();
    setBugs(data);
    setSource(source);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const resetForm = () => {
    setForm({
      title: "", description: "", stepsToReproduce: "",
      severity: "Major", priority: "Medium", status: "Open",
      assignee: "", environment: "", relatedTC: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    if (editingId) {
      await updateBug(editingId, form);
    } else {
      await createBug(form);
    }
    await reload();
    resetForm();
  };

  const handleEdit = (bug) => {
    setForm({
      title: bug.title, description: bug.description || "",
      stepsToReproduce: bug.stepsToReproduce || "",
      severity: bug.severity, priority: bug.priority || "Medium",
      status: bug.status, assignee: bug.assignee || "",
      environment: bug.environment || "", relatedTC: bug.relatedTC || "",
    });
    setEditingId(bug.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("이 버그를 삭제하시겠습니까?")) {
      await deleteBug(id);
      await reload();
    }
  };

  const handleStatusChange = async (id, status) => {
    await updateBug(id, { status });
    await reload();
  };

  const filtered = bugs.filter((b) => {
    const matchStatus = filterStatus === "All" || b.status === filterStatus;
    const matchSeverity = filterSeverity === "All" || b.severity === filterSeverity;
    const matchSearch = b.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSeverity && matchSearch;
  });

  const severityBadge = (s) => {
    const map = { Critical: "danger", Major: "warning", Minor: "info", Trivial: "gray" };
    return <Badge $color={map[s]}>{s}</Badge>;
  };

  const summaryCards = [
    { label: "전체", count: bugs.length, color: colors.text },
    { label: "Open", count: bugs.filter((b) => b.status === "Open").length, color: colors.danger },
    { label: "In Progress", count: bugs.filter((b) => b.status === "In Progress").length, color: colors.warning },
    { label: "Resolved", count: bugs.filter((b) => b.status === "Resolved").length, color: colors.success },
    { label: "Critical", count: bugs.filter((b) => b.severity === "Critical").length, color: "#DC2626" },
  ];

  return (
    <PageWrapper>
      <PageHeader>
        <Flex $justify="space-between" $wrap>
          <div>
            <PageTitle>버그 리포트</PageTitle>
            <PageSubtitle>발견된 버그를 등록하고 상태를 추적하세요</PageSubtitle>
          </div>
          <SourceBadge $db={source === "db"}>
            <span className="material-icons" style={{ fontSize: 14 }}>
              {source === "db" ? "cloud_done" : "cloud_off"}
            </span>
            {source === "db" ? "DB 연결됨" : "로컬 모드"}
          </SourceBadge>
        </Flex>
      </PageHeader>

      {/* 요약 */}
      <Flex $gap="12px" style={{ marginBottom: 20 }} $wrap>
        {summaryCards.map((s) => (
          <SummaryCard key={s.label}>
            <span style={{ fontSize: "1.3rem", fontWeight: 700, color: s.color }}>{s.count}</span>
            <span style={{ fontSize: "0.75rem", color: colors.textSecondary }}>{s.label}</span>
          </SummaryCard>
        ))}
      </Flex>

      {/* 툴바 */}
      <Flex $justify="space-between" $wrap style={{ marginBottom: 20 }}>
        <Flex $gap="10px" $wrap>
          <Input placeholder="버그 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} $width="200px" />
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="All">전체 상태</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
            <option value="All">전체 심각도</option>
            {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button $variant="secondary" onClick={reload} title="새로고침">
            <span className="material-icons" style={{ fontSize: 18 }}>refresh</span>
          </Button>
        </Flex>
        <Button $variant="danger" onClick={() => { resetForm(); setShowForm(true); }}>
          <span className="material-icons" style={{ fontSize: 18 }}>bug_report</span>
          버그 등록
        </Button>
      </Flex>

      {/* 폼 모달 */}
      {showForm && (
        <FormOverlay onClick={() => resetForm()}>
          <FormCard onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>{editingId ? "버그 수정" : "버그 등록"}</h3>
            <form onSubmit={handleSubmit}>
              <FormGroup>
                <label>버그 제목 *</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} $width="100%" required />
              </FormGroup>
              <FormGroup>
                <label>상세 설명</label>
                <StyledTextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </FormGroup>
              <FormGroup>
                <label>재현 절차</label>
                <StyledTextArea value={form.stepsToReproduce} onChange={(e) => setForm({ ...form, stepsToReproduce: e.target.value })} rows={3} placeholder="1. ...&#10;2. ...&#10;3. ..." />
              </FormGroup>
              <Flex $gap="12px" $wrap>
                <FormGroup style={{ flex: 1 }}>
                  <label>심각도</label>
                  <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} style={{ width: "100%" }}>
                    {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>우선순위</label>
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ width: "100%" }}>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>상태</label>
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ width: "100%" }}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </FormGroup>
              </Flex>
              <Flex $gap="12px" $wrap>
                <FormGroup style={{ flex: 1 }}>
                  <label>담당자</label>
                  <Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} $width="100%" />
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>환경</label>
                  <Input value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} $width="100%" placeholder="예: Chrome 120, iOS 17" />
                </FormGroup>
                <FormGroup style={{ flex: 1 }}>
                  <label>관련 TC</label>
                  <Input value={form.relatedTC} onChange={(e) => setForm({ ...form, relatedTC: e.target.value })} $width="100%" placeholder="예: TC-0001" />
                </FormGroup>
              </Flex>
              <Flex $justify="flex-end" $gap="10px" style={{ marginTop: 20 }}>
                <Button type="button" $variant="secondary" onClick={resetForm}>취소</Button>
                <Button type="submit" $variant="primary">{editingId ? "수정" : "등록"}</Button>
              </Flex>
            </form>
          </FormCard>
        </FormOverlay>
      )}

      {/* 테이블 */}
      <Card $padding="0">
        {filtered.length === 0 ? (
          <EmptyState>
            <span className="material-icons" style={{ fontSize: 48, color: colors.border }}>bug_report</span>
            <p>등록된 버그가 없습니다</p>
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>ID</th>
                <th>제목</th>
                <th>심각도</th>
                <th>우선순위</th>
                <th>상태</th>
                <th>담당자</th>
                <th style={{ textAlign: "center" }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bug) => (
                <tr key={bug.id}>
                  <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{bug.id}</td>
                  <td style={{ fontWeight: 500 }}>{bug.title}</td>
                  <td>{severityBadge(bug.severity)}</td>
                  <td>
                    <Badge $color={bug.priority === "Urgent" || bug.priority === "High" ? "danger" : bug.priority === "Medium" ? "warning" : "gray"}>
                      {bug.priority}
                    </Badge>
                  </td>
                  <td>
                    <Select
                      value={bug.status}
                      onChange={(e) => handleStatusChange(bug.id, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.8rem", border: "none", background: "transparent", fontWeight: 600 }}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                  <td>{bug.assignee || "-"}</td>
                  <td>
                    <Flex $justify="center" $gap="6px">
                      <ActionBtn onClick={() => handleEdit(bug)} title="수정">
                        <span className="material-icons">edit</span>
                      </ActionBtn>
                      <ActionBtn onClick={() => handleDelete(bug.id)} title="삭제" $danger>
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

const SummaryCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 24px;
  background: ${colors.bgCard};
  border: 1px solid ${colors.border};
  border-radius: 10px;
  min-width: 90px;
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
  width: 700px;
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

export default Problem;
