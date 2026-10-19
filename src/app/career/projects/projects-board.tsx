"use client";

import { useRef, useState, type FormEvent } from "react";
import { MARK_NOTE_MAX, PHOTO_CAPTION_MAX, PHOTOS_MAX, PROJECT_DESC_MAX } from "@/lib/career-limits";
import { resolveCareer, suggestCareer } from "@/lib/career-link";
import {
  compareRecent,
  currentYearMonth,
  parseYearMonth,
  validatePeriod,
  type PeriodError,
} from "@/lib/period";
import { projectPeriodText as periodText } from "@/lib/project-period";
import type { CareerEntry, Project, ProjectEnd, ProjectMark, ProjectPhoto } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import { mediaUrl } from "@/app/showcase/types";
import { prepareImage } from "@/app/components/image-prep";
import styles from "../career.module.css";

type Editing = { mode: "new" } | { mode: "edit"; id: string } | null;

interface Input {
  name: string;
  description?: string;
  start?: ProjectMark;
  end?: ProjectEnd;
  careerId?: string; // "" = 자동
}

function careerLabel(c: CareerEntry): string {
  return [c.org, c.role].filter(Boolean).join(" · ") || "(이름 없는 경력)";
}

const PERIOD_MSG: Record<PeriodError, string> = {
  start_required: "시작 월을 입력하세요.",
  end_before_start: "종료 월이 시작 월보다 앞입니다.",
  future: "시작 월은 미래일 수 없습니다.",
};

const PHOTO_ERR: Record<string, string> = {
  too_many: `사진은 최대 ${PHOTOS_MAX}장입니다.`,
  too_large: "사진이 너무 큽니다.",
  unsupported: "지원하지 않는 형식입니다(JPG·PNG·WebP).",
  not_found: "프로젝트를 찾을 수 없습니다.",
};

function sortProjects(list: Project[]): Project[] {
  return [...list].sort(
    (a, b) =>
      compareRecent(
        { start: a.start?.date, end: a.end?.date, current: a.end?.ongoing },
        { start: b.start?.date, end: b.end?.date, current: b.end?.ongoing },
      ) || a.order - b.order,
  );
}

export function ProjectsBoard({ initial, career }: { initial: Project[]; career: CareerEntry[] }) {
  const now = currentYearMonth(todayKst());
  const [items, setItems] = useState<Project[]>(() => sortProjects(initial));
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingProject = editing?.mode === "edit" ? items.find((p) => p.id === editing.id) : undefined;

  function replace(p: Project) {
    setItems((prev) => sortProjects(prev.map((x) => (x.id === p.id ? p : x))));
  }

  async function save(input: Input) {
    setBusy(true);
    setError(null);
    try {
      const isEdit = editing?.mode === "edit";
      const res = await fetch(isEdit ? `/api/projects/${editing.id}` : "/api/projects", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { project?: Project };
      if (!res.ok || !body.project) {
        setError("저장에 실패했습니다.");
        return;
      }
      if (isEdit) {
        replace(body.project);
        setEditing(null);
      } else {
        setItems((prev) => sortProjects([...prev, body.project!]));
        // 새로 만든 프로젝트는 바로 편집 상태로 — 사진을 이어서 올릴 수 있게.
        setEditing({ mode: "edit", id: body.project.id });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Project) {
    const photos = p.photos?.length ? ` 사진 ${p.photos.length}장도 함께 지워집니다.` : "";
    if (!confirm(`'${p.name}' 프로젝트를 삭제할까요?${photos} (연결된 성과는 '미지정'으로 남습니다)`)) return;
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    if (editing?.mode === "edit" && editing.id === p.id) setEditing(null);
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className={styles.sec}>
      <div className={styles.secHead}>
        <h2>프로젝트</h2>
        <span className={styles.n}>{items.length}개 · 최신순</span>
        <span className={styles.headRight}>
          {!editing ? (
            <button type="button" className={styles.addBtn} onClick={() => setEditing({ mode: "new" })}>
              + 새 프로젝트
            </button>
          ) : null}
        </span>
      </div>

      {editing ? (
        <ProjectForm
          key={editing.mode === "edit" ? editing.id : "new"}
          initial={editingProject}
          career={career}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
          onPhotosChange={replace}
        />
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {items.length === 0 && !editing ? (
        <p className={styles.empty}>아직 프로젝트가 없습니다. “새 프로젝트”로 추가하세요.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((p) => (
            <li key={p.id} className={styles.item}>
              <div className={styles.ibody}>
                <div className={styles.ihead}>
                  <span className={styles.itemTitle}>{p.name}</span>
                  {periodText(p) ? <span className={styles.period}>{periodText(p)}</span> : null}
                </div>
                {(() => {
                  const r = resolveCareer(p, career, now);
                  return r ? (
                    <div className={styles.srcs}>
                      {r.entry.org || careerLabel(r.entry)}
                      {r.auto ? " (기간으로 추정)" : ""}
                    </div>
                  ) : null;
                })()}
                {p.period && !p.start?.date ? (
                  <p className={styles.warn}>기간을 날짜로 옮기지 못했습니다 — 수정에서 시작·종료를 지정해 주세요.</p>
                ) : null}
                {p.description ? <div className={styles.pdesc}>{p.description}</div> : null}
                {p.photos?.length ? (
                  <div className={styles.thumbRow}>
                    {p.photos.slice(0, 5).map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph.id} src={mediaUrl(p.id, ph.id)} alt={ph.caption || p.name} loading="lazy" />
                    ))}
                    {p.photos.length > 5 ? <span className={styles.srcs}>+{p.photos.length - 5}</span> : null}
                  </div>
                ) : null}
                <div className={styles.imeta}>
                  <span className={styles.iacts}>
                    <button type="button" className={styles.mini} onClick={() => setEditing({ mode: "edit", id: p.id })}>
                      수정
                    </button>
                    <button type="button" className={styles.mini} onClick={() => remove(p)}>
                      삭제
                    </button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectForm({
  initial,
  career,
  busy,
  onCancel,
  onSave,
  onPhotosChange,
}: {
  initial?: Project;
  career: CareerEntry[];
  busy: boolean;
  onCancel: () => void;
  onSave: (input: Input) => void | Promise<void>;
  onPhotosChange: (p: Project) => void;
}) {
  const now = currentYearMonth(todayKst());
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [start, setStart] = useState(initial?.start?.date ?? "");
  const [startNote, setStartNote] = useState(initial?.start?.note ?? "");
  const [endMode, setEndMode] = useState<"ongoing" | "date">(
    initial?.end && !initial.end.ongoing ? "date" : "ongoing",
  );
  const [end, setEnd] = useState(initial?.end?.date ?? "");
  const [endNote, setEndNote] = useState(initial?.end?.note ?? (initial ? "" : "개발 중"));
  const [careerId, setCareerId] = useState(
    initial?.careerId && career.some((c) => c.id === initial.careerId) ? initial.careerId : "",
  );
  const suggested = suggestCareer(
    {
      start: { date: parseYearMonth(start) ?? undefined },
      end: endMode === "ongoing" ? { ongoing: true } : { date: parseYearMonth(end) ?? undefined },
    },
    career,
    now,
  );

  const err = validatePeriod(
    {
      start: parseYearMonth(start),
      end: endMode === "date" ? parseYearMonth(end) : null,
      current: endMode === "ongoing",
    },
    now,
    { allowFutureEnd: true }, // "출시 예정" 같은 미래 종료는 허용
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || err) return;
    void onSave({
      name,
      description,
      start: { date: parseYearMonth(start) ?? undefined, note: startNote },
      end:
        endMode === "ongoing"
          ? { ongoing: true, note: endNote }
          : { date: parseYearMonth(end) ?? undefined, note: endNote },
      careerId,
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.fTitle}
        placeholder="프로젝트명 (필수)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <textarea
        className={styles.fArea}
        rows={2}
        maxLength={PROJECT_DESC_MAX}
        placeholder="한 줄 소개 (선택)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className={styles.fhint}>시작</div>
      <div className={styles.periodRow}>
        <label className={styles.periodField}>
          <span>월</span>
          <input type="month" className={styles.fTech} max={now} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className={styles.periodField}>
          <span>코멘트 (선택)</span>
          <input
            className={styles.fTech}
            maxLength={MARK_NOTE_MAX}
            placeholder="예: 합류"
            value={startNote}
            onChange={(e) => setStartNote(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.fhint}>종료</div>
      <div className={styles.periodRow}>
        <div className={styles.seg2} role="radiogroup" aria-label="종료 상태">
          <button
            type="button"
            role="radio"
            aria-checked={endMode === "ongoing"}
            onClick={() => {
              setEndMode("ongoing");
              if (!endNote) setEndNote("개발 중");
            }}
          >
            진행 중
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={endMode === "date"}
            onClick={() => {
              setEndMode("date");
              if (endNote === "개발 중") setEndNote("");
            }}
          >
            날짜
          </button>
        </div>
        {endMode === "date" ? (
          <label className={styles.periodField}>
            <span>월</span>
            <input type="month" className={styles.fTech} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        ) : null}
        <label className={styles.periodField}>
          <span>코멘트 (선택)</span>
          <input
            className={styles.fTech}
            maxLength={MARK_NOTE_MAX}
            placeholder={endMode === "ongoing" ? "예: 개발 중 · 서비스 중" : "예: 출시"}
            value={endNote}
            onChange={(e) => setEndNote(e.target.value)}
          />
        </label>
      </div>
      {err ? <p className={styles.warn}>{PERIOD_MSG[err]}</p> : null}

      <div className={styles.fhint}>소속 회사 — 경력기술서·포트폴리오에서 회사별로 묶을 때 씁니다</div>
      {career.length ? (
        <select className={styles.fTech} value={careerId} onChange={(e) => setCareerId(e.target.value)}>
          <option value="">
            자동 (기간으로 추정{suggested ? `: ${suggested.org || careerLabel(suggested)}` : " — 겹치는 경력 없음"})
          </option>
          {career.map((c) => (
            <option key={c.id} value={c.id}>
              {careerLabel(c)}
            </option>
          ))}
        </select>
      ) : (
        <p className={styles.fhint}>내 정보 탭에 경력을 넣으면 고를 수 있습니다.</p>
      )}

      {initial ? (
        <PhotoManager project={initial} onChange={onPhotosChange} />
      ) : (
        <p className={styles.fhint}>사진은 프로젝트를 저장한 뒤 올릴 수 있습니다.</p>
      )}

      <div className={styles.formActions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
          {initial ? "닫기" : "취소"}
        </button>
        <button type="submit" className={styles.saveBtn} disabled={busy || !name.trim() || Boolean(err)}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

/** 사진 관리. 추가·삭제·순서·설명은 버튼을 누르는 즉시 저장된다(폼의 "저장"과 별개). */
function PhotoManager({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const photos = project.photos ?? [];
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function patchPhotos(next: ProjectPhoto[]) {
    onChange({ ...project, photos: next }); // 낙관적 반영
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: next.map((p) => ({ id: p.id, caption: p.caption ?? "" })) }),
    });
    const body = (await res.json().catch(() => ({}))) as { project?: Project };
    if (res.ok && body.project) onChange(body.project);
    else {
      onChange(project); // 되돌림
      setErr("사진 정보를 저장하지 못했습니다.");
    }
  }

  async function upload(files: FileList) {
    setErr(null);
    let current = project;
    const room = PHOTOS_MAX - (current.photos?.length ?? 0);
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > list.length) setErr(`사진은 최대 ${PHOTOS_MAX}장입니다. 일부만 올립니다.`);
    for (const [i, file] of list.entries()) {
      setUploading(`${i + 1} / ${list.length} 올리는 중…`);
      try {
        const img = await prepareImage(file);
        const res = await fetch(`/api/projects/${project.id}/photos?w=${img.width}&h=${img.height}`, {
          method: "POST",
          headers: { "Content-Type": img.blob.type },
          body: img.blob,
        });
        const body = (await res.json().catch(() => ({}))) as { photo?: ProjectPhoto; error?: string };
        if (!res.ok || !body.photo) {
          setErr(`${file.name}: ${PHOTO_ERR[body.error ?? ""] ?? "올리지 못했습니다."}`);
          continue;
        }
        current = { ...current, photos: [...(current.photos ?? []), body.photo] };
        onChange(current);
      } catch (e) {
        setErr(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removePhoto(ph: ProjectPhoto) {
    if (!confirm("이 사진을 삭제할까요?")) return;
    onChange({ ...project, photos: photos.filter((x) => x.id !== ph.id) });
    const res = await fetch(`/api/projects/${project.id}/photos/${ph.id}`, { method: "DELETE" });
    if (!res.ok) {
      onChange(project);
      setErr("사진을 삭제하지 못했습니다.");
    }
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j]!, next[i]!];
    void patchPhotos(next);
  }

  return (
    <div>
      <div className={styles.fhint}>
        사진 {photos.length} / {PHOTOS_MAX} · 첫 장이 대표 · 바로 저장됨 · 긴 변 1600px로 줄이고 위치정보(EXIF)를 지운 뒤 올립니다
      </div>
      <div className={styles.photoGrid}>
        {photos.map((ph, i) => (
          <div key={ph.id} className={styles.photoCell}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(project.id, ph.id)} alt={ph.caption || `${project.name} 사진 ${i + 1}`} />
            {i === 0 ? <span className={styles.photoBadge}>대표</span> : null}
            <div className={styles.photoBtns}>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="앞으로">
                ←
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="뒤로">
                →
              </button>
              <button type="button" onClick={() => removePhoto(ph)} aria-label="삭제">
                ✕
              </button>
            </div>
            <input
              className={styles.photoCaption}
              placeholder="설명 (선택)"
              maxLength={PHOTO_CAPTION_MAX}
              defaultValue={ph.caption ?? ""}
              onBlur={(e) => {
                const caption = e.target.value.trim();
                if (caption !== (ph.caption ?? "")) {
                  void patchPhotos(photos.map((x) => (x.id === ph.id ? { ...x, caption: caption || undefined } : x)));
                }
              }}
            />
          </div>
        ))}
        {photos.length < PHOTOS_MAX ? (
          <label className={styles.photoAdd}>
            {uploading ?? "+ 사진 추가"}
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              hidden
              disabled={Boolean(uploading)}
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </label>
        ) : null}
      </div>
      {err ? <p className={styles.warn}>{err}</p> : null}
    </div>
  );
}
