const fetch = require('node-fetch');

async function main() {
  const userId = 'test_user_123';
  
  // Test 1: I have an event this Sunday at 3 PM. The event is called Majestical Night.
  let res = await fetch('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer ' + userId },
    body: JSON.stringify({ text: "I have an event this Sunday at 3 PM. The event is called Majestical Night." })
  });
  console.log(await res.json());

  // Test 2: Save the event I just told you.
  res = await fetch('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer ' + userId },
    body: JSON.stringify({ text: "Save the event I just told you." })
  });
  console.log(await res.json());
  
  // Test 3: I want you to create me a reminder, can you do that?
  res = await fetch('http://127.0.0.1:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authorization': 'Bearer ' + userId },
    body: JSON.stringify({ text: "I want you to create me a reminder, can you do that?" })
  });
  console.log(await res.json());
}
main();
