import { routeUserIntent } from './backend/server/gemini.js';
import { dbService } from './backend/server/db.js';

async function run() {
  const res = await routeUserIntent("I have an event this Sunday at 3 PM. The event is called Majestical Night.", []);
  console.log(JSON.stringify(res, null, 2));
}
run();
