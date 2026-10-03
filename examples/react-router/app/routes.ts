import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("todos", "routes/todos.tsx"),
  route("slow", "routes/slow.tsx"),
] satisfies RouteConfig;
