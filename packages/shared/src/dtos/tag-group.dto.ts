import type { TagResponseDto } from './tag.dto';

export interface CreateTagGroupDto {
  title: string;
}

export interface UpdateTagGroupDto {
  title?: string;
}

export interface TagGroupResponseDto {
  id: string;
  title: string;
  sortOrder: number;
  tags: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}