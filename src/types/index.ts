export type Team = "Dan" | "Ian";

export type Player = {
  id: string;
  name: string;
  team: Team;
  is_captain: boolean;
  is_active: boolean;
  created_at: string;
};

export type Matchup = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  matchup_number: number;
  created_at: string;
  player_a?: Player;
  player_b?: Player;
};

export type EventLog = {
  id: string;
  message: string;
  event_type: "collision" | "system" | "flavor";
  created_at: string;
};

export type Profile = {
  id: string;
  user_id: string;
  player_id: string | null;
  ghin_number: string | null;
  handicap_index: number | null;
  ghin_last_updated_at: string | null;
};

export type Particle = {
  id: string;
  name: string;
  team: Team;
  is_captain: boolean;
  active: boolean;
  angle: number;
  speed: number;
  radius: number;
  drift: number;
};
