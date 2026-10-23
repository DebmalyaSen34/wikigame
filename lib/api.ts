import { StoreNotConfiguredError } from "./store";

// Wraps a route handler so failures come back as JSON the UI can show, rather
// than an empty 500 page.
export function withErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof StoreNotConfiguredError) {
        return Response.json({ error: e.message }, { status: 503 });
      }
      console.error(e);
      return Response.json({ error: "Something went wrong on the server, try again" }, { status: 500 });
    }
  };
}
