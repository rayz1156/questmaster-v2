// Kontrak komponen permainan Arena (KZ-047 / KZ-048).
// Fail ini dikongsi antara permainan; jangan letak logik di sini.

export interface GameProps {
  me: { id: string; nickname: string; avatar: number } | null;
  questions: { id: string; order_idx: number; answered: boolean; locked: boolean }[];
  frozen: boolean; // guru membekukan permainan
  resetSeq: number; // naik apabila guru tekan Mula Bersama: set semula permainan
  paused: boolean; // popup soalan sedang terbuka
  powerUp: { questionId: string; correct: boolean; seq: number } | null; // hasil jawapan terakhir
  onTouchQuestion: (questionId: string) => void;
  onMove?: (x: number, y: number) => void; // tidak digunakan oleh Kejar Hantu
}
