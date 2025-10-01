import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();

  const linkStyle = (path) => ({
    color: location.pathname === path ? "#FFD700" : "#fff",
    textDecoration: "none",
    fontSize: "18px",
    fontWeight: "600",
    padding: "8px 16px",
    borderRadius: "8px",
    backgroundColor: location.pathname === path ? "rgba(255, 215, 0, 0.2)" : "transparent",
    transition: "0.3s",
  });

  return (
    <nav
      style={{
        background: "#222",
        padding: "12px 20px",
        display: "flex",
        justifyContent: "center",
        gap: "20px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
      }}
    >
      <Link style={linkStyle("/")} to="/">홈</Link>
      <Link style={linkStyle("/content")} to="/content">컨텐츠</Link>
      <Link style={linkStyle("/review")} to="/review">리뷰</Link>
      <Link style={linkStyle("/problem")} to="/problem">문제</Link>
      <Link style={linkStyle("/services")} to="/services">서비스</Link>
    </nav>
  );
};

export default Navbar;
