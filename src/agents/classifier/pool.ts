import pLimit from 'p-limit';

/**
 * Ejecuta `worker` sobre todos los `items` con concurrencia limitada, aislando los fallos:
 * usa `Promise.allSettled`, así un item que falla no aborta el lote. El orden de la salida
 * coincide con el de la entrada.
 */
export async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  worker: (item: Input, index: number) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> {
  const limit = pLimit(Math.max(1, Math.floor(concurrency)));
  const tasks = items.map((item, index) => limit(() => worker(item, index)));
  return Promise.allSettled(tasks);
}
