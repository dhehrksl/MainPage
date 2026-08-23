import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Card, Input, Button, colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Wrapper>
      <AuthCard>
        <LogoIcon className="material-icons">verified</LogoIcon>
        <Title>QA Platform 로그인</Title>
        <Subtitle>계정으로 로그인하세요</Subtitle>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <label>이메일</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              $width="100%"
              autoFocus
              required
            />
          </FieldGroup>
          <FieldGroup>
            <label>비밀번호</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              $width="100%"
              required
            />
          </FieldGroup>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <Button type="submit" $variant="primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={loading}>
            {loading ? "로그인 중..." : "로그인"}
          </Button>
        </form>

        <FooterLink>
          계정이 없으신가요? <Link to="/register">회원가입</Link>
        </FooterLink>
      </AuthCard>
    </Wrapper>
  );
};

const Wrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${colors.bgMain};
  padding: 20px;
`;

const AuthCard = styled(Card)`
  width: 380px;
  max-width: 100%;
  text-align: center;
`;

const LogoIcon = styled.span`
  font-size: 40px;
  color: ${colors.primary};
`;

const Title = styled.h1`
  font-size: 1.3rem;
  font-weight: 700;
  color: ${colors.text};
  margin: 8px 0 4px;
`;

const Subtitle = styled.p`
  font-size: 0.85rem;
  color: ${colors.textSecondary};
  margin: 0 0 24px;
`;

const FieldGroup = styled.div`
  margin-bottom: 14px;
  text-align: left;
  label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: ${colors.textSecondary};
    margin-bottom: 6px;
  }
`;

const ErrorMsg = styled.p`
  color: ${colors.danger};
  font-size: 0.82rem;
  font-weight: 500;
  margin: 4px 0 0;
  text-align: left;
`;

const FooterLink = styled.p`
  margin: 20px 0 0;
  font-size: 0.85rem;
  color: ${colors.textSecondary};

  a {
    color: ${colors.primary};
    font-weight: 600;
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`;

export default Login;
