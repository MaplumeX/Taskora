export interface CreateTagDto {
  title: string;
  color?: string; // hex, 默认 "#3B82F6"
  /** 父 Tag（嵌套 Tag，ADR-0016）；null 或缺省为顶层。 */
  parentId?: string | null;
}

export interface UpdateTagDto {
  title?: string;
  color?: string;
  parentId?: string | null;
}

export interface TagResponseDto {
  id: string;
  title: string;
  color: string;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  /** 父 Tag（嵌套 Tag，ADR-0016）；null 为顶层。 */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}