// Hand-written types mirroring supabase/schema.sql. Extended additively as
// later phases touch more tables — not meant to be a full schema mirror
// ahead of the code that needs it.
//
// Every table needs `Relationships: []` and the schema needs `Views`/
// `Functions` (even if empty) — supabase-js's generic query builder types
// silently fall back to `never` for Row/Insert/Update if the shape doesn't
// match GenericTable/GenericSchema from @supabase/postgrest-js.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type PlayStyle = 'collaborative' | 'teams';
export type RoomStatus = 'lobby' | 'in_progress' | 'finished';
export type Team = '' | 'A' | 'B';
export type ChallengeType =
  | 'fill_blank'
  | 'sentence_correction'
  | 'vocab_trivia'
  | 'listening'
  | 'speaking';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      game_modes: {
        Row: { id: string; label: string; is_active: boolean };
        Insert: { id: string; label: string; is_active?: boolean };
        Update: Partial<Database['public']['Tables']['game_modes']['Insert']>;
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          pin: string;
          game_mode: string;
          level: CefrLevel;
          play_style: PlayStyle;
          status: RoomStatus;
          created_at: string;
          started_at: string | null;
          finished_at: string | null;
        };
        Insert: {
          id?: string;
          pin: string;
          game_mode: string;
          level: CefrLevel;
          play_style?: PlayStyle;
          status?: RoomStatus;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['rooms']['Insert']>;
        Relationships: [];
      };
      room_hosts: {
        Row: { room_id: string; host_secret: string };
        Insert: { room_id: string; host_secret?: string };
        Update: Partial<Database['public']['Tables']['room_hosts']['Insert']>;
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          team: Team;
          score: number;
          joined_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
          team?: Team;
          score?: number;
        };
        Update: Partial<Database['public']['Tables']['players']['Insert']>;
        Relationships: [];
      };
      player_tokens: {
        Row: { player_id: string; client_token: string };
        Insert: { player_id: string; client_token?: string };
        Update: Partial<Database['public']['Tables']['player_tokens']['Insert']>;
        Relationships: [];
      };
      escape_room_tracks: {
        Row: {
          id: string;
          level: CefrLevel;
          title: string;
          final_code: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          level: CefrLevel;
          title: string;
          final_code: string;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['escape_room_tracks']['Insert']>;
        Relationships: [];
      };
      escape_room_challenges: {
        Row: {
          id: string;
          track_id: string;
          order_index: number;
          challenge_type: ChallengeType;
          prompt_display: Json;
          answer_key: Json;
          explanation: string;
          grammar_point: string | null;
          piece_reward: string;
          time_limit_seconds: number;
        };
        Insert: {
          id?: string;
          track_id: string;
          order_index: number;
          challenge_type: ChallengeType;
          prompt_display: Json;
          answer_key: Json;
          explanation: string;
          grammar_point?: string | null;
          piece_reward: string;
          time_limit_seconds?: number;
        };
        Update: Partial<Database['public']['Tables']['escape_room_challenges']['Insert']>;
        Relationships: [];
      };
      escape_room_sessions: {
        Row: {
          room_id: string;
          team: Team;
          track_id: string;
          current_index: number;
          current_challenge_id: string | null;
          challenge_sequence: string[];
          challenge_deadline: string | null;
          finished_at: string | null;
        };
        Insert: {
          room_id: string;
          team?: Team;
          track_id: string;
          current_index?: number;
          current_challenge_id?: string | null;
          challenge_sequence?: string[];
          challenge_deadline?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['escape_room_sessions']['Insert']>;
        Relationships: [];
      };
      trivia_tracks: {
        Row: {
          id: string;
          level: CefrLevel;
          title: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          level: CefrLevel;
          title: string;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['trivia_tracks']['Insert']>;
        Relationships: [];
      };
      trivia_questions: {
        Row: {
          id: string;
          track_id: string;
          order_index: number;
          question: string;
          options: Json;
          correct_index: number;
          explanation: string;
          grammar_point: string | null;
          time_limit_seconds: number;
        };
        Insert: {
          id?: string;
          track_id: string;
          order_index: number;
          question: string;
          options: Json;
          correct_index: number;
          explanation: string;
          grammar_point?: string | null;
          time_limit_seconds?: number;
        };
        Update: Partial<Database['public']['Tables']['trivia_questions']['Insert']>;
        Relationships: [];
      };
      trivia_sessions: {
        Row: {
          room_id: string;
          track_id: string;
          current_index: number;
          current_question_id: string | null;
          question_sequence: string[];
          phase: 'question' | 'reveal';
          question_deadline: string | null;
          finished_at: string | null;
        };
        Insert: {
          room_id: string;
          track_id: string;
          current_index?: number;
          current_question_id?: string | null;
          question_sequence?: string[];
          phase?: 'question' | 'reveal';
          question_deadline?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['trivia_sessions']['Insert']>;
        Relationships: [];
      };
      impostor_tracks: {
        Row: {
          id: string;
          level: CefrLevel;
          title: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          level: CefrLevel;
          title: string;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['impostor_tracks']['Insert']>;
        Relationships: [];
      };
      impostor_words: {
        Row: {
          id: string;
          track_id: string;
          order_index: number;
          word: string;
          category: string;
          discussion_seconds: number;
          voting_seconds: number;
        };
        Insert: {
          id?: string;
          track_id: string;
          order_index: number;
          word: string;
          category: string;
          discussion_seconds?: number;
          voting_seconds?: number;
        };
        Update: Partial<Database['public']['Tables']['impostor_words']['Insert']>;
        Relationships: [];
      };
      impostor_sessions: {
        Row: {
          room_id: string;
          track_id: string;
          word_sequence: string[];
        };
        Insert: {
          room_id: string;
          track_id: string;
          word_sequence?: string[];
        };
        Update: Partial<Database['public']['Tables']['impostor_sessions']['Insert']>;
        Relationships: [];
      };
      impostor_rounds: {
        Row: {
          room_id: string;
          round_index: number;
          phase: 'discussion' | 'voting' | 'reveal';
          phase_deadline: string | null;
          finished_at: string | null;
        };
        Insert: {
          room_id: string;
          round_index: number;
          phase?: 'discussion' | 'voting' | 'reveal';
          phase_deadline?: string | null;
          finished_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['impostor_rounds']['Insert']>;
        Relationships: [];
      };
      impostor_round_secrets: {
        Row: {
          room_id: string;
          round_index: number;
          track_id: string;
          word_id: string;
          // How many impostors a round has scales with the roster — see
          // gameModes/impostor/rules.ts. Written in the same insert as the rest
          // of the secret, which a child table could not guarantee without a
          // transaction supabase-js does not give us.
          impostor_player_ids: string[];
        };
        Insert: {
          room_id: string;
          round_index: number;
          track_id: string;
          word_id: string;
          impostor_player_ids: string[];
        };
        Update: Partial<Database['public']['Tables']['impostor_round_secrets']['Insert']>;
        Relationships: [];
      };
      impostor_votes: {
        Row: {
          room_id: string;
          round_index: number;
          voter_player_id: string;
          voted_player_id: string;
          created_at: string;
        };
        Insert: {
          room_id: string;
          round_index: number;
          voter_player_id: string;
          voted_player_id: string;
        };
        Update: Partial<Database['public']['Tables']['impostor_votes']['Insert']>;
        Relationships: [];
      };
      attempts: {
        Row: {
          id: string;
          room_id: string;
          player_id: string;
          game_mode: string;
          escape_room_challenge_id: string | null;
          trivia_question_id: string | null;
          is_correct: boolean;
          answer_payload: Json;
          grammar_point: string | null;
          time_taken_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id: string;
          game_mode: string;
          escape_room_challenge_id?: string | null;
          trivia_question_id?: string | null;
          is_correct: boolean;
          answer_payload: Json;
          grammar_point?: string | null;
          time_taken_ms?: number | null;
        };
        Update: Partial<Database['public']['Tables']['attempts']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      escape_room_challenges_public: {
        Row: {
          id: string;
          track_id: string;
          order_index: number;
          challenge_type: ChallengeType;
          prompt_display: Json;
          time_limit_seconds: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      submit_answer: {
        Args: {
          p_room_id: string;
          p_player_id: string;
          p_team: string;
          p_challenge_id: string;
          p_answer: Json;
          /** @deprecated Ignored since 004 — elapsed time is derived
           * server-side from the deadline. Kept only because the SQL signature
           * cannot drop it without creating an ambiguous overload. */
          p_time_taken_ms?: number | null;
        };
        Returns: Json;
      };
      /** Atomic `score = score + n`. Replaces read-then-write score updates,
       * which lost points whenever two players were scored concurrently. */
      award_points: {
        Args: {
          p_player_id: string;
          p_points: number;
        };
        Returns: undefined;
      };
    };
  };
}
