export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = parseApiError(payload);
    if (response.status === 401 && window.location.pathname !== "/login") {
      window.location.assign("/login?reason=session-expired");
    }
    throw new ApiError(
      error.message,
      response.status,
      error.code,
      error.details,
    );
  }

  return payload as T;
}

function parseApiError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null
  ) {
    const error = payload.error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

    return {
      code: typeof error.code === "string" ? error.code : undefined,
      message:
        typeof error.message === "string" ? error.message : "Request failed",
      details: Array.isArray(error.details)
        ? (error.details as Array<{ field: string; message: string }>)
        : undefined,
    };
  }

  return { code: undefined, message: "Request failed", details: undefined };
}

const errorMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED:
    "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  ROOM_HAS_ACTIVE_OCCUPANTS:
    "Phòng vẫn còn người ở. Hãy xử lý lần thuê trước khi đổi trạng thái.",
  ROOM_CAPACITY_EXCEEDED: "Phòng đích đã đủ người.",
  TARGET_ROOM_UNAVAILABLE:
    "Phòng đích không còn khả dụng. Vui lòng chọn phòng khác.",
  REPRESENTATIVE_CANNOT_LEAVE:
    "Hãy đổi người đại diện trước khi chuyển hoặc cho người này rời phòng.",
  REPRESENTATIVE_NOT_ACTIVE_COTENANT:
    "Người được chọn không còn là người ở chung trong phòng này.",
  READING_BELOW_PREVIOUS: "Chỉ số mới không được nhỏ hơn chỉ số cũ.",
  READING_BASELINE_CHANGED:
    "Chỉ số đầu kỳ đã thay đổi. Vui lòng tải lại dữ liệu và kiểm tra lại.",
  UTILITY_READING_ALREADY_FINALIZED: "Phòng đã có chỉ số được chốt cho kỳ này.",
  SETTLEMENT_ALREADY_FINALIZED: "Phòng đã được chốt tiền cho kỳ này.",
  INVOICE_PENDING:
    "Kỳ đã chốt nhưng hóa đơn chưa được tạo. Hãy bấm thử lại để hoàn tất.",
  IDEMPOTENCY_KEY_REUSED:
    "Yêu cầu này đã thay đổi sau lần gửi trước. Vui lòng thực hiện lại.",
  COMMAND_ALREADY_IN_PROGRESS:
    "Thao tác đang được xử lý. Vui lòng đợi một lúc rồi tải lại.",
  COMMAND_ACTION_REQUIRED: "Thao tác cần được kiểm tra lại trước khi tiếp tục.",
  PAYMENT_EXCEEDS_OUTSTANDING:
    "Số tiền thu không được lớn hơn số còn phải thu.",
  ALLOCATION_PREVIEW_STALE:
    "Công nợ đã thay đổi hoặc bản tạm tính đã hết hạn. Vui lòng xem phân bổ lại.",
  TENANCY_NOT_ACTIVE: "Lần thuê này không còn hoạt động.",
  RECEIPT_DATE_OUT_OF_RANGE:
    "Ngày thu phải nằm trong thời gian thuê và không được sau ngày hiện tại.",
  RECEIPT_PAYER_NOT_ACTIVE:
    "Người nộp không ở trong phòng tại thời điểm thu tiền.",
  FIFO_INVOICE_REQUIRED: "Khoản thu phải được trừ vào công nợ cũ nhất trước.",
  RECEIPT_ALREADY_VOIDED: "Lần thu này đã được hủy trước đó.",
  RECEIPT_REVERSAL_CONFLICT:
    "Không thể hủy an toàn vì tiền đã được sử dụng ở giao dịch khác. Vui lòng đối soát.",
  CREDIT_BALANCE_CONFLICT:
    "Số dư trả trước vừa thay đổi. Vui lòng tải lại và thử lại.",
  PREPAID_INPUT_DEPRECATED:
    "Không nhập trả trước thủ công. Hãy ghi nhận bằng chức năng Thu tiền.",
};

export function messageFor(error: unknown, fallback = "Có lỗi xảy ra") {
  if (error instanceof ApiError) {
    return (error.code && errorMessages[error.code]) || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
