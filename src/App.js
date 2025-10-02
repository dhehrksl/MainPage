import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Content from "./pages/Content";
import Review from "./pages/Review";
import Problem from "./pages/Problem";

const App = () => {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/content" element={<Content />} />
        <Route path="/review" element={<Review />} />
        <Route path="/problem" element={<Problem />} />
      </Routes>
    </Router>
  );
};

export default App;
