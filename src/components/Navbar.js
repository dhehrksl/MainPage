import React, { useState } from "react";

const Navbar = ({ activeTab, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: "home", label: "홈" },
    { id: "services", label: "서비스" },
    { id: "problems", label: "문제" },
    { id: "features", label: "기능" },
    { id: "reviews", label: "후기" },
    { id: "contact", label: "문의" },
  ];

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 20px",
        background: "#222",
        color: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 1000,
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "22px", letterSpacing: "1px" }}>My Company</div>

      {/* 햄버거 */}
      <div
        style={{ display: "none", cursor: "pointer" }}
        onClick={() => setIsOpen(!isOpen)}
        className="hamburger"
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: "25px",
              height: "3px",
              background: "#fff",
              margin: "5px 0",
              borderRadius: "2px",
              transition: "0.3s",
            }}
          />
        ))}
      </div>

      {/* 메뉴 */}
      <div
        style={{
          display: "flex",
          gap: "25px",
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
        className={`menu ${isOpen ? "open" : ""}`}
      >
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onChange(item.id);
              setIsOpen(false);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: activeTab === item.id ? "#FFD700" : "#fff",
              fontWeight: activeTab === item.id ? "600" : "400",
              cursor: "pointer",
              fontSize: "16px",
              padding: "6px 10px",
              borderRadius: "6px",
              transition: "0.3s",
            }}
            onMouseEnter={(e) => (e.target.style.background = "#444")}
            onMouseLeave={(e) => (e.target.style.background = "transparent")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hamburger {
            display: block;
          }
          .menu {
            display: ${isOpen ? "flex" : "none"};
            flex-direction: column;
            width: 100%;
            background: #222;
            position: absolute;
            top: 55px;
            right: 0;
            padding: 15px 20px;
          }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;
