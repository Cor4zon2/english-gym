import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DeckListPage } from './features/decks/DeckListPage';
import { DeckPage, NotFound } from './features/decks/DeckPage';
import { ReviewPage } from './features/review/ReviewPage';
import { AddCardPage } from './features/editor/AddCardPage';
import { EditCardPage } from './features/editor/EditCardPage';
import { CardsPage } from './features/editor/CardsPage';
import { StatsPage } from './features/stats/StatsPage';
import { ImportExportPage } from './features/import-export/ImportExportPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DeckListPage />} />
          <Route path="deck/:deckId" element={<DeckPage />} />
          <Route path="deck/:deckId/review" element={<ReviewPage />} />
          <Route path="deck/:deckId/cards" element={<CardsPage />} />
          <Route path="deck/:deckId/add" element={<AddCardPage />} />
          <Route path="card/:cardId/edit" element={<EditCardPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="import-export" element={<ImportExportPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
