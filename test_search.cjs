const { rotateLLM } = require('./together_search.cjs');


(async () => {
  const result = await rotateLLM({
    task: 'search',
    query: 'How will AI impact global trade in 2030?'
  });

  console.log('\n🧠 Sabian Search Result:\n', result);
})();
