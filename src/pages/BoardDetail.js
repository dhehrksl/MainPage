import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, Card, Button, Badge, Flex, colors,
} from "../styles/theme";
import { fetchPost, deletePost } from "../api/client";

const BoardDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await fetchPost(id);
      setPost(data || null);
      setLoading(false);
    })();
  }, [id]);

  const handleDelete = async () => {
    if (!window.confirm("이 게시글을 삭제하시겠습니까?")) return;
    try {
      await deletePost(id);
      navigate("/board");
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <Card style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: colors.textSecondary }}>불러오는 중...</p>
        </Card>
      </PageWrapper>
    );
  }

  if (!post) {
    return (
      <PageWrapper>
        <Card style={{ textAlign: "center", padding: 60 }}>
          <span className="material-icons" style={{ fontSize: 48, color: colors.border }}>error_outline</span>
          <p style={{ color: colors.textSecondary, marginTop: 12 }}>게시글을 찾을 수 없습니다</p>
          <Button $variant="secondary" onClick={() => navigate("/board")} style={{ marginTop: 16 }}>
            목록으로
          </Button>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Card style={{ maxWidth: 800 }}>
        <Flex $justify="space-between" $align="flex-start" style={{ marginBottom: 20 }}>
          <div>
            <Flex $gap="8px" style={{ marginBottom: 8 }}>
              <Badge $color={
                post.category === "공지" ? "danger" :
                post.category === "질문" ? "info" :
                post.category === "공유" ? "success" : "gray"
              }>
                {post.category || "기타"}
              </Badge>
            </Flex>
            <Title>{post.title}</Title>
          </div>
        </Flex>

        <MetaRow>
          <Flex $gap="16px">
            <MetaItem>
              <span className="material-icons" style={{ fontSize: 16 }}>person</span>
              {post.author}
            </MetaItem>
            <MetaItem>
              <span className="material-icons" style={{ fontSize: 16 }}>calendar_today</span>
              {post.date}
            </MetaItem>
          </Flex>
        </MetaRow>

        <ContentArea>{post.content}</ContentArea>

        <Flex $justify="space-between" style={{ marginTop: 24 }}>
          <Button $variant="secondary" onClick={() => navigate("/board")}>
            <span className="material-icons" style={{ fontSize: 18 }}>arrow_back</span>
            목록으로
          </Button>
          <Button $variant="danger" $size="sm" onClick={handleDelete}>
            <span className="material-icons" style={{ fontSize: 16 }}>delete</span>
            삭제
          </Button>
        </Flex>
      </Card>
    </PageWrapper>
  );
};

// ── Styled ──

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${colors.text};
  line-height: 1.3;
`;

const MetaRow = styled.div`
  padding: 12px 0;
  border-top: 1px solid ${colors.border};
  border-bottom: 1px solid ${colors.border};
  margin-bottom: 24px;
`;

const MetaItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: ${colors.textSecondary};
`;

const ContentArea = styled.div`
  min-height: 200px;
  font-size: 0.95rem;
  line-height: 1.8;
  color: ${colors.text};
  white-space: pre-wrap;
`;

export default BoardDetail;
