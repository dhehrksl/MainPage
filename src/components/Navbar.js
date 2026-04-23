import { NavLink } from "react-router-dom";
import styled from "styled-components";
import { colors } from "../styles/theme";

const NAV_ITEMS = [
  { to: "/", icon: "grid_view", label: "대시보드" },
  { to: "/services", icon: "smart_toy", label: "유사 발화 생성" },
  { to: "/content", icon: "checklist", label: "TC 관리" },
  { to: "/review", icon: "assessment", label: "QA 리포트" },
  { to: "/problem", icon: "bug_report", label: "버그 리포트" },
  { to: "/board", icon: "forum", label: "게시판" },
];

const Navbar = () => {
  return (
    <Sidebar>
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
          >
            <span className="material-icons">{item.icon}</span>
            {item.label}
          </StyledNavLink>
        ))}
      </Nav>

      <SidebarFooter>
        <FooterText>QA Platform v1.0</FooterText>
      </SidebarFooter>
    </Sidebar>
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
  z-index: 100;
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

const FooterText = styled.span`
  font-size: 0.75rem;
  color: ${colors.gray};
`;

export default Navbar;
