import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
  ip?: string;
};

// Gives access to the current request from anywhere in the code, without passing it around
const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T) {
  return storage.run(context, callback);
}

export function getRequestContext() {
  return storage.getStore();
}
