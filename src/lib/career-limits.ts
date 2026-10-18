// 커리어 입력 한도.
// - 아래 *_MAX 는 입력 화면의 한도(maxLength·카운터) — 새로 쓰는 글에만 적용한다.
// - 서버는 이미 저장된 글을 절대 자르지 않는다(읽을 때 그대로). 저장 시에는 남용 방지용 TEXT_HARD_MAX 로만 막는다.
//   → 한도를 나중에 줄여도 예전에 쓴 긴 글이 사라지지 않는다.

export const TEXT_HARD_MAX = 4000;

export const NAME_MAX = 40;
export const HEADLINE_MAX = 60;
export const INTRO_MAX = 500;
export const CAREER_NOTE_MAX = 500; // 대략 10줄
export const PROJECT_DESC_MAX = 300;
export const MARK_NOTE_MAX = 20; // "합류", "출시", "개발 중"
export const PHOTO_CAPTION_MAX = 100;
export const PHOTOS_MAX = 10;
// nginx 기본 client_max_body_size(1MB) 안쪽. 브라우저에서 긴 변 1600px 로 줄여 올리면 보통 수백 KB.
export const PHOTO_BYTES_MAX = 900 * 1024;
export const PHOTO_LONG_EDGE = 1600;
