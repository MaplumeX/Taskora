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
  sortOrder: number;
  tagGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}