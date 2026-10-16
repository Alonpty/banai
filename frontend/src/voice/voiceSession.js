// GPT-Live voice session over WebRTC (client delegation).
// Audio flows directly between the browser and OpenAI; the session is created by our
// server (POST /api/voice/session) so the API key never reaches the browser.
// GPT-Live handles the spoken conversation; when it delegates a task we build the
// request from what the customer just said and hand it to `onDelegation`, which runs
// the normal text agent (validation, signed proposal, 3D preview, approval by click).
import { postVoiceSession } from '../api/client.js';

const ICE_TIMEOUT_MS = 10_000;
const CLOSE_TIMEOUT_MS = 5_000;
const MAX_APPEND_CHARS = 1500; // GPT-Live accepts up to 500 tokens per append

function waitForIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ICE_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

let eventCounter = 0;
const eventId = () => `evt_${Date.now().toString(36)}_${(eventCounter += 1)}`;

/**
 * @param {{ onState?: (s: string, detail?: string) => void, onUserText?: (t: string) => void,
 *   onAssistantText?: (t: string) => void, onDelegation?: (d: { id: string, text: string }) => void,
 *   onUsage?: (seconds: number) => void }} handlers
 */
export function createVoiceSession(handlers = {}, { fetchImpl } = {}) {
  let pc = null;
  let channel = null;
  let mic = null;
  let audio = null;
  let state = 'idle';
  let userText = ''; // what the customer is saying now
  let lastUtterance = ''; // the customer's last finished utterance
  let assistantText = '';
  let closedResolve = null;

  const setState = (next, detail) => {
    state = next;
    handlers.onState?.(next, detail);
  };

  const cleanup = () => {
    mic?.getTracks().forEach((track) => track.stop());
    channel?.close();
    pc?.close();
    if (audio) audio.srcObject = null;
    pc = null;
    channel = null;
    mic = null;
    closedResolve?.();
    closedResolve = null;
  };

  const send = (event) => {
    if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
  };

  const finishUtterance = () => {
    if (userText.trim()) lastUtterance = userText.trim();
    userText = '';
  };

  const onMessage = (raw) => {
    let event;
    try {
      event = JSON.parse(raw.data);
    } catch {
      return;
    }
    switch (event.type) {
      case 'session.started':
        setState('listening');
        break;
      case 'session.input_transcript.delta':
        if (assistantText) assistantText = ''; // the customer speaks again: a new turn
        userText += String(event.delta ?? '');
        handlers.onUserText?.(userText.trim());
        break;
      case 'session.output_transcript.delta':
        finishUtterance();
        assistantText += String(event.delta ?? '');
        handlers.onAssistantText?.(assistantText.trim());
        break;
      case 'session.delegation.created': {
        // The delegation carries no text: use what the customer just said.
        finishUtterance();
        const text = lastUtterance;
        lastUtterance = '';
        handlers.onDelegation?.({ id: event.delegation?.id, text });
        break;
      }
      case 'session.usage.updated':
        handlers.onUsage?.(Number(event.usage?.seconds) || 0);
        break;
      case 'session.closed':
        cleanup();
        setState('idle', event.reason);
        break;
      case 'error':
        handlers.onState?.(state, 'error');
        break;
      default:
        break;
    }
  };

  return {
    get state() {
      return state;
    },

    async start() {
      if (state !== 'idle' && state !== 'error') return;
      setState('connecting');
      try {
        pc = new RTCPeerConnection();
        audio = audio ?? new Audio();
        audio.autoplay = true;
        pc.addEventListener('track', (event) => {
          audio.srcObject = new MediaStream([event.track]);
          audio.play().catch(() => {});
        });
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getTracks().forEach((track) => pc.addTrack(track, mic));
        channel = pc.createDataChannel('oai-events'); // before the offer
        channel.addEventListener('message', onMessage);
        channel.addEventListener('close', () => {
          if (state !== 'idle') {
            cleanup();
            setState('idle', 'connection_lost');
          }
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIce(pc);
        const result = await postVoiceSession(pc.localDescription.sdp, fetchImpl);
        if (!result.ok) throw Object.assign(new Error('session'), { code: result.error?.code });
        await pc.setRemoteDescription({ type: 'answer', sdp: result.data.sdp });
      } catch (error) {
        cleanup();
        const code = error?.name === 'NotAllowedError' ? 'MIC_DENIED' : error?.code ?? 'VOICE_FAILED';
        setState('error', code);
      }
    },

    /** Speak a backend result for a delegation (GPT-Live may paraphrase it). */
    reply(delegationId, content) {
      send({ type: 'session.commentary.append', event_id: eventId(), delegation_id: delegationId ?? null, content: String(content).slice(0, MAX_APPEND_CHARS) });
    },

    /** Quiet progress note for a delegation (not spoken). */
    think(delegationId, content) {
      send({ type: 'session.thinking.append', event_id: eventId(), delegation_id: delegationId ?? null, content: String(content).slice(0, MAX_APPEND_CHARS) });
    },

    async stop() {
      if (!pc) {
        setState('idle');
        return;
      }
      const closed = new Promise((resolve) => { closedResolve = resolve; });
      send({ type: 'session.close' });
      await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))]);
      cleanup();
      setState('idle', 'close_requested');
    },
  };
}
