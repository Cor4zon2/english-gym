import type { Card } from '../../types';
import { blankOut } from '../../lib/cloze';
import { speak, speechSupported } from '../../lib/speech';
import styles from './Review.module.css';

export function CardFront({ card, showAnswer }: { card: Card; showAnswer: boolean }) {
  const example = card.examples[0];
  return (
    <div className={styles.front}>
      <div className={styles.word}>{card.word}</div>
      {card.transcription && (
        <div className={styles.transcription}>
          {card.transcription}
          {speechSupported && (
            <button
              className="btn ghost icon"
              onClick={() => speak(card.word)}
              aria-label="Произнести"
            >
              🔊
            </button>
          )}
        </div>
      )}
      {!card.transcription && speechSupported && (
        <button className="btn ghost icon" onClick={() => speak(card.word)} aria-label="Произнести">
          🔊
        </button>
      )}
      {example && !showAnswer && <p className={styles.cloze}>“{blankOut(example, card.word)}”</p>}
    </div>
  );
}

export function CardBack({ card }: { card: Card }) {
  return (
    <div className={styles.back}>
      <div className={styles.translation}>
        {card.partOfSpeech && <span className="muted">({card.partOfSpeech}) </span>}
        {card.translation}
      </div>
      {card.definition && (
        <section>
          <h3>Definition</h3>
          <p>{card.definition}</p>
        </section>
      )}
      {card.collocations.length > 0 && (
        <section>
          <h3>Collocations</h3>
          <ul>
            {card.collocations.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      {card.examples.length > 0 && (
        <section>
          <h3>Examples</h3>
          <ul>
            {card.examples.map((ex, i) => (
              <li key={i}>
                {ex}{' '}
                {speechSupported && (
                  <button
                    className={`btn ghost ${styles.inlineSpeak}`}
                    onClick={() => speak(ex)}
                    aria-label="Произнести пример"
                  >
                    🔊
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {card.notes && (
        <section>
          <h3>Notes</h3>
          <p>{card.notes}</p>
        </section>
      )}
      {card.tags.length > 0 && (
        <div className="row">
          {card.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
