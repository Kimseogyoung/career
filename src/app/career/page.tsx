import { getAchievementStore, isStoreConfigured } from "@/lib/store/instance";
import { canGenerate } from "@/lib/summary/summarizer";
import { todayKst } from "@/lib/time";
import type { Achievement } from "@/lib/store/types";
import { CareerBoard } from "./career-board";
import styles from "./career.module.css";

export const dynamic = "force-dynamic";

export default async function CareerPage() {
  const configured = isStoreConfigured();
  let achievements: Achievement[] = [];
  let stale = false;

  if (configured) {
    try {
      const store = await getAchievementStore();
      if (store) achievements = await store.list();
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.crumb}>커리어</div>
      <h1 className={styles.title}>성과 모음</h1>
      <p className={styles.lede}>
        업무 일지에서 성과를 뽑아 모읍니다. 성과는 한 줄로도, 상세(문제→접근→결과+기술)로도 둘 수
        있고, 상세는 뽑아낼 수 있을 때만 채웁니다. ⭐는 이력서·포트폴리오 후보.
      </p>

      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      <CareerBoard initial={achievements} canGenerate={canGenerate()} today={todayKst()} />
    </main>
  );
}
