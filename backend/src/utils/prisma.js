require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

let prisma;
try {
  prisma = new PrismaClient();
} catch (err) {
  console.error('[Prisma Init Error]: Failed to initialize PrismaClient:', err.message);
  throw err;
}

/**
 * Database Health Check probe
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latencyMs = Date.now() - startTime;
    return {
      healthy: true,
      latencyMs,
      message: 'Database connection operational'
    };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - startTime,
      message: err.message
    };
  }
}

/**
 * Configure SQLite pragmas for concurrency and performance
 */
async function configureSqlitePragmas() {
  try {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
      await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
      await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
      await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;');
    }
  } catch (e) {
    // Pragmas are optional optimizations; ignore if not supported by driver
  }
}

// Apply pragmas asynchronously on startup
configureSqlitePragmas().catch(() => {});

const dbService = {
  // -------------------------------------------------------------
  // USER & AUTH METHODS
  // -------------------------------------------------------------
  findUserByEmail: async (email) => {
    if (!email) return null;
    return await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        workspaces: true,
        memberships: { include: { workspace: true } }
      }
    });
  },

  findUserById: async (id) => {
    if (!id) return null;
    return await prisma.user.findUnique({
      where: { id },
      include: {
        workspaces: true,
        memberships: { include: { workspace: true } }
      }
    });
  },

  createUser: async ({ email, passwordHash, fullName, phone, company, role }) => {
    const cleanEmail = email.toLowerCase();
    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        fullName: fullName || null,
        phone: phone || null,
        company: company || null,
        role: role || 'OWNER'
      }
    });

    // Automatically create a default personal workspace for the user
    const slug = cleanEmail.split('@')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-' + Math.random().toString(36).substring(2, 6);
    const workspace = await prisma.workspace.create({
      data: {
        name: company ? `${company} Workspace` : `${fullName || 'My'} Workspace`,
        slug,
        ownerId: user.id,
        plan: 'Team',
        maxSeats: 5,
        verificationLimit: 500,
        verificationsUsed: 0
      }
    });

    // Add user as an OWNER team member of their own workspace
    await prisma.teamMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        email: cleanEmail,
        name: fullName || 'Workspace Owner',
        phone: phone || null,
        company: company || null,
        role: 'OWNER',
        status: 'ACTIVE',
        lastActive: 'Active now'
      }
    });

    // Create default settings for workspace
    await prisma.workspaceSettings.create({
      data: {
        workspaceId: workspace.id,
        regionFocus: 'India',
        primaryBeat: 'Policy & governance'
      }
    });

    return user;
  },

  updateUserProfile: async (userId, data) => {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        company: data.company,
        photoUrl: data.photoUrl
      }
    });
  },

  // -------------------------------------------------------------
  // WORKSPACE & TENANT ISOLATION METHODS
  // -------------------------------------------------------------
  getWorkspaceForUser: async (userId) => {
    let ws = await prisma.workspace.findFirst({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        settings: true,
        members: true,
        subscriptions: { where: { status: 'ACTIVE' }, take: 1 }
      }
    });

    if (!ws) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return null;
      const slug = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-' + Math.random().toString(36).substring(2, 6);
      ws = await prisma.workspace.create({
        data: {
          name: user.company ? `${user.company} Workspace` : `${user.fullName || 'My'} Workspace`,
          slug,
          ownerId: user.id,
          plan: 'Team',
          maxSeats: 5,
          verificationLimit: 500,
          verificationsUsed: 0
        },
        include: { settings: true, members: true, subscriptions: true }
      });
      await prisma.teamMember.create({
        data: {
          workspaceId: ws.id,
          userId: user.id,
          email: user.email,
          name: user.fullName || 'Workspace Owner',
          role: 'OWNER',
          status: 'ACTIVE',
          lastActive: 'Active now'
        }
      });
    }

    return ws;
  },

  // -------------------------------------------------------------
  // TEAM MANAGEMENT METHODS
  // -------------------------------------------------------------
  listTeamMembers: async (workspaceId) => {
    return await prisma.teamMember.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' }
    });
  },

  addTeamMember: async (workspaceId, memberData) => {
    return await prisma.teamMember.create({
      data: {
        workspaceId,
        email: memberData.email.toLowerCase(),
        name: memberData.name || null,
        phone: memberData.phone || null,
        company: memberData.company || null,
        role: memberData.role || 'REVIEWER',
        status: memberData.status || 'INVITED',
        photoUrl: memberData.photoUrl || null,
        color: memberData.color || '#0B5CD5',
        lastActive: 'Invited just now'
      }
    });
  },

  updateTeamMember: async (memberId, workspaceId, data) => {
    return await prisma.teamMember.updateMany({
      where: { id: memberId, workspaceId },
      data: {
        name: data.name,
        phone: data.phone,
        company: data.company,
        role: data.role,
        status: data.status,
        photoUrl: data.photoUrl
      }
    });
  },

  deleteTeamMember: async (memberId, workspaceId) => {
    const result = await prisma.teamMember.deleteMany({
      where: { id: memberId, workspaceId, role: { not: 'OWNER' } }
    });
    return result.count > 0;
  },

  // -------------------------------------------------------------
  // SETTINGS & RANKED SOURCES METHODS
  // -------------------------------------------------------------
  getWorkspaceSettings: async (workspaceId) => {
    return await prisma.workspaceSettings.findUnique({
      where: { workspaceId }
    });
  },

  updateWorkspaceSettings: async (workspaceId, data) => {
    return await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      update: {
        scoringWeightsJson: data.scoringWeightsJson,
        thresholdsJson: data.thresholdsJson,
        alertsJson: data.alertsJson,
        regionFocus: data.regionFocus,
        primaryBeat: data.primaryBeat
      },
      create: {
        workspaceId,
        scoringWeightsJson: data.scoringWeightsJson,
        thresholdsJson: data.thresholdsJson,
        alertsJson: data.alertsJson,
        regionFocus: data.regionFocus || 'India',
        primaryBeat: data.primaryBeat || 'Policy & governance'
      }
    });
  },

  listSources: async (workspaceId = null) => {
    return await prisma.source.findMany({
      where: workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {},
      orderBy: { rank: 'asc' }
    });
  },

  addSource: async (workspaceId, data) => {
    return await prisma.source.create({
      data: {
        workspaceId,
        name: data.name,
        domain: data.domain,
        rank: data.rank || 2,
        authorityScore: data.authorityScore || 80.0,
        purpose: data.purpose,
        status: data.status || 'ACTIVE',
        isCustom: true
      }
    });
  },

  deleteSource: async (sourceId, workspaceId) => {
    const result = await prisma.source.deleteMany({
      where: { id: sourceId, workspaceId }
    });
    return result.count > 0;
  },

  // -------------------------------------------------------------
  // SUBSCRIPTIONS & INVOICES
  // -------------------------------------------------------------
  getSubscription: async (workspaceId) => {
    return await prisma.subscription.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });
  },

  updateSubscriptionPlan: async (workspaceId, { plan, cycle, seats, paymentMethodType, paymentMethodDetails }) => {
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    if (cycle === 'ANNUAL') {
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    } else {
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    }

    const sub = await prisma.subscription.create({
      data: {
        workspaceId,
        plan,
        cycle,
        seats,
        status: 'ACTIVE',
        currentPeriodStart,
        currentPeriodEnd,
        paymentMethodType,
        paymentMethodDetails: typeof paymentMethodDetails === 'string' ? paymentMethodDetails : JSON.stringify(paymentMethodDetails || {})
      }
    });

    // Update limits on workspace
    const limits = { Starter: 100, Team: 500, Newsroom: 2000, Enterprise: 999999 };
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        plan,
        maxSeats: seats,
        verificationLimit: limits[plan] || 500
      }
    });

    return sub;
  },

  listInvoices: async (workspaceId) => {
    return await prisma.invoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });
  },

  createInvoice: async (workspaceId, invoiceData) => {
    return await prisma.invoice.create({
      data: {
        workspaceId,
        invoiceNumber: invoiceData.invoiceNumber || `DT-INV-${Date.now()}`,
        amount: invoiceData.amount,
        currency: invoiceData.currency || 'INR',
        taxAmount: invoiceData.taxAmount || 0,
        status: invoiceData.status || 'PAID',
        periodStart: invoiceData.periodStart || new Date(),
        periodEnd: invoiceData.periodEnd || new Date(),
        pdfUrl: invoiceData.pdfUrl || null,
        paymentMethod: invoiceData.paymentMethod || 'UPI',
        paidAt: new Date()
      }
    });
  },

  // -------------------------------------------------------------
  // USAGE & TOKEN METRICS
  // -------------------------------------------------------------
  recordUsage: async ({ workspaceId, userId, analysisId, tokensConsumed, costUsd, runType }) => {
    if (workspaceId) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { verificationsUsed: { increment: 1 } }
      }).catch(() => {});
    }

    return await prisma.usageRecord.create({
      data: {
        workspaceId: workspaceId || (await prisma.workspace.findFirst({ where: { ownerId: userId } }))?.id || 'default',
        userId,
        analysisId: analysisId || null,
        tokensConsumed: tokensConsumed || 0,
        costUsd: costUsd || 0.0,
        runType: runType || 'VERIFICATION'
      }
    }).catch(() => null);
  },

  // -------------------------------------------------------------
  // ANALYSIS & REPORT PERSISTENCE METHODS
  // -------------------------------------------------------------
  findAnalysisById: async (id, userId) => {
    const where = userId ? { id, userId } : { id };
    const item = await prisma.analysis.findFirst({
      where,
      include: {
        mediaAnalysis: true,
        claims: { include: { evidenceItems: true, entityConnections: true, quoteAttributions: true } },
        entities: { include: { claimConnections: true } },
        numericalFacts: true,
        provenance: { orderBy: { sequenceIndex: 'asc' } },
        provenanceNodes: { orderBy: { sequenceOrder: 'asc' } },
        spreadClusters: true,
        quoteAttributions: true,
        reportSections: true
      }
    });
    if (!item) return null;

    const parsedReportData = typeof item.reportData === 'string' ? JSON.parse(item.reportData) : item.reportData;

    return {
      ...item,
      selectedTypes: typeof item.selectedTypes === 'string' ? JSON.parse(item.selectedTypes) : item.selectedTypes,
      overallMetrics: typeof item.overallMetrics === 'string' ? JSON.parse(item.overallMetrics) : item.overallMetrics,
      reportData: parsedReportData
    };
  },

  listAnalysesByUser: async (userId) => {
    const items = await prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        inputType: true,
        selectedTypes: true,
        status: true,
        summary: true,
        overallMetrics: true,
        truncated: true,
        tokensConsumed: true,
        costUsd: true,
        trustScore: true,
        verdict: true,
        runVersion: true,
        createdAt: true
      }
    });

    return items.map(item => ({
      ...item,
      selectedTypes: typeof item.selectedTypes === 'string' ? JSON.parse(item.selectedTypes) : item.selectedTypes,
      overallMetrics: typeof item.overallMetrics === 'string' ? JSON.parse(item.overallMetrics) : item.overallMetrics
    }));
  },

  deleteAnalysisById: async (id, userId) => {
    const result = await prisma.analysis.deleteMany({
      where: { id, userId }
    });
    return result.count > 0;
  },

  // -------------------------------------------------------------
  // NEWS FEED & CLUSTERS METHODS
  // -------------------------------------------------------------
  listNewsItems: async (workspaceId = null, filter = {}) => {
    const where = {};
    if (filter.status) where.status = filter.status;
    if (filter.category && filter.category !== 'all') where.category = filter.category;
    if (filter.domain && filter.domain !== 'all') where.domain = filter.domain;
    if (filter.isClusterActive !== undefined) where.isClusterActive = filter.isClusterActive;

    return await prisma.newsItem.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: filter.limit || 50
    });
  },

  listNarrativeClusters: async (workspaceId = null) => {
    return await prisma.narrativeCluster.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { postCount: 'desc' },
      include: { newsItems: { take: 5 } }
    });
  },

  checkHealth: checkDatabaseHealth
};

module.exports = {
  prisma,
  dbService,
  checkDatabaseHealth
};
