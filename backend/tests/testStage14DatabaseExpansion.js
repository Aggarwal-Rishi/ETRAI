const assert = require('assert');
const { prisma, dbService } = require('../src/utils/prisma');

async function runStage14DatabaseExpansionTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING STAGE 14: DATABASE EXPANSION & INTEGRITY TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name} -> ${e.message}`);
      failed++;
    }
  };

  const testEmail = `stage14_owner_${Date.now()}@etrai-audit.org`;
  let testUser = null;
  let testWorkspace = null;

  try {
    // ----------------------------------------------------------------
    // Test 1: User & Auto-Created Workspace with Owner TeamMember
    // ----------------------------------------------------------------
    await runTest('1. User creation automatically initializes Workspace and OWNER TeamMember', async () => {
      testUser = await dbService.createUser({
        email: testEmail,
        passwordHash: '$2a$10$FakeHashForTest14StageExpansionOnly',
        fullName: 'Gajendra Singh',
        phone: '+91 98110 42207',
        company: 'Caasaa AI Innovations',
        role: 'OWNER'
      });

      assert.ok(testUser.id, 'User must have a generated UUID');
      testWorkspace = await dbService.getWorkspaceForUser(testUser.id);
      assert.ok(testWorkspace, 'Workspace must be automatically created');
      assert.strictEqual(testWorkspace.ownerId, testUser.id, 'Workspace ownerId must match user id');
      assert.strictEqual(testWorkspace.plan, 'Team', 'Default plan is Team');

      const members = await dbService.listTeamMembers(testWorkspace.id);
      assert.ok(members.length >= 1, 'Should have at least 1 team member');
      assert.strictEqual(members[0].role, 'OWNER', 'First member role must be OWNER');
      assert.strictEqual(members[0].email, testEmail.toLowerCase());
    });

    // ----------------------------------------------------------------
    // Test 2: Team Member CRUD & Tenant Isolation
    // ----------------------------------------------------------------
    await runTest('2. Team Member CRUD operations with workspace tenant isolation', async () => {
      const newMember = await dbService.addTeamMember(testWorkspace.id, {
        email: `shakti_${Date.now()}@caasaa.ai`,
        name: 'Shakti Pratap',
        phone: '+91 99589 11204',
        company: 'Caasaa AI Innovations',
        role: 'CREATOR',
        status: 'ACTIVE',
        color: '#3E7A55'
      });

      assert.ok(newMember.id, 'Team member must have an ID');
      assert.strictEqual(newMember.role, 'CREATOR');

      // Update team member
      await dbService.updateTeamMember(newMember.id, testWorkspace.id, {
        name: 'Shakti Pratap Updated',
        role: 'REVIEWER'
      });

      const updatedMembers = await dbService.listTeamMembers(testWorkspace.id);
      const found = updatedMembers.find(m => m.id === newMember.id);
      assert.strictEqual(found.name, 'Shakti Pratap Updated');
      assert.strictEqual(found.role, 'REVIEWER');

      // Delete non-owner team member
      const deleted = await dbService.deleteTeamMember(newMember.id, testWorkspace.id);
      assert.strictEqual(deleted, true, 'Non-owner member must be deletable');

      // Attempt to delete owner must be rejected
      const ownerMember = updatedMembers.find(m => m.role === 'OWNER');
      const deleteOwnerAttempt = await dbService.deleteTeamMember(ownerMember.id, testWorkspace.id);
      assert.strictEqual(deleteOwnerAttempt, false, 'OWNER member deletion must be blocked');
    });

    // ----------------------------------------------------------------
    // Test 3: Workspace Settings & Custom Ranked Sources
    // ----------------------------------------------------------------
    await runTest('3. Workspace custom settings & ranked sources persistence', async () => {
      const customWeights = JSON.stringify({ authority: 22, corrob: 20, evidence: 20, media: 15, prov: 10, lang: 8, amp: 5 });
      const customThresholds = JSON.stringify({ verified: 75, suspicious: 40, penaltyDoc: 4, penaltyMedia: 3 });

      await dbService.updateWorkspaceSettings(testWorkspace.id, {
        scoringWeightsJson: customWeights,
        thresholdsJson: customThresholds,
        regionFocus: 'South Asia',
        primaryBeat: 'Finance & markets'
      });

      const settings = await dbService.getWorkspaceSettings(testWorkspace.id);
      assert.strictEqual(settings.regionFocus, 'South Asia');
      assert.strictEqual(settings.primaryBeat, 'Finance & markets');

      // Add Custom Ranked Source
      const source = await dbService.addSource(testWorkspace.id, {
        name: 'VerifyIndia Fact Desk',
        domain: 'verifyindia.local',
        rank: 1,
        authorityScore: 92.0,
        purpose: 'Primary fact desk verification'
      });

      assert.strictEqual(source.rank, 1);
      assert.strictEqual(source.isCustom, true);

      const sourcesList = await dbService.listSources(testWorkspace.id);
      assert.ok(sourcesList.some(s => s.id === source.id), 'Custom source must appear in workspace source list');
    });

    // ----------------------------------------------------------------
    // Test 4: Subscriptions, Invoices & Usage Records
    // ----------------------------------------------------------------
    await runTest('4. Subscription tier upgrades, invoices, and token usage accounting', async () => {
      const sub = await dbService.updateSubscriptionPlan(testWorkspace.id, {
        plan: 'Newsroom',
        cycle: 'ANNUAL',
        seats: 20,
        paymentMethodType: 'UPI',
        paymentMethodDetails: { upiId: 'gajenn@okhdfcbank' }
      });

      assert.strictEqual(sub.plan, 'Newsroom');
      assert.strictEqual(sub.seats, 20);

      // Verify workspace limits updated
      const updatedWs = await dbService.getWorkspaceForUser(testUser.id);
      assert.strictEqual(updatedWs.plan, 'Newsroom');
      assert.strictEqual(updatedWs.maxSeats, 20);
      assert.strictEqual(updatedWs.verificationLimit, 2000);

      // Create Invoice
      const invoice = await dbService.createInvoice(testWorkspace.id, {
        invoiceNumber: `DT-INV-2026-${Date.now().toString().slice(-4)}`,
        amount: 68000.0,
        currency: 'INR',
        taxAmount: 12240.0,
        paymentMethod: 'UPI'
      });

      assert.ok(invoice.id);
      assert.strictEqual(invoice.status, 'PAID');

      const invoices = await dbService.listInvoices(testWorkspace.id);
      assert.ok(invoices.length >= 1, 'Invoices list must contain new invoice');

      // Record Usage & Tokens
      const usage = await dbService.recordUsage({
        workspaceId: testWorkspace.id,
        userId: testUser.id,
        tokensConsumed: 412800,
        costUsd: 2.64,
        runType: 'VERIFICATION'
      });

      assert.ok(usage.id);
      assert.strictEqual(usage.tokensConsumed, 412800);
    });

    // ----------------------------------------------------------------
    // Test 5: Granular Claims, Evidence, Entities & Provenance Relational Persistence
    // ----------------------------------------------------------------
    await runTest('5. Granular analysis with Claims, EvidenceItems, Entities, and Provenance', async () => {
      const analysisId = `job_test_stage14_${Date.now()}`;
      
      const analysis = await prisma.analysis.create({
        data: {
          id: analysisId,
          userId: testUser.id,
          workspaceId: testWorkspace.id,
          title: 'Currency Policy Withdrawal Rumour Audit',
          inputType: 'URL',
          inputSource: 'https://bharatwire-live.co/leaked-circular-500',
          selectedTypes: JSON.stringify(['FACT_CHECKING', 'FAKE_NEWS_DETECTION']),
          status: 'COMPLETED',
          summary: 'Circulated notification is fabricated; denomination remains legal tender.',
          overallMetrics: JSON.stringify({ trustScore: 23, factualAccuracy: 24, verdict: 'FALSE' }),
          reportData: JSON.stringify({ title: 'Currency Policy Audit' }),
          trustScore: 23,
          verdict: 'FALSE',
          tokensConsumed: 412800,
          costUsd: 2.64,
          claims: {
            create: [
              {
                id: `cl_1_${Date.now()}`,
                claimText: 'All ₹500 banknotes stop being legal tender from 1 October 2026.',
                claimScope: 'National',
                category: 'Currency Policy',
                verdict: 'FALSE',
                status: 'FABRICATED',
                confidence: 91.0,
                reasoning: 'Gazette index returns no matching notification.',
                evidenceItems: {
                  create: [
                    {
                      sourceIndex: 0,
                      url: 'https://gazette.gov.in/notices',
                      domain: 'gazette.gov.in',
                      title: 'National Gazette Notification Index',
                      snippet: 'Official circulars index confirms no withdrawal notice exists for denomination.',
                      stance: 'REFUTES',
                      relevanceScore: 95.0,
                      authorityRank: 1,
                      authorityScore: 99.0
                    }
                  ]
                }
              }
            ]
          },
          entities: {
            create: [
              {
                name: 'Central Bank',
                role: 'Institution',
                type: 'ORGANIZATION',
                status: 'FABRICATED',
                finding: 'Seal used on circular without authority'
              }
            ]
          },
          numericalFacts: {
            create: [
              {
                asPrinted: '₹500',
                refersTo: 'Denomination to be withdrawn',
                actualFinding: 'Still legal tender; no change proposed',
                status: 'FABRICATED'
              }
            ]
          },
          provenance: {
            create: [
              {
                timeLabel: '04:12 IST',
                platform: 'Telegram Forward',
                description: 'Earliest instance with burned-in timestamp overlay',
                status: 'FABRICATED',
                sequenceIndex: 1
              }
            ]
          }
        }
      });

      assert.ok(analysis.id);

      // Verify retrieval with full relational graph
      const detailed = await dbService.findAnalysisById(analysisId, testUser.id);
      assert.ok(detailed, 'Detailed analysis must resolve');
      assert.strictEqual(detailed.claims.length, 1);
      assert.strictEqual(detailed.claims[0].evidenceItems.length, 1);
      assert.strictEqual(detailed.entities.length, 1);
      assert.strictEqual(detailed.numericalFacts.length, 1);
      assert.strictEqual(detailed.provenance.length, 1);
    });

    // ----------------------------------------------------------------
    // Test 6: Cascade Deletion & Tenant Isolation
    // ----------------------------------------------------------------
    await runTest('6. Cascade deletion and tenant isolation boundary', async () => {
      // Create a second isolated user and workspace
      const user2 = await dbService.createUser({
        email: `isolated_user_${Date.now()}@other-org.com`,
        passwordHash: '$2a$10$FakeHashForUser2Only',
        fullName: 'Isolated User',
        company: 'Other Org'
      });

      // User 2 cannot access User 1's analyses
      const user1Analyses = await dbService.listAnalysesByUser(testUser.id);
      assert.ok(user1Analyses.length >= 1);

      const user2Attempt = await dbService.findAnalysisById(user1Analyses[0].id, user2.id);
      assert.strictEqual(user2Attempt, null, 'User 2 MUST NOT be able to view User 1 analysis');

      // User 2 cannot delete User 1 analysis
      const deleteAttempt = await dbService.deleteAnalysisById(user1Analyses[0].id, user2.id);
      assert.strictEqual(deleteAttempt, false, 'User 2 MUST NOT be able to delete User 1 analysis');

      // Delete User 1 analysis by User 1
      const deleteSuccess = await dbService.deleteAnalysisById(user1Analyses[0].id, testUser.id);
      assert.strictEqual(deleteSuccess, true, 'User 1 can delete their own analysis');

      // Verify cascade deleted claims
      const claimsLeft = await prisma.claim.findMany({ where: { analysisId: user1Analyses[0].id } });
      assert.strictEqual(claimsLeft.length, 0, 'Claims must be cascade deleted when analysis is deleted');
    });

  } finally {
    // Cleanup test users
    if (testUser) {
      await prisma.user.deleteMany({ where: { email: testEmail.toLowerCase() } }).catch(() => {});
    }
  }

  console.log('\n================================================================');
  console.log(`🏆 STAGE 14 TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

runStage14DatabaseExpansionTests();
