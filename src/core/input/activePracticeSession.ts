let activeSessionId: string | null = null;
let questionSequence = 0;

interface ActiveQuestion {
  id: string;
  sessionId: string;
  firstAnswerCommitted: boolean;
}

let activeQuestion: ActiveQuestion | null = null;

/** Claims the single active practice-session slot for this application instance. */
export function activatePracticeSession(sessionId: string): void {
  activeSessionId = sessionId;
  activeQuestion = null;
}

export function isActivePracticeSession(sessionId: string): boolean {
  return activeSessionId === sessionId;
}

/** Invalidates the session and its current question before another session can accept input. */
export function endPracticeSession(sessionId: string): void {
  if (activeSessionId !== sessionId) return;
  activeSessionId = null;
  activeQuestion = null;
}

/** Gives each activated standard-practice task an id scoped to its owning session. */
export function activatePracticeQuestion(sessionId: string): string | null {
  if (!isActivePracticeSession(sessionId)) return null;
  const id = `${sessionId}:question-${++questionSequence}`;
  activeQuestion = { id, sessionId, firstAnswerCommitted: false };
  return id;
}

/** Atomically grants the first review commit for this session/question pair once. */
export function claimFirstAnswerCommit(sessionId: string, questionId: string | null): boolean {
  if (
    !questionId ||
    !isActivePracticeSession(sessionId) ||
    activeQuestion?.sessionId !== sessionId ||
    activeQuestion.id !== questionId ||
    activeQuestion.firstAnswerCommitted
  ) {
    return false;
  }

  activeQuestion.firstAnswerCommitted = true;
  return true;
}
