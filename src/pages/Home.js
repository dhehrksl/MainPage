import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Grid, Flex, Badge, colors,
} from "../styles/theme";

const STATS = [
  { icon: "checklist", label: "총 TC", key: "qa_testcases", color: colors.primary, bg: colors.primaryLight },
  { icon: "check_circle", label: "Pass", key: "qa_testcases", color: colors.success, bg: colors.successLight, filter: "Pass" },
  { icon: "bug_report", label: "활성 버그", key: "qa_bugs", color: colors.danger, bg: colors.dangerLight, filter: "active" },
  { icon: "trending_up", label: "통과율", key: "rate", color: colors.info, bg: colors.infoLight },
];

const getStorageData = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};

const Home = () => {
  const navigate = useNavigate();
  const testcases = getStorageData("qa_testcases");
  const bugs = getStorageData("qa_bugs");

  const totalTC = testcases.length;
  const passCount = testcases.filter((t) => t.status === "Pass").length;
  const failCount = testcases.filter((t) => t.status === "Fail").length;
  const activeBugs = bugs.filter((b) => b.status !== "Closed").length;
  const rate = totalTC > 0 ? Math.round((passCount / totalTC) * 100) : 0;

  const statValues = [totalTC, passCount, activeBugs, `${rate}%`];

  const quickActions = [
    { icon: "smart_toy", label: "유사 발화 생성", path: "/services", color: colors.primary },
    { icon: "add_task", label: "TC 추가", path: "/content", color: colors.success },
    { icon: "bug_report", label: "버그 등록", path: "/problem", color: colors.danger },
    { icon: "assessment", label: "리포트 보기", path: "/review", color: colors.info },
  ];

  const recentTCs = testcases.slice(-5).reverse();
  const recentBugs = bugs.slice(-5).reverse();

  return (
    <PageWrapper>
      <PageHeader>
        <PageTitle>QA 대시보드</PageTitle>
        <PageSubtitle>프로젝트 QA 현황을 한눈에 확인하세요</PageSubtitle>
      </PageHeader>

      {/* 통계 카드 */}
      <Grid $cols="repeat(4, 1fr)" $gap="16px">
        {STATS.map((s, i) => (
          <StatCard key={i}>
            <StatIcon style={{ background: s.bg, color: s.color }}>
              <span className="material-icons">{s.icon}</span>
            </StatIcon>
            <div>
              <StatValue>{statValues[i]}</StatValue>
              <StatLabel>{s.label}</StatLabel>
            </div>
          </StatCard>
        ))}
      </Grid>

      {/* 빠른 액션 */}
      <SectionTitle>빠른 실행</SectionTitle>
      <Grid $cols="repeat(4, 1fr)" $gap="16px">
        {quickActions.map((a) => (
          <ActionCard key={a.path} onClick={() => navigate(a.path)} $color={a.color}>
            <span className="material-icons" style={{ fontSize: 28, color: a.color }}>{a.icon}</span>
            <span>{a.label}</span>
          </ActionCard>
        ))}
      </Grid>

      {/* 최근 활동 */}
      <Grid $cols="1fr 1fr" $gap="20px" style={{ marginTop: 24 }}>
        <div>
          <SectionTitle>최근 TC</SectionTitle>
          <Card>
            {recentTCs.length === 0 ? (
              <EmptyText>등록된 TC가 없습니다</EmptyText>
            ) : (
              recentTCs.map((tc, i) => (
                <ActivityRow key={i}>
                  <span>{tc.title || tc.id}</span>
                  <Badge $color={tc.status === "Pass" ? "success" : tc.status === "Fail" ? "danger" : "gray"}>
                    {tc.status || "Pending"}
                  </Badge>
                </ActivityRow>
              ))
            )}
          </Card>
        </div>
        <div>
          <SectionTitle>최근 버그</SectionTitle>
          <Card>
            {recentBugs.length === 0 ? (
              <EmptyText>등록된 버그가 없습니다</EmptyText>
            ) : (
              recentBugs.map((bug, i) => (
                <ActivityRow key={i}>
                  <span>{bug.title}</span>
                  <Badge $color={
                    bug.severity === "Critical" ? "danger" :
                    bug.severity === "Major" ? "warning" : "info"
                  }>
                    {bug.severity}
                  </Badge>
                </ActivityRow>
              ))
            )}
          </Card>
        </div>
      </Grid>

      {/* 진행률 바 */}
      {totalTC > 0 && (
        <>
          <SectionTitle>테스트 진행 현황</SectionTitle>
          <Card>
            <Flex $justify="space-between" style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>전체 진행률</span>
              <span style={{ fontWeight: 600, color: colors.primary }}>{rate}%</span>
            </Flex>
            <ProgressBarBg>
              <ProgressBarFill style={{ width: `${rate}%` }} />
            </ProgressBarBg>
            <Flex $gap="24px" style={{ marginTop: 16 }}>
              <LegendItem><LegendDot $c={colors.success} /> Pass: {passCount}</LegendItem>
              <LegendItem><LegendDot $c={colors.danger} /> Fail: {failCount}</LegendItem>
              <LegendItem><LegendDot $c={colors.lightGray} /> 미실행: {totalTC - passCount - failCount}</LegendItem>
            </Flex>
          </Card>
        </>
      )}
    </PageWrapper>
  );
};

// ── Styled ──

const StatCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
`;

const StatIcon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;

  .material-icons { font-size: 24px; }
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${colors.text};
`;

const StatLabel = styled.div`
  font-size: 0.8rem;
  color: ${colors.textSecondary};
  margin-top: 2px;
`;

const SectionTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: ${colors.text};
  margin: 24px 0 12px;
`;

const ActionCard = styled(Card)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;

  &:hover {
    border-color: ${(p) => p.$color};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    transform: translateY(-2px);
  }
`;

const ActivityRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  font-size: 0.9rem;
  border-bottom: 1px solid ${colors.border};

  &:last-child { border-bottom: none; }
`;

const EmptyText = styled.p`
  text-align: center;
  color: ${colors.textSecondary};
  padding: 24px 0;
  font-size: 0.9rem;
`;

const ProgressBarBg = styled.div`
  height: 10px;
  background: ${colors.border};
  border-radius: 5px;
  overflow: hidden;
`;

const ProgressBarFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, ${colors.primary}, ${colors.success});
  border-radius: 5px;
  transition: width 0.6s ease;
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: ${colors.textSecondary};
`;

const LegendDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => p.$c};
`;

export default Home;
