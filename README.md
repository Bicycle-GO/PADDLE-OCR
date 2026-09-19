# Slideform Studio

AI로 만든 슬라이드 이미지에서 텍스트와 이미지 영역을 분리해 **편집 가능한 PPTX**로 만드는 웹앱 초안입니다. 실제로 사용할 수 있는 로컬 편집기와 PaddleOCR 서버 어댑터, 제품·기술 설계를 포함합니다.

상세 초안: [제품 및 개발 설계](docs/PRODUCT_DRAFT.md)

## 현재 구현된 기능

- 한국어 편집 작업 공간: 슬라이드 목록 / 원본·분리 결과 캔버스 / 요소 속성 패널
- PNG·JPEG·WEBP 여러 장, PDF 페이지별 불러오기
- 캔버스에서 텍스트·이미지 영역 직접 지정 및 이미지 자르기
- 텍스트·글꼴·크기·색상·정렬 수정, 드래그 이동, 모서리 크기 조절
- 좌표 직접 입력, 방향키 1px / Shift+방향키 10px 이동
- 요소 숨기기·잠금·삭제, 실행 취소·다시 실행, 슬라이드 순서 조정
- 검수 대기·완료 표시, 분리된 이미지 PNG 다운로드
- `.slideform.json` 프로젝트 저장 및 다시 불러오기
- 편집 가능한 PPTX 및 원본 이미지 PPTX 다운로드
- 16:9·4:3·첫 슬라이드 비율 지원; 다른 비율의 페이지는 여백으로 보존
- PaddleOCR PP-StructureV3 연결 어댑터; 엔진 미설치·실패 상태를 명시

## 실행

Node.js 20.19+ 또는 22.12+를 권장합니다. Python 서버는 3.11~3.12의 별도 가상환경을 권장합니다.

```powershell
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5173`을 엽니다. **OCR 서버 없이도** 샘플 편집, 파일 가져오기, 수동 분리와 PPTX 내보내기가 작동합니다.

### 경량 API 서버

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

이 설치만으로는 자동 OCR이 동작하지 않습니다. `/api/health`와 이미지 업로드 검증, 미설치 안내를 확인할 수 있습니다. 프런트엔드는 `/api` 요청을 `127.0.0.1:8001`로 전달합니다. 이미 사용 중인 8000 포트의 서비스는 건드리지 않도록 8001을 사용합니다.

### 실제 PaddleOCR 엔진 연결

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-ocr.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8001
```

설정에서 한국어+영어 / 영어 / 일본어를 선택한 뒤 ‘현재 슬라이드 분석’을 누릅니다. 첫 분석에는 모델 다운로드와 초기화 시간이 필요합니다. PaddlePaddle의 OS·Python·GPU별 설치 호환성은 [공식 설치 안내](https://www.paddlepaddle.org.cn/install/quick)를 먼저 확인하세요. GPU 설치는 CPU용 requirements를 그대로 사용하지 말고 해당 환경에 맞는 PaddlePaddle 패키지를 선택해야 합니다. `PADDLE_DEVICE` 기본값은 `cpu`입니다.

PP-StructureV3에서 문서 회전·왜곡 보정을 끄므로 반환 좌표와 캔버스 좌표가 동일한 기준을 사용합니다. 표·차트는 잘라낸 이미지로 보존하고, 그 안의 OCR 문구는 중복 텍스트로 추가하지 않습니다. 언어별 모델은 하나씩 유지하며 추론은 동시에 한 건만 허용합니다.

**현재 환경에서는 대용량 PaddleOCR 엔진/모델을 설치하지 않았으며, 실제 모델 추론은 미검증입니다.** 서버 입력 검증과 결과 정규화는 테스트했습니다.

## 초안의 정확한 범위

| 구분 | 현재 동작 | 후속 개발 |
|---|---|---|
| 텍스트 인식 | 연결 어댑터, 수동 수정 | 실제 자료 벤치마크, 문단·줄바꿈 병합 |
| 이미지 분리 | 사각형 영역 크롭 | 객체 윤곽 분리·투명 배경·겹친 객체 처리 |
| 글자 지우기 | 선택된 원래 영역을 주변 단색으로 채움 | 글자 단위 마스크와 인페인팅 |
| 글꼴 | 사용자가 지정, OCR 크기 추정 | 글꼴 후보·자간·회전 추정 |
| 표·차트 | 이미지 보존 | 네이티브 PowerPoint 표·차트 |
| 입력 | PNG/JPG/WEBP/PDF | 기존 PPTX 및 슬라이드 합본 이미지 자동 분할 |
| 저장 | 사용자가 프로젝트 파일로 저장 | 자동 저장, 서버 프로젝트, 작업 이력 |
| 보안·배포 | 로컬 단일 사용자 | 로그인·접근 제어·작업 큐·배포 환경 |

복잡한 배경 위 텍스트를 제거하면 단색 사각형 흔적이 남을 수 있습니다. ‘원본 이미지 PPTX’는 원본 모습을 보존하지만 편집 결과와 텍스트 객체는 포함하지 않습니다. ‘편집 가능한 PPTX’는 텍스트 상자와 이미지를 독립 객체로 저장하며 설치된 글꼴과 PowerPoint 렌더링에 따라 줄바꿈·글자 폭이 달라질 수 있습니다.

파일당 30MB, 프로젝트당 최대 30장을 지원합니다. 이미지는 긴 변 최대 2400px, PDF는 페이지의 긴 변 1920px로 변환합니다. 원본 파일 자체는 수정하지 않으며 편집 기준이 되는 변환 이미지를 프로젝트에 담습니다. 샘플의 신뢰도 값은 예시이며 OCR 측정 결과가 아닙니다. 브라우저 새로고침 전 **프로젝트 저장**을 눌러 작업을 보관하세요.

이미지는 기본적으로 브라우저 안에서 처리됩니다. 사용자가 분석을 요청한 현재 슬라이드만 로컬 OCR 서버로 전송하며 서버의 임시 이미지 파일은 추론 후 제거합니다. 모델 캐시는 PaddleOCR가 로컬에 보관합니다. UI 글꼴은 Google Fonts를 사용하며 인터넷 연결이 없으면 시스템 글꼴로 표시합니다.

## 검증

```powershell
npm test
npm run build
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
```

프런트엔드 테스트는 영역 경계, 슬라이드 비율 변환, 순서 변경, 검수 수, 프로젝트 검증을 확인합니다. Python 테스트는 이미지/언어 검증, 엔진 미설치 오류, 좌표 정규화, 차트 내 문구 중복 방지를 확인합니다. 실제 모델 추론 정확도와 데스크톱 PowerPoint 시각적 재현은 별도 검증 대상입니다.

프런트엔드와 경량 API 서버를 켠 상태에서 `npm run test:browser`를 실행하면 Edge로 업로드·편집·내보내기를 검증합니다. 실제 OCR 엔진이 없는 초안 환경을 기준으로 오류 안내까지 확인하는 테스트입니다. Edge가 없는 환경은 Playwright 브라우저를 준비하고 `BROWSER_CHANNEL`을 환경에 맞게 설정하세요. 결과는 Git에서 제외되는 `test-results/`에 생성됩니다.

검증 기록: [현재 초안 검증 결과](docs/VERIFICATION.md)

## 구조

```text
src/App.jsx         편집 UI와 프로젝트 작업 흐름
src/media.js        이미지·PDF 입력, 크롭, 배경 채우기, OCR 요청
src/model.js        레이어·좌표·비율 모델
src/export.js       PowerPoint 객체 및 다운로드
src/project.js      저장 프로젝트 유효성 검사
backend/app.py      로컬 API 및 PaddleOCR 연결
backend/normalize.py 결과 좌표·레이어 변환
docs/PRODUCT_DRAFT.md 제품·화면·분석 파이프라인·개발 우선순위
```

빌드 산출물은 `dist/`에 생성됩니다. `npm run preview`는 정적 프런트엔드 확인용이며 OCR 프록시는 개발 서버에만 설정되어 있습니다. 배포 시 `/api`를 Python 서버로 전달하는 역방향 프록시가 필요합니다. 현재 서버는 인증이 없으므로 로컬 주소에서 사용하는 초안입니다.
