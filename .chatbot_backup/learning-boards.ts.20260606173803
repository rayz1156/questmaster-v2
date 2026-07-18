/**
 * Learning Board data types + client-side helpers.
 * Server logic lives in src/app/api/learning-boards/* routes.
 */

export type LearningCardType = 'video' | 'link' | 'image' | 'text' | 'file';

export interface LearningBoard {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  adilo_project_id: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LearningCard {
  id: string;
  column_id: string;
  board_id: string;
  position: number;
  card_type: LearningCardType;
  title: string | null;
  description: string | null;
  // video
  adilo_file_id: string | null;
  adilo_project_id: string | null;
  video_thumbnail_url: string | null;
  video_duration_seconds: number | null;
  // link
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  link_site_name: string | null;
  link_favicon_url: string | null;
  // image
  image_url: string | null;
  image_path: string | null;
  // file
  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size_bytes: number | null;
  file_extension: string | null;
  filelu_file_code: string | null;
  // audit
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LearningBoardSnapshot {
  board: LearningBoard;
  columns: Array<LearningColumn & { cards: LearningCard[] }>;
}

/** Format duration "00:00" or "00:00:00" from seconds. */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Parse host from a URL (for the small "site name" pill on link cards). */
export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
