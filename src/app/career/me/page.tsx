import { getProfileStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Profile } from "@/lib/store/types";
import { ProfileForm } from "./profile-form";
import styles from "../career.module.css";

export const dynamic = "force-dynamic";

export default async function MyInfoPage() {
  const configured = isStoreConfigured();
  let profile: Profile = DEFAULT_PROFILE;
  let stale = false;

  if (configured) {
    try {
      const store = await getProfileStore();
      if (store) profile = await store.get();
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>내 정보</h1>
      <p className={styles.lede}>
        공개 Showcase 홈을 채우는 정보입니다. 소개 → 기술 스택 → 경력 순으로 노출됩니다.
      </p>

      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      <ProfileForm initial={profile} />
    </main>
  );
}
