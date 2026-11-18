// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/client/App.js";
import type { Product, ProductListResponse } from "../src/shared/contracts.js";

const product: Product = {
  id: "trail-lamp",
  name: "Glowpath Lantern",
  shortDescription: "A friendly light for late-night wandering.",
  description: "A rechargeable lantern designed for tabletops and trails.",
  category: "outdoors",
  priceCents: 2499,
  rating: 4.7,
  reviewCount: 83,
  availability: "in-stock",
  badge: "Trail favorite",
  features: ["Three brightness levels", "USB-C charging"],
  accent: "#527a62",
};

const listResponse = (items: Product[]): ProductListResponse => ({
  items,
  total: items.length,
  query: { q: "" },
  categories: ["home", "outdoors", "office", "kitchen"],
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("KosKo client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads products and supports filters and an empty result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return jsonResponse(
        url.includes("q=missing") ? listResponse([]) : listResponse([product]),
      );
    });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("link", { name: "KosKo home" })).toHaveAttribute("href", "#catalogue");
    expect(screen.getByRole("status")).toHaveTextContent("Loading products");
    expect(await screen.findByRole("heading", { name: product.name })).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Category"), "outdoors");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products?category=outdoors",
        expect.anything(),
      ),
    );

    const sort = screen.getByRole("combobox", { name: "Sort by" });
    await user.tab();
    expect(sort).toHaveFocus();
    await user.type(screen.getByLabelText("Search products"), "missing");
    await user.selectOptions(sort, "price-asc");
    expect(sort).toHaveFocus();
    expect(await screen.findByText("Order: Price: low to high")).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products?category=outdoors&sort=price-asc",
      expect.anything(),
    );
    const announcement = screen.getByText("Order: Price: low to high").parentElement;
    expect(announcement).toHaveAttribute("aria-live", "polite");
    expect(announcement).toHaveAttribute("aria-atomic", "true");
    expect(announcement).toHaveTextContent("1 product · Order: Price: low to high");

    await user.selectOptions(sort, "price-desc");
    expect(await screen.findByText("Order: Price: high to low")).toBeVisible();
    expect(announcement).toHaveTextContent("1 product · Order: Price: high to low");
    expect(sort).toHaveFocus();

    await user.selectOptions(screen.getByLabelText("Category"), "home");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products?category=home&sort=price-desc",
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "No products found" })).toBeVisible();
    expect(sort).toHaveValue("price-desc");
    expect(announcement).toHaveTextContent("0 products · Order: Price: high to low");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products?q=missing&category=home&sort=price-desc",
      expect.anything(),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("heading", { name: product.name })).toBeVisible();
    expect(sort).toHaveValue("");
    expect(screen.getByLabelText("Search products")).toHaveValue("");
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/products", expect.anything());
  });

  it("retries a failed sort with the same search, category, and order", async () => {
    const sortedUrl = "/api/products?q=lamp&category=outdoors&sort=price-desc";
    let failed = false;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === sortedUrl && !failed) {
        failed = true;
        throw new Error("Catalogue connection failed.");
      }
      return jsonResponse(listResponse([product]));
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });
    await user.type(screen.getByLabelText("Search products"), "lamp");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.selectOptions(screen.getByLabelText("Category"), "outdoors");
    const sort = screen.getByRole("combobox", { name: "Sort by" });
    await user.selectOptions(sort, "price-desc");

    expect(await screen.findByRole("alert")).toHaveTextContent("Catalogue connection failed.");
    expect(sort).toHaveValue("price-desc");
    expect(screen.getByLabelText("Search products")).toHaveValue("lamp");
    expect(screen.getByLabelText("Category")).toHaveValue("outdoors");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Order: Price: high to low")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => url === sortedUrl)).toHaveLength(2);
  });

  it.each(["success", "failure"])("ignores an older sort request's late %s", async (outcome) => {
    let settleOldRequest!: (result: Response | Promise<Response>) => void;
    const oldRequest = new Promise<Response>((resolve) => {
      settleOldRequest = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("sort=price-asc")
        ? oldRequest
        : jsonResponse(listResponse([product])),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });
    const sort = screen.getByRole("combobox", { name: "Sort by" });
    await user.selectOptions(sort, "price-asc");
    expect(screen.getByRole("status")).toHaveTextContent("Loading products");
    await user.selectOptions(sort, "price-desc");
    expect(await screen.findByText("Order: Price: high to low")).toBeVisible();

    await act(async () => {
      settleOldRequest(
        outcome === "success"
          ? jsonResponse(listResponse([]))
          : jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Late failure" } }, 500),
      );
    });
    expect(screen.getByRole("heading", { name: product.name })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("loads details and manages cart quantities and totals", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return url === `/api/products/${product.id}`
        ? jsonResponse({ product })
        : jsonResponse(listResponse([product]));
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });

    await user.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByText(product.description)).toBeVisible();
    expect(screen.getByText("Three brightness levels")).toBeVisible();

    await user.click(screen.getAllByRole("button", { name: "Add to cart" })[0]!);
    const cart = screen.getByRole("heading", { name: "Cart" }).closest("aside")!;
    expect(within(cart).getByText("$24.99 each")).toBeVisible();
    expect(within(cart).getByText("$24.99", { selector: ".subtotal strong" })).toBeVisible();

    await user.clear(screen.getByLabelText(`Quantity for ${product.name}`));
    await user.type(screen.getByLabelText(`Quantity for ${product.name}`), "2");
    expect(within(cart).getByText("$49.98", { selector: ".subtotal strong" })).toBeVisible();

    await user.click(within(cart).getByRole("button", { name: "Remove" }));
    expect(within(cart).getByText("Your cart is empty.")).toBeVisible();
  });

  it("validates checkout, confirms the order, and resets the cart", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(listResponse([product])));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("heading", { name: product.name });
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("button", { name: "Place simulated order" }));

    expect(await screen.findByText("Enter your name.")).toBeVisible();
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");

    await user.type(screen.getByLabelText("Full name"), "Mira Chen");
    await user.type(screen.getByLabelText("Email"), "mira@example.com");
    await user.type(screen.getByLabelText("Delivery address"), "12 Comet Lane");
    await user.click(screen.getByRole("button", { name: "Place simulated order" }));

    expect(await screen.findByRole("heading", { name: "Order confirmed" })).toBeVisible();
    expect(screen.getByText("Your cart is empty.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Cart 0" })).toBeVisible();
  });
});
