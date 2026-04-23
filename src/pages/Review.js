import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Grid, Flex, Badge, Select, EmptyState, colors,
} from "../styles/theme";
import { fetchTestcases, fetchBugs, fetchReportSummary } from "../api/client";

const PERIODS = [
  { key: "all", label: "전체" },
  { key: "7d", label: "최근 7일" },
  { key: "30d", label: "최근 30일" },
];

const Review = () => {
  const [testcases, setTestcases] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [source, setSource] = useState("local");
  const [summary, setSummary] = useState(null); // 서버 집계
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [period, setPeriod] = useState("all");
  const [tab, setTab] = useState("overview"); // overview | category | assignee | link

  const reload = async () => {
    const [{ data: tcs, source: s1 }, { data: bs }] = await Promise.all([
      fetchTestcases(),
      fetchBugs(),
    ]);
    setTestcases(tcs);
    setBugs(bs);
    setSource(s1);

    // 서버 집계도 시도
    const range = periodToRange(period);
    const { data } = await fetchReportSummary(range);
    setSummary(data);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [period]);

  const categories = useMemo(() => {
    const cats = [...new Set(testcases.map((t) => t.category).filter(Boolean))];
    return ["All", ...cats];
  }, [testcases]);

  // 기간 필터 적용
  const inRangeTCs = useMemo(() => filterByPeriod(testcases, period), [testcases, period]);
  const inRangeBugs = useMemo(() => filterByPeriod(bugs, period), [bugs, period]);

  const filtered = selectedCategory === "All"
    ? inRangeTCs
    : inRangeTCs.filter((t) => t.category === selectedCategory);

  const stats = useMemo(() => computeStats(filtered), [filtered]);
  const bugStats = useMemo(() => computeBugStats(inRangeBugs), [inRangeBugs]);

  // 카테고리별 통과율 (서버 집계 우선, 없으면 로컬 계산)
  const byCategory = useMemo(() => {
    if (summary?.byCategory) return summary.byCategory;
    const map = {};
    for (const tc of inRangeTCs) {
      const k = tc.category || "(미분류)";
      if (!map[k]) map[k] = { total: 0, pass: 0, fail: 0, pending: 0 };
      map[k].total++;
      if (tc.status === "Pass") map[k].pass++;
      else if (tc.status === "Fail") map[k].fail++;
      else if (tc.status === "Pending") map[k].pending++;
    }
    return map;
  }, [summary, inRangeTCs]);

  // 담당자별 버그 분포
  const byAssignee = useMemo(() => {
    if (summary?.byAssignee) return summary.byAssignee;
    const map = {};
    for (const b of inRangeBugs) {
      const k = b.assignee || "(미지정)";
      if (!map[k]) map[k] = { total: 0, open: 0, resolved: 0 };
      map[k].total++;
      if (b.status === "Open" || b.status === "In Progress") map[k].open++;
      else map[k].resolved++;
    }
    return map;
  }, [summary, inRangeBugs]);

  // 일별 트렌드
  const daily = useMemo(() => {
    if (summary?.daily) return summary.daily;
    return computeDaily(inRangeTCs);
  }, [summary, inRangeTCs]);

  // TC → 버그 연결
  const linked = useMemo(() => {
    const map = new Map();
    for (const b of inRangeBugs) {
      if (!b.relatedTC) continue;
      const list = map.get(b.relatedTC) || [];
      list.push(b);
      map.set(b.relatedTC, list);
    }
    return [...map.entries()]
      .map(([tcId, bgs]) => {
        const tc = testcases.find((t) => t.id === tcId);
        return { tcId, tcTitle: tc?.title || "(삭제됨)", tcStatus: tc?.status, bugs: bgs };
      })
      .sort((a, b) => b.bugs.length - a.bugs.length);
  }, [testcases, inRangeBugs]);

  const exportReport = () => {
    const summaryData = [
      { "항목": "기간", "값": PERIODS.find((p) => p.key === period)?.label },
      { "항목": "총 TC 수", "값": stats.total },
      { "항목": "Pass", "값": stats.pass },
      { "항목": "Fail", "값": stats.fail },
      { "항목": "Blocked", "값": stats.blocked },
      { "항목": "Skip", "값": stats.skip },
      { "항목": "Pending", "값": stats.pending },
      { "항목": "통과율", "값": `${stats.rate}%` },
      { "항목": "실행률", "값": `${stats.execRate}%` },
      { "항목": "", "값": "" },
      { "항목": "총 버그 수", "값": bugStats.total },
      { "항목": "Open 버그", "값": bugStats.open },
      { "항목": "Critical 버그", "값": bugStats.critical },
    ];

    const tcData = filtered.map((tc) => ({
      "TC ID": tc.id, "TC명": tc.title, "카테고리": tc.category || "-",
      "상태": tc.status, "우선순위": tc.priority || "-",
    }));

    const categoryData = Object.entries(byCategory).map(([k, v]) => ({
      "카테고리": k,
      "총": v.total,
      "Pass": v.pass,
      "Fail": v.fail,
      "통과율": v.total > 0 ? `${Math.round((v.pass / v.total) * 100)}%` : "0%",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "요약");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tcData), "TC 상세");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(categoryData), "카테고리별");
    if (bugs.length > 0) {
      const bugData = bugs.map((b) => ({
        "버그 ID": b.id, "제목": b.title, "심각도": b.severity,
        "상태": b.status, "담당자": b.assignee || "-", "관련 TC": b.relatedTC || "-",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bugData), "버그 목록");
    }
    XLSX.writeFile(wb, `QA_리포트_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const chartData = [
    { label: "Pass", value: stats.pass, color: colors.success },
    { label: "Fail", value: stats.fail, color: colors.danger },
    { label: "Blocked", value: stats.blocked, color: colors.warning },
    { label: "Skip", value: stats.skip, color: colors.lightGray },
    { label: "Pending", value: stats.pending, color: colors.info },
  ];

  const maxDaily = Math.max(1, ...daily.map((d) => d.pass + d.fail));

  return (
    <PageWrapper>
      <PageHeader>
        <Flex $justify="space-between" $wrap>
          <div>
            <PageTitle>QA 리포트</PageTitle>
            <PageSubtitle>테스트 실행 결과와 품질 현황을 확인하세요</PageSubtitle>
          </div>
          <Flex $gap="10px" $wrap>
            <SourceBadge $db={source === "db"}>
              <span className="material-icons" style={{ fontSize: 14 }}>
                {source === "db" ? "cloud_done" : "cloud_off"}
              </span>
              {source === "db" ? "DB 연결됨" : "로컬 모드"}
            </SourceBadge>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
            <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>{c === "All" ? "전체 카테고리" : c}</option>
              ))}
            </Select>
            <Button $variant="secondary" onClick={reload} title="새로고침">
              <span className="material-icons" style={{ fontSize: 18 }}>refresh</span>
            </Button>
            <Button $variant="success" onClick={exportReport} disabled={testcases.length === 0}>
              <span className="material-icons" style={{ fontSize: 18 }}>download</span>
              리포트 내보내기
            </Button>
          </Flex>
        </Flex>
      </PageHeader>

      {testcases.length === 0 ? (
        <Card>
          <EmptyState>
            <span className="material-icons" style={{ fontSize: 48, color: colors.border }}>assessment</span>
            <p>TC 관리에서 테스트 케이스를 먼저 등록해주세요</p>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* 핵심 지표 */}
          <Grid $cols="repeat(4, 1fr)" $gap="16px">
            <StatCard>
              <StatLabel>총 TC</StatLabel>
              <StatValue>{stats.total}</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>통과율</StatLabel>
              <StatValue style={{ color: stats.rate >= 80 ? colors.success : stats.rate >= 50 ? colors.warning : colors.danger }}>
                {stats.rate}%
              </StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>실행률</StatLabel>
              <StatValue style={{ color: colors.primary }}>{stats.execRate}%</StatValue>
            </StatCard>
            <StatCard>
              <StatLabel>활성 버그</StatLabel>
              <StatValue style={{ color: bugStats.open > 0 ? colors.danger : colors.success }}>
                {bugStats.open + bugStats.inProgress}
              </StatValue>
            </StatCard>
          </Grid>

          {/* 탭 네비 */}
          <TabBar>
            <TabBtn $active={tab === "overview"} onClick={() => setTab("overview")}>개요</TabBtn>
            <TabBtn $active={tab === "trend"} onClick={() => setTab("trend")}>실행 트렌드</TabBtn>
            <TabBtn $active={tab === "category"} onClick={() => setTab("category")}>카테고리 분석</TabBtn>
            <TabBtn $active={tab === "assignee"} onClick={() => setTab("assignee")}>담당자별 버그</TabBtn>
            <TabBtn $active={tab === "link"} onClick={() => setTab("link")}>TC ↔ 버그 연결 ({linked.length})</TabBtn>
          </TabBar>

          {/* ──── 개요 탭 ──── */}
          {tab === "overview" && (
            <>
              <Grid $cols="1fr 1fr" $gap="20px" style={{ marginTop: 20 }}>
                <Card>
                  <CardTitle>TC 상태 분포</CardTitle>
                  <BarChart>
                    {chartData.map((d) => (
                      <BarRow key={d.label}>
                        <BarLabel>{d.label}</BarLabel>
                        <BarTrack>
                          <BarFill
                            style={{
                              width: stats.total > 0 ? `${(d.value / stats.total) * 100}%` : "0%",
                              background: d.color,
                            }}
                          />
                        </BarTrack>
                        <BarCount>{d.value}</BarCount>
                      </BarRow>
                    ))}
                  </BarChart>
                </Card>

                <Card>
                  <CardTitle>통과율 게이지</CardTitle>
                  <GaugeWrapper>
                    <GaugeSvg viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="50" fill="none" stroke={colors.border} strokeWidth="10" />
                      <GaugeCircle
                        cx="60" cy="60" r="50" fill="none"
                        stroke={stats.rate >= 80 ? colors.success : stats.rate >= 50 ? colors.warning : colors.danger}
                        strokeWidth="10"
                        strokeDasharray={`${stats.rate * 3.14} ${314 - stats.rate * 3.14}`}
                        strokeDashoffset="78.5"
                        strokeLinecap="round"
                      />
                    </GaugeSvg>
                    <GaugeText>{stats.rate}%</GaugeText>
                  </GaugeWrapper>
                  <Flex $justify="center" $gap="20px" style={{ marginTop: 16 }}>
                    {chartData.filter((d) => d.value > 0).map((d) => (
                      <Flex key={d.label} $gap="6px">
                        <Dot style={{ background: d.color }} />
                        <span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>{d.label}: {d.value}</span>
                      </Flex>
                    ))}
                  </Flex>
                </Card>
              </Grid>

              {inRangeBugs.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <Card>
                    <CardTitle>버그 현황 요약</CardTitle>
                    <Grid $cols="repeat(5, 1fr)" $gap="12px" style={{ marginTop: 16 }}>
                      <MiniCard><span style={{ fontSize: "1.3rem", fontWeight: 700 }}>{bugStats.total}</span><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>전체</span></MiniCard>
                      <MiniCard><span style={{ fontSize: "1.3rem", fontWeight: 700, color: colors.danger }}>{bugStats.open}</span><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>Open</span></MiniCard>
                      <MiniCard><span style={{ fontSize: "1.3rem", fontWeight: 700, color: colors.warning }}>{bugStats.inProgress}</span><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>In Progress</span></MiniCard>
                      <MiniCard><span style={{ fontSize: "1.3rem", fontWeight: 700, color: colors.success }}>{bugStats.resolved}</span><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>Resolved</span></MiniCard>
                      <MiniCard><span style={{ fontSize: "1.3rem", fontWeight: 700, color: colors.gray }}>{bugStats.closed}</span><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>Closed</span></MiniCard>
                    </Grid>
                  </Card>
                </div>
              )}

              {stats.fail > 0 && (
                <div style={{ marginTop: 20 }}>
                  <Card>
                    <CardTitle>Fail TC 목록 ({stats.fail}건)</CardTitle>
                    {filtered.filter((t) => t.status === "Fail").map((tc) => (
                      <FailRow key={tc.id}>
                        <Flex $gap="10px">
                          <Badge $color="danger">Fail</Badge>
                          <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.textSecondary }}>{tc.id}</span>
                          <span style={{ fontWeight: 500 }}>{tc.title}</span>
                        </Flex>
                        <Badge $color={tc.priority === "High" ? "danger" : tc.priority === "Medium" ? "warning" : "info"}>
                          {tc.priority || "Medium"}
                        </Badge>
                      </FailRow>
                    ))}
                  </Card>
                </div>
              )}
            </>
          )}

          {/* ──── 트렌드 탭 ──── */}
          {tab === "trend" && (
            <Card style={{ marginTop: 20 }}>
              <CardTitle>최근 14일 실행 추이 (Pass / Fail)</CardTitle>
              <TrendChart>
                {daily.map((d) => {
                  const passH = (d.pass / maxDaily) * 100;
                  const failH = (d.fail / maxDaily) * 100;
                  return (
                    <TrendCol key={d.date}>
                      <TrendStack>
                        <TrendBar style={{ height: `${failH}%`, background: colors.danger }} title={`Fail ${d.fail}`} />
                        <TrendBar style={{ height: `${passH}%`, background: colors.success }} title={`Pass ${d.pass}`} />
                      </TrendStack>
                      <TrendDate>{d.date.slice(5)}</TrendDate>
                    </TrendCol>
                  );
                })}
              </TrendChart>
              <Flex $justify="center" $gap="20px" style={{ marginTop: 12 }}>
                <Flex $gap="6px"><Dot style={{ background: colors.success }} /><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>Pass</span></Flex>
                <Flex $gap="6px"><Dot style={{ background: colors.danger }} /><span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>Fail</span></Flex>
              </Flex>
            </Card>
          )}

          {/* ──── 카테고리 탭 ──── */}
          {tab === "category" && (
            <Card style={{ marginTop: 20 }}>
              <CardTitle>카테고리별 통과율</CardTitle>
              {Object.keys(byCategory).length === 0 ? (
                <EmptyState><p>카테고리가 설정된 TC가 없습니다</p></EmptyState>
              ) : (
                <CategoryTable>
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th>총</th>
                      <th>Pass</th>
                      <th>Fail</th>
                      <th>Pending</th>
                      <th style={{ width: "40%" }}>통과율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byCategory)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([cat, v]) => {
                        const rate = v.total > 0 ? Math.round((v.pass / v.total) * 100) : 0;
                        return (
                          <tr key={cat}>
                            <td style={{ fontWeight: 500 }}>{cat}</td>
                            <td>{v.total}</td>
                            <td style={{ color: colors.success, fontWeight: 600 }}>{v.pass}</td>
                            <td style={{ color: colors.danger, fontWeight: 600 }}>{v.fail}</td>
                            <td style={{ color: colors.textSecondary }}>{v.pending}</td>
                            <td>
                              <CategoryBarTrack>
                                <CategoryBarFill
                                  style={{
                                    width: `${rate}%`,
                                    background: rate >= 80 ? colors.success : rate >= 50 ? colors.warning : colors.danger,
                                  }}
                                />
                                <CategoryBarLabel>{rate}%</CategoryBarLabel>
                              </CategoryBarTrack>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </CategoryTable>
              )}
            </Card>
          )}

          {/* ──── 담당자 탭 ──── */}
          {tab === "assignee" && (
            <Card style={{ marginTop: 20 }}>
              <CardTitle>담당자별 버그 분포</CardTitle>
              {Object.keys(byAssignee).length === 0 ? (
                <EmptyState><p>버그가 없습니다</p></EmptyState>
              ) : (
                Object.entries(byAssignee)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([name, v]) => {
                    const openRate = v.total > 0 ? (v.open / v.total) * 100 : 0;
                    return (
                      <AssigneeRow key={name}>
                        <Flex $justify="space-between" style={{ marginBottom: 6 }}>
                          <strong>{name}</strong>
                          <span style={{ fontSize: "0.85rem", color: colors.textSecondary }}>
                            총 {v.total}건 · <span style={{ color: colors.danger }}>미해결 {v.open}</span> · <span style={{ color: colors.success }}>해결 {v.resolved}</span>
                          </span>
                        </Flex>
                        <StackedBar>
                          <StackedBarSeg style={{ width: `${openRate}%`, background: colors.danger }} />
                          <StackedBarSeg style={{ width: `${100 - openRate}%`, background: colors.success }} />
                        </StackedBar>
                      </AssigneeRow>
                    );
                  })
              )}
            </Card>
          )}

          {/* ──── TC↔버그 연결 탭 ──── */}
          {tab === "link" && (
            <Card style={{ marginTop: 20 }}>
              <CardTitle>TC - 버그 연결 추적</CardTitle>
              <p style={{ fontSize: "0.85rem", color: colors.textSecondary, marginBottom: 16 }}>
                버그 등록 시 "관련 TC" 필드에 TC ID를 적으면 여기에 자동 매핑됩니다.
              </p>
              {linked.length === 0 ? (
                <EmptyState><p>연결된 TC-버그 쌍이 없습니다</p></EmptyState>
              ) : (
                linked.map((l) => (
                  <LinkCard key={l.tcId}>
                    <Flex $justify="space-between" style={{ marginBottom: 10 }}>
                      <Flex $gap="10px">
                        <Badge $color="info">{l.tcId}</Badge>
                        <strong>{l.tcTitle}</strong>
                        {l.tcStatus && (
                          <Badge $color={l.tcStatus === "Pass" ? "success" : l.tcStatus === "Fail" ? "danger" : "gray"}>
                            {l.tcStatus}
                          </Badge>
                        )}
                      </Flex>
                      <span style={{ fontSize: "0.85rem", color: colors.textSecondary }}>
                        연결된 버그 {l.bugs.length}건
                      </span>
                    </Flex>
                    <div>
                      {l.bugs.map((b) => (
                        <LinkedBug key={b.id}>
                          <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: colors.textSecondary }}>{b.id}</span>
                          <span style={{ flex: 1 }}>{b.title}</span>
                          <Badge $color={b.severity === "Critical" ? "danger" : b.severity === "Major" ? "warning" : "info"}>
                            {b.severity}
                          </Badge>
                          <Badge $color={b.status === "Open" ? "danger" : b.status === "In Progress" ? "warning" : "success"}>
                            {b.status}
                          </Badge>
                        </LinkedBug>
                      ))}
                    </div>
                  </LinkCard>
                ))
              )}
            </Card>
          )}
        </>
      )}
    </PageWrapper>
  );
};

// ───────── 헬퍼 ─────────
const periodToRange = (period) => {
  if (period === "all") return {};
  const to = new Date();
  const from = new Date();
  if (period === "7d") from.setDate(to.getDate() - 7);
  else if (period === "30d") from.setDate(to.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
};

const filterByPeriod = (items, period) => {
  if (period === "all") return items;
  const days = period === "7d" ? 7 : 30;
  const cutoff = Date.now() - days * 86400000;
  return items.filter((i) => {
    const t = i.updatedAt || i.createdAt;
    return t && new Date(t).getTime() >= cutoff;
  });
};

const computeStats = (tcs) => {
  const total = tcs.length;
  const pass = tcs.filter((t) => t.status === "Pass").length;
  const fail = tcs.filter((t) => t.status === "Fail").length;
  const blocked = tcs.filter((t) => t.status === "Blocked").length;
  const skip = tcs.filter((t) => t.status === "Skip").length;
  const pending = tcs.filter((t) => t.status === "Pending").length;
  const executed = pass + fail;
  const rate = total > 0 ? Math.round((pass / total) * 100) : 0;
  const execRate = total > 0 ? Math.round((executed / total) * 100) : 0;
  return { total, pass, fail, blocked, skip, pending, executed, rate, execRate };
};

const computeBugStats = (bugs) => {
  const total = bugs.length;
  const open = bugs.filter((b) => b.status === "Open").length;
  const inProgress = bugs.filter((b) => b.status === "In Progress").length;
  const resolved = bugs.filter((b) => b.status === "Resolved").length;
  const closed = bugs.filter((b) => b.status === "Closed").length;
  const critical = bugs.filter((b) => b.severity === "Critical").length;
  const major = bugs.filter((b) => b.severity === "Major").length;
  return { total, open, inProgress, resolved, closed, critical, major };
};

const computeDaily = (tcs) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const inDay = tcs.filter((tc) => {
      const u = new Date(tc.updatedAt || tc.createdAt || 0);
      return u >= d && u < next;
    });
    out.push({
      date: d.toISOString().slice(0, 10),
      pass: inDay.filter((t) => t.status === "Pass").length,
      fail: inDay.filter((t) => t.status === "Fail").length,
    });
  }
  return out;
};

// ───────── Styled ─────────

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

const StatCard = styled(Card)`
  text-align: center;
  padding: 20px;
`;

const StatLabel = styled.div`
  font-size: 0.8rem;
  color: ${colors.textSecondary};
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 1.8rem;
  font-weight: 700;
  color: ${colors.text};
`;

const CardTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${colors.text};
  margin-bottom: 16px;
`;

const TabBar = styled.div`
  display: flex;
  gap: 4px;
  margin: 24px 0 0;
  border-bottom: 2px solid ${colors.border};
`;

const TabBtn = styled.button`
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid ${(p) => (p.$active ? colors.primary : "transparent")};
  margin-bottom: -2px;
  font-size: 0.9rem;
  font-weight: ${(p) => (p.$active ? 700 : 500)};
  color: ${(p) => (p.$active ? colors.primary : colors.textSecondary)};
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;

  &:hover {
    color: ${colors.primary};
  }
`;

const BarChart = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const BarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const BarLabel = styled.span`
  width: 60px;
  font-size: 0.8rem;
  font-weight: 600;
  color: ${colors.textSecondary};
  text-align: right;
`;

const BarTrack = styled.div`
  flex: 1;
  height: 24px;
  background: ${colors.bgMain};
  border-radius: 6px;
  overflow: hidden;
`;

const BarFill = styled.div`
  height: 100%;
  border-radius: 6px;
  transition: width 0.6s ease;
  min-width: ${(p) => (p.style?.width !== "0%" ? "4px" : "0")};
`;

const BarCount = styled.span`
  width: 30px;
  font-size: 0.85rem;
  font-weight: 600;
  color: ${colors.text};
`;

const GaugeWrapper = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 0;
`;

const GaugeSvg = styled.svg`
  width: 140px;
  height: 140px;
  transform: rotate(-90deg);
`;

const GaugeCircle = styled.circle`
  transition: stroke-dasharray 0.8s ease;
`;

const GaugeText = styled.div`
  position: absolute;
  font-size: 1.8rem;
  font-weight: 700;
  color: ${colors.text};
`;

const Dot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
`;

const MiniCard = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px;
  background: ${colors.bgMain};
  border-radius: 8px;
`;

const FailRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid ${colors.border};
  &:last-child { border-bottom: none; }
`;

// 트렌드 차트
const TrendChart = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 220px;
  padding: 20px 10px 0;
`;

const TrendCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
`;

const TrendStack = styled.div`
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1px;
`;

const TrendBar = styled.div`
  width: 100%;
  border-radius: 2px;
  transition: height 0.4s ease;
`;

const TrendDate = styled.span`
  font-size: 0.7rem;
  color: ${colors.textSecondary};
  white-space: nowrap;
`;

// 카테고리 테이블
const CategoryTable = styled.table`
  width: 100%;
  border-collapse: collapse;

  th, td {
    padding: 10px 12px;
    text-align: left;
    font-size: 0.9rem;
    border-bottom: 1px solid ${colors.border};
  }

  th {
    background: ${colors.bgMain};
    font-weight: 600;
    color: ${colors.textSecondary};
    font-size: 0.8rem;
  }
`;

const CategoryBarTrack = styled.div`
  position: relative;
  height: 20px;
  background: ${colors.bgMain};
  border-radius: 4px;
  overflow: hidden;
`;

const CategoryBarFill = styled.div`
  height: 100%;
  transition: width 0.6s ease;
`;

const CategoryBarLabel = styled.span`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  font-weight: 700;
  color: ${colors.text};
`;

// 담당자 행
const AssigneeRow = styled.div`
  padding: 14px 0;
  border-bottom: 1px solid ${colors.border};
  &:last-child { border-bottom: none; }
`;

const StackedBar = styled.div`
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: ${colors.bgMain};
`;

const StackedBarSeg = styled.div`
  height: 100%;
  transition: width 0.5s ease;
`;

// 링크 카드
const LinkCard = styled.div`
  padding: 14px;
  margin-bottom: 10px;
  background: ${colors.bgMain};
  border: 1px solid ${colors.border};
  border-radius: 10px;
`;

const LinkedBug = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: ${colors.bgCard};
  border-radius: 6px;
  margin-top: 6px;
  font-size: 0.88rem;
`;

export default Review;
