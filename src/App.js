import React from 'react';
import Navbar from './Navbar';

function App() {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", lineHeight: 1.6 }}>
      <Navbar />
      <section id="services" style={{ padding: "60px 20px", textAlign: "center" }}>
        <h1>우리의 서비스</h1>
        <p>고객의 문제를 해결하는 최고의 솔루션</p>
        <button style={{ padding: "12px 24px", marginTop: "20px", fontSize: "16px", cursor: "pointer" }}>
          지금 시작하기
        </button>
      </section>

      <section id="problems" style={{ padding: "60px 20px", textAlign: "center" }}>
        <h2>이런 문제 있으신가요?</h2>
        <p>✔︎ 시간이 부족하다</p>
        <p>✔︎ 효율적인 관리가 어렵다</p>
        <p>✔︎ 성장 방향이 막막하다</p>
        <h3 style={{ marginTop: "40px" }}>👉 우리의 솔루션으로 해결하세요!</h3>
      </section>

      <section id="features" style={{ padding: "60px 20px", background: "#f9f9f9" }}>
        <h2 style={{ textAlign: "center" }}>주요 기능</h2>
        <div style={{ display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap", marginTop: "30px" }}>
          <div style={{ flex: "1 1 250px", background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
            <h3>간편한 사용</h3>
            <p>누구나 쉽게 사용할 수 있는 직관적인 인터페이스</p>
          </div>
          <div style={{ flex: "1 1 250px", background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
            <h3>강력한 성능</h3>
            <p>빠르고 안정적인 시스템으로 업무 효율 극대화</p>
          </div>
          <div style={{ flex: "1 1 250px", background: "#fff", padding: "20px", borderRadius: "8px", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }}>
            <h3>확장성</h3>
            <p>다양한 환경에 맞춰 유연하게 확장 가능</p>
          </div>
        </div>
      </section>

      <section id="reviews" style={{ padding: "60px 20px", textAlign: "center" }}>
        <h2>고객 후기</h2>
        <blockquote style={{ fontStyle: "italic", marginTop: "20px" }}>
          "이 서비스를 쓰고 업무 효율이 2배로 늘었어요!" - 고객 A
        </blockquote>
      </section>

      <section id="contact" style={{ padding: "60px 20px", background: "#333", color: "#fff", textAlign: "center" }}>
        <h2>지금 바로 시작해보세요</h2>
        <p>문의: contact@myservice.com</p>
        <button style={{ padding: "12px 24px", marginTop: "20px", fontSize: "16px", cursor: "pointer" }}>
          무료 상담 신청
        </button>
      </section>

      <footer style={{ background: "#111", color: "#aaa", padding: "20px", textAlign: "center" }}>
        <p>© 2025 My Company | All Rights Reserved</p>
      </footer>
    </div>
  );
}

export default App;
