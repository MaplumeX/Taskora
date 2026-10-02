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
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  tags: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}