import {
  cartQuantitySchema,
  fieldLimits,
  productQuerySchema,
} from "../src/shared/contracts.js";

describe("commerce contracts", () => {
  it("normalizes valid product queries without adding a sort field", () => {
    expect(productQuerySchema.parse({})).toStrictEqual({ q: "" });
    expect(productQuerySchema.parse({ q: "  lamp  ", category: "office" })).toStrictEqual({
      q: "lamp",
      category: "office",
    });
  });

  it.each(["price-asc", "price-desc"])("accepts %s alongside search and category", (sort) => {
    expect(productQuerySchema.parse({ q: "  lamp  ", category: "office", sort })).toEqual({
      q: "lamp",
      category: "office",
      sort,
    });
  });

  it.each([
    { sort: "rating" },
    { sort: "default" },
    { sort: "" },
    { sort: ["price-asc", "price-desc"] },
  ])(
    "rejects unsupported sort input $sort on the sort field",
    ({ sort }) => {
      const result = productQuerySchema.safeParse({ sort });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.path)).toEqual([["sort"]]);
      }
    },
  );

  it("rejects unsupported categories and oversized search", () => {
    const result = productQuerySchema.safeParse({
      q: "x".repeat(fieldLimits.search + 1),
      category: "electronics",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["q", "category"]),
      );
    }
  });

  it("bounds cart quantities", () => {
    expect(cartQuantitySchema.parse({ quantity: 3 })).toEqual({ quantity: 3 });
    expect(cartQuantitySchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(
      cartQuantitySchema.safeParse({ quantity: fieldLimits.quantity + 1 }).success,
    ).toBe(false);
  });
});
