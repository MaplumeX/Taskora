export interface CreateTagDto {
  title: string;
  color?: string; // hex, 默认 "#3B82F6"
  tagGroupId?: string | null;
}

export interface UpdateTagDto {
  title?: string;
  color?: string;
  tagGroupId?: string | null;
}

export interface TagResponseDto {
  id: string;
  title: string;
  color: string;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  tagGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}