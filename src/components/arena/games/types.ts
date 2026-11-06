/**
 * Kuizen Arena: kontrak komponen permainan (dikongsi KZ-047 Pulau Harta
 * Karun dan KZ-048 Kejar Hantu). Dimuatkan oleh halaman main (KZ-046).
 *
 * BENTUK GameProps MESTI sama tepat antara KZ-047 dan KZ-048; jangan
 * ubah nama atau jenis tanpa berbincang dengan PM.
 */

export interface GameProps {
  me: { id: string; nickname: string; avatar: number } | null;
  questions: { id: string; order_idx: number; answered: boolean; locked: boolean }[];
  frozen: boolean;
  resetSeq: number;
  paused: boolean;
  powerUp: { questionId: string; correct: boolean; seq: number } | null;
  onTouchQuestion: (questionId: string) => void;
  onMove?: (x: number, y: number) => void;
}