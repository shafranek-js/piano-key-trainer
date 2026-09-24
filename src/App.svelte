<script lang="ts">
  import { onMount } from 'svelte';
  import './ui/styles/app.css';

  // Core & Audio
  import { AudioEngine } from './audio/AudioEngine';
  import { MidiController, type MidiNoteOnEvent, type MidiNoteOffEvent } from './audio/MidiController';
  import { MetronomeClock } from './audio/MetronomeClock';
  import {
    DEFAULT_SETTINGS,
    NATURAL_NOTES,
    ALL_NOTES,
    DISPLAY_NAMES,
    SHORT_NAMES,
    STAFF_HINTS,
    SOUND_HINTS,
    LANDMARK_HINTS
  } from './core/fsrs/constants';
  import { applyFsrsReview, retrievability, isMastered } from './core/fsrs/fsrs6';
  import { determineGrade } from './core/fsrs/latencyGrading';
  import {
    chooseDue,
    chooseNew,
    choosePractice,
    buildColdQueue,
    chooseConfusionPractice
  } from './core/scheduler/queue';
  import { getCurriculumPhases, baseNoteReady } from './core/curriculum/curriculum';
  import type { Card, Grade, NoteName, ReviewKind, ReviewLogEvent, Skill, UserSettings } from './core/fsrs/types';

  // Curriculum & Modes Data
  import { LESSONS, HAND_POSITIONS, type LessonDef, type LessonStep } from './core/lessons/lessonsData';
  import {
    REPERTOIRE,
    TEMPO_MODES,
    DYNAMIC_MODES,
    ARTICULATION_MODES,
    type SongDef
  } from './core/repertoire/repertoireData';
  import { TWO_HAND_PATTERNS, TWO_HAND_TEMPO, type TwoHandPatternDef } from './core/twohand/twoHandData';
  import {
    INTERVALS,
    TRIADS,
    playIntervalSequence,
    playTriadSequence,
    type IntervalDef,
    type TriadDef
  } from './core/ear/earTrainingData';

  // Storage
  import { db, type ColdTestRecord, type LessonProgressRecord } from './storage/db';
  import { checkAndMigrateLocalStorage } from './storage/migrator';

  // Components
  import TopNav from './ui/components/TopNav.svelte';
  import Keyboard from './ui/components/Keyboard.svelte';
  import TaskStage from './ui/components/TaskStage.svelte';
  import SettingsDrawer from './ui/components/SettingsDrawer.svelte';
  import InspectorRail from './ui/components/InspectorRail.svelte';
  import Staff from './ui/components/Staff.svelte';
  import SessionStrip from './ui/components/SessionStrip.svelte';
  import SessionSummaryModal from './ui/components/SessionSummaryModal.svelte';
  import LessonBanner from './ui/components/LessonBanner.svelte';
  import SongBanner from './ui/components/SongBanner.svelte';
  import TwoHandBanner from './ui/components/TwoHandBanner.svelte';

  // Views
  import LessonsView from './ui/views/LessonsView.svelte';
  import RepertoireView from './ui/views/RepertoireView.svelte';
  import TwoHandView from './ui/views/TwoHandView.svelte';
  import ProgressView from './ui/views/ProgressView.svelte';
  import AnalyticsView from './ui/views/AnalyticsView.svelte';
  import CurriculumView from './ui/views/CurriculumView.svelte';
  import DiagnosticsView from './ui/views/DiagnosticsView.svelte';
  import CalibrationView from './ui/views/CalibrationView.svelte';

  // App Navigation & Settings
  let activePage = $state('practice');
  let practiceActivity = $state<'standard' | 'lesson' | 'repertoire' | 'twohand' | 'earIntervals' | 'earTriads'>('standard');

  const SETTINGS_STORAGE_KEY = 'piano-trainer-settings';

  function getInitialSettings(): UserSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    } catch (_) {}
    return { ...DEFAULT_SETTINGS };
  }

  const initialSettings = getInitialSettings();
  let settings = $state<UserSettings>(initialSettings);

  function persistSettings(patch: Partial<UserSettings>) {
    settings = { ...settings, ...patch };
    const snapshot = $state.snapshot(settings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('Failed to save settings to localStorage', e);
    }
    db.settings.put({ key: 'userSettings', value: snapshot }).catch((err) => {
      console.warn('Failed to save settings to IndexedDB', err);
    });
  }

  async function exportProfileData() {
    try {
      const cardsList = await db.cards.toArray();
      const logsList = await db.reviewLogs.toArray();
      const coldList = await db.coldTests.toArray();
      const progressList = await db.lessonProgress.toArray();
      const backup = {
        app: 'piano-key-trainer',
        version: '6.2.0',
        exportedAt: new Date().toISOString(),
        settings: $state.snapshot(settings),
        cards: cardsList,
        reviewLogs: logsList,
        coldTests: coldList,
        lessonProgress: progressList
      };
      const jsonStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `piano-key-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Ошибка при экспорте данных: ' + e);
    }
  }

  async function importProfileData(file: File) {
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || typeof backup !== 'object') {
        alert('Неверный формат файла резервной копии.');
        return;
      }
      if (backup.settings) {
        persistSettings(backup.settings);
      }
      if (Array.isArray(backup.cards) && backup.cards.length) {
        await db.cards.clear();
        await db.cards.bulkPut(backup.cards);
        cards = backup.cards;
      }
      if (Array.isArray(backup.reviewLogs)) {
        await db.reviewLogs.clear();
        await db.reviewLogs.bulkPut(backup.reviewLogs);
        reviewLogs = backup.reviewLogs;
      }
      if (Array.isArray(backup.coldTests)) {
        await db.coldTests.clear();
        await db.coldTests.bulkPut(backup.coldTests);
        coldTests = backup.coldTests;
      }
      if (Array.isArray(backup.lessonProgress)) {
        await db.lessonProgress.clear();
        await db.lessonProgress.bulkPut(backup.lessonProgress);
        lessonProgressMap = new Map(backup.lessonProgress.map((p: any) => [p.id, p]));
      }
      alert('Данные профиля успешно восстановлены из резервной копии!');
      nextRound();
    } catch (e) {
      console.error('Import failed:', e);
      alert('Ошибка при чтении файла резервной копии: ' + e);
    }
  }

  let cards = $state<Card[]>([]);
  let reviewLogs = $state<ReviewLogEvent[]>([]);
  let coldTests = $state<ColdTestRecord[]>([]);
  let lessonProgressMap = $state<Map<string, LessonProgressRecord>>(new Map());

  // Hardware status
  let audioStatus = $state('Инициализация…');
  let audioReady = $state(false);
  let midiStatus = $state('Не подключено');
  let midiReady = $state(false);

  // Drawers & Modals
  let isSettingsOpen = $state(false);
  let isContextOpen = $state(false);
  let isSessionSummaryOpen = $state(false);

  // Session State
  type SessionPreset = 'quick' | 'normal' | 'due' | 'cold';
  let sessionPreset = $state<SessionPreset>(initialSettings.sessionPreset || 'normal');
  let currentNow = $state(Date.now());
  let sessionStartedAt = $state(Date.now());
  let sessionEndsAt = $state<number | null>(Date.now() + ((initialSettings.sessionPreset === 'quick') ? 3 : 8) * 60 * 1000);
  let isSessionEnded = $state(false);
  let sessionTrials = $state(0);
  let sessionScore = $state(0);
  let sessionStreak = $state(0);
  let sessionResponseTimes = $state<number[]>([]);
  let sessionScheduledReviews = $state(0);
  let sessionNewReviews = $state(0);
  let sessionConfusionReviews = $state(0);
  let sessionLapses = $state(0);
  let lastConfusionTrial = $state(-99);

  // Cold Test Queue
  let coldQueue = $state<string[]>([]);
  let coldIndex = $state(0);

  // Active Standard Practice Round State
  let currentCard = $state<Card | null>(null);
  let currentKind = $state<ReviewKind>('practice');
  let targetKeyId = $state<string | null>(null);
  let shownPerfMs = $state(0);
  let firstResponseRecorded = $state(false);
  let attempts = $state(0);
  let hintUsed = $state(false);
  let isCompleted = $state(false);
  let isLocked = $state(false);
  let reactionElapsedMs = $state(0);
  let reactionStatus = $state('калибровка');
  let reactionClass = $state('');
  let feedbackText = $state('');
  let feedbackClass = $state('');
  let autoAdvanceCountdown = $state<number | null>(null);
  let autoAdvanceTimer: number | null = null;
  let autoAdvanceInterval: number | null = null;
  let recentCards = $state<Card[]>([]);
  let sessionIntroducedNotes = $state<Set<NoteName>>(new Set());
  let reactionTimer: number | null = null;
  let sessionClockInterval: number | null = null;

  // Active Visual Keys on Keyboard
  let targetKeyIds = $state<string[]>([]);
  let correctKeyIds = $state<string[]>([]);
  let wrongKeyIds = $state<string[]>([]);
  let hintKeyIds = $state<string[]>([]);
  let pulseCorrectKeyIds = $state<string[]>([]);
  let pulseWrongAnswerNotes = $state<NoteName[]>([]);
  let pulseCorrectAnswerNotes = $state<NoteName[]>([]);
  let staffPulseGuide = $state(false);
  let midiActiveKeyIds = $state<string[]>([]);
  let twoHandLeftTarget = $state<string | null>(null);
  let twoHandRightTarget = $state<string | null>(null);
  let fingerGuides = $state<Map<string, { finger: number; isTarget: boolean }>>(new Map());

  // Active Guided Lesson State
  let activeLesson = $state<{ id: string; stepIndex: number } | null>(null);
  let lessonCanContinue = $state(false);
  let lessonContinueLabel = $state('Продолжить');

  // Active Repertoire State
  let activeRepertoire = $state<{
    id: string;
    index: number;
    mistakes: number;
    startedPerf: number;
    bpm: number | null;
    displayMode: 'keys' | 'staff';
    countingIn: boolean;
    countInValue: number;
    lastCorrectPerf: number | null;
    timingErrors: number[];
    timingWithin: number;
    timingCount: number;
    dynamicsHits: number;
    dynamicsCount: number;
    velocities: number[];
    articulationHits: number;
    articulationCount: number;
    articulationRatios: number[];
    heldMidi: Map<string, { noteIndex: number; onPerf: number; expectedMs: number }>;
    awaitingRelease: boolean;
    lastExpressionText: string;
    completed: boolean;
  } | null>(null);
  let repertoireCountInTimer: number | null = null;
  let metronome: MetronomeClock | null = null;

  // Active Two-Hand State
  let activeTwoHand = $state<{
    id: string;
    index: number;
    mistakes: number;
    startedPerf: number;
    bpm: number | null;
    lastStepPerf: number | null;
    timingCount: number;
    timingWithin: number;
    timingErrors: number[];
    coordinationCount: number;
    coordinationHits: number;
    pending: Map<string, number>;
    mousePending: Set<string>;
    mouseAnchorUntil: number;
    completed: boolean;
  } | null>(null);

  // Active Ear Training State (Direction 5)
  let activeEarInterval = $state<{
    item: IntervalDef;
    referenceKeyId: string;
    answered: boolean;
  } | null>(null);
  let activeEarTriad = $state<{
    item: TriadDef;
    type: 'major' | 'minor';
    answered: boolean;
  } | null>(null);

  // Derived state
  const cardsMap = $derived(new Map(cards.map(c => [c.id, c])));
  const dueCount = $derived(cards.filter(c => c.reps > 0 && c.dueAt <= Date.now()).length);
  const newCount = $derived(cards.filter(c => c.reps === 0).length);
  const masteredCount = $derived(cards.filter(isMastered).length);
  const learningCount = $derived(cards.filter(c => c.reps > 0 && !isMastered(c)).length);

  const curriculumPhasesList = $derived(
    getCurriculumPhases(
      'white',
      (skill, note) => cardsMap.get(`${skill}:${note}`) || createFreshCard(skill, note),
      reviewLogs
    )
  );

  // Session Strip calculations
  const sessionStatusLabel = $derived.by(() => {
    if (sessionPreset === 'cold') {
      return `Cold Test · ${Math.min(coldIndex, 20)}/20`;
    }
    if (sessionPreset === 'due') {
      return `Все повторы · due ${dueCount}`;
    }
    if (sessionEndsAt) {
      const remaining = Math.max(0, sessionEndsAt - currentNow);
      if (remaining <= 0) return `${sessionPreset === 'quick' ? 'Быстрая' : 'Обычная'} · время вышло`;
      return `${sessionPreset === 'quick' ? 'Быстрая' : 'Обычная'} · ${formatClock(remaining)} осталось`;
    }
    return 'Обычная · 8 мин';
  });

  const sessionDetailLabel = $derived.by(() => {
    const acc = sessionTrials ? `${Math.round((sessionScore / sessionTrials) * 100)}%` : '—';
    const med = quantile(sessionResponseTimes, 0.5);
    return `${sessionTrials} заданий · точность ${acc}${med != null ? ` · медиана ${formatResponseMs(med)}` : ''}`;
  });

  const sessionProgressPct = $derived.by(() => {
    if (sessionPreset === 'cold') {
      return Math.round((Math.min(coldIndex, 20) / 20) * 100);
    }
    if (sessionPreset === 'due') {
      return dueCount === 0 ? 100 : Math.min(100, Math.round((sessionScore / Math.max(1, dueCount + sessionScore)) * 100));
    }
    if (sessionEndsAt) {
      const durationMs = (sessionPreset === 'quick' ? 3 : 8) * 60 * 1000;
      const remaining = Math.max(0, sessionEndsAt - currentNow);
      return Math.min(100, Math.max(0, (remaining / durationMs) * 100));
    }
    return 100;
  });

  // Session Summary Data
  let sessionSummaryData = $state({
    leadText: 'Сессия завершена.',
    duration: '—',
    trials: 0,
    accuracy: '—',
    medianLatency: '—',
    scheduledLabel: 'Scheduled',
    scheduledValue: '0',
    newLabel: 'Новых',
    newValue: '0',
    weakSummary: 'Ошибок нет.'
  });

  function quantile(values: number[], q: number): number | null {
    if (!values.length) return null;
    const a = values.slice().sort((x, y) => x - y);
    const pos = (a.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return a[base + 1] !== undefined ? a[base] + rest * (a[base + 1] - a[base]) : a[base];
  }

  function formatResponseMs(ms: number | null): string {
    if (!Number.isFinite(ms) || ms == null) return '—';
    if (ms < 1000) return `${Math.round(ms)} мс`;
    return `${(ms / 1000).toFixed(1).replace('.', ',')} с`;
  }

  function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function formatSessionDuration(ms: number): string {
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return `${sec} сек`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m} мин ${s} сек` : `${m} мин`;
  }

  function createFreshCard(skill: Skill, note: NoteName): Card {
    return {
      id: `${skill}:${note}`,
      skill,
      note,
      memoryState: 'new',
      stability: null,
      difficulty: null,
      dueAt: 0,
      lastReviewAt: 0,
      firstSeenAt: 0,
      reps: 0,
      lapses: 0,
      lastGrade: null,
      stats: {
        trials: 0,
        firstCorrect: 0,
        firstWrong: 0,
        hints: 0,
        recentScheduledSuccesses: 0,
        scheduledSuccesses: 0,
        practiceTrials: 0
      }
    };
  }

  async function loadData() {
    await checkAndMigrateLocalStorage();

    try {
      const storedSettings = await db.settings.get('userSettings');
      if (storedSettings?.value && typeof storedSettings.value === 'object') {
        settings = { ...DEFAULT_SETTINGS, ...settings, ...(storedSettings.value as Partial<UserSettings>) };
        if (settings.sessionPreset) sessionPreset = settings.sessionPreset as SessionPreset;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify($state.snapshot(settings)));
      } else {
        db.settings.put({ key: 'userSettings', value: $state.snapshot(settings) }).catch(console.warn);
      }
    } catch (err) {
      console.warn('Error loading settings from IndexedDB', err);
    }

    let storedCards = await db.cards.toArray();
    if (!storedCards.length) {
      const initialCards: Card[] = [];
      const skills: Skill[] = ['find', 'identify', 'patternIdentify', 'notationToKey', 'soundToKey'];
      for (const skill of skills) {
        for (const note of ALL_NOTES) {
          if (skill === 'patternIdentify' && !['C', 'F', 'E', 'B'].includes(note)) continue;
          if ((skill === 'notationToKey' || skill === 'soundToKey') && !NATURAL_NOTES.includes(note as any)) continue;
          initialCards.push(createFreshCard(skill, note));
        }
      }
      await db.cards.bulkPut(initialCards);
      storedCards = initialCards;
    }
    cards = storedCards;

    reviewLogs = await db.reviewLogs.toArray();
    coldTests = await db.coldTests.toArray();

    const storedLessons = await db.lessonProgress.toArray();
    lessonProgressMap = new Map(storedLessons.map(l => [l.id, l]));

    startLearningSession(sessionPreset);
    nextRound();
  }

  // Session Management
  function startLearningSession(preset: SessionPreset = 'normal') {
    sessionPreset = preset;
    persistSettings({ sessionPreset: preset });

    const now = Date.now();
    currentNow = now;
    sessionStartedAt = now;
    sessionEndsAt = (preset === 'quick') ? now + 3 * 60 * 1000 : (preset === 'normal') ? now + 8 * 60 * 1000 : null;
    isSessionEnded = false;
    isSessionSummaryOpen = false;

    sessionTrials = 0;
    sessionScore = 0;
    sessionStreak = 0;
    sessionResponseTimes = [];
    sessionScheduledReviews = 0;
    sessionNewReviews = 0;
    sessionConfusionReviews = 0;
    sessionLapses = 0;
    recentCards = [];
    sessionIntroducedNotes.clear();

    if (preset === 'cold') {
      coldQueue = buildColdQueue(cards, 20);
      coldIndex = 0;
    } else {
      coldQueue = [];
      coldIndex = 0;
    }

    if (sessionClockInterval != null) clearInterval(sessionClockInterval);
    sessionClockInterval = window.setInterval(() => {
      currentNow = Date.now();
      if (sessionEndsAt && currentNow >= sessionEndsAt && !isSessionEnded && practiceActivity === 'standard') {
        reactionStatus = 'время вышло · закончите вопрос';
      }
    }, 250);
  }

  function finishLearningSession(reason: 'manual' | 'expired' | 'cold_complete' = 'manual') {
    isSessionEnded = true;
    const endedAt = Date.now();
    const duration = endedAt - sessionStartedAt;
    const events = reviewLogs.filter(e => e.ts >= sessionStartedAt && e.ts <= endedAt);
    const acc = sessionTrials ? `${Math.round((sessionScore / sessionTrials) * 100)}%` : '—';
    const med = quantile(sessionResponseTimes, 0.5);
    const p75 = quantile(sessionResponseTimes, 0.75);

    let coldResult: ColdTestRecord | null = null;
    let prevCold = coldTests.length ? coldTests[coldTests.length - 1] : null;

    if (sessionPreset === 'cold' && (reason === 'cold_complete' || sessionTrials >= 20)) {
      coldResult = coldResultFromEvents(events, endedAt);
      db.coldTests.put(coldResult);
      coldTests = [...coldTests, coldResult];
    }

    let weakSummary = sessionWeakSummary(events);
    let leadText = reason === 'manual' ? 'Сессия остановлена вручную.' : 'Лимит времени сессии исчерпан.';

    if (sessionPreset === 'cold') {
      leadText = coldResult
        ? `Cold Test успешно завершён (20 заданий). Результаты не влияют на FSRS.`
        : 'Cold Test завершён досрочно; запись в историю не добавлена.';
      weakSummary = coldResult ? coldWeakSummary(coldResult) : 'Незавершённый Cold Test.';
    }

    sessionSummaryData = {
      leadText,
      duration: formatSessionDuration(duration),
      trials: sessionTrials,
      accuracy: acc,
      medianLatency: formatResponseMs(med),
      scheduledLabel: sessionPreset === 'cold' ? 'P75' : 'Scheduled',
      scheduledValue: sessionPreset === 'cold' ? formatResponseMs(p75) : String(sessionScheduledReviews),
      newLabel: sessionPreset === 'cold' ? 'Ошибок' : 'Новых',
      newValue: sessionPreset === 'cold' ? String(sessionTrials - sessionScore) : String(sessionNewReviews),
      weakSummary
    };

    isSessionSummaryOpen = true;
  }

  function coldResultFromEvents(events: ReviewLogEvent[], endedAt = Date.now()): ColdTestRecord {
    const times = events.filter(e => Number.isFinite(e.responseMs)).map(e => e.responseMs);
    const bySkill: Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }> = {};
    const byNote: Record<string, { n: number; correct: number; accuracy: number | null; median: number | null }> = {};
    const confusions: Record<string, number> = {};

    for (const e of events) {
      const s = bySkill[e.skill] || (bySkill[e.skill] = { n: 0, correct: 0, accuracy: null, median: null });
      s.n++;
      if (e.firstCorrect) s.correct++;

      const n = byNote[e.note] || (byNote[e.note] = { n: 0, correct: 0, accuracy: null, median: null });
      n.n++;
      if (e.firstCorrect) n.correct++;

      if (!e.firstCorrect && e.answer) {
        const k = `${e.note}→${e.answer}`;
        confusions[k] = (confusions[k] || 0) + 1;
      }
    }

    for (const [skillKey, x] of Object.entries(bySkill)) {
      const skillTimes = events.filter(e => e.skill === skillKey && Number.isFinite(e.responseMs)).map(e => e.responseMs);
      x.accuracy = x.n ? x.correct / x.n : null;
      x.median = quantile(skillTimes, 0.5);
    }
    for (const [noteKey, x] of Object.entries(byNote)) {
      const noteTimes = events.filter(e => e.note === noteKey && Number.isFinite(e.responseMs)).map(e => e.responseMs);
      x.accuracy = x.n ? x.correct / x.n : null;
      x.median = quantile(noteTimes, 0.5);
    }

    const correct = events.filter(e => e.firstCorrect).length;
    return {
      id: new Date(endedAt).toISOString(),
      ts: endedAt,
      n: events.length,
      correct,
      accuracy: events.length ? correct / events.length : null,
      medianMs: quantile(times, 0.5) || 0,
      p75Ms: quantile(times, 0.75) || 0,
      bySkill,
      byNote,
      confusions
    };
  }

  function sessionWeakSummary(events: ReviewLogEvent[]): string {
    if (!events.length) return 'Пока недостаточно данных для слабых мест.';
    const byNote = new Map<NoteName, { note: NoteName; n: number; wrong: number; times: number[] }>();
    for (const e of events) {
      if (!e.note) continue;
      const row = byNote.get(e.note) || { note: e.note, n: 0, wrong: 0, times: [] };
      row.n++;
      if (!e.firstCorrect) row.wrong++;
      if (Number.isFinite(e.responseMs)) row.times.push(e.responseMs);
      byNote.set(e.note, row);
    }
    const rows = [...byNote.values()].map(r => ({ ...r, median: quantile(r.times, 0.5) || 0 })).sort((a, b) => b.wrong - a.wrong || b.median - a.median);
    const problematic = rows.filter(r => r.wrong > 0).slice(0, 3);
    if (problematic.length) return 'На что обратить внимание: ' + problematic.map(r => `${SHORT_NAMES[r.note] || r.note} — ${r.wrong} ошиб. с 1-й попытки`).join(' · ');
    const slow = rows.filter(r => r.n >= 2).slice(0, 2);
    if (slow.length) return 'Ошибок первой попытки нет. Самые медленные сейчас: ' + slow.map(r => `${SHORT_NAMES[r.note] || r.note} · ${formatResponseMs(r.median)}`).join(' · ');
    return 'Ошибок первой попытки нет — отличная чистая сессия!';
  }

  function coldWeakSummary(result: ColdTestRecord): string {
    const conf = Object.entries(result.confusions || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (conf.length) return 'Путаницы: ' + conf.map(([k, v]) => `${k} ×${v}`).join(' · ');
    const notes = Object.entries(result.byNote || {}).map(([note, x]) => ({ note, ...x })).sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1) || (b.median || 0) - (a.median || 0)).slice(0, 3);
    return notes.length ? 'Самые трудные ноты: ' + notes.map(x => `${SHORT_NAMES[x.note as NoteName] || x.note} · ${Math.round((x.accuracy ?? 0) * 100)}%`).join(' · ') : 'Ошибок нет — идеальный результат!';
  }

  function startReactionTimer() {
    if (reactionTimer != null) clearInterval(reactionTimer);
    reactionElapsedMs = 0;
    shownPerfMs = performance.now();
    reactionTimer = window.setInterval(() => {
      if (firstResponseRecorded) {
        if (reactionTimer != null) clearInterval(reactionTimer);
        return;
      }
      reactionElapsedMs = Math.round(performance.now() - shownPerfMs);
    }, 100);
  }

  function stopReactionTimer() {
    if (reactionTimer != null) {
      clearInterval(reactionTimer);
      reactionTimer = null;
    }
  }

  function getExerciseHint(card: Card): string {
    if (card.skill === 'notationToKey') return STAFF_HINTS[card.note] || '';
    if (card.skill === 'soundToKey') return SOUND_HINTS[card.note] || '';
    return LANDMARK_HINTS[card.note] || '';
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer != null) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    if (autoAdvanceInterval != null) {
      clearInterval(autoAdvanceInterval);
      autoAdvanceInterval = null;
    }
    autoAdvanceCountdown = null;
  }

  function scheduleAutoAdvance(delaySeconds?: number) {
    clearAutoAdvance();
    const raw = delaySeconds !== undefined ? delaySeconds : settings?.autoAdvanceDelaySeconds;
    const num = Number(raw);
    const delaySec = (Number.isFinite(num) && num > 0) ? num : (raw === 0 ? 0 : 3.0);
    if (delaySec <= 0) return;

    autoAdvanceCountdown = delaySec;
    const startTime = performance.now();
    const totalMs = delaySec * 1000;

    autoAdvanceInterval = window.setInterval(() => {
      const elapsedMs = performance.now() - startTime;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      autoAdvanceCountdown = Math.round((remainingMs / 1000) * 10) / 10;
      if (remainingMs <= 0) {
        if (autoAdvanceInterval != null) {
          clearInterval(autoAdvanceInterval);
          autoAdvanceInterval = null;
        }
      }
    }, 100);

    autoAdvanceTimer = window.setTimeout(() => {
      clearAutoAdvance();
      nextRound();
    }, totalMs);
  }

  // Main Exercise Queue & Next Round
  function nextRound() {
    clearAutoAdvance();
    stopReactionTimer();
    isLocked = false;
    isCompleted = false;
    firstResponseRecorded = false;
    attempts = 0;
    hintUsed = false;
    feedbackText = '';
    feedbackClass = '';
    targetKeyIds = [];
    correctKeyIds = [];
    wrongKeyIds = [];
    hintKeyIds = [];
    pulseCorrectKeyIds = [];
    pulseWrongAnswerNotes = [];
    pulseCorrectAnswerNotes = [];
    staffPulseGuide = false;
    targetKeyId = null;

    if (practiceActivity === 'lesson') {
      renderLessonStep();
      return;
    }
    if (practiceActivity === 'repertoire') {
      renderRepertoireStep();
      return;
    }
    if (practiceActivity === 'twohand') {
      renderTwoHandStep();
      return;
    }
    if (practiceActivity === 'earIntervals') {
      renderEarIntervalStep();
      return;
    }
    if (practiceActivity === 'earTriads') {
      renderEarTriadStep();
      return;
    }

    // Check if timed session expired
    if (sessionEndsAt && Date.now() >= sessionEndsAt && sessionTrials > 0) {
      finishLearningSession('expired');
      return;
    }

    // Check if Cold Test is active
    if (sessionPreset === 'cold') {
      if (coldIndex >= 20 || coldIndex >= coldQueue.length) {
        finishLearningSession('cold_complete');
        return;
      }
      const cardId = coldQueue[coldIndex];
      const picked = cardsMap.get(cardId);
      if (!picked) {
        finishLearningSession('cold_complete');
        return;
      }
      currentCard = picked;
      currentKind = 'cold';
      setupCardVisuals(picked);
      startReactionTimer();
      return;
    }

    const now = Date.now();
    const levelFiltered = (settings.level === 'all')
      ? cards
      : cards.filter(c => NATURAL_NOTES.includes(c.note as any));

    const candidateCards = (settings.mode && settings.mode !== 'smart' && ['find', 'identify', 'pattern', 'notationToKey', 'soundToKey'].includes(settings.mode))
      ? levelFiltered.filter(c => c.skill === (settings.mode === 'pattern' ? 'patternIdentify' : settings.mode))
      : levelFiltered;
    let picked: Card | null = null;
    let kind: ReviewKind = 'practice';

    // 1. Scheduled due cards
    const due = chooseDue(candidateCards, now, recentCards);
    if (due) {
      picked = due;
      kind = 'scheduled';
    } else if (sessionPreset !== 'due') {
      // 2. New cards
      const fresh = chooseNew(
        candidateCards,
        sessionIntroducedNotes,
        settings.newPitchClassesPerSession,
        (n) => candidateCards.some(c => c.note === n && c.reps > 0),
        recentCards
      );
      if (fresh) {
        picked = fresh;
        kind = 'new';
      } else {
        // 3. Dynamic Contrast / Confusion Drill Injection
        const confusion = chooseConfusionPractice(
          candidateCards,
          reviewLogs,
          recentCards,
          lastConfusionTrial,
          sessionTrials,
          sessionConfusionReviews
        );
        if (confusion) {
          picked = confusion;
          kind = 'confusion';
          sessionConfusionReviews++;
          lastConfusionTrial = sessionTrials;
        } else {
          // 4. Free / reinforcement practice
          picked = choosePractice(candidateCards, now, recentCards);
          kind = 'practice';
        }
      }
    }

    if (!picked) return;

    currentCard = picked;
    currentKind = kind;
    recentCards = [picked, ...recentCards.slice(0, 3)];
    setupCardVisuals(picked);
    startReactionTimer();
  }

  function setupCardVisuals(picked: Card) {
    if (picked.skill === 'identify') {
      targetKeyId = `${picked.note}4`;
      targetKeyIds = [targetKeyId];
    } else if (picked.skill === 'notationToKey' || picked.skill === 'soundToKey') {
      if (picked.skill === 'notationToKey') {
        if (settings.notationClef === 'bass') {
          targetKeyId = `${picked.note}3`;
        } else if (settings.notationClef === 'grand') {
          targetKeyId = Math.random() < 0.5 ? `${picked.note}3` : `${picked.note}4`;
        } else {
          targetKeyId = `${picked.note}4`;
        }
      } else {
        targetKeyId = `${picked.note}4`;
      }
      if (picked.skill === 'soundToKey') {
        setTimeout(() => playSoundPrompt(), 200);
      }
    }
  }

  async function playSoundPrompt() {
    if (!targetKeyId) return;
    const engine = AudioEngine.getInstance();
    await engine.playPianoByKeyId('C4', 85);
    setTimeout(() => {
      engine.playPianoByKeyId(targetKeyId!, 96);
    }, 600);
  }

  function triggerErrorPulse(answerNote: NoteName, answerKeyId?: string) {
    if (!currentCard) return;
    const isExactKeySkill = currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey';

    if (answerKeyId) wrongKeyIds = [answerKeyId];
    if (currentCard.skill === 'identify' || currentCard.skill === 'patternIdentify') {
      pulseWrongAnswerNotes = [answerNote];
    }

    if (isExactKeySkill) {
      pulseCorrectKeyIds = [targetKeyId || `${currentCard.note}4`];
      staffPulseGuide = true;
    } else if (currentCard.skill === 'find' || currentCard.skill === 'patternIdentify') {
      pulseCorrectKeyIds = [currentCard.note];
    } else {
      pulseCorrectAnswerNotes = [currentCard.note];
      if (targetKeyId) pulseCorrectKeyIds = [targetKeyId];
    }

    setTimeout(() => {
      if (answerKeyId) wrongKeyIds = wrongKeyIds.filter(id => id !== answerKeyId);
      pulseWrongAnswerNotes = [];
    }, 850);

    setTimeout(() => {
      pulseCorrectKeyIds = [];
      pulseCorrectAnswerNotes = [];
      staffPulseGuide = false;
    }, 1400);
  }

  // Answer Submit for Standard Practice & Cold Test
  async function handleAnswerSubmit(answerNote: NoteName, answerKeyId?: string) {
    if (isLocked || !currentCard || isCompleted) return;

    const isExactKeySkill = currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey';
    const isCorrect = isExactKeySkill ? answerKeyId === targetKeyId : answerNote === currentCard.note;
    const isOctaveMismatch = isExactKeySkill && answerNote === currentCard.note && answerKeyId !== targetKeyId;

    // --- COLD TEST: 1 attempt only ---
    if (currentKind === 'cold') {
      firstResponseRecorded = true;
      stopReactionTimer();
      const responseMs = Math.round(performance.now() - shownPerfMs);
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      coldIndex++;

      if (isCorrect) {
        sessionScore++;
        feedbackText = `✓ ${formatResponseMs(responseMs)} · Cold Test: верно!`;
        feedbackClass = 'good';
        if (answerKeyId) correctKeyIds = [answerKeyId];
      } else {
        feedbackClass = 'bad';
        triggerErrorPulse(answerNote, answerKeyId);
        const correctLabel = targetKeyId ? `${DISPLAY_NAMES[currentCard.note]} (${targetKeyId})` : DISPLAY_NAMES[currentCard.note];
        feedbackText = `✗ Cold Test: ответ ${DISPLAY_NAMES[answerNote]}. Правильно: ${correctLabel}. FSRS не меняется.`;
      }

      isCompleted = true;
      isLocked = true;

      const logEvent: ReviewLogEvent = {
        ts: Date.now(),
        sessionId: 'cold-session',
        cardId: currentCard.id,
        note: currentCard.note,
        skill: currentCard.skill,
        kind: 'cold',
        grade: null,
        gradeName: null,
        firstCorrect: isCorrect,
        answer: answerNote,
        answerKeyId: answerKeyId || null,
        attempts: 1,
        hintUsed: false,
        responseMs,
        elapsedDays: null,
        retrievabilityBefore: retrievability(currentCard),
        stabilityBefore: currentCard.stability,
        stabilityAfter: currentCard.stability,
        difficultyBefore: currentCard.difficulty,
        difficultyAfter: currentCard.difficulty,
        scheduledDays: null
      };

      reviewLogs = [...reviewLogs, logEvent];
      db.reviewLogs.put(logEvent).catch(console.warn);

      scheduleAutoAdvance();
      return;
    }

    // --- FIRST ATTEMPT IN STANDARD / SMART PRACTICE ---
    if (!firstResponseRecorded) {
      firstResponseRecorded = true;
      attempts = 1;
      stopReactionTimer();
      const responseMs = Math.round(performance.now() - shownPerfMs);

      sessionTrials++;
      sessionResponseTimes.push(responseMs);

      if (isCorrect) {
        sessionScore++;
        sessionStreak++;
        feedbackText = `✓ Правильно · ${(responseMs / 1000).toFixed(1)} с`;
        feedbackClass = 'good';
        if (answerKeyId) correctKeyIds = [answerKeyId];
        isCompleted = true;
        isLocked = true;
        scheduleAutoAdvance();
      } else {
        sessionStreak = 0;
        sessionLapses++;
        feedbackClass = 'bad';
        triggerErrorPulse(answerNote, answerKeyId);

        const hint = getExerciseHint(currentCard);
        if (isOctaveMismatch) {
          feedbackText = `✗ Не та октава! Нота верная (${DISPLAY_NAMES[answerNote]}), но нажата ${answerKeyId}. Требуется ${targetKeyId} (${hint || 'найдите нужную октаву'}). Первая попытка засчитана как ошибка.`;
        } else {
          feedbackText = `✗ Ошибка. Это ${DISPLAY_NAMES[answerNote]}${answerKeyId ? ' (' + answerKeyId + ')' : ''}. Нужна ${DISPLAY_NAMES[currentCard.note]}${targetKeyId ? ' (' + targetKeyId + ')' : ''}. ${hint} Первая попытка засчитана как ошибка.`;
        }
      }

      let grade: Grade = isCorrect ? 3 : 1;
      const cardRef = currentCard;
      const kindRef = currentKind;

      if (kindRef === 'scheduled') sessionScheduledReviews++;
      if (kindRef === 'new') sessionNewReviews++;

      if (kindRef === 'scheduled' || kindRef === 'new') {
        grade = determineGrade({
          firstCorrect: isCorrect,
          hintUsed: false,
          responseMs,
          card: cardRef,
          reviewLog: reviewLogs,
          useLatencyGrading: settings.useLatencyGrading
        });
      }

      const logEvent: ReviewLogEvent = {
        ts: Date.now(),
        sessionId: 'session-live',
        cardId: cardRef.id,
        note: cardRef.note,
        skill: cardRef.skill,
        kind: kindRef,
        grade,
        gradeName: grade === 1 ? 'Again' : grade === 2 ? 'Hard' : grade === 4 ? 'Easy' : 'Good',
        firstCorrect: isCorrect,
        answer: answerNote,
        answerKeyId: answerKeyId || null,
        attempts: 1,
        hintUsed: false,
        responseMs,
        elapsedDays: null,
        retrievabilityBefore: retrievability(cardRef),
        stabilityBefore: cardRef.stability,
        stabilityAfter: cardRef.stability,
        difficultyBefore: cardRef.difficulty,
        difficultyAfter: cardRef.difficulty,
        scheduledDays: null
      };

      reviewLogs = [...reviewLogs, logEvent];

      (async () => {
        try {
          if (kindRef === 'scheduled' || kindRef === 'new') {
            applyFsrsReview(cardRef, grade, Date.now(), settings);
            await db.cards.put(cardRef);
          }
          await db.reviewLogs.put(logEvent);
        } catch (err) {
          console.warn('DB put error:', err);
        }
      })();

      return;
    }

    // --- SUBSEQUENT CORRECTIVE ATTEMPTS ---
    attempts++;
    if (isCorrect) {
      isCompleted = true;
      isLocked = true;
      if (answerKeyId) correctKeyIds = [answerKeyId];
      feedbackClass = 'warn';
      feedbackText = currentKind === 'practice' || currentKind === 'confusion'
        ? `✓ Исправлено (${attempts}-я попытка)! ${currentKind === 'confusion' ? 'Контрастная' : 'Свободная'} тренировка.`
        : `✓ Исправлено (${attempts}-я попытка). Для памяти FSRS засчитана первая ошибка (Again); карточка вернётся для повторения.`;
      scheduleAutoAdvance();
    } else {
      feedbackClass = 'bad';
      triggerErrorPulse(answerNote, answerKeyId);
      const hint = getExerciseHint(currentCard);
      feedbackText = `Пока нет: ${DISPLAY_NAMES[answerNote]}. Нужна ${DISPLAY_NAMES[currentCard.note]}. ${hint}`;

      if (attempts >= 3) {
        hintUsed = true;
        if (targetKeyId) hintKeyIds = [targetKeyId];
        else hintKeyIds = [currentCard.note];
        feedbackText += ' 💡 Нужная клавиша подсвечена!';
      }
    }
  }

  function handleDontKnow() {
    if (isLocked || isCompleted) return;

    if (practiceActivity === 'standard' && currentCard && !firstResponseRecorded) {
      firstResponseRecorded = true;
      attempts = 1;
      hintUsed = true;
      stopReactionTimer();
      sessionTrials++;
      sessionStreak = 0;
      sessionLapses++;

      const targetLabel = targetKeyId ? `${DISPLAY_NAMES[currentCard.note]} (${targetKeyId})` : DISPLAY_NAMES[currentCard.note];
      feedbackText = `Ответ: ${targetLabel}. ${getExerciseHint(currentCard)} Карточка скоро вернётся для повторения.`;
      feedbackClass = 'warn';

      if (targetKeyId) hintKeyIds = [targetKeyId];
      else hintKeyIds = [currentCard.note];
      if (currentCard.skill === 'identify') pulseCorrectAnswerNotes = [currentCard.note];

      isCompleted = true;
      isLocked = true;
      scheduleAutoAdvance();

      const cardRef = currentCard;
      const kindRef = currentKind;

      const logEvent: ReviewLogEvent = {
        ts: Date.now(),
        sessionId: 'session-live',
        cardId: cardRef.id,
        note: cardRef.note,
        skill: cardRef.skill,
        kind: kindRef,
        grade: 1,
        gradeName: 'Again',
        firstCorrect: false,
        answer: null,
        answerKeyId: null,
        attempts: 1,
        hintUsed: true,
        responseMs: Math.round(performance.now() - shownPerfMs),
        elapsedDays: null,
        retrievabilityBefore: retrievability(cardRef),
        stabilityBefore: cardRef.stability,
        stabilityAfter: cardRef.stability,
        difficultyBefore: cardRef.difficulty,
        difficultyAfter: cardRef.difficulty,
        scheduledDays: null
      };

      reviewLogs = [...reviewLogs, logEvent];

      (async () => {
        try {
          if (kindRef === 'scheduled' || kindRef === 'new') {
            applyFsrsReview(cardRef, 1, Date.now(), settings);
            await db.cards.put(cardRef);
          }
          await db.reviewLogs.put(logEvent);
        } catch (e) {
          console.warn('DB put error:', e);
        }
      })();
    }
  }

  // ==========================================
  // 1. GUIDED LESSONS RUNNER
  // ==========================================
  function startLesson(lessonId: string) {
    const lesson = LESSONS.find(l => l.id === lessonId);
    if (!lesson) return;
    practiceActivity = 'lesson';
    activeLesson = { id: lessonId, stepIndex: 0 };
    activePage = 'practice';
    nextRound();
  }

  function activeLessonDef(): LessonDef | null {
    if (!activeLesson) return null;
    return LESSONS.find(l => l.id === activeLesson!.id) || null;
  }

  function renderLessonStep() {
    const lesson = activeLessonDef();
    if (!lesson) return;
    const step = lesson.steps[activeLesson!.stepIndex];
    fingerGuides = new Map();
    hintKeyIds = [];
    targetKeyIds = [];
    correctKeyIds = [];
    wrongKeyIds = [];
    feedbackText = '';
    feedbackClass = '';

    if (step.type === 'info') {
      isLocked = true;
      lessonCanContinue = true;
      lessonContinueLabel = 'Продолжить';
      if (lesson.id === 'two-black') hintKeyIds = ['C', 'D', 'E'];
      else if (lesson.id === 'three-black') hintKeyIds = ['F', 'G', 'A', 'B'];
      else if (step.note) hintKeyIds = [step.note];
    } else if (step.type === 'hand' && step.position) {
      isLocked = false;
      lessonCanContinue = false;
      lessonContinueLabel = 'Следующий шаг';
      const pos = HAND_POSITIONS[step.position];
      if (pos) {
        const guides = new Map<string, { finger: number; isTarget: boolean }>();
        pos.mapping.forEach(([keyId, finger]) => {
          guides.set(keyId, { finger, isTarget: keyId === step.keyId });
        });
        fingerGuides = guides;
      }
      if (step.keyId) targetKeyIds = [step.keyId];
    } else if (step.type === 'practice' || step.type === 'exact' || step.type === 'notation' || step.type === 'ear') {
      isLocked = false;
      lessonCanContinue = false;
      lessonContinueLabel = 'Следующий шаг';
      if (step.keyId) targetKeyId = step.keyId;
      if (step.type === 'ear') {
        setTimeout(() => {
          AudioEngine.getInstance().playPianoByKeyId('C4', 85);
          setTimeout(() => AudioEngine.getInstance().playPianoByKeyId(step.keyId || 'D4', 96), 550);
        }, 200);
      }
    } else if (step.type === 'complete') {
      isLocked = true;
      lessonCanContinue = true;
      lessonContinueLabel = 'Завершить урок';
      feedbackText = 'Отлично! Урок успешно пройден.';
      feedbackClass = 'good';
    }
  }

  function handleLessonKeyInput(note: NoteName, keyId: string) {
    const lesson = activeLessonDef();
    if (!lesson || !activeLesson) return;
    const step = lesson.steps[activeLesson.stepIndex];

    const isExact = ['exact', 'notation', 'ear', 'hand'].includes(step.type);
    const ok = isExact ? (keyId === step.keyId) : (note === step.note);

    if (ok) {
      correctKeyIds = [keyId];
      lessonCanContinue = true;
      feedbackText = `✓ Верно! ${step.keyId ? `${DISPLAY_NAMES[note]} (${step.keyId})` : DISPLAY_NAMES[note]} найдена.`;
      feedbackClass = 'good';
      isLocked = true;
    } else {
      wrongKeyIds = [keyId];
      setTimeout(() => { wrongKeyIds = wrongKeyIds.filter(id => id !== keyId); }, 400);
      feedbackText = `Это ${DISPLAY_NAMES[note]} (${keyId}). Нужна ${step.keyId || DISPLAY_NAMES[step.note || 'C']}.`;
      feedbackClass = 'bad';
    }
  }

  function advanceLesson() {
    const lesson = activeLessonDef();
    if (!lesson || !activeLesson) return;
    if (activeLesson.stepIndex < lesson.steps.length - 1) {
      activeLesson.stepIndex++;
      renderLessonStep();
    } else {
      // Completed lesson
      const rec: LessonProgressRecord = {
        id: lesson.id,
        completed: true,
        currentStep: lesson.steps.length - 1,
        startedAt: Date.now() - 60000,
        completedAt: Date.now()
      };
      db.lessonProgress.put(rec);
      lessonProgressMap.set(lesson.id, rec);
      leaveLesson();
      activePage = 'lessons';
    }
  }

  function leaveLesson() {
    activeLesson = null;
    fingerGuides = new Map();
    practiceActivity = 'standard';
    nextRound();
  }

  // ==========================================
  // 2. REPERTOIRE PLAYER (Roadmap Direction 3)
  // ==========================================
  function startSong(songId: string) {
    const song = REPERTOIRE.find(s => s.id === songId);
    if (!song) return;
    practiceActivity = 'repertoire';
    const bpm = TEMPO_MODES[settings.repertoireTempoMode || 'wait']?.bpm || null;

    activeRepertoire = {
      id: songId,
      index: 0,
      mistakes: 0,
      startedPerf: performance.now(),
      bpm,
      displayMode: settings.repertoireDisplayMode || 'keys',
      countingIn: !!bpm,
      countInValue: bpm ? 4 : 0,
      lastCorrectPerf: null,
      timingErrors: [],
      timingWithin: 0,
      timingCount: 0,
      dynamicsHits: 0,
      dynamicsCount: 0,
      velocities: [],
      articulationHits: 0,
      articulationCount: 0,
      articulationRatios: [],
      heldMidi: new Map(),
      awaitingRelease: false,
      lastExpressionText: '',
      completed: false
    };

    activePage = 'practice';

    if (bpm) {
      beginRepertoireCountIn(bpm);
    } else {
      nextRound();
    }
  }

  function beginRepertoireCountIn(bpm: number) {
    if (!activeRepertoire) return;
    const beatMs = 60000 / bpm;
    activeRepertoire.countingIn = true;
    activeRepertoire.countInValue = 4;
    AudioEngine.getInstance().playMetronomeClick(true);

    if (repertoireCountInTimer != null) clearInterval(repertoireCountInTimer);
    repertoireCountInTimer = window.setInterval(() => {
      if (!activeRepertoire) {
        if (repertoireCountInTimer != null) clearInterval(repertoireCountInTimer);
        return;
      }
      activeRepertoire.countInValue--;
      AudioEngine.getInstance().playMetronomeClick(activeRepertoire.countInValue === 1);
      if (activeRepertoire.countInValue <= 0) {
        clearInterval(repertoireCountInTimer!);
        repertoireCountInTimer = null;
        activeRepertoire.countingIn = false;
        activeRepertoire.startedPerf = performance.now();
        activeRepertoire.lastCorrectPerf = null;
        nextRound();
      }
    }, beatMs);
  }

  function renderRepertoireStep() {
    if (!activeRepertoire) return;
    const song = REPERTOIRE.find(s => s.id === activeRepertoire!.id);
    if (!song) return;

    if (activeRepertoire.index >= song.notes.length) {
      finishSong();
      return;
    }

    targetKeyId = song.notes[activeRepertoire.index];
    targetKeyIds = [targetKeyId];
    correctKeyIds = [];
    wrongKeyIds = [];
  }

  function handleRepertoireInput(keyId: string, meta: { input: 'mouse' | 'midi'; velocity?: number; voiceKey?: string }) {
    if (!activeRepertoire || activeRepertoire.completed || activeRepertoire.countingIn) return;
    const song = REPERTOIRE.find(s => s.id === activeRepertoire!.id);
    if (!song) return;

    const target = song.notes[activeRepertoire.index];
    const ok = keyId === target;

    if (ok) {
      const now = performance.now();
      correctKeyIds = [keyId];

      if (activeRepertoire.bpm && activeRepertoire.lastCorrectPerf != null && activeRepertoire.index > 0) {
        const beatMs = 60000 / activeRepertoire.bpm;
        const expectedBeats = song.beats[activeRepertoire.index - 1] || 1;
        const expectedMs = expectedBeats * beatMs;
        const delta = (now - activeRepertoire.lastCorrectPerf) - expectedMs;
        const tol = Math.max(140, Math.min(250, beatMs * 0.25));
        activeRepertoire.timingCount++;
        activeRepertoire.timingErrors.push(delta);
        if (Math.abs(delta) <= tol) activeRepertoire.timingWithin++;
      }
      activeRepertoire.lastCorrectPerf = now;

      // Dynamics
      if (meta.input === 'midi' && Number.isFinite(meta.velocity) && settings.repertoireDynamicsTarget !== 'off') {
        const dynCfg = DYNAMIC_MODES[settings.repertoireDynamicsTarget as keyof typeof DYNAMIC_MODES];
        if (dynCfg && dynCfg.min !== undefined) {
          activeRepertoire.dynamicsCount++;
          activeRepertoire.velocities.push(meta.velocity!);
          const dynOk = meta.velocity! >= dynCfg.min && meta.velocity! <= dynCfg.max;
          if (dynOk) activeRepertoire.dynamicsHits++;
          activeRepertoire.lastExpressionText = `${dynCfg.short} ${dynOk ? '✓' : '≈'} v${meta.velocity}`;
        }
      }

      activeRepertoire.index++;
      if (activeRepertoire.index >= song.notes.length) {
        finishSong();
      } else {
        setTimeout(renderRepertoireStep, 150);
      }
    } else {
      activeRepertoire.mistakes++;
      wrongKeyIds = [keyId];
      setTimeout(() => { wrongKeyIds = wrongKeyIds.filter(id => id !== keyId); }, 380);
      feedbackText = `Нужна ${target}. Позиция в такте сохранена.`;
      feedbackClass = 'bad';
    }
  }

  function finishSong() {
    if (!activeRepertoire) return;
    activeRepertoire.completed = true;
    const song = REPERTOIRE.find(s => s.id === activeRepertoire!.id);
    const timingAcc = activeRepertoire.timingCount ? Math.round((activeRepertoire.timingWithin / activeRepertoire.timingCount) * 100) : null;
    feedbackText = `✓ Мелодия сыграна! Ошибок: ${activeRepertoire.mistakes}${timingAcc != null ? ` · ритм ${timingAcc}%` : ''}. FSRS не изменялся.`;
    feedbackClass = 'good';
    isCompleted = true;
  }

  function restartSong() {
    if (!activeRepertoire) return;
    startSong(activeRepertoire.id);
  }

  function leaveRepertoire() {
    if (repertoireCountInTimer != null) {
      clearInterval(repertoireCountInTimer);
      repertoireCountInTimer = null;
    }
    activeRepertoire = null;
    practiceActivity = 'standard';
    activePage = 'repertoire';
    nextRound();
  }

  // ==========================================
  // 3. TWO-HAND COORDINATION RUNNER
  // ==========================================
  function startTwoHand(patternId: string) {
    const pattern = TWO_HAND_PATTERNS.find(p => p.id === patternId);
    if (!pattern) return;
    practiceActivity = 'twohand';
    const bpm = settings.twoHandTempoMode === 'slow' ? 60 : null;

    activeTwoHand = {
      id: patternId,
      index: 0,
      mistakes: 0,
      startedPerf: performance.now(),
      bpm,
      lastStepPerf: null,
      timingCount: 0,
      timingWithin: 0,
      timingErrors: [],
      coordinationCount: 0,
      coordinationHits: 0,
      pending: new Map(),
      mousePending: new Set(),
      mouseAnchorUntil: 0,
      completed: false
    };

    activePage = 'practice';
    nextRound();
  }

  function activeTwoHandPattern(): TwoHandPatternDef | null {
    if (!activeTwoHand) return null;
    return TWO_HAND_PATTERNS.find(p => p.id === activeTwoHand!.id) || null;
  }

  function renderTwoHandStep() {
    const p = activeTwoHandPattern();
    if (!p || !activeTwoHand) return;

    if (activeTwoHand.index >= p.steps.length) {
      activeTwoHand.completed = true;
      const timingText = activeTwoHand.timingCount ? ` · ритм ${Math.round((activeTwoHand.timingWithin / activeTwoHand.timingCount) * 100)}%` : '';
      const coordText = activeTwoHand.coordinationCount ? ` · координация ${Math.round((activeTwoHand.coordinationHits / activeTwoHand.coordinationCount) * 100)}%` : '';
      feedbackText = `✓ Упражнение завершено! Ошибок: ${activeTwoHand.mistakes}${timingText}${coordText}.`;
      feedbackClass = 'good';
      isCompleted = true;
      return;
    }

    const step = p.steps[activeTwoHand.index];
    twoHandLeftTarget = null;
    twoHandRightTarget = null;
    correctKeyIds = [];
    wrongKeyIds = [];

    if (p.mode === 'pair') {
      const pair = step as { left: string; right: string };
      twoHandLeftTarget = pair.left;
      twoHandRightTarget = pair.right;
    } else if (p.mode === 'anchor') {
      const anchor = step as { left: string; right: string };
      twoHandLeftTarget = anchor.left;
      twoHandRightTarget = anchor.right;
    } else {
      const alt = step as { key: string; hand: 'L' | 'R' };
      if (alt.hand === 'L') twoHandLeftTarget = alt.key;
      else twoHandRightTarget = alt.key;
    }
  }

  function handleTwoHandKeyInput(keyId: string, meta: { input: 'mouse' | 'midi' }) {
    const p = activeTwoHandPattern();
    if (!p || !activeTwoHand || activeTwoHand.completed) return;
    const step = p.steps[activeTwoHand.index];
    const now = performance.now();

    if (p.mode === 'pair') {
      const pair = step as { left: string; right: string };
      if (keyId !== pair.left && keyId !== pair.right) {
        activeTwoHand.mistakes++;
        wrongKeyIds = [keyId];
        setTimeout(() => { wrongKeyIds = wrongKeyIds.filter(id => id !== keyId); }, 350);
        return;
      }
      if (meta.input === 'midi') {
        activeTwoHand.pending.set(keyId, now);
        if (activeTwoHand.pending.size === 2) {
          const times = [...activeTwoHand.pending.values()];
          const gap = Math.abs(times[0] - times[1]);
          const ok = gap <= 180;
          activeTwoHand.coordinationCount++;
          if (ok) activeTwoHand.coordinationHits++;
          activeTwoHand.index++;
          activeTwoHand.pending.clear();
          feedbackText = ok ? `✓ Вместе! Разброс ${Math.round(gap)} мс` : `Разброс ${Math.round(gap)} мс`;
          feedbackClass = ok ? 'good' : 'warn';
          setTimeout(renderTwoHandStep, 160);
        }
      } else {
        activeTwoHand.mousePending.add(keyId);
        if (activeTwoHand.mousePending.size === 2) {
          activeTwoHand.index++;
          activeTwoHand.mousePending.clear();
          feedbackText = '✓ Обе клавиши сыграны';
          feedbackClass = 'good';
          setTimeout(renderTwoHandStep, 160);
        }
      }
    } else if (p.mode === 'anchor') {
      const anchor = step as { left: string; right: string };
      if (keyId === anchor.left) {
        activeTwoHand.mouseAnchorUntil = now + 1800;
        feedbackText = `${anchor.left} активна · теперь ${anchor.right}`;
        feedbackClass = 'warn';
        return;
      }
      if (keyId === anchor.right) {
        activeTwoHand.index++;
        feedbackText = '✓ Шаг выполнен';
        feedbackClass = 'good';
        setTimeout(renderTwoHandStep, 160);
      } else {
        activeTwoHand.mistakes++;
      }
    } else {
      const alt = step as { key: string; hand: 'L' | 'R' };
      if (keyId === alt.key) {
        activeTwoHand.index++;
        feedbackText = '✓ Верно';
        feedbackClass = 'good';
        setTimeout(renderTwoHandStep, 160);
      } else {
        activeTwoHand.mistakes++;
      }
    }
  }

  function restartTwoHand() {
    if (!activeTwoHand) return;
    startTwoHand(activeTwoHand.id);
  }

  function leaveTwoHand() {
    activeTwoHand = null;
    twoHandLeftTarget = null;
    twoHandRightTarget = null;
    practiceActivity = 'standard';
    activePage = 'twohand';
    nextRound();
  }

  // ==========================================
  // 4. EAR TRAINING (Roadmap Direction 5)
  // ==========================================
  function startEarIntervalTraining() {
    practiceActivity = 'earIntervals';
    activePage = 'practice';
    nextRound();
  }

  function startEarTriadTraining() {
    practiceActivity = 'earTriads';
    activePage = 'practice';
    nextRound();
  }

  function renderEarIntervalStep() {
    const item = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    activeEarInterval = { item, referenceKeyId: 'C4', answered: false };
    targetKeyId = item.targetKeyId;
    isLocked = false;
    isCompleted = false;
    feedbackText = '';
    feedbackClass = '';
    setTimeout(() => playIntervalSequence(item.targetKeyId, 'C4'), 250);
  }

  function handleEarIntervalAnswer(answeredId: string) {
    if (!activeEarInterval || activeEarInterval.answered) return;
    activeEarInterval.answered = true;
    isCompleted = true;
    isLocked = true;

    const ok = answeredId === activeEarInterval.item.id || answeredId === activeEarInterval.item.targetKeyId;
    if (ok) {
      sessionScore++;
      feedbackText = `✓ Верно! Это ${activeEarInterval.item.name} (${activeEarInterval.item.shortName}) · ${activeEarInterval.item.semitones} полутон(а). ${activeEarInterval.item.description}`;
      feedbackClass = 'good';
    } else {
      feedbackText = `✗ Это ${activeEarInterval.item.name} (${activeEarInterval.item.shortName}) · C4 $\\rightarrow$ ${activeEarInterval.item.targetKeyId}. ${activeEarInterval.item.description}`;
      feedbackClass = 'bad';
    }
    sessionTrials++;
    scheduleAutoAdvance();
  }

  function renderEarTriadStep() {
    const isMajor = Math.random() > 0.5;
    const pool = isMajor ? TRIADS.major : TRIADS.minor;
    const item = pool[Math.floor(Math.random() * pool.length)];
    activeEarTriad = { item, type: isMajor ? 'major' : 'minor', answered: false };
    isLocked = false;
    isCompleted = false;
    feedbackText = '';
    feedbackClass = '';
    setTimeout(() => playTriadSequence(item.notes, 'arpeggio'), 250);
  }

  function handleEarTriadAnswer(type: 'major' | 'minor') {
    if (!activeEarTriad || activeEarTriad.answered) return;
    activeEarTriad.answered = true;
    isCompleted = true;
    isLocked = true;

    const ok = type === activeEarTriad.type;
    if (ok) {
      sessionScore++;
      feedbackText = `✓ Верно! Это ${activeEarTriad.item.name} (${activeEarTriad.item.formula}) от ${activeEarTriad.item.root}. ${activeEarTriad.item.description}`;
      feedbackClass = 'good';
    } else {
      feedbackText = `✗ Это было ${activeEarTriad.item.name} (${activeEarTriad.item.formula}) от ${activeEarTriad.item.root}. ${activeEarTriad.item.description}`;
      feedbackClass = 'bad';
    }
    sessionTrials++;
    scheduleAutoAdvance();
  }

  // General Key Input Router
  function handleKeyClick(keyId: string, noteName: NoteName) {
    AudioEngine.getInstance().playPianoByKeyId(keyId, 96);
    if (activePage !== 'practice' || isLocked) return;

    if (practiceActivity === 'lesson') {
      handleLessonKeyInput(noteName, keyId);
      return;
    }
    if (practiceActivity === 'repertoire') {
      handleRepertoireInput(keyId, { input: 'mouse' });
      return;
    }
    if (practiceActivity === 'twohand') {
      handleTwoHandKeyInput(keyId, { input: 'mouse' });
      return;
    }
    if (practiceActivity === 'earIntervals') {
      handleEarIntervalAnswer(keyId);
      return;
    }
    if (practiceActivity === 'standard') {
      if (currentCard) {
        handleAnswerSubmit(noteName, keyId);
      }
    }
  }

  // Keyboard Hotkeys
  function resolveNoteFromKeyboard(e: KeyboardEvent): { note: NoteName; specificKeyId?: string } | null {
    const digitMap: Record<string, NoteName> = {
      Digit1: 'C', Digit2: 'D', Digit3: 'E', Digit4: 'F', Digit5: 'G', Digit6: 'A', Digit7: 'B',
      Numpad1: 'C', Numpad2: 'D', Numpad3: 'E', Numpad4: 'F', Numpad5: 'G', Numpad6: 'A', Numpad7: 'B'
    };
    if (digitMap[e.code]) {
      const base = digitMap[e.code];
      const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
      return { note: (isSharp ? `${base}#` : base) as NoteName };
    }

    const codeToNote: Record<string, NoteName> = {
      KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyA: 'A', KeyB: 'B'
    };
    if (codeToNote[e.code]) {
      const base = codeToNote[e.code];
      const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
      return { note: (isSharp ? `${base}#` : base) as NoteName };
    }

    const keyLower = e.key.toLowerCase();
    const ruToNote: Record<string, NoteName> = {
      c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A', b: 'B',
      'с': 'C', 'в': 'D', 'у': 'E', 'а': 'F', 'п': 'G', 'ф': 'A', 'и': 'B'
    };
    if (ruToNote[keyLower]) {
      const base = ruToNote[keyLower];
      const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
      return { note: (isSharp ? `${base}#` : base) as NoteName };
    }

    return null;
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

    if (e.key === 'Escape') {
      isSettingsOpen = false;
      isContextOpen = false;
      isSessionSummaryOpen = false;
      return;
    }

    if (e.code === 'Space' || e.key === ' ') {
      if (practiceActivity === 'lesson' && lessonCanContinue) {
        e.preventDefault();
        advanceLesson();
        return;
      }
      if (isCompleted) {
        e.preventDefault();
        clearAutoAdvance();
        nextRound();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (practiceActivity === 'lesson' && lessonCanContinue) {
        advanceLesson();
        return;
      }
      if (isCompleted) {
        clearAutoAdvance();
        nextRound();
        return;
      }
      handleDontKnow();
      return;
    }

    if (activePage === 'practice' && !isLocked && !isCompleted) {
      const resolved = resolveNoteFromKeyboard(e);
      if (!resolved) return;

      e.preventDefault();
      const octave = targetKeyId ? targetKeyId.slice(-1) : '4';
      const keyId = resolved.specificKeyId || `${resolved.note}${octave}`;
      handleKeyClick(keyId, resolved.note);
    }
  }

  onMount(() => {
    const audioEngine = AudioEngine.getInstance();
    audioEngine.setStatusCallback((status, msg) => {
      audioStatus = msg;
      audioReady = status === 'ready';
    });
    audioEngine.preloadSamples();

    const midi = MidiController.getInstance();
    midi.onStatusChange((st) => {
      midiStatus = st.message;
      midiReady = st.connected;
    });
    midi.onNoteOn((ev: MidiNoteOnEvent) => {
      midiActiveKeyIds = [...midiActiveKeyIds, ev.keyId];
      audioEngine.playPianoMidi(ev.midi, ev.velocity, ev.voiceKey);

      if (activePage === 'practice' && !isLocked) {
        if (practiceActivity === 'repertoire') {
          handleRepertoireInput(ev.keyId, { input: 'midi', velocity: ev.velocity, voiceKey: ev.voiceKey });
        } else if (practiceActivity === 'twohand') {
          handleTwoHandKeyInput(ev.keyId, { input: 'midi' });
        } else if (practiceActivity === 'lesson') {
          handleLessonKeyInput(ev.noteName, ev.keyId);
        } else if (practiceActivity === 'standard' && currentCard) {
          handleAnswerSubmit(ev.noteName, ev.keyId);
        }
      }
    });
    midi.onNoteOff((ev: MidiNoteOffEvent) => {
      midiActiveKeyIds = midiActiveKeyIds.filter(id => id !== ev.keyId);
      audioEngine.releaseVoice(ev.voiceKey, 0.12);
    });
    if (midi.isSupported()) midi.connect();

    loadData();

    window.addEventListener('keydown', handleWindowKeydown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeydown);
      if (sessionClockInterval != null) clearInterval(sessionClockInterval);
      if (repertoireCountInTimer != null) clearInterval(repertoireCountInTimer);
    };
  });
</script>

<main class="app" id="app">
  <header class="topbar">
    <div class="stats" aria-label="Статистика текущей сессии">
      <div class="stat"><small>С 1-й попытки</small><strong>{sessionScore}</strong></div>
      <div class="stat"><small>Серия</small><strong>{sessionStreak}</strong></div>
      <div class="stat">
        <small>Точность</small>
        <strong>{sessionTrials ? `${Math.round((sessionScore / sessionTrials) * 100)}%` : '—'}</strong>
      </div>
      <div class="stat"><small>Повторить</small><strong>{dueCount}</strong></div>
    </div>

    <TopNav
      {activePage}
      {isContextOpen}
      {isSettingsOpen}
      nextButtonDisabled={activePage !== 'practice'}
      onPageChange={(p: string) => { activePage = p; }}
      onToggleSettings={() => { isSettingsOpen = !isSettingsOpen; }}
      onToggleContext={() => { isContextOpen = !isContextOpen; }}
      onNextQuestion={() => { clearAutoAdvance(); nextRound(); }}
    />
  </header>

  <div class="workspace-pages" style="display:block; min-height: 400px;">
    {#if activePage === 'practice'}
      <div class="workspace-page active {currentCard?.skill ? `practice-mode-${currentCard.skill}` : ''}" data-page="practice">
        <!-- 1. Guided Lessons Banner -->
        {#if practiceActivity === 'lesson' && activeLesson}
          {@const lesson = activeLessonDef()}
          <SessionStrip
            sessionLabel="Урок · {lesson?.title || 'Ориентиры'}"
            sessionDetail="Шаг {(activeLesson.stepIndex + 1)} из {lesson?.steps.length || 5}"
            progressPct={lesson ? (((activeLesson.stepIndex + 1) / lesson.steps.length) * 100) : 0}
            isEnded={false}
            onEndSession={leaveLesson}
          />
        <!-- 2. Repertoire Banner -->
        {:else if practiceActivity === 'repertoire' && activeRepertoire}
          {@const song = REPERTOIRE.find(s => s.id === activeRepertoire!.id)}
          {#if song}
            <SongBanner
              title={song.title}
              progressText="{activeRepertoire.displayMode === 'staff' ? 'Ноты' : 'Клавиши'} · {activeRepertoire.bpm ? `${activeRepertoire.bpm} BPM` : 'Wait Mode'} · {activeRepertoire.index}/{song.notes.length}"
              subtitle={activeRepertoire.countingIn ? `Приготовьтесь: счёт ${activeRepertoire.countInValue}` : song.description}
              dynamicsMode={settings.repertoireDynamicsTarget || 'off'}
              articulationMode={settings.repertoireArticulationTarget || 'off'}
              lastExpressionText={activeRepertoire.lastExpressionText}
              onRestart={restartSong}
              onExit={leaveRepertoire}
            />
          {/if}
        <!-- 3. Two-Hand Banner -->
        {:else if practiceActivity === 'twohand' && activeTwoHand}
          {@const pattern = activeTwoHandPattern()}
          {#if pattern}
            <TwoHandBanner
              title={pattern.title}
              progressText="Шаг {activeTwoHand.index + 1}/{pattern.steps.length}"
              subtitle="Левая рука — фиолетовая, правая — голубая"
              onRestart={restartTwoHand}
              onExit={leaveTwoHand}
            />
          {/if}
        <!-- 4. Session Strip (in standard practice & cold test) -->
        {:else}
          <SessionStrip
            sessionLabel={sessionStatusLabel}
            sessionDetail={sessionDetailLabel}
            progressPct={sessionProgressPct}
            isEnded={isSessionEnded}
            onEndSession={() => finishLearningSession('manual')}
          />
        {/if}

        <!-- Interactive Task Stage Area -->
        {#if practiceActivity === 'lesson' && activeLesson}
          {@const lesson = activeLessonDef()}
          {#if lesson}
            {@const step = lesson.steps[activeLesson.stepIndex]}
            <TaskStage
              eyebrow="Мини-урок · {lesson.title} · Шаг {activeLesson.stepIndex + 1}/{lesson.steps.length}"
              promptText="<span class='lesson-prompt-title'>{step.title}</span>"
              instructionText={step.body}
              reactionTime="—"
              reactionStatus={step.type === 'info' ? 'Теория' : step.type === 'complete' ? 'Завершено' : 'Практика'}
              {feedbackText}
              {feedbackClass}
              isCompleted={lessonCanContinue}
              showDontKnow={false}
              showAnswerButtons={false}
              onNextQuestion={advanceLesson}
            />
            <div style="display:flex; justify-content:center; gap:12px; margin: 12px 0; flex-wrap:wrap;">
              {#if lessonCanContinue}
                <button
                  type="button"
                  class="btn primary"
                  style="min-width:160px; font-size:15px; padding:10px 20px; font-weight:600;"
                  onclick={advanceLesson}
                >
                  {lessonContinueLabel} →
                </button>
              {/if}
              <button
                type="button"
                class="btn"
                style="padding:10px 16px;"
                onclick={leaveLesson}
              >
                Выйти из урока
              </button>
            </div>
          {/if}
        {:else if practiceActivity === 'repertoire' && activeRepertoire}
          {@const song = REPERTOIRE.find(s => s.id === activeRepertoire!.id)}
          {#if song}
            {#if activeRepertoire.displayMode === 'staff'}
              <div style="display:flex; justify-content:center; margin-bottom:12px; overflow-x:auto;">
                <Staff
                  mode="repertoire"
                  repertoireSong={song}
                  currentNoteIndex={activeRepertoire.index}
                  isCompleted={activeRepertoire.completed}
                />
              </div>
            {/if}
            <TaskStage
              eyebrow="Мелодия · {song.level}"
              promptText={activeRepertoire.displayMode === 'staff' ? 'Читайте ноты на стане' : `<span class="note">${song.notes[activeRepertoire.index] || 'Конец'}</span>`}
              instructionText={activeRepertoire.countingIn ? `Счёт 4–3–2–1... приготовьтесь к первому такту` : `Сыграйте ноту: ${song.notes[activeRepertoire.index] || 'Завершено'}`}
              reactionTime="—"
              reactionStatus={activeRepertoire.bpm ? `${activeRepertoire.bpm} BPM` : 'Wait Mode'}
              {reactionClass}
              {feedbackText}
              {feedbackClass}
              {isCompleted}
              showDontKnow={false}
              onNextQuestion={nextRound}
            />
          {/if}
        {:else if practiceActivity === 'earIntervals' && activeEarInterval}
          <TaskStage
            eyebrow="Тренировка слуха · Интервалы (Direction 5)"
            promptText="<span class='note'>C4</span> → 🔊 → ?"
            instructionText="Послушайте интервал от C4 и определите его"
            reactionTime="{((reactionElapsedMs || 0) / 1000).toFixed(1)} с"
            {reactionStatus}
            {reactionClass}
            {feedbackText}
            {feedbackClass}
            {isCompleted}
            autoAdvanceTotal={3.0}
            {autoAdvanceCountdown}
            showSoundRepeat={true}
            showDontKnow={false}
            onReplaySound={() => playIntervalSequence(activeEarInterval!.item.targetKeyId, 'C4')}
            onNextQuestion={nextRound}
          />
          <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin:10px 0;">
            {#each INTERVALS as interval (interval.id)}
              <button
                type="button"
                class="btn {activeEarInterval.answered && activeEarInterval.item.id === interval.id ? 'primary' : ''}"
                disabled={activeEarInterval.answered}
                onclick={() => handleEarIntervalAnswer(interval.id)}
              >
                {interval.shortName} ({interval.name})
              </button>
            {/each}
          </div>
        {:else if practiceActivity === 'earTriads' && activeEarTriad}
          <TaskStage
            eyebrow="Тренировка слуха · Трезвучия (Direction 5)"
            promptText="🔊 Трезвучие: Мажор или Минор?"
            instructionText="Послушайте аккорд и определите его ладовую окраску"
            reactionTime="{((reactionElapsedMs || 0) / 1000).toFixed(1)} с"
            {reactionStatus}
            {reactionClass}
            {feedbackText}
            {feedbackClass}
            {isCompleted}
            autoAdvanceTotal={3.0}
            {autoAdvanceCountdown}
            showSoundRepeat={true}
            showDontKnow={false}
            onReplaySound={() => playTriadSequence(activeEarTriad!.item.notes, 'arpeggio')}
            onNextQuestion={nextRound}
          />
          <div style="display:flex; justify-content:center; gap:16px; margin:12px 0;">
            <button
              type="button"
              class="btn primary"
              style="min-width:140px; font-size:16px; padding:12px 20px;"
              disabled={activeEarTriad.answered}
              onclick={() => handleEarTriadAnswer('major')}
            >
              ☀️ Мажор (светлое)
            </button>
            <button
              type="button"
              class="btn"
              style="min-width:140px; font-size:16px; padding:12px 20px;"
              disabled={activeEarTriad.answered}
              onclick={() => handleEarTriadAnswer('minor')}
            >
              🌧️ Минор (задумчивое)
            </button>
          </div>
        {:else if practiceActivity === 'twohand' && activeTwoHand}
          {@const pattern = activeTwoHandPattern()}
          {#if pattern}
            {@const step = pattern.steps[activeTwoHand.index]}
            <TaskStage
              eyebrow="Две руки · {pattern.title} · Шаг {activeTwoHand.index + 1}/{pattern.steps.length}"
              promptText="Левая: <span class='note' style='color:#c084fc;'>{step.leftKeyId}</span> · Правая: <span class='note' style='color:#38bdf8;'>{step.rightKeyId}</span>"
              instructionText={activeTwoHand.waitingFor === 'both' ? 'Нажмите обе клавиши одновременно' : activeTwoHand.waitingFor === 'right' ? 'Нажмите правую клавишу (голубая)' : 'Нажмите левую клавишу (фиолетовая)'}
              reactionTime="—"
              reactionStatus="Координация"
              {feedbackText}
              {feedbackClass}
              isCompleted={false}
              showDontKnow={false}
              showAnswerButtons={false}
            />
          {/if}
        {:else if currentCard}
          {@const promptHtml = currentCard.skill === 'notationToKey'
            ? ''
            : currentCard.skill === 'find'
              ? `Найдите ноту <span class="note">${DISPLAY_NAMES[currentCard.note]}</span>`
              : currentCard.skill === 'identify'
                ? `Какая нота подсвечена на клавиатуре?`
                : currentCard.skill === 'soundToKey'
                  ? `<span class="note">C4</span> → 🔊 → ?`
                  : `Ориентир для ${DISPLAY_NAMES[currentCard.note]}`
          }

          {#if currentCard.skill === 'notationToKey'}
            <div style="display:flex; justify-content:center; margin-bottom: 12px;">
              <Staff 
                keyId={targetKeyId || 'C4'} 
                mode="single" 
                pulseGuide={staffPulseGuide} 
                clef={settings.notationClef || 'auto'} 
              />
            </div>
          {/if}

          <TaskStage
            eyebrow="{currentKind === 'cold' ? `Cold Test · ${Math.min(coldIndex + 1, 20)}/20` : currentKind === 'confusion' ? 'Контрастная тренировка' : currentKind === 'scheduled' ? 'Плановое повторение' : currentKind === 'new' ? 'Новая карточка' : 'Свободная практика'} · {currentCard.skill}"
            promptText={promptHtml}
            instructionText={currentKind === 'cold' ? 'Одна попытка без подсказок. Результат не меняет расписание FSRS.' : currentCard.skill === 'identify' ? 'Назовите клавишу, подсвеченную голубым' : 'Нажмите клавишу на клавиатуре (буквы C–B, цифры 1–7) или сыграйте по MIDI'}
            reactionTime="{((reactionElapsedMs || 0) / 1000).toFixed(1)} с"
            {reactionStatus}
            {reactionClass}
            {feedbackText}
            {feedbackClass}
            {isCompleted}
            {autoAdvanceCountdown}
            autoAdvanceTotal={settings.autoAdvanceDelaySeconds ?? 3.0}
            showSoundRepeat={currentCard.skill === 'soundToKey'}
            showAnswerButtons={currentCard.skill === 'identify'}
            showDontKnow={currentKind !== 'cold'}
            answerNotes={NATURAL_NOTES}
            wrongAnswerNotes={pulseWrongAnswerNotes}
            correctAnswerNotes={pulseCorrectAnswerNotes}
            onAnswerClick={(n) => {
              const octave = targetKeyId ? targetKeyId.slice(-1) : '4';
              const keyId = `${n}${octave}`;
              AudioEngine.getInstance().playPianoByKeyId(keyId, 96);
              handleAnswerSubmit(n, keyId);
            }}
            onDontKnow={handleDontKnow}
            onReplaySound={playSoundPrompt}
            onNextQuestion={() => { clearAutoAdvance(); nextRound(); }}
          />
        {/if}

        <!-- Anchored 4-Octave Piano Keyboard -->
        <Keyboard
          onKeyClick={handleKeyClick}
          {targetKeyIds}
          {correctKeyIds}
          {wrongKeyIds}
          {hintKeyIds}
          {pulseCorrectKeyIds}
          {midiActiveKeyIds}
          {twoHandLeftTarget}
          {twoHandRightTarget}
          {fingerGuides}
        />
      </div>
    {:else if activePage === 'lessons'}
      <div class="workspace-page active" data-page="lessons" style="overflow-y: auto;">
        <LessonsView
          {lessonProgressMap}
          onStartLesson={(id: string) => startLesson(id)}
        />
      </div>
    {:else if activePage === 'repertoire'}
      <div class="workspace-page active" data-page="repertoire" style="overflow-y: auto;">
        <RepertoireView
          {settings}
          onSettingsChange={(patch: Partial<UserSettings>) => {
            persistSettings(patch);
          }}
          onStartSong={(id: string) => startSong(id)}
        />
      </div>
    {:else if activePage === 'twohand'}
      <div class="workspace-page active" data-page="twohand" style="overflow-y: auto;">
        <TwoHandView
          {settings}
          onSettingsChange={(patch: Partial<UserSettings>) => {
            persistSettings(patch);
          }}
          onStartPattern={(id: string) => startTwoHand(id)}
        />
      </div>
    {:else if activePage === 'progress'}
      <div class="workspace-page active" data-page="progress" style="overflow-y: auto;">
        <ProgressView
          {cardsMap}
          {settings}
          reviewLogLength={reviewLogs.length}
          onExport={async () => {
            const data = { state: { settings, cards }, reviewLogs, coldTests };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `piano-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onImport={async (file: File) => {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.state?.cards) {
              await db.cards.bulkPut(Object.values(data.state.cards));
              loadData();
            }
          }}
          onReset={async () => {
            if (confirm('Сбросить весь прогресс FSRS?')) {
              await db.delete();
              location.reload();
            }
          }}
        />
      </div>
    {:else if activePage === 'analytics'}
      <div class="workspace-page active" data-page="analytics" style="overflow-y: auto;">
        <AnalyticsView {reviewLogs} />
      </div>
    {:else if activePage === 'curriculum'}
      <div class="workspace-page active" data-page="curriculum" style="overflow-y: auto;">
        <CurriculumView phases={curriculumPhasesList} />
      </div>
    {:else if activePage === 'diagnostics'}
      <div class="workspace-page active" data-page="diagnostics" style="overflow-y: auto;">
        <DiagnosticsView {coldTests} {reviewLogs} />
      </div>
    {:else if activePage === 'calibration'}
      <div class="workspace-page active" data-page="calibration" style="overflow-y: auto;">
        <CalibrationView {reviewLogs} />
      </div>
    {/if}
  </div>

  <SettingsDrawer
    isOpen={isSettingsOpen}
    {settings}
    midiConnected={midiReady}
    onClose={() => { isSettingsOpen = false; }}
    onSettingsChange={(patch: Partial<UserSettings>) => {
      persistSettings(patch);
      if (patch.sessionPreset) {
        startLearningSession(patch.sessionPreset as SessionPreset);
        nextRound();
      }
      if (patch.level || patch.notationClef) {
        nextRound();
      }
      if (patch.mode === 'earIntervals') startEarIntervalTraining();
      else if (patch.mode === 'earTriads') startEarTriadTraining();
      else if (patch.mode && (practiceActivity === 'earIntervals' || practiceActivity === 'earTriads')) {
        practiceActivity = 'standard';
        nextRound();
      } else if (patch.mode) {
        nextRound();
      }
    }}
    onConnectMidi={() => MidiController.getInstance().connect()}
    onExportData={exportProfileData}
    onImportData={importProfileData}
  />

  <InspectorRail
    isOpen={isContextOpen}
    onClose={() => { isContextOpen = false; }}
    onToggle={() => { isContextOpen = !isContextOpen; }}
    {dueCount}
    {newCount}
    {learningCount}
    {masteredCount}
    {audioStatus}
    {audioReady}
    {midiStatus}
    {midiReady}
    sessionMode={practiceActivity === 'lesson' ? 'Мини-урок' : practiceActivity === 'repertoire' ? 'Мелодии' : practiceActivity === 'twohand' ? 'Две руки' : 'Умная FSRS'}
    sessionLevel={settings.level === 'all' ? 'Все клавиши' : 'Белые'}
    sessionPreset={sessionPreset === 'cold' ? 'Cold Test' : sessionPreset === 'quick' ? 'Быстрая · 3 мин' : sessionPreset === 'due' ? 'Все повторы' : 'Обычная · 8 мин'}
    currentStage="Ориентиры C + F"
    retentionGoal="{Math.round(settings.desiredRetention * 100)}%"
  />

  <!-- Session Summary Completion Modal -->
  <SessionSummaryModal
    isOpen={isSessionSummaryOpen}
    leadText={sessionSummaryData.leadText}
    duration={sessionSummaryData.duration}
    trials={sessionSummaryData.trials}
    accuracy={sessionSummaryData.accuracy}
    medianLatency={sessionSummaryData.medianLatency}
    scheduledLabel={sessionSummaryData.scheduledLabel}
    scheduledValue={sessionSummaryData.scheduledValue}
    newLabel={sessionSummaryData.newLabel}
    newValue={sessionSummaryData.newValue}
    weakSummary={sessionSummaryData.weakSummary}
    onClose={() => { isSessionSummaryOpen = false; }}
    onStartSession={(preset: SessionPreset) => {
      isSessionSummaryOpen = false;
      startLearningSession(preset);
      nextRound();
    }}
  />
</main>
