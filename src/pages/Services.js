import React from "react";

const Services = () => {
  return (
    <section style={{ padding: "80px 20px", textAlign: "center", background: "#f4f4f4" }}>
      <h2 style={{ fontSize: "36px", marginBottom: "20px" }}>우리의 서비스</h2>
      <p style={{ fontSize: "18px", maxWidth: "700px", margin: "0 auto 30px" }}>
        고객의 문제를 해결하는 최고의 솔루션을 제공합니다. 쉽고 빠르게 사용 가능합니다.
      </p>
      <button
        style={{
          padding: "12px 28px",
          fontSize: "16px",
          cursor: "pointer",
          borderRadius: "6px",
          border: "none",
          background: "#6C63FF",
          color: "#fff",
          fontWeight: "600",
          transition: "0.3s",
        }}
        onMouseEnter={(e) => (e.target.style.background = "#5750d2")}
        onMouseLeave={(e) => (e.target.style.background = "#6C63FF")}
      >
        서비스 시작하기
      </button>
    </section>
  );
};

export default Services;
