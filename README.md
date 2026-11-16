# 복불복

여럿이(2~10명) 폰 하나를 돌려 가며 하는 복불복 게임 모음. 설치형 웹앱(PWA)이라 빌드 과정이 없다.

| 게임 | 방식 |
| --- | --- |
| 사다리 타기 | 각자 출발 자리를 고르면 사다리와 결과가 만들어지고, 한 명씩 내려간다 |
| 룰렛 | 참가자 이름이 적힌 판을 돌려 화살표에 멈춘 사람이 당첨 |

홈 화면에서 참가자 이름을 정하고 게임을 고른다. 한 판에 한 명이 당첨된다. 참가자 목록은 폰에 저장된다.

## 폰에 설치

1. GitHub 저장소 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 저장
2. 폰 크롬에서 `https://bluelevel.github.io/ai-game-studio/` 열기
3. 메뉴(⋮) → **홈 화면에 추가** (또는 **앱 설치**)

한 번 열어 두면 오프라인에서도 실행된다.

## 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 구조

- `index.html`, `style.css`, `app.js` — 화면과 게임 전부
- `sw.js`, `manifest.webmanifest`, `icons/` — 설치·오프라인용
