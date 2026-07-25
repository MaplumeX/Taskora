export interface CreateAreaDto {
  title: string;
  notes?: string;
}

export interface UpdateAreaDto {
  title?: string;
  notes?: string;
}

export interface AreaResponseDto {
  id: string;
  title: string;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
