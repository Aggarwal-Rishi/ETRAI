const { PrismaClient } = require('@prisma/client');

let prisma;

try {
  prisma = new PrismaClient();
} catch (err) {
  console.warn('[Prisma Init Warning]: Prisma client fallback mode active.');
}

// In-Memory Data Store Fallbacks for local testing if Postgres is offline
const memoryUsers = new Map();
const memoryAnalyses = new Map();

const dbService = {
  // Find user by email
  findUserByEmail: async (email) => {
    try {
      if (prisma) {
        return await prisma.user.findUnique({ where: { email } });
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    return memoryUsers.get(email.toLowerCase()) || null;
  },

  // Find user by ID
  findUserById: async (id) => {
    try {
      if (prisma) {
        return await prisma.user.findUnique({ where: { id } });
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    for (const u of memoryUsers.values()) {
      if (u.id === id) return u;
    }
    return null;
  },

  // Create new user
  createUser: async ({ email, passwordHash }) => {
    try {
      if (prisma) {
        return await prisma.user.create({
          data: { email: email.toLowerCase(), passwordHash }
        });
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    const newUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    memoryUsers.set(email.toLowerCase(), newUser);
    return newUser;
  },

  // Save analysis record fallback
  saveAnalysisFallback: (analysis) => {
    memoryAnalyses.set(analysis.id, analysis);
  },

  // Find analysis by ID
  findAnalysisById: async (id, userId) => {
    try {
      if (prisma) {
        const item = await prisma.analysis.findFirst({
          where: { id, userId }
        });
        if (item) return item;
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    const item = memoryAnalyses.get(id);
    if (item && item.userId === userId) {
      return item;
    }
    return null;
  },

  // List all analysis history for user
  listAnalysesByUser: async (userId) => {
    try {
      if (prisma) {
        return await prisma.analysis.findMany({
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
            createdAt: true
          }
        });
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    const list = Array.from(memoryAnalyses.values())
      .filter(a => a.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
  },

  // Delete analysis history item
  deleteAnalysisById: async (id, userId) => {
    try {
      if (prisma) {
        await prisma.analysis.deleteMany({
          where: { id, userId }
        });
        return true;
      }
    } catch (e) {
      // Fallthrough to memory store
    }
    const item = memoryAnalyses.get(id);
    if (item && item.userId === userId) {
      memoryAnalyses.delete(id);
      return true;
    }
    return false;
  }
};

module.exports = {
  prisma,
  dbService
};
