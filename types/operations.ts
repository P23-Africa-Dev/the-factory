export type TaskCategory = 'all' | 'agent' | 'attendance';

export interface DndItem {
  id: string;
  label: string;
  description: string;
  location: string;
  time: string;
  avatar?: string;
  icon?: string;
  category?: TaskCategory;
}

export interface DndContainer {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
}
