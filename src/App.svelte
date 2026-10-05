<script lang="ts">
  import { onMount } from 'svelte';
  import './ui/styles/app.css';

  // Core & Audio
  import { AudioEngine } from './audio/AudioEngine';
  import { MetronomeClock } from './audio/MetronomeClock';
  import { MidiController, type MidiNoteOnEvent, type MidiNoteOffEvent } from './audio/MidiController';
  import { midiFromKeyId } from './audio/types';
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
  import { APP_VERSION } from './core/version';
  import { isMastered } from './core/fsrs/fsrs6';
  import { commitCardReview } from './core/fsrs/reviewPersistence';
  import {
    createSessionId,
    submitQuestionAttempt,
    type QuestionRoundState
  } from './core/fsrs/reviewLog';
  import {
    chooseDue,
    chooseNew,
    choosePractice,
    buildColdQueue,
    chooseConfusionPractice
  } from './core/scheduler/queue';
import { getCurriculumPhases } from './core/curriculum/curriculum';
  import { getCurriculumPhaseProgressDetails } from './core/curriculum/curriculumProgressDetails';
  import {
    canUseInputForSkill,
    getIdentifyAnswerNotes,
    getPatternIdentifyPrompt,
    getSkillInputPolicy,
    getSkillInstruction,
    isCanonicalPitchMatch,
    isSemanticAnswerCorrect,
    resolveNoteFromKeyboard,
    resolvePianoKeyFromKeyboard,
    resolvePcKeyboardSemanticAnswer,
    resolveSemanticNoteAnswer
  } from './core/input/inputPolicy';
  import {
    activatePracticeQuestion,
    activatePracticeSession,
    claimFirstAnswerCommit,
    endPracticeSession,
    isActivePracticeSession
  } from './core/input/activePracticeSession';
  import { resolveAdvancedModuleStates } from './core/learning/advancedModules';
  import {
    createInitialLearningProgress,
    shouldEnterFirstRunCf,
    isFirstRunCfCompleted,
    createFirstRunCfState,
    applyFirstRunCfActionWithCards,
    canUseDontKnowInFirstRunStep,
    getFirstRunCfStepProgress,
    getFirstRunStepSkill,
    resolveFirstRunKeydownAction,
    shouldEnterWhiteKeyCurriculum,
    createWhiteKeyCurriculumState,
    applyCurriculumActionWithCards,
    canUseDontKnowInCurriculumStep,
    getWhiteKeyCurriculumStepProgress,
    getCurriculumStepSkill,
    resolveCurriculumKeydownAction,
    filterCurriculumActiveCards,
    resolveTrainingOrchestration,
    shouldEnterMilestone3dCurriculum,
    createMilestone3dCurriculumState,
    applyMilestone3dActionWithCards,
    canUseDontKnowInMilestone3dStep,
    describeMilestone3dStep,
    getMilestone3dStepSkill,
    getMilestone3dStepProgress,
    resolveMilestone3dKeydownAction,
    isCoreCurriculumComplete,
    resolveDailyPracticeNext,
  buildDailyPracticePool,
    buildDailyPracticeSummary,
    resolveCardVisualConfig,
    validateIdentifyVisualInvariant,
    BASS_GRAND_ITEM_IDS,
    createBassGrandCurriculumState,
    applyBassGrandActionWithCards,
    canUseDontKnowInBassGrandStep,
    createIntervalCurriculumState,
    applyIntervalActionWithCards,
    canUseDontKnowInIntervalStep,
    resolveIntervalKeydownAction,
    type FirstRunCfState,
    type FirstRunCfAction,
    type WhiteKeyCurriculumState,
    type WhiteKeyCurriculumAction,
    type Milestone3dCurriculumState,
    type Milestone3dAction,
    type BassGrandCurriculumState,
    type BassGrandAction,
    type IntervalCurriculumState,
    type IntervalAction,
    type IntervalId,
    createTriadCurriculumState,
    applyTriadActionWithCards,
    canUseDontKnowInTriadStep,
    resolveTriadKeydownAction,
    evaluateDailyChordAttempt,
    type TriadCurriculumState,
    type TriadAction,
    type TriadQuality,
    createInversionCurriculumState,
    applyInversionAction,
    canInputInversionChord,
    canUseDontKnowInInversionStep,
    resolveInversionKeydownAction,
    evaluateDailyInversionAttempt,
    type InversionCurriculumState,
    type InversionAction,
    type TriadInversion,
    createHarmonyCurriculumState,
    applyHarmonyAction,
    canInputHarmonyChord,
    getCurrentHarmonyChord,
    shouldShowHarmonyVoicingHint,
    resolveHarmonyKeydownAction,
    resolveHarmonyReviewKeydownAnswer,
    resolveHarmonyReviewTask,
    classifyHarmonyChord,
    HARMONY_ITEM_IDS,
    harmonyCardNotes,
    CHORD_RHYTHM_BPM,
    CHORD_RHYTHM_ITEM_IDS,
    CHORD_RHYTHM_LATE_WINDOW_MS,
    CHORD_RHYTHM_MISSED_AFTER_MS,
    CHORD_RHYTHM_ON_TIME_WINDOW_MS,
    CHORD_RHYTHM_SEQUENCE,
    chordRhythmCardNotes,
    canStartRhythmRemediation,
    classifyRhythmChord,
    classifyRhythmTiming,
    createChordRhythmModuleState,
    createRhythmAssessment,
    currentRhythmTrial,
    reduceChordRhythmState,
    resetAdvancedModuleStates,
    resolveRhythmTargetChord,
    targetedRemediationStep,
    type AdvancedModuleId,
    type HarmonyCurriculumState,
    type HarmonyAction,
    type HarmonyChordId,
    type LearningProgressRecord,
    type TrialInputMethod,
    type ChordRhythmModuleState,
    type ChordRhythmAction,
    type RhythmChordClassification,
    type RhythmTimingOutcome
  } from './core/learning';
import { isFsrsCardDue } from './core/fsrs/cardClassification';
  import {
    MidiChordTracker,
    sortKeyIdsByPitch,
    toggleKeyInChordSelection
  } from './core/input/chordInput';
  import type {
    Card,
    NoteName,
    PracticeActivity,
    ReviewKind,
    ReviewLogEvent,
    Skill,
    TriadQualityId,
    UserSettings
  } from './core/fsrs/types';
  import {
    markSchedulerReviewPersisted,
    recordNextRoundRequest,
    recordSchedulerDecision,
    recordSchedulerReviewTransition,
    updateNextRoundRequest
  } from './core/diagnostics/schedulerTracker';

  // Curriculum & Modes Data
  import { LESSONS, HAND_POSITIONS, type LessonDef } from './core/lessons/lessonsData';
  import {
    REPERTOIRE,
    DYNAMIC_MODES,
    getSongMeasureCount,
    getMeasureForNoteIndex,
    getMeasureNoteRange,
    getEffectiveSongBpm,
    hasFullVersion,
    getSongVersion,
    normalizeSongToEvents,
    buildSongPlaybackSchedule,
    type RepertoireLengthMode,
    type SongDef
  } from './core/repertoire/repertoireData';
  import { TWO_HAND_PATTERNS, type TwoHandPatternDef } from './core/twohand/twoHandData';
  import {
    INTERVALS,
    TRIADS,
    ECHO_PHRASES,
    playIntervalSequence,
    playTriadSequence,
    playEchoPhrase,
    type IntervalDef,
    type TriadDef,
    type EchoPhraseDef
  } from './core/ear/earTrainingData';

  // Storage
  import { db, type ColdTestRecord, type LessonProgressRecord } from './storage/db';
  import { BACKUP_SCHEMA_VERSION, applyBackupAtomically, normalizeBackupCard, validateAndNormalizeBackup } from './storage/backup';
  import { checkAndMigrateLocalStorage } from './storage/migrator';

  // Components
  import TopNav from './ui/components/TopNav.svelte';
  import Keyboard from './ui/components/Keyboard.svelte';
  import TaskStage from './ui/components/TaskStage.svelte';
  import FirstRunStage from './ui/components/FirstRunStage.svelte';
  import CurriculumStage from './ui/components/CurriculumStage.svelte';
  import Curriculum3dStage from './ui/components/Curriculum3dStage.svelte';
  import AdvancedNotationStage from './ui/components/AdvancedNotationStage.svelte';
  import IntervalStage from './ui/components/IntervalStage.svelte';
  import TriadStage from './ui/components/TriadStage.svelte';
  import InversionStage from './ui/components/InversionStage.svelte';
  import HarmonyStage from './ui/components/HarmonyStage.svelte';
  import ChordRhythmStage from './ui/components/ChordRhythmStage.svelte';
  import SettingsDrawer from './ui/components/SettingsDrawer.svelte';
  import InspectorRail from './ui/components/InspectorRail.svelte';
  import Staff from './ui/components/Staff.svelte';
  import SessionStrip from './ui/components/SessionStrip.svelte';
  import SessionSummaryModal from './ui/components/SessionSummaryModal.svelte';
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
  const ACTIVE_PAGE_SESSION_KEY = 'piano-trainer-active-page';
  const SETTINGS_STORAGE_KEY = 'piano-trainer-settings';

  function getInitialActivePage(): string {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem(ACTIVE_PAGE_SESSION_KEY);
        if (saved) return saved;
      }
    } catch (_) {}
    return 'practice';
  }

  let activePage = $state(getInitialActivePage());
  let practiceActivity = $state<PracticeActivity>('standard');

  function getStoredSettingsPatch(): Partial<UserSettings> {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as Partial<UserSettings>;
        }
      }
    } catch (_) {}
    return {};
  }

  function getInitialSettings(): UserSettings {
    return { ...DEFAULT_SETTINGS, ...getStoredSettingsPatch() };
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
      const learningProgressList = await db.learningProgress.toArray();
      const backup = {
        app: 'piano-key-trainer',
        backupSchemaVersion: BACKUP_SCHEMA_VERSION,
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        settings: $state.snapshot(settings),
        cards: cardsList,
        reviewLogs: logsList,
        coldTests: coldList,
        lessonProgress: progressList,
        learningProgress: learningProgressList
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
    let parsed: unknown;
    try {
      const text = await file.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        alert('Не удалось прочитать JSON. Файл повреждён или не является резервной копией.');
        return;
      }
    } catch (e) {
      console.error('Import read failed:', e);
      alert('Ошибка при чтении файла резервной копии.');
      return;
    }

    // Untrusted input: parse -> schema validate -> semantic normalize, and only then write.
    const result = validateAndNormalizeBackup(parsed);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    const backup = result.backup;

    try {
      isProfileImporting = true;
      // Never replace the database while an in-flight review commit is queued.
      await reviewPersistenceQueue;
      const mergedSettings = { ...$state.snapshot(settings), ...backup.settings };
      await applyBackupAtomically(db, backup, mergedSettings);

      cards = backup.cards;
      reviewLogs = backup.reviewLogs;
      coldTests = backup.coldTests;
      lessonProgressMap = new Map(backup.lessonProgress.map(p => [p.id, p]));
      learningProgressMap = new Map(backup.learningProgress.map(p => [p.id, p]));
      reviewPersistenceFailed = false;
      pendingReviewCommitCount = 0;
      deferredNextRoundCallId = null;
      clearActiveAdvancedModuleStates();
      if (Object.keys(backup.settings).length) persistSettings(backup.settings);
      if (
        shouldEnterFirstRunCf({
          cards,
          reviewLogs,
          learningProgress: learningProgressMap,
          lessonProgress: lessonProgressMap,
          coldTests
        })
      ) {
        firstRunState = createFirstRunCfState(learningProgressMap, Date.now());
        curriculumState = null;
        curriculum3dState = null;
        sessionEndsAt = null;
      } else if (
        shouldEnterWhiteKeyCurriculum({
          cards,
          reviewLogs,
          learningProgress: learningProgressMap,
          lessonProgress: lessonProgressMap,
          coldTests
        })
      ) {
        firstRunState = null;
        curriculumState = createWhiteKeyCurriculumState({
          learningProgress: learningProgressMap,
          cards,
          reviewLogs,
          now: Date.now()
        });
        curriculum3dState = null;
        sessionEndsAt = null;
      } else if (
        shouldEnterMilestone3dCurriculum({
          cards,
          reviewLogs,
          learningProgress: learningProgressMap
        })
      ) {
        firstRunState = null;
        curriculumState = null;
        curriculum3dState = createMilestone3dCurriculumState({
          learningProgress: learningProgressMap,
          cards,
          reviewLogs,
          now: Date.now()
        });
        sessionEndsAt = null;
      } else {
        firstRunState = null;
        curriculumState = null;
        curriculum3dState = null;
      }
      const warning = backup.warnings.length ? ` ${backup.warnings.join(' ')}` : '';
      alert(`Данные профиля успешно восстановлены из резервной копии.${warning}`);
      nextRound();
    } catch (e) {
      console.error('Import failed:', e);
      alert('Ошибка при восстановлении профиля: ' + e);
    } finally {
      isProfileImporting = false;
    }
  }

  let cards = $state<Card[]>([]);
  let reviewLogs = $state<ReviewLogEvent[]>([]);
  let reviewPersistenceQueue: Promise<void> = Promise.resolve();
  let isProfileImporting = false;
  let coldTests = $state<ColdTestRecord[]>([]);
  let lessonProgressMap = $state<Map<string, LessonProgressRecord>>(new Map());
  let learningProgressMap = $state<Map<string, LearningProgressRecord>>(new Map());
  let firstRunState = $state<FirstRunCfState | null>(null);
  let curriculumState = $state<WhiteKeyCurriculumState | null>(null);
  let curriculum3dState = $state<Milestone3dCurriculumState | null>(null);
  let bassGrandState = $state<BassGrandCurriculumState | null>(null);
  let bassGrandCompletionSaving = false;
  const isBassGrandActive = $derived(bassGrandState !== null);
  const advancedModuleStates = $derived(
    resolveAdvancedModuleStates({ learningProgress: learningProgressMap, cards, reviewLogs })
  );
  const bassGrandStatus = $derived(advancedModuleStates.bassGrandStaff.progressStatus);
  const isBassGrandModuleCompleteDerived = $derived(advancedModuleStates.bassGrandStaff.state === 'completed');

  let intervalState = $state<IntervalCurriculumState | null>(null);
  const isIntervalActive = $derived(intervalState !== null);
  const isIntervalAvailable = $derived(advancedModuleStates.intervals.available);
  const intervalStatus = $derived(advancedModuleStates.intervals.progressStatus);

  let triadState = $state<TriadCurriculumState | null>(null);
  const isTriadActive = $derived(triadState !== null);
  const isTriadAvailable = $derived(advancedModuleStates.triads.available);
  const triadStatus = $derived(advancedModuleStates.triads.progressStatus);

  let inversionState = $state<InversionCurriculumState | null>(null);
  const isInversionActive = $derived(inversionState !== null);
  const isInversionAvailable = $derived(advancedModuleStates.chordInversions.available);
  const inversionStatus = $derived(advancedModuleStates.chordInversions.progressStatus);

  let harmonyState = $state<HarmonyCurriculumState | null>(null);
  let harmonyActionQueue: Promise<void> = Promise.resolve();
  const isHarmonyActive = $derived(harmonyState !== null);
  const isHarmonyAvailable = $derived(advancedModuleStates.harmony.available);
  const harmonyStatus = $derived(advancedModuleStates.harmony.progressStatus);

  interface RhythmAttemptTrace {
    at: number;
    questionInstanceId: string | null;
    inputMethod: 'screen' | 'midi';
    rawMidiNotes: number[];
    normalizedKeyIds: string[];
    pitchClasses: string[];
    bassPitchClass: string | null;
    targetChord: string;
    targetPitchClasses: string[];
    targetBassRequirement: string | null;
    expectedOnset: number | null;
    actualOnset: number | null;
    timingDeltaMs: number | null;
    timingBand: string;
    classificationOutcome: string;
    chordCorrect: boolean;
    detectedChordLabel: string | null;
    countInStartedAt: number;
    countInFinishedAt: number;
    visualTargetShownAt: number | null;
    timingWindowStart: number | null;
    timingWindowEnd: number | null;
  }

  let chordRhythmState = $state<ChordRhythmModuleState | null>(null);
  let dailyRhythmViewState = $state<ChordRhythmModuleState | null>(null);
  let dailyRhythmFeedback = $state('');
  let dailyRhythmFeedbackTone = $state('');
  let dailyRhythmCorrective = $state(false);
  let dailyRhythmCompleted = $state(false);
  let dailyRhythmChordId = $state<HarmonyChordId>('C');
  let chordRhythmActionQueue: Promise<void> = Promise.resolve();
  let rhythmClock = new MetronomeClock();
  let rhythmDeadlineTimer: number | null = null;
  let rhythmLateCutoffTimer: number | null = null;
  let rhythmTargetOnsets: number[] = [];
  let rhythmNextTargetIndex = 0;
  let rhythmQuestionInstanceId: string | null = null;
  let rhythmCountInEndsAt = 0;
  let rhythmCountInStartedAt = 0;
  let rhythmVisualTargetShownAt: number | null = null;
  let rhythmOutcomePending = false;
  let rhythmRunGeneration = 0;
  const rhythmMidiByKeyId = new Map<string, number>();
  let m3kRecentAttempts: RhythmAttemptTrace[] = [];
  const isChordRhythmActive = $derived(chordRhythmState !== null);
  const isChordRhythmAvailable = $derived(advancedModuleStates.chordRhythm.available);
  const chordRhythmStatus = $derived(advancedModuleStates.chordRhythm.progressStatus);
  let chordRhythmDiagnostics = $state<{
    targetBpm: number;
    expectedOnset: number | null;
    actualOnset: number | null;
    timingDeltaMs: number | null;
    timingBand: string | null;
    chordCorrect: boolean | null;
    classificationOutcome: string | null;
    detectedChordLabel: string | null;
    timedTrialCancelledReason: string | null;
  }>({
    targetBpm: CHORD_RHYTHM_BPM,
    expectedOnset: null,
    actualOnset: null,
    timingDeltaMs: null,
    timingBand: null,
    chordCorrect: null,
    classificationOutcome: null,
    detectedChordLabel: null,
    timedTrialCancelledReason: null
  });

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
  let currentSessionId = $state(
    createSessionId(initialSettings.sessionPreset || 'normal', Date.now())
  );
  let currentQuestionInstanceId: string | null = null;
  let currentSchedulerReason: string | null = null;
  let currentActivationId: string | null = null;
  let currentDecisionSequence: number | null = null;
  let currentTaskSessionId: string | null = null;
  let currentTaskActivity: PracticeActivity | null = null;
  let currentNextRoundCallId: string | null = null;
  let deferredNextRoundCallId: string | null = null;
  let pendingReviewCommitCount = 0;
  let reviewPersistenceFailed = false;
  const reviewTraceIdByKey = new Map<string, string>();
  let sessionEndsAt = $state<number | null>(Date.now() + ((initialSettings.sessionPreset === 'quick') ? 3 : 8) * 60 * 1000);
  let isSessionEnded = $state(false);
  let sessionTrials = $state(0);
  let sessionScore = $state(0);
  let sessionStreak = $state(0);
  let sessionResponseTimes = $state<number[]>([]);
  let sessionScheduledReviews = $state(0);
  let sessionScheduledCorrect = $state(0);
  let sessionNewReviews = $state(0);
  let sessionTransferTrials = $state(0);
  let sessionTransferCorrect = $state(0);
  let sessionConfusionReviews = $state(0);
  let sessionLapses = $state(0);
  let lastConfusionTrial = $state(-99);
  let currentTaskEyebrow = $state<string | null>(null);

  // Cold Test Queue
  let coldQueue = $state<string[]>([]);
  let coldIndex = $state(0);

  // Active Standard Practice Round State
  let currentCard = $state<Card | null>(null);
  const isDailyRhythmActive = $derived(Boolean(
    currentCard &&
    (currentCard.skill === 'chordPulse' || currentCard.skill === 'chordChangeTiming' || currentCard.skill === 'chordRhythmPattern') &&
    dailyRhythmViewState
  ));
  let dailyHarmonyVariantIndex = $state(0);
  const dailyHarmonyTask = $derived(currentCard ? resolveHarmonyReviewTask(currentCard, dailyHarmonyVariantIndex) : null);
  let dailyHarmonyStepIndex = $state(0);
  let dailyHarmonyHadWrong = $state(false);
  let dailyHarmonyFeedback = $state('');
  let dailyHarmonyFeedbackTone = $state('');
  let dailyHarmonyInputMethod = $state<TrialInputMethod>('screen');
  let dailyHarmonyFirstOutcomeRecorded = $state(false);
  let dailyHarmonyCorrective = $state(false);
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
  let structuralGuideKeyIds = $state<string[]>([]);
  let modelLabelKeyIds = $state<string[]>([]);
  let pulseCorrectKeyIds = $state<string[]>([]);
  let pulseWrongAnswerNotes = $state<NoteName[]>([]);
  let pulseCorrectAnswerNotes = $state<NoteName[]>([]);
  let staffPulseGuide = $state(false);
  let currentClef = $state<'auto' | 'treble' | 'bass' | 'grand'>('auto');
  let currentIsGrandStaff = $state(false);
  let midiActiveKeyIds = $state<string[]>([]);
  let midiChordHeldKeyIds = $state<string[]>([]);
  let selectedKeyIds = $state<string[]>([]);
  let currentTriadKeyIds = $state<readonly string[]>([]);
  let currentInversion = $state<TriadInversion>('root');
  let currentChordSymbol = $state<string>('');
  let currentRootKeyId = $state<string>('C4');
  const midiChordTracker = new MidiChordTracker();
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
    lengthMode: RepertoireLengthMode;
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
    loopMeasure: number | null;
    loopCount: number;
    isDemoPlaying: boolean;
    completed: boolean;
  } | null>(null);
  let repertoireCountInTimer: number | null = null;
  let repertoireDemoTimer: number | null = null;

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
  let activeEarEcho = $state<{
    item: EchoPhraseDef;
    currentIndex: number;
    answeredNotes: string[];
    completed: boolean;
  } | null>(null);

  // Derived state
  const cardsMap = $derived(new Map(cards.map(c => [c.id, c])));
  const dueCount = $derived(cards.filter(c => c.reps > 0 && c.dueAt <= Date.now()).length);
  const newCount = $derived(cards.filter(c => c.reps === 0).length);
  const masteredCount = $derived(cards.filter(isMastered).length);
  const learningCount = $derived(cards.filter(c => c.reps > 0 && !isMastered(c)).length);
  const isFirstRunActive = $derived(practiceActivity === 'standard' && firstRunState !== null);
  const firstRunStepProgress = $derived(
    firstRunState ? getFirstRunCfStepProgress(firstRunState.step) : null
  );
  const isCurriculumActive = $derived(
    practiceActivity === 'standard' &&
      firstRunState === null &&
      curriculumState !== null &&
      currentCard === null &&
      sessionPreset !== 'cold' &&
      sessionPreset !== 'due'
  );
  const curriculumStepProgress = $derived(
    curriculumState ? getWhiteKeyCurriculumStepProgress(curriculumState) : null
  );
  const isCurriculum3dActive = $derived(
    practiceActivity === 'standard' &&
      firstRunState === null &&
      curriculumState === null &&
      curriculum3dState !== null &&
      currentCard === null &&
      sessionPreset !== 'cold' &&
      sessionPreset !== 'due'
  );
  const curriculum3dStepProgress = $derived(
    curriculum3dState ? getMilestone3dStepProgress(curriculum3dState) : null
  );

  const curriculumPhasesList = $derived(
    getCurriculumPhases(
      settings.level || 'white',
      (skill, note) => cardsMap.get(`${skill}:${note}`) || createFreshCard(skill, note),
      reviewLogs,
      learningProgressMap
    )
  );

  const currentCurriculumPhase = $derived(
    curriculumPhasesList.find(p => p.open && !p.done && !p.skipped) || null
  );

  const currentPhaseProgressDetails = $derived(
    getCurriculumPhaseProgressDetails(
      currentCurriculumPhase ?? undefined,
      (skill, note) => cardsMap.get(`${skill}:${note}`) || createFreshCard(skill, note),
      reviewLogs,
      learningProgressMap
    )
  );

  const activeIdentifyAnswerNotes = $derived.by(() => {
    if (currentCard?.skill === 'intervalIdentify') {
      return ['P8', 'P5', 'M3', 'm3'] as NoteName[];
    }
    if (currentCard?.skill === 'triadIdentify') {
      return ['major', 'minor'] as NoteName[];
    }
    if (currentCard?.skill === 'triadInversionIdentify') {
      return ['root', 'first', 'second'] as NoteName[];
    }
    const activeCards = filterCurriculumActiveCards(cards, {
      learningProgress: learningProgressMap,
      cards,
      reviewLogs,
      level: settings.level || 'white'
    });
    return getIdentifyAnswerNotes({
      currentCard,
      activeCards,
      level: settings.level || 'white'
    });
  });

  // Session Strip calculations
  const sessionStatusLabel = $derived.by(() => {
    if (sessionPreset === 'cold') {
      return `Cold Test · ${Math.min(coldIndex, 20)}/20`;
    }
    if (sessionPreset === 'due') {
      return `Все повторы · due ${dueCount}`;
    }
    const isCompleted = isCoreCurriculumComplete({
      learningProgress: learningProgressMap,
      cards,
      reviewLogs
    });
    const prefix = isCompleted
      ? 'Ежедневная тренировка'
      : (sessionPreset === 'quick' ? 'Быстрая' : 'Обычная');
    if (sessionEndsAt) {
      const remaining = Math.max(0, sessionEndsAt - currentNow);
      if (remaining <= 0) return `${prefix} · время вышло`;
      return `${prefix} · ${formatClock(remaining)} осталось`;
    }
    return `${prefix} · ${sessionPreset === 'quick' ? '3 мин' : '8 мин'}`;
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
    reinforcementLabel: 'Закрепление',
    reinforcementValue: null as string | null,
    newLabel: 'Новых' as string | null,
    newValue: '0' as string | null,
    transferValue: null as string | null,
    skillSummary: null as string | null,
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
    try {
      await checkAndMigrateLocalStorage();

      try {
        const storedSettings = await db.settings.get('userSettings');
        const localPatch = getStoredSettingsPatch();
        if (storedSettings?.value && typeof storedSettings.value === 'object') {
          settings = {
            ...DEFAULT_SETTINGS,
            ...(storedSettings.value as Partial<UserSettings>),
            ...localPatch
          };
          if (settings.sessionPreset) sessionPreset = settings.sessionPreset as SessionPreset;
          const snapshot = $state.snapshot(settings);
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
          db.settings.put({ key: 'userSettings', value: snapshot }).catch(console.warn);
        } else {
          db.settings.put({ key: 'userSettings', value: $state.snapshot(settings) }).catch(console.warn);
        }
      } catch (err) {
        console.warn('Error loading settings from IndexedDB', err);
      }

      const loadedCards = await db.cards.toArray();
      const normalizedCards = loadedCards
        .map(card => normalizeBackupCard(card))
        .filter((card): card is Card => card !== null);
      const cardsNeededNormalization =
        normalizedCards.length !== loadedCards.length ||
        loadedCards.some(card => !card.stats);
      let storedCards = normalizedCards;
      if (cardsNeededNormalization && storedCards.length) {
        // Self-heal legacy/imported rows that predate `stats` normalization.
        await db.cards.bulkPut(storedCards.map(card => $state.snapshot(card)));
      }
      if (!storedCards.length) {
        const initialCards: Card[] = [];
        const skills: Skill[] = ['find', 'identify', 'patternIdentify', 'notationToKey', 'soundToKey', 'notationBassToKey'];
        for (const skill of skills) {
          for (const note of ALL_NOTES) {
            if (skill === 'patternIdentify' && !['C', 'F', 'E', 'B'].includes(note)) continue;
            if ((skill === 'notationToKey' || skill === 'soundToKey' || skill === 'notationBassToKey') && !NATURAL_NOTES.includes(note as any)) continue;
            initialCards.push(createFreshCard(skill, note));
          }
        }
        const intervalIds: IntervalId[] = ['P8', 'P5', 'M3', 'm3'];
        for (const intervalId of intervalIds) {
          initialCards.push(createFreshCard('intervalBuild', intervalId as any));
          initialCards.push(createFreshCard('intervalIdentify', intervalId as any));
        }
        const triadQualities: TriadQualityId[] = ['major', 'minor'];
        for (const quality of triadQualities) {
          initialCards.push(createFreshCard('triadBuild', quality));
          initialCards.push(createFreshCard('triadIdentify', quality));
        }
        const inversionCardItems = [
          { skill: 'triadInversionBuild', note: 'first' },
          { skill: 'triadInversionBuild', note: 'second' },
          { skill: 'triadInversionIdentify', note: 'first' },
          { skill: 'triadInversionBuild', note: 'slash' },
          { skill: 'chordSymbolRead', note: 'slash' }
        ] as const;
        for (const item of inversionCardItems) {
          initialCards.push(createFreshCard(item.skill, item.note as any));
        }
        await db.cards.bulkPut(initialCards);
        storedCards = initialCards;
      } else {
        // Ensure notationBassToKey cards exist for existing profiles
        const missingBassCards: Card[] = [];
        for (const note of NATURAL_NOTES) {
          const id = `notationBassToKey:${note}`;
          if (!storedCards.some(c => c.id === id)) {
            const fresh = createFreshCard('notationBassToKey', note);
            missingBassCards.push(fresh);
            storedCards.push(fresh);
          }
        }
        if (missingBassCards.length > 0) {
          await db.cards.bulkPut(missingBassCards);
        }

        // Ensure intervalBuild and intervalIdentify cards exist for existing profiles
        const missingIntervalCards: Card[] = [];
        const intervalIds: IntervalId[] = ['P8', 'P5', 'M3', 'm3'];
        for (const intervalId of intervalIds) {
          for (const skill of ['intervalBuild', 'intervalIdentify'] as const) {
            const id = `${skill}:${intervalId}`;
            if (!storedCards.some(c => c.id === id)) {
              const fresh = createFreshCard(skill, intervalId as any);
              missingIntervalCards.push(fresh);
              storedCards.push(fresh);
            }
          }
        }
        if (missingIntervalCards.length > 0) {
          await db.cards.bulkPut(missingIntervalCards);
        }

        // Ensure triadBuild and triadIdentify cards exist for existing profiles
        const missingTriadCards: Card[] = [];
        const triadQualities: TriadQualityId[] = ['major', 'minor'];
        for (const quality of triadQualities) {
          for (const skill of ['triadBuild', 'triadIdentify'] as const) {
            const id = `${skill}:${quality}`;
            if (!storedCards.some(c => c.id === id)) {
              const fresh = createFreshCard(skill, quality as any);
              missingTriadCards.push(fresh);
              storedCards.push(fresh);
            }
          }
        }
        if (missingTriadCards.length > 0) {
          await db.cards.bulkPut(missingTriadCards);
        }

        // Ensure inversion cards exist for existing profiles
        const missingInversionCards: Card[] = [];
        const inversionCardItems = [
          { skill: 'triadInversionBuild', note: 'first' },
          { skill: 'triadInversionBuild', note: 'second' },
          { skill: 'triadInversionIdentify', note: 'first' },
          { skill: 'triadInversionBuild', note: 'slash' },
          { skill: 'chordSymbolRead', note: 'slash' }
        ] as const;
        for (const item of inversionCardItems) {
          const id = `${item.skill}:${item.note}`;
          if (!storedCards.some(c => c.id === id)) {
            const fresh = createFreshCard(item.skill, item.note as any);
            missingInversionCards.push(fresh);
            storedCards.push(fresh);
          }
        }
        if (missingInversionCards.length > 0) {
          await db.cards.bulkPut(missingInversionCards);
        }
      }
      const missingHarmonyCards: Card[] = [];
      for (const item of harmonyCardNotes()) {
        const id = `${item.skill}:${item.note}`;
        if (!storedCards.some(card => card.id === id)) {
          const fresh = createFreshCard(item.skill, item.note);
          missingHarmonyCards.push(fresh);
          storedCards.push(fresh);
        }
      }
      if (missingHarmonyCards.length) await db.cards.bulkPut(missingHarmonyCards);
      cards = storedCards;

      reviewLogs = await db.reviewLogs.toArray();
      coldTests = await db.coldTests.toArray();

      const storedLessons = await db.lessonProgress.toArray();
      lessonProgressMap = new Map(storedLessons.map(l => [l.id, l]));

      const storedLearningProgress = await db.learningProgress.toArray();
      learningProgressMap = new Map(storedLearningProgress.map(p => [p.id, p]));

      if (
        shouldEnterFirstRunCf({
          cards: storedCards,
          reviewLogs,
          learningProgress: learningProgressMap,
          lessonProgress: lessonProgressMap,
          coldTests
        })
      ) {
        firstRunState = createFirstRunCfState(learningProgressMap, Date.now());
        curriculumState = null;
        curriculum3dState = null;
      } else if (
        shouldEnterWhiteKeyCurriculum({
          cards: storedCards,
          reviewLogs,
          learningProgress: learningProgressMap,
          lessonProgress: lessonProgressMap,
          coldTests
        })
      ) {
        firstRunState = null;
        curriculumState = createWhiteKeyCurriculumState({
          learningProgress: learningProgressMap,
          cards: storedCards,
          reviewLogs,
          now: Date.now()
        });
        curriculum3dState = null;
      } else if (
        shouldEnterMilestone3dCurriculum({
          cards: storedCards,
          reviewLogs,
          learningProgress: learningProgressMap
        })
      ) {
        firstRunState = null;
        curriculumState = null;
        curriculum3dState = createMilestone3dCurriculumState({
          learningProgress: learningProgressMap,
          cards: storedCards,
          reviewLogs,
          now: Date.now()
        });
      } else {
        firstRunState = null;
        curriculumState = null;
        curriculum3dState = null;
      }

      startLearningSession(sessionPreset);
      const advancedResolved = resolveAdvancedModuleStates({ learningProgress: learningProgressMap, cards: storedCards, reviewLogs });
      const savedHarmonySnapshot = learningProgressMap.get(HARMONY_ITEM_IDS.SESSION)?.harmonySnapshot;
      const savedChordRhythmSnapshot = learningProgressMap.get(CHORD_RHYTHM_ITEM_IDS.SESSION)?.chordRhythmSnapshot;
      if (
        savedHarmonySnapshot &&
        learningProgressMap.get(HARMONY_ITEM_IDS.COMPLETE)?.state !== 'retention' &&
        advancedResolved.harmony.available
      ) {
        activePage = 'practice';
        harmonyState = createHarmonyCurriculumState(learningProgressMap, Date.now());
        sessionEndsAt = null;
        syncHarmonyVisuals();
      } else if (
        savedChordRhythmSnapshot &&
        learningProgressMap.get(CHORD_RHYTHM_ITEM_IDS.COMPLETE)?.state !== 'retention' &&
        advancedResolved.chordRhythm.available
      ) {
        activePage = 'practice';
        chordRhythmState = createChordRhythmModuleState(learningProgressMap);
        sessionEndsAt = null;
      } else {
        nextRound();
      }
    } catch (err) {
      console.error('loadData failed:', err);
    }
  }

  // Session Management
  function startLearningSession(preset: SessionPreset = 'normal') {
    endPracticeSession(currentSessionId);
    clearActiveTask();
    sessionPreset = preset;
    persistSettings({ sessionPreset: preset });

    const now = Date.now();
    currentNow = now;
    sessionStartedAt = now;
    currentSessionId = createSessionId(preset, now);
    activatePracticeSession(currentSessionId);
    sessionEndsAt =
      firstRunState !== null || curriculumState !== null || curriculum3dState !== null
        ? null
        : preset === 'quick'
          ? now + 3 * 60 * 1000
          : preset === 'normal'
            ? now + 8 * 60 * 1000
            : null;
    isSessionEnded = false;
    isSessionSummaryOpen = false;

    sessionTrials = 0;
    sessionScore = 0;
    sessionStreak = 0;
    sessionResponseTimes = [];
    sessionScheduledReviews = 0;
    sessionScheduledCorrect = 0;
    sessionNewReviews = 0;
    sessionTransferTrials = 0;
    sessionTransferCorrect = 0;
    sessionConfusionReviews = 0;
    sessionLapses = 0;
    recentCards = [];
    sessionIntroducedNotes.clear();
    currentTaskEyebrow = null;

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

  function finishLearningSession(reason: 'manual' | 'expired' | 'cold_complete' | 'due_complete' = 'manual') {
    if (!isActivePracticeSession(currentSessionId) || isSessionEnded) return;
    endPracticeSession(currentSessionId);
    if (sessionClockInterval != null) {
      clearInterval(sessionClockInterval);
      sessionClockInterval = null;
    }
    clearActiveTask();
    isSessionEnded = true;
    const endedAt = Date.now();
    const duration = endedAt - sessionStartedAt;
    const events = reviewLogs.filter(e => e.sessionId === currentSessionId);
    const acc = sessionTrials ? `${Math.round((sessionScore / sessionTrials) * 100)}%` : '—';
    const med = quantile(sessionResponseTimes, 0.5);
    const p75 = quantile(sessionResponseTimes, 0.75);

    let coldResult: ColdTestRecord | null = null;

    if (sessionPreset === 'cold' && (reason === 'cold_complete' || sessionTrials >= 20)) {
      coldResult = coldResultFromEvents(events, endedAt);
      db.coldTests.put(coldResult);
      coldTests = [...coldTests, coldResult];
    }

    let weakSummary = sessionWeakSummary(events);
    let leadText = reason === 'due_complete'
      ? 'Все плановые повторения выполнены.'
      : reason === 'manual'
        ? 'Сессия остановлена вручную.'
        : 'Лимит времени сессии исчерпан.';

    if (sessionPreset === 'cold') {
      leadText = coldResult
        ? `Cold Test успешно завершён (20 заданий). Результаты не влияют на FSRS.`
        : 'Cold Test завершён досрочно; запись в историю не добавлена.';
      weakSummary = coldResult ? coldWeakSummary(coldResult) : 'Незавершённый Cold Test.';
    }

    const isPostCurriculum = isCoreCurriculumComplete({
      learningProgress: learningProgressMap,
      cards,
      reviewLogs
    });

    if (isPostCurriculum && sessionPreset !== 'cold') {
      const dailySummary = buildDailyPracticeSummary({
        sessionTrials,
        sessionScore,
        sessionScheduledReviews,
        sessionScheduledCorrect,
        sessionTransferTrials,
        sessionTransferCorrect,
        reviewLogs,
        sessionId: currentSessionId,
        startedAt: sessionStartedAt,
        endedAt
      });

      let summaryWeakText = weakSummary;
      if (dailySummary.confusionPairs.length > 0) {
        const confusionText = `Ошибочные пары: ${dailySummary.confusionPairs.join(', ')}`;
        summaryWeakText = summaryWeakText && summaryWeakText !== 'Ошибок нет.'
          ? `${summaryWeakText} · ${confusionText}`
          : confusionText;
      }

      sessionSummaryData = {
        leadText,
        duration: formatSessionDuration(duration),
        trials: sessionTrials,
        accuracy: dailySummary.firstAttemptAccuracy,
        medianLatency: formatResponseMs(med),
        scheduledLabel: 'Плановые повторения',
        scheduledValue: String(dailySummary.scheduledCount),
        reinforcementLabel: 'Закрепление',
        reinforcementValue: dailySummary.reinforcementAccuracy !== '—' ? dailySummary.reinforcementAccuracy : null,
        newLabel: null,
        newValue: null,
        transferValue: dailySummary.transferStats
          ? `${dailySummary.transferStats.correct}/${dailySummary.transferStats.trials}`
          : null,
        skillSummary: dailySummary.skillSummary,
        weakSummary: summaryWeakText
      };
    } else {
      const transferValue = sessionTransferTrials > 0
        ? `${sessionTransferCorrect}/${sessionTransferTrials}`
        : null;

      sessionSummaryData = {
        leadText,
        duration: formatSessionDuration(duration),
        trials: sessionTrials,
        accuracy: acc,
        medianLatency: formatResponseMs(med),
        scheduledLabel: sessionPreset === 'cold' ? 'P75' : 'Scheduled',
        scheduledValue: sessionPreset === 'cold' ? formatResponseMs(p75) : String(sessionScheduledReviews),
        reinforcementLabel: 'Закрепление',
        reinforcementValue: null,
        newLabel: sessionPreset === 'cold' ? 'Ошибок' : 'Новых',
        newValue: sessionPreset === 'cold' ? String(sessionTrials - sessionScore) : String(sessionNewReviews),
        transferValue,
        skillSummary: null,
        weakSummary
      };
    }

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

  // Milestone 3E Rev2: Centralized Task Activation & State Integrity
  function clearActiveTask() {
    cancelChordRhythmRun('смена задания или завершение сессии');
    clearAutoAdvance();
    stopReactionTimer();
    currentQuestionInstanceId = null;
    currentSchedulerReason = null;
    currentActivationId = null;
    currentDecisionSequence = null;
    currentTaskSessionId = null;
    currentTaskActivity = null;
    currentCard = null;
    dailyRhythmViewState = null;
    dailyRhythmFeedback = '';
    dailyRhythmFeedbackTone = '';
    dailyRhythmCorrective = false;
    dailyRhythmCompleted = false;
    dailyHarmonyStepIndex = 0;
    dailyHarmonyHadWrong = false;
    dailyHarmonyFeedback = '';
    dailyHarmonyFeedbackTone = '';
    dailyHarmonyInputMethod = 'screen';
    dailyHarmonyFirstOutcomeRecorded = false;
    dailyHarmonyCorrective = false;
    dailyHarmonyVariantIndex = 0;
    targetKeyId = null;
    targetKeyIds = [];
    currentTaskEyebrow = null;
    isLocked = false;
    isCompleted = false;
    firstResponseRecorded = false;
    attempts = 0;
    hintUsed = false;
    feedbackText = '';
    feedbackClass = '';
    correctKeyIds = [];
    wrongKeyIds = [];
    hintKeyIds = [];
    structuralGuideKeyIds = [];
    modelLabelKeyIds = [];
    pulseCorrectKeyIds = [];
    pulseWrongAnswerNotes = [];
    pulseCorrectAnswerNotes = [];
    staffPulseGuide = false;
    currentClef = 'auto';
    currentIsGrandStaff = false;
    selectedKeyIds = [];
    currentTriadKeyIds = [];
    currentInversion = 'root';
    currentChordSymbol = '';
    currentRootKeyId = 'C4';
    inversionState = null;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];

    if (import.meta.env?.DEV) {
      const validation = validateIdentifyVisualInvariant({
        card: null,
        isSessionEnded: true,
        targetKeyId: null,
        targetKeyIds: []
      });
      if (!validation.valid) {
        console.error('[IdentifyInvariantViolation on clearActiveTask]', validation.reason);
      }
    }
  }

  function activateTask(params: {
    card: Card;
    kind: ReviewKind;
    eyebrowLabel?: string | null;
    isGrandStaff?: boolean;
    schedulerReason?: string;
    eligibleCandidateCount?: number;
    dueCandidateCount?: number;
    recentCardIds?: string[];
  }) {
    if (!isActivePracticeSession(currentSessionId)) return;
    const visualConfig = resolveCardVisualConfig(params.card, {
      kind: params.kind,
      notationClef: settings.notationClef,
      isGrandStaff: params.isGrandStaff,
      sessionTrials
    });

    if (import.meta.env?.DEV) {
      const validation = validateIdentifyVisualInvariant({
        card: params.card,
        isSessionEnded: false,
        targetKeyId: visualConfig.targetKeyId,
        targetKeyIds: visualConfig.targetKeyIds
      });
      if (!validation.valid) {
        console.error('[IdentifyInvariantViolation]', validation.reason);
      }
    }

    targetKeyId = visualConfig.targetKeyId;
    targetKeyIds = visualConfig.targetKeyIds;
    structuralGuideKeyIds = visualConfig.structuralGuideKeyIds ?? [];
    currentTriadKeyIds = visualConfig.triadKeyIds ?? [];
    currentInversion = visualConfig.inversion ?? 'root';
    currentChordSymbol = visualConfig.symbol ?? '';
    currentRootKeyId = visualConfig.rootKeyId ?? (visualConfig.structuralGuideKeyIds?.[0] || 'C4');
    selectedKeyIds = [];
    dailyHarmonyStepIndex = 0;
    dailyHarmonyHadWrong = false;
    dailyHarmonyFeedback = '';
    dailyHarmonyFeedbackTone = '';
    dailyHarmonyInputMethod = 'screen';
    dailyHarmonyFirstOutcomeRecorded = false;
    dailyHarmonyCorrective = false;
    dailyHarmonyVariantIndex = sessionTrials % 2;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
    currentClef = visualConfig.clef;
    currentIsGrandStaff = visualConfig.isGrandStaff;
    currentTaskEyebrow = params.eyebrowLabel ?? null;
    currentKind = params.kind;
    currentCard = params.card;
    currentQuestionInstanceId = activatePracticeQuestion(currentSessionId);
    const activatedRhythmSkill = rhythmDailySkill(params.card);
    if (activatedRhythmSkill) {
      dailyRhythmViewState = {
        ...createChordRhythmModuleState(),
        step: 'transferAssessment',
        assessment: createRhythmAssessment('initial'),
        dailySkill: activatedRhythmSkill
      };
      dailyRhythmChordId = CHORD_RHYTHM_SEQUENCE[sessionTrials % CHORD_RHYTHM_SEQUENCE.length];
      dailyRhythmFeedback = '';
      dailyRhythmFeedbackTone = '';
      dailyRhythmCorrective = false;
      dailyRhythmCompleted = false;
    } else {
      dailyRhythmViewState = null;
    }
    currentSchedulerReason = params.schedulerReason ?? (
      params.kind === 'transfer'
        ? 'transfer'
        : params.kind === 'confusion'
          ? 'recent_error'
          : params.kind === 'new'
            ? 'newly_unlocked'
            : params.kind === 'lesson'
              ? 'remediation'
              : params.kind === 'practice'
                ? 'fallback_emergency'
                : 'scheduled_due'
    );

    if (params.card.skill === 'soundToKey') {
      setTimeout(() => playSoundPrompt(), 200);
    }
    startReactionTimer();

    // Diagnostic Scheduler Decision Trace
    const trace = recordSchedulerDecision({
      selected: params.card.id,
      skill: params.card.skill,
      reason: currentSchedulerReason ?? 'fallback_emergency',
      candidateCount: params.eligibleCandidateCount ?? cards.length,
      eligibleCandidateCount: params.eligibleCandidateCount ?? cards.length,
      dueCandidateCount: params.dueCandidateCount ?? cards.filter(card => isFsrsCardDue(card, Date.now())).length,
      recentCardIds: params.recentCardIds ?? recentCards.slice(0, 4).map(card => card.id),
      sessionId: currentSessionId,
      questionInstanceId: currentQuestionInstanceId,
      nextRoundCallId: currentNextRoundCallId,
      cardStateBefore: params.card.memoryState,
      dueAtBefore: params.card.dueAt,
      isDueBefore: isFsrsCardDue(params.card, Date.now())
    });
    currentActivationId = trace.activationId;
    currentDecisionSequence = trace.decisionSequence;
    currentTaskSessionId = currentSessionId;
    currentTaskActivity = practiceActivity;
    if (currentNextRoundCallId) {
      updateNextRoundRequest(currentNextRoundCallId, 'activated', trace.activationId);
      currentNextRoundCallId = null;
    }
  }

  // Main Exercise Queue & Next Round
  function nextRound(resumeCallId?: string) {
    if (!isActivePracticeSession(currentSessionId) || isSessionEnded) return;
    if (chordRhythmState) return;
    const callId = resumeCallId ?? recordNextRoundRequest({
      sessionId: currentSessionId,
      activity: practiceActivity,
      previousActivationId: currentActivationId,
      previousQuestionInstanceId: currentQuestionInstanceId,
      previousCardId: currentCard?.id ?? null
    });
    currentNextRoundCallId = callId;

    if (pendingReviewCommitCount > 0) {
      deferredNextRoundCallId = callId;
      updateNextRoundRequest(callId, 'deferred_review_persistence');
      return;
    }
    if (reviewPersistenceFailed) {
      updateNextRoundRequest(callId, 'blocked_persistence_failure');
      feedbackClass = 'bad';
      feedbackText = 'Не удалось сохранить ответ. Тренировка остановлена, чтобы не пересчитать карточку до сохранения.';
      currentNextRoundCallId = null;
      return;
    }
    if (
      currentCard &&
      !isCompleted &&
      currentTaskSessionId === currentSessionId &&
      currentTaskActivity === practiceActivity
    ) {
      updateNextRoundRequest(callId, 'suppressed_active_question');
      currentNextRoundCallId = null;
      return;
    }
    if (resumeCallId) updateNextRoundRequest(callId, 'resumed_after_persistence');

    clearActiveTask();

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
    if (practiceActivity === 'earEcho') {
      renderEarEchoStep();
      return;
    }

    if (practiceActivity === 'standard' && firstRunState !== null && sessionPreset !== 'cold') {
      renderFirstRunStep();
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
      activateTask({ card: picked, kind: 'cold' });
      return;
    }

    const now = Date.now();
    const levelFiltered =
      settings.level === 'all'
        ? cards
        : cards.filter(c => NATURAL_NOTES.includes(c.note as any) || (audioReady && rhythmDailySkill(c) !== null));

    const modeFiltered = (settings.mode && settings.mode !== 'smart' && ['find', 'identify', 'pattern', 'notationToKey', 'soundToKey'].includes(settings.mode))
      ? levelFiltered.filter(c => c.skill === (settings.mode === 'pattern' ? 'patternIdentify' : settings.mode))
      : levelFiltered;

    // Milestone 3C & 3D Scheduler Activation Gate:
    // Only curriculum-activated cards are ever eligible for scheduler queues.
    const candidateCards = filterCurriculumActiveCards(modeFiltered, {
      learningProgress: learningProgressMap,
      cards,
      reviewLogs,
      level: settings.level || 'white'
    });

    if (practiceActivity === 'standard' && curriculumState !== null && sessionPreset !== 'due') {
      const orchestration = resolveTrainingOrchestration({
        cards: modeFiltered,
        learningProgress: learningProgressMap,
        reviewLogs,
        curriculumState,
        now,
        recentCards,
        sessionIntroducedNotes,
        maxNewPitchClasses: settings.newPitchClassesPerSession,
        lastConfusionTrial,
        sessionTrials,
        sessionConfusionReviews
      });

      if (orchestration.priority === 'due_scheduled_review' && orchestration.dueCard) {
        recentCards = [orchestration.dueCard, ...recentCards.slice(0, 3)];
        activateTask({ card: orchestration.dueCard, kind: 'scheduled' });
        return;
      }

      renderCurriculumStep();
      return;
    }

    if (practiceActivity === 'standard' && curriculum3dState !== null && sessionPreset !== 'due') {
      const due = chooseDue(candidateCards, now, recentCards);
      if (
        due &&
        !curriculum3dState.awaitingCorrective &&
        !curriculum3dState.awaitingRemediationPress &&
        !curriculum3dState.isInterveningRecall
      ) {
        recentCards = [due, ...recentCards.slice(0, 3)];
        activateTask({ card: due, kind: 'scheduled' });
        return;
      }
      renderCurriculum3dStep();
      return;
    }

    // Milestone 3E: Daily Practice Orchestration for completed core curriculum
    if (
      practiceActivity === 'standard' &&
      curriculumState === null &&
      curriculum3dState === null &&
      firstRunState === null &&
      isCoreCurriculumComplete({ learningProgress: learningProgressMap, cards, reviewLogs })
    ) {
      const decision = resolveDailyPracticeNext({
        cards,
        learningProgress: learningProgressMap,
        reviewLogs,
        settings,
        now,
        recentCards,
        sessionTrials,
        sessionTransferTrials,
        lastConfusionTrial,
        sessionConfusionReviews,
        audioAvailable: audioReady
      });

      if (!decision) {
        if (sessionPreset === 'due') {
          finishLearningSession('due_complete');
          return;
        }
        return;
      }

      if (decision.priority === 'confusion_contrast') {
        sessionConfusionReviews++;
        lastConfusionTrial = sessionTrials;
      }
      const dailyPool = buildDailyPracticePool({
        cards,
        learningProgress: learningProgressMap,
        reviewLogs,
        level: settings.level || 'white',
        mode: settings.mode,
        audioAvailable: audioReady
      });
      recentCards = [decision.card, ...recentCards.slice(0, 3)];
      activateTask({
        card: decision.card,
        kind: decision.kind,
        eyebrowLabel: decision.eyebrowLabel,
        isGrandStaff: decision.isGrandStaff,
        schedulerReason: decision.reason,
        eligibleCandidateCount: dailyPool.length,
        dueCandidateCount: dailyPool.filter(card => isFsrsCardDue(card, now)).length,
        recentCardIds: recentCards.slice(1, 5).map(card => card.id)
      });
      return;
    }

    let picked: Card | null = null;
    let kind: ReviewKind = 'practice';

    // 1. Scheduled due cards
    const due = chooseDue(candidateCards, now, recentCards);
    if (due) {
      picked = due;
      kind = 'scheduled';
    } else if (sessionPreset !== 'due') {
      // 2. New cards (strictly among curriculum-active cards)
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

    recentCards = [picked, ...recentCards.slice(0, 3)];
    activateTask({ card: picked, kind });
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
    const isExactKeySkill = getSkillInputPolicy(currentCard.skill).requiresExactOctave;

    if (answerKeyId) {
      wrongKeyIds = [answerKeyId];
    } else if (currentCard.skill === 'patternIdentify') {
      wrongKeyIds = [answerNote];
    }
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

    const wrongIdToClear = answerKeyId || answerNote;
    setTimeout(() => {
      wrongKeyIds = wrongKeyIds.filter(id => id !== wrongIdToClear);
      pulseWrongAnswerNotes = [];
    }, 850);

    setTimeout(() => {
      pulseCorrectKeyIds = [];
      pulseCorrectAnswerNotes = [];
      staffPulseGuide = false;
    }, 1400);
  }

  function applyCorrectAnswerVisuals(answerNote: NoteName, answerKeyId?: string) {
    if (!currentCard) return;
    if (answerKeyId) {
      correctKeyIds = [answerKeyId];
      return;
    }
    if (currentCard.skill === 'identify') {
      pulseCorrectAnswerNotes = [answerNote];
      if (targetKeyId) {
        correctKeyIds = [targetKeyId];
        AudioEngine.getInstance().playPianoByKeyId(targetKeyId, 88);
      }
    } else if (currentCard.skill === 'patternIdentify') {
      correctKeyIds = [answerNote];
    }
  }

  function runQuestionAttempt(params: {
    card: Card;
    kind: ReviewKind;
    isCorrect: boolean;
    answer: NoteName | null;
    answerKeyId?: string | null;
    hintUsedOnFirstAttempt?: boolean;
    responseMs: number;
    inputMethod?: TrialInputMethod;
  }) {
    const cardStateBefore = params.card.memoryState;
    const dueAtBefore = params.card.dueAt;
    const traceContext = currentCard?.id === params.card.id && currentActivationId
      ? {
          sessionId: currentSessionId,
          questionInstanceId: currentQuestionInstanceId,
          activationId: currentActivationId,
          decisionSequence: currentDecisionSequence
        }
      : null;
    const roundState: QuestionRoundState = {
      firstResponseRecorded,
      attempts,
      hintUsed,
      isCompleted,
      isLocked
    };

    const result = submitQuestionAttempt({
      state: roundState,
      card: params.card,
      kind: params.kind,
      isCorrect: params.isCorrect,
      answer: params.answer,
      answerKeyId: params.answerKeyId ?? null,
      hintUsedOnFirstAttempt: params.hintUsedOnFirstAttempt,
      responseMs: params.responseMs,
      settings,
      reviewLog: reviewLogs,
      sessionId: currentSessionId,
      inputMethod: params.inputMethod,
      schedulerReason: currentSchedulerReason ?? undefined
    });

    if (result.logEvent && traceContext) {
      const transitionId = recordSchedulerReviewTransition({
        timestamp: result.logEvent.ts,
        cardId: params.card.id,
        sessionId: traceContext.sessionId,
        questionInstanceId: traceContext.questionInstanceId,
        activationId: traceContext.activationId,
        decisionSequence: traceContext.decisionSequence,
        grade: result.logEvent.grade,
        correct: result.logEvent.firstCorrect,
        firstAttempt: result.isFirstAttempt,
        oldDueAt: dueAtBefore,
        newDueAt: params.card.dueAt,
        oldState: cardStateBefore,
        newState: params.card.memoryState,
        cardMutated: result.cardMutated
      });
      reviewTraceIdByKey.set(`${result.logEvent.ts}:${result.logEvent.sessionId}:${result.logEvent.cardId}`, transitionId);
    }

    firstResponseRecorded = roundState.firstResponseRecorded;
    attempts = roundState.attempts;
    hintUsed = roundState.hintUsed;
    isCompleted = roundState.isCompleted;
    isLocked = roundState.isLocked;

    return result;
  }

  function recordCardReview(
    cardRef: Card | null,
    logEvent: ReviewLogEvent | null,
    cardMutated: boolean
  ) {
    if (isProfileImporting) return Promise.resolve();
    const cardSnapshot = cardRef ? $state.snapshot(cardRef) : null;
    const logSnapshot = $state.snapshot(logEvent);
    const reviewTraceKey = logEvent ? `${logEvent.ts}:${logEvent.sessionId}:${logEvent.cardId}` : null;
    const transitionId = reviewTraceKey ? reviewTraceIdByKey.get(reviewTraceKey) ?? null : null;
    if (reviewTraceKey) reviewTraceIdByKey.delete(reviewTraceKey);
    if (logEvent) pendingReviewCommitCount++;
    const commit = reviewPersistenceQueue.then(async () => {
      reviewLogs = await commitCardReview({
        card: cardSnapshot,
        logEvent: logSnapshot,
        cardMutated,
        reviewLogs,
        persist: async ({ card, event }) => db.transaction(
          'rw',
          db.cards,
          db.reviewLogs,
          async () => {
            const existing = await db.reviewLogs.get(event.ts);
            if (existing) {
              if (
                existing.sessionId === event.sessionId &&
                existing.cardId === event.cardId
              ) return;
              throw new Error(`Review timestamp collision at ${event.ts}.`);
            }
            if (card) await db.cards.put(card);
            await db.reviewLogs.add(event);
          }
        )
      });
    });
    const finalized = commit.then(() => {
      if (transitionId) markSchedulerReviewPersisted(transitionId, true);
    }).catch(error => {
      if (transitionId) markSchedulerReviewPersisted(transitionId, false);
      if (logEvent) reviewPersistenceFailed = true;
      console.warn('Review persistence failed:', error);
    }).finally(() => {
      if (!logEvent) return;
      pendingReviewCommitCount = Math.max(0, pendingReviewCommitCount - 1);
      if (pendingReviewCommitCount === 0 && deferredNextRoundCallId) {
        const callId = deferredNextRoundCallId;
        deferredNextRoundCallId = null;
        queueMicrotask(() => nextRound(callId));
      }
    });
    reviewPersistenceQueue = finalized;
    return finalized;
  }

  async function persistLearningProgressRecords(
    records: readonly LearningProgressRecord[]
  ): Promise<LearningProgressRecord[]> {
    const snapshots = records.map(record => $state.snapshot(record));
    await db.learningProgress.bulkPut(snapshots);
    return snapshots;
  }

  // Answer Submit for Standard Practice & Cold Test
  async function handleAnswerSubmit(
    answerNote: NoteName,
    answerKeyId?: string,
    inputMethod: TrialInputMethod = 'screen'
  ) {
    if (
      !isActivePracticeSession(currentSessionId) ||
      isLocked ||
      !currentCard ||
      isCompleted
    ) return;
    if (!firstResponseRecorded && !claimFirstAnswerCommit(currentSessionId, currentQuestionInstanceId)) {
      return;
    }

    const isExactKeySkill = getSkillInputPolicy(currentCard.skill).requiresExactOctave;
    const targetPitchClass = targetKeyId ? targetKeyId.replace(/[0-9]/g, '') : null;
    const answerPitchClass = answerKeyId ? answerKeyId.replace(/[0-9]/g, '') : answerNote;
    const isPitchMatch = currentCard.skill === 'intervalIdentify' || currentCard.skill === 'triadIdentify'
      ? answerNote === currentCard.note
      : currentCard.skill === 'intervalBuild'
        ? (targetPitchClass !== null && answerPitchClass === targetPitchClass)
        : isCanonicalPitchMatch(answerNote, currentCard.note);
    const isCorrect = isSemanticAnswerCorrect(
      currentCard.skill,
      answerNote,
      currentCard.note,
      answerKeyId,
      targetKeyId
    );
    const isOctaveMismatch = isExactKeySkill && isPitchMatch && Boolean(answerKeyId && targetKeyId && answerKeyId !== targetKeyId);

    // --- COLD TEST: 1 attempt only ---
    if (currentKind === 'cold') {
      stopReactionTimer();
      const responseMs = Math.round(performance.now() - shownPerfMs);
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      coldIndex++;

      if (isCorrect) {
        sessionScore++;
        feedbackText = `✓ ${formatResponseMs(responseMs)} · Cold Test: верно!`;
        feedbackClass = 'good';
        applyCorrectAnswerVisuals(answerNote, answerKeyId);
      } else {
        feedbackClass = 'bad';
        triggerErrorPulse(answerNote, answerKeyId);
        const correctLabel = targetKeyId ? `${DISPLAY_NAMES[currentCard.note]} (${targetKeyId})` : DISPLAY_NAMES[currentCard.note];
        feedbackText = `✗ Cold Test: ответ ${DISPLAY_NAMES[answerNote]}. Правильно: ${correctLabel}. FSRS не меняется.`;
      }

      const cardRef = currentCard;
      const { logEvent, cardMutated } = runQuestionAttempt({
        card: cardRef,
        kind: 'cold',
        isCorrect,
        answer: answerNote,
        answerKeyId: answerKeyId || null,
        hintUsedOnFirstAttempt: false,
        responseMs,
        inputMethod
      });

      if (logEvent) {
        void recordCardReview(cardRef, logEvent, cardMutated);
      }

      scheduleAutoAdvance();
      return;
    }

    // --- STANDARD / SMART PRACTICE (FIRST ATTEMPT OR CORRECTIVE ATTEMPT) ---
    const cardRef = currentCard;
    const kindRef = currentKind;
    const responseMs = !firstResponseRecorded
      ? Math.round(performance.now() - shownPerfMs)
      : 0;

    if (!firstResponseRecorded) {
      stopReactionTimer();
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      if (kindRef === 'scheduled') {
        sessionScheduledReviews++;
        if (isCorrect) sessionScheduledCorrect++;
      }
      if (kindRef === 'new') sessionNewReviews++;
      if (kindRef === 'transfer') {
        sessionTransferTrials++;
        if (isCorrect) sessionTransferCorrect++;
      }
    }

    const attemptResult = runQuestionAttempt({
      card: cardRef,
      kind: kindRef,
      isCorrect,
      answer: answerNote,
      answerKeyId: answerKeyId || null,
      hintUsedOnFirstAttempt: false,
      responseMs,
      inputMethod
    });

    if (attemptResult.isFirstAttempt) {
      if (isCorrect) {
        sessionScore++;
        sessionStreak++;
        feedbackText = `✓ Правильно · ${(responseMs / 1000).toFixed(1)} с`;
        feedbackClass = 'good';
        applyCorrectAnswerVisuals(answerNote, answerKeyId);
        scheduleAutoAdvance();
      } else {
        sessionStreak = 0;
        sessionLapses++;
        feedbackClass = 'bad';
        triggerErrorPulse(answerNote, answerKeyId);

        const hint = getExerciseHint(cardRef);
        if (isOctaveMismatch) {
          feedbackText = `✗ Не та октава! Нота верная (${DISPLAY_NAMES[answerNote]}), но нажата ${answerKeyId}. Требуется ${targetKeyId} (${hint || 'найдите нужную октаву'}). Первая попытка засчитана как ошибка.`;
        } else {
          feedbackText = `✗ Ошибка. Это ${DISPLAY_NAMES[answerNote]}${answerKeyId ? ' (' + answerKeyId + ')' : ''}. Нужна ${DISPLAY_NAMES[cardRef.note]}${targetKeyId ? ' (' + targetKeyId + ')' : ''}. ${hint} Первая попытка засчитана как ошибка.`;
        }
      }

      if (attemptResult.logEvent) {
        void recordCardReview(
          cardRef,
          attemptResult.logEvent,
          attemptResult.cardMutated
        );
      }

      return;
    }

    // --- SUBSEQUENT CORRECTIVE ATTEMPTS ---
    if (isCorrect) {
      applyCorrectAnswerVisuals(answerNote, answerKeyId);
      feedbackClass = 'warn';
      feedbackText = currentKind === 'transfer'
        ? `✓ Исправлено (${attempts}-я попытка). Это задание служит для переноса навыка и не меняет расписание повторений.`
        : currentKind === 'practice' || currentKind === 'confusion'
          ? `✓ Исправлено (${attempts}-я попытка)! ${currentKind === 'confusion' ? 'Контрастная' : 'Свободная'} тренировка.`
          : `✓ Исправлено (${attempts}-я попытка). Для памяти засчитана первая ошибка; карточка вернётся для повторения.`;
      scheduleAutoAdvance();
    } else {
      feedbackClass = 'bad';
      triggerErrorPulse(answerNote, answerKeyId);
      const hint = getExerciseHint(cardRef);
      feedbackText = `Пока нет: ${DISPLAY_NAMES[answerNote]}. Нужна ${DISPLAY_NAMES[cardRef.note]}. ${hint}`;

      if (attempts >= 3) {
        if (targetKeyId) hintKeyIds = [targetKeyId];
        else hintKeyIds = [cardRef.note];
        feedbackText += ' 💡 Нужная клавиша подсвечена!';
      }
    }
  }

  function renderFirstRunStep() {
    if (!firstRunState) return;
    currentCard = null;
    sessionEndsAt = null;
    structuralGuideKeyIds = [...firstRunState.structuralGuideKeyIds];
    modelLabelKeyIds = [...firstRunState.modelLabelKeyIds];
    targetKeyId = firstRunState.identifyTargetKeyId;
    targetKeyIds = firstRunState.identifyTargetKeyId
      ? [firstRunState.identifyTargetKeyId]
      : [];
    shownPerfMs = performance.now();
  }

  function dispatchFirstRunAction(action: FirstRunCfAction) {
    if (!firstRunState) return;
    const responseMs = Math.max(1, Math.round(performance.now() - shownPerfMs));
    const reviewedAt = Date.now();

    const result = applyFirstRunCfActionWithCards({
      state: firstRunState,
      action: { ...action, sessionId: currentSessionId, at: reviewedAt },
      cards,
      settings,
      reviewLog: reviewLogs,
      responseMs,
      reviewedAt
    });

    if (result.ignoredInput) return;

    firstRunState = result.state;

    if (result.updatedProgress.length > 0) {
      const nextMap = new Map(learningProgressMap);
      const snapshots: LearningProgressRecord[] = [];
      for (const rec of result.updatedProgress) {
        const snap = $state.snapshot(rec);
        nextMap.set(snap.id, snap);
        snapshots.push(snap);
      }
      learningProgressMap = nextMap;
      db.learningProgress.bulkPut(snapshots).catch(err => {
        console.warn('Failed to persist first-run learningProgress:', err);
      });
    }

    if (result.attemptResult?.logEvent && result.mutatedCard) {
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      sessionNewReviews++;
      if (result.fsrsDelayedCheck?.isCorrect) {
        sessionScore++;
        sessionStreak++;
      } else {
        sessionStreak = 0;
        sessionLapses++;
      }
      void recordCardReview(
        result.mutatedCard,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (result.outcome === 'advanced') {
      correctKeyIds = [];
      wrongKeyIds = [];
      pulseCorrectAnswerNotes = [];
      pulseWrongAnswerNotes = [];
    } else if (action.type === 'keyPress') {
      const visualId = action.keyId || action.note;
      if (result.outcome === 'wrong_note') {
        wrongKeyIds = [visualId];
        setTimeout(() => {
          wrongKeyIds = wrongKeyIds.filter(id => id !== visualId);
        }, 650);
      } else {
        correctKeyIds = [visualId];
        setTimeout(() => {
          correctKeyIds = correctKeyIds.filter(id => id !== visualId);
        }, 350);
      }
    } else if (action.type === 'semanticAnswer') {
      if (result.outcome === 'wrong_note') {
        pulseWrongAnswerNotes = [action.note];
        setTimeout(() => {
          pulseWrongAnswerNotes = [];
        }, 650);
      } else {
        pulseCorrectAnswerNotes = [action.note];
        if (targetKeyId) {
          AudioEngine.getInstance().playPianoByKeyId(targetKeyId, 88);
        }
        setTimeout(() => {
          pulseCorrectAnswerNotes = [];
        }, 350);
      }
    }

    renderFirstRunStep();
  }

  function completeFirstRunOnboarding() {
    firstRunState = null;
    structuralGuideKeyIds = [];
    modelLabelKeyIds = [];
    if (
      shouldEnterWhiteKeyCurriculum({
        cards,
        reviewLogs,
        learningProgress: learningProgressMap,
        lessonProgress: lessonProgressMap,
        coldTests
      })
    ) {
      curriculumState = createWhiteKeyCurriculumState({
        learningProgress: learningProgressMap,
        cards,
        reviewLogs,
        now: Date.now()
      });
    } else {
      curriculumState = null;
    }
    startLearningSession(sessionPreset);
    nextRound();
  }

  function renderCurriculumStep() {
    if (!curriculumState) return;
    currentCard = null;
    sessionEndsAt = null;
    structuralGuideKeyIds = [...curriculumState.structuralGuideKeyIds];
    modelLabelKeyIds = [...curriculumState.modelLabelKeyIds];
    targetKeyId = curriculumState.identifyTargetKeyId;
    targetKeyIds = curriculumState.identifyTargetKeyId
      ? [curriculumState.identifyTargetKeyId]
      : [];
    shownPerfMs = performance.now();
  }

  function dispatchCurriculumAction(action: WhiteKeyCurriculumAction) {
    if (!curriculumState) return;
    const responseMs = Math.max(1, Math.round(performance.now() - shownPerfMs));
    const reviewedAt = Date.now();

    const result = applyCurriculumActionWithCards({
      state: curriculumState,
      action: { ...action, sessionId: currentSessionId, at: reviewedAt },
      cards,
      settings,
      reviewLog: reviewLogs,
      responseMs,
      reviewedAt
    });

    if (result.ignoredInput) return;

    curriculumState = result.state;

    if (result.updatedProgress.length > 0) {
      const nextMap = new Map(learningProgressMap);
      const snapshots: LearningProgressRecord[] = [];
      for (const rec of result.updatedProgress) {
        const snap = $state.snapshot(rec);
        nextMap.set(snap.id, snap);
        snapshots.push(snap);
      }
      learningProgressMap = nextMap;
      db.learningProgress.bulkPut(snapshots).catch(err => {
        console.warn('Failed to persist curriculum learningProgress:', err);
      });
    }

    if (result.attemptResult?.logEvent && result.mutatedCard) {
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      sessionNewReviews++;
      if (result.fsrsDelayedCheck?.isCorrect) {
        sessionScore++;
        sessionStreak++;
      } else {
        sessionStreak = 0;
        sessionLapses++;
      }
      void recordCardReview(
        result.mutatedCard,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (action.type === 'completePhase3') {
      return;
    }

    if (result.outcome === 'advanced') {
      correctKeyIds = [];
      wrongKeyIds = [];
      pulseCorrectAnswerNotes = [];
      pulseWrongAnswerNotes = [];
      nextRound();
      return;
    }

    if (action.type === 'keyPress') {
      const visualId = action.keyId || action.note;
      if (result.outcome === 'wrong_note') {
        wrongKeyIds = [visualId];
        setTimeout(() => {
          wrongKeyIds = wrongKeyIds.filter(id => id !== visualId);
        }, 650);
      } else {
        correctKeyIds = [visualId];
        setTimeout(() => {
          correctKeyIds = correctKeyIds.filter(id => id !== visualId);
        }, 350);
      }
    } else if (action.type === 'semanticAnswer') {
      if (result.outcome === 'wrong_note') {
        pulseWrongAnswerNotes = [action.note];
        setTimeout(() => {
          pulseWrongAnswerNotes = [];
        }, 650);
      } else {
        pulseCorrectAnswerNotes = [action.note];
        if (targetKeyId) {
          AudioEngine.getInstance().playPianoByKeyId(targetKeyId, 88);
        }
        setTimeout(() => {
          pulseCorrectAnswerNotes = [];
        }, 350);
      }
    }

    renderCurriculumStep();
  }

  function completeCurriculumPhase3() {
    if (curriculumState && curriculumState.step === 'phase3Complete') {
      dispatchCurriculumAction({ type: 'completePhase3' });
    }
    curriculumState = null;
    structuralGuideKeyIds = [];
    modelLabelKeyIds = [];
    if (
      shouldEnterMilestone3dCurriculum({
        cards,
        reviewLogs,
        learningProgress: learningProgressMap
      })
    ) {
      curriculum3dState = createMilestone3dCurriculumState({
        learningProgress: learningProgressMap,
        cards,
        reviewLogs,
        now: Date.now()
      });
    } else {
      curriculum3dState = null;
    }
    startLearningSession(sessionPreset);
    nextRound();
  }

  function renderCurriculum3dStep() {
    if (!curriculum3dState) return;
    currentCard = null;
    sessionEndsAt = null;
    structuralGuideKeyIds = [...curriculum3dState.structuralGuideKeyIds];
    modelLabelKeyIds = [...curriculum3dState.modelLabelKeyIds];
    targetKeyId = curriculum3dState.identifyTargetKeyId ?? curriculum3dState.targetKeyId;
    targetKeyIds = curriculum3dState.identifyTargetKeyId
      ? [curriculum3dState.identifyTargetKeyId]
      : [];
    shownPerfMs = performance.now();

    const desc = describeMilestone3dStep(curriculum3dState.step);
    if (desc.phase === 6 && desc.kind !== 'phase6Complete' && targetKeyId) {
      setTimeout(() => playSoundPrompt(), 220);
    }
  }

  function dispatchCurriculum3dAction(action: Milestone3dAction) {
    if (!curriculum3dState) return;
    const responseMs = Math.max(1, Math.round(performance.now() - shownPerfMs));
    const reviewedAt = Date.now();

    const result = applyMilestone3dActionWithCards({
      state: curriculum3dState,
      action: { ...action, sessionId: currentSessionId, at: reviewedAt },
      cards,
      settings,
      reviewLog: reviewLogs,
      responseMs,
      reviewedAt
    });

    if (result.ignoredInput) return;

    curriculum3dState = result.state;

    if (result.updatedProgress.length > 0) {
      const nextMap = new Map(learningProgressMap);
      const snapshots: LearningProgressRecord[] = [];
      for (const rec of result.updatedProgress) {
        const snap = $state.snapshot(rec);
        nextMap.set(snap.id, snap);
        snapshots.push(snap);
      }
      learningProgressMap = nextMap;
      db.learningProgress.bulkPut(snapshots).catch(err => {
        console.warn('Failed to persist curriculum 3D learningProgress:', err);
      });
    }

    if (result.attemptResult?.logEvent && result.mutatedCard) {
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      sessionNewReviews++;
      if (result.fsrsDelayedCheck?.isCorrect) {
        sessionScore++;
        sessionStreak++;
      } else {
        sessionStreak = 0;
        sessionLapses++;
      }
      void recordCardReview(
        result.mutatedCard,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (result.outcome === 'advanced') {
      correctKeyIds = [];
      wrongKeyIds = [];
      pulseCorrectAnswerNotes = [];
      pulseWrongAnswerNotes = [];
      nextRound();
      return;
    }

    if (action.type === 'keyPress') {
      const visualId = action.keyId || action.note;
      if (result.outcome === 'wrong_note' || result.outcome === 'wrong_octave') {
        wrongKeyIds = [visualId];
        setTimeout(() => {
          wrongKeyIds = wrongKeyIds.filter(id => id !== visualId);
        }, 650);
      } else {
        correctKeyIds = [visualId];
        setTimeout(() => {
          correctKeyIds = correctKeyIds.filter(id => id !== visualId);
        }, 350);
      }
    } else if (action.type === 'semanticAnswer') {
      if (result.outcome === 'wrong_note') {
        pulseWrongAnswerNotes = [action.note];
        setTimeout(() => {
          pulseWrongAnswerNotes = [];
        }, 650);
      } else {
        pulseCorrectAnswerNotes = [action.note];
        if (targetKeyId) {
          AudioEngine.getInstance().playPianoByKeyId(targetKeyId, 88);
        }
        setTimeout(() => {
          pulseCorrectAnswerNotes = [];
        }, 350);
      }
    }

    renderCurriculum3dStep();
  }

  function advanceCurriculum3dPhase() {
    if (!curriculum3dState) return;
    const finishingPhase6 = curriculum3dState.step === 'phase6Complete';
    dispatchCurriculum3dAction({ type: 'advancePhase' });
    if (finishingPhase6) {
      curriculum3dState = null;
      structuralGuideKeyIds = [];
      modelLabelKeyIds = [];
      startLearningSession(sessionPreset);
      nextRound();
    }
  }

  function syncBassGrandVisuals() {
    if (!bassGrandState) return;
    structuralGuideKeyIds = [...bassGrandState.structuralGuideKeyIds];
    modelLabelKeyIds = [...bassGrandState.modelLabelKeyIds];
    targetKeyId = bassGrandState.targetKeyId;
    targetKeyIds = [...bassGrandState.targetKeyIds];
  }

  /**
   * Canonical advanced-module lifecycle: at most one advanced module may be active.
   * Clears every sibling module state and returns the requested one untouched.
   */
  function clearActiveAdvancedModuleStates(keep: AdvancedModuleId | null = null) {
    if (keep !== 'chordRhythm') {
      cancelChordRhythmRun('переключение модуля');
      dailyRhythmViewState = null;
    }
    const next = resetAdvancedModuleStates({
      bassGrandStaff: bassGrandState,
      intervals: intervalState,
      triads: triadState,
      inversions: inversionState,
      harmony: harmonyState,
      chordRhythm: chordRhythmState
    }, keep);
    bassGrandState = next.bassGrandStaff;
    intervalState = next.intervals;
    triadState = next.triads;
    inversionState = next.inversions;
    harmonyState = next.harmony;
    chordRhythmState = next.chordRhythm;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
  }

  function handleStartBassGrandModule() {
    if (!advancedModuleStates.bassGrandStaff.available) return;
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('bassGrandStaff');
    clearActiveTask();
    bassGrandState = createBassGrandCurriculumState({
      learningProgress: learningProgressMap,
      cards,
      reviewLogs,
      now: Date.now()
    });
    syncBassGrandVisuals();
  }

  async function dispatchBassGrandAction(action: BassGrandAction) {
    if (!bassGrandState || !isActivePracticeSession(currentSessionId) || bassGrandCompletionSaving) return;
    const result = applyBassGrandActionWithCards({
      state: bassGrandState,
      action,
      cards,
      reviewLogs,
      settings,
      now: Date.now()
    });

    const terminalCompletion = result.state.step === 'moduleComplete' &&
      result.updatedProgress.some(record =>
        record.id === BASS_GRAND_ITEM_IDS.COMPLETE && record.state === 'retention'
      );

    if (terminalCompletion) {
      bassGrandCompletionSaving = true;
      try {
        const completionRecords = result.updatedProgress.map(record => $state.snapshot(record));
        const persistedRecords = await db.transaction(
          'rw',
          db.learningProgress,
          async () => {
            await db.learningProgress.bulkPut(completionRecords);
            return db.learningProgress.bulkGet(completionRecords.map(record => record.id));
          }
        );
        if (persistedRecords.some(record => !record)) {
          throw new Error('Bass Grand completion records were not readable after the write');
        }
        const nextProgressMap = new Map(learningProgressMap);
        for (const record of persistedRecords) {
          if (record) nextProgressMap.set(record.id, record);
        }
        const resolved = resolveAdvancedModuleStates({
          learningProgress: nextProgressMap,
          cards,
          reviewLogs
        });
        if (resolved.bassGrandStaff.state !== 'completed') {
          throw new Error('Persisted Bass Grand completion did not resolve as completed');
        }
        learningProgressMap = nextProgressMap;
        bassGrandState = result.state;
        syncBassGrandVisuals();
      } catch (error) {
        console.error('Bass Grand completion persistence failed:', error);
        bassGrandState = {
          ...bassGrandState,
          feedbackText: 'Не удалось сохранить завершение модуля. Повторите последний шаг.',
          feedbackTone: 'bad'
        };
        syncBassGrandVisuals();
      } finally {
        bassGrandCompletionSaving = false;
      }
      return;
    }

    bassGrandState = result.state;
    syncBassGrandVisuals();

    if (result.updatedProgress.length) {
      const savedProgress = await persistLearningProgressRecords(result.updatedProgress);
      for (const p of savedProgress) learningProgressMap.set(p.id, p);
      learningProgressMap = new Map(learningProgressMap);
    }

    if (result.attemptResult?.logEvent) {
      await recordCardReview(
        result.mutatedCard ?? cards.find(card => card.id === result.attemptResult!.logEvent!.cardId) ?? null,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (action.type === 'keyPress') {
      const visualId = action.keyId || (action.note ? `${action.note}3` : '');
      if (result.outcome === 'wrong_note' || result.outcome === 'wrong_octave') {
        wrongKeyIds = [visualId];
        setTimeout(() => {
          wrongKeyIds = wrongKeyIds.filter(id => id !== visualId);
        }, 650);
      } else {
        correctKeyIds = [visualId];
        setTimeout(() => {
          correctKeyIds = correctKeyIds.filter(id => id !== visualId);
        }, 350);
      }
    }
  }

  function handleBassGrandDontKnow() {
    if (!isBassGrandActive || !bassGrandState) return;
    if (!canUseDontKnowInBassGrandStep(bassGrandState)) return;
    dispatchBassGrandAction({ type: 'dontKnow' });
  }

  function handleAdvanceBassGrandStage() {
    dispatchBassGrandAction({ type: 'advanceStage' });
  }

  function handleCompleteBassGrandModule() {
    bassGrandState = null;
    clearActiveTask();
    startLearningSession(sessionPreset);
    nextRound();
  }

  function syncIntervalVisuals() {
    if (!intervalState) return;
    structuralGuideKeyIds = [...intervalState.structuralGuideKeyIds];
    modelLabelKeyIds = [...intervalState.modelLabelKeyIds];
    targetKeyId = intervalState.targetKeyId || null;
    targetKeyIds = [...intervalState.targetKeyIds];
  }

  function handleStartIntervalModule() {
    if (!advancedModuleStates.intervals.available) return;
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('intervals');
    clearActiveTask();
    intervalState = createIntervalCurriculumState({
      learningProgress: learningProgressMap,
      cards,
      reviewLogs,
      now: Date.now()
    });
    syncIntervalVisuals();
  }

  async function dispatchIntervalAction(action: IntervalAction) {
    if (!intervalState || !isActivePracticeSession(currentSessionId)) return;
    const result = applyIntervalActionWithCards({
      state: intervalState,
      action,
      cards,
      reviewLogs,
      settings,
      now: Date.now()
    });

    intervalState = result.state;
    syncIntervalVisuals();

    if (result.updatedProgress.length) {
      const savedProgress = await persistLearningProgressRecords(result.updatedProgress);
      for (const p of savedProgress) {
        learningProgressMap.set(p.id, p);
      }
      learningProgressMap = new Map(learningProgressMap);
    }

    if (result.attemptResult?.logEvent) {
      await recordCardReview(
        result.mutatedCard ?? cards.find(card => card.id === result.attemptResult!.logEvent!.cardId) ?? null,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (action.type === 'keyPress') {
      const visualId = action.keyId || (action.note ? `${action.note}4` : '');
      if (result.outcome === 'wrong_note' || result.outcome === 'wrong_octave') {
        wrongKeyIds = [visualId];
        setTimeout(() => {
          wrongKeyIds = wrongKeyIds.filter(id => id !== visualId);
        }, 650);
      } else {
        correctKeyIds = [visualId];
        setTimeout(() => {
          correctKeyIds = correctKeyIds.filter(id => id !== visualId);
        }, 350);
      }
    }
  }

  function handleIntervalDontKnow() {
    if (!isIntervalActive || !intervalState) return;
    if (!canUseDontKnowInIntervalStep(intervalState)) return;
    dispatchIntervalAction({ type: 'dontKnow' });
  }

  function handleAdvanceIntervalStage() {
    dispatchIntervalAction({ type: 'advanceStage' });
  }

  function handleIntervalSelectAnswer(intervalId: IntervalId) {
    dispatchIntervalAction({ type: 'selectAnswer', intervalId });
  }

  function handleCompleteIntervalModule() {
    intervalState = null;
    clearActiveTask();
    startLearningSession(sessionPreset);
    nextRound();
  }

  function playTriadAudio(keyIds: readonly string[]) {
    if (!keyIds.length) return;
    const audioEngine = AudioEngine.getInstance();
    // Broken chord (arpeggio)
    keyIds.forEach((k, idx) => {
      setTimeout(() => {
        audioEngine.playPianoByKeyId(k, 80, 450);
      }, idx * 260);
    });
    // Block chord
    setTimeout(() => {
      keyIds.forEach(k => {
        audioEngine.playPianoByKeyId(k, 88, 950);
      });
    }, keyIds.length * 260 + 350);
  }

  function syncTriadVisuals() {
    if (!triadState) return;
    structuralGuideKeyIds = [...triadState.structuralGuideKeyIds];
    modelLabelKeyIds = [...triadState.modelLabelKeyIds];
    targetKeyId = triadState.targetKeyId || null;
    targetKeyIds = [...triadState.targetKeyIds];
    selectedKeyIds = [...triadState.selectedKeyIds];
  }

  function handleStartTriadModule() {
    if (!advancedModuleStates.triads.available) return;
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('triads');
    clearActiveTask();
    triadState = createTriadCurriculumState({
      learningProgress: learningProgressMap,
      cards,
      reviewLogs,
      now: Date.now()
    });
    syncTriadVisuals();
    if (triadState.targetTriadKeyIds.length) {
      setTimeout(() => {
        if (triadState?.targetTriadKeyIds.length) {
          playTriadAudio(triadState.targetTriadKeyIds);
        }
      }, 300);
    }
  }

  async function dispatchTriadAction(action: TriadAction) {
    if (!triadState || !isActivePracticeSession(currentSessionId)) return;
    const cardsMap = new Map<string, Card>();
    for (const c of cards) cardsMap.set(c.id, c);

    const result = applyTriadActionWithCards({
      state: triadState,
      action,
      cards: cardsMap,
      userSettings: settings,
      now: Date.now()
    });

    triadState = result.state;
    syncTriadVisuals();

    if (result.updatedProgress.length) {
      const savedProgress = await persistLearningProgressRecords(result.updatedProgress);
      for (const p of savedProgress) {
        learningProgressMap.set(p.id, p);
      }
      learningProgressMap = new Map(learningProgressMap);
    }

    if (result.attemptResult?.logEvent) {
      await recordCardReview(
        result.mutatedCard ?? cardsMap.get(result.attemptResult.logEvent.cardId) ?? null,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (action.type === 'submitChord') {
      const keys = action.keyIds || triadState.selectedKeyIds;
      if (result.outcome === 'correct') {
        correctKeyIds = [...keys];
        playTriadAudio(keys);
        setTimeout(() => {
          correctKeyIds = [];
        }, 500);
      } else {
        wrongKeyIds = [...keys];
        setTimeout(() => {
          wrongKeyIds = [];
        }, 650);
      }
    }
  }

  function handleTriadDontKnow() {
    if (!isTriadActive || !triadState) return;
    if (!canUseDontKnowInTriadStep(triadState)) return;
    dispatchTriadAction({ type: 'dontKnow' });
  }

  function handleAdvanceTriadStage() {
    dispatchTriadAction({ type: 'advanceStage' });
    if (triadState?.targetTriadKeyIds.length) {
      setTimeout(() => {
        if (triadState?.targetTriadKeyIds.length) {
          playTriadAudio(triadState.targetTriadKeyIds);
        }
      }, 250);
    }
  }

  function handleTriadSelectAnswer(quality: TriadQuality) {
    if (isTriadActive && triadState) {
      dispatchTriadAction({ type: 'selectAnswer', quality });
      return;
    }
    if (currentCard?.skill === 'triadIdentify') {
      void handleAnswerSubmit(quality, undefined, 'answerButton');
    }
  }

  function handleTriadSubmitChord() {
    if (!triadState) return;
    dispatchTriadAction({ type: 'submitChord', keyIds: triadState.selectedKeyIds });
  }

  function handleTriadToggleKey(keyId: string) {
    if (!triadState) return;
    dispatchTriadAction({ type: 'toggleKey', keyId });
  }

  function handleCompleteTriadModule() {
    triadState = null;
    clearActiveTask();
    startLearningSession(sessionPreset);
    nextRound();
  }

  function syncInversionVisuals() {
    if (!inversionState) return;
    structuralGuideKeyIds = [...inversionState.structuralGuideKeyIds];
    modelLabelKeyIds = [];
    targetKeyId = inversionState.targetKeyIds[0] ?? null;
    targetKeyIds = [...inversionState.targetKeyIds];
    selectedKeyIds = [...inversionState.selectedKeyIds];
  }

  function handleStartInversionModule() {
    if (!advancedModuleStates.chordInversions.available) return;
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('inversions');
    clearActiveTask();
    inversionState = createInversionCurriculumState(learningProgressMap, Date.now());
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
    syncInversionVisuals();
    if (inversionState.expectedVoicingKeyIds.length) {
      setTimeout(() => {
        if (inversionState?.expectedVoicingKeyIds.length) {
          playTriadAudio(inversionState.expectedVoicingKeyIds);
        }
      }, 300);
    }
  }

  function handleContinueCurrentPhase(phaseId: string) {
    activePage = 'practice';
    practiceActivity = 'standard';
    clearActiveTask();
    if (phaseId === 'anchors') {
      if (!isFirstRunCfCompleted(learningProgressMap)) {
        firstRunState = createFirstRunCfState(learningProgressMap, Date.now());
        curriculumState = null;
        curriculum3dState = null;
        inversionState = null;
        renderFirstRunStep();
        return;
      }
    }
    startLearningSession('normal');
    nextRound();
  }

  async function dispatchInversionAction(action: InversionAction) {
    if (!inversionState || !isActivePracticeSession(currentSessionId)) return;
    const cardsMap = new Map<string, Card>();
    for (const c of cards) cardsMap.set(c.id, c);

    const result = applyInversionAction(
      inversionState,
      action,
      {
        now: Date.now(),
        settings,
        reviewLogs,
        sessionId: currentSessionId
      }
    );

    inversionState = result.state;
    syncInversionVisuals();

    if (result.updatedProgress.length) {
      const savedProgress = await persistLearningProgressRecords(result.updatedProgress);
      for (const p of savedProgress) {
        learningProgressMap.set(p.id, p);
      }
      learningProgressMap = new Map(learningProgressMap);
    }

    if (result.attemptResult?.logEvent) {
      await recordCardReview(
        result.mutatedCard ?? cardsMap.get(result.attemptResult.logEvent.cardId) ?? null,
        result.attemptResult.logEvent,
        result.attemptResult.cardMutated
      );
    }

    if (action.type === 'submitChord') {
      const keys = action.keyIds || inversionState.selectedKeyIds;
      if (result.outcome === 'correct') {
        correctKeyIds = [...keys];
        playTriadAudio(keys);
        setTimeout(() => {
          correctKeyIds = [];
        }, 500);
      } else {
        wrongKeyIds = [...keys];
        setTimeout(() => {
          wrongKeyIds = [];
        }, 650);
      }
    }
  }

  function handleInversionDontKnow() {
    if (!isInversionActive || !inversionState) return;
    if (!canUseDontKnowInInversionStep(inversionState)) return;
    dispatchInversionAction({ type: 'dontKnow' });
  }

  function handleAdvanceInversionStage() {
    dispatchInversionAction({ type: 'advanceStage' });
    if (inversionState?.expectedVoicingKeyIds.length) {
      setTimeout(() => {
        if (inversionState?.expectedVoicingKeyIds.length) {
          playTriadAudio(inversionState.expectedVoicingKeyIds);
        }
      }, 250);
    }
  }

  function handleInversionSelect(inversion: TriadInversion) {
    if (isInversionActive && inversionState) {
      dispatchInversionAction({ type: 'selectAnswer', inversion });
      return;
    }
    if (currentCard?.skill === 'triadInversionIdentify') {
      void handleAnswerSubmit(inversion, undefined, 'answerButton');
    }
  }

  function handleInversionSubmitChord() {
    if (!inversionState) return;
    dispatchInversionAction({ type: 'submitChord', keyIds: inversionState.selectedKeyIds });
  }

  function handleInversionToggleKey(keyId: string) {
    if (!inversionState || !canInputInversionChord(inversionState)) return;
    dispatchInversionAction({ type: 'toggleKey', keyId });
  }

  function handleCompleteInversionModule() {
    inversionState = null;
    clearActiveTask();
    startLearningSession(sessionPreset);
    nextRound();
  }

  function syncHarmonyVisuals() {
    if (!harmonyState) return;
    const chord = getCurrentHarmonyChord(harmonyState);
    structuralGuideKeyIds = [];
    targetKeyId = null;
    targetKeyIds = [];
    modelLabelKeyIds = chord && shouldShowHarmonyVoicingHint(harmonyState) ? [...chord.keyIds] : [];
    selectedKeyIds = [...harmonyState.selectedKeyIds];
  }

  function handleStartHarmonyModule() {
    if (!advancedModuleStates.harmony.available) return;
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('harmony');
    clearActiveTask();
    harmonyState = createHarmonyCurriculumState(learningProgressMap, Date.now());
    sessionEndsAt = null;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
    syncHarmonyVisuals();
  }

  function dispatchHarmonyAction(action: HarmonyAction) {
    const commit = harmonyActionQueue.then(() => persistHarmonyAction(action));
    harmonyActionQueue = commit.catch(() => {});
    return commit;
  }

  async function persistHarmonyAction(action: HarmonyAction) {
    const previous = harmonyState;
    if (!previous || !isActivePracticeSession(currentSessionId)) return;
    const result = applyHarmonyAction(previous, action, Date.now());
    const terminalCompletion = result.state.step === 'moduleComplete' &&
      result.updatedProgress.some(record => record.id === HARMONY_ITEM_IDS.COMPLETE && record.state === 'retention');
    try {
      const snapshots = result.updatedProgress.map(record => $state.snapshot(record));
      const persistedRecords = await db.transaction('rw', db.learningProgress, async () => {
        await db.learningProgress.bulkPut(snapshots);
        return db.learningProgress.bulkGet(snapshots.map(record => record.id));
      });
      if (persistedRecords.some(record => !record)) {
        throw new Error('Harmony progress was not readable after persistence');
      }
      const nextProgressMap = new Map(learningProgressMap);
      for (const record of persistedRecords) {
        if (record) nextProgressMap.set(record.id, record);
      }
      if (terminalCompletion) {
        const resolved = resolveAdvancedModuleStates({ learningProgress: nextProgressMap, cards, reviewLogs });
        if (resolved.harmony.state !== 'completed') {
          throw new Error('Persisted Harmony completion did not resolve as completed');
        }
      }
      learningProgressMap = nextProgressMap;
      harmonyState = result.state;
      syncHarmonyVisuals();
    } catch (error) {
      console.error('Harmony progress persistence failed:', error);
      harmonyState = {
        ...previous,
        feedbackText: 'Не удалось сохранить этот шаг. Повторите действие; прогресс не был продвинут.',
        feedbackTone: 'bad'
      };
      syncHarmonyVisuals();
      return;
    }

    if (action.type === 'submitChord') {
      const keys = action.keyIds ?? previous.selectedKeyIds;
      if (result.outcome === 'correct') {
        correctKeyIds = [...keys];
        wrongKeyIds = [];
        setTimeout(() => { correctKeyIds = correctKeyIds.filter(id => !keys.includes(id)); }, 450);
      } else if (result.outcome === 'wrong') {
        wrongKeyIds = [...keys];
        correctKeyIds = [];
        setTimeout(() => { wrongKeyIds = wrongKeyIds.filter(id => !keys.includes(id)); }, 650);
      }
    }
  }

  function handleHarmonyKeyToggle(keyId: string) {
    if (harmonyState && canInputHarmonyChord(harmonyState)) {
      void dispatchHarmonyAction({ type: 'toggleKey', keyId });
    }
  }

  function handleCompleteHarmonyModule() {
    if (!harmonyState || harmonyState.step !== 'moduleComplete' || advancedModuleStates.harmony.state !== 'completed') return;
    harmonyState = null;
    activePage = 'curriculum';
    clearActiveTask();
    startLearningSession(sessionPreset);
    nextRound();
  }

  function rhythmSnapshotFor(state: ChordRhythmModuleState): NonNullable<LearningProgressRecord['chordRhythmSnapshot']> {
    return {
      stage: state.step,
      sequenceIndex: state.sequenceIndex,
      assessment: {
        blockKind: state.assessment.blockKind,
        phase: state.assessment.phase,
        trialIndex: state.assessment.trialIndex,
        trialsCompleted: state.assessment.trialsCompleted,
        correctFirstAttempts: state.assessment.correctFirstAttempts,
        failedTrialIndexes: [...state.assessment.failedTrialIndexes],
        remediationTrialIndexes: [...state.assessment.remediationTrialIndexes],
        remediationIndex: state.assessment.remediationIndex,
        remediationUsed: state.assessment.remediationUsed,
        pendingCorrective: state.assessment.pendingCorrective,
        scoredQuestionIds: [...state.assessment.scoredQuestionIds]
      }
    };
  }

  /**
   * Optimistically applies the reduced state and serializes the snapshot write.
   * The UI never runs ahead of the persisted state while a queued write is in flight.
   */
  function persistChordRhythmState(next: ChordRhythmModuleState) {
    const previous = chordRhythmState;
    if (!previous || !isActivePracticeSession(currentSessionId)) return Promise.resolve();
    chordRhythmState = next;
    const existing = learningProgressMap.get(CHORD_RHYTHM_ITEM_IDS.SESSION) ??
      createInitialLearningProgress(CHORD_RHYTHM_ITEM_IDS.SESSION, Date.now());
    const record: LearningProgressRecord = {
      ...existing,
      state: existing.state === 'unseen' ? 'introduced' : existing.state,
      modelCompleted: true,
      chordRhythmSnapshot: rhythmSnapshotFor(next),
      updatedAt: Date.now()
    };
    const commit = chordRhythmActionQueue.then(async () => {
      await db.learningProgress.put($state.snapshot(record));
      const saved = await db.learningProgress.get(record.id);
      if (!saved) throw new Error('Chord rhythm progress was not readable after persistence');
      const nextMap = new Map(learningProgressMap);
      nextMap.set(saved.id, saved);
      learningProgressMap = nextMap;
    }).catch(error => {
      console.error('Chord rhythm progress persistence failed:', error);
      chordRhythmState = {
        ...previous,
        feedbackText: 'Не удалось сохранить этот шаг. Повторите действие; прогресс не был продвинут.',
        feedbackTone: 'bad'
      };
    });
    chordRhythmActionQueue = commit;
    return commit;
  }

  function updateChordRhythmState(action: ChordRhythmAction, persist = false) {
    if (!chordRhythmState) return;
    const next = reduceChordRhythmState(chordRhythmState, action);
    if (persist) void persistChordRhythmState(next);
    else chordRhythmState = next;
  }

  function handleStartChordRhythmModule() {
    if (!advancedModuleStates.chordRhythm.available) return;
    cancelChordRhythmRun('переход в модуль');
    activePage = 'practice';
    practiceActivity = 'standard';
    firstRunState = null;
    curriculumState = null;
    curriculum3dState = null;
    clearActiveAdvancedModuleStates('chordRhythm');
    clearActiveTask();
    chordRhythmState = createChordRhythmModuleState(learningProgressMap);
    sessionEndsAt = null;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
  }

  function handleAdvanceChordRhythmStage() {
    if (!chordRhythmState || !isActivePracticeSession(currentSessionId)) return;
    const sequenceStage = chordRhythmState.step === 'fullProgression' || chordRhythmState.step === 'independentPlay';
    if (sequenceStage && chordRhythmState.sequenceIndex < 4) {
      chordRhythmState = {
        ...chordRhythmState,
        feedbackText: '', feedbackTone: '', lastOutcome: null, outcomes: [], attemptIndex: 0,
        selectedKeyIds: [], expectedOnset: null, isRunning: false
      };
      return;
    }
    updateChordRhythmState({ type: 'advanceStage' }, true);
  }

  function startChordRhythmRemediation() {
    if (!chordRhythmState || !isActivePracticeSession(currentSessionId)) return;
    if (!canStartRhythmRemediation(chordRhythmState.assessment)) return;
    updateChordRhythmState({ type: 'startRemediation' }, true);
  }

  function finishChordRhythmRemediationItem() {
    if (!chordRhythmState || !isActivePracticeSession(currentSessionId)) return;
    updateChordRhythmState({ type: 'finishRemediationItem' }, true);
  }

  async function completeChordRhythmModule() {
    if (!chordRhythmState || !isActivePracticeSession(currentSessionId)) return;
    if (chordRhythmState.assessment.phase !== 'passed') return;
    const now = Date.now();
    const completionIds = [
      CHORD_RHYTHM_ITEM_IDS.PULSE,
      CHORD_RHYTHM_ITEM_IDS.CHANGE,
      CHORD_RHYTHM_ITEM_IDS.PATTERN,
      CHORD_RHYTHM_ITEM_IDS.COMPLETE
    ];
    const progressRecords = completionIds.map(id => {
      const previous = learningProgressMap.get(id) ?? createInitialLearningProgress(id, now);
      return {
        ...previous,
        state: 'retention' as const,
        modelCompleted: true,
        independentUnhintedSuccesses: Math.max(1, previous.independentUnhintedSuccesses),
        currentHintLevel: 0 as const,
        contexts: previous.contexts.includes('m3k:transfer-assessment') ? [...previous.contexts] : [...previous.contexts, 'm3k:transfer-assessment'],
        updatedAt: now
      };
    });
    const cardsToCreate = chordRhythmCardNotes()
      .filter(item => !cards.some(card => card.id === `${item.skill}:${item.note}`))
      .map(item => createFreshCard(item.skill, item.note));
    const nextState = reduceChordRhythmState(chordRhythmState, { type: 'completeModule' });
    try {
      await db.transaction('rw', db.learningProgress, db.cards, async () => {
        await db.learningProgress.bulkPut(progressRecords.map(record => $state.snapshot(record)));
        if (cardsToCreate.length) await db.cards.bulkPut(cardsToCreate.map(card => $state.snapshot(card)));
        const saved = await db.learningProgress.bulkGet(completionIds);
        if (saved.some(record => !record || record.state !== 'retention')) throw new Error('Chord rhythm completion did not persist');
      });
      const nextProgress = new Map(learningProgressMap);
      for (const record of progressRecords) nextProgress.set(record.id, record);
      const nextCards = [...cards];
      for (const card of cardsToCreate) nextCards.push(card);
      learningProgressMap = nextProgress;
      cards = nextCards;
      chordRhythmState = nextState;
    } catch (error) {
      console.error('Chord rhythm completion persistence failed:', error);
      chordRhythmState = { ...chordRhythmState, feedbackText: 'Не удалось сохранить завершение модуля. Повторите последний шаг.', feedbackTone: 'bad' };
    }
  }

  function returnFromChordRhythmFailure() {
    if (!chordRhythmState) return;
    const targetStep = targetedRemediationStep(chordRhythmState);
    const next: ChordRhythmModuleState = {
      ...chordRhythmState,
      step: targetStep,
      sequenceIndex: 0,
      selectedKeyIds: [],
      assessment: createRhythmAssessment('initial'),
      activeBeat: -1,
      countInValue: null,
      expectedOnset: null,
      isRunning: false,
      attemptIndex: 0,
      outcomes: [],
      feedbackText: 'Сфокусируемся на слабом навыке: пройдите короткий учебный этап и вернитесь к проверке.',
      feedbackTone: 'warn',
      lastTimingBand: null,
      lastOutcome: null
    };
    void persistChordRhythmState(next);
  }

  /** Canonical M3K exit: completion is already persisted, then the module state is released. */
  function exitChordRhythmModule(destination: 'curriculum' | 'practice' = 'curriculum') {
    if (!chordRhythmState) return;
    cancelChordRhythmRun('завершение модуля');
    chordRhythmState = null;
    dailyRhythmViewState = null;
    clearActiveTask();
    activePage = destination;
    startLearningSession(sessionPreset);
    nextRound();
  }

  function rhythmTargetChord(state: ChordRhythmModuleState): HarmonyChordId {
    return resolveRhythmTargetChord(state);
  }

  function rhythmDailySkill(card: Card | null): 'chordPulse' | 'chordChangeTiming' | 'chordRhythmPattern' | null {
    if (card?.skill === 'chordPulse' || card?.skill === 'chordChangeTiming' || card?.skill === 'chordRhythmPattern') return card.skill;
    return null;
  }

  function setRhythmFeedback(moduleMode: boolean, text: string, tone: 'good' | 'bad' | 'warn' | '') {
    if (moduleMode) {
      if (chordRhythmState) chordRhythmState = { ...chordRhythmState, feedbackText: text, feedbackTone: tone };
    } else if (dailyRhythmViewState) {
      dailyRhythmFeedback = text;
      dailyRhythmFeedbackTone = tone;
    }
  }

  function pushRhythmAttemptTrace(trace: RhythmAttemptTrace) {
    m3kRecentAttempts = [...m3kRecentAttempts, trace].slice(-5);
    if (typeof window !== 'undefined') {
      (window as unknown as { __m3kRecentAttempts: RhythmAttemptTrace[] }).__m3kRecentAttempts = m3kRecentAttempts;
    }
  }

  function resolveRhythmMidiNotes(keyIds: readonly string[]): number[] {
    return keyIds
      .map(keyId => rhythmMidiByKeyId.get(keyId) ?? midiFromKeyId(keyId))
      .filter((midi): midi is number => midi !== null);
  }

  function cancelChordRhythmRun(reason: string) {
    rhythmRunGeneration += 1;
    if (rhythmDeadlineTimer != null) window.clearTimeout(rhythmDeadlineTimer);
    rhythmDeadlineTimer = null;
    if (rhythmLateCutoffTimer != null) window.clearTimeout(rhythmLateCutoffTimer);
    rhythmLateCutoffTimer = null;
    rhythmClock.stop();
    rhythmOutcomePending = false;
    midiChordTracker.reset();
    midiChordHeldKeyIds = [];
    if (chordRhythmState?.isRunning) {
      chordRhythmDiagnostics = { ...chordRhythmDiagnostics, timedTrialCancelledReason: reason };
      updateChordRhythmState({ type: 'cancel', reason });
    }
    if (dailyRhythmViewState?.isRunning) {
      chordRhythmDiagnostics = { ...chordRhythmDiagnostics, timedTrialCancelledReason: reason };
      dailyRhythmViewState = reduceChordRhythmState(dailyRhythmViewState, { type: 'cancel', reason });
      dailyRhythmCompleted = false;
    }
  }

  async function startChordRhythmRun() {
    if (!isActivePracticeSession(currentSessionId)) return;
    const moduleMode = chordRhythmState !== null;
    const state = moduleMode ? chordRhythmState : dailyRhythmViewState;
    if (!state || (state.step === 'transferResult' || state.step === 'moduleComplete')) return;
    if (rhythmDeadlineTimer != null) window.clearTimeout(rhythmDeadlineTimer);
    if (rhythmLateCutoffTimer != null) window.clearTimeout(rhythmLateCutoffTimer);
    rhythmLateCutoffTimer = null;
    rhythmClock.stop();
    const generation = ++rhythmRunGeneration;
    let context = AudioEngine.getInstance().getContext();
    if (!context || context.state !== 'running') context = await AudioEngine.getInstance().ensureContext();
    if (generation !== rhythmRunGeneration) return;
    if (!context || context.state !== 'running') {
      const feedback = 'Звук метронома сейчас недоступен. Разрешите воспроизведение звука и начните отсчёт ещё раз.';
      if (moduleMode && chordRhythmState) chordRhythmState = { ...chordRhythmState, feedbackText: feedback, feedbackTone: 'warn' };
      else if (dailyRhythmViewState) dailyRhythmViewState = { ...dailyRhythmViewState, feedbackText: feedback, feedbackTone: 'warn' };
      return;
    }
    const isPulseOnly = state.step === 'countingPulse';
    const countInBeats = isPulseOnly ? 0 : 4;
    const beatTargets = isPulseOnly
      ? []
      : state.step === 'twoStrikes' || ((state.step === 'transferAssessment' || state.step === 'transferRemediation') && currentRhythmTrial(state).beatsPerChord === 2) || (!moduleMode && rhythmDailySkill(currentCard) === 'chordRhythmPattern')
        ? [0, 2]
        : [0];
    rhythmCountInStartedAt = performance.now();
    rhythmVisualTargetShownAt = null;
    const expectedOnsets = rhythmClock.startSequence({
      bpm: CHORD_RHYTHM_BPM,
      countInBeats,
      beats: 4,
      onBeat: beat => {
        const active = moduleMode ? chordRhythmState : dailyRhythmViewState;
        if (!active) return;
        const shownBeat = beat.countIn ? beat.beat : beat.beat;
        const countInValue = beat.countIn ? Math.max(1, 4 - beat.index) : null;
        const next = reduceChordRhythmState(active, { type: 'clockBeat', beat: shownBeat, countInValue });
        if (moduleMode) chordRhythmState = next;
        else dailyRhythmViewState = next;
        const targetOffset = beat.index - countInBeats;
        const nextTargetOffset = beatTargets[rhythmNextTargetIndex];
        if (targetOffset === nextTargetOffset) {
          const onset = expectedOnsets[beat.index];
          rhythmVisualTargetShownAt = performance.now();
          if (moduleMode) chordRhythmState = { ...chordRhythmState!, expectedOnset: onset, countInValue: null };
          else dailyRhythmViewState = { ...dailyRhythmViewState!, expectedOnset: onset, countInValue: null };
          chordRhythmDiagnostics = {
            ...chordRhythmDiagnostics,
            expectedOnset: onset,
            actualOnset: null,
            timingDeltaMs: null,
            timingBand: null,
            chordCorrect: null,
            classificationOutcome: null,
            detectedChordLabel: null,
            timedTrialCancelledReason: null
          };
          if (rhythmDeadlineTimer != null) window.clearTimeout(rhythmDeadlineTimer);
          rhythmDeadlineTimer = window.setTimeout(() => {
            handleRhythmMissedOnset(moduleMode);
          }, Math.max(0, onset + CHORD_RHYTHM_MISSED_AFTER_MS - performance.now()));
          if (typeof window !== 'undefined') {
            const hook = (window as unknown as { __m3kOnTimingWindowOpen?: (at: number) => void }).__m3kOnTimingWindowOpen;
            hook?.(performance.now());
          }
        }
        if (beat.index === expectedOnsets.length - 1 && isPulseOnly) {
          if (moduleMode && chordRhythmState) chordRhythmState = { ...chordRhythmState, isRunning: false, activeBeat: 3, countInValue: null };
          else if (dailyRhythmViewState) dailyRhythmViewState = { ...dailyRhythmViewState, isRunning: false, activeBeat: 3, countInValue: null };
        }
      }
    });
    rhythmCountInEndsAt = countInBeats > 0
      ? expectedOnsets[countInBeats - 1] + 25
      : expectedOnsets[0] ?? performance.now();
    const expected = beatTargets.length ? expectedOnsets[countInBeats + beatTargets[0]] : 0;
    rhythmTargetOnsets = beatTargets.map(beat => expectedOnsets[countInBeats + beat]).filter(Number.isFinite);
    rhythmNextTargetIndex = 0;
    if (!state.assessment.pendingCorrective || !rhythmQuestionInstanceId) {
      rhythmQuestionInstanceId = currentCard ? currentQuestionInstanceId : activatePracticeQuestion(currentSessionId);
    }
    rhythmOutcomePending = false;
    if (moduleMode && chordRhythmState) chordRhythmState = reduceChordRhythmState(chordRhythmState, { type: 'startRun', expectedOnset: expected });
    else if (dailyRhythmViewState) dailyRhythmViewState = reduceChordRhythmState(dailyRhythmViewState, { type: 'startRun', expectedOnset: expected });
  }

  function handleRhythmMissedOnset(moduleMode: boolean) {
    rhythmDeadlineTimer = null;
    rhythmClock.stop();
    rhythmOutcomePending = false;
    const state = moduleMode ? chordRhythmState : dailyRhythmViewState;
    if (!state || !state.isRunning || state.expectedOnset === null) return;
    // Soft miss: keep the late-diagnostic window open. Nothing is graded yet;
    // the cutoff timer or a late chord resolves the attempt exactly once.
    const next = reduceChordRhythmState(state, { type: 'missedOnset' });
    if (moduleMode) chordRhythmState = next;
    else dailyRhythmViewState = next;
    if (rhythmLateCutoffTimer != null) window.clearTimeout(rhythmLateCutoffTimer);
    rhythmLateCutoffTimer = window.setTimeout(() => {
      handleRhythmLateCutoff(moduleMode);
    }, CHORD_RHYTHM_LATE_WINDOW_MS);
  }

  function handleRhythmLateCutoff(moduleMode: boolean) {
    rhythmLateCutoffTimer = null;
    const state = moduleMode ? chordRhythmState : dailyRhythmViewState;
    if (!state || !state.lateWindow) return;
    const outcome = state.lastOutcome ?? classifyRhythmTiming(state.expectedOnset ?? 0, null, false);
    const next = reduceChordRhythmState(state, { type: 'missedExpired' });
    if (moduleMode) {
      chordRhythmState = next;
      void persistChordRhythmState(next);
    } else {
      dailyRhythmViewState = next;
      commitDailyRhythmOutcome(outcome, 'screen');
    }
  }

  function toggleRhythmKey(keyId: string) {
    if (!isActivePracticeSession(currentSessionId)) return;
    if (chordRhythmState) {
      if (chordRhythmState.step === 'countingPulse' || chordRhythmState.step === 'transferResult' || chordRhythmState.step === 'moduleComplete') return;
      chordRhythmState = reduceChordRhythmState(chordRhythmState, { type: 'selectKey', keyId });
    } else if (dailyRhythmViewState && !dailyRhythmCompleted) {
      dailyRhythmViewState = reduceChordRhythmState(dailyRhythmViewState, { type: 'selectKey', keyId });
    }
  }

  function submitRhythmChord(keyIds: readonly string[], inputMethod: 'screen' | 'midi', midiTimestamp?: number, rawMidiNotes?: readonly number[]) {
    if (!isActivePracticeSession(currentSessionId)) return;
    const moduleMode = chordRhythmState !== null;
    const state = moduleMode ? chordRhythmState : dailyRhythmViewState;
    if (!state || state.step === 'countingPulse' || state.step === 'transferResult' || state.step === 'moduleComplete') return;
    if (inputMethod === 'midi' && !midiReady) return;

    // Explicit pre-window contract: pressing Play before the count-in never grades.
    if (!state.isRunning) {
      setRhythmFeedback(moduleMode, 'Сначала запустите отсчёт.', 'warn');
      return;
    }
    if (state.countInValue !== null) {
      setRhythmFeedback(moduleMode, `Приготовьтесь: отсчёт ${state.countInValue} · 3 · 2 · 1`, 'warn');
      return;
    }
    if (state.expectedOnset === null || rhythmOutcomePending) return;

    const actualOnset = midiTimestamp ?? performance.now();
    if (actualOnset < rhythmCountInEndsAt) return;
    const chordId = moduleMode ? rhythmTargetChord(state) : dailyRhythmChordId;
    const inputNotes = keyIds.map((keyId, index) => ({
      keyId,
      midi: rawMidiNotes?.[index] ?? rhythmMidiByKeyId.get(keyId) ?? undefined
    }));
    const classification = classifyRhythmChord(chordId, inputNotes);
    const outcome = classifyRhythmTiming(state.expectedOnset, actualOnset, classification.chordCorrect);

    chordRhythmDiagnostics = {
      targetBpm: CHORD_RHYTHM_BPM,
      expectedOnset: outcome.expectedOnset,
      actualOnset: outcome.actualOnset,
      timingDeltaMs: outcome.timingDeltaMs,
      timingBand: outcome.timingBand,
      chordCorrect: outcome.chordCorrect,
      classificationOutcome: classification.outcome,
      detectedChordLabel: classification.detectedChordLabel,
      timedTrialCancelledReason: null
    };
    pushRhythmAttemptTrace({
      at: Date.now(),
      questionInstanceId: rhythmQuestionInstanceId,
      inputMethod,
      rawMidiNotes: rawMidiNotes ? [...rawMidiNotes] : (inputMethod === 'midi' ? resolveRhythmMidiNotes(keyIds) : []),
      normalizedKeyIds: [...keyIds],
      pitchClasses: classification.playedPitchClasses,
      bassPitchClass: classification.playedBass,
      targetChord: chordId,
      targetPitchClasses: classification.targetPitchClasses,
      targetBassRequirement: classification.targetBassRequirement,
      expectedOnset: outcome.expectedOnset,
      actualOnset: outcome.actualOnset,
      timingDeltaMs: outcome.timingDeltaMs,
      timingBand: outcome.timingBand,
      classificationOutcome: classification.outcome,
      chordCorrect: classification.chordCorrect,
      detectedChordLabel: classification.detectedChordLabel,
      countInStartedAt: rhythmCountInStartedAt,
      countInFinishedAt: rhythmCountInEndsAt,
      visualTargetShownAt: rhythmVisualTargetShownAt,
      timingWindowStart: outcome.expectedOnset - CHORD_RHYTHM_ON_TIME_WINDOW_MS,
      timingWindowEnd: outcome.expectedOnset + CHORD_RHYTHM_MISSED_AFTER_MS
    });
    if (typeof window !== 'undefined') {
      (window as unknown as { __m3kLastClassification: RhythmChordClassification | null }).__m3kLastClassification = classification;
    }

    if (rhythmDeadlineTimer != null) window.clearTimeout(rhythmDeadlineTimer);
    rhythmDeadlineTimer = null;
    if (rhythmLateCutoffTimer != null) window.clearTimeout(rhythmLateCutoffTimer);
    rhythmLateCutoffTimer = null;
    rhythmNextTargetIndex += 1;
    const next = reduceChordRhythmState(state, {
      type: 'recordOutcome',
      outcome,
      classification,
      questionInstanceId: rhythmQuestionInstanceId ?? `m3k-${currentSessionId}-${Date.now()}`
    });
    if (moduleMode) {
      chordRhythmState = next;
      if (!next.isRunning || !outcome.correct) rhythmClock.stop();
      if (!next.isRunning) void persistChordRhythmState(next);
    } else {
      dailyRhythmViewState = next;
      if (!next.isRunning) {
        // One question instance resolves once: two-strike patterns only grade after both strikes.
        commitDailyRhythmOutcome(outcome, inputMethod);
      } else if (outcome.correct) {
        dailyRhythmFeedback = 'Верно. Теперь сыграйте аккорд на доле 3.';
        dailyRhythmFeedbackTone = 'warn';
      }
    }
    if (next.isRunning && rhythmNextTargetIndex < rhythmTargetOnsets.length) {
      const expectedOnset = rhythmTargetOnsets[rhythmNextTargetIndex];
      if (moduleMode && chordRhythmState) chordRhythmState = { ...chordRhythmState, expectedOnset };
      else if (dailyRhythmViewState) dailyRhythmViewState = { ...dailyRhythmViewState, expectedOnset };
      chordRhythmDiagnostics = { ...chordRhythmDiagnostics, expectedOnset };
      rhythmDeadlineTimer = window.setTimeout(() => handleRhythmMissedOnset(moduleMode), Math.max(0, expectedOnset + CHORD_RHYTHM_MISSED_AFTER_MS - performance.now()));
    }
  }

  function commitDailyRhythmOutcome(outcome: RhythmTimingOutcome, inputMethod: 'screen' | 'midi') {
    if (!currentCard || !isDailyRhythmActive || !outcome) return;
    if (!isActivePracticeSession(currentSessionId)) return;
    const firstAttempt = !firstResponseRecorded;
    if (firstAttempt) {
      if (!claimFirstAnswerCommit(currentSessionId, currentQuestionInstanceId)) return;
      const responseMs = Math.max(0, Math.round((outcome.actualOnset ?? performance.now()) - shownPerfMs));
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      if (currentKind === 'scheduled') {
        sessionScheduledReviews++;
        if (outcome.correct) sessionScheduledCorrect++;
      }
      if (currentKind === 'new') sessionNewReviews++;
      if (currentKind === 'transfer') {
        sessionTransferTrials++;
        if (outcome.correct) sessionTransferCorrect++;
      }
    }
    const result = runQuestionAttempt({
      card: currentCard,
      kind: currentKind,
      isCorrect: outcome.correct,
      answer: currentCard.note,
      answerKeyId: null,
      responseMs: firstAttempt ? Math.max(0, Math.round((outcome.actualOnset ?? performance.now()) - shownPerfMs)) : 0,
      inputMethod: inputMethod === 'midi' ? 'midi' : 'screen'
    });
    if (firstAttempt) {
      if (outcome.correct) {
        sessionScore++;
        sessionStreak++;
        dailyRhythmFeedback = 'Аккорд верный. Точно на долю.';
        dailyRhythmFeedbackTone = 'good';
        dailyRhythmCompleted = true;
      } else {
        sessionStreak = 0;
        sessionLapses++;
        dailyRhythmCorrective = true;
        dailyRhythmFeedbackTone = 'bad';
        dailyRhythmFeedback = `Первая попытка засчитана как ошибка. Аккорд: ${outcome.chordCorrect ? 'верный' : 'неверный'} · время: ${outcome.timingBand === 'on_time' ? 'точно' : outcome.timingBand === 'early' ? 'рано' : outcome.timingBand === 'late' ? 'поздно' : 'пропущена доля'}. Исправьте ответ, чтобы продолжить.`;
      }
      if (result.logEvent) void recordCardReview(currentCard, result.logEvent, result.cardMutated);
    } else if (outcome.correct) {
      dailyRhythmFeedback = 'Исправлено. Первая ошибка останется в расписании повторений.';
      dailyRhythmFeedbackTone = 'warn';
      dailyRhythmCompleted = true;
    } else {
      dailyRhythmFeedback = 'Пока нет. Проверьте аккорд и сыграйте снова на долю.';
      dailyRhythmFeedbackTone = 'bad';
    }
  }

  function advanceDailyRhythmQuestion() {
    dailyRhythmViewState = null;
    dailyRhythmFeedback = '';
    dailyRhythmFeedbackTone = '';
    dailyRhythmCorrective = false;
    dailyRhythmCompleted = false;
    clearAutoAdvance();
    nextRound();
  }

  function handleDailyHarmonyToggleKey(keyId: string) {
    if (!dailyHarmonyTask || dailyHarmonyTask.kind !== 'progression' || isLocked || isCompleted) return;
    selectedKeyIds = toggleKeyInChordSelection(selectedKeyIds, keyId);
    dailyHarmonyFeedback = selectedKeyIds.length === 3 ? 'Три ноты выбраны. Нажмите «Проверить аккорд».' : `${selectedKeyIds.length} из 3 нот выбрано.`;
    dailyHarmonyFeedbackTone = '';
  }

  function finishDailyHarmonyReview(correctOnFirstAttempt: boolean) {
    if (!currentCard || dailyHarmonyFirstOutcomeRecorded) return;
    if (!claimFirstAnswerCommit(currentSessionId, currentQuestionInstanceId)) return;
    const cardRef = currentCard;
    const responseMs = Math.round(performance.now() - shownPerfMs);
    stopReactionTimer();
    sessionTrials++;
    sessionResponseTimes.push(responseMs);
    if (currentKind === 'scheduled') {
      sessionScheduledReviews++;
      if (correctOnFirstAttempt) sessionScheduledCorrect++;
    }
    if (currentKind === 'new') sessionNewReviews++;
    if (currentKind === 'transfer') {
      sessionTransferTrials++;
      if (correctOnFirstAttempt) sessionTransferCorrect++;
    }
    const attempt = runQuestionAttempt({
      card: cardRef,
      kind: currentKind,
      isCorrect: correctOnFirstAttempt,
      answer: correctOnFirstAttempt ? cardRef.note : ('incorrect progression' as NoteName),
      answerKeyId: null,
      responseMs,
      inputMethod: dailyHarmonyInputMethod
    });
    dailyHarmonyFirstOutcomeRecorded = true;
    if (correctOnFirstAttempt) {
      sessionScore++;
      sessionStreak++;
      dailyHarmonyFeedback = 'Верно с первой попытки. Вся последовательность засчитана как одно задание.';
      dailyHarmonyFeedbackTone = 'good';
      isCompleted = true;
      scheduleAutoAdvance();
    } else {
      sessionStreak = 0;
      sessionLapses++;
      dailyHarmonyCorrective = true;
      dailyHarmonyHadWrong = false;
      dailyHarmonyStepIndex = 0;
      selectedKeyIds = [];
      dailyHarmonyFeedback = 'Первая попытка последовательности засчитана как ошибка. Повторите всю цепочку для закрепления; дополнительных FSRS-записей не будет.';
      dailyHarmonyFeedbackTone = 'warn';
    }
    if (attempt.logEvent) void recordCardReview(cardRef, attempt.logEvent, attempt.cardMutated);
  }

  function handleDailyHarmonySubmitChord(keys: readonly string[], inputMethod: TrialInputMethod = 'screen') {
    const task = dailyHarmonyTask;
    if (!task || task.kind !== 'progression' || !task.progression || !currentCard || isLocked || isCompleted) return;
    const chordId = task.progression[dailyHarmonyStepIndex] as HarmonyChordId | undefined;
    if (!chordId) return;
    if (keys.length < 3) {
      dailyHarmonyFeedback = `${keys.length} из 3 нот. Сыграйте все три ноты одновременно.`;
      dailyHarmonyFeedbackTone = 'warn';
      return;
    }
    if (dailyHarmonyStepIndex === 0 && !dailyHarmonyCorrective && !dailyHarmonyHadWrong) dailyHarmonyInputMethod = inputMethod;
    const classification = classifyHarmonyChord(keys, chordId);
    if (classification.outcome !== 'correct') {
      if (classification.outcome !== 'incomplete_chord') dailyHarmonyHadWrong = true;
      dailyHarmonyFeedback = classification.feedbackText;
      dailyHarmonyFeedbackTone = classification.outcome === 'incomplete_chord' ? 'warn' : 'bad';
      if (classification.outcome !== 'incomplete_chord') selectedKeyIds = [];
      wrongKeyIds = [...keys];
      setTimeout(() => { wrongKeyIds = wrongKeyIds.filter(id => !keys.includes(id)); }, 650);
      return;
    }
    selectedKeyIds = [];
    dailyHarmonyFeedback = `Верно: ${chordId}.`;
    dailyHarmonyFeedbackTone = 'good';
    correctKeyIds = [...keys];
    setTimeout(() => { correctKeyIds = correctKeyIds.filter(id => !keys.includes(id)); }, 400);
    dailyHarmonyStepIndex++;
    if (dailyHarmonyStepIndex < task.progression.length) return;
    if (dailyHarmonyCorrective) {
      dailyHarmonyFeedback = 'Последовательность сыграна верно. Исправление завершено без повторной оценки карточки.';
      dailyHarmonyFeedbackTone = 'good';
      isCompleted = true;
      scheduleAutoAdvance();
      return;
    }
    finishDailyHarmonyReview(!dailyHarmonyHadWrong);
  }

  function handleDailyHarmonyAnswer(answer: string, inputMethod: TrialInputMethod = 'answerButton') {
    const task = dailyHarmonyTask;
    if (!task || task.kind !== 'semantic' || !task.expectedAnswer || !currentCard || isLocked || isCompleted) return;
    const isFirst = !firstResponseRecorded;
    if (isFirst && !claimFirstAnswerCommit(currentSessionId, currentQuestionInstanceId)) return;
    if (isFirst) dailyHarmonyInputMethod = inputMethod;
    const responseMs = isFirst ? Math.round(performance.now() - shownPerfMs) : 0;
    if (isFirst) {
      stopReactionTimer();
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      if (currentKind === 'scheduled') sessionScheduledReviews++;
      if (currentKind === 'new') sessionNewReviews++;
      if (currentKind === 'transfer') sessionTransferTrials++;
    }
    const correct = answer === task.expectedAnswer;
    const attempt = runQuestionAttempt({
      card: currentCard,
      kind: currentKind,
      isCorrect: correct,
      answer: answer as NoteName,
      answerKeyId: null,
      responseMs,
      inputMethod
    });
    dailyHarmonyFirstOutcomeRecorded = true;
    dailyHarmonyFeedback = correct
      ? attempt.isFirstAttempt ? 'Верно.' : 'Ответ исправлен. Первая попытка карточки уже сохранена.'
      : `Пока нет. Правильный ответ: ${task.expectedAnswer}. Первая попытка уже учтена.`;
    dailyHarmonyFeedbackTone = correct ? (attempt.isFirstAttempt ? 'good' : 'warn') : 'bad';
    if (correct && attempt.isFirstAttempt) {
      sessionScore++;
      sessionStreak++;
    } else if (!correct && attempt.isFirstAttempt) {
      sessionStreak = 0;
      sessionLapses++;
      dailyHarmonyHadWrong = true;
    }
    if (attempt.logEvent) void recordCardReview(currentCard, attempt.logEvent, attempt.cardMutated);
    if (correct) {
      isCompleted = true;
      scheduleAutoAdvance();
    }
  }

  function handleDailyChordSubmit(keys: readonly string[], inputMethod: TrialInputMethod = 'screen') {
    if (!isActivePracticeSession(currentSessionId) || isLocked || !currentCard || isCompleted) return;
    if ((currentCard.skill === 'triadInversionBuild' || currentCard.skill === 'chordSymbolRead') && keys.length !== 3) {
      feedbackText = 'Нужно сыграть полный аккорд из трёх нот. Незавершённый ввод не засчитывается.';
      feedbackClass = 'bad';
      return;
    }
    if (!firstResponseRecorded && !claimFirstAnswerCommit(currentSessionId, currentQuestionInstanceId)) return;
    const sorted = sortKeyIdsByPitch(keys);
    const rootKeyId = structuralGuideKeyIds[0] || 'C4';
    const responseMs = !firstResponseRecorded ? Math.round(performance.now() - shownPerfMs) : 0;

    if (!firstResponseRecorded) {
      stopReactionTimer();
      sessionTrials++;
      sessionResponseTimes.push(responseMs);
      if (currentKind === 'scheduled') {
        sessionScheduledReviews++;
      }
      if (currentKind === 'new') sessionNewReviews++;
      if (currentKind === 'transfer') {
        sessionTransferTrials++;
      }
    }

    if (currentCard.skill === 'triadInversionBuild' || currentCard.skill === 'chordSymbolRead') {
      const evaluation = evaluateDailyInversionAttempt({
        card: currentCard,
        kind: currentKind,
        rootKeyId: currentRootKeyId,
        quality: (currentCard.note === 'minor' ? 'minor' : 'major'),
        inversion: currentInversion,
        expectedKeyIds: currentTriadKeyIds,
        targetSymbol: currentChordSymbol,
        userKeyIds: sorted,
        firstResponseRecorded,
        attempts,
        hintUsed,
        responseMs,
        inputMethod,
        settings,
        reviewLogs,
        sessionId: currentSessionId
      });

      firstResponseRecorded = evaluation.updatedState.firstResponseRecorded;
      attempts = evaluation.updatedState.attempts;
      hintUsed = evaluation.updatedState.hintUsed;
      feedbackText = evaluation.feedbackText;
      feedbackClass = evaluation.feedbackClass;

      if (evaluation.attemptResult.isFirstAttempt) {
        if (evaluation.isCorrect) {
          sessionScore++;
          sessionStreak++;
          if (currentKind === 'scheduled') sessionScheduledCorrect++;
          if (currentKind === 'transfer') sessionTransferCorrect++;
        } else {
          sessionStreak = 0;
          sessionLapses++;
        }

        if (evaluation.attemptResult.logEvent) {
          void recordCardReview(
            currentCard,
            evaluation.attemptResult.logEvent,
            evaluation.attemptResult.cardMutated
          );
        }
      }

      if (evaluation.isCorrect) {
        correctKeyIds = [...sorted];
        playTriadAudio(sorted);
        if (evaluation.shouldAdvance) {
          scheduleAutoAdvance();
        }
        setTimeout(() => {
          correctKeyIds = [];
        }, 500);
      } else {
        wrongKeyIds = [...sorted];
        triggerErrorPulse((currentCard.note as NoteName) || 'first', sorted[0]);
        setTimeout(() => {
          wrongKeyIds = [];
        }, 650);
      }
      return;
    }

    if (!isTriadQuality(currentCard.note)) {
      console.error(`Invalid triad quality on card ${currentCard.id}: ${currentCard.note}`);
      return;
    }
    const quality = currentCard.note;
    const evaluation = evaluateDailyChordAttempt({
      card: currentCard,
      kind: currentKind,
      rootKeyId,
      quality,
      userKeyIds: sorted,
      firstResponseRecorded,
      attempts,
      hintUsed,
      responseMs,
      inputMethod,
      settings,
      reviewLogs,
      sessionId: currentSessionId
    });

    // Update round tracking state
    firstResponseRecorded = evaluation.updatedState.firstResponseRecorded;
    attempts = evaluation.updatedState.attempts;
    hintUsed = evaluation.updatedState.hintUsed;
    feedbackText = evaluation.feedbackText;
    feedbackClass = evaluation.feedbackClass;

    if (evaluation.attemptResult.isFirstAttempt) {
      if (evaluation.isCorrect) {
        sessionScore++;
        sessionStreak++;
        if (currentKind === 'scheduled') sessionScheduledCorrect++;
        if (currentKind === 'transfer') sessionTransferCorrect++;
      } else {
        sessionStreak = 0;
        sessionLapses++;
      }

      if (evaluation.attemptResult.logEvent) {
        void recordCardReview(
          currentCard,
          evaluation.attemptResult.logEvent,
          evaluation.attemptResult.cardMutated
        );
      }
    }

    if (evaluation.isCorrect) {
      correctKeyIds = [...sorted];
      playTriadAudio(sorted);
      if (evaluation.shouldAdvance) {
        scheduleAutoAdvance();
      }
      setTimeout(() => {
        correctKeyIds = [];
      }, 500);
    } else {
      wrongKeyIds = [...sorted];
      triggerErrorPulse(quality as NoteName, sorted[0]);
      setTimeout(() => {
        wrongKeyIds = [];
      }, 650);
    }
  }

  function handleDontKnow() {
    if (isLocked || isCompleted) return;

    if (isInversionActive && inversionState) {
      handleInversionDontKnow();
      return;
    }

    if (isTriadActive && triadState) {
      handleTriadDontKnow();
      return;
    }

    if (isIntervalActive && intervalState) {
      handleIntervalDontKnow();
      return;
    }

    if (isBassGrandActive && bassGrandState) {
      handleBassGrandDontKnow();
      return;
    }

    if (practiceActivity === 'standard' && firstRunState !== null && sessionPreset !== 'cold') {
      if (!canUseDontKnowInFirstRunStep(firstRunState)) return;
      dispatchFirstRunAction({ type: 'dontKnow' });
      return;
    }

    if (isCurriculumActive && curriculumState) {
      if (!canUseDontKnowInCurriculumStep(curriculumState)) return;
      dispatchCurriculumAction({ type: 'dontKnow' });
      return;
    }

    if (isCurriculum3dActive && curriculum3dState) {
      if (!canUseDontKnowInMilestone3dStep(curriculum3dState)) return;
      dispatchCurriculum3dAction({ type: 'dontKnow' });
      return;
    }

    if (practiceActivity === 'standard' && currentCard && !firstResponseRecorded) {
      stopReactionTimer();
      const responseMs = Math.round(performance.now() - shownPerfMs);
      sessionTrials++;
      sessionStreak = 0;
      sessionLapses++;

      const cardRef = currentCard;
      const kindRef = currentKind;

      if (kindRef === 'scheduled') sessionScheduledReviews++;
      if (kindRef === 'new') sessionNewReviews++;
      if (kindRef === 'transfer') sessionTransferTrials++;

      const targetLabel = targetKeyId ? `${DISPLAY_NAMES[cardRef.note]} (${targetKeyId})` : DISPLAY_NAMES[cardRef.note];
      if (kindRef === 'transfer') {
        feedbackText = `Ответ: ${targetLabel}. ${getExerciseHint(cardRef)} Задание служит для переноса навыка и не меняет расписание.`;
      } else if (kindRef === 'practice' || kindRef === 'confusion') {
        feedbackText = `Ответ: ${targetLabel}. ${getExerciseHint(cardRef)}`;
      } else {
        feedbackText = `Ответ: ${targetLabel}. ${getExerciseHint(cardRef)} Карточка скоро вернётся для повторения.`;
      }
      feedbackClass = 'warn';

      if (targetKeyId) hintKeyIds = [targetKeyId];
      else hintKeyIds = [cardRef.note];
      if (cardRef.skill === 'identify') pulseCorrectAnswerNotes = [cardRef.note];

      const { logEvent, cardMutated } = runQuestionAttempt({
        card: cardRef,
        kind: kindRef,
        isCorrect: false,
        answer: null,
        answerKeyId: null,
        hintUsedOnFirstAttempt: true,
        responseMs
      });

      scheduleAutoAdvance();

      if (logEvent) {
        void recordCardReview(cardRef, logEvent, cardMutated);
      }
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
  function activeRepertoireSong(): SongDef | null {
    if (!activeRepertoire) return null;
    const baseSong = REPERTOIRE.find(s => s.id === activeRepertoire!.id);
    if (!baseSong) return null;
    return getSongVersion(baseSong, activeRepertoire.lengthMode);
  }

  let repertoireDemoRunId = 0;

  function startSong(songId: string, options?: { autoDemo?: boolean; lengthMode?: RepertoireLengthMode }) {
    stopRepertoireDemo();
    const baseSong = REPERTOIRE.find(s => s.id === songId);
    if (!baseSong) return;
    practiceActivity = 'repertoire';
    const tempoMode = settings.repertoireTempoMode || 'wait';
    const bpm = getEffectiveSongBpm(baseSong, tempoMode, false);
    const requestedLengthMode = options?.lengthMode || settings.repertoireLengthMode || 'excerpt';
    const resolvedLengthMode: RepertoireLengthMode =
      requestedLengthMode === 'full' && hasFullVersion(baseSong) ? 'full' : 'excerpt';

    if (options?.lengthMode) {
      persistSettings({ repertoireLengthMode: options.lengthMode });
    }

    const selectedSong = getSongVersion(baseSong, resolvedLengthMode);
    // Immediately preload and warm up all piano samples when the user selects a melody
    void AudioEngine.getInstance().prepareForPlayback(selectedSong.notes);

    activeRepertoire = {
      id: songId,
      index: 0,
      mistakes: 0,
      startedPerf: performance.now(),
      bpm,
      displayMode: settings.repertoireDisplayMode || 'keys',
      lengthMode: resolvedLengthMode,
      countingIn: !options?.autoDemo && !!bpm,
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
      loopMeasure: null,
      loopCount: 0,
      isDemoPlaying: !!options?.autoDemo,
      completed: false
    };

    activePage = 'practice';

    if (options?.autoDemo) {
      renderRepertoireStep();
      startRepertoireDemo();
    } else if (bpm) {
      beginRepertoireCountIn(bpm);
    } else {
      nextRound();
    }
  }

  function setRepertoireLengthMode(mode: RepertoireLengthMode) {
    if (!activeRepertoire) return;
    const baseSong = REPERTOIRE.find(s => s.id === activeRepertoire!.id);
    if (!baseSong) return;
    const resolved: RepertoireLengthMode = mode === 'full' && hasFullVersion(baseSong) ? 'full' : 'excerpt';
    if (activeRepertoire.lengthMode === resolved) return;

    stopRepertoireDemo();
    persistSettings({ repertoireLengthMode: resolved });
    activeRepertoire.lengthMode = resolved;
    activeRepertoire.index = 0;
    activeRepertoire.loopMeasure = null;
    activeRepertoire.loopCount = 0;
    activeRepertoire.mistakes = 0;
    activeRepertoire.completed = false;
    activeRepertoire.lastCorrectPerf = null;
    isCompleted = false;

    const song = activeRepertoireSong();
    if (song) {
      void AudioEngine.getInstance().prepareForPlayback(song.notes);
    }
    const measures = song ? getSongMeasureCount(song) : 1;
    feedbackText = resolved === 'full'
      ? `🎼 Включена мелодическая аранжировка (${song?.notes.length || 0} нот · ${measures} тактов)`
      : `✂️ Включён учебный отрывок (${song?.notes.length || 0} нот · ${measures} тактов)`;
    feedbackClass = 'good';
    renderRepertoireStep();
  }

  function stopRepertoireDemo() {
    repertoireDemoRunId++;
    if (repertoireDemoTimer != null) {
      clearTimeout(repertoireDemoTimer);
      repertoireDemoTimer = null;
    }
    if (repertoireKeyFeedbackTimer != null) {
      clearTimeout(repertoireKeyFeedbackTimer);
      repertoireKeyFeedbackTimer = null;
    }
    AudioEngine.getInstance().stopAllVoices();
    targetKeyIds = [];
    correctKeyIds = [];
    pulseCorrectKeyIds = [];
    wrongKeyIds = [];
    if (activeRepertoire) {
      activeRepertoire.isDemoPlaying = false;
    }
  }

  async function startRepertoireDemo() {
    if (!activeRepertoire) return;
    stopRepertoireDemo();
    const song = activeRepertoireSong();
    if (!song) return;

    const runId = ++repertoireDemoRunId;
    activeRepertoire.isDemoPlaying = true;
    activeRepertoire.completed = false;
    isCompleted = false;

    const engine = AudioEngine.getInstance();
    if (!engine.isSamplesReady()) {
      feedbackText = '⏳ Загружаю звуки пианино перед воспроизведением…';
      feedbackClass = '';
    }

    const ready = await engine.prepareForPlayback(song.notes);
    if (runId !== repertoireDemoRunId || !activeRepertoire || !activeRepertoire.isDemoPlaying) {
      return;
    }
    if (!ready) {
      stopRepertoireDemo();
      feedbackText = 'Не удалось подготовить аудио-движок.';
      feedbackClass = 'bad';
      return;
    }

    const tempoMode = settings.repertoireTempoMode || 'wait';
    const bpm = activeRepertoire.bpm || getEffectiveSongBpm(song, tempoMode, true) || 92;

    const startNoteIndex = activeRepertoire.loopMeasure != null
      ? getMeasureNoteRange(song, activeRepertoire.loopMeasure).start
      : 0;
    const endNoteIndex = activeRepertoire.loopMeasure != null
      ? getMeasureNoteRange(song, activeRepertoire.loopMeasure).end
      : song.notes.length;

    const fullSchedule = buildSongPlaybackSchedule(song, bpm, { allowTailOverlapMs: 0 });
    const activeLoopMeasure = activeRepertoire.loopMeasure;
    const demoSchedule = activeLoopMeasure != null
      ? fullSchedule.filter(item => item.measure === activeLoopMeasure)
      : fullSchedule;

    let expectedStepPerf = performance.now();

    function playDemoItem(scheduleIdx: number) {
      if (runId !== repertoireDemoRunId || !activeRepertoire || !activeRepertoire.isDemoPlaying) return;
      const currentSong = activeRepertoireSong();
      if (!currentSong) return;

      if (scheduleIdx >= demoSchedule.length) {
        stopRepertoireDemo();
        activeRepertoire.index = startNoteIndex;
        renderRepertoireStep();
        feedbackText = '✓ Демонстрация завершена. Теперь ваша очередь сыграть!';
        feedbackClass = 'good';
        return;
      }

      const item = demoSchedule[scheduleIdx];
      const durMs = Math.max(40, item.nominalDurationMs);

      if (item.type === 'rest' || !item.pitch) {
        targetKeyIds = [];
        correctKeyIds = [];
        pulseCorrectKeyIds = [];
        feedbackText = `▶ Демо (${bpm} BPM): пауза (${item.durationBeats} сч.) · слушайте пульс`;
        feedbackClass = 'good';
      } else {
        const noteIdx = item.noteIndex ?? startNoteIndex;
        activeRepertoire.index = noteIdx;
        targetKeyId = item.pitch;
        targetKeyIds = [];
        correctKeyIds = [item.pitch];
        pulseCorrectKeyIds = [item.pitch];

        void engine.playPianoByKeyId(item.pitch, 92, durMs, { allowTailOverlapMs: 0 });
        feedbackText = `▶ Демо (${bpm} BPM): нота ${item.pitch} (${noteIdx + 1}/${endNoteIndex}) · слушайте ритм и мелодию`;
        feedbackClass = 'good';
      }

      expectedStepPerf += durMs;
      const nextDelayMs = Math.max(16, expectedStepPerf - performance.now());

      repertoireDemoTimer = window.setTimeout(() => {
        if (runId !== repertoireDemoRunId) return;
        correctKeyIds = [];
        pulseCorrectKeyIds = [];
        playDemoItem(scheduleIdx + 1);
      }, nextDelayMs);
    }

    playDemoItem(0);
  }

  function toggleRepertoireDemo() {
    if (!activeRepertoire) return;
    if (activeRepertoire.isDemoPlaying) {
      stopRepertoireDemo();
      const song = activeRepertoireSong();
      let loopStart = 0;
      if (song && activeRepertoire.loopMeasure != null) {
        loopStart = getMeasureNoteRange(song, activeRepertoire.loopMeasure).start;
      }
      activeRepertoire.index = loopStart;
      renderRepertoireStep();
      feedbackText = 'Демо остановлено. Теперь можете сыграть сами.';
      feedbackClass = '';
    } else {
      void startRepertoireDemo();
    }
  }

  function setRepertoireLoop(measure: number | null) {
    if (!activeRepertoire) return;
    stopRepertoireDemo();
    const song = activeRepertoireSong();
    if (!song) return;
    const totalMeasures = getSongMeasureCount(song);

    if (measure === null) {
      activeRepertoire.loopMeasure = null;
      activeRepertoire.loopCount = 0;
      feedbackText = 'Режим: вся пьеса целиком';
      feedbackClass = '';
    } else {
      const validMeasure = Math.max(1, Math.min(totalMeasures, measure));
      const range = getMeasureNoteRange(song, validMeasure);
      activeRepertoire.loopMeasure = validMeasure;
      activeRepertoire.loopCount = 0;
      activeRepertoire.index = range.start;
      activeRepertoire.lastCorrectPerf = null;
      feedbackText = `🔁 Зациклен такт ${validMeasure} (ноты ${range.start + 1}–${range.end}). Повторяйте фрагмент до автоматизма!`;
      feedbackClass = 'good';
    }
    renderRepertoireStep();
  }

  function prevRepertoireMeasure() {
    if (!activeRepertoire || activeRepertoire.loopMeasure == null) return;
    setRepertoireLoop(activeRepertoire.loopMeasure - 1);
  }

  function nextRepertoireMeasure() {
    if (!activeRepertoire || activeRepertoire.loopMeasure == null) return;
    setRepertoireLoop(activeRepertoire.loopMeasure + 1);
  }

  async function beginRepertoireCountIn(bpm: number) {
    if (!activeRepertoire) return;
    const song = activeRepertoireSong();
    await AudioEngine.getInstance().prepareForPlayback(song?.notes);
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

  let repertoireKeyFeedbackTimer: number | null = null;

  function renderRepertoireStep() {
    if (!activeRepertoire) return;
    const song = activeRepertoireSong();
    if (!song) return;

    const isLooping = activeRepertoire.loopMeasure != null;
    let loopStart = 0;
    let loopEnd = song.notes.length;
    if (isLooping) {
      const range = getMeasureNoteRange(song, activeRepertoire.loopMeasure!);
      loopStart = range.start;
      loopEnd = range.end;
    }

    if (activeRepertoire.index >= loopEnd) {
      if (isLooping) {
        activeRepertoire.index = loopStart;
      } else {
        finishSong();
        return;
      }
    }

    targetKeyId = song.notes[activeRepertoire.index];
    // Never pre-highlight the target key on the piano keyboard in melody practice mode
    targetKeyIds = [];
  }

  function flashRepertoirePressedKey(keyId: string, isCorrect: boolean) {
    if (repertoireKeyFeedbackTimer != null) {
      clearTimeout(repertoireKeyFeedbackTimer);
      repertoireKeyFeedbackTimer = null;
    }

    if (isCorrect) {
      wrongKeyIds = [];
      correctKeyIds = [keyId];
      pulseCorrectKeyIds = [keyId];
      repertoireKeyFeedbackTimer = window.setTimeout(() => {
        correctKeyIds = correctKeyIds.filter(id => id !== keyId);
        pulseCorrectKeyIds = pulseCorrectKeyIds.filter(id => id !== keyId);
        repertoireKeyFeedbackTimer = null;
      }, 280);
    } else {
      correctKeyIds = [];
      pulseCorrectKeyIds = [];
      wrongKeyIds = [keyId];
      repertoireKeyFeedbackTimer = window.setTimeout(() => {
        wrongKeyIds = wrongKeyIds.filter(id => id !== keyId);
        repertoireKeyFeedbackTimer = null;
      }, 380);
    }
  }

  function handleRepertoireInput(keyId: string, meta: { input: 'mouse' | 'midi'; velocity?: number; voiceKey?: string }) {
    if (!activeRepertoire || activeRepertoire.completed || activeRepertoire.countingIn) return;
    if (activeRepertoire.isDemoPlaying) {
      stopRepertoireDemo();
      feedbackText = 'Демо остановлено. Теперь можете сыграть сами.';
      feedbackClass = '';
      return;
    }
    const song = activeRepertoireSong();
    if (!song) return;

    const target = song.notes[activeRepertoire.index];
    const ok = keyId === target;

    if (ok) {
      const now = performance.now();
      flashRepertoirePressedKey(keyId, true);

      if (activeRepertoire.bpm && activeRepertoire.lastCorrectPerf != null && activeRepertoire.index > 0) {
        const beatMs = 60000 / activeRepertoire.bpm;
        const normalizedEvents = normalizeSongToEvents(song);
        const prevEv = normalizedEvents.find(ev => ev.type === 'note' && ev.noteIndex === activeRepertoire!.index - 1);
        const currEv = normalizedEvents.find(ev => ev.type === 'note' && ev.noteIndex === activeRepertoire!.index);
        const expectedBeats =
          prevEv && currEv
            ? Math.max(0.125, currEv.startBeat - prevEv.startBeat)
            : (song.beats[activeRepertoire.index - 1] || 1);
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

      const isLooping = activeRepertoire.loopMeasure != null;
      let loopStart = 0;
      let loopEndIndex = song.notes.length;
      if (isLooping) {
        const range = getMeasureNoteRange(song, activeRepertoire.loopMeasure!);
        loopStart = range.start;
        loopEndIndex = range.end;
      }

      if (isLooping && activeRepertoire.index >= loopEndIndex) {
        activeRepertoire.loopCount++;
        activeRepertoire.index = loopStart;
        activeRepertoire.lastCorrectPerf = null;
        feedbackText = `🔁 Такт ${activeRepertoire.loopMeasure} сыгран! Повтор #${activeRepertoire.loopCount}`;
        feedbackClass = 'good';
        renderRepertoireStep();
      } else if (!isLooping && activeRepertoire.index >= song.notes.length) {
        finishSong();
      } else {
        feedbackText = `✓ Верно: ${keyId}`;
        feedbackClass = 'good';
        renderRepertoireStep();
      }
    } else {
      activeRepertoire.mistakes++;
      flashRepertoirePressedKey(keyId, false);
      feedbackText = `✗ Нажата ${keyId}, а нужна ${target}. Позиция в такте сохранена.`;
      feedbackClass = 'bad';
    }
  }

  function finishSong() {
    if (!activeRepertoire) return;
    activeRepertoire.completed = true;
    const timingAcc = activeRepertoire.timingCount ? Math.round((activeRepertoire.timingWithin / activeRepertoire.timingCount) * 100) : null;
    feedbackText = `✓ Мелодия сыграна! Ошибок: ${activeRepertoire.mistakes}${timingAcc != null ? ` · ритм ${timingAcc}%` : ''}. FSRS не изменялся.`;
    feedbackClass = 'good';
    isCompleted = true;
  }

  function restartSong() {
    if (!activeRepertoire) return;
    stopRepertoireDemo();
    startSong(activeRepertoire.id, { lengthMode: activeRepertoire.lengthMode });
  }

  function leaveRepertoire() {
    stopRepertoireDemo();
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
      feedbackText = `✗ Это ${activeEarInterval.item.name} (${activeEarInterval.item.shortName}) · C4 → ${activeEarInterval.item.targetKeyId}. ${activeEarInterval.item.description}`;
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

  function startEarEchoTraining() {
    practiceActivity = 'earEcho';
    activePage = 'practice';
    nextRound();
  }

  function renderEarEchoStep() {
    const item = ECHO_PHRASES[Math.floor(Math.random() * ECHO_PHRASES.length)];
    activeEarEcho = {
      item,
      currentIndex: 0,
      answeredNotes: [],
      completed: false
    };
    isLocked = false;
    isCompleted = false;
    feedbackText = '';
    feedbackClass = '';
    setTimeout(() => playEchoPhrase(item.notes), 350);
  }

  function handleEarEchoKeyInput(keyId: string) {
    if (!activeEarEcho || activeEarEcho.completed || isLocked) return;
    const expectedKey = activeEarEcho.item.notes[activeEarEcho.currentIndex];
    
    if (keyId === expectedKey) {
      activeEarEcho.answeredNotes = [...activeEarEcho.answeredNotes, keyId];
      pulseCorrectKeyIds = [keyId];
      activeEarEcho.currentIndex++;
      
      if (activeEarEcho.currentIndex >= activeEarEcho.item.notes.length) {
        activeEarEcho.completed = true;
        isCompleted = true;
        sessionScore++;
        sessionTrials++;
        feedbackText = `✓ Великолепно! Вся фраза сыграна верно: ${activeEarEcho.item.title}. ${activeEarEcho.item.description}`;
        feedbackClass = 'good';
        scheduleAutoAdvance();
      } else {
        feedbackText = `✓ Нота ${activeEarEcho.currentIndex} из ${activeEarEcho.item.notes.length} верна! Сыграйте следующую...`;
        feedbackClass = 'good';
      }
    } else {
      wrongKeyIds = [keyId];
      setTimeout(() => {
        wrongKeyIds = wrongKeyIds.filter(id => id !== keyId);
      }, 400);
      feedbackText = `Клавиша ${keyId} не подходит. Попробуйте снова или нажмите «Повторить звук».`;
      feedbackClass = 'bad';
    }
  }

  // General Key Input Router
  function handleKeyClick(keyId: string, noteName: NoteName) {
    if (!isActivePracticeSession(currentSessionId)) return;
    AudioEngine.getInstance().playPianoByKeyId(keyId, 96);
    if (activePage !== 'practice' || isLocked) return;

    if (practiceActivity === 'earEcho') {
      handleEarEchoKeyInput(keyId);
      return;
    }
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
      if (firstRunState !== null && sessionPreset !== 'cold') {
        dispatchFirstRunAction({
          type: 'keyPress',
          note: noteName,
          keyId,
          inputMethod: 'screen'
        });
        return;
      }
      if (isCurriculumActive && curriculumState) {
        dispatchCurriculumAction({
          type: 'keyPress',
          note: noteName,
          keyId,
          inputMethod: 'screen'
        });
        return;
      }
      if (isCurriculum3dActive && curriculum3dState) {
        dispatchCurriculum3dAction({
          type: 'keyPress',
          note: noteName,
          keyId,
          inputMethod: 'screen'
        });
        return;
      }
      if (isIntervalActive && intervalState) {
        if (intervalState.activeSkill === 'intervalBuild' || intervalState.step === 'intervalOrientation') {
          dispatchIntervalAction({
            type: 'keyPress',
            note: noteName,
            keyId
          });
        }
        return;
      }
      if (isChordRhythmActive || isDailyRhythmActive) {
        toggleRhythmKey(keyId);
        return;
      }
      if (isHarmonyActive && harmonyState) {
        if (canInputHarmonyChord(harmonyState)) handleHarmonyKeyToggle(keyId);
        return;
      }
      if (isInversionActive && inversionState) {
        if (canInputInversionChord(inversionState)) handleInversionToggleKey(keyId);
        return;
      }
      if (isTriadActive && triadState) {
        if (triadState.activeSkill === 'triadBuild' || triadState.step === 'triadOrientation') {
          handleTriadToggleKey(keyId);
        }
        return;
      }
      if (isBassGrandActive && bassGrandState) {
        dispatchBassGrandAction({
          type: 'keyPress',
          note: noteName,
          keyId
        });
        return;
      }
      if (currentCard?.skill === 'harmonyProgressionPlay') {
        handleDailyHarmonyToggleKey(keyId);
        return;
      }
      if (currentCard?.skill === 'harmonyFunctionIdentify' || currentCard?.skill === 'harmonyNextChord') return;
      if (
        currentCard?.skill === 'triadBuild' ||
        currentCard?.skill === 'triadInversionBuild' ||
        currentCard?.skill === 'chordSymbolRead'
      ) {
        selectedKeyIds = toggleKeyInChordSelection(selectedKeyIds, keyId);
        return;
      }
      if (currentCard && canUseInputForSkill(currentCard.skill, 'pianoKey')) {
        handleAnswerSubmit(noteName, keyId, 'screen');
      }
    }
  }

  // Semantic Named-Note Answer Handler (for answer buttons & PC keyboard shortcuts)
  function handleSemanticNoteInput(noteName: NoteName, channel: 'pcNote' | 'answerButton') {
    if (!isActivePracticeSession(currentSessionId)) return;
    if (
      activePage !== 'practice' ||
      practiceActivity !== 'standard' ||
      isLocked ||
      isCompleted
    ) {
      return;
    }

    if (firstRunState !== null && sessionPreset !== 'cold') {
      dispatchFirstRunAction({
        type: 'semanticAnswer',
        note: noteName,
        channel
      });
      return;
    }

    if (isCurriculumActive && curriculumState) {
      dispatchCurriculumAction({
        type: 'semanticAnswer',
        note: noteName,
        channel
      });
      return;
    }

    if (isCurriculum3dActive && curriculum3dState) {
      dispatchCurriculum3dAction({
        type: 'semanticAnswer',
        note: noteName,
        channel
      });
      return;
    }

    if (!currentCard) return;

    const semantic = resolveSemanticNoteAnswer(currentCard.skill, channel, noteName);
    if (!semantic) return;

    handleAnswerSubmit(
      semantic.answerNote,
      semantic.answerKeyId,
      channel === 'pcNote' ? 'pc' : 'answerButton'
    );
  }

  function isTriadQuality(answer: NoteName): answer is TriadQuality {
    return answer === 'major' || answer === 'minor';
  }

  function isTriadInversion(answer: NoteName): answer is TriadInversion {
    return answer === 'root' || answer === 'first' || answer === 'second';
  }

  function handleTaskAnswerButton(answer: NoteName) {
    if (currentCard?.skill === 'triadIdentify') {
      if (isTriadQuality(answer)) handleTriadSelectAnswer(answer);
      return;
    }
    if (currentCard?.skill === 'triadInversionIdentify') {
      if (isTriadInversion(answer)) handleInversionSelect(answer);
      return;
    }
    handleSemanticNoteInput(answer, 'answerButton');
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

    if (e.key === 'Escape') {
      isSettingsOpen = false;
      isContextOpen = false;
      isSessionSummaryOpen = false;
      return;
    }

    // Held keys must not fire a second semantic action.
    if (e.repeat) return;

    // Let focused interactive controls handle Enter/Space natively.
    const interactiveTarget = e.target instanceof HTMLElement
      ? e.target.closest('button, [role="button"], a[href], input, select, textarea')
      : null;
    if (interactiveTarget && (e.key === 'Enter' || e.code === 'Space' || e.key === ' ')) return;

    if (!isActivePracticeSession(currentSessionId)) return;
    if (activePage !== 'practice') return;

    if (isHarmonyActive && harmonyState) {
      if (e.repeat) return;
      if (e.code === 'Space' || e.key === ' ') {
        if (['orientation', 'smoothModel', 'smoothComparison'].includes(harmonyState.step)) {
          e.preventDefault();
          void dispatchHarmonyAction({ type: 'advanceStage' });
        }
        return;
      }
      const command = resolveHarmonyKeydownAction(harmonyState, e.key, e.code);
      if (command) {
        e.preventDefault();
        void dispatchHarmonyAction(command);
      }
      return;
    }

    if (isIntervalActive && intervalState) {
      const cmd = resolveIntervalKeydownAction(intervalState, e.key, e.code);
      if (cmd?.type === 'selectAnswer') {
        e.preventDefault();
        handleIntervalSelectAnswer(cmd.intervalId);
        return;
      }
      if (cmd?.type === 'advanceStage') {
        e.preventDefault();
        handleAdvanceIntervalStage();
        return;
      }
      if (cmd?.type === 'dontKnow') {
        e.preventDefault();
        handleIntervalDontKnow();
        return;
      }
      if (intervalState.activeSkill === 'intervalBuild') {
        const targetOctave = Number(
          intervalState.targetKeyId?.match(/\d+$/)?.[0] ??
            intervalState.rootKeyId?.match(/\d+$/)?.[0] ??
            4
        );
        const pianoKey = resolvePianoKeyFromKeyboard(e, targetOctave);
        if (pianoKey) {
          e.preventDefault();
          dispatchIntervalAction({ type: 'keyPress', ...pianoKey });
          return;
        }
      }
      if (e.key === 'Enter') {
        if (canUseDontKnowInIntervalStep(intervalState)) {
          e.preventDefault();
          handleIntervalDontKnow();
        }
        return;
      }
      return;
    }

    if (isInversionActive && inversionState) {
      const cmd = resolveInversionKeydownAction(inversionState, e.key, e.code);
      if (cmd?.type === 'selectAnswer') {
        e.preventDefault();
        handleInversionSelect(cmd.inversion);
        return;
      }
      if (cmd?.type === 'advanceStage') {
        e.preventDefault();
        handleAdvanceInversionStage();
        return;
      }
      if (cmd?.type === 'submitChord') {
        e.preventDefault();
        handleInversionSubmitChord();
        return;
      }
      if (cmd?.type === 'dontKnow') {
        e.preventDefault();
        handleInversionDontKnow();
        return;
      }
      if (e.key === 'Enter') {
        if (canUseDontKnowInInversionStep(inversionState)) {
          e.preventDefault();
          handleInversionDontKnow();
        }
        return;
      }
      return;
    }

    if (isTriadActive && triadState) {
      const cmd = resolveTriadKeydownAction(triadState, e.key, e.code);
      if (cmd?.type === 'selectAnswer') {
        e.preventDefault();
        handleTriadSelectAnswer(cmd.quality);
        return;
      }
      if (cmd?.type === 'advanceStage') {
        e.preventDefault();
        handleAdvanceTriadStage();
        return;
      }
      if (cmd?.type === 'submitChord') {
        e.preventDefault();
        handleTriadSubmitChord();
        return;
      }
      if (cmd?.type === 'dontKnow') {
        e.preventDefault();
        handleTriadDontKnow();
        return;
      }
      if (e.key === 'Enter') {
        if (canUseDontKnowInTriadStep(triadState)) {
          e.preventDefault();
          handleTriadDontKnow();
        }
        return;
      }
      return;
    }

    if (e.code === 'Space' || e.key === ' ') {
      if (practiceActivity === 'lesson' && lessonCanContinue) {
        e.preventDefault();
        advanceLesson();
        return;
      }
      if (practiceActivity === 'standard' && firstRunState !== null && sessionPreset !== 'cold') {
        const cmd = resolveFirstRunKeydownAction(firstRunState, e.key, e.code);
        if (cmd?.type === 'continue') {
          e.preventDefault();
          dispatchFirstRunAction({ type: 'continue' });
        } else if (cmd?.type === 'completeFirstRun') {
          e.preventDefault();
          completeFirstRunOnboarding();
        }
        return;
      }
      if (isCurriculumActive && curriculumState) {
        const cmd = resolveCurriculumKeydownAction(curriculumState, e.key, e.code);
        if (cmd?.type === 'completePhase3') {
          e.preventDefault();
          completeCurriculumPhase3();
        }
        return;
      }
      if (isCurriculum3dActive && curriculum3dState) {
        const cmd = resolveMilestone3dKeydownAction(curriculum3dState, e.key, e.code);
        if (cmd?.type === 'advancePhase') {
          e.preventDefault();
          advanceCurriculum3dPhase();
        }
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
      if (practiceActivity === 'standard' && currentCard?.skill === 'harmonyProgressionPlay') {
        e.preventDefault();
        if (selectedKeyIds.length === 3) handleDailyHarmonySubmitChord(selectedKeyIds, 'screen');
        return;
      }
      if (practiceActivity === 'standard' && (currentCard?.skill === 'harmonyFunctionIdentify' || currentCard?.skill === 'harmonyNextChord')) {
        e.preventDefault();
        return;
      }
      if (practiceActivity === 'lesson' && lessonCanContinue) {
        e.preventDefault();
        advanceLesson();
        return;
      }
      if (practiceActivity === 'standard' && firstRunState !== null && sessionPreset !== 'cold') {
        const cmd = resolveFirstRunKeydownAction(firstRunState, e.key, e.code);
        if (cmd?.type === 'continue') {
          e.preventDefault();
          dispatchFirstRunAction({ type: 'continue' });
        } else if (cmd?.type === 'completeFirstRun') {
          e.preventDefault();
          completeFirstRunOnboarding();
        } else if (cmd?.type === 'dontKnow') {
          e.preventDefault();
          handleDontKnow();
        }
        return;
      }
      if (isCurriculumActive && curriculumState) {
        const cmd = resolveCurriculumKeydownAction(curriculumState, e.key, e.code);
        if (cmd?.type === 'completePhase3') {
          e.preventDefault();
          completeCurriculumPhase3();
        } else if (cmd?.type === 'dontKnow') {
          e.preventDefault();
          handleDontKnow();
        }
        return;
      }
      if (isCurriculum3dActive && curriculum3dState) {
        const cmd = resolveMilestone3dKeydownAction(curriculum3dState, e.key, e.code);
        if (cmd?.type === 'advancePhase') {
          e.preventDefault();
          advanceCurriculum3dPhase();
        } else if (cmd?.type === 'dontKnow') {
          e.preventDefault();
          handleDontKnow();
        }
        return;
      }
      e.preventDefault();
      if (isCompleted) {
        clearAutoAdvance();
        nextRound();
        return;
      }
      handleDontKnow();
      return;
    }

    if (activePage !== 'practice' || isLocked || isCompleted) return;

    if (practiceActivity === 'standard') {
      if (firstRunState !== null && sessionPreset !== 'cold') {
        const activeSkill = getFirstRunStepSkill(firstRunState.step);
        const semantic = resolvePcKeyboardSemanticAnswer(activeSkill ?? undefined, e);
        if (!semantic) return;

        e.preventDefault();
        handleSemanticNoteInput(semantic.answerNote, 'pcNote');
        return;
      }

      if (isCurriculumActive && curriculumState) {
        const activeSkill = getCurriculumStepSkill(curriculumState.step);
        const semantic = resolvePcKeyboardSemanticAnswer(activeSkill ?? undefined, e);
        if (!semantic) return;

        e.preventDefault();
        handleSemanticNoteInput(semantic.answerNote, 'pcNote');
        return;
      }

      if (isCurriculum3dActive && curriculum3dState) {
        const activeSkill = getMilestone3dStepSkill(curriculum3dState.step);
        const semantic = resolvePcKeyboardSemanticAnswer(activeSkill ?? undefined, e);
        if (!semantic) return;

        e.preventDefault();
        handleSemanticNoteInput(semantic.answerNote, 'pcNote');
        return;
      }

      if (currentCard?.skill === 'harmonyFunctionIdentify' || currentCard?.skill === 'harmonyNextChord') {
        const task = dailyHarmonyTask;
        if (!task || task.kind !== 'semantic') return;
        const answer = resolveHarmonyReviewKeydownAnswer(task, e.key, e.code);
        if (answer) {
          e.preventDefault();
          handleDailyHarmonyAnswer(answer, 'pc');
        }
        return;
      }
      if (currentCard?.skill === 'harmonyProgressionPlay') return;

      if (currentCard?.skill === 'intervalIdentify') {
        const intervalKeyMap: Record<string, IntervalId> = {
          Digit1: 'P8', Key1: 'P8', '1': 'P8',
          Digit2: 'P5', Key2: 'P5', '2': 'P5',
          Digit3: 'M3', Key3: 'M3', '3': 'M3',
          Digit4: 'm3', Key4: 'm3', '4': 'm3'
        };
        const mapped = intervalKeyMap[e.code] || intervalKeyMap[e.key];
        if (mapped) {
          e.preventDefault();
          handleSemanticNoteInput(mapped, 'answerButton');
          return;
        }
        return;
      }

      if (currentCard?.skill === 'triadIdentify') {
        const triadKeyMap: Record<string, TriadQuality> = {
          Digit1: 'major', Key1: 'major', '1': 'major', Numpad1: 'major',
          Digit2: 'minor', Key2: 'minor', '2': 'minor', Numpad2: 'minor'
        };
        const mapped = triadKeyMap[e.code] || triadKeyMap[e.key];
        if (mapped) {
          e.preventDefault();
          handleTriadSelectAnswer(mapped);
          return;
        }
        return;
      }

      if (currentCard?.skill === 'triadInversionIdentify') {
        const invKeyMap: Record<string, TriadInversion> = {
          Digit1: 'root', Key1: 'root', '1': 'root', Numpad1: 'root',
          Digit2: 'first', Key2: 'first', '2': 'first', Numpad2: 'first',
          Digit3: 'second', Key3: 'second', '3': 'second', Numpad3: 'second'
        };
        const mapped = invKeyMap[e.code] || invKeyMap[e.key];
        if (mapped) {
          e.preventDefault();
          handleInversionSelect(mapped);
          return;
        }
        return;
      }

      if (
        currentCard?.skill === 'triadBuild' ||
        currentCard?.skill === 'triadInversionBuild' ||
        currentCard?.skill === 'chordSymbolRead'
      ) {
        if (e.key === 'Enter' && selectedKeyIds.length === 3) {
          e.preventDefault();
          handleDailyChordSubmit(selectedKeyIds, 'screen');
          return;
        }
      }

      const semantic = resolvePcKeyboardSemanticAnswer(currentCard?.skill, e);
      if (!semantic) return;

      e.preventDefault();
      handleSemanticNoteInput(semantic.answerNote, 'pcNote');
      return;
    }

    const resolved = resolveNoteFromKeyboard(e);
    if (!resolved) return;

    e.preventDefault();
    const fallbackOctave = targetKeyId ? targetKeyId.slice(-1) : '4';
    handleKeyClick(`${resolved.note}${fallbackOctave}`, resolved.note);
  }

  onMount(() => {
    const audioEngine = AudioEngine.getInstance();
    audioEngine.setStatusCallback((status, msg) => {
      audioStatus = msg;
      audioReady = status === 'ready';
    });
    audioEngine.preloadSamples();

    const midi = MidiController.getInstance();
    const unsubscribeMidiStatus = midi.onStatusChange((st) => {
      midiStatus = st.message;
      midiReady = st.connected;
    });
    const unsubscribeMidiNoteOn = midi.onNoteOn((ev: MidiNoteOnEvent) => {
      if (!isActivePracticeSession(currentSessionId)) return;
      midiActiveKeyIds = [...midiActiveKeyIds, ev.keyId];
      audioEngine.playPianoMidi(ev.midi, ev.velocity, ev.voiceKey);

      if (activePage === 'practice' && !isLocked) {
        if (practiceActivity === 'repertoire') {
          handleRepertoireInput(ev.keyId, { input: 'midi', velocity: ev.velocity, voiceKey: ev.voiceKey });
        } else if (practiceActivity === 'twohand') {
          handleTwoHandKeyInput(ev.keyId, { input: 'midi' });
        } else if (practiceActivity === 'lesson') {
          handleLessonKeyInput(ev.noteName, ev.keyId);
        } else if (
          practiceActivity === 'standard' &&
          firstRunState !== null &&
          sessionPreset !== 'cold'
        ) {
          dispatchFirstRunAction({
            type: 'keyPress',
            note: ev.noteName,
            keyId: ev.keyId,
            inputMethod: 'midi'
          });
        } else if (isCurriculumActive && curriculumState) {
          dispatchCurriculumAction({
            type: 'keyPress',
            note: ev.noteName,
            keyId: ev.keyId,
            inputMethod: 'midi'
          });
        } else if (isCurriculum3dActive && curriculum3dState) {
          dispatchCurriculum3dAction({
            type: 'keyPress',
            note: ev.noteName,
            keyId: ev.keyId,
            inputMethod: 'midi'
          });
        } else if (isIntervalActive && intervalState) {
          if (intervalState.activeSkill === 'intervalBuild' || intervalState.step === 'intervalOrientation') {
            dispatchIntervalAction({
              type: 'keyPress',
              note: ev.noteName,
              keyId: ev.keyId
            });
          }
        } else if (isChordRhythmActive || isDailyRhythmActive) {
          const rhythmState = chordRhythmState ?? dailyRhythmViewState;
          if (
            midiReady && rhythmState?.isRunning && rhythmState.step !== 'countingPulse' &&
            rhythmState.countInValue === null && performance.now() >= rhythmCountInEndsAt
          ) {
            rhythmMidiByKeyId.set(ev.keyId, ev.midi);
            midiChordTracker.handleNoteOn(ev.keyId, chordKeyIds => {
              const chordMidiNotes = chordKeyIds
                .map(keyId => rhythmMidiByKeyId.get(keyId) ?? midiFromKeyId(keyId))
                .filter((midi): midi is number => midi !== null);
              submitRhythmChord(chordKeyIds, 'midi', ev.timestamp, chordMidiNotes);
            });
            midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
          }
        } else if (isHarmonyActive && harmonyState) {
          if (canInputHarmonyChord(harmonyState)) {
            midiChordTracker.handleNoteOn(ev.keyId, chordKeyIds => {
              void dispatchHarmonyAction({ type: 'submitChord', keyIds: chordKeyIds });
            });
            midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
          }
        } else if (isInversionActive && inversionState) {
          if (canInputInversionChord(inversionState)) {
            midiChordTracker.handleNoteOn(ev.keyId, (chordKeyIds) => {
              dispatchInversionAction({ type: 'submitChord', keyIds: chordKeyIds });
            });
            midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
          }
        } else if (isTriadActive && triadState) {
          if (triadState.activeSkill === 'triadBuild' || triadState.step === 'triadOrientation') {
            const isGuidedTriadBuild =
              triadState.activeSkill === 'triadBuild' && triadState.step.endsWith('Guided');
            midiChordTracker.handleNoteOn(
              ev.keyId,
              chordKeyIds => dispatchTriadAction({ type: 'submitChord', keyIds: chordKeyIds }),
              {
                requiredNoteCount: isGuidedTriadBuild ? 2 : 3,
                excludedFromCount: isGuidedTriadBuild ? triadState.structuralGuideKeyIds : []
              }
            );
          }
        } else if (isBassGrandActive && bassGrandState) {
          dispatchBassGrandAction({
            type: 'keyPress',
            note: ev.noteName,
            keyId: ev.keyId
          });
        } else if (practiceActivity === 'standard' && currentCard?.skill === 'harmonyProgressionPlay') {
          midiChordTracker.handleNoteOn(ev.keyId, chordKeyIds => {
            handleDailyHarmonySubmitChord(chordKeyIds, 'midi');
          });
          midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
        } else if (
          practiceActivity === 'standard' &&
          (currentCard?.skill === 'triadBuild' ||
            currentCard?.skill === 'triadInversionBuild' ||
            currentCard?.skill === 'chordSymbolRead')
        ) {
          midiChordTracker.handleNoteOn(ev.keyId, (chordKeyIds) => {
            handleDailyChordSubmit(chordKeyIds, 'midi');
          });
          midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
        } else if (
          practiceActivity === 'standard' &&
          currentCard &&
          canUseInputForSkill(currentCard.skill, 'midi')
        ) {
          handleAnswerSubmit(ev.noteName, ev.keyId, 'midi');
        }
      }
    });
    const unsubscribeMidiNoteOff = midi.onNoteOff((ev: MidiNoteOffEvent) => {
      midiActiveKeyIds = midiActiveKeyIds.filter(id => id !== ev.keyId);
      rhythmMidiByKeyId.delete(ev.keyId);
      audioEngine.releaseVoice(ev.voiceKey, 0.12);
      midiChordTracker.handleNoteOff(ev.keyId);
      midiChordHeldKeyIds = midiChordTracker.getActiveNotes();
    });
    if (midi.isSupported()) midi.connect();

    loadData();

    const unlockAudioOnFirstGesture = () => {
      void audioEngine.ensureContext();
      window.removeEventListener('pointerdown', unlockAudioOnFirstGesture, true);
      window.removeEventListener('keydown', unlockAudioOnFirstGesture, true);
    };
    window.addEventListener('pointerdown', unlockAudioOnFirstGesture, true);
    if (typeof window !== 'undefined') {
      (window as any).__openSessionSummary = (data?: Partial<typeof sessionSummaryData>) => {
        if (data) {
          sessionSummaryData = { ...sessionSummaryData, ...data };
        }
        isSessionSummaryOpen = true;
      };
    }

    window.addEventListener('keydown', handleWindowKeydown);
    const handleVisibilityChange = () => {
      if (document.hidden) cancelChordRhythmRun('скрытие вкладки');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      unsubscribeMidiStatus();
      unsubscribeMidiNoteOn();
      unsubscribeMidiNoteOff();
      endPracticeSession(currentSessionId);
      cancelChordRhythmRun('выгрузка компонента');
      clearAutoAdvance();
      stopReactionTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pointerdown', unlockAudioOnFirstGesture, true);
      window.removeEventListener('keydown', unlockAudioOnFirstGesture, true);
      window.removeEventListener('keydown', handleWindowKeydown);
      if (sessionClockInterval != null) {
        clearInterval(sessionClockInterval);
        sessionClockInterval = null;
      }
      if (repertoireCountInTimer != null) {
        clearInterval(repertoireCountInTimer);
        repertoireCountInTimer = null;
      }
      if (repertoireDemoTimer != null) {
        clearTimeout(repertoireDemoTimer);
        repertoireDemoTimer = null;
      }
      if (repertoireKeyFeedbackTimer != null) {
        clearTimeout(repertoireKeyFeedbackTimer);
        repertoireKeyFeedbackTimer = null;
      }
    };
  });

  $effect(() => {
    void activePage;
    void practiceActivity;
    if (activePage !== 'practice') cancelChordRhythmRun('смена экрана');
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(ACTIVE_PAGE_SESSION_KEY, activePage);
      }
    } catch (_) {}
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const appEl = document.getElementById('app');
      if (appEl) appEl.scrollTop = 0;
    }
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
      onPageChange={(p: string) => { activePage = p; }}
      onToggleSettings={() => { isSettingsOpen = !isSettingsOpen; }}
      onToggleContext={() => { isContextOpen = !isContextOpen; }}
    />
  </header>

  <div class="workspace-pages" style="min-height: 0;">
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
          {@const baseSong = REPERTOIRE.find(s => s.id === activeRepertoire!.id)}
          {#if baseSong}
            {@const song = getSongVersion(baseSong, activeRepertoire.lengthMode)}
            {@const totalMeasures = getSongMeasureCount(song)}
            {@const currentMeasure = getMeasureForNoteIndex(song, activeRepertoire.index)}
            <SongBanner
              title={song.title}
              progressText="{activeRepertoire.displayMode === 'staff' ? 'Ноты' : 'Клавиши'} · {activeRepertoire.bpm ? `${activeRepertoire.bpm} BPM` : 'Wait Mode'} · {activeRepertoire.index + 1}/{song.notes.length}"
              subtitle={activeRepertoire.countingIn ? `Приготовьтесь: счёт ${activeRepertoire.countInValue}` : song.description}
              dynamicsMode={settings.repertoireDynamicsTarget || 'off'}
              articulationMode={settings.repertoireArticulationTarget || 'off'}
              lastExpressionText={activeRepertoire.lastExpressionText}
              {totalMeasures}
              {currentMeasure}
              loopMeasure={activeRepertoire.loopMeasure}
              loopCount={activeRepertoire.loopCount}
              lengthMode={activeRepertoire.lengthMode}
              hasFull={hasFullVersion(baseSong)}
              isDemoPlaying={activeRepertoire.isDemoPlaying}
              onToggleDemo={toggleRepertoireDemo}
              onSetLengthMode={setRepertoireLengthMode}
              onSetLoopMeasure={setRepertoireLoop}
              onPrevMeasure={prevRepertoireMeasure}
              onNextMeasure={nextRepertoireMeasure}
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
              progressText="Шаг {Math.min(activeTwoHand.index + 1, pattern.steps.length)}/{pattern.steps.length}"
              subtitle={pattern.description}
              onRestart={restartTwoHand}
              onExit={leaveTwoHand}
            />
          {/if}
        <!-- 4a. First-Run C/F Guided Learning Strip -->
        {:else if isFirstRunActive && firstRunStepProgress && sessionPreset !== 'cold'}
          <SessionStrip
            metaTitle={firstRunStepProgress.headerMeta}
            sessionLabel={firstRunStepProgress.headerTitle}
            sessionDetail={firstRunStepProgress.stepLabel}
            progressPct={firstRunStepProgress.progressPct}
            isEnded={false}
            showEndButton={false}
          />
        <!-- 4b. Milestone 3C White-Key Curriculum Strip -->
        {:else if isCurriculumActive && curriculumStepProgress && sessionPreset !== 'cold'}
          <SessionStrip
            metaTitle={curriculumStepProgress.headerMeta}
            sessionLabel={curriculumStepProgress.headerTitle}
            sessionDetail={curriculumStepProgress.stepLabel}
            progressPct={curriculumStepProgress.progressPct}
            isEnded={false}
            showEndButton={false}
          />
        <!-- 4c. Milestone 3D Curriculum Strip -->
        {:else if isCurriculum3dActive && curriculum3dStepProgress && sessionPreset !== 'cold'}
          <SessionStrip
            metaTitle={curriculum3dStepProgress.headerMeta}
            sessionLabel={curriculum3dStepProgress.headerTitle}
            sessionDetail={curriculum3dStepProgress.stepLabel}
            progressPct={curriculum3dStepProgress.progressPct}
            isEnded={false}
            showEndButton={false}
          />
        <!-- 4d. Session Strip (in standard practice & cold test) -->
        {:else}
          <SessionStrip
            sessionLabel={sessionStatusLabel}
            sessionDetail={sessionDetailLabel}
            progressPct={sessionProgressPct}
            isEnded={isSessionEnded}
            onEndSession={() => finishLearningSession('manual')}
          />
        {/if}

        <!-- Interactive Task Stage Area (Fixed Grid Row 2) -->
        <div class="practice-stage-center">
          {#if practiceActivity === 'lesson' && activeLesson}
            {@const lesson = activeLessonDef()}
            {#if lesson}
              {@const step = lesson.steps[activeLesson.stepIndex]}
              <div class="lesson-stage-wrap">
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
                <div class="practice-inline-actions">
                  {#if lessonCanContinue}
                    <button
                      type="button"
                      class="btn primary"
                      style="min-width:160px; font-size:14px; padding:8px 18px; font-weight:600;"
                      onclick={advanceLesson}
                    >
                      {lessonContinueLabel} →
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="btn"
                    style="padding:8px 14px; font-size:14px;"
                    onclick={leaveLesson}
                  >
                    Выйти из урока
                  </button>
                </div>
              </div>
            {/if}
          {:else if practiceActivity === 'repertoire' && activeRepertoire}
            {@const baseSong = REPERTOIRE.find(s => s.id === activeRepertoire!.id)}
            {#if baseSong}
              {@const song = getSongVersion(baseSong, activeRepertoire.lengthMode)}
              <div class="repertoire-stage-wrap {activeRepertoire.displayMode === 'staff' ? 'is-staff-mode' : ''}">
                {#if activeRepertoire.displayMode === 'staff'}
                  <div class="repertoire-staff-holder">
                    <Staff
                      mode="repertoire"
                      repertoireSong={song}
                      currentNoteIndex={activeRepertoire.index}
                      loopMeasure={activeRepertoire.loopMeasure}
                      isCompleted={activeRepertoire.completed}
                    />
                  </div>
                {/if}
                <TaskStage
                  eyebrow="Мелодия · {song.level} · {activeRepertoire.lengthMode === 'full' ? '🎼 Полная мелодия' : '✂️ Отрывок'}{activeRepertoire.loopMeasure != null ? ` · 🔁 Зациклен такт ${activeRepertoire.loopMeasure}` : ''}"
                  promptText={activeRepertoire.displayMode === 'staff' ? 'Читайте ноты на стане' : `<span class="note">${song.notes[activeRepertoire.index] || 'Конец'}</span>`}
                  instructionText={activeRepertoire.countingIn ? `Счёт 4–3–2–1... приготовьтесь к первому такту` : activeRepertoire.displayMode === 'staff' ? 'Найдите и сыграйте выделенную на стане ноту на клавиатуре' : `Найдите клавишу ${song.notes[activeRepertoire.index] || 'Завершено'} на клавиатуре`}
                  showReactionPanel={false}
                  {feedbackText}
                  {feedbackClass}
                  {isCompleted}
                  showDontKnow={false}
                  onNextQuestion={nextRound}
                />
              </div>
            {/if}
          {:else if practiceActivity === 'earIntervals' && activeEarInterval}
            <div class="ear-stage-wrap">
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
                {autoAdvanceCountdown}
                showSoundRepeat={true}
                showDontKnow={false}
                onReplaySound={() => playIntervalSequence(activeEarInterval!.item.targetKeyId, 'C4')}
                onNextQuestion={nextRound}
              />
              <div class="practice-inline-actions">
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
            </div>
          {:else if practiceActivity === 'earTriads' && activeEarTriad}
            <div class="ear-stage-wrap">
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
                {autoAdvanceCountdown}
                showSoundRepeat={true}
                showDontKnow={false}
                onReplaySound={() => playTriadSequence(activeEarTriad!.item.notes, 'arpeggio')}
                onNextQuestion={nextRound}
              />
              <div class="practice-inline-actions">
                <button
                  type="button"
                  class="btn primary"
                  style="min-width:140px; font-size:15px; padding:8px 18px;"
                  disabled={activeEarTriad.answered}
                  onclick={() => handleEarTriadAnswer('major')}
                >
                  ☀️ Мажор (светлое)
                </button>
                <button
                  type="button"
                  class="btn"
                  style="min-width:140px; font-size:15px; padding:8px 18px;"
                  disabled={activeEarTriad.answered}
                  onclick={() => handleEarTriadAnswer('minor')}
                >
                  🌧️ Минор (задумчивое)
                </button>
              </div>
            </div>
          {:else if practiceActivity === 'earEcho' && activeEarEcho}
            {@const echo = activeEarEcho!}
            <div class="ear-stage-wrap">
              <TaskStage
                eyebrow="Тренировка слуха · Мелодическое эхо · {echo.item.level === 'easy' ? '3 ноты' : echo.item.level === 'medium' ? '4 ноты' : '5 нот'}"
                promptText="<div class='echo-slots-container' style='display:flex; justify-content:center; gap:10px; margin: 2px 0;'>{echo.item.notes.map((n, i) => `<span class='echo-slot ${i < echo.currentIndex ? 'done' : i === echo.currentIndex ? 'current' : ''}' style='display:inline-flex; align-items:center; justify-content:center; min-width:40px; height:36px; padding:0 8px; border-radius:10px; font-weight:700; font-size:15px; border:2px solid ${i < echo.currentIndex ? '#22c55e' : i === echo.currentIndex ? '#38bdf8' : 'rgba(148,163,184,0.3)'}; background:${i < echo.currentIndex ? 'rgba(34,197,94,0.18)' : i === echo.currentIndex ? 'rgba(56,189,248,0.15)' : 'rgba(15,23,42,0.4)'}; color:${i < echo.currentIndex ? '#4ade80' : i === echo.currentIndex ? '#38bdf8' : '#64748b'};'>${i < echo.currentIndex ? n : (i === echo.currentIndex ? '?' : '·')}</span>`).join('')}</div>"
                instructionText="Послушайте фразу и сыграйте её на клавиатуре фортепиано (нота {Math.min(echo.currentIndex + 1, echo.item.notes.length)} из {echo.item.notes.length})"
                reactionTime="—"
                reactionStatus="Слух · Эхо"
                {feedbackText}
                {feedbackClass}
                isCompleted={echo.completed}
                {autoAdvanceCountdown}
                showSoundRepeat={true}
                showDontKnow={false}
                onReplaySound={() => playEchoPhrase(echo.item.notes)}
                onNextQuestion={nextRound}
              />
            </div>
          {:else if practiceActivity === 'twohand' && activeTwoHand}
            {@const pattern = activeTwoHandPattern()}
            {#if pattern}
              {@const step = pattern.steps[activeTwoHand.index]}
              {@const isPair = pattern.mode === 'pair' || pattern.mode === 'anchor'}
              {@const pairStep = isPair ? (step as { left: string; right: string }) : null}
              {@const altStep = !isPair ? (step as { key: string; hand: 'L' | 'R' }) : null}

              <div class="twohand-stage-wrap">
                <div class="twohand-staff-holder">
                  <Staff
                    mode="twohand"
                    twoHandLeft={isPair ? pairStep?.left : (altStep?.hand === 'L' ? altStep.key : null)}
                    twoHandRight={isPair ? pairStep?.right : (altStep?.hand === 'R' ? altStep.key : null)}
                  />
                </div>

                <TaskStage
                  eyebrow="Две руки · {pattern.title} · Шаг {Math.min(activeTwoHand.index + 1, pattern.steps.length)}/{pattern.steps.length}"
                  promptText={isPair
                    ? `Левая: <span class='note' style='color:#c084fc;'>${pairStep?.left}</span> &nbsp;+&nbsp; Правая: <span class='note' style='color:#38bdf8;'>${pairStep?.right}</span>`
                    : `${altStep?.hand === 'L' ? 'Левая рука' : 'Правая рука'}: <span class='note' style='color:${altStep?.hand === 'L' ? '#c084fc' : '#38bdf8'};'>${altStep?.key}</span>`}
                  instructionText={pattern.mode === 'pair'
                    ? 'Сыграйте обе ноты одновременно (по MIDI или поочередно кликом)'
                    : pattern.mode === 'anchor'
                      ? `Удерживайте левой рукой ${pairStep?.left} и нажмите ${pairStep?.right}`
                      : `Сыграйте ${altStep?.hand === 'L' ? 'левой рукой (фиолетовая)' : 'правой рукой (голубая)'}`}
                  reactionTime="—"
                  reactionStatus={activeTwoHand.bpm ? '60 BPM' : 'Wait Mode'}
                  {feedbackText}
                  {feedbackClass}
                  isCompleted={activeTwoHand.completed}
                  showDontKnow={false}
                  showAnswerButtons={false}
                  onNextQuestion={nextRound}
                />

                <div class="practice-inline-actions">
                  {#if activeTwoHand.completed}
                    <button
                      type="button"
                      class="btn primary"
                      style="font-size:13px; padding:6px 14px; font-weight:600;"
                      onclick={restartTwoHand}
                    >
                      Повторить упражнение 🔁
                    </button>
                    <button
                      type="button"
                      class="btn"
                      style="padding:6px 12px; font-size:13px;"
                      onclick={leaveTwoHand}
                    >
                      К списку упражнений
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          {:else if isFirstRunActive && firstRunState && sessionPreset !== 'cold'}
            <div class="first-run-stage-wrap">
              <FirstRunStage
                state={firstRunState}
                wrongAnswerNotes={pulseWrongAnswerNotes}
                correctAnswerNotes={pulseCorrectAnswerNotes}
                onContinue={() => dispatchFirstRunAction({ type: 'continue' })}
                onAnswerClick={(n) => handleSemanticNoteInput(n, 'answerButton')}
                onDontKnow={() => dispatchFirstRunAction({ type: 'dontKnow' })}
                onCompleteFirstRun={completeFirstRunOnboarding}
              />
            </div>
          {:else if isCurriculumActive && curriculumState && sessionPreset !== 'cold'}
            <div class="first-run-stage-wrap curriculum-3c-stage-wrap">
              <CurriculumStage
                state={curriculumState}
                wrongAnswerNotes={pulseWrongAnswerNotes}
                correctAnswerNotes={pulseCorrectAnswerNotes}
                onAnswerClick={(n) => handleSemanticNoteInput(n, 'answerButton')}
                onDontKnow={() => dispatchCurriculumAction({ type: 'dontKnow' })}
                onCompletePhase3={completeCurriculumPhase3}
              />
            </div>
          {:else if isCurriculum3dActive && curriculum3dState && sessionPreset !== 'cold'}
            <div class="first-run-stage-wrap curriculum-3d-stage-wrap">
              <Curriculum3dStage
                state={curriculum3dState}
                wrongAnswerNotes={pulseWrongAnswerNotes}
                correctAnswerNotes={pulseCorrectAnswerNotes}
                onAnswerClick={(n) => handleSemanticNoteInput(n, 'answerButton')}
                onDontKnow={() => dispatchCurriculum3dAction({ type: 'dontKnow' })}
                onAdvancePhase={advanceCurriculum3dPhase}
                onPlaySoundPrompt={playSoundPrompt}
              />
            </div>
          {:else if isBassGrandActive && bassGrandState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap advanced-notation-stage-wrap">
              <AdvancedNotationStage
                state={bassGrandState}
                onDontKnow={handleBassGrandDontKnow}
                onAdvanceStage={handleAdvanceBassGrandStage}
                onCompleteModule={handleCompleteBassGrandModule}
              />
            </div>
          {:else if isIntervalActive && intervalState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap interval-stage-wrap">
              <IntervalStage
                state={intervalState}
                onDontKnow={handleIntervalDontKnow}
                onAdvanceStage={handleAdvanceIntervalStage}
                onSelectAnswer={handleIntervalSelectAnswer}
                onCompleteModule={handleCompleteIntervalModule}
              />
            </div>
          {:else if isTriadActive && triadState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap triad-stage-wrap">
              <TriadStage
                state={triadState}
                midiActiveKeyIds={midiActiveKeyIds}
                onDontKnow={handleTriadDontKnow}
                onAdvanceStage={handleAdvanceTriadStage}
                onSelectAnswer={handleTriadSelectAnswer}
                onSubmitChord={handleTriadSubmitChord}
                onCompleteModule={handleCompleteTriadModule}
              />
            </div>
          {:else if isInversionActive && inversionState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap inversion-stage-wrap">
              <InversionStage
                state={inversionState}
                midiHeldKeyIds={midiChordHeldKeyIds}
                onDontKnow={handleInversionDontKnow}
                onAdvanceStage={handleAdvanceInversionStage}
                onSelectInversion={handleInversionSelect}
                onSubmitChord={handleInversionSubmitChord}
                onPlayVoicingAudio={(keys) => playTriadAudio(keys)}
                onCompleteModule={handleCompleteInversionModule}
              />
            </div>
          {:else if isChordRhythmActive && chordRhythmState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap chord-rhythm-stage-wrap" data-testid="m3k-module-stage">
              <ChordRhythmStage
                state={chordRhythmState}
                midiConnected={midiReady}
                onAdvance={handleAdvanceChordRhythmStage}
                onStartRun={() => void startChordRhythmRun()}
                onSubmit={() => submitRhythmChord(chordRhythmState?.selectedKeyIds ?? [], 'screen')}
                onRetry={() => {
                  if (chordRhythmState?.step === 'transferRemediation' && chordRhythmState.feedbackTone === 'good') finishChordRhythmRemediationItem();
                  else if (chordRhythmState?.step === 'transferResult' && chordRhythmState.assessment.phase === 'failed') returnFromChordRhythmFailure();
                  else void startChordRhythmRun();
                }}
                onRemediation={startChordRhythmRemediation}
                onComplete={() => void completeChordRhythmModule()}
                onExit={(destination) => exitChordRhythmModule(destination)}
              />
            </div>
          {:else if isDailyRhythmActive && dailyRhythmViewState && currentCard}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap chord-rhythm-stage-wrap" data-testid="daily-rhythm-stage">
              <ChordRhythmStage
                state={dailyRhythmViewState}
                midiConnected={midiReady}
                dailySkill={rhythmDailySkill(currentCard)}
                dailyChordId={dailyRhythmChordId}
                dailyFeedback={dailyRhythmFeedback}
                dailyFeedbackTone={dailyRhythmFeedbackTone}
                dailyCorrective={dailyRhythmCorrective}
                dailyCompleted={dailyRhythmCompleted}
                onAdvance={advanceDailyRhythmQuestion}
                onStartRun={() => void startChordRhythmRun()}
                onSubmit={() => submitRhythmChord(dailyRhythmViewState?.selectedKeyIds ?? [], 'screen')}
                onRetry={() => void startChordRhythmRun()}
                onRemediation={() => void startChordRhythmRun()}
                onComplete={advanceDailyRhythmQuestion}
                onExit={advanceDailyRhythmQuestion}
              />
            </div>
          {:else if isHarmonyActive && harmonyState}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap harmony-stage-wrap">
              <HarmonyStage
                state={harmonyState}
                selectedKeyIds={harmonyState.selectedKeyIds}
                midiHeldKeyIds={midiChordHeldKeyIds}
                onAction={dispatchHarmonyAction}
                onComplete={handleCompleteHarmonyModule}
              />
            </div>
          {:else if currentCard && dailyHarmonyTask}
            <div class="first-run-stage-wrap advanced-learning-stage-wrap harmony-stage-wrap">
              <HarmonyStage
                reviewTask={dailyHarmonyTask}
                reviewStepIndex={dailyHarmonyStepIndex}
                reviewHadWrong={dailyHarmonyHadWrong || dailyHarmonyCorrective}
                reviewCompleted={isCompleted}
                reviewFeedback={dailyHarmonyFeedback}
                reviewFeedbackTone={dailyHarmonyFeedbackTone}
                selectedKeyIds={selectedKeyIds}
                midiHeldKeyIds={midiChordHeldKeyIds}
                onReviewAnswer={(answer) => handleDailyHarmonyAnswer(answer, 'answerButton')}
                onReviewToggleKey={handleDailyHarmonyToggleKey}
                onReviewSubmitChord={handleDailyHarmonySubmitChord}
                onReviewNext={() => { clearAutoAdvance(); nextRound(); }}
              />
            </div>
          {:else if isSessionEnded}
            <div class="card-stage-wrap session-complete-stage-wrap" data-testid="session-complete-stage">
              <div class="session-complete-card">
                <div class="session-complete-badge">СЕССИЯ ЗАВЕРШЕНА</div>
                <h2 class="session-complete-title">
                  {sessionPreset === 'due' ? 'Все плановые повторения выполнены' : 'Сессия завершена'}
                </h2>
                <p class="session-complete-desc">
                  {sessionPreset === 'due'
                    ? 'На сегодня запланированных повторений не осталось. Отличная работа!'
                    : 'Тренировка окончена. Результаты сохранены в статистике.'}
                </p>
                <div class="session-complete-actions">
                  <button
                    class="btn btn-primary"
                    data-testid="btn-open-summary"
                    onclick={() => { isSessionSummaryOpen = true; }}
                  >
                    Показать итоги сессии
                  </button>
                  <button
                    class="btn btn-secondary"
                    data-testid="btn-new-session"
                    onclick={() => {
                      startLearningSession(sessionPreset);
                      nextRound();
                    }}
                  >
                    Начать новую сессию
                  </button>
                </div>
              </div>
            </div>
          {:else if currentCard}
            {@const promptHtml = (currentCard.skill === 'notationToKey' || currentCard.skill === 'notationBassToKey')
              ? 'Читайте ноту на стане'
              : currentCard.skill === 'find'
                ? `Найдите ноту <span class="note">${DISPLAY_NAMES[currentCard.note]}</span>`
                : currentCard.skill === 'identify'
                  ? `Какая нота подсвечена на клавиатуре?`
                  : currentCard.skill === 'soundToKey'
                    ? `<span class="note">C4</span> → 🔊 → ?`
                    : currentCard.skill === 'intervalBuild'
                      ? `Постройте интервал: <span class="note">${DISPLAY_NAMES[currentCard.note] || '?'}</span> от ${structuralGuideKeyIds[0] || 'C4'}`
                      : currentCard.skill === 'intervalIdentify'
                        ? 'Определите интервал между подсвеченными клавишами'
                        : currentCard.skill === 'triadBuild'
                          ? `Постройте трезвучие: <span class="note">${DISPLAY_NAMES[currentCard.note] || '?'}</span> от ${structuralGuideKeyIds[0] || 'C4'}`
                          : currentCard.skill === 'triadIdentify'
                            ? 'Определите трезвучие по трём подсвеченным клавишам'
                            : currentCard.skill === 'triadInversionBuild'
                              ? currentCard.note === 'slash'
                                ? `Постройте аккорд по обозначению <span class="note">${currentChordSymbol || 'C/E'}</span> (бас: ${structuralGuideKeyIds[0] || 'C4'})`
                                : `Постройте ${currentCard.note === 'second' ? '2-е обращение' : '1-е обращение'} (бас: ${structuralGuideKeyIds[0] || 'C4'})`
                              : currentCard.skill === 'triadInversionIdentify'
                                ? 'Определите положение трезвучия по трём клавишам'
                                : currentCard.skill === 'chordSymbolRead'
                                  ? `Сыграйте аккорд по обозначению: <span class="note">${currentChordSymbol || DISPLAY_NAMES[currentCard.note] || '?'}</span>`
                                  : getPatternIdentifyPrompt(currentCard.note)
            }

            <div class="card-stage-wrap {currentCard.skill === 'notationToKey' || currentCard.skill === 'notationBassToKey' ? 'has-staff' : ''}">
              {#if currentCard.skill === 'notationToKey' || currentCard.skill === 'notationBassToKey'}
                {@const isTransfer = currentKind === 'transfer'}
                {@const isScheduled = currentKind === 'scheduled'}
                {@const isGrand = currentIsGrandStaff || (!isTransfer && !isScheduled && settings.notationClef === 'grand')}
                {@const staffClef = isGrand ? 'grand' : currentCard.skill === 'notationBassToKey' ? 'bass' : currentClef !== 'auto' ? currentClef : (isScheduled || isTransfer ? 'treble' : (settings.notationClef || 'auto'))}
                <div class="single-staff-holder {isGrand ? 'is-grand' : ''}">
                  <Staff 
                    keyId={targetKeyId || (currentCard.skill === 'notationBassToKey' ? `${currentCard.note}3` : `${currentCard.note}4`)} 
                    mode="single" 
                    pulseGuide={staffPulseGuide} 
                    clef={staffClef} 
                  />
                </div>
              {/if}

              <TaskStage
                eyebrow={currentTaskEyebrow || (currentKind === 'cold' ? `Cold Test · ${Math.min(coldIndex + 1, 20)}/20` : currentKind === 'confusion' ? 'КОНТРАСТ · ' + currentCard.skill : currentKind === 'scheduled' ? 'ПЛАНОВОЕ ПОВТОРЕНИЕ · ' + currentCard.skill : currentKind === 'new' ? 'Новая карточка · ' + currentCard.skill : currentKind === 'transfer' ? 'ПЕРЕНОС НАВЫКА · ' + currentCard.skill : 'ЗАКРЕПЛЕНИЕ · ' + currentCard.skill)}
                promptText={promptHtml}
                instructionText={
                  currentCard.skill === 'triadInversionBuild'
                    ? currentCard.note === 'slash'
                      ? `Сыграйте полный аккорд из 3 нот по обозначению ${currentChordSymbol || 'C/E'}. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; на MIDI одновременно удерживайте все три ноты.`
                      : `Сыграйте полный аккорд из 3 нот в указанном обращении. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; на MIDI одновременно удерживайте все три ноты.`
                    : currentCard.skill === 'chordSymbolRead'
                      ? `Сыграйте полный аккорд из 3 нот по показанному обозначению. На экранной клавиатуре выберите три клавиши и нажмите «Проверить»; на MIDI одновременно удерживайте все три ноты.`
                      : currentCard.skill === 'triadInversionIdentify'
                        ? `Найдите бас — самую низкую из трёх подсвеченных нот. Выберите ответ кнопкой или клавишей 1, 2 либо 3. Экранное пианино и MIDI здесь не являются ответом.`
                        : getSkillInstruction(currentCard.skill, currentKind)
                }
                reactionTime="{((reactionElapsedMs || 0) / 1000).toFixed(1)} с"
                {reactionStatus}
                {reactionClass}
                {feedbackText}
                {feedbackClass}
                {isCompleted}
                {autoAdvanceCountdown}
                showSoundRepeat={currentCard.skill === 'soundToKey'}
                showAnswerButtons={canUseInputForSkill(currentCard.skill, 'answerButton')}
                showDontKnow={currentKind !== 'cold'}
                answerNotes={activeIdentifyAnswerNotes}
                wrongAnswerNotes={pulseWrongAnswerNotes}
                correctAnswerNotes={pulseCorrectAnswerNotes}
                onAnswerClick={handleTaskAnswerButton}
                onDontKnow={handleDontKnow}
                onReplaySound={playSoundPrompt}
                onNextQuestion={() => { clearAutoAdvance(); nextRound(); }}
              />

              {#if currentCard.skill === 'triadBuild' || currentCard.skill === 'triadInversionBuild' || currentCard.skill === 'chordSymbolRead'}
                <div class="triad-selection-bar" style="max-width: 480px; margin: 10px auto 4px auto;">
                  <div class="triad-selection-count">
                    Выбрано клавиш: <strong>{selectedKeyIds.length}</strong> из <strong>3</strong>
                    {#if selectedKeyIds.length > 0}
                      <span style="margin-left: 8px; font-size: 0.85rem; color: #94a3b8;">({selectedKeyIds.join(', ')})</span>
                    {/if}
                  </div>
                  <button
                    type="button"
                    class="triad-check-btn"
                    data-action="daily-triad-submit-chord"
                    disabled={selectedKeyIds.length !== 3}
                    onclick={() => handleDailyChordSubmit(selectedKeyIds, 'screen')}
                  >
                    Проверить аккорд
                  </button>
                  {#if (currentCard.skill === 'triadInversionBuild' || currentCard.skill === 'chordSymbolRead')}
                    <div class="inversion-midi-progress" data-testid="daily-midi-chord-progress" data-held-count={midiChordHeldKeyIds.length}>
                      MIDI: {Math.min(midiChordHeldKeyIds.length, 3)} из 3 нот нажаты{midiChordHeldKeyIds.length > 0 && midiChordHeldKeyIds.length < 3 ? ' — сыграйте остальные одновременно' : ''}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Anchored 4-Octave Piano Keyboard -->
        <Keyboard
          onKeyClick={handleKeyClick}
          anchorKeyIds={
            isIntervalActive && intervalState?.activeSkill === 'intervalBuild'
              ? intervalState.structuralGuideKeyIds
              : isTriadActive && triadState?.activeSkill === 'triadBuild' && triadState.step.endsWith('Guided')
                ? triadState.structuralGuideKeyIds
                : []
          }
          {targetKeyIds}
          {correctKeyIds}
          {wrongKeyIds}
          {hintKeyIds}
          {structuralGuideKeyIds}
          structuralGuideBadge={isInversionActive && inversionState?.structuralGuideKeyIds.length ? 'БАС' : null}
          {modelLabelKeyIds}
          {pulseCorrectKeyIds}
          {midiActiveKeyIds}
          {twoHandLeftTarget}
          {twoHandRightTarget}
          {fingerGuides}
          selectedKeyIds={
            isChordRhythmActive && chordRhythmState
              ? chordRhythmState.selectedKeyIds
              : isDailyRhythmActive && dailyRhythmViewState
              ? dailyRhythmViewState.selectedKeyIds
              : isHarmonyActive && harmonyState
              ? harmonyState.selectedKeyIds
              : isInversionActive && inversionState
              ? inversionState.selectedKeyIds
              : isTriadActive && triadState
              ? triadState.selectedKeyIds
              : currentCard?.skill === 'harmonyProgressionPlay'
              ? selectedKeyIds
              : currentCard?.skill === 'triadBuild' ||
                currentCard?.skill === 'triadInversionBuild' ||
                currentCard?.skill === 'chordSymbolRead'
              ? selectedKeyIds
              : []
          }
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
          onStartSong={(id: string, opts?: { autoDemo?: boolean; lengthMode?: RepertoireLengthMode }) => startSong(id, opts)}
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
          level={settings.level || 'white'}
          isGrandStaffComplete={isBassGrandModuleCompleteDerived}
          learningProgressMap={learningProgressMap}
          harmonyStatus={harmonyStatus}
          onExport={exportProfileData}
          onImport={importProfileData}
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
        <CurriculumView
          phases={curriculumPhasesList}
          currentPhaseDetails={currentPhaseProgressDetails}
          onContinueCurrentPhase={handleContinueCurrentPhase}
          bassGrandStatus={bassGrandStatus}
          onStartBassGrandModule={handleStartBassGrandModule}
          intervalStatus={intervalStatus}
          isIntervalAvailable={isIntervalAvailable}
          onStartIntervalModule={handleStartIntervalModule}
          triadStatus={triadStatus}
          isTriadAvailable={isTriadAvailable}
          onStartTriadModule={handleStartTriadModule}
          inversionStatus={inversionStatus}
          isInversionAvailable={isInversionAvailable}
          onStartInversionModule={handleStartInversionModule}
          harmonyStatus={harmonyStatus}
          isHarmonyAvailable={isHarmonyAvailable}
          onStartHarmonyModule={handleStartHarmonyModule}
          chordRhythmStatus={chordRhythmStatus}
          isChordRhythmAvailable={isChordRhythmAvailable}
          onStartChordRhythmModule={handleStartChordRhythmModule}
        />
      </div>
    {:else if activePage === 'diagnostics'}
      <div class="workspace-page active" data-page="diagnostics" style="overflow-y: auto;">
        <DiagnosticsView
          {coldTests}
          {reviewLogs}
          {cards}
          {learningProgressMap}
          {settings}
          advancedModulesStatus={{
            bassGrandStatus,
            bassGrandActiveStep: bassGrandState?.step,
            intervalStatus,
            intervalActiveStep: intervalState?.step,
            triadStatus,
            triadActiveStep: triadState?.step,
            inversionStatus,
            inversionActiveStep: inversionState?.step,
            harmonyStatus,
            harmonyActiveStep: harmonyState?.step
          }}
          advancedModuleAvailability={{
            bassGrandStaff: advancedModuleStates.bassGrandStaff.available,
            intervals: advancedModuleStates.intervals.available,
            triads: advancedModuleStates.triads.available,
            chordInversions: advancedModuleStates.chordInversions.available,
            harmony: advancedModuleStates.harmony.available,
            chordRhythm: advancedModuleStates.chordRhythm.available
          }}
          level={settings.level || 'white'}
        />
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
      if (patch.sessionPreset) startLearningSession(patch.sessionPreset as SessionPreset);

      if (patch.mode === 'earIntervals') {
        startEarIntervalTraining();
        return;
      }
      if (patch.mode === 'earTriads') {
        startEarTriadTraining();
        return;
      }
      if (patch.mode === 'earEcho') {
        startEarEchoTraining();
        return;
      }

      if (patch.mode && (practiceActivity === 'earIntervals' || practiceActivity === 'earTriads' || practiceActivity === 'earEcho')) {
        practiceActivity = 'standard';
      }
      if (patch.sessionPreset || patch.level || patch.notationClef || patch.mode) nextRound();
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
    currentStage={curriculumStepProgress ? curriculumStepProgress.whiteKeysBadgeText : 'Ориентиры C + F'}
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
    reinforcementLabel={sessionSummaryData.reinforcementLabel}
    reinforcementValue={sessionSummaryData.reinforcementValue}
    newLabel={sessionSummaryData.newLabel}
    newValue={sessionSummaryData.newValue}
    transferValue={sessionSummaryData.transferValue}
    weakSummary={sessionSummaryData.weakSummary}
    skillSummary={sessionSummaryData.skillSummary}
    onClose={() => { isSessionSummaryOpen = false; }}
    onStartSession={(preset: SessionPreset) => {
      isSessionSummaryOpen = false;
      startLearningSession(preset);
      nextRound();
    }}
  />
</main>
