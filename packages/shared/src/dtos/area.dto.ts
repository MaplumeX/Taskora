import type { ReviewInterval } from '../review';
import type { TagResponseDto } from './tag.dto';

export interface CreateAreaDto {
  title: string;
  notes?: string;
  tagIds?: string[];
  /** 回顾间隔（Review Interval）；缺省取账号默认回顾间隔。 */
  reviewInterval?: ReviewInterval;
  /** 下次回顾日（YYYY-MM-DD）；缺省为今天加回顾间隔。 */
  nextReviewDate?: string;
}

export interface UpdateAreaDto {
  title?: string;
  notes?: string;
  tagIds?: string[];
  /** 回顾间隔：只改间隔，不改写下次回顾日。 */
  reviewInterval?: ReviewInterval;
  /** 下次回顾日（YYYY-MM-DD）。 */
  nextReviewDate?: string;
}

export interface AreaResponseDto {
  id: string;
  title: string;
  notes: string | null;
  /** 列表位次（fractional indexing 字符串，ADR-0007）；列表顺序只看它。 */
  position?: string | null;
  /** 回顾间隔；null 为存量数据，按账号默认回顾间隔计算。 */
  reviewInterval?: ReviewInterval | null;
  /** 下次回顾日（YYYY-MM-DD）；null 为存量数据，视为今天待回顾。 */
  nextReviewDate?: string | null;
  tags?: TagResponseDto[];
  createdAt: string;
  updatedAt: string;
}
