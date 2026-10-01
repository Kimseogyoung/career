// 월 데이터 메모리 캐시. 캐시는 진실의 원천이 아니다(원격이 정본). 재시작 시 소멸한다.
// 외부 캐시 서버(Redis 등)를 쓰지 않는 이유는 ADR-005 참조.

/** 접근 순서 기반 LRU. 상한을 넘으면 가장 오래 안 쓴 항목을 버린다. */
export class LruCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly limit: number) {
    if (limit < 1) throw new Error("LRU 상한은 1 이상이어야 합니다.");
  }

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // 접근한 항목을 가장 최근으로 이동(Map 은 삽입 순서를 유지한다).
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  get size(): number {
    return this.map.size;
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}
