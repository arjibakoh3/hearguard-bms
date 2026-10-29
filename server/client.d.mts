// The repository layer validates database DTOs with its existing Zod schemas.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type DatabaseUser = { id: string; email: string; user_metadata: Record<string, unknown> };
export type DatabaseError = { message: string; code?: string };
export type QueryResult = { data: any; error: DatabaseError | null; count: number | null };
type AuthResult = { data: { user: DatabaseUser | null }; error: DatabaseError | null };
type Auth = {
  getUser(): Promise<AuthResult>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  signOut(): Promise<{ error: DatabaseError | null }>;
};
declare class Query implements PromiseLike<QueryResult> {
  select(columns?: string, options?: { count?: "exact" }): this;
  insert(payload: object | object[]): this;
  update(payload: object): this;
  delete(): this;
  eq(column: string, value: unknown): this;
  neq(column: string, value: unknown): this;
  gte(column: string, value: unknown): this;
  lte(column: string, value: unknown): this;
  lt(column: string, value: unknown): this;
  in(column: string, values: unknown[]): this;
  is(column: string, value: null | boolean): this;
  or(expression: string): this;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this;
  limit(value: number): this;
  range(first: number, last: number): this;
  single(): this;
  maybeSingle(): this;
  execute(): Promise<QueryResult>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}
export class PostgresClient {
  constructor(user?: DatabaseUser | null, auth?: Partial<Auth>);
  user: DatabaseUser | null;
  auth: Auth;
  from(table: string): Query;
  rpc(name: string, parameters?: Record<string, unknown>): Promise<QueryResult>;
  storage: { from(bucket: string): {
    upload(path: string, bytes: Uint8Array, options?: { contentType?: string; upsert?: boolean }): Promise<QueryResult>;
    download(path: string): Promise<{ data: Blob | null; error: DatabaseError | null }>;
  } };
}
