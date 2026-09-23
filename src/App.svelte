<script lang="ts">
  import { onMount } from 'svelte';
  import './ui/styles/app.css';

  // Core & Audio
  import { AudioEngine } from './audio/AudioEngine';
  import { MidiController, type MidiNoteOnEvent, type MidiNoteOffEvent } from './audio/MidiController';
  import { DEFAULT_SETTINGS, NATURAL_NOTES, ALL_NOTES, DISPLAY_NAMES, SHORT_NAMES } from './core/fsrs/constants';
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
  let isLocked = $state(false);
  let reactionElapsedMs = $state(0);
  let reactionStatus = $state('калибровка');
  let reactionClass = $state('');
  let feedbackText = $state('');
  let feedbackClass = $state('');

  // Active visual keys on keyboard
  let targetKeyIds = $state<string[]>([]);
  let correctKeyIds = $state<string[]>([]);
  let wrongKeyIds = $state<string[]>([]);
  let hintKeyIds = $state<string[]>([]);
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

  function nextRound() {
    stopReactionTimer();
    isLocked = false;
    firstResponseRecorded = false;
    feedbackText = '';
    feedbackClass = '';
    targetKeyIds = [];
    correctKeyIds = [];
    wrongKeyIds = [];
    hintKeyIds = [];
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

  async function handleAnswerSubmit(answerNote: NoteName, answerKeyId?: string) {
    if (isLocked || !currentCard || firstResponseRecorded) return;

    firstResponseRecorded = true;
    stopReactionTimer();
    const responseMs = Math.round(performance.now() - shownPerfMs);

    const isCorrect = (currentCard.skill === 'notationToKey' || currentCard.skill === 'soundToKey')
      ? answerKeyId === targetKeyId
      : answerNote === currentCard.note;

    sessionTrials++;
    if (isCorrect) {
      sessionScore++;
      sessionStreak++;
      feedbackText = `✓ Правильно · ${(responseMs / 1000).toFixed(1)} с`;
      feedbackClass = 'good';
      if (answerKeyId) correctKeyIds = [answerKeyId];
    } else {
      sessionStreak = 0;
      feedbackText = `✗ Ошибка. Это ${DISPLAY_NAMES[answerNote]}. Нужна была ${DISPLAY_NAMES[currentCard.note]}.`;
      feedbackClass = 'bad';
      if (answerKeyId) wrongKeyIds = [answerKeyId];
    }

    // Calculate FSRS grade if scheduled or new
    let grade: Grade = 3;
    if (currentKind === 'scheduled' || currentKind === 'new') {
      grade = determineGrade({
        firstCorrect: isCorrect,
        hintUsed: false,
        responseMs,
        card: currentCard,
        reviewLog: reviewLogs,
        useLatencyGrading: settings.useLatencyGrading
      });

      applyFsrsReview(currentCard, grade, Date.now(), settings);
      await db.cards.put(currentCard);
    }

    // Save review log event
    const logEvent: ReviewLogEvent = {
      ts: Date.now(),
      sessionId: 'session-live',
      cardId: currentCard.id,
      note: currentCard.note,
      skill: currentCard.skill,
      kind: currentKind,
      grade,
      gradeName: grade === 1 ? 'Again' : grade === 2 ? 'Hard' : grade === 4 ? 'Easy' : 'Good',
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
    await db.reviewLogs.put(logEvent);

    if (isCorrect) {
      isLocked = true;
      setTimeout(nextRound, 900);
    }
  }

  function handleKeyClick(keyId: string, noteName: NoteName) {
    AudioEngine.getInstance().playPianoByKeyId(keyId, 96);

    if (activePage !== 'practice' || !currentCard || isLocked) return;

    if (currentCard.skill === 'identify') {
      return; // in identify mode, answer is clicked on button or hotkey
    }

    handleAnswerSubmit(noteName, keyId);
  }

  function handleDontKnow() {
    if (isLocked || !currentCard || firstResponseRecorded) return;
    firstResponseRecorded = true;
    stopReactionTimer();

    feedbackText = `Ответ: ${DISPLAY_NAMES[currentCard.note]}. Карточка вернется через 45 сек.`;
    feedbackClass = 'warn';

    if (currentKind === 'scheduled' || currentKind === 'new') {
      applyFsrsReview(currentCard, 1, Date.now(), settings);
      db.cards.put(currentCard);
    }

    // Flash correct key as hint
    if (targetKeyId) hintKeyIds = [targetKeyId];
    else hintKeyIds = [currentCard.note];

    setTimeout(nextRound, 1800);
  }

  // Keyboard hotkeys
  function handleWindowKeydown(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

    if (e.key === 'Escape') {
      isSettingsOpen = false;
      isContextOpen = false;
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      handleDontKnow();
      return;
    }

    // C-B or 1-7 answer keys for identify
    if (activePage === 'practice' && currentCard?.skill === 'identify') {
      const digitMap: Record<string, NoteName> = {
        Digit1: 'C', Digit2: 'D', Digit3: 'E', Digit4: 'F', Digit5: 'G', Digit6: 'A', Digit7: 'B'
      };
      const letterMap: Record<string, NoteName> = {
        KeyC: 'C', KeyD: 'D', KeyE: 'E', KeyF: 'F', KeyG: 'G', KeyA: 'A', KeyB: 'B'
      };

      const note = digitMap[e.code] || letterMap[e.code];
      if (note) {
        e.preventDefault();
        handleAnswerSubmit(note);
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
      onNextQuestion={() => nextRound()}
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
              <Staff keyId={targetKeyId || 'C4'} mode="single" />
            </div>
          {/if}

          <TaskStage
            eyebrow="{currentKind === 'scheduled' ? 'Плановое повторение' : currentKind === 'new' ? 'Новая карточка' : 'Свободная практика'} · {currentCard.skill}"
            promptText={promptHtml}
            instructionText={currentCard.skill === 'identify' ? 'Назовите клавишу, подсвеченную голубым' : 'Нажмите нужную клавишу на клавиатуре или сыграйте по MIDI'}
            reactionTime="{((reactionElapsedMs || 0) / 1000).toFixed(1)} с"
            {reactionStatus}
            {reactionClass}
            {feedbackText}
            {feedbackClass}
            showSoundRepeat={currentCard.skill === 'soundToKey'}
            showAnswerButtons={currentCard.skill === 'identify'}
            answerNotes={NATURAL_NOTES}
            onAnswerClick={(n) => handleAnswerSubmit(n)}
            onDontKnow={handleDontKnow}
            onReplaySound={playSoundPrompt}
          />
        {/if}

        <Keyboard
          onKeyClick={handleKeyClick}
          {targetKeyIds}
          {correctKeyIds}
          {wrongKeyIds}
          {hintKeyIds}
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
