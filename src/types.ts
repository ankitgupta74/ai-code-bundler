export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  is_disabled: boolean;
  disable_reason: string | null;
  children: FileNode[] | null;
}
