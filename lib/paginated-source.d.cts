export function collectPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>, options?: { pageSize?: number; maxRows?: number }): Promise<T[]>;
