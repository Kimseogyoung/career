import { getProfileStore, getProjectStore, isStoreConfigured } from "@/lib/store/instance";
import type { CareerEntry, Project } from "@/lib/store/types";
import { CareerSubnav } from "../career-subnav";
import { ProjectsBoard } from "./projects-board";
import styles from "../career.module.css";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const configured = isStoreConfigured();
  let projects: Project[] = [];
  let career: CareerEntry[] = [];
  let stale = false;

  if (configured) {
    try {
      const [store, profileStore] = await Promise.all([getProjectStore(), getProfileStore()]);
      if (store) projects = await store.list();
      // 소속 회사 고르기용. 실패해도 프로젝트 화면은 뜬다(자동 추정만 안 됨).
      if (profileStore) career = (await profileStore.get().catch(() => null))?.career ?? [];
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.crumb}>커리어</div>
      <h1 className={styles.title}>프로젝트</h1>
      <p className={styles.lede}>
        성과를 묶는 단위입니다. 성과를 등록할 때 프로젝트를 고르면, 공개 Showcase에서 프로젝트별로
        묶여 보입니다.
      </p>

      <CareerSubnav />

      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      <ProjectsBoard initial={projects} career={career} />
    </main>
  );
}
