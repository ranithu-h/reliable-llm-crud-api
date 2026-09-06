export function isRetryableError(error) {
  const status = error.status ?? error.statusCode;

  return (
    error.message === "Request timed out." ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff(operation) {
  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableError(error) || attempt === delays.length) {
        throw error;
      }

      const retryAfter = error.headers?.["retry-after"];

      let delay;

      if (retryAfter) {
        delay = Number(retryAfter) * 1000;
      } else {
        const baseDelay = delays[attempt];
        const jitter = Math.random() * 500;
        delay = baseDelay + jitter;
      }

      console.log(`Retrying after ${Math.round(delay)}ms...`);

      await sleep(delay);
    }
  }
}