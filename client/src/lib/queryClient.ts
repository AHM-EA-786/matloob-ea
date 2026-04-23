import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// In-memory auth token shared by apiRequest and query functions.
let _authToken: string | null = null;
let _on401: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}
export function getAuthToken(): string | null {
  return _authToken;
}
export function setOn401(handler: () => void) {
  _on401 = handler;
}

function buildHeaders(hasBody: boolean, isFormData = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody && !isFormData) headers["Content-Type"] = "application/json";
  if (_authToken) headers["Authorization"] = `Bearer ${_authToken}`;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let text = "";
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        text = json.message || JSON.stringify(json);
      } else {
        text = await res.text();
      }
    } catch {
      text = res.statusText;
    }
    if (res.status === 401 && _on401) _on401();
    const err = new Error(text || res.statusText) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const isFormData = data instanceof FormData;
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: buildHeaders(!!data, isFormData),
    body: data
      ? isFormData
        ? (data as FormData)
        : JSON.stringify(data)
      : undefined,
  });
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: buildHeaders(false),
    });
    if (unauthorizedBehavior === "returnNull" && res.status === 401) return null;
    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
