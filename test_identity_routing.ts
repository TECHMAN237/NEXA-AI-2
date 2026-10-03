/**
 * Automated Regression & Verification Suite for Xena AI Identity, Purpose & Capability Intelligence
 * Tests all English & French identity probes, feature inquiries, chatbot comparisons, limitations,
 * follow-up awareness, voice vs. chat mode formatting, and non-regression of real action commands.
 */
import {
  XENA_OFFICIAL_IDENTITY,
  XENA_CAPABILITY_REGISTRY,
  XENA_UNAVAILABLE_CAPABILITIES,
  classifyIdentityOrCapability,
  generateAuthoritativeIdentityResponse,
  buildXenaSystemPrompt
} from './backend/server/XenaIdentity.ts';
import { isSimpleGreeting } from './backend/server/gemini.ts';
import { PersonalContextEngine } from './backend/services/PersonalContextEngine.ts';

interface ProbeTest {
  query: string;
  expectedCategory: string;
  expectedFeatureId?: string;
  expectedLang: 'en' | 'fr';
}

const IDENTITY_PROBES: ProbeTest[] = [
  // English Identity & Name
  { query: "Who are you?", expectedCategory: "identity", expectedLang: "en" },
  { query: "What is your name?", expectedCategory: "name", expectedLang: "en" },
  { query: "What is Xena?", expectedCategory: "identity", expectedLang: "en" },
  { query: "Hi, who are you?", expectedCategory: "identity", expectedLang: "en" },
  { query: "What is your purpose?", expectedCategory: "goal_purpose", expectedLang: "en" },
  { query: "Who are you and what is your goal?", expectedCategory: "identity_and_goal", expectedLang: "en" },
  // English Capabilities & Features
  { query: "What can you do?", expectedCategory: "capabilities", expectedLang: "en" },
  { query: "How can you help me as a student?", expectedCategory: "role", expectedLang: "en" },
  { query: "What features are available in this app?", expectedCategory: "capabilities", expectedLang: "en" },
  { query: "Can you manage my reminders?", expectedCategory: "feature_inquiry", expectedFeatureId: "reminders", expectedLang: "en" },
  { query: "Can you track my exams?", expectedCategory: "feature_inquiry", expectedFeatureId: "study_tracking", expectedLang: "en" },
  { query: "Can you help me organize my schedule?", expectedCategory: "feature_inquiry", expectedFeatureId: "planning", expectedLang: "en" },
  { query: "Can you remember information about me?", expectedCategory: "feature_inquiry", expectedFeatureId: "memory_vault", expectedLang: "en" },
  // English Differentiation, Help & Limitations
  { query: "What is the difference between you and a regular chatbot?", expectedCategory: "differentiation", expectedLang: "en" },
  { query: "How do I use your features?", expectedCategory: "application_help", expectedLang: "en" },
  { query: "What can you not do?", expectedCategory: "limitations", expectedLang: "en" },
  { query: "Can you sync with Google Calendar?", expectedCategory: "limitations", expectedLang: "en" },
  // French Equivalents
  { query: "Qui es-tu ?", expectedCategory: "identity", expectedLang: "fr" },
  { query: "Comment tu t'appelles ?", expectedCategory: "name", expectedLang: "fr" },
  { query: "C'est quoi Xena ?", expectedCategory: "identity", expectedLang: "fr" },
  { query: "Quel est ton rôle ?", expectedCategory: "role", expectedLang: "fr" },
  { query: "Que peux-tu faire ?", expectedCategory: "capabilities", expectedLang: "fr" },
  { query: "Comment peux-tu m'aider comme étudiant ?", expectedCategory: "role", expectedLang: "fr" },
  { query: "Quelles sont les fonctionnalités de cette application ?", expectedCategory: "capabilities", expectedLang: "fr" },
  { query: "Peux-tu gérer mes rappels ?", expectedCategory: "feature_inquiry", expectedFeatureId: "reminders", expectedLang: "fr" },
  { query: "Peux-tu suivre mes examens ?", expectedCategory: "feature_inquiry", expectedFeatureId: "study_tracking", expectedLang: "fr" },
  { query: "Peux-tu te souvenir d'informations sur moi ?", expectedCategory: "feature_inquiry", expectedFeatureId: "memory_vault", expectedLang: "fr" },
  { query: "Quelle est la différence entre toi et un chatbot classique ?", expectedCategory: "differentiation", expectedLang: "fr" },
  { query: "Quelles sont tes limites ?", expectedCategory: "limitations", expectedLang: "fr" },
];

const ACTION_OR_DATA_PROBES = [
  "Remind me tomorrow at 8 AM to review Chemistry",
  "I have an exam on November 15",
  "I have an event on December 31 called Maranatha",
  "Remember that my mother's name is Pauline",
  "What reminders do I have today?",
  "Do I have an event on December 31?",
];

async function runTests() {
  console.log("=== XENA AI IDENTITY & CAPABILITY INTELLIGENCE REGRESSION SUITE ===\n");
  let passed = 0;
  let failed = 0;

  // 1. Verify 10-section System Prompt & Registry Integrity
  const chatPrompt = buildXenaSystemPrompt('full_chat');
  const voicePrompt = buildXenaSystemPrompt('conversational_voice');
  const hasAllSections =
    chatPrompt.includes('1. IDENTITY:') &&
    chatPrompt.includes('2. MISSION:') &&
    chatPrompt.includes('3. VERIFIED CAPABILITIES:') &&
    chatPrompt.includes('4. USER CONTEXT & DATA ISOLATION:') &&
    chatPrompt.includes('5. ACTION EXECUTION RULES') &&
    chatPrompt.includes('6. MISSING-INFORMATION BEHAVIOR:') &&
    chatPrompt.includes('7. ACCURACY, LIMITATIONS & UNCERTAINTY:') &&
    chatPrompt.includes('8. INTERACTION-MODE BEHAVIOR') &&
    chatPrompt.includes('9. RESPONSE STYLE:') &&
    chatPrompt.includes('10. SAFETY & PRIVACY:') &&
    voicePrompt.includes('CONVERSATIONAL VOICE MODE');

  if (hasAllSections && Object.keys(XENA_CAPABILITY_REGISTRY).length >= 7 && XENA_UNAVAILABLE_CAPABILITIES.length >= 3) {
    console.log("[PASS] 10-Section System Prompt & Authoritative Capability Registry verified.");
    passed++;
  } else {
    console.error("[FAIL] System Prompt sections or Capability Registry incomplete.");
    failed++;
  }

  // 2. Test all English & French Identity & Capability Probes
  for (const probe of IDENTITY_PROBES) {
    const res = classifyIdentityOrCapability(probe.query);
    const hijackedByGreeting = isSimpleGreeting(probe.query);
    const chatReply = generateAuthoritativeIdentityResponse(probe.query, "Alex", { mode: "chat" });
    const voiceReply = generateAuthoritativeIdentityResponse(probe.query, "Alex", { mode: "voice" });

    const categoryOk = res.isMatch && res.category === probe.expectedCategory;
    const featureOk = !probe.expectedFeatureId || res.featureId === probe.expectedFeatureId;
    const langOk = res.language === probe.expectedLang;
    const notHijacked = !hijackedByGreeting;
    const voiceConcise = voiceReply.length > 15 && voiceReply.length <= chatReply.length && !voiceReply.includes('**');

    if (categoryOk && featureOk && langOk && notHijacked && voiceConcise) {
      passed++;
      console.log(`[PASS] "${probe.query}" -> category=${res.category}${res.featureId ? ` (${res.featureId})` : ''} [${res.language}]`);
      console.log(`       Voice (${voiceReply.length} chars): ${voiceReply}`);
    } else {
      failed++;
      console.error(`[FAIL] "${probe.query}"`, {
        got: res,
        expectedCategory: probe.expectedCategory,
        expectedFeatureId: probe.expectedFeatureId,
        hijackedByGreeting,
        voiceConcise,
        voiceReply
      });
    }
  }

  // 3. Test Multi-Turn Follow-Up Awareness ("What about my exams?" after "Who are you?")
  const historyAfterIdentity = [
    { sender: 'user', text: 'Who are you?' },
    { sender: 'assistant', text: generateAuthoritativeIdentityResponse('Who are you?', 'Alex', { mode: 'chat' }) }
  ];
  const followUpRes = classifyIdentityOrCapability("What about my exams?", historyAfterIdentity);
  if (followUpRes.isMatch && followUpRes.category === 'feature_inquiry' && followUpRes.featureId === 'study_tracking') {
    passed++;
    console.log(`[PASS] Multi-turn follow-up "What about my exams?" after identity turn -> feature_inquiry (study_tracking)`);
  } else {
    failed++;
    console.error(`[FAIL] Multi-turn follow-up failed:`, followUpRes);
  }

  // 4. Test Action & Personal Data Probes are NOT hijacked by Identity Classifier
  for (const actionQuery of ACTION_OR_DATA_PROBES) {
    const res = classifyIdentityOrCapability(actionQuery);
    if (!res.isMatch) {
      passed++;
      console.log(`[PASS] Action/Data query NOT hijacked by identity classifier: "${actionQuery}"`);
    } else {
      failed++;
      console.error(`[FAIL] Action/Data query falsely matched as identity: "${actionQuery}" ->`, res);
    }
  }

  // 5. Test PersonalContextEngine Guard (never dumps "My Items" on identity/capability query)
  const groundedIdentity = PersonalContextEngine.generateGroundedLocalResponse('What can you do?', {} as any);
  if (groundedIdentity.includes('Xena') && !groundedIdentity.includes('My Items:')) {
    passed++;
    console.log(`[PASS] PersonalContextEngine guard returns authoritative capability response instead of raw item dump.`);
  } else {
    failed++;
    console.error(`[FAIL] PersonalContextEngine guard failed:`, groundedIdentity);
  }

  console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
