// Worker bridge offloads expensive AI/path generation away from the main thread.
export class WorkerBridge {
  constructor() {
    this.aiWorker = new Worker(new URL('../../workers/aiWorker.js', import.meta.url), { type: 'module' });
    this.pathWorker = new Worker(new URL('../../workers/pathWorker.js', import.meta.url), { type: 'module' });

    this.aiResult = null;
    this.pathResult = null;

    this.aiWorker.onmessage = (event) => {
      this.aiResult = event.data;
    };

    this.pathWorker.onmessage = (event) => {
      this.pathResult = event.data;
    };
  }

  requestAiSnapshot(payload) {
    this.aiWorker.postMessage(payload);
  }

  requestPath(payload) {
    this.pathWorker.postMessage(payload);
  }

  dispose() {
    this.aiWorker.terminate();
    this.pathWorker.terminate();
  }
}
