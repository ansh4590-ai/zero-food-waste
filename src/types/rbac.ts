export type AppRole = 'admin' | 'donor' | 'volunteer' | 'receiver';

export type AppPermission =
  | 'users.read'
  | 'users.verify'
  | 'food.create'
  | 'food.update_own'
  | 'food.delete_own'
  | 'food.read_all'
  | 'requests.create'
  | 'requests.update'
  | 'requests.read_own'
  | 'requests.read_all'
  | 'donations.manage'
  | 'tasks.view_assigned'
  | string; // Keep extensible for custom permissions added in DB later

export interface RBACState {
  roles: AppRole[];
  permissions: string[];
  isLoading: boolean;
  error: Error | null;
}
