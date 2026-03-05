# news.cocy.io — AI 뉴스 포털

## 개요
AI가 매일 수집·요약한 뉴스를 보기 좋게 정리한 정적 뉴스 사이트.
GitHub Pages로 호스팅 (news.cocy.io).

## 디자인 컨셉
- 깔끔한 뉴스 포털 UI (다크/라이트 모드)
- 카드 기반 레이아웃 (모바일 반응형)
- 카테고리 필터: AI/테크, 국내, 해외, 경제
- 날짜별 아카이브 네비게이션
- 최소한의 의존성 (vanilla HTML/CSS/JS, 빌드 없음)

## 구조
```
news/
├── index.html          # 메인 페이지 (최신 뉴스)
├── style.css           # 공통 스타일
├── script.js           # 카테고리 필터, 다크모드, 동적 로딩
├── articles/           # 날짜별 뉴스 디렉토리
│   └── 2026-03-06.json # 해당일 뉴스 데이터
├── archive.html        # 아카이브 (날짜별 목록)
├── icon.svg            # 사이트 아이콘
├── manifest.json       # PWA manifest
└── CNAME               # news.cocy.io
```

## articles/YYYY-MM-DD.json 형식
```json
{
  "date": "2026-03-06",
  "articles": [
    {
      "id": "1",
      "title": "뉴스 제목",
      "summary": "3-5줄 요약",
      "category": "ai-tech",
      "source": "출처명",
      "sourceUrl": "https://...",
      "publishedAt": "2026-03-06T09:00:00+09:00"
    }
  ]
}
```

## 카테고리
- `ai-tech`: AI/테크
- `domestic`: 국내
- `world`: 해외  
- `economy`: 경제

## 디자인 요구사항
- 헤더: "cocy news" 로고 + 날짜 + 다크모드 토글
- 카테고리 탭 (전체/AI·테크/국내/해외/경제)
- 뉴스 카드: 카테고리 뱃지 + 제목 + 요약 + 출처 + 시간
- 푸터: "Powered by AI · cocy.io" + 링크
- 색상: 뉴스 사이트답게 깔끔한 화이트/다크 테마
- 폰트: Pretendard (한글) + 시스템 폰트 폴백
- 🤖 로봇 이모지 쓰지 말 것

## 기능
1. index.html: 오늘 날짜의 JSON 자동 로드
2. 카테고리 필터 (클라이언트 사이드)
3. 날짜 이동 (← 어제 / 오늘 → 내일)
4. 다크/라이트 모드 (localStorage 저장)
5. archive.html: 전체 날짜 목록 (articles/ 디렉토리 기반)
6. 반응형 (모바일 320px ~ 데스크탑 1200px)
7. SEO 기본 (meta description, og tags)

## 메타 3종세트 적용
1. GTM: GTM-MV8KQGJF (head + body)
2. SEO: description, keywords, OG, Twitter Card, canonical, JSON-LD
3. AdSense: GTM 자동광고 주석만

## 샘플 데이터
articles/2026-03-06.json에 5개 샘플 뉴스를 넣어서 바로 볼 수 있게 할 것.
카테고리별 1-2개씩 배분.

## CNAME
`news.cocy.io`

## 배포
git push → GitHub Pages 자동 배포
