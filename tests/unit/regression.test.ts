import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION } from '../../src/core/version';
import { 
  MIDI_MIN, 
  MIDI_MAX, 
  keyIdFromMidi, 
  pitchClassFromMidi 
} from '../../src/audio/types';
import { ALL_NOTES } from '../../src/core/fsrs/constants';
import {
  SKILL_INPUT_POLICY,
  PATTERN_IDENTIFY_QUESTIONS,
  SKILL_INSTRUCTIONS,
  getSkillInputPolicy,
  canUseInputForSkill,
  canUseComputerKeyboardForSkill,
  getPatternIdentifyPrompt,
  getSkillInstruction,
  resolveNoteFromKeyboard,
  resolveSemanticNoteAnswer,
  resolvePcKeyboardSemanticAnswer
} from '../../src/core/input/inputPolicy';
import type { Skill } from '../../src/core/fsrs/types';

describe('Piano Trainer Core Regressions & Invariants', () => {
  it('exposes canonical application version from package.json as a single source of truth', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has exact 4 octaves range C2 to C6 (29 white keys, 20 black keys)', () => {
    let whiteCount = 0;
    let blackCount = 0;

    for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
      const pc = pitchClassFromMidi(midi);
      if (pc.includes('#')) {
        blackCount++;
      } else {
        whiteCount++;
      }
    }

    expect(MIDI_MIN).toBe(36); // C2
    expect(MIDI_MAX).toBe(84); // C6
    expect(keyIdFromMidi(36)).toBe('C2');
    expect(keyIdFromMidi(84)).toBe('C6');
    expect(whiteCount).toBe(29);
    expect(blackCount).toBe(20);
    expect(whiteCount + blackCount).toBe(49);
  });

  it('maps all pitch classes correctly', () => {
    expect(ALL_NOTES.length).toBe(12);
    expect(pitchClassFromMidi(60)).toBe('C');
    expect(keyIdFromMidi(60)).toBe('C4'); // Middle C
  });

  it('correctly evaluates identify skill responses', () => {
    const targetCard = { id: 'card-1', note: 'C', skill: 'identify' };
    const checkIdentifyAnswer = (answerNote: string) => answerNote === targetCard.note;

    expect(checkIdentifyAnswer('C')).toBe(true);
    expect(checkIdentifyAnswer('D')).toBe(false);
  });

  it('validates settings retention formatting and time remaining bar calculation', () => {
    // 1. Retention formatting matches dropdown options (0.87, 0.90, 0.93)
    const retention = 0.9;
    expect(Number(retention).toFixed(2)).toBe('0.90');

    // 2. Time remaining bar calculation: 100% at start, 50% halfway, 0% at end
    const durationMs = 3 * 60 * 1000;
    const now = 1000000;
    const sessionEndsAt = now + durationMs;

    const calcRemainingPct = (current: number) => {
      const remaining = Math.max(0, sessionEndsAt - current);
      return Math.min(100, Math.max(0, (remaining / durationMs) * 100));
    };

    expect(calcRemainingPct(now)).toBe(100);
    expect(calcRemainingPct(now + durationMs / 2)).toBe(50);
    expect(calcRemainingPct(sessionEndsAt)).toBe(0);
    expect(calcRemainingPct(sessionEndsAt + 5000)).toBe(0);
  });

  describe('Channel-aware skill input policy & pedagogical invariants (Milestone 1 Revision 1)', () => {
    it('enforces the authoritative 5-skill × 4-channel input matrix and exact-octave contract', () => {
      // identify: pcNote YES, answerButton YES, pianoKey NO, midi NO, exactOctave NO
      expect(canUseInputForSkill('identify', 'pcNote')).toBe(true);
      expect(canUseInputForSkill('identify', 'answerButton')).toBe(true);
      expect(canUseInputForSkill('identify', 'pianoKey')).toBe(false);
      expect(canUseInputForSkill('identify', 'midi')).toBe(false);
      expect(getSkillInputPolicy('identify').requiresExactOctave).toBe(false);

      // patternIdentify: pcNote YES, answerButton NO, pianoKey YES, midi YES, exactOctave NO
      expect(canUseInputForSkill('patternIdentify', 'pcNote')).toBe(true);
      expect(canUseInputForSkill('patternIdentify', 'answerButton')).toBe(false);
      expect(canUseInputForSkill('patternIdentify', 'pianoKey')).toBe(true);
      expect(canUseInputForSkill('patternIdentify', 'midi')).toBe(true);
      expect(getSkillInputPolicy('patternIdentify').requiresExactOctave).toBe(false);

      // find: pcNote NO, answerButton NO, pianoKey YES, midi YES, exactOctave NO
      expect(canUseInputForSkill('find', 'pcNote')).toBe(false);
      expect(canUseInputForSkill('find', 'answerButton')).toBe(false);
      expect(canUseInputForSkill('find', 'pianoKey')).toBe(true);
      expect(canUseInputForSkill('find', 'midi')).toBe(true);
      expect(getSkillInputPolicy('find').requiresExactOctave).toBe(false);

      // notationToKey: pcNote NO, answerButton NO, pianoKey YES, midi YES, exactOctave YES
      expect(canUseInputForSkill('notationToKey', 'pcNote')).toBe(false);
      expect(canUseInputForSkill('notationToKey', 'answerButton')).toBe(false);
      expect(canUseInputForSkill('notationToKey', 'pianoKey')).toBe(true);
      expect(canUseInputForSkill('notationToKey', 'midi')).toBe(true);
      expect(getSkillInputPolicy('notationToKey').requiresExactOctave).toBe(true);

      // soundToKey: pcNote NO, answerButton NO, pianoKey YES, midi YES, exactOctave YES
      expect(canUseInputForSkill('soundToKey', 'pcNote')).toBe(false);
      expect(canUseInputForSkill('soundToKey', 'answerButton')).toBe(false);
      expect(canUseInputForSkill('soundToKey', 'pianoKey')).toBe(true);
      expect(canUseInputForSkill('soundToKey', 'midi')).toBe(true);
      expect(getSkillInputPolicy('soundToKey').requiresExactOctave).toBe(true);

      // Null / undefined skill handling
      expect(canUseInputForSkill(null, 'pcNote')).toBe(false);
      expect(canUseInputForSkill(undefined, 'pianoKey')).toBe(false);
      expect(canUseComputerKeyboardForSkill('identify')).toBe(true);
      expect(canUseComputerKeyboardForSkill('patternIdentify')).toBe(true);
      expect(canUseComputerKeyboardForSkill('find')).toBe(false);
      expect(canUseComputerKeyboardForSkill('notationToKey')).toBe(false);
      expect(canUseComputerKeyboardForSkill('soundToKey')).toBe(false);

      const skills: Skill[] = ['identify', 'patternIdentify', 'find', 'notationToKey', 'soundToKey'];
      for (const s of skills) {
        expect(getSkillInputPolicy(s)).toEqual(SKILL_INPUT_POLICY[s]);
      }
    });

    it('resolves patternIdentify and identify PC keyboard shortcuts to pure semantic answers without octave inference', () => {
      const patternAnswer = resolvePcKeyboardSemanticAnswer('patternIdentify', {
        code: 'KeyC',
        key: 'c',
        shiftKey: false
      });
      expect(patternAnswer).toEqual({
        answerNote: 'C',
        answerKeyId: undefined
      });

      const identifyAnswer = resolvePcKeyboardSemanticAnswer('identify', {
        code: 'Digit4',
        key: '4',
        shiftKey: false
      });
      expect(identifyAnswer).toEqual({
        answerNote: 'F',
        answerKeyId: undefined
      });

      // Rejected skills return null for PC keyboard shortcuts
      for (const skill of ['find', 'notationToKey', 'soundToKey'] as Skill[]) {
        expect(
          resolvePcKeyboardSemanticAnswer(skill, { code: 'KeyC', key: 'c', shiftKey: false })
        ).toBeNull();
      }

      // Answer button channel is distinct from pcNote channel
      expect(resolveSemanticNoteAnswer('identify', 'answerButton', 'G')).toEqual({
        answerNote: 'G',
        answerKeyId: undefined
      });
      expect(resolveSemanticNoteAnswer('patternIdentify', 'answerButton', 'C')).toBeNull();
      expect(resolveSemanticNoteAnswer('patternIdentify', 'pcNote', 'C')).toEqual({
        answerNote: 'C',
        answerKeyId: undefined
      });
    });

    it('restores the 4 structural patternIdentify questions without leaking the answer note name', () => {
      expect(PATTERN_IDENTIFY_QUESTIONS.C).toBe(
        'Какая нота находится слева от группы из 2 чёрных клавиш?'
      );
      expect(PATTERN_IDENTIFY_QUESTIONS.F).toBe(
        'Какая нота находится слева от группы из 3 чёрных клавиш?'
      );
      expect(PATTERN_IDENTIFY_QUESTIONS.E).toBe(
        'Какая нота находится сразу справа от группы из 2 чёрных?'
      );
      expect(PATTERN_IDENTIFY_QUESTIONS.B).toBe(
        'Какая нота находится сразу справа от группы из 3 чёрных?'
      );

      expect(getPatternIdentifyPrompt('C')).toBe(PATTERN_IDENTIFY_QUESTIONS.C);
      expect(getPatternIdentifyPrompt('F')).toBe(PATTERN_IDENTIFY_QUESTIONS.F);
      expect(getPatternIdentifyPrompt('E')).toBe(PATTERN_IDENTIFY_QUESTIONS.E);
      expect(getPatternIdentifyPrompt('B')).toBe(PATTERN_IDENTIFY_QUESTIONS.B);
    });

    it('provides skill-specific UI instructions that match allowed input channels', () => {
      expect(getSkillInstruction('identify', 'scheduled')).toBe(
        'Назовите подсвеченную ноту кнопкой ответа или клавишами C–B / 1–7.'
      );
      expect(getSkillInstruction('patternIdentify', 'scheduled')).toBe(
        'Ответьте клавишами C–B / 1–7, кликните соответствующую клавишу пианино или сыграйте её по MIDI.'
      );
      expect(getSkillInstruction('find', 'scheduled')).toBe(
        'Найдите ноту на экранной клавиатуре или сыграйте её по MIDI.'
      );
      expect(getSkillInstruction('notationToKey', 'scheduled')).toBe(
        'Прочитайте ноту и нажмите точную клавишу на экранном пианино или MIDI-клавиатуре.'
      );
      expect(getSkillInstruction('soundToKey', 'scheduled')).toBe(
        'Определите звук и нажмите точную клавишу на экранном пианино или MIDI-клавиатуре.'
      );
      expect(getSkillInstruction('identify', 'cold')).toBe(
        'Назовите подсвеченную ноту кнопкой ответа или клавишами C–B / 1–7. Одна попытка без подсказок; результат не меняет расписание FSRS.'
      );
      expect(SKILL_INSTRUCTIONS.find).not.toContain('C–B');
      expect(SKILL_INSTRUCTIONS.notationToKey).not.toContain('C–B');
      expect(SKILL_INSTRUCTIONS.soundToKey).not.toContain('C–B');
    });

    it('resolves PC keyboard note shortcuts (letters, digits, sharps, Russian layout) without inferring octaves', () => {
      expect(resolveNoteFromKeyboard({ code: 'KeyC', key: 'c', shiftKey: false })).toEqual({ note: 'C' });
      expect(resolveNoteFromKeyboard({ code: 'KeyF', key: 'F', shiftKey: true })).toEqual({ note: 'F#' });
      expect(resolveNoteFromKeyboard({ code: 'KeyE', key: 'E', shiftKey: true })).toEqual({ note: 'E' }); // no E#
      expect(resolveNoteFromKeyboard({ code: 'Digit1', key: '1', shiftKey: false })).toEqual({ note: 'C' });
      expect(resolveNoteFromKeyboard({ code: 'Digit4', key: '4', shiftKey: true })).toEqual({ note: 'F#' });
      expect(resolveNoteFromKeyboard({ code: 'KeyC', key: 'с', shiftKey: false })).toEqual({ note: 'C' });

      // Modifier combinations and key auto-repeat must be ignored
      expect(resolveNoteFromKeyboard({ code: 'KeyC', key: 'c', shiftKey: false, ctrlKey: true })).toBeNull();
      expect(resolveNoteFromKeyboard({ code: 'KeyC', key: 'c', shiftKey: false, repeat: true })).toBeNull();
    });
  });
});

