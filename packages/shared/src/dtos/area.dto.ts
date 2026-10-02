import type { TagResponseDto } from './tag.dto';

export interface CreateAreaDto {
  title: string;
  notes?: string;
  tagIds?: string[];
}

export interface UpdateAreaDto {
  title?: string;
  notes?: string;
  tagIds?: string[];
}

export interface AreaResponseDto {
  id: string;
  title: string;
  notes: string | null;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  tags?: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}
