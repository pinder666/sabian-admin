module.exports = async function () {
  return {
    source: "process_bottlenecks", // test
    data: Array.from({ length: 3 }, () => ({
      company: `TestCorp${Math.floor(Math.random() * 1000)}`,
      indicator: "bottleneck", // change per file
      value: Math.floor(Math.random() * 1000000),
      fiscal_period: "Q2 2024",
      date: new Date().toISOString().split("T")[0],
      source_url: "N/A",
      currency: "USD"
    }))
  };
};
