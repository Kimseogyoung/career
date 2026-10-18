import { isMediaId, CONTENT_TYPE } from "@/lib/store/media";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

/**
 * 공개 프로젝트 사진. /showcase 하위라 로그인 없이 열린다(ADR-013·015).
 * 프로젝트에 등록된 사진만 내보낸다 — 임의의 레포 파일을 이 경로로 읽을 수 없다.
 * photoId 는 내용이 바뀌면 새로 발급되므로 브라우저·프록시에 1년 불변 캐시.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string; photoId: string }> },
) {
  const { projectId, photoId } = await ctx.params;
  if (!isMediaId(projectId) || !isMediaId(photoId) || !isStoreConfigured()) {
    return new Response("not found", { status: 404 });
  }
  try {
    const store = await getProjectStore();
    const found = store ? await store.readPhoto(projectId, photoId) : null;
    if (!found) return new Response("not found", { status: 404 });
    return new Response(Buffer.from(found.bytes), {
      headers: {
        "Content-Type": CONTENT_TYPE[found.photo.ext],
        "Content-Length": String(found.bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
