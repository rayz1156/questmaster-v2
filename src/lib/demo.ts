import { Hunt, Challenge, Submission, Team, User, LeaderboardRow } from "./types";

export const demoUsers: Record<string, User> = {
  participant: { id: "u1", email: "alex@quest.io", display_name: "Alex", role: "participant", xp: 1240, level: 4 },
  educator:    { id: "u2", email: "prof@quest.io", display_name: "Prof. Smith", role: "educator", xp: 0, level: 0 },
  admin:       { id: "u3", email: "admin@quest.io", display_name: "Admin", role: "admin", xp: 0, level: 0 },
};

export const demoHunts: Hunt[] = [
  { id: "h1", name: "Campus Mystery", theme: "detective", description: "Solve clues across campus.", location: "Main Campus", start_time: new Date().toISOString(), end_time: new Date(Date.now()+86400000*3).toISOString(), team_size: 4, max_teams: 10, status: "active", created_by: "u2" },
  { id: "h2", name: "History Hunt", theme: "history", description: "Discover historical landmarks.", location: "Downtown", start_time: new Date().toISOString(), end_time: new Date(Date.now()+86400000*5).toISOString(), team_size: 3, max_teams: 8, status: "draft", created_by: "u2" },
];

export const demoChallenges: Challenge[] = [
  { id: "c1", hunt_id: "h1", title: "Find the bronze statue", description: "Take a selfie next to it", order_index: 1, points: 100 },
  { id: "c2", hunt_id: "h1", title: "Library riddle", description: "Solve the riddle on shelf 42", order_index: 2, points: 150 },
  { id: "c3", hunt_id: "h1", title: "Cafeteria challenge", description: "Find the secret menu code", order_index: 3, points: 200 },
];

export const demoSubmissions: Submission[] = [
  { id: "s1", challenge_id: "c1", hunt_id: "h1", user_id: "u1", content: "Found it near the fountain!", status: "approved", awarded_points: 100, feedback: "Great find!" },
  { id: "s2", challenge_id: "c2", hunt_id: "h1", user_id: "u1", content: "42 = answer to everything", status: "pending", awarded_points: 0 },
];

export const demoTeams: Team[] = [
  { id: "t1", hunt_id: "h1", name: "The Riddlers", members: ["u1"], total_points: 350 },
  { id: "t2", hunt_id: "h1", name: "Code Breakers", members: [], total_points: 280 },
  { id: "t3", hunt_id: "h1", name: "Quest Squad", members: [], total_points: 210 },
];

export const demoLeaderboard: LeaderboardRow[] = [
  { rank: 1, user_id: "u1", display_name: "Alex", team_name: "The Riddlers", total_points: 1240 },
  { rank: 2, user_id: "u4", display_name: "Jordan", team_name: "Code Breakers", total_points: 1100 },
  { rank: 3, user_id: "u5", display_name: "Sam", team_name: "Quest Squad", total_points: 980 },
  { rank: 4, user_id: "u6", display_name: "Riley", team_name: "Quest Squad", total_points: 860 },
  { rank: 5, user_id: "u7", display_name: "Casey", team_name: "The Riddlers", total_points: 720 },
];
