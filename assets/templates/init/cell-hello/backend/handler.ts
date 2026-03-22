import { handle } from "hono/aws-lambda";
import { createAppForBackend } from "./app";

const app = createAppForBackend(process.env as Record<string, string>);

export const handler = handle(app);
