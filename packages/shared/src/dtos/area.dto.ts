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
  sortOrder: number;
  tags?: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}
