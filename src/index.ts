export interface Env {
  DB: D1Database;
}

export default {
  fetch(_request: Request, _env: Env): Response {
    return Response.json({
      name: "Plantory",
      status: "ok",
    });
  },
};
