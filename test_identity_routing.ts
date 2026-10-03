import { classifyIdentityOrCapability, generateAuthoritativeIdentityResponse, isQuestionOrInquiry, XENA_OFFICIAL_IDENTITY, XENA_CAPABILITY_REGISTRY } from './backend/server/XenaIdentity.js';
import { parseEventFollowUpUpdate, parseFollowUpUpdate } from './backend/utils/reminderParser.js';
import { routeUserIntent } from './backend/server/gemini.js';
import { dbService } from './backend/server/db.js';
import { ServerActionEngine } from './backend/server/ServerActionEngine.js';

interface TestCase {
  name: string;
  input: string;
  expectedCategory?: string;
  isIdentityQuery: boolean;
  shouldExecuteTool: boolean;
  expectedToolIntent?: string;
}

const testCases: TestCase[] = [
  {
    name: "T1: Simple greeting",
    input: "Hi",
    isIdentityQuery: false,
    shouldExecuteTool: false
  },
  {
    name: "T2: Exact bug prompt (uppercase)",
    input: "WHO ARE YOU AND WHAT IS YOUR GOAL?",
    expectedCategory: "identity_and_goal",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T3: Standard identity inquiry",
    input: "Who are you?",
    expectedCategory: "identity",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T4: Purpose and goal question",
    input: "What is your goal?",
    expectedCategory: "goal_purpose",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T5: Capabilities question",
    input: "What can you do?",
    expectedCategory: "capabilities",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T6: Capability / clarification question",
    input: "Can you update my event?",
    expectedCategory: "capabilities",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T7: Application guidance",
    input: "Explain event management",
    expectedCategory: "application_help",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T8: Action request with verified location",
    input: "Update my event location to the library",
    isIdentityQuery: false,
    shouldExecuteTool: true,
    expectedToolIntent: "EVENT"
  },
  {
    name: "T9: Role clarification",
    input: "I am asking what your role is",
    expectedCategory: "role",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T10: French identity question",
    input: "Présente-toi",
    expectedCategory: "identity",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T11: French purpose question",
    input: "Quel est ton objectif dans cette application ?",
    expectedCategory: "goal_purpose",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T12: French capability question",
    input: "Tu peux faire quoi pour mes études ?",
    expectedCategory: "capabilities",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T13: French application guidance",
    input: "Explique-moi comment fonctionnent tes rappels",
    expectedCategory: "application_help",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T14: Chatbot inquiry",
    input: "Are you just a chatbot?",
    expectedCategory: "capabilities",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T15: Student help inquiry",
    input: "How can you help me as a student?",
    expectedCategory: "capabilities",
    isIdentityQuery: true,
    shouldExecuteTool: false
  },
  {
    name: "T16: Informal / speech typo inquiry",
    input: "who r u and whats ur purpose??",
    expectedCategory: "identity_and_goal",
    isIdentityQuery: true,
    shouldExecuteTool: false
  }
];

async function runTestSuite() {
  console.log("=================================================================");
  console.log("  XENA AI — IDENTITY, ROLE CLARITY & INTENT REGRESSION TEST SUITE");
  console.log("=================================================================\n");

  let passed = 0;
  let failed = 0;

  // Mock incomplete event in DB to simulate the exact bug condition
  const mockEvent = {
    id: "event-test-incomplete",
    user_id: "user-test",
    title: "Majestical Night",
    date: "2026-10-04",
    time: "15:00",
    location: "Not specified"
  };

  for (const t of testCases) {
    process.stdout.write(`Testing: ${t.name} -> "${t.input}" ... `);

    // 1. Semantic classification check
    const classification = classifyIdentityOrCapability(t.input);

    if (t.isIdentityQuery) {
      if (!classification.isMatch) {
        console.error(`FAILED: Expected isMatch=true, got false`);
        failed++;
        continue;
      }
      if (t.expectedCategory && classification.category !== t.expectedCategory) {
        console.error(`FAILED: Expected category=${t.expectedCategory}, got ${classification.category}`);
        failed++;
        continue;
      }
    }

    // 2. Safety check against event follow-up parser
    const eventFollowUp = parseEventFollowUpUpdate(t.input, mockEvent);
    if (!t.shouldExecuteTool && eventFollowUp !== null) {
      console.error(`FAILED: Non-action query falsely triggered event follow-up:`, eventFollowUp);
      failed++;
      continue;
    }

    // 3. Safety check against reminder follow-up parser
    const reminderFollowUp = parseFollowUpUpdate(t.input, { id: "rem-1", title: "Pay Bill" });
    if (!t.shouldExecuteTool && reminderFollowUp !== null) {
      console.error(`FAILED: Non-action query falsely triggered reminder follow-up:`, reminderFollowUp);
      failed++;
      continue;
    }

    // 4. Intent router check
    const routedIntent = await routeUserIntent(t.input);
    if (t.isIdentityQuery) {
      if (routedIntent.intent !== 'NORMAL_CHAT') {
        console.error(`FAILED: Expected intent=NORMAL_CHAT, got ${routedIntent.intent}`);
        failed++;
        continue;
      }
      const hasAction = routedIntent.actions?.some(a => a.action !== 'NO_OP');
      if (hasAction) {
        console.error(`FAILED: Identity query generated non-NO_OP action:`, routedIntent.actions);
        failed++;
        continue;
      }
    }

    // 5. Response generation check
    if (t.isIdentityQuery) {
      const response = generateAuthoritativeIdentityResponse(t.input);
      if (!response || response.trim().length < 20) {
        console.error(`FAILED: Empty or invalid identity response generated`);
        failed++;
        continue;
      }
      // Assert Xena identifies itself as student companion
      if (classification.language === 'fr') {
        if (!response.includes("Xena AI") || !response.includes("études")) {
          console.error(`FAILED: French response missing Xena identity: ${response}`);
          failed++;
          continue;
        }
      } else {
        if (!response.includes("Xena AI") || !response.includes("student companion")) {
          console.error(`FAILED: English response missing Xena student companion identity: ${response}`);
          failed++;
          continue;
        }
      }
    }

    console.log(`PASSED ✓`);
    passed++;
  }

  // TEST CASE: Pending draft isolation
  console.log(`\nTesting: Pending draft isolation when asking identity questions... `);
  const testUserId = "user-regression-test";
  ServerActionEngine.setPendingDraft(testUserId, {
    userId: testUserId,
    intent: 'REMINDER',
    data: { title: "Study Physics", date: "2026-10-04" },
    missingFields: ['time'],
    createdAt: Date.now()
  });

  // Verify draft exists
  let storedDraft = ServerActionEngine.getPendingDraft(testUserId);
  if (!storedDraft || storedDraft.data.title !== "Study Physics") {
    console.error("FAILED: Failed to set pending draft for test");
    failed++;
  } else {
    // User asks "WHO ARE YOU AND WHAT IS YOUR GOAL?"
    const draftResolution = await ServerActionEngine.resolvePendingDraft(testUserId, "WHO ARE YOU AND WHAT IS YOUR GOAL?");
    // It must NOT resolve the draft into a time or title!
    if (draftResolution !== null) {
      console.error("FAILED: Pending draft was falsely resolved by identity question:", draftResolution);
      failed++;
    } else {
      // Draft should still be preserved
      storedDraft = ServerActionEngine.getPendingDraft(testUserId);
      if (storedDraft) {
        console.log("PASSED ✓ (Pending draft preserved unharmed)");
        passed++;
      } else {
        console.error("FAILED: Pending draft was erroneously deleted");
        failed++;
      }
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  REGRESSION TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log(`=================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
