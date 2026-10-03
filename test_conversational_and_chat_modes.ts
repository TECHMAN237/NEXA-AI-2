import { chatWithXenaLive, chatWithXena } from './backend/server/gemini.js';
import { dbService } from './backend/server/db.js';

async function runTests() {
  console.log("=================================================================");
  console.log("  XENA AI — CONVERSATIONAL MODE VS CHAT MODE TEST SUITE");
  console.log("=================================================================");

  const userId = "test_conv_user";
  const user = dbService.createUser("test_conv@example.com", "Alex Student");
  const conv = dbService.createNewConversation(userId);

  // Test 1: Conversational Greeting
  console.log('\n--- TEST 1: Conversational Greeting ---');
  const greetingReply = await chatWithXenaLive(userId, conv.id, "Hi");
  console.log('User: "Hi"');
  console.log('Xena (Conversational):', greetingReply);
  if (greetingReply.length < 150 && !greetingReply.includes('##')) {
    console.log('✓ PASS: Short, natural greeting without markdown clutter.');
  } else {
    console.log('✗ FAIL: Greeting was too long or contained markdown.');
  }

  // Test 2: Conversational Identity
  console.log('\n--- TEST 2: Conversational Identity ---');
  const identityReply = await chatWithXenaLive(userId, conv.id, "Who are you?");
  console.log('User: "Who are you?"');
  console.log('Xena (Conversational):', identityReply);
  if (identityReply.toLowerCase().includes('xena') && identityReply.length < 220 && !identityReply.includes('##')) {
    console.log('✓ PASS: Concise, accurate identity response.');
  } else {
    console.log('✗ FAIL: Identity response issue.');
  }

  // Test 3: Simple Academic Comparison (Java vs Python) in Conversational Mode
  console.log('\n--- TEST 3: Concise Comparison in Conversational Mode ---');
  const compReply = await chatWithXenaLive(userId, conv.id, "What's the difference between Java and Python?");
  console.log('User: "What\'s the difference between Java and Python?"');
  console.log('Xena (Conversational):', compReply);
  if (compReply.length < 350 && !compReply.includes('|') && !compReply.includes('##')) {
    console.log('✓ PASS: Concise 1-2 sentence spoken comparison.');
  } else {
    console.log('✗ FAIL: Comparison contained tables or was too lengthy.');
  }

  // Record into history to test multi-turn progressive expansion
  dbService.createMessage(conv.id, { sender: 'user', text: "Explain APIs.", type: 'voice' });
  const apiReply = await chatWithXenaLive(userId, conv.id, "Explain APIs.");
  dbService.createMessage(conv.id, { sender: 'assistant', text: apiReply, type: 'voice' });
  console.log('\n--- TEST 4: Initial Concept (APIs) ---');
  console.log('User: "Explain APIs."');
  console.log('Xena (Conversational):', apiReply);

  // Test 5: Contextual Follow-up Progressive Expansion
  console.log('\n--- TEST 5: Context-Aware Progressive Expansion ---');
  dbService.createMessage(conv.id, { sender: 'user', text: "Can you explain that in more detail?", type: 'voice' });
  const expandReply = await chatWithXenaLive(userId, conv.id, "Can you explain that in more detail?");
  dbService.createMessage(conv.id, { sender: 'assistant', text: expandReply, type: 'voice' });
  console.log('User: "Can you explain that in more detail?"');
  console.log('Xena (Conversational):', expandReply);
  if (expandReply.toLowerCase().includes('api') || expandReply.toLowerCase().includes('application') || expandReply.toLowerCase().includes('request') || expandReply.toLowerCase().includes('data')) {
    console.log('✓ PASS: Progressive expansion connected directly to previous turn context.');
  } else {
    console.log('✗ FAIL: Context was lost on follow-up.');
  }

  // Test 6: Standard Chat Mode provides structured rich Markdown
  console.log('\n--- TEST 6: Standard Chat Mode Rich Formatting ---');
  const chatReply = await chatWithXena(userId, conv.id, "Explain APIs in detail and give me a summary table");
  console.log('User: "Explain APIs in detail and give me a summary table"');
  console.log('Xena (Standard Chat):\n', chatReply);
  if (chatReply.includes('##') || chatReply.includes('**') || chatReply.includes('-') || chatReply.includes('|')) {
    console.log('✓ PASS: Standard Chat mode produces rich structured formatting as intended.');
  } else {
    console.log('✗ FAIL: Chat mode lacked structured formatting.');
  }

  // Test 7: New Conversation isolation and persistence
  console.log('\n--- TEST 7: New Conversation Creation & Persistence ---');
  const newConv = dbService.createNewConversation(userId);
  const newMessages = dbService.getMessages(newConv.id);
  console.log('New Conversation ID:', newConv.id, 'Messages count:', newMessages.length);
  const allUserConvs = dbService.getConversations(userId);
  console.log('Total user conversations persisted:', allUserConvs.length);
  if (newMessages.length === 0 && allUserConvs.length >= 2) {
    console.log('✓ PASS: New conversation created clean while preserving historical conversations.');
  } else {
    console.log('✗ FAIL: Conversation isolation failed.');
  }

  console.log("\n=================================================================");
  console.log("  ALL CONVERSATIONAL & FULL CHAT NAVIGATION TESTS COMPLETE");
  console.log("=================================================================\n");
}

runTests().catch(console.error);
