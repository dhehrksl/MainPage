const Home = () => {
  return (
    <section
      style={{
        height: "90vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg, #6C63FF, #00BFFF)",
        color: "#fff",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <h1 style={{ fontSize: "56px", fontWeight: "700", marginBottom: "20px" }}>
        Welcome to My Service
      </h1>
      <p style={{ fontSize: "22px", marginBottom: "30px" }}>
        최고의 솔루션으로 당신의 문제를 해결하세요
      </p>
      <button
        style={{
          padding: "14px 28px",
          fontSize: "18px",
          cursor: "pointer",
          borderRadius: "8px",
          border: "none",
          background: "#FFD700",
          color: "#222",
          fontWeight: "600",
          transition: "0.3s",
        }}
        onMouseEnter={(e) => (e.target.style.background = "#FFC107")}
        onMouseLeave={(e) => (e.target.style.background = "#FFD700")}
      >
        지금 시작하기
      </button>
    </section>
  );
};

export default Home;
