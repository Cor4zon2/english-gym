import type { CardContent } from '../../types';

export const emptyContent = (): CardContent => ({
  word: '',
  translation: '',
  partOfSpeech: '',
  transcription: '',
  definition: '',
  examples: [],
  collocations: [],
  tags: [],
  notes: '',
});
