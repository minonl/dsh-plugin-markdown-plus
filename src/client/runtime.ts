/**
 * 惰性运行时装载 —— 首次需要时才从宿主供出的资产路径拉取引擎。
 *
 * 为什么用 `new Function` 间接调用动态 import：打包器无法静态分析该表达式，
 * 因此"运行时按需拉取一个外部 URL"的语义不会被打包格式（IIFE/ESM/CJS）改写。
 */
type Loader = (url: string) => Promise<unknown>;

const defaultLoader: Loader = (url) => {
  const dynamicImport = new Function('u', 'return import(u)') as Loader;
  return dynamicImport(url);
};

let loader: Loader = defaultLoader;
const pending = new Map<string, Promise<unknown>>();

/** 测试用：替换装载器。 */
export function setRuntimeLoaderForTesting(next: Loader | null): void {
  loader = next ?? defaultLoader;
  pending.clear();
}

/** 拉取并记忆运行时（同一 URL 只请求一次；失败不记忆，允许重试）。 */
export function loadRuntime(url: string): Promise<unknown> {
  const cached = pending.get(url);
  if (cached !== undefined) return cached;
  const request = loader(url).catch((error: unknown) => {
    pending.delete(url);
    throw error;
  });
  pending.set(url, request);
  return request;
}
