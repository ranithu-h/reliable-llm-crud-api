import { retryWithBackoff } from "./retry.js";

let attempts = 0;

const result = await retryWithBackoff(async () => {
  attempts++;

  console.log(`Attempt ${attempts}`);

  if (attempts === 1) {
    const error = new Error("Rate limited");
    error.status = 429;
    error.headers = {
      "retry-after": "2",
    };
    throw error;
  }

  return "success";
});

console.log("Result:", result);