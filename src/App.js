import React, { useState } from "react";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Contact from "./pages/Contact";

const App = () => {
  const [activeTab, setActiveTab] = useState("home");

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home />;
      case "services":
        return <Services />;
      case "contact":
        return <Contact />;
      default:
        return <Home />;
    }
  };

  return (
    <div>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ padding: "20px" }}>{renderContent()}</div>
    </div>
  );
};

export default App;
