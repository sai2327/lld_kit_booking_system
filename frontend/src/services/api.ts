export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'CLUB_MEMBER' | 'COORDINATOR';
  clubId?: string | null;
  club?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface KitItem {
  id: string;
  type: 'CAMERA' | 'MIC' | 'TRIPOD';
  serialNumber: string;
  state: 'AVAILABLE' | 'CHECKED_OUT' | 'RETURNED_PENDING_INSPECTION' | 'DAMAGED' | 'MISSING' | 'REPLACED';
  conditionNote?: string | null;
}

export interface Booking {
  id: string;
  kitId: string;
  clubId: string;
  start: string;
  end: string;
  status: 'RESERVED' | 'AT_RISK' | 'CHECKED_OUT' | 'RETURNED_PENDING_INSPECTION' | 'COMPLETED' | 'CANCELLED';
  riskReasons: string;
  checkedOutAt?: string | null;
  returnedAt?: string | null;
  club: {
    id?: string;
    name: string;
    code: string;
  };
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface Disruption {
  id: string;
  sourceBookingId: string;
  affectedBookingId: string;
  affectedItemIds: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
  sourceBooking: { club: { name: string } };
  affectedBooking: { club: { name: string }; start: string };
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  bookingId?: string | null;
}

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.error || `HTTP ${response.status}: Request failed`;
    const err = new Error(errorMsg) as Error & { code?: string; status?: number; details?: any };
    err.code = data.code;
    err.status = response.status;
    err.details = data.details;
    throw err;
  }

  return data as T;
}

export const api = {
  // Auth
  login: (email: string, passwordPlain: string) =>
    request<{ user: UserProfile; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: passwordPlain }),
    }),

  register: (email: string, passwordPlain: string, name: string, clubId?: string) =>
    request<{ user: UserProfile; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password: passwordPlain, name, clubId }),
    }),

  getMe: () => request<{ user: UserProfile }>('/auth/me'),

  // Bookings
  checkAvailability: (kitId: string, start: string, end: string) =>
    request<{
      available: boolean;
      conflictingBookings: { id: string; start: string; end: string; status: string }[];
    }>(`/bookings/availability?kitId=${kitId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),

  listBookings: (filters: { kitId?: string; clubId?: string; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.kitId) params.append('kitId', filters.kitId);
    if (filters.clubId) params.append('clubId', filters.clubId);
    if (filters.status) params.append('status', filters.status);
    return request<Booking[]>(`/bookings?${params.toString()}`);
  },

  getBooking: (id: string) => request<Booking>(`/bookings/${id}`),

  createBooking: (kitId: string, start: string, end: string, clubId?: string) =>
    request<Booking>('/bookings', {
      method: 'POST',
      body: JSON.stringify({ kitId, start, end, clubId }),
    }),

  cancelBooking: (id: string) =>
    request<{ message: string; booking: Booking }>(`/bookings/${id}/cancel`, {
      method: 'POST',
    }),

  // Equipment & Disruptions
  getSharedKit: () =>
    request<{
      kit: { id: string; name: string; description?: string; items: KitItem[] };
      isReadyForHandover: boolean;
      openDisruptions: Disruption[];
    }>('/equipment/kit'),

  getKitStatus: (kitId?: string) =>
    request<{
      kit: { id: string; name: string; description?: string; items: KitItem[] };
      isReadyForHandover: boolean;
      openDisruptions: Disruption[];
    }>(kitId ? `/equipment/kit/${kitId}` : '/equipment/kit'),

  listDisruptions: () => request<Disruption[]>('/equipment/disruptions'),

  checkout: (bookingId: string, itemConditions: Record<string, 'USABLE' | 'DAMAGED' | 'MISSING'>) =>
    request<any>('/equipment/checkout', {
      method: 'POST',
      body: JSON.stringify({ bookingId, itemConditions }),
    }),

  returnAndInspect: (
    bookingId: string,
    observations: Record<
      string,
      {
        returned: boolean;
        condition: 'USABLE' | 'DAMAGED' | 'MISSING';
        result: 'PASS' | 'DAMAGED' | 'MISSING';
        note?: string;
      }
    >
  ) =>
    request<any>('/equipment/return', {
      method: 'POST',
      body: JSON.stringify({ bookingId, observations }),
    }),

  recoverItem: (
    disruptionId: string,
    itemId: string,
    inspectionResult: 'PASS' | 'DAMAGED' | 'MISSING',
    note?: string
  ) =>
    request<any>('/equipment/recover', {
      method: 'POST',
      body: JSON.stringify({ disruptionId, itemId, inspectionResult, note }),
    }),

  replaceItem: (
    disruptionId: string,
    oldItemId: string,
    serialNumber: string,
    conditionNote: string,
    initialInspectionResult: 'PASS' | 'DAMAGED'
  ) =>
    request<any>('/equipment/replace', {
      method: 'POST',
      body: JSON.stringify({
        disruptionId,
        oldItemId,
        serialNumber,
        conditionNote,
        initialInspectionResult,
      }),
    }),

  // Notifications
  getNotifications: () => request<NotificationItem[]>('/notifications'),
  markNotificationRead: (id: string) =>
    request<NotificationItem>(`/notifications/${id}/read`, { method: 'PUT' }),
};
