import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import styled from "styled-components";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Content from "./pages/Content";
import Review from "./pages/Review";
import Problem from "./pages/Problem";
import Board from "./pages/Board";
import BoardWrite from "./pages/BoardWrite";
import BoardDetail from "./pages/BoardDetail";

const App = () => {
  return (
    <Router>
      <Layout>
        <Navbar />
        <MainContent>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/services" element={<Services />} />
            <Route path="/content" element={<Content />} />
            <Route path="/review" element={<Review />} />
            <Route path="/problem" element={<Problem />} />
            <Route path="/board" element={<Board />} />
            <Route path="/board/write" element={<BoardWrite />} />
            <Route path="/board/:id" element={<BoardDetail />} />
          </Routes>
        </MainContent>
      </Layout>
    </Router>
  );
};

const Layout = styled.div`
  display: flex;
  min-height: 100vh;
`;

const MainContent = styled.main`
  flex: 1;
  margin-left: 240px;
  min-height: 100vh;
  background: #F1F5F9;
`;

export default App;
