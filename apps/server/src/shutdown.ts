// Resolves on the first SIGTERM or SIGINT. Docker sends SIGTERM to PID 1 (node, in the image) on
// `docker compose stop`, then SIGKILL after the service's stop grace period.

export function waitForSignal(): { signal: Promise<NodeJS.Signals>; dispose: () => void } {
  let dispose = () => {};
  const signal = new Promise<NodeJS.Signals>((resolve) => {
    const onSignal = (name: NodeJS.Signals) => {
      dispose();
      resolve(name);
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    dispose = () => {
      process.off('SIGTERM', onSignal);
      process.off('SIGINT', onSignal);
    };
  });
  return { signal, dispose };
}
