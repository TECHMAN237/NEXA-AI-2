import { DailyScheduleEngine } from './backend/services/DailyScheduleEngine.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASSED: ${message}`);
}

console.log('\n=== RUNNING XENA INTELLIGENT DAILY PLANNING TEST SUITE ===\n');

// TEST 1: Fixed start time with explicit duration
{
  const text = "I need to dance at 6:48 AM for one hour.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  assert(constraints.length === 1, "Test 1: Extracted exactly 1 task");
  assert(constraints[0].title === 'Dance', `Test 1: Title is clean 'Dance', got '${constraints[0].title}'`);
  assert(constraints[0].fixedStartTimeStr === '06:48', `Test 1: Fixed time is 06:48, got ${constraints[0].fixedStartTimeStr}`);
  assert(constraints[0].durationMinutes === 60, `Test 1: Duration is 60 mins, got ${constraints[0].durationMinutes}`);

  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(sched.success, "Test 1: Scheduling succeeded");
  assert(sched.timeline.length === 1, "Test 1: Exactly 1 block scheduled");
  assert(sched.timeline[0].startTime === '06:48', `Test 1: Start time is 06:48, got ${sched.timeline[0].startTime}`);
  assert(sched.timeline[0].endTime === '07:48', `Test 1: End time is 07:48, got ${sched.timeline[0].endTime}`);
  assert(sched.cleanPlanSummary.includes('- Dance'), "Test 1: Clean summary contains '- Dance'");
  assert(!sched.cleanPlanSummary.includes('06:48'), "Test 1: Clean summary does not contain raw time ranges");
}

// TEST 2: Multiple fixed and flexible activities (Scenario A & Main User Example)
{
  const text = "Help me plan my day. I need to dance at 6:48 AM for one hour. I want to exercise for two hours, but I can choose the time. I need to study at 3 PM for two hours. I also have to go to the market at 6 PM for one hour.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  assert(constraints.length === 4, `Test 2: Extracted 4 tasks, got ${constraints.length}`);
  
  const dance = constraints.find(c => c.title === 'Dance');
  const exercise = constraints.find(c => c.title === 'Exercise');
  const study = constraints.find(c => c.title === 'Study');
  const market = constraints.find(c => c.title.toLowerCase().includes('market'));

  assert(!!dance && dance.fixedStartTimeStr === '06:48' && dance.durationMinutes === 60, "Test 2: Dance constraint correct");
  assert(!!exercise && exercise.isFlexible && exercise.durationMinutes === 120, "Test 2: Exercise constraint correct (flexible 2h)");
  assert(!!study && study.fixedStartTimeStr === '15:00' && study.durationMinutes === 120, "Test 2: Study constraint correct (15:00 2h)");
  assert(!!market && market.fixedStartTimeStr === '18:00' && market.durationMinutes === 60, "Test 2: Market constraint correct (18:00 1h)");

  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(sched.success, "Test 2: Plan scheduling succeeded");
  assert(sched.timeline.length === 4, `Test 2: Scheduled all 4 blocks, got ${sched.timeline.length}`);

  // Check invariants:
  // Dance: 06:48 - 07:48
  const blockDance = sched.timeline.find(b => b.title === 'Dance')!;
  assert(blockDance.startTime === '06:48' && blockDance.endTime === '07:48', `Test 2: Dance 06:48-07:48, got ${blockDance.time}`);

  // Study: 15:00 - 17:00
  const blockStudy = sched.timeline.find(b => b.title === 'Study')!;
  assert(blockStudy.startTime === '15:00' && blockStudy.endTime === '17:00', `Test 2: Study 15:00-17:00, got ${blockStudy.time}`);

  // Market: 18:00 - 19:00
  const blockMarket = sched.timeline.find(b => b.title.toLowerCase().includes('market'))!;
  assert(blockMarket.startTime === '18:00' && blockMarket.endTime === '19:00', `Test 2: Market 18:00-19:00, got ${blockMarket.time}`);

  // Exercise: placed in free gap without overlapping Dance, Study, or Market
  const blockExercise = sched.timeline.find(b => b.title === 'Exercise')!;
  assert(blockExercise.durationMinutes === 120, `Test 2: Exercise preserves 120 mins duration, got ${blockExercise.durationMinutes}`);
  assert(blockExercise.endMinutes <= 15 * 60 || blockExercise.startMinutes >= 19 * 60, "Test 2: Exercise placed without overlap");

  // Verify chronological order
  for (let i = 0; i < sched.timeline.length - 1; i++) {
    assert(sched.timeline[i].startMinutes <= sched.timeline[i + 1].startMinutes, "Test 2: Timeline is sorted chronologically");
    assert(sched.timeline[i].endMinutes <= sched.timeline[i + 1].startMinutes, "Test 2: No overlapping blocks in timeline");
  }

  // Verify clean presentation
  assert(sched.cleanPlanSummary.includes('- Dance'), "Test 2: Summary contains '- Dance'");
  assert(sched.cleanPlanSummary.includes('- Exercise'), "Test 2: Summary contains '- Exercise'");
  assert(sched.cleanPlanSummary.includes('- Study'), "Test 2: Summary contains '- Study'");
}

// TEST 3: Hard conflict detection between two fixed-time commitments (Scenario B)
{
  const text = "Schedule my mathematics revision from 8 AM to 11 AM and a meeting at 10 AM.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  assert(constraints.length === 2, `Test 3: Extracted 2 tasks, got ${constraints.length}`);

  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(!sched.success, "Test 3: Sched returned success=false on conflict");
  assert(sched.hasConflict, "Test 3: Conflict detected flag is true");
  assert(sched.conflictReport !== undefined, "Test 3: Conflict report generated");
  assert(sched.clarificationMessage!.includes('Mathematics Revision') && sched.clarificationMessage!.includes('Meeting'), 
    `Test 3: Clarification message explains conflict clearly: "${sched.clarificationMessage}"`);
}

// TEST 4: Conflict with existing calendar event
{
  const existingEvents = [
    { title: "Department Lecture", time: "10:00", duration_hours: 1.5 } // 10:00 - 11:30
  ];
  const text = "Plan my day. I have a team sync at 10:30 AM for one hour.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, existingEvents, '2026-10-03');
  assert(sched.hasConflict, "Test 4: Detected collision with existing calendar event");
  assert(sched.clarificationMessage!.includes('Department Lecture'), "Test 4: Clarification mentions existing calendar event");
}

// TEST 5: Deadline-constrained task
{
  const text = "I have a meeting at 2 PM for one hour. I must finish my assignment before 5 PM for two hours.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(sched.success, "Test 5: Deadline scheduling succeeded");
  const assignBlock = sched.timeline.find(b => b.title.toLowerCase().includes('assignment'))!;
  assert(!!assignBlock, "Test 5: Assignment scheduled");
  assert(assignBlock.endMinutes <= 17 * 60, `Test 5: Assignment ends before 17:00 deadline, got ${assignBlock.endTime}`);
  assert(assignBlock.durationMinutes === 120, "Test 5: Assignment duration is 120 mins");
}

// TEST 6: Priority-aware scheduling without overriding fixed constraints
{
  const text = "I have to study at 8 AM for two hours. I need to go shopping at 1 PM for one hour. My most important task is to prepare for my exam for three hours.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  const examTask = constraints.find(c => c.title.toLowerCase().includes('exam'))!;
  assert(examTask.priority === 'high', "Test 6: Exam task detected as high priority");

  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(sched.success, "Test 6: Scheduling succeeded");
  const studyBlock = sched.timeline.find(b => b.title.toLowerCase().includes('study'))!;
  const shoppingBlock = sched.timeline.find(b => b.title.toLowerCase().includes('shopping'))!;
  const examBlock = sched.timeline.find(b => b.title.toLowerCase().includes('exam'))!;

  assert(studyBlock.startTime === '08:00' && studyBlock.endTime === '10:00', "Test 6: Fixed 8 AM study preserved");
  assert(shoppingBlock.startTime === '13:00' && shoppingBlock.endTime === '14:00', "Test 6: Fixed 1 PM shopping preserved");
  assert(examBlock.durationMinutes === 180, "Test 6: 3 hours exam prep preserved");
  assert(examBlock.endMinutes <= 13 * 60 || examBlock.startMinutes >= 14 * 60, "Test 6: Exam prep placed in open window without conflict");
}

// TEST 7: French natural language request
{
  const text = "Aide-moi à planifier ma journée. Je dois danser à 6h48 pendant une heure. Je veux faire du sport pendant deux heures. Je dois réviser à 15h pendant deux heures et aller au marché à 18h pendant une heure.";
  const constraints = DailyScheduleEngine.parseTaskConstraints(text, '2026-10-03');
  assert(constraints.length === 4, `Test 7: Extracted 4 French tasks, got ${constraints.length}`);
  const sched = DailyScheduleEngine.scheduleDailyPlan(constraints, [], '2026-10-03');
  assert(sched.success, "Test 7: French daily plan scheduled successfully");
  assert(sched.timeline.length === 4, "Test 7: All 4 French tasks scheduled");
}

console.log('\n🎉 ALL 7 SCHEDULING TESTS PASSED PERFECTLY!\n');
