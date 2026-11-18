import { expect, test, type Page } from "@playwright/test";

const productCard = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });

const catalogueNames = (page: Page) =>
  page.getByRole("region", { name: "KosKo goods" })
    .getByRole("listitem").getByRole("heading", { level: 3 });

test.describe("KosKo catalogue", () => {
  test("sorts the same products in both directions and announces the order", async ({ page }) => {
    const ascending = [
      "Harbor Catchall Tray", "Papertrail Notebook Set", "Nesting Prep Bowls",
      "Trailmark Bottle", "Aurora Desk Lamp", "Cloudrest Throw",
      "Tideline Picnic Blanket", "Emberline Kettle",
    ];
    await page.goto("/");
    const sort = page.getByRole("combobox", { name: "Sort by" });
    await page.getByRole("combobox", { name: "Category" }).press("Tab");
    await expect(sort).toBeFocused();
    await sort.selectOption("price-asc");
    await expect(catalogueNames(page)).toHaveText(ascending);
    await expect(sort).toBeFocused();
    await sort.selectOption("price-desc");
    await expect(catalogueNames(page)).toHaveText([...ascending].reverse());
    await expect(sort).toBeFocused();
    await expect(page.getByText("Order: Price: high to low").locator(".."))
      .toHaveAttribute("aria-live", "polite");
    await expect(page.getByText("Order: Price: high to low").locator(".."))
      .toContainText("8 products");
  });

  test("loads the deterministic product catalogue", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("KosKo");
    await expect(page.getByRole("link", { name: "KosKo home" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "KosKo goods" }),
    ).toBeVisible();
    await expect(page.getByText("8 products", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aurora Desk Lamp" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Harbor Catchall Tray" }),
    ).toBeVisible();
  });

  test("searches the catalogue by product name", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("searchbox", { name: "Search products" }).fill("lamp");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText("1 product", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aurora Desk Lamp" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Trailmark Bottle" }),
    ).toHaveCount(0);
  });

  test("filters the catalogue by category", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("combobox", { name: "Category" }).selectOption("kitchen");

    await expect(page.getByText("2 products", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nesting Prep Bowls" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Emberline Kettle" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aurora Desk Lamp" }),
    ).toHaveCount(0);
  });

  test("shows and clears the no-results state", async ({ page }) => {
    await page.goto("/");

    const sort = page.getByRole("combobox", { name: "Sort by" });
    const category = page.getByRole("combobox", { name: "Category" });
    const search = page.getByRole("searchbox", { name: "Search products" });
    const submit = page.getByRole("button", { name: "Search", exact: true });
    await sort.selectOption("price-desc");
    await search.fill("a");
    await submit.click();
    await category.selectOption("outdoors");
    await expect(catalogueNames(page)).toHaveText(["Tideline Picnic Blanket", "Trailmark Bottle"]);
    await expect(sort).toHaveValue("price-desc");

    await search.fill("definitely-not-a-product");
    await submit.click();

    await expect(
      page.getByRole("heading", { name: "No products found" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("8 products", { exact: true })).toBeVisible();
    await expect(sort).toHaveValue("");
    await expect(category).toHaveValue("");
    await expect(search).toHaveValue("");
    await expect(catalogueNames(page).first()).toHaveText("Aurora Desk Lamp");
  });

  test("updates cart quantities and totals", async ({ page }) => {
    await page.goto("/");

    await productCard(page, "Aurora Desk Lamp")
      .getByRole("button", { name: "Add to cart" })
      .click();
    await page
      .getByRole("spinbutton", { name: "Quantity for Aurora Desk Lamp" })
      .fill("2");

    await expect(page.getByText("2 items", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Subtotal").locator(".."),
    ).toContainText("$85.98");
  });

  test("completes a simulated checkout", async ({ page }) => {
    await page.goto("/");

    const sort = page.getByRole("combobox", { name: "Sort by" });
    await sort.selectOption("price-asc");
    await expect(catalogueNames(page).first()).toHaveText("Harbor Catchall Tray");
    const bottle = productCard(page, "Trailmark Bottle");
    await bottle.getByRole("button", { name: "View details" }).click();
    await expect(page.getByRole("region", { name: "Trailmark Bottle" })).toBeVisible();
    await page.getByRole("button", { name: "Close product details" }).click();
    await bottle.getByRole("button", { name: "Add to cart" }).click();
    const quantity = page.getByRole("spinbutton", { name: "Quantity for Trailmark Bottle" });
    await quantity.fill("2");
    await page.getByRole("textbox", { name: "Full name" }).fill("Taylor Shopper");
    await sort.selectOption("price-desc");
    await expect(catalogueNames(page).first()).toHaveText("Emberline Kettle");
    await expect(quantity).toHaveValue("2");
    await expect(page.getByText("Subtotal").locator("..")).toContainText("$63.98");
    await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Taylor Shopper");
    await page.getByRole("textbox", { name: "Email" }).fill("taylor@example.com");
    await page
      .getByRole("textbox", { name: "Delivery address" })
      .fill("123 Demo Street");
    await page.getByRole("button", { name: "Place simulated order" }).click();

    await expect(
      page.getByRole("heading", { name: "Order confirmed" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Thanks, Taylor Shopper! Your simulated KosKo order is confirmed.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Your cart is empty.")).toBeVisible();
  });

  test("retries a failed sort using the same search and category", async ({ page }) => {
    let requestCount = 0;
    await page.route((url) =>
      url.pathname === "/api/products" &&
      url.searchParams.get("q") === "a" &&
      url.searchParams.get("category") === "outdoors" &&
      url.searchParams.get("sort") === "price-desc", async (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CATALOGUE_UNAVAILABLE",
              message: "The product catalogue is temporarily unavailable.",
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search products" }).fill("a");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("combobox", { name: "Category" }).selectOption("outdoors");
    const sort = page.getByRole("combobox", { name: "Sort by" });
    await sort.selectOption("price-desc");

    await expect(
      page.getByRole("heading", { name: "We could not open the catalogue" }),
    ).toBeVisible();
    await expect(
      page.getByText("The product catalogue is temporarily unavailable."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(catalogueNames(page)).toHaveText(["Tideline Picnic Blanket", "Trailmark Bottle"]);
    await expect(sort).toHaveValue("price-desc");
    expect(requestCount).toBe(2);
  });
});
