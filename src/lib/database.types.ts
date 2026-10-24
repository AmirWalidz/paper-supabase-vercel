export type Project = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type TaskStatus = "todo" | "doing" | "done";

export type Task = {
  id: string;
  project_id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Pick<Project, "owner_id" | "name"> &
          Partial<Pick<Project, "id">>;
        Update: Partial<Pick<Project, "name" | "owner_id">>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Pick<Task, "project_id" | "title"> &
          Partial<Pick<Task, "id" | "status">>;
        Update: Partial<Pick<Task, "title" | "status" | "project_id">>;
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
