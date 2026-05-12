/* eslint-disable @typescript-eslint/no-explicit-any */

export type SubmissionItemType = 'text' | 'image' | 'video' | 'link' | 'file';
export type SubmissionVisibility = 'public' | 'private' | 'class_scoped';

export interface SubmissionBoard {
  id: string;
  activity_id: string;
  class_id: string;
  title: string;
  description: string | null;
  visibility: SubmissionVisibility;
  is_open: boolean;
  adilo_project_id: string | null;
  view_mode: 'columns' | 'mood';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SubmissionBoardItem {
  id: string;
  board_id: string;
  submitted_by: string;
  item_type: SubmissionItemType;
  title: string | null;
  description: string | null;
  adilo_file_id: string | null;
  adilo_project_id: string | null;
  video_thumbnail_url: string | null;
  video_duration_seconds: number | null;
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  link_site_name: string | null;
  link_favicon_url: string | null;
  image_url: string | null;
  image_path: string | null;
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  file_extension: string | null;
  filelu_file_code: string | null;
  created_at: string;
  updated_at: string;
  // Layout (columns + mood board)
  column_id: string | null;
  position: number;
  mood_x: number | null;
  mood_y: number | null;
  mood_w: number | null;
  mood_h: number | null;
  mood_z: number;
  submitter?: { id: string; display_name: string | null; avatar_url: string | null } | null;
}

export interface SubmissionBoardColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionBoardSnapshot {
  board: SubmissionBoard;
  items: SubmissionBoardItem[];
  columns: SubmissionBoardColumn[];
  classMembers: { id: string; display_name: string | null }[];
  myRole: 'educator' | 'student' | 'admin';
  myId: string;
}
