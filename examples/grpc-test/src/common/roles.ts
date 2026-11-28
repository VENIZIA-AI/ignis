/** The roles of the demo users. What each may do is in `security/role-policy.enforcer.ts`. */
export class Roles {
  static readonly VIEWER = 'viewer';
  static readonly EDITOR = 'editor';
}

/** The resources and actions the RPCs declare in `authorize`. */
export class Permissions {
  static readonly NOTE_READ = { resource: 'note', action: 'read' };
  static readonly NOTE_CREATE = { resource: 'note', action: 'create' };
}
