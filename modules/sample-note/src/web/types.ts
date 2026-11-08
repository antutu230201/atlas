/** 模块页面的统一入参（由应用外壳注入） */
export interface ModulePageProps {
  workspaceSlug: string;
  moduleName: string;
}

export interface NoteRow {
  id: string;
  title: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
}
