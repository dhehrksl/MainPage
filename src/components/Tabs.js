import React from "react";
import TabButton from "./TabButton";

const Tabs = ({ activeTab, onChange }) => {
  const tabs = [
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
        justifyContent: "center",
        gap: "20px",
        background: "#333",
        padding: "15px",
      }}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          isActive={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </TabButton>
      ))}
    </nav>
  );
};

export default Tabs;
