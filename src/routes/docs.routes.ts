import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../docs/openapi.js";

export const docsRouter = Router();

// Raw OpenAPI file, can be imported in Insomnia or Postman
docsRouter.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

docsRouter.use("/", swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: "Support Ticket API" }));
