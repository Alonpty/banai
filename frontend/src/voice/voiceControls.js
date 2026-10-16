// Voice UI in the assistant panel: a microphone button next to Send and a live caption.
// Spoken requests go through the same chat flow as typed ones (chat.submit), so every
// change is still a previewed proposal that the customer approves by clicking.
import { el } from '../editor/fields.js';
import { icon } from '../ui/icons.js';
import { createVoiceSession } from './voiceSession.js';

const hebrew = (text) => /[֐-׿]/.test(text ?? '');
// Proposals are suggestions until the customer clicks: the spoken text says so explicitly,
// because GPT-Live paraphrases and otherwise tends to say "I've added…".
const SUGGESTION = {
  en: { lead: 'Suggestion ready, not applied yet:', hint: 'It is on screen as a preview. Tap Apply changes to keep it, or Cancel.' },
  he: { lead: 'הצעה מוכנה, עדיין לא הוחלה:', hint: 'זה מוצג על המסך כתצוגה מקדימה. הקש על Apply changes כדי לשמור, או Cancel כדי לבטל.' },
};

const ERRORS = Object.freeze({
  MIC_DENIED: 'Microphone access was blocked. Allow it in the browser to talk to BanAI.',
  VOICE_NOT_CONFIGURED: 'Voice is not available on this server.',
  RATE_LIMITED: 'Too many voice sessions. Please wait a moment.',
  VOICE_UNAVAILABLE: 'Voice is not available right now. You can keep typing.',
  VOICE_FAILED: 'Could not start voice. Please try again.',
});

/** What the voice should say for one delegated request, from the text agent's answer. */
export function spokenAnswer(response, userText) {
  if (!response || response.kind === 'busy') return 'One moment, I am still working on your previous request.';
  if (response.kind === 'empty') return "Sorry, I didn't catch that. Could you say it again?";
  if (response.kind === 'proposal') {
    const words = hebrew(userText || response.text) ? SUGGESTION.he : SUGGESTION.en;
    return `${words.lead} ${response.text} ${words.hint}`.trim();
  }
  return response.text || "Sorry, I couldn't do that right now.";
}

export function mountVoiceControls({ chat }) {
  const row = chat.composer;
  if (!row || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) return null;

  const button = el('button', { className: 'chat__mic', attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Talk to BanAI', title: 'Talk to BanAI (voice)', 'data-testid': 'voice-button' } }, [icon('mic', { size: 18 })]);
  const caption = el('div', { className: 'voice-caption', attrs: { 'aria-live': 'polite', 'data-testid': 'voice-caption' } });
  caption.hidden = true;
  row.prepend(button);
  row.parentElement.insertBefore(caption, row);

  const setCaption = (label, text = '', tone = '') => {
    caption.hidden = false;
    caption.className = `voice-caption${tone ? ` voice-caption--${tone}` : ''}`;
    caption.replaceChildren(
      el('span', { className: 'voice-caption__label' }, [el('span', { className: 'voice-dot', attrs: { 'aria-hidden': 'true' } }), el('span', { text: label })]),
      ...(text ? [el('span', { className: 'voice-caption__text', text, attrs: { dir: 'auto' } })] : []),
    );
  };

  let seconds = 0;
  const session = createVoiceSession({
    onState(state, detail) {
      button.dataset.state = state;
      button.setAttribute('aria-pressed', String(state === 'listening' || state === 'connecting'));
      button.setAttribute('aria-label', state === 'idle' || state === 'error' ? 'Talk to BanAI' : 'Stop voice');
      button.replaceChildren(icon(state === 'listening' ? 'stop' : 'mic', { size: 18 }));
      if (state === 'connecting') setCaption('Connecting…');
      else if (state === 'listening') setCaption('Listening… speak naturally', '', 'live');
      else if (state === 'error') setCaption(ERRORS[detail] ?? ERRORS.VOICE_FAILED, '', 'error');
      else caption.hidden = true;
    },
    onUserText: (text) => setCaption('You', text, 'live'),
    onAssistantText: (text) => setCaption('BanAI', text, 'live'),
    onUsage: (value) => { seconds = value; button.title = `Stop voice (${seconds}s)`; },
    async onDelegation({ id, text }) {
      setCaption('Working on it…', text, 'live');
      session.think(id, 'The design system is preparing an answer. Nothing has changed yet.');
      const response = await chat.submit(text, { source: 'voice' });
      session.reply(id, spokenAnswer(response, text));
    },
  });

  button.addEventListener('click', () => {
    if (session.state === 'idle' || session.state === 'error') session.start();
    else session.stop();
  });
  window.addEventListener('pagehide', () => { session.stop(); });
  return session;
}
