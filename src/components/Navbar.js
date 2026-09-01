import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

// 이 폭 이하에서는 사이드바가 기본 숨김 + 슬라이드 드로어로 전환된다.
const MOBILE_BREAKPOINT = "860px";

const NAV_ITEMS = [
  { to: "/", icon: "grid_view", label: "대시보드" },
  { to: "/services", icon: "smart_toy", label: "유사 발화 생성" },
  { to: "/content", icon: "checklist", label: "TC 관리" },
  { to: "/generate-tc", icon: "auto_awesome", label: "URL→TC 생성" },
  { to: "/review", icon: "assessment", label: "QA 리포트" },
  { to: "/problem", icon: "bug_report", label: "버그 리포트" },
  { to: "/board", icon: "forum", label: "게시판" },
];

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // 모바일 드로어 열림 상태

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const closeDrawer = () => setOpen(false);

  return (
    <>
      <Hamburger onClick={() => setOpen((o) => !o)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"}>
        <span className="material-icons">{open ? "close" : "menu"}</span>
      </Hamburger>
      <Overlay $open={open} onClick={closeDrawer} />
      <Sidebar $open={open}>
        <LogoArea>
          <LogoIcon className="material-icons">verified</LogoIcon>
          <LogoText>QA Platform</LogoText>
        </LogoArea>

        <Nav>
          {NAV_ITEMS.map((item) => (
            <StyledNavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={closeDrawer}
            >
              <span className="material-icons">{item.icon}</span>
              {item.label}
            </StyledNavLink>
          ))}
        </Nav>

        <SidebarFooter>
          {user && (
            <UserRow>
              <span className="material-icons" style={{ fontSize: 18 }}>account_circle</span>
              <UserEmail title={user.email}>{user.name || user.email}</UserEmail>
            </UserRow>
          )}
          <LogoutBtn onClick={handleLogout}>
            <span className="material-icons" style={{ fontSize: 16 }}>logout</span>
            로그아웃
          </LogoutBtn>
          <FooterText>QA Platform v1.0</FooterText>
        </SidebarFooter>
      </Sidebar>
    </>
  );
};

const Sidebar = styled.aside`
  width: 240px;
  min-height: 100vh;
  background: ${colors.dark};
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 200;
  transition: transform 0.25s ease;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    transform: translateX(${(p) => (p.$open ? "0" : "-100%")});
    box-shadow: ${(p) => (p.$open ? "4px 0 24px rgba(0, 0, 0, 0.3)" : "none")};
  }
`;

const Hamburger = styled.button`
  display: none;
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 300;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  background: ${colors.dark};
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;

  .material-icons { font-size: 22px; }

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    display: flex;
  }
`;

const Overlay = styled.div`
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 150;

  @media (max-width: ${MOBILE_BREAKPOINT}) {
    display: ${(p) => (p.$open ? "block" : "none")};
  }
`;

const LogoArea = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 20px;
  border-bottom: 1px solid ${colors.darkGray};
`;

const LogoIcon = styled.span`
  font-size: 28px;
  color: ${colors.primary};
`;

const LogoText = styled.span`
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
`;

const Nav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 12px;
  flex: 1;
`;

const StyledNavLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: ${colors.lightGray};
  transition: all 0.2s;

  .material-icons {
    font-size: 20px;
  }

  &:hover {
    background: ${colors.darkGray};
    color: #fff;
  }

  &.active {
    background: ${colors.primary};
    color: #fff;
    font-weight: 600;
  }
`;

const SidebarFooter = styled.div`
  padding: 16px 20px;
  border-top: 1px solid ${colors.darkGray};
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${colors.lightGray};
  margin-bottom: 10px;
`;

const UserEmail = styled.span`
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LogoutBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: none;
  border: 1px solid ${colors.darkGray};
  border-radius: 6px;
  color: ${colors.lightGray};
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: ${colors.darkGray};
    color: #fff;
  }
`;

const FooterText = styled.span`
  font-size: 0.75rem;
  color: ${colors.gray};
`;

export default Navbar;
