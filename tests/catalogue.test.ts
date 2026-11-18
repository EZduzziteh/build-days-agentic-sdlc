import {
  InMemoryProductCatalogue,
  ProductNotFoundError,
  products,
} from "../src/server/catalogue.js";

describe("product catalogue", () => {
  it("provides stable deterministic products", async () => {
    const catalogue = new InMemoryProductCatalogue();

    expect(await catalogue.list()).toEqual(products);
    expect(products.map((product) => product.id)).toEqual([
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

  it("filters by category and case-insensitive search", async () => {
    const catalogue = new InMemoryProductCatalogue();

    await expect(catalogue.list({ q: "LAMP", category: "office" })).resolves.toEqual([
      expect.objectContaining({ id: "aurora-desk-lamp" }),
    ]);
    await expect(catalogue.list({ q: "", category: "kitchen" })).resolves.toHaveLength(2);
  });

  it("sorts filtered products by price without changing the default order", async () => {
    const catalogue = new InMemoryProductCatalogue();

    const defaultIds = (await catalogue.list()).map((product) => product.id);
    await expect(catalogue.list({ q: "", sort: "price-asc" })).resolves.toMatchObject([
      { id: "harbor-catchall-tray" },
      { id: "papertrail-notebook-set" },
      { id: "nesting-prep-bowls" },
      { id: "trailmark-bottle" },
      { id: "aurora-desk-lamp" },
      { id: "cloudrest-throw" },
      { id: "tideline-picnic-blanket" },
      { id: "emberline-kettle" },
    ]);
    await expect(catalogue.list({ q: "", sort: "price-desc" })).resolves.toMatchObject([
      { id: "emberline-kettle" },
      { id: "tideline-picnic-blanket" },
      { id: "cloudrest-throw" },
      { id: "aurora-desk-lamp" },
      { id: "trailmark-bottle" },
      { id: "nesting-prep-bowls" },
      { id: "papertrail-notebook-set" },
      { id: "harbor-catchall-tray" },
    ]);
    await expect(
      catalogue.list({ q: "a", category: "outdoors", sort: "price-desc" }),
    ).resolves.toMatchObject([
      { id: "tideline-picnic-blanket" },
      { id: "trailmark-bottle" },
    ]);

    expect((await catalogue.list()).map((product) => product.id)).toEqual(defaultIds);
  });

  it("keeps catalogue order for equal prices in both sort directions", async () => {
    const fixture = products.slice(0, 3).map((product, index) => ({
      ...product,
      priceCents: [2000, 1000, 2000][index]!,
    }));
    const catalogue = new InMemoryProductCatalogue(fixture);

    const ascending = await catalogue.list({ q: "", sort: "price-asc" });
    const descending = await catalogue.list({ q: "", sort: "price-desc" });

    expect(ascending.map((product) => product.id)).toEqual([
      fixture[1]!.id,
      fixture[0]!.id,
      fixture[2]!.id,
    ]);
    expect(descending.map((product) => product.id)).toEqual([
      fixture[0]!.id,
      fixture[2]!.id,
      fixture[1]!.id,
    ]);
    expect(ascending[0]).toBe(fixture[1]);
    expect(ascending[1]).toBe(fixture[0]);
    expect(descending[0]).toBe(fixture[0]);
    expect(descending[1]).toBe(fixture[2]);
    expect(fixture.map((product) => product.id)).toEqual(
      products.slice(0, 3).map((product) => product.id),
    );
  });

  it("returns no products when sorting an empty filtered result", async () => {
    const catalogue = new InMemoryProductCatalogue();

    await expect(
      catalogue.list({ q: "no matching product", sort: "price-desc" }),
    ).resolves.toEqual([]);
  });

  it("returns product details and rejects missing products", async () => {
    const catalogue = new InMemoryProductCatalogue();

    await expect(catalogue.getById("trailmark-bottle")).resolves.toMatchObject({
      name: "Trailmark Bottle",
      priceCents: 3199,
    });
    await expect(catalogue.getById("missing")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });
});
