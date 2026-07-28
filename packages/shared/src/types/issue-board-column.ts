import type { IssueBoardColumnColor, IssueStatus } from "../constants.js";

export interface IssueBoardColumn {
  id: string;
  companyId: string;
  name: string;
  color: IssueBoardColumnColor;
  status: IssueStatus;
  position: number;
  isSystem: boolean;
  hidden: boolean;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SetIssueBoardColumnVisibilityResult {
  column: IssueBoardColumn;
  movedTaskCount: number;
  destinationColumnId: string | null;
}

export interface DeleteIssueBoardColumnResult {
  deleted: IssueBoardColumn;
  movedTaskCount: number;
  destinationColumnId: string | null;
}
