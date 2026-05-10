export type Role = 'participant' | 'educator' | 'admin' | 'superadmin';
export type Profile = { id: string; role: Role; display_name: string | null; suspended: boolean; approved: boolean; logo_url: string | null; bio: string | null; avatar_url: string | null; bio_updated_at: string | null; created_at: string };
export type Hunt = { id: string; owner_id: string; class_id?: string|null; title: string; description: string | null; status: 'draft'|'active'|'archived'; invite_code: string; points: number; instructions: string|null; link1: string|null; link2: string|null; submission_link: string|null; submission_link_label: string|null; submission_link_embed: boolean; created_at: string };
export type Challenge = { id: string; hunt_id: string; title: string; prompt: string | null; answer: string | null; points: number; order_idx: number };
export type Team = { id: string; hunt_id: string; name: string; score: number; created_at: string };
export type Membership = { hunt_id: string; user_id: string; joined_at: string };
export type Submission = { id: string; challenge_id: string; team_id: string | null; user_id: string; answer: string | null; status: 'pending'|'approved'|'rejected'; reviewed_by: string | null; created_at: string };
export type AuditEntry = { id: number; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; meta: any; created_at: string };
export type User = { id: string; email?: string; role: Role; display_name?: string };

// Co-creator educator support (migration 0009_co_educators)
export type ClassEducatorRole = 'owner' | 'co_creator';
export type ClassEducator = {
  educator_id: string;
  role: ClassEducatorRole;
  invited_by: string | null;
  invited_at: string;
  accepted_at: string | null;
  email: string | null;
  display_name: string | null;
};
export type ClassEducatorInvite = {
  id: string;
  email: string;
  code: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: string | null;
  expires_at: string;
  created_at: string;
};
export type MyClassEducatorInvite = ClassEducatorInvite & {
  class_id: string;
  class_name: string;
  class_color: string | null;
  inviter_name: string | null;
};
export type EducatorClassRow = {
  id: string; name: string; description: string | null; color: string | null;
  join_code: string; is_archived: boolean; created_at: string;
  role: ClassEducatorRole;
};
