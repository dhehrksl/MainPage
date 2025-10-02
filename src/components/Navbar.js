import { Link } from "react-router-dom";

const Navbar = () => {
  const navStyle = {
    display: "flex",
    justifyContent: "center",
    gap: "20px",
    padding: "20px",
    background: "#222",
    color: "#fff",
  };

  return (
    <nav style={navStyle}>
      <Link to="/" style={{ color: "#fff", textDecoration: "none" }}>홈</Link>
      <Link to="/content" style={{ color: "#fff", textDecoration: "none" }}>컨텐츠</Link>
      <Link to="/review" style={{ color: "#fff", textDecoration: "none" }}>리뷰</Link>
      <Link to="/problem" style={{ color: "#fff", textDecoration: "none" }}>문제</Link>
      <Link to="/services" style={{ color: "#fff", textDecoration: "none" }}>서비스</Link>
    </nav>
  );
};

export default Navbar;
