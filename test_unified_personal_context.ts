import { PersonalContextEngine } from './backend/services/PersonalContextEngine.js';
import { dbService } from './backend/server/db.js';
import { checkAndMemorize, chatWithNexa } from './backend/server/gemini.js';

async function runPersonalContextTestSuite() {
  console.log("=== RUNNING UNIFIED PERSONAL CONTEXT INTELLIGENCE TEST SUITE ===\n");

  const testUserId = "user-1";

  // Reset test user profile for deterministic test runs
  dbService.updateProfile(testUserId, {
    full_name: "Alex T.",
    institution: "Massachusetts Institute of Technology (MIT)",
    field_of_study: "Computer Science & Software Engineering"
  });

  // Test 1: Profile Name Query ("What's my name?")
  const payload1 = PersonalContextEngine.assemblePersonalContext(testUserId, "What's my name?");
  const resp1 = PersonalContextEngine.generateGroundedLocalResponse("What's my name?", payload1);
  console.log(`Test 1 [Profile Name]: "${resp1}"`);
  if (!resp1.includes("Alex T.")) {
    throw new Error(`Test 1 Failed: Expected name 'Alex T.', got '${resp1}'`);
  }
  console.log("✓ PASSED: Test 1 Profile Name Retrieval\n");

  // Test 2: Field of Study Query ("What do I study?")
  const payload2 = PersonalContextEngine.assemblePersonalContext(testUserId, "What do I study?");
  const resp2 = PersonalContextEngine.generateGroundedLocalResponse("What do I study?", payload2);
  console.log(`Test 2 [Field of Study]: "${resp2}"`);
  if (!resp2.toLowerCase().includes("computer science")) {
    throw new Error(`Test 2 Failed: Expected 'Computer Science', got '${resp2}'`);
  }
  console.log("✓ PASSED: Test 2 Field of Study Retrieval\n");

  // Test 3: University Query ("Which university do I attend?")
  const payload3 = PersonalContextEngine.assemblePersonalContext(testUserId, "Which university do I attend?");
  const resp3 = PersonalContextEngine.generateGroundedLocalResponse("Which university do I attend?", payload3);
  console.log(`Test 3 [Institution]: "${resp3}"`);
  if (!resp3.includes("Massachusetts Institute of Technology")) {
    throw new Error(`Test 3 Failed: Expected 'MIT', got '${resp3}'`);
  }
  console.log("✓ PASSED: Test 3 Institution Retrieval\n");

  // Test 4: Explicit Memory Creation ("Remember that my mother's name is Pauline")
  const memoryResult = await checkAndMemorize(testUserId, "Remember that my mother's name is Pauline");
  console.log(`Test 4 [Memory Saved]: "${memoryResult}"`);
  if (!memoryResult || !memoryResult.includes("Pauline")) {
    throw new Error(`Test 4 Failed: Expected saved memory containing 'Pauline', got '${memoryResult}'`);
  }
  console.log("✓ PASSED: Test 4 Memory Creation & Relationship Extraction\n");

  // Test 5: Relationship Retrieval ("Who is Pauline?")
  const payload5 = PersonalContextEngine.assemblePersonalContext(testUserId, "Who is Pauline?");
  const resp5 = PersonalContextEngine.generateGroundedLocalResponse("Who is Pauline?", payload5);
  console.log(`Test 5 [Who is Pauline]: "${resp5}"`);
  if (!resp5.includes("mother")) {
    throw new Error(`Test 5 Failed: Expected 'mother', got '${resp5}'`);
  }
  console.log("✓ PASSED: Test 5 Relationship Query Resolution\n");

  // Test 6: Mother Name Retrieval ("What's my mother's name?")
  const payload6 = PersonalContextEngine.assemblePersonalContext(testUserId, "What's my mother's name?");
  const resp6 = PersonalContextEngine.generateGroundedLocalResponse("What's my mother's name?", payload6);
  console.log(`Test 6 [Mother Name]: "${resp6}"`);
  if (!resp6.includes("Pauline")) {
    throw new Error(`Test 6 Failed: Expected 'Pauline', got '${resp6}'`);
  }
  console.log("✓ PASSED: Test 6 Mother Name Query\n");

  // Test 7: Saved Facts Summary ("What did I tell you about my mother?")
  const payload7 = PersonalContextEngine.assemblePersonalContext(testUserId, "What did I tell you about my mother?");
  const resp7 = PersonalContextEngine.generateGroundedLocalResponse("What did I tell you about my mother?", payload7);
  console.log(`Test 7 [Saved Facts Summary]: "${resp7}"`);
  if (!resp7.includes("Pauline")) {
    throw new Error(`Test 7 Failed: Expected 'Pauline', got '${resp7}'`);
  }
  console.log("✓ PASSED: Test 7 Saved Facts Summary Without Fabrication\n");

  // Test 8: Organizer Schedule Query ("What do I have planned for tomorrow?")
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  dbService.createReminder(testUserId, {
    title: "Submit Software Engineering Lab",
    date: tomorrowStr,
    time: "14:00",
    repeat: "none",
    priority: "high",
    voice_notification: true,
    active: true
  });

  const payload8 = PersonalContextEngine.assemblePersonalContext(testUserId, "What do I have planned for tomorrow?");
  const resp8 = PersonalContextEngine.generateGroundedLocalResponse("What do I have planned for tomorrow?", payload8);
  console.log(`Test 8 [Tomorrow Schedule]: "${resp8}"`);
  if (!resp8.includes("Submit Software Engineering Lab")) {
    throw new Error(`Test 8 Failed: Expected 'Submit Software Engineering Lab', got '${resp8}'`);
  }
  console.log("✓ PASSED: Test 8 Organizer Schedule Retrieval for Tomorrow\n");

  // Test 9: Missing Field Handling
  dbService.updateProfile(testUserId, { institution: "" });
  const payload9 = PersonalContextEngine.assemblePersonalContext(testUserId, "Which university do I attend?");
  const resp9 = PersonalContextEngine.generateGroundedLocalResponse("Which university do I attend?", payload9);
  console.log(`Test 9 [Missing University]: "${resp9}"`);
  if (!resp9.toLowerCase().includes("don't see") && !resp9.toLowerCase().includes("not recorded")) {
    throw new Error(`Test 9 Failed: Expected missing information prompt, got '${resp9}'`);
  }
  // Restore university
  dbService.updateProfile(testUserId, { institution: "Massachusetts Institute of Technology (MIT)" });
  console.log("✓ PASSED: Test 9 Missing Profile Field Handling\n");

  // Test 10: Multi-User Session Data Isolation
  const user2Payload = PersonalContextEngine.assemblePersonalContext("user-2-test", "Who is Pauline?");
  const user2Resp = PersonalContextEngine.generateGroundedLocalResponse("Who is Pauline?", user2Payload);
  console.log(`Test 10 [User 2 Isolation]: "${user2Resp}"`);
  if (user2Resp.includes("mother")) {
    throw new Error(`Test 10 Failed: User 2 accessed User 1's memory of Pauline!`);
  }
  console.log("✓ PASSED: Test 10 Multi-User Session Data Isolation\n");

  console.log("🎉 ALL 10 UNIFIED PERSONAL CONTEXT ENGINE TESTS PASSED PERFECTLY!");
}

runPersonalContextTestSuite().catch(err => {
  console.error("❌ Test Suite Error:", err);
  process.exit(1);
});
