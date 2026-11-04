import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { updateDeckSettings } from '../../db/repo';
import { DEFAULT_DECK_SETTINGS, type Deck, type DeckSettings } from '../../types';

const parseSteps = (s: string): number[] | null => {
  const parts = s.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(Number);
  return nums.every((n) => Number.isFinite(n) && n > 0) ? nums : null;
};

export function DeckSettingsModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const s = deck.settings;
  const [form, setForm] = useState({
    newPerDay: String(s.newPerDay),
    reviewsPerDay: String(s.reviewsPerDay),
    learningSteps: s.learningSteps.join(' '),
    relearningSteps: s.relearningSteps.join(' '),
    graduatingInterval: String(s.graduatingInterval),
    easyInterval: String(s.easyInterval),
    startingEase: String(Math.round(s.startingEase * 100)),
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    const int = (v: string, min: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= min ? n : null;
    };
    const next: Partial<Record<keyof DeckSettings, unknown>> = {
      newPerDay: int(form.newPerDay, 0),
      reviewsPerDay: int(form.reviewsPerDay, 0),
      learningSteps: parseSteps(form.learningSteps),
      relearningSteps: parseSteps(form.relearningSteps),
      graduatingInterval: int(form.graduatingInterval, 1),
      easyInterval: int(form.easyInterval, 1),
      startingEase: int(form.startingEase, 130),
    };
    const bad = Object.entries(next).find(([, v]) => v === null);
    if (bad) {
      setError('Проверьте значения: числа должны быть положительными, начальная лёгкость ≥ 130%.');
      return;
    }
    const settings = { ...next, startingEase: (next.startingEase as number) / 100 } as DeckSettings;
    if (settings.easyInterval < settings.graduatingInterval) {
      setError('Интервал «Easy» не может быть меньше интервала выпуска.');
      return;
    }
    await updateDeckSettings(deck.id, settings);
    onClose();
  };

  const reset = () => {
    const d = DEFAULT_DECK_SETTINGS;
    setForm({
      newPerDay: String(d.newPerDay),
      reviewsPerDay: String(d.reviewsPerDay),
      learningSteps: d.learningSteps.join(' '),
      relearningSteps: d.relearningSteps.join(' '),
      graduatingInterval: String(d.graduatingInterval),
      easyInterval: String(d.easyInterval),
      startingEase: String(d.startingEase * 100),
    });
  };

  return (
    <Modal title="Настройки колоды" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid-2">
          <label className="field">
            Новых в день
            <input type="number" min={0} value={form.newPerDay} onChange={set('newPerDay')} />
          </label>
          <label className="field">
            Повторений в день
            <input
              type="number"
              min={0}
              value={form.reviewsPerDay}
              onChange={set('reviewsPerDay')}
            />
          </label>
          <label className="field">
            Шаги изучения (мин)
            <input value={form.learningSteps} onChange={set('learningSteps')} placeholder="1 10" />
          </label>
          <label className="field">
            Шаги переучивания (мин)
            <input
              value={form.relearningSteps}
              onChange={set('relearningSteps')}
              placeholder="10"
            />
          </label>
          <label className="field">
            Интервал выпуска (дни)
            <input
              type="number"
              min={1}
              value={form.graduatingInterval}
              onChange={set('graduatingInterval')}
            />
          </label>
          <label className="field">
            Интервал «Easy» (дни)
            <input type="number" min={1} value={form.easyInterval} onChange={set('easyInterval')} />
          </label>
          <label className="field">
            Начальная лёгкость (%)
            <input
              type="number"
              min={130}
              value={form.startingEase}
              onChange={set('startingEase')}
            />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Начальная лёгкость применяется к новым карточкам. Шаги перечисляются через пробел.
        </p>
        {error && (
          <p className="error small" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <div className="row">
          <button type="button" className="btn ghost" onClick={reset}>
            По умолчанию
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary">Сохранить</button>
        </div>
      </form>
    </Modal>
  );
}
