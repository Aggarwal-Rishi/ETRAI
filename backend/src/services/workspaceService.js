/**
 * ETRAI Multi-User Workspace & Team Service
 * Provides workspace creation, seat limit auditing, cryptographic invitations,
 * role hierarchy management, and member enable/disable controls.
 */

const crypto = require('crypto');
const { prisma } = require('../utils/prisma');

/**
 * Lists all workspaces that the user owns or belongs to
 */
async function listUserWorkspaces(userId) {
  if (!userId) throw new Error('User ID is required.');

  // Find owned and member workspaces
  const [owned, memberships] = await Promise.all([
    prisma.workspace.findMany({
      where: { ownerId: userId },
      include: {
        _count: { select: { members: true, invitations: true } }
      }
    }),
    prisma.teamMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        workspace: {
          include: {
            _count: { select: { members: true, invitations: true } }
          }
        }
      }
    })
  ]);

  const workspacesMap = new Map();

  for (const w of owned) {
    workspacesMap.set(w.id, {
      ...w,
      currentUserRole: 'OWNER',
      membersCount: w._count?.members || 1,
      pendingInvitesCount: w._count?.invitations || 0
    });
  }

  for (const m of memberships) {
    if (!workspacesMap.has(m.workspaceId)) {
      workspacesMap.set(m.workspaceId, {
        ...m.workspace,
        currentUserRole: m.role,
        membersCount: m.workspace?._count?.members || 1,
        pendingInvitesCount: m.workspace?._count?.invitations || 0
      });
    }
  }

  return Array.from(workspacesMap.values());
}

/**
 * Retrieves workspace details, member lists, and seat limit telemetry
 */
async function getWorkspaceDetails(workspaceId, userId) {
  if (!workspaceId) throw new Error('Workspace ID is required.');

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      settings: true,
      members: {
        include: { user: { select: { id: true, email: true, fullName: true, photoUrl: true } } }
      },
      invitations: {
        where: { status: 'PENDING' }
      }
    }
  });

  if (!workspace) throw new Error('Workspace not found.');

  // Verify user is owner or active member
  const isOwner = workspace.ownerId === userId;
  const member = workspace.members.find(m => m.userId === userId);

  if (!isOwner && (!member || member.status === 'DISABLED')) {
    throw new Error('Access denied: Unauthorized workspace access.');
  }

  const activeMembersCount = workspace.members.filter(m => m.status === 'ACTIVE').length;
  const pendingInvitesCount = workspace.invitations.length;
  const totalOccupiedSeats = activeMembersCount + pendingInvitesCount;

  return {
    ...workspace,
    currentUserRole: isOwner ? 'OWNER' : (member?.role || 'READER'),
    activeMembersCount,
    pendingInvitesCount,
    totalOccupiedSeats,
    maxSeats: workspace.maxSeats,
    seatsAvailable: Math.max(0, workspace.maxSeats - totalOccupiedSeats)
  };
}

/**
 * Invites a new team member with strict seat limit enforcement
 */
async function inviteWorkspaceMember(workspaceId, inviterUserId, { email, role = 'REVIEWER' }) {
  if (!workspaceId || !email) throw new Error('Workspace ID and recipient email are required.');
  const cleanEmail = email.toLowerCase().trim();

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: true,
      invitations: { where: { status: 'PENDING' } }
    }
  });

  if (!workspace) throw new Error('Workspace not found.');

  // Verify inviter has permission
  const isOwner = workspace.ownerId === inviterUserId;
  const inviterMember = workspace.members.find(m => m.userId === inviterUserId);
  if (!isOwner && inviterMember?.role !== 'OWNER') {
    throw new Error('Permission denied: Only workspace Owners can invite team members.');
  }

  // 1. Seat Limit Check
  const activeMembersCount = workspace.members.filter(m => m.status === 'ACTIVE').length;
  const pendingInvitesCount = workspace.invitations.length;
  const totalOccupiedSeats = activeMembersCount + pendingInvitesCount;

  if (totalOccupiedSeats >= workspace.maxSeats) {
    throw new Error(`Workspace seat limit reached (${workspace.maxSeats} seats on ${workspace.plan} plan). Please upgrade your subscription tier.`);
  }

  // 2. Check if already active member
  const existingMember = workspace.members.find(m => m.email.toLowerCase() === cleanEmail);
  if (existingMember && existingMember.status === 'ACTIVE') {
    throw new Error(`User with email ${cleanEmail} is already an active member of this workspace.`);
  }

  // 3. Check if already has pending invite
  const existingInvite = workspace.invitations.find(i => i.email.toLowerCase() === cleanEmail);
  if (existingInvite) {
    throw new Error(`A pending invitation has already been sent to ${cleanEmail}.`);
  }

  // 4. Generate secure invitation token
  const token = `inv_${crypto.randomBytes(24).toString('hex')}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

  const invitation = await prisma.invitation.create({
    data: {
      workspaceId,
      email: cleanEmail,
      role: role.toUpperCase(),
      token,
      status: 'PENDING',
      expiresAt
    }
  });

  return invitation;
}

/**
 * Accepts an invitation token and registers user into the workspace
 */
async function acceptInvitation(token, userId) {
  if (!token || !userId) throw new Error('Invitation token and user ID are required.');

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: true }
  });

  if (!invitation || invitation.status !== 'PENDING') {
    throw new Error('Invalid or expired invitation token.');
  }

  if (new Date() > new Date(invitation.expiresAt)) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    throw new Error('Invitation token has expired.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found.');

  // Create or activate team member record
  const member = await prisma.teamMember.create({
    data: {
      workspaceId: invitation.workspaceId,
      userId: user.id,
      email: user.email,
      name: user.fullName || 'Team Member',
      role: invitation.role,
      status: 'ACTIVE',
      lastActive: 'Active now'
    }
  });

  // Mark invitation accepted
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: 'ACCEPTED' }
  });

  return {
    member,
    workspace: invitation.workspace
  };
}

/**
 * Cancels / Revokes a pending invitation
 */
async function cancelInvitation(workspaceId, invitationId, requesterUserId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || (workspace.ownerId !== requesterUserId)) {
    throw new Error('Permission denied: Only workspace Owners can revoke invitations.');
  }

  return await prisma.invitation.deleteMany({
    where: { id: invitationId, workspaceId }
  });
}

/**
 * Updates a team member's role (OWNER only)
 */
async function updateMemberRole(workspaceId, memberId, newRole, requesterUserId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || (workspace.ownerId !== requesterUserId)) {
    throw new Error('Permission denied: Only workspace Owners can modify member roles.');
  }

  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.workspaceId !== workspaceId) {
    throw new Error('Team member not found in this workspace.');
  }

  if (member.userId === workspace.ownerId && newRole !== 'OWNER') {
    throw new Error('Cannot demote the primary workspace Owner.');
  }

  return await prisma.teamMember.update({
    where: { id: memberId },
    data: { role: newRole.toUpperCase() }
  });
}

/**
 * Enables or disables a team member (OWNER only)
 */
async function toggleMemberStatus(workspaceId, memberId, status, requesterUserId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || (workspace.ownerId !== requesterUserId)) {
    throw new Error('Permission denied: Only workspace Owners can enable or disable members.');
  }

  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.workspaceId !== workspaceId) {
    throw new Error('Team member not found in this workspace.');
  }

  if (member.userId === workspace.ownerId && status === 'DISABLED') {
    throw new Error('Cannot disable the primary workspace Owner.');
  }

  return await prisma.teamMember.update({
    where: { id: memberId },
    data: { status: status.toUpperCase() }
  });
}

/**
 * Removes a member from the workspace (OWNER only)
 */
async function removeMember(workspaceId, memberId, requesterUserId) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || (workspace.ownerId !== requesterUserId)) {
    throw new Error('Permission denied: Only workspace Owners can remove members.');
  }

  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.workspaceId !== workspaceId) {
    throw new Error('Team member not found in this workspace.');
  }

  if (member.userId === workspace.ownerId) {
    throw new Error('Cannot remove the primary workspace Owner.');
  }

  return await prisma.teamMember.delete({ where: { id: memberId } });
}

module.exports = {
  listUserWorkspaces,
  getWorkspaceDetails,
  inviteWorkspaceMember,
  acceptInvitation,
  cancelInvitation,
  updateMemberRole,
  toggleMemberStatus,
  removeMember
};
