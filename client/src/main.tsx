import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();
// Independent-app auth: no global redirect to any OAuth login. Each app
// (customer / owner) renders its own sign-in page when unauthenticated.

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Query Error]", event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    console.error("[API Mutation Error]", event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const res = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
        // Guard against non-JSON responses (e.g. an HTML error page served by
        // the edge proxy during a deployment rollout or a mis-routed request).
        // Without this, tRPC's JSON parser throws the cryptic "Unexpected
        // token '<', "<!doctype "... is not valid JSON" error.
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("json") && !ct.includes("text/plain")) {
          const text = await res.text().catch(() => "");
          const msg = text.startsWith("<!doctype")
            ? `The server returned an HTML page instead of JSON (HTTP ${res.status}). This usually happens during a short deployment rollout — refreshing the page typically fixes it.`
            : `The server returned a non-JSON response (HTTP ${res.status}, ${ct}). Response: ${text.slice(0, 100)}`;
          throw new Error(`[tRPC] ${msg}`);
        }
        return res;
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
