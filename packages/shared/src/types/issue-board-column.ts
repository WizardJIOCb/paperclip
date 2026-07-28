import type { IssueBoardColumnColor, IssueStatus } from "../constants.js";

export interface IssueBoardColumn {
  id: string;
  companyId: string;
  name: string;
  color: IssueBoardColumnColor;
  status: IssueStatus;
  position: number;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeleteIssueBoardColumnResult {
  deleted: IssueBoardColumn;
  movedTaskCount: number;
  destinationColumnId: string | null;
}
