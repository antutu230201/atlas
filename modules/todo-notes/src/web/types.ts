export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

export interface TodoRow {
  id: string;
  title: string;
  notes: string;
  status: 'open' | 'doing' | 'done';
  priority: 'low' | 'normal' | 'high';
  dueDate: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
