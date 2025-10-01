import { Link } from "react-router-dom";

const Home = () => {
  return (
    <section style={sectionStyle}>
      <h1>Welcome to My Service</h1>
      <p>최고의 솔루션으로 당신의 문제를 해결하세요</p>
      <Link to="/services" style={buttonStyle}>
        지금 시작하기
      </Link>
    </section>
  );
};

const sectionStyle = {
  height: "90vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  background: "linear-gradient(135deg, #6C63FF, #00BFFF)",
  color: "#fff",
  textAlign: "center",
  padding: "20px",
};

const buttonStyle = {
  padding: "14px 28px",
  fontSize: "18px",
  cursor: "pointer",
  borderRadius: "8px",
  border: "none",
  background: "#FFD700",
  color: "#222",
  fontWeight: "600",
  textDecoration: "none",
  transition: "0.3s",
};

export default Home;
