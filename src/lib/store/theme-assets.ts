import "server-only";
import {
  MAX_THEME_ASSETS,
  THEME_BYTES_MAX,
  dropUnknownAssets,
  isThemeAssetId,
  type ThemeAsset,
} from "@/lib/themes";
import type { GitHubStore } from "./github";
import { cacheDelete, cacheGet, cacheSet, detectImage } from "./media";
import type { SettingsStore } from "./settings";
import { ulid } from "./ulid";

// 테마 이미지(ADR-019). 파일은 career-db `meta/theme/<id>.<ext>`, 목록은 settings.json 의 themeAssets.
// 프로젝트 사진(ADR-015)과 같은 규칙: 브라우저에서 줄여 올리고, 형식은 바이트 시그니처로만 판별,
// 쓰기 큐를 거치지 않고 원격에 바로 쓴다(기록이 아니므로 실패하면 그냥 실패를 알린다).

export class ThemeAssetError extends Error {
  constructor(public readonly code: "not_found" | "too_many" | "too_large" | "unsupported") {
    super(code);
  }
}

export function themeAssetPath(a: Pick<ThemeAsset, "id" | "ext">): string {
  if (!isThemeAssetId(a.id)) throw new Error("잘못된 이미지 id");
  return `meta/theme/${a.id}.${a.ext}`;
}

export class ThemeAssetStore {
  constructor(
    private readonly github: GitHubStore,
    private readonly settings: SettingsStore,
  ) {}

  async list(): Promise<ThemeAsset[]> {
    return (await this.settings.get()).themeAssets ?? [];
  }

  /** 이미지 추가. 파일을 먼저 올리고 목록에 등록한다. 등록이 실패하면 올린 파일을 지운다. */
  async add(
    bytes: Uint8Array,
    meta: { width: number; height: number; lum: number },
  ): Promise<ThemeAsset> {
    if ((await this.list()).length >= MAX_THEME_ASSETS) throw new ThemeAssetError("too_many");
    if (bytes.length === 0 || bytes.length > THEME_BYTES_MAX)
      throw new ThemeAssetError("too_large");
    const ext = detectImage(bytes);
    if (!ext) throw new ThemeAssetError("unsupported");

    const asset: ThemeAsset = {
      id: ulid(),
      ext,
      width: clampDim(meta.width),
      height: clampDim(meta.height),
      bytes: bytes.length,
      lum: Number.isFinite(meta.lum) ? Math.min(1, Math.max(0, meta.lum)) : 0.5,
    };
    const path = themeAssetPath(asset);
    await this.github.writeBytes(path, bytes, undefined, "테마 이미지 추가");
    try {
      const cur = await this.list();
      if (cur.length >= MAX_THEME_ASSETS) throw new ThemeAssetError("too_many");
      await this.settings.update({ themeAssets: [...cur, asset] });
    } catch (e) {
      await this.github.remove(path, "테마 이미지 추가 취소").catch(() => {});
      throw e;
    }
    cacheSet(path, bytes);
    return asset;
  }

  /** 삭제. 이 이미지를 쓰던 내 테마 칸은 바탕 테마 그림으로 되돌린다. */
  async remove(id: string): Promise<boolean> {
    const s = await this.settings.get();
    const asset = (s.themeAssets ?? []).find((a) => a.id === id);
    if (!asset) return false;
    const left = (s.themeAssets ?? []).filter((a) => a.id !== id);
    await this.settings.update({
      themeAssets: left,
      themes: dropUnknownAssets(s.themes ?? [], new Set(left.map((a) => a.id))),
    });
    const path = themeAssetPath(asset);
    cacheDelete(path);
    await this.github.remove(path, "테마 이미지 삭제").catch(() => {});
    return true;
  }

  /** 등록된 이미지만 읽는다(임의 경로 읽기 방지). 없으면 null. */
  async read(id: string): Promise<{ asset: ThemeAsset; bytes: Uint8Array } | null> {
    if (!isThemeAssetId(id)) return null;
    const asset = (await this.list()).find((a) => a.id === id);
    if (!asset) return null;
    const path = themeAssetPath(asset);
    const cached = cacheGet(path);
    if (cached) return { asset, bytes: cached };
    const bytes = await this.github.readBytes(path);
    if (!bytes) return null;
    cacheSet(path, bytes);
    return { asset, bytes };
  }
}

function clampDim(n: number): number {
  return Number.isFinite(n) ? Math.min(10000, Math.max(1, Math.round(n))) : 1;
}
