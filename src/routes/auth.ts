import { Hono } from "hono";
import { login, logout } from "../auth";
import type { AppContext } from "./context";

export const authRoutes = new Hono<{ Bindings: Env }>();
authRoutes.post("/login", (c) => login(c));
authRoutes.post("/logout", (c) => logout(c));
