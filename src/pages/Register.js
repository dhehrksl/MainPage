import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Card, Input, Button, colors } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await register(email.trim(), password, name.trim());
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Wrapper>
      <AuthCard>
        <LogoIcon className="material-icons">verified</LogoIcon>
        <Title>QA Platform 회원가입</Title>
        <Subtitle>계정을 만들고 바로 시작하세요</Subtitle>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <label>이름 (선택)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" $width="100%" autoFocus />
          </FieldGroup>
          <FieldGroup>
            <label>이메일</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              $width="100%"
              required
            />
          </FieldGroup>
          <FieldGroup>
            <label>비밀번호 (6자 이상)</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              $width="100%"
              required
            />
          </FieldGroup>
          <FieldGroup>
            <label>비밀번호 확인</label>
            <Input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호 확인"
              $width="100%"
              required
            />
          </FieldGroup>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <Button type="submit" $variant="primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={loading}>
            {loading ? "가입 중..." : "가입하기"}
          </Button>
        </form>

        <FooterLink>
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
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

export default Register;
