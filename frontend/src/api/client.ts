import createClient from 'openapi-fetch';
import type { paths } from './schema.gen';

/**
 * OpenAPI スキーマ (`openapi/openapi.yaml`) から生成された型を用いた API クライアント。
 *
 * 型定義は `pnpm run api:generate` で `src/api/schema.gen.ts` に生成する。
 * 生成物はコミット対象。手書きで触らないこと。
 */
export const apiClient = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
});
