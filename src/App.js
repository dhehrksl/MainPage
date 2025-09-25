import React, { useState } from "react";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Problems from "./pages/Problems";
import Features from "./pages/Features";
import Reviews from "./pages/Reviews";
import Contact from "./pages/Contact";

const App = () => {
  const [activeTab, setActiveTab] = useState("home");

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home />;
      case "services":
        return <Services />;
      case "problems":
        return <Problems />;
      case "features":
        return <Features />;
      case "reviews":
        return <Reviews />;
      case "contact":
        return <Contact />;
      default:
        return <Home />;
    }
  };

  return (
    <div style={{ fontFamily: "'Arial', sans-serif", lineHeight: 1.6, color: "#333" }}>
      <Navbar activeTab={activeTab} onChange={setActiveTab} />
      {renderContent()}
      <footer
        style={{
          background: "#111",
          color: "#aaa",
          padding: "20px",
          textAlign: "center",
          fontSize: "14px",
        }}
      >
        © 2025 My Company | All Rights Reserved
      </footer>
    </div>
  );
};

export default App;
