import request from "supertest";
import { createApp } from "../src/server/app.js";
import {
  InMemoryProductCatalogue,
  type ProductCatalogue,
} from "../src/server/catalogue.js";
import type { Logger } from "../src/server/logger.js";

const silentLogger: Logger = { log: () => undefined };

describe("product API", () => {
  it("exposes liveness and catalogue-backed readiness", async () => {
    const catalogue = new InMemoryProductCatalogue();
    const app = createApp({ catalogue, logger: silentLogger });

    await request(app).get("/health").expect(200, { status: "healthy" });
    await request(app).get("/ready").expect(200, { status: "ready" });
  });

  it("returns 503 when the catalogue is unavailable", async () => {
    const catalogue = new InMemoryProductCatalogue();
    catalogue.checkHealth = () => Promise.reject(new Error("secret details"));
    const app = createApp({ catalogue, logger: silentLogger });

    const response = await request(app).get("/ready").expect(503);
    expect(response.text).not.toContain("secret details");
    expect(response.body.error.code).toBe("CATALOGUE_UNAVAILABLE");
  });

  it("lists, searches, and filters deterministic products", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });

    const list = await request(app).get("/api/products").expect(200);
    expect(list.body.total).toBe(8);
    expect(list.body.categories).toEqual(["home", "outdoors", "office", "kitchen"]);

    const filtered = await request(app)
      .get("/api/products?q=lamp&category=office")
      .expect(200);
    expect(filtered.body).toMatchObject({
      total: 1,
      query: { q: "lamp", category: "office" },
      items: [{ id: "aurora-desk-lamp" }],
    });
  });

  it("forwards sorting, echoes explicit values, and preserves the default order", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });

    const ascending = await request(app)
      .get("/api/products?sort=price-asc")
      .expect(200);
    expect(ascending.body).toMatchObject({
      query: { q: "", sort: "price-asc" },
      items: [
        { id: "harbor-catchall-tray" },
        { id: "papertrail-notebook-set" },
        { id: "nesting-prep-bowls" },
        { id: "trailmark-bottle" },
        { id: "aurora-desk-lamp" },
        { id: "cloudrest-throw" },
        { id: "tideline-picnic-blanket" },
        { id: "emberline-kettle" },
      ],
    });

    const descendingFiltered = await request(app)
      .get("/api/products?q=a&category=outdoors&sort=price-desc")
      .expect(200);
    expect(descendingFiltered.body).toMatchObject({
      total: 2,
      query: { q: "a", category: "outdoors", sort: "price-desc" },
      items: [
        { id: "tideline-picnic-blanket" },
        { id: "trailmark-bottle" },
      ],
    });

    const defaultOrder = await request(app).get("/api/products").expect(200);
    expect(defaultOrder.body.query).toEqual({ q: "" });
    expect(defaultOrder.body.items.map((product: { id: string }) => product.id)).toEqual([
      "aurora-desk-lamp",
      "cloudrest-throw",
      "trailmark-bottle",
      "tideline-picnic-blanket",
      "nesting-prep-bowls",
      "emberline-kettle",
      "papertrail-notebook-set",
      "harbor-catchall-tray",
    ]);
  });

  it("returns an empty sorted result for filters with no matches", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });

    const response = await request(app)
      .get("/api/products?q=no%20matching%20product&sort=price-asc")
      .expect(200);

    expect(response.body).toMatchObject({
      total: 0,
      query: { q: "no matching product", sort: "price-asc" },
      items: [],
    });
  });

  it("returns product details and safe not-found responses", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });

    const detail = await request(app)
      .get("/api/products/trailmark-bottle")
      .expect(200);
    expect(detail.body.product).toMatchObject({
      name: "Trailmark Bottle",
      priceCents: 3199,
    });
    await request(app).get("/api/products/missing").expect(404, {
      error: { code: "NOT_FOUND", message: "Product was not found." },
    });
  });

  it("returns actionable validation for invalid filters", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });
    const response = await request(app)
      .get("/api/products?category=electronics")
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        category: expect.any(Array),
      },
    });
  });

  it("returns actionable validation for an unsupported sort", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });
    const response = await request(app)
      .get("/api/products?sort=cheapest")
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: {
        sort: expect.any(Array),
      },
    });
  });

  it("rate-limits repeated application requests without blocking liveness", async () => {
    const app = createApp({
      catalogue: new InMemoryProductCatalogue(),
      logger: silentLogger,
    });

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await request(app).get("/api/products").expect(200);
    }

    await request(app).get("/api/products").expect(429, {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again shortly.",
      },
    });
    await request(app).get("/health").expect(200, { status: "healthy" });
  });

  it("converts unexpected catalogue failures to safe errors", async () => {
    const catalogue: ProductCatalogue = {
      list: () => Promise.reject(new Error("connection string was secret")),
      getById: () => Promise.reject(new Error("unused")),
      checkHealth: () => Promise.resolve(),
    };
    const app = createApp({ catalogue, logger: silentLogger });
    const response = await request(app).get("/api/products").expect(500);
    expect(response.text).not.toContain("connection string");
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
  });
});
