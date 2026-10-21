import type { MakingVideo } from '../types/product';

export interface MakingVideoRow {
  title?: string;
  video_url: string;
  poster_url: string;
  duration_seconds: number;
  width: number;
  height: number;
}

export function mapMakingVideo(value?: MakingVideoRow | MakingVideoRow[] | null): MakingVideo | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return undefined;
  return {
    title: row.title,
    videoUrl: row.video_url, posterUrl: row.poster_url,
    durationSeconds: Number(row.duration_seconds), width: row.width, height: row.height,
  };
}
