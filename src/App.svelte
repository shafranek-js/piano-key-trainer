<script lang="ts">
  import { onMount } from 'svelte';
  import './ui/styles/app.css';

  // Core & Audio
  import { AudioEngine } from './audio/AudioEngine';
  import { MidiController, type MidiNoteOnEvent, type MidiNoteOffEvent } from './audio/MidiController';
  import { DEFAULT_SETTINGS, NATURAL_NOTES, ALL_NOTES, DISPLAY_NAMES, SHORT_NAMES, STAFF_HINTS, SOUND_HINTS, LANDMARK_HINTS } from './core/fsrs/constants';
  import { applyFsrsReview, retrievability, isMastered } from './core/fsrs/fsrs6';
  import { determineGrade } from './core/fsrs/latencyGrading';
  import { chooseDue, chooseNew, choosePractice, buildColdQueue } from './core/scheduler/queue';
  import { getCurriculumPhases, baseNoteReady } from './core/curriculum/curriculum';
  import type { Card, Grade, NoteName, ReviewKind, ReviewLogEvent, Skill, UserSettings } from './core/fsrs/types';

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

  // Views
  import LessonsView from './ui/views/LessonsView.svelte';
  import RepertoireView from './ui/views/RepertoireView.svelte';
  import TwoHandView from './ui/views/TwoHandView.svelte';
  import ProgressView from './ui/views/ProgressView.svelte';
  import AnalyticsView from './ui/views/AnalyticsView.svelte';
  import CurriculumView from './ui/views/CurriculumView.svelte';
  import DiagnosticsView from './ui/views/DiagnosticsView.svelte';
  import CalibrationView from './ui/views/CalibrationView.svelte';

  // App State using Svelte 5 Runes
  let activePage = $state('practice');
  let settings = $state<UserSettings>({ ...DEFAULT_SETTINGS });
  let cards = $state<Card[]>([]);
  let reviewLogs = $state<ReviewLogEvent[]>([]);
  let coldTests = $state<ColdTestRecord[]>([]);
  let lessonProgressMap = $state<Map<string, LessonProgressRecord>>(new Map());

  // Hardware status
  let audioStatus = $state('Инициализация…');
  let audioReady = $state(false);
  let midiStatus = $state('Не подключено');
  let midiReady = $state(false);

  // Drawers
  let isSettingsOpen = $state(false);
  let isContextOpen = $state(false);

  // Active round state
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

  // Active visual keys on keyboard
  let targetKeyIds = $state<string[]>([]);
  let correctKeyIds = $state<string[]>([]);
  let wrongKeyIds = $state<string[]>([]);
  let hintKeyIds = $state<string[]>([]);
  let pulseCorrectKeyIds = $state<string[]>([]);
  let pulseWrongAnswerNotes = $state<NoteName[]>([]);
  let pulseCorrectAnswerNotes = $state<NoteName[]>([]);
  let staffPulseGuide = $state(false);
  let midiActiveKeyIds = $state<string[]>([]);

  // Statistics of session
  let sessionScore = $state(0);
  let sessionTrials = $state(0);
  let sessionStreak = $state(0);
  let recentCards = $state<Card[]>([]);
  let sessionIntroducedNotes = $state<Set<NoteName>>(new Set());

  // Timer reference
  let reactionTimer: number | null = null;

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
    
    // Load settings
    const storedSettings = await db.settings.get('userSettings');
    if (storedSettings?.value) {
      settings = { ...DEFAULT_SETTINGS, ...(storedSettings.value as Partial<UserSettings>) };
    }

    // Load cards or initialize defaults
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

    // Load logs & cold tests
    reviewLogs = await db.reviewLogs.toArray();
    coldTests = await db.coldTests.toArray();

    // Load lessons
    const storedLessons = await db.lessonProgress.toArray();
    lessonProgressMap = new Map(storedLessons.map(l => [l.id, l]));

    // Start round
    nextRound();
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
    if (card.skill === 'notationToKey') {
      return STAFF_HINTS[card.note] || '';
    }
    if (card.skill === 'soundToKey') {
      return SOUND_HINTS[card.note] || '';
    }
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
    if (delaySec <= 0) {
      autoAdvanceCountdown = null;
      return;
    }

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

    const now = Date.now();
    const candidateCards = cards;

    let picked: Card | null = null;
    let kind: ReviewKind = 'practice';

    const due = chooseDue(candidateCards, now, recentCards);
    if (due) {
      picked = due;
      kind = 'scheduled';
    } else {
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
        picked = choosePractice(candidateCards, now, recentCards);
        kind = 'practice';
      }
    }

    if (!picked) return;

    currentCard = picked;
    currentKind = kind;
    recentCards = [picked, ...recentCards.slice(0, 3)];

    if (picked.skill === 'identify') {
      const octave = 4;
      targetKeyId = `${picked.note}${octave}`;
      targetKeyIds = [targetKeyId];
    } else if (picked.skill === 'notationToKey' || picked.skill === 'soundToKey') {
      targetKeyId = `${picked.note}4`;
      if (picked.skill === 'soundToKey') {
        setTimeout(() => playSoundPrompt(), 200);
      }
    }

    startReactionTimer();
  }

  async function playSoundPrompt() {
    if (!targetKeyId) return;
    const engine = AudioEngine.getInstance();
    // Play reference C4, then target note
    await engine.playPianoByKeyId('C4', 85);
    setTimeout(() => {
      engine.playPianoByKeyId(targetKeyId!, 96);
    }, 600);
  }

  function triggerErrorPulse(answerNote: NoteName, answerKeyId?: string) {
    if (!currentCard) return;
    const isExactKeySkill = currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey';

    // 1. Red pulse on the wrong item
    if (answerKeyId) {
      wrongKeyIds = [answerKeyId];
    }
    if (currentCard.skill === 'identify' || currentCard.skill === 'patternIdentify') {
      pulseWrongAnswerNotes = [answerNote];
    }

    // 2. Green pulse on the correct step / target
    if (isExactKeySkill) {
      pulseCorrectKeyIds = [targetKeyId || `${currentCard.note}4`];
      staffPulseGuide = true;
    } else if (currentCard.skill === 'find') {
      pulseCorrectKeyIds = [currentCard.note];
    } else {
      pulseCorrectAnswerNotes = [currentCard.note];
      if (targetKeyId) pulseCorrectKeyIds = [targetKeyId];
    }

    // 3. Clear red after 850ms
    setTimeout(() => {
      if (answerKeyId) wrongKeyIds = wrongKeyIds.filter(id => id !== answerKeyId);
      pulseWrongAnswerNotes = [];
    }, 850);

    // 4. Clear green guide after 1400ms
    setTimeout(() => {
      pulseCorrectKeyIds = [];
      pulseCorrectAnswerNotes = [];
      staffPulseGuide = false;
    }, 1400);
  }

  async function handleAnswerSubmit(answerNote: NoteName, answerKeyId?: string) {
    if (isLocked || !currentCard || isCompleted) return;

    const isExactKeySkill = currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey';
    const isCorrect = isExactKeySkill
      ? answerKeyId === targetKeyId
      : answerNote === currentCard.note;
    const isOctaveMismatch = isExactKeySkill && answerNote === currentCard.note && answerKeyId !== targetKeyId;

    // --- FIRST ATTEMPT ---
    if (!firstResponseRecorded) {
      firstResponseRecorded = true;
      attempts = 1;
      stopReactionTimer();
      const responseMs = Math.round(performance.now() - shownPerfMs);

      sessionTrials++;
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
        feedbackClass = 'bad';
        triggerErrorPulse(answerNote, answerKeyId);

        const hint = getExerciseHint(currentCard);
        if (isOctaveMismatch) {
          feedbackText = `✗ Не та октава! Нота верная (${DISPLAY_NAMES[answerNote]}), но нажата ${answerKeyId}. Требуется ${targetKeyId} (${hint || 'найдите нужную октаву'}). Первая попытка засчитана как ошибка. Попробуйте еще раз!`;
        } else {
          feedbackText = `✗ Ошибка. Это ${DISPLAY_NAMES[answerNote]}${answerKeyId ? ' (' + answerKeyId + ')' : ''}. Нужна была ${DISPLAY_NAMES[currentCard.note]}${targetKeyId ? ' (' + targetKeyId + ')' : ''}. ${hint} Первая попытка засчитана как ошибка.`;
        }
      }

      // Calculate FSRS grade if scheduled or new
      let grade: Grade = isCorrect ? 3 : 1;
      const cardRef = currentCard;
      const kindRef = currentKind;

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

      // Save review log event
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

      // Asynchronous background persistence to Dexie DB
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
      feedbackText = currentKind === 'practice'
        ? `✓ Исправлено (${attempts}-я попытка)! Свободная практика.`
        : `✓ Исправлено (${attempts}-я попытка). Для памяти FSRS засчитана первая ошибка (Again); карточка скоро вернется для повторения.`;
      scheduleAutoAdvance();
    } else {
      feedbackClass = 'bad';
      triggerErrorPulse(answerNote, answerKeyId);

      const hint = getExerciseHint(currentCard);
      if (isOctaveMismatch) {
        feedbackText = `Пока не та октава (${answerKeyId}). Требуется ${targetKeyId}. ${hint}`;
      } else {
        feedbackText = `Это ${DISPLAY_NAMES[answerNote]}${answerKeyId ? ' (' + answerKeyId + ')' : ''}. Нужна ${DISPLAY_NAMES[currentCard.note]}${targetKeyId ? ' (' + targetKeyId + ')' : ''}. ${hint}`;
      }

      if (attempts >= 3) {
        hintUsed = true;
        if (targetKeyId) hintKeyIds = [targetKeyId];
        else hintKeyIds = [currentCard.note];
        feedbackText += ' 💡 Нужная клавиша подсвечена желтым!';
      }
    }
  }

  function handleKeyClick(keyId: string, noteName: NoteName) {
    AudioEngine.getInstance().playPianoByKeyId(keyId, 96);

    if (activePage !== 'practice' || !currentCard || isLocked || isCompleted) return;

    if (currentCard.skill === 'identify') {
      return; // in identify mode, answer is clicked on note button or hotkey
    }

    handleAnswerSubmit(noteName, keyId);
  }

  function handleDontKnow() {
    if (isLocked || !currentCard || isCompleted) return;

    if (!firstResponseRecorded) {
      firstResponseRecorded = true;
      attempts = 1;
      hintUsed = true;
      stopReactionTimer();
      sessionTrials++;
      sessionStreak = 0;

      const targetLabel = targetKeyId ? `${DISPLAY_NAMES[currentCard.note]} (${targetKeyId})` : DISPLAY_NAMES[currentCard.note];
      feedbackText = `Ответ: ${targetLabel}. ${getExerciseHint(currentCard)} Карточка скоро вернется.`;
      feedbackClass = 'warn';

      // Flash correct key as hint
      if (targetKeyId) hintKeyIds = [targetKeyId];
      else hintKeyIds = [currentCard.note];

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

  function resolveNoteFromKeyboard(e: KeyboardEvent): { note: NoteName; specificKeyId?: string } | null {
    // 1. Digits 1-7: 1=C, 2=D, 3=E, 4=F, 5=G, 6=A, 7=B
    const digitMap: Record<string, NoteName> = {
      Digit1: 'C', Digit2: 'D', Digit3: 'E', Digit4: 'F', Digit5: 'G', Digit6: 'A', Digit7: 'B',
      Numpad1: 'C', Numpad2: 'D', Numpad3: 'E', Numpad4: 'F', Numpad5: 'G', Numpad6: 'A', Numpad7: 'B'
    };
    if (digitMap[e.code]) {
      const base = digitMap[e.code];
      const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
      return { note: (isSharp ? `${base}#` : base) as NoteName };
    }

    // 2. Direct note letter keys (C, D, E, F, G, A, B) via e.code
    const codeToNote: Record<string, NoteName> = {
      KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyA: 'A', KeyB: 'B'
    };
    if (codeToNote[e.code]) {
      const base = codeToNote[e.code];
      const isSharp = e.shiftKey && ['C', 'D', 'F', 'G', 'A'].includes(base);
      return { note: (isSharp ? `${base}#` : base) as NoteName };
    }

    // 3. Fallback for e.key (e.g. Russian keyboard layout: с, в, у, а, п, ф, и)
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

    // 4. Musical typing (home row piano: ASDFGHJK / WETYU)
    const musicalTyping: Record<string, { note: NoteName; keyId: string }> = {
      KeyW: { note: 'C#', keyId: 'C#4' },
      KeyS: { note: 'D', keyId: 'D4' },
      KeyT: { note: 'F#', keyId: 'F#4' },
      KeyY: { note: 'G#', keyId: 'G#4' },
      KeyH: { note: 'A', keyId: 'A4' },
      KeyU: { note: 'A#', keyId: 'A#4' },
      KeyJ: { note: 'B', keyId: 'B4' },
      KeyK: { note: 'C', keyId: 'C5' }
    };
    if (musicalTyping[e.code]) {
      return { note: musicalTyping[e.code].note, specificKeyId: musicalTyping[e.code].keyId };
    }

    return null;
  }

  // Keyboard hotkeys
  function handleWindowKeydown(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

    if (e.key === 'Escape') {
      isSettingsOpen = false;
      isContextOpen = false;
      return;
    }

    // Space or Enter to skip delay when completed
    if (e.code === 'Space' || e.key === ' ') {
      if (isCompleted) {
        e.preventDefault();
        clearAutoAdvance();
        nextRound();
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isCompleted) {
        clearAutoAdvance();
        nextRound();
        return;
      }
      handleDontKnow();
      return;
    }

    // Practice mode answering via PC Keyboard
    if (activePage === 'practice' && currentCard && !isLocked && !isCompleted) {
      const resolved = resolveNoteFromKeyboard(e);
      if (!resolved) return;

      e.preventDefault();

      if (currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey') {
        const octave = targetKeyId ? targetKeyId.slice(-1) : '4';
        const keyId = resolved.specificKeyId || `${resolved.note}${octave}`;
        AudioEngine.getInstance().playPianoByKeyId(keyId, 96);
        handleAnswerSubmit(resolved.note, keyId);
      } else if (currentCard.skill === 'find') {
        const keyId = resolved.specificKeyId || `${resolved.note}4`;
        AudioEngine.getInstance().playPianoByKeyId(keyId, 96);
        handleAnswerSubmit(resolved.note, keyId);
      } else {
        // identify, patternIdentify
        handleAnswerSubmit(resolved.note);
      }
    }
  }

  onMount(() => {
    // Setup Audio
    const audioEngine = AudioEngine.getInstance();
    audioEngine.setStatusCallback((status, msg) => {
      audioStatus = msg;
      audioReady = status === 'ready';
    });
    audioEngine.preloadSamples();

    // Setup MIDI
    const midi = MidiController.getInstance();
    midi.onStatusChange((st) => {
      midiStatus = st.message;
      midiReady = st.connected;
    });
    midi.onNoteOn((ev: MidiNoteOnEvent) => {
      midiActiveKeyIds = [...midiActiveKeyIds, ev.keyId];
      audioEngine.playPianoMidi(ev.midi, ev.velocity, ev.voiceKey);
      if (activePage === 'practice' && currentCard && currentCard.skill !== 'identify') {
        handleAnswerSubmit(ev.noteName, ev.keyId);
      }
    });
    midi.onNoteOff((ev: MidiNoteOffEvent) => {
      midiActiveKeyIds = midiActiveKeyIds.filter(id => id !== ev.keyId);
      audioEngine.releaseVoice(ev.voiceKey, 0.12);
    });
    if (midi.isSupported()) {
      midi.connect();
    }

    // Load data
    loadData();

    window.addEventListener('keydown', handleWindowKeydown);
    return () => window.removeEventListener('keydown', handleWindowKeydown);
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
      nextButtonDisabled={activePage !== 'practice'}
      onPageChange={(p: string) => { activePage = p; }}
      onToggleSettings={() => { isSettingsOpen = !isSettingsOpen; }}
      onToggleContext={() => { isContextOpen = !isContextOpen; }}
      onNextQuestion={() => { clearAutoAdvance(); nextRound(); }}
    />
  </header>

  <div class="workspace-pages" style="display:block; min-height: 400px;">
    {#if activePage === 'practice'}
      <div class="workspace-page active" data-page="practice">
        {#if currentCard}
          {@const promptHtml = currentCard.skill === 'notationToKey'
            ? '' // Handled by Staff component
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
              <Staff keyId={targetKeyId || 'C4'} mode="single" pulseGuide={staffPulseGuide} />
            </div>
          {/if}

          <TaskStage
            eyebrow="{currentKind === 'scheduled' ? 'Плановое повторение' : currentKind === 'new' ? 'Новая карточка' : 'Свободная практика'} · {currentCard.skill}"
            promptText={promptHtml}
            instructionText={currentCard.skill === 'identify' ? 'Назовите клавишу, подсвеченную голубым' : 'Нажмите клавишу на клавиатуре (буквы C–B, цифры 1–7) или сыграйте по MIDI'}
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
            answerNotes={NATURAL_NOTES}
            wrongAnswerNotes={pulseWrongAnswerNotes}
            correctAnswerNotes={pulseCorrectAnswerNotes}
            onAnswerClick={(n) => handleAnswerSubmit(n)}
            onDontKnow={handleDontKnow}
            onReplaySound={playSoundPrompt}
            onNextQuestion={() => { clearAutoAdvance(); nextRound(); }}
          />
        {/if}

        <Keyboard
          onKeyClick={handleKeyClick}
          {targetKeyIds}
          {correctKeyIds}
          {wrongKeyIds}
          {hintKeyIds}
          {pulseCorrectKeyIds}
          {midiActiveKeyIds}
        />
      </div>
    {:else if activePage === 'lessons'}
      <div class="workspace-page active" data-page="lessons" style="overflow-y: auto;">
        <LessonsView
          {lessonProgressMap}
          onStartLesson={(id: string) => {
            activePage = 'practice';
          }}
        />
      </div>
    {:else if activePage === 'repertoire'}
      <div class="workspace-page active" data-page="repertoire" style="overflow-y: auto;">
        <RepertoireView
          {settings}
          onSettingsChange={(patch: Partial<UserSettings>) => { settings = { ...settings, ...patch }; db.settings.put({ key: 'userSettings', value: settings }); }}
          onStartSong={(id: string) => { activePage = 'practice'; }}
        />
      </div>
    {:else if activePage === 'twohand'}
      <div class="workspace-page active" data-page="twohand" style="overflow-y: auto;">
        <TwoHandView
          {settings}
          onSettingsChange={(patch: Partial<UserSettings>) => { settings = { ...settings, ...patch }; db.settings.put({ key: 'userSettings', value: settings }); }}
          onStartPattern={(id: string) => { activePage = 'practice'; }}
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
      settings = { ...settings, ...patch };
      db.settings.put({ key: 'userSettings', value: settings });
    }}
    onConnectMidi={() => MidiController.getInstance().connect()}
  />

  <InspectorRail
    isOpen={isContextOpen}
    {dueCount}
    {newCount}
    {learningCount}
    {masteredCount}
    {audioStatus}
    {audioReady}
    {midiStatus}
    {midiReady}
    sessionMode="Умная FSRS"
    sessionLevel="Белые"
    sessionPreset="Обычная · 8 мин"
    currentStage="Ориентиры C + F"
    retentionGoal="{Math.round(settings.desiredRetention * 100)}%"
  />
</main>
