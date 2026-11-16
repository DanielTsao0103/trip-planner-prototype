import { handleInbound } from "./handler.ts";

Deno.serve((request: Request) =>
  handleInbound(request, (key) => Deno.env.get(key)),
);
