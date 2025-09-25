import React from "react";

const TabButton = ({ isActive, onClick, children }) => {
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? "#fff" : "transparent",
        color: isActive ? "#333" : "#fff",
        border: "none",
        padding: "10px 20px",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: isActive ? "bold" : "normal",
        transition: "all 0.3s ease",
      }}
    >
      {children}
    </button>
  );
};

export default TabButton;
