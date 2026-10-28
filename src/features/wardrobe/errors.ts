export class WardrobeError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export function wardrobeErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'conflict': return '다른 곳에서 이 옷을 수정했습니다. 입력 내용은 유지했어요. 최신 정보를 확인한 뒤 다시 시도해 주세요.';
    case 'item_unavailable': return '삭제되었거나 접근할 수 없는 옷입니다. 내 옷장과 휴지통에서 확인해 주세요.';
    case 'session_changed': return '로그인 상태가 변경됐습니다. 다시 로그인한 뒤 확인해 주세요.';
    case '23503': return '분류 정보를 확인한 뒤 다시 저장해 주세요.';
    case '23514': case '22003': case '22007': case '22008': return '입력값을 확인한 뒤 다시 저장해 주세요.';
    case 'duplicate_request': return '같은 요청으로 저장된 항목이 있습니다. 옷장 목록에서 먼저 확인해 주세요.';
    case '42501': case 'PGRST301': return '접근 권한을 확인하지 못했습니다. 로그인 상태를 확인해 주세요.';
    default: return '요청을 완료하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.';
  }
}
