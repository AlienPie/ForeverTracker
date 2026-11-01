export type ApiMeta = {
  build: string;
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
  client?: string;
  attribution: string;
};

export type ApiResponse<T> = { data: T; meta: ApiMeta };

export type Page<T> = {
  items: T[];
  offset: number;
  total: number;
  nextOffset: number | null;
  build: string;
};

export type Query = Record<string, string | number | boolean>;

export interface ForeverDbClient {
  get<T>(path: string, query?: Query): Promise<ApiResponse<T>>;
  pages<T>(
    path: string,
    opts?: { query?: Query; startOffset?: number; limit?: number },
  ): AsyncGenerator<Page<T>>;
}

export interface ForeverDbClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  perMinute?: number;
  dailyReserve?: number;
}
