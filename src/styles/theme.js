import styled, { keyframes, css } from "styled-components";

// ── 컬러 팔레트 ──
export const colors = {
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primaryLight: "#DBEAFE",
  success: "#10B981",
  successLight: "#D1FAE5",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  info: "#6366F1",
  infoLight: "#E0E7FF",
  dark: "#1E293B",
  darkGray: "#334155",
  gray: "#64748B",
  lightGray: "#94A3B8",
  border: "#E2E8F0",
  bgMain: "#F1F5F9",
  bgCard: "#FFFFFF",
  text: "#1E293B",
  textSecondary: "#64748B",
};

// ── 애니메이션 ──
export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

// ── 레이아웃 ──
export const PageWrapper = styled.div`
  padding: 32px;
  animation: ${fadeIn} 0.5s ease-out;
  min-height: 100%;
`;

export const PageHeader = styled.div`
  margin-bottom: 32px;
`;

export const PageTitle = styled.h1`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${colors.text};
  margin: 0 0 6px 0;
`;

export const PageSubtitle = styled.p`
  font-size: 0.95rem;
  color: ${colors.textSecondary};
  margin: 0;
`;

// ── 카드 ──
export const Card = styled.div`
  background: ${colors.bgCard};
  border-radius: 12px;
  border: 1px solid ${colors.border};
  padding: ${(p) => p.$padding || "24px"};
  transition: box-shadow 0.2s;

  ${(p) =>
    p.$hover &&
    css`
      &:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      }
    `}
`;

// ── 버튼 ──
const btnColors = {
  primary: { bg: colors.primary, hover: colors.primaryDark, text: "#fff" },
  success: { bg: colors.success, hover: "#059669", text: "#fff" },
  danger: { bg: colors.danger, hover: "#DC2626", text: "#fff" },
  warning: { bg: colors.warning, hover: "#D97706", text: "#fff" },
  secondary: { bg: colors.border, hover: "#CBD5E1", text: colors.text },
};

export const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: ${(p) => (p.$size === "sm" ? "6px 14px" : "10px 20px")};
  font-size: ${(p) => (p.$size === "sm" ? "0.8rem" : "0.9rem")};
  font-weight: 600;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;

  ${(p) => {
    const c = btnColors[p.$variant || "primary"];
    return css`
      background: ${c.bg};
      color: ${c.text};
      &:hover:not(:disabled) {
        background: ${c.hover};
      }
    `;
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ── 입력 ──
export const Input = styled.input`
  padding: 10px 14px;
  font-size: 0.9rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-family: inherit;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: ${(p) => p.$width || "auto"};

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight};
  }
`;

export const TextArea = styled.textarea`
  padding: 10px 14px;
  font-size: 0.9rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight};
  }
`;

export const Select = styled.select`
  padding: 10px 14px;
  font-size: 0.9rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-family: inherit;
  background: #fff;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight};
  }
`;

// ── 테이블 ──
export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th {
    text-align: left;
    padding: 12px 16px;
    font-size: 0.8rem;
    font-weight: 600;
    color: ${colors.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid ${colors.border};
    background: ${colors.bgMain};
  }

  td {
    padding: 12px 16px;
    font-size: 0.9rem;
    color: ${colors.text};
    border-bottom: 1px solid ${colors.border};
  }

  tbody tr {
    transition: background 0.15s;
    &:hover {
      background: ${colors.bgMain};
    }
  }
`;

// ── 배지 ──
const badgeColors = {
  success: { bg: colors.successLight, text: "#065F46" },
  danger: { bg: colors.dangerLight, text: "#991B1B" },
  warning: { bg: colors.warningLight, text: "#92400E" },
  info: { bg: colors.infoLight, text: "#3730A3" },
  gray: { bg: "#F1F5F9", text: colors.gray },
};

export const Badge = styled.span`
  display: inline-block;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 20px;

  ${(p) => {
    const c = badgeColors[p.$color || "gray"];
    return css`
      background: ${c.bg};
      color: ${c.text};
    `;
  }}
`;

// ── 스피너 ──
export const Spinner = styled.div`
  border: 3px solid ${colors.border};
  border-top: 3px solid ${colors.primary};
  border-radius: 50%;
  width: ${(p) => p.$size || "32px"};
  height: ${(p) => p.$size || "32px"};
  animation: ${spin} 0.8s linear infinite;
  margin: 20px auto;
`;

// ── 빈 상태 ──
export const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: ${colors.textSecondary};

  p {
    margin: 8px 0 0;
    font-size: 0.9rem;
  }
`;

// ── Flex / Grid 유틸 ──
export const Flex = styled.div`
  display: flex;
  align-items: ${(p) => p.$align || "center"};
  justify-content: ${(p) => p.$justify || "flex-start"};
  gap: ${(p) => p.$gap || "12px"};
  flex-wrap: ${(p) => (p.$wrap ? "wrap" : "nowrap")};
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: ${(p) => p.$cols || "repeat(auto-fit, minmax(240px, 1fr))"};
  gap: ${(p) => p.$gap || "20px"};
`;
