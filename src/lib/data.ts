import { supabase } from './supabase';

export type Hunt = { id: string; name: string; theme: string; description: string; location: string; status: string; team_size: number; max_teams: number; start_time: string; end_time: string };
export type Challenge = { id: string; hunt_id: string; title: string; description: string; order_index: number; points: number };
export type Team = { id: string; hunt_id: string; name: string; total_points: number };
export type LeaderboardRow = { id: string; hunt_id: string; user_id: string; team_id: string | null; total_points: number; rank: number | null };

export async function listHunts() {
  const { data, error } = await supabase.from('hunts').select('*').order('start_time', { ascending: false });
  if (error) throw error; return (data || []) as Hunt[];
}
export async function getActiveHunt() {
  const { data } = await supabase.from('hunts').select('*').eq('status', 'active').limit(1).maybeSingle();
  return (data as Hunt) || null;
}
export async function listChallenges(huntId: string) {
  const { data, error } = await supabase.from('challenges').select('*').eq('hunt_id', huntId).order('order_index');
  if (error) throw error; return (data || []) as Challenge[];
}
export async function listTeams(huntId: string) {
  const { data, error } = await supabase.from('teams').select('*').eq('hunt_id', huntId).order('total_points', { ascending: false });
  if (error) throw error; return (data || []) as Team[];
}
export async function getProfile(userId: string) {
  const { data } = await supabase.from('users').select('id,email,display_name,role,xp,level').eq('id', userId).maybeSingle();
  return data as { id: string; email: string; display_name: string; role: string; xp: number; level: number } | null;
}
