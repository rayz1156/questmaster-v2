export type Role = "participant" | "educator" | "admin";

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  xp: number;
  level: number;
  avatar_url?: string;
}

export interface Hunt {
  id: string;
  name: string;
  theme: string;
  description: string;
  location: string;
  start_time: string;
  end_time: string;
  team_size: number;
  max_teams: number;
  status: "draft" | "active" | "completed";
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

export interface Challenge {
  id: string;
  hunt_id: string;
  title: string;
  description?: string;
  order_index: number;
  points: number;
  created_at?: string;
}

export interface Submission {
  id: string;
  challenge_id: string;
  hunt_id: string;
  user_id: string;
  team_id?: string;
  content: string;
  media_url?: string;
  status: "pending" | "approved" | "rejected";
  feedback?: string;
  reviewed_by?: string;
  awarded_points: number;
  created_at?: string;
  reviewed_at?: string;
}

export interface Team {
  id: string;
  hunt_id: string;
  name: string;
  members: string[];
  total_points: number;
  created_at?: string;
}

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  team_name?: string;
  total_points: number;
  avatar_url?: string;
}
