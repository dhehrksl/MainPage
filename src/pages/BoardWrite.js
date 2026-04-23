import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Select, Flex, colors,
} from "../styles/theme";
import { createPost } from "../api/client";

const CATEGORIES = ["공지", "질문", "공유", "기타"];

const BoardWrite = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", content: "", author: "", category: "기타",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;

    setSubmitting(true);
    try {
      await createPost({
        title: form.title,
        content: form.content,
        author: form.author || "익명",
        category: form.category,
      });
      navigate("/board");
    } catch {
      alert("게시글 저장 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper>
      <PageHeader>
        <PageTitle>글쓰기</PageTitle>
        <PageSubtitle>QA 관련 정보를 공유해주세요</PageSubtitle>
      </PageHeader>

      <Card style={{ maxWidth: 800 }}>
        <form onSubmit={handleSubmit}>
          <Flex $gap="12px" $wrap style={{ marginBottom: 16 }}>
            <FormGroup style={{ flex: 1 }}>
              <label>작성자</label>
              <Input
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
                placeholder="이름"
                $width="100%"
              />
            </FormGroup>
            <FormGroup style={{ width: 140 }}>
              <label>분류</label>
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{ width: "100%" }}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </FormGroup>
          </Flex>

          <FormGroup>
            <label>제목 *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              $width="100%"
              required
            />
          </FormGroup>

          <FormGroup>
            <label>내용 *</label>
            <StyledTextArea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={12}
              required
            />
          </FormGroup>

          <Flex $justify="flex-end" $gap="10px" style={{ marginTop: 20 }}>
            <Button type="button" $variant="secondary" onClick={() => navigate("/board")}>
              취소
            </Button>
            <Button type="submit" $variant="primary" disabled={submitting}>
              <span className="material-icons" style={{ fontSize: 18 }}>check</span>
              {submitting ? "등록 중..." : "등록하기"}
            </Button>
          </Flex>
        </form>
      </Card>
    </PageWrapper>
  );
};

// ── Styled ──

const FormGroup = styled.div`
  margin-bottom: 14px;
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: ${colors.textSecondary};
    margin-bottom: 6px;
  }
`;

const StyledTextArea = styled.textarea`
  width: 100%;
  padding: 12px 14px;
  font-size: 0.9rem;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  font-family: inherit;
  resize: vertical;
  line-height: 1.6;
  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 3px ${colors.primaryLight};
  }
`;

export default BoardWrite;
