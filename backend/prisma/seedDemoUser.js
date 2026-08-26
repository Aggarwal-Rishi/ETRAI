const { prisma } = require('../src/utils/prisma');
const bcrypt = require('bcryptjs');

async function seed() {
  const password = 'Password123!';
  const hash = await bcrypt.hash(password, 10);

  const accounts = [
    { email: 'demo@etrai.io', fullName: 'Demo Analyst', role: 'OWNER', company: 'ETRAI Newsroom' },
    { email: 'admin@etrai.io', fullName: 'ETRAI Administrator', role: 'OWNER', company: 'ETRAI HQ' },
    { email: 'demo@etrai.ai', fullName: 'Demo User', role: 'OWNER', company: 'ETRAI Labs' }
  ];

  for (const acc of accounts) {
    await prisma.user.upsert({
      where: { email: acc.email },
      update: {
        passwordHash: hash,
        fullName: acc.fullName,
        role: acc.role,
        company: acc.company
      },
      create: {
        email: acc.email,
        fullName: acc.fullName,
        passwordHash: hash,
        role: acc.role,
        company: acc.company
      }
    });
    console.log(`[READY] Email: ${acc.email} | Password: ${password}`);
  }
}

seed()
  .catch(console.error)
  .finally(async () => {
    if (prisma && prisma.$disconnect) await prisma.$disconnect();
  });
