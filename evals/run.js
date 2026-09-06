import fs from "node:fs/promises";

const cases = JSON.parse(
  await fs.readFile(
    new URL("./cases.json", import.meta.url),
    "utf8"
  )
);

const results = [];

for (const testCase of cases) {
  console.log(`Running case ${testCase.id}...`);

  try {
    const response = await fetch("http://localhost:3000/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: testCase.text,
      }),
    });

    const actual = await response.json();

    results.push({
      id: testCase.id,
      expected: testCase.expected,
      actual,
      status: response.status,
    });
  } catch (error) {
    results.push({
      id: testCase.id,
      expected: testCase.expected,
      actual: null,
      status: null,
      error: error.message,
    });
  }
}

const fields = [
  "name",
  "most_recent_title",
  "years_experience",
  "education_level",
  "needs_review",
];

function fieldsMatch(expected, actual) {
  if (!actual) {
    return false;
  }

  return fields.every(
    (field) => expected[field] === actual[field]
  );
}

function getFailedFields(expected, actual) {
  if (!actual) {
    return [...fields];
  }

  return fields.filter(
    (field) => expected[field] !== actual[field]
  );
}

let passedCases = 0;

const fieldStats = Object.fromEntries(
  fields.map((field) => [
    field,
    {
      passed: 0,
      total: cases.length,
    },
  ])
);

for (const result of results) {
  const pass = fieldsMatch(result.expected, result.actual);
  const failedFields = getFailedFields(
    result.expected,
    result.actual
  );

  if (pass) {
    passedCases++;
    console.log(`Case ${result.id}: PASS`);
  } else {
    console.log(`Case ${result.id}: FAIL`);

    if (result.status !== 200) {
      console.log(`HTTP status: ${result.status}`);
    }

    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    console.log("Failed fields:", failedFields);

    console.log("Expected:", result.expected);
    console.log("Actual:", result.actual);
  }

  for (const field of fields) {
    if (
      result.actual &&
      result.expected[field] === result.actual[field]
    ) {
      fieldStats[field].passed++;
    }
  }
}

const caseScore = (passedCases / cases.length) * 100;

console.log("");
console.log("================================");
console.log("EVALUATION RESULTS");
console.log("================================");

console.log(`Full cases: ${passedCases}/${cases.length}`);
console.log(`Case score: ${caseScore.toFixed(1)}%`);

console.log("");
console.log("FIELD ACCURACY");

for (const field of fields) {
  const stats = fieldStats[field];
  const score = (stats.passed / stats.total) * 100;

  console.log(
    `${field}: ${stats.passed}/${stats.total} (${score.toFixed(1)}%)`
  );
}

console.log("================================");