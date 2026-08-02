import type { ComponentType } from 'react';
import type { ChallengeType } from '@/core/supabase/types';
import type { ChallengeInputProps } from './types';
import FillBlank from './FillBlank';
import SentenceCorrection from './SentenceCorrection';
import VocabTrivia from './VocabTrivia';
import Listening from './Listening';
import Speaking from './Speaking';

// Adding a 6th challenge type is a new component + one line here — the
// other 5 never change.
const registry: Record<ChallengeType, ComponentType<ChallengeInputProps>> = {
  fill_blank: FillBlank,
  sentence_correction: SentenceCorrection,
  vocab_trivia: VocabTrivia,
  listening: Listening,
  speaking: Speaking,
};

export function getChallengeComponent(type: ChallengeType) {
  return registry[type];
}
