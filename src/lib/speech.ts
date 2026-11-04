import { getAccent } from './prefs';

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!speechSupported || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const lang = getAccent();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  const voice = synth.getVoices().find((v) => v.lang.replace('_', '-') === lang);
  if (voice) u.voice = voice;
  synth.speak(u);
}
