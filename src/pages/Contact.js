import React from "react";

const Contact = () => {
  return (
    <section style={{ background: "#333", color: "#fff", padding: "40px" }}>
      <h2>지금 바로 시작해보세요</h2>
      <p>문의: contact@myservice.com</p>
      <button
        style={{
          padding: "12px 24px",
          marginTop: "20px",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        무료 상담 신청
      </button>
    </section>
  );
};

export default Contact;
