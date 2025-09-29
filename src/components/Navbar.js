import React, { useState } from "react";

const Navbar = ({ activeTab, setActiveTab }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setIsOpen(false);
  };

  return (
    <nav style={{ background: "#6C63FF", padding: "10px 20px", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, cursor: "pointer" }} onClick={() => handleTabClick("home")}>
          MySite
        </h2>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="desktop-menu" style={{ display: "flex", gap: "20px" }}>
            <button
              onClick={() => handleTabClick("home")}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontWeight: activeTab === "home" ? "bold" : "normal"
              }}
            >
              Home
            </button>
            <button
              onClick={() => handleTabClick("services")}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontWeight: activeTab === "services" ? "bold" : "normal"
              }}
            >
              Services
            </button>
            <button
              onClick={() => handleTabClick("tools")}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontWeight: activeTab === "tools" ? "bold" : "normal"
              }}
            >
              도구
            </button>
            <button
              onClick={() => handleTabClick("contact")}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontWeight: activeTab === "contact" ? "bold" : "normal"
              }}
            >
              Contact
            </button>
          </div>
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              marginLeft: "20px",
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: "20px",
              cursor: "pointer"
            }}
          >
            ☰
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}
        >
          <button onClick={() => handleTabClick("home")} style={{ background: "#fff", border: "none", padding: "10px", borderRadius: "6px", cursor: "pointer" }}>
            Home
          </button>
          <button onClick={() => handleTabClick("services")} style={{ background: "#fff", border: "none", padding: "10px", borderRadius: "6px", cursor: "pointer" }}>
            Services
          </button>
          <button onClick={() => handleTabClick("tools")} style={{ background: "#fff", border: "none", padding: "10px", borderRadius: "6px", cursor: "pointer" }}>
            도구
          </button>
          <button onClick={() => handleTabClick("contact")} style={{ background: "#fff", border: "none", padding: "10px", borderRadius: "6px", cursor: "pointer" }}>
            Contact
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
