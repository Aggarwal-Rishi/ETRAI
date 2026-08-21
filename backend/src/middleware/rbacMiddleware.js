/**
 * ETRAI Role-Based Access Control (RBAC) Middleware
 * Enforces server-side permissions and verifies active membership.
 * Never relies solely on frontend route hiding.
 */

const { prisma } = require('../utils/prisma');

const ROLE_PERMISSIONS = {
  OWNER: [
    'manage_workspace',
    'manage_billing',
    'manage_members',
    'invite_members',
    'create_analysis',
    'reverify_analysis',
    'delete_analysis',
    'view_reports',
    'edit_settings',
    'audit_claims',
    'view_sources'
  ],
  CREATOR: [
    'create_analysis',
    'reverify_analysis',
    'view_reports',
    'view_sources',
    'audit_claims'
  ],
  REVIEWER: [
    'reverify_analysis',
    'view_reports',
    'view_sources',
    'audit_claims'
  ],
  READER: [
    'view_reports',
    'view_sources'
  ]
};

/**
 * Middleware factory requiring a specific workspace permission
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      // Determine workspace ID from params, headers, or query
      const workspaceId = req.params.workspaceId || req.params.id || req.headers['x-workspace-id'] || req.query.workspaceId;

      if (!workspaceId) {
        // Fallback to user's primary owned workspace
        const primaryWs = await prisma.workspace.findFirst({ where: { ownerId: userId } });
        if (!primaryWs) {
          return res.status(403).json({ error: 'No authorized workspace found.' });
        }
        req.workspace = primaryWs;
        req.workspaceRole = 'OWNER';
        return next();
      }

      // Look up membership
      const membership = await prisma.teamMember.findFirst({
        where: {
          workspaceId,
          userId
        },
        include: {
          workspace: true
        }
      });

      if (!membership) {
        // Check if user is the direct workspace owner
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (workspace && workspace.ownerId === userId) {
          req.workspace = workspace;
          req.workspaceRole = 'OWNER';
          return next();
        }
        return res.status(403).json({ error: 'Access denied: You are not a member of this workspace.' });
      }

      // Check if user has been disabled by workspace owner
      if (membership.status === 'DISABLED') {
        return res.status(403).json({
          error: 'Workspace account disabled. Contact your workspace administrator.'
        });
      }

      const role = membership.role || 'READER';
      const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.READER;

      if (permission && !permissions.includes(permission)) {
        return res.status(403).json({
          error: `Insufficient permissions. Role '${role}' lacks '${permission}' capability.`
        });
      }

      req.workspace = membership.workspace;
      req.workspaceMember = membership;
      req.workspaceRole = role;

      next();
    } catch (err) {
      console.error('[RBAC Error]:', err);
      return res.status(500).json({ error: 'Failed to authorize workspace request.' });
    }
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  requirePermission
};
