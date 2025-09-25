import React from "react";

const Features = () => {
  return (
    <section style={{ background: "#f9f9f9", padding: "40px" }}>
      <h2>주요 기능</h2>
      <div
        style={{
          display: "flex",
          gap: "20px",
          justifyContent: "center",
          flexWrap: "wrap",
          marginTop: "30px",
        }}
      >
        <div
          style={{
            flex: "1 1 250px",
            background: "#fff",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          <h3>간편한 사용</h3>
          <p>누구나 쉽게 사용할 수 있는 직관적인 인터페이스</p>
        </div>
        <div
          style={{
            flex: "1 1 250px",
            background: "#fff",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          <h3>강력한 성능</h3>
          <p>빠르고 안정적인 시스템으로 업무 효율 극대화</p>
        </div>
        <div
          style={{
            flex: "1 1 250px",
            background: "#fff",
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
          }}
        >
          <h3>확장성</h3>
          <p>다양한 환경에 맞춰 유연하게 확장 가능</p>
        </div>
      </div>
    </section>
  );
};

export default Features;
