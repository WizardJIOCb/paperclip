import type {
  CreateIssueBoardColumn,
  DeleteIssueBoardColumnResult,
  IssueBoardColumn,
  ReorderIssueBoardColumns,
  SetIssueBoardColumnVisibility,
  SetIssueBoardColumnVisibilityResult,
  UpdateIssueBoardColumn,
} from "@paperclipai/shared";
import { api } from "./client";

export const issueBoardColumnsApi = {
  list: (companyId: string) =>
    api.get<IssueBoardColumn[]>(`/companies/${companyId}/issue-board-columns`),
  create: (companyId: string, data: CreateIssueBoardColumn) =>
    api.post<IssueBoardColumn>(`/companies/${companyId}/issue-board-columns`, data),
  update: (id: string, data: UpdateIssueBoardColumn) =>
    api.patch<IssueBoardColumn>(`/issue-board-columns/${id}`, data),
  reorder: (companyId: string, data: ReorderIssueBoardColumns) =>
    api.put<IssueBoardColumn[]>(`/companies/${companyId}/issue-board-columns/order`, data),
  setVisibility: (id: string, data: SetIssueBoardColumnVisibility) =>
    api.put<SetIssueBoardColumnVisibilityResult>(`/issue-board-columns/${id}/visibility`, data),
  remove: (id: string, destinationColumnId: string | null = null) =>
    api.delete<DeleteIssueBoardColumnResult>(`/issue-board-columns/${id}`, { destinationColumnId }),
};
