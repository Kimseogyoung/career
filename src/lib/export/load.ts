import "server-only";
import { currentYearMonth } from "@/lib/period";
import { getAchievementStore, getProfileStore, getProjectStore } from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Achievement, Project } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import { buildPortfolio, type PortfolioDoc, type PortfolioOptions } from "./portfolio";

// 내보내기 화면과 저장 API 가 같은 조립 결과를 쓰도록 한 곳에서 읽는다.
// 저장 API 는 클라이언트가 보낸 문서를 믿지 않고 서버에서 다시 조립한다.

export async function loadPortfolio(opts: PortfolioOptions): Promise<PortfolioDoc> {
  const [aStore, pStore, prStore] = await Promise.all([
    getAchievementStore(),
    getProjectStore(),
    getProfileStore(),
  ]);
  const [achievements, projects, profile] = await Promise.all([
    aStore ? aStore.list() : Promise.resolve([] as Achievement[]),
    pStore ? pStore.list() : Promise.resolve([] as Project[]),
    prStore ? prStore.get() : Promise.resolve(DEFAULT_PROFILE),
  ]);
  return buildPortfolio(achievements, projects, profile, currentYearMonth(todayKst()), opts);
}
