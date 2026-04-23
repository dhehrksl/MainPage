import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  PageWrapper, PageHeader, PageTitle, PageSubtitle,
  Card, Button, Input, Table, Badge, Flex, EmptyState, colors,
} from "../styles/theme";
import { fetchPosts } from "../api/client";

const CATEGORIES = ["전체", "공지", "질문", "공유", "기타"];

const Board = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [source, setSource] = useState("local");
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("전체");

  const reload = async () => {
    const { data, source } = await fetchPosts();
    setPosts(data);
    setSource(source);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const filtered = posts.filter((p) => {
    const matchCat = category === "전체" || p.category === category;
    const matchSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase())
      || (p.author || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  }).sort((a, b) => b.id - a.id);

  return (
    <PageWrapper>
      <PageHeader>
        <Flex $justify="space-between" $wrap>
          <div>
            <PageTitle>게시판</PageTitle>
            <PageSubtitle>QA팀 소통 및 정보 공유 공간</PageSubtitle>
          </div>
          <Flex $gap="10px">
            <SourceBadge $db={source === "db"}>
              <span className="material-icons" style={{ fontSize: 14 }}>
                {source === "db" ? "cloud_done" : "cloud_off"}
              </span>
              {source === "db" ? "DB 연결됨" : "로컬 모드"}
            </SourceBadge>
            <Button $variant="primary" onClick={() => navigate("/board/write")}>
              <span className="material-icons" style={{ fontSize: 18 }}>edit</span>
              글쓰기
            </Button>
          </Flex>
        </Flex>
      </PageHeader>

      {/* 필터 */}
      <Flex $justify="space-between" $wrap style={{ marginBottom: 16 }}>
        <Flex $gap="6px">
          {CATEGORIES.map((c) => (
            <CategoryBtn key={c} $active={category === c} onClick={() => setCategory(c)}>
              {c}
            </CategoryBtn>
          ))}
        </Flex>
        <Flex $gap="8px">
          <Input
            placeholder="제목 또는 작성자 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            $width="220px"
          />
          <Button $variant="secondary" onClick={reload} title="새로고침">
            <span className="material-icons" style={{ fontSize: 18 }}>refresh</span>
          </Button>
        </Flex>
      </Flex>

      <Card $padding="0">
        {filtered.length === 0 ? (
          <EmptyState>
            <span className="material-icons" style={{ fontSize: 48, color: colors.border }}>forum</span>
            <p>게시글이 없습니다</p>
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>번호</th>
                <th style={{ width: 80 }}>분류</th>
                <th>제목</th>
                <th style={{ width: 100 }}>작성자</th>
                <th style={{ width: 110 }}>날짜</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((post) => (
                <tr key={post.id}>
                  <td style={{ color: colors.textSecondary }}>{post.id}</td>
                  <td>
                    <Badge $color={post.category === "공지" ? "danger" : post.category === "질문" ? "info" : post.category === "공유" ? "success" : "gray"}>
                      {post.category || "기타"}
                    </Badge>
                  </td>
                  <td>
                    <PostLink to={`/board/${post.id}`}>{post.title}</PostLink>
                  </td>
                  <td>{post.author}</td>
                  <td style={{ color: colors.textSecondary, fontSize: "0.85rem" }}>{post.date}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageWrapper>
  );
};

// ── Styled ──

const SourceBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${(p) => (p.$db ? "#DCFCE7" : "#FEE2E2")};
  color: ${(p) => (p.$db ? "#166534" : "#991B1B")};
`;

const CategoryBtn = styled.button`
  padding: 6px 14px;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid ${(p) => (p.$active ? colors.primary : colors.border)};
  background: ${(p) => (p.$active ? colors.primaryLight : colors.bgCard)};
  color: ${(p) => (p.$active ? colors.primary : colors.textSecondary)};
  border-radius: 20px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;

  &:hover {
    border-color: ${colors.primary};
  }
`;

const PostLink = styled(Link)`
  font-weight: 500;
  color: ${colors.text};
  transition: color 0.15s;

  &:hover {
    color: ${colors.primary};
  }
`;

export default Board;
