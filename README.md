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

- `index.html`: 콘솔 화면, 작품·활동 대시보드·제작 기록·프로필
- `assets/console.css`, `assets/console.js`: 반응형 스타일과 탐색, 검색, KR/EN
- `assets/projects.js`: 기존 18개 프로젝트의 설명과 링크
- `assets/dashboard.js`, `assets/activity-data.js`: 실제 공개 GitHub 기여 캘린더 스냅샷과 프로젝트 현황
- `assets/documents.css`, `assets/documents.js`: 15개 아키텍처 문서의 공통 테마·목차·본문 높이 연동
- `assets/experience.css`, `assets/session-ui.js`: 본문 가독성, 프로필 펄스, 탭 세션당 한 번 표시하는 접속 토스트
- `resume.html`, `language.js`: 이력서 내용과 번역
- `core/`, `ax/`, `study/`: 기존 아키텍처 문서

홈은 선택한 작품의 이미지가 배경 전체를 채우는 콘솔 형식입니다. 상단 커버는 SUPER POP! → Whale Getaway → HamsThor → Mega Road → Larva → White Paradise 순서로 표시합니다. 커버에 마우스를 올리거나 클릭하면 작품이 바뀌며, 배경은 크로스페이드하고 제목과 버튼은 함께 전환됩니다.

- 방향키 / Home / End: 작품 탐색. Enter 또는 더블클릭: 배경을 유지하며 홈에 작품 설명 펼치기. Esc: 라이브러리·설명 닫기, 다른 화면에서는 홈으로 돌아가기.
- 모바일: 작품 목록을 가로로 스와이프하고 커버를 탭해서 선택합니다.
- 라이브러리 버튼: 작품 배경 위에 기존 18개 프로젝트의 검색·필터 화면을 엽니다. 작품을 선택하면 홈에서 설명을 바로 보여 줍니다.
- 상단 음표 버튼: 선택·실행 효과음 켜기/끄기. 기본값은 꺼짐입니다.
- 전체 화면 버튼: 지원 브라우저에서 전체 화면 전환.
- 움직임 줄이기 설정을 존중하고, 배경의 미세한 포인터 반응은 터치에서는 사용하지 않습니다.

홈 설명은 `#library/p0-2`, 제작 기록은 `#notes/p0-2`처럼 프로젝트별 주소를 가지며, 새로고침과 브라우저 뒤로 가기를 지원합니다. 홈 설명의 ‘제작 기록에서 자세히 읽기’ 또는 상단 제작 기록 메뉴에서 위키 아카이브로 이동합니다. 아카이브는 상세 팝업을 거치지 않고 같은 화면에서 프로젝트를 전환합니다. 기존 문서 URL도 그대로 동작하며 공통 콘솔 테마를 사용합니다. 본문은 각 원본 HTML 파일 한 곳에서 관리하며 콘솔 안에서는 높이가 자동 조정되는 문서 뷰어로 표시합니다. 기존 itch.io 게임 링크는 활동 화면과 해당 프로젝트에 남아 있습니다.

## 활동 데이터 갱신

```powershell
python tools/update_activity.py
```

GitHub의 공개 기여 캘린더를 읽어 `assets/activity-data.js`를 갱신합니다. 토큰이나 외부 프록시가 필요하지 않습니다. 데이터 구조가 달라지거나 요청이 실패하면 기존 파일을 덮어쓰지 않습니다. 갱신한 파일을 배포해야 공개 사이트에도 반영됩니다. 자동 스케줄이나 실시간 API는 설정하지 않았습니다.

대시보드에는 수집 날짜와 원본 링크를 표시합니다. ‘최근 30일’은 스냅샷 마지막 날짜 기준이며 기여에는 커밋 외 활동도 포함됩니다. 프로젝트·문서·공개 게임 수는 프로젝트 데이터에서 계산합니다. 총 방문자나 실제 플레이 인원은 집계 데이터가 없어 표시하지 않습니다. 기존 브라우저별 방문 횟수를 전체 방문자 수로 사용하지 않습니다.

새 콘솔 UI에는 외부 JavaScript 프레임워크가 필요하지 않습니다. Google Fonts가 차단되어도 시스템 글꼴로 표시됩니다. 이력서와 아키텍처 문서는 기존 Tailwind CDN 등을 사용합니다. 기존 방문 알림은 유지하며 localhost 미리보기에서는 실행하지 않습니다.
