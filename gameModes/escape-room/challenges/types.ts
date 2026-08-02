// Client-safe shape of a challenge's prompt: only what's safe to show a
// player, never the answer key (see supabase/schema.sql's prompt_display /
// answer_key split).
export type ChallengePrompt =
  | { type: 'fill_blank'; text: string }
  | { type: 'sentence_correction'; incorrectSentence: string }
  | { type: 'vocab_trivia'; question: string; options: string[] }
  | { type: 'listening'; audioText: string; question: string; options?: string[] }
  | { type: 'speaking'; targetSentence: string };

export type ChallengeAnswer = { text?: string; index?: number };

export interface ChallengeInputProps {
  prompt: ChallengePrompt;
  onSubmit: (answer: ChallengeAnswer) => void;
  disabled?: boolean;
}
