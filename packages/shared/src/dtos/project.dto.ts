export interface CreateProjectDto {
  title: string;
  notes?: string;
  areaId?: string;
}

export interface UpdateProjectDto {
  title?: string;
  notes?: string;
  areaId?: string | null;
}

export interface ProjectResponseDto {
  id: string;
  title: string;
  notes: string | null;
  areaId: string | null;
  createdAt: string;
  updatedAt: string;
}
