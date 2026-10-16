import { describe, expect, it } from 'vitest';
import { spokenAnswer } from '../../../src/voice/voiceControls.js';

describe('spokenAnswer', () => {
  it('reminds the customer to approve a proposal by tapping (voice never applies)', () => {
    const spoken = spokenAnswer({ kind: 'proposal', text: 'I will add two drawers to the right section.' }, 'add two drawers');
    expect(spoken).toMatch(/^Suggestion ready, not applied yet:/);
    expect(spoken).toMatch(/Tap Apply changes to keep it, or Cancel/);
    expect(spoken).not.toMatch(/(I.ve|I have) (added|applied|saved|moved)/i);
  });

  it('uses Hebrew for the approval hint when the customer spoke Hebrew', () => {
    expect(spokenAnswer({ kind: 'proposal', text: 'אוסיף שתי מגירות.' }, 'תוסיף שתי מגירות')).toMatch(/Apply changes/);
    expect(spokenAnswer({ kind: 'proposal', text: 'אוסיף שתי מגירות.' }, 'תוסיף שתי מגירות')).toMatch(/תצוגה מקדימה/);
  });

  it('speaks questions, refusals and errors as-is, and handles busy / empty input', () => {
    expect(spokenAnswer({ kind: 'clarification', text: 'Which section?' })).toBe('Which section?');
    expect(spokenAnswer({ kind: 'out_of_scope', text: 'I can only help with your wardrobe.' })).toBe('I can only help with your wardrobe.');
    expect(spokenAnswer({ kind: 'busy' })).toMatch(/still working/);
    expect(spokenAnswer({ kind: 'empty' })).toMatch(/didn't catch/);
  });
});
