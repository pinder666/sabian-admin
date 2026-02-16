const fs = require('fs');
const missionQueue = JSON.parse(fs.readFileSync('/root/mission_queue.json'));
for (let squad = 0; squad < 10; squad++) {
  const target = missionQueue.targets[squad];
  for (let i = 0; i < 100; i++) {
    const id = squad * 100 + i;
    const child = {
      id: `sabian_${id}`,
      squad,
      target,
      mission: {
        status: 'pending',
        attempts: 0
      },
      generation: 1,
      timestamp: Date.now()
    };
    fs.writeFileSync(`/root/sabians/children/child_sabian_${id}.json`, JSON.stringify(child, null, 2));
    console.log(`✅ Created Smart Sabian ${id}`);
  }
}
