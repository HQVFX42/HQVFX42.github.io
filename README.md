# INHO PLAY — HQVFX42.github.io

장인호의 게임·콘텐츠 크리에이터 포트폴리오. HTML / CSS / JavaScript로 만든 정적 사이트이며 빌드나 npm 설치 없이 GitHub Pages에서 동작합니다.

## Push 없이 미리보기

Windows에서 루트 폴더의 배치파일을 더블클릭하세요. Python 3가 필요합니다.

- **`preview-start.bat`**: 백그라운드 서버를 시작하고 브라우저를 엽니다. 실행 중이면 기존 서버를 재사용합니다.
- **`preview-stop.bat`**: 이 저장소의 미리보기 서버만 종료합니다. 다른 서버나 Python 프로세스는 종료하지 않습니다.
- `preview.cmd`: 시작 배치파일의 호환용 바로가기입니다.

또는 저장소 폴더에서 실행하세요.

```powershell
python tools/preview.py
```

- 새 화면: http://localhost:4173
- 기존 이력서: http://localhost:4173/resume.html
- 수정 후 브라우저를 새로고침하면 반영됩니다. 로컬 서버는 캐시를 사용하지 않습니다.
- 종료: `preview-stop.bat` 또는 `python tools/preview.py --stop`. 상태 확인: `python tools/preview.py --status`.
- 다른 프로그램이 포트를 사용 중이면 `python tools/preview.py --port 4174`로 시작하고 `python tools/preview.py --stop --port 4174`로 종료합니다.
- 실행 정보와 로그는 OS 임시 폴더에 저장하며 저장소에는 생성하지 않습니다.
- 서버는 이 컴퓨터의 loopback 주소에서만 접근할 수 있습니다. 휴대폰에서 확인하려면 브라우저 개발자 도구의 모바일 미리보기를 사용하세요.

## 구성

- `index.html`: 콘솔 화면, 작품·플레이룸·기록·프로필
- `assets/console.css`, `assets/console.js`: 반응형 스타일과 탐색, 검색, KR/EN
- `assets/projects.js`: 기존 18개 프로젝트의 설명과 링크
- `assets/orbit.js`: 이 포폴을 위해 추가한 Orbit Dash 브라우저 미니게임
- `resume.html`, `language.js`: 기존 이력서 화면과 번역
- `core/`, `ax/`, `study/`: 기존 아키텍처 문서

홈은 선택한 작품의 이미지가 배경 전체를 채우는 콘솔 형식입니다. 상단 커버에 마우스를 올리거나 클릭하면 작품이 바뀌며, 배경은 크로스페이드하고 제목과 버튼은 함께 전환됩니다.

- 방향키 / Home / End: 작품 탐색. Enter 또는 더블클릭: 상세 보기. Esc: 창 닫기, 다른 화면에서는 홈으로 돌아가기.
- 모바일: 작품 목록을 가로로 스와이프하고 커버를 탭해서 선택합니다.
- 라이브러리 버튼: 기존 18개 프로젝트의 검색·필터 화면을 엽니다.
- 상단 음표 버튼: 선택·실행 효과음 켜기/끄기. 기본값은 꺼짐입니다.
- 전체 화면 버튼: 지원 브라우저에서 전체 화면 전환.
- 움직임 줄이기 설정을 존중하고, 배경의 미세한 포인터 반응은 터치에서는 사용하지 않습니다.

Orbit Dash는 방향키 / A·D / 터치 드래그로 이동합니다. P 또는 일시정지 버튼으로 쉬어갈 수 있으며, 탭을 벗어나면 자동으로 일시정지됩니다. 최고 점수는 해당 브라우저에만 저장됩니다. 기존 itch.io 게임은 새 탭에서 열립니다.

새 콘솔 UI에는 외부 JavaScript 프레임워크가 필요하지 않습니다. Google Fonts가 차단되어도 시스템 글꼴로 표시됩니다. 기존 이력서는 기존 Tailwind CDN 등을 사용합니다. 기존 방문 알림은 유지하며 localhost 미리보기에서는 실행하지 않습니다.
