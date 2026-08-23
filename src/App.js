import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import Services from "./pages/Services";
import Content from "./pages/Content";
import GenerateTC from "./pages/GenerateTC";
import Review from "./pages/Review";
import Problem from "./pages/Problem";
import Board from "./pages/Board";
import BoardWrite from "./pages/BoardWrite";
import BoardDetail from "./pages/BoardDetail";

// 로그인하지 않은 사용자는 /login으로 보낸다.
const RequireAuth = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
};

const AppLayout = () => (
  <Layout>
    <Navbar />
    <MainContent>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/content" element={<Content />} />
        <Route path="/generate-tc" element={<GenerateTC />} />
        <Route path="/review" element={<Review />} />
        <Route path="/problem" element={<Problem />} />
        <Route path="/board" element={<Board />} />
        <Route path="/board/write" element={<BoardWrite />} />
        <Route path="/board/:id" element={<BoardDetail />} />
      </Routes>
    </MainContent>
  </Layout>
);

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
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
